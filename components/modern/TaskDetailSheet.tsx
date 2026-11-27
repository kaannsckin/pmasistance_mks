import WorkflowSelect from './WorkflowSelect';
import { taskStatusLabel } from '../../utils/workflow';
import React, { useState } from 'react';
import { Person, Project, Task, TaskStatus, TitleDef, WorkflowConfig } from '../../types';
import { calculatePertFuzzyPert } from '../../utils/timeline';
import { relativeTime } from '../../utils/recentChanges';
import { ISSUE_TYPE_LABELS, taskDurations } from '../../utils/planning/lifecycle';
import { daysLate, initialsOf, PRIORITY_META, shortDate, sprintLabel, TASK_STATUS_LABELS } from './taskMeta';
import { JiraIssueRecord } from '../../utils/integrations';
import JiraIssuePanel from './JiraIssuePanel';
import TaskTimeTracking from './TaskTimeTracking';
import TaskJiraHistory from './TaskJiraHistory';
import TaskJiraWorklogs from './TaskJiraWorklogs';
import { TaskWorklogSummary } from './WorkforceParts';
import { Sheet } from './ui';
import { Icon } from './icons';
import { useAssistantOptional } from '../assistant/AssistantContext';
import { lastSprintOf, sprintSpanOf } from '../../utils/sprintSpan';
import { isProgressPercent, taskProgressPercent } from '../../utils/progress';

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
    /** Jira'daki hâli göreve uygular; verilirse Jira bölümü görünür (yalnız proje içeriğini düzenleyebilen) */
    onJiraPull?: (issue: JiraIssueRecord) => void;
    /** Projenin iş akışı (admin şeması): yalnız izin verilen geçişler */
    workflow?: WorkflowConfig;
    /** Harcanan süre (Jira worklog) kırılımı ve maliyeti için kişi havuzu ve ünvanlar */
    people?: Person[];
    titles?: TitleDef[];
    canViewProjectWorklogs?: boolean;
    worklogEmail?: string;
}

const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

const TaskDetailSheet: React.FC<TaskDetailSheetProps> = ({ task, project, authorName, canEdit, onClose, onEdit, onSave, onJiraPull, workflow, people, titles, canViewProjectWorklogs, worklogEmail }) => {
    const [comment, setComment] = useState('');
    const [tab, setTab] = useState<'detail' | 'history' | 'worklogs'>('detail');
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
        ['Sprint', sprintSpanOf(task) > 1 ? `${sprintLabel(task.version, project.settings.sprintNames)} → ${sprintLabel(lastSprintOf(task), project.settings.sprintNames)} (sprintler arası, ${sprintSpanOf(task)} sprint)` : sprintLabel(task.version, project.settings.sprintNames)],
        ...(task.fixVersion ? [['Hedef sürüm', task.fixVersion] as [string, React.ReactNode]] : []),
        ...(task.components?.length ? [['Bileşen', task.components.join(', ')] as [string, React.ReactNode]] : []),
        ...(task.resolution ? [['Çözüm', task.resolution] as [string, React.ReactNode]] : []),
        ['Termin', task.dueDate ? <>{shortDate(task.dueDate)}{late > 0 && <span className="ml-2 m-ink-bad font-semibold">{late} gün gecikti</span>}</> : '—'],
        ['Süre', pert > 0 ? `${num(pert)} gün (PERT) · ${task.time.best} / ${task.time.avg} / ${task.time.worst}${task.estimateSource === 'reference' ? ' · geçmiş kayıtlardan' : ''}` : <span className="m-ink-warn">Tahmin yok</span>],
        ['İlerleme', <>%{taskProgressPercent(task, project.progressModel?.weights)}<span className="m-text-3">{isProgressPercent(task.progressPct) && task.status !== TaskStatus.Done ? ' · elle girildi' : ' · durumdan otomatik'}</span></>],
        ...(task.estimateText ? [['Ekip tahmini', task.estimateText] as [string, React.ReactNode]] : []),
        ...(task.forecast ? [['Açılış tahmini', <>
            {num(task.forecast.p50Days)}–{num(task.forecast.p80Days)} iş günü <span className="m-text-3">(benzer {task.forecast.n} kayıt)</span>
            {closedIn !== null && <span className={`ml-2 font-semibold ${closedIn <= task.forecast.p80Days ? 'm-ink-ok' : 'm-ink-warn'}`}>{closedIn <= task.forecast.p80Days ? 'aralıkta kapandı' : 'P80 aşıldı'}</span>}
        </>] as [string, React.ReactNode]] : []),
        ['Öncül', pred ? pred.name : task.predecessor ? 'Silinmiş görev' : '—'],
        ['İş paketi', wp?.name || '—'],
        ['Hedef', objective ? `${objective.name}${kr ? ` · ${kr.name}` : ''}` : '—'],
        ['Jira', task.jiraId ? `${task.jiraId}${task.fixVersion ? ` · ${task.fixVersion}` : ''}${task.storyPoints ? ` · ${task.storyPoints} SP` : ''}${task.actualHours ? ` · ${task.actualHours} sa harcandı` : ''}` : '—'],
        ['Planlama', task.includeInSprints !== false ? 'Sprint planına dahil' : 'Sprint planı dışında'],
    ];

    const assistant = useAssistantOptional();
    const canAsk = !!assistant?.enabled && assistant.chatEnabled;
    return (
        <Sheet
            title="Görev"
            onClose={onClose}
            wide
            footer={<>
                {canAsk && (
                    <button type="button" className="m-btn m-btn-plain" title="Bu görevi asistana getir: açıklat, termin ya da atama öner"
                        onClick={() => { assistant!.askAbout({ projectId: project.id, taskId: task.id, label: [task.jiraId, task.name].filter(Boolean).join(' ') }); onClose(); }}>
                        <Icon name="sparkles" size={16} />Asistana sor
                    </button>
                )}
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

            {(task.jiraId || task.statusLog?.length) ? (
                <div role="group" aria-label="Görev görünümü" className="flex flex-wrap gap-2">
                    <button type="button" className={`m-btn ${tab === 'detail' ? 'm-btn-primary' : 'm-btn-gray'}`} aria-pressed={tab === 'detail'} onClick={() => setTab('detail')}>Ayrıntılar</button>
                    <button type="button" className={`m-btn ${tab === 'history' ? 'm-btn-primary' : 'm-btn-gray'}`} aria-pressed={tab === 'history'} onClick={() => setTab('history')}>Geçmiş</button>
                    {task.jiraId && <button type="button" className={`m-btn ${tab === 'worklogs' ? 'm-btn-primary' : 'm-btn-gray'}`} aria-pressed={tab === 'worklogs'} onClick={() => setTab('worklogs')}>Çalışma kayıtları</button>}
                </div>
            ) : null}
            {tab === 'history' ? <TaskJiraHistory key={task.id} task={task} /> : tab === 'worklogs' && task.jiraId ? <TaskJiraWorklogs issueKey={task.jiraId} canViewProject={!!canViewProjectWorklogs} email={worklogEmail} /> : <>
            {canEdit ? (
                <div className="flex items-center gap-2 self-start">
                    <span className="text-[13px] font-semibold m-text-2">Durum</span>
                    <WorkflowSelect className="m-input !w-auto !h-9 !py-0" value={task} tasks={project.tasks} workflow={workflow} from={task}
                        onChange={p => (p.status !== task.status || p.jiraStatus !== task.jiraStatus) && onSave({ ...task, ...p })} />
                    <span className="text-[12.5px] m-text-3">{TASK_STATUS_LABELS[task.status]}</span>
                </div>
            ) : (
                <span className="self-start inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold m-tone-accent" title={TASK_STATUS_LABELS[task.status]}>{taskStatusLabel(task, workflow)}</span>
            )}

            <dl className="m-0 grid gap-x-5 gap-y-2 text-[15px]" style={{ gridTemplateColumns: 'auto 1fr' }}>
                {rows.map(([k, v]) => (
                    <React.Fragment key={k}>
                        <dt className="m-text-3">{k}</dt>
                        <dd className="m-0 m-text min-w-0 break-words">{v}</dd>
                    </React.Fragment>
                ))}
            </dl>

            <TaskTimeTracking task={task} />
            {onJiraPull && task.jiraId && <JiraIssuePanel task={task} onPull={onJiraPull} />}
            {canViewProjectWorklogs && people && titles && <TaskWorklogSummary task={task} project={project} people={people} titles={titles} />}

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
            </>}
        </Sheet>
    );
};

export default TaskDetailSheet;
