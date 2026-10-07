import React, { useMemo, useState } from 'react';
import { WorkspaceData } from '../../../types';
import { cleanText, EMBED_SYSTEM } from '../../../utils/ai/embedded';
import { buildPolishPrompt, buildStatusReport } from '../../../utils/statusReport';
import { useAiRun } from '../../assistant/AiButton';
import { Icon } from '../icons';
import { Sheet } from '../ui';
import { copyText, downloadFile } from '../weekly/shared';

/** Proje haftalık durum raporu: düzenlenebilir taslak, AI ile e-postaya dönüştürme, kopyala / indir / e-posta */
const StatusReportSheet: React.FC<{ workspace: WorkspaceData; projectId: string; onClose: () => void }> = ({ workspace, projectId, onClose }) => {
    const report = useMemo(() => buildStatusReport(workspace, projectId), [workspace, projectId]);
    const [text, setText] = useState(report?.text || '');
    const [before, setBefore] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const ai = useAiRun();
    if (!report) return null;

    const polish = async () => {
        const prev = text;
        const out = await ai.run(EMBED_SYSTEM, buildPolishPrompt({ ...report, text: prev }), cleanText);
        if (out) { setBefore(prev); setText(out); }
    };
    const copy = async () => {
        if (await copyText(text)) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
        else (document.getElementById('sr-text') as HTMLTextAreaElement | null)?.select();
    };
    const subject = `${report.projectName} — ${report.week}. hafta durum raporu`;
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text.length > 1800 ? `${text.slice(0, 1800)}…` : text)}`;

    return (
        <Sheet
            wide
            title="Haftalık durum raporu"
            subtitle={`${report.projectName} · ${report.week}. hafta ${report.year} · düzenleyip paylaşabilirsiniz`}
            onClose={onClose}
            footer={<>
                <span className="flex-1 text-[13px] m-text-3">Teams ya da e-postaya yapıştırın.</span>
                <button type="button" className="m-btn m-btn-gray" onClick={() => downloadFile(`durum-raporu-${report.projectName}-H${report.week}.txt`, text, 'text/plain;charset=utf-8')}><Icon name="download" size={17} />.txt</button>
                <a className="m-btn m-btn-gray" href={mailto}><Icon name="mail" size={17} />E-posta</a>
                <button type="button" className="m-btn m-btn-primary" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={17} />{copied ? 'Kopyalandı' : 'Kopyala'}</button>
            </>}
        >
            {ai.available && (
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="m-btn m-btn-gray" disabled={ai.loading} onClick={polish} title="Taslağı verileri değiştirmeden akıcı bir yönetici e-postasına çevirir">
                        <Icon name="sparkles" size={17} />{ai.loading ? 'Hazırlanıyor…' : 'AI ile e-postaya dönüştür'}
                    </button>
                    {before !== null && !ai.loading && <button type="button" className="m-btn m-btn-plain" onClick={() => { setText(before); setBefore(null); }}><Icon name="undo" size={16} />Taslağa dön</button>}
                    {before !== null && <span className="text-[13px] m-ink-warn">Göndermeden önce sayıları kontrol edin.</span>}
                </div>
            )}
            {ai.error && <div role="alert" className="rounded-xl m-tone-bad px-3 py-2 text-[14px]">{ai.error}</div>}
            {!report.hasContent && (
                <div role="status" className="rounded-xl m-tone-warn px-4 py-2.5 text-[14px]">Bu proje için henüz yeterli veri yok (görev, not, tahsis ya da risk girin). Taslak yine de kopyalanabilir.</div>
            )}
            <textarea id="sr-text" aria-label="Rapor metni" className="m-input py-3 font-mono text-[14px] leading-relaxed min-h-[340px]" spellCheck={false} value={text} onChange={e => setText(e.target.value)} />
        </Sheet>
    );
};

export default StatusReportSheet;
