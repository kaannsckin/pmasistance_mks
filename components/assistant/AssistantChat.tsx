import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Markdown from '../Markdown';
import { AgentStep } from '../../utils/ai/agent';
import { AiProposal } from '../../utils/ai/actions';
import { browserSettingsExpired } from '../../utils/ai/client';
import { Citation, RAG_SOURCE_LABELS } from '../../utils/rag/sources';
import { useAssistant } from './AssistantContext';

/**
 * Sohbet arayüzü — yan panelde (compact) ve Zekâ sekmesinde (page) aynı
 * sohbeti gösterir. Model yanıtları güvenli markdown ile, araç adımları
 * yanıtın üstünde küçük etiketler olarak görünür.
 */

interface Props {
  variant: 'page' | 'panel';
  suggestions: { label: string; prompt: string }[];
  onClose?: () => void;
  onExpand?: () => void;
}

const StepChips: React.FC<{ steps: AgentStep[] }> = ({ steps }) => (
  <div className="flex flex-wrap gap-1.5 mb-2">
    {steps.map(s => (
      <span
        key={s.id}
        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
          s.status === 'error' ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
            : 'border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300'}`}
        title={s.status === 'error' ? 'Araç bir hata döndürdü' : 'Uygulama verisinden okundu'}
      >
        <i className={`fa-solid ${s.status === 'running' ? 'fa-circle-notch fa-spin' : s.status === 'error' ? 'fa-triangle-exclamation' : 'fa-database'} text-[9px]`}></i>
        {s.label}
      </span>
    ))}
  </div>
);

const SOURCE_ICONS: Record<Citation['type'], string> = {
  not: 'fa-pen-nib', gorev: 'fa-list-check', risk: 'fa-shield-halved', istek: 'fa-users-viewfinder', analiz: 'fa-chess',
  hedef: 'fa-bullseye', proje: 'fa-folder-open', kilavuz: 'fa-book', dokuman: 'fa-file-lines',
};

/** Metinde [n] olarak anılan kaynaklar; hiç anılmadıysa incelenen tüm kaynaklar */
export const citedSources = (content: string, citations: Citation[]): { label: string; list: Citation[] } => {
  const nums = new Set(Array.from(content.matchAll(/\[(\d{1,2})\]/g)).map(m => Number(m[1])));
  const used = citations.filter(c => nums.has(c.no));
  return used.length ? { label: 'Kaynaklar', list: used } : { label: 'İncelenen kaynaklar', list: citations };
};

const SourceList: React.FC<{ content: string; citations: Citation[]; onOpen: (c: Citation) => void }> = ({ content, citations, onOpen }) => {
  const { label, list } = citedSources(content, citations);
  if (!list.length) return null;
  return (
    <div className="mt-3 pt-2 border-t border-gray-200/70 dark:border-gray-700">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">{label}</div>
      <div className="flex flex-col gap-1">
        {list.map(c => (
          <button
            key={c.no}
            onClick={() => onOpen(c)}
            title={c.excerpt.slice(0, 240)}
            className="flex items-start gap-2 text-left text-[11px] px-2 py-1 rounded-lg hover:bg-white dark:hover:bg-gray-800 transition-colors"
          >
            <span className="flex-none min-w-[1.5rem] h-5 px-1 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center">{c.no}</span>
            <span className="min-w-0">
              <span className="font-semibold text-gray-700 dark:text-gray-200"><i className={`fa-solid ${SOURCE_ICONS[c.type]} mr-1 opacity-60`}></i>{c.title}</span>
              <span className="block text-gray-400 truncate">{[RAG_SOURCE_LABELS[c.type], c.projectName, c.date].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

// Portal: panel içindeki olası CSS dönüşümleri pencereyi panele hapsetmesin
const SourcePreview: React.FC<{ c: Citation; onClose: () => void; onOpenKb: () => void }> = ({ c, onClose, onOpenKb }) => createPortal(
  <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
      <div className="px-5 py-3 border-b dark:border-gray-700 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">[{c.no}] {RAG_SOURCE_LABELS[c.type]}</div>
          <div className="text-sm font-black text-gray-800 dark:text-white">{c.title}</div>
          {(c.projectName || c.date) && <div className="text-[11px] text-gray-400">{[c.projectName, c.date].filter(Boolean).join(' · ')}</div>}
        </div>
        <button onClick={onClose} title="Kapat" className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white"><i className="fa-solid fa-xmark"></i></button>
      </div>
      <div className="p-5 overflow-y-auto text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{c.excerpt}</div>
      {c.ref.kind === 'document' && (
        <div className="px-5 py-3 border-t dark:border-gray-700 text-right">
          <button onClick={onOpenKb} className="text-xs font-bold text-indigo-600 hover:underline"><i className="fa-solid fa-book mr-1"></i>Bilgi Bankası'nda göster</button>
        </div>
      )}
    </div>
  </div>,
  document.body
);

const PROPOSAL_STATUS: Record<AiProposal['status'], { label: string; cls: string; icon: string }> = {
  pending: { label: 'Onayınızı bekliyor', cls: 'text-amber-600 dark:text-amber-300', icon: 'fa-hourglass-half' },
  applied: { label: 'Uygulandı', cls: 'text-emerald-600 dark:text-emerald-300', icon: 'fa-circle-check' },
  rejected: { label: 'Vazgeçildi', cls: 'text-gray-400', icon: 'fa-ban' },
  failed: { label: 'Uygulanamadı', cls: 'text-red-600 dark:text-red-300', icon: 'fa-triangle-exclamation' },
};

/** AI'nın önerdiği değişiklikler — kullanıcı onaylamadan hiçbir veri değişmez */
const ProposalCards: React.FC<{ proposals: AiProposal[]; onResolve: (id: string, d: 'apply' | 'reject') => void }> = ({ proposals, onResolve }) => (
  <div className="mt-3 space-y-2">
    {proposals.map((p, i) => {
      const st = PROPOSAL_STATUS[p.status];
      return (
        <div key={p.id} className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-gray-900 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-bold text-gray-800 dark:text-gray-100"><i className="fa-solid fa-pen-to-square text-indigo-500 mr-1.5"></i>Öneri {i + 1}: {p.title}</div>
            <span className={`text-[10px] font-semibold flex-none ${st.cls}`}><i className={`fa-solid ${st.icon} mr-1`}></i>{st.label}</span>
          </div>
          <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-[11px]">
            {p.details.map(d => (
              <React.Fragment key={d.label}>
                <dt className="text-gray-400">{d.label}</dt>
                <dd className="text-gray-700 dark:text-gray-200 break-words">{d.value}</dd>
              </React.Fragment>
            ))}
          </dl>
          {p.message && p.status !== 'pending' && <p className={`mt-2 text-[11px] ${st.cls}`}>{p.message}</p>}
          {p.status === 'pending' && (
            <div className="mt-2.5 flex gap-2">
              <button onClick={() => onResolve(p.id, 'apply')} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"><i className="fa-solid fa-check mr-1"></i>Uygula</button>
              <button onClick={() => onResolve(p.id, 'reject')} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-red-500">Vazgeç</button>
            </div>
          )}
        </div>
      );
    })}
  </div>
);

const Dots = () => (
  <div className="flex items-center space-x-1.5 py-1">
    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
  </div>
);

const AssistantChat: React.FC<Props> = ({ variant, suggestions, onClose, onExpand }) => {
  const a = useAssistant();
  const [input, setInput] = useState('');
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState<Citation | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const compact = variant === 'panel';

  useEffect(() => { a.ensureReady(); }, [a.ensureReady]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [a.messages]);

  useEffect(() => {
    if (a.phase === 'ready') inputRef.current?.focus();
  }, [a.phase]);

  const submit = (text?: string) => {
    const t = (text ?? input).trim();
    if (!t || a.isStreaming) return;
    if (text === undefined) setInput('');
    a.send(t);
  };

  const header = (
    <div className={`flex-none ${compact ? 'px-4 py-3' : 'px-8 py-4'} border-b dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/20`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-none"><i className="fa-solid fa-wand-magic-sparkles text-xs"></i></span>
        <div className="min-w-0">
          <div className="text-sm font-black text-gray-800 dark:text-white leading-tight">AI Asistan</div>
          <div className="text-[10px] text-gray-400 truncate">
            {a.phase === 'ready' ? `Bağlı${a.status?.model ? ` · ${a.status.model}` : ''} · onaylı değişiklik` : a.phase === 'loading' ? 'Bağlanıyor…' : 'Hazır değil'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-none">
        <button onClick={() => a.setKbOpen(true)} title="Bilgi Bankası — dizin durumu ve kurumsal dokümanlar" className="w-8 h-8 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-gray-800 transition-colors">
          <i className="fa-solid fa-book text-xs"></i>
        </button>
        {a.messages.length > 0 && (
          <button onClick={a.clear} title="Sohbeti temizle" className="w-8 h-8 rounded-lg text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-gray-800 transition-colors">
            <i className="fa-solid fa-broom text-xs"></i>
          </button>
        )}
        {onExpand && (
          <button onClick={onExpand} title="Tam ekranda aç" className="w-8 h-8 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-gray-800 transition-colors">
            <i className="fa-solid fa-up-right-and-down-left-from-center text-xs"></i>
          </button>
        )}
        {onClose && (
          <button onClick={onClose} title="Kapat (Esc)" className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-white dark:hover:bg-gray-800 transition-colors">
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>
    </div>
  );

  const phaseScreen = () => {
    if (!a.enabled) {
      return <div className="h-full flex items-center justify-center text-gray-400 text-sm text-center px-6"><i className="fa-solid fa-power-off mr-2"></i>Yapay zekâ asistanı Ayarlar'dan kapatılmış.</div>;
    }
    if (a.phase === 'idle' || a.phase === 'loading') {
      return <div className="h-full flex items-center justify-center text-gray-400 text-sm"><i className="fa-solid fa-circle-notch fa-spin mr-2"></i>AI bağlantısı kontrol ediliyor…</div>;
    }
    const box = (icon: string, title: string, body: React.ReactNode) => (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-5"><i className={`fa-solid ${icon} text-2xl`}></i></div>
          <h3 className="text-lg font-black text-gray-800 dark:text-white mb-3">{title}</h3>
          {body}
        </div>
      </div>
    );
    if (a.phase === 'unavailable') {
      const expired = browserSettingsExpired();
      return box('fa-plug-circle-xmark', expired ? 'AI Bağlantısının Süresi Doldu' : 'Yapay Zekâ Henüz Hazır Değil', (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{expired ? 'Bu tarayıcıda girilen AI bağlantısı 24 saat geçerlidir ve süresi doldu.' : a.status?.problem || 'AI sunucusu yapılandırılmamış.'}</p>
          <p className="text-xs text-gray-400 mb-5">Yönetici konsolu › Yapay zekâ › <b>Bu tarayıcıda AI bağlantısı</b> bölümünden sağlayıcı, model ve API anahtarını girin (24 saat geçerli). Herkes için kalıcı kurulum sunucu ayarıyla yapılır (docs/AI_KURULUM.md).</p>
          <button onClick={a.recheck} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold"><i className="fa-solid fa-rotate-right mr-2"></i>Tekrar Dene</button>
        </>
      ));
    }
    if (a.phase === 'needs_token') {
      return box('fa-key', 'Erişim Kodu Gerekli', (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Kurumsal AI asistanı yetkili kullanıcılara açıktır. Yöneticinizden aldığınız erişim kodunu girin; kod yalnızca bu cihazda 24 saat saklanır, sonra yeniden sorulur.</p>
          {a.authError && <p className="text-sm text-red-600 mb-3">{a.authError}</p>}
          <div className="flex gap-2">
            <input
              type="password" value={token} autoComplete="off" placeholder="Erişim kodu"
              onChange={e => setToken(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && token.trim()) { a.saveToken(token); setToken(''); } }}
              className="flex-grow px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-400 text-sm"
            />
            <button onClick={() => { a.saveToken(token); setToken(''); }} disabled={!token.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">Başlat</button>
          </div>
        </>
      ));
    }
    return box('fa-right-to-bracket', 'Giriş Yapmanız Gerekiyor', (
      <>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">AI asistanı çalışma alanı üyelerine açıktır. Sağ üstteki <i className="fa-solid fa-cloud"></i> bulut penceresinden giriş yapıp tekrar deneyin.</p>
        {a.authError && <p className="text-sm text-red-600 mb-3">{a.authError}</p>}
        <button onClick={a.recheck} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold"><i className="fa-solid fa-rotate-right mr-2"></i>Tekrar Dene</button>
      </>
    ));
  };

  const empty = (
    <div className={`h-full flex flex-col items-center justify-center text-center ${compact ? 'px-2' : 'max-w-2xl mx-auto'}`}>
      <i className="fa-solid fa-comment-dots text-5xl mb-4 text-indigo-200 dark:text-indigo-800"></i>
      <h3 className="text-lg font-black text-gray-800 dark:text-white mb-1">Size nasıl yardımcı olabilirim?</h3>
      <p className="text-xs text-gray-400 mb-5">Portföy, tahsis, kapasite, risk ve görevler hakkında sorun — yanıtlar, yetkinizdeki uygulama verisinden hesaplanır.</p>
      <div className={`grid gap-2 w-full ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {suggestions.map(s => (
          <button key={s.label} onClick={() => submit(s.prompt)} className="text-left px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-indigo-300 hover:text-indigo-600 rounded-xl transition-colors">
            <i className="fa-solid fa-magnifying-glass-chart mr-2 opacity-50"></i>{s.label}
          </button>
        ))}
      </div>
    </div>
  );

  const list = (
    <div className={compact ? 'space-y-5' : 'space-y-8'}>
      {a.messages.map(msg => (
        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`flex gap-3 ${compact ? 'max-w-[95%]' : 'max-w-[90%]'} ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {!compact && (
              <div className={`flex-none w-8 h-8 rounded-xl flex items-center justify-center text-xs shadow-sm ${
                msg.role === 'user' ? 'bg-indigo-600 text-white' : msg.role === 'system_alert' ? 'bg-red-500 text-white' : 'bg-white dark:bg-gray-700 border dark:border-gray-600 text-indigo-600'}`}>
                <i className={`fa-solid ${msg.role === 'user' ? 'fa-user' : msg.role === 'system_alert' ? 'fa-triangle-exclamation' : 'fa-robot'}`}></i>
              </div>
            )}
            <div className={`${compact ? 'px-3.5 py-2.5' : 'p-5'} rounded-2xl text-sm leading-relaxed shadow-sm border min-w-0 ${
              msg.role === 'user' ? 'bg-indigo-600 text-white border-indigo-500'
                : msg.role === 'system_alert' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
                  : 'bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 border-gray-100 dark:border-gray-700'}`}>
              {msg.role === 'assistant' ? (
                <>
                  {msg.steps && msg.steps.length > 0 && <StepChips steps={msg.steps} />}
                  {msg.content ? <Markdown text={msg.content} /> : msg.streaming ? <Dots /> : null}
                  {msg.proposals && msg.proposals.length > 0 && (
                    <ProposalCards proposals={msg.proposals} onResolve={(pid, d) => a.resolveProposal(msg.id, pid, d)} />
                  )}
                  {msg.citations && msg.citations.length > 0 && (
                    <SourceList
                      content={msg.content}
                      citations={msg.citations}
                      onOpen={c => (c.ref.kind === 'project-view' ? a.navigate(c.ref) : setPreview(c))}
                    />
                  )}
                </>
              ) : (
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 overflow-hidden">
      {preview && <SourcePreview c={preview} onClose={() => setPreview(null)} onOpenKb={() => { setPreview(null); a.setKbOpen(true); }} />}
      {header}
      <div ref={scrollRef} className={`flex-grow overflow-y-auto ${compact ? 'p-4' : 'p-8'} custom-scrollbar`}>
        {a.phase !== 'ready' || !a.enabled ? phaseScreen() : a.messages.length === 0 ? empty : list}
      </div>
      {a.phase === 'ready' && a.enabled && (
        <div className={`flex-none ${compact ? 'p-3' : 'p-6'} bg-gray-50/80 dark:bg-gray-900/40 border-t dark:border-gray-700`}>
          <div className={`${compact ? '' : 'max-w-4xl mx-auto'} relative`}>
            <textarea
              ref={inputRef}
              rows={compact ? 2 : 1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
              placeholder="Sorunuzu yazın… (Shift+Enter: yeni satır)"
              className="w-full pl-4 pr-14 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm outline-none focus:border-indigo-300 resize-none max-h-40 text-sm"
            />
            {a.isStreaming ? (
              <button onClick={a.stop} title="Yanıtı durdur" className="absolute right-2 bottom-2.5 w-10 h-10 bg-red-500 text-white rounded-xl shadow hover:bg-red-600 flex items-center justify-center">
                <i className="fa-solid fa-stop"></i>
              </button>
            ) : (
              <button onClick={() => submit()} disabled={!input.trim()} title="Gönder" className="absolute right-2 bottom-2.5 w-10 h-10 bg-indigo-600 text-white rounded-xl shadow hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center">
                <i className="fa-solid fa-paper-plane"></i>
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">Asistan değişiklikleri yalnızca önerir; siz "Uygula" demeden hiçbir veri değişmez. Önemli kararlardan önce sayıları ilgili ekranda doğrulayın.</p>
        </div>
      )}
    </div>
  );
};

export default AssistantChat;
