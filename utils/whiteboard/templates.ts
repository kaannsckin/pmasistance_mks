import type { Project, Task, TaskStatus, WbEdge, WbNode } from '../../types';
import { makeNode, NODE_SIZE, projectSprints, sectionWithTasks, sprintName, taskCards, wbId } from './model';

/**
 * Hazır pano şablonları (FigJam şablon kütüphanesinin karşılığı). Proje
 * verisiyle doldurulanlar (sprint planlama, Kanban, risk matrisi) bağlı kart
 * üretir; kartlar sonra Jira eşitlemesiyle güncel kalır.
 */

const DONE = 'Done' as TaskStatus;

export interface WbTemplate {
    key: string;
    label: string;
    description: string;
    icon: string;
    build: (project: Project, origin: { x: number; y: number }) => { nodes: WbNode[]; edges: WbEdge[] };
}

const note = (x: number, y: number, text: string, color = 'yellow', w = 200, h = 160): WbNode => makeNode('sticky', x, y, { text, color, w, h });
// Başlık bölümlerin üstünde, bölüm adı etiketiyle çakışmayacak yükseklikte
const title = (x: number, y: number, text: string, w = 900): WbNode => makeNode('text', x, y - 50, { text, w, h: 56, fontSize: 32 });
const section = (x: number, y: number, w: number, h: number, text: string, color = 'gray'): WbNode => makeNode('section', x, y, { text, color, w, h });
const edge = (from: WbNode, to: WbNode, label?: string): WbEdge => ({ id: wbId('e'), from: from.id, to: to.id, ...(label ? { label } : {}) });

/** Açık işi olan ilk sprint; yoksa son sprint */
export const currentSprintOf = (project: Project): number | undefined => {
    const sprints = projectSprints(project);
    return sprints.find(n => project.tasks.some(t => t.version === n && t.status !== DONE)) ?? sprints[sprints.length - 1];
};

const byPriority = (a: Task, b: Task) => ['Blocker', 'High', 'Medium', 'Low'].indexOf(a.priority) - ['Blocker', 'High', 'Medium', 'Low'].indexOf(b.priority);

export const WB_TEMPLATES: WbTemplate[] = [
    {
        key: 'retro',
        label: 'Sprint retrospektifi',
        description: 'İyi gidenler, geliştirilecekler ve aksiyonlar; oylamayla önceliklendirin',
        icon: 'history',
        build: (project, o) => {
            const n = currentSprintOf(project);
            const head = title(o.x, o.y, `Retrospektif${n ? ` · ${sprintName(n, project.settings?.sprintNames)}` : ''}`);
            const cols: [string, string][] = [['İyi gidenler', 'green'], ['Geliştirilecekler', 'pink'], ['Aksiyonlar', 'blue']];
            const nodes: WbNode[] = [head];
            cols.forEach(([t, c], i) => {
                const x = o.x + i * 500;
                nodes.push(section(x, o.y + 80, 470, 560, t, c));
                nodes.push(note(x + 30, o.y + 150, i === 2 ? 'Aksiyon · sorumlu · tarih' : 'Bir not ekleyin', c));
            });
            return { nodes, edges: [] };
        },
    },
    {
        key: 'sprint',
        label: 'Sprint planlama',
        description: 'Şu anki ve sonraki sprintin görevleri ile öncelikli havuz; kartlar Jira ile güncel kalır',
        icon: 'rocket',
        build: (project, o) => {
            const cur = currentSprintOf(project);
            const sprints = cur ? projectSprints(project).filter(n => n >= cur).slice(0, 2) : [];
            const nodes: WbNode[] = [title(o.x, o.y, 'Sprint planlama')];
            let x = o.x;
            for (const n of sprints) {
                const list = project.tasks.filter(t => t.version === n).sort(byPriority).slice(0, 18);
                const s = sectionWithTasks(sprintName(n, project.settings?.sprintNames), list, { x, y: o.y + 80 }, n === cur ? 'blue' : 'purple', 2);
                nodes.push(...s);
                x += s[0].w + 60;
            }
            const pool = project.tasks.filter(t => (t.version || 0) === 0 && t.status !== DONE && t.includeInSprints !== false).sort(byPriority).slice(0, 12);
            const p = sectionWithTasks('Havuz (öncelik sırasıyla)', pool, { x, y: o.y + 80 }, 'gray', 2);
            nodes.push(...p, note(x, o.y + 80 + p[0].h + 30, 'Kapasite, bağımlılık ve riskleri buraya not edin'));
            return { nodes, edges: [] };
        },
    },
    {
        key: 'matrix',
        label: 'Önceliklendirme matrisi',
        description: 'Etki × efor: hızlı kazanımlar, büyük işler, doldurma işleri, ertelenecekler',
        icon: 'grid',
        build: (_p, o) => {
            const W = 520, H = 400;
            const quads: [string, string, number, number][] = [
                ['Hızlı kazanımlar (yüksek etki, düşük efor)', 'green', 0, 0],
                ['Büyük işler (yüksek etki, yüksek efor)', 'blue', 1, 0],
                ['Doldurma işleri (düşük etki, düşük efor)', 'yellow', 0, 1],
                ['Ertelenecekler (düşük etki, yüksek efor)', 'red', 1, 1],
            ];
            const nodes: WbNode[] = [title(o.x, o.y, 'Önceliklendirme matrisi')];
            quads.forEach(([t, c, i, j]) => nodes.push(section(o.x + 60 + i * (W + 20), o.y + 80 + j * (H + 20), W, H, t, c)));
            nodes.push(makeNode('text', o.x - 10, o.y + 80, { text: 'Etki ↑', w: 64, h: 40 }));
            nodes.push(makeNode('text', o.x + 60 + W * 2 - 60, o.y + 80 + H * 2 + 50, { text: 'Efor →', w: 100, h: 40 }));
            nodes.push(note(o.x + 90, o.y + 140, '"/" ile görev ekleyin ve doğru kutuya sürükleyin'));
            return { nodes, edges: [] };
        },
    },
    {
        key: 'uxreview',
        label: 'UI/UX inceleme panosu',
        description: 'Gereksinim, mevcut arayüz, alternatifler, ekip değerlendirmesi, oylama, karar ve aksiyon',
        icon: 'eye',
        build: (_p, o) => {
            const nodes: WbNode[] = [title(o.x, o.y, 'UI/UX inceleme panosu')];
            const W = 460, H = 380, G = 30;
            const at = (i: number) => ({ x: o.x + (i % 3) * (W + G), y: o.y + 80 + Math.floor(i / 3) * (H + G) });
            const sections: [string, string][] = [
                ['01 — Gereksinim', 'blue'], ['02 — Mevcut arayüz', 'gray'], ['03 — Alternatif tasarımlar', 'purple'],
                ['04 — Ekip değerlendirmesi', 'yellow'], ['05 — Oylama', 'orange'], ['06 — Karar ve aksiyon', 'green'],
            ];
            sections.forEach(([t, c], i) => { const p = at(i); nodes.push(section(p.x, p.y, W, H, t, c)); });
            const p0 = at(0), p1 = at(1), p2 = at(2), p3 = at(3), p4 = at(4), p5 = at(5);
            nodes.push(note(p0.x + 30, p0.y + 60, '"/" ile Jira kaydını ekleyin; müşteri talebi ve kabul kriterleri', 'blue', 400, 120));
            nodes.push(note(p1.x + 30, p1.y + 60, 'Ekran görüntüsünü yapıştırın (Ctrl+V)', 'gray', 400, 120));
            nodes.push(note(p2.x + 30, p2.y + 60, 'Alternatif A', 'purple', 190, 150), note(p2.x + 240, p2.y + 60, 'Alternatif B', 'purple', 190, 150));
            ['UI/UX görüşü', 'Geliştirici görüşü', 'Test görüşü', 'PM görüşü'].forEach((t, i) =>
                nodes.push(note(p3.x + 30 + (i % 2) * 210, p3.y + 60 + Math.floor(i / 2) * 150, t, 'yellow', 190, 130)));
            nodes.push(note(p4.x + 30, p4.y + 60, 'Oylamayı başlatın: alternatif notlarına tıklayarak oy verin', 'orange', 400, 120));
            ['Seçilen tasarım', 'Sorumlu kişi', 'Hedef tarih / Jira kaydı'].forEach((t, i) =>
                nodes.push(note(p5.x + 30 + (i % 2) * 210, p5.y + 60 + Math.floor(i / 2) * 150, t, 'green', 190, 130)));
            return { nodes, edges: [] };
        },
    },
    {
        key: 'kanban',
        label: 'Kanban',
        description: 'Açık görevler durum kategorisine göre sütunlarda (her sütunda en çok 12)',
        icon: 'columns',
        build: (project, o) => {
            const cols: [TaskStatus, string, string][] = [['Backlog' as TaskStatus, 'Bekleyen', 'gray'], ['ToDo' as TaskStatus, 'Yapılacak', 'yellow'], ['InProgress' as TaskStatus, 'Süreçte', 'blue'], [DONE, 'Tamamlandı', 'green']];
            const nodes: WbNode[] = [title(o.x, o.y, 'Kanban')];
            const { w, h } = NODE_SIZE.task;
            cols.forEach(([st, label, c], i) => {
                const list = project.tasks.filter(t => t.status === st).sort(byPriority).slice(0, 12);
                const x = o.x + i * (w + 80);
                nodes.push(section(x, o.y + 80, w + 40, Math.max(1, list.length) * (h + 20) + 80, `${label} (${project.tasks.filter(t => t.status === st).length})`, c));
                nodes.push(...taskCards(list, { x: x + 20, y: o.y + 140 }, 1));
            });
            return { nodes, edges: [] };
        },
    },
    {
        key: 'risk',
        label: 'Risk değerlendirme',
        description: 'Açık riskler skor bandına göre; azaltıcı aksiyonları not edin',
        icon: 'shield',
        build: (project, o) => {
            const bands: [string, string, (s: number) => boolean][] = [['Yüksek (15–25)', 'red', s => s >= 15], ['Orta (8–14)', 'orange', s => s >= 8 && s < 15], ['Düşük (1–7)', 'green', s => s < 8]];
            const risks = (project.risks || []).filter(r => r.status !== 'closed');
            const nodes: WbNode[] = [title(o.x, o.y, 'Risk değerlendirme')];
            const { w, h } = NODE_SIZE.risk;
            bands.forEach(([label, c, inBand], i) => {
                const list = risks.filter(r => inBand(r.probability * r.impact)).sort((a, b) => b.probability * b.impact - a.probability * a.impact);
                const x = o.x + i * (w + 100);
                nodes.push(section(x, o.y + 80, w + 60, Math.max(1, list.length) * (h + 20) + 200, `${label} · ${list.length}`, c));
                list.forEach((r, k) => nodes.push(makeNode('risk', x + 30, o.y + 140 + k * (h + 20), { ref: r.id })));
                nodes.push(note(x + 30, o.y + 140 + list.length * (h + 20), 'Azaltıcı aksiyon', c, w, 100));
            });
            return { nodes, edges: [] };
        },
    },
    {
        key: 'flow',
        label: 'Akış şeması',
        description: 'Başla → adım → karar → sonuç; şekiller ve bağlantılarla süreç',
        icon: 'activity',
        build: (_p, o) => {
            const start = makeNode('shape', o.x, o.y + 120, { shape: 'ellipse', color: 'green', text: 'Başla', w: 160, h: 90 });
            const step = makeNode('shape', o.x + 260, o.y + 120, { shape: 'rect', color: 'blue', text: 'Adım', w: 180, h: 90 });
            const decide = makeNode('shape', o.x + 540, o.y + 95, { shape: 'diamond', color: 'yellow', text: 'Karar?', w: 180, h: 140 });
            const yes = makeNode('shape', o.x + 820, o.y + 20, { shape: 'rect', color: 'blue', text: 'Evet: devam', w: 180, h: 90 });
            const no = makeNode('shape', o.x + 820, o.y + 230, { shape: 'rect', color: 'red', text: 'Hayır: geri bildir', w: 180, h: 90 });
            const end = makeNode('shape', o.x + 1100, o.y + 20, { shape: 'ellipse', color: 'green', text: 'Bitti', w: 160, h: 90 });
            return {
                nodes: [title(o.x, o.y - 70, 'Akış şeması'), start, step, decide, yes, no, end],
                edges: [edge(start, step), edge(step, decide), edge(decide, yes, 'Evet'), edge(decide, no, 'Hayır'), edge(yes, end), edge(no, step)],
            };
        },
    },
];

export const WB_TEMPLATE_BY_KEY = new Map(WB_TEMPLATES.map(t => [t.key, t]));
