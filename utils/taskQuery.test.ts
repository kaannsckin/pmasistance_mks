import { describe, expect, it } from 'vitest';
import { Task, TaskStatus } from '../types';
import { compileTaskQuery, looksLikeQuery, runTaskQuery, suggestTaskQuery, TaskQueryContext } from './taskQuery';

const task = (id: string, over: Partial<Task> = {}): Task => ({
    id, name: `Görev ${id}`, availability: true, priority: 'Medium', version: 0, predecessor: null, unit: 'Yazılım', resourceName: '',
    time: { best: 0, avg: 0, worst: 0 }, jiraId: '', notes: '', status: TaskStatus.ToDo, ...over,
});

const now = new Date(2026, 10, 23); // 23 Kasım 2026 Pazartesi
const ctx: TaskQueryContext = { now, sprintNames: { 2: 'Kış sprinti' }, workPackages: [{ id: 'wp1', name: 'Kimlik' }], me: 'Ayşe Demir' };

const tasks: Task[] = [
    task('a', { name: 'Parola politikası', priority: 'Blocker', status: TaskStatus.InProgress, resourceName: 'Ayşe Demir', jiraId: 'ABC-1', labels: ['güvenlik', 'web'], issueType: 'bug', version: 1, dueDate: '2026-11-20', createdAt: '2026-11-15T10:00:00Z', time: { best: 1, avg: 2, worst: 3 }, workPackageId: 'wp1', jiraStatus: 'ANALYSIS' }),
    task('b', { name: 'Adres defteri içe aktarma', priority: 'High', status: TaskStatus.ToDo, resourceName: 'Mehmet Işık', labels: ['mobil'], issueType: 'feature', version: 2, dueDate: '2026-11-30', createdAt: '2026-10-01T10:00:00Z', unit: 'Test' }),
    task('c', { name: 'Rapor ekranı', priority: 'Low', status: TaskStatus.Done, version: 1, issueType: 'improvement', notes: 'parola alanı da var', resolvedAt: '2026-11-10T00:00:00Z', actualHours: 12 }),
    task('d', { name: 'Kayıt servisi', priority: 'Medium', status: TaskStatus.Backlog, version: 0, storyPoints: 5 }),
];

const ids = (q: string) => {
    const r = runTaskQuery(tasks, q, ctx);
    if (r.ok === false) throw new Error(r.error);
    return r.tasks.map(t => t.id);
};

describe('görev sorgu dili', () => {
    it('boş sorgu her görevi döndürür', () => {
        expect(ids('')).toEqual(['a', 'b', 'c', 'd']);
    });

    it('durum: Türkçe ad, uygulama anahtarı, Açık ve Jira durumu', () => {
        expect(ids('durum = Süreçte')).toEqual(['a']);
        expect(ids('status = InProgress')).toEqual(['a']);
        expect(ids('durum = açık')).toEqual(['a', 'b', 'd']);
        expect(ids('durum != Tamamlandı')).toEqual(['a', 'b', 'd']);
        expect(ids('durum = analysis')).toEqual(['a']);
        expect(ids('durum IN (Yapılacak, Bekleyen)')).toEqual(['b', 'd']);
    });

    it('joker parçalarını sırayla ve çakışmadan eşleştirir', () => {
        const candidates = [task('yes', { name: 'ab+ ... ab+ ... son' }), task('no', { name: 'ab+ ... son ... ab+' }), task('long', { name: 'a'.repeat(200) })];
        expect(runTaskQuery(candidates, 'özet ~ "ab+**ab+*son"')).toMatchObject({ ok: true, tasks: [{ id: 'yes' }] });
        const pattern = 'a*'.repeat(30) + 'z';
        expect(runTaskQuery(candidates, `özet ~ "${pattern}"`)).toEqual({ ok: true, tasks: [] });
    });

    it('öncelik sıralı karşılaştırılır', () => {
        expect(ids('öncelik >= Yüksek')).toEqual(['a', 'b']);
        expect(ids('priority > medium')).toEqual(['a', 'b']);
        expect(ids('oncelik < Orta')).toEqual(['c']);
        expect(ids('önem = engelleyici')).toEqual(['a']);
    });

    it('VE, VEYA, DEĞİL ve parantez', () => {
        expect(ids('durum = Açık AND (öncelik = Yüksek OR tür = Hata)')).toEqual(['a', 'b']);
        expect(ids('NOT durum = Tamamlandı AND birim = Test')).toEqual(['b']);
        expect(ids('tür = Hata veya tür = İyileştirme')).toEqual(['a', 'c']);
        expect(ids('durum = Açık öncelik = Orta')).toEqual(['d']); // yan yana = VE
    });

    it('işleçsiz metin başlık, açıklama, anahtar ve etiketlerde aranır', () => {
        expect(ids('parola')).toEqual(['a', 'c']);
        expect(ids('"adres defteri"')).toEqual(['b']);
        expect(ids('abc-1')).toEqual(['a']);
        expect(ids('mobil')).toEqual(['b']);
        expect(ids('özet ~ "par*ka"')).toEqual(['a']);
    });

    it('atanan, me ve boş değer', () => {
        expect(ids('atanan = me')).toEqual(['a']);
        expect(ids('atanan = currentUser()')).toEqual(['a']);
        expect(ids('atanan IS EMPTY')).toEqual(['c', 'd']);
        expect(ids('assignee = "mehmet işık"')).toEqual(['b']);
        expect(ids('atanan != EMPTY')).toEqual(['a', 'b']);
    });

    it('etiket listesi', () => {
        expect(ids('etiket = web')).toEqual(['a']);
        expect(ids('etiket IN (mobil, web)')).toEqual(['a', 'b']);
        expect(ids('etiket NOT IN (mobil)')).toEqual(['a', 'c', 'd']);
        expect(ids('etiket IS EMPTY')).toEqual(['c', 'd']);
    });

    it('sprint: numara, ad ve Havuz', () => {
        expect(ids('sprint = 1')).toEqual(['a', 'c']);
        expect(ids('sprint = "Kış sprinti"')).toEqual(['b']);
        expect(ids('sprint = Havuz')).toEqual(['d']);
        expect(ids('sprint IS EMPTY')).toEqual(['d']);
        expect(ids('sprint >= 2')).toEqual(['b']);
    });

    it('tarihler: ISO, gg.aa.yyyy, göreli ve işlevler', () => {
        expect(ids('termin < today()')).toEqual(['a']);
        expect(ids('termin <= endOfMonth()')).toEqual(['a', 'b']);
        expect(ids('termin = 30.11.2026')).toEqual(['b']);
        expect(ids('oluşturma >= -14d')).toEqual(['a']);
        expect(ids('created >= 2026-10-01')).toEqual(['a', 'b']);
        expect(ids('kapanış >= startOfMonth()')).toEqual(['c']);
    });

    it('gecikmiş, sayılar ve iş paketi', () => {
        expect(ids('gecikmiş = evet')).toEqual(['a']);
        expect(ids('tahmin > 1')).toEqual(['a']);
        expect(ids('tahmin IS EMPTY')).toEqual(['b', 'c', 'd']);
        expect(ids('harcanan >= 10')).toEqual(['c']);
        expect(ids('puan = 5')).toEqual(['d']);
        expect(ids('iş_paketi = kimlik')).toEqual(['a']);
    });

    it('ORDER BY sıralar; boş değerler sonda', () => {
        expect(ids('ORDER BY öncelik DESC')).toEqual(['a', 'b', 'd', 'c']);
        expect(ids('durum = Açık ORDER BY termin')).toEqual(['a', 'b', 'd']);
        expect(ids('order by sprint desc, öncelik desc')).toEqual(['b', 'a', 'c', 'd']);
    });

    it('hatalarda Türkçe ileti ve konum verir', () => {
        const r = compileTaskQuery('drum = Süreçte', ctx);
        expect(r.ok).toBe(false);
        if (r.ok === false) { expect(r.error).toMatch(/Bilinmeyen alan: drum.*durum/); expect(r.start).toBe(0); }
        const p = compileTaskQuery('öncelik = Acil', ctx);
        expect(p.ok === false && p.error).toMatch(/Öncelik anlaşılmadı/);
        expect(compileTaskQuery('durum = (', ctx).ok).toBe(false);
        expect(compileTaskQuery('etiket IN (a, b', ctx).ok).toBe(false);
        expect(compileTaskQuery('özet ~ "açık', ctx).ok).toBe(false);
        expect(compileTaskQuery('tür > Hata', ctx).ok).toBe(false);
        expect(compileTaskQuery('termin < yarınki', ctx).ok).toBe(false);
    });

    it('sorgu mu düz arama mı ayırt eder', () => {
        expect(looksLikeQuery('parola politikası')).toBe(false);
        expect(looksLikeQuery('ABC-12')).toBe(false);
        expect(looksLikeQuery('durum = Süreçte')).toBe(true);
        expect(looksLikeQuery('etiket IN (a)')).toBe(true);
        expect(looksLikeQuery('parola OR şifre')).toBe(true);
    });
});

describe('sorgu önerileri', () => {
    const labels = (q: string, caret = q.length) => suggestTaskQuery(q, caret, tasks, ctx).items.map(i => i.label);

    it('başta alan adlarını önerir', () => {
        expect(labels('')).toContain('durum');
        expect(labels('ön')).toContain('öncelik');
        expect(labels('durum = Açık AND at')).toEqual(['atanan']);
    });

    it('alandan sonra işleçleri önerir', () => {
        const ops = labels('öncelik ');
        expect(ops).toContain('>=');
        expect(ops).toContain('IN');
        expect(labels('etiket ')).toContain('~');
    });

    it('işleçten sonra gerçek değerleri önerir', () => {
        expect(labels('atanan = ')).toEqual(expect.arrayContaining(['me', 'Ayşe Demir', 'Mehmet Işık']));
        expect(labels('etiket IN (mobil, ')).toEqual(expect.arrayContaining(['güvenlik', 'web']));
        expect(labels('durum = Sü')).toEqual(['Süreçte']);
        expect(labels('sprint = ')).toEqual(['Havuz', '1', '2']);
    });

    it('değerden sonra bağlaçları önerir', () => {
        expect(labels('durum = Süreçte ')).toEqual(['AND', 'OR', 'ORDER BY']);
        expect(labels('ORDER BY ')).toContain('öncelik');
        expect(labels('ORDER BY öncelik ')).toContain('DESC');
    });

    it('boşluk içeren değerleri tırnaklar', () => {
        const s = suggestTaskQuery('atanan = ', 9, tasks, ctx).items.find(i => i.label === 'Ayşe Demir');
        expect(s?.insert).toBe('"Ayşe Demir" ');
    });
});

it('efor sorgusunda saat birimi, tahmin aşımı ve boş ile sıfır ayrımı', () => {
    const candidates = [
        task('over', { originalEstimateHours: 3, actualHours: 4, remainingEstimateHours: 5 }),
        task('missing'),
        task('zero', { originalEstimateHours: 0, actualHours: 0, remainingEstimateHours: 0 }),
    ];
    expect(runTaskQuery(candidates, 'kalan > 4 saat AND tahmin aşılmış', ctx)).toMatchObject({ ok: true, tasks: [{ id: 'over' }] });
    expect(runTaskQuery(candidates, 'tahminsiz', ctx)).toMatchObject({ ok: true, tasks: [{ id: 'missing' }] });
    expect(runTaskQuery(candidates, 'kalan = 0', ctx)).toMatchObject({ ok: true, tasks: [{ id: 'zero' }] });
    expect(looksLikeQuery('tahmin aşılmış')).toBe(true);
    expect(looksLikeQuery('tahminsiz')).toBe(true);
});
