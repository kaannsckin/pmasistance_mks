import { PestelCategory, PestelItem, RiskLevel } from '../types';

/**
 * PESTEL analizi yardımcıları — dış çevre faktörleri (Politik, Ekonomik,
 * Sosyal, Teknolojik, Çevresel, Yasal). Saf/test edilebilir; UI PestelModal
 * bu tanımları ve özeti render eder.
 */

export const PESTEL_ORDER: PestelCategory[] = ['political', 'economic', 'social', 'technological', 'environmental', 'legal'];

export const PESTEL_LABELS: Record<PestelCategory, { label: string; letter: string; icon: string; hex: string }> = {
    political: { label: 'Politik', letter: 'P', icon: 'fa-landmark', hex: '#6366f1' },
    economic: { label: 'Ekonomik', letter: 'E', icon: 'fa-coins', hex: '#10b981' },
    social: { label: 'Sosyal', letter: 'S', icon: 'fa-users', hex: '#f59e0b' },
    technological: { label: 'Teknolojik', letter: 'T', icon: 'fa-microchip', hex: '#3b82f6' },
    environmental: { label: 'Çevresel', letter: 'E', icon: 'fa-leaf', hex: '#22c55e' },
    legal: { label: 'Yasal', letter: 'L', icon: 'fa-scale-balanced', hex: '#ef4444' },
};

export const PESTEL_KIND_LABELS: Record<PestelItem['kind'], string> = {
    opportunity: 'Fırsat',
    threat: 'Tehdit',
};

export const createPestelItem = (category: PestelCategory, partial: Partial<PestelItem> = {}): PestelItem => ({
    id: `pestel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    category,
    text: '',
    kind: 'threat',
    impact: 3 as RiskLevel,
    ...partial,
});

export interface PestelSummary {
    total: number;
    opportunities: number;
    threats: number;
    highImpact: number; // etki >= 4
    byCategory: Record<PestelCategory, number>;
    emptyCategories: PestelCategory[]; // hiç maddesi olmayan faktörler
}

export const summarizePestel = (items: PestelItem[]): PestelSummary => {
    const byCategory = Object.fromEntries(PESTEL_ORDER.map(c => [c, 0])) as Record<PestelCategory, number>;
    let opportunities = 0, threats = 0, highImpact = 0;
    items.forEach(i => {
        byCategory[i.category] = (byCategory[i.category] || 0) + 1;
        if (i.kind === 'opportunity') opportunities++; else threats++;
        if (i.impact >= 4) highImpact++;
    });
    return {
        total: items.length,
        opportunities,
        threats,
        highImpact,
        byCategory,
        emptyCategories: PESTEL_ORDER.filter(c => byCategory[c] === 0),
    };
};

/** Bir faktörün maddeleri (etkisine göre azalan) */
export const itemsForCategory = (items: PestelItem[], category: PestelCategory): PestelItem[] =>
    items.filter(i => i.category === category).sort((a, b) => b.impact - a.impact);
