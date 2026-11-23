import { describe, expect, it } from 'vitest';
import { Task, TaskStatus } from '../../types';
import { createEmptyWorkspace, createProject } from '../workspace';
import { expandSlash, findCommand, slashMatches } from './slashCommands';
import { buildToolContext } from './scope';
import { buildSystemPrompt } from './systemPrompt';

describe('"/" komutları', () => {
    it('menü yalnız "/" ile başlayıp boşluk yokken; önek ve Türkçe harfle bulur', () => {
        expect(slashMatches('/').length).toBeGreaterThan(10);
        expect(slashMatches('/ge').map(c => c.cmd)).toEqual(['geciken']);
        expect(slashMatches('/excel x')).toEqual([]);
        expect(slashMatches('merhaba')).toEqual([]);
        expect(findCommand('hatırla')?.cmd).toBe('hatirla');
        expect(findCommand('ri')?.cmd).toBe('riskler');
        expect(findCommand('r')).toBeUndefined(); // rapor / riskler belirsiz
    });

    it('bağlama göre isteğe dönüşür; komuttan sonraki metin eklenir', () => {
        expect(expandSlash('/geciken', { projectName: 'ATLAS' })).toBe('ATLAS projesinde geciken görevleri bul; her biri için gerçekçi yeni termin öner ve tek öneri kartında hazırla.');
        expect(expandSlash('/excel riskler', { projectName: 'ATLAS' })).toBe('riskler için Excel dosyası hazırla (ATLAS).');
        expect(expandSlash('/pdf', { hasAnswer: true })).toBe('Son yanıttaki veriyi PDF dosyası olarak hazırla.');
        expect(expandSlash('/bu', { taskLabel: 'ATL-59 Harita katmanı' })).toContain('Ekranda açık görevi (ATL-59 Harita katmanı)');
        expect(expandSlash('/hatirla süreleri gün olarak ver', {})).toBe('Şunu hatırla ve bundan sonra uygula: süreleri gün olarak ver');
        expect(expandSlash('/yok', {})).toEqual({ error: expect.stringContaining('"/yok" diye bir komut yok') });
        expect(expandSlash('normal soru', {})).toBeNull();
    });
});

describe('ekran odağı', () => {
    it('açık görev ve kişi sistem talimatına girer; görünmeyen projedeki görev girmez', () => {
        const p = createProject('ATLAS', { code: 'ATL' });
        p.id = 'atlas';
        p.pmPersonId = 'p1';
        const t: Task = { id: 't1', name: 'Harita katmanı', availability: true, priority: 'High', version: 1, predecessor: null, unit: '', resourceName: 'Ayşe Kaya', time: { best: 1, avg: 2, worst: 3 }, jiraId: 'ATL-59', notes: '', status: TaskStatus.InProgress, dueDate: '2026-10-06' };
        p.tasks = [t];
        const ws = { ...createEmptyWorkspace(), currentRole: 'py' as const, currentPersonId: 'p1', projects: [p], people: [{ id: 'p1', firstName: 'Ayşe', lastName: 'Kaya', departmentCode: 'U310', availableAA: 1, roles: [] }] };
        const prompt = buildSystemPrompt(buildToolContext(ws), { focus: { projectId: 'atlas', taskId: 't1', personId: 'p1' } });
        expect(prompt).toContain('- Ekranda açık görev: "Harita katmanı" (ATLAS; ATL-59, durum Süreçte, atanan Ayşe Kaya, termin 2026-10-06, öncelik High)');
        expect(prompt).toContain('- Ekranda açık kişi profili: Ayşe Kaya (U310)');
        const other = buildSystemPrompt(buildToolContext({ ...ws, currentPersonId: 'p9' }), { focus: { projectId: 'atlas', taskId: 't1' } });
        expect(other).not.toContain('Ekranda açık görev');
    });
});
