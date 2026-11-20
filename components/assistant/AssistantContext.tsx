import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, WorkspaceData } from '../../types';
import { AgentStep, AGENT_MAX_STEPS, runAgentTurn, TRUNCATED_STOP_REASONS } from '../../utils/ai/agent';
import { AttachmentInfo, ChatAttachment, composeUserContent } from '../../utils/ai/attachments';
import { UiCommand, UiResult } from '../../utils/ai/uiActions';
import { fetchIntegrationHealth, fetchJiraIssueWorklogs, fetchJiraMeta, fetchJiraSyncPage, fetchJiraWorklogs, IntegrationHealth } from '../../utils/integrations';
import { AiAction, AiProposal } from '../../utils/ai/actions';
import { AiError, configureMasking, embedTexts, fetchAiStatus, hasCredentials, saveAccessToken, streamChat } from '../../utils/ai/client';
import { buildMasker, collectMaskEntries, Masker } from '../../utils/ai/masking';
import { aiPolicyOf } from '../../utils/ai/policy';
import { AiStatus, ChatMessage } from '../../utils/ai/protocol';
import { buildToolContext } from '../../utils/ai/scope';
import { buildSystemPrompt } from '../../utils/ai/systemPrompt';
import { executeTool, toolLabel, toolSpecsFor } from '../../utils/ai/tools';
import { Citation, RagRef } from '../../utils/rag/sources';
import { configureEmbedder, rebuildIndex, searchKnowledge, searchMode, syncIndex } from '../../utils/rag/service';

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
  /** bilgi_ara ile modele verilen kaynaklar */
  citations?: Citation[];
  /** Kullanıcı onayı bekleyen değişiklik önerileri */
  proposals?: AiProposal[];
  /** Kullanıcı mesajına eklenen dosyalar (özet) */
  attachments?: AttachmentInfo[];
  /** Modele giden içerik (ek blokları dahil); sonraki turlarda geçmiş olarak gönderilir */
  modelContent?: string;
}

export interface ApplyResult {
  ok: boolean;
  message: string;
}

export type AssistantPhase = 'idle' | 'loading' | 'unavailable' | 'needs_token' | 'needs_login' | 'ready';

interface AssistantApi {
  enabled: boolean;
  /** Admin politikası: asistan sohbeti ve ekran içi AI ayrı ayrı kapatılabilir */
  chatEnabled: boolean;
  embeddedEnabled: boolean;
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
  send: (prompt: string, attachments?: ChatAttachment[]) => void;
  /** Sunucuda Jira bağlantısı var mı (asistanın Jira araçları) */
  jiraEnabled: boolean;
  /** Paneli açar ve (hazırsa) soruyu gönderir */
  ask: (prompt: string) => void;
  stop: () => void;
  clear: () => void;
  saveToken: (token: string) => void;
  /** Bilgi Bankası penceresi */
  isKbOpen: boolean;
  setKbOpen: (open: boolean) => void;
  /** Dizini güncel veriyle yeniden kurar (embedding'i baştan dener) */
  refreshIndex: () => Promise<void>;
  /** Kaynağa git (proje ekranı); kılavuz/doküman kaynakları sohbette önizlenir */
  navigate: (ref: RagRef) => void;
  /** Öneri kartı: uygula ya da vazgeç */
  resolveProposal: (messageId: number, proposalId: string, decision: 'apply' | 'reject') => void;
  /** Tek seferlik AI tamamlama (araçsız) — ekranlara gömülü özellikler için */
  complete: (system: string, prompt: string, signal?: AbortSignal) => Promise<string>;
}

const Ctx = createContext<AssistantApi | null>(null);

/** Sağlayıcı dışında da güvenle çağrılabilir (yoksa null) */
export const useAssistantOptional = (): AssistantApi | null => useContext(Ctx);

export const useAssistant = (): AssistantApi => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAssistant, AssistantProvider içinde kullanılmalı');
  return v;
};


let nextId = 1;

interface ProviderProps {
  enabled: boolean;
  chat?: boolean;
  embedded?: boolean;
  getWorkspace: () => WorkspaceData | null;
  getView: () => View;
  onNavigate?: (ref: RagRef) => void;
  /** Onaylanan öneriyi uygular (App: yetki/kilit yeniden doğrulanır, denetim + geri-al) */
  onApplyAction?: (action: AiAction) => ApplyResult | Promise<ApplyResult>;
  /** Ajan modu: asistanın arayüz komutları (ekran değiştir, kayıt aç); App yetkiyi yeniden denetler */
  onUiCommand?: (cmd: UiCommand) => UiResult;
  children: React.ReactNode;
}

export const AssistantProvider: React.FC<ProviderProps> = ({ enabled, chat = true, embedded = true, getWorkspace, getView, onNavigate, onApplyAction, onUiCommand, children }) => {
  const [phase, setPhase] = useState<AssistantPhase>('idle');
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isOpen, setOpen] = useState(false);
  const [isKbOpen, setKbOpen] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationHealth | null>(null);
  const messagesRef = useRef<UiMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const pendingAsk = useRef<string | null>(null);
  const resolvedProposals = useRef(new Set<string>());
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

  // Ad maskeleme: tüm AI istekleri (sohbet, ekran içi AI, puanlama, embedding) güncel
  // çalışma alanındaki kişi/proje/kurum adlarıyla maskelenir; politika kapalıysa yapılmaz
  useEffect(() => {
    let cache: { ws: WorkspaceData; masker: Masker } | null = null;
    configureMasking(() => {
      const ws = getWorkspace();
      if (!ws || !aiPolicyOf(ws).maskNames) return null;
      if (cache?.ws !== ws) cache = { ws, masker: buildMasker(collectMaskEntries(ws)) };
      return cache.masker;
    });
    return () => configureMasking(null);
  }, [getWorkspace]);

  useEffect(() => {
    configureEmbedder(status?.configured && status.embeddingModel
      ? { model: status.embeddingModel, embed: (texts, kind) => embedTexts(texts, kind, status.authMode) }
      : null);
  }, [status]);

  // Sunucu entegrasyonları (Jira): asistan hazır olunca ve her açılışta yeniden sorulur;
  // Yönetici konsolundan girilen Jira ayarı yeniden başlatmadan araçlara yansır
  useEffect(() => {
    if (!enabled || phase !== 'ready') return;
    const c = new AbortController();
    fetchIntegrationHealth(c.signal).then(h => setIntegrations(h)).catch(() => undefined);
    return () => c.abort();
  }, [enabled, phase, isOpen]);

  /** Kullanıcının güncel kapsamında araç bağlamı + RAG, arayüz (ajan) ve Jira çalışma zamanları */
  const makeContext = useCallback((signal?: AbortSignal) => {
    const ws = getWorkspace();
    if (!ws) return null;
    const ctx = buildToolContext(ws);
    ctx.rag = { search: (q, o) => searchKnowledge(ctx, q, o), mode: searchMode };
    if (onUiCommand) {
      ctx.ui = {
        run: cmd => {
          const r = onUiCommand(cmd);
          // Tam ekran asistandayken ekran değişirse sohbet yan panelde sürer
          if (r.ok) setOpen(true);
          return r;
        },
      };
    }
    if (integrations?.jira) {
      const mode = integrations.authMode;
      ctx.jira = {
        meta: () => fetchJiraMeta(mode, signal),
        byKeys: keys => fetchJiraSyncPage({ keys }, mode, signal),
        search: (source, o) => fetchJiraSyncPage({ source, openOnly: o.openOnly, pageSize: o.pageSize }, mode, signal),
        worklogs: (projectKey, from, to) => fetchJiraWorklogs({ projectKey, from, to }, mode),
        issueWorklogs: keys => fetchJiraIssueWorklogs(keys, mode),
      };
    }
    return ctx;
  }, [getWorkspace, onUiCommand, integrations]);

  // Panel açılıp asistan hazır olunca dizin arka planda kurulur (ilk soruyu bekletmesin)
  useEffect(() => {
    if (phase !== 'ready' || !(isOpen || isKbOpen)) return;
    const ctx = makeContext();
    if (ctx) syncIndex(ctx).catch(() => undefined);
  }, [phase, isOpen, isKbOpen, makeContext]);

  const refreshIndex = useCallback(async () => {
    const ctx = makeContext();
    if (ctx) await rebuildIndex(ctx);
  }, [makeContext]);

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

  const send = useCallback(async (raw: string, files: ChatAttachment[] = []) => {
    const prompt = raw.trim();
    if ((!prompt && !files.length) || !status || abortRef.current) return;
    const ctrl = new AbortController();
    const ctx = makeContext(ctrl.signal);
    if (!ctx) return;

    const system = buildSystemPrompt(ctx, { view: getView() });
    const composed = composeUserContent(prompt, files);
    const attachments: AttachmentInfo[] = composed.infos.map((info, i) => ({ ...info, size: files[i].size }));
    // Önceki turlar yalnızca görünen metinleriyle (ekler dahil) gider; araç ayrıntıları tekrar gönderilmez
    const history: ChatMessage[] = [
      ...messagesRef.current
        .filter(m => (m.role === 'user' || m.role === 'assistant') && (m.modelContent || m.content).trim())
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.modelContent || m.content })),
      { role: 'user', content: composed.content },
    ];

    const replyId = nextId++;
    setMessages(prev => [
      ...prev,
      { id: nextId++, role: 'user', content: prompt || composed.content.split('\n')[0], ...(files.length ? { attachments, modelContent: composed.content } : {}) },
      { id: replyId, role: 'assistant', content: '', streaming: true, steps: [] },
    ]);
    setIsStreaming(true);
    abortRef.current = ctrl;

    try {
      const result = await runAgentTurn({
        system,
        history,
        tools: toolSpecsFor(ctx),
        execute: call => executeTool(call, ctx),
        stream: (body, onDelta) => streamChat(body, { authMode: status.authMode, signal: ctrl.signal, onDelta: (_, full) => onDelta(full) }),
        onText: text => update(replyId, { content: text }),
        onSteps: steps => update(replyId, { steps, citations: [...ctx.citations], proposals: [...ctx.proposals] }),
        labelFor: toolLabel,
        maxSteps: AGENT_MAX_STEPS,
      });
      const notes: string[] = [];
      // Otomatik devam isteklerinden sonra hâlâ kesikse (çok uzun yanıt) kullanıcıya daraltmayı öner
      if (result.stopReason && TRUNCATED_STOP_REASONS.has(result.stopReason)) notes.push('*(Yanıt çok uzun olduğu için tamamlanamadı; soruyu daraltarak — ör. tek proje ya da kısa dönem — tekrar sorun.)*');
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
  }, [makeContext, getView, status]);

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

  const navigate = useCallback((ref: RagRef) => {
    if (ref.kind === 'project-view') onNavigate?.(ref);
  }, [onNavigate]);

  const resolveProposal = useCallback((messageId: number, proposalId: string, decision: 'apply' | 'reject') => {
    const msg = messagesRef.current.find(m => m.id === messageId);
    const proposal = msg?.proposals?.find(p => p.id === proposalId);
    if (!msg || !proposal || proposal.status !== 'pending') return;
    // Aynı karede çift tıklama: ekran güncellenmeden ikinci kez uygulanmasın
    if (resolvedProposals.current.has(proposalId)) return;
    resolvedProposals.current.add(proposalId);
    const update = (patch: Partial<AiProposal>) => setMessages(prev => prev.map(m => (m.id === messageId
      ? { ...m, proposals: m.proposals?.map(p => (p.id === proposalId ? { ...p, ...patch } : p)) }
      : m)));
    if (decision === 'reject') { update({ status: 'rejected', message: 'Vazgeçildi.' }); return; }
    const r = onApplyAction ? onApplyAction(proposal.action) : { ok: false, message: 'Bu ekranda değişiklik uygulanamıyor.' };
    if (r instanceof Promise) {
      // Ağ gerektiren öneri (Jira eşitlemesi): sonuç gelene kadar kartta "çalışıyor"
      update({ status: 'running', message: 'Çalışıyor…' });
      r.then(x => update({ status: x.ok ? 'applied' : 'failed', message: x.message }))
        .catch(e => update({ status: 'failed', message: (e as Error)?.message || 'Uygulanamadı.' }));
      return;
    }
    update({ status: r.ok ? 'applied' : 'failed', message: r.message });
  }, [onApplyAction]);

  const complete = useCallback(async (system: string, prompt: string, signal?: AbortSignal): Promise<string> => {
    if (!enabled) throw new AiError('Yapay zekâ asistanı Ayarlar\'dan kapatılmış.', 'config');
    let s = phase === 'ready' ? status : null;
    if (!s) {
      s = await fetchAiStatus(signal);
      setStatus(s);
      if (!s.configured) {
        setPhase('unavailable');
        throw new AiError(s.problem || 'AI yapılandırılmamış.', 'config');
      }
      if (!(await hasCredentials(s.authMode))) {
        setPhase(s.authMode === 'token' ? 'needs_token' : 'needs_login');
        throw new AiError(s.authMode === 'token' ? 'AI erişim kodu gerekli — asistan panelinden girin.' : 'AI için bulut penceresinden giriş yapın.', 'auth');
      }
      setPhase('ready');
    }
    const r = await streamChat({ system, messages: [{ role: 'user', content: prompt }] }, { authMode: s.authMode, signal });
    if (!r.text.trim()) throw new AiError('Model boş yanıt döndü; tekrar deneyin.', 'upstream');
    return r.text;
  }, [enabled, phase, status]);

  const api = useMemo<AssistantApi>(() => ({
    enabled, chatEnabled: enabled && chat, embeddedEnabled: enabled && embedded, phase, status, authError, messages, isStreaming, isOpen, setOpen,
    ensureReady, recheck, send, ask, stop, clear, saveToken, isKbOpen, setKbOpen, refreshIndex, navigate, resolveProposal, complete,
    jiraEnabled: !!integrations?.jira,
  }), [enabled, chat, embedded, phase, status, authError, messages, isStreaming, isOpen, ensureReady, recheck, send, ask, stop, clear, saveToken, isKbOpen, refreshIndex, navigate, resolveProposal, complete, integrations]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};
