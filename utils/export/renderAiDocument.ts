import { AiDocument, CALLOUT_LABELS, CalloutTone, Cell, cellText, chartTable, DocBlock, DocFormat, fileNameFor, KpiItem, KpiStatus } from './aiDocument';
import { CHART_PALETTE, chartSvg, textBar } from './chartSvg';

/**
 * Belge modelini dosyaya çevirir (tarayıcıda). Ağır kütüphaneler (SheetJS,
 * docx, pdfmake, pptxgenjs) yalnız o biçim istendiğinde yüklenir.
 */

const ACCENT = '0F766E';
type Table = Extract<DocBlock, { kind: 'table' }>;
type Chart = Extract<DocBlock, { kind: 'chart' }>;

/** Gösterge ve vurgu renkleri (metin, zemin) */
const KPI_COLORS: Record<KpiStatus, { fg: string; bg: string; mark: string }> = {
    iyi: { fg: '047857', bg: 'ECFDF5', mark: '▲' },
    dikkat: { fg: 'B45309', bg: 'FFFBEB', mark: '●' },
    kritik: { fg: 'B91C1C', bg: 'FEF2F2', mark: '▼' },
    notr: { fg: '374151', bg: 'F3F4F6', mark: '' },
};
const CALLOUT_COLORS: Record<CalloutTone, { line: string; bg: string }> = {
    bulgu: { line: '2563EB', bg: 'EFF6FF' },
    uyari: { line: 'D97706', bg: 'FFFBEB' },
    oneri: { line: '059669', bg: 'ECFDF5' },
    karar: { line: '7C3AED', bg: 'F5F3FF' },
    bilgi: { line: ACCENT, bg: 'F0FDFA' },
};
const kpiStatusText = (k: KpiItem): string => (k.status && k.status !== 'notr' ? { iyi: 'İyi', dikkat: 'Dikkat', kritik: 'Kritik' }[k.status] : '');
const calloutHead = (b: Extract<DocBlock, { kind: 'callout' }>): string => `${CALLOUT_LABELS[b.tone]}${b.title ? `: ${b.title}` : ''}`;
/** Tablo ve grafik verisi (grafik, çizemeyen biçimlerde tabloya dönüşür) */
const dataTables = (doc: AiDocument): Table[] => doc.blocks.flatMap((b): Table[] => {
    if (b.kind === 'table') return [b];
    if (b.kind === 'chart') { const t = chartTable(b); return [{ kind: 'table', title: `Grafik: ${b.title || 'veri'}`, columns: [b.title ? 'Kategori' : '', ...t.columns.slice(1)].map((c, i) => c || (i ? '' : 'Kategori')), rows: t.rows, note: b.note }]; }
    return [];
});

const MIME: Record<DocFormat, string> = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv;charset=utf-8',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pdf: 'application/pdf',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const tables = (doc: AiDocument): Table[] => doc.blocks.filter((b): b is Table => b.kind === 'table');
const dateTr = (iso: string): string => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

// ---------------------------------------------------------------- CSV
const csvCell = (c: Cell): string => {
    const s = c === null ? '' : typeof c === 'number' ? String(c).replace('.', ',') : c;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Türkçe Excel'in açtığı biçim: ";" ayırıcı, ondalık virgül, UTF-8 BOM. Birden çok tablo boş satırla ayrılır. */
export const renderCsv = (doc: AiDocument): string => {
    const ts = dataTables(doc);
    const lines: string[] = [];
    if (!ts.length) {
        for (const b of doc.blocks) {
            if (b.kind === 'list') b.items.forEach(i => lines.push(csvCell(i)));
            else if (b.kind === 'kpi') b.items.forEach(k => lines.push([k.label, k.value, k.change || '', kpiStatusText(k)].map(csvCell).join(';')));
            else if (b.kind === 'callout') lines.push(csvCell(`${calloutHead(b)} — ${b.text}`));
            else if (b.kind === 'heading' || b.kind === 'paragraph') lines.push(csvCell(b.text));
        }
    }
    ts.forEach((t, i) => {
        if (ts.length > 1) { if (i) lines.push(''); lines.push(csvCell(t.title || `Tablo ${i + 1}`)); }
        lines.push(t.columns.map(csvCell).join(';'));
        t.rows.forEach(r => lines.push(r.map(csvCell).join(';')));
    });
    return `﻿${lines.join('\r\n')}`;
};

// ---------------------------------------------------------------- Excel
const sheetName = (name: string, used: Set<string>): string => {
    const base = name.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Tablo';
    let n = base, i = 2;
    while (used.has(n.toLocaleLowerCase('tr-TR'))) n = `${base.slice(0, 26)} ${i++}`;
    used.add(n.toLocaleLowerCase('tr-TR'));
    return n;
};

const widths = (rows: Cell[][]): { wch: number }[] => {
    const w: number[] = [];
    rows.forEach(r => r.forEach((c, i) => { w[i] = Math.max(w[i] || 6, Math.min(60, cellText(c).length + 2)); }));
    return w.map(wch => ({ wch }));
};

export const renderXlsx = async (doc: AiDocument): Promise<Uint8Array> => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const used = new Set<string>();
    const text = doc.blocks.filter(b => b.kind !== 'table' && b.kind !== 'chart');
    const all = dataTables(doc);
    // Metin, göstergeler ve bulgular ilk sayfada (Özet); tablolar ve grafik verileri kendi sayfalarında
    if (text.length || !all.length) {
        const rows: Cell[][] = [[doc.title], ...(doc.subtitle ? [[doc.subtitle]] : []), [`Oluşturma: ${dateTr(doc.createdAt)} · PlanAsistan`], []];
        let wide = false;
        for (const b of text) {
            if (b.kind === 'list') b.items.forEach(i => rows.push([`• ${i}`]));
            else if (b.kind === 'heading') rows.push([b.level === 1 ? b.text.toLocaleUpperCase('tr-TR') : b.text]);
            else if (b.kind === 'paragraph') rows.push([b.text], []);
            else if (b.kind === 'callout') rows.push([`► ${calloutHead(b)}`], [b.text], []);
            else if (b.kind === 'kpi') {
                wide = true;
                rows.push(['Gösterge', 'Değer', 'Kıyas / değişim', 'Durum', 'Not']);
                b.items.forEach(k => rows.push([k.label, k.value, k.change || '', kpiStatusText(k), k.note || '']));
                rows.push([]);
            }
        }
        if (all.length) rows.push([], [`Ayrıntılı tablolar: ${all.map(t => t.title || 'Tablo').join(', ')} sayfalarında.`]);
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = wide ? [{ wch: 60 }, { wch: 18 }, { wch: 28 }, { wch: 10 }, { wch: 40 }] : [{ wch: 100 }];
        XLSX.utils.book_append_sheet(wb, ws, sheetName('Özet', used));
    }
    all.forEach((t, i) => {
        const data: Cell[][] = [t.columns, ...t.rows];
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = widths(data);
        ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: t.rows.length, c: t.columns.length - 1 } }) };
        if (t.note) XLSX.utils.sheet_add_aoa(ws, [[], [t.note]], { origin: -1 });
        XLSX.utils.book_append_sheet(wb, ws, sheetName(t.title || (all.length === 1 ? doc.title : `Tablo ${i + 1}`), used));
    });
    wb.Props = { Title: doc.title, Author: 'PlanAsistan' };
    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer);
};

// ---------------------------------------------------------------- Word
const isNum = (c: Cell) => typeof c === 'number';

export const renderDocx = async (doc: AiDocument): Promise<Blob> => {
    const d = await import('docx');
    const wide = tables(doc).some(t => t.columns.length > 6);
    const border = { style: d.BorderStyle.SINGLE, size: 4, color: 'D1D5DB' };
    const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
    const cell = (text: string, o: { head?: boolean; right?: boolean; small?: boolean } = {}) => new d.TableCell({
        children: [new d.Paragraph({
            alignment: o.right ? d.AlignmentType.RIGHT : d.AlignmentType.LEFT,
            children: [new d.TextRun({ text, bold: o.head, color: o.head ? 'FFFFFF' : undefined, size: o.small ? 16 : 18 })],
        })],
        shading: o.head ? { type: d.ShadingType.CLEAR, fill: ACCENT, color: 'auto' } : undefined,
        margins: { top: 40, bottom: 40, left: 80, right: 80 },
    });
    const children: (InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>)[] = [
        new d.Paragraph({ heading: d.HeadingLevel.TITLE, children: [new d.TextRun({ text: doc.title })] }),
        ...(doc.subtitle ? [new d.Paragraph({ children: [new d.TextRun({ text: doc.subtitle, color: '4B5563', size: 24 })] })] : []),
        new d.Paragraph({ spacing: { after: 240 }, children: [new d.TextRun({ text: `${dateTr(doc.createdAt)} · PlanAsistan`, color: '6B7280', size: 18 })] }),
    ];
    const none = { style: d.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const kpiTable = (items: KpiItem[]) => {
        const perRow = Math.min(4, items.length);
        const rows: KpiItem[][] = [];
        for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
        return new d.Table({
            width: { size: 100, type: d.WidthType.PERCENTAGE },
            borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: { style: d.BorderStyle.SINGLE, size: 24, color: 'FFFFFF' }, insideVertical: { style: d.BorderStyle.SINGLE, size: 24, color: 'FFFFFF' } },
            rows: rows.map(r => new d.TableRow({
                children: [...r, ...Array(perRow - r.length).fill(null)].map((k: KpiItem | null) => {
                    if (!k) return new d.TableCell({ children: [new d.Paragraph({ children: [] })] });
                    const c = KPI_COLORS[k.status || 'notr'];
                    return new d.TableCell({
                        shading: { type: d.ShadingType.CLEAR, fill: c.bg, color: 'auto' },
                        margins: { top: 100, bottom: 100, left: 140, right: 140 },
                        children: [
                            new d.Paragraph({ children: [new d.TextRun({ text: k.label, size: 16, color: '6B7280' })] }),
                            new d.Paragraph({ children: [new d.TextRun({ text: k.value, bold: true, size: 32, color: '111827' })] }),
                            ...(k.change || k.status !== 'notr' ? [new d.Paragraph({ children: [new d.TextRun({ text: [c.mark, k.change || kpiStatusText(k)].filter(Boolean).join(' '), size: 16, bold: true, color: c.fg })] })] : []),
                            ...(k.note ? [new d.Paragraph({ children: [new d.TextRun({ text: k.note, size: 14, color: '6B7280', italics: true })] })] : []),
                        ],
                    });
                }),
            })),
        });
    };
    const chartBlock = (b: Chart) => {
        // Word'de grafik: kategori, değer(ler) ve tek seride yatay çubuk sütunu
        const single = b.series.length === 1;
        const max = Math.max(0, ...b.series.flatMap(s => s.values.map(v => v ?? 0)));
        const total = single ? b.series[0].values.reduce<number>((a, v) => a + (v ?? 0), 0) : 0;
        const head = ['', ...b.series.map(s => s.name), ...(single ? [b.chart === 'pie' ? 'Pay' : ''] : [])];
        return new d.Table({
            width: { size: 100, type: d.WidthType.PERCENTAGE },
            borders,
            rows: [
                new d.TableRow({ tableHeader: true, children: head.map(c => cell(c, { head: true })) }),
                ...b.labels.map((l, i) => new d.TableRow({
                    children: [
                        cell(l),
                        ...b.series.map(s => cell(s.values[i] === null ? '' : cellText(s.values[i]), { right: true })),
                        ...(single ? [new d.TableCell({
                            margins: { top: 40, bottom: 40, left: 80, right: 80 },
                            children: [new d.Paragraph({ children: [
                                new d.TextRun({ text: textBar(b.series[0].values[i], max, 22), color: CHART_PALETTE[0], size: 16 }),
                                ...(b.chart === 'pie' && total ? [new d.TextRun({ text: `  %${Math.round(((b.series[0].values[i] ?? 0) / total) * 100)}`, size: 16, color: '374151' })] : []),
                            ] })],
                        })] : []),
                    ],
                })),
            ],
        });
    };
    for (const b of doc.blocks) {
        if (b.kind === 'heading') children.push(new d.Paragraph({ heading: b.level === 1 ? d.HeadingLevel.HEADING_1 : d.HeadingLevel.HEADING_2, children: [new d.TextRun({ text: b.text })] }));
        else if (b.kind === 'paragraph') b.text.split('\n').forEach(line => children.push(new d.Paragraph({ spacing: { after: 120 }, children: [new d.TextRun({ text: line })] })));
        else if (b.kind === 'list') b.items.forEach(i => children.push(new d.Paragraph({ bullet: { level: 0 }, children: [new d.TextRun({ text: i })] })));
        else if (b.kind === 'kpi') { children.push(kpiTable(b.items)); children.push(new d.Paragraph({ children: [] })); }
        else if (b.kind === 'callout') {
            const c = CALLOUT_COLORS[b.tone];
            const shade = { type: d.ShadingType.CLEAR, fill: c.bg, color: 'auto' };
            const bar = { left: { style: d.BorderStyle.SINGLE, size: 24, color: c.line, space: 8 } };
            children.push(new d.Paragraph({ shading: shade, border: bar, spacing: { before: 120 }, children: [new d.TextRun({ text: calloutHead(b), bold: true, color: c.line })] }));
            b.text.split('\n').forEach((line, i, arr) => children.push(new d.Paragraph({ shading: shade, border: bar, spacing: { after: i === arr.length - 1 ? 160 : 0 }, children: [new d.TextRun({ text: line })] })));
        } else if (b.kind === 'chart') {
            if (b.title) children.push(new d.Paragraph({ spacing: { before: 200, after: 80 }, children: [new d.TextRun({ text: b.title, bold: true })] }));
            children.push(chartBlock(b));
            if (b.note) children.push(new d.Paragraph({ children: [new d.TextRun({ text: b.note, italics: true, color: '6B7280', size: 18 })] }));
            children.push(new d.Paragraph({ children: [] }));
        } else {
            if (b.title) children.push(new d.Paragraph({ spacing: { before: 200, after: 80 }, children: [new d.TextRun({ text: b.title, bold: true })] }));
            const small = b.columns.length > 8;
            children.push(new d.Table({
                width: { size: 100, type: d.WidthType.PERCENTAGE },
                borders,
                rows: [
                    new d.TableRow({ tableHeader: true, children: b.columns.map(c => cell(c, { head: true, small })) }),
                    ...b.rows.map(r => new d.TableRow({ children: r.map(c => cell(cellText(c), { right: isNum(c), small })) })),
                ],
            }));
            if (b.note) children.push(new d.Paragraph({ children: [new d.TextRun({ text: b.note, italics: true, color: '6B7280', size: 18 })] }));
            children.push(new d.Paragraph({ children: [] }));
        }
    }
    const document = new d.Document({
        creator: 'PlanAsistan',
        title: doc.title,
        styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
        sections: [{
            properties: { page: { size: { orientation: wide ? d.PageOrientation.LANDSCAPE : d.PageOrientation.PORTRAIT }, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
            footers: { default: new d.Footer({ children: [new d.Paragraph({ alignment: d.AlignmentType.RIGHT, children: [new d.TextRun({ children: [d.PageNumber.CURRENT], size: 16, color: '9CA3AF' })] })] }) },
            children,
        }],
    });
    return d.Packer.toBlob(document);
};

// ---------------------------------------------------------------- PDF
export const renderPdf = async (doc: AiDocument): Promise<Blob> => {
    const pdfMake = (await import('pdfmake/build/pdfmake')).default;
    const vfs = (await import('pdfmake/build/vfs_fonts')).default;
    pdfMake.addVirtualFileSystem(vfs);
    const wide = tables(doc).some(t => t.columns.length > 6);
    const content: unknown[] = [
        { text: doc.title, style: 'title' },
        ...(doc.subtitle ? [{ text: doc.subtitle, style: 'subtitle' }] : []),
        { text: `${dateTr(doc.createdAt)} · PlanAsistan`, style: 'meta' },
    ];
    for (const b of doc.blocks) {
        if (b.kind === 'heading') content.push({ text: b.text, style: b.level === 1 ? 'h1' : 'h2' });
        else if (b.kind === 'paragraph') content.push({ text: b.text, margin: [0, 0, 0, 6] });
        else if (b.kind === 'list') content.push({ ul: [...b.items], margin: [0, 0, 0, 6] }); // pdfmake diziyi yerinde değiştirir
        else if (b.kind === 'kpi') {
            const perRow = Math.min(4, b.items.length);
            const body: unknown[][] = [];
            for (let i = 0; i < b.items.length; i += perRow) {
                const row = b.items.slice(i, i + perRow).map(k => {
                    const c = KPI_COLORS[k.status || 'notr'];
                    return {
                        fillColor: `#${c.bg}`,
                        stack: [
                            { text: k.label, fontSize: 8, color: '#6B7280' },
                            { text: k.value, fontSize: 16, bold: true, color: '#111827', margin: [0, 2, 0, 2] },
                            // Gömülü Roboto'da ▲▼ yok; PDF'te durum yalnız renk ve ● ile gösterilir
                            ...(k.change || k.status !== 'notr' ? [{ text: [k.status !== 'notr' ? '●' : '', k.change || kpiStatusText(k)].filter(Boolean).join(' '), fontSize: 8, bold: true, color: `#${c.fg}` }] : []),
                            ...(k.note ? [{ text: k.note, fontSize: 7, italics: true, color: '#6B7280' }] : []),
                        ],
                    };
                });
                while (row.length < perRow) row.push({ text: '' } as never);
                body.push(row);
            }
            content.push({
                table: { widths: Array(perRow).fill('*'), body },
                layout: { hLineWidth: () => 4, vLineWidth: () => 4, hLineColor: () => '#FFFFFF', vLineColor: () => '#FFFFFF', paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 },
                margin: [0, 2, 0, 10],
            });
        } else if (b.kind === 'callout') {
            const c = CALLOUT_COLORS[b.tone];
            content.push({
                table: { widths: ['*'], body: [[{ fillColor: `#${c.bg}`, stack: [{ text: calloutHead(b), bold: true, color: `#${c.line}`, margin: [0, 0, 0, 2] }, { text: b.text }] }]] },
                layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => `#${c.line}`, paddingLeft: () => 10, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 },
                margin: [0, 2, 0, 8],
            });
        } else if (b.kind === 'chart') {
            const w = wide ? 700 : 515;
            // Başlık, grafik ve not sayfa sonunda birbirinden kopmasın
            content.push({
                unbreakable: true,
                stack: [
                    ...(b.title ? [{ text: b.title, style: 'tableTitle' }] : []),
                    { svg: chartSvg(b, w, b.chart === 'pie' ? 200 : 240), width: w, margin: [0, 0, 0, 6] },
                    ...(b.note ? [{ text: b.note, style: 'meta' }] : []),
                ],
            });
        } else {
            if (b.title) content.push({ text: b.title, style: 'tableTitle' });
            const fontSize = b.columns.length > 10 ? 6.5 : b.columns.length > 6 ? 7.5 : 9;
            content.push({
                table: {
                    headerRows: 1,
                    widths: b.columns.map((_, i) => (i === 0 || b.columns.length <= 4 ? '*' : 'auto')),
                    body: [
                        b.columns.map(c => ({ text: c, bold: true, color: '#FFFFFF', fillColor: `#${ACCENT}` })),
                        ...b.rows.map(r => r.map(c => ({ text: cellText(c), alignment: isNum(c) ? 'right' : 'left' }))),
                    ],
                },
                layout: { hLineColor: () => '#E5E7EB', vLineColor: () => '#E5E7EB', fillColor: (row: number) => (row > 0 && row % 2 === 0 ? '#F9FAFB' : null) },
                fontSize,
                margin: [0, 0, 0, 8],
            });
            if (b.note) content.push({ text: b.note, style: 'meta' });
        }
    }
    const def = {
        pageSize: 'A4',
        pageOrientation: wide ? 'landscape' : 'portrait',
        pageMargins: [36, 40, 36, 40],
        info: { title: doc.title, creator: 'PlanAsistan' },
        defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1F2937' },
        styles: {
            title: { fontSize: 18, bold: true, margin: [0, 0, 0, 4] },
            subtitle: { fontSize: 12, color: '#4B5563', margin: [0, 0, 0, 2] },
            meta: { fontSize: 8, color: '#6B7280', margin: [0, 0, 0, 12] },
            h1: { fontSize: 14, bold: true, color: `#${ACCENT}`, margin: [0, 10, 0, 6] },
            h2: { fontSize: 12, bold: true, margin: [0, 8, 0, 4] },
            tableTitle: { fontSize: 10, bold: true, margin: [0, 6, 0, 4] },
        },
        footer: (page: number, pages: number) => ({ text: `${page} / ${pages}`, alignment: 'right', fontSize: 8, color: '#9CA3AF', margin: [0, 10, 36, 0] }),
        content,
    };
    return pdfMake.createPdf(def as unknown as Parameters<typeof pdfMake.createPdf>[0]).getBlob();
};

// ---------------------------------------------------------------- PowerPoint
const ROWS_PER_SLIDE = 14;
/** Slaytta okunabilir en çok sütun; fazlası atlanır ve not düşülür (tamamı Excel/Word/PDF'te) */
const COLS_PER_SLIDE = 8;

export const renderPptx = async (doc: AiDocument): Promise<Blob> => {
    const PptxGenJS = (await import('pptxgenjs')).default;
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 13,33 × 7,5 in
    pptx.title = doc.title;
    pptx.author = 'PlanAsistan';
    const W = 13.33;
    const font = 'Calibri';

    const cover = pptx.addSlide();
    cover.background = { color: ACCENT };
    cover.addText(doc.title, { x: 0.7, y: 2.4, w: W - 1.4, h: 1.4, fontSize: 36, bold: true, color: 'FFFFFF', fontFace: font });
    cover.addText([doc.subtitle, `${dateTr(doc.createdAt)} · PlanAsistan`].filter(Boolean).join('\n'), { x: 0.7, y: 3.9, w: W - 1.4, h: 1.2, fontSize: 16, color: 'E6FFFA', fontFace: font });

    const header = (s: ReturnType<typeof pptx.addSlide>, title: string) => {
        s.addText(title, { x: 0.5, y: 0.3, w: W - 1, h: 0.7, fontSize: 24, bold: true, color: '111827', fontFace: font });
        s.addShape('rect', { x: 0.5, y: 1.0, w: 1.2, h: 0.06, fill: { color: ACCENT }, line: { color: ACCENT } });
    };

    // Metin bölümleri başlığa göre slaytlara toplanır; her tablo kendi slaytında (gerekirse sayfalara bölünür)
    let title = doc.title;
    let bullets: { text: string; options: Record<string, unknown> }[] = [];
    const flush = () => {
        if (!bullets.length) return;
        const s = pptx.addSlide();
        header(s, title);
        s.addText(bullets, { x: 0.6, y: 1.3, w: W - 1.2, h: 5.8, fontSize: bullets.length > 10 ? 14 : 18, color: '1F2937', fontFace: font, valign: 'top', paraSpaceAfter: 6 });
        bullets = [];
    };
    for (const b of doc.blocks) {
        if (b.kind === 'heading') { flush(); title = b.text; }
        else if (b.kind === 'paragraph') bullets.push({ text: b.text, options: { breakLine: true } });
        else if (b.kind === 'list') b.items.forEach(i => bullets.push({ text: i, options: { bullet: true, breakLine: true } }));
        else if (b.kind === 'callout') {
            const c = CALLOUT_COLORS[b.tone];
            bullets.push({ text: `${calloutHead(b)}  `, options: { bold: true, color: c.line } });
            bullets.push({ text: b.text, options: { breakLine: true } });
        } else if (b.kind === 'kpi') {
            flush();
            const s = pptx.addSlide();
            header(s, title);
            const n = b.items.length;
            const perRow = n <= 4 ? n : Math.ceil(n / 2);
            const gap = 0.25, cw = (W - 1 - gap * (perRow - 1)) / perRow, ch = n <= 4 ? 2.4 : 2.2;
            b.items.forEach((k, i) => {
                const c = KPI_COLORS[k.status || 'notr'];
                const x = 0.5 + (i % perRow) * (cw + gap), y = 1.5 + Math.floor(i / perRow) * (ch + gap);
                s.addShape('rect', { x, y, w: cw, h: ch, fill: { color: c.bg }, line: { color: c.bg } });
                s.addShape('rect', { x, y, w: 0.08, h: ch, fill: { color: c.fg }, line: { color: c.fg } });
                s.addText([
                    { text: k.label, options: { fontSize: 13, color: '6B7280', breakLine: true } },
                    { text: k.value, options: { fontSize: 32, bold: true, color: '111827', breakLine: true } },
                    ...(k.change || k.status !== 'notr' ? [{ text: [c.mark, k.change || kpiStatusText(k)].filter(Boolean).join(' '), options: { fontSize: 13, bold: true, color: c.fg, breakLine: true } }] : []),
                    ...(k.note ? [{ text: k.note, options: { fontSize: 11, italic: true, color: '6B7280' } }] : []),
                ], { x: x + 0.2, y: y + 0.1, w: cw - 0.3, h: ch - 0.2, fontFace: font, valign: 'middle' });
            });
        } else if (b.kind === 'chart') {
            flush();
            const s = pptx.addSlide();
            header(s, b.title || title);
            const type = b.chart === 'pie' ? pptx.ChartType.pie : b.chart === 'line' ? pptx.ChartType.line : pptx.ChartType.bar;
            s.addChart(type, b.series.map(se => ({ name: se.name, labels: b.labels, values: se.values.map(v => v ?? 0) })), {
                x: 0.5, y: 1.3, w: W - 1, h: b.note ? 5.4 : 5.8,
                chartColors: CHART_PALETTE.slice(0, b.chart === 'pie' ? b.labels.length : b.series.length),
                showLegend: b.series.length > 1 || b.chart === 'pie', legendPos: 'b', legendFontSize: 12,
                showValue: b.chart === 'bar' && b.labels.length * b.series.length <= 16, dataLabelFontSize: 11,
                ...(b.chart === 'pie' ? { showPercent: true } : { catAxisLabelFontSize: 11, valAxisLabelFontSize: 11, valGridLine: { color: 'E5E7EB', size: 0.5 } }),
                ...(b.chart === 'bar' ? { barDir: 'col', barGapWidthPct: 60 } : {}),
                ...(b.chart === 'line' ? { lineSize: 2, lineDataSymbolSize: 6 } : {}),
                fontFace: font,
            });
            if (b.note) s.addText(b.note, { x: 0.5, y: 6.9, w: W - 1, h: 0.4, fontSize: 10, italic: true, color: '6B7280', fontFace: font });
        } else {
            flush();
            const pages = Math.max(1, Math.ceil(b.rows.length / ROWS_PER_SLIDE));
            const cols = b.columns.slice(0, COLS_PER_SLIDE);
            const hidden = b.columns.length - cols.length;
            const note = [b.note, hidden ? `Slaytta ilk ${cols.length} sütun var; ${hidden} sütun daha Excel, Word ve PDF çıktısında.` : ''].filter(Boolean).join(' ');
            const fontSize = cols.length > 6 ? 10 : cols.length > 4 ? 11 : 13;
            for (let p = 0; p < pages; p++) {
                const s = pptx.addSlide();
                header(s, `${b.title || title}${pages > 1 ? ` (${p + 1}/${pages})` : ''}`);
                const rows = b.rows.slice(p * ROWS_PER_SLIDE, (p + 1) * ROWS_PER_SLIDE);
                s.addTable([
                    cols.map(c => ({ text: c, options: { bold: true, color: 'FFFFFF', fill: { color: ACCENT } } })),
                    ...rows.map((r, i) => r.slice(0, cols.length).map(c => ({ text: cellText(c), options: { align: isNum(c) ? 'right' : 'left', fill: { color: i % 2 ? 'F9FAFB' : 'FFFFFF' } } }))),
                ] as Parameters<typeof s.addTable>[0], { x: 0.5, y: 1.3, w: W - 1, fontSize, fontFace: font, color: '1F2937', border: { type: 'solid', pt: 0.5, color: 'E5E7EB' } });
                if (note && p === pages - 1) s.addText(note, { x: 0.5, y: 6.9, w: W - 1, h: 0.4, fontSize: 10, italic: true, color: '6B7280', fontFace: font });
            }
        }
    }
    flush();
    // pptxgenjs tarayıcıda dosyaları sıkıştırmadan yazıyor (tablo slaytı ~200 KB); JSZip ile yeniden sıkıştırılır
    const raw = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(raw);
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: MIME.pptx });
};

/** İstenen biçimde dosya üretir */
export const renderDocument = async (original: AiDocument, format: DocFormat): Promise<{ blob: Blob; name: string }> => {
    // Kütüphaneler girdiyi yerinde değiştirebiliyor (pdfmake liste öğelerini nesneye çevirir);
    // aynı belge sonra başka biçime dönüştürülebilsin diye her dönüşüm kopyayla çalışır
    const doc = structuredClone(original);
    let blob: Blob;
    switch (format) {
        case 'csv': blob = new Blob([renderCsv(doc)], { type: MIME.csv }); break;
        case 'xlsx': blob = new Blob([await renderXlsx(doc)], { type: MIME.xlsx }); break;
        case 'docx': blob = await renderDocx(doc); break;
        case 'pdf': blob = await renderPdf(doc); break;
        case 'pptx': blob = await renderPptx(doc); break;
    }
    return { blob, name: fileNameFor(doc, format) };
};

/** Tarayıcıda indirir */
export const downloadDocument = async (doc: AiDocument, format: DocFormat): Promise<string> => {
    const { blob, name } = await renderDocument(doc, format);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return name;
};
