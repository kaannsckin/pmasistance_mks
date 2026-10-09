import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TaskStatus } from '../../types';
import { analyzeDataHealth } from '../../utils/dataHealth';
import { serializeWorkspace } from '../../utils/workspace';
import { runChecks } from './check';
import { addDays, createState, createWorld, DayEvents, eventsMarkdown, jiraExports, personaOwned, runUntil, SimState } from './sim';
import { PERSONAS, PROJECTS } from './world';

const START = '2026-06-01';
const END = '2026-07-15';

/** Kurulum gibi: tüm projelerin Jira geçmişi aktarılmış */
const simulate = (tohum = 2026, end = END) => {
    const state = createState(tohum, START);
    const events: DayEvents[] = [];
    const ws = runUntil(state, createWorld(tohum, START), end, e => events.push(e), { importAll: true });
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
        let ws = runUntil(state, createWorld(2026, START), '2026-06-20', undefined, { importAll: true });
        const restored = JSON.parse(JSON.stringify(state)) as SimState;
        ws = runUntil(restored, JSON.parse(serializeWorkspace(ws, false)), END, undefined, { importAll: true });
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

    it('günlük ilerlemede Jira yalnız arka plandaki PY\'nin projesine aktarılır; persona PY\'ler kendisi aktarır', () => {
        const state = createState(2026, START);
        const ws0 = runUntil(state, createWorld(2026, START), '2026-07-01', undefined, { importAll: true });
        const events: DayEvents[] = [];
        const ws1 = runUntil(state, ws0, END, e => events.push(e));
        const count = (w: typeof ws0, id: string) => w.projects.find(p => p.id === id)!.tasks.length;
        expect(personaOwned('prj-atlas')).toBe(true);
        expect(personaOwned('prj-kalkan')).toBe(false);
        // ATLAS'ın Jira'sı büyüdü ama uygulamadaki görevleri değişmedi (Elif aktarmadı); KALKAN arka planda güncel
        expect(state.jira.ATL.issues.length).toBeGreaterThan(count(ws1, 'prj-atlas'));
        expect(count(ws1, 'prj-atlas')).toBe(count(ws0, 'prj-atlas'));
        expect(count(ws1, 'prj-kalkan')).toBe(state.jira.KLK.issues.length);
        // Persona projelerinde risk eklenmez, olaylarda sinyal olarak görünür; RAG'i de PY günceller
        expect(ws1.projects.find(p => p.id === 'prj-nehir')!.risks!.length).toBe(ws0.projects.find(p => p.id === 'prj-nehir')!.risks!.length);
        expect(events.some(e => e.projeler.NHR?.riskler.some(r => r.includes('sinyal')))).toBe(true);
        expect(events.every(e => !e.projeler.ATL?.rag)).toBe(true);
        // Jira dışa aktarımı: tüm kayıtlar, termin ve worklog dahil
        const atl = jiraExports(state).ATL;
        expect(atl.total).toBe(state.jira.ATL.issues.length);
        expect(atl.issues.filter(i => i.fields.duedate).length).toBeGreaterThan(atl.total * 0.9);
        expect(atl.issues.some(i => (i.fields.worklog?.total || 0) > 0)).toBe(true);
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

    it('pilot 1. gün bulgularının düzeltmeleri: tahsis rolü, yönetici kapasitesi, tekrarsız istek, worklog ayrımı, tarih', () => {
        const { ws, events } = simulate();
        expect(ws.allocations.every(a => !!a.role)).toBe(true);
        expect(ws.allocations.find(a => a.personId === 'p13' && a.projectId === 'prj-atlas')!.role).toBe('Proje Yöneticisi');
        expect(ws.people.find(p => p.id === 'p01')!.availableAA).toBe(0.3);
        expect(ws.people.find(p => p.id === 'p21')!.roles).toEqual(['Birim Yöneticisi']);
        ws.projects.forEach(p => expect(new Set(p.customerRequests.map(r => r.title)).size).toBe(p.customerRequests.length));
        expect(ws.projects.every(p => p.createdAt <= '2026-06-01T23:59:59Z')).toBe(true);
        const day = events.find(e => e.gun === '2026-07-08')!;
        expect(day.projeler.ATL.genelSaat).toBeGreaterThan(0);
        expect(eventsMarkdown(day)).toContain('Jira dışı genel gider');
    });

    it('uygulamanın veri sağlığı motoru üretilen veride çalışır', () => {
        const { ws } = simulate();
        expect(() => analyzeDataHealth(ws)).not.toThrow();
    });

    it('beş pilot kullanıcısıyla otomatik kontrollerin hepsi geçer', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'pilot-test-'));
        try {
            const path = join(dir, 'workspace.json');
            const sim = simulate(2026, addDays(END, 0));
            await writeFile(path, serializeWorkspace(sim.ws, false));
            await mkdir(join(dir, 'jira'));
            for (const [key, resp] of Object.entries(jiraExports(sim.state))) await writeFile(join(dir, 'jira', `${key}.json`), JSON.stringify(resp));
            const results = await runChecks(path, { now: new Date('2026-07-16T07:00:00Z') });
            const failed = results.filter(r => r.durum === 'KALDI');
            expect(failed).toEqual([]);
            expect(results.filter(r => r.durum === 'GEÇTİ').length).toBeGreaterThanOrEqual(26);
            expect(results.map(r => r.ad)).toEqual(expect.arrayContaining(['elif: jira_aktar → onay → görevler Jira ile aynı', 'burak: başkasının projesine Jira aktarımı reddedilir']));
            expect(results.map(r => r.ad)).toEqual(expect.arrayContaining(PERSONAS.map(p => `${p.id}: bağlantı ve kimlik`)));
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    }, 30_000);
});
