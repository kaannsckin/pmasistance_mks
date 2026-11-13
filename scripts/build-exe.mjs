#!/usr/bin/env node
/**
 * PlanAsistan'ı tek dosyalık çalıştırılabilire (exe) paketler — Node "Single
 * Executable Application" (SEA). Arayüz (dist/) ve yerel sunucu
 * (dist-local/planasistan.cjs) Node ikili dosyasının içine gömülür; kurulum
 * ya da Node gerekmez.
 *
 *   npm run build:exe                      → Windows (win-x64)
 *   npm run build:exe -- linux-x64 win-x64 → birden çok hedef
 *
 * Çıktı: release/PlanAsistan-<hedef>.zip (exe + BENIOKU.txt). Hedefin Node
 * ikili dosyası, bu betiği çalıştıran Node'la aynı sürümde nodejs.org'dan
 * indirilir ve .cache/node altında saklanır (SEA bloğu sürüme bağlıdır).
 * Gömme işlemi ikili düzeydedir: Windows exe'si Linux'ta da üretilebilir.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = process.version; // ör. v22.23.4
const TARGETS = {
    'win-x64': { archive: `node-${VERSION}-win-x64.zip`, member: `node-${VERSION}-win-x64/node.exe`, exe: 'PlanAsistan.exe' },
    'linux-x64': { archive: `node-${VERSION}-linux-x64.tar.xz`, member: `node-${VERSION}-linux-x64/bin/node`, exe: 'PlanAsistan' },
};
const SENTINEL = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
const step = msg => console.log(`\n▸ ${msg}`);

const targets = process.argv.slice(2).filter(a => !a.startsWith('-'));
if (!targets.length) targets.push('win-x64');
for (const t of targets) if (!TARGETS[t]) { console.error(`Bilinmeyen hedef: ${t} (${Object.keys(TARGETS).join(', ')})`); process.exit(1); }
if (Number(VERSION.slice(1).split('.')[0]) < 22) { console.error('Node 22 ya da üstü gerekir.'); process.exit(1); }

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (!process.argv.includes('--skip-build')) {
    step('Arayüz derleniyor (dist/)');
    run(npmCmd, ['run', 'build'], { shell: process.platform === 'win32' });
    step('Yerel sunucu derleniyor (dist-local/)');
    run(npmCmd, ['run', 'build:local'], { shell: process.platform === 'win32' });
}

// ---- SEA bloğu: sunucu betiği + arayüz dosyaları (web/...) ----
step('SEA bloğu hazırlanıyor');
const walk = dir => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const dist = join(ROOT, 'dist');
if (!existsSync(join(dist, 'index.html'))) { console.error('dist/index.html yok: önce npm run build'); process.exit(1); }
const assets = Object.fromEntries(walk(dist).map(f => [`web/${relative(dist, f).split('\\').join('/')}`, f]));
const work = join(ROOT, 'dist-local');
const blob = join(work, 'sea-prep.blob');
writeFileSync(join(work, 'sea-config.json'), JSON.stringify({
    main: join(work, 'planasistan.cjs'),
    output: blob,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false, // kod önbelleği platforma bağlıdır; çapraz derlemede kapalı
    assets,
}, null, 2));
run(process.execPath, ['--experimental-sea-config', join(work, 'sea-config.json')]);
console.log(`  ${Object.keys(assets).length} arayüz dosyası gömüldü`);

// ---- hedef başına: Node ikilisini indir, bloğu göm, zip'le ----
const cache = join(ROOT, '.cache', 'node');
mkdirSync(cache, { recursive: true });
const sums = async () => {
    const f = join(cache, `SHASUMS256-${VERSION}.txt`);
    if (!existsSync(f)) {
        const r = await fetch(`https://nodejs.org/dist/${VERSION}/SHASUMS256.txt`);
        if (!r.ok) throw new Error(`SHASUMS256 indirilemedi (HTTP ${r.status})`);
        writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    }
    return readFileSync(f, 'utf8');
};

const fetchNode = async (t) => {
    const { archive, member } = TARGETS[t];
    const file = join(cache, archive);
    if (!existsSync(file)) {
        console.log(`  indiriliyor: ${archive}`);
        const r = await fetch(`https://nodejs.org/dist/${VERSION}/${archive}`);
        if (!r.ok) throw new Error(`${archive} indirilemedi (HTTP ${r.status})`);
        writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }
    const want = (await sums()).split('\n').find(l => l.endsWith(`  ${archive}`))?.split(' ')[0];
    const got = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (!want || want !== got) { rmSync(file, { force: true }); throw new Error(`${archive} sağlama toplamı tutmadı; dosya silindi, yeniden deneyin.`); }
    const out = join(cache, t);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    if (archive.endsWith('.zip')) {
        const JSZip = require('jszip');
        const zip = await JSZip.loadAsync(readFileSync(file));
        writeFileSync(join(out, 'node'), await zip.file(member).async('nodebuffer'));
    } else {
        run('tar', ['-xJf', file, '-C', out, '--strip-components=2', member]);
    }
    return join(out, 'node');
};

const README = readFileSync(join(ROOT, 'scripts', 'exe-BENIOKU.txt'), 'utf8');
const { inject } = require('postject');
const JSZip = require('jszip');
const release = join(ROOT, 'release');
mkdirSync(release, { recursive: true });
const blobData = readFileSync(blob);

for (const t of targets) {
    step(`Hedef: ${t}`);
    const node = await fetchNode(t);
    const dir = join(release, `PlanAsistan-${t}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const exe = join(dir, TARGETS[t].exe);
    copyFileSync(node, exe);
    await inject(exe, 'NODE_SEA_BLOB', blobData, { sentinelFuse: SENTINEL });
    writeFileSync(join(dir, 'BENIOKU.txt'), README.replace(/\r?\n/g, t.startsWith('win') ? '\r\n' : '\n'));

    const zip = new JSZip();
    const folder = zip.folder('PlanAsistan');
    folder.file(TARGETS[t].exe, readFileSync(exe), { unixPermissions: 0o755 });
    folder.file('BENIOKU.txt', readFileSync(join(dir, 'BENIOKU.txt')));
    const zipFile = join(release, `PlanAsistan-${t}.zip`);
    writeFileSync(zipFile, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, platform: 'UNIX' }));
    console.log(`  ✓ ${relative(ROOT, exe)} (${(statSync(exe).size / 1e6).toFixed(0)} MB)`);
    console.log(`  ✓ ${relative(ROOT, zipFile)} (${(statSync(zipFile).size / 1e6).toFixed(0)} MB)`);
}
