import { describe, expect, it } from 'vitest';
import { Resource, Task, TaskStatus } from '../types';
import {
    createResource, hasResourceNamed, parsePercent, resourceTaskCounts, rowsToResourcePlan, setMonthlyValue, unitPlans, updateResource,
} from './resourcePlan';

const res = (id: string, name: string, unit: string, plan: number[] = []): Resource => ({
    id, name, unit, title: 'Uzman', participation: 100, monthlyPlan: Object.fromEntries(plan.map((v, i) => [i, v])),
});
const task = (id: string, owner: string, status = TaskStatus.ToDo): Task => ({
    id, name: id, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: 'U310', resourceName: owner,
    time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status,
});

describe('parsePercent', () => {
    it('kesir, yüzde metni ve sayı', () => {
        expect(parsePercent(0.5)).toBe(50);
        expect(parsePercent('75%')).toBe(75);
        expect(parsePercent('0,25')).toBe(25);
        expect(parsePercent(80)).toBe(80);
        expect(parsePercent('')).toBe(0);
        expect(parsePercent('yok')).toBe(0);
    });
});

describe('rowsToResourcePlan', () => {
    it('birim başlıklarını ayırır, var olanı günceller, yeniyi ekler', () => {
        const existing = [res('r1', 'Ayşe Yılmaz', 'Eski')];
        const months = (v: number) => Array.from({ length: 12 }, () => v);
        const { resources, added, updated } = rowsToResourcePlan([
            ['Ad', ...months(0)],
            ['Yazılım Birimi'],
            ['ayşe yılmaz', ...months(0.5)],
            ['Ali Veli', ...months(100)],
            ['Altyapı Grup Toplam'],
            ['Kaan Demir', ...months(25)],
            [''],
        ], existing, 9);
        expect({ added, updated }).toEqual({ added: 2, updated: 1 });
        expect(resources.find(r => r.id === 'r1')).toMatchObject({ unit: 'Yazılım', participation: 50 });
        expect(resources.find(r => r.name === 'Kaan Demir')).toMatchObject({ unit: 'Altyapı', participation: 25, title: 'Uzman' });
    });
});

describe('plan tablosu', () => {
    const list = [res('a', 'Ayşe', 'U310', [100, 120]), res('b', 'Ali', 'U310', [50, 100]), res('c', 'Kaan', 'U320', [100])];

    it('birim toplamları ve kapasite', () => {
        const plans = unitPlans(list);
        expect(plans.map(p => p.unit)).toEqual(['U310', 'U320']);
        expect(plans[0].totals.slice(0, 2)).toEqual([150, 220]);
        expect(plans[0].capacity).toBe(200);
    });

    it('ay değeri; içinde bulunulan aysa güncel katılım da', () => {
        const next = setMonthlyValue(list, 'a', 3, 40, 3);
        expect(next[0].monthlyPlan![3]).toBe(40);
        expect(next[0].participation).toBe(40);
        expect(setMonthlyValue(list, 'a', 4, 10, 3)[0].participation).toBe(100);
    });
});

describe('kaynak düzenleme', () => {
    it('ad/birim değişince görev atamaları da güncellenir', () => {
        const { resources, tasks } = updateResource([res('a', 'Ayşe', 'U310')], [task('t1', 'Ayşe'), task('t2', 'Ali')], 'a', { name: 'Ayşe Y.', unit: 'U330' });
        expect(resources[0]).toMatchObject({ name: 'Ayşe Y.', unit: 'U330' });
        expect(tasks[0]).toMatchObject({ resourceName: 'Ayşe Y.', unit: 'U330' });
        expect(tasks[1].resourceName).toBe('Ali');
    });

    it('boş ad yok sayılır; ünvan değişimi görevlere dokunmaz', () => {
        const t = [task('t1', 'Ayşe')];
        const out = updateResource([res('a', 'Ayşe', 'U310')], t, 'a', { name: '  ', title: 'Kıdemli' });
        expect(out.resources[0]).toMatchObject({ name: 'Ayşe', title: 'Kıdemli' });
        expect(out.tasks).toBe(t);
    });

    it('yeni kaynak, ad çakışması ve görev sayısı', () => {
        const r = createResource(' Zeynep ', 'U310', '', 60, 2);
        expect(r).toMatchObject({ name: 'Zeynep', title: 'Uzman', participation: 60 });
        expect(r.monthlyPlan![2]).toBe(60);
        expect(r.monthlyPlan![3]).toBe(0);
        expect(hasResourceNamed([r], 'ZEYNEP')).toBe(true);
        expect(resourceTaskCounts('Ayşe', [task('a', 'Ayşe'), task('b', 'Ayşe', TaskStatus.Done)])).toEqual({ open: 1, total: 2 });
    });
});
