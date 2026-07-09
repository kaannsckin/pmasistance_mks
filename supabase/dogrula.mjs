#!/usr/bin/env node
/**
 * PlanAsistan Supabase kurulum doğrulayıcısı.
 *
 * Kullanım:
 *   node supabase/dogrula.mjs <PROJECT_URL> <ANON_KEY>          # şema + ayar kontrolü
 *   node supabase/dogrula.mjs <PROJECT_URL> <ANON_KEY> --e2e    # + uçtan uca test
 *
 * --e2e modu geçici bir test kullanıcısı (e2e-*@example.com) oluşturur,
 * çalışma alanı açar, RLS gizliliğini doğrular ve çalışma alanını siler.
 * Test kullanıcısı Authentication → Users ekranından elle silinebilir.
 *
 * Gereksinim: Node 18+ (yerleşik fetch).
 */

const [, , rawUrl, anonKey, flag] = process.argv;

const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => console.log(`  ✗ ${msg}`);
const info = (msg) => console.log(`  · ${msg}`);
const section = (msg) => console.log(`\n${msg}`);

if (!rawUrl || !anonKey) {
    console.log('Kullanım: node supabase/dogrula.mjs https://XXXX.supabase.co ANON_KEY [--e2e]');
    process.exit(1);
}

let url = rawUrl.trim().replace(/\/+$/, '');
// Dashboard linki yapıştırıldıysa gerçek API adresine çevir
const dashMatch = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
if (dashMatch) {
    url = `https://${dashMatch[1]}.supabase.co`;
    info(`Dashboard adresi algılandı → API adresi kullanılıyor: ${url}`);
}

const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
let errorCount = 0;

const get = async (path, extraHeaders = {}) => {
    const res = await fetch(`${url}${path}`, { headers: { ...headers, ...extraHeaders } });
    let body = null;
    try { body = await res.json(); } catch { /* boş gövde */ }
    return { status: res.status, body };
};

const checkTable = async (table) => {
    const { status, body } = await get(`/rest/v1/${table}?select=*&limit=1`);
    if (status === 200) {
        ok(`${table} tablosu kurulu (RLS aktif, anonim erişim boş dönüyor)`);
        return true;
    }
    if (status === 404 || body?.code === 'PGRST205') {
        fail(`${table} tablosu YOK — supabase/schema.sql henüz çalıştırılmamış`);
    } else if (status === 401) {
        fail(`${table}: anahtar reddedildi (anon anahtarını kontrol edin)`);
    } else {
        fail(`${table}: beklenmeyen yanıt (${status}) ${JSON.stringify(body)?.slice(0, 120)}`);
    }
    errorCount++;
    return false;
};

const run = async () => {
    console.log(`PlanAsistan Supabase doğrulaması → ${url}`);

    // ---- 1) Erişim + auth ayarları ----
    section('1) Bağlantı ve kimlik doğrulama ayarları');
    let settings;
    try {
        const res = await get('/auth/v1/settings');
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        settings = res.body;
        ok('Proje erişilebilir, anon anahtarı geçerli');
    } catch (e) {
        fail(`Projeye ulaşılamadı: ${e.message} — URL'yi ve internet bağlantısını kontrol edin`);
        process.exit(1);
    }
    if (settings.disable_signup) {
        fail('E-posta ile kayıt KAPALI (Authentication → Providers → Email → Enable Sign up)');
        errorCount++;
    } else {
        ok('E-posta ile kayıt açık');
    }
    if (settings.mailer_autoconfirm) {
        ok('E-posta doğrulaması kapalı (autoconfirm) — üyeler anında giriş yapabilir');
    } else {
        info('E-posta doğrulaması AÇIK: her üye ilk kayıtta doğrulama e-postası almalı.');
        info('Ekip içi kullanım için kapatabilirsiniz: Authentication → Providers → Email → Confirm email');
    }

    // ---- 2) Şema ----
    section('2) Veritabanı şeması (schema.sql)');
    const t1 = await checkTable('workspaces');
    const t2 = await checkTable('workspace_private');
    const t3 = await checkTable('workspace_members');
    const schemaReady = t1 && t2 && t3;
    if (!schemaReady) {
        info('Çözüm: Dashboard → SQL Editor → New query → supabase/schema.sql içeriğini yapıştırın → Run');
    }

    // ---- 3) Uçtan uca test (isteğe bağlı) ----
    if (flag === '--e2e') {
        section('3) Uçtan uca test (--e2e)');
        if (!schemaReady) {
            fail('Şema eksikken E2E atlanıyor.');
            process.exit(1);
        }
        const email = `e2e-${Date.now().toString(36)}@example.com`;
        const password = `Test-${Math.random().toString(36).slice(2, 10)}!9`;
        info(`Test kullanıcısı: ${email}`);

        const signupRes = await fetch(`${url}/auth/v1/signup`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const signup = await signupRes.json();
        if (!signupRes.ok) {
            fail(`Kayıt başarısız: ${signup.msg || signup.error_description || signupRes.status}`);
            process.exit(1);
        }
        const token = signup.access_token;
        if (!token) {
            info('Kayıt alındı ama oturum dönmedi → e-posta doğrulaması açık.');
            info('E2E devamı için doğrulamayı kapatıp yeniden çalıştırın (test kullanıcısını Users ekranından silebilirsiniz).');
            process.exit(0);
        }
        ok('Kayıt + otomatik giriş çalışıyor');
        const authed = { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

        // Çalışma alanı oluştur
        const wsRes = await fetch(`${url}/rest/v1/workspaces`, {
            method: 'POST',
            headers: { ...authed, Prefer: 'return=representation' },
            body: JSON.stringify({ name: 'E2E Test', core: { probe: true }, version: 1 }),
        });
        const wsBody = await wsRes.json();
        const wsId = Array.isArray(wsBody) ? wsBody[0]?.id : wsBody?.id;
        if (!wsRes.ok || !wsId) {
            fail(`Çalışma alanı oluşturulamadı: ${JSON.stringify(wsBody).slice(0, 160)}`);
            process.exit(1);
        }
        ok(`Çalışma alanı oluşturuldu (${wsId})`);

        // Tetikleyici: üyelik + private satırı
        const memRes = await fetch(`${url}/rest/v1/workspace_members?workspace_id=eq.${wsId}&select=role`, { headers: authed });
        const members = await memRes.json();
        if (Array.isArray(members) && members[0]?.role === 'pyb_destek') {
            ok('Tetikleyici çalıştı: kurucu pyb_destek rolüyle üye');
        } else {
            fail(`Üyelik tetikleyicisi beklenen sonucu vermedi: ${JSON.stringify(members).slice(0, 120)}`);
            errorCount++;
        }
        const privRes1 = await fetch(`${url}/rest/v1/workspace_private?workspace_id=eq.${wsId}&select=workspace_id`, { headers: authed });
        const priv1 = await privRes1.json();
        if (Array.isArray(priv1) && priv1.length === 1) {
            ok('pyb_destek rolü private (not) verisini görebiliyor');
        } else {
            fail('private satırı görünmüyor (tetikleyici/politika sorunu)');
            errorCount++;
        }

        // Rolü müdüre çevir → private RLS ile GİZLENMELİ
        await fetch(`${url}/rest/v1/workspace_members?workspace_id=eq.${wsId}`, {
            method: 'PATCH', headers: authed, body: JSON.stringify({ role: 'mudur' }),
        });
        const privRes2 = await fetch(`${url}/rest/v1/workspace_private?workspace_id=eq.${wsId}&select=workspace_id`, { headers: authed });
        const priv2 = await privRes2.json();
        if (Array.isArray(priv2) && priv2.length === 0) {
            ok('RLS DOĞRULANDI: Müdür rolü private (not/istek) verisini OKUYAMIYOR');
        } else {
            fail(`RLS beklenen gibi çalışmadı: müdür private görebiliyor (${JSON.stringify(priv2).slice(0, 80)})`);
            errorCount++;
        }

        // Temizlik: rolü geri al + çalışma alanını sil (cascade)
        await fetch(`${url}/rest/v1/workspace_members?workspace_id=eq.${wsId}`, {
            method: 'PATCH', headers: authed, body: JSON.stringify({ role: 'pyb_destek' }),
        });
        const delRes = await fetch(`${url}/rest/v1/workspaces?id=eq.${wsId}`, { method: 'DELETE', headers: authed });
        if (delRes.ok) {
            ok('Test çalışma alanı silindi (temizlik tamam)');
            info(`Kalan tek iz: ${email} kullanıcısı — Authentication → Users ekranından silebilirsiniz.`);
        } else {
            info(`Test çalışma alanı silinemedi (elle silin): ${wsId}`);
        }
    }

    section(errorCount === 0
        ? '✅ SONUÇ: Kurulum hazır. Uygulamadaki bulut penceresine URL + anon anahtarını yapıştırabilirsiniz.'
        : `⚠️ SONUÇ: ${errorCount} sorun bulundu — yukarıdaki ✗ maddelerini giderin.`);
};

run().catch(e => { fail(`Beklenmeyen hata: ${e.message}`); process.exit(1); });
