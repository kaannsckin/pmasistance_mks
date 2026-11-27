import type { Project, Task, WbNode, Whiteboard } from '../../types';
import { extractJson } from '../ai/json';
import { mapJiraPriority } from '../planning/jiraFields';
import { sectionOfNode } from './model';

/**
 * Pano notlarından kayıt (görev) açma: model, notları iş birimine göre
 * gruplar. Aynı işin farklı yönlerini anlatan notlar (gereksinim, mevcut
 * ekran, alternatifler, değerlendirmeler, oylama, karar — bir şablonun
 * bölümleri) TEK kayıt olur; bağımsız maddeler (ayrı hatalar, retro
 * aksiyonları) ayrı kayıt olur.
 */

export const MAX_NOTES = 80;
export const MAX_TASKS = 20;

export const WB_TASK_SYSTEM = `Sen PlanAsistan'ın Whiteboard asistanısın. Panodaki yapışkan notlardan proje kaydı (görev) açacaksın.

Önce notların kaç ayrı İŞ anlattığına karar ver:
- Aynı işin farklı yönlerini anlatan notlar TEK kayıttır: ör. gereksinim / müşteri talebi, mevcut ekran, alternatif tasarımlar, ekip değerlendirmeleri (UI/UX, geliştirici, test, PM görüşü), oylama sonucu, karar ve aksiyon, sorumlu, hedef tarih. Bir şablonun numaralı bölümleri (01 Gereksinim, 02 Mevcut arayüz …) çoğunlukla tek bir kaydın bilgileridir.
- Birbirinden bağımsız iş kalemleri ayrı kayıttır: ör. ayrı hatalar, retrospektif aksiyon maddeleri, bir listedeki ayrı istekler, farklı konulardaki notlar.
- Kararsız kalırsan: aynı bölüm başlığı altında ve aynı konuyu anlatanları birleştir; konu değişiyorsa ayır.
- Kullanıcı açıkça "tek kayıt" ya da "her not ayrı" derse ona uy.
- Şablonun doldurulmamış yer tutucu notlarını (ör. "Alternatif A", "UI/UX görüşü", "Seçilen tasarım", "Sorumlu kişi" gibi yalnız başlık olan notlar, "… yapıştırın", "… oy verin" gibi talimat notları) içerik sayma; kayda yazma. Yalnız bunlardan oluşan bir grup için kayıt açma.

Her kayıt için:
- "title": kısa, eylem odaklı başlık (en çok 90 karakter, Türkçe).
- "description": notlardaki bilgiyi kaybetmeden düzenli açıklama. Uygunsa şu başlıklarla: Gereksinim, Mevcut durum, Alternatifler, Değerlendirme, Karar, Kabul kriterleri, Sorumlu / hedef tarih. Notlarda olmayan bilgi uydurma.
- "notes": bu kayda giren notların takma adları (n1, n2 …).
- "priority": Blocker | High | Medium | Low (notlarda ipucu yoksa Medium).
- "type": bug | feature | improvement | task | other.

Yanıtın YALNIZ şu JSON olsun:
{"summary": "Kaç kayıt açtığını ve nasıl grupladığını anlatan 1-2 cümle", "tasks": [{"title": "…", "description": "…", "notes": ["n1"], "priority": "Medium", "type": "feature"}]}
En çok ${MAX_TASKS} kayıt.`;

export interface WbNoteRef { alias: string; node: WbNode }

/** Kayda dönüşebilecek notlar: yazılı not, metin ve şekiller */
export const isNoteLike = (n: WbNode): boolean => (n.type === 'sticky' || n.type === 'text' || n.type === 'shape') && !!n.text?.trim();

export const buildTaskPrompt = (board: Whiteboard, notes: WbNoteRef[], request: string, project?: Pick<Project, 'name'>): string => {
    const lines = [`Pano: ${board.name}${project ? ` (proje: ${project.name})` : ''}`, '', 'Notlar (bölüm, konum, metin):'];
    notes.forEach(({ alias, node }) => {
        const sec = sectionOfNode(board, node);
        const votes = Object.values(node.votes || {}).reduce((a, b) => a + b, 0);
        lines.push(`${alias}${sec ? ` [bölüm: ${(sec.text || 'Bölüm').trim()}]` : ''} (x=${Math.round(node.x)}, y=${Math.round(node.y)}${node.color ? `, ${node.color}` : ''}${votes ? `, ${votes} oy` : ''}): "${(node.text || '').replace(/\s+/g, ' ').trim().slice(0, 600)}"`);
    });
    lines.push('', `İstek: ${request.trim() || 'Bu notlardan kayıt aç.'}`);
    return lines.join('\n');
};

export interface WbTaskDraft {
    title: string;
    description: string;
    aliases: string[];
    priority: Task['priority'];
    issueType: NonNullable<Task['issueType']>;
}

const TYPES = new Set(['bug', 'feature', 'improvement', 'task', 'other']);
const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const parseTaskDrafts = (text: string, known: Set<string>): { summary: string; drafts: WbTaskDraft[] } => {
    let raw: unknown;
    try { raw = extractJson(text); } catch { raw = null; }
    const obj = (Array.isArray(raw) ? { tasks: raw } : raw) as { summary?: unknown; tasks?: unknown } | null;
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.tasks)) throw new Error('Asistanın yanıtı okunamadı; isteği biraz daha açık yazıp tekrar deneyin.');
    const drafts = (obj.tasks as Record<string, unknown>[]).slice(0, MAX_TASKS).flatMap(t => {
        const title = s(t?.title, 200);
        if (!title) return [];
        const aliases = Array.isArray(t.notes) ? [...new Set((t.notes as unknown[]).map(a => s(a, 10)).filter(a => known.has(a)))] : [];
        const type = s(t.type, 20).toLowerCase();
        return [{
            title,
            description: s(t.description, 6000),
            aliases,
            priority: t.priority ? mapJiraPriority(s(t.priority, 20)) : 'Medium',
            issueType: (TYPES.has(type) ? type : 'task') as WbTaskDraft['issueType'],
        }];
    });
    if (!drafts.length) throw new Error('Asistan açılacak bir kayıt bulamadı (notlar boş ya da yalnız şablon yer tutucuları olabilir).');
    return { summary: s(obj.summary, 400) || `${drafts.length} kayıt açıldı.`, drafts };
};
