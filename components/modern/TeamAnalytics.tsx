import React, { useMemo, useState } from 'react';
import { Person, Project, ProjectRoleDef, Task, TaskStatus, WorkflowConfig } from '../../types';
import { taskWorkflow } from '../../utils/workflow';
import { componentAnalytics, GroupStats, Insight, teamAnalytics } from '../../utils/teamAnalytics';
import { Icon } from './icons';
import TaskKeyButton from './TaskKeyButton';
import { daysLate } from './taskMeta';

/**
 * Ekip › Takımlar / Bileşenler: takım (proje rolü) ya da bileşen bazında
 * karşılaştırma tablosu, otomatik bulgular ve seçilen grubun kişi ve iş kırılımı.
 */

const num = (v: number, d = 1) => v.toLocaleString('tr-TR', { maximumFractionDigits: d });
const PERIODS = [14, 30, 90] as const;

const Spark: React.FC<{ values: number[]; label: string }> = ({ values, label }) => {
    const max = Math.max(1, ...values);
    const w = 72, h = 22, step = w / Math.max(1, values.length - 1);
    const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(' ');
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
            <polyline points={pts} fill="none" stroke="var(--m-accent)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
};

const TONE: Record<Insight['tone'], string> = { bad: 'm-ink-bad', warn: 'm-ink-warn', ok: 'm-ink-ok' };
const TONE_ICON: Record<Insight['tone'], 'alert' | 'info' | 'check'> = { bad: 'alert', warn: 'info', ok: 'check' };

const GROUP_COLS = 'minmax(150px,1.4fr) 44px minmax(110px,1fr) 64px 64px 56px 72px 96px 72px 64px 76px';

const TeamAnalytics: React.FC<{
    project: Project;
    roles: ProjectRoleDef[];
    people: Person[];
    mode: 'team' | 'component';
    onViewTask: (task: Task) => void;
    /** Takım üyeleri / bileşen listesi düzenleme (Proje ayarları) */
    onEditSetup?: () => void;
    /** Durum adları için projenin iş akışı */
    workflow?: WorkflowConfig;
}> = ({ project, roles, people, mode, onViewTask, onEditSetup, workflow }) => {
    const [period, setPeriod] = useState<(typeof PERIODS)[number]>(30);
    const [selected, setSelected] = useState<string | null>(null);
    const data = useMemo(() => (mode === 'team' ? teamAnalytics : componentAnalytics)(project, roles, people, { periodDays: period }), [mode, project, roles, people, period]);
    const rows = data.outside ? [...data.groups, data.outside] : data.groups;
    const current = rows.find(g => g.key === selected) || null;
    const noun = mode === 'team' ? 'takım' : 'bileşen';

    if (!data.groups.length) {
        return (
            <div className="m-surface rounded-2xl px-5 py-12 flex flex-col items-center gap-2 text-center">
                <span className="w-11 h-11 rounded-full m-tone-accent flex items-center justify-center"><Icon name={mode === 'team' ? 'users' : 'grid'} size={22} /></span>
                <span className="text-[17px] font-semibold m-text">{mode === 'team' ? 'Takım tanımlı değil' : 'Bileşen yok'}</span>
                <span className="text-[15px] m-text-3 max-w-[60ch]">{mode === 'team'
                    ? 'Takımlar proje rollerinden gelir (Geliştirici, Test, Analist…). Proje ayarları › Roller bölümünden kişileri rollere ekleyin; her takımın ilerlemesi, hızı, hata ve tahmin isabeti burada karşılaştırılır.'
                    : 'Görevlere bileşen atanınca (ya da Jira bileşenleri eşitlenince) her bileşenin ilerlemesi, hata yoğunluğu ve sorumlusu burada görünür.'}</span>
                {onEditSetup && <button type="button" className="m-btn m-btn-primary mt-1" onClick={onEditSetup}><Icon name="users" size={18} />{mode === 'team' ? 'Rollere kişi ekle' : 'Bileşenleri düzenle'}</button>}
            </div>
        );
    }

    const header = (
        <div className="grid gap-2 px-3 py-2 text-[12px] font-semibold m-text-3" style={{ gridTemplateColumns: GROUP_COLS }}>
            <span>{mode === 'team' ? 'Takım' : 'Bileşen'}</span>
            <span className="text-right">Kişi</span>
            <span>İlerleme</span>
            <span className="text-right" title="Açık / süreçte">Açık</span>
            <span className="text-right">Geciken</span>
            <span className="text-right" title={`Son ${period} günde biten`}>Biten</span>
            <span className="text-right" title="Açık efor (gün)">Açık efor</span>
            <span className="text-right" title={`Açık hata · son ${period} günde açılan / kapanan`}>Hata</span>
            <span className="text-right" title="Ortanca kapanma süresi">Kapanma</span>
            <span className="text-right" title="Ortanca gerçekleşen ÷ tahmin">Tahmin</span>
            <span title="Son 8 hafta biten">8 hafta</span>
        </div>
    );

    const row = (g: GroupStats) => {
        const active = g.key === selected;
        return (
            <button key={g.key} type="button" aria-pressed={active} onClick={() => setSelected(active ? null : g.key)}
                className={`grid gap-2 items-center w-full text-left px-3 py-2.5 rounded-xl border-0 cursor-pointer ${active ? 'm-tone-accent' : 'bg-transparent'} m-text`}
                style={{ gridTemplateColumns: GROUP_COLS }}>
                <span className="min-w-0 flex flex-col">
                    <span className="text-[15px] font-semibold truncate">{g.name}</span>
                    <span className="text-[12px] m-text-3 truncate">{g.kind === 'component' ? (g.lead ? `Sorumlu: ${g.lead}` : g.teams?.length ? g.teams.map(t => t.name).join(', ') : '—') : g.members.slice(0, 3).join(', ') + (g.members.length > 3 ? ` +${g.members.length - 3}` : '')}</span>
                </span>
                <span className="text-right text-[14px] m-tabular">{g.members.length}</span>
                <span className="flex items-center gap-2" title={`${g.done} / ${g.total} tamamlandı`}>
                    <span aria-hidden="true" className="flex-1 h-1.5 rounded-full m-fill overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${g.progressPct}%`, background: g.progressPct === 100 ? 'var(--m-ok)' : 'var(--m-accent)' }}></span></span>
                    <span className="text-[13px] m-tabular w-9 text-right">%{g.progressPct}</span>
                </span>
                <span className="text-right text-[14px] m-tabular">{g.open}<span className="m-text-3"> / {g.inProgress}</span></span>
                <span className={`text-right text-[14px] m-tabular ${g.overdue ? 'm-ink-bad font-semibold' : 'm-text-3'}`}>{g.overdue || '—'}</span>
                <span className="text-right text-[14px] m-tabular">{g.doneInPeriod}</span>
                <span className="text-right text-[14px] m-tabular">{num(g.openEffort)} g</span>
                <span className="text-right text-[13px] m-tabular"><span className={g.bugsOpen ? 'font-semibold' : 'm-text-3'}>{g.bugsOpen}</span><span className="m-text-3"> · +{g.bugsOpened}/−{g.bugsClosed}</span></span>
                <span className="text-right text-[14px] m-tabular">{g.leadTimeDays === null ? '—' : `${num(g.leadTimeDays)} g`}</span>
                <span className={`text-right text-[14px] m-tabular ${g.estimateRatio !== null && g.estimateRatio >= 1.3 ? 'm-ink-warn font-semibold' : ''}`}>{g.estimateRatio === null ? '—' : `×${num(g.estimateRatio, 2)}`}</span>
                <Spark values={g.weekly} label={`${g.name}: son 8 hafta biten ${g.weekly.join(', ')}`} />
            </button>
        );
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
                <div className="m-segmented" role="group" aria-label="Dönem">
                    {PERIODS.map(p => <button key={p} type="button" className="m-segment" aria-pressed={period === p} onClick={() => setPeriod(p)}>Son {p} gün</button>)}
                </div>
                <span className="text-[14px] m-text-3">{data.groups.length} {noun} · ilerleme durum yüzdeleriyle; satıra tıklayınca ayrıntı açılır</span>
                <span className="flex-1"></span>
                {onEditSetup && <button type="button" className="m-btn m-btn-gray !min-h-[36px] !px-3 text-[14px]" onClick={onEditSetup}><Icon name="pencil" size={15} />{mode === 'team' ? 'Takım üyeleri' : 'Bileşenler'}</button>}
            </div>

            {data.insights.length > 0 && (
                <section aria-label="Bulgular" className="m-surface rounded-2xl p-3 flex flex-col gap-1.5">
                    <h3 className="m-0 px-1 text-[15px] font-semibold m-text flex items-center gap-2"><Icon name="sparkles" size={16} />Bulgular</h3>
                    {data.insights.slice(0, 8).map((x, i) => (
                        <button key={i} type="button" onClick={() => x.groupKey && setSelected(x.groupKey)} className="flex items-start gap-2 text-left px-1 py-1 rounded-lg bg-transparent border-0 cursor-pointer m-text text-[14px]">
                            <span className={`${TONE[x.tone]} mt-0.5 flex-none`}><Icon name={TONE_ICON[x.tone]} size={15} /></span>{x.text}
                        </button>
                    ))}
                </section>
            )}

            <section aria-label={`${noun} karşılaştırması`} className="m-surface rounded-2xl p-1.5 overflow-x-auto">
                <div style={{ minWidth: 960 }}>
                    {header}
                    {rows.map(row)}
                </div>
            </section>

            {current && <GroupDetail g={current} period={period} onViewTask={onViewTask} workflow={workflow} />}
        </div>
    );
};

const GroupDetail: React.FC<{ g: GroupStats; period: number; onViewTask: (t: Task) => void; workflow?: WorkflowConfig }> = ({ g, period, onViewTask, workflow }) => {
    const [showAll, setShowAll] = useState(false);
    const now = new Date();
    const open = g.tasks.filter(t => t.status !== TaskStatus.Done)
        .sort((a, b) => daysLate(b, now) - daysLate(a, now) || (a.priority === 'Blocker' ? -1 : 0) - (b.priority === 'Blocker' ? -1 : 0) || (a.dueDate || '9').localeCompare(b.dueDate || '9'));
    const list = showAll ? open : open.slice(0, 12);
    return (
        <section aria-label={`${g.name} ayrıntısı`} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <div className="m-surface rounded-2xl p-3 flex flex-col gap-2">
                <h3 className="m-0 px-1 text-[15px] font-semibold m-text">{g.name}: kişiler</h3>
                {g.memberStats.length === 0 && <p className="m-0 px-1 text-[14px] m-text-3">Atanmış iş yok.</p>}
                <div className="grid gap-2 px-1 text-[12px] font-semibold m-text-3" style={{ gridTemplateColumns: 'minmax(120px,1fr) 52px 60px 60px 70px' }}>
                    <span>Kişi</span><span className="text-right">Açık</span><span className="text-right">Geciken</span><span className="text-right" title={`Son ${period} gün`}>Biten</span><span className="text-right">Açık efor</span>
                </div>
                {g.memberStats.map(m => {
                    const share = g.openEffort ? m.openEffort / g.openEffort : 0;
                    return (
                        <div key={m.name} className="grid gap-2 items-center px-1 py-1 border-t m-sep text-[14px]" style={{ gridTemplateColumns: 'minmax(120px,1fr) 52px 60px 60px 70px', borderTopStyle: 'solid', borderTopWidth: 1 }}>
                            <span className="min-w-0 flex flex-col gap-1">
                                <span className="truncate m-text">{m.name}</span>
                                <span aria-hidden="true" className="h-1 rounded-full m-fill overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.round(share * 100)}%`, background: share >= 0.45 && g.members.length > 1 ? 'var(--m-warn)' : 'var(--m-accent)' }}></span></span>
                            </span>
                            <span className="text-right m-tabular">{m.open}</span>
                            <span className={`text-right m-tabular ${m.overdue ? 'm-ink-bad font-semibold' : 'm-text-3'}`}>{m.overdue || '—'}</span>
                            <span className="text-right m-tabular">{m.doneInPeriod}</span>
                            <span className="text-right m-tabular">{num(m.openEffort)} g</span>
                        </div>
                    );
                })}
                {g.teams && g.teams.length > 0 && <p className="m-0 px-1 pt-1 text-[13px] m-text-3">Çalışan takımlar: {g.teams.map(t => `${t.name} (${t.count})`).join(', ')}</p>}
            </div>
            <div className="m-surface rounded-2xl p-3 flex flex-col gap-1">
                <h3 className="m-0 px-1 pb-1 text-[15px] font-semibold m-text">Açık işler ({open.length})</h3>
                {open.length === 0 && <p className="m-0 px-1 text-[14px] m-text-3">Açık iş yok.</p>}
                {list.map(t => {
                    const late = daysLate(t, now);
                    return (
                        <div key={t.id} className="flex items-center gap-2.5 px-1 py-1.5 border-t m-sep" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                            <TaskKeyButton task={t} onOpen={() => onViewTask(t)} />
                            <span className="flex-1 min-w-0 flex flex-col">
                                <span className="text-[14px] m-text truncate">{t.name}</span>
                                <span className="text-[12px] m-text-3 truncate">{[taskWorkflow(t, workflow).label, t.resourceName, t.priority === 'Blocker' ? 'Blocker' : ''].filter(Boolean).join(' · ')}</span>
                            </span>
                            {late > 0 && <span className="text-[12px] font-semibold m-ink-bad whitespace-nowrap">{late} gün gecikti</span>}
                        </div>
                    );
                })}
                {open.length > list.length && <button type="button" className="m-btn m-btn-plain self-start !min-h-[32px] text-[14px]" onClick={() => setShowAll(true)}>Tümünü göster ({open.length})</button>}
            </div>
        </section>
    );
};

export default TeamAnalytics;
