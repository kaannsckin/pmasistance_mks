import { describe, expect, it } from 'vitest';
import {
    allTags, createNote, editNoteContent, filterNotes, groupNotesByWeek, parseContent, reminderLines, tokenizeLine, todoLines, toggleTodo, updateLine,
} from './notes';

const NOW = new Date(2026, 9, 7, 9);

describe('ayrıştırma ve oluşturma', () => {
    it('etiket ve kişi; seçilen güne ISO hafta', () => {
        expect(parseContent('#Karar alındı @AyşeYılmaz ile #risk-1')).toEqual({ tags: ['Karar', 'risk-1'], mentions: ['AyşeYılmaz'] });
        const n = createNote('Demo #Toplantı', '2026-10-05', NOW);
        expect(n).toMatchObject({ weekNumber: 41, year: 2026, tags: ['Toplantı'] });
        expect(new Date(n.createdAt).getDate()).toBe(5);
        expect(createNote('x', '2027-01-01', NOW)).toMatchObject({ weekNumber: 53, year: 2026 });
        expect(new Date(createNote('bugün', '2026-10-07', NOW).createdAt).getHours()).toBe(9);
    });

    it('satır parçaları: biçim, renk, görev, etiket, kişi', () => {
        expect(tokenizeLine('[ ] **Kalın** ve *eğik* ==vurgu== [c:#ff0000]kırmızı[/c] #Acil @Ali')).toEqual([
            { kind: 'todo', done: false },
            { kind: 'text', text: ' ', color: undefined },
            { kind: 'bold', text: 'Kalın', color: undefined },
            { kind: 'text', text: ' ve ', color: undefined },
            { kind: 'italic', text: 'eğik', color: undefined },
            { kind: 'text', text: ' ', color: undefined },
            { kind: 'mark', text: 'vurgu' },
            { kind: 'text', text: ' ', color: undefined },
            { kind: 'text', text: 'kırmızı', color: '#ff0000' },
            { kind: 'text', text: ' ', color: undefined },
            { kind: 'tag', tag: 'Acil' },
            { kind: 'text', text: ' ', color: undefined },
            { kind: 'mention', name: 'Ali' },
        ]);
        // güvensiz renk değeri yok sayılır
        expect(tokenizeLine('[c:red;background:url(x)]a[/c]')[0]).toEqual({ kind: 'text', text: 'a', color: undefined });
    });
});

describe('görevler, anımsatıcılar, satır güncelleme', () => {
    const note = { ...createNote('Başlık\n[ ] Teklif gönder\n[x] Sözleşme imzalandı\n#anımsatıcı Cuma kabul toplantısı', '2026-10-06', NOW), id: 'n1' };

    it('açık görevler önce; anımsatıcılar', () => {
        expect(todoLines([note]).map(t => [t.text, t.done, t.lineIndex])).toEqual([['Teklif gönder', false, 1], ['Sözleşme imzalandı', true, 2]]);
        expect(reminderLines([note]).map(r => r.text)).toEqual(['Cuma kabul toplantısı']);
    });

    it('görev işaretleme ve gelişme notu', () => {
        const t = toggleTodo(note, 1);
        expect(t.content.split('\n')[1]).toBe('[x] Teklif gönder');
        expect(toggleTodo(t, 1).content.split('\n')[1]).toBe('[ ] Teklif gönder');
        expect(toggleTodo(note, 0)).toBe(note);
        const u = updateLine(note, 1, '[ ] Teklif gönder #Acil', 'Fiyat onayı bekleniyor');
        expect(u.lineUpdates).toEqual({ 1: 'Fiyat onayı bekleniyor' });
        expect(u.tags).toContain('Acil');
        expect(updateLine(u, 1, '[ ] Teklif gönder', ' ').lineUpdates).toEqual({});
    });
});

describe('süzme ve gruplama', () => {
    const a = { ...createNote('Gebze demo #Toplantı', '2026-10-06', NOW), id: 'a' };
    const b = { ...createNote('Pilot #Karar #toplantı', '2026-10-07', NOW), id: 'b' };
    const c = { ...editNoteContent(createNote('eski', '2026-09-30', NOW), 'eski not'), id: 'c', lineUpdates: { 0: 'gelişme: pilot onaylandı' } };

    it('etiket (büyük/küçük harf duyarsız) ve metin araması (gelişme notları dahil)', () => {
        expect(filterNotes([a, b, c], { tag: 'TOPLANTI' }).map(n => n.id)).toEqual(['a', 'b']);
        expect(filterNotes([a, b, c], { query: 'PİLOT' }).map(n => n.id)).toEqual(['b', 'c']);
        expect(allTags([a, b]).slice(0, 2)).toEqual([{ tag: 'Toplantı', count: 2 }, { tag: 'Karar', count: 1 }]);
    });

    it('hafta → gün, en yeni önce', () => {
        const g = groupNotesByWeek([c, a, b]);
        expect(g.map(w => [w.week, w.count])).toEqual([[41, 2], [40, 1]]);
        expect(g[0].days.map(d => d.key)).toEqual(['2026-10-07', '2026-10-06']);
    });
});
