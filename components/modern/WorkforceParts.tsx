import React, { useMemo } from 'react';
import { Person, Project, Task, TitleDef } from '../../types';
import { buildWorkforce, HOURS_PER_DAY, needsWorklogRefresh } from '../../utils/workforce';
import { Icon } from './icons';

/** İş güçleri ekranlarının ortak biçimleri ve küçük parçaları */

export const fmtHours = (h: number): string => `${h.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa`;
export const fmtDays = (h: number): string => `${(h / HOURS_PER_DAY).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} gün`;
export const fmtCost = (v: number | null | undefined): string =>
    v === null || v === undefined ? '—' : v.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

export const initialsOfName = (name: string): string =>
    name.split(/[\s.]+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toLocaleUpperCase('tr-TR')).join('') || '?';

export const PersonBadge: React.FC<{ name: string; matched: boolean; size?: number }> = ({ name, matched, size = 32 }) => (
    <span
        aria-hidden="true"
        className={`rounded-full flex items-center justify-center font-semibold flex-none ${matched ? 'm-fill m-text' : 'm-tone-warn'}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
        {initialsOfName(name)}
    </span>
);

/**
 * Görev ayrıntısında "Harcanan süre (Jira)": bu kayıtta kim kaç saat çalışmış
 * ve maliyeti. Worklog henüz çekilmediyse bunu söyler.
 */
export const TaskWorklogSummary: React.FC<{ task: Task; project: Project; people: Person[]; titles: TitleDef[] }> = ({ task, project, people, titles }) => {
    const row = useMemo(
        () => (task.jiraWorklog ? buildWorkforce({ people, titles }, [{ ...project, tasks: [task] }]).records[0] : undefined),
        [task, project, people, titles],
    );
    if (!task.jiraId) return null;
    const pending = needsWorklogRefresh(task);
    if (!task.jiraWorklog) {
        if (!task.actualHours) return null;
        return (
            <p className="m-0 text-[14px] m-text-3 flex items-center gap-2">
                <Icon name="clock" size={15} />Jira'da {fmtHours(task.actualHours)} harcanmış; kişi kırılımı bir sonraki eşitlemede gelecek.
            </p>
        );
    }
    return (
        <section aria-label="Harcanan süre (Jira worklog)" className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-semibold m-text-2">Harcanan süre (Jira) · {row ? `${row.people.length} kişi · ${fmtHours(row.hours)}` : 'kayıt yok'}</span>
                {row && row.cost > 0 && <span className="text-[13px] m-text-2 m-tabular">{fmtCost(row.cost)}{row.uncostedHours > 0 ? ` + ${fmtHours(row.uncostedHours)} maliyetsiz` : ''}</span>}
            </div>
            {row ? (
                <ul className="m-0 p-0 list-none m-surface rounded-xl px-3 py-1">
                    {row.people.map((p, i) => (
                        <li key={p.key} className={`flex items-center gap-2.5 py-2 ${i ? 'border-t m-sep' : ''}`} style={i ? { borderTopStyle: 'solid', borderTopWidth: 1 } : undefined}>
                            <PersonBadge name={p.name} matched={!!p.person} size={26} />
                            <span className="flex-1 min-w-0 truncate text-[14px] m-text">{p.name}{!p.person && <span className="ml-1.5 text-[12px] m-ink-warn">havuzda yok</span>}</span>
                            <span className="text-[14px] m-text m-tabular">{fmtHours(p.hours)}</span>
                            <span className="w-24 text-right text-[13px] m-text-3 m-tabular">{fmtCost(p.cost)}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="m-0 text-[14px] m-text-3">Bu kayıtta Jira'da worklog yok.</p>
            )}
            <span className="text-[12.5px] m-text-3">
                {pending ? 'Jira\'daki harcanan süre değişti; kırılım yenileniyor.' : `Jira'dan alındı: ${new Date(task.jiraWorklog.at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}`}
            </span>
        </section>
    );
};
