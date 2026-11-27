import type { Project, WbEdge, WbNode, WbShape, Whiteboard } from '../../types';
import { extractJson } from '../ai/json';
import { HEX_RE, makeNode, Rect, WB_COLOR, wbId } from './model';
import { MAX_SVG, sanitizeSvg, svgDataUrl } from './svg';

/**
 * Whiteboard asistanı: kullanıcının isteğini (ör. "Kaydet düğmesini sağ üste
 * al, tabloya filtre ekle") ve seçili ekran görüntüsünü modele anlatır;
 * modelin döndürdüğü çizim talimatlarını doğrulayıp pano nesnesine çevirir.
 *
 * İki koordinat uzayı vardır:
 *  - "image": seçili görselin üstü. Görselin genişliği 1000 birimdir, yükseklik
 *    oranına göre. İşaretleme çerçeveleri ve numaralar buraya çizilir.
 *  - "board": görselin (ya da seçimin) sağındaki boş alan, gerçek pano pikseli,
 *    sol üst (0,0). Not, açıklama ve yeni ekran taslağı buraya çizilir.
 * Model mevcut nesnelere takma adla (n1, n2 …) bağlanır ve onları taşıyabilir.
 */

export const IMAGE_SPACE_W = 1000;
const MAX_ITEMS = 120;
const MAX_TEXT = 1500;
const GAP = 120;

export interface WbAiFrame {
    /** Seçili görsel: düğüm ve pano üstündeki içerik dikdörtgeni (object-contain) */
    image?: { node: WbNode; rect: Rect };
    /** Modelin bildiği mevcut nesneler (takma ad → düğüm) */
    refs: { alias: string; node: WbNode }[];
    /** "board" uzayının başlangıcı (pano koordinatı) */
    anchor: { x: number; y: number };
}

/** object-contain: görselin düğüm içinde çizildiği dikdörtgen */
export const containRect = (box: Rect, naturalW: number, naturalH: number): Rect => {
    if (!naturalW || !naturalH) return box;
    const s = Math.min(box.w / naturalW, box.h / naturalH);
    const w = naturalW * s, h = naturalH * s;
    return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
};

const round = (n: number) => Math.round(n);

/**
 * Asistanın çalışacağı çerçeve: seçimde görsel varsa onun sağı; yoksa seçimin
 * sağı; seçim yoksa görünür alanın sol üstü. Model en fazla 60 nesneyi görür
 * (önce seçilenler, sonra görünür alandakiler).
 */
export const buildFrame = (opts: { board: Whiteboard; selection: WbNode[]; image?: { node: WbNode; rect: Rect }; visible: Rect }): WbAiFrame => {
    const { board, selection, image, visible } = opts;
    const pool = selection.length ? selection : board.nodes.filter(n => n.type !== 'pen' && n.x < visible.x + visible.w && n.x + n.w > visible.x && n.y < visible.y + visible.h && n.y + n.h > visible.y);
    const refs = pool.filter(n => n.type !== 'pen' && n.id !== image?.node.id).slice(0, 60).map((node, i) => ({ alias: `n${i + 1}`, node }));
    const around = image ? image.rect : selection.length ? boundsOfNodes(selection) : null;
    const anchor = around ? { x: round(around.x + around.w + GAP), y: round(around.y) } : { x: round(visible.x + 60), y: round(visible.y + 60) };
    return { image, refs, anchor };
};

const boundsOfNodes = (nodes: WbNode[]): Rect => {
    const x1 = Math.min(...nodes.map(n => n.x)), y1 = Math.min(...nodes.map(n => n.y));
    const x2 = Math.max(...nodes.map(n => n.x + n.w)), y2 = Math.max(...nodes.map(n => n.y + n.h));
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
};

export const imageSpaceH = (frame: WbAiFrame): number =>
    frame.image ? round(IMAGE_SPACE_W * (frame.image.rect.h / Math.max(1, frame.image.rect.w))) : 0;

const COLOR_KEYS = [...WB_COLOR.keys()].join(', ');

export const WB_AI_SYSTEM = `Sen PlanAsistan'ın Whiteboard (FigJam / Canva benzeri pano) asistanısın. Kullanıcının isteğine göre panoya çizersin: illüstrasyon, ikon, yapışkan not, metin, şekil, bölüm, ok, akış şeması, ekran taslağı, işaretleme.

Yanıtın YALNIZ şu JSON olsun (açıklama yazma):
{"summary": "Ne çizdiğini anlatan 1-2 cümle (Türkçe)", "items": [ ... ], "moves": [ ... ]}

ÖNCE DOĞRU ARACI SEÇ:
- Resim / illüstrasyon / doğa / nesne / karakter / logo benzeri çizim (çiçek, bulut, ağaç, araba, kişi, bilgisayar, sahne …) → "svg". Elips ve dikdörtgenleri üst üste koyarak resim ÇİZME; tek bir özenli SVG üret.
- Küçük sembol, tepki, süsleme → "emoji" (gerçek emoji karakteri, büyük boyut serbest).
- Not, fikir, liste → "sticky". Başlık, açıklama → "text".
- Diyagram, akış şeması, süreç, mimari → "shape" + "arrow" (düzenlenebilir kalsın). Karar adımı diamond, veri tabanı cylinder, başla/bitir ellipse.
- Ekran taslağı (wireframe) → "section" içinde "shape" ve "text".
- Serbest el çizgisi, vurgu çizgisi, organik kontur → "path".

items öğeleri:
- {"id": "a1", "type": "svg", "x": 0, "y": 0, "w": 320, "h": 320, "text": "Çiçek", "svg": "<svg viewBox='0 0 320 320'>…</svg>"}
- {"id": "a2", "type": "emoji", "x": 0, "y": 0, "size": 96, "emoji": "🌸"}
- {"id": "a3", "type": "sticky", "x": 0, "y": 0, "w": 200, "h": 200, "text": "…", "color": "yellow"}
- {"id": "a4", "type": "text", "x": 0, "y": 0, "w": 300, "h": 40, "text": "Başlık", "fontSize": 28, "color": "#1f2937"}
- {"id": "a5", "type": "shape", "shape": "rect|ellipse|diamond|triangle|star|hexagon|heart|cloud|callout|arrowRight|cylinder|parallelogram", "x": 0, "y": 0, "w": 160, "h": 60, "text": "Kaydet", "color": "blue", "fontSize": 14}
- {"id": "a6", "type": "section", "x": 0, "y": 0, "w": 900, "h": 600, "text": "Bölüm adı", "color": "gray"}
- {"id": "a7", "type": "path", "points": [0, 0, 40, 30, 80, 10], "color": "#2563eb", "width": 4, "fill": "#bfdbfe"}  → board koordinatlarında nokta dizisi; "fill" verilirse kapalı ve dolu
- {"id": "a8", "type": "box", "on": "image", "x": 120, "y": 40, "w": 200, "h": 60, "color": "red"}  → içi boş işaretleme çerçevesi
- {"id": "a9", "type": "marker", "on": "image", "x": 300, "y": 50, "text": "1", "color": "red"}  → numaralı daire
- {"type": "arrow", "from": "a9", "to": "a3", "label": "…", "curve": 60}  → iki öğe ya da mevcut nesne (n1…) arasında ok; "curve" kıvrımlı ok (px, eksi değer diğer yöne), "line": true oksuz çizgi

SVG kuralları: viewBox kullan, öznitelikleri TEK tırnakla yaz ('…'), yalnız path/circle/ellipse/rect/polygon/line/g/linearGradient/radialGradient kullan; script, image, dış bağlantı, CSS dosyası yok. Renkli, yumuşak, düzgün oranlı ve özenli çiz (yaprak ve taç yapraklarında path eğrileri, gölge için yarı saydam şekil, gradyan serbest). 12 KB'ı geçme. Birden çok resim istenirse her biri ayrı "svg" öğesi olsun.

Kurallar:
- Koordinatlar piksel; "on" verilmezse "board" uzayıdır: (0,0) çizim alanının sol üstü, x sağa, y aşağı artar. Öğeleri üst üste bindirme (illüstrasyon içi hariç); aralarında 24-40 piksel boşluk bırak; hizalı ve düzenli yerleştir.
- "on": "image" yalnız seçili görsel varken kullanılır: görselin sol üstü (0,0), genişliği ${IMAGE_SPACE_W}. Değişecek alanı "box" ile çerçevele, yanına "marker" ile numara koy; numaranın açıklamasını board uzayında aynı numarayla başlayan bir sticky'ye yaz ve gerekirse ok çiz.
- Kullanıcı yeni/değiştirilmiş ekranın taslağını isterse board uzayında bir "section" (ör. 1000x700, adı "Önerilen ekran") içine şekil ve metinlerle tel kafes (wireframe) çiz: üst çubuk, menü, düğmeler (rect, kısa metin), giriş alanları (rect, gri), tablolar (rect satırlar), başlıklar (text). Görseldeki yerleşimi koru, yalnız istenen değişikliği uygula ve değişen öğeleri "color": "red" ya da "orange" ile vurgula.
- Renkler: hazır pastel adlar (${COLOR_KEYS}) ya da "#rrggbb". Varsayılan sticky sarı. Uyumlu, sınırlı bir palet seç.
- Metinler kısa ve Türkçe olsun. En fazla ${MAX_ITEMS} öğe.
- Mevcut nesnelere yalnız verilen takma adlarla (n1, n2 …) başvur; silme yapamazsın.`;

const nodeLine = (alias: string, n: WbNode, anchor: { x: number; y: number }, project?: Project): string => {
    const label = n.text?.trim() || (n.type === 'task' ? project?.tasks.find(t => t.id === n.ref)?.name : '') || '';
    return `${alias}: ${n.type}${n.color ? ` (${n.color})` : ''} x=${round(n.x - anchor.x)} y=${round(n.y - anchor.y)} w=${round(n.w)} h=${round(n.h)}${label ? ` · "${label.replace(/\s+/g, ' ').slice(0, 160)}"` : ''}`;
};

export const buildWbAiPrompt = (frame: WbAiFrame, request: string, ctx: { board: Whiteboard; project?: Project; imageSent: boolean }): string => {
    const lines = [`Pano: ${ctx.board.name}${ctx.project ? ` (proje: ${ctx.project.name})` : ''}`];
    if (frame.image) {
        lines.push(
            `Seçili görsel: "${frame.image.node.text || 'ekran görüntüsü'}". Görsel uzayı ${IMAGE_SPACE_W} x ${imageSpaceH(frame)}.`,
            ctx.imageSent ? 'Görsel bu mesaja eklidir; içeriğine bakarak çiz.' : 'Görsel modele gönderilemedi: yalnız isteğe göre, görselin genel yerleşimini tahmin ederek çiz ve bunu summary\'de belirt.',
            `Board uzayı görselin hemen sağından başlar (görselin sol kenarı board uzayında x=${round(frame.image.rect.x - frame.anchor.x)}).`,
        );
    }
    if (frame.refs.length) {
        lines.push('', 'Mevcut nesneler (board uzayına göre konum):', ...frame.refs.map(r => nodeLine(r.alias, r.node, frame.anchor, ctx.project)));
    } else if (!frame.image) {
        lines.push('', 'Çizim alanı boş.');
    }
    lines.push('', `İstek: ${request.trim()}`);
    return lines.join('\n');
};

// ------------------------------------------------------------------ yanıt → nesneler

const num = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const str = (v: unknown, max = MAX_TEXT): string => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : '');
const color = (v: unknown, fallback: string): string => (typeof v === 'string' && (WB_COLOR.has(v) || HEX_RE.test(v)) ? v.toLowerCase() : fallback);
const optColor = (v: unknown): string | undefined => (typeof v === 'string' && (WB_COLOR.has(v) || HEX_RE.test(v)) ? v.toLowerCase() : undefined);
const SHAPES = new Set<WbShape>(['rect', 'ellipse', 'diamond', 'triangle', 'star', 'hexagon', 'heart', 'cloud', 'callout', 'arrowRight', 'cylinder', 'parallelogram']);

export interface WbAiResult {
    summary: string;
    nodes: WbNode[];
    edges: WbEdge[];
    moves: { id: string; x: number; y: number }[];
}

/**
 * Model yanıtını pano nesnelerine çevirir. Bilinmeyen tür, geçersiz sayı ve
 * renk atılır ya da varsayılana döner; hiçbir şey çizilemiyorsa hata fırlatır.
 */
export const parseWbAiResult = (text: string, frame: WbAiFrame, author = 'Asistan'): WbAiResult => {
    let raw: unknown;
    try { raw = extractJson(text); } catch { raw = null; }
    const obj = (Array.isArray(raw) ? { items: raw } : raw) as { summary?: unknown; items?: unknown; moves?: unknown } | null;
    if (!obj || typeof obj !== 'object') throw new Error('Asistanın yanıtı okunamadı; isteği biraz daha açık yazıp tekrar deneyin.');
    const items = Array.isArray(obj.items) ? obj.items.slice(0, MAX_ITEMS) : [];
    const img = frame.image;
    const s = img ? img.rect.w / IMAGE_SPACE_W : 1;
    const imgH = imageSpaceH(frame);
    const toBoard = (x: number, y: number, on: unknown) => (on === 'image' && img
        ? { x: img.rect.x + num(x, -200, IMAGE_SPACE_W + 200, 0) * s, y: img.rect.y + num(y, -200, imgH + 200, 0) * s }
        : { x: frame.anchor.x + num(x, -3000, 12000, 0), y: frame.anchor.y + num(y, -3000, 12000, 0) });
    const local = new Map<string, string>(frame.refs.map(r => [r.alias, r.node.id]));
    const nodes: WbNode[] = [];
    const arrows: { from: string; to: string; label: string; curve: number; line: boolean }[] = [];
    let z = 0;

    for (const it of items as Record<string, unknown>[]) {
        if (!it || typeof it !== 'object') continue;
        const type = it.type;
        if (type === 'arrow') { arrows.push({ from: str(it.from, 40), to: str(it.to, 40), label: str(it.label, 120), curve: round(num(it.curve, -400, 400, 0)), line: it.line === true }); continue; }
        const on = it.on === 'image' && img ? 'image' : 'board';
        const sc = on === 'image' ? s : 1;
        const p = toBoard(num(it.x, -1e6, 1e6, 0), num(it.y, -1e6, 1e6, 0), on);
        const size = (dw: number, dh: number) => ({ w: round(num(it.w, 8, 4000, dw) * sc), h: round(num(it.h, 8, 4000, dh) * sc) });
        let node: WbNode | null = null;
        const base = { author, z: ++z };
        if (type === 'svg') {
            const sz = size(320, 320);
            const clean = sanitizeSvg(str(it.svg, MAX_SVG), sz.w, sz.h);
            if (clean) node = makeNode('image', p.x, p.y, { ...base, ...sz, src: svgDataUrl(clean), text: str(it.text, 80) || 'Çizim' });
        } else if (type === 'emoji') {
            const e = str(it.emoji, 16).trim();
            const d = round(num(it.size ?? it.w, 24, 600, 96) * sc);
            if (e && /\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u2190-\u2BFF]/u.test(e)) node = makeNode('stamp', p.x, p.y, { ...base, w: d, h: d, stamp: e });
        } else if (type === 'path') {
            const raw = Array.isArray(it.points) ? (it.points as unknown[]).slice(0, 800).map(v => num(v, -1e5, 1e5, NaN)) : [];
            const pts: { x: number; y: number }[] = [];
            for (let i = 0; i + 1 < raw.length; i += 2) if (Number.isFinite(raw[i]) && Number.isFinite(raw[i + 1])) pts.push(toBoard(raw[i], raw[i + 1], on));
            if (pts.length >= 2) {
                const x0 = Math.min(...pts.map(q => q.x)), y0 = Math.min(...pts.map(q => q.y));
                const x1 = Math.max(...pts.map(q => q.x)), y1 = Math.max(...pts.map(q => q.y));
                const fill = optColor(it.fill);
                node = makeNode('pen', x0, y0, {
                    ...base, w: Math.max(1, round(x1 - x0)), h: Math.max(1, round(y1 - y0)),
                    points: pts.flatMap(q => [round(q.x - x0), round(q.y - y0)]),
                    color: color(it.color, 'gray'), fontSize: round(num(it.width, 0, 40, 4)), ...(fill ? { fill } : {}),
                });
            }
        } else if (type === 'sticky') node = makeNode('sticky', p.x, p.y, { ...base, ...size(200, 200), text: str(it.text), color: color(it.color, 'yellow') });
        else if (type === 'text') {
            const fs = num(it.fontSize, 10, 72, 18);
            const tc = optColor(it.color);
            node = makeNode('text', p.x, p.y, { ...base, ...size(Math.max(120, str(it.text).length * fs * 0.55), fs * 1.5), text: str(it.text), fontSize: round(fs * (on === 'image' ? Math.max(0.6, sc) : 1)), ...(tc ? { color: tc } : {}) });
        } else if (type === 'shape') {
            const shape = SHAPES.has(it.shape as WbShape) ? it.shape as WbShape : 'rect';
            node = makeNode('shape', p.x, p.y, { ...base, ...size(160, 60), shape, text: str(it.text, 200), color: color(it.color, 'blue'), ...(it.fontSize ? { fontSize: round(num(it.fontSize, 9, 48, 15)) } : {}) });
        } else if (type === 'section') node = makeNode('section', p.x, p.y, { ...base, z: -1000 + z, ...size(900, 600), text: str(it.text, 120) || 'Bölüm', color: color(it.color, 'gray') });
        else if (type === 'box') node = makeNode('shape', p.x, p.y, { ...base, ...size(200, 80), shape: 'rect', hollow: true, text: '', color: color(it.color, 'red') });
        else if (type === 'marker') {
            const d = 34;
            node = makeNode('shape', p.x - d / 2, p.y - d / 2, { ...base, w: d, h: d, shape: 'ellipse', text: str(it.text, 4) || String(nodes.filter(n => n.shape === 'ellipse' && n.w === d).length + 1), color: color(it.color, 'red'), fontSize: 15 });
        }
        if (!node) continue;
        const id = str(it.id, 40);
        if (id && !local.has(id)) local.set(id, node.id);
        nodes.push(node);
    }

    const edges: WbEdge[] = arrows
        .map(a => ({ ...a, from: local.get(a.from), to: local.get(a.to) }))
        .filter((a): a is { from: string; to: string; label: string; curve: number; line: boolean } => !!a.from && !!a.to && a.from !== a.to)
        .slice(0, MAX_ITEMS)
        .map(a => ({ id: wbId('e'), from: a.from, to: a.to, ...(a.label ? { label: a.label } : {}), ...(a.curve ? { curve: a.curve } : {}), ...(a.line ? { style: 'line' as const } : {}) }));

    const moves = (Array.isArray(obj.moves) ? obj.moves : []).slice(0, MAX_ITEMS).flatMap(m => {
        const r = m as Record<string, unknown>;
        const target = frame.refs.find(x => x.alias === r?.ref)?.node;
        if (!target || target.locked) return [];
        return [{ id: target.id, x: round(frame.anchor.x + num(r.x, -3000, 12000, 0)), y: round(frame.anchor.y + num(r.y, -3000, 12000, 0)) }];
    });

    if (!nodes.length && !moves.length) throw new Error('Asistan çizilecek bir şey döndürmedi; isteği biraz daha açık yazıp tekrar deneyin.');
    const summary = str(obj.summary, 400).trim() || `${nodes.length} öğe eklendi.`;
    return { summary, nodes, edges, moves };
};

/** Sonucu panoya uygular (tek değişiklik: tek geri alma adımı); yeni bölümler alta çizilsin diye en alttaki z'nin altına iner */
export const applyWbAiResult = (b: Whiteboard, r: WbAiResult): Whiteboard => {
    const top = Math.max(0, ...b.nodes.map(n => n.z || 0));
    const bottom = Math.min(0, ...b.nodes.map(n => n.z || 0));
    const nodes = r.nodes.map(n => ({ ...n, z: n.type === 'section' ? bottom - 1 : top + (n.z || 0) }));
    const moved = new Map(r.moves.map(m => [m.id, m]));
    return {
        ...b,
        updatedAt: new Date().toISOString(),
        nodes: [...b.nodes.map(n => (moved.has(n.id) ? { ...n, x: moved.get(n.id)!.x, y: moved.get(n.id)!.y } : n)), ...nodes],
        edges: [...b.edges, ...r.edges],
    };
};
