import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TaskStatus } from '../../types';
import { analyzeDataHealth } from '../../utils/dataHealth';
import { serializeWorkspace } from '../../utils/workspace';
import { runChecks } from './check';
import { addDays, createState, createWorld, DayEvents, eventsMarkdown, runUntil, SimState } from './sim';
import { PERSONAS, PROJECTS } from './world';

const START = '2026-06-01';
const END = '2026-07-15';

const simulate = (tohum = 2026, end = END) => {
    const state = createState(tohum, START);
    const events: DayEvents[] = [];
    const ws = runUntil(state, createWorld(tohum, START), end, e => events.push(e));
    return { state, ws, events };
};

describe('pilot simülasyonu', () => {
    it('aynı tohum aynı veriyi, farklı tohum farklı veriyi üretir', () => {
        const a = serializeWorkspace(simulate().ws, false).replace(/"exportDate":"[^"]+"/, '');
        const b = serializeWorkspace(simulate().ws, false).replace(/"exportDate":"[^"]+"/, '');
        expect(a).toBe(b);
        expect(serializeWorkspace(simulate(7).ws, false)).not.toBe(a);
    });

    it('günler parça parça ilerletilince (durum JSON\'a yazılıp okunarak) aynı sonuç çıkar', () => {
        const once = simulate();
        const state = createState(2026, START);
        let ws = runUntil(state, createWorld(2026, START), '2026-06-20');
        const restored = JSON.parse(JSON.stringify(state)) as SimState;
        ws = runUntil(restored, JSON.parse(serializeWorkspace(ws, false)), END);
        // Alan sırası farklı olabilir (JSON'da tanımsız alanlar düşer); içerik aynı olmalı
        const plain = (x: typeof ws) => ({ ...JSON.parse(serializeWorkspace(x, false)), exportDate: undefined });
        expect(plain(ws)).toEqual(plain(once.ws));
        expect(JSON.stringify(restored)).toBe(JSON.stringify(once.state));
    });

    it('Jira akışı uygulamanın içe aktarımıyla geçerli görevlere dönüşür', () => {
        const { ws } = simulate();
        const active = ws.projects.filter(p => PROJECTS.find(w => w.id === p.id)!.rate > 0);
        expect(active).toHaveLength(4);
        for (const p of active) {
            expect(p.tasks.length).toBeGreaterThan(10);
            for (const t of p.tasks) {
                expect(t.jiraId).toMatch(/^[A-Z]{3}-\d+$/);
                expect(t.createdAt).toBeTruthy();
                expect(t.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
                if (t.status === TaskStatus.Done) expect(t.resolvedAt! >= t.createdAt!).toBe(true);
                if (t.status === TaskStatus.InProgress) expect(t.startedAt).toBeTruthy();
                if (t.startedAt) expect(t.startedAt >= t.createdAt!).toBe(true);
                (t.statusLog || []).forEach(c => expect(c.at >= t.createdAt!).toBe(true));
            }
            expect(p.tasks.some(t => t.status === TaskStatus.Done)).toBe(true);
            expect(p.notes.length).toBeGreaterThan(3);
        }
        // Teklif aşamasındaki projede Jira akışı yok
        expect(ws.projects.find(p => p.id === 'prj-yildiz')!.tasks).toHaveLength(0);
    });

    it('ay başında worklog saatleri gerçekleşen adam-aya çevrilir (izin düşülür)', () => {
        const { ws } = simulate();
        const row = ws.allocations.find(a => a.personId === 'p02' && a.projectId === 'prj-atlas')!;
        // Haziran simülasyondan; Temmuz'da 0,25 AA eğitim izni var ama ay henüz kapanmadı
        expect(row.actual[6]).toBeGreaterThan(0.5);
        expect(row.actual[6]).toBeLessThanOrEqual(row.plan[6] * 1.2);
        expect(row.actual[7]).toBeUndefined();
        // Simülasyondan önceki aylar plan × sapma
        expect(row.actual[5]).toBeGreaterThan(0);
    });

    it('haftalık raporlar akıştan geçer; olaylar okunur Markdown olur', () => {
        const { ws, events } = simulate();
        const reports = ws.weeklyReports || [];
        expect(reports.length).toBeGreaterThan(10);
        expect(reports.some(r => r.stage === 'approved')).toBe(true);
        expect(reports.every(r => r.history[0].action === 'create')).toBe(true);
        const friday = events.find(e => e.gun === '2026-07-10')!;
        const md = eventsMarkdown(friday);
        expect(md).toContain('# 2026-07-10');
        expect(md).toContain('Haftalık rapor');
        expect(events.find(e => e.gun === '2026-07-11')!.isGunu).toBe(false);
    });

    it('uygulamanın veri sağlığı motoru üretilen veride çalışır', () => {
        const { ws } = simulate();
        expect(() => analyzeDataHealth(ws)).not.toThrow();
    });

    it('beş pilot kullanıcısıyla otomatik kontrollerin hepsi geçer', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'pilot-test-'));
        try {
            const path = join(dir, 'workspace.json');
            await writeFile(path, serializeWorkspace(simulate(2026, addDays(END, 0)).ws, false));
            const results = await runChecks(path, { now: new Date('2026-07-16T07:00:00Z') });
            const failed = results.filter(r => r.durum === 'KALDI');
            expect(failed).toEqual([]);
            expect(results.filter(r => r.durum === 'GEÇTİ').length).toBeGreaterThanOrEqual(20);
            expect(results.map(r => r.ad)).toEqual(expect.arrayContaining(PERSONAS.map(p => `${p.id}: bağlantı ve kimlik`)));
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    }, 30_000);
});
