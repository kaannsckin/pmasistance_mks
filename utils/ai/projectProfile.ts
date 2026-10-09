import { Project, ProjectAiProfile, WorkspaceData } from '../../types';
import { Identity, ownsProject } from '../rbac';

/**
 * Proje kartı — haftalık rapor AI'sının proje bağlamı. Kurum kılavuzu
 * "konuya PY kadar hâkim olmayan biri de anlayabilmeli" der; model bunu
 * ancak projenin ne olduğunu, müşterisini ve terimlerini bilirse karşılar.
 * Kartı proje sahibi PY yazar. Kart proje kaydıyla buluta gider (proje
 * notları gibi özel değildir).
 */

export const PROFILE_LIMITS = {
    summary: 600,
    text: 300, // müşteriler, ürün, paydaşlar, rapor ipuçları
    term: 60,
    explanation: 200,
    terms: 30,
} as const;

const clean = (s: unknown, n: number): string => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Kartı sınırlar ve boş alanları atar; hiçbir şey kalmazsa undefined */
export const cleanProjectProfile = (p: ProjectAiProfile | undefined, now?: Date): ProjectAiProfile | undefined => {
    if (!p) return undefined;
    const seen = new Set<string>();
    const glossary = (Array.isArray(p.glossary) ? p.glossary : [])
        .map(g => ({ term: clean(g?.term, PROFILE_LIMITS.term), explanation: clean(g?.explanation, PROFILE_LIMITS.explanation) }))
        .filter(g => {
            const k = g.term.toLocaleLowerCase('tr-TR');
            if (!g.term || !g.explanation || seen.has(k)) return false;
            seen.add(k);
            return true;
        })
        .slice(0, PROFILE_LIMITS.terms);
    const out: ProjectAiProfile = {};
    const summary = clean(p.summary, PROFILE_LIMITS.summary);
    if (summary) out.summary = summary;
    (['customers', 'product', 'stakeholders', 'reportHints'] as const).forEach(k => { const v = clean(p[k], PROFILE_LIMITS.text); if (v) out[k] = v; });
    if (glossary.length) out.glossary = glossary;
    if (!Object.keys(out).length) return undefined;
    return { ...out, updatedAt: (now ? now.toISOString() : p.updatedAt) || undefined };
};

export const profileIsEmpty = (p: ProjectAiProfile | undefined): boolean => !cleanProjectProfile(p);

export const PROFILE_HEADER = "Proje kartı (PY'nin tanımı):";

/** Girdideki kart bölümü (başlık + "- " satırları) */
export const projectProfileLines = (p: ProjectAiProfile | undefined): string[] => {
    const c = cleanProjectProfile(p);
    if (!c) return [];
    const L: string[] = [];
    if (c.summary) L.push(`- Özet: ${c.summary}`);
    if (c.customers) L.push(`- Müşteriler: ${c.customers}`);
    if (c.product) L.push(`- Ürün: ${c.product}`);
    if (c.stakeholders) L.push(`- Paydaşlar: ${c.stakeholders}`);
    if (c.glossary?.length) L.push(`- Terimler: ${c.glossary.map(g => `${g.term} = ${g.explanation}`).join('; ')}`);
    if (c.reportHints) L.push(`- Rapor ipuçları: ${c.reportHints}`);
    return L;
};

/** Girdiden kart bölümünü çıkarır (kartsız varyant için) */
export const stripProfileSection = (input: string): string => {
    const out: string[] = [];
    let inCard = false;
    input.split('\n').forEach(line => {
        if (line === PROFILE_HEADER) { inCard = true; return; }
        if (inCard && line.startsWith('- ')) return;
        inCard = false;
        out.push(line);
    });
    return out.join('\n');
};

/** Girdide kart yoksa "Hafta:" satırının ardına ekler (eski girdilerde kartın kazancını ölçmek için) */
export const withProfileSection = (input: string, p: ProjectAiProfile | undefined): string => {
    const lines = projectProfileLines(p);
    if (!lines.length || input.split('\n').includes(PROFILE_HEADER)) return input;
    const L = input.split('\n');
    const at = L.findIndex(l => l.startsWith('Hafta:'));
    L.splice(at >= 0 ? at + 1 : L.length, 0, PROFILE_HEADER, ...lines);
    return L.join('\n');
};

/** Kartı kaydeder (yalnız proje sahibi PY); yetki yoksa null */
export const setProjectProfile = (ws: Pick<WorkspaceData, 'projects'>, id: Identity, projectId: string, profile: ProjectAiProfile | undefined, now: Date = new Date()): Project[] | null => {
    const p = ws.projects.find(x => x.id === projectId);
    if (!p || !ownsProject(p, id)) return null;
    const aiProfile = cleanProjectProfile(profile, now);
    return ws.projects.map(x => {
        if (x.id !== projectId) return x;
        const { aiProfile: _old, ...rest } = x;
        void _old;
        return aiProfile ? { ...rest, aiProfile, updatedAt: now.toISOString() } : { ...rest, updatedAt: now.toISOString() };
    });
};
