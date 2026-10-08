import { ReleaseMilestone, ReleasePlan } from '../../types';
import { ISSUE_TYPE_LABELS } from '../planning/lifecycle';
import { effortOf, includedItems, newId, priorityOf, sanitizeMilestones, typeOf } from '../planning/releasePlan';
import { extractJson } from './json';

/**
 * Sürüm kayıtlarını AI ile kilometre taşlarına gruplama. Kayıtlar K1…Kn
 * etiketiyle verilir; yanıttaki bilinmeyen etiketler atılır, bir kayıt
 * yalnız bir taşa girer, açıkta kalanlar son taşa eklenir (sanitizeMilestones).
 * Tarihler AI'dan değil simülasyondan gelir.
 */

export const MILESTONE_PROMPT_VERSION = 'kilometre-tasi-1';
const PRIORITY_TR = { Blocker: 'Engelleyici', High: 'Yüksek', Medium: 'Orta', Low: 'Düşük' } as const;
const MAX_MILESTONES = 6;

const clip = (s: unknown, n: number) => {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export const milestoneLabels = (plan: ReleasePlan): Map<string, string> => new Map(includedItems(plan).map((i, k) => [`K${k + 1}`, i.id]));

export const milestonePrompt = (plan: ReleasePlan, workPackageNames: Map<string, string>): string => {
    const L: string[] = [];
    L.push(`Sürüm: ${clip(plan.name, 80)}${plan.targetDate ? ` (hedef ${plan.targetDate})` : ''}`);
    if (plan.summary.trim()) L.push(`Özet: ${clip(plan.summary, 600)}`);
    L.push('', 'Kayıtlar:');
    includedItems(plan).forEach((i, k) => {
        const e = effortOf(i);
        const t = typeOf(i);
        L.push(`[K${k + 1}] ${clip(i.name, 120)} | ${t ? ISSUE_TYPE_LABELS[t] : 'tür yok'} | önem ${PRIORITY_TR[priorityOf(i)]}${i.workPackageId && workPackageNames.get(i.workPackageId) ? ` | iş paketi ${clip(workPackageNames.get(i.workPackageId), 60)}` : ''}${e ? ` | efor ${String(e.likely).replace('.', ',')} gün` : ''}${i.predecessorId ? ' | öncülü var' : ''}`);
    });
    L.push('');
    L.push(`Görev: Bu kayıtları 2–${MAX_MILESTONES} kilometre taşına grupla. Her taş kendi başına gösterilebilir (demo edilebilir) bir ara çıktı olsun; önce bağımlılığı ve önemi yüksek kayıtlar.`);
    L.push('Kurallar: Her kayıt tam bir taşta olsun; yalnız verilen K numaralarını kullan. Taş adları kısa ve somut olsun (en çok 6 kelime). Tarih yazma; tarihleri simülasyon hesaplar.');
    L.push('Yanıtı YALNIZCA geçerli JSON olarak ver; açıklama, markdown ya da kod bloğu ekleme. Biçim:');
    L.push('{"kilometre_taslari": [{"ad": "...", "kayitlar": ["K1", "K2"], "gerekce": "..."}]}');
    return L.join('\n');
};

export const parseMilestones = (text: string, plan: ReleasePlan): ReleaseMilestone[] => {
    const v = (extractJson(text) || {}) as Record<string, unknown>;
    const raw = (Array.isArray(v) ? v : (v.kilometre_taslari ?? v.milestones ?? [])) as Record<string, unknown>[];
    if (!Array.isArray(raw) || !raw.length) throw new Error('Model kilometre taşı önermedi; tekrar deneyin.');
    const labels = milestoneLabels(plan);
    const ms = raw.slice(0, MAX_MILESTONES).map(m => ({
        id: newId('ms'),
        name: clip(m.ad ?? m.name, 60) || 'Kilometre taşı',
        itemIds: (Array.isArray(m.kayitlar ?? m.items) ? (m.kayitlar ?? m.items) as unknown[] : [])
            .map(x => String(x).toUpperCase().replace(/[^K0-9]/g, ''))
            .map(x => labels.get(x))
            .filter((x): x is string => !!x),
        rationale: clip(m.gerekce ?? m.rationale, 240) || undefined,
    }));
    return sanitizeMilestones(ms, plan);
};
