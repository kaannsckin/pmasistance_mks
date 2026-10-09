import { describe, expect, it } from 'vitest';
import { Project, ReleasePlan, Resource, Task, TaskStatus } from '../../types';
import { milestoneLabels, milestonePrompt, parseMilestones } from '../ai/milestoneSuggestion';
import { createProject } from '../workspace';
import { buildHistory } from './history';
import { runMonteCarlo } from './monteCarlo';
import { buildSimulation } from './simulationInput';
import {
    applyCommit, autoMilestones, BASELINE_ITERATIONS, baselineGroups, buildReleaseSimulation, choiceOf, commitGroups, commitReleasePlan, createReleasePlan, decisionOf, effortOf, finalizeCommit, groupOf, itemFromTask, newItem,
    parsePastedItems, priorityOf, RELEASE_GROUP, releaseDates, sanitizeMilestones, suggestDescope, virtualProject, withReference,
} from './releasePlan';

const NOW = new Date('2026-10-07T10:00:00');
const res = (name: string, extra: Partial<Resource> = {}): Resource => ({ id: name, name, participation: 100, unit: 'Yazılım', title: 'Uzman', ...extra });
const task = (id: string, extra: Partial<Task> = {}): Task => ({
    id, name: `${id} kaydı`, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: 'Yazılım', resourceName: '',
    time: { best: 2, avg: 3, worst: 5 }, jiraId: '', notes: '', status: TaskStatus.ToDo, ...extra,
});
const project = (): Project => createProject('Sürüm', {
    settings: { sprintDuration: 2, projectStartDate: '2026-10-05', globalTestDays: 2 },
    resources: [res('Ayşe'), res('Ali')],
    workPackages: [{ id: 'wp1', name: 'Kimlik', description: '' }, { id: 'wp2', name: 'Raporlama', description: '' }],
    tasks: [task('mevcut', { version: 1, resourceName: 'Ayşe' }), task('havuz', { version: 0, name: 'Havuzdaki iş' })],
});
const plan = (items = [
    newItem({ name: 'Giriş', ownEstimateDays: 3, priority: 'Blocker', workPackageId: 'wp1' }),
    newItem({ name: 'Rapor', ownEstimateDays: 4, priority: 'Low', workPackageId: 'wp2' }),
    newItem({ name: 'Bildirim', ownEstimateDays: 2, priority: 'Medium', workPackageId: 'wp2' }),
]): ReleasePlan => ({ ...createReleasePlan(project(), NOW), name: 'Sürüm 2.0', items });

describe('kayıt girişi', () => {
    it('Excel (sekme) yapıştırmada başlık satırı sütunları eşler', () => {
        const items = parsePastedItems('Başlık\tAçıklama\tTür\tÖncelik\tTahmin\nGiriş hatası\tOturum düşüyor\tBug\tHigh\t2,5\nRapor\t\tStory\tLow\t', { unit: 'Yazılım' });
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({ name: 'Giriş hatası', notes: 'Oturum düşüyor', issueType: 'bug', priority: 'High', ownEstimateDays: 2.5, unit: 'Yazılım' });
        expect(items[1]).toMatchObject({ name: 'Rapor', issueType: 'feature', priority: 'Low' });
        expect(items[1].ownEstimateDays).toBeUndefined();
    });

    it('başlıksız "başlık | açıklama" ve düz satırlar', () => {
        expect(parsePastedItems('A | açıklama A\nB | açıklama B').map(i => [i.name, i.notes])).toEqual([['A', 'açıklama A'], ['B', 'açıklama B']]);
        expect(parsePastedItems('Tek satır\n\n İkinci ').map(i => i.name)).toEqual(['Tek satır', 'İkinci']);
    });

    it('havuzdaki görevden satır: kaynak görev ve tahmin korunur', () => {
        const i = itemFromTask(task('h', { time: { best: 1, avg: 2, worst: 3 }, workPackageId: 'wp1' }));
        expect(i).toMatchObject({ sourceTaskId: 'h', ownEstimateDays: 2, workPackageId: 'wp1' });
        // Üç noktalı tahmin aralığıyla korunur; kendi tahmin değişince tek değer olur
        const r = itemFromTask(task('r', { time: { best: 1, avg: 3, worst: 8 } }));
        expect(effortOf(r)).toEqual({ best: 1, likely: 3, worst: 8 });
        expect(effortOf({ ...r, ownEstimateDays: 5 })).toEqual({ best: 5, likely: 5, worst: 5 });
    });

    it('geçmişten / AI\'dan / modelden üretilmiş tahmin "kendi tahminim" sayılmaz', () => {
        for (const estimateSource of ['reference', 'ai', 'model'] as const) {
            const i = itemFromTask(task('m', { time: { best: 1, avg: 2, worst: 4 }, estimateSource }));
            expect(i.ownEstimateDays).toBeUndefined();
            expect(i.manual).toEqual({ best: 1, likely: 2, worst: 4 });
            expect(choiceOf(i)).toBe('manual');
        }
        expect(itemFromTask(task('u', { estimateSource: 'user' })).ownEstimateDays).toBeGreaterThan(0);
    });
});

describe('öneri seçimi ve karar', () => {
    it('varsayılan kaynak: güveni düşük olmayan AI → geçmiş → kendi; seçim ve elle düzeltme', () => {
        const ai = { promptVersion: 'x', effort: { best: 1, likely: 2, worst: 3 }, confidence: 'medium' as const, flags: [], evidence: [], questions: 0, priority: 'High' as const };
        const ref = { method: 'similar' as const, n: 8, confidence: 'high' as const, p50Days: 2, p80Days: 3, effort: { best: 2, likely: 3, worst: 5 }, priority: 'Low' as const };
        const i = newItem({ name: 'x', ownEstimateDays: 4, ai, reference: ref });
        expect(choiceOf(i)).toBe('ai');
        expect(priorityOf(i)).toBe('High');
        expect(choiceOf({ ...i, ai: { ...ai, confidence: 'low' } })).toBe('reference');
        expect(priorityOf({ ...i, choice: 'reference' })).toBe('Low');
        expect(effortOf({ ...i, choice: 'own' })).toEqual({ best: 4, likely: 4, worst: 4 });
        expect(decisionOf({ ...i, choice: 'manual', manual: { best: 1, likely: 1, worst: 2 } })).toBe('edited');
        expect(decisionOf({ ...i, excluded: true })).toBe('rejected');
        expect(decisionOf(newItem({ name: 'boş' }))).toBe('pending');
    });

    it('geçmiş kayıtlardan anlık öneri', () => {
        const hist = Array.from({ length: 6 }, (_, k) => task(`h${k}`, { name: `Giriş ekranı oturum hatası ${k}`, status: TaskStatus.Done, issueType: 'bug', startedAt: '2026-06-01T09:00:00', createdAt: '2026-06-01T09:00:00', resolvedAt: '2026-06-03T17:00:00' }));
        const h = buildHistory([createProject('G', { tasks: hist })]);
        const i = withReference(newItem({ name: 'Giriş ekranı oturum hatası yeni', issueType: 'bug' }), h, 'p');
        expect(i.reference).toMatchObject({ method: 'similar', p50Days: 3 });
    });
});

describe('sürüm simülasyonu', () => {
    it('sürüm kayıtları mevcut açık işlerin ardından planlanır; grup dağılımı ve hedef olasılığı', () => {
        const p = plan();
        const { project: vp, version } = virtualProject(project(), p);
        expect(version).toBe(2);
        expect(vp.tasks.filter(t => t.id.startsWith('rp:'))).toHaveLength(3);
        const sim = buildReleaseSimulation(project(), { ...p, targetDate: '2026-12-31' }, buildHistory([]), {}, { now: NOW, iterations: 300 });
        const r = runMonteCarlo(sim.built.input);
        const g = groupOf(r, RELEASE_GROUP)!;
        expect(g.finish.p50).toBeGreaterThan(0);
        expect(g.targetProbability).toBe(1);
        expect(releaseDates(r, sim.built.start, p.testDays)!.p80 >= sim.built.start).toBe(true);
        expect(sim.missing).toEqual([]);
    });

    it('havuzdan alınan görev iki kez sayılmaz; tahmini olmayan satır simülasyon dışında kalır', () => {
        const proj = project();
        const p = plan([itemFromTask(proj.tasks[1]), newItem({ name: 'Tahminsiz' })]);
        const { project: vp } = virtualProject(proj, p);
        expect(vp.tasks.some(t => t.id === 'havuz')).toBe(false);
        const sim = buildReleaseSimulation(proj, p, buildHistory([]), {}, { now: NOW, iterations: 100 });
        expect(sim.missing).toEqual([p.items[1].id]);
    });

    it('hedef tutmuyorsa düşük öncelikli kayıtlar çıkarılarak kapsam önerilir; engelleyici çıkarılmaz', async () => {
        const proj = project();
        proj.resources = [res('Ayşe')];
        const items = [
            newItem({ name: 'Kritik', ownEstimateDays: 4, priority: 'Blocker', resourceName: 'Ayşe' }),
            newItem({ name: 'Orta', ownEstimateDays: 4, priority: 'Medium', resourceName: 'Ayşe' }),
            newItem({ name: 'Düşük', ownEstimateDays: 8, priority: 'Low', resourceName: 'Ayşe' }),
            newItem({ name: 'Düşük 2', ownEstimateDays: 1, priority: 'Low', resourceName: 'Ayşe' }),
        ];
        const p = { ...plan(items), targetDate: '2026-10-27', testDays: 0 };
        const h = buildHistory([]);
        const run = (excluded: string[] = []) => {
            const sim = buildReleaseSimulation(proj, p, h, {}, { now: NOW, iterations: 300, extraExcluded: excluded });
            return { sim, r: runMonteCarlo(sim.built.input) };
        };
        const base = run();
        expect(groupOf(base.r, RELEASE_GROUP)!.targetProbability!).toBeLessThan(0.8);
        const s = await suggestDescope(p, { result: base.r, built: base.sim.built }, async ex => groupOf(run(ex).r, RELEASE_GROUP)!.targetProbability);
        expect(s).not.toBeNull();
        expect(s!.removed[0]).toBe(items[2].id); // en düşük öncelikli ve en büyük eforlu önce
        expect(s!.removed).not.toContain(items[0].id);
        expect(s!.probability).toBeGreaterThanOrEqual(0.8);
    });
});

describe('kilometre taşları', () => {
    it('iş paketine göre; tek paketse önceliğe göre', () => {
        const p = plan();
        expect(autoMilestones(p, project()).map(m => [m.name, m.itemIds.length])).toEqual([['Kimlik', 1], ['Raporlama', 2]]);
        const noWp = plan(p.items.map(i => ({ ...i, workPackageId: undefined })));
        expect(autoMilestones(noWp, project()).map(m => m.name)).toEqual(['Kritik kapsam', 'Tamamlayıcı kapsam']);
    });

    it('temizleme: bilinmeyen ve çıkarılan satır atılır, tekrar önlenir, açıkta kalan son taşa', () => {
        const p = plan();
        p.items[2].excluded = true;
        const ms = sanitizeMilestones([{ id: 'm1', name: 'A', itemIds: [p.items[0].id, p.items[0].id, 'yok', p.items[2].id] }, { id: 'm2', name: 'Boş', itemIds: [] }], p);
        expect(ms).toEqual([{ id: 'm1', name: 'A', itemIds: [p.items[0].id, p.items[1].id] }]);
    });

    it('AI önerisi K etiketleriyle; bilinmeyen etiket atılır, eksikler son taşa', () => {
        const p = plan();
        const prompt = milestonePrompt(p, new Map([['wp1', 'Kimlik']]));
        expect(prompt).toContain('[K1] Giriş');
        expect(prompt).toContain('iş paketi Kimlik');
        expect(milestoneLabels(p).get('K2')).toBe(p.items[1].id);
        const ms = parseMilestones('{"kilometre_taslari":[{"ad":"Temel giriş","kayitlar":["K1","K9"],"gerekce":"önce kimlik"},{"ad":"Raporlar","kayitlar":["k2"]}]}', p);
        expect(ms.map(m => [m.name, m.itemIds])).toEqual([['Temel giriş', [p.items[0].id]], ['Raporlar', [p.items[1].id, p.items[2].id]]]);
        expect(() => parseMilestones('yok', p)).toThrow();
    });
});

describe('aktarım', () => {
    it('görevler, hedef ve anahtar sonuçlar, termin, sürüm takvimi, taban çizgisi ve günlük', () => {
        const proj = project();
        let p = plan([...plan().items, itemFromTask(proj.tasks[1]), newItem({ name: 'Çıkarılan', ownEstimateDays: 1, excluded: true })]);
        p.items[1].predecessorId = p.items[0].id;
        p = { ...p, targetDate: '2026-12-31', milestones: autoMilestones(p, proj), blindEstimate: undefined } as ReleasePlan;
        p.items[0].blind = { effortDays: 3 };
        proj.releasePlans = [p];
        const sim = buildReleaseSimulation(proj, p, buildHistory([]), {}, { now: NOW, iterations: 300 });
        const result = runMonteCarlo(sim.built.input);
        const c = commitReleasePlan(proj, p, { built: sim.built, result }, { now: NOW });
        expect(c.created).toBe(3);
        expect(c.updated).toBe(1);
        const t = c.project.tasks;
        const giris = t.find(x => x.name === 'Giriş')!;
        const rapor = t.find(x => x.name === 'Rapor')!;
        expect(rapor.predecessor).toBe(giris.id);
        expect(giris).toMatchObject({ estimateSource: 'user', priority: 'Blocker', includeInSprints: true });
        expect(giris.version).toBeGreaterThanOrEqual(1);
        expect(giris.dueDate).toMatch(/^2026-/);
        expect(t.find(x => x.id === 'havuz')!.keyResultId).toBeTruthy(); // havuzdaki görev güncellendi
        expect(t.some(x => x.name === 'Çıkarılan')).toBe(false);
        const obj = c.project.objectives.at(-1)!;
        expect(obj.name).toBe('Sürüm: Sürüm 2.0');
        expect(obj.keyResults.map(k => k.name.split(' (')[0])).toEqual(['Kimlik', 'Raporlama', 'Diğer kayıtlar']);
        expect(c.plan).toMatchObject({ status: 'committed', step: 6 });
        expect(c.plan.baseline).toMatchObject({ itemCount: 4, targetProbability: 1 });
        expect(c.plan.baseline!.taskIds).toHaveLength(4);
        expect(c.project.releasePlans![0].status).toBe('committed');
        expect(c.log).toHaveLength(5);
        expect(c.log.find(e => e.draft.name === 'Çıkarılan')!.final.source).toBe('none');
        expect(c.log.find(e => e.draft.name === 'Giriş')).toMatchObject({ taskId: giris.id, blind: { effortDays: 3 }, final: { source: 'user' } });
    });

    it('aktarım projenin güncel hâline uygulanır; başka plana geçmiş havuz görevi alınmaz', () => {
        const proj = project();
        proj.tasks.push(task('model', { version: 0, name: 'Model tahminli', time: { best: 1, avg: 2, worst: 4 }, estimateSource: 'model' }));
        let p = plan([...plan().items, itemFromTask(proj.tasks[1]), itemFromTask(proj.tasks[2])]);
        p = { ...p, milestones: autoMilestones(p, proj) };
        proj.releasePlans = [p];
        const sim = buildReleaseSimulation(proj, p, buildHistory([]), {}, { now: NOW, iterations: 200 });
        const result = runMonteCarlo(sim.built.input);
        // Havuz görevi bu arada başka bir plana aktarıldı (sürüm 3)
        const moved = { ...proj, tasks: proj.tasks.map(t => (t.id === 'havuz' ? { ...t, version: 3 } : t)) };
        const c = commitReleasePlan(moved, p, { built: sim.built, result }, { now: NOW });
        expect(c.skipped.map(x => x.name)).toEqual(['Havuzdaki iş']);
        expect(c.project.tasks.find(t => t.id === 'havuz')!.version).toBe(3);
        expect(c.plan.baseline!.taskIds).not.toContain('havuz');
        // Değişmeden alınan model tahmini kaynağını ve aralığını korur
        expect(c.project.tasks.find(t => t.id === 'model')).toMatchObject({ estimateSource: 'model', time: { best: 1, avg: 2, worst: 4 } });
        // Aktarım sürerken projeye eklenen görev ve yeni hedef korunur
        const now = { ...moved, tasks: [...moved.tasks, task('sonradan', { version: 0 })], objectives: [...moved.objectives, { id: 'o-yeni', name: 'Yeni hedef', keyResults: [] } as never] };
        const applied = applyCommit(now, c);
        expect(applied.tasks.map(t => t.id)).toEqual(expect.arrayContaining(['sonradan', 'havuz', ...Object.values(c.taskIdOf)]));
        expect(applied.tasks).toHaveLength(now.tasks.length + c.created);
        expect(applied.objectives.map(o => o.id)).toEqual([...now.objectives.map(o => o.id), c.objectiveId]);
        expect(applied.releasePlans!.find(x => x.id === p.id)!.status).toBe('committed');
        expect(applyCommit(applied, c).tasks).toHaveLength(applied.tasks.length); // tekrar uygulamak çoğaltmaz
    });
});

describe('taban çizgisi', () => {
    it('aktarılan planın simülasyonundan kesinleşir; aktarımdan hemen sonraki güncel tahmin aynıdır', () => {
        const proj = project();
        let p = plan();
        p = { ...p, targetDate: '2026-12-31', milestones: autoMilestones(p, proj) };
        proj.releasePlans = [p];
        const h = buildHistory([]);
        const sim = buildReleaseSimulation(proj, p, h, {}, { now: NOW, iterations: 300 });
        const c = commitReleasePlan(proj, p, { built: sim.built, result: runMonteCarlo(sim.built.input) }, { now: NOW });
        const built = buildSimulation(c.project, h, {}, { now: NOW, scope: 'open', testDays: p.testDays, iterations: BASELINE_ITERATIONS });
        built.input.groups = commitGroups(built, c);
        const f = finalizeCommit(c, built, runMonteCarlo(built.input));
        // "Güncel tahmin": aynı proje, aynı ayarlar
        const again = buildSimulation(f.project, h, {}, { now: NOW, scope: 'open', testDays: p.testDays, iterations: BASELINE_ITERATIONS });
        again.input.groups = baselineGroups(again, f.plan.baseline!);
        const g = groupOf(runMonteCarlo(again.input), 'release')!;
        expect(releaseDates({ groups: [g] } as never, again.start, p.testDays)!.p80).toBe(f.plan.baseline!.p80);
        expect(f.plan.baseline!.milestones.every(m => m.p80)).toBe(true);
        const kr = f.project.objectives.at(-1)!.keyResults[0].name;
        expect(kr).toMatch(/P80 \d{1,2} [A-ZÇŞÖÜİ][a-zçşğıöü]{2} 2026/);
    });
});
