import { TaskStatus, View } from '../../types';
import { ToolContext, personName } from '../ai/scope';
import { PESTEL_KIND_LABELS, PESTEL_LABELS } from '../pestel';
import { RISK_STATUS_LABELS } from '../risks';
import { SWOT_LABELS } from '../swot';
import GUIDE_MD from './guide.md?raw';

/**
 * Bilgi tabanı kaynakları. Uygulama verisi ToolContext.scoped üzerinden
 * toplanır — yani asistanın araçlarıyla AYNI rol kapsamı: görünmeyen projeler
 * hiç dizinlenmez, yönetici rollerinde notlar/istekler zaten boştur.
 */

export type RagSourceType = 'not' | 'gorev' | 'risk' | 'istek' | 'analiz' | 'hedef' | 'proje' | 'kilavuz' | 'dokuman';

export const RAG_SOURCE_LABELS: Record<RagSourceType, string> = {
    not: 'Haftalık not',
    gorev: 'Görev',
    risk: 'Risk',
    istek: 'Müşteri isteği',
    analiz: 'PESTEL / SWOT',
    hedef: 'Hedef',
    proje: 'Proje',
    kilavuz: 'Kullanım kılavuzu',
    dokuman: 'Kurumsal doküman',
};

export type RagRef =
    | { kind: 'project-view'; projectId: string; view: View }
    | { kind: 'guide'; section: string }
    | { kind: 'document'; docId: string };

export interface RagDoc {
    id: string;
    type: RagSourceType;
    title: string;
    text: string;
    projectId?: string;
    projectName?: string;
    date?: string; // YYYY-MM-DD
    ref: RagRef;
}

const TASK_STATUS_TR: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'Backlog', [TaskStatus.ToDo]: 'Yapılacak', [TaskStatus.InProgress]: 'Devam ediyor', [TaskStatus.Done]: 'Tamamlandı',
};

const lines = (...xs: unknown[]): string => xs.filter((x): x is string => typeof x === 'string' && x.trim() !== '').join('\n');

export const workspaceDocs = (ctx: ToolContext): RagDoc[] => {
    const docs: RagDoc[] = [];
    for (const p of ctx.scoped.projects) {
        const base = { projectId: p.id, projectName: p.name };
        const at = (view: View): RagRef => ({ kind: 'project-view', projectId: p.id, view });
        const pm = p.pmPersonId ? ctx.ws.people.find(x => x.id === p.pmPersonId) : undefined;

        if (p.ragNote?.trim()) {
            docs.push({
                ...base, id: `proje:${p.id}`, type: 'proje', title: `${p.name} — haftalık durum notu`, date: p.updatedAt?.slice(0, 10), ref: at(View.Portfolio),
                text: lines(`Proje: ${p.name}${p.code ? ` (${p.code})` : ''}`, pm && `Proje yöneticisi: ${personName(pm)}`, `Durum notu: ${p.ragNote}`),
            });
        }
        for (const t of p.tasks) {
            docs.push({
                ...base, id: `gorev:${p.id}:${t.id}`, type: 'gorev', title: t.name, date: t.dueDate?.slice(0, 10), ref: at(View.Tasks),
                text: lines(
                    `Görev: ${t.name} — durum: ${TASK_STATUS_TR[t.status] || t.status}, öncelik: ${t.priority}${t.resourceName ? `, atanan: ${t.resourceName}` : ''}${t.dueDate ? `, bitiş: ${t.dueDate.slice(0, 10)}` : ''}`,
                    t.notes?.trim() && `Açıklama: ${t.notes.trim()}`,
                    t.subtasks?.length && `Alt görevler: ${t.subtasks.map(s => `${s.text}${s.completed ? ' (tamam)' : ''}`).join('; ')}`,
                    t.comments?.length && `Yorumlar: ${t.comments.map(c => `${c.author}: ${c.text}`).join(' | ')}`,
                ),
            });
        }
        for (const r of p.risks || []) {
            docs.push({
                ...base, id: `risk:${p.id}:${r.id}`, type: 'risk', title: r.title, date: r.createdAt?.slice(0, 10), ref: at(View.Risks),
                text: lines(
                    `Risk: ${r.title} — olasılık ${r.probability}, etki ${r.impact}, durum: ${RISK_STATUS_LABELS[r.status]}${r.owner ? `, sahibi: ${r.owner}` : ''}`,
                    r.description?.trim() && `Açıklama: ${r.description.trim()}`,
                    r.mitigation?.trim() && `Azaltıcı aksiyon: ${r.mitigation.trim()}`,
                ),
            });
        }
        for (const n of p.notes) {
            docs.push({
                ...base, id: `not:${p.id}:${n.id}`, type: 'not', title: `${p.name} — ${n.year}-H${n.weekNumber} notu`, date: n.createdAt?.slice(0, 10), ref: at(View.Notes),
                text: lines(n.content, n.tags?.length && `Etiketler: ${n.tags.join(', ')}`),
            });
        }
        for (const c of p.customerRequests) {
            docs.push({
                ...base, id: `istek:${p.id}:${c.id}`, type: 'istek', title: c.title, date: c.createdAt?.slice(0, 10), ref: at(View.Requests),
                text: lines(`Müşteri isteği: ${c.title} — müşteri: ${c.customerName}, durum: ${c.status}`, c.description?.trim()),
            });
        }
        for (const it of p.pestelItems || []) {
            docs.push({
                ...base, id: `pestel:${p.id}:${it.id}`, type: 'analiz', title: `PESTEL — ${PESTEL_LABELS[it.category]?.label || it.category}`, ref: at(View.Risks),
                text: lines(`PESTEL ${PESTEL_LABELS[it.category]?.label || it.category} ${PESTEL_KIND_LABELS[it.kind] || it.kind} (etki ${it.impact}): ${it.text}`, it.note?.trim() && `Not: ${it.note.trim()}`),
            });
        }
        for (const it of p.swotItems || []) {
            docs.push({
                ...base, id: `swot:${p.id}:${it.id}`, type: 'analiz', title: `SWOT — ${SWOT_LABELS[it.quadrant]?.label || it.quadrant}`, ref: at(View.Risks),
                text: lines(`SWOT ${SWOT_LABELS[it.quadrant]?.label || it.quadrant}: ${it.text}`, it.note?.trim() && `Not: ${it.note.trim()}`),
            });
        }
        for (const o of p.objectives) {
            docs.push({
                ...base, id: `hedef:${p.id}:${o.id}`, type: 'hedef', title: o.name, ref: at(View.Goals),
                text: lines(`Hedef (${o.quarter}): ${o.name}`, o.description?.trim(), o.keyResults.length > 0 && `Anahtar sonuçlar: ${o.keyResults.map(k => k.name).join('; ')}`),
            });
        }
        for (const w of p.workPackages) {
            if (!w.description?.trim()) continue;
            docs.push({
                ...base, id: `ip:${p.id}:${w.id}`, type: 'proje', title: `İş paketi — ${w.name}`, ref: at(View.Tasks),
                text: lines(`İş paketi: ${w.name}`, w.description.trim()),
            });
        }
    }
    return docs;
};

/** Gömülü kullanım kılavuzu — her "## " başlığı ayrı bir belge */
export const guideDocs = (md: string = GUIDE_MD): RagDoc[] =>
    md.split(/^## /m).slice(1).map(sec => {
        const nl = sec.indexOf('\n');
        const title = (nl === -1 ? sec : sec.slice(0, nl)).trim();
        const text = (nl === -1 ? '' : sec.slice(nl + 1)).trim();
        return { id: `kilavuz:${title}`, type: 'kilavuz' as const, title, text, ref: { kind: 'guide' as const, section: title } };
    }).filter(d => d.text);

/** Yanıtta gösterilen numaralı kaynak */
export interface Citation {
    no: number;
    chunkId: string;
    type: RagSourceType;
    title: string;
    projectName?: string;
    date?: string;
    excerpt: string;
    ref: RagRef;
}

export interface UploadedDoc {
    id: string;
    name: string;
    size: number;
    addedAt: string; // ISO
    text: string;
}

export const uploadedDocsToRag = (docs: UploadedDoc[]): RagDoc[] =>
    docs.filter(d => d.text.trim()).map(d => ({
        id: `dokuman:${d.id}`, type: 'dokuman', title: d.name, text: d.text, date: d.addedAt.slice(0, 10), ref: { kind: 'document', docId: d.id },
    }));
