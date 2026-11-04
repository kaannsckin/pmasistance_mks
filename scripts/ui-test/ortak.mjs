/**
 * UI/UX çarpışma testi ortak betiği (docs/UI_AJANLARI.md).
 *
 * Dört ajanın (Deniz, Cem, Tolga, Ece) koşu betikleri bu modülü içe aktarır:
 *
 *   import * as ui from '<depo>/scripts/ui-test/ortak.mjs';
 *   const kosu = await ui.baslat('deniz');                 // sunucu + tarayıcı
 *   const o = await kosu.oturum({ arayuz: 'modern', sistem: 'dark', gece: false, persona: 'burak' });
 *   await ui.tikla(o.page, [/^Portföy$/]);
 *   await ui.foto(o.page, kosu.dizin, 'modern-koyu-gunduz-portfoy');
 *   console.log(await ui.kontrastTara(o.page));
 *   await o.kapat();
 *   await kosu.bitir();
 *
 * Kaynak kodu değiştirmez; yalnız derlenmiş uygulamayı (dist/) yerel önizleme
 * sunucusunda açar ve çalışma alanını uygulamanın IndexedDB deposuna yazar.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Koşu günü (İstanbul saatiyle YYYY-AA-GG); UI_TEST_GUN ile sabitlenebilir */
export const gun = () => process.env.UI_TEST_GUN || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date());

export const KOK_DIZIN = (g = gun()) => join(ROOT, 'ui-testi', g);

export const AJANLAR = {
    deniz: { kod: 'GRS', port: 4181, tanim: 'ui-gorsel' },
    cem: { kod: 'AKS', port: 4182, tanim: 'ui-akis' },
    tolga: { kod: 'KRC', port: 4183, tanim: 'ui-kirici' },
    ece: { kod: 'ERS', port: 4184, tanim: 'ui-erisim' },
};

/** Pilot verisinin kurgusal personaları */
export const PERSONALAR = {
    ahmet: { role: 'mudur', personId: 'p21', ad: 'Ahmet Şahin (Müdür)' },
    elif: { role: 'py', personId: 'p13', ad: 'Elif Yılmaz (PY, ATLAS)' },
    burak: { role: 'py', personId: 'p14', ad: 'Burak Demir (PY, PUSULA/NEHİR)' },
    selin: { role: 'bolum_sorumlu', personId: 'p01', ad: 'Selin Kaya (Bölüm Sorumlusu)' },
    mert: { role: 'pyb_destek', personId: 'p23', ad: 'Mert Aydın (PYB Destek)' },
};

export const RENK_TEMALARI = ['classic', 'emerald', 'purple', 'orange'];

export const EKRANLAR = {
    masaustu: { width: 1440, height: 900 },
    dizustu: { width: 1280, height: 800 },
    kirilim: { width: 1024, height: 768 },
    kirilimAlti: { width: 1023, height: 768 },
    tablet: { width: 768, height: 1024 },
    telefon: { width: 375, height: 812 },
    yakin200: { width: 640, height: 400 }, // 1280×800 ekranın %200 yakınlaştırılmışı
};

/** Klasik ve modern arayüzde gezinme düğmelerinin adları (scripts/demo-yolu.mjs ile aynı) */
export const R = {
    yonetim: /^Yönetim(\s|$)/i,
    portfoy: /^Portföy(\s|$)/i,
    tahsis: /^(Tahsis|Ekip ve tahsis)(\s|$)/i,
    riskRaporu: /^(Riskler|Risk raporu)(\s|\d|$)/i,
    haftalik: /^Haftalık rapor/i,
    takvim: /^Takvim$/i,
    gorusmeler: /^Görüşmeler/i,
    beklentiler: /^Beklentiler/i,
    veriHavuzu: /^Veri havuzu$/i,
    ayarlar: /^Ayarlar$/i,
    pano: /^(Pano|Genel bakış)$/i,
    gorevler: /^(Görevler|Liste)$/i,
    projeRiskleri: /^Riskler$/i,
};

const fail = msg => { throw new Error(msg); };

/* ---------------- Veri ---------------- */

/** Veri seti: 'pilot' | 'bos' | 'asiri' (ui-testi/<gün>/veri/<ad>/workspace.json) ya da dosya yolu */
export const veri = (ad = 'pilot', g = gun()) => {
    const file = /[\\/]|\.json$/.test(ad) ? resolve(ad) : join(KOK_DIZIN(g), 'veri', ad, 'workspace.json');
    if (!existsSync(file)) fail(`Veri seti yok: ${file} (önce: node scripts/ui-test/hazirla.mjs)`);
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const ws = raw.workspace && raw.workspace.projects ? raw.workspace : raw;
    if (!Array.isArray(ws.projects)) fail(`${file} bir çalışma alanı değil.`);
    return ws;
};

/** Çalışma alanını uygulamanın IndexedDB deposuna yazar (App.tsx açılışında okunur) */
export const seed = (page, ws) => page.evaluate(async ws => {
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

/** IndexedDB'deki çalışma alanını okur (kalıcılık denetimi için) */
export const depoOku = page => page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const o = indexedDB.open('planasistan', 1); o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); });
    if (!db.objectStoreNames.contains('workspace')) return null;
    const out = await new Promise((res, rej) => {
        const tx = db.transaction('workspace', 'readonly');
        const s = tx.objectStore('workspace');
        const keys = s.getAllKeys(); const vals = s.getAll();
        tx.oncomplete = () => res(Object.fromEntries(keys.result.map((k, i) => [k, vals.result[i]])));
        tx.onerror = () => rej(tx.error);
    });
    db.close();
    return out;
});

/* ---------------- Altyapı ---------------- */

export const derle = (zorla = false) => {
    if (existsSync(join(ROOT, 'dist', 'index.html')) && !zorla) return;
    process.stderr.write('Uygulama derleniyor (vite build)…\n');
    const r = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    if (r.status !== 0) fail('vite build başarısız.');
};

/** Önizleme sunucusu; port zaten yanıt veriyorsa onu kullanır (kapatmaz) */
export const sunucuAc = async port => {
    const url = `http://127.0.0.1:${port}/`;
    try { if ((await fetch(url)).ok) return { url, kapat: () => {} }; } catch { /* kapalı */ }
    if (!existsSync(join(ROOT, 'dist', 'index.html'))) fail('dist/ yok: önce node scripts/ui-test/hazirla.mjs');
    const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', detached: true });
    const kapat = () => { try { process.kill(-srv.pid); } catch { /* kapandı */ } };
    process.on('exit', kapat);
    for (let i = 0; i < 80; i++) {
        try { if ((await fetch(url)).ok) return { url, kapat }; } catch { /* henüz açılmadı */ }
        await new Promise(r => setTimeout(r, 250));
    }
    kapat();
    return fail(`Önizleme sunucusu açılmadı (${url}).`);
};

export const chromiumYolu = () => [process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium'].find(p => p && existsSync(p));

/** Vekil arkasında tarayıcı da vekili kullanır; yerel önizleme sunucusu vekilden geçmez */
export const vekilBayraklari = () => {
    const server = process.env.HTTPS_PROXY || process.env.https_proxy;
    return server ? [`--proxy-server=${server}`, '--proxy-bypass-list=127.0.0.1;localhost'] : ['--no-proxy-server'];
};

export const tarayiciAc = async () => {
    const { chromium } = await import('playwright-core');
    const yol = chromiumYolu();
    return chromium.launch({ ...(yol ? { executablePath: yol } : {}), args: vekilBayraklari() });
};

/** Ajan çıktı dizini: ui-testi/<gün>/<ajan>/ (ekran/ dahil) */
export const ciktiDizini = (ajan, g = gun()) => {
    const d = join(KOK_DIZIN(g), ajan);
    mkdirSync(join(d, 'ekran'), { recursive: true });
    return d;
};

/**
 * Koşu: sunucu + tarayıcı. oturum() her çağrıda yeni, yalıtılmış bir tarayıcı bağlamı açar.
 *
 * Koşul alanları (hepsi isteğe bağlı):
 *   veri      'pilot' | 'bos' | 'asiri' | dosya yolu | çalışma alanı nesnesi  (varsayılan 'pilot')
 *   arayuz    'modern' | 'classic'                    (settings.uiStyle)
 *   sistem    'light' | 'dark'                        (işletim sistemi tercihi, prefers-color-scheme)
 *   gece      true | false                            (uygulamanın Gece/Gündüz ayarı, settings.isDarkMode)
 *   renk      'classic' | 'emerald' | 'purple' | 'orange'  (settings.theme)
 *   persona   'ahmet' | 'elif' | 'burak' | 'selin' | 'mert'
 *   proje     proje kimliği ya da ad/kod başı ('NEHİR', 'prj-nehir') → activeProjectId; modern arayüzde
 *             proje ayrıca tıklanıp açılır (projeAc: false ile kapatılır)
 *   ekran     EKRANLAR anahtarı ya da { width, height }
 *   mobil     true → isMobile + hasTouch
 *   hareket   'reduce' | 'no-preference'
 *   zorluRenk 'active' | 'none'                       (forced-colors)
 *   ayarlar   settings'e eklenecek başka alanlar
 *   bekle     false → hazır olmayı bekleme (çökme testleri için)
 */
export const baslat = async (ajan, { port } = {}) => {
    const a = AJANLAR[ajan];
    const dizin = ciktiDizini(ajan);
    const sunucu = await sunucuAc(port || a?.port || 4190);
    const browser = await tarayiciAc();
    const oturum = async (k = {}) => {
        const ws0 = typeof k.veri === 'object' && k.veri ? k.veri : veri(k.veri || 'pilot');
        const ekran = typeof k.ekran === 'string' ? EKRANLAR[k.ekran] : (k.ekran || EKRANLAR.masaustu);
        const ctx = await browser.newContext({
            viewport: ekran,
            locale: 'tr-TR',
            timezoneId: 'Europe/Istanbul',
            colorScheme: k.sistem || 'light',
            reducedMotion: k.hareket || 'no-preference',
            forcedColors: k.zorluRenk || 'none',
            ...(k.mobil ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
        });
        const page = await ctx.newPage();
        const hatalar = [];
        const disKaynak = new Set();
        const dis = u => !u.startsWith(sunucu.url) && /^https?:/.test(u);
        page.on('pageerror', e => hatalar.push(`sayfa: ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) hatalar.push(`konsol: ${m.text().slice(0, 300)}`); });
        page.on('requestfailed', q => { if (dis(q.url())) disKaynak.add(new URL(q.url()).host); });
        const diyaloglar = [];
        page.on('dialog', d => { diyaloglar.push(`${d.type()}: ${d.message().slice(0, 200)}`); d.dismiss().catch(() => {}); });
        const p = PERSONALAR[k.persona || 'burak'];
        const proje = k.proje && ws0.projects.find(x => x.id === k.proje || (x.code || '').startsWith(k.proje) || (x.name || '').startsWith(k.proje));
        const ws = {
            ...ws0,
            ...(p ? { currentRole: p.role, currentPersonId: p.personId } : {}),
            ...(proje ? { activeProjectId: proje.id } : {}),
            settings: {
                ...(ws0.settings || {}),
                uiStyle: k.arayuz === 'classic' ? 'classic' : 'modern',
                ...(k.renk ? { theme: k.renk } : {}),
                ...(k.gece !== undefined ? { isDarkMode: !!k.gece } : {}),
                ...(k.ayarlar || {}),
            },
        };
        // Veri, uygulama hiç çalışmadan aynı kökenli boş bir sayfada yüklenir: uygulamanın ilk
        // açılışta yazdığı örnek proje, yüklenen veriyi ezmesin (boş veri setinde yarış vardı)
        const bosSayfa = `${sunucu.url}__ui-test-yukle`;
        await page.route(bosSayfa, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>ui-test</title>' }));
        await page.goto(bosSayfa);
        await seed(page, ws);
        await page.unroute(bosSayfa);
        await page.goto(sunucu.url);
        if (k.bekle !== false) await hazirBekle(page);
        // Modern arayüz açılışta Portföy'ü gösterir: istenen proje varsa kenar çubuğundan ya da listeden açılır
        if (proje && k.projeAc !== false && k.bekle !== false && ws.settings.uiStyle === 'modern') {
            await tikla(page, [new RegExp(`^${proje.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)]).catch(() => null);
        }
        // IndexedDB'nin açılışta yeniden kurulmasından doğan yarış hataları bulgu değildir
        for (let i = hatalar.length - 1; i >= 0; i--) if (/IndexedDB|indexedDB/.test(hatalar[i])) hatalar.splice(i, 1);
        return { ctx, page, hatalar, diyaloglar, disKaynak, kosul: { ...k, ekran }, kapat: () => ctx.close() };
    };
    const bitir = async () => { await browser.close().catch(() => {}); sunucu.kapat(); };
    return { ajan, dizin, url: sunucu.url, browser, oturum, bitir };
};

/** Uygulamanın açıldığını bekler: gezinme ya da ana bölge görünür olsun */
export const hazirBekle = async (page, ms = 15000) => {
    await page.locator('nav, [role="navigation"], header, main').first().waitFor({ timeout: ms }).catch(() => {});
    await page.waitForTimeout(700);
};

/** Seçeneklerden görünür ilk düğmeyi (menü öğesi, sekme, bağlantı) tıklar; tıklananı döner, yoksa null */
export const tikla = async (page, secenekler, { bekle = 500 } = {}) => {
    for (const re of [].concat(secenekler)) {
        for (const role of ['button', 'menuitem', 'tab', 'link']) {
            const loc = page.getByRole(role, { name: re });
            const n = await loc.count();
            for (let i = 0; i < n; i++) {
                const el = loc.nth(i);
                if (await el.isVisible()) { await el.click(); await page.waitForTimeout(bekle); return String(re); }
            }
        }
    }
    return null;
};

const TR_ASCII = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
export const slug = s => String(s).toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, c => TR_ASCII[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Ekran görüntüsü: <dizin>/ekran/<ad>.png; yolu döner (Read ile açıp bakın) */
export const foto = async (page, dizin, ad, { tam = false, oge } = {}) => {
    mkdirSync(join(dizin, 'ekran'), { recursive: true });
    const yol = join(dizin, 'ekran', `${slug(ad)}.png`);
    if (oge) await page.locator(oge).first().screenshot({ path: yol });
    else await page.screenshot({ path: yol, fullPage: tam });
    return yol;
};

/* ---------------- Görsel süzgeçler ---------------- */

const CB = {
    protanopi: '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0',
    deuteranopi: '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0',
    tritanopi: '1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0',
};

/**
 * Sayfaya geçici süzgeç: 'bulanik' (göz kısma), 'gri', 'protanopi', 'deuteranopi', 'tritanopi', null (kaldır).
 * Süzgeç html'e uygulanır; ekran görüntüsünden sonra süzgec(page, null) ile kaldırın.
 */
export const suzgec = (page, tur, { piksel = 6 } = {}) => page.evaluate(({ tur, piksel, CB }) => {
    document.getElementById('ui-test-suzgec')?.remove();
    document.getElementById('ui-test-svg')?.remove();
    if (!tur) return;
    let filter;
    if (tur === 'bulanik') filter = `blur(${piksel}px)`;
    else if (tur === 'gri') filter = 'grayscale(1)';
    else if (CB[tur]) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'ui-test-svg';
        svg.setAttribute('style', 'position:absolute;width:0;height:0');
        svg.innerHTML = `<filter id="ui-test-cb" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${CB[tur]}"/></filter>`;
        document.body.appendChild(svg);
        filter = 'url(#ui-test-cb)';
    } else throw new Error(`Bilinmeyen süzgeç: ${tur}`);
    const st = document.createElement('style');
    st.id = 'ui-test-suzgec';
    st.textContent = `html { filter: ${filter} !important; }`;
    document.head.appendChild(st);
}, { tur, piksel, CB });

/* ---------------- Ölçümler (sayfa içinde çalışır) ---------------- */

// Sayfa içinde eval edilen ortak yardımcılar: renk ayrıştırma, göreli parlaklık, etkin zemin
const SAYFA_YARDIMCI = `(() => {
  const parse = s => { const m = String(s).match(/[\\d.]+/g); if (!m) return null; const [r,g,b,a] = m.map(Number); return { r, g, b, a: a === undefined ? 1 : a }; };
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, under) => { const a = top.a + under.a * (1 - top.a); if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }; return { r: (top.r * top.a + under.r * under.a * (1 - top.a)) / a, g: (top.g * top.a + under.g * under.a * (1 - top.a)) / a, b: (top.b * top.a + under.b * under.a * (1 - top.a)) / a, a }; };
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const bgOf = el => { const stack = []; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } } let base = { r: 255, g: 255, b: 255, a: 1 }; const html = parse(getComputedStyle(document.documentElement).backgroundColor); if (html && html.a > 0 && !stack.length) base = over(html, base); for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base); return base; };
  const visible = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const path = el => { const p = []; for (let e = el; e && e.nodeType === 1 && p.length < 4; e = e.parentElement) { let s = e.tagName.toLowerCase(); if (e.id) s += '#' + e.id; const cls = [...e.classList].filter(c => !c.includes(':')).slice(0, 3); if (cls.length) s += '.' + cls.join('.'); p.unshift(s); } return p.join(' > '); };
  const name = el => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('placeholder') || el.value || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
  return { parse, lum, ratio, over, hex, bgOf, visible, path, name };
})()`;

/**
 * Metin kontrastı: görünür metinlerden eşiğin altında kalanlar (normal 4,5:1, büyük 3:1).
 * Saydam zeminler ata öğelerle birleştirilir; arka plan görseli/degrade hesaba katılmaz.
 */
export const kontrastTara = (page, { kok = 'body', sinir = 150 } = {}) => page.evaluate(({ kok, sinir, Y }) => {
    const { parse, ratio, over, hex, bgOf, visible, path, name } = eval(Y); // eslint-disable-line no-eval
    const out = []; const seen = new Set();
    const walker = document.createTreeWalker(document.querySelector(kok) || document.body, NodeFilter.SHOW_TEXT);
    let n; let toplam = 0;
    while ((n = walker.nextNode())) {
        const t = n.textContent.trim(); if (!t) continue;
        const el = n.parentElement; if (!el || seen.has(el) || !visible(el)) continue;
        seen.add(el); toplam++;
        const s = getComputedStyle(el);
        const fg0 = parse(s.color); if (!fg0) continue;
        const bg = bgOf(el); const fg = over(fg0, bg);
        const size = parseFloat(s.fontSize); const bold = Number(s.fontWeight) >= 700;
        const buyuk = size >= 24 || (bold && size >= 18.66);
        const r = ratio(fg, bg); const gerek = buyuk ? 3 : 4.5;
        if (r < gerek) out.push({ metin: t.slice(0, 50), oran: Math.round(r * 100) / 100, gerek, yazi: hex(fg), zemin: hex(bg), boyut: size, yol: path(el) });
    }
    out.sort((a, b) => a.oran - b.oran);
    return { taranan: toplam, kalan: out.length, ornekler: out.slice(0, sinir) };
}, { kok, sinir, Y: SAYFA_YARDIMCI });

/**
 * Yüzey ayrımı: zemini atasından farklı olan büyük bölgeler (kart, kenar çubuğu, pencere…)
 * için bölge/ata zemin kontrastı, kenarlık ve gölge. Karar vermez, şüpheli bölgeleri listeler:
 * kontrast < esik ve görünür kenarlık yoksa "zayif: true".
 */
export const yuzeyAyrimi = (page, { esik = 1.3, minGen = 120, minYuk = 48, sinir = 80 } = {}) => page.evaluate(({ esik, minGen, minYuk, sinir, Y }) => {
    const { parse, ratio, over, hex, bgOf, visible, path, name } = eval(Y); // eslint-disable-line no-eval
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width < minGen || r.height < minYuk || !visible(el)) continue;
        const s = getComputedStyle(el);
        const own = parse(s.backgroundColor);
        if (!own || own.a === 0) continue;
        const ici = bgOf(el); const disi = el.parentElement ? bgOf(el.parentElement) : { r: 255, g: 255, b: 255, a: 1 };
        const zemin = ratio(ici, disi);
        if (zemin === 1 && s.boxShadow === 'none' && !parseFloat(s.borderTopWidth)) continue; // görünmez katman
        const bw = Math.max(...['Top', 'Right', 'Bottom', 'Left'].map(k => parseFloat(s[`border${k}Width`]) || 0));
        const bc = parse(s.borderTopColor) || { r: 0, g: 0, b: 0, a: 0 };
        const kenarlik = bw > 0 && bc.a > 0 ? Math.round(Math.max(ratio(over(bc, disi), disi), ratio(over(bc, ici), ici)) * 100) / 100 : 0;
        const golge = s.boxShadow !== 'none';
        const zayif = zemin < esik && kenarlik < 1.3;
        out.push({ yol: path(el), boyut: `${Math.round(r.width)}×${Math.round(r.height)}`, konum: `${Math.round(r.x)},${Math.round(r.y)}`, zemin: hex(ici), disZemin: hex(disi), zeminKontrast: Math.round(zemin * 100) / 100, kenarlikKontrast: kenarlik, golge, zayif });
    }
    const zayiflar = out.filter(x => x.zayif);
    return { bolge: out.length, zayif: zayiflar.length, ornekler: zayiflar.slice(0, sinir) };
}, { esik, minGen, minYuk, sinir, Y: SAYFA_YARDIMCI });

/** Kök öğenin durumu: sınıflar, tema değişkenleri, gövde zemini, sistem tercihi */
export const kokDurum = page => page.evaluate(() => {
    const h = document.documentElement; const cs = getComputedStyle(h);
    const root = document.querySelector('.ui-modern') || h; const rs = getComputedStyle(root);
    const v = k => rs.getPropertyValue(k).trim() || cs.getPropertyValue(k).trim();
    return {
        htmlSinif: h.className,
        modernKok: root === h ? null : root.className,
        sistemKoyu: matchMedia('(prefers-color-scheme: dark)').matches,
        govdeZemin: getComputedStyle(document.body).backgroundColor,
        govdeYazi: getComputedStyle(document.body).color,
        degiskenler: Object.fromEntries(['--m-bg', '--m-surface', '--m-fill', '--m-sep', '--m-label', '--m-label-3', '--m-accent', '--app-primary'].map(k => [k, v(k)])),
        temaRengi: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    };
});

/** Taşma: içeriği kutusundan taşan ve kaydırılamayan öğeler + sayfanın yatay kaydırması */
export const tasmaTara = (page, { sinir = 60 } = {}) => page.evaluate(({ sinir, Y }) => {
    const { parse, ratio, over, hex, bgOf, visible, path, name } = eval(Y); // eslint-disable-line no-eval
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
        if (!visible(el) || el.closest('svg')) continue;
        const s = getComputedStyle(el);
        if (['auto', 'scroll'].includes(s.overflowX)) continue;
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && el.children.length === 0) {
            out.push({ yol: path(el), metin: (el.innerText || '').trim().slice(0, 50), kutu: el.clientWidth, icerik: el.scrollWidth, kirpma: s.overflowX, ucNokta: s.textOverflow === 'ellipsis' });
        }
    }
    return { sayfaYatayKaydirma: document.documentElement.scrollWidth > innerWidth + 1, sayfaGenislik: document.documentElement.scrollWidth, pencere: innerWidth, ornekler: out.slice(0, sinir), toplam: out.length };
}, { sinir, Y: SAYFA_YARDIMCI });

/** Dokunma hedefleri: görünür etkileşimli öğelerden min×min px altında kalanlar */
export const dokunmaHedefleri = (page, { min = 44, sinir = 80 } = {}) => page.evaluate(({ min, sinir, Y }) => {
    const { parse, ratio, over, hex, bgOf, visible, path, name } = eval(Y); // eslint-disable-line no-eval
    const out = []; let toplam = 0; let ekranDisi = 0;
    for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=menuitem], [role=checkbox], [role=switch], [tabindex]:not([tabindex="-1"])')) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        // Ekranın yatayda dışında kalanlar (ör. kapalı çekmece) hedef değildir; ayrıca sayılır
        if (r.right <= 0 || r.left >= innerWidth) { ekranDisi++; continue; }
        toplam++;
        if (r.width < min || r.height < min) out.push({ ad: name(el), etiket: el.tagName.toLowerCase(), boyut: `${Math.round(r.width)}×${Math.round(r.height)}`, yol: path(el), alt24: r.width < 24 || r.height < 24 });
    }
    return { toplam, ekranDisi, kucuk: out.length, alt24: out.filter(x => x.alt24).length, ornekler: out.slice(0, sinir) };
}, { min, sinir, Y: SAYFA_YARDIMCI });

/** Adsız düğme/bağlantılar ve etiketsiz giriş alanları (ekran okuyucu ne okur?) */
export const adsizOgeler = page => page.evaluate(({ Y }) => {
    const { parse, ratio, over, hex, bgOf, visible, path, name } = eval(Y); // eslint-disable-line no-eval
    const ad = el => (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(' ').map(id => document.getElementById(id)?.innerText || '').join(' ') || el.innerText || el.getAttribute('title') || el.querySelector('img[alt]')?.alt || el.querySelector('svg title')?.textContent || '').trim();
    const dugme = [...document.querySelectorAll('button, a[href], [role=button], [role=menuitem], [role=tab]')].filter(visible).filter(el => !ad(el)).map(el => ({ yol: path(el), html: el.outerHTML.slice(0, 120) }));
    const alan = [...document.querySelectorAll('input:not([type=hidden]):not([type=button]):not([type=submit]), select, textarea')].filter(visible).filter(el => !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !(el.labels && el.labels.length)).map(el => ({ yol: path(el), yerTutucu: el.getAttribute('placeholder') || '', tur: el.type || el.tagName.toLowerCase() }));
    const basliklar = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role=heading]')].filter(visible).map(el => `${el.tagName.toLowerCase()}${el.getAttribute('aria-level') ? '@' + el.getAttribute('aria-level') : ''}: ${name(el)}`);
    const canli = [...document.querySelectorAll('[aria-live], [role=status], [role=alert]')].map(el => `${el.getAttribute('role') || ''}${el.getAttribute('aria-live') ? ' live=' + el.getAttribute('aria-live') : ''}: ${name(el)}`);
    return { adsizDugme: dugme.slice(0, 60), adsizDugmeSayisi: dugme.length, etiketsizAlan: alan.slice(0, 60), etiketsizAlanSayisi: alan.length, basliklar, canliBolgeler: canli };
}, { Y: SAYFA_YARDIMCI });

/** Erişilebilirlik ağacının metin özeti (Playwright ariaSnapshot) */
export const ariaOzet = (page, kok = 'body') => page.locator(kok).first().ariaSnapshot();

/**
 * Yalnız klavye turu: adim kez Tab'a basar; her adımda odaklanan öğenin adı, rolü, konumu ve
 * odak göstergesi (outline / box-shadow). fotoDizin verilirse her adımda ekran görüntüsü alır.
 */
export const odakTuru = async (page, { adim = 40, tus = 'Tab', fotoDizin, onEk = 'odak' } = {}) => {
    const out = [];
    for (let i = 1; i <= adim; i++) {
        await page.keyboard.press(tus);
        await page.waitForTimeout(80);
        const o = await page.evaluate(({ Y }) => {
            const { parse, ratio, over, hex, bgOf, visible, path, name } = eval(Y); // eslint-disable-line no-eval
            const el = document.activeElement;
            if (!el || el === document.body) return { yok: true };
            const s = getComputedStyle(el); const r = el.getBoundingClientRect();
            const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}` : '';
            const oc = parse(s.outlineColor); const bg = bgOf(el.parentElement || el);
            return {
                ad: name(el), etiket: el.tagName.toLowerCase(), rol: el.getAttribute('role') || '', yol: path(el),
                konum: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`,
                ekranda: r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth,
                outline, golge: s.boxShadow !== 'none' ? s.boxShadow.slice(0, 80) : '',
                outlineKontrast: outline && oc ? Math.round(ratio(over(oc, bg), bg) * 100) / 100 : null,
            };
        }, { Y: SAYFA_YARDIMCI });
        o.sira = i;
        if (fotoDizin) o.ekran = await foto(page, fotoDizin, `${onEk}-${String(i).padStart(2, '0')}`);
        out.push(o);
    }
    return out;
};

/** Hata ve beyaz ekran denetimi: görünür metin çok azsa ya da gezinme kaybolduysa çökme şüphesi */
export const cokmeVarMi = page => page.evaluate(() => {
    const metin = (document.body.innerText || '').trim().length;
    const nav = !!document.querySelector('nav, [role="navigation"]');
    return { metinUzunlugu: metin, gezinme: nav, supheli: metin < 40 || !nav };
});
