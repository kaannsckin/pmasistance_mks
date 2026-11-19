import { describe, expect, it } from 'vitest';
import { Task, TaskStatus } from '../types';
import { createScheme } from './projectScheme';
import {
    applyTransition, conditionProblem, describeRule, dropRuleKeys, edgeRuleKey, entryRuleKey, inputProblems, needsInput, renameRuleKeys,
    ruleFor, ruleIsEmpty, setRule, transitionNeeds,
} from './transitions';

const task = (extra: Partial<Task> = {}): Task => ({
    id: 't', name: 'Giriş hatası', availability: true, priority: 'High', version: 1, predecessor: null, unit: '', resourceName: 'Ayşe Kaya',
    time: { best: 1, avg: 2, worst: 3 }, jiraId: 'SPS-7', notes: '', status: TaskStatus.InProgress, jiraStatus: 'TESTING', ...extra,
});
const people = [{ id: 'p1', firstName: 'Ayşe', lastName: 'Kaya' }, { id: 'p2', firstName: 'Veli', lastName: 'Test' }];
const target = { key: 'RESOLVED', label: 'Çözüldü', category: TaskStatus.Done };

describe('geçiş kuralları', () => {
    const wf = {
        ...createScheme('support', 'S').workflow,
        rules: {
            [entryRuleKey('RESOLVED')]: { requireComment: true, notifyAssignee: true },
            [edgeRuleKey('TESTING', 'RESOLVED')]: { people: ['p2'], requireHours: true, addLabels: ['test-tamam'], removeLabels: ['test-bekliyor'] },
        },
    };

    it('giriş kuralı ile geçiş kuralı birleşir', () => {
        const r = ruleFor(wf, 'TESTING', 'RESOLVED');
        expect(r).toMatchObject({ people: ['p2'], requireComment: true, requireHours: true, notifyAssignee: true, addLabels: ['test-tamam'] });
        expect(ruleFor(wf, 'ANALYSIS', 'RESOLVED')).toMatchObject({ requireComment: true });
        expect(ruleIsEmpty(ruleFor(wf, 'OPEN', 'ANALYSIS'))).toBe(true);
        expect(describeRule(r, people)).toEqual({
            conditions: ['yalnız Veli Test'], validators: ['geçiş notu', 'harcanan süre'],
            post: ['etiket ekle: test-tamam', 'etiket çıkar: test-bekliyor', 'atanana bildir'],
        });
    });

    it('koşullar: rol ya da kişi; yalnız atanan', () => {
        expect(conditionProblem({ people: ['p2'] }, task(), { role: 'py', personId: 'p1', name: 'Ayşe Kaya' }, people)).toBe('Bu geçişi yalnız Veli Test yapabilir.');
        expect(conditionProblem({ people: ['p2'], roles: ['py'] }, task(), { role: 'py', personId: 'p1' }, people)).toBeNull();
        expect(conditionProblem({ assigneeOnly: true }, task(), { role: 'py', name: 'ayşe kaya' })).toBeNull();
        expect(conditionProblem({ assigneeOnly: true }, task(), { role: 'py', name: 'Veli Test' })).toMatch(/yalnız görevin atananı \(Ayşe Kaya\)/);
        expect(conditionProblem({}, task(), { role: 'mudur' })).toBeNull();
    });

    it('doğrulayıcılar: not, süre, alanlar, alt görevler', () => {
        const r = { requireComment: true, requireHours: true, requireFields: ['dueDate' as const, 'resourceName' as const], requireSubtasksDone: true };
        const n = transitionNeeds(r, task({ subtasks: [{ text: 'a', completed: true }] }));
        expect(n).toEqual({ comment: true, hours: true, fields: ['dueDate'], blocking: null });
        expect(needsInput(n)).toBe(true);
        expect(transitionNeeds(r, task({ subtasks: [{ text: 'a', completed: false }] })).blocking).toMatch(/1 açık alt görev/);
        expect(inputProblems(r, task(), {})).toEqual(['Geçiş notu gerekli.', 'Harcanan süre (saat) gerekli.', 'Dolu olması gereken alan: Bitiş tarihi.']);
        expect(inputProblems(r, task(), { comment: 'Testler geçti', hours: 2, fields: { dueDate: '2026-12-01' } })).toEqual([]);
        expect(needsInput(transitionNeeds({ notifyAssignee: true }, task()))).toBe(false);
    });

    it('uygulama: durum, not → yorum, süre eklenir, etiket ve atama, bildirim etkisi', () => {
        const r = { ...ruleFor(wf, 'TESTING', 'RESOLVED'), assign: 'actor' as const };
        const out = applyTransition(task({ labels: ['test-bekliyor', 'gib'], actualHours: 4 }), target, r,
            { comment: 'Testler geçti', hours: 1.5 }, { actor: { role: 'py', name: 'Veli Test' }, setKey: true, now: new Date('2026-11-19T10:00:00Z'), projectName: 'SPS', fromLabel: 'Testte' });
        expect(out.task).toMatchObject({
            status: TaskStatus.Done, jiraStatus: 'RESOLVED', actualHours: 5.5, labels: ['gib', 'test-tamam'], resourceName: 'Veli Test',
            comments: [{ author: 'Veli Test', text: '[Testte → Çözüldü] Testler geçti', date: '2026-11-19T10:00:00.000Z' }],
        });
        expect(out.effects).toEqual([{ kind: 'notify', to: 'Veli Test', subject: 'SPS-7 · Giriş hatası: Çözüldü', text: 'SPS projesinde "Giriş hatası" "Testte" durumundan "Çözüldü" durumuna geçirildi (Veli Test).\nNot: Testler geçti' }]);
        expect(applyTransition(task(), target, { assign: 'none' }, {}, { actor: { role: 'py' }, setKey: false }).task).toMatchObject({ resourceName: '', jiraStatus: 'TESTING', status: TaskStatus.Done });
    });

    it('anahtar bakımı: yeniden adlandırma, silme, boş kural', () => {
        expect(renameRuleKeys(wf.rules, 'RESOLVED', 'FIXED')).toEqual({ '*>FIXED': wf.rules['*>RESOLVED'], 'TESTING>FIXED': wf.rules['TESTING>RESOLVED'] });
        expect(dropRuleKeys(wf.rules, 'TESTING')).toEqual({ '*>RESOLVED': wf.rules['*>RESOLVED'] });
        expect(setRule(wf.rules, '*>RESOLVED', {})).toEqual({ 'TESTING>RESOLVED': wf.rules['TESTING>RESOLVED'] });
        expect(setRule(undefined, 'A>B', {})).toBeUndefined();
    });
});
