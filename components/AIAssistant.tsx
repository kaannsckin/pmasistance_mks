import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Task, Resource, Note, TaskStatus } from '../types';
import { AiStatus, ChatMessage } from '../utils/ai/protocol';
import { AiError, fetchAiStatus, hasCredentials, saveAccessToken, streamChat, trimHistory } from '../utils/ai/client';
import Markdown from './Markdown';

interface AIAssistantProps {
  projectName?: string;
  tasks: Task[];
  resources: Resource[];
  notes: Note[];
}

interface Message {
  id: number;
  role: 'user' | 'assistant' | 'system_alert';
  content: string;
  streaming?: boolean;
}

type Phase = 'loading' | 'unavailable' | 'needs_token' | 'needs_login' | 'ready';

const STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.Backlog]: 'Backlog',
  [TaskStatus.ToDo]: 'Yapılacak',
  [TaskStatus.InProgress]: 'Devam eden',
  [TaskStatus.Done]: 'Tamamlanan',
};

const TRUNCATED_REASONS = new Set(['length', 'max_tokens']);

let nextId = 1;

const AIAssistant: React.FC<AIAssistantProps> = ({ projectName, tasks, resources, notes }) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const checkStatus = useCallback(async (signal?: AbortSignal) => {
    setPhase('loading');
    try {
      const s = await fetchAiStatus(signal);
      setStatus(s);
      if (!s.configured) setPhase('unavailable');
      else if (!(await hasCredentials(s.authMode))) setPhase(s.authMode === 'token' ? 'needs_token' : 'needs_login');
      else setPhase('ready');
    } catch {
      if (signal?.aborted) return; // bileşen kapandı
      setStatus({ configured: false, authMode: 'none', problem: 'AI durumu alınamadı.' });
      setPhase('unavailable');
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    checkStatus(ctrl.signal);
    return () => {
      ctrl.abort();
      abortRef.current?.abort();
    };
  }, [checkStatus]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Faz 0: yalnızca özet sayılar gider; ayrıntılı veri erişimi (rol kapsamlı araçlar) Faz 1'de.
  const buildSystemPrompt = () => {
    const byStatus = Object.values(TaskStatus)
      .map(s => `${STATUS_LABELS[s]}: ${tasks.filter(t => t.status === s).length}`)
      .join(', ');
    return [
      "Sen PlanAsistan'ın yapay zekâ asistanısın. Proje, program ve portföy yönetimi (sprint planlama, PERT, işgücü tahsisi / adam-ay, risk, EVM) konusunda uzman bir yardımcısın.",
      'Kurallar:',
      '- Türkçe, kısa ve net yanıt ver; gerektiğinde madde ve tablo (markdown) kullan.',
      '- Yalnızca sana verilen bağlama dayan; bilmediğin veriyi uydurma, emin değilsen açıkça söyle.',
      '- Uygulamadaki ayrıntılı verilere (görev adları, kişiler, tahsisler) bu sürümde erişimin yok; ayrıntı gerekiyorsa kullanıcıdan iste.',
      '',
      'Bağlam:',
      `- Bugün: ${new Date().toLocaleDateString('tr-TR')}`,
      ...(projectName ? [`- Aktif proje: ${projectName}`] : []),
      `- Görevler: ${tasks.length} (${byStatus})`,
      `- Kaynak: ${resources.length}, Not: ${notes.length}`,
    ].join('\n');
  };

  const updateMessage = (id: number, patch: Partial<Message>) =>
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));

  const handleSend = async (customPrompt?: string) => {
    if (isStreaming || !status) return;
    const prompt = (customPrompt ?? inputValue).trim();
    if (!prompt) return;
    if (customPrompt === undefined) setInputValue('');

    const system = buildSystemPrompt();
    const history: ChatMessage[] = [
      ...messages
        .filter((m): m is Message & { role: 'user' | 'assistant' } => m.role !== 'system_alert' && !!m.content.trim())
        .map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: prompt },
    ];

    const userMsg: Message = { id: nextId++, role: 'user', content: prompt };
    const replyId = nextId++;
    setMessages(prev => [...prev, userMsg, { id: replyId, role: 'assistant', content: '', streaming: true }]);
    setIsStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const { text, stopReason } = await streamChat(
        { system, messages: trimHistory(history, system.length) },
        { authMode: status.authMode, signal: ctrl.signal, onDelta: (_, full) => updateMessage(replyId, { content: full }) }
      );
      if (!text.trim()) {
        setMessages(prev => prev.map(m => (m.id === replyId ? { ...m, role: 'system_alert', content: 'Model boş yanıt döndü (güvenlik filtresine takılmış olabilir). Sorunuzu farklı ifade etmeyi deneyin.', streaming: false } : m)));
      } else {
        const suffix = stopReason && TRUNCATED_REASONS.has(stopReason) ? '\n\n*(Yanıt uzunluk sınırında kesildi.)*' : '';
        updateMessage(replyId, { content: text + suffix, streaming: false });
      }
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('Beklenmeyen bir hata oluştu.', 'upstream');
      setMessages(prev => {
        const reply = prev.find(m => m.id === replyId);
        const keepPartial = !!reply?.content.trim();
        const rest = keepPartial
          ? prev.map(m => (m.id === replyId ? { ...m, streaming: false } : m))
          : prev.filter(m => m.id !== replyId);
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
  };

  const handleStop = () => abortRef.current?.abort();

  const handleClear = () => {
    abortRef.current?.abort();
    setMessages([]);
  };

  const handleSaveToken = () => {
    const t = tokenInput.trim();
    if (!t) return;
    saveAccessToken(t);
    setTokenInput('');
    setAuthError(null);
    setPhase('ready');
  };

  if (phase !== 'ready') {
    return (
      <div className="max-w-4xl mx-auto h-[70vh] flex items-center justify-center p-6">
        <div className="bg-white dark:bg-gray-800 rounded-[3rem] shadow-2xl border border-gray-100 dark:border-gray-700 p-12 text-center relative overflow-hidden group w-full">
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-colors"></div>
          <div className="relative z-10">
            <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner ring-8 ring-indigo-50/50">
              <i className={`fa-solid ${phase === 'loading' ? 'fa-circle-notch fa-spin' : phase === 'unavailable' ? 'fa-plug-circle-xmark' : 'fa-key'} text-4xl`}></i>
            </div>

            {phase === 'loading' && (
              <h2 className="text-2xl font-black text-gray-800 dark:text-white">AI bağlantısı kontrol ediliyor…</h2>
            )}

            {phase === 'unavailable' && (
              <>
                <h2 className="text-3xl font-black text-gray-800 dark:text-white mb-4 tracking-tight">Yapay Zekâ Henüz Hazır Değil</h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto mb-3 leading-relaxed">{status?.problem || 'AI sunucusu yapılandırılmamış.'}</p>
                <p className="text-xs text-gray-400 max-w-xl mx-auto mb-8 leading-relaxed">
                  Kurumsal AI anahtarı yalnızca sunucuda tutulur. Yöneticiniz sunucu ortamına <code className="font-mono">AI_PROVIDER</code>, <code className="font-mono">AI_API_KEY</code> ve <code className="font-mono">AI_MODEL</code> değişkenlerini tanımladığında asistan kendiliğinden açılır (docs/AI_KURULUM.md).
                </p>
                <button onClick={() => checkStatus()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-black shadow-xl transition-all hover:scale-105">
                  <i className="fa-solid fa-rotate-right mr-2"></i>Tekrar Dene
                </button>
              </>
            )}

            {phase === 'needs_token' && (
              <>
                <h2 className="text-3xl font-black text-gray-800 dark:text-white mb-4 tracking-tight">Erişim Kodu Gerekli</h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto mb-6 leading-relaxed">
                  Kurumsal AI asistanı yalnızca yetkili kullanıcılara açıktır. Yöneticinizden aldığınız erişim kodunu girin; kod yalnızca bu cihazda saklanır.
                </p>
                {authError && <p className="text-sm text-red-600 mb-4">{authError}</p>}
                <div className="flex max-w-md mx-auto gap-2">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveToken()}
                    placeholder="Erişim kodu"
                    autoComplete="off"
                    className="flex-grow px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none focus:border-indigo-400"
                  />
                  <button onClick={handleSaveToken} disabled={!tokenInput.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black shadow-xl disabled:opacity-50">
                    Başlat
                  </button>
                </div>
              </>
            )}

            {phase === 'needs_login' && (
              <>
                <h2 className="text-3xl font-black text-gray-800 dark:text-white mb-4 tracking-tight">Giriş Yapmanız Gerekiyor</h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto mb-6 leading-relaxed">
                  AI asistanı çalışma alanı üyelerine açıktır. Sağ üstteki <i className="fa-solid fa-cloud"></i> bulut penceresinden giriş yapıp tekrar deneyin.
                </p>
                {authError && <p className="text-sm text-red-600 mb-4">{authError}</p>}
                <button onClick={() => { setAuthError(null); checkStatus(); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-black shadow-xl transition-all hover:scale-105">
                  <i className="fa-solid fa-rotate-right mr-2"></i>Tekrar Dene
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-6 animate-fade-in">
      <aside className="hidden lg:flex w-80 flex-col gap-4">
        <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
          <i className="fa-solid fa-user-shield absolute -right-6 -bottom-6 text-9xl opacity-10"></i>
          <h3 className="font-black text-lg mb-2">Kurumsal AI</h3>
          <p className="text-xs opacity-80 leading-relaxed mb-6">Anahtar yalnızca sunucuda tutulur; istekler kurumsal AI proxy'si üzerinden iletilir.</p>
          <div className="space-y-2 relative z-10">
            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest bg-white/10 p-2 rounded-lg border border-white/20">
              <span>Sağlayıcı</span>
              <span className="text-emerald-300 normal-case tracking-normal">{status?.provider || '—'}</span>
            </div>
            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest bg-white/10 p-2 rounded-lg border border-white/20">
              <span>Model</span>
              <span className="text-emerald-300 normal-case tracking-normal truncate ml-2">{status?.model || '—'}</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm flex-grow">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Analiz Önerileri</h4>
          <div className="space-y-2">
            {[
              { l: 'Verimlilik Analizi', p: 'Görevlerin tamamlanma hızına göre ekip verimliliğini değerlendir.' },
              { l: 'Gecikme Tahmini', p: 'Mevcut duruma göre hangi görevlerin sarkma riski var?' },
              { l: 'Birim Dengesi', p: 'Birimler arasındaki iş yükü dağılımını optimize et.' }
            ].map((item, i) => (
              <button key={i} onClick={() => handleSend(item.p)} disabled={isStreaming} className="w-full text-left px-4 py-2 text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 rounded-xl transition-all disabled:opacity-50">
                <i className="fa-solid fa-magnifying-glass-chart mr-2 opacity-50"></i> {item.l}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="flex-grow flex-col bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden relative flex">
        <div className="flex-none px-8 py-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/20">
          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest italic">Bağlı{status?.model ? ` · ${status.model}` : ''}</span>
          </div>
          <button onClick={handleClear} disabled={messages.length === 0} className="text-[10px] font-black text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest disabled:opacity-40">
            Sohbeti Temizle
          </button>
        </div>

        <div ref={scrollRef} className="flex-grow overflow-y-auto p-8 space-y-8 custom-scrollbar">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center opacity-40">
              <i className="fa-solid fa-comment-dots text-6xl mb-6 text-indigo-200"></i>
              <h3 className="text-2xl font-black text-gray-800 dark:text-white mb-2">Asistan Hazır</h3>
              <p className="text-gray-500 text-sm italic">Projeniz ve proje yönetimi hakkında sorularınızı yazın.</p>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                <div className={`flex gap-4 max-w-[90%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`flex-none w-8 h-8 rounded-xl flex items-center justify-center text-xs shadow-sm ${
                    msg.role === 'user' ? 'bg-indigo-600 text-white' :
                    msg.role === 'system_alert' ? 'bg-red-500 text-white' : 'bg-white dark:bg-gray-700 border dark:border-gray-600 text-indigo-600'
                  }`}>
                    <i className={`fa-solid ${msg.role === 'user' ? 'fa-user' : msg.role === 'system_alert' ? 'fa-triangle-exclamation' : 'fa-robot'}`}></i>
                  </div>
                  <div className={`p-5 rounded-2xl text-sm leading-relaxed shadow-sm border ${
                    msg.role === 'user' ? 'bg-indigo-600 text-white border-indigo-500' :
                    msg.role === 'system_alert' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 border-gray-100 dark:border-gray-700'
                  }`}>
                    {msg.role === 'assistant' ? (
                      msg.content ? <Markdown text={msg.content} /> : (
                        <div className="flex items-center space-x-2 py-1">
                          <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
                          <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                          <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                        </div>
                      )
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex-none p-6 bg-gray-50/80 dark:bg-gray-900/40 border-t dark:border-gray-700">
          <div className="max-w-4xl mx-auto relative group">
            <textarea
              rows={1}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Sorunuzu yazın… (Shift+Enter: yeni satır)"
              className="w-full pl-6 pr-16 py-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl outline-none transition-all group-hover:border-indigo-300 resize-none max-h-40"
            />
            {isStreaming ? (
              <button
                onClick={handleStop}
                title="Yanıtı durdur"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 bg-red-500 text-white rounded-xl shadow-lg hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center"
              >
                <i className="fa-solid fa-stop"></i>
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!inputValue.trim()}
                title="Gönder"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center"
              >
                <i className="fa-solid fa-paper-plane"></i>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;
