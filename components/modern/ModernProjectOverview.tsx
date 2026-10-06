import React, { useEffect, useMemo, useState } from 'react';
import { Project, RagStatus, Task, View, WorkspaceData } from '../../types';
import { actorLabel } from '../../utils/audit';
import { getPlanLockStatus } from '../../utils/allocations';
import { defaultStatusMonth } from '../../utils/evm';
import { projectHealth } from '../../utils/executive';
import { currentSprint, deadlineLabel, objectiveProgress, overviewStats, teamLoad, upcomingDeadlines } from '../../utils/projectOverview';
import { recentChanges, relativeTime } from '../../utils/recentChanges';
import { riskBand, riskScore } from '../../utils/risks';
import { Icon, IconName } from './icons';
import { RAG_TONE } from './ModernProjectHeader';
import { RAG_DOT } from './ModernSidebar';
import { initialsOf, sprintLabel } from './taskMeta';
import { BAND_META, Card, LinkButton, rowSep } from './ui';

/**
 * Modern proje "Genel bakış" sekmesi. PM projeye girdiğinde tek ekranda:
 * sağlık ve ilerleme, aktif sürüm, haftalık durum, yaklaşan terminler,
 * riskler, ekip yükü ve hedefler. Her kart ilgili sekmeye götürür.
 */

interface ModernProjectOverviewProps {
    workspace: WorkspaceData;
    project: Project;
    canEdit: boolean;
    onNavigate: (view: View) => void;
    onViewTask: (task: Task) => void;
    onNewTask: () => void;
    onSetRag: (projectId: string, rag: RagStatus | undefined, note?: string) => void;
    onCelebrate: (message: string) => void;
}

const RAG_ORDER: RagStatus[] = ['green', 'amber', 'red'];
const dayMonth = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

const Bar: React.FC<{ parts: { value: number; color: string }[]; total: number; label?: string }> = ({ parts, total, label }) => (
    <span role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="flex h-2 rounded-full m-fill overflow-hidden">
        {total > 0 && parts.map((p, i) => p.value > 0 && <span key={i} style={{ width: `${(p.value / total) * 100}%`, background: p.color }}></span>)}
    </span>
);

const EmptyLine: React.FC<{ children: React.ReactNode; ok?: boolean }> = ({ children, ok }) => (
    <div className="flex items-center gap-3 min-h-[44px]">
        {ok && <span className="w-8 h-8 rounded-[10px] m-tone-ok flex items-center justify-center flex-none"><Icon name="check" size={18} strokeWidth={2.2} /></span>}
        <span className={`text-[15px] ${ok ? 'm-text' : 'm-text-3'}`}>{children}</span>
    </div>
);

const ModernProjectOverview: React.FC<ModernProjectOverviewProps> = ({ workspace, project, canEdit, onNavigate, onViewTask, onNewTask, onSetRag, onCelebrate }) => {
    const now = new Date();
    const year = now.getFullYear();
    const health = useMemo(() => projectHealth(workspace, project, year, defaultStatusMonth(year)), [workspace, project, year]);
    const stats = useMemo(() => overviewStats(project), [project]);
    const sprint = useMemo(() => currentSprint(project), [project]);
    const deadlines = useMemo(() => upcomingDeadlines(project, new Date(), 5), [project]);
    const team = useMemo(() => teamLoad(project), [project]);
    const goals = useMemo(() => objectiveProgress(project), [project]);
    const risks = useMemo(
        () => (project.risks || []).filter(r => r.status !== 'closed').sort((a, b) => riskScore(b) - riskScore(a)).slice(0, 3),
        [project.risks],
    );
    const changes = useMemo(() => recentChanges(workspace, new Date(), 14).filter(c => c.projectId === project.id), [workspace, project.id]);
    const lockStatus = getPlanLockStatus(workspace.planLocks || [], project.id, year);
    const people = useMemo(() => new Map(workspace.people.map(p => [p.id, `${p.firstName} ${p.lastName}`.trim()])), [workspace.people]);

    // Haftalık durum (yalnız düzenleme yetkisi olan değiştirir)
    const [rag, setRag] = useState<RagStatus | undefined>(project.rag);
    const [note, setNote] = useState(project.ragNote || '');
    useEffect(() => { setRag(project.rag); setNote(project.ragNote || ''); }, [project.id, project.rag, project.ragNote]);
    const ragDirty = rag !== project.rag || note.trim() !== (project.ragNote || '').trim();

    const complete = stats.total > 0 && stats.done === stats.total;
    // Görevi ve haftalık durumu olmayan projede skor anlamsız
    const noHealthData = stats.total === 0 && !project.rag;
    const kpis: { key: string; label: string; value: React.ReactNode; note: string; noteTone: string; run?: () => void; hint?: string }[] = [
        {
            key: 'health',
            label: 'Proje sağlığı',
            value: noHealthData ? '—' : health.score,
            note: noHealthData ? 'Henüz veri yok' : [BAND_META[health.band].label, ...(health.band === 'good' ? [] : health.reasons.slice(0, 1))].join(' · '),
            noteTone: noHealthData ? 'm-text-3' : BAND_META[health.band].ink,
            hint: health.reasons.length ? `Skoru düşürenler: ${health.reasons.join(', ')}` : undefined,
        },
        {
            key: 'progress',
            label: 'İlerleme',
            value: complete ? <span className="inline-flex items-center gap-2">%100 <span className="m-accent"><Icon name="rocket" size={26} /></span></span> : `%${stats.progressPct}`,
            note: stats.total ? `${stats.done} / ${stats.total} görev tamamlandı` : 'Henüz görev yok',
            noteTone: complete ? 'm-ink-ok' : 'm-text-3',
            // Bitmiş projede küçük bir sürpriz: kutlama
            run: complete ? () => onCelebrate('Proje tamamlandı! Tebrikler.') : () => onNavigate(View.Roadmap),
            hint: complete ? 'Kutla' : 'Panoyu aç',
        },
        {
            key: 'overdue',
            label: 'Geciken görev',
            value: stats.overdue,
            note: stats.overdue ? 'Termini geçmiş, bitmemiş' : 'Gecikme yok',
            noteTone: stats.overdue ? 'm-ink-bad' : 'm-ink-ok',
            run: () => onNavigate(View.Tasks),
            hint: 'Listeyi aç',
        },
        {
            key: 'risks',
            label: 'Açık risk',
            value: stats.openRisks,
            note: stats.highRisks ? `${stats.highRisks} yüksek risk` : 'Yüksek risk yok',
            noteTone: stats.highRisks ? 'm-ink-bad' : 'm-text-3',
            run: () => onNavigate(View.Risks),
            hint: 'Riskleri aç',
        },
    ];

    const hints: { key: string; icon: IconName; text: string; run: () => void }[] = [
        ...(stats.missingEstimate ? [{ key: 'est', icon: 'clock' as IconName, text: `${stats.missingEstimate} görevin süre tahmini yok`, run: () => onNavigate(View.Tasks) }] : []),
        ...(team.unassigned ? [{ key: 'own', icon: 'users' as IconName, text: `${team.unassigned} görev kimseye atanmamış`, run: () => onNavigate(View.Tasks) }] : []),
        ...(lockStatus === 'submitted' ? [{ key: 'lock', icon: 'shield' as IconName, text: `${year} planı onay bekliyor`, run: () => onNavigate(View.Allocations) }] : []),
    ];

    const sprintTiming = (() => {
        if (!sprint) return null;
        if (sprint.done === sprint.total) return { text: 'Tamamlandı', tone: 'm-tone-ok' };
        if (now < sprint.start) return { text: `${dayMonth(sprint.start)} başlıyor`, tone: 'm-tone-hold' };
        if (sprint.daysLeft < 0) return { text: `${-sprint.daysLeft} gün geride`, tone: 'm-tone-bad' };
        if (sprint.daysLeft === 0) return { text: 'Bugün bitiyor', tone: 'm-tone-warn' };
        return { text: `${sprint.daysLeft} gün kaldı`, tone: sprint.daysLeft <= 3 ? 'm-tone-warn' : 'm-tone-accent' };
    })();

    const maxOpen = Math.max(1, ...team.members.map(m => m.open));
    const shownMembers = team.members.slice(0, 6);

    return (
        <div className="flex flex-col gap-5">
            <section aria-label="Göstergeler" className="grid gap-4 grid-cols-2 xl:grid-cols-4">
                {kpis.map(kp => {
                    const body = (
                        <>
                            <span className="text-[15px] m-text-3">{kp.label}</span>
                            <span className="text-[32px] leading-tight font-bold tracking-[-0.02em] m-tabular m-text">{kp.value}</span>
                            <span className={`text-[14px] ${kp.noteTone}`}>{kp.note}</span>
                        </>
                    );
                    return kp.run ? (
                        <button key={kp.key} type="button" onClick={kp.run} title={kp.hint} className="m-surface m-row-link rounded-2xl px-5 py-4 flex flex-col items-start gap-1 text-left">{body}</button>
                    ) : (
                        <div key={kp.key} title={kp.hint} className="m-surface rounded-2xl px-5 py-4 flex flex-col gap-1">{body}</div>
                    );
                })}
            </section>

            {hints.length > 0 && (
                <div className="flex flex-wrap gap-2" aria-label="Dikkat">
                    {hints.map(h => (
                        <button key={h.key} type="button" onClick={h.run} className="m-pill">
                            <span className="m-ink-warn"><Icon name={h.icon} size={16} /></span>
                            {h.text}
                        </button>
                    ))}
                </div>
            )}

            <div className="grid gap-5 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))' }}>
                {stats.total === 0 ? (
                    <Card title="Başlayalım" labelledBy="po-start" subtitle="Projede henüz görev yok">
                        <div className="flex flex-wrap gap-2.5">
                            <button type="button" className="m-btn m-btn-primary" onClick={onNewTask}><Icon name="plus" size={18} strokeWidth={2.2} />Yeni görev</button>
                            <button type="button" className="m-btn m-btn-gray" onClick={() => onNavigate(View.Tasks)}><Icon name="upload" size={18} />Excel'den aktar</button>
                            <button type="button" className="m-btn m-btn-gray" onClick={() => onNavigate(View.Resources)}><Icon name="users" size={18} />Ekibi tanımla</button>
                        </div>
                    </Card>
                ) : (
                    <Card title="Şu anki sürüm" labelledBy="po-sprint" action={<LinkButton onClick={() => onNavigate(sprint ? View.Roadmap : View.Kanban)}>{sprint ? 'Pano' : 'Zaman çizelgesi'}</LinkButton>}>
                        {!sprint ? (
                            <EmptyLine>Görevler henüz sürümlere dağıtılmamış.</EmptyLine>
                        ) : (
                            <div className="flex flex-col gap-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[22px] font-bold m-text">{sprint.label}</span>
                                    {sprintTiming && <span className={`inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold ${sprintTiming.tone}`}>{sprintTiming.text}</span>}
                                </div>
                                <span className="text-[14px] m-text-3">{dayMonth(sprint.start)} – {dayMonth(sprint.end)} · {sprint.total} görev</span>
                                <Bar
                                    total={sprint.total}
                                    label={`${sprint.label}: %${sprint.progressPct} tamamlandı`}
                                    parts={[{ value: sprint.done, color: 'var(--m-ok)' }, { value: sprint.inProgress, color: 'var(--m-accent)' }]}
                                />
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[14px] m-text-2">
                                    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: 'var(--m-ok)' }}></span>{sprint.done} tamamlandı</span>
                                    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: 'var(--m-accent)' }}></span>{sprint.inProgress} süreçte</span>
                                    <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-2 h-2 rounded-full m-fill" style={{ boxShadow: 'inset 0 0 0 1px var(--m-chevron)' }}></span>{sprint.total - sprint.done - sprint.inProgress} yapılacak</span>
                                </div>
                                {sprint.laterTasks > 0 && <span className="text-[14px] m-text-3">Sonraki sürümlerde {sprint.laterTasks} görev bekliyor</span>}
                            </div>
                        )}
                    </Card>
                )}

                <Card title="Haftalık durum" labelledBy="po-rag" subtitle={canEdit ? 'Yönetim ekranında bu görünür' : undefined}>
                    {canEdit ? (
                        <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); onSetRag(project.id, rag, note.trim()); }}>
                            <div className="m-segmented self-start" role="group" aria-label="Haftalık durum">
                                {RAG_ORDER.map(r => (
                                    <button key={r} type="button" className="m-segment" aria-pressed={rag === r} onClick={() => setRag(rag === r ? undefined : r)}>
                                        <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full" style={{ background: RAG_DOT[r] }}></span>
                                        {RAG_TONE[r].label}
                                    </button>
                                ))}
                            </div>
                            <label htmlFor="po-rag-note" className="sr-only">Durum notu</label>
                            <textarea
                                id="po-rag-note"
                                className="m-input py-2.5 resize-y"
                                rows={2}
                                placeholder="Bu hafta öne çıkan: ilerleme, engel, karar ihtiyacı…"
                                value={note}
                                onChange={e => setNote(e.target.value)}
                            />
                            {ragDirty && (
                                <div className="flex gap-2.5 justify-end">
                                    <button type="button" className="m-btn m-btn-plain" onClick={() => { setRag(project.rag); setNote(project.ragNote || ''); }}>Vazgeç</button>
                                    <button type="submit" className="m-btn m-btn-primary">Kaydet</button>
                                </div>
                            )}
                        </form>
                    ) : project.rag ? (
                        <div className="flex flex-col gap-2">
                            <span className={`self-start inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold ${RAG_TONE[project.rag].tone}`}>{RAG_TONE[project.rag].label}</span>
                            {project.ragNote && <p className="m-0 text-[15px] leading-relaxed m-text whitespace-pre-line">{project.ragNote}</p>}
                        </div>
                    ) : (
                        <EmptyLine>Proje yöneticisi bu hafta durum girmedi.</EmptyLine>
                    )}
                </Card>

                <Card
                    title="Yaklaşan terminler"
                    labelledBy="po-due"
                    action={<LinkButton onClick={() => onNavigate(View.Tasks)}>{deadlines.total > deadlines.items.length ? `Tümü (${deadlines.total})` : 'Liste'}</LinkButton>}
                >
                    {deadlines.items.length === 0 ? (
                        <EmptyLine>Terminli açık görev yok.</EmptyLine>
                    ) : (
                        <div className="-mx-2 flex flex-col">
                            {deadlines.items.map((d, i) => {
                                const sep = rowSep(i);
                                const tone = d.daysUntil < 0 ? 'm-tone-bad' : d.daysUntil <= 2 ? 'm-tone-warn' : 'm-tone-hold';
                                return (
                                    <button key={d.task.id} type="button" onClick={() => onViewTask(d.task)} className={`m-row-link flex items-center gap-3 px-2 py-2 min-h-[52px] ${sep.className}`} style={sep.style}>
                                        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                            <span className="text-[15px] m-text truncate">{d.task.name}</span>
                                            <span className="text-[13px] m-text-3 truncate">{[d.task.resourceName || 'Atanmadı', sprintLabel(d.task.version, project.settings.sprintNames)].join(' · ')}</span>
                                        </span>
                                        <span className={`inline-flex items-center h-7 px-2.5 rounded-full text-[13px] font-semibold whitespace-nowrap ${tone}`}>{deadlineLabel(d.daysUntil)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </Card>

                <Card title="Riskler" labelledBy="po-risks" action={<LinkButton onClick={() => onNavigate(View.Risks)}>{stats.openRisks > risks.length ? `Tümü (${stats.openRisks})` : 'Riskler'}</LinkButton>}>
                    {risks.length === 0 ? (
                        <EmptyLine ok>Açık risk yok.</EmptyLine>
                    ) : (
                        <div className="-mx-2 flex flex-col">
                            {risks.map((r, i) => {
                                const sep = rowSep(i);
                                const score = riskScore(r);
                                const band = riskBand(score);
                                const owner = (r.ownerPersonId && people.get(r.ownerPersonId)) || r.owner;
                                return (
                                    <button key={r.id} type="button" onClick={() => onNavigate(View.Risks)} className={`m-row-link flex items-center gap-3 px-2 py-2 min-h-[52px] ${sep.className}`} style={sep.style}>
                                        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                            <span className="text-[15px] m-text truncate">{r.title}</span>
                                            <span className="text-[13px] m-text-3 truncate">{[owner || 'Sahip yok', r.mitigation ? 'Aksiyon var' : 'Aksiyon yok'].join(' · ')}</span>
                                        </span>
                                        <span className={`inline-flex items-center h-7 px-2.5 rounded-full text-[13px] font-semibold m-tabular ${band === 'high' ? 'm-tone-bad' : band === 'medium' ? 'm-tone-warn' : 'm-tone-hold'}`} aria-label={`Risk skoru ${score}`}>{score}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </Card>

                <Card title="Ekip" labelledBy="po-team" subtitle="Kişi başına açık görev" action={<LinkButton onClick={() => onNavigate(View.Resources)}>Ekip</LinkButton>}>
                    {shownMembers.length === 0 ? (
                        <EmptyLine>Ekip tanımlı değil.</EmptyLine>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {shownMembers.map(m => (
                                <div key={m.name} className="flex items-center gap-3 min-h-[44px]">
                                    <span aria-hidden="true" className="w-8 h-8 rounded-full m-fill flex items-center justify-center text-[12px] font-semibold m-text-2 flex-none">{initialsOf(m.name)}</span>
                                    <span className="w-36 flex-none min-w-0 text-[15px] m-text truncate">{m.name}</span>
                                    <span className="flex-1">
                                        <Bar total={maxOpen} parts={[{ value: m.overdue, color: 'var(--m-bad)' }, { value: m.open - m.overdue, color: 'var(--m-accent)' }]} />
                                    </span>
                                    <span className="w-24 text-right text-[14px] m-tabular">
                                        <span className="m-text">{m.open} açık</span>
                                        {m.overdue > 0 && <span className="block text-[12px] m-ink-bad">{m.overdue} gecikmiş</span>}
                                    </span>
                                </div>
                            ))}
                            {team.members.length > shownMembers.length && <span className="text-[13px] m-text-3">ve {team.members.length - shownMembers.length} kişi daha</span>}
                        </div>
                    )}
                </Card>

                <Card title="Hedefler" labelledBy="po-goals" action={<LinkButton onClick={() => onNavigate(View.Goals)}>{goals.length ? 'Hedefler' : 'Hedef ekle'}</LinkButton>}>
                    {goals.length === 0 ? (
                        <EmptyLine>Hedef tanımlı değil.</EmptyLine>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {goals.slice(0, 4).map(g => (
                                <div key={g.id} className="flex flex-col gap-1.5">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="text-[15px] m-text truncate">{g.name}</span>
                                        <span className="text-[14px] font-semibold m-tabular m-text-2 whitespace-nowrap">{g.progressPct === null ? '—' : `%${g.progressPct}`}</span>
                                    </div>
                                    <Bar total={100} parts={[{ value: g.progressPct || 0, color: g.progressPct === 100 ? 'var(--m-ok)' : 'var(--m-accent)' }]} />
                                    <span className="text-[13px] m-text-3">{[g.quarter, `${g.keyResults} anahtar sonuç`, g.linkedTasks ? `${g.linkedTasks} bağlı görev` : 'Bağlı görev yok'].filter(Boolean).join(' · ')}</span>
                                </div>
                            ))}
                            {goals.length > 4 && <span className="text-[13px] m-text-3">ve {goals.length - 4} hedef daha</span>}
                        </div>
                    )}
                </Card>

                {changes.length > 0 && (
                    <Card title="Son değişiklikler" labelledBy="po-changes" subtitle="Son 14 gün">
                        <div className="flex flex-col gap-1">
                            {changes.slice(0, 5).map(c => (
                                <div key={c.id} className="flex flex-col py-1.5">
                                    <span className="text-[15px] m-text">{c.summary}</span>
                                    <span className="text-[13px] m-text-3">{actorLabel(c)} · {relativeTime(c.at)}</span>
                                </div>
                            ))}
                            {changes.length > 5 && <span className="text-[13px] m-text-3">ve {changes.length - 5} değişiklik daha</span>}
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default ModernProjectOverview;
