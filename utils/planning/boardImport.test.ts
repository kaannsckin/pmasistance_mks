import { describe, expect, it } from 'vitest';
import { Task, TaskStatus } from '../../types';
import { applyBoardImport, cleanLabel, estimateToDays, matchPerson, parseBoardWorkbook, planBoardImport } from './boardImport';
import { planBottleneck, DEFAULT_BOTTLENECK } from './bottleneck';
import { taskProgressPercent } from '../progress';

const task = (id: string, jiraId: string, extra: Partial<Task> = {}): Task => ({
    id, name: id, availability: true, priority: 'Medium', version: 0, predecessor: null, unit: 'EMS', resourceName: 'Begüm SÖZEN',
    time: { best: 2, avg: 2, worst: 2 }, jiraId, notes: '', status: TaskStatus.ToDo, labels: ['GIB'], ...extra,
});
const team = ['Arda YASAN', 'Begüm SÖZEN', 'İlker BALTACI', 'İlker BOZHÜYÜK', 'Yasin KAYA'].map(name => ({ name, unit: 'EMS' }));
const header = ['Test No', 'Başlık', 'Task No', 'Kişi', 'Board: Durum', 'Board: İlerleme %', 'Board: Zorluk', 'Board: Tahmin', 'Board: Sorumlu', 'Board: Etiketler', 'Board: Başlangıç', 'Board: Bitiş', 'Board: Puan'];

describe('pano aktarımı', () => {
    it('etiket düzeltme: noktasız ı yalnız Türkçe olmayan etikette', () => {
        expect(cleanLabel('shared-maılbox')).toBe('shared-mailbox');
        expect(cleanLabel('ımap')).toBe('imap');
        expect(cleanLabel('lısans')).toBe('lisans');
        expect(cleanLabel('evrak-çantası')).toBe('evrak-çantası');
        expect(cleanLabel('BUG')).toBe('BUG');
    });

    it('tahmin metni → gün', () => {
        expect(estimateToDays('2-3 gün')).toEqual({ best: 2, avg: 2.5, worst: 3 });
        expect(estimateToDays('1 hafta')).toEqual({ best: 5, avg: 5, worst: 5 });
        expect(estimateToDays('2 hafta')).toEqual({ best: 10, avg: 10, worst: 10 });
        expect(estimateToDays('Birkaç saat')).toEqual({ best: 0.25, avg: 0.5, worst: 0.75 });
        expect(estimateToDays('1 gün')?.avg).toBe(1);
        expect(estimateToDays('belirsiz')).toBeUndefined();
    });

    it('kısa ad → ekipteki kişi; soyadı harfleri ayırt eder', () => {
        const names = team.map(t => t.name);
        expect(matchPerson('Arda', names).name).toBe('Arda YASAN');
        expect(matchPerson('İlker Ba.', names).name).toBe('İlker BALTACI');
        expect(matchPerson('İlker Bo.', names).name).toBe('İlker BOZHÜYÜK');
        expect(matchPerson('İlker', names)).toEqual({ ambiguous: true });
        expect(matchPerson('Osman', names)).toEqual({});
    });

    it('çalışma kitabından değişiklik planı ve uygulama', () => {
        const sheets = {
            Özet: [['EMS Board'], ['Durum', 'İş']],
            Görevler: [
                header,
                ['J-09', 'Çoklu alan adı', 'MPS-6733', 'Yasin', 'Havuz', 0, 2, '1 hafta', 'Yasin', 'rbac', '2026-11-23', null, null],
                ['L-05', 'Günlükleme', 'MPS-6631', 'Begüm', 'İncelemede', 90, 2, '1 gün', 'İlker Ba.', 'kural, shared-maılbox', '2026-11-23', '2026-11-27', 31],
                ['X-01', 'Yeni', 'MPS-9999', 'Arda', 'Havuz', 0, 3, null, 'Arda', 'spam', null, null, null],
            ],
        };
        const { rows } = parseBoardWorkbook(sheets);
        expect(rows).toHaveLength(3);
        expect(rows[1]).toMatchObject({ key: 'MPS-6631', progress: 90, assignee: 'İlker Ba.', labels: ['kural', 'shared-mailbox'] });
        expect(rows[0].progress).toBeUndefined();

        const tasks = [task('a', 'MPS-6733', { resourceName: 'Yasin KAYA', time: { best: 0, avg: 0, worst: 0 } }), task('b', 'MPS-6631', { unit: 'Destek' })];
        const plan = planBoardImport(rows, tasks, team);
        expect(plan.unmatched.map(r => r.key)).toEqual(['MPS-9999']);
        const a = plan.changes.find(c => c.taskId === 'a')!;
        expect(a.assignee).toBeUndefined();
        expect(a.labelsAdded).toEqual(['rbac']);
        expect(a.estimate).toEqual({ text: '1 hafta', days: { best: 5, avg: 5, worst: 5 } }); // efor yoktu → tahminden
        const b = plan.changes.find(c => c.taskId === 'b')!;
        expect(b.assignee).toEqual({ from: 'Begüm SÖZEN', to: 'İlker BALTACI' });
        expect(b.unit).toEqual({ from: 'Destek', to: 'EMS' });
        expect(b.progress).toEqual({ from: undefined, to: 90 });
        expect(b.estimate?.days).toBeUndefined(); // eforu olan görevin süresi korunur

        // Aynı anahtar iki satırda: ilk satır esas, boşlar sonrakinden, etiketler birleşir
        const dup = planBoardImport([...rows, { key: 'MPS-6631', title: 'Ek iş', status: 'Havuz', progress: 30, assignee: 'Arda', labels: ['cos'] }], tasks, team);
        expect(dup.duplicateKeys).toEqual(['MPS-6631']);
        expect(dup.changes.filter(c => c.taskId === 'b')).toHaveLength(1);
        expect(dup.changes.find(c => c.taskId === 'b')).toMatchObject({ assignee: { to: 'İlker BALTACI' }, progress: { to: 90 }, labelsAdded: ['kural', 'shared-mailbox', 'cos'] });

        const { tasks: next, changed } = applyBoardImport(tasks, plan.changes, new Set(['assignee', 'labels', 'progress', 'estimate']));
        expect(changed).toBe(2);
        expect(next[1]).toMatchObject({ resourceName: 'İlker BALTACI', unit: 'EMS', progressPct: 90, estimateText: '1 gün', labels: ['GIB', 'kural', 'shared-mailbox'] });
        expect(next[1].time.avg).toBe(2);
        expect(next[0].time.avg).toBe(5);
        // Yalnız etiket seçilirse sorumlu değişmez
        const only = applyBoardImport(tasks, plan.changes, new Set(['labels']));
        expect(only.tasks[1].resourceName).toBe('Begüm SÖZEN');
    });

    it('elle girilen ilerleme plandaki kalan eforu düşürür', () => {
        const res = [{ id: 'r', name: 'Begüm SÖZEN', unit: 'EMS', participation: 100, title: '' }];
        const settings = { ...DEFAULT_BOTTLENECK, startDate: '2026-11-30', targetDate: '2026-12-31', testUnit: '' };
        const t = task('b', 'MPS-1', { time: { best: 10, avg: 10, worst: 10 }, status: TaskStatus.InProgress, progressPct: 90 });
        const r = planBottleneck({ project: { tasks: [t], resources: res }, settings, scenario: 'current' });
        expect(r.tasks[0].days).toBe(1);
    });
});

describe('pano durumu', () => {
    const rows = [
        { key: 'MPS-1', title: '', status: 'Devam Ediyor', labels: [] },
        { key: 'MPS-2', title: '', status: 'İncelemede', labels: [] },
        { key: 'MPS-3', title: '', status: 'Havuz', labels: [] },
        { key: 'MPS-4', title: '', status: 'Tamamlandı', labels: [] },
        { key: 'MPS-5', title: '', status: 'İncelemede', labels: [] },
    ];
    const tasks = [
        task('a', 'MPS-1', { status: TaskStatus.ToDo }),
        task('b', 'MPS-2', { status: TaskStatus.InProgress, jiraStatus: 'Devam Ediyor', startedAt: '2026-11-01T00:00:00.000Z' }),
        task('c', 'MPS-3', { status: TaskStatus.InProgress }),
        task('d', 'MPS-4', { status: TaskStatus.InProgress }),
        task('e', 'MPS-5', { status: TaskStatus.Done }),
    ];

    it('yalnız Devam Ediyor ve İncelemede aktarılır; geri alma ve kapatma yok', () => {
        const plan = planBoardImport(rows, tasks, team);
        const st = new Map(plan.changes.filter(c => c.status).map(c => [c.taskId, c.status!]));
        expect(st.get('a')).toEqual({ from: 'Yapılacak', to: 'Devam Ediyor', category: TaskStatus.InProgress });
        expect(st.get('b')).toEqual({ from: 'Devam Ediyor', to: 'İncelemede', category: TaskStatus.InProgress });
        expect(st.has('c')).toBe(false); // Havuz geri almaz
        expect(st.has('d')).toBe(false); // Tamamlandı kapatmaz
        expect(st.has('e')).toBe(false); // tamamlanmış görev değişmez
    });

    it('uygulanınca ilerleme durumdan otomatik: geliştirmede %50, testte %75', () => {
        const plan = planBoardImport(rows, tasks, team);
        const { tasks: next } = applyBoardImport(tasks, plan.changes, new Set(['status']));
        const a = next.find(t => t.id === 'a')!, b = next.find(t => t.id === 'b')!;
        expect(a).toMatchObject({ status: TaskStatus.InProgress, jiraStatus: 'Devam Ediyor' });
        expect(a.startedAt).toBeTruthy();
        expect(a.statusLog?.at(-1)).toMatchObject({ from: TaskStatus.ToDo, to: TaskStatus.InProgress });
        expect(b).toMatchObject({ status: TaskStatus.InProgress, jiraStatus: 'İncelemede', startedAt: '2026-11-01T00:00:00.000Z' });
        expect(taskProgressPercent(a)).toBe(50);
        expect(taskProgressPercent(b)).toBe(75);
        // Elle girilen ilerleme otomatiği geçer
        expect(taskProgressPercent({ ...b, progressPct: 90 })).toBe(90);
    });
});
