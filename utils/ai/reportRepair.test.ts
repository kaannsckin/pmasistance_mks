import { describe, expect, it } from 'vitest';
import { newItem } from '../weeklyReport';
import { buildRepairPrompt, checkSuggestion, checkSummary, issueLines, needsRepair, pickBetter } from './reportRepair';

const INPUT = 'Proje: Safir Posta\nHafta: 41. hafta (5–9 Ekim 2026)\nHaftalık notlar:\n- 06.10: Gebze demo yapıldı, 50 kişilik pilot onaylandı.';
const sug = (texts: string[], abbreviations: { abbr: string; expansion: string }[] = []) => ({
    thisWeek: texts.map(t => newItem('meeting', t)), nextWeek: [newItem('plan', 'Pilot takvimi netleştirilecek.')], abbreviations, missing: [] as string[],
});

describe('çıktı denetimi', () => {
    it('format hatası ve dayanaksız bilgi sayılır; özet satırı', () => {
        const s = sug(['6 Ekim 2026 tarihinde Gebze ile KYS demosu yapıldı; 120 kişilik pilot kararlaştırıldı.']);
        const c = checkSuggestion(s, INPUT);
        expect(c.errors).toBeGreaterThan(0); // KYS açılımı yok
        expect(c.grounding.map(g => g.value)).toEqual(['120', 'KYS']); // girdide geçmeyen kısaltma da dayanaksız ad
        expect(needsRepair(c)).toBe(true);
        expect(checkSummary(c)).toMatch(/format hatası.*2 dayanaksız bilgi/);
        const ok = checkSuggestion(sug(['6 Ekim 2026 tarihinde Gebze ile demo yapıldı; 50 kişilik pilot onaylandı.']), INPUT);
        expect(needsRepair(ok)).toBe(false);
    });

    it('önerinin kendi kısaltma listesi bilinen sayılır', () => {
        const c = checkSuggestion(sug(['6 Ekim 2026 tarihinde KYS demosu yapıldı.'], [{ abbr: 'KYS', expansion: 'Kurumsal Yazışma Sistemi' }]), INPUT);
        expect(c.lint.filter(i => i.code === 'abbr')).toEqual([]);
    });
});

describe('düzeltme istemi', () => {
    it('önceki JSON, madde konumlu sorunlar ve girdi', () => {
        const s = sug(['Demo yapıldı.', '6 Ekim 2026 tarihinde 120 kişilik pilot konuşuldu.']);
        const c = checkSuggestion(s, INPUT);
        const prompt = buildRepairPrompt(s, c, INPUT);
        expect(prompt).toContain('ÖNCEKİ YANITIN:\n{"buHafta":[{"tur":"meeting","metin":"Demo yapıldı."}');
        expect(issueLines(s, c)).toContain('- buHafta[2]: girdide geçmeyen rakam “120”; girdide dayanağı yoksa çıkar.');
        expect(prompt).toContain(`GİRDİ:\n${INPUT}`);
        expect(prompt).toMatch(/Yalnız bu sorunları düzelt/);
    });
});

describe('daha kötüyse ilkini koru', () => {
    const one = (texts: string[]) => { const s = sug(texts); return { s, check: checkSuggestion(s, INPUT) }; };
    it('daha az sorun → ikinci; eşit ya da kötü → ilk; boş ikinci → ilk', () => {
        const bad = one(['6 Ekim 2026 tarihinde 120 kişilik pilot konuşuldu.']);
        const good = one(['6 Ekim 2026 tarihinde 50 kişilik pilot onaylandı.']);
        expect(pickBetter(bad, good)).toMatchObject({ repaired: true, s: good.s });
        expect(pickBetter(good, bad)).toMatchObject({ repaired: false, s: good.s });
        expect(pickBetter(bad, one(['6 Ekim 2026 tarihinde 130 kişilik pilot konuşuldu.'])).repaired).toBe(false);
        expect(pickBetter(bad, null).repaired).toBe(false);
        expect(pickBetter(bad, { s: { ...bad.s, thisWeek: [], nextWeek: [] }, check: { ...bad.check, errors: 0, ungrounded: 0 } }).repaired).toBe(false);
    });
});
