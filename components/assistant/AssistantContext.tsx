import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, WorkspaceData } from '../../types';
import { AgentStep, AGENT_MAX_STEPS, runAgentTurn, TRUNCATED_STOP_REASONS } from '../../utils/ai/agent';
import { AttachmentInfo, ChatAttachment, composeUserContent } from '../../utils/ai/attachments';
import { UiCommand, UiResult } from '../../utils/ai/uiActions';
import { fetchIntegrationHealth, fetchJiraIssueWorklogs, fetchJiraMeta, fetchJiraSyncPage, fetchJiraWorklogs, IntegrationHealth } from '../../utils/integrations';
import { AiAction, AiProposal } from '../../utils/ai/actions';
import type { AiDocument } from '../../utils/export/aiDocument';
import { splitFollowUps } from '../../utils/ai/followUps';
import { expandSlash, SlashContext } from '../../utils/ai/slashCommands';
import { chatOwner, chatTitle, ChatSummary, deleteChat, listChats, loadChat, newChatId, saveChat, StoredMessage, summarize, toStored } from '../../utils/ai/chatStore';
import { createMemoryStore, MemoryItem, memoryKey } from '../../utils/ai/memory';
import { AiError, configureMasking, embedTexts, fetchAiStatus, hasCredentials, saveAccessToken, streamChat } from '../../utils/ai/client';
import { buildMasker, collectMaskEntries, Masker } from '../../utils/ai/masking';
import { aiPolicyOf } from '../../utils/ai/policy';
import { AiStatus, ChatMessage } from '../../utils/ai/protocol';
import { buildToolContext } from '../../utils/ai/scope';
import { buildSystemPrompt, ScreenFocus } from '../../utils/ai/systemPrompt';
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
  /** Asistanın hazırladığı dosyalar (Excel, CSV, Word, PDF, PowerPoint) */
  files?: AiDocument[];
  /** Yanıtın sonundaki takip önerileri (tıklanınca soru olarak gönderilir) */
  followUps?: string[];
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
  /** Yeni sohbet başlatır (önceki sohbet geçmişte kalır) */
  clear: () => void;
  /** Bu tarayıcıda saklanan sohbetler (kimlik başına, en yeni önce) */
  chats: ChatSummary[];
  currentChatId: string;
  openChat: (id: string) => void;
  removeChat: (id: string) => void;
  /** Bir kaydı (görev / kişi) asistana sabitler ve onu sorar ("Asistana sor") */
  askAbout: (focus: ScreenFocus, prompt?: string) => void;
  /** Sabitlenmiş kayıt (sohbet başlığında gösterilir) */
  pinned: ScreenFocus | null;
  unpin: () => void;
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
  /** Mesajdaki bekleyen önerilerin hepsini uygular ya da hepsinden vazgeçer */
  resolveAllProposals: (messageId: number, decision: 'apply' | 'reject') => void;
  /** Asistan hafızası (bu tarayıcıda, kimlik başına) */
  memory: MemoryItem[];
  forgetMemory: (id: string) => void;
  clearMemory: () => void;
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
  /** Ekranda açık görev / kişi ("bu görev" gibi ifadeler için) */
  getFocus?: () => ScreenFocus | undefined;
  onNavigate?: (ref: RagRef) => void;
  /** Onaylanan öneriyi uygular (App: yetki/kilit yeniden doğrulanır, denetim + geri-al) */
  onApplyAction?: (action: AiAction) => ApplyResult | Promise<ApplyResult>;
  /** Mesajdaki bekleyen önerilerin hepsini sırayla uygular (tek geri alma) */
  onApplyActions?: (actions: AiAction[]) => ApplyResult[];
  /** Ajan modu: asistanın arayüz komutları (ekran değiştir, kayıt aç); App yetkiyi yeniden denetler */
  onUiCommand?: (cmd: UiCommand) => UiResult;
  children: React.ReactNode;
}

export const AssistantProvider: React.FC<ProviderProps> = ({ enabled, chat = true, embedded = true, getWorkspace, getView, getFocus, onNavigate, onApplyAction, onApplyActions, onUiCommand, children }) => {
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
  const memoryStore = useCallback(() => {
    const ws = getWorkspace();
    return ws ? createMemoryStore(memoryKey(ws.currentRole || 'py', ws.currentPersonId)) : null;
  }, [getWorkspace]);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const refreshMemory = useCallback(() => setMemory(memoryStore()?.list() || []), [memoryStore]);
  const forgetMemory = useCallback((id: string) => { memoryStore()?.remove(id); refreshMemory(); }, [memoryStore, refreshMemory]);
  const clearMemory = useCallback(() => { memoryStore()?.clear(); refreshMemory(); }, [memoryStore, refreshMemory]);

  const makeContext = useCallback((signal?: AbortSignal, userPrompt = '') => {
    const ws = getWorkspace();
    if (!ws) return null;
    const ctx = buildToolContext(ws);
    ctx.files = [];
    const store = createMemoryStore(memoryKey(ws.currentRole || 'py', ws.currentPersonId));
    ctx.memory = { store, userPrompt };
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

  // Panel açılınca (kimlik değişmiş olabilir) hafıza yeniden okunur
  useEffect(() => { if (isOpen) refreshMemory(); }, [isOpen, refreshMemory]);

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

  // Sabitlenmiş kayıt: "Asistana sor" ile getirilen görev/kişi; ekranda açık bir kayıt yoksa o kullanılır
  const [pinned, setPinned] = useState<ScreenFocus | null>(null);
  const pinnedRef = useRef<ScreenFocus | null>(null);
  pinnedRef.current = pinned;
  const focusNow = useCallback((): ScreenFocus | undefined => {
    const f = getFocus?.();
    if (f?.taskId || f?.personId) return f;
    return pinnedRef.current ? { ...pinnedRef.current, pinned: true } : f;
  }, [getFocus]);

  // "/" komutları için ekran bağlamı (açık proje, görev, kişi)
  const slashContext = useCallback((): SlashContext => {
    const ws = getWorkspace();
    const focus = focusNow();
    const project = ws?.projects.find(p => p.id === (focus?.projectId || ws.activeProjectId));
    const task = project && focus?.taskId ? project.tasks.find(t => t.id === focus.taskId) : undefined;
    const person = focus?.personId ? ws?.people.find(p => p.id === focus.personId) : undefined;
    return {
      projectName: project?.name,
      taskLabel: task ? [task.jiraId, task.name].filter(Boolean).join(' ') : undefined,
      personName: person ? `${person.firstName} ${person.lastName}`.trim() : undefined,
      hasAnswer: messagesRef.current.some(m => m.role === 'assistant' && m.content.trim()),
    };
  }, [getWorkspace, focusNow]);

  const send = useCallback(async (raw: string, files: ChatAttachment[] = []) => {
    let prompt = raw.trim();
    if (!status || abortRef.current) return;
    if (prompt.startsWith('/')) {
      const expanded = expandSlash(prompt, slashContext());
      if (expanded && typeof expanded === 'object') {
        setMessages(prev => [...prev, { id: nextId++, role: 'system_alert', content: expanded.error }]);
        return;
      }
      if (typeof expanded === 'string') prompt = expanded;
    }
    if (!prompt && !files.length) return;
    const ctrl = new AbortController();
    const ctx = makeContext(ctrl.signal, prompt);
    if (!ctx) return;

    const system = buildSystemPrompt(ctx, { view: getView(), followUps: true, focus: focusNow() });
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
        onText: text => update(replyId, { content: splitFollowUps(text).body }),
        onSteps: steps => update(replyId, { steps, citations: [...ctx.citations], proposals: [...ctx.proposals], files: [...(ctx.files || [])] }),
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
        const { body, followUps } = splitFollowUps(result.text);
        update(replyId, { content: [body, ...notes].join('\n\n'), streaming: false, ...(followUps.length && !notes.length ? { followUps } : {}) });
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
      refreshMemory();
    }
  }, [makeContext, getView, focusNow, status, refreshMemory, slashContext]);

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

  const askAbout = useCallback((focus: ScreenFocus, prompt = '/bu') => {
    pinnedRef.current = focus;
    setPinned(focus);
    ask(prompt);
  }, [ask]);
  const unpin = useCallback(() => setPinned(null), []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // ---- Sohbet geçmişi (bu tarayıcıda, kimlik başına) ----
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [currentChatId, setCurrentChatId] = useState(newChatId);
  const chatIdRef = useRef(currentChatId);
  chatIdRef.current = currentChatId;
  const chatOwnerRef = useRef<string | null>(null);
  const loadedRef = useRef<UiMessage[] | null>(null); // geri yüklenen mesajlar: değişmedikçe yeniden kaydedilmez
  const restoredRef = useRef(false);
  const ownerNow = useCallback(() => {
    const ws = getWorkspace();
    return ws ? chatOwner(ws.currentRole || 'py', ws.currentPersonId) : null;
  }, [getWorkspace]);
  const refreshChats = useCallback(async () => {
    const owner = ownerNow();
    setChats(owner ? summarize(await listChats(owner)) : []);
  }, [ownerNow]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    loadedRef.current = null;
    setPinned(null);
    setMessages([]);
    setCurrentChatId(newChatId());
  }, []);

  const openChat = useCallback(async (id: string) => {
    if (abortRef.current) return;
    const chat = await loadChat(id);
    if (!chat || chat.owner !== ownerNow()) return;
    const msgs = chat.messages as unknown as UiMessage[];
    nextId = Math.max(nextId, ...msgs.map(m => m.id + 1));
    loadedRef.current = msgs;
    chatOwnerRef.current = chat.owner;
    setPinned(null);
    setCurrentChatId(chat.id);
    setMessages(msgs);
  }, [ownerNow]);

  const removeChat = useCallback(async (id: string) => {
    await deleteChat(id);
    if (id === chatIdRef.current) clear();
    refreshChats();
  }, [clear, refreshChats]);

  // Panel açılınca: kimlik değiştiyse yeni sohbet; oturumun ilk açılışında son sohbet geri gelir
  useEffect(() => {
    if (!isOpen || !chat) return;
    const owner = ownerNow();
    if (!owner) return;
    if (chatOwnerRef.current && chatOwnerRef.current !== owner) { restoredRef.current = false; clear(); }
    chatOwnerRef.current = owner;
    (async () => {
      const list = summarize(await listChats(owner));
      setChats(list);
      if (!restoredRef.current) {
        restoredRef.current = true;
        if (!messagesRef.current.length && list[0]) openChat(list[0].id);
      }
    })();
  }, [isOpen, chat, ownerNow, clear, openChat]);

  // Akış bitince sohbet kaydedilir (geri yüklenip değişmemişse kaydedilmez)
  useEffect(() => {
    if (isStreaming || !messages.length || messages === loadedRef.current) return;
    const owner = chatOwnerRef.current || ownerNow();
    if (!owner) return;
    const id = chatIdRef.current;
    const timer = window.setTimeout(() => {
      const stored = toStored(messages as unknown as StoredMessage[]);
      saveChat({ id, owner, title: chatTitle(stored), updatedAt: new Date().toISOString(), messages: stored }).then(refreshChats);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [messages, isStreaming, ownerNow, refreshChats]);

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

  const resolveAllProposals = useCallback((messageId: number, decision: 'apply' | 'reject') => {
    const msg = messagesRef.current.find(m => m.id === messageId);
    const pending = (msg?.proposals || []).filter(p => p.status === 'pending' && !resolvedProposals.current.has(p.id));
    if (!pending.length) return;
    pending.forEach(p => resolvedProposals.current.add(p.id));
    const results = decision === 'reject'
      ? pending.map(() => ({ ok: false, message: 'Vazgeçildi.' }))
      : onApplyActions ? onApplyActions(pending.map(p => p.action)) : pending.map(() => ({ ok: false, message: 'Bu ekranda değişiklik uygulanamıyor.' }));
    const byId = new Map<string, ApplyResult>(pending.map((p, i) => [p.id, results[i]]));
    setMessages(prev => prev.map(m => (m.id === messageId
      ? { ...m, proposals: m.proposals?.map(p => {
        const r = byId.get(p.id);
        if (!r) return p;
        return { ...p, status: decision === 'reject' ? 'rejected' as const : r.ok ? 'applied' as const : 'failed' as const, message: r.message };
      }) }
      : m)));
  }, [onApplyActions]);

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
    ensureReady, recheck, send, ask, stop, clear, saveToken, isKbOpen, setKbOpen, refreshIndex, navigate, resolveProposal, resolveAllProposals, memory, forgetMemory, clearMemory, chats, currentChatId, openChat, removeChat, askAbout, pinned, unpin, complete,
    jiraEnabled: !!integrations?.jira,
  }), [enabled, chat, embedded, phase, status, authError, messages, isStreaming, isOpen, ensureReady, recheck, send, ask, stop, clear, saveToken, isKbOpen, refreshIndex, navigate, resolveProposal, resolveAllProposals, memory, forgetMemory, clearMemory, chats, currentChatId, openChat, removeChat, askAbout, pinned, unpin, complete, integrations]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};
