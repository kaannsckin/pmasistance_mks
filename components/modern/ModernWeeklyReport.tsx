import React, { useEffect, useMemo, useState } from 'react';
import { ReportSettings, WeeklyReport, WorkspaceData } from '../../types';
import { isPmoRole } from '../../utils/healthModel';
import { fetchIntegrationHealth, IntegrationHealth } from '../../utils/integrations';
import { Identity, isExecViewer, managedDepartmentCode, ownsProject } from '../../utils/rbac';
import { relativeTime } from '../../utils/recentChanges';
import {
    actorOf, createReport, dueDate, findReport, isoWeekOf, isPyds, isWeekPublished, latestPublication, lintCounts, lintReport, pendingAuthors,
    projectDepartment, reportDictionary, reportSettingsOf, shiftWeek, STAGE_LABELS, visibleReports, weekLabel, weekProgress,
} from '../../utils/weeklyReport';
import { Icon } from './icons';
import { rowSep } from './ui';
import ConsolidatedReport from './weekly/ConsolidatedReport';
import { ReminderPanel, ReportSettingsPanel } from './weekly/Panels';
import ReportEditor from './weekly/ReportEditor';
import { EmptyState, Notice, NoticeState, Pill, STAGE_TONE, StagePill } from './weekly/shared';

/**
 * Haftalık rapor. PY projesinin raporunu (AI önerisi, notlar, worklog ve
 * görüşmelerden yararlanarak) yazar → bölüm sorumlusu düzenler, onaylar ve
 * bölüm eklemelerini yazar → PYB destek formatı denetler, haftayı yayınlar ve
 * müdürlere gönderir. Müdür / PYB sorumlusu yayınlanan enstitü raporunu bölüm
 * bazında okur (bilgilerine sunulur). PY rapora proje sağlığı puanını, PMO
 * (PYB sorumlusu / PYB destek) birleşik raporda kendi puanını verir.
 */

export interface ModernWeeklyReportProps {
    workspace: WorkspaceData;
    identity: Identity;
    onSaveReport: (r: WeeklyReport) => boolean;
    onAdvanceReport: (r: WeeklyReport) => boolean;
    onReturnReport: (reportId: string, note: string) => boolean;
    onPublishWeek: (year: number, week: number) => boolean;
    onUnpublishWeek: (year: number, week: number) => boolean;
    onMarkEmailed: (year: number, week: number) => void;
    onUpdateSettings: (s: ReportSettings) => void;
    onSetJiraKey: (projectId: string, key: string) => void;
    onOpenMeetings: () => void;
    /** PMO puanı (PYB sorumlusu / PYB destek): proje × hafta, 1–10 ya da null = kaldır */
    onRatePmo: (projectId: string, year: number, week: number, score: number | null, note?: string) => boolean;
}

type Tab = 'mine' | 'inbox' | 'status' | 'report' | 'settings';

interface Row {
    key: string;
    title: string;
    sub: string;
    report?: WeeklyReport;
    open: () => void;
}

const ReportRows: React.FC<{ rows: Row[]; dictionary: ReturnType<typeof reportDictionary> }> = ({ rows, dictionary }) => (
    <div className="m-surface rounded-2xl p-1.5">
        {rows.map((r, i) => {
            const sep = rowSep(i);
            const c = r.report ? lintCounts(lintReport(r.report, dictionary)) : null;
            return (
                <button key={r.key} type="button" onClick={r.open} className={`m-row-link flex items-center gap-3 px-3 py-3 min-h-[64px] ${sep.className}`} style={sep.style}>
                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span className="text-[16px] font-semibold m-text truncate">{r.title}</span>
                        <span className="text-[13px] m-text-3 truncate">
                            {[r.sub, r.report ? `${r.report.thisWeek.length} gelişme · ${r.report.nextWeek.length} plan` : '', r.report ? relativeTime(r.report.updatedAt) : ''].filter(Boolean).join(' · ')}
                        </span>
                    </span>
                    {c && c.errors > 0 && <span className="hidden sm:inline-flex"><Pill tone="m-tone-bad">{c.errors} hata</Pill></span>}
                    {c && !c.errors && c.warnings > 0 && <span className="hidden sm:inline-flex"><Pill tone="m-tone-warn">{c.warnings} uyarı</Pill></span>}
                    <StagePill stage={r.report?.stage} returned={!!r.report?.returnNote} />
                    <span style={{ color: 'var(--m-chevron)' }}><Icon name="chevronRight" size={16} strokeWidth={2.2} /></span>
                </button>
            );
        })}
    </div>
);

const ModernWeeklyReport: React.FC<ModernWeeklyReportProps> = ({
    workspace, identity, onSaveReport, onAdvanceReport, onReturnReport, onPublishWeek, onUnpublishWeek, onMarkEmailed, onUpdateSettings, onSetJiraKey, onOpenMeetings, onRatePmo,
}) => {
    const role = identity.role;
    const exec = isExecViewer(role);
    const steward = isPyds(role);
    const bs = role === 'bolum_sorumlu';
    const dept = bs ? managedDepartmentCode(workspace, identity) : undefined;

    const [wk, setWk] = useState(() => {
        const latest = latestPublication(workspace);
        return exec && latest ? { year: latest.year, week: latest.week } : isoWeekOf(new Date());
    });
    const [tab, setTab] = useState<Tab>(exec ? 'report' : steward || bs ? 'inbox' : 'mine');
    const [open, setOpen] = useState<WeeklyReport | null>(null);
    const [notice, setNotice] = useState<NoticeState>(null);
    const [health, setHealth] = useState<IntegrationHealth | null>(null);

    useEffect(() => {
        const c = new AbortController();
        fetchIntegrationHealth(c.signal).then(setHealth).catch(() => undefined);
        return () => c.abort();
    }, []);

    const { year, week } = wk;
    const settings = useMemo(() => reportSettingsOf(workspace), [workspace]);
    const dictionary = useMemo(() => reportDictionary(settings), [settings]);
    const reports = useMemo(() => visibleReports(workspace, identity).filter(r => r.year === year && r.week === week), [workspace, identity, year, week]);
    const published = isWeekPublished(workspace, year, week);
    const publication = (workspace.weeklyPublications || []).find(p => p.year === year && p.week === week);
    const current = isoWeekOf(new Date());
    const isCurrent = current.year === year && current.week === week;
    const due = dueDate(year, week, settings.dueWeekday);
    const peopleName = useMemo(() => new Map(workspace.people.map(p => [p.id, `${p.firstName} ${p.lastName}`.trim()])), [workspace.people]);

    const go = (delta: number) => { setWk(shiftWeek(year, week, delta)); setOpen(null); };
    const openNew = (init: Parameters<typeof createReport>[0]) => setOpen(createReport(init, actorOf(workspace)));

    // PY: kendi projeleri (aktif ya da bu hafta raporu olan)
    const myRows: Row[] = useMemo(() => {
        if (role !== 'py') return [];
        return workspace.projects
            .filter(p => ownsProject(p, identity) && (p.status === 'devam' || reports.some(r => r.projectId === p.id)))
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
            .map(p => {
                const r = findReport(reports, year, week, p.id);
                return {
                    key: p.id,
                    title: p.name,
                    sub: p.code || '',
                    report: r,
                    open: () => (r ? setOpen(r) : openNew({ kind: 'project', projectId: p.id, departmentCode: projectDepartment(workspace, p), year, week })),
                };
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role, workspace, identity, reports, year, week]);

    // BS / PYDS: onay bekleyenler
    const inbox = useMemo(() => reports.filter(r => (bs ? r.stage === 'bs_review' : steward ? r.stage === 'pyds_review' : false)), [reports, bs, steward]);
    const rowOf = (r: WeeklyReport): Row => {
        const p = r.projectId ? workspace.projects.find(x => x.id === r.projectId) : undefined;
        const deptName = workspace.departments.find(d => d.code === r.departmentCode)?.name || r.departmentCode;
        return {
            key: r.id,
            title: r.kind === 'department' ? `Bölüm eklemeleri — ${deptName}` : p?.name || 'Silinmiş proje',
            sub: [r.kind === 'project' ? deptName : '', p?.pmPersonId ? `PY: ${peopleName.get(p.pmPersonId) || ''}` : r.authorName].filter(Boolean).join(' · '),
            report: r,
            open: () => setOpen(r),
        };
    };

    // Bölüm / enstitü durumu
    const progress = useMemo(() => weekProgress(workspace, year, week).filter(d => !bs || d.code === dept), [workspace, year, week, bs, dept]);
    const pending = useMemo(() => {
        const all = pendingAuthors(workspace, year, week);
        if (!bs) return all;
        return all.filter(a => workspace.people.find(p => p.id === a.personId)?.departmentCode === dept);
    }, [workspace, year, week, bs, dept]);
    const deptRows: Row[] = useMemo(() => {
        if (!bs || !dept) return [];
        const projects = workspace.projects.filter(p => projectDepartment(workspace, p) === dept && (p.status === 'devam' || reports.some(r => r.projectId === p.id)));
        return projects.sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(p => {
            const r = findReport(reports, year, week, p.id);
            return r ? rowOf(r) : { key: p.id, title: p.name, sub: p.pmPersonId ? `PY: ${peopleName.get(p.pmPersonId) || ''}` : 'PY atanmamış', open: () => setNotice({ kind: 'info', text: `${p.name} raporu henüz yazılmadı; proje yöneticisine hatırlatabilirsiniz.` }) };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bs, dept, workspace, reports, year, week, peopleName]);
    const deptAdditions = bs && dept ? findReport(reports, year, week, undefined, 'department', dept) : undefined;

    // ---- düzenleyici açık
    if (open) {
        const live = (workspace.weeklyReports || []).find(r => r.id === open.id);
        return (
            <ReportEditor
                key={open.id}
                workspace={workspace}
                identity={identity}
                report={live || open}
                isNew={!live}
                dictionary={dictionary}
                health={health}
                onBack={() => setOpen(null)}
                onSave={(r: WeeklyReport) => onSaveReport(r)}
                onAdvance={(r: WeeklyReport) => {
                    const from = (live || open).stage;
                    const ok = onAdvanceReport(r);
                    if (ok) {
                        setOpen(null);
                        setNotice({ kind: 'ok', text: from === 'draft' ? (r.kind === 'department' ? 'PYB desteğe gönderildi.' : 'Bölüm sorumlusuna gönderildi.') : from === 'bs_review' ? 'Onaylandı, PYB desteğe gönderildi.' : 'Format onaylandı; hafta yayınlanmaya hazır.' });
                    }
                    return ok;
                }}
                onReturn={(note: string) => {
                    const ok = onReturnReport(open.id, note);
                    if (ok) { setOpen(null); setNotice({ kind: 'info', text: 'Rapor iade edildi.' }); }
                    return ok;
                }}
                onSetJiraKey={onSetJiraKey}
                onOpenMeetings={onOpenMeetings}
            />
        );
    }

    const tabs: { key: Tab; label: string; count?: number }[] = steward
        ? [{ key: 'inbox', label: 'Onay bekleyen', count: inbox.length }, { key: 'status', label: 'Hafta durumu' }, { key: 'report', label: 'Enstitü raporu' }, { key: 'settings', label: 'Ayarlar' }]
        : bs
            ? [{ key: 'inbox', label: 'Onay bekleyen', count: inbox.length }, { key: 'status', label: 'Bölüm durumu' }, { key: 'report', label: 'Bölüm raporu' }]
            : [];

    const myUnsent = myRows.filter(r => !r.report || r.report.stage === 'draft').length;
    const overdue = new Date() > new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59);

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-[70ch]">
                    <h1 className="m-0 text-[34px] leading-tight font-bold tracking-[-0.02em] m-text">Haftalık rapor</h1>
                    <p className="m-0 mt-1 text-[15px] m-text-3">
                        {exec ? 'Enstitü genelinde bu haftanın gelişmeleri ve gelecek hafta planları, bölüm bazında.'
                            : steward ? 'Bölüm sorumlularının onayladığı raporları formata göre denetleyin, haftayı yayınlayın ve müdürlere gönderin.'
                                : bs ? 'Bölümünüzün proje raporlarını düzenleyip onaylayın; bölüm genel gelişmelerini ekleyin.'
                                    : 'Projelerinizin haftalık raporunu yazın; AI önerisi notlarınızdan, worklog ve görüşmelerden taslak çıkarır.'}
                    </p>
                </div>
                <div className="flex items-center gap-1">
                    <button type="button" className="m-icon-btn" aria-label="Önceki hafta" onClick={() => go(-1)}><Icon name="chevronLeft" /></button>
                    <span className="min-w-[170px] text-center text-[15px] font-semibold m-text m-tabular">{weekLabel(year, week)}</span>
                    <button type="button" className="m-icon-btn" aria-label="Sonraki hafta" onClick={() => go(1)}><Icon name="chevronRight" /></button>
                    {!isCurrent && <button type="button" className="m-btn m-btn-plain !min-h-[40px]" onClick={() => { setWk(current); setOpen(null); }}>Bu hafta</button>}
                </div>
            </header>

            {!exec && published && (
                <div role="status" className="rounded-2xl px-4 py-3 m-tone-ok flex items-center gap-3 text-[15px]">
                    <Icon name="check" size={18} strokeWidth={2.4} />
                    Bu hafta yayınlandı{publication?.publishedByName ? ` (${publication.publishedByName})` : ''}; raporlar kilitli.
                </div>
            )}
            {role === 'py' && !published && myUnsent > 0 && (
                <div role="status" className={`rounded-2xl px-4 py-3 flex items-center gap-3 text-[15px] ${overdue ? 'm-tone-bad' : 'm-tone-warn'}`}>
                    <Icon name="clock" size={18} />
                    {overdue ? 'Son gün geçti: ' : 'Son gün: '}
                    {due.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} — {myUnsent} proje raporu henüz bölüm sorumlusuna gönderilmedi.
                </div>
            )}
            <Notice notice={notice} onClose={() => setNotice(null)} />

            {tabs.length > 0 && (
                <div className="m-segmented self-start" role="group" aria-label="Görünüm">
                    {tabs.map(t => (
                        <button key={t.key} type="button" className="m-segment" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
                            {t.label}{t.count !== undefined && <span className="m-text-3 m-tabular">{t.count}</span>}
                        </button>
                    ))}
                </div>
            )}

            {/* PY: projelerim */}
            {role === 'py' && (
                !identity.personId ? (
                    <EmptyState icon="users" title="Kişi seçilmedi"><span className="text-[15px] m-text-3">Rapor yazmak için profil menüsünden kendinizi seçin.</span></EmptyState>
                ) : myRows.length === 0 ? (
                    <EmptyState icon="report" title="Sahibi olduğunuz aktif proje yok"><span className="text-[15px] m-text-3 max-w-[52ch]">Haftalık rapor, proje yöneticisi olduğunuz devam eden projeler için yazılır.</span></EmptyState>
                ) : <ReportRows rows={myRows} dictionary={dictionary} />
            )}

            {/* BS / PYDS: onay bekleyen */}
            {(bs || steward) && tab === 'inbox' && (
                bs && !dept ? (
                    <EmptyState icon="users" title="Bölüm belirlenemedi"><span className="text-[15px] m-text-3">Profil menüsünden kendinizi seçin; bölümünüz kişi kaydınızdan alınır.</span></EmptyState>
                ) : inbox.length === 0 ? (
                    <EmptyState icon="check" tone="m-tone-ok" title="Onay bekleyen rapor yok">
                        <span className="text-[15px] m-text-3 max-w-[52ch]">{bs ? 'Proje yöneticileri raporlarını gönderdikçe burada görünür.' : 'Bölüm sorumluları onayladıkça raporlar burada format denetimine düşer.'}</span>
                    </EmptyState>
                ) : <ReportRows rows={inbox.map(rowOf)} dictionary={dictionary} />
            )}

            {/* Bölüm / hafta durumu + hatırlatma */}
            {(bs || steward) && tab === 'status' && (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
                    <div className="flex flex-col gap-5 min-w-0">
                        {bs && dept && (
                            <>
                                <section aria-label="Bölüm eklemeleri" className="flex flex-col gap-2">
                                    <h2 className="m-0 text-[15px] font-semibold m-text-2">Bölüm genel gelişmeleri</h2>
                                    <ReportRows
                                        dictionary={dictionary}
                                        rows={[deptAdditions ? { ...rowOf(deptAdditions), sub: 'Projelere bağlı olmayan bölüm gelişmeleri (sözleşme, fuar, İG görüşmeleri)' } : {
                                            key: 'dept-new',
                                            title: 'Bölüm eklemeleri',
                                            sub: 'Projelere bağlı olmayan bölüm gelişmeleri (sözleşme, fuar, İG görüşmeleri)',
                                            open: () => openNew({ kind: 'department', departmentCode: dept, year, week }),
                                        }]}
                                    />
                                </section>
                                <section aria-label="Projeler" className="flex flex-col gap-2">
                                    <h2 className="m-0 text-[15px] font-semibold m-text-2">Projeler <span className="m-text-3 font-normal m-tabular">{deptRows.length}</span></h2>
                                    {deptRows.length ? <ReportRows rows={deptRows} dictionary={dictionary} /> : <EmptyState icon="report" title="Bölümde aktif proje yok" />}
                                </section>
                            </>
                        )}
                        {steward && (
                            progress.length === 0 ? <EmptyState icon="report" title="Aktif proje yok" /> : (
                                <div className="m-surface rounded-2xl p-1.5">
                                    {progress.map((d, i) => {
                                        const sep = rowSep(i);
                                        const sent = d.expected - d.missing.length - d.byStage.draft;
                                        return (
                                            <div key={d.code || 'none'} className={`flex flex-col gap-2 px-3 py-3 ${sep.className}`} style={sep.style}>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="flex-1 min-w-0 text-[16px] font-semibold m-text truncate">{d.name}{d.code && d.name !== d.code ? <span className="m-text-3 font-normal"> ({d.code})</span> : null}</span>
                                                    <span className="text-[14px] m-text-3 m-tabular">{sent}/{d.expected} gönderildi</span>
                                                </div>
                                                <div className="h-2 rounded-full m-fill overflow-hidden flex" aria-hidden="true">
                                                    {(['approved', 'pyds_review', 'bs_review', 'draft'] as const).map(s => d.byStage[s] > 0 && (
                                                        <span key={s} style={{ width: `${(d.byStage[s] / Math.max(1, d.expected)) * 100}%`, background: s === 'approved' ? 'var(--m-ok)' : s === 'pyds_review' ? 'var(--m-accent)' : s === 'bs_review' ? 'var(--m-warn)' : 'var(--m-label-3)' }}></span>
                                                    ))}
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {(['approved', 'pyds_review', 'bs_review', 'draft'] as const).map(s => d.byStage[s] > 0 && <Pill key={s} tone={STAGE_TONE[s]}>{STAGE_LABELS[s]}: {d.byStage[s]}</Pill>)}
                                                    {d.missing.length > 0 && <Pill tone="m-fill m-text-3" title={d.missing.map(m => m.name).join(', ')}>Yazılmadı: {d.missing.length}</Pill>}
                                                </div>
                                                {d.missing.length > 0 && <span className="text-[13px] m-text-3">{d.missing.map(m => `${m.name}${m.pmName ? ` (${m.pmName})` : ''}`).join(' · ')}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )
                        )}
                    </div>
                    <ReminderPanel authors={published ? [] : pending} year={year} week={week} dueWeekday={settings.dueWeekday} health={health} />
                </div>
            )}

            {(exec || ((bs || steward) && tab === 'report')) && (
                bs && !dept ? null : (
                    <ConsolidatedReport
                        key={`${year}-${week}`}
                        workspace={workspace}
                        identity={identity}
                        year={year}
                        week={week}
                        dictionary={dictionary}
                        settings={settings}
                        health={health}
                        departmentCode={bs ? dept : undefined}
                        publication={publication}
                        onPublish={steward ? () => onPublishWeek(year, week) : undefined}
                        onUnpublish={steward ? () => onUnpublishWeek(year, week) : undefined}
                        onMarkEmailed={steward ? () => onMarkEmailed(year, week) : undefined}
                        onOpenReport={bs || steward ? (r: WeeklyReport) => setOpen(r) : undefined}
                        onRatePmo={isPmoRole(role) ? (projectId: string, score: number | null, note?: string) => onRatePmo(projectId, year, week, score, note) : undefined}
                    />
                )
            )}

            {steward && tab === 'settings' && (
                <ReportSettingsPanel settings={settings} reports={workspace.weeklyReports || []} health={health} onChange={onUpdateSettings} />
            )}
        </div>
    );
};

export default ModernWeeklyReport;
