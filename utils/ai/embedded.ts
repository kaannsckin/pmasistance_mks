import { PestelCategory, PestelItem, Project, RiskLevel, SwotItem, SwotQuadrant, Task, TaskStatus } from '../../types';
import { PESTEL_LABELS, PESTEL_ORDER } from '../pestel';
import { riskScore } from '../risks';
import { SWOT_LABELS, SWOT_ORDER } from '../swot';
import { stripReasoning } from './client';
import { extractJson, extractJsonArray } from './json';

/**
 * Ekranlara gömülü AI özellikleri — istem (prompt) oluşturucular ve yanıt
 * doğrulayıcılar (saf, test edilebilir). Model çıktısı hiçbir zaman doğrudan
 * veriye yazılmaz: kullanıcıya öneri olarak gösterilir, seçtikleri eklenir.
 */

export const EMBED_SYSTEM =
    "Sen PlanAsistan'ın proje yönetimi uzmanı yapay zekâsısın. Türkçe, kısa ve net yaz. Yalnızca sana verilen verilere dayan; sayı, isim ya da tarih uydurma.";

const JSON_RULE = 'Yanıtı YALNIZCA geçerli JSON olarak ver; açıklama, markdown ya da kod bloğu ekleme.';

const TASK_STATUS_TR: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'Backlog', [TaskStatus.ToDo]: 'Yapılacak', [TaskStatus.InProgress]: 'Devam ediyor', [TaskStatus.Done]: 'Tamamlandı',
};

const clip = (s: string | undefined, n: number): string => {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const norm = (s: string): string => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

const toLevel = (v: unknown): RiskLevel | null => {
    const n = Math.round(Number(v));
    return n >= 1 && n <= 5 ? (n as RiskLevel) : null;
};

/** Projenin AI'ya verilecek özeti (notlar yalnızca istenirse — sahibi PM'in ekranlarında) */
export const projectContext = (p: Project, now: Date, opts: { includeNotes?: boolean } = {}): string => {
    const today = now.toISOString().slice(0, 10);
    const L: string[] = [];
    L.push(`Proje: ${p.name}${p.code ? ` (${p.code})` : ''}`);
    if (p.ragNote) L.push(`Haftalık durum notu: ${clip(p.ragNote, 300)}`);
    if (p.objectives.length) L.push(`Hedefler: ${p.objectives.map(o => o.name).join('; ')}`);
    if (p.workPackages.length) L.push(`İş paketleri: ${p.workPackages.map(w => w.name).join('; ')}`);
    if (p.tasks.length) {
        L.push('Görevler:');
        p.tasks.slice(0, 40).forEach(t => {
            const late = t.dueDate && t.status !== TaskStatus.Done && t.dueDate.slice(0, 10) < today;
            L.push(`- ${t.name} [${TASK_STATUS_TR[t.status]}${t.dueDate ? `, bitiş ${t.dueDate.slice(0, 10)}` : ''}${late ? ', GECİKMİŞ' : ''}]${t.notes ? `: ${clip(t.notes, 120)}` : ''}`);
        });
    }
    if (p.risks?.length) L.push(`Mevcut riskler: ${p.risks.map(r => `${r.title} (skor ${riskScore(r)}, ${r.status})`).join('; ')}`);
    if (p.pestelItems?.length) L.push(`PESTEL: ${p.pestelItems.map(i => `${PESTEL_LABELS[i.category]?.label}/${i.kind}: ${i.text}`).join('; ')}`);
    if (p.swotItems?.length) L.push(`SWOT: ${p.swotItems.map(i => `${SWOT_LABELS[i.quadrant]?.label}: ${i.text}`).join('; ')}`);
    if (opts.includeNotes && p.notes.length) {
        const since = new Date(now.getTime() - 8 * 7 * 86400000).toISOString();
        const recent = p.notes.filter(n => n.createdAt >= since).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        let budget = 2500;
        const picked: string[] = [];
        for (const n of recent) {
            const line = `- ${n.createdAt.slice(0, 10)}: ${clip(n.content, 400)}`;
            if (line.length > budget) break;
            budget -= line.length;
            picked.push(line);
        }
        if (picked.length) L.push('Son haftalık notlar:', ...picked);
    }
    return L.join('\n');
};

// ---------------------------------------------------------------------------
// Metin üretimi (durum raporu, yönetici brifingi)
// ---------------------------------------------------------------------------

export const execNarrativePrompt = (brief: string): string =>
    `Aşağıdaki yönetici brifingi verilerinden üst yönetime sunulacak 2-3 kısa paragraflık akıcı bir durum özeti yaz. ` +
    `Önce genel tablo, sonra en kritik 3 konu ve önerilen aksiyonlar. Sayıları ve isimleri DEĞİŞTİRME, yeni sayı ekleme; düz metin yaz (başlık ve madde işareti kullanma).\n\n${brief}`;

/** Serbest metin yanıtı temizler (düşünme bloğu, çevreleyen kod bloğu) */
export const cleanText = (text: string): string =>
    stripReasoning(text).replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/, '').trim();

// ---------------------------------------------------------------------------
// Risk önerileri
// ---------------------------------------------------------------------------

export interface RiskSuggestion {
    title: string;
    description?: string;
    probability: RiskLevel;
    impact: RiskLevel;
    mitigation?: string;
}

export const riskSuggestionPrompt = (p: Project, now: Date): string =>
    `${projectContext(p, now, { includeNotes: true })}\n\n` +
    `Görev: Bu projenin verilerinden (gecikmeler, notlar, PESTEL tehditleri, hedefler) risk kaydında henüz OLMAYAN en fazla 6 somut risk öner. ` +
    `Mevcut riskleri tekrarlama. Her öneri için olasılık ve etkiyi 1-5 arası ver ve uygulanabilir bir azaltıcı aksiyon yaz.\n` +
    `${JSON_RULE} Biçim: [{"baslik": "...", "aciklama": "...", "olasilik": 1-5, "etki": 1-5, "aksiyon": "..."}]`;

export const parseRiskSuggestions = (text: string, existingTitles: string[] = []): RiskSuggestion[] => {
    const seen = new Set(existingTitles.map(norm));
    const out: RiskSuggestion[] = [];
    for (const raw of extractJsonArray(text)) {
        const r = raw as Record<string, unknown>;
        const title = clip(String(r?.baslik ?? r?.title ?? ''), 160);
        const probability = toLevel(r?.olasilik ?? r?.probability);
        const impact = toLevel(r?.etki ?? r?.impact);
        if (!title || !probability || !impact || seen.has(norm(title))) continue;
        seen.add(norm(title));
        out.push({
            title, probability, impact,
            description: clip(String(r?.aciklama ?? r?.description ?? ''), 500) || undefined,
            mitigation: clip(String(r?.aksiyon ?? r?.mitigation ?? ''), 400) || undefined,
        });
        if (out.length >= 8) break;
    }
    if (out.length === 0) throw new Error('Yeni bir risk önerisi çıkmadı (mevcut risklerle örtüşüyor olabilir).');
    return out;
};

// ---------------------------------------------------------------------------
// PESTEL / SWOT taslakları
// ---------------------------------------------------------------------------

export interface PestelSuggestion {
    category: PestelCategory;
    kind: PestelItem['kind'];
    text: string;
    impact: RiskLevel;
}

export const pestelSuggestionPrompt = (p: Project, now: Date): string =>
    `${projectContext(p, now, { includeNotes: true })}\n\n` +
    `Görev: Bu proje için PESTEL dış çevre analizi taslağı hazırla; mevcut PESTEL maddelerini tekrarlama. Her kategori için en fazla 2, toplam en fazla 10 madde; ` +
    `Türkiye ve kamu Ar-Ge bağlamını gözet, genel geçer ifadelerden kaçın.\n` +
    `Kategoriler: ${PESTEL_ORDER.map(c => `${c} (${PESTEL_LABELS[c].label})`).join(', ')}. Tür: opportunity (fırsat) ya da threat (tehdit). Etki 1-5.\n` +
    `${JSON_RULE} Biçim: [{"kategori": "political|economic|social|technological|environmental|legal", "tur": "opportunity|threat", "metin": "...", "etki": 1-5}]`;

export const parsePestelSuggestions = (text: string, existing: PestelItem[] = []): PestelSuggestion[] => {
    const seen = new Set(existing.map(i => norm(i.text)));
    const out: PestelSuggestion[] = [];
    for (const raw of extractJsonArray(text)) {
        const r = raw as Record<string, unknown>;
        const category = String(r?.kategori ?? r?.category ?? '').toLowerCase() as PestelCategory;
        const kind = String(r?.tur ?? r?.kind ?? '').toLowerCase();
        const body = clip(String(r?.metin ?? r?.text ?? ''), 240);
        const impact = toLevel(r?.etki ?? r?.impact) || 3;
        if (!PESTEL_ORDER.includes(category) || (kind !== 'opportunity' && kind !== 'threat') || !body || seen.has(norm(body))) continue;
        seen.add(norm(body));
        out.push({ category, kind, text: body, impact });
        if (out.length >= 12) break;
    }
    if (out.length === 0) throw new Error('Yeni bir PESTEL önerisi çıkmadı.');
    return out;
};

export interface SwotSuggestion {
    quadrant: SwotQuadrant;
    text: string;
}

export const swotSuggestionPrompt = (p: Project, now: Date): string =>
    `${projectContext(p, now, { includeNotes: true })}\n\n` +
    `Görev: Bu proje için SWOT analizi taslağı hazırla; mevcut SWOT maddelerini tekrarlama. Her bölge için en fazla 3 kısa, somut madde. ` +
    `Güçlü/Zayıf yönler projenin içinden (ekip, plan, ilerleme), Fırsat/Tehditler dışından (PESTEL, müşteri, piyasa) gelsin.\n` +
    `${JSON_RULE} Biçim: [{"bolge": "strength|weakness|opportunity|threat", "metin": "..."}]`;

export const parseSwotSuggestions = (text: string, existing: SwotItem[] = []): SwotSuggestion[] => {
    const seen = new Set(existing.map(i => norm(i.text)));
    const out: SwotSuggestion[] = [];
    for (const raw of extractJsonArray(text)) {
        const r = raw as Record<string, unknown>;
        const quadrant = String(r?.bolge ?? r?.quadrant ?? '').toLowerCase() as SwotQuadrant;
        const body = clip(String(r?.metin ?? r?.text ?? ''), 200);
        if (!SWOT_ORDER.includes(quadrant) || !body || seen.has(norm(body))) continue;
        seen.add(norm(body));
        out.push({ quadrant, text: body });
        if (out.length >= 12) break;
    }
    if (out.length === 0) throw new Error('Yeni bir SWOT önerisi çıkmadı.');
    return out;
};

// ---------------------------------------------------------------------------
// Görev süre tahmini (PERT)
// ---------------------------------------------------------------------------

export interface PertEstimate {
    best: number;
    avg: number;
    worst: number;
    rationale: string;
}

export const pertEstimatePrompt = (task: { name: string; notes?: string }, projectTasks: Task[]): string => {
    const refs = projectTasks
        .filter(t => t.name !== task.name && t.time && (t.time.avg > 0 || t.time.best > 0))
        .sort((a, b) => (a.status === TaskStatus.Done ? 0 : 1) - (b.status === TaskStatus.Done ? 0 : 1))
        .slice(0, 25)
        .map(t => `- ${t.name}${t.notes ? ` (${clip(t.notes, 80)})` : ''}: iyimser ${t.time.best}, ortalama ${t.time.avg}, kötümser ${t.time.worst} gün [${TASK_STATUS_TR[t.status]}]`);
    return `Yeni görev: ${task.name}${task.notes ? `\nAçıklama: ${clip(task.notes, 600)}` : ''}\n\n` +
        (refs.length ? `Aynı projedeki görevlerin tahminleri (referans):\n${refs.join('\n')}\n\n` : 'Projede referans görev yok; genel deneyime göre tahmin et.\n\n') +
        `Görev: Bu yeni görev için PERT süre tahmini yap (iş günü, tam sayı): iyimser ≤ ortalama ≤ kötümser. Benzer referans görevleri kullan ve kısa gerekçe yaz.\n` +
        `${JSON_RULE} Biçim: {"iyimser": 0, "ortalama": 0, "kotumser": 0, "gerekce": "..."}`;
};

export const parsePertEstimate = (text: string): PertEstimate => {
    const v = extractJson(text) as Record<string, unknown>;
    const nums = [v?.iyimser ?? v?.best, v?.ortalama ?? v?.avg, v?.kotumser ?? v?.worst].map(x => Math.round(Number(x)));
    const [best, avg, worst] = [...nums].sort((a, b) => a - b);
    if (nums.some(n => !Number.isFinite(n) || n < 0) || avg === 0) throw new Error('Model geçerli bir süre tahmini vermedi; tekrar deneyin.');
    return { best, avg, worst, rationale: clip(String(v?.gerekce ?? v?.rationale ?? ''), 300) };
};
