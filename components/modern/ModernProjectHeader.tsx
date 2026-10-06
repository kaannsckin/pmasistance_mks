import React, { useState } from 'react';
import { Project, ProjectStatus, RagStatus, View } from '../../types';
import { Icon, IconName } from './icons';

/**
 * Proje ekranlarının üst kısmı: geri (Portföy), başlık, durum, eylemler ve
 * tek satırlık görünüm seçici. Az kullanılanlar "Diğer" menüsündedir.
 */

export const RAG_TONE: Record<RagStatus, { label: string; tone: string }> = {
    green: { label: 'Yolunda', tone: 'm-tone-ok' },
    amber: { label: 'Riskli', tone: 'm-tone-warn' },
    red: { label: 'Kritik', tone: 'm-tone-bad' },
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
    devam: 'Devam ediyor',
    teklif: 'Teklif aşaması',
    beklemede: 'Beklemede',
    tamamlandi: 'Tamamlandı',
};

interface Tab { view: View; label: string }
interface MoreItem { key: string; label: string; icon: IconName; view?: View; run?: () => void }

interface ModernProjectHeaderProps {
    project: Project;
    ownerName?: string;
    currentView: View;
    onNavigate: (view: View) => void;
    onBack: () => void;
    exec: boolean;
    aiEnabled: boolean;
    onStatusReport: () => void;
    onNewTask: () => void;
    onOpenWorkPackages: () => void;
}

const TABS: Tab[] = [
    { view: View.Overview, label: 'Genel bakış' },
    { view: View.Roadmap, label: 'Pano' },
    { view: View.Tasks, label: 'Liste' },
    { view: View.Kanban, label: 'Zaman çizelgesi' },
    { view: View.Risks, label: 'Riskler' },
    { view: View.Resources, label: 'Ekip' },
];

const fmt = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const ModernProjectHeader: React.FC<ModernProjectHeaderProps> = ({ project, ownerName, currentView, onNavigate, onBack, exec, aiEnabled, onStatusReport, onNewTask, onOpenWorkPackages }) => {
    const [moreOpen, setMoreOpen] = useState(false);

    const more: MoreItem[] = [
        { key: 'goals', label: 'Hedefler', icon: 'target', view: View.Goals },
        ...(!exec ? [
            { key: 'requests', label: 'Müşteri istekleri', icon: 'inbox' as IconName, view: View.Requests },
            { key: 'notes', label: 'Günlük', icon: 'pen' as IconName, view: View.Notes },
        ] : []),
        { key: 'wp', label: 'İş paketleri', icon: 'briefcase', run: onOpenWorkPackages },
        ...(aiEnabled ? [{ key: 'ai', label: 'Asistan (tam ekran)', icon: 'message' as IconName, view: View.AI }] : []),
    ];
    const moreActive = more.find(m => m.view === currentView);

    const start = fmt(project.settings.projectStartDate);
    const rag = project.rag ? RAG_TONE[project.rag] : undefined;
    const meta = [ownerName || 'Sahip atanmadı', project.code, start ? `Başlangıç ${start}` : ''].filter(Boolean).join(' · ');

    return (
        <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col gap-1">
                <button type="button" onClick={onBack} className="self-start inline-flex items-center min-h-[44px] -ml-2 pr-2 rounded-xl text-[17px] m-accent">
                    <Icon name="chevronLeft" size={24} strokeWidth={2.2} />
                    Portföy
                </button>
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0 flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="m-0 text-[34px] leading-tight font-bold tracking-[-0.02em] m-text">{project.name}</h1>
                            {rag && <span className={`inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold ${rag.tone}`}>{rag.label}</span>}
                            {!rag && <span className="inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold m-tone-hold">{PROJECT_STATUS_LABEL[project.status]}</span>}
                        </div>
                        <p className="m-0 text-[15px] m-text-3">{meta}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                        <button type="button" className="m-btn m-btn-gray" onClick={onStatusReport}>
                            <Icon name="report" size={18} />
                            Durum raporu
                        </button>
                        <button type="button" className="m-btn m-btn-primary" onClick={onNewTask}>
                            <Icon name="plus" size={18} strokeWidth={2.2} />
                            Yeni görev
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="m-segmented" role="tablist" aria-label="Proje görünümleri">
                    {TABS.map(t => (
                        <button
                            key={t.view}
                            type="button"
                            role="tab"
                            aria-selected={currentView === t.view}
                            className="m-segment"
                            onClick={() => onNavigate(t.view)}
                        >
                            {t.label}
                        </button>
                    ))}
                    <div className="relative">
                        <button
                            type="button"
                            className="m-segment"
                            aria-haspopup="menu"
                            aria-expanded={moreOpen}
                            aria-selected={!!moreActive}
                            onClick={() => setMoreOpen(o => !o)}
                        >
                            {moreActive ? moreActive.label : 'Diğer'}
                            <Icon name="chevronDown" size={16} strokeWidth={2} />
                        </button>
                        {moreOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} aria-hidden="true"></div>
                                <div role="menu" className="absolute left-0 top-full mt-2 w-60 m-surface m-pop rounded-2xl py-1.5 z-50">
                                    {more.map(m => (
                                        <button
                                            key={m.key}
                                            type="button"
                                            role="menuitem"
                                            onClick={() => { setMoreOpen(false); if (m.view !== undefined) onNavigate(m.view); else m.run?.(); }}
                                            className="m-row-link w-full flex items-center gap-3 min-h-[44px] px-3.5 text-[15px]"
                                        >
                                            <span className="m-text-3"><Icon name={m.icon} size={18} /></span>
                                            <span className="flex-1">{m.label}</span>
                                            {m.view === currentView && <span className="m-accent"><Icon name="check" size={18} strokeWidth={2.2} /></span>}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ModernProjectHeader;
