import { PestelItem, Risk, SwotItem, SwotQuadrant } from '../types';
import { PESTEL_LABELS } from './pestel';
import { riskScore } from './risks';

/**
 * SWOT analizi yardımcıları — Güçlü/Zayıf Yönler (içsel) ve Fırsatlar/Tehditler
 * (dışsal) 2×2 stratejik pano. Saf/test edilebilir; UI SwotModal bu tanımları,
 * özeti ve PESTEL/risk otomatik beslemesini kullanır.
 */

export const SWOT_ORDER: SwotQuadrant[] = ['strength', 'weakness', 'opportunity', 'threat'];

export const SWOT_LABELS: Record<SwotQuadrant, {
    label: string;
    short: string; // S / W / O / T
    icon: string;
    hex: string;
    kind: 'internal' | 'external';
    tone: 'pos' | 'neg';
}> = {
    strength: { label: 'Güçlü Yönler', short: 'S', icon: 'fa-dumbbell', hex: '#10b981', kind: 'internal', tone: 'pos' },
    weakness: { label: 'Zayıf Yönler', short: 'W', icon: 'fa-triangle-exclamation', hex: '#f59e0b', kind: 'internal', tone: 'neg' },
    opportunity: { label: 'Fırsatlar', short: 'O', icon: 'fa-arrow-trend-up', hex: '#3b82f6', kind: 'external', tone: 'pos' },
    threat: { label: 'Tehditler', short: 'T', icon: 'fa-bolt', hex: '#ef4444', kind: 'external', tone: 'neg' },
};

export const SWOT_KIND_LABELS: Record<'internal' | 'external', string> = {
    internal: 'İçsel',
    external: 'Dışsal',
};

let seq = 0;
export const createSwotItem = (quadrant: SwotQuadrant, partial: Partial<SwotItem> = {}): SwotItem => ({
    id: `swot-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    quadrant,
    text: '',
    ...partial,
});

export interface SwotSummary {
    total: number;
    byQuadrant: Record<SwotQuadrant, number>;
    internal: number; // güçlü + zayıf
    external: number; // fırsat + tehdit
    positive: number; // güçlü + fırsat
    negative: number; // zayıf + tehdit
    emptyQuadrants: SwotQuadrant[];
}

export const summarizeSwot = (items: SwotItem[]): SwotSummary => {
    const byQuadrant = Object.fromEntries(SWOT_ORDER.map(q => [q, 0])) as Record<SwotQuadrant, number>;
    items.forEach(i => { byQuadrant[i.quadrant] = (byQuadrant[i.quadrant] || 0) + 1; });
    return {
        total: items.length,
        byQuadrant,
        internal: byQuadrant.strength + byQuadrant.weakness,
        external: byQuadrant.opportunity + byQuadrant.threat,
        positive: byQuadrant.strength + byQuadrant.opportunity,
        negative: byQuadrant.weakness + byQuadrant.threat,
        emptyQuadrants: SWOT_ORDER.filter(q => byQuadrant[q] === 0),
    };
};

/** Bir kadranın maddeleri (giriş sırasını korur) */
export const itemsForQuadrant = (items: SwotItem[], quadrant: SwotQuadrant): SwotItem[] =>
    items.filter(i => i.quadrant === quadrant);

const norm = (s: string): string => s.trim().toLocaleLowerCase('tr-TR');

/**
 * PESTEL ve risklerden SWOT önerileri üretir (tek tıkla besleme).
 *  - PESTEL fırsatları → Fırsatlar; PESTEL tehditleri → Tehditler
 *  - Yüksek riskler (skor ≥ 15, kapanmamış) → Tehditler
 * Mevcut maddelerle ve kendi içinde mükerrerler ayıklanır. Yalnızca eklenecek
 * YENİ maddeler döner (çağıran [...items, ...öneri] ile birleştirir).
 */
export const suggestSwotFromContext = (existing: SwotItem[], pestelItems: PestelItem[], risks: Risk[]): SwotItem[] => {
    const seen = new Set(existing.map(i => `${i.quadrant}|${norm(i.text)}`));
    const out: SwotItem[] = [];
    const push = (quadrant: SwotQuadrant, text: string, note?: string): void => {
        const clean = text.trim();
        const key = `${quadrant}|${norm(clean)}`;
        if (!clean || seen.has(key)) return;
        seen.add(key);
        out.push(createSwotItem(quadrant, { text: clean, note }));
    };

    pestelItems.forEach(p => {
        const q: SwotQuadrant = p.kind === 'opportunity' ? 'opportunity' : 'threat';
        push(q, p.text, `PESTEL · ${PESTEL_LABELS[p.category].label}`);
    });

    risks
        .filter(r => r.status !== 'closed' && riskScore(r) >= 15)
        .forEach(r => push('threat', r.title, `Risk · skor ${riskScore(r)}`));

    return out;
};
