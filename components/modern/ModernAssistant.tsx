import React, { useEffect, useRef, useState } from 'react';
import { AgentStep } from '../../utils/ai/agent';
import { AiProposal } from '../../utils/ai/actions';
import { ATTACHMENT_EXTENSIONS, AttachmentInfo } from '../../utils/ai/attachments';
import { fmtFileSize as fmtKb, useChatAttachments } from '../assistant/useChatAttachments';
import { toolKind } from '../../utils/ai/tools';
import { AiDocument, DOC_FORMAT_LABELS, documentStats, documentSummary } from '../../utils/export/aiDocument';
import { formatsFor, useDocumentDownload } from '../assistant/useDocumentDownload';
import { useSlashMenu } from '../assistant/useSlashMenu';
import { extractText, SUPPORTED_EXTENSIONS } from '../../utils/rag/extract';
import { addUploadedDoc, indexStatus, listUploadedDocs, onDocsChange, removeUploadedDoc, retriever } from '../../utils/rag/service';
import { Citation, RAG_SOURCE_LABELS, RagSourceType, UploadedDoc } from '../../utils/rag/sources';
import { citedSources } from '../assistant/AssistantChat';
import { useAssistant } from '../assistant/AssistantContext';
import { EditableSection, memoryAgeLabel, MEMORY_STORAGE_NOTE, SECTION_OPTIONS, useMemoryEditor } from '../assistant/useMemoryEditor';
import Markdown from '../Markdown';
import { Icon } from './icons';
import { rowSep, Sheet } from './ui';

/**
 * Modern AI asistanı: yan panel ve tam ekran aynı sohbeti gösterir. Sohbet
 * durumu, araçlar, onaylı değişiklik önerileri ve kaynaklar ortak
 * AssistantContext'ten gelir; yalnız görünüm moderndir.
 */

const SOURCE_ICON: Record<Citation['type'], string> = {
    not: 'pen', gorev: 'list', risk: 'shield', istek: 'inbox', analiz: 'activity', hedef: 'target', proje: 'briefcase', kilavuz: 'book', dokuman: 'report',
};

const STEP_KIND: Record<ReturnType<typeof toolKind>, { icon: string; title: string }> = {
    read: { icon: 'database', title: 'Uygulama verisinden okundu' },
    propose: { icon: 'pencil', title: 'Değişiklik önerisi hazırlandı (onayınızı bekler)' },
    ui: { icon: 'compass', title: 'Asistan ekranı sizin için değiştirdi' },
    jira: { icon: 'cloud', title: "Jira'dan güncel veri okundu" },
    file: { icon: 'download', title: 'Dosya hazırlandı' },
    memory: { icon: 'pen', title: 'Hafıza güncellendi' },
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
        <section aria-label="Sohbetler" className="flex-none border-b m-sep px-4 py-3 flex flex-col gap-2" style={{ borderBottomStyle: 'solid', borderBottomWidth: 1 }}>
            <div className="flex items-center gap-2">
                <span className="flex-1 text-[14px] font-semibold m-text">Sohbetler · {a.chats.length}</span>
                <button type="button" className="m-btn m-btn-plain !min-h-[32px] !px-2.5 text-[13px]" onClick={() => { a.clear(); onClose(); }}><Icon name="plus" size={14} />Yeni sohbet</button>
                <button type="button" className="m-icon-btn" aria-label="Sohbetleri kapat" onClick={onClose}><Icon name="x" size={16} /></button>
            </div>
            {a.chats.length === 0 ? (
                <p className="m-0 text-[13px] m-text-3">Henüz kayıtlı sohbet yok.</p>
            ) : (
                <ul className="m-0 p-0 list-none flex flex-col max-h-60 overflow-y-auto">
                    {a.chats.map(c => (
                        <li key={c.id} className="flex items-center gap-1">
                            <button type="button" onClick={() => { a.openChat(c.id); onClose(); }} aria-current={c.id === a.currentChatId ? 'true' : undefined}
                                className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-lg border-0 cursor-pointer text-left ${c.id === a.currentChatId ? 'm-tone-accent' : 'bg-transparent m-text m-row-link'}`}>
                                <span className="flex-1 min-w-0 truncate text-[13.5px]">{c.title}</span>
                                <span className="text-[12px] m-text-3 flex-none">{relTime(c.updatedAt)}</span>
                            </button>
                            <button type="button" className="m-icon-btn !w-7 !h-7 flex-none" aria-label={`Sohbeti sil: ${c.title}`} title="Sil" onClick={() => { if (window.confirm(`"${c.title}" sohbeti silinsin mi?`)) a.removeChat(c.id); }}><Icon name="trash" size={14} /></button>
                        </li>
                    ))}
                </ul>
            )}
            <p className="m-0 text-[12px] m-text-3">Sohbetler yalnız bu tarayıcıda ve bu kimlik için saklanır (en çok 30). Yeniden açılan sohbetteki bekleyen öneriler uygulanamaz.</p>
        </section>
    );
};

/** Hafıza: kullanıcının hafiza.md belgesi (bu tarayıcıda); bölümler, elle ekleme, düzenleme, indir/yükle */
const MemoryPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const m = useMemoryEditor();
    const fileRef = useRef<HTMLInputElement>(null);
    const field = 'text-[13px] rounded-lg border m-sep m-text px-2 py-1.5';
    const fieldStyle = { background: 'var(--m-surface, transparent)', borderStyle: 'solid', borderWidth: 1 } as const;
    return (
        <section aria-label="Asistan hafızası" className="flex-none border-b m-sep px-4 py-3 flex flex-col gap-2" style={{ borderBottomStyle: 'solid', borderBottomWidth: 1 }}>
            <div className="flex items-center gap-1 flex-wrap">
                <span className="flex-1 text-[14px] font-semibold m-text">Hafıza · {m.activeCount}{m.archived > 0 && <span className="font-normal m-text-3"> (+{m.archived} arşiv)</span>}</span>
                {m.mode === 'list' && <button type="button" className="m-icon-btn" aria-label="hafiza.md belgesini düzenle" title="Düzenle" onClick={m.startEdit}><Icon name="pencil" size={16} /></button>}
                <button type="button" className="m-icon-btn" aria-label="hafiza.md olarak indir" title="İndir" onClick={m.download}><Icon name="download" size={16} /></button>
                <button type="button" className="m-icon-btn" aria-label=".md dosyasından yükle" title="Yükle" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} /></button>
                <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="hidden" onChange={e => { void m.upload(e.target.files?.[0]); e.target.value = ''; }} />
                {m.activeCount + m.archived > 0 && <button type="button" className="m-icon-btn" aria-label="Tümünü sil" title="Tümünü sil" onClick={m.clear}><Icon name="trash" size={16} /></button>}
                <button type="button" className="m-icon-btn" aria-label="Hafızayı kapat" onClick={onClose}><Icon name="x" size={16} /></button>
            </div>
            {m.mode === 'edit' ? (
                <div className="flex flex-col gap-2">
                    <textarea aria-label="hafiza.md" value={m.draft} onChange={e => m.setDraft(e.target.value)} rows={14} spellCheck={false} className={`${field} font-mono !text-[12px] w-full`} style={fieldStyle} />
                    <div className="flex gap-2 justify-end">
                        <button type="button" className="m-btn m-btn-plain !min-h-[32px] !px-3 text-[13px]" onClick={m.cancelEdit}>Vazgeç</button>
                        <button type="button" className="m-btn m-btn-primary !min-h-[32px] !px-3 text-[13px]" onClick={m.saveEdit}>Kaydet</button>
                    </div>
                </div>
            ) : (
                <>
                    <form className="flex gap-1.5 items-center" onSubmit={e => { e.preventDefault(); m.add(); }}>
                        <select aria-label="Bölüm" value={m.section} onChange={e => m.setSection(e.target.value as EditableSection)} className={field} style={fieldStyle}>
                            {SECTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <input aria-label="Hafızaya eklenecek satır" value={m.text} onChange={e => m.setText(e.target.value)} maxLength={300} placeholder={m.hint} className={`${field} flex-1 min-w-0`} style={fieldStyle} />
                        <label className="text-[13px] m-text-3 flex items-center gap-1" title="Önemli: daha yavaş eskir"><input type="checkbox" checked={m.important} onChange={e => m.setImportant(e.target.checked)} />!</label>
                        <button type="submit" disabled={!m.text.trim()} className="m-btn m-btn-primary !min-h-[32px] !px-3 text-[13px]">Ekle</button>
                    </form>
                    <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                        {m.groups.map(g => (
                            <div key={g.section}>
                                <p className="m-0 text-[11.5px] font-semibold uppercase tracking-wide m-text-3">{g.title}{g.section === 'not' ? ' · ilgili sorularda okunur, eskir' : ' · her yanıtta'}</p>
                                {g.items.length === 0 ? <p className="m-0 text-[13px] m-text-3">—</p> : (
                                    <ul className="m-0 p-0 list-none flex flex-col gap-0.5">
                                        {g.items.map(it => (
                                            <li key={it.id} className="flex items-start gap-2 text-[13.5px] m-text">
                                                <span className="flex-1 min-w-0 break-words">{it.important && <b className="mr-1" style={{ color: 'var(--m-warn, #b45309)' }} title="Önemli">!</b>}{it.text}</span>
                                                {g.section === 'not' && <span className="text-[12px] m-text-3 m-tabular flex-none">{memoryAgeLabel(it)}</span>}
                                                <button type="button" className="m-icon-btn !w-7 !h-7 flex-none" aria-label={`Sil: ${it.text}`} title="Sil" onClick={() => m.forget(it.id)}><Icon name="trash" size={14} /></button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
            {m.error && <p role="alert" className="m-0 text-[13px]" style={{ color: 'var(--m-danger, #dc2626)' }}>{m.error}</p>}
            <div className="flex items-center gap-2 text-[13px] border-t m-sep pt-2" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                <Icon name={m.sync.state === 'syncing' ? 'refresh' : 'cloud'} size={16} />
                <span role="status" className={`flex-1 min-w-0 ${m.sync.state === 'error' ? '' : 'm-text-3'}`} style={m.sync.state === 'error' ? { color: 'var(--m-danger, #dc2626)' } : undefined}>{m.syncText}</span>
                {m.sync.available && <label className="flex items-center gap-1 m-text-2" title="Asistan açılınca, hafıza değişince ve sekmeye dönünce kendiliğinden eşitler"><input type="checkbox" checked={m.sync.auto} onChange={e => m.setAutoSync(e.target.checked)} />Otomatik</label>}
                <button type="button" className="m-btn m-btn-plain !min-h-[30px] !px-2.5 text-[13px]" onClick={() => void m.syncNow()} disabled={!m.sync.available || m.sync.state === 'syncing'}>Şimdi eşitle</button>
            </div>
            <p className="m-0 text-[12px] m-text-3">{MEMORY_STORAGE_NOTE}</p>
        </section>
    );
};

const StepChips: React.FC<{ steps: AgentStep[] }> = ({ steps }) => (
    <div className="flex flex-wrap gap-1.5 mb-2">
        {steps.map(s => {
            const kind = STEP_KIND[toolKind(s.name)];
            return (
                <span key={s.id} title={s.status === 'error' ? 'Araç bir hata döndürdü' : kind.title}
                    className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-semibold ${s.status === 'error' ? 'm-tone-bad' : 'm-tone-accent'}`}>
                    <Icon name={s.status === 'running' ? 'refresh' : s.status === 'error' ? 'alert' : kind.icon} size={12} className={s.status === 'running' ? 'animate-spin' : undefined} />
                    {s.label}
                </span>
            );
        })}
    </div>
);

/** Gönderilmiş mesajdaki ekler (kullanıcı balonunun içinde) */
const SentAttachments: React.FC<{ items: AttachmentInfo[] }> = ({ items }) => (
    <div className="flex flex-wrap gap-1.5 mt-2">
        {items.map(f => (
            <span key={f.name} title={f.truncated ? 'Dosya uzun olduğu için modele kısaltılarak gönderildi' : `${f.chars.toLocaleString('tr-TR')} karakter`}
                className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-semibold" style={{ background: 'rgba(255,255,255,.18)' }}>
                <Icon name="paperclip" size={12} />
                <span className="max-w-[180px] truncate">{f.name}</span>
                <span className="opacity-80">· {fmtKb(f.size)}{f.truncated ? ' · kısaltıldı' : ''}</span>
            </span>
        ))}
    </div>
);

const SourceList: React.FC<{ content: string; citations: Citation[]; onOpen: (c: Citation) => void }> = ({ content, citations, onOpen }) => {
    const { label, list } = citedSources(content, citations);
    if (!list.length) return null;
    return (
        <div className="mt-3 pt-2 border-t m-sep flex flex-col gap-0.5" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
            <span className="text-[12px] font-semibold m-text-3 mb-1">{label}</span>
            {list.map(c => (
                <button key={c.no} type="button" onClick={() => onOpen(c)} title={c.excerpt.slice(0, 240)} className="m-row-link flex items-start gap-2 px-1.5 py-1 rounded-lg">
                    <span className="flex-none min-w-[22px] h-[22px] px-1 rounded-md m-tone-accent text-[12px] font-bold flex items-center justify-center m-tabular">{c.no}</span>
                    <span className="min-w-0 flex flex-col">
                        <span className="text-[13px] font-semibold m-text flex items-center gap-1"><Icon name={SOURCE_ICON[c.type]} size={13} className="m-text-3" />{c.title}</span>
                        <span className="text-[12px] m-text-3 truncate">{[RAG_SOURCE_LABELS[c.type], c.projectName, c.date].filter(Boolean).join(' · ')}</span>
                    </span>
                </button>
            ))}
        </div>
    );
};

const PROPOSAL_STATUS: Record<AiProposal['status'], { label: string; tone: string }> = {
    pending: { label: 'Onayınızı bekliyor', tone: 'm-tone-warn' },
    running: { label: 'Çalışıyor…', tone: 'm-tone-accent' },
    applied: { label: 'Uygulandı', tone: 'm-tone-ok' },
    rejected: { label: 'Vazgeçildi', tone: 'm-tone-hold' },
    failed: { label: 'Uygulanamadı', tone: 'm-tone-bad' },
};

const Proposals: React.FC<{ proposals: AiProposal[]; onResolve: (id: string, d: 'apply' | 'reject') => void; onResolveAll?: (d: 'apply' | 'reject') => void }> = ({ proposals, onResolve, onResolveAll }) => (
    <div className="mt-3 flex flex-col gap-2">
        {proposals.map((p, i) => {
            const st = PROPOSAL_STATUS[p.status];
            return (
                <div key={p.id} className="rounded-xl m-bg p-3 flex flex-col gap-2" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }}>
                    <div className="flex items-start gap-2">
                        <span className="flex-1 text-[14px] font-semibold m-text">Öneri {i + 1}: {p.title}</span>
                        <span className={`inline-flex items-center h-6 px-2 rounded-full text-[12px] font-semibold whitespace-nowrap ${st.tone}`}>{st.label}</span>
                    </div>
                    <dl className="m-0 grid gap-x-3 gap-y-0.5 text-[13px]" style={{ gridTemplateColumns: 'minmax(0, max-content) minmax(55%, 1fr)' }}>
                        {p.details.map(d => <React.Fragment key={d.label}><dt className="m-text-3">{d.label}</dt><dd className="m-0 m-text break-words">{d.value}</dd></React.Fragment>)}
                    </dl>
                    {p.message && p.status !== 'pending' && <p className="m-0 text-[13px] m-text-2">{p.message}</p>}
                    {p.status === 'pending' && (
                        <div className="flex gap-2">
                            <button type="button" className="m-btn m-btn-primary !min-h-[36px] !px-3 text-[14px]" onClick={() => onResolve(p.id, 'apply')}><Icon name="check" size={15} />Uygula</button>
                            <button type="button" className="m-btn m-btn-plain !min-h-[36px] !px-3 text-[14px]" onClick={() => onResolve(p.id, 'reject')}>Vazgeç</button>
                        </div>
                    )}
                </div>
            );
        })}
        {onResolveAll && proposals.filter(p => p.status === 'pending').length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="m-btn m-btn-primary !min-h-[36px] !px-3 text-[14px]" onClick={() => onResolveAll('apply')}><Icon name="check" size={15} />Tümünü uygula ({proposals.filter(p => p.status === 'pending').length})</button>
                <button type="button" className="m-btn m-btn-plain !min-h-[36px] !px-3 text-[14px]" onClick={() => onResolveAll('reject')}>Hepsinden vazgeç</button>
                <span className="text-[12.5px] m-text-3">Sırayla uygulanır; tek "Geri Al" hepsini geri alır.</span>
            </div>
        )}
    </div>
);

const FileCards: React.FC<{ files: AiDocument[] }> = ({ files }) => {
    const dl = useDocumentDownload();
    return (
        <div className="mt-3 flex flex-col gap-2">
            {files.map(f => {
                const st = documentStats(f);
                const [main, ...rest] = formatsFor(f);
                return (
                    <div key={f.id} className="rounded-xl m-bg p-3 flex flex-col gap-2" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }}>
                        <div className="flex items-start gap-2.5">
                            <span className="w-9 h-9 rounded-lg m-tone-accent flex items-center justify-center flex-none"><Icon name="report" size={18} /></span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-[14px] font-semibold m-text break-words">{f.title}</span>
                                <span className="block text-[12.5px] m-text-3">{[f.subtitle, documentSummary(st, f.blocks.length)].filter(Boolean).join(' · ')}</span>
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <button type="button" className="m-btn m-btn-primary !min-h-[36px] !px-3 text-[14px]" disabled={!!dl.busy} onClick={() => dl.download(f, main)}>
                                <Icon name="download" size={15} />{dl.busy === `${f.id}:${main}` ? 'Hazırlanıyor…' : `${DOC_FORMAT_LABELS[main]} indir`}
                            </button>
                            {rest.map(fmt => (
                                <button key={fmt} type="button" className="m-btn m-btn-plain !min-h-[32px] !px-2.5 text-[13px]" disabled={!!dl.busy} onClick={() => dl.download(f, fmt)} title={`${DOC_FORMAT_LABELS[fmt]} olarak indir`}>
                                    {dl.busy === `${f.id}:${fmt}` ? '…' : DOC_FORMAT_LABELS[fmt]}
                                </button>
                            ))}
                        </div>
                        {dl.error[f.id] && <p className="m-0 text-[13px] m-ink-bad" role="alert">{dl.error[f.id]}</p>}
                        {!dl.error[f.id] && dl.done[f.id] && <p className="m-0 text-[12.5px] m-text-3" role="status">İndirildi: {dl.done[f.id]}</p>}
                    </div>
                );
            })}
        </div>
    );
};

const Dots = () => (
    <span className="inline-flex items-center gap-1.5 py-1" aria-label="Yanıt yazılıyor">
        {[0, 0.2, 0.4].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--m-accent)', animationDelay: `${d}s` }}></span>)}
    </span>
);

const SourcePreview: React.FC<{ c: Citation; onClose: () => void; onOpenKb: () => void }> = ({ c, onClose, onOpenKb }) => (
    <Sheet
        title={c.title}
        subtitle={[`[${c.no}] ${RAG_SOURCE_LABELS[c.type]}`, c.projectName, c.date].filter(Boolean).join(' · ')}
        onClose={onClose}
        footer={c.ref.kind === 'document' ? <><span className="flex-1"></span><button type="button" className="m-btn m-btn-gray" onClick={onOpenKb}><Icon name="book" size={16} />Bilgi Bankası'nda göster</button></> : undefined}
    >
        <p className="m-0 text-[15px] leading-relaxed m-text whitespace-pre-wrap">{c.excerpt}</p>
    </Sheet>
);

// ---------------------------------------------------------------- sohbet

export const ModernChat: React.FC<{
    variant: 'panel' | 'page';
    suggestions: { label: string; prompt: string }[];
    onClose?: () => void;
    onExpand?: () => void;
}> = ({ variant, suggestions, onClose, onExpand }) => {
    const a = useAssistant();
    const [input, setInput] = useState('');
    const [token, setToken] = useState('');
    const [preview, setPreview] = useState<Citation | null>(null);
    const [memoryOpen, setMemoryOpen] = useState(false);
    const activeMemory = a.memory.filter(m => m.section !== 'arsiv').length;
    const [historyOpen, setHistoryOpen] = useState(false);
    const att = useChatAttachments();
    const { files, reading, errors: fileErrors, dragging, fileRef } = att;
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const panel = variant === 'panel';
    const addFiles = (list: FileList | null) => { att.add(list).then(() => inputRef.current?.focus()); };


    useEffect(() => { a.ensureReady(); }, [a.ensureReady]);
    useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [a.messages]);
    useEffect(() => { if (a.phase === 'ready') inputRef.current?.focus(); }, [a.phase]);

    const submit = (text?: string) => {
        const t = (text ?? input).trim();
        const withFiles = text === undefined ? files : [];
        if ((!t && !withFiles.length) || a.isStreaming || reading > 0) return;
        if (text === undefined) { setInput(''); att.clear(); }
        a.send(t, withFiles);
    };
    const slash = useSlashMenu(input, setInput, t => submit(t));
    const pinnedLabel = a.pinned?.label || (a.pinned?.taskId ? 'görev' : 'kişi');

    const center = (icon: string, title: string, body: React.ReactNode) => (
        <div className="h-full flex items-center justify-center p-6">
            <div className="max-w-md flex flex-col items-center gap-3 text-center">
                <span className="w-12 h-12 rounded-full m-tone-accent flex items-center justify-center"><Icon name={icon} size={22} /></span>
                <h3 className="m-0 text-[17px] font-semibold m-text">{title}</h3>
                {body}
            </div>
        </div>
    );

    const phaseScreen = () => {
        if (!a.chatEnabled) return center('x', 'Asistan kapalı', <p className="m-0 text-[15px] m-text-3">{a.enabled ? 'Asistan sohbeti yönetici tarafından kapatılmış.' : "Yapay zekâ asistanı Ayarlar'dan ya da yönetici tarafından kapatılmış."}</p>);
        if (a.phase === 'idle' || a.phase === 'loading') return center('refresh', 'Bağlanıyor…', <p className="m-0 text-[15px] m-text-3">AI bağlantısı kontrol ediliyor.</p>);
        if (a.phase === 'unavailable') {
            return center('alert', 'Yapay zekâ henüz hazır değil', (
                <>
                    <p className="m-0 text-[15px] m-text-2">{a.status?.problem || 'AI sunucusu yapılandırılmamış.'}</p>
                    <p className="m-0 text-[13px] m-text-3">Kurumsal AI anahtarı yalnızca sunucuda tutulur. Yönetici <code>AI_PROVIDER</code>, <code>AI_API_KEY</code>, <code>AI_MODEL</code> değişkenlerini tanımladığında asistan açılır.</p>
                    <button type="button" className="m-btn m-btn-primary" onClick={a.recheck}><Icon name="refresh" size={17} />Tekrar dene</button>
                </>
            ));
        }
        if (a.phase === 'needs_token') {
            return center('key', 'Erişim kodu gerekli', (
                <>
                    <p className="m-0 text-[15px] m-text-2">Kurumsal AI asistanı yetkili kullanıcılara açıktır. Yöneticinizden aldığınız erişim kodunu girin; kod yalnızca bu cihazda saklanır.</p>
                    {a.authError && <p role="alert" className="m-0 text-[14px] m-ink-bad">{a.authError}</p>}
                    <form className="flex gap-2 w-full" onSubmit={e => { e.preventDefault(); if (token.trim()) { a.saveToken(token); setToken(''); } }}>
                        <input type="password" aria-label="Erişim kodu" autoComplete="off" className="m-input" value={token} placeholder="Erişim kodu" onChange={e => setToken(e.target.value)} />
                        <button type="submit" className="m-btn m-btn-primary flex-none" disabled={!token.trim()}>Başlat</button>
                    </form>
                </>
            ));
        }
        return center('users', 'Giriş yapmanız gerekiyor', (
            <>
                <p className="m-0 text-[15px] m-text-2">AI asistanı çalışma alanı üyelerine açıktır. Bulut eşitleme penceresinden giriş yapıp tekrar deneyin.</p>
                {a.authError && <p role="alert" className="m-0 text-[14px] m-ink-bad">{a.authError}</p>}
                <button type="button" className="m-btn m-btn-primary" onClick={a.recheck}><Icon name="refresh" size={17} />Tekrar dene</button>
            </>
        ));
    };

    const empty = (
        <div className={`h-full flex flex-col items-center justify-center gap-3 text-center ${panel ? '' : 'max-w-2xl mx-auto'}`}>
            <span className="w-12 h-12 rounded-full m-tone-accent flex items-center justify-center"><Icon name="sparkles" size={22} /></span>
            <h3 className="m-0 text-[20px] font-semibold m-text">Size nasıl yardımcı olabilirim?</h3>
            <p className="m-0 text-[14px] m-text-3 max-w-[46ch]">Portföy, tahsis, kapasite, risk ve görevler hakkında sorun{a.jiraEnabled ? ", Jira kayıtlarını sorgulatın" : ''}; dosya ekleyin ya da "riskler ekranını aç" gibi komutlar verin. Yanıtlar yetkinizdeki veriden hesaplanır.</p>
            <div className={`grid gap-2 w-full mt-1 ${panel ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                {suggestions.map(s => (
                    <button key={s.label} type="button" onClick={() => submit(s.prompt)} className="m-surface m-row-link rounded-xl px-3.5 py-2.5 text-[14px] text-left">{s.label}</button>
                ))}
            </div>
        </div>
    );

    const list = (
        <div className={`flex flex-col ${panel ? 'gap-4' : 'gap-6 max-w-3xl mx-auto'}`}>
            {a.messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`min-w-0 max-w-[92%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                        msg.role === 'user' ? 'm-chat-user m-accent-bg rounded-br-md' : msg.role === 'system_alert' ? 'm-tone-bad' : 'm-chat-ai m-surface m-text rounded-bl-md'}`}>
                        {msg.role === 'assistant' ? (
                            <>
                                {msg.steps && msg.steps.length > 0 && <StepChips steps={msg.steps} />}
                                {msg.content ? <Markdown text={msg.content} className="m-md" /> : msg.streaming ? <Dots /> : null}
                                {msg.files && msg.files.length > 0 && <FileCards files={msg.files} />}
                                {msg.proposals && msg.proposals.length > 0 && <Proposals proposals={msg.proposals} onResolve={(pid, d) => a.resolveProposal(msg.id, pid, d)} onResolveAll={d => a.resolveAllProposals(msg.id, d)} />}
                                {msg.citations && msg.citations.length > 0 && (
                                    <SourceList content={msg.content} citations={msg.citations} onOpen={c => (c.ref.kind === 'project-view' ? a.navigate(c.ref) : setPreview(c))} />
                                )}
                                {msg.followUps && msg.followUps.length > 0 && msg.id === a.messages[a.messages.length - 1]?.id && !a.isStreaming && (
                                    <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Takip önerileri">
                                        {msg.followUps.map(f => (
                                            <button key={f} type="button" onClick={() => a.send(f)} className="inline-flex items-center gap-1.5 min-h-[32px] px-3 rounded-full text-[13px] font-medium m-tone-accent border-0 cursor-pointer text-left">
                                                <Icon name="sparkles" size={13} />{f}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                                {msg.attachments && msg.attachments.length > 0 && <SentAttachments items={msg.attachments} />}
                            </>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );

    const ready = a.phase === 'ready' && a.enabled;
    const dropProps = ready ? att.dropProps : {};
    return (
        <div className="relative h-full flex flex-col m-bg overflow-hidden" {...dropProps}>
            {dragging && (
                <div className="absolute inset-0 z-10 m-2 rounded-2xl flex items-center justify-center pointer-events-none m-tone-accent" style={{ border: '2px dashed var(--m-accent)' }}>
                    <span className="flex items-center gap-2 text-[15px] font-semibold"><Icon name="paperclip" size={18} />Dosyayı sohbete eklemek için bırakın</span>
                </div>
            )}
            {preview && <SourcePreview c={preview} onClose={() => setPreview(null)} onOpenKb={() => { setPreview(null); a.setKbOpen(true); }} />}
            <header className={`flex-none flex items-center gap-2 border-b m-sep ${panel ? 'px-4 py-2.5' : 'px-6 py-3'}`} style={{ borderBottomStyle: 'solid', borderBottomWidth: 1 }}>
                <span className="w-9 h-9 rounded-full m-accent-bg flex items-center justify-center flex-none"><Icon name="sparkles" size={18} /></span>
                <div className="flex-1 min-w-0">
                    <h2 className="m-0 text-[17px] font-semibold m-text leading-tight">Asistan</h2>
                    <p className="m-0 text-[12.5px] m-text-3 truncate">{a.phase === 'ready' ? `Bağlı${a.status?.model ? ` · ${a.status.model}` : ''} · değişiklikler onayınızla` : a.phase === 'loading' ? 'Bağlanıyor…' : 'Hazır değil'}</p>
                </div>
                <button type="button" className="m-icon-btn relative" aria-label={`Hafıza (${activeMemory} not)`} aria-expanded={memoryOpen} title="Asistanın hafızası" onClick={() => { setMemoryOpen(o => !o); setHistoryOpen(false); }}>
                    <Icon name="pen" size={18} />
                    {activeMemory > 0 && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full m-accent-bg text-[10px] font-bold flex items-center justify-center">{activeMemory}</span>}
                </button>
                <button type="button" className="m-icon-btn" aria-label="Bilgi Bankası" title="Bilgi Bankası" onClick={() => a.setKbOpen(true)}><Icon name="book" size={18} /></button>
                {a.messages.length > 0 && <button type="button" className="m-icon-btn" aria-label="Yeni sohbet" title="Yeni sohbet (bu sohbet geçmişte kalır)" onClick={a.clear}><Icon name="plus" size={18} /></button>}
                <button type="button" className="m-icon-btn" aria-label={`Sohbetler (${a.chats.length})`} aria-expanded={historyOpen} title="Sohbet geçmişi" onClick={() => { setHistoryOpen(o => !o); setMemoryOpen(false); }}><Icon name="history" size={18} /></button>
                {onExpand && <button type="button" className="m-icon-btn" aria-label="Tam ekranda aç" title="Tam ekranda aç" onClick={onExpand}><Icon name="expand" size={18} /></button>}
                {panel && onClose && <button type="button" className="m-icon-btn" aria-label="Asistanı küçült" title="Küçült: sağ altta küçük simge olarak çalışmaya devam eder" onClick={a.minimize}><Icon name="minimize" /></button>}
                {onClose && <button type="button" className="m-icon-btn" aria-label="Asistanı kapat" title="Kapat (Esc)" onClick={onClose}><Icon name="x" /></button>}
            </header>
            {historyOpen && <ChatHistory onClose={() => setHistoryOpen(false)} />}
            {memoryOpen && <MemoryPanel onClose={() => setMemoryOpen(false)} />}
            <div ref={scrollRef} className={`flex-1 overflow-y-auto ${panel ? 'p-4' : 'p-6'}`}>
                {!ready ? phaseScreen() : a.messages.length === 0 ? empty : list}
            </div>
            {ready && (
                <div className={`flex-none border-t m-sep ${panel ? 'p-3' : 'px-6 py-4'}`} style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                    {(files.length > 0 || reading > 0 || fileErrors.length > 0) && (
                        <div className={`flex flex-col gap-1.5 mb-2 ${panel ? '' : 'max-w-3xl mx-auto'}`}>
                            <div className="flex flex-wrap gap-1.5">
                                {files.map(f => (
                                    <span key={f.id} className="inline-flex items-center gap-1.5 h-8 pl-2.5 pr-1 rounded-full m-fill-2 text-[13px] m-text" title={`${f.text.length.toLocaleString('tr-TR')} karakter metin`}>
                                        <Icon name="paperclip" size={14} className="m-text-3" />
                                        <span className="max-w-[200px] truncate">{f.name}</span>
                                        <span className="m-text-3">{fmtKb(f.size)}</span>
                                        <button type="button" className="m-icon-btn !w-6 !h-6" aria-label={`${f.name} ekini kaldır`} onClick={() => att.remove(f.id)}><Icon name="x" size={13} /></button>
                                    </span>
                                ))}
                                {reading > 0 && <span role="status" className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full m-tone-accent text-[13px]"><Icon name="refresh" size={14} className="animate-spin" />Dosya okunuyor…</span>}
                            </div>
                            {fileErrors.map(e => <p key={e} role="alert" className="m-0 text-[13px] m-ink-bad">{e}</p>)}
                        </div>
                    )}
                    {a.pinned && (
                        <div className={`mb-2 flex items-center gap-2 ${panel ? '' : 'max-w-3xl mx-auto'}`}>
                            <span className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-full m-tone-accent text-[13px] max-w-full">
                                <Icon name="sparkles" size={13} /><span className="truncate">Bağlam: {pinnedLabel}</span>
                                <button type="button" className="m-icon-btn !w-6 !h-6" aria-label="Bağlamı kaldır" onClick={a.unpin}><Icon name="x" size={12} /></button>
                            </span>
                        </div>
                    )}
                    <form className={`relative ${panel ? '' : 'max-w-3xl mx-auto'}`} onSubmit={e => { e.preventDefault(); submit(); }}>
                        {slash.open && (
                            <ul id="m-slash-menu" role="listbox" aria-label="Komutlar" className="absolute left-0 right-0 bottom-full mb-2 z-10 m-0 p-1.5 list-none m-surface m-pop rounded-2xl max-h-72 overflow-y-auto">
                                {slash.items.map((c, i) => (
                                    <li key={c.cmd} role="option" aria-selected={i === slash.active}>
                                        <button type="button" onMouseEnter={() => slash.setActive(i)} onClick={() => slash.choose(c)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border-0 cursor-pointer text-left ${i === slash.active ? 'm-tone-accent' : 'bg-transparent m-text'}`}>
                                            <span className="font-mono text-[13.5px] font-semibold w-20 flex-none">/{c.cmd}</span>
                                            <span className="flex-1 text-[14px]">{c.label}</span>
                                            {c.arg && <span className="text-[12px] m-text-3">{c.arg}</span>}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <input ref={fileRef} type="file" multiple accept={ATTACHMENT_EXTENSIONS.join(',')} className="hidden" onChange={e => addFiles(e.target.files)} />
                        <button type="button" className="absolute left-2 bottom-2 w-10 h-10 rounded-full border-0 cursor-pointer flex items-center justify-center m-icon-btn disabled:opacity-40" aria-label="Dosya ekle" title="Dosya ekle (PDF, Word, Excel, CSV, metin) — sürükleyip bırakabilirsiniz" disabled={att.full} onClick={att.pick}><Icon name="paperclip" size={18} /></button>
                        <textarea
                            ref={inputRef}
                            aria-label="Asistana soru"
                            rows={panel ? 2 : 1}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (slash.onKeyDown(e)) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                            placeholder="Sorunuzu yazın, / ile komut seçin ya da dosya ekleyin…"
                            onPaste={att.onPaste}
                            className="m-input resize-none max-h-40 leading-relaxed"
                            // .m-input dolgusu Tailwind dolgusunu ezer: ataş ve gönder düğmesine yer açılır
                            style={{ padding: '12px 56px' }}
                        />
                        {a.isStreaming ? (
                            <button type="button" className="absolute right-2 bottom-2 w-10 h-10 rounded-full border-0 cursor-pointer flex items-center justify-center m-tone-bad" aria-label="Yanıtı durdur" onClick={a.stop}><Icon name="stop" size={16} /></button>
                        ) : (
                            <button type="submit" className="absolute right-2 bottom-2 w-10 h-10 rounded-full border-0 cursor-pointer flex items-center justify-center m-accent-bg disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Gönder" disabled={(!input.trim() && !files.length) || reading > 0}><Icon name="arrowUp" size={18} strokeWidth={2.4} /></button>
                        )}
                    </form>
                    <p className="m-0 mt-1.5 text-[12px] m-text-3 text-center">Asistan ekranları sizin yerinize açabilir; veri değişikliklerini yalnızca önerir — siz "Uygula" demeden hiçbir veri değişmez. İstediğinizde açık Whiteboard'a doğrudan çizer (Ctrl+Z ile geri alınır). Ekler yalnız bu sohbette kullanılır.</p>
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------- Bilgi Bankası

const fmtSize = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export const ModernKnowledgeBase: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const a = useAssistant();
    const [docs, setDocs] = useState<UploadedDoc[]>([]);
    const [status, setStatus] = useState(indexStatus());
    const [busy, setBusy] = useState<string | null>(null);
    const [errors, setErrors] = useState<string[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const load = () => { listUploadedDocs().then(setDocs).catch(() => setDocs([])); };
        load();
        const offDocs = onDocsChange(load);
        const offIdx = retriever.onChange(() => setStatus(indexStatus()));
        return () => { offDocs(); offIdx(); };
    }, []);

    const refresh = async () => {
        setRefreshing(true);
        try { await a.refreshIndex(); } finally { setRefreshing(false); setStatus(indexStatus()); }
    };
    const onFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        const errs: string[] = [];
        for (const file of Array.from(files)) {
            setBusy(`${file.name} okunuyor…`);
            try { await addUploadedDoc({ name: file.name, size: file.size, text: await extractText(file) }); }
            catch (e) { errs.push(`${file.name}: ${(e as Error)?.message || 'okunamadı'}`); }
        }
        setBusy(null);
        setErrors(errs);
        if (fileRef.current) fileRef.current.value = '';
        await refresh();
    };
    const remove = async (d: UploadedDoc) => {
        if (!window.confirm(`"${d.name}" Bilgi Bankası'ndan silinsin mi?`)) return;
        await removeUploadedDoc(d.id);
        await refresh();
    };
    const sem = a.status?.embeddingProblem ? { tone: 'm-ink-warn', text: `Anlamsal arama yapılandırılamadı: ${a.status.embeddingProblem}` }
        : !status.semanticEnabled ? { tone: 'm-text-3', text: 'Anlamsal arama kapalı — sunucuda embedding modeli (AI_EMBEDDING_MODEL) tanımlı değil. Türkçe ek ve aksan duyarsız anahtar kelime araması kullanılıyor.' }
            : status.semanticError ? { tone: 'm-ink-bad', text: `Anlamsal arama durdu: ${status.semanticError} (anahtar kelime aramasıyla devam ediliyor).` }
                : { tone: 'm-ink-ok', text: `Anlamsal arama açık · ${status.model} · ${status.vectors}/${status.chunks} parça vektörlendi${status.embedding ? ' (sürüyor…)' : ''}` };

    return (
        <Sheet wide title="Bilgi Bankası" subtitle="Asistanın aradığı bilgi tabanı: uygulama içeriği, kullanım kılavuzu ve kurumsal dokümanlar." onClose={onClose}>
            <section aria-label="Dizin durumu" className="m-surface rounded-2xl p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <h3 className="m-0 flex-1 text-[17px] font-semibold m-text">Dizin durumu</h3>
                    <button type="button" className="m-btn m-btn-plain !min-h-[36px] !px-2.5 text-[14px]" disabled={refreshing} onClick={refresh}><Icon name="refresh" size={15} className={refreshing ? 'animate-spin' : undefined} />Dizini yenile</button>
                </div>
                <p className="m-0 text-[15px] m-text"><b className="m-tabular">{status.chunks}</b> parça dizinde{status.lastSync ? ` · son güncelleme ${new Date(status.lastSync).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
                <div className="flex flex-wrap gap-1.5">
                    {(Object.entries(status.byType) as [RagSourceType, number][]).map(([t, n]) => <span key={t} className="inline-flex items-center h-6 px-2.5 rounded-full m-fill-2 text-[12.5px] m-text-2">{RAG_SOURCE_LABELS[t]}: {n}</span>)}
                    {status.chunks === 0 && <span className="text-[13px] m-text-3">Dizin henüz kurulmadı — "Dizini yenile"ye basın ya da bir soru sorun.</span>}
                </div>
                <p className={`m-0 text-[13px] ${sem.tone}`}>{sem.text}</p>
                <p className="m-0 text-[12.5px] m-text-3">Dizin yalnızca yetki kapsamınızdaki içerikten kurulur; yönetici rollerinde notlar ve müşteri istekleri dizine girmez.</p>
            </section>

            <section aria-label="Kurumsal dokümanlar" className="m-surface rounded-2xl p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <h3 className="m-0 flex-1 text-[17px] font-semibold m-text">Kurumsal dokümanlar <span className="text-[14px] font-normal m-text-3 m-tabular">{docs.length}</span></h3>
                    <button type="button" className="m-btn m-btn-gray !min-h-[38px]" disabled={!!busy} onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />Doküman yükle</button>
                    <input ref={fileRef} type="file" multiple accept={SUPPORTED_EXTENSIONS.join(',')} className="hidden" onChange={e => onFiles(e.target.files)} />
                </div>
                <p className="m-0 text-[13px] m-text-3">PDF, Word (.docx), Markdown ve metin. Prosedür, şablon ve yönetmelikler asistanın yanıtlarında kaynak olarak kullanılır.</p>
                {busy && <p role="status" className="m-0 text-[14px] m-accent">{busy}</p>}
                {errors.map(e => <p key={e} role="alert" className="m-0 text-[14px] m-ink-bad">{e}</p>)}
                {docs.length === 0 ? <p className="m-0 py-3 text-[14px] m-text-3">Henüz doküman yüklenmedi.</p> : (
                    <div className="flex flex-col">
                        {docs.map((d, i) => {
                            const sep = rowSep(i);
                            return (
                                <div key={d.id} className={`flex items-center gap-3 py-2 ${sep.className}`} style={sep.style}>
                                    <span className="w-8 h-8 rounded-[9px] m-fill-2 flex items-center justify-center m-text-2 flex-none"><Icon name="report" size={16} /></span>
                                    <span className="flex-1 min-w-0 flex flex-col">
                                        <span className="text-[15px] m-text truncate">{d.name}</span>
                                        <span className="text-[12.5px] m-text-3">{fmtSize(d.size)} · {d.text.length.toLocaleString('tr-TR')} karakter · {new Date(d.addedAt).toLocaleDateString('tr-TR')}</span>
                                    </span>
                                    <button type="button" className="m-icon-btn" aria-label={`${d.name} sil`} onClick={() => remove(d)}><Icon name="trash" size={17} /></button>
                                </div>
                            );
                        })}
                    </div>
                )}
                <p className="m-0 text-[12.5px] m-text-3">Dokümanlar yalnızca bu cihazda (tarayıcıda) saklanır; ekip arkadaşlarınızla paylaşılmaz. Soru sorduğunuzda ilgili bölümler kurumsal AI sağlayıcısına gönderilir.</p>
            </section>
        </Sheet>
    );
};

// ---------------------------------------------------------------- yan panel

/** Sağdan açılan panel (örtüsüz; arkadaki ekran kullanılabilir). Esc ile kapanır. */
/**
 * Küçültülmüş asistan: sağ altta küçük AI simgesi. Üç hâl animasyonla ayrılır:
 * çalışıyor (dönen ışık halkası + o anki adım), yanıt hazır (yeşil işaret, bir kez
 * zıplar), boşta (yavaş nefes alan parıltı). Tıklanınca panel açılır.
 */
const AssistantOrb: React.FC = () => {
    const a = useAssistant();
    const working = a.isStreaming;
    const state: 'working' | 'done' | 'idle' = working ? 'working' : a.hasUnread ? 'done' : 'idle';
    const last = a.messages[a.messages.length - 1];
    const step = working && last?.role === 'assistant' ? [...(last.steps || [])].reverse().find(s => s.status === 'running')?.label : undefined;
    const label = state === 'working' ? `Asistan çalışıyor${step ? `: ${step}` : '…'}` : state === 'done' ? 'Asistanın yanıtı hazır' : 'Asistan boşta';
    return (
        <div className={`m-ai-orb-wrap is-${state}`}>
            <span className="m-ai-orb-label" aria-hidden="true">{label}</span>
            <button type="button" className="m-ai-orb" onClick={() => a.setOpen(true)} aria-label={`${label}. Asistanı aç`} title={label}>
                <span className="m-ai-orb-ring" aria-hidden="true"></span>
                <span className="m-ai-orb-core" aria-hidden="true"><Icon name="sparkles" size={22} /></span>
                {state === 'done' && <span className="m-ai-orb-badge" aria-hidden="true"><Icon name="check" size={12} strokeWidth={3} /></span>}
            </button>
            {!working && (
                <button type="button" className="m-ai-orb-dismiss" onClick={a.dismissMinimized} aria-label="Asistan simgesini kaldır" title="Kaldır"><Icon name="x" size={12} strokeWidth={2.5} /></button>
            )}
            <span className="sr-only" role="status" aria-live="polite">{state === 'idle' ? '' : label}</span>
        </div>
    );
};

export const ModernAssistantPanel: React.FC<{ suggestions: { label: string; prompt: string }[]; hidden?: boolean; onExpand?: () => void }> = ({ suggestions, hidden, onExpand }) => {
    const a = useAssistant();
    useEffect(() => {
        if (!a.isOpen || a.isKbOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') a.setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [a.isOpen, a.isKbOpen, a.setOpen]);
    if (!a.chatEnabled) return null;
    return (
        <>
            {a.isKbOpen && <ModernKnowledgeBase onClose={() => a.setKbOpen(false)} />}
            {!hidden && !a.isOpen && (a.isMinimized || a.hasUnread || a.isStreaming) && <AssistantOrb />}
            {!hidden && a.isOpen && (
                <aside role="dialog" aria-label="Asistan" className="fixed top-0 right-0 z-[60] h-full w-full sm:w-[440px] m-pop border-l m-sep" style={{ borderLeftStyle: 'solid', borderLeftWidth: 1 }}>
                    <ModernChat variant="panel" suggestions={suggestions} onClose={() => a.setOpen(false)} onExpand={onExpand ? () => { a.setOpen(false); onExpand(); } : undefined} />
                </aside>
            )}
        </>
    );
};
