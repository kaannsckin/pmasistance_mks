import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { AiDocument, fileNameFor, normalizeDocument, tableFromResult, toCell } from './aiDocument';
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
