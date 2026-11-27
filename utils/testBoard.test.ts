import { describe, expect, it } from 'vitest';
import { TestBoardItem } from '../types';
import { buildTestReport, reportHtml, reportPlainText, testHealth } from './testReport';
import {
    columnOf, defaultTestSettings, distributeItems, lastWeekClose, makeSnapshot, ruleContext, snapshotDue, weekIdOf, weekReport, withSnapshot,
} from './testBoard';

const ctx = ruleContext(
    { roleMembers: { test: ['p-ayse'] }, components: [{ id: 'c1', name: 'Destek', lead: 'Vedat Kaya' }] },
    [{ id: 'p-ayse', firstName: 'Ayşe', lastName: 'Test' }, { id: 'p-vedat', firstName: 'Vedat', lastName: 'Kaya' }],
);
const item = (key: string, extra: Partial<TestBoardItem> = {}): TestBoardItem => ({
    key, summary: `Kayıt ${key}`, type: 'Bug', status: 'Open', category: 'new', priority: 'High', assignee: 'Can Dev', reporter: 'Ayşe Test',
    components: [], labels: [], created: '2026-11-20T09:00:00Z', transitions: [], ...extra,
});
const cols = defaultTestSettings('123', 'gib_testset', new Date('2026-11-01T00:00:00Z')).columns;

describe('test panosu kuralları', () => {
    it('durum + tür + atanan / açan birleşerek kolona düşer', () => {
        expect(columnOf(cols, item('A'), ctx)).toBe('bugs'); // testçinin açtığı açık hata
        expect(columnOf(cols, item('B', { reporter: 'Can Dev' }), ctx)).toBe('dev'); // geliştiricinin açtığı hata
        expect(columnOf(cols, item('C', { type: 'Change Request' }), ctx)).toBe('changes');
        expect(columnOf(cols, item('D', { type: 'Değişiklik Talebi', status: 'In Progress', category: 'indeterminate' }), ctx)).toBe('changes');
        expect(columnOf(cols, item('E', { status: 'Resolved', category: 'indeterminate', assignee: 'Vedat Kaya' }), ctx)).toBe('waiting');
        expect(columnOf(cols, item('F', { status: 'Resolved', category: 'indeterminate', assignee: 'Can Dev' }), ctx)).toBe(''); // eşleşmeyen
        expect(columnOf(cols, item('G', { status: 'REOPENED', category: 'new' }), ctx)).toBe('reopened');
        expect(columnOf(cols, item('H', { status: 'Testing', category: 'indeterminate' }), ctx)).toBe('testing');
        expect(columnOf(cols, item('I', { status: 'Closed', category: 'done' }), ctx)).toBe('done');
        const d = distributeItems(cols, [item('A'), item('F', { status: 'Resolved' })], ctx);
        expect([d.get('bugs')!.length, d.get('')!.length]).toEqual([1, 1]);
    });

    it('bileşen lideri belirli bileşenle sınırlanabilir; değil koşulu', () => {
        const only = [{ id: 'x', name: 'X', when: [{ field: 'assigneeLead' as const, values: ['Ödeme'] }] }];
        expect(columnOf(only, item('A', { assignee: 'Vedat Kaya' }), ctx)).toBe('');
        const notTester = [{ id: 'x', name: 'X', when: [{ field: 'reporterRole' as const, not: true, values: ['test'] }] }];
        expect(columnOf(notTester, item('A'), ctx)).toBe('');
        expect(columnOf(notTester, item('B', { reporter: 'Can Dev' }), ctx)).toBe('x');
    });
});

describe('hafta kapanışı ve görüntüler', () => {
    it('son Cuma 20:00 (Türkiye) ve ISO hafta', () => {
        // 27 Kasım 2026 Cuma
        expect(lastWeekClose(new Date('2026-11-27T16:59:00Z')).toISOString()).toBe('2026-11-20T17:00:00.000Z'); // 19:59 TR
        expect(lastWeekClose(new Date('2026-11-27T17:00:00Z')).toISOString()).toBe('2026-11-27T17:00:00.000Z'); // 20:00 TR
        expect(lastWeekClose(new Date('2026-11-30T08:00:00Z')).toISOString()).toBe('2026-11-27T17:00:00.000Z'); // Pazartesi
        expect(weekIdOf(new Date('2026-11-27T17:00:00Z'))).toBe('2026-W48');
    });

    it('haftalık görüntü bir kez; kurulumdan önceki kapanış atlanır; elle görüntü haftalığı engellemez', () => {
        const settings = defaultTestSettings('1', undefined, new Date('2026-11-25T10:00:00Z'));
        const tb = { settings };
        expect(snapshotDue(tb, new Date('2026-11-26T10:00:00Z'))).toBeNull(); // son kapanış 20 Kasım, kurulumdan önce
        const due = snapshotDue(tb, new Date('2026-11-28T09:00:00Z'))!;
        expect(due).toMatchObject({ week: '2026-W48', late: true });
        expect(snapshotDue(tb, new Date('2026-11-27T17:30:00Z'))!.late).toBe(false);
        const manual = makeSnapshot(settings, [item('A')], ctx, new Date('2026-11-26T10:00:00Z'), { manual: true });
        const withManual = { settings, snapshots: withSnapshot(undefined, manual) };
        expect(snapshotDue(withManual, new Date('2026-11-27T17:30:00Z'))).not.toBeNull();
        const weekly = makeSnapshot(settings, [item('A')], ctx, new Date('2026-11-27T17:00:00Z'), { week: '2026-W48' });
        const both = { settings, snapshots: withSnapshot(withManual.snapshots, weekly) };
        expect(both.snapshots).toHaveLength(2);
        expect(snapshotDue(both, new Date('2026-11-27T18:00:00Z'))).toBeNull();
        expect(weekly.rows[0]).toEqual({ k: 'A', c: 'bugs', s: 'Open', p: 'High', t: 'Bug', a: 'Can Dev', n: 'Kayıt A' });
    });
});

describe('haftalık rapor', () => {
    it('onaylanan, açılan hata (öncelik), değişiklik talebi, yeniden açılan ve kolon farkı', () => {
        const settings = defaultTestSettings('1');
        const prevItems = [item('A', { status: 'Resolved', category: 'indeterminate', assignee: 'Vedat Kaya' }), item('B', { status: 'Resolved', assignee: 'Vedat Kaya' })];
        const prev = makeSnapshot(settings, prevItems, ctx, new Date('2026-11-20T17:00:00Z'), { week: '2026-W47' });
        const items = [
            item('A', { status: 'Closed', category: 'done', created: '2026-11-01T00:00:00Z', transitions: [{ at: '2026-11-24T10:00:00Z', from: 'Resolved', to: 'Closed', fc: 'indeterminate', tc: 'done' }] }),
            item('B', { status: 'Resolved', category: 'indeterminate', assignee: 'Vedat Kaya', created: '2026-11-01T00:00:00Z', transitions: [{ at: '2026-11-18T10:00:00Z', from: 'Open', to: 'Resolved', fc: 'new', tc: 'indeterminate' }] }),
            item('C', { priority: 'Blocker', created: '2026-11-23T09:00:00Z' }),
            item('D', { priority: 'Medium', reporter: 'Can Dev', created: '2026-11-25T09:00:00Z' }),
            item('E', { type: 'Change Request', created: '2026-11-26T09:00:00Z' }),
            item('F', { status: 'Reopened', created: '2026-10-01T00:00:00Z', transitions: [{ at: '2026-11-25T12:00:00Z', from: 'Closed', to: 'Reopened', fc: 'done', tc: 'new' }] }),
        ];
        const cur = makeSnapshot(settings, items, ctx, new Date('2026-11-27T17:00:00Z'), { week: '2026-W48' });
        const r = weekReport(cur, prev, items, ctx);
        expect(r.approved.map(x => x.k)).toEqual(['A']);
        expect(r.newBugs.map(x => x.key)).toEqual(['C', 'D']);
        expect(r.bugsByPriority).toEqual([{ priority: 'Blocker', n: 1 }, { priority: 'High', n: 0 }, { priority: 'Medium', n: 1 }, { priority: 'Low', n: 0 }]);
        expect(r.bugsFromTesters).toBe(1);
        expect(r.newChanges.map(x => x.key)).toEqual(['E']);
        expect(r.reopened.map(x => x.key)).toEqual(['F']);
        expect(r.columns.find(c => c.id === 'waiting')).toMatchObject({ now: 1, before: 2 });
        expect(r.waiting).toEqual([{ key: 'B', name: 'Kayıt B', days: 9, assignee: 'Vedat Kaya' }]);
        expect(r.openBugs.map(b => [b.key, b.priority])).toEqual([['C', 'Blocker'], ['B', 'High'], ['F', 'High'], ['D', 'Medium']]);
        expect([r.openBugsBefore, r.total, r.testerRoleDefined, r.reporterMissing]).toEqual([2, 6, true, 0]);
        expect(testHealth(r)).toEqual({ level: 'Riskli', reason: '1 engelleyici öncelikli hata açık.' });

        const doc = buildTestReport(r, { project: 'GİB', filter: 'gib_testset', generatedAt: '2026-11-27T17:00:00Z' });
        expect(doc.title).toBe('GİB · Test Durum Raporu');
        expect(doc.subtitle).toBe('48. Hafta · 20 Kasım – 27 Kasım 2026');
        expect(doc.summary).toBe('48. haftada (20 Kasım – 27 Kasım 2026) 1 madde test edilerek onaylandı. Aynı dönemde 2 yeni hata kaydı açıldı (1 engelleyici, 1 orta); bunların 1 tanesi test ekibince bildirildi. 1 değişiklik talebi alındı, 1 kayıt düzeltme sonrası yeniden açıldı. Dönem sonunda 0 kayıt testte, 1 kayıt test için bekliyor; açık hata sayısı 4 (3 kritik), geçen haftaya göre +2.');
        expect(doc.kpis.rows[0]).toEqual(['Test edilip onaylanan madde', '1', '—', '—']);
        expect(doc.kpis.rows.find(x => x[0] === 'Açık hata (toplam)')).toEqual(['Açık hata (toplam)', '4', '2', '+2']);
        expect(doc.sections.map(x => x.title)).toEqual(['Öne çıkanlar ve riskler', 'Açık kritik hatalar', 'Bu hafta test edilip onaylananlar', 'Bu hafta açılan hatalar', 'Değişiklik talepleri', 'Yeniden açılan kayıtlar', 'Test kuyruğu', 'Pano dağılımı']);
        expect(doc.sections[1].table!.rows[0]).toEqual(['C', 'Kayıt C', 'Engelleyici', 'Open', 'Can Dev']);
        expect(doc.sections[3].table!.rows.map(x => x[0])).toEqual(['C', 'D']); // önceliğe göre
        const text = reportPlainText(doc);
        expect(text).toContain('GİB · TEST DURUM RAPORU');
        expect(text).toContain('GENEL DURUM: RİSKLİ — 1 engelleyici öncelikli hata açık.');
        expect(text).toContain('2. AÇIK KRİTİK HATALAR');
        expect(text).not.toContain('Önceki haftanın görüntüsü');
        const html = reportHtml({ ...doc, sections: [{ title: 'X', table: { columns: ['Kayıt', 'Başlık'], rows: [['A', '<img src=x onerror=alert(1)>']], more: 0 } }] });
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).not.toContain('<img');

        // Test ekibi tanımsız ve önceki görüntü yoksa: sayı yerine not
        const bare = weekReport(cur, undefined, items, ruleContext({ roleMembers: {}, components: [] }, []));
        const d2 = buildTestReport(bare, { project: 'GİB' });
        expect(d2.summary).not.toContain('test ekibince');
        expect(d2.notes.some(x => x.includes('Test ekibi projede tanımlı olmadığından'))).toBe(true);
        expect(d2.notes.some(x => x.includes('Önceki haftanın görüntüsü bulunmadığından'))).toBe(true);
    });
});
