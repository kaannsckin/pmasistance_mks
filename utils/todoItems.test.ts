import { describe, it, expect } from 'vitest';
import { buildTodoItems, todoBadgeCount } from './todoItems';
import { createEmptyWorkspace, createProject } from './workspace';
import { TaskStatus, View, WorkspaceData } from '../types';

const NOW = new Date('2026-04-10T09:00:00Z'); // Nisan → Oca-Mar geçmiş aylar

const buildWs = (): WorkspaceData => {
    const p1 = createProject('Proje A');
    const p2 = createProject('Proje B');
    p2.rag = 'red';
    p2.ragNote = 'Bütçe aşımı';
    p1.tasks = [
        { id: 't1', name: 'Geciken', availability: true, priority: 'High', version: 1, predecessor: null, unit: 'X', resourceName: 'K', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.ToDo, dueDate: '2026-04-01' },
        { id: 't2', name: 'Biten', availability: true, priority: 'High', version: 1, predecessor: null, unit: 'X', resourceName: 'K', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.Done, dueDate: '2026-04-01' },
    ];
    return {
        ...createEmptyWorkspace(),
        currentRole: 'py',
        projects: [p1, p2],
        people: [{ id: 'k1', firstName: 'Kaan', lastName: 'T', departmentCode: 'U310', availableAA: 1, roles: [] }],
        allocations: [
            // Oca-Şub plan var; Oca gerçekleşen var, Şub-Mar yok (Mar plansız → sayılmaz)
            { id: 'a1', personId: 'k1', projectId: p1.id, year: 2026, plan: { 1: 0.5, 2: 0.6 }, actual: { 1: 0.5 } },
        ],
        planLocks: [{ projectId: p2.id, year: 2026, status: 'submitted' }],
    };
};

describe('buildTodoItems', () => {
    it('PY: eksik gerçekleşen ayı, taslak planı, geciken görevi ve kritik projeyi listeler', () => {
        const items = buildTodoItems(buildWs(), NOW);
        const texts = items.map(i => i.text).join(' | ');
        expect(texts).toContain('Gerçekleşen girilmemiş aylar: Şub');
        expect(texts).not.toContain('Mar'); // Mart'ta plan yok → istenmez
        expect(texts).toContain('Proje A — 2026 planı henüz onaya gönderilmedi');
        expect(texts).toContain('Proje A — 1 görev terminini aştı');
        expect(texts).toContain('Proje B kritik durumda — Bütçe aşımı');
        // PY onaylayıcı değil → onay bekleyen kalemi görmez
        expect(texts).not.toContain('onayınızı bekliyor');
        // danger önce gelir
        expect(items[0].severity).toBe('danger');
    });

    it('Müdür: onay bekleyeni görür, veri girişi kalemlerini görmez; kritik proje Yönetim ekranına gider', () => {
        const ws = { ...buildWs(), currentRole: 'mudur' as const };
        const items = buildTodoItems(ws, NOW);
        const texts = items.map(i => i.text).join(' | ');
        expect(texts).toContain('Proje B — 2026 planı onayınızı bekliyor');
        expect(texts).not.toContain('Gerçekleşen girilmemiş');
        expect(texts).not.toContain('onaya gönderilmedi');
        const rag = items.find(i => i.id.startsWith('rag-'))!;
        expect(rag.view).toBe(View.Executive);
    });

    it('PYB Destek: havuz eksiklerini görür', () => {
        const ws = { ...buildWs(), currentRole: 'pyb_destek' as const };
        ws.titles = [{ code: 'ARŞ', name: 'Araştırmacı' }]; // maliyetsiz
        const items = buildTodoItems(ws, NOW);
        const texts = items.map(i => i.text).join(' | ');
        expect(texts).toContain('1 personelin ünvanı eksik');
        expect(texts).toContain('1 ünvanın aylık maliyeti girilmemiş');
    });

    it('aşırı tahsis uyarısı üretir; geciken görev kalemi proje bağlamı taşır', () => {
        const ws = buildWs();
        ws.allocations.push({ id: 'a2', personId: 'k1', projectId: ws.projects[1].id, year: 2026, plan: { 2: 0.9 }, actual: {} });
        const items = buildTodoItems(ws, NOW);
        expect(items.some(i => i.text.includes('aşırı tahsis'))).toBe(true);
        const overdue = items.find(i => i.id.startsWith('overdue-'))!;
        expect(overdue.projectId).toBe(ws.projects[0].id);
        expect(overdue.view).toBe(View.Tasks);
    });

    it('todoBadgeCount info kalemlerini saymaz', () => {
        const items = buildTodoItems(buildWs(), NOW);
        const badge = todoBadgeCount(items);
        expect(badge).toBe(items.filter(i => i.severity !== 'info').length);
        expect(badge).toBeGreaterThan(0);
        expect(badge).toBeLessThan(items.length); // info'lar var
    });
});
