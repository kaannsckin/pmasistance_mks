import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Markdown from '../Markdown';
import { AgentStep } from '../../utils/ai/agent';
import { AiProposal } from '../../utils/ai/actions';
import { browserSettingsExpired } from '../../utils/ai/client';
import { Citation, RAG_SOURCE_LABELS } from '../../utils/rag/sources';
import { useAssistant } from './AssistantContext';
import { EditableSection, memoryAgeLabel, SECTION_OPTIONS, useMemoryEditor } from './useMemoryEditor';
import { ATTACHMENT_EXTENSIONS } from '../../utils/ai/attachments';
import { toolKind } from '../../utils/ai/tools';
import { AiDocument, DOC_FORMAT_LABELS, documentStats, documentSummary } from '../../utils/export/aiDocument';
import { formatsFor, useDocumentDownload } from './useDocumentDownload';
import { useSlashMenu } from './useSlashMenu';
import { fmtFileSize, useChatAttachments } from './useChatAttachments';

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

const STEP_KIND: Record<ReturnType<typeof toolKind>, { icon: string; title: string }> = {
  read: { icon: 'fa-database', title: 'Uygulama verisinden okundu' },
  propose: { icon: 'fa-pen', title: 'Değişiklik önerisi hazırlandı (onayınızı bekler)' },
  ui: { icon: 'fa-compass', title: 'Asistan ekranı sizin için değiştirdi' },
  jira: { icon: 'fa-cloud', title: "Jira'dan güncel veri okundu" },
  file: { icon: 'fa-file-arrow-down', title: 'Dosya hazırlandı' },
  memory: { icon: 'fa-bookmark', title: 'Hafıza güncellendi' },
};

const relTime = (iso: string): string => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days < 1 ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : days < 7 ? `${days} gün önce` : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

/** Sohbetler: bu tarayıcıda saklanan geçmiş; aç, sil */
const ChatHistory: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const a = useAssistant();
  return (
    <section aria-label="Sohbetler" className="flex-none border-b border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/30 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs font-bold text-gray-800 dark:text-gray-100"><i aria-hidden="true" className="fa-solid fa-clock-rotate-left text-indigo-500 mr-1.5"></i>Sohbetler · {a.chats.length}</span>
        <button onClick={() => { a.clear(); onClose(); }} className="text-[11px] font-semibold text-indigo-600 hover:underline"><i aria-hidden="true" className="fa-solid fa-plus mr-1"></i>Yeni sohbet</button>
        <button aria-label="Sohbetleri kapat" onClick={onClose} className="w-6 h-6 rounded text-gray-400 hover:text-gray-700"><i aria-hidden="true" className="fa-solid fa-xmark text-xs"></i></button>
      </div>
      {a.chats.length === 0 ? (
        <p className="text-[11px] text-gray-500">Henüz kayıtlı sohbet yok.</p>
      ) : (
        <ul className="max-h-52 overflow-y-auto space-y-0.5">
          {a.chats.map(c => (
            <li key={c.id} className="flex items-center gap-1">
              <button onClick={() => { a.openChat(c.id); onClose(); }} aria-current={c.id === a.currentChatId ? 'true' : undefined}
                className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-1 rounded-lg text-left text-[11px] ${c.id === a.currentChatId ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200' : 'text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800'}`}>
                <span className="flex-1 min-w-0 truncate">{c.title}</span>
                <span className="text-[10px] text-gray-400 flex-none">{relTime(c.updatedAt)}</span>
              </button>
              <button aria-label={`Sohbeti sil: ${c.title}`} title="Sil" onClick={() => { if (window.confirm(`"${c.title}" sohbeti silinsin mi?`)) a.removeChat(c.id); }} className="text-gray-400 hover:text-red-500 w-6 flex-none"><i aria-hidden="true" className="fa-solid fa-trash text-[10px]"></i></button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-gray-400">Sohbetler yalnız bu tarayıcıda ve bu kimlik için saklanır (en çok 30). Yeniden açılan sohbetteki bekleyen öneriler uygulanamaz.</p>
    </section>
  );
};

/** Hafıza: kullanıcının hafiza.md belgesi (bu tarayıcıda); bölümler, elle ekleme, düzenleme, indir/yükle */
const MemoryPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const m = useMemoryEditor();
  const fileRef = useRef<HTMLInputElement>(null);
  const btn = 'text-[11px] font-semibold text-gray-500 hover:text-indigo-600';
  return (
    <section aria-label="Asistan hafızası" className="flex-none border-b border-gray-100 dark:border-gray-700 bg-indigo-50/50 dark:bg-indigo-900/10 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex-1 text-xs font-bold text-gray-800 dark:text-gray-100"><i aria-hidden="true" className="fa-solid fa-bookmark text-indigo-500 mr-1.5"></i>Hafıza · {m.activeCount}{m.archived > 0 && <span className="font-normal text-gray-400"> (+{m.archived} arşiv)</span>}</span>
        {m.mode === 'list' && <button onClick={m.startEdit} className={btn} title="hafiza.md belgesini düzenle">Düzenle</button>}
        <button onClick={m.download} className={btn} title="hafiza.md olarak indir">İndir</button>
        <button onClick={() => fileRef.current?.click()} className={btn} title=".md dosyasından yükle">Yükle</button>
        <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="hidden" onChange={e => { void m.upload(e.target.files?.[0]); e.target.value = ''; }} />
        {m.activeCount + m.archived > 0 && <button onClick={m.clear} className="text-[11px] font-semibold text-gray-500 hover:text-red-500">Tümünü sil</button>}
        <button aria-label="Hafızayı kapat" onClick={onClose} className="w-6 h-6 rounded text-gray-400 hover:text-gray-700"><i aria-hidden="true" className="fa-solid fa-xmark text-xs"></i></button>
      </div>
      {m.mode === 'edit' ? (
        <div className="space-y-1.5">
          <textarea aria-label="hafiza.md" value={m.draft} onChange={e => m.setDraft(e.target.value)} rows={12} spellCheck={false} className="w-full text-[11px] font-mono p-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100" />
          <div className="flex gap-2 justify-end">
            <button onClick={m.cancelEdit} className="text-[11px] font-semibold text-gray-500 px-2 py-1">Vazgeç</button>
            <button onClick={m.saveEdit} className="text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded px-3 py-1">Kaydet</button>
          </div>
        </div>
      ) : (
        <>
          <form className="flex gap-1.5 items-center" onSubmit={e => { e.preventDefault(); m.add(); }}>
            <select aria-label="Bölüm" value={m.section} onChange={e => m.setSection(e.target.value as EditableSection)} className="text-[11px] rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-1 py-1">
              {SECTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input aria-label="Hafızaya eklenecek satır" value={m.text} onChange={e => m.setText(e.target.value)} maxLength={300} placeholder={m.hint} className="flex-1 min-w-0 text-[11px] rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1" />
            <label className="text-[11px] text-gray-500 flex items-center gap-1" title="Önemli: daha yavaş eskir"><input type="checkbox" checked={m.important} onChange={e => m.setImportant(e.target.checked)} />!</label>
            <button type="submit" disabled={!m.text.trim()} className="text-[11px] font-semibold text-white bg-indigo-600 disabled:opacity-40 rounded px-2 py-1">Ekle</button>
          </form>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {m.groups.map(g => (
              <div key={g.section}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{g.title}{g.section === 'not' ? ' · ilgili sorularda okunur, eskir' : ' · her yanıtta'}</p>
                {g.items.length === 0 ? <p className="text-[11px] text-gray-400">—</p> : (
                  <ul className="space-y-0.5">
                    {g.items.map(it => (
                      <li key={it.id} className="flex items-start gap-2 text-[11px] text-gray-700 dark:text-gray-200">
                        <span className="flex-1 min-w-0 break-words">{it.important && <b className="text-amber-600 mr-1" title="Önemli">!</b>}{it.text}</span>
                        {g.section === 'not' && <span className="text-[10px] text-gray-400 flex-none">{memoryAgeLabel(it)}</span>}
                        <button aria-label={`Sil: ${it.text}`} title="Sil" onClick={() => m.forget(it.id)} className="text-gray-400 hover:text-red-500 flex-none"><i aria-hidden="true" className="fa-solid fa-trash text-[10px]"></i></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {m.error && <p role="alert" className="text-[11px] text-red-600">{m.error}</p>}
      <p className="text-[10px] text-gray-400">Yalnız bu tarayıcıda ve bu kimlik için saklanır. Asistana her soruda üslup ve tercihler, notlardan ise yalnız soruyla ilgili olanlar gider; notların etkisi yaşla azalır, 6 aydan eski notlar arşive iner.</p>
    </section>
  );
};

const StepChips: React.FC<{ steps: AgentStep[] }> = ({ steps }) => (
  <div className="flex flex-wrap gap-1.5 mb-2">
    {steps.map(s => { const kind = STEP_KIND[toolKind(s.name)]; return (
      <span
        key={s.id}
        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
          s.status === 'error' ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
            : 'border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300'}`}
        title={s.status === 'error' ? 'Araç bir hata döndürdü' : kind.title}
      >
        <i aria-hidden="true" className={`fa-solid ${s.status === 'running' ? 'fa-circle-notch fa-spin' : s.status === 'error' ? 'fa-triangle-exclamation' : kind.icon} text-[9px]`}></i>
        {s.label}
      </span>
    ); })}
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
              <span className="font-semibold text-gray-700 dark:text-gray-200"><i aria-hidden="true" className={`fa-solid ${SOURCE_ICONS[c.type]} mr-1 opacity-60`}></i>{c.title}</span>
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
        <button aria-label="Kapat" onClick={onClose} title="Kapat" className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white"><i aria-hidden="true" className="fa-solid fa-xmark"></i></button>
      </div>
      <div className="p-5 overflow-y-auto text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{c.excerpt}</div>
      {c.ref.kind === 'document' && (
        <div className="px-5 py-3 border-t dark:border-gray-700 text-right">
          <button onClick={onOpenKb} className="text-xs font-bold text-indigo-600 hover:underline"><i aria-hidden="true" className="fa-solid fa-book mr-1"></i>Bilgi Bankası'nda göster</button>
        </div>
      )}
    </div>
  </div>,
  document.body
);

const PROPOSAL_STATUS: Record<AiProposal['status'], { label: string; cls: string; icon: string }> = {
  pending: { label: 'Onayınızı bekliyor', cls: 'text-amber-600 dark:text-amber-300', icon: 'fa-hourglass-half' },
  running: { label: 'Çalışıyor', cls: 'text-blue-600 dark:text-blue-300', icon: 'fa-spinner fa-spin' },
  applied: { label: 'Uygulandı', cls: 'text-emerald-600 dark:text-emerald-300', icon: 'fa-circle-check' },
  rejected: { label: 'Vazgeçildi', cls: 'text-gray-400', icon: 'fa-ban' },
  failed: { label: 'Uygulanamadı', cls: 'text-red-600 dark:text-red-300', icon: 'fa-triangle-exclamation' },
};

/** AI'nın önerdiği değişiklikler — kullanıcı onaylamadan hiçbir veri değişmez */
const FileCards: React.FC<{ files: AiDocument[] }> = ({ files }) => {
  const dl = useDocumentDownload();
  return (
    <div className="mt-3 space-y-2">
      {files.map(f => {
        const st = documentStats(f);
        const [main, ...rest] = formatsFor(f);
        return (
          <div key={f.id} className="rounded-xl border border-indigo-100 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-900/20 p-3">
            <div className="flex items-start gap-2">
              <i aria-hidden="true" className="fa-solid fa-file-lines text-indigo-500 mt-0.5"></i>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-800 dark:text-gray-100 break-words">{f.title}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{[f.subtitle, documentSummary(st, f.blocks.length)].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <button disabled={!!dl.busy} onClick={() => dl.download(f, main)} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white">
                <i aria-hidden="true" className="fa-solid fa-download mr-1"></i>{dl.busy === `${f.id}:${main}` ? 'Hazırlanıyor…' : `${DOC_FORMAT_LABELS[main]} indir`}
              </button>
              {rest.map(fmt => (
                <button key={fmt} disabled={!!dl.busy} onClick={() => dl.download(f, fmt)} className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-white dark:hover:bg-indigo-900/40 disabled:opacity-60">
                  {dl.busy === `${f.id}:${fmt}` ? '…' : DOC_FORMAT_LABELS[fmt]}
                </button>
              ))}
            </div>
            {dl.error[f.id] && <p role="alert" className="text-[11px] text-red-600 dark:text-red-300 mt-1.5">{dl.error[f.id]}</p>}
            {!dl.error[f.id] && dl.done[f.id] && <p role="status" className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">İndirildi: {dl.done[f.id]}</p>}
          </div>
        );
      })}
    </div>
  );
};

const ProposalCards: React.FC<{ proposals: AiProposal[]; onResolve: (id: string, d: 'apply' | 'reject') => void; onResolveAll?: (d: 'apply' | 'reject') => void }> = ({ proposals, onResolve, onResolveAll }) => (
  <div className="mt-3 space-y-2">
    {proposals.map((p, i) => {
      const st = PROPOSAL_STATUS[p.status];
      return (
        <div key={p.id} className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-gray-900 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-bold text-gray-800 dark:text-gray-100"><i aria-hidden="true" className="fa-solid fa-pen-to-square text-indigo-500 mr-1.5"></i>Öneri {i + 1}: {p.title}</div>
            <span className={`text-[10px] font-semibold flex-none ${st.cls}`}><i aria-hidden="true" className={`fa-solid ${st.icon} mr-1`}></i>{st.label}</span>
          </div>
          <dl className="mt-2 grid grid-cols-[minmax(0,max-content),minmax(55%,1fr)] gap-x-3 gap-y-0.5 text-[11px]">
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
              <button onClick={() => onResolve(p.id, 'apply')} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"><i aria-hidden="true" className="fa-solid fa-check mr-1"></i>Uygula</button>
              <button onClick={() => onResolve(p.id, 'reject')} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-red-500">Vazgeç</button>
            </div>
          )}
        </div>
      );
    })}
    {onResolveAll && proposals.filter(p => p.status === 'pending').length > 1 && (
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button onClick={() => onResolveAll('apply')} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"><i aria-hidden="true" className="fa-solid fa-check-double mr-1"></i>Tümünü uygula ({proposals.filter(p => p.status === 'pending').length})</button>
        <button onClick={() => onResolveAll('reject')} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-red-500">Hepsinden vazgeç</button>
        <span className="text-[10px] text-gray-400">Sırayla uygulanır; tek "Geri Al" hepsini geri alır.</span>
      </div>
    )}
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
  const [memoryOpen, setMemoryOpen] = useState(false);
  const activeMemory = a.memory.filter(m => m.section !== 'arsiv').length;
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const compact = variant === 'panel';
  const att = useChatAttachments();

  useEffect(() => { a.ensureReady(); }, [a.ensureReady]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [a.messages]);

  useEffect(() => {
    if (a.phase === 'ready') inputRef.current?.focus();
  }, [a.phase]);

  const submit = (text?: string) => {
    const t = (text ?? input).trim();
    const withFiles = text === undefined ? att.files : [];
    if ((!t && !withFiles.length) || a.isStreaming || att.reading > 0) return;
    if (text === undefined) { setInput(''); att.clear(); }
    a.send(t, withFiles);
  };
  const slash = useSlashMenu(input, setInput, t => submit(t));

  const header = (
    <div className={`flex-none ${compact ? 'px-4 py-3' : 'px-8 py-4'} border-b dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/20`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-none"><i aria-hidden="true" className="fa-solid fa-wand-magic-sparkles text-xs"></i></span>
        <div className="min-w-0">
          <div className="text-sm font-black text-gray-800 dark:text-white leading-tight">AI Asistan</div>
          <div className="text-[10px] text-gray-400 truncate">
            {a.phase === 'ready' ? `Bağlı${a.status?.model ? ` · ${a.status.model}` : ''} · onaylı değişiklik` : a.phase === 'loading' ? 'Bağlanıyor…' : 'Hazır değil'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-none">
        <button aria-label={`Hafıza (${activeMemory} not)`} aria-expanded={memoryOpen} onClick={() => { setMemoryOpen(o => !o); setHistoryOpen(false); }} title="Asistanın hafızası" className="relative w-8 h-8 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-gray-800 transition-colors">
          <i aria-hidden="true" className="fa-solid fa-bookmark text-xs"></i>
          {activeMemory > 0 && <span aria-hidden="true" className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-bold leading-[14px]">{activeMemory}</span>}
        </button>
        <button aria-label="Bilgi Bankası — dizin durumu ve kurumsal dokümanlar" onClick={() => a.setKbOpen(true)} title="Bilgi Bankası — dizin durumu ve kurumsal dokümanlar" className="w-8 h-8 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-gray-800 transition-colors">
          <i aria-hidden="true" className="fa-solid fa-book text-xs"></i>
        </button>
        {a.messages.length > 0 && (
          <button aria-label="Yeni sohbet" onClick={a.clear} title="Yeni sohbet (bu sohbet geçmişte kalır)" className="w-8 h-8 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-gray-800 transition-colors">
            <i aria-hidden="true" className="fa-solid fa-plus text-xs"></i>
          </button>
        )}
        <button aria-label={`Sohbetler (${a.chats.length})`} aria-expanded={historyOpen} onClick={() => { setHistoryOpen(o => !o); setMemoryOpen(false); }} title="Sohbet geçmişi" className="w-8 h-8 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-gray-800 transition-colors">
          <i aria-hidden="true" className="fa-solid fa-clock-rotate-left text-xs"></i>
        </button>
        {onExpand && (
          <button aria-label="Tam ekranda aç" onClick={onExpand} title="Tam ekranda aç" className="w-8 h-8 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-gray-800 transition-colors">
            <i aria-hidden="true" className="fa-solid fa-up-right-and-down-left-from-center text-xs"></i>
          </button>
        )}
        {onClose && (
          <button aria-label="Kapat (Esc)" onClick={onClose} title="Kapat (Esc)" className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-white dark:hover:bg-gray-800 transition-colors">
            <i aria-hidden="true" className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>
    </div>
  );

  const phaseScreen = () => {
    if (!a.enabled) {
      return <div className="h-full flex items-center justify-center text-gray-400 text-sm text-center px-6"><i aria-hidden="true" className="fa-solid fa-power-off mr-2"></i>Yapay zekâ asistanı Ayarlar'dan kapatılmış.</div>;
    }
    if (a.phase === 'idle' || a.phase === 'loading') {
      return <div className="h-full flex items-center justify-center text-gray-400 text-sm"><i aria-hidden="true" className="fa-solid fa-circle-notch fa-spin mr-2"></i>AI bağlantısı kontrol ediliyor…</div>;
    }
    const box = (icon: string, title: string, body: React.ReactNode) => (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-5"><i aria-hidden="true" className={`fa-solid ${icon} text-2xl`}></i></div>
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
          <button onClick={a.recheck} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold"><i aria-hidden="true" className="fa-solid fa-rotate-right mr-2"></i>Tekrar Dene</button>
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
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">AI asistanı çalışma alanı üyelerine açıktır. Sağ üstteki <i aria-hidden="true" className="fa-solid fa-cloud"></i> bulut penceresinden giriş yapıp tekrar deneyin.</p>
        {a.authError && <p className="text-sm text-red-600 mb-3">{a.authError}</p>}
        <button onClick={a.recheck} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold"><i aria-hidden="true" className="fa-solid fa-rotate-right mr-2"></i>Tekrar Dene</button>
      </>
    ));
  };

  const empty = (
    <div className={`h-full flex flex-col items-center justify-center text-center ${compact ? 'px-2' : 'max-w-2xl mx-auto'}`}>
      <i aria-hidden="true" className="fa-solid fa-comment-dots text-5xl mb-4 text-indigo-200 dark:text-indigo-800"></i>
      <h3 className="text-lg font-black text-gray-800 dark:text-white mb-1">Size nasıl yardımcı olabilirim?</h3>
      <p className="text-xs text-gray-400 mb-5">Portföy, tahsis, kapasite, risk ve görevler hakkında sorun{a.jiraEnabled ? ', Jira kayıtlarını sorgulatın' : ''}; dosya ekleyin ya da "riskler ekranını aç" gibi komutlar verin. Yanıtlar yetkinizdeki veriden hesaplanır.</p>
      <div className={`grid gap-2 w-full ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {suggestions.map(s => (
          <button key={s.label} onClick={() => submit(s.prompt)} className="text-left px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-indigo-300 hover:text-indigo-600 rounded-xl transition-colors">
            <i aria-hidden="true" className="fa-solid fa-magnifying-glass-chart mr-2 opacity-50"></i>{s.label}
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
                <i aria-hidden="true" className={`fa-solid ${msg.role === 'user' ? 'fa-user' : msg.role === 'system_alert' ? 'fa-triangle-exclamation' : 'fa-robot'}`}></i>
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
                  {msg.files && msg.files.length > 0 && <FileCards files={msg.files} />}
                  {msg.proposals && msg.proposals.length > 0 && (
                    <ProposalCards proposals={msg.proposals} onResolve={(pid, d) => a.resolveProposal(msg.id, pid, d)} onResolveAll={d => a.resolveAllProposals(msg.id, d)} />
                  )}
                  {msg.citations && msg.citations.length > 0 && (
                    <SourceList
                      content={msg.content}
                      citations={msg.citations}
                      onOpen={c => (c.ref.kind === 'project-view' ? a.navigate(c.ref) : setPreview(c))}
                    />
                  )}
                  {msg.followUps && msg.followUps.length > 0 && msg.id === a.messages[a.messages.length - 1]?.id && !a.isStreaming && (
                    <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Takip önerileri">
                      {msg.followUps.map(f => (
                        <button key={f} onClick={() => a.send(f)} className="text-left text-[11px] font-semibold px-2.5 py-1 rounded-full border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 bg-white dark:bg-gray-900 hover:bg-indigo-50 dark:hover:bg-indigo-900/40">
                          <i aria-hidden="true" className="fa-solid fa-wand-magic-sparkles mr-1"></i>{f}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {msg.attachments.map(f => (
                        <span key={f.name} title={f.truncated ? 'Dosya uzun olduğu için modele kısaltılarak gönderildi' : `${f.chars.toLocaleString('tr-TR')} karakter`} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/20">
                          <i aria-hidden="true" className="fa-solid fa-paperclip"></i>
                          <span className="max-w-[160px] truncate">{f.name}</span>
                          <span className="opacity-80">· {fmtFileSize(f.size)}{f.truncated ? ' · kısaltıldı' : ''}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const ready = a.phase === 'ready' && a.enabled;
  return (
    <div className="relative h-full flex flex-col bg-white dark:bg-gray-800 overflow-hidden" {...(ready ? att.dropProps : {})}>
      {att.dragging && (
        <div className="absolute inset-2 z-10 rounded-2xl border-2 border-dashed border-indigo-400 bg-indigo-50/90 dark:bg-indigo-900/60 flex items-center justify-center pointer-events-none text-sm font-bold text-indigo-700 dark:text-indigo-200">
          <i aria-hidden="true" className="fa-solid fa-paperclip mr-2"></i>Dosyayı sohbete eklemek için bırakın
        </div>
      )}
      {preview && <SourcePreview c={preview} onClose={() => setPreview(null)} onOpenKb={() => { setPreview(null); a.setKbOpen(true); }} />}
      {header}
      {historyOpen && <ChatHistory onClose={() => setHistoryOpen(false)} />}
      {memoryOpen && <MemoryPanel onClose={() => setMemoryOpen(false)} />}
      <div ref={scrollRef} className={`flex-grow overflow-y-auto ${compact ? 'p-4' : 'p-8'} custom-scrollbar`}>
        {a.phase !== 'ready' || !a.enabled ? phaseScreen() : a.messages.length === 0 ? empty : list}
      </div>
      {a.phase === 'ready' && a.enabled && (
        <div className={`flex-none ${compact ? 'p-3' : 'p-6'} bg-gray-50/80 dark:bg-gray-900/40 border-t dark:border-gray-700`}>
          {(att.files.length > 0 || att.reading > 0 || att.errors.length > 0) && (
            <div className={`${compact ? '' : 'max-w-4xl mx-auto'} mb-2 space-y-1`}>
              <div className="flex flex-wrap gap-1.5">
                {att.files.map(f => (
                  <span key={f.id} title={`${f.text.length.toLocaleString('tr-TR')} karakter metin`} className="inline-flex items-center gap-1.5 text-xs pl-2.5 pr-1 py-1 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200">
                    <i aria-hidden="true" className="fa-solid fa-paperclip text-gray-400"></i>
                    <span className="max-w-[180px] truncate">{f.name}</span>
                    <span className="text-gray-400">{fmtFileSize(f.size)}</span>
                    <button aria-label={`${f.name} ekini kaldır`} onClick={() => att.remove(f.id)} className="w-5 h-5 rounded-full text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><i aria-hidden="true" className="fa-solid fa-xmark text-[10px]"></i></button>
                  </span>
                ))}
                {att.reading > 0 && <span role="status" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300"><i aria-hidden="true" className="fa-solid fa-circle-notch fa-spin"></i>Dosya okunuyor…</span>}
              </div>
              {att.errors.map(e => <p key={e} role="alert" className="text-xs text-red-600">{e}</p>)}
            </div>
          )}
          <div className={`${compact ? '' : 'max-w-4xl mx-auto'} relative`}>
            <input ref={att.fileRef} type="file" multiple accept={ATTACHMENT_EXTENSIONS.join(',')} className="hidden" onChange={e => { att.add(e.target.files).then(() => inputRef.current?.focus()); }} />
            <button aria-label="Dosya ekle" onClick={att.pick} disabled={att.full} title="Dosya ekle (PDF, Word, Excel, CSV, metin) — sürükleyip bırakabilirsiniz" className="absolute left-2 bottom-2.5 w-10 h-10 text-gray-400 hover:text-indigo-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 flex items-center justify-center">
              <i aria-hidden="true" className="fa-solid fa-paperclip"></i>
            </button>
            {slash.open && (
              <ul id="slash-menu" role="listbox" aria-label="Komutlar" className="absolute left-0 right-0 bottom-full mb-2 z-10 p-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                {slash.items.map((c, i) => (
                  <li key={c.cmd} role="option" aria-selected={i === slash.active}>
                    <button onMouseEnter={() => slash.setActive(i)} onClick={() => slash.choose(c)} className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs ${i === slash.active ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200' : 'text-gray-700 dark:text-gray-200'}`}>
                      <span className="font-mono font-bold w-16 flex-none">/{c.cmd}</span>
                      <span className="flex-1">{c.label}</span>
                      {c.arg && <span className="text-[10px] text-gray-400">{c.arg}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <textarea
              ref={inputRef}
              rows={compact ? 2 : 1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (slash.onKeyDown(e)) return;
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
              onPaste={att.onPaste}
              placeholder="Sorunuzu yazın, / ile komut seçin ya da dosya ekleyin…"
              className="w-full pl-12 pr-14 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm outline-none focus:border-indigo-300 resize-none max-h-40 text-sm"
            />
            {a.isStreaming ? (
              <button aria-label="Yanıtı durdur" onClick={a.stop} title="Yanıtı durdur" className="absolute right-2 bottom-2.5 w-10 h-10 bg-red-500 text-white rounded-xl shadow hover:bg-red-600 flex items-center justify-center">
                <i aria-hidden="true" className="fa-solid fa-stop"></i>
              </button>
            ) : (
              <button aria-label="Gönder" onClick={() => submit()} disabled={(!input.trim() && !att.files.length) || att.reading > 0} title="Gönder" className="absolute right-2 bottom-2.5 w-10 h-10 bg-indigo-600 text-white rounded-xl shadow hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center">
                <i aria-hidden="true" className="fa-solid fa-paper-plane"></i>
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">Asistan ekranları sizin yerinize açabilir; veri değişikliklerini yalnızca önerir — siz "Uygula" demeden hiçbir veri değişmez. Ekler yalnız bu sohbette kullanılır.</p>
        </div>
      )}
    </div>
  );
};

export default AssistantChat;
