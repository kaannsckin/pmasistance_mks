import React, { useEffect, useRef, useState } from 'react';
import { Project, WbNode, Whiteboard } from '../../../types';
import { useAssistantOptional } from '../../assistant/AssistantContext';
import { AiError } from '../../../utils/ai/client';
import { WbAiResult } from '../../../utils/whiteboard/assistant';
import { setWhiteboardImageConsent, WbComplete, WbTaskOutcome } from '../../../utils/whiteboard/bridge';
import { Rect } from '../../../utils/whiteboard/model';
import { Icon } from '../icons';
import { runWbAssistant } from './wbAiRun';

/**
 * Panodaki asistan penceresi: uygulamanın asistanına panoya çizdirir. İstek
 * asistan sohbetine gider (geçmiş, takip soruları ve aynı AI ayarları); asistan
 * "panoya_ciz" aracıyla bu panoya çizer. Seçili ekran görüntüsü varsa görsel
 * modele gösterilir: değişiklikler görselin üstünde çerçeve ve numarayla
 * işaretlenir, istenirse yanına yeni ekranın taslağı çizilir.
 * Sohbet kapalıysa (yalnız ekran içi AI açık) çizim doğrudan yapılır.
 */

const SUGGEST_IMAGE = [
    'Değişiklik talebimi görselin üstünde işaretle ve her birini notla açıkla',
    'Değişiklikleri uygulayıp yeni ekranın taslağını yanına çiz',
    'Bu ekrandaki kullanılabilirlik sorunlarını işaretle',
];
/** İstek, notlardan kayıt açmak mı (çizim değil) */
export const isTaskRequest = (t: string): boolean =>
    /(g[oö]rev|kay[ıi]t|task|i[sş] kalem)\w*[^.?!]{0,40}(a[cç]|olu[sş]tur|d[oö]n[uü][sş]t[uü]r|[cç]evir)|(a[cç]|olu[sş]tur|d[oö]n[uü][sş]t[uü]r)\w*[^.?!]{0,20}(g[oö]rev|kay[ıi]t|task)/i.test(t);

export const SUGGEST_NOTES = 'Seçili notlardan kayıt aç (aynı işi anlatan notlar tek kayıt)';
const SUGGEST_BOARD = [
    SUGGEST_NOTES,
    'Seçili notları temalara göre gruplayıp her grubu bir bölüme al',
    'Bu konu için adım adım akış şeması çiz',
    'Çiçekli bir bahar sahnesi çiz',
];

export const WbAssistant: React.FC<{
    board: Whiteboard;
    project: Project;
    selection: WbNode[];
    /** Görünür alan (pano koordinatı) */
    visible: Rect;
    onApply: (r: WbAiResult) => void;
    /** Notlardan kayıt açma (gruplayarak); verilmezse yalnız çizim */
    createTasks?: (request: string, complete: WbComplete) => Promise<WbTaskOutcome>;
    /** Açılışta kutuya yazılı istek */
    initialText?: string;
    onUndo: () => void;
    onClose: () => void;
}> = ({ board, project, selection, visible, onApply, createTasks, initialText, onUndo, onClose }) => {
    const a = useAssistantOptional();
    const [text, setText] = useState(initialText || '');
    const [sendImage, setSendImage] = useState(true);
    const [done, setDone] = useState<{ summary: string; noImage: boolean } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const ctrl = useRef<AbortController | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const imageNode = selection.find(n => n.type === 'image' && n.src);
    const viaChat = !!a?.enabled && !!a.chatEnabled;
    const direct = !viaChat && !!a?.enabled && !!a.embeddedEnabled;
    useEffect(() => { inputRef.current?.focus(); return () => ctrl.current?.abort(); }, []);

    const submit = async (request: string) => {
        if (!request.trim() || busy || !a) return;
        setWhiteboardImageConsent(sendImage);
        if (viaChat) {
            // Uygulamanın asistanı: sohbet paneli açılır, asistan panoya_ciz aracıyla çizer
            a.ask(createTasks && isTaskRequest(request) ? `Panodaki notlardan kayıt aç: ${request.trim()}` : `Panoya çiz: ${request.trim()}`);
            setText('');
            onClose();
            return;
        }
        const c = new AbortController();
        ctrl.current = c;
        setBusy(true); setError(null); setDone(null);
        try {
            if (createTasks && isTaskRequest(request)) {
                const t = await createTasks(request, (s, p, o) => a.complete(s, p, c.signal, o));
                setDone({ summary: `${t.summary} ${t.created.map(x => `"${x.title}"`).join(', ')}`.trim(), noImage: false });
                setText('');
                return;
            }
            const r = await runWbAssistant({
                board, project, selection, visible, request, sendImage,
                complete: (s, p, o) => a.complete(s, p, c.signal, o),
            });
            onApply(r.result);
            setDone({ summary: r.result.summary, noImage: r.noImage });
            setText('');
        } catch (e) {
            if (!(e instanceof AiError && e.code === 'aborted')) setError((e as Error)?.message || 'Asistan çizemedi.');
        } finally {
            if (ctrl.current === c) setBusy(false);
        }
    };

    const context = imageNode
        ? { icon: 'image' as const, label: `Ekran görüntüsü: ${(imageNode.text || 'görsel').slice(0, 40)}` }
        : selection.length
            ? { icon: 'check' as const, label: `${selection.length} nesne seçili` }
            : { icon: 'eye' as const, label: 'Görünen alan' };

    return (
        <div data-ui role="dialog" aria-label="Asistan"
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 w-[560px] max-w-[calc(100%-24px)] p-3.5 flex flex-col gap-2.5 rounded-2xl m-surface m-pop shadow-2xl"
            style={{ border: '1px solid var(--m-sep, #e5e7eb)' }} onPointerDown={e => e.stopPropagation()}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
            <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl grid place-items-center m-tone-accent flex-none"><Icon name="sparkles" size={16} /></span>
                <b className="text-[15px] m-text">Asistan</b>
                <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full m-fill-2 text-[12.5px] m-text-2 min-w-0 truncate" title="Asistanın üzerinde çalışacağı alan: önce bir görsel ya da nesneler seçin"><Icon name={context.icon} size={13} />{context.label}</span>
                <span className="flex-1" />
                <button type="button" aria-label="Kapat" className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer m-text-3" onClick={onClose}><Icon name="x" size={15} /></button>
            </div>

            {!viaChat && !direct && <p className="m-0 text-[13.5px] m-text-3">Yapay zekâ bu çalışma alanında kapalı ya da yapılandırılmamış (Ayarlar › Yapay zekâ).</p>}

            {(viaChat || direct) && <>
                <textarea ref={inputRef} className="m-input !min-h-[76px] text-[14.5px]" rows={3} maxLength={2000} value={text} disabled={busy}
                    placeholder={imageNode ? 'Değişiklik talebinizi yazın: ör. "Kaydet düğmesini sağ üste al, tabloya durum filtresi ekle, başlığı büyüt"' : 'Panoya ne çizeyim? ör. "Sipariş sürecinin akış şemasını çiz"'}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(text); } }} />
                {!text && !busy && (
                    <div className="flex flex-wrap gap-1.5">
                        {(imageNode ? SUGGEST_IMAGE : SUGGEST_BOARD).map(s => (
                            <button key={s} type="button" className="min-h-8 px-2.5 py-1 rounded-full border-0 cursor-pointer m-fill-2 m-text-2 text-[12.5px] text-left" onClick={() => { setText(s); inputRef.current?.focus(); }}>{s}</button>
                        ))}
                    </div>
                )}
                <p className="m-0 text-[12.5px] m-text-3">
                    {viaChat ? 'İstek uygulamanın asistanına gider; ilerlemeyi ve sonucu sohbet panelinde görürsünüz, düzeltmeleri oradan isteyebilirsiniz. ' : ''}
                    {!imageNode ? 'İpucu: bir ekran görüntüsü yapıştırıp seçin; asistan değişikliklerinizi görselin üstünde işaretler ve yeni ekranın taslağını çizer.' : 'Çizimin hepsi tek adımda geri alınır (Ctrl+Z).'}
                </p>
                <div className="flex items-center gap-2">
                    {imageNode && (
                        <label className="flex items-center gap-1.5 text-[12.5px] m-text-2 cursor-pointer" title="Görseldeki adlar maskelenemez; görsel olduğu gibi AI sağlayıcısına gider">
                            <input type="checkbox" checked={sendImage} disabled={busy} onChange={e => setSendImage(e.target.checked)} />
                            Görseli asistana göster <span className="m-text-3">(maskelenmez)</span>
                        </label>
                    )}
                    <span className="flex-1" />
                    {busy
                        ? <>
                            <span role="status" className="inline-flex items-center gap-2 text-[13.5px] m-text-2"><span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />Çiziyor…</span>
                            <button type="button" className="m-btn m-btn-plain !min-h-[34px] !px-2 text-[13px]" onClick={() => ctrl.current?.abort()}>Durdur</button>
                        </>
                        : <button type="button" className="m-btn m-btn-primary !min-h-[38px]" disabled={!text.trim()} onClick={() => void submit(text)}><Icon name="sparkles" size={15} />{viaChat ? 'Asistana gönder' : 'Çiz'}</button>}
                </div>
                {error && !busy && <p role="alert" className="m-0 text-[13px] m-ink-bad">{error}</p>}
                {done && (
                    <div role="status" className="flex items-start gap-2 p-2.5 rounded-xl m-fill-2 text-[13.5px] m-text">
                        <Icon name="check" size={15} />
                        <span className="flex-1">{done.summary}{done.noImage ? ' (Görsel modele gönderilemedi; çizim yalnız açıklamaya göre yapıldı.)' : ''}</span>
                        <button type="button" className="m-btn m-btn-plain !min-h-[30px] !px-2 text-[13px]" onClick={() => { onUndo(); setDone(null); }}>Geri al</button>
                    </div>
                )}
            </>}
        </div>
    );
};

export default WbAssistant;
