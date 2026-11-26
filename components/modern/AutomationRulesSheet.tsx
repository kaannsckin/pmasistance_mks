import React, { useMemo, useState } from 'react';
import {
    AutomationAction, AutomationCondition, AutomationField, AutomationGroup, AutomationOp, AutomationRule, AutomationTrigger,
    Person, Project, ProjectRoleDef, Task, TaskStatus, WorkflowConfig,
} from '../../types';
import {
    AutomationContext, describeAction, describeRule, FIELD_LABELS, JIRA_ACTIONS, newRuleId, OP_LABELS, previewRule, ruleProblems,
} from '../../utils/automation';
import { CATEGORY_LABELS } from '../../utils/workflow';
import { Icon } from './icons';
import TaskKeyButton from './TaskKeyButton';
import { Sheet, ToggleSwitch } from './ui';

/**
 * Kural setleri (otomasyon): tetikleyici → koşul → eylem. Basit kipte tek
 * cümle ("Durum Çözüldü olduğunda ve atanan X ise → durumu Testte yap"),
 * ileri kipte VE/VEYA grupları, çok eylem ve tüm tetikleyiciler.
 */

type Draft = AutomationRule;
const isGroup = (x: AutomationCondition | AutomationGroup): x is AutomationGroup => 'items' in x;

const ENUM_FIELDS: AutomationField[] = ['status', 'fromStatus', 'category', 'role', 'component', 'issueType', 'priority', 'fixVersion', 'overdue', 'assignee'];
const NUM_FIELDS: AutomationField[] = ['sprint', 'effort', 'dueInDays'];
const SIMPLE_FIELDS: AutomationField[] = ['assignee', 'role', 'issueType', 'priority', 'component', 'label', 'fromStatus', 'unit'];
const ISSUE_TYPES: [string, string][] = [['bug', 'Hata'], ['feature', 'Özellik'], ['improvement', 'İyileştirme'], ['task', 'Görev'], ['other', 'Diğer']];
const PRIORITIES: Task['priority'][] = ['Blocker', 'High', 'Medium', 'Low'];

const opsFor = (f: AutomationField): AutomationOp[] =>
    NUM_FIELDS.includes(f) ? ['eq', 'neq', 'gt', 'lt', 'empty', 'notEmpty']
        : f === 'overdue' ? ['eq']
            : f === 'name' ? ['contains', 'notContains']
                : ['eq', 'neq', 'in', 'notIn', 'contains', 'empty', 'notEmpty'];

const ACTION_KINDS: [AutomationAction['kind'], string][] = [
    ['setStatus', 'Durumu değiştir'], ['assign', 'Ata'], ['setPriority', 'Önceliği değiştir'], ['setSprint', 'Sprinte al'],
    ['setFixVersion', 'Hedef sürüm'], ['setDueDate', 'Termin'], ['addLabels', 'Etiket ekle'], ['removeLabels', 'Etiket çıkar'],
    ['setResolution', 'Çözüm'], ['comment', 'Yorum ekle'], ['notify', 'Bildir'],
];

const newAction = (kind: AutomationAction['kind'], wf: WorkflowConfig): AutomationAction => {
    switch (kind) {
        case 'setStatus': return { kind, status: wf.statuses.find(s => s.category === TaskStatus.InProgress)?.key || wf.statuses[0].key };
        case 'assign': return { kind, to: '' };
        case 'setPriority': return { kind, priority: 'High' };
        case 'setSprint': return { kind, sprint: 'next' };
        case 'setFixVersion': return { kind, version: 'next' };
        case 'setDueDate': return { kind, days: 3 };
        case 'addLabels': case 'removeLabels': return { kind, labels: [] };
        case 'setResolution': return { kind, resolution: 'Düzeltildi' };
        case 'comment': return { kind, text: '' };
        case 'notify': return { kind, to: 'assignee' };
    }
};

/** Hazır kurallar: tek tıkla taslak olur, kaydetmeden önce düzenlenir */
const templates = (wf: WorkflowConfig): { label: string; make: () => Partial<Draft> }[] => {
    const has = (k: string) => wf.statuses.some(s => s.key === k);
    const done = wf.statuses.find(s => s.key === 'RESOLVED') || wf.statuses.find(s => s.category === TaskStatus.Done);
    const test = wf.statuses.find(s => s.key === 'TESTING') || wf.statuses.find(s => s.category === TaskStatus.InProgress);
    return [
        ...(done && test ? [{ label: `${done.label} → ${test.label} (kişiye göre)`, make: () => ({ name: `${done.label} olan işi teste al`, mode: 'simple' as const, trigger: { kind: 'status' as const, to: [done.key] }, conditions: { join: 'and' as const, items: [{ field: 'assignee' as const, op: 'eq' as const, value: '' }] }, actions: [{ kind: 'setStatus' as const, status: test.key }] }) }] : []),
        ...(test ? [{ label: `${test.label} olunca Test ekibine bildir`, make: () => ({ name: 'Test ekibine haber ver', mode: 'simple' as const, trigger: { kind: 'status' as const, to: [test.key] }, actions: [{ kind: 'notify' as const, to: 'role' as const, roleId: 'test' }] }) }] : []),
        { label: 'Hata açılınca bileşen sorumlusuna ata', make: () => ({ name: 'Hatayı bileşen sorumlusuna ata', mode: 'advanced' as const, trigger: { kind: 'created' as const }, conditions: { join: 'and' as const, items: [{ field: 'issueType' as const, op: 'eq' as const, value: 'bug' }, { field: 'assignee' as const, op: 'empty' as const }] }, actions: [{ kind: 'assign' as const, to: 'componentLead' }] }) },
        { label: 'Her gün gecikenleri etiketle', make: () => ({ name: 'Gecikenleri işaretle', mode: 'advanced' as const, trigger: { kind: 'schedule' as const }, conditions: { join: 'and' as const, items: [{ field: 'overdue' as const, op: 'eq' as const, value: 'true' }] }, actions: [{ kind: 'addLabels' as const, labels: ['gecikti'] }] }) },
        ...(has('BLOCKED') ? [{ label: 'Engellenince önceliği Blocker yap', make: () => ({ name: 'Engellenen iş Blocker', mode: 'simple' as const, trigger: { kind: 'status' as const, to: ['BLOCKED'] }, actions: [{ kind: 'setPriority' as const, priority: 'Blocker' as const }, { kind: 'notify' as const, to: 'teams' as const }] }) }] : []),
    ];
};

const blank = (wf: WorkflowConfig): Draft => {
    const now = new Date().toISOString();
    const done = wf.statuses.find(s => s.category === TaskStatus.Done);
    return { id: newRuleId(), name: '', enabled: true, mode: 'simple', trigger: { kind: 'status', to: done ? [done.key] : [] }, conditions: { join: 'and', items: [] }, actions: [], createdAt: now, updatedAt: now };
};

const AutomationRulesSheet: React.FC<{
    project: Project;
    workflow: WorkflowConfig;
    people: Person[];
    roleDefs: ProjectRoleDef[];
    canEdit: boolean;
    jiraConnected: boolean;
    onClose: () => void;
    onSave: (rules: AutomationRule[], summary: string) => void;
    onViewTask: (t: Task) => void;
}> = ({ project, workflow, people, roleDefs, canEdit, jiraConnected, onClose, onSave, onViewTask }) => {
    const [rules, setRules] = useState<AutomationRule[]>(() => JSON.parse(JSON.stringify(project.automationRules || [])));
    const [tab, setTab] = useState<'rules' | 'log'>('rules');
    const [editing, setEditing] = useState<Draft | null>(null);
    const [summary, setSummary] = useState<string[]>([]);
    const ctx: AutomationContext = useMemo(() => ({ now: new Date(), workflow, people, roleDefs }), [workflow, people, roleDefs]);
    const dirty = JSON.stringify(rules) !== JSON.stringify(project.automationRules || []);

    const commit = (d: Draft) => {
        const at = new Date().toISOString();
        const exists = rules.some(r => r.id === d.id);
        setRules(rs => exists ? rs.map(r => (r.id === d.id ? { ...d, updatedAt: at } : r)) : [...rs, { ...d, updatedAt: at }]);
        setSummary(s => [...s, `${exists ? 'güncellendi' : 'eklendi'}: ${d.name}`]);
        setEditing(null);
    };

    const log = [...(project.automationLog || [])].reverse();
    const byTask = new Map(project.tasks.map(t => [t.id, t]));

    return (
        <Sheet xxl title={`Kural setleri: ${project.name}`}
            subtitle="Görev değişince (elle, toplu düzenleme, Jira eşitlemesi, asistan) ya da her gün çalışan kurallar. Örn. Çözüldü olan ve atananı X olan işi Testte durumuna al."
            onClose={onClose}
            footer={editing ? undefined : (
                <>
                    <span className="flex-1 text-[13px] m-text-3">{summary.length ? `Bekleyen: ${summary.join('; ')}` : 'Kurallar bu projede, değişikliği yapan kişinin uygulamasında çalışır; geçmiş sekmesinde ne yaptıkları görünür.'}</span>
                    <button type="button" className="m-btn m-btn-gray" onClick={onClose}>{dirty ? 'Vazgeç' : 'Kapat'}</button>
                    {canEdit && <button type="button" className="m-btn m-btn-primary" disabled={!dirty} onClick={() => onSave(rules, summary.join('; ') || 'kurallar güncellendi')}><Icon name="check" size={16} />Kaydet</button>}
                </>
            )}>
            {!editing && (
                <div role="tablist" className="flex gap-1 p-1 rounded-xl m-fill-2 self-start">
                    {([['rules', `Kurallar (${rules.length})`], ['log', `Geçmiş (${log.length})`]] as const).map(([k, l]) => (
                        <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                            className={`h-8 px-3 rounded-lg border-0 cursor-pointer text-[14px] ${tab === k ? 'm-surface font-semibold m-text' : 'bg-transparent m-text-2'}`}>{l}</button>
                    ))}
                </div>
            )}

            {editing && (
                <RuleEditor draft={editing} ctx={ctx} project={project} canEdit={canEdit} jiraConnected={jiraConnected}
                    onCancel={() => setEditing(null)} onSave={commit} onViewTask={onViewTask} />
            )}

            {!editing && tab === 'rules' && (
                <div className="flex flex-col gap-3">
                    {rules.length === 0 && (
                        <div className="rounded-2xl m-fill-2 px-4 py-6 text-center flex flex-col items-center gap-1.5">
                            <span className="text-[16px] font-semibold m-text">Henüz kural yok</span>
                            <span className="text-[14px] m-text-3 max-w-[60ch]">Tekrarlayan işleri kurala bağlayın: durum geçişi, atama, etiket, bildirim. Aşağıdaki hazır kurallardan başlayabilirsiniz.</span>
                        </div>
                    )}
                    {rules.map(r => (
                        <div key={r.id} className="m-surface rounded-2xl px-4 py-3 flex items-start gap-3 border m-sep" style={{ borderStyle: 'solid', borderWidth: 1 }}>
                            <ToggleSwitch label={`${r.name} açık`} checked={r.enabled} disabled={!canEdit} onChange={on => { setRules(rs => rs.map(x => (x.id === r.id ? { ...x, enabled: on } : x))); setSummary(s => [...s, `${on ? 'açıldı' : 'kapatıldı'}: ${r.name}`]); }} />
                            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                <span className="flex flex-wrap items-center gap-2">
                                    <span className={`text-[15px] font-semibold ${r.enabled ? 'm-text' : 'm-text-3'}`}>{r.name}</span>
                                    <span className="text-[11.5px] px-1.5 h-5 inline-flex items-center rounded-full m-fill-2 m-text-2">{r.mode === 'simple' ? 'Basit' : 'İleri'}</span>
                                    {r.writeToJira && <span className="text-[11.5px] px-1.5 h-5 inline-flex items-center rounded-full m-tone-accent">Jira</span>}
                                </span>
                                <span className="text-[13.5px] m-text-2">{describeRule(r, ctx)}</span>
                                <span className="text-[12px] m-text-3">{r.runs ? `${r.runs} kez çalıştı · son ${new Date(r.lastRunAt!).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Henüz çalışmadı'}{r.trigger.kind === 'schedule' && r.lastRunDay ? ` · son gün ${r.lastRunDay}` : ''}</span>
                            </span>
                            {canEdit && (
                                <span className="flex gap-0.5">
                                    <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${r.name} kuralını düzenle`} onClick={() => setEditing(JSON.parse(JSON.stringify(r)))}><Icon name="pencil" size={14} /></button>
                                    <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${r.name} kuralını çoğalt`} onClick={() => setEditing({ ...JSON.parse(JSON.stringify(r)), id: newRuleId(), name: `${r.name} (kopya)`, runs: 0, lastRunAt: undefined, lastRunDay: undefined })}><Icon name="copy" size={14} /></button>
                                    <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${r.name} kuralını sil`} onClick={() => { if (window.confirm(`"${r.name}" kuralı silinsin mi?`)) { setRules(rs => rs.filter(x => x.id !== r.id)); setSummary(s => [...s, `silindi: ${r.name}`]); } }}><Icon name="trash" size={14} /></button>
                                </span>
                            )}
                        </div>
                    ))}
                    {canEdit && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <button type="button" className="m-btn m-btn-primary !min-h-[36px]" onClick={() => setEditing(blank(workflow))}><Icon name="plus" size={15} />Yeni kural</button>
                            <span className="text-[13px] m-text-3 ml-2">Hazır:</span>
                            {templates(workflow).map(tp => (
                                <button key={tp.label} type="button" className="m-pill" onClick={() => setEditing({ ...blank(workflow), ...tp.make() })}><Icon name="sparkles" size={12} />{tp.label}</button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {!editing && tab === 'log' && (
                <div className="flex flex-col">
                    {log.length === 0 && <p className="m-0 py-3 text-[14px] m-text-3">Kurallar henüz bir şey yapmadı.</p>}
                    {log.slice(0, 100).map((e, i) => {
                        const task = byTask.get(e.taskId);
                        return (
                            <div key={i} className="flex items-center gap-3 py-2 border-t m-sep text-[14px]" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                                <span className="w-[120px] flex-none text-[12.5px] m-text-3 m-tabular">{new Date(e.at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                {task ? <TaskKeyButton task={task} onOpen={() => onViewTask(task)} /> : <span className="text-[13px] m-text-3">{e.taskKey}</span>}
                                <span className="flex-1 min-w-0"><b className="m-text">{e.ruleName}</b> <span className="m-text-2">{e.summary}</span></span>
                            </div>
                        );
                    })}
                </div>
            )}
        </Sheet>
    );
};

// ---------------------------------------------------------------- düzenleyici

const RuleEditor: React.FC<{
    draft: Draft;
    ctx: AutomationContext;
    project: Project;
    canEdit: boolean;
    jiraConnected: boolean;
    onCancel: () => void;
    onSave: (d: Draft) => void;
    onViewTask: (t: Task) => void;
}> = ({ draft, ctx, project, canEdit, jiraConnected, onCancel, onSave, onViewTask }) => {
    const [d, setD] = useState<Draft>(draft);
    const set = (patch: Partial<Draft>) => setD(x => ({ ...x, ...patch }));
    const problems = ruleProblems(d, ctx.workflow);
    const matches = useMemo(() => previewRule(d, project, ctx), [d, project, ctx]);
    const names = useMemo(() => [...new Set([...project.resources.map(r => r.name), ...ctx.people.map(p => `${p.firstName} ${p.lastName}`.trim())])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'tr')), [project.resources, ctx.people]);
    const opts: ValueOpts = { ctx, project, names };
    const jiraUseful = d.actions.some(a => JIRA_ACTIONS.includes(a.kind));
    // Basit kipe dönüş: yalnız düz VE koşulları ve durum/oluşturma/günlük tetikleyicisi
    const simpleOk = (!d.conditions || d.conditions.join === 'and' && d.conditions.items.every(x => !isGroup(x))) && d.trigger.kind !== 'field';

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 flex-1 min-w-[240px]">
                    <span className="text-[13px] font-semibold m-text-2">Kural adı</span>
                    <input className="m-input" value={d.name} maxLength={80} placeholder="Ör. Çözülen işi teste al" onChange={e => set({ name: e.target.value })} />
                </label>
                <div className="m-segmented" role="group" aria-label="Kip">
                    <button type="button" className="m-segment" aria-pressed={d.mode === 'simple'} disabled={!simpleOk} title={simpleOk ? '' : 'VEYA grubu ya da alan tetikleyicisi basit kipte gösterilemez'} onClick={() => set({ mode: 'simple' })}>Basit</button>
                    <button type="button" className="m-segment" aria-pressed={d.mode === 'advanced'} onClick={() => set({ mode: 'advanced' })}>İleri düzey</button>
                </div>
            </div>

            <div className="rounded-xl m-tone-accent px-3 py-2 text-[14px]"><b>Özet:</b> {describeRule(d, ctx)}</div>

            <Section n={1} title="Ne zaman">
                <TriggerEditor value={d.trigger} advanced={d.mode === 'advanced'} ctx={ctx} onChange={trigger => set({ trigger })} />
            </Section>

            <Section n={2} title="Hangi görevlerde (koşullar)">
                {d.mode === 'simple' ? (
                    <SimpleConditions group={d.conditions || { join: 'and', items: [] }} opts={opts} onChange={conditions => set({ conditions })} />
                ) : (
                    <GroupEditor group={d.conditions || { join: 'and', items: [] }} opts={opts} depth={0} onChange={conditions => set({ conditions })} />
                )}
            </Section>

            <Section n={3} title="Ne yapılsın (eylemler)">
                <div className="flex flex-col gap-2">
                    {d.actions.map((a, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] m-text-3 w-5 text-right">{i + 1}.</span>
                            <select aria-label="Eylem" className="m-input !h-9 !py-0 !w-auto text-[14px]" value={a.kind} onChange={e => set({ actions: d.actions.map((x, j) => (j === i ? newAction(e.target.value as AutomationAction['kind'], ctx.workflow) : x)) })}>
                                {ACTION_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                            <ActionValue action={a} opts={opts} onChange={na => set({ actions: d.actions.map((x, j) => (j === i ? na : x)) })} />
                            {(d.mode === 'advanced' || d.actions.length > 1) && <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${i + 1}. eylemi sil`} onClick={() => set({ actions: d.actions.filter((_, j) => j !== i) })}><Icon name="x" size={14} /></button>}
                        </div>
                    ))}
                    {(d.mode === 'advanced' || d.actions.length === 0) && (
                        <button type="button" className="m-btn m-btn-gray !min-h-[34px] self-start text-[14px]" onClick={() => set({ actions: [...d.actions, newAction(d.actions.length ? 'notify' : 'setStatus', ctx.workflow)] })}><Icon name="plus" size={14} />Eylem ekle</button>
                    )}
                    {d.mode === 'simple' && d.actions.length === 1 && <button type="button" className="m-btn m-btn-plain !min-h-[30px] self-start text-[13px]" onClick={() => set({ mode: 'advanced', actions: [...d.actions, newAction('notify', ctx.workflow)] })}>Birden çok eylem için ileri düzeye geç</button>}
                </div>
                <label className={`flex items-start gap-2 mt-3 text-[14px] ${jiraUseful ? 'm-text' : 'm-text-3'}`}>
                    <input type="checkbox" checked={!!d.writeToJira} disabled={!jiraUseful} onChange={e => set({ writeToJira: e.target.checked || undefined })} />
                    <span>Jira'daki kayda da uygula <span className="m-text-3">(durum geçişi, öncelik, termin, çözüm, yorum; atama ve etiket yalnız uygulamada).{!jiraConnected ? ' Jira bağlı değil: bağlanınca çalışır.' : ''} Kapalıyken Jira eşitlemesi kuralın yaptığı durum değişikliğini geri alabilir.</span></span>
                </label>
            </Section>

            <div className="rounded-xl m-fill-2 p-3 flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold m-text">Önizleme: şu an {matches.length} görev bu koşullara uyuyor{d.trigger.kind === 'status' ? ' (hedef durumda)' : ''}</span>
                <span className="text-[12.5px] m-text-3">{d.trigger.kind === 'schedule' ? 'Günlük kural kaydedildiği gün bu görevlere uygulanır.' : 'Kural geriye dönük çalışmaz; bundan sonraki değişikliklerde tetiklenir.'}</span>
                {matches.slice(0, 6).map(t => (
                    <span key={t.id} className="flex items-center gap-2 text-[13.5px]"><TaskKeyButton task={t} onOpen={() => onViewTask(t)} /><span className="truncate m-text-2">{t.name}</span></span>
                ))}
                {matches.length > 6 && <span className="text-[12.5px] m-text-3">+{matches.length - 6} görev daha</span>}
            </div>

            {problems.length > 0 && <p role="alert" className="m-0 text-[13px] m-ink-bad">{problems.join(' ')}</p>}
            <div className="flex justify-end gap-2">
                <button type="button" className="m-btn m-btn-gray" onClick={onCancel}>Vazgeç</button>
                {canEdit && <button type="button" className="m-btn m-btn-primary" disabled={problems.length > 0} onClick={() => onSave({ ...d, name: d.name.trim() })}><Icon name="check" size={16} />Kuralı uygula</button>}
            </div>
        </div>
    );
};

const Section: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
    <section className="flex gap-3">
        <span aria-hidden="true" className="w-7 h-7 flex-none rounded-full m-tone-accent flex items-center justify-center text-[13px] font-bold">{n}</span>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
            <h3 className="m-0 text-[15px] font-semibold m-text">{title}</h3>
            {children}
        </div>
    </section>
);

const StatusChips: React.FC<{ label: string; value: string[]; ctx: AutomationContext; onChange: (v: string[]) => void; anyLabel: string }> = ({ label, value, ctx, onChange, anyLabel }) => (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
        <button type="button" className="m-pill" aria-pressed={!value.length} onClick={() => onChange([])}>{anyLabel}</button>
        {ctx.workflow.statuses.map(s => {
            const on = value.includes(s.key);
            return <button key={s.key} type="button" className={`m-pill ${on ? 'm-tone-accent font-semibold' : ''}`} aria-pressed={on} onClick={() => onChange(on ? value.filter(x => x !== s.key) : [...value, s.key])}>{s.label}</button>;
        })}
    </div>
);

const TRIGGER_FIELDS: AutomationField[] = ['assignee', 'priority', 'component', 'label', 'fixVersion', 'sprint', 'dueInDays', 'effort', 'issueType', 'resolution'];

const TriggerEditor: React.FC<{ value: AutomationTrigger; advanced: boolean; ctx: AutomationContext; onChange: (t: AutomationTrigger) => void }> = ({ value, advanced, ctx, onChange }) => {
    const kinds: [AutomationTrigger['kind'], string][] = [['status', 'Durum değişince'], ['created', 'Görev oluşturulunca'], ...(advanced ? [['field', 'Alan değişince'] as [AutomationTrigger['kind'], string]] : []), ['schedule', 'Her gün (zamanlanmış)']];
    return (
        <div className="flex flex-col gap-2">
            <div className="m-segmented self-start flex-wrap" role="group" aria-label="Tetikleyici">
                {kinds.map(([k, l]) => (
                    <button key={k} type="button" className="m-segment" aria-pressed={value.kind === k}
                        onClick={() => onChange(k === 'status' ? { kind: 'status', to: [] } : k === 'field' ? { kind: 'field', fields: ['assignee'] } : { kind: k } as AutomationTrigger)}>{l}</button>
                ))}
            </div>
            {value.kind === 'status' && (
                <>
                    <span className="text-[13px] m-text-3">Hedef durum</span>
                    {advanced ? <StatusChips label="Hedef durum" value={value.to || []} ctx={ctx} anyLabel="Herhangi" onChange={to => onChange({ ...value, to })} /> : (
                        <select aria-label="Hedef durum" className="m-input !h-9 !py-0 !w-auto text-[14px] self-start" value={value.to?.[0] || ''} onChange={e => onChange({ ...value, to: e.target.value ? [e.target.value] : [] })}>
                            <option value="">Her durum değişikliği</option>
                            {ctx.workflow.statuses.map(s => <option key={s.key} value={s.key}>{s.label} ({CATEGORY_LABELS[s.category]})</option>)}
                        </select>
                    )}
                    {advanced && (<><span className="text-[13px] m-text-3">Kaynak durum (isteğe bağlı)</span><StatusChips label="Kaynak durum" value={value.from || []} ctx={ctx} anyLabel="Herhangi" onChange={from => onChange({ ...value, from })} /></>)}
                </>
            )}
            {value.kind === 'field' && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Değişen alan">
                    {TRIGGER_FIELDS.map(f => {
                        const on = value.fields.includes(f);
                        return <button key={f} type="button" className={`m-pill ${on ? 'm-tone-accent font-semibold' : ''}`} aria-pressed={on} onClick={() => onChange({ ...value, fields: on ? value.fields.filter(x => x !== f) : [...value.fields, f] })}>{FIELD_LABELS[f]}</button>;
                    })}
                </div>
            )}
            {value.kind === 'schedule' && <span className="text-[13px] m-text-3">Günde bir kez (uygulama ilk açıldığında ya da açıkken gün dönünce) koşula uyan görevlere uygulanır. Ör. gecikenleri etiketle, terminine 2 gün kalanı bildir.</span>}
            {value.kind === 'created' && <span className="text-[13px] m-text-3">Yeni kayıt, içe aktarma ya da Jira eşitlemesiyle gelen yeni görevlerde.</span>}
        </div>
    );
};

interface ValueOpts { ctx: AutomationContext; project: Project; names: string[] }

const enumOptions = (field: AutomationField, o: ValueOpts): [string, string][] | null => {
    switch (field) {
        case 'status': case 'fromStatus': return o.ctx.workflow.statuses.map(s => [s.key, s.label]);
        case 'category': return (Object.keys(CATEGORY_LABELS) as TaskStatus[]).map(k => [k, CATEGORY_LABELS[k]]);
        case 'role': return o.ctx.roleDefs.map(r => [r.id, r.name]);
        case 'component': return (o.project.components || []).map(c => [c.name, c.name]);
        case 'issueType': return ISSUE_TYPES;
        case 'priority': return PRIORITIES.map(p => [p, p]);
        case 'fixVersion': return (o.project.versions || []).map(v => [v.name, v.name]);
        case 'overdue': return [['true', 'evet'], ['false', 'hayır']];
        case 'assignee': return o.names.map(n => [n, n]);
        default: return null;
    }
};

const CondValue: React.FC<{ c: AutomationCondition; opts: ValueOpts; onChange: (v: AutomationCondition['value']) => void }> = ({ c, opts, onChange }) => {
    if (c.op === 'empty' || c.op === 'notEmpty') return null;
    const choices = ENUM_FIELDS.includes(c.field) ? enumOptions(c.field, opts) : null;
    const list = Array.isArray(c.value) ? c.value.map(String) : c.value === undefined || c.value === '' ? [] : [String(c.value)];
    if (choices && choices.length && (c.op === 'in' || c.op === 'notIn')) {
        return (
            <div className="flex flex-wrap gap-1" role="group" aria-label={`${FIELD_LABELS[c.field]} değerleri`}>
                {choices.map(([v, l]) => {
                    const on = list.includes(v);
                    return <button key={v} type="button" className={`m-pill !h-7 text-[12.5px] ${on ? 'm-tone-accent font-semibold' : ''}`} aria-pressed={on} onClick={() => onChange(on ? list.filter(x => x !== v) : [...list, v])}>{l}</button>;
                })}
            </div>
        );
    }
    if (choices && choices.length && c.op !== 'contains') {
        return (
            <select aria-label={`${FIELD_LABELS[c.field]} değeri`} className="m-input !h-9 !py-0 !w-auto max-w-[260px] text-[14px]" value={list[0] || ''} onChange={e => onChange(e.target.value)}>
                <option value="">Seçin…</option>
                {choices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
        );
    }
    const numeric = NUM_FIELDS.includes(c.field);
    return <input aria-label={`${FIELD_LABELS[c.field]} değeri`} className="m-input !h-9 !py-0 !w-[180px] text-[14px]" type={numeric ? 'number' : 'text'} value={list.join(', ')}
        placeholder={numeric ? '0' : c.op === 'in' || c.op === 'notIn' ? 'virgülle ayırın' : 'değer'}
        onChange={e => onChange(numeric ? (e.target.value === '' ? undefined : Number(e.target.value)) : c.op === 'in' || c.op === 'notIn' ? e.target.value.split(',').map(x => x.trim()).filter(Boolean) : e.target.value)} />;
};

const CondRow: React.FC<{ c: AutomationCondition; fields: AutomationField[]; opts: ValueOpts; onChange: (c: AutomationCondition) => void; onRemove: () => void }> = ({ c, fields, opts, onChange, onRemove }) => (
    <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Alan" className="m-input !h-9 !py-0 !w-auto text-[14px]" value={c.field} onChange={e => { const f = e.target.value as AutomationField; onChange({ field: f, op: opsFor(f)[0], value: undefined }); }}>
            {fields.map(f => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
        </select>
        <select aria-label="Karşılaştırma" className="m-input !h-9 !py-0 !w-auto text-[14px]" value={c.op} onChange={e => onChange({ ...c, op: e.target.value as AutomationOp, value: undefined })}>
            {opsFor(c.field).map(o => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
        </select>
        <CondValue c={c} opts={opts} onChange={value => onChange({ ...c, value })} />
        <button type="button" className="m-icon-btn !w-8 !h-8" aria-label="Koşulu sil" onClick={onRemove}><Icon name="x" size={14} /></button>
    </div>
);

const ALL_FIELDS = Object.keys(FIELD_LABELS) as AutomationField[];

const SimpleConditions: React.FC<{ group: AutomationGroup; opts: ValueOpts; onChange: (g: AutomationGroup) => void }> = ({ group, opts, onChange }) => {
    const items = group.items.filter((x): x is AutomationCondition => !isGroup(x));
    return (
        <div className="flex flex-col gap-2">
            {items.length === 0 && <span className="text-[13px] m-text-3">Koşul yok: tetikleyiciye uyan tüm görevler.</span>}
            {items.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                    {i > 0 && <span className="text-[13px] font-semibold m-text-2">ve</span>}
                    <CondRow c={c} fields={SIMPLE_FIELDS.includes(c.field) ? SIMPLE_FIELDS : [c.field, ...SIMPLE_FIELDS]} opts={opts}
                        onChange={nc => onChange({ join: 'and', items: items.map((x, j) => (j === i ? nc : x)) })} onRemove={() => onChange({ join: 'and', items: items.filter((_, j) => j !== i) })} />
                </div>
            ))}
            {items.length < 3 && <button type="button" className="m-btn m-btn-plain !min-h-[32px] self-start text-[14px]" onClick={() => onChange({ join: 'and', items: [...items, { field: 'assignee', op: 'eq' }] })}><Icon name="plus" size={14} />Koşul ekle</button>}
        </div>
    );
};

const GroupEditor: React.FC<{ group: AutomationGroup; opts: ValueOpts; depth: number; onChange: (g: AutomationGroup) => void; onRemove?: () => void }> = ({ group, opts, depth, onChange, onRemove }) => (
    <div className={`flex flex-col gap-2 ${depth ? 'rounded-xl p-2.5 border m-sep' : ''}`} style={depth ? { borderStyle: 'dashed', borderWidth: 1 } : undefined}>
        <div className="flex items-center gap-2">
            <span className="text-[13px] m-text-3">Bağlaç</span>
            <div className="m-segmented" role="group" aria-label="Bağlaç">
                <button type="button" className="m-segment" aria-pressed={group.join === 'and'} onClick={() => onChange({ ...group, join: 'and' })}>VE (hepsi)</button>
                <button type="button" className="m-segment" aria-pressed={group.join === 'or'} onClick={() => onChange({ ...group, join: 'or' })}>VEYA (biri)</button>
            </div>
            <span className="flex-1"></span>
            {onRemove && <button type="button" className="m-btn m-btn-plain !min-h-[28px] text-[13px]" onClick={onRemove}>Grubu sil</button>}
        </div>
        {group.items.length === 0 && <span className="text-[13px] m-text-3">Koşul yok: tetikleyiciye uyan tüm görevler.</span>}
        {group.items.map((x, i) => (
            <div key={i} className="flex items-start gap-2">
                {i > 0 && <span className="text-[12.5px] font-semibold m-text-2 pt-2 w-9">{group.join === 'or' ? 'veya' : 've'}</span>}
                <div className="flex-1 min-w-0">
                    {isGroup(x)
                        ? <GroupEditor group={x} opts={opts} depth={depth + 1} onChange={ng => onChange({ ...group, items: group.items.map((y, j) => (j === i ? ng : y)) })} onRemove={() => onChange({ ...group, items: group.items.filter((_, j) => j !== i) })} />
                        : <CondRow c={x} fields={ALL_FIELDS} opts={opts} onChange={nc => onChange({ ...group, items: group.items.map((y, j) => (j === i ? nc : y)) })} onRemove={() => onChange({ ...group, items: group.items.filter((_, j) => j !== i) })} />}
                </div>
            </div>
        ))}
        <div className="flex gap-1.5">
            <button type="button" className="m-btn m-btn-plain !min-h-[32px] text-[14px]" onClick={() => onChange({ ...group, items: [...group.items, { field: 'status', op: 'eq' }] })}><Icon name="plus" size={14} />Koşul</button>
            {depth < 2 && <button type="button" className="m-btn m-btn-plain !min-h-[32px] text-[14px]" onClick={() => onChange({ ...group, items: [...group.items, { join: group.join === 'and' ? 'or' : 'and', items: [{ field: 'priority', op: 'eq' }] }] })}><Icon name="plus" size={14} />Grup ({group.join === 'and' ? 'VEYA' : 'VE'})</button>}
        </div>
    </div>
);

const ActionValue: React.FC<{ action: AutomationAction; opts: ValueOpts; onChange: (a: AutomationAction) => void }> = ({ action: a, opts, onChange }) => {
    const sel = 'm-input !h-9 !py-0 !w-auto max-w-[260px] text-[14px]';
    switch (a.kind) {
        case 'setStatus':
            return <select aria-label="Yeni durum" className={sel} value={a.status} onChange={e => onChange({ ...a, status: e.target.value })}>{opts.ctx.workflow.statuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>;
        case 'assign':
            return (
                <select aria-label="Atanacak" className={sel} value={a.to} onChange={e => onChange({ ...a, to: e.target.value })}>
                    <option value="">Seçin…</option>
                    <option value="componentLead">Bileşen sorumlusu</option>
                    <option value="none">Atamayı kaldır</option>
                    {opts.names.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
            );
        case 'setPriority':
            return <select aria-label="Öncelik" className={sel} value={a.priority} onChange={e => onChange({ ...a, priority: e.target.value as Task['priority'] })}>{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select>;
        case 'setSprint':
            return (
                <select aria-label="Sprint" className={sel} value={String(a.sprint)} onChange={e => onChange({ ...a, sprint: e.target.value === 'next' ? 'next' : Number(e.target.value) })}>
                    <option value="next">Sonraki sprint</option><option value="0">Havuz</option>
                    {Array.from({ length: 24 }, (_, i) => i + 1).map(n => <option key={n} value={n}>Sprint {n}</option>)}
                </select>
            );
        case 'setFixVersion':
            return (
                <select aria-label="Sürüm" className={sel} value={a.version} onChange={e => onChange({ ...a, version: e.target.value })}>
                    <option value="next">Sıradaki yayınlanmamış sürüm</option><option value="clear">Temizle</option>
                    {(opts.project.versions || []).map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                </select>
            );
        case 'setDueDate':
            return (
                <span className="flex items-center gap-1.5 text-[14px]">
                    <select aria-label="Termin" className={sel} value={a.days === 'clear' ? 'clear' : 'days'} onChange={e => onChange({ ...a, days: e.target.value === 'clear' ? 'clear' : 3 })}><option value="days">Bugünden</option><option value="clear">Temizle</option></select>
                    {a.days !== 'clear' && <><input aria-label="Gün" type="number" min={0} max={365} className="m-input !h-9 !py-0 !w-[80px]" value={a.days} onChange={e => onChange({ ...a, days: Math.max(0, Number(e.target.value) || 0) })} />gün sonra</>}
                </span>
            );
        case 'addLabels': case 'removeLabels':
            return <input aria-label="Etiketler" className="m-input !h-9 !py-0 !w-[220px] text-[14px]" placeholder="etiket1, etiket2" value={a.labels.join(', ')} onChange={e => onChange({ ...a, labels: e.target.value.split(',').map(x => x.trimStart()) })} />;
        case 'setResolution':
            return <input aria-label="Çözüm" className="m-input !h-9 !py-0 !w-[200px] text-[14px]" value={a.resolution} onChange={e => onChange({ ...a, resolution: e.target.value })} />;
        case 'comment':
            return <input aria-label="Yorum" className="m-input !h-9 !py-0 flex-1 min-w-[240px] text-[14px]" placeholder="Göreve eklenecek yorum" value={a.text} onChange={e => onChange({ ...a, text: e.target.value })} />;
        case 'notify':
            return (
                <span className="flex flex-wrap items-center gap-1.5">
                    <select aria-label="Kime" className={sel} value={a.to} onChange={e => onChange({ ...a, to: e.target.value as 'assignee' | 'role' | 'teams', roleId: e.target.value === 'role' ? opts.ctx.roleDefs[0]?.id : undefined })}>
                        <option value="assignee">Atanana</option><option value="role">Rol üyelerine</option><option value="teams">Teams kanalına</option>
                    </select>
                    {a.to === 'role' && <select aria-label="Rol" className={sel} value={a.roleId || ''} onChange={e => onChange({ ...a, roleId: e.target.value })}>{opts.ctx.roleDefs.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
                    <input aria-label="Ek mesaj" className="m-input !h-9 !py-0 !w-[220px] text-[14px]" placeholder="Ek mesaj (isteğe bağlı)" value={a.text || ''} onChange={e => onChange({ ...a, text: e.target.value || undefined })} />
                    <span className="text-[12px] m-text-3">{describeAction(a, opts.ctx)}</span>
                </span>
            );
    }
};

export default AutomationRulesSheet;
