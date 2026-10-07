import React, { useState } from 'react';
import { Project, Task, TaskStatus } from '../../types';
import { calculatePertFuzzyPert } from '../../utils/timeline';
import { relativeTime } from '../../utils/recentChanges';
import { ISSUE_TYPE_LABELS, taskDurations } from '../../utils/planning/lifecycle';
import { daysLate, initialsOf, PRIORITY_META, shortDate, sprintLabel, TASK_STATUS_LABELS } from './taskMeta';
import { Sheet } from './ui';

/**
 * Modern görev ayrıntısı: durum hızlı değişir, alt görevler işaretlenir,
 * yorum eklenir. Görev canlı veriden gelir (yorum hemen görünür).
 */

interface TaskDetailSheetProps {
    task: Task;
    project: Project;
    /** Yorumlarda görünecek ad (aktif kimlik) */
    authorName: string;
    canEdit: boolean;
    onClose: () => void;
    onEdit: (task: Task) => void;
    onSave: (task: Task) => void;
}

const STATUSES: TaskStatus[] = [TaskStatus.Backlog, TaskStatus.ToDo, TaskStatus.InProgress, TaskStatus.Done];
const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

const TaskDetailSheet: React.FC<TaskDetailSheetProps> = ({ task, project, authorName, canEdit, onClose, onEdit, onSave }) => {
    const [comment, setComment] = useState('');
    const pred = task.predecessor ? project.tasks.find(t => t.id === task.predecessor) : undefined;
    const wp = task.workPackageId ? project.workPackages.find(w => w.id === task.workPackageId) : undefined;
    const objective = task.keyResultId ? project.objectives.find(o => o.keyResults.some(kr => kr.id === task.keyResultId)) : undefined;
    const kr = objective?.keyResults.find(k => k.id === task.keyResultId);
    const late = daysLate(task);
    const pert = task.time.avg > 0 ? calculatePertFuzzyPert(task.time).pert : 0;
    const subtasks = task.subtasks || [];
    const comments = task.comments || [];

    const addComment = () => {
        const text = comment.trim();
        if (!text) return;
        onSave({ ...task, comments: [...comments, { author: authorName, text, date: new Date().toISOString() }] });
        setComment('');
    };
    const toggleSub = (i: number) => onSave({ ...task, subtasks: subtasks.map((s, j) => (j === i ? { ...s, completed: !s.completed } : s)) });

    // Yaşam döngüsü: açılış → başlama → kapanış ve iş günü cinsinden süre
    const dur = taskDurations(task);
    const lifecycle = [
        task.createdAt ? `Açıldı ${shortDate(task.createdAt)}` : task.importedAt ? `İçe aktarıldı ${shortDate(task.importedAt)}` : '',
        task.startedAt ? `başladı ${shortDate(task.startedAt)}` : '',
        task.resolvedAt ? `kapandı ${shortDate(task.resolvedAt)}` : '',
    ].filter(Boolean).join(' · ');
    const closedIn = dur.cycleDays ?? dur.leadDays;
    const rows: [string, React.ReactNode][] = [
        ['Tür', task.issueType ? ISSUE_TYPE_LABELS[task.issueType] : '—'],
        ['Yaşam döngüsü', lifecycle ? <>{lifecycle}{closedIn !== null && <span className="ml-2 font-semibold">{closedIn} iş gününde {dur.cycleDays !== null ? 'tamamlandı' : 'kapandı'}</span>}{dur.reopened > 0 && <span className="ml-2 m-ink-warn">{dur.reopened} kez yeniden açıldı</span>}</> : <span className="m-text-3">Kayıt yok</span>],
        ['Sorumlu', task.resourceName || <span className="m-ink-warn">Atanmadı</span>],
        ['Birim', task.unit || '—'],
        ['Sürüm', sprintLabel(task.version, project.settings.sprintNames)],
        ['Termin', task.dueDate ? <>{shortDate(task.dueDate)}{late > 0 && <span className="ml-2 m-ink-bad font-semibold">{late} gün gecikti</span>}</> : '—'],
        ['Süre', pert > 0 ? `${num(pert)} gün (PERT) · ${task.time.best} / ${task.time.avg} / ${task.time.worst}${task.estimateSource === 'reference' ? ' · geçmiş kayıtlardan' : ''}` : <span className="m-ink-warn">Tahmin yok</span>],
        ...(task.forecast ? [['Açılış tahmini', <>
            {num(task.forecast.p50Days)}–{num(task.forecast.p80Days)} iş günü <span className="m-text-3">(benzer {task.forecast.n} kayıt)</span>
            {closedIn !== null && <span className={`ml-2 font-semibold ${closedIn <= task.forecast.p80Days ? 'm-ink-ok' : 'm-ink-warn'}`}>{closedIn <= task.forecast.p80Days ? 'aralıkta kapandı' : 'P80 aşıldı'}</span>}
        </>] as [string, React.ReactNode]] : []),
        ['Öncül', pred ? pred.name : task.predecessor ? 'Silinmiş görev' : '—'],
        ['İş paketi', wp?.name || '—'],
        ['Hedef', objective ? `${objective.name}${kr ? ` · ${kr.name}` : ''}` : '—'],
        ['Jira', task.jiraId ? `${task.jiraId}${task.fixVersion ? ` · ${task.fixVersion}` : ''}${task.storyPoints ? ` · ${task.storyPoints} SP` : ''}${task.actualHours ? ` · ${task.actualHours} sa harcandı` : ''}` : '—'],
        ['Planlama', task.includeInSprints !== false ? 'Sürüm planına dahil' : 'Sürüm planı dışında'],
    ];

    return (
        <Sheet
            title="Görev"
            onClose={onClose}
            wide
            footer={<>
                <span className="flex-1"></span>
                {canEdit && <button type="button" className="m-btn m-btn-gray" onClick={() => onEdit(task)}>Düzenle</button>}
                <button type="button" className="m-btn m-btn-primary" onClick={onClose}>Tamam</button>
            </>}
        >
            <div className="flex flex-col gap-2">
                <span className="text-[20px] leading-snug font-semibold m-text">{task.name}</span>
                <div className="flex flex-wrap gap-1.5">
                    <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold m-fill-2 ${PRIORITY_META[task.priority].ink}`}>{PRIORITY_META[task.priority].label} öncelik</span>
                    {(task.labels || []).map(l => <span key={l} className="inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold m-fill-2 m-text-2">{l}</span>)}
                </div>
            </div>

            {canEdit ? (
                <div className="m-segmented self-start" role="group" aria-label="Durum">
                    {STATUSES.map(s => (
                        <button key={s} type="button" className="m-segment" aria-pressed={task.status === s} onClick={() => task.status !== s && onSave({ ...task, status: s })}>{TASK_STATUS_LABELS[s]}</button>
                    ))}
                </div>
            ) : (
                <span className="self-start inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold m-tone-accent">{TASK_STATUS_LABELS[task.status]}</span>
            )}

            <dl className="m-0 grid gap-x-5 gap-y-2 text-[15px]" style={{ gridTemplateColumns: 'auto 1fr' }}>
                {rows.map(([k, v]) => (
                    <React.Fragment key={k}>
                        <dt className="m-text-3">{k}</dt>
                        <dd className="m-0 m-text min-w-0 break-words">{v}</dd>
                    </React.Fragment>
                ))}
            </dl>

            {task.notes && <p className="m-0 text-[15px] leading-relaxed m-text whitespace-pre-line rounded-xl m-fill-2 px-4 py-3">{task.notes}</p>}

            {subtasks.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold m-text-2">Alt görevler · {subtasks.filter(s => s.completed).length}/{subtasks.length}</span>
                    <div className="m-surface rounded-xl px-3 py-1">
                        {subtasks.map((s, i) => (
                            <label key={i} className={`flex items-center gap-3 min-h-[40px] text-[15px] ${canEdit ? 'cursor-pointer' : ''}`}>
                                <input type="checkbox" className="w-4 h-4" checked={s.completed} disabled={!canEdit} onChange={() => toggleSub(i)} />
                                <span className={s.completed ? 'm-text-3 line-through' : 'm-text'}>{s.text}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold m-text-2">Yorumlar · {comments.length}</span>
                {comments.length > 0 && (
                    <div className="flex flex-col gap-2.5">
                        {comments.map((c, i) => (
                            <div key={i} className="flex items-start gap-3">
                                <span aria-hidden="true" className="w-8 h-8 rounded-full m-fill flex items-center justify-center text-[12px] font-semibold m-text-2 flex-none">{initialsOf(c.author || '?')}</span>
                                <div className="flex-1 min-w-0 rounded-xl m-surface px-3.5 py-2.5">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="text-[14px] font-semibold m-text">{c.author}</span>
                                        <span className="text-[12px] m-text-3">{relativeTime(c.date)}</span>
                                    </div>
                                    <p className="m-0 mt-0.5 text-[15px] m-text whitespace-pre-line break-words">{c.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex gap-2">
                    <input aria-label="Yorum yaz" className="m-input flex-1" value={comment} placeholder="Yorum yazın…" onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addComment(); } }} />
                    <button type="button" className="m-btn m-btn-gray" disabled={!comment.trim()} onClick={addComment}>Gönder</button>
                </div>
            </div>
        </Sheet>
    );
};

export default TaskDetailSheet;
