import { describe, expect, it } from 'vitest';
import { Project, Task, TaskStatus } from '../types';
import { columnOfTask } from './board';
import {
    boardForProject, builtinDefaultScheme, copyScheme, createScheme, linearTransitions, migrateTasksToWorkflow, missingRequiredFields,
    schemeOf, schemesOf, schemeUsage, validateScheme,
} from './projectScheme';
import { canTransition, taskStatusLabel, transitionToCategory, workflowOptions } from './workflow';

const task = (extra: Partial<Task> = {}): Task => ({
    id: 't', name: 'Görev', availability: true, priority: 'Medium', version: 1, predecessor: null, unit: 'U310', resourceName: '',
    time: { best: 0, avg: 0, worst: 0 }, jiraId: '', notes: '', status: TaskStatus.ToDo, ...extra,
});
const project = (id: string, extra: Partial<Project> = {}) => ({ id, name: id, tasks: [], ...extra } as unknown as Project);

describe('yapılandırma şemaları', () => {
    it('atanmamış proje yerleşik varsayılanı kullanır; admin varsayılanı düzenleyebilir', () => {
        const support = { ...createScheme('support', 'SPS'), id: 'sps' };
        const ws = { projectSchemes: [support], projects: [project('a'), project('b', { schemeId: 'sps' }), project('c', { schemeId: 'silinmis' })] };
        expect(schemeOf(ws, ws.projects[0]).id).toBe('default');
        expect(schemeOf(ws, ws.projects[1]).name).toBe('SPS');
        expect(schemeOf(ws, ws.projects[2]).id).toBe('default');
        expect(schemeUsage(ws, 'sps').map(p => p.id)).toEqual(['b']);
        const edited = { ...builtinDefaultScheme(), name: 'Kurum varsayılanı' };
        expect(schemesOf({ projectSchemes: [support, edited] }).map(s => s.name)).toEqual(['Kurum varsayılanı', 'SPS']);
    });

    it('hazır şablonlar geçerlidir; kopya yeni kimlik alır', () => {
        for (const k of ['basic', 'software', 'support', 'full'] as const) expect(validateScheme(createScheme(k, k))).toEqual([]);
        const s = createScheme('support', 'Destek');
        const c = copyScheme(s);
        expect([c.id !== s.id, c.name, c.workflow.statuses.length]).toEqual([true, 'Destek (kopya)', 6]);
    });

    it('doğrulama: boş ad, tekrar eden anahtar, ulaşılamayan durum', () => {
        const s = createScheme('software', 'X');
        expect(validateScheme({ ...s, name: ' ' })).toContain('Şema adı boş olamaz.');
        const dup = { ...s, workflow: { ...s.workflow, statuses: [...s.workflow.statuses, { key: 'DONE', label: 'Bitti', category: TaskStatus.Done }] } };
        expect(validateScheme(dup).join(' ')).toMatch(/Aynı anahtar/);
        const cut = { ...s, workflow: { ...s.workflow, transitions: { ...s.workflow.transitions!, 'TESTING': ['IN PROGRESS'] } } };
        expect(validateScheme(cut).join(' ')).toMatch(/ulaşılamayan durum: Tamamlandı/);
        const noDone = { ...s, workflow: { ...s.workflow, statuses: s.workflow.statuses.filter(x => x.category !== TaskStatus.Done), transitions: undefined } };
        expect(validateScheme(noDone).join(' ')).toMatch(/Tamamlandı/);
    });

    it('doğrusal geçişler: ileri, geri ve sondan başa', () => {
        const wf = createScheme('basic', 'B').workflow;
        expect(linearTransitions(wf)).toEqual({ 'TO DO': ['IN PROGRESS'], 'IN PROGRESS': ['DONE', 'TO DO'], 'DONE': ['IN PROGRESS', 'TO DO'] });
    });

    it('zorunlu alanlar', () => {
        const s = { ...createScheme('basic', 'B'), requiredFields: ['resourceName', 'dueDate', 'estimate', 'labels'] as const };
        expect(missingRequiredFields({ ...s, requiredFields: [...s.requiredFields] }, task())).toEqual(['Atanan kişi', 'Bitiş tarihi', 'Süre tahmini', 'En az bir etiket']);
        expect(missingRequiredFields({ ...s, requiredFields: [...s.requiredFields] }, task({ resourceName: 'A', dueDate: '2026-12-01', time: { best: 1, avg: 2, worst: 3 }, labels: ['x'] }))).toEqual([]);
    });

    it('pano: şema izin veriyorsa projeye özel, yoksa şemanın; o da yoksa iş akışından', () => {
        const s = createScheme('support', 'S');
        const own = { columns: [{ id: 'x', name: 'Tek', statuses: ['app:ToDo' as const], targetStatus: TaskStatus.ToDo }], rulePriority: 'status' as const, quickFilters: [], swimlane: 'none' as const };
        expect(boardForProject(s, { boardConfig: own }).source).toBe('auto'); // support: allowProjectBoard=false
        expect(boardForProject({ ...s, allowProjectBoard: true }, { boardConfig: own }).source).toBe('project');
        const auto = boardForProject(s, {}).config;
        expect(auto.columns.map(c => c.name)).toEqual(['Yapılacak', 'Analizde', 'Testte', 'Tamamlandı']);
        expect(columnOfTask(task({ status: TaskStatus.Done, jiraStatus: 'RESOLVED' }), auto)?.name).toBe('Tamamlandı');
        expect(columnOfTask(task({ status: TaskStatus.InProgress, jiraStatus: 'TESTING' }), auto)?.name).toBe('Testte');
        expect(boardForProject({ ...s, board: own }, {}).config.columns.map(c => c.name)).toEqual(['Tek']);
    });

    it('iş akışı değişince yerel görevler taşınır, Jira görevleri korunur', () => {
        const wf = createScheme('basic', 'B').workflow;
        const r = migrateTasksToWorkflow([
            task({ id: '1', status: TaskStatus.InProgress, jiraStatus: 'TESTING' }),
            task({ id: '2', status: TaskStatus.InProgress, jiraStatus: 'TESTING', jiraId: 'SPS-1' }),
            task({ id: '3', status: TaskStatus.Done, jiraStatus: 'DONE' }),
            task({ id: '4', status: TaskStatus.ToDo }),
        ], wf);
        expect(r.moved).toBe(1);
        expect(r.tasks.map(t => [t.id, t.jiraStatus])).toEqual([['1', 'IN PROGRESS'], ['2', 'TESTING'], ['3', 'DONE'], ['4', undefined]]);
    });
});

describe('iş akışı geçiş kuralları', () => {
    const wf = createScheme('support', 'S').workflow;
    it('yalnız tanımlı geçişler; tanımsız (Jira) durumdan serbest', () => {
        expect(canTransition(wf, 'OPEN', 'ANALYSIS')).toBe(true);
        expect(canTransition(wf, 'OPEN', 'RESOLVED')).toBe(false);
        expect(canTransition(wf, 'closed', 'reopened')).toBe(true);
        expect(canTransition(wf, 'WAFER CLEANING', 'CLOSED')).toBe(true);
        expect(canTransition({ ...wf, transitions: undefined }, 'OPEN', 'RESOLVED')).toBe(true);
    });

    it('seçenekler yalnız izin verilen geçişleri ve mevcut durumu içerir; adlar şemadan', () => {
        const t = task({ status: TaskStatus.ToDo, jiraStatus: 'OPEN' });
        const keys = workflowOptions([], wf, t).flatMap(g => g.statuses.map(s => s.key));
        expect(keys).toEqual(['OPEN', 'ANALYSIS', 'CLOSED']);
        const custom = { ...wf, statuses: wf.statuses.map(s => (s.key === 'ANALYSIS' ? { ...s, label: 'İnceleme' } : s)) };
        expect(taskStatusLabel(task({ status: TaskStatus.InProgress, jiraStatus: 'analysis' }), custom)).toBe('İnceleme');
        // Ayrıntılı durumu olmayan görev, kategorinin şemadaki ilk durumuyla görünür
        expect(taskStatusLabel(task({ status: TaskStatus.ToDo }), wf)).toBe('Açık');
    });

    it('kategori isteği izin verilen ilk duruma çevrilir; yoksa reddedilir', () => {
        expect(transitionToCategory(task({ jiraStatus: 'OPEN' }), TaskStatus.InProgress, wf)?.key).toBe('ANALYSIS');
        expect(transitionToCategory(task({ jiraStatus: 'OPEN' }), TaskStatus.Done, wf)?.key).toBe('CLOSED');
        expect(transitionToCategory(task({ status: TaskStatus.InProgress, jiraStatus: 'TESTING' }), TaskStatus.ToDo, wf)).toBeNull();
        expect(transitionToCategory(task({ status: TaskStatus.Done, jiraStatus: 'RESOLVED' }), TaskStatus.ToDo, wf)?.key).toBe('REOPENED');
    });
});

describe('projeye özel iş akışı', () => {
    const scheme = { ...createScheme('support', 'S'), id: 's', allowProjectWorkflow: true };
    it('yalnız şemanın durumlarıyla; şemadan çıkarılan durum özel akıştan da düşer', async () => {
        const { effectiveScheme, validateProjectWorkflow } = await import('./projectScheme');
        const own = { statuses: scheme.workflow.statuses.filter(s => s.key !== 'REOPENED'), initial: 'OPEN', transitions: { 'OPEN': ['ANALYSIS', 'GONE'], 'ANALYSIS': ['RESOLVED'], 'RESOLVED': ['CLOSED'], 'GONE': ['OPEN'] } };
        const eff = effectiveScheme({ projectSchemes: [scheme] }, { schemeId: 's', workflowOverride: own });
        expect(eff.workflowSource).toBe('project');
        expect(eff.workflow.statuses.map(s => s.key)).toEqual(['OPEN', 'ANALYSIS', 'TESTING', 'RESOLVED', 'CLOSED']);
        expect(eff.workflow.transitions).toEqual({ 'OPEN': ['ANALYSIS'], 'ANALYSIS': ['RESOLVED'], 'RESOLVED': ['CLOSED'] });
        expect(effectiveScheme({ projectSchemes: [{ ...scheme, allowProjectWorkflow: false }] }, { schemeId: 's', workflowOverride: own }).workflowSource).toBe('scheme');
        expect(validateProjectWorkflow(scheme, { ...own, statuses: [...own.statuses, { key: 'NEW', label: 'Yeni', category: TaskStatus.InProgress }] }).join(' ')).toMatch(/Yalnız yapılandırmanın durumları/);
    });

    it('otomatik yerleşim: kategori sütunları, kayıtlı konumlar korunur', async () => {
        const { autoLayout } = await import('../components/modern/admin/WorkflowDesigner');
        const wf = { ...scheme.workflow, layout: { 'OPEN': { x: 500, y: 300 } } };
        const l = autoLayout(wf);
        expect(l['OPEN']).toEqual({ x: 500, y: 300 });
        expect(l['REOPENED']).toEqual({ x: 60, y: 40 });
        expect(l['ANALYSIS'].x).toBeGreaterThan(l['REOPENED'].x);
        expect(l['CLOSED'].x).toBeGreaterThan(l['TESTING'].x);
        expect(autoLayout(wf, false)['OPEN']).toEqual({ x: 60, y: 40 });
    });
});
