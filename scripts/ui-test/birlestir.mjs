#!/usr/bin/env node
/**
 * UI/UX çarpışma testi, Tur 3 (uzlaşma) yardımcısı: dört ajanın bulgularını tek tabloda toplar.
 *
 *   node scripts/ui-test/birlestir.mjs [--gun YYYY-AA-GG]
 *
 * Okur:   ui-testi/<gün>/<ajan>/bulgular.md   (Tur 1, ortak bulgu biçimi)
 *         ui-testi/<gün>/<ajan>/tur2.md       (Tur 2: "## Doğrulama" tablosu + yeni bulgular)
 * Yazar:  ui-testi/<gün>/tablo.md, tablo.json
 *
 * Birleştirme (aynı sorunun iki ajanda ayrı bulgu olması) ve son önem kararı koordinatöründür;
 * bu betik yalnız ayrıştırır, sayar ve çapraz doğrulama kararlarını bulgulara bağlar.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const i = args.indexOf('--gun');
if (i >= 0 && args[i + 1]) process.env.UI_TEST_GUN = args[i + 1];
const ui = await import('./ortak.mjs');
const kok = ui.KOK_DIZIN();

const KOD_AJAN = Object.fromEntries(Object.entries(ui.AJANLAR).map(([ad, a]) => [a.kod, ad]));
const alan = (govde, ad) => { const m = govde.match(new RegExp(`^\\s*-\\s*${ad}:\\s*(.+)$`, 'mi')); return m ? m[1].trim() : ''; };

const bulgular = [];
const kararlar = [];
for (const ajan of Object.keys(ui.AJANLAR)) {
    for (const [dosya, tur] of [['bulgular.md', 1], ['tur2.md', 2]]) {
        const yol = join(kok, ajan, dosya);
        if (!existsSync(yol)) continue;
        const metin = readFileSync(yol, 'utf8');
        // Bulgular: "### UI-GRS-01 · başlık" ile başlayan bloklar
        const parcalar = metin.split(/^(?=###\s+UI-[A-Z]{3}-\d+)/m).slice(1);
        for (const p of parcalar) {
            const bas = p.match(/^###\s+(UI-([A-Z]{3})-\d+)\s*[·:\-–]\s*(.+)$/m);
            if (!bas) continue;
            const govde = p.split(/^##\s/m)[0];
            const ekranSatiri = alan(govde, 'Ekran');
            const arayuz = (ekranSatiri.match(/Arayüz:\s*([^\s|]+(?:\s*\|\s*[^\s|]+)*)/i) || [])[1] || '';
            bulgular.push({
                id: bas[1], ajan: KOD_AJAN[bas[2]] || ajan, tur, baslik: bas[3].trim(),
                onem: (alan(govde, 'Önem').match(/K[1-4]/) || ['?'])[0],
                ekran: ekranSatiri.replace(/Arayüz:.*/i, '').trim(), arayuz: arayuz.trim(),
                kapsam: alan(govde, 'Kapsam'), dogrulama: alan(govde, 'Doğrulama'), kokNeden: alan(govde, 'Olası kök neden'),
                kaynak: `${ajan}/${dosya}`,
            });
        }
        // Çapraz doğrulama kararları: "| UI-XXX-NN | doğrulandı/reddedildi/… | gerekçe |"
        if (tur === 2) {
            for (const satir of metin.split('\n')) {
                const m = satir.match(/^\|\s*(UI-[A-Z]{3}-\d+)\s*\|\s*([^|]+)\|\s*([^|]*)\|?/);
                if (m) kararlar.push({ id: m[1], denetci: ajan, karar: m[2].trim(), gerekce: m[3].trim() });
            }
        }
    }
}

for (const b of bulgular) {
    const k = kararlar.filter(x => x.id === b.id);
    b.capraz = k.map(x => `${x.denetci}: ${x.karar}`).join('; ');
    const dogru = k.some(x => /doğrulandı/i.test(x.karar));
    const red = k.some(x => /reddedildi/i.test(x.karar));
    b.durum = dogru && !red ? 'doğrulandı' : red && !dogru ? 'reddedildi' : dogru && red ? 'çelişkili' : 'aday';
}

const sayac = (dizi, f) => dizi.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
const esc = s => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const onemSira = { K1: 1, K2: 2, K3: 3, K4: 4, '?': 5 };
bulgular.sort((a, b) => (onemSira[a.onem] - onemSira[b.onem]) || a.id.localeCompare(b.id));

const md = [
    `# UI/UX çarpışma testi: bulgu tablosu (${ui.gun()})`,
    '',
    `Toplam ${bulgular.length} bulgu · önem: ${Object.entries(sayac(bulgular, b => b.onem)).sort().map(([k, v]) => `${k} ${v}`).join(', ')} · durum: ${Object.entries(sayac(bulgular, b => b.durum)).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    '',
    `Ajan başına: ${Object.entries(sayac(bulgular, b => b.ajan)).map(([k, v]) => `${k} ${v}`).join(', ')} · çapraz karar: ${kararlar.length}`,
    '',
    '| Bulgu | Önem | Durum | Başlık | Ekran | Arayüz | Kapsam | Çapraz | Kaynak |',
    '|---|---|---|---|---|---|---|---|---|',
    ...bulgular.map(b => `| ${b.id} | ${b.onem} | ${b.durum} | ${esc(b.baslik)} | ${esc(b.ekran)} | ${esc(b.arayuz)} | ${esc(b.kapsam)} | ${esc(b.capraz)} | ${b.kaynak} |`),
    '',
];
const sahipsiz = kararlar.filter(k => !bulgular.some(b => b.id === k.id));
if (sahipsiz.length) md.push('## Bulgusu bulunamayan çapraz kararlar', '', ...sahipsiz.map(k => `- ${k.id} (${k.denetci}): ${k.karar} — ${k.gerekce}`), '');

writeFileSync(join(kok, 'tablo.md'), md.join('\n'));
writeFileSync(join(kok, 'tablo.json'), JSON.stringify({ gun: ui.gun(), bulgular, kararlar }, null, 2));
process.stdout.write(`${JSON.stringify({ tablo: join(kok, 'tablo.md'), bulgu: bulgular.length, karar: kararlar.length, onem: sayac(bulgular, b => b.onem) })}\n`);
