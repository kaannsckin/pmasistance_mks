#!/usr/bin/env node
/**
 * Demo yolu tarayıcı testi: yönetim sunumunda gezilecek ekranları gerçek
 * tarayıcıda (Chromium, playwright-core) personaların gözüyle açar.
 *
 *   node scripts/demo-yolu.mjs --veri <çalışma alanı.json> [--beklenen <beklenen.json>]
 *        [--cikti <dizin>] [--ekran] [--arayuz klasik,modern] [--port 4173]
 *
 * Her adımda: ekran çökmedi mi (gezinme çubuğu yerinde), sayfa/konsol hatası
 * var mı, beklenen metin ve rakamlar (MCP'nin verdiği değerler) ekranda mı.
 * Çıktı: <cikti>/sonuc.json ve sonuc.md; --ekran ile her adımın, aksi hâlde
 * yalnız kalan adımların ekran görüntüsü. Kalan adım varsa çıkış kodu 2.
 *
 * Çalışma alanı IndexedDB'ye (uygulamanın kendi deposu) yazılır; uygulama
 * buluta bağlanmaz. Tarayıcının saati gerçek saattir: beklenen değerler aynı
 * gün MCP'den alınmalıdır (pilot demo-testi bunu yapar).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = name => {
    const i = args.indexOf(`--${name}`);
    if (i < 0) return undefined;
    const v = args[i + 1];
    return v && !v.startsWith('--') ? v : true;
};
const fail = msg => { process.stderr.write(`${msg}\n`); process.exit(1); };

const wsFile = flag('veri');
if (typeof wsFile !== 'string') fail('Kullanım: node scripts/demo-yolu.mjs --veri <çalışma alanı.json> [--beklenen <json>] [--cikti <dizin>] [--ekran] [--arayuz klasik,modern]');
const outDir = resolve(typeof flag('cikti') === 'string' ? flag('cikti') : 'demo-testi');
const allShots = flag('ekran') === true;
const port = Number(flag('port') || 4173);
const styles = String(typeof flag('arayuz') === 'string' ? flag('arayuz') : 'klasik,modern').split(',').map(s => s.trim()).filter(Boolean);
const expected = typeof flag('beklenen') === 'string' ? JSON.parse(readFileSync(flag('beklenen'), 'utf8')) : {};
const root = resolve(new URL('..', import.meta.url).pathname);

const raw = JSON.parse(readFileSync(wsFile, 'utf8'));
// Yedek dosyası ({workspace}) ya da doğrudan çalışma alanı
const workspace = raw.workspace && raw.workspace.projects ? raw.workspace : raw;
if (!Array.isArray(workspace.projects)) fail(`${wsFile} bir çalışma alanı değil.`);
const projectByCode = code => workspace.projects.find(p => (p.code || '').startsWith(code) || (p.name || '').startsWith(code));

/* ---------------- Demo yolu ---------------- */

// Düğme adları klasik ve modern arayüzde farklı: her tıklama bir seçenek listesi
const R = {
    yonetim: /^Yönetim(\s|$)/i,
    portfoy: /^Portföy(\s|$)/i,
    tahsis: /^(Tahsis|Ekip ve tahsis)(\s|$)/i,
    riskler: /^(Riskler|Risk raporu)(\s|\d|$)/i,
    haftalik: /^Haftalık rapor/i,
    araclar: /^Araçlar/i,
    kapasite: /^Kapasite[-–]talep/i,
    karsilastir: /^Karşılaştır$/i,
    pano: /^(Pano|Genel bakış)$/i,
    gorevler: /^(Görevler|Liste)$/i,
    projeRiskleri: /^Riskler$/i,
    durumRaporu: /^Durum Raporu$/i,
};

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const healthRe = score => new RegExp(`Portföy sağlığı[^0-9]{0,40}\\b${score}\\b`, 'i');

const journeys = () => {
    const nhr = projectByCode('NHR') || projectByCode('NEHİR');
    const exp = expected;
    const activeNames = workspace.projects.filter(p => p.status === 'devam').map(p => p.name);
    return [
        {
            persona: 'ahmet', role: 'mudur', personId: 'p21',
            adimlar: [
                { ad: 'Yönetim', tikla: [[R.yonetim]], metin: exp.saglik_skoru !== undefined ? [{ ad: `Portföy sağlığı ${exp.saglik_skoru} (MCP)`, re: healthRe(exp.saglik_skoru) }] : [] },
                { ad: 'Portföy', tikla: [[R.portfoy]], metin: activeNames.map(n => ({ ad: n, re: new RegExp(n.split(' ')[0]) })) },
                { ad: 'Tahsis › Kapasite-Talep', tikla: [[R.tahsis], [R.kapasite, R.araclar]], sonra: [[R.kapasite]], metin: [] },
                { ad: 'Riskler', tikla: [[R.riskler]], metin: [] },
                { ad: 'Haftalık Rapor', tikla: [[R.haftalik]], metin: [{ ad: 'hafta başlığı', re: /\d+\. hafta/ }] },
            ],
        },
        nhr && {
            persona: 'burak', role: 'py', personId: 'p14', activeProjectId: nhr.id,
            adimlar: [
                // Modern arayüzde proje kenar çubuğundan açılır; klasikte proje çubuğu zaten görünür
                { ad: `${nhr.name} › Pano`, tikla: [[new RegExp(`^${escapeRe(nhr.name)}`), R.pano], [R.pano]], metin: [{ ad: nhr.name, re: new RegExp(nhr.name.split(' ')[0]) }] },
                { ad: `${nhr.name} › Görevler`, tikla: [[R.gorevler]], metin: [] },
                { ad: `${nhr.name} › Riskler`, tikla: [[R.projeRiskleri]], metin: [] },
                { ad: `${nhr.name} › Durum Raporu`, tikla: [[R.durumRaporu]], istege: true, metin: [] },
                { ad: 'Haftalık Rapor', tikla: [[R.haftalik]], metin: [{ ad: 'hafta başlığı', re: /\d+\. hafta/ }] },
            ],
        },
        {
            persona: 'selin', role: 'bolum_sorumlu', personId: 'p01',
            adimlar: [
                { ad: 'Haftalık Rapor', tikla: [[R.haftalik]], metin: [{ ad: 'hafta başlığı', re: /\d+\. hafta/ }] },
                { ad: 'Tahsis › Kapasite-Talep', tikla: [[R.tahsis], [R.kapasite, R.araclar]], sonra: [[R.kapasite]], metin: [] },
            ],
        },
        {
            persona: 'mert', role: 'pyb_destek', personId: 'p23',
            adimlar: [
                { ad: 'Tahsis › Karşılaştır', tikla: [[R.tahsis], [R.karsilastir]], metin: [] },
                { ad: 'Haftalık Rapor', tikla: [[R.haftalik]], metin: [{ ad: 'hafta başlığı', re: /\d+\. hafta/ }] },
            ],
        },
    ].filter(Boolean);
};

/* ---------------- Altyapı ---------------- */

const ensureBuild = () => {
    if (existsSync(join(root, 'dist', 'index.html')) && !flag('derle')) return;
    process.stderr.write('Uygulama derleniyor (vite build)…\n');
    const r = spawnSync('npx', ['vite', 'build'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
    if (r.status !== 0) fail('vite build başarısız.');
};

const startServer = async () => {
    const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore', detached: true });
    const stop = () => { try { process.kill(-srv.pid); } catch { /* kapandı */ } };
    const url = `http://127.0.0.1:${port}/`;
    for (let i = 0; i < 60; i++) {
        try { if ((await fetch(url)).ok) return { url, stop }; } catch { /* henüz açılmadı */ }
        await new Promise(r => setTimeout(r, 250));
    }
    stop();
    return fail(`Önizleme sunucusu açılmadı (${url}).`);
};

const chromiumPath = () => [process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium'].find(p => p && existsSync(p));

/**
 * Uygulama Tailwind, ikon ve Excel kitaplıklarını CDN'den yükler. Vekil
 * sunucu arkasında (bulut oturumu) tarayıcı da vekili kullanır; yerel
 * önizleme sunucusu vekilden geçmez.
 */
const proxyArgs = () => {
    const server = process.env.HTTPS_PROXY || process.env.https_proxy;
    // Playwright'ın proxy seçeneği yerel adresi de vekile yollar; Chromium bayrakları yollamaz
    return server ? [`--proxy-server=${server}`, '--proxy-bypass-list=127.0.0.1;localhost'] : ['--no-proxy-server'];
};

/** Çalışma alanını uygulamanın IndexedDB deposuna yazar (App.tsx açılışında okunur) */
const seed = (page, ws) => page.evaluate(async ws => {
    const { projects, ...rest } = ws;
    const db = await new Promise((res, rej) => {
        const o = indexedDB.open('planasistan', 1);
        o.onupgradeneeded = () => { if (!o.result.objectStoreNames.contains('workspace')) o.result.createObjectStore('workspace'); };
        o.onsuccess = () => res(o.result);
        o.onerror = () => rej(o.error);
    });
    await new Promise((res, rej) => {
        const tx = db.transaction('workspace', 'readwrite');
        const s = tx.objectStore('workspace');
        s.clear();
        s.put({ format: 1, workspace: rest, projectIds: projects.map(p => p.id) }, 'meta');
        projects.forEach(p => s.put(p, `project:${p.id}`));
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
    });
    db.close();
}, ws);

/** Seçeneklerden görünür ilk düğmeyi (ya da menü öğesini) tıklar; hangisinin tıklandığını döner */
const clickFirst = async (page, options) => {
    for (const re of options) {
        for (const role of ['button', 'menuitem', 'tab', 'link']) {
            const loc = page.getByRole(role, { name: re });
            const n = await loc.count();
            for (let i = 0; i < n; i++) {
                const el = loc.nth(i);
                if (await el.isVisible()) { await el.click(); await page.waitForTimeout(400); return re; }
            }
        }
    }
    return null;
};

const TR_ASCII = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
const slug = s => s.toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, c => TR_ASCII[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------------- Koşu ---------------- */

const main = async () => {
    const { chromium } = await import('playwright-core');
    ensureBuild();
    mkdirSync(outDir, { recursive: true });
    const server = await startServer();
    const browser = await chromium.launch({ executablePath: chromiumPath(), args: proxyArgs() });
    const results = [];
    const externalFails = new Set();
    try {
        for (const style of styles) {
            for (const j of journeys()) {
                const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
                const page = await ctx.newPage();
                let errors = [];
                page.on('pageerror', e => errors.push(`sayfa: ${e.message}`));
                page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`konsol: ${m.text().slice(0, 300)}`); });
                page.on('dialog', d => d.dismiss());
                // CDN'den gelen stil ve kitaplıklar: yüklenmezse ekran biçimsiz ya da dışa aktarma bozuk olur
                const external = url => !url.startsWith(server.url) && /^https?:/.test(url);
                page.on('requestfailed', q => { if (external(q.url())) externalFails.add(new URL(q.url()).host); });
                page.on('response', q => { if (external(q.url()) && q.status() >= 400) externalFails.add(`${new URL(q.url()).host} (${q.status()})`); });
                const ws = {
                    ...workspace,
                    currentRole: j.role,
                    currentPersonId: j.personId,
                    ...(j.activeProjectId ? { activeProjectId: j.activeProjectId } : {}),
                    settings: { ...(workspace.settings || {}), uiStyle: style === 'modern' ? 'modern' : 'classic' },
                };
                await page.goto(server.url);
                await seed(page, ws);
                await page.reload();
                await page.getByRole('button', { name: R.portfoy }).first().waitFor({ timeout: 15000 }).catch(() => {});
                await page.waitForTimeout(800);
                errors = errors.filter(e => !/IndexedDB|indexedDB/.test(e));
                for (const a of j.adimlar) {
                    const r = { arayuz: style, persona: j.persona, adim: a.ad, durum: 'GEÇTİ', notlar: [] };
                    const before = errors.length;
                    let clicked = true;
                    for (const options of a.tikla) {
                        const hit = await clickFirst(page, options);
                        if (!hit) { clicked = false; break; }
                        if (hit === R.araclar && a.sonra) for (const o of a.sonra) await clickFirst(page, o);
                    }
                    await page.waitForTimeout(900);
                    if (!clicked) {
                        if (a.istege) { r.durum = 'ATLANDI'; r.notlar.push('düğme bu arayüzde yok (isteğe bağlı adım)'); }
                        else { r.durum = 'KALDI'; r.notlar.push(`düğme bulunamadı: ${a.tikla.map(o => o.map(String).join(' | ')).join(' › ')}`); }
                    }
                    const navAlive = await page.getByRole('button', { name: R.portfoy }).count();
                    if (!navAlive) { r.durum = 'KALDI'; r.notlar.push('ekran çöktü: gezinme çubuğu yok'); }
                    const text = await page.locator('body').innerText().catch(() => '');
                    for (const m of a.metin) {
                        if (!m.re.test(text)) { r.durum = 'KALDI'; r.notlar.push(`ekranda yok: ${m.ad}`); }
                    }
                    const newErrors = errors.slice(before);
                    if (newErrors.length) { r.durum = 'KALDI'; r.notlar.push(...newErrors.slice(0, 5)); }
                    if (allShots || r.durum === 'KALDI') {
                        const file = `${style}-${j.persona}-${slug(a.ad)}.png`;
                        await page.screenshot({ path: join(outDir, file) });
                        r.ekran = file;
                    }
                    results.push(r);
                    process.stderr.write(`${r.durum.padEnd(7)} ${style} ${j.persona} ${a.ad}${r.notlar.length ? ` — ${r.notlar.join('; ')}` : ''}\n`);
                }
                await ctx.close();
            }
        }
    } finally {
        await browser.close();
        server.stop();
    }
    const failed = results.filter(r => r.durum === 'KALDI');
    const summary = {
        tarih: new Date().toISOString(),
        sonuc: failed.length ? 'KALDI' : 'GEÇTİ',
        adim: results.length,
        kalan: failed.length,
        dis_kaynak_hatasi: [...externalFails],
        beklenen: expected,
        adimlar: results,
    };
    writeFileSync(join(outDir, 'sonuc.json'), JSON.stringify(summary, null, 2));
    const md = [
        `# Demo yolu testi — ${summary.sonuc}`,
        '',
        `${summary.tarih.slice(0, 16).replace('T', ' ')} UTC · ${results.length} adım · ${failed.length} kalan · arayüz: ${styles.join(', ')}`,
        externalFails.size ? `\n**Uyarı:** dış kaynak yüklenemedi (ekran biçimsiz ya da dışa aktarma bozuk olabilir): ${[...externalFails].join(', ')}` : '',
        expected.saglik_skoru !== undefined ? `\nBeklenen (MCP, müdür): portföy sağlığı ${expected.saglik_skoru}${expected.projeler ? ` · ${expected.projeler.map(p => `${p.proje} ${p.skor}`).join(' · ')}` : ''}` : '',
        '',
        '| Arayüz | Persona | Adım | Durum | Not |',
        '|---|---|---|---|---|',
        ...results.map(r => `| ${r.arayuz} | ${r.persona} | ${r.adim} | ${r.durum} | ${[...r.notlar, r.ekran ? `ekran: ${r.ekran}` : ''].filter(Boolean).join('; ').replace(/\|/g, '\\|')} |`),
        '',
    ].join('\n');
    writeFileSync(join(outDir, 'sonuc.md'), md);
    process.stdout.write(md);
    process.exit(failed.length ? 2 : 0);
};

main().catch(e => { process.stderr.write(`Hata: ${e?.stack || e}\n`); process.exit(1); });
