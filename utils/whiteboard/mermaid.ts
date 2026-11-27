import type { WbEdge, WbNode, WbShape } from '../../types';
import { makeNode, wbId } from './model';

/**
 * Mermaid akış şeması → düzenlenebilir pano nesneleri. Dil modelleri akış
 * şemasını Mermaid olarak çok iyi yazar; yerleşimi dagre (MIT) hesaplar.
 * Desteklenen: `flowchart` / `graph` (TB, TD, BT, LR, RL), düğüm biçimleri
 * [ ] ( ) ([ ]) [( )] (( )) { } {{ }} [/ /] [\ \] > ], bağlantılar
 * --> --- -.-> ==> (etiketli: -->|metin| ya da -- metin -->), A & B --> C,
 * subgraph … end (bölüm olur). classDef / style / click / %% yok sayılır.
 */

export type MmShape = 'rect' | 'round' | 'stadium' | 'cylinder' | 'circle' | 'diamond' | 'hexagon' | 'parallelogram' | 'flag';
export interface MmNode { id: string; label: string; shape: MmShape }
export interface MmEdge { from: string; to: string; label?: string; arrow: boolean }
export interface MmGroup { id: string; label: string; members: string[] }
export interface MmGraph { dir: 'TB' | 'BT' | 'LR' | 'RL'; nodes: Map<string, MmNode>; edges: MmEdge[]; groups: MmGroup[] }

const ID = '[A-Za-z0-9_\\u00C0-\\u024F]+';
/** Düğüm biçimleri: uzun ayırıcılar önce */
const SHAPES: [RegExp, MmShape][] = [
    [/^\(\[([\s\S]*?)\]\)/, 'stadium'],
    [/^\[\(([\s\S]*?)\)\]/, 'cylinder'],
    [/^\(\(([\s\S]*?)\)\)/, 'circle'],
    [/^\{\{([\s\S]*?)\}\}/, 'hexagon'],
    [/^\[\[([\s\S]*?)\]\]/, 'rect'],
    [/^\[\/([\s\S]*?)[/\\]\]/, 'parallelogram'],
    [/^\[\\([\s\S]*?)[/\\]\]/, 'parallelogram'],
    [/^\[([\s\S]*?)\]/, 'rect'],
    [/^\(([\s\S]*?)\)/, 'round'],
    [/^\{([\s\S]*?)\}/, 'diamond'],
    [/^>([\s\S]*?)\]/, 'flag'],
];
/** Bağlantı: --> --- -.-> ==> ve etiketli biçimleri */
const LINK = /^\s*(?:(--|==|-\.)\s*([^-=.>|][^>|]*?)\s*(-->|==>|\.->|---)|(<?(?:-{2,}|={2,}|-\.+-)[>ox]?))\s*(?:\|([^|]*)\|)?\s*/;

const cleanLabel = (s: string) => s.trim().replace(/^"([\s\S]*)"$/, '$1').replace(/<br\s*\/?>/gi, '\n').replace(/&quot;/g, '"').replace(/\\n/g, '\n').trim();

export const parseMermaid = (code: string): MmGraph => {
    const g: MmGraph = { dir: 'TB', nodes: new Map(), edges: [], groups: [] };
    const stack: MmGroup[] = [];
    const lines = code.replace(/\r/g, '').split('\n').flatMap(l => l.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/)).map(l => l.replace(/%%.*$/, '').trim()).filter(Boolean);
    const touch = (id: string, label?: string, shape?: MmShape) => {
        const cur = g.nodes.get(id);
        if (!cur) g.nodes.set(id, { id, label: label ?? id, shape: shape ?? 'rect' });
        else if (label !== undefined) g.nodes.set(id, { ...cur, label, shape: shape ?? cur.shape });
        const grp = stack[stack.length - 1];
        if (grp && !grp.members.includes(id) && !cur) grp.members.push(id);
    };
    /** Satır başından bir düğüm okur: { id, kalan } */
    const readNode = (s: string): { id: string; rest: string } | null => {
        const m = new RegExp(`^(${ID})`).exec(s);
        if (!m) return null;
        let rest = s.slice(m[1].length);
        const id = m[1];
        for (const [re, shape] of SHAPES) {
            const sm = re.exec(rest);
            if (sm) { touch(id, cleanLabel(sm[1]), shape); rest = rest.slice(sm[0].length); return { id, rest }; }
        }
        touch(id);
        return { id, rest };
    };
    const readGroup = (s: string): { ids: string[]; rest: string } | null => {
        const ids: string[] = [];
        let rest = s.trimStart();
        for (;;) {
            const n = readNode(rest);
            if (!n) break;
            ids.push(n.id);
            rest = n.rest.replace(/^:::\S+/, '');
            const amp = /^\s*&\s*/.exec(rest);
            if (!amp) break;
            rest = rest.slice(amp[0].length);
        }
        return ids.length ? { ids, rest } : null;
    };

    for (const line of lines) {
        const head = /^(?:flowchart|graph)\s*(TB|TD|BT|LR|RL)?/i.exec(line);
        if (head) { const d = (head[1] || 'TB').toUpperCase(); g.dir = (d === 'TD' ? 'TB' : d) as MmGraph['dir']; continue; }
        if (/^(classDef|class|style|linkStyle|click|direction)\b/i.test(line)) continue;
        const sub = /^subgraph\s+(.+)$/i.exec(line);
        if (sub) {
            const t = sub[1].trim();
            const m = /^(\S+?)\s*\[(.*)\]$/.exec(t);
            const grp: MmGroup = { id: m ? m[1] : `g${g.groups.length + 1}`, label: cleanLabel(m ? m[2] : t), members: [] };
            g.groups.push(grp);
            stack.push(grp);
            continue;
        }
        if (/^end$/i.test(line)) { stack.pop(); continue; }
        let cur = readGroup(line);
        if (!cur) continue;
        while (cur) {
            const lm = LINK.exec(cur.rest);
            if (!lm || !cur.rest.trim()) break;
            const op = lm[3] || lm[4] || '';
            const label = cleanLabel(lm[2] || lm[5] || '');
            const next = readGroup(cur.rest.slice(lm[0].length));
            if (!next) break;
            for (const a of cur.ids) for (const b of next.ids) g.edges.push({ from: a, to: b, ...(label ? { label } : {}), arrow: /[>ox]$/.test(op) });
            cur = next;
        }
    }
    return g;
};

// ------------------------------------------------------------------ yerleşim

/** Kullanılan dagre yüzeyi (varsayılan dışa aktarımın graphlib ve layout'u) */
export type Dagre = Pick<typeof import('@dagrejs/dagre'), 'graphlib' | 'layout'>;

const SHAPE_OF: Record<MmShape, { shape: WbShape; color: string }> = {
    rect: { shape: 'rect', color: 'blue' },
    round: { shape: 'rect', color: 'teal' },
    stadium: { shape: 'ellipse', color: 'green' },
    circle: { shape: 'ellipse', color: 'green' },
    cylinder: { shape: 'cylinder', color: 'purple' },
    diamond: { shape: 'diamond', color: 'yellow' },
    hexagon: { shape: 'hexagon', color: 'orange' },
    parallelogram: { shape: 'parallelogram', color: 'teal' },
    flag: { shape: 'callout', color: 'pink' },
};

const sizeOf = (n: MmNode): { w: number; h: number } => {
    const lines = n.label.split('\n');
    const chars = Math.max(...lines.map(l => l.length), 4);
    const w = Math.min(300, Math.max(130, chars * 8.5 + 48));
    const h = Math.max(64, lines.length * 22 + 36);
    if (n.shape === 'diamond') return { w: Math.max(150, w * 1.25), h: Math.max(100, h * 1.5) };
    if (n.shape === 'circle') { const d = Math.max(96, w * 0.8); return { w: d, h: d }; }
    if (n.shape === 'hexagon' || n.shape === 'parallelogram') return { w: w * 1.15, h };
    if (n.shape === 'cylinder') return { w, h: h + 24 };
    return { w, h };
};

/**
 * Şemayı yerleştirir; pano nesneleri (sol üst `at`) ve bağlantılar döner.
 * `ids`: Mermaid düğüm kimliği → pano nesnesi (oklar başka öğelere bağlanabilsin).
 */
export const layoutMermaid = (g: MmGraph, dagre: Dagre, at: { x: number; y: number }, author?: string): { nodes: WbNode[]; edges: WbEdge[]; ids: Map<string, string> } => {
    const G = new dagre.graphlib.Graph({ compound: true, multigraph: true });
    G.setGraph({ rankdir: g.dir, nodesep: 48, ranksep: 64, edgesep: 24, marginx: 24, marginy: 40 });
    G.setDefaultEdgeLabel(() => ({}));
    const sizes = new Map<string, { w: number; h: number }>();
    g.nodes.forEach(n => { const s = sizeOf(n); sizes.set(n.id, s); G.setNode(n.id, { width: s.w, height: s.h }); });
    const groupIds = new Map(g.groups.map(gr => [gr.id, `__grp_${gr.id}`]));
    g.groups.forEach(gr => {
        G.setNode(groupIds.get(gr.id)!, { label: gr.label, paddingTop: 44, paddingLeft: 24, paddingRight: 24, paddingBottom: 24 });
        gr.members.forEach(m => { if (g.nodes.has(m)) G.setParent(m, groupIds.get(gr.id)!); });
    });
    g.edges.forEach((e, i) => G.setEdge(e.from, e.to, { label: e.label || '', width: e.label ? e.label.length * 7 : 0, height: e.label ? 18 : 0 }, `e${i}`));
    dagre.layout(G);

    const nodes: WbNode[] = [];
    const ids = new Map<string, string>();
    let z = 0;
    g.groups.forEach(gr => {
        const box = G.node(groupIds.get(gr.id)!) as { x: number; y: number; width: number; height: number } | undefined;
        if (!box || !box.width) return;
        nodes.push(makeNode('section', at.x + box.x - box.width / 2, at.y + box.y - box.height / 2, { w: Math.round(box.width), h: Math.round(box.height), text: gr.label || 'Bölüm', color: 'gray', z: -1000 + ++z, ...(author ? { author } : {}) }));
    });
    g.nodes.forEach(n => {
        const p = G.node(n.id) as { x: number; y: number };
        const s = sizes.get(n.id)!;
        const look = SHAPE_OF[n.shape];
        const node = makeNode('shape', at.x + p.x - s.w / 2, at.y + p.y - s.h / 2, { w: Math.round(s.w), h: Math.round(s.h), shape: look.shape, color: look.color, text: n.label, fontSize: 14, z: ++z, ...(author ? { author } : {}) });
        ids.set(n.id, node.id);
        nodes.push(node);
    });
    const edges: WbEdge[] = g.edges
        .filter(e => ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
        .map(e => ({ id: wbId('e'), from: ids.get(e.from)!, to: ids.get(e.to)!, ...(e.label ? { label: e.label } : {}), ...(e.arrow ? {} : { style: 'line' as const }) }));
    return { nodes, edges, ids };
};
