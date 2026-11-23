import { AiDocument, Cell, cellText, DocBlock, DocFormat, fileNameFor } from './aiDocument';

/**
 * Belge modelini dosyaya çevirir (tarayıcıda). Ağır kütüphaneler (SheetJS,
 * docx, pdfmake, pptxgenjs) yalnız o biçim istendiğinde yüklenir.
 */

type Table = Extract<DocBlock, { kind: 'table' }>;

const ACCENT = '0F766E';
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
    const ts = tables(doc);
    const lines: string[] = [];
    if (!ts.length) {
        for (const b of doc.blocks) {
            if (b.kind === 'list') b.items.forEach(i => lines.push(csvCell(i)));
            else if (b.kind !== 'table') lines.push(csvCell(b.text));
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
    const text = doc.blocks.filter(b => b.kind !== 'table');
    // Metin bölümleri ilk sayfada (Özet); tablolar kendi sayfalarında
    if (text.length || !tables(doc).length) {
        const rows: Cell[][] = [[doc.title], ...(doc.subtitle ? [[doc.subtitle]] : []), [`Oluşturma: ${dateTr(doc.createdAt)} · PlanAsistan`], []];
        for (const b of text) {
            if (b.kind === 'list') b.items.forEach(i => rows.push([`• ${i}`]));
            else if (b.kind === 'heading') rows.push([b.text]);
            else if (b.kind === 'paragraph') rows.push([b.text], []);
        }
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 100 }];
        XLSX.utils.book_append_sheet(wb, ws, sheetName('Özet', used));
    }
    tables(doc).forEach((t, i) => {
        const data: Cell[][] = [t.columns, ...t.rows];
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = widths(data);
        ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: t.rows.length, c: t.columns.length - 1 } }) };
        if (t.note) XLSX.utils.sheet_add_aoa(ws, [[], [t.note]], { origin: -1 });
        XLSX.utils.book_append_sheet(wb, ws, sheetName(t.title || (tables(doc).length === 1 ? doc.title : `Tablo ${i + 1}`), used));
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
    for (const b of doc.blocks) {
        if (b.kind === 'heading') children.push(new d.Paragraph({ heading: b.level === 1 ? d.HeadingLevel.HEADING_1 : d.HeadingLevel.HEADING_2, children: [new d.TextRun({ text: b.text })] }));
        else if (b.kind === 'paragraph') b.text.split('\n').forEach(line => children.push(new d.Paragraph({ spacing: { after: 120 }, children: [new d.TextRun({ text: line })] })));
        else if (b.kind === 'list') b.items.forEach(i => children.push(new d.Paragraph({ bullet: { level: 0 }, children: [new d.TextRun({ text: i })] })));
        else {
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
        else {
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
        else {
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
