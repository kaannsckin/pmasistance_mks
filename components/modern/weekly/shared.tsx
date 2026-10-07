import React from 'react';
import { ReportStage } from '../../../types';
import { STAGE_LABELS } from '../../../utils/weeklyReport';
import { Icon } from '../icons';

/** Haftalık rapor ekranlarının ortak küçük parçaları */

export const STAGE_TONE: Record<ReportStage, string> = {
    draft: 'm-tone-hold',
    bs_review: 'm-tone-warn',
    pyds_review: 'm-tone-accent',
    approved: 'm-tone-ok',
};

export const Pill: React.FC<{ tone: string; children: React.ReactNode; title?: string }> = ({ tone, children, title }) => (
    <span title={title} className={`inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${tone}`}>{children}</span>
);

export const StagePill: React.FC<{ stage?: ReportStage; returned?: boolean }> = ({ stage, returned }) =>
    !stage ? <Pill tone="m-fill m-text-3">Yazılmadı</Pill>
        : returned && stage !== 'approved' ? <Pill tone="m-tone-bad">İade edildi · {STAGE_LABELS[stage]}</Pill>
            : <Pill tone={STAGE_TONE[stage]}>{STAGE_LABELS[stage]}</Pill>;

export type NoticeState = { kind: 'ok' | 'error' | 'info'; text: string } | null;

export const Notice: React.FC<{ notice: NoticeState; onClose: () => void }> = ({ notice, onClose }) =>
    notice ? (
        <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${notice.kind === 'error' ? 'm-tone-bad' : notice.kind === 'ok' ? 'm-tone-ok' : 'm-tone-accent'}`}>
            <span className="flex-1 text-[15px]">{notice.text}</span>
            <button type="button" className="m-icon-btn" aria-label="Kapat" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
    ) : null;

export const downloadFile = (name: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const copyText = async (text: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
};

/** Raporu yeni pencerede açıp yazdırma (PDF olarak kaydetme) iletişimini başlatır */
export const printHtml = (html: string): boolean => {
    const w = window.open('', '_blank');
    if (!w) return false;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
    return true;
};

export const EmptyState: React.FC<{ icon?: string; title: string; children?: React.ReactNode; tone?: string }> = ({ icon = 'inbox', title, children, tone = 'm-tone-accent' }) => (
    <div className="m-surface rounded-2xl px-5 py-12 flex flex-col items-center gap-2 text-center">
        <span className={`w-11 h-11 rounded-full ${tone} flex items-center justify-center`}><Icon name={icon} size={22} /></span>
        <span className="text-[17px] font-semibold m-text">{title}</span>
        {children}
    </div>
);
