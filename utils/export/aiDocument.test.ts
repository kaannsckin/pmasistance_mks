import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { AiDocument, documentStats, fileNameFor, normalizeDocument, tableFromResult, toCell } from './aiDocument';
import { chartSvg, niceScale, textBar } from './chartSvg';
import { renderCsv, renderDocument } from './renderAiDocument';

const doc = (): AiDocument => normalizeDocument({
    title: 'ATLAS İş gücü raporu: Kasım',
    subtitle: 'Kişi bazında harcanan süre ve maliyet',
    format: 'xlsx',
    createdAt: '2026-11-20T09:00:00Z',
    blocks: [
        { kind: 'heading', text: 'Özet', level: 1 },
        { kind: 'paragraph', text: 'Toplam **955 saat**; maliyet ₺730.563.' },
        { kind: 'list', items: ['Onur Çelik en çok zaman harcayan kişi', 'Şükrü Öğüt havuzda yok'] },
        {
            kind: 'table', title: 'Kişiler', columns: ['Kişi', 'Saat', 'Maliyet (TL)', 'Sicil'],
            rows: [['Onur Çelik', '199', '132.611', '0012'], ['Gizem Yıldız', 131, 87043.4, null], ['Toplam', '330', '219.654,4', '']],
            note: 'Maliyet ünvan maliyetinden hesaplandı.',
        },
    ],
});

describe('belge modeli', () => {
    it('hücreler: sayısal metin sayıya çevrilir, kod ve yüzde metin kalır', () => {
        expect(toCell('1.234,5')).toBe(1234.5);
        expect(toCell('132.611')).toBe(132611);
        expect(toCell('12.5')).toBe(12.5);
        expect(toCell('0012')).toBe('0012');
        expect(toCell('%45')).toBe('%45');
        expect(toCell('2026-11-20')).toBe('2026-11-20');
        expect(toCell(true)).toBe('evet');
        expect(toCell(['a', 'b'])).toBe('a, b');
    });

    it('normalleştirme: markdown sadeleşir, satırlar sütun sayısına uyar, boşlar düşer', () => {
        const d = doc();
        expect(d.blocks[1]).toEqual({ kind: 'paragraph', text: 'Toplam 955 saat; maliyet ₺730.563.' });
        const t = d.blocks[3] as Extract<AiDocument['blocks'][number], { kind: 'table' }>;
        expect(t.rows[0]).toEqual(['Onur Çelik', 199, 132611, '0012']);
        expect(t.rows[2][2]).toBe(219654.4);
        expect(() => normalizeDocument({ title: ' ', format: 'pdf', blocks: [] })).toThrow(/başlığı/);
        expect(() => normalizeDocument({ title: 'x', format: 'pdf', blocks: [{ kind: 'paragraph', text: '  ' }] })).toThrow(/boş/);
        expect(fileNameFor(d, 'pdf')).toBe('ATLAS Is gucu raporu Kasim - 2026-11-20.pdf');
    });

    it('araç sonucundan tablo: en uzun nesne listesi, iç içe alanlar açılır', () => {
        const r = tableFromResult({
            toplam: 2,
            kisiler: [{ kisi: 'Ayşe', saat: 4, maliyet_tl: 1000, birim: { kod: 'U310' } }, { kisi: 'Ali', saat: 2, etiketler: ['a', 'b'] }],
            projeler: [{ ad: 'X' }],
        });
        expect(r.field).toBe('kisiler');
        expect(r.columns).toEqual(['Kişi', 'Saat', 'Maliyet (TL)', 'Birim kod', 'Etiketler']);
        expect(r.rows[1]).toEqual(['Ali', 2, null, null, 'a, b']);
        expect(tableFromResult({ x: [{ a: 1, bos: '', yok: null }, { a: 2 }] }).columns).toEqual(['A']);
        expect(tableFromResult({ a: { projeler: [{ ad: 'X' }] } }, 'projeler').rows).toEqual([['X']]);
        expect(() => tableFromResult({ a: 1 }, 'yok')).toThrow(/listesi yok/);
    });
});

describe('dosya biçimleri', () => {
    it('CSV: ; ayırıcı, ondalık virgül, BOM', () => {
        const csv = renderCsv(doc());
        expect(csv.startsWith('﻿')).toBe(true);
        expect(csv).toContain('Kişi;Saat;Maliyet (TL);Sicil\r\nOnur Çelik;199;132611;0012\r\nGizem Yıldız;131;87043,4;');
    });

    it('Excel: Özet ve tablo sayfaları, sayılar sayı olarak', async () => {
        const XLSX = await import('xlsx');
        const { blob, name } = await renderDocument(doc(), 'xlsx');
        expect(name.endsWith('.xlsx')).toBe(true);
        const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
        expect(wb.SheetNames).toEqual(['Özet', 'Kişiler']);
        expect(wb.Sheets['Kişiler'].B2).toMatchObject({ t: 'n', v: 199 });
        expect(wb.Sheets['Kişiler'].D2).toMatchObject({ t: 's', v: '0012' });
    });

    it('Word ve PowerPoint geçerli Office paketi; Türkçe metin içerir', async () => {
        for (const [format, part] of [['docx', 'word/document.xml'], ['pptx', 'ppt/slides/slide1.xml']] as const) {
            const { blob } = await renderDocument(doc(), format);
            const zip = await JSZip.loadAsync(await blob.arrayBuffer());
            const xml = await zip.file(part)!.async('string');
            expect(xml).toContain('ATLAS İş gücü raporu: Kasım');
        }
        const pptx = await JSZip.loadAsync(await (await renderDocument(doc(), 'pptx')).blob.arrayBuffer());
        expect(Object.keys(pptx.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(3); // kapak, özet, tablo
    });

    it('aynı belge art arda tüm biçimlere dönüşür (dönüştürücüler belgeyi değiştirmez)', async () => {
        const d = doc();
        const before = JSON.stringify(d);
        for (const f of ['pdf', 'pptx', 'docx', 'xlsx', 'csv'] as const) await renderDocument(d, f);
        expect(JSON.stringify(d)).toBe(before);
    }, 30_000);

    it('PDF üretilir (gömülü yazı tipiyle)', async () => {
        const { blob } = await renderDocument(doc(), 'pdf');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
        expect(new TextDecoder('latin1').decode(bytes)).toMatch(/FontFile2|Roboto/);
    }, 30_000);
});

const analytic = (): AiDocument => normalizeDocument({
    title: 'ATLAS maliyet analizi',
    format: 'docx',
    createdAt: '2026-11-20T09:00:00Z',
    blocks: [
        { kind: 'callout', tone: 'bilgi', text: 'Maliyet planın **%14** üstünde; artışın 3/4\'ü dış kaynaktan.' },
        { kind: 'kpi', items: [
            { label: 'Gerçekleşen', value: '₺1,2 Mn', change: '+%14 plana göre', status: 'kritik' },
            { label: 'SPI', value: '0,92', status: 'dikkat' },
            { label: 'Tamamlanma', value: '%64', status: 'iyi', note: 'Plan %60' },
            { label: '', value: 'boş etiket atılır' },
        ] },
        { kind: 'heading', text: 'Bulgular', level: 1 },
        { kind: 'callout', tone: 'bulgu', title: 'Maliyetin %62\'si 3 kişide', text: '12 kişiden 3\'ü.' },
        { kind: 'chart', chart: 'bar', title: 'Aylık maliyet', labels: ['Eyl', 'Eki', 'Kas'], series: [{ name: 'Plan', values: [100, 120, '130'] as never }, { name: 'Gerçek', values: [110, 150, null] }] },
        { kind: 'chart', chart: 'pie', title: 'Bölüm payı', labels: ['U310', 'U320'], series: [{ name: 'Pay', values: [62, 38] }] },
        { kind: 'callout', tone: 'oneri', title: 'Dış kaynak sözleşmesini gözden geçir', text: 'Sahip: PYB · 15 Aralık' },
    ],
});

describe('analitik bloklar (gösterge, vurgu, grafik)', () => {
    it('normalleştirme: boş göstergeler düşer, grafik değerleri sayıya çevrilir, çok serili pasta çubuğa döner', () => {
        const d = analytic();
        const kpi = d.blocks[1] as Extract<AiDocument['blocks'][number], { kind: 'kpi' }>;
        expect(kpi.items).toHaveLength(3);
        expect(kpi.items[1]).toEqual({ label: 'SPI', value: '0,92', status: 'dikkat' });
        const bar = d.blocks[4] as Extract<AiDocument['blocks'][number], { kind: 'chart' }>;
        expect(bar.series[0].values).toEqual([100, 120, 130]);
        const multiPie = normalizeDocument({ title: 'x', format: 'pdf', blocks: [{ kind: 'chart', chart: 'pie', labels: ['a'], series: [{ name: 'A', values: [1] }, { name: 'B', values: [2] }] }] });
        expect((multiPie.blocks[0] as { chart: string }).chart).toBe('bar');
        expect(() => normalizeDocument({ title: 'x', format: 'pdf', blocks: [{ kind: 'chart', chart: 'bar', labels: ['a'], series: [{ name: 'A', values: [null] }] }] })).toThrow(/sayısal değer yok/);
        expect(documentStats(d)).toMatchObject({ charts: 2, kpis: 3, callouts: 3, tables: 0 });
    });

    it('Excel: özet sayfasında göstergeler ve bulgular; grafik verisi ayrı sayfada', async () => {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(new Uint8Array(await (await renderDocument(analytic(), 'xlsx')).blob.arrayBuffer()), { type: 'array' });
        expect(wb.SheetNames).toEqual(['Özet', 'Grafik Aylık maliyet', 'Grafik Bölüm payı']);
        const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Özet'], { header: 1 }).map(r => r.join('|'));
        expect(rows).toContain('Gerçekleşen|₺1,2 Mn|+%14 plana göre|Kritik|');
        expect(rows).toContain('► Bulgu: Maliyetin %62\'si 3 kişide');
        expect(wb.Sheets['Grafik Aylık maliyet'].C3).toMatchObject({ t: 'n', v: 150 });
        expect(renderCsv(analytic())).toContain('Kategori;Plan;Gerçek\r\nEyl;100;110');
    });

    it('Word, PowerPoint (yerel grafik) ve PDF (SVG grafik) üretilir', async () => {
        const docx = await JSZip.loadAsync(await (await renderDocument(analytic(), 'docx')).blob.arrayBuffer());
        const xml = await docx.file('word/document.xml')!.async('string');
        expect(xml).toContain('Bulgu: Maliyetin %62');
        expect(xml).toContain('₺1,2 Mn');
        expect(xml).toContain('█');
        const pptx = await JSZip.loadAsync(await (await renderDocument(analytic(), 'pptx')).blob.arrayBuffer());
        expect(Object.keys(pptx.files).filter(f => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toHaveLength(2);
        const pdf = new Uint8Array(await (await renderDocument(analytic(), 'pdf')).blob.arrayBuffer());
        expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    }, 30_000);

    it('SVG grafik: çubuk, çizgi ve pasta; metin kaçışlı', () => {
        const d = analytic();
        const bar = d.blocks[4] as Extract<AiDocument['blocks'][number], { kind: 'chart' }>;
        const svg = chartSvg(bar);
        expect(svg.startsWith('<svg')).toBe(true);
        expect((svg.match(/<rect /g) || []).length).toBeGreaterThanOrEqual(5 + 2); // 5 çubuk + 2 lejant
        expect(chartSvg({ ...bar, chart: 'line' })).toContain('<polyline');
        expect(chartSvg({ ...bar, chart: 'pie', series: [bar.series[0]] })).toContain('<polygon');
        expect(chartSvg({ ...bar, chart: 'pie', series: [bar.series[0]], labels: ['<a>', 'b', 'c'] })).toContain('&lt;a&gt;');
        expect(niceScale(0, 137)).toEqual({ lo: 0, hi: 150, step: 50 });
        expect(textBar(5, 10, 10)).toBe('█████');
    });
});
