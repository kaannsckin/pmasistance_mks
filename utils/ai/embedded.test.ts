import { describe, expect, it } from 'vitest';
import { TaskStatus } from '../../types';
import { createProject } from '../workspace';
import { buildHistory } from '../planning/history';
import { estimateFromHistory } from '../planning/referenceClass';
import { cleanText, parsePertEstimate, parsePestelSuggestions, parseRiskSuggestions, parseSwotSuggestions, pertEstimatePrompt, projectContext } from './embedded';
import { extractJson, extractJsonArray } from './json';

describe('extractJson', () => {
    it('kod bloğu, düz JSON, metin içi JSON, düşünme bloğu ve sondaki virgül', () => {
        expect(extractJson('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
        expect(extractJson('{"a": 2}')).toEqual({ a: 2 });
        expect(extractJson('İşte öneriler: [{"a": "x]y"}, {"b": 3}] umarım faydalıdır')).toEqual([{ a: 'x]y' }, { b: 3 }]);
        expect(extractJson('<think>önce düşüneyim {bozuk</think>{"ok": true,}')).toEqual({ ok: true });
        expect(() => extractJson('JSON yok')).toThrow(/JSON/);
        expect(extractJsonArray('{"oneriler": [1, 2]}')).toEqual([1, 2]);
        // Nesnenin önünde ya da arkasında metin varsa içindeki ilk dizi değil, nesnenin kendisi alınır
        expect(extractJson('İşte önerim:\n{"dayanak": ["R1"], "efor": {"olasi": 2}}\nUmarım faydalı olur.')).toEqual({ dayanak: ['R1'], efor: { olasi: 2 } });
        expect(extractJsonArray('Öneriler: {"oneriler": [{"a": [1]}]} bitti')).toEqual([{ a: [1] }]);
    });
});

describe('gömülü özellik yanıt doğrulayıcıları', () => {
    it('risk önerileri: geçersizleri ve mevcut riskleri ayıklar', () => {
        const text = JSON.stringify([
            { baslik: 'Tedarik gecikmesi', olasilik: 4, etki: 4, aksiyon: 'x' },
            { baslik: 'Kilit personel ayrılığı', aciklama: 'Baş mimar', olasilik: 2, etki: 5, aksiyon: 'Bilgi aktarımı' },
            { baslik: 'Eksik etki', olasilik: 3 },
            { baslik: 'Aralık dışı', olasilik: 9, etki: 2 },
        ]);
        const r = parseRiskSuggestions(text, ['tedarik  GECİKMESİ']);
        expect(r).toEqual([{ title: 'Kilit personel ayrılığı', description: 'Baş mimar', probability: 2, impact: 5, mitigation: 'Bilgi aktarımı' }]);
        expect(() => parseRiskSuggestions('[]')).toThrow();
    });

    it('PESTEL/SWOT önerileri: kategori/bölge doğrulanır, tekrarlar atılır', () => {
        const p = parsePestelSuggestions(JSON.stringify([
            { kategori: 'legal', tur: 'threat', metin: 'KVKK yükümlülüğü', etki: 4 },
            { kategori: 'uzay', tur: 'threat', metin: 'geçersiz' },
            { kategori: 'economic', tur: 'opportunity', metin: 'Mevcut madde', etki: 2 },
        ]), [{ id: 'x', category: 'economic', kind: 'opportunity', text: 'Mevcut madde', impact: 2 }]);
        expect(p).toEqual([{ category: 'legal', kind: 'threat', text: 'KVKK yükümlülüğü', impact: 4 }]);
        const s = parseSwotSuggestions('[{"bolge":"strength","metin":"Deneyimli ekip"},{"bolge":"x","metin":"y"}]');
        expect(s).toEqual([{ quadrant: 'strength', text: 'Deneyimli ekip' }]);
    });

    it('PERT tahmini sıralanır ve doğrulanır', () => {
        expect(parsePertEstimate('{"iyimser": 5, "ortalama": 3, "kotumser": 8, "gerekce": "benzer görev"}')).toEqual({ best: 3, avg: 5, worst: 8, rationale: 'benzer görev' });
        expect(() => parsePertEstimate('{"iyimser": 0, "ortalama": 0, "kotumser": 0}')).toThrow();
        expect(() => parsePertEstimate('{"iyimser": "a"}')).toThrow();
    });

    it('istem bağlamı: notlar yalnızca istenirse; referans görevler eklenir', () => {
        const p = createProject('ALTAY');
        p.notes = [{ id: 'n', content: 'GİZLİ NOT', createdAt: '2026-07-10T00:00:00Z', weekNumber: 28, year: 2026, tags: [], mentions: [] }];
        p.tasks = [{ id: 't', name: 'Veri göçü', availability: true, priority: 'High', version: 1, predecessor: null, unit: '', resourceName: '', time: { best: 2, avg: 4, worst: 7 }, jiraId: '', notes: '', status: TaskStatus.Done, dueDate: '2026-06-01' }];
        const now = new Date('2026-07-15T00:00:00Z');
        expect(projectContext(p, now)).not.toContain('GİZLİ NOT');
        expect(projectContext(p, now, { includeNotes: true })).toContain('GİZLİ NOT');
        expect(pertEstimatePrompt({ name: 'Yeni göç' }, p.tasks)).toContain('Veri göçü: tahmin 2/4/7 gün');
        // Kapanmış ve ölçülmüş görevin gerçekleşen süresi de verilir
        const measured = { ...p.tasks[0], startedAt: '2026-06-01T09:00:00', resolvedAt: '2026-06-05T17:00:00' };
        expect(pertEstimatePrompt({ name: 'Yeni göç' }, [measured])).toContain('gerçekleşen kapanma 5 iş günü');
        expect(cleanText('```\nMetin\n```')).toBe('Metin');
    });

    it('benzer kapanmış kayıtlar varsa bağlam gerçek eforlardan kurulur', () => {
        const tasks = Array.from({ length: 6 }, (_, i) => ({
            id: `h${i}`, name: `Veri göçü betiği ${i}`, availability: true, priority: 'High' as const, version: 1, predecessor: null, unit: 'Yazılım', resourceName: '',
            time: { best: 1, avg: 2, worst: 3 }, jiraId: '', notes: '', status: TaskStatus.Done,
            startedAt: '2026-05-04T09:00:00', createdAt: '2026-05-04T09:00:00', resolvedAt: `2026-05-0${5 + (i % 3)}T17:00:00`,
        }));
        const h = buildHistory([createProject('G', { tasks })]);
        const ref = estimateFromHistory({ name: 'Veri göçü betiği yeni' }, h);
        const prompt = pertEstimatePrompt({ name: 'Veri göçü betiği yeni' }, [], ref);
        expect(prompt).toContain('Benzer kapanmış kayıtlar (gerçekleşen)');
        expect(prompt).toMatch(/gerçek efor \d/);
        expect(prompt).not.toContain('Aynı projedeki görevler');
    });
});
