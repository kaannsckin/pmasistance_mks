import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, WorkspaceData } from '../../types';
import { AgentStep, runAgentTurn } from '../../utils/ai/agent';
import { AiError, fetchAiStatus, hasCredentials, saveAccessToken, streamChat } from '../../utils/ai/client';
import { AiStatus, ChatMessage } from '../../utils/ai/protocol';
import { buildToolContext } from '../../utils/ai/scope';
import { buildSystemPrompt } from '../../utils/ai/systemPrompt';
import { executeTool, toolLabel, toolSpecsFor } from '../../utils/ai/tools';

/**
 * Genel AI asistanının paylaşılan durumu: sohbet ekranlar arasında gezerken
 * korunur (yan panel ve Zekâ sekmesi aynı sohbeti gösterir). Sohbet yalnızca
 * bellekte tutulur — sayfa yenilenince silinir, cihaza yazılmaz.
 */

export interface UiMessage {
  id: number;
  role: 'user' | 'assistant' | 'system_alert';
  content: string;
  streaming?: boolean;
  steps?: AgentStep[];
}

export type AssistantPhase = 'idle' | 'loading' | 'unavailable' | 'needs_token' | 'needs_login' | 'ready';

interface AssistantApi {
  enabled: boolean;
  phase: AssistantPhase;
  status: AiStatus | null;
  authError: string | null;
  messages: UiMessage[];
  isStreaming: boolean;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  /** Durum kontrolünü (ilk kullanımda) başlatır */
  ensureReady: () => void;
  recheck: () => void;
  send: (prompt: string) => void;
  /** Paneli açar ve (hazırsa) soruyu gönderir */
  ask: (prompt: string) => void;
  stop: () => void;
  clear: () => void;
  saveToken: (token: string) => void;
}

const Ctx = createContext<AssistantApi | null>(null);

export const useAssistant = (): AssistantApi => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAssistant, AssistantProvider içinde kullanılmalı');
  return v;
};

const TRUNCATED_REASONS = new Set(['length', 'max_tokens']);

let nextId = 1;

interface ProviderProps {
  enabled: boolean;
  getWorkspace: () => WorkspaceData | null;
  getView: () => View;
  children: React.ReactNode;
}

export const AssistantProvider: React.FC<ProviderProps> = ({ enabled, getWorkspace, getView, children }) => {
  const [phase, setPhase] = useState<AssistantPhase>('idle');
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isOpen, setOpen] = useState(false);
  const messagesRef = useRef<UiMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const pendingAsk = useRef<string | null>(null);
  messagesRef.current = messages;

  const checkStatus = useCallback(async () => {
    setPhase('loading');
    try {
      const s = await fetchAiStatus();
      setStatus(s);
      if (!s.configured) setPhase('unavailable');
      else if (!(await hasCredentials(s.authMode))) setPhase(s.authMode === 'token' ? 'needs_token' : 'needs_login');
      else setPhase('ready');
    } catch {
      setStatus({ configured: false, authMode: 'none', problem: 'AI durumu alınamadı.' });
      setPhase('unavailable');
    }
  }, []);

  const ensureReady = useCallback(() => {
    if (enabled && phase === 'idle') checkStatus();
  }, [enabled, phase, checkStatus]);

  useEffect(() => {
    if (isOpen) ensureReady();
  }, [isOpen, ensureReady]);

  // AI ayarlardan kapatılırsa devam eden yanıtı durdur ve paneli kapat
  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      setOpen(false);
    }
  }, [enabled]);

  const update = (id: number, patch: Partial<UiMessage>) =>
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));

  const send = useCallback(async (raw: string) => {
    const prompt = raw.trim();
    const ws = getWorkspace();
    if (!prompt || !ws || !status || abortRef.current) return;

    const ctx = buildToolContext(ws);
    const system = buildSystemPrompt(ctx, { view: getView() });
    // Önceki turlar yalnızca görünen metinleriyle gider (araç ayrıntıları tekrar gönderilmez)
    const history: ChatMessage[] = [
      ...messagesRef.current
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: prompt },
    ];

    const replyId = nextId++;
    setMessages(prev => [...prev, { id: nextId++, role: 'user', content: prompt }, { id: replyId, role: 'assistant', content: '', streaming: true, steps: [] }]);
    setIsStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const result = await runAgentTurn({
        system,
        history,
        tools: toolSpecsFor(ctx),
        execute: call => executeTool(call, ctx),
        stream: (body, onDelta) => streamChat(body, { authMode: status.authMode, signal: ctrl.signal, onDelta: (_, full) => onDelta(full) }),
        onText: text => update(replyId, { content: text }),
        onSteps: steps => update(replyId, { steps }),
        labelFor: toolLabel,
      });
      const notes: string[] = [];
      if (result.stopReason && TRUNCATED_REASONS.has(result.stopReason)) notes.push('*(Yanıt uzunluk sınırında kesildi.)*');
      if (result.hitStepLimit) notes.push('*(Araç adımı sınırına ulaşıldı; soruyu daraltarak tekrar deneyin.)*');
      if (!result.text.trim()) {
        setMessages(prev => prev.map(m => (m.id === replyId
          ? { ...m, role: 'system_alert', content: notes.length ? notes.join(' ') : 'Model boş yanıt döndü (güvenlik filtresine takılmış olabilir). Sorunuzu farklı ifade etmeyi deneyin.', streaming: false }
          : m)));
      } else {
        update(replyId, { content: [result.text, ...notes].join('\n\n'), streaming: false });
      }
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('Beklenmeyen bir hata oluştu.', 'upstream');
      setMessages(prev => {
        const reply = prev.find(m => m.id === replyId);
        const keep = !!reply?.content.trim() || !!reply?.steps?.length;
        const rest = keep ? prev.map(m => (m.id === replyId ? { ...m, streaming: false } : m)) : prev.filter(m => m.id !== replyId);
        return err.code === 'aborted' ? rest : [...rest, { id: nextId++, role: 'system_alert', content: err.message }];
      });
      if (err.code === 'auth') {
        if (status.authMode === 'token') saveAccessToken(null);
        setAuthError(err.message);
        setPhase(status.authMode === 'token' ? 'needs_token' : 'needs_login');
      } else if (err.code === 'config') {
        setStatus({ ...status, configured: false, problem: err.message });
        setPhase('unavailable');
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [getWorkspace, getView, status]);

  // Panel kapalıyken sorulan soru (komut paleti) hazır olunca gönderilir
  useEffect(() => {
    if (phase === 'ready' && pendingAsk.current) {
      const q = pendingAsk.current;
      pendingAsk.current = null;
      send(q);
    }
  }, [phase, send]);

  const ask = useCallback((prompt: string) => {
    if (!enabled) return;
    setOpen(true);
    if (phase === 'ready') send(prompt);
    else pendingAsk.current = prompt;
  }, [enabled, phase, send]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, []);

  const saveToken = useCallback((token: string) => {
    const t = token.trim();
    if (!t) return;
    saveAccessToken(t);
    setAuthError(null);
    setPhase('ready');
  }, []);

  const recheck = useCallback(() => {
    setAuthError(null);
    checkStatus();
  }, [checkStatus]);

  const api = useMemo<AssistantApi>(() => ({
    enabled, phase, status, authError, messages, isStreaming, isOpen, setOpen,
    ensureReady, recheck, send, ask, stop, clear, saveToken,
  }), [enabled, phase, status, authError, messages, isStreaming, isOpen, ensureReady, recheck, send, ask, stop, clear, saveToken]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};
