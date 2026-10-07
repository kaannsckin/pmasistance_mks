import { describe, expect, it } from 'vitest';
import { Allocation, HealthFactorKey, HealthWeekSnapshot, ManagementExpectation, Person, Project, Risk, Task, TaskStatus, WorkspaceData } from '../types';
import {
    buildHealthContext, calibrationStatus, commitmentRatio, ensureWeeklyHealthSnapshot, evaluateProjectHealth, HEALTH_FACTORS, HealthEvaluation, latestPmScore,
    MIN_LABELED_OBSERVATIONS, setPmoRating,
} from './healthModel';
import { createReport } from './weeklyReport';
import { createEmptyWorkspace, createProject } from './workspace';

const NOW = new Date(2026, 6, 15, 10); // 15 Temmuz 2026 Çarşamba → ISO 29. hafta

const person = (id: string, titleCode?: string): Person => ({ id, firstName: id, lastName: 'T', departmentCode: 'U310', availableAA: 1, roles: [], titleCode });
const task = (id: string, status: TaskStatus, avg = 1, dueDate?: string): Task => ({
    id, name: id, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: '', resourceName: '',
    time: { best: avg, avg, worst: avg }, jiraId: '', notes: '', status, dueDate,
});
const risk = (id: string, probability: Risk['probability'], impact: Risk['impact'], status: Risk['status'] = 'open'): Risk => ({ id, title: id, probability, impact, status, createdAt: '' });
const months = (from: number, to: number, v: number): Record<number, number> => {
    const r: Record<number, number> = {};
    for (let m = from; m <= to; m++) r[m] = v;
    return r;
};
const alloc = (id: string, personId: string, projectId: string, plan: Record<number, number>, actual: Record<number, number> = {}): Allocation =>
    ({ id, personId, projectId, year: 2026, plan, actual });
const expectation = (id: string, projectId: string, urgency: ManagementExpectation['urgency'], status: ManagementExpectation['status'] = 'open', needBy?: string): ManagementExpectation => ({
    id, title: id, category: 'approval', urgency, status, projectId, needBy, createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z', createdByRole: 'py',
});
const project = (id: string, partial: Partial<Project> = {}): Project => ({ ...createProject(id), id, ...partial });
const wsOf = (partial: Partial<WorkspaceData>): WorkspaceData => ({ ...createEmptyWorkspace(), ...partial });

const evaluate = (ws: WorkspaceData, projectId: string, statusMonth = 7): HealthEvaluation =>
    evaluateProjectHealth(ws, ws.projects.find(p => p.id === projectId)!, buildHealthContext(ws, 2026, statusMonth, NOW));
const f = (h: HealthEvaluation, key: HealthFactorKey) => h.factors.find(x => x.key === key)!;

describe('uzman ağırlıkları', () => {
    it('toplamı 1; regresyon için girdi başına ~10 gözlem gerekir', () => {
        expect(HEALTH_FACTORS.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 10);
        expect(MIN_LABELED_OBSERVATIONS).toBe(100);
    });
});

describe('evaluateProjectHealth', () => {
    it('SPI/CPI 0,8–1,0 arasında doğrusal normalize edilir; skor ağırlıklı ortalamadır', () => {
        // BAC 600, PV=AC 300 (6. ay), ilerleme %45 → EV 270 → SPI = CPI = 0,9
        const ws = wsOf({
            projects: [project('p', { rag: 'green', tasks: [task('t1', TaskStatus.Done, 9), task('t2', TaskStatus.ToDo, 11)] })],
            people: [person('a', 'ARŞ')],
            titles: [{ code: 'ARŞ', name: 'Araştırmacı', monthlyCost: 100 }],
            allocations: [alloc('x', 'a', 'p', months(1, 12, 0.5), months(1, 6, 0.5))],
        });
        const h = evaluate(ws, 'p', 6);
        expect(f(h, 'spi')).toMatchObject({ value: 0.5, detail: 'SPI 0,9' });
        expect(f(h, 'cpi').value).toBe(0.5);
        expect(f(h, 'pm').value).toBeNull();
        expect(f(h, 'pm').points).toBe(0);
        // Verisi olanlar: spi .5, cpi .5, geciken 1, risk 1, RAG 1, kaynak 1, beklenti 1 → kapsam .76
        expect(h.coverage).toBe(0.76);
        expect(h.confidence).toBe('high');
        expect(h.score).toBe(80); // 100 × .605 / .76
        expect(f(h, 'spi').points).toBe(11.8); // 100 × .18 × (1 − .5) / .76
        expect(h.reasons.slice(0, 2)).toEqual(['Takvim hafif geride (SPI 0,9)', 'Bütçe hafif aşımda (CPI 0,9)']);
        // Kayıpların toplamı 100 − skor
        expect(h.factors.reduce((s, x) => s + x.points, 0)).toBeCloseTo(100 - h.score, 0);
    });

    it('verisi olmayan girdi skora girmez; ağırlığı diğerlerine dağılır', () => {
        const h = evaluate(wsOf({ projects: [project('p')] }), 'p');
        expect(h.factors.filter(x => x.value === null).map(x => x.key)).toEqual(['spi', 'cpi', 'overdue', 'commitment', 'rag', 'pm', 'ai', 'resource']);
        expect(h.score).toBe(100);
        expect(h.coverage).toBe(0.18);
        expect(h.confidence).toBe('low');
        expect(h.reasons).toEqual([]);
        expect(h.perceptionGap).toBeNull();
    });

    it('geciken görev oranı, risk ve kritik beklentiler', () => {
        const ws = wsOf({
            projects: [project('p', {
                tasks: [task('a', TaskStatus.ToDo, 1, '2026-07-01'), task('b', TaskStatus.ToDo), task('c', TaskStatus.InProgress), task('d', TaskStatus.ToDo, 1, '2026-08-01'), task('e', TaskStatus.Done, 1, '2026-06-01')],
                risks: [risk('h', 4, 4), risk('m1', 3, 3), risk('m2', 2, 4), risk('closed', 5, 5, 'closed'), risk('low', 1, 2)],
            }), project('q')],
            expectations: [
                expectation('kritik', 'p', 'critical'),
                expectation('gecikmis', 'p', 'important', 'acknowledged', '2026-07-10'),
                expectation('zamani-var', 'p', 'important', 'open', '2026-08-10'),
                expectation('kapandi', 'p', 'critical', 'resolved'),
                expectation('baska', 'q', 'critical'),
            ],
        });
        const h = evaluate(ws, 'p');
        expect(f(h, 'overdue')).toMatchObject({ value: 0.17, detail: '1/4 açık görev gecikmiş' }); // 1 − (1/4)/0,3
        expect(f(h, 'risk')).toMatchObject({ value: 0.4, detail: '1 yüksek, 2 orta risk' });
        expect(h.highRisks).toBe(1);
        expect(f(h, 'expectations')).toMatchObject({ value: 0, detail: '2 kritik / süresi geçmiş beklenti' });
        expect(h.reasons).toEqual(['1 geciken görev', '1 yüksek risk', '2 kritik yönetim beklentisi']);
    });

    it('PY puanı: son 4 haftanın en yeni puanı', () => {
        const actor = { role: 'py' as const, personId: 'pm', name: 'PM' };
        const rep = (week: number, pmScore?: number) => ({ ...createReport({ kind: 'project', projectId: 'p', departmentCode: 'U310', year: 2026, week }, actor, NOW), pmScore });
        expect(latestPmScore([rep(29), rep(27, 8), rep(26, 4), rep(24, 3)], 'p', NOW)).toMatchObject({ score: 8, week: 27 });
        expect(latestPmScore([rep(25, 3)], 'p', NOW)).toBeUndefined(); // 4 hafta önce → geçersiz
        expect(latestPmScore([rep(30, 9)], 'p', NOW)).toBeUndefined(); // gelecek hafta sayılmaz
        const h = evaluate(wsOf({ projects: [project('p')], weeklyReports: [rep(27, 8)] }), 'p');
        expect(f(h, 'pm')).toMatchObject({ value: 0.78, detail: '8/10 (27. hafta)' }); // (8 − 1) / 9
        expect(h.pmScore).toBe(8);
    });

    it('kaynak: projede planı olan kişilerden kapasite üstü olanların oranı (bu ay + 2 ay)', () => {
        const ws = wsOf({
            projects: [project('p'), project('q')],
            people: [person('a'), person('b'), person('c')],
            allocations: [
                alloc('1', 'a', 'p', { 8: 0.6 }), alloc('2', 'a', 'q', { 8: 0.6 }), // a 8. ayda 1,2 AA
                alloc('3', 'b', 'p', { 7: 0.5 }),
                alloc('4', 'c', 'p', { 9: 1 }),
                alloc('5', 'c', 'q', { 3: 1 }), alloc('6', 'c', 'p', { 3: 0.5 }), // pencere dışı aşım sayılmaz
            ],
        });
        const h = evaluate(ws, 'p', 7);
        expect(f(h, 'resource')).toMatchObject({ value: 0.33, detail: '1/3 kişi kapasite üstü' }); // 1 − (1/3)/0,5
        expect(f(evaluate(ws, 'p', 11), 'resource').value).toBeNull(); // 11–12. ayda tahsis yok
    });

    it('algı farkı: PY yeşil ve 10 verirken veriler kötüyse uyarı', () => {
        const actor = { role: 'py' as const, personId: 'pm', name: 'PM' };
        const ws = wsOf({
            projects: [project('p', { rag: 'green', tasks: [task('a', TaskStatus.ToDo, 1, '2026-07-01'), task('b', TaskStatus.ToDo, 1, '2026-07-02')], risks: [risk('h', 5, 4)] })],
            weeklyReports: [{ ...createReport({ kind: 'project', projectId: 'p', departmentCode: 'U310', year: 2026, week: 29 }, actor, NOW), pmScore: 10 }],
        });
        const h = evaluate(ws, 'p');
        // nesnel: geciken 0 (.13), risk .6 (.13), beklenti 1 (.05) → .413; öznel: (1 + 1) / 2
        expect(h.perceptionGap).toBe(0.59);
        expect(h.reasons[h.reasons.length - 1]).toBe('Algı farkı: PY değerlendirmesi verilerden belirgin iyimser');
        // AI metin puanı PY'nin metninden türer: algı farkının iki tarafına da girmez
        const withAi = { ...ws, weeklyReports: ws.weeklyReports!.map(r => ({ ...r, aiAssessment: { score: 1, rationale: 'Kriz', evidence: [], signals: [], at: '', inputHash: '' } })) };
        expect(evaluate(withAi, 'p').perceptionGap).toBe(0.59);
    });

    it('söz tutma: son 4 haftada değerlendirilen planlardan gerçekleşenlerin payı', () => {
        const actor = { role: 'py' as const, personId: 'pm', name: 'PM' };
        const rep = (week: number, statuses: ('done' | 'partial' | 'slipped' | 'dropped')[]) => ({
            ...createReport({ kind: 'project', projectId: 'p', departmentCode: 'U310', year: 2026, week }, actor, NOW),
            planReview: statuses.map((status, i) => ({ itemId: `${week}-${i}`, text: 'plan', status })),
        });
        const reports = [rep(29, ['done', 'partial', 'dropped']), rep(28, ['done', 'slipped']), rep(25, ['slipped', 'slipped'])]; // 25. hafta pencere dışı
        expect(commitmentRatio(reports, 'p', NOW)).toEqual({ ratio: 0.625, plans: 4 }); // (1 + .5 + 1 + 0) / 4
        expect(commitmentRatio([rep(29, ['dropped'])], 'p', NOW)).toBeUndefined();
        const h = evaluate(wsOf({ projects: [project('p')], weeklyReports: reports }), 'p');
        expect(f(h, 'commitment')).toMatchObject({ value: 0.31, detail: '%63 gerçekleşti (4 plan, son 4 hafta)' }); // (.625 − .5) / .4
        expect(h.reasons).toContain('Söz tutma %63');
    });

    it('AI metin puanı: son 4 haftanın en yeni değerlendirmesi; gerekçe açıklama olarak taşınır', () => {
        const actor = { role: 'py' as const, personId: 'pm', name: 'PM' };
        const rep = (week: number, score: number) => ({
            ...createReport({ kind: 'project', projectId: 'p', departmentCode: 'U310', year: 2026, week }, actor, NOW),
            aiAssessment: { score, rationale: `${week}. hafta gerekçesi`, evidence: [], signals: [], at: '', inputHash: '' },
        });
        const h = evaluate(wsOf({ projects: [project('p')], weeklyReports: [rep(27, 4), rep(28, 7)] }), 'p');
        expect(f(h, 'ai')).toMatchObject({ value: 0.67, detail: '7/10 (28. hafta)', note: '28. hafta gerekçesi' }); // (7 − 1) / 9
        expect(f(evaluate(wsOf({ projects: [project('p')], weeklyReports: [rep(24, 9)] }), 'p'), 'ai').value).toBeNull();
    });
});

describe('setPmoRating', () => {
    const destek = { role: 'pyb_destek' as const, personId: 'd', name: 'Destek' };
    const sorumlu = { role: 'pyb_sorumlu' as const, name: 'Sorumlu' };
    const input = { projectId: 'p', year: 2026, week: 29 };

    it('yalnız PYB rolleri, 1–10 tam sayı; proje × hafta başına tek kayıt', () => {
        expect(setPmoRating([], { role: 'py', personId: 'pm' }, { ...input, score: 7 })).toBeNull();
        expect(setPmoRating([], { role: 'mudur' }, { ...input, score: 7 })).toBeNull();
        expect(setPmoRating([], destek, { ...input, score: 0 })).toBeNull();
        expect(setPmoRating([], destek, { ...input, score: 7.5 })).toBeNull();
        const one = setPmoRating([], destek, { ...input, score: 7, note: '  Teslim riski  ' }, NOW)!;
        expect(one).toEqual([expect.objectContaining({ ...input, score: 7, note: 'Teslim riski', byRole: 'pyb_destek', byName: 'Destek', at: NOW.toISOString() })]);
        const two = setPmoRating(one, sorumlu, { ...input, score: 5 }, NOW)!;
        expect(two).toHaveLength(1);
        expect(two[0]).toMatchObject({ id: one[0].id, score: 5, byRole: 'pyb_sorumlu' });
        expect(two[0].note).toBeUndefined();
        const other = setPmoRating(two, destek, { ...input, week: 30, score: 9 }, NOW)!;
        expect(other).toHaveLength(2);
        expect(setPmoRating(other, destek, { ...input, score: null })).toEqual([other[1]]);
    });
});

describe('ensureWeeklyHealthSnapshot', () => {
    const base = () => wsOf({ projects: [project('p', { rag: 'amber' }), project('done', { status: 'tamamlandi' })] });

    it('haftada bir fotoğraf; aynı gün tekrar alınmaz, ertesi gün tazelenir', () => {
        const ws1 = ensureWeeklyHealthSnapshot(base(), NOW)!;
        expect(ws1.healthHistory).toHaveLength(1);
        const snap = ws1.healthHistory![0];
        expect(snap).toMatchObject({ year: 2026, week: 29, model: 'uzman-2', takenAt: NOW.toISOString() });
        expect(snap.projects.map(e => e.projectId)).toEqual(['p']); // yalnız devam eden
        expect(snap.projects[0].x).toEqual({ risk: 1, rag: 0.5, expectations: 1 }); // verisi olmayan yazılmaz

        expect(ensureWeeklyHealthSnapshot(ws1, new Date(2026, 6, 15, 18))).toBeNull();

        const changed = { ...ws1, projects: ws1.projects.map(p => (p.id === 'p' ? { ...p, rag: 'red' as const } : p)) };
        const ws2 = ensureWeeklyHealthSnapshot(changed, new Date(2026, 6, 16, 9))!;
        expect(ws2.healthHistory).toHaveLength(1);
        expect(ws2.healthHistory![0].projects[0].x.rag).toBe(0);

        const ws3 = ensureWeeklyHealthSnapshot(ws2, new Date(2026, 6, 20, 9))!; // 30. hafta
        expect(ws3.healthHistory!.map(s => s.week)).toEqual([29, 30]);
    });

    it('aktif proje yoksa alınmaz; en fazla 104 hafta tutulur', () => {
        expect(ensureWeeklyHealthSnapshot(wsOf({ projects: [project('done', { status: 'tamamlandi' })] }), NOW)).toBeNull();
        const old: HealthWeekSnapshot[] = Array.from({ length: 104 }, (_, i) => ({ year: 2024, week: i % 52 + 1, takenAt: '2024-01-01T00:00:00Z', model: 'uzman-1', projects: [] }))
            .map((s, i) => ({ ...s, year: 2024 + Math.floor(i / 52) }));
        const next = ensureWeeklyHealthSnapshot({ ...base(), healthHistory: old }, NOW)!;
        expect(next.healthHistory).toHaveLength(104);
        expect(next.healthHistory![0]).toMatchObject({ year: 2024, week: 2 }); // en eskisi düştü
        expect(next.healthHistory![103]).toMatchObject({ year: 2026, week: 29 });
    });
});

describe('calibrationStatus', () => {
    const snap = (week: number, entries: [string, number][]): HealthWeekSnapshot => ({
        year: 2026, week, takenAt: '', model: 'uzman-1', projects: entries.map(([projectId, score]) => ({ projectId, score, coverage: 1, x: {} })),
    });
    const rating = (projectId: string, week: number, score: number) => ({ id: `${projectId}${week}`, projectId, year: 2026, week, score, byRole: 'pyb_destek' as const, at: '' });

    it('PMO puanını aynı haftanın fotoğrafıyla eşleştirir; uyum ölçüleri', () => {
        const s = calibrationStatus({
            healthHistory: [snap(28, [['p', 80]]), snap(29, [['p', 60], ['q', 40]])],
            pmoRatings: [rating('p', 28, 7), rating('p', 29, 6), rating('q', 29, 5), rating('p', 30, 9)],
        });
        expect(s).toMatchObject({ weeks: 2, ratings: 4, labeled: 3, labeledProjects: 2, needed: 100, correlation: null });
        expect(s.mae).toBe(0.7); // (|8−7| + |6−6| + |4−5|) / 3

        const perfect = calibrationStatus({
            healthHistory: [snap(29, [['a', 20], ['b', 40], ['c', 60], ['d', 80], ['e', 100]])],
            pmoRatings: ['a', 'b', 'c', 'd', 'e'].map((id, i) => rating(id, 29, (i + 1) * 2)),
        });
        expect(perfect).toMatchObject({ labeled: 5, mae: 0, correlation: 1 });
    });
});
