import React, { useEffect, useState } from 'react';
import { JiraAgileBoard, JiraSprint, Project } from '../../../types';
import {
    fetchIntegrationHealth, fetchJiraBoardSprints, fetchJiraSprintBoards, fetchJiraSprintIssues,
    IntegrationHealth, JiraIssueRecord,
} from '../../../utils/integrations';
import { JiraSprintTransfer, jiraSprintSourceKey, previewJiraSprintTransfer } from '../../../utils/planning/jiraSprintImport';
import { buildSprintWindows } from '../../../utils/taskToAllocation';
import { lastPlannedSprint } from '../../../utils/timelinePlan';
import { Icon } from '../icons';
import { sprintLabel } from '../taskMeta';
import { Field } from '../ui';

interface Props {
    project: Project;
    onTransfer?: (request: JiraSprintTransfer) => void;
    onOpenLocalSprint: (sprint: number) => void;
}

const STATES: Record<JiraSprint['state'], string> = { active: 'Aktif', future: 'Gelecek', closed: 'Kapalı', unknown: 'Bilinmiyor' };
const STATE_ORDER = { active: 0, future: 1, closed: 2, unknown: 3 };
const PAGE_LIMIT = 20;
const sprintDate = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric' });
const localDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
const date = (value: string | undefined) => value && Number.isFinite(Date.parse(value)) ? sprintDate.format(new Date(value)) : '—';
const keyOf = (key: string) => key.trim().toUpperCase();

const JiraSprintPlan = ({ project, onTransfer, onOpenLocalSprint }: Props) => {
    const initialKey = keyOf(project.jiraSync?.projectKey || project.jiraProjectKey || '');
    const [input, setInput] = useState(initialKey);
    const [source, setSource] = useState(initialKey);
    const [refresh, setRefresh] = useState(0);
    const [health, setHealth] = useState<IntegrationHealth>();
    const [boards, setBoards] = useState<JiraAgileBoard[]>();
    const [board, setBoard] = useState<number>();
    const [sprints, setSprints] = useState<JiraSprint[]>();
    const [state, setState] = useState('');
    const [limited, setLimited] = useState(false);
    const [sprint, setSprint] = useState<JiraSprint>();
    const [records, setRecords] = useState<JiraIssueRecord[]>();
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [resultLimit, setResultLimit] = useState(25);
    const [target, setTarget] = useState<number | 'new'>('new');
    const [moveExisting, setMoveExisting] = useState(false);
    const [notice, setNotice] = useState('');
    const [boardError, setBoardError] = useState('');
    const [sprintError, setSprintError] = useState('');
    const [recordError, setRecordError] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        void fetchIntegrationHealth(controller.signal).then(setHealth).catch(() => undefined);
        return () => controller.abort();
    }, [refresh]);

    const mode = health?.jira ? health.authMode : undefined;
    useEffect(() => {
        if (!mode || !source) return;
        const controller = new AbortController();
        void fetchJiraSprintBoards(source, mode, controller.signal).then(result => {
            if (controller.signal.aborted) return;
            setBoards(result.values);
            setBoard(result.values[0]?.id);
            if (result.truncated) setBoardError('Jira pano listesi ilk 500 sonuçla sınırlı.');
        }).catch(e => { if (!controller.signal.aborted) setBoardError((e as Error).message); });
        return () => controller.abort();
    }, [mode, source, refresh]);

    useEffect(() => {
        if (!mode || !source || !board) return;
        const controller = new AbortController();
        void fetchJiraBoardSprints(source, board, state, mode, controller.signal).then(result => {
            if (controller.signal.aborted) return;
            setSprints([...result.values].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.id - a.id));
            setLimited(result.truncated);
        }).catch(e => { if (!controller.signal.aborted) setSprintError((e as Error).message); });
        return () => controller.abort();
    }, [mode, source, board, state, refresh]);

    useEffect(() => {
        if (!mode || !sprint) return;
        const controller = new AbortController();
        void (async () => {
            try {
                let cursor: string | null = null;
                const issues = new Map<string, JiraIssueRecord>();
                for (let i = 0; i < PAGE_LIMIT; i++) {
                    const page = await fetchJiraSprintIssues(source, sprint.id, cursor, mode, controller.signal);
                    page.issues.forEach(issue => issues.set(keyOf(issue.key), issue));
                    if (controller.signal.aborted) return;
                    if (!page.next) {
                        setRecords([...issues.values()]);
                        setSelected(new Set(issues.keys()));
                        return;
                    }
                    if (page.next === cursor) throw new Error('Jira aynı sayfa imlecini tekrar döndürdü. Sprinti yeniden seçip deneyin.');
                    cursor = page.next;
                }
                setRecordError(`Sprint ${PAGE_LIMIT} sayfalık okuma sınırını aşıyor. Aktarım için sprint kapsamını Jira’da daraltın.`);
            } catch (e) {
                if (!controller.signal.aborted) setRecordError((e as Error).message);
            }
        })();
        return () => controller.abort();
    }, [mode, source, sprint]);

    const resetSprint = () => { setSprint(undefined); setRecords(undefined); setRecordError(''); setNotice(''); };
    const resetBoard = () => { setSprints(undefined); setSprintError(''); setLimited(false); resetSprint(); };
    const loadBoards = () => {
        setSource(keyOf(input)); setRefresh(n => n + 1); setBoards(undefined); setBoard(undefined); setBoardError(''); resetBoard();
    };
    const open = (next: JiraSprint) => {
        setRecords(undefined); setRecordError(''); setNotice(''); setResultLimit(25);
        const linked = project.settings.jiraSprintImports?.[jiraSprintSourceKey(source, next.id)];
        setTarget(linked?.localSprint || 'new'); setMoveExisting(false);
        setSprint({ ...next });
    };

    const transfer = sprint && records ? {
        projectKey: source, sprint, issues: records.filter(issue => selected.has(keyOf(issue.key))), target, moveExisting, emptySource: records.length === 0,
    } satisfies JiraSprintTransfer : undefined;
    const preview = transfer ? previewJiraSprintTransfer(project, transfer) : undefined;
    const localSprints = lastPlannedSprint(project);
    const linked = sprint && project.settings.jiraSprintImports?.[jiraSprintSourceKey(source, sprint.id)];
    const window = preview && buildSprintWindows(project, preview.target)[preview.target - 1];
    const tasksByKey = new Map(project.tasks.filter(task => task.jiraId).map(task => [keyOf(task.jiraId), task]));
    const toggle = (key: string) => setSelected(previous => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    return (
        <section aria-labelledby="jira-sprints-title" className="grid gap-4 min-w-0">
            <div>
                <h3 id="jira-sprints-title" className="m-0 text-[19px] font-semibold m-text">Jira sprintleri</h3>
                <p className="m-0 mt-1 text-sm m-text-3">Sprint kapsamını önizleyip kayıtları yerel sprint planına kopyalayın.</p>
            </div>
            <div className="m-surface rounded-2xl p-4 flex flex-wrap items-end gap-3">
                <form className="flex flex-wrap gap-2 items-end" onSubmit={e => { e.preventDefault(); loadBoards(); }}>
                    <Field label="Jira proje anahtarı" htmlFor="jira-sprint-project">
                        <input id="jira-sprint-project" className="m-input !w-auto max-w-full" placeholder="MKS" maxLength={20} value={input} onChange={e => setInput(e.target.value.toUpperCase())} />
                    </Field>
                    <button type="submit" className="m-btn m-btn-gray" disabled={!/^[A-Z][A-Z0-9_]{1,19}$/.test(keyOf(input))}><Icon name="refresh" size={16} />Panoları getir</button>
                </form>
                {boards && boards.length > 0 && <Field label="Jira panosu" htmlFor="jira-sprint-board">
                    <select id="jira-sprint-board" className="m-input" value={board ?? ''} onChange={e => { setBoard(Number(e.target.value)); resetBoard(); }}>
                        {boards.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                </Field>}
                {board && <Field label="Sprint durumu" htmlFor="jira-sprint-state">
                    <select id="jira-sprint-state" className="m-input" value={state} onChange={e => { setState(e.target.value); resetBoard(); }}>
                        <option value="">Tümü</option><option value="active">Aktif</option><option value="future">Gelecek</option><option value="closed">Kapalı</option>
                    </select>
                </Field>}
            </div>
            {!health && <p className="m-0 text-sm m-text-3" role="status">Jira bağlantısı kontrol ediliyor…</p>}
            {health && !health.jira && <p className="m-0 text-sm m-ink-warn" role="status">{health.unreachable ? 'Jira bağlantı ayarları okunamadı.' : 'Jira bağlantısını Yönetici konsolu → Entegrasyonlar bölümünde yapılandırın.'}</p>}
            {mode && !source && <p className="m-0 text-sm m-text-3">Panoları görmek için bir Jira proje anahtarı girin.</p>}
            {mode && source && !boards && !boardError && <p className="m-0 text-sm m-text-3" role="status">Jira panoları getiriliyor…</p>}
            {!!boardError && <p className="m-0 text-sm m-ink-warn" role="alert">{boardError}</p>}
            {boards?.length === 0 && <p className="m-0 text-sm m-text-3">Bu Jira projesinde sprint destekleyen erişilebilir pano yok.</p>}
            {board && !sprints && !sprintError && <p className="m-0 text-sm m-text-3" role="status">Sprintler getiriliyor…</p>}
            {!!sprintError && <p className="m-0 text-sm m-ink-warn" role="alert">{sprintError}</p>}
            {limited && <p className="m-0 text-sm m-ink-warn" role="status">İlk 500 sprint gösteriliyor. Sprint durumuyla kapsamı daraltabilirsiniz.</p>}
            {sprints?.length === 0 && <p className="m-0 text-sm m-text-3">Bu panoda seçilen durumda sprint yok.</p>}
            {sprints && sprints.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
                    <ul className="m-0 p-2 list-none m-surface rounded-2xl grid gap-1 self-start max-h-[560px] overflow-y-auto" aria-label="Jira sprint listesi">
                        {sprints.map(item => (
                            <li key={item.id}>
                                <button type="button" aria-pressed={item.id === sprint?.id} onClick={() => open(item)}
                                    className={`m-row-link w-full p-2.5 rounded-xl text-left ${item.id === sprint?.id ? 'm-fill-2' : ''}`}>
                                    <span className="block text-sm font-semibold m-text break-words">{item.name}</span>
                                    <span className="block text-[12px] m-text-3">{STATES[item.state]} · {date(item.startDate)} – {date(item.endDate)}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <section aria-label="Jira sprint önizlemesi" className="m-surface rounded-2xl p-4 grid gap-3 min-w-0 self-start">
                        {!sprint ? <p className="m-0 text-sm m-text-3">Kapsamını görmek için bir sprint seçin.</p> : (
                            <>
                                <div>
                                    <h4 className="m-0 text-base font-semibold m-text">{sprint.name}</h4>
                                    <p className="m-0 text-sm m-text-3">Jira · {date(sprint.startDate)} – {date(sprint.endDate)}</p>
                                    {sprint.goal && <p className="m-0 mt-1 text-sm m-text-2 break-words whitespace-pre-wrap">{sprint.goal}</p>}
                                </div>
                                {linked && <div className="flex flex-wrap gap-2 items-center">
                                    <span role="status" className="text-sm m-text-2">{notice || 'Yerel sprint bağlantısı'} · {sprintLabel(linked.localSprint, project.settings.sprintNames)}</span>
                                    <button type="button" className="m-btn m-btn-gray" onClick={() => onOpenLocalSprint(linked.localSprint)}>Yerel sprinti aç</button>
                                </div>}
                                {!records && !recordError && <p className="m-0 text-sm m-text-3" role="status">Sprint kayıtları getiriliyor…</p>}
                                {recordError && <p className="m-0 text-sm m-ink-warn" role="alert">{recordError}</p>}
                                {records && preview && transfer && <div className="grid gap-3">
                                    {onTransfer && <>
                                        <Field label="Yerel hedef sprint" htmlFor="jira-local-sprint">
                                            <select id="jira-local-sprint" className="m-input" value={target === 'new' && linked ? linked.localSprint : target} onChange={e => { setTarget(e.target.value === 'new' ? 'new' : Number(e.target.value)); setNotice(''); }}>
                                                {!linked && <option value="new">Yeni sprint oluştur</option>}
                                                {Array.from({ length: localSprints }, (_, i) => i + 1).map(number => <option key={number} value={number}>{sprintLabel(number, project.settings.sprintNames)}</option>)}
                                            </select>
                                        </Field>
                                        {window && <p className="m-0 text-[13px] m-text-3">Yerel takvim · {localDate.format(window.start)} – {localDate.format(window.end)}</p>}
                                        {(preview.skipped > 0 || moveExisting) && <label className="flex items-center gap-2 text-sm m-text">
                                            <input type="checkbox" className="w-4 h-4" checked={moveExisting} onChange={e => setMoveExisting(e.target.checked)} />
                                            Başka yerel sprintteki seçili görevleri taşı
                                        </label>}
                                    </>}
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-sm m-text-2">{selected.size} / {records.length} seçili</span>
                                        {onTransfer && records.length > 0 && <button type="button" className="m-btn m-btn-plain" onClick={() => setSelected(selected.size === records.length ? new Set() : new Set(records.map(issue => keyOf(issue.key))))}>
                                            {selected.size === records.length ? 'Seçimi temizle' : 'Tümünü seç'}
                                        </button>}
                                    </div>
                                    {records.length === 0 && <p className="m-0 text-sm m-text-3">Bu sprintte seçili Jira projesine ait kayıt yok.</p>}
                                    {records.length > 0 && (
                                        <ul className="m-0 p-0 list-none max-h-64 overflow-y-auto divide-y divide-[var(--m-sep)]">
                                            {records.slice(0, resultLimit).map(issue => {
                                                const key = keyOf(issue.key);
                                                const existing = tasksByKey.get(key);
                                                return <li key={key}>
                                                    <label className="flex items-start gap-2 py-2 px-1 text-sm">
                                                        {onTransfer && <input type="checkbox" className="mt-0.5 w-4 h-4" checked={selected.has(key)} onChange={() => toggle(key)} />}
                                                        <span className="min-w-0 break-words"><span className="font-semibold">{issue.key}</span> {issue.summary}
                                                            <small className="block m-text-3">{[issue.status, issue.assignee, existing?.version ? sprintLabel(existing.version, project.settings.sprintNames) : existing ? 'Yerel havuzda' : 'Yeni kayıt'].filter(Boolean).join(' · ')}</small>
                                                        </span>
                                                    </label>
                                                </li>;
                                            })}
                                        </ul>
                                    )}
                                    {resultLimit < records.length && <button type="button" className="m-btn m-btn-plain justify-self-start" onClick={() => setResultLimit(n => n + 25)}>Daha fazla kayıt göster</button>}
                                    {onTransfer && <>
                                        <p className="m-0 text-sm m-text-2" aria-live="polite">
                                            {preview.added} yeni · {preview.moved} taşınacak · {preview.unchanged} zaten hedefte
                                            {preview.skipped > 0 && <span className="m-ink-warn"> · {preview.skipped} başka sprintte kalacak</span>}
                                        </p>
                                        <button type="button" className="m-btn m-btn-primary justify-self-start" disabled={!preview.canApply}
                                            onClick={() => { onTransfer(transfer); setNotice('Jira sprinti aktarıldı'); }}>
                                            <Icon name={preview.target > localSprints ? 'copy' : 'check'} size={17} />{preview.target > localSprints ? 'Sprinti kopyala' : 'Yerel sprinte aktar'}
                                        </button>
                                    </>}
                                </div>}
                            </>
                        )}
                    </section>
                </div>
            )}
        </section>
    );
};

export default JiraSprintPlan;
