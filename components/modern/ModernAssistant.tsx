import React, { useEffect, useRef, useState } from 'react';
import { AgentStep } from '../../utils/ai/agent';
import { AiProposal } from '../../utils/ai/actions';
import { extractText, SUPPORTED_EXTENSIONS } from '../../utils/rag/extract';
import { addUploadedDoc, indexStatus, listUploadedDocs, onDocsChange, removeUploadedDoc, retriever } from '../../utils/rag/service';
import { Citation, RAG_SOURCE_LABELS, RagSourceType, UploadedDoc } from '../../utils/rag/sources';
import { citedSources } from '../assistant/AssistantChat';
import { useAssistant } from '../assistant/AssistantContext';
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

const StepChips: React.FC<{ steps: AgentStep[] }> = ({ steps }) => (
    <div className="flex flex-wrap gap-1.5 mb-2">
        {steps.map(s => (
            <span key={s.id} title={s.status === 'error' ? 'Araç bir hata döndürdü' : 'Uygulama verisinden okundu'}
                className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-semibold ${s.status === 'error' ? 'm-tone-bad' : 'm-tone-accent'}`}>
                <Icon name={s.status === 'running' ? 'refresh' : s.status === 'error' ? 'alert' : 'database'} size={12} className={s.status === 'running' ? 'animate-spin' : undefined} />
                {s.label}
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
    applied: { label: 'Uygulandı', tone: 'm-tone-ok' },
    rejected: { label: 'Vazgeçildi', tone: 'm-tone-hold' },
    failed: { label: 'Uygulanamadı', tone: 'm-tone-bad' },
};

const Proposals: React.FC<{ proposals: AiProposal[]; onResolve: (id: string, d: 'apply' | 'reject') => void }> = ({ proposals, onResolve }) => (
    <div className="mt-3 flex flex-col gap-2">
        {proposals.map((p, i) => {
            const st = PROPOSAL_STATUS[p.status];
            return (
                <div key={p.id} className="rounded-xl m-bg p-3 flex flex-col gap-2" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }}>
                    <div className="flex items-start gap-2">
                        <span className="flex-1 text-[14px] font-semibold m-text">Öneri {i + 1}: {p.title}</span>
                        <span className={`inline-flex items-center h-6 px-2 rounded-full text-[12px] font-semibold whitespace-nowrap ${st.tone}`}>{st.label}</span>
                    </div>
                    <dl className="m-0 grid gap-x-3 gap-y-0.5 text-[13px]" style={{ gridTemplateColumns: 'auto 1fr' }}>
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
    </div>
);

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
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const panel = variant === 'panel';

    useEffect(() => { a.ensureReady(); }, [a.ensureReady]);
    useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [a.messages]);
    useEffect(() => { if (a.phase === 'ready') inputRef.current?.focus(); }, [a.phase]);

    const submit = (text?: string) => {
        const t = (text ?? input).trim();
        if (!t || a.isStreaming) return;
        if (text === undefined) setInput('');
        a.send(t);
    };

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
        if (!a.enabled) return center('x', 'Asistan kapalı', <p className="m-0 text-[15px] m-text-3">Yapay zekâ asistanı Ayarlar'dan kapatılmış.</p>);
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
            <p className="m-0 text-[14px] m-text-3 max-w-[46ch]">Portföy, tahsis, kapasite, risk ve görevler hakkında sorun — yanıtlar yetkinizdeki uygulama verisinden hesaplanır.</p>
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
                        msg.role === 'user' ? 'm-accent-bg rounded-br-md' : msg.role === 'system_alert' ? 'm-tone-bad' : 'm-surface m-text rounded-bl-md'}`}>
                        {msg.role === 'assistant' ? (
                            <>
                                {msg.steps && msg.steps.length > 0 && <StepChips steps={msg.steps} />}
                                {msg.content ? <Markdown text={msg.content} className="m-md" /> : msg.streaming ? <Dots /> : null}
                                {msg.proposals && msg.proposals.length > 0 && <Proposals proposals={msg.proposals} onResolve={(pid, d) => a.resolveProposal(msg.id, pid, d)} />}
                                {msg.citations && msg.citations.length > 0 && (
                                    <SourceList content={msg.content} citations={msg.citations} onOpen={c => (c.ref.kind === 'project-view' ? a.navigate(c.ref) : setPreview(c))} />
                                )}
                            </>
                        ) : <div className="whitespace-pre-wrap break-words">{msg.content}</div>}
                    </div>
                </div>
            ))}
        </div>
    );

    const ready = a.phase === 'ready' && a.enabled;
    return (
        <div className="h-full flex flex-col m-bg overflow-hidden">
            {preview && <SourcePreview c={preview} onClose={() => setPreview(null)} onOpenKb={() => { setPreview(null); a.setKbOpen(true); }} />}
            <header className={`flex-none flex items-center gap-2 border-b m-sep ${panel ? 'px-4 py-2.5' : 'px-6 py-3'}`} style={{ borderBottomStyle: 'solid', borderBottomWidth: 1 }}>
                <span className="w-9 h-9 rounded-full m-accent-bg flex items-center justify-center flex-none"><Icon name="sparkles" size={18} /></span>
                <div className="flex-1 min-w-0">
                    <h2 className="m-0 text-[17px] font-semibold m-text leading-tight">Asistan</h2>
                    <p className="m-0 text-[12.5px] m-text-3 truncate">{a.phase === 'ready' ? `Bağlı${a.status?.model ? ` · ${a.status.model}` : ''} · değişiklikler onayınızla` : a.phase === 'loading' ? 'Bağlanıyor…' : 'Hazır değil'}</p>
                </div>
                <button type="button" className="m-icon-btn" aria-label="Bilgi Bankası" title="Bilgi Bankası" onClick={() => a.setKbOpen(true)}><Icon name="book" size={18} /></button>
                {a.messages.length > 0 && <button type="button" className="m-icon-btn" aria-label="Sohbeti temizle" title="Sohbeti temizle" onClick={a.clear}><Icon name="trash" size={18} /></button>}
                {onExpand && <button type="button" className="m-icon-btn" aria-label="Tam ekranda aç" title="Tam ekranda aç" onClick={onExpand}><Icon name="expand" size={18} /></button>}
                {onClose && <button type="button" className="m-icon-btn" aria-label="Asistanı kapat" title="Kapat (Esc)" onClick={onClose}><Icon name="x" /></button>}
            </header>
            <div ref={scrollRef} className={`flex-1 overflow-y-auto ${panel ? 'p-4' : 'p-6'}`}>
                {!ready ? phaseScreen() : a.messages.length === 0 ? empty : list}
            </div>
            {ready && (
                <div className={`flex-none border-t m-sep ${panel ? 'p-3' : 'px-6 py-4'}`} style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                    <form className={`relative ${panel ? '' : 'max-w-3xl mx-auto'}`} onSubmit={e => { e.preventDefault(); submit(); }}>
                        <textarea
                            ref={inputRef}
                            aria-label="Asistana soru"
                            rows={panel ? 2 : 1}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                            placeholder="Sorunuzu yazın… (Shift+Enter: yeni satır)"
                            className="m-input py-3 pr-14 resize-none max-h-40 leading-relaxed"
                        />
                        {a.isStreaming ? (
                            <button type="button" className="absolute right-2 bottom-2 w-10 h-10 rounded-full border-0 cursor-pointer flex items-center justify-center m-tone-bad" aria-label="Yanıtı durdur" onClick={a.stop}><Icon name="stop" size={16} /></button>
                        ) : (
                            <button type="submit" className="absolute right-2 bottom-2 w-10 h-10 rounded-full border-0 cursor-pointer flex items-center justify-center m-accent-bg disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Gönder" disabled={!input.trim()}><Icon name="arrowUp" size={18} strokeWidth={2.4} /></button>
                        )}
                    </form>
                    <p className="m-0 mt-1.5 text-[12px] m-text-3 text-center">Asistan değişiklikleri yalnızca önerir; siz "Uygula" demeden hiçbir veri değişmez. Önemli kararlardan önce sayıları ilgili ekranda doğrulayın.</p>
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
export const ModernAssistantPanel: React.FC<{ suggestions: { label: string; prompt: string }[]; hidden?: boolean; onExpand?: () => void }> = ({ suggestions, hidden, onExpand }) => {
    const a = useAssistant();
    useEffect(() => {
        if (!a.isOpen || a.isKbOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') a.setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [a.isOpen, a.isKbOpen, a.setOpen]);
    if (!a.enabled) return null;
    return (
        <>
            {a.isKbOpen && <ModernKnowledgeBase onClose={() => a.setKbOpen(false)} />}
            {!hidden && a.isOpen && (
                <aside role="dialog" aria-label="Asistan" className="fixed top-0 right-0 z-[60] h-full w-full sm:w-[440px] m-pop border-l m-sep" style={{ borderLeftStyle: 'solid', borderLeftWidth: 1 }}>
                    <ModernChat variant="panel" suggestions={suggestions} onClose={() => a.setOpen(false)} onExpand={onExpand ? () => { a.setOpen(false); onExpand(); } : undefined} />
                </aside>
            )}
        </>
    );
};
