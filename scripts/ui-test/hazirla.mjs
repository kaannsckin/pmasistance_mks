#!/usr/bin/env node
/**
 * UI/UX çarpışma testi, Tur 0 (hazırlık). Koordinatör koşu başında bir kez çalıştırır.
 *
 *   node scripts/ui-test/hazirla.mjs [--derle] [--gun YYYY-AA-GG]
 *
 * 1. Uygulamayı derler (dist/ yoksa ya da --derle ile); pilot komut satırını derler (dist-pilot/ yoksa).
 * 2. Veri setlerini kurar: ui-testi/<gün>/veri/pilot (pilot simülasyonu, tohum 2026) ve veri/bos.
 *    'asiri' veri setini Tolga üretir.
 * 3. Ajan dizinlerini açar, kosu.json yazar (gün, kod sürümü, veri, portlar).
 * 4. Duman testi: iki arayüz × sistem açık/koyu, PY personasıyla açılış; çökme ve konsol hatası
 *    denetimi, ekran görüntüleri ui-testi/<gün>/duman/ altında. Duman testi kalırsa çıkış kodu 2.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(`--${n}`); if (i < 0) return undefined; const v = args[i + 1]; return v && !v.startsWith('--') ? v : true; };
if (typeof flag('gun') === 'string') process.env.UI_TEST_GUN = flag('gun');

const ui = await import('./ortak.mjs');
const { ROOT, AJANLAR } = ui;
const g = ui.gun();
const kok = ui.KOK_DIZIN(g);
const sh = (cmd, a) => { const r = spawnSync(cmd, a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }); if (r.status !== 0) throw new Error(`${cmd} ${a.join(' ')} başarısız`); return r.stdout; };

if (!existsSync(join(ROOT, 'node_modules', 'vite'))) { process.stderr.write('Bağımlılıklar kuruluyor (npm ci)…\n'); sh('npm', ['ci', '--no-audit', '--no-fund']); }
ui.derle(flag('derle') === true);
if (!existsSync(join(ROOT, 'dist-pilot', 'pilot.mjs'))) { process.stderr.write('Pilot komut satırı derleniyor…\n'); sh('npm', ['run', '-s', 'build:pilot']); }

// Veri setleri
const pilotDir = join(kok, 'veri', 'pilot');
if (!existsSync(join(pilotDir, 'workspace.json'))) {
    process.stderr.write('Pilot verisi kuruluyor (simülasyon)…\n');
    sh(process.execPath, [join(ROOT, 'dist-pilot', 'pilot.mjs'), 'baslat', '--dosya', '--dizin', pilotDir]);
}
const pilot = ui.veri('pilot', g);
const bosDir = join(kok, 'veri', 'bos');
mkdirSync(bosDir, { recursive: true });
const bos = { ...pilot, projects: [], activeProjectId: null, allocations: [], planLocks: [], snapshots: [], weeklyReports: [], weeklyPublications: [], expectations: [], leaves: [] };
writeFileSync(join(bosDir, 'workspace.json'), JSON.stringify(bos));

for (const a of Object.keys(AJANLAR)) ui.ciktiDizini(a, g);
const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
const dal = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();

// Duman testi
const dumanDir = join(kok, 'duman');
mkdirSync(dumanDir, { recursive: true });
const kosu = await ui.baslat('duman', { port: 4180 });
const duman = [];
try {
    for (const arayuz of ['modern', 'classic']) {
        for (const sistem of ['light', 'dark']) {
            const o = await kosu.oturum({ arayuz, sistem, persona: 'burak' });
            const c = await ui.cokmeVarMi(o.page);
            const ekran = await ui.foto(o.page, dumanDir, `${arayuz}-${sistem}`);
            const durum = !c.supheli && o.hatalar.length === 0 ? 'GEÇTİ' : 'KALDI';
            duman.push({ arayuz, sistem, durum, ...c, hatalar: o.hatalar, disKaynak: [...o.disKaynak], ekran });
            process.stderr.write(`${durum.padEnd(6)} duman ${arayuz} ${sistem}${o.hatalar.length ? ` — ${o.hatalar.join('; ')}` : ''}\n`);
            await o.kapat();
        }
    }
} finally {
    await kosu.bitir();
}

const manifest = {
    gun: g,
    kod: { dal, commit },
    veri: { pilot: join(pilotDir, 'workspace.json'), bos: join(bosDir, 'workspace.json'), asiri: join(kok, 'veri', 'asiri', 'workspace.json') + ' (Tolga üretir)' },
    pilotOzet: { proje: pilot.projects.map(p => `${p.code || ''} ${p.name}`.trim()), kisi: pilot.people?.length },
    ajanlar: Object.fromEntries(Object.entries(AJANLAR).map(([k, v]) => [k, { ...v, dizin: join(kok, k) }])),
    duman,
};
writeFileSync(join(kok, 'kosu.json'), JSON.stringify(manifest, null, 2));
process.stdout.write(`${JSON.stringify({ kosu: join(kok, 'kosu.json'), duman: duman.map(d => `${d.arayuz}/${d.sistem}: ${d.durum}`) }, null, 2)}\n`);
if (duman.some(d => d.durum !== 'GEÇTİ')) process.exit(2);
