import { describe, expect, it } from 'vitest';
import { TaskStatus } from '../types';
import { completesGroup, createRapidClickDetector, createSequenceDetector, KONAMI, timeGreeting } from './easterEggs';

describe('Konami dizisi', () => {
    it('dizinin tamamında tetiklenir ve sıfırlanır', () => {
        const feed = createSequenceDetector();
        const results = KONAMI.map(k => feed(k));
        expect(results.slice(0, -1).every(r => !r)).toBe(true);
        expect(results[results.length - 1]).toBe(true);
        expect(KONAMI.map(k => feed(k)).pop()).toBe(true);
    });

    it('yanlış tuş diziyi bozar; büyük harf B/A da sayılır', () => {
        const feed = createSequenceDetector();
        ['ArrowUp', 'ArrowUp', 'x'].forEach(k => feed(k));
        expect(KONAMI.slice(0, -2).concat(['B', 'A']).map(k => feed(k)).pop()).toBe(true);
    });

    it('dizinin başıyla kesilirse yeniden başlar', () => {
        const feed = createSequenceDetector(['a', 'b', 'c']);
        feed('a');
        feed('a');
        feed('b');
        expect(feed('c')).toBe(true);
    });
});

describe('hızlı tık', () => {
    it('süre içinde 5 tıkta tetiklenir, yavaş tıklarda tetiklenmez', () => {
        const click = createRapidClickDetector(5, 2000);
        expect([0, 300, 600, 900].map(t => click(t)).some(Boolean)).toBe(false);
        expect(click(1200)).toBe(true);
        const slow = createRapidClickDetector(5, 2000);
        expect([0, 1000, 2500, 3500, 5000, 6500].map(t => slow(t)).some(Boolean)).toBe(false);
    });
});

describe('selam', () => {
    it('gece, cuma akşamı ve pazartesi sabahı', () => {
        expect(timeGreeting(new Date(2026, 9, 6, 23, 30))).toMatch(/dinlenmeyi/);
        expect(timeGreeting(new Date(2026, 9, 9, 17, 0))).toMatch(/Hafta sonu/); // cuma
        expect(timeGreeting(new Date(2026, 9, 12, 9, 0))).toMatch(/Yeni hafta/); // pazartesi
        expect(timeGreeting(new Date(2026, 9, 7, 14, 0))).toBeNull(); // çarşamba öğlen
    });
});

describe('completesGroup', () => {
    const group = [
        { id: 'a', status: TaskStatus.Done },
        { id: 'b', status: TaskStatus.InProgress },
    ];
    it('son görev bitince true', () => {
        expect(completesGroup(group, 'b', TaskStatus.Done)).toBe(true);
    });
    it('hâlâ açık görev varsa, zaten bitmişse ya da görev grupta değilse false', () => {
        expect(completesGroup([...group, { id: 'c', status: TaskStatus.ToDo }], 'b', TaskStatus.Done)).toBe(false);
        expect(completesGroup([{ id: 'a', status: TaskStatus.Done }], 'a', TaskStatus.Done)).toBe(false);
        expect(completesGroup(group, 'z', TaskStatus.Done)).toBe(false);
        expect(completesGroup(group, 'b', TaskStatus.ToDo)).toBe(false);
        expect(completesGroup([], 'b', TaskStatus.Done)).toBe(false);
    });
});
