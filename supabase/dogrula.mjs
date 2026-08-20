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
    if ((status === 401 || status === 403) && body?.code === '42501') {
        ok(`${table} tablosu kurulu (anon erişimi tamamen kapalı)`);
        return true;
    }
    if (status === 404 || body?.code === 'PGRST205') {
        fail(`${table} tablosu YOK — schema.sql/migration kurulumu eksik`);
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
    const t4 = await checkTable('workspace_normalization_state');
    const schemaReady = t1 && t2 && t3 && t4;
    if (!schemaReady) {
        info('Çözüm: SQL Editor içinde schema.sql, 0001, 0002 ve 0003 migration dosyalarını sırayla çalıştırın.');
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

        const coreDoc = {
            schemaVersion: 3,
            projects: [], people: [], departments: [], roleCatalog: [], titles: [],
            allocations: [], planLocks: [], snapshots: [], leaves: [], auditLog: [],
        };
        const privateDoc = { notes: {}, customerRequests: {} };

        // Çalışma alanı + normalize backfill atomik RPC ile oluştur
        const wsRes = await fetch(`${url}/rest/v1/rpc/create_workspace_v2`, {
            method: 'POST',
            headers: authed,
            body: JSON.stringify({
                workspace_name: 'E2E Test',
                core_doc: coreDoc,
                private_doc: privateDoc,
            }),
        });
        const wsBody = await wsRes.json();
        const wsId = wsBody?.id;
        if (!wsRes.ok || !wsId) {
            fail(`Çalışma alanı oluşturulamadı: ${JSON.stringify(wsBody).slice(0, 160)}`);
            process.exit(1);
        }
        ok(`Çalışma alanı oluşturuldu (${wsId})`);

        // Tetikleyici: üyelik + normalize state
        const memRes = await fetch(`${url}/rest/v1/workspace_members?workspace_id=eq.${wsId}&select=role`, { headers: authed });
        const members = await memRes.json();
        if (Array.isArray(members) && members[0]?.role === 'pyb_destek') {
            ok('Tetikleyici çalıştı: kurucu pyb_destek rolüyle üye');
        } else {
            fail(`Üyelik tetikleyicisi beklenen sonucu vermedi: ${JSON.stringify(members).slice(0, 120)}`);
            errorCount++;
        }
        const stateRes = await fetch(`${url}/rest/v1/workspace_normalization_state?workspace_id=eq.${wsId}&select=source_core_version`, { headers: authed });
        const state = await stateRes.json();
        if (Array.isArray(state) && state[0]?.source_core_version === 1) {
            ok('Normalize state oluşturuldu ve core sürümü 1 ile eşleşiyor');
        } else {
            fail(`Normalize state beklenen sonucu vermedi: ${JSON.stringify(state).slice(0, 120)}`);
            errorCount++;
        }

        // Transaction push → core + normalize sürüm birlikte 2 olmalı
        const pushRes = await fetch(`${url}/rest/v1/rpc/push_workspace_v2`, {
            method: 'POST', headers: authed,
            body: JSON.stringify({
                ws: wsId,
                expected_core_version: 1,
                core_doc: coreDoc,
                expected_private_version: 1,
                private_doc: privateDoc,
            }),
        });
        const push = await pushRes.json();
        if (pushRes.ok && push?.ok && push.coreVersion === 2) {
            ok('Transaction çift-yazma RPC çalıştı (core sürümü 2)');
        } else {
            fail(`Transaction push başarısız: ${JSON.stringify(push).slice(0, 160)}`);
            errorCount++;
        }

        // Normalize tablolar RLS kapsamıyla tek RPC snapshot'ında okunmalı.
        const pullRes = await fetch(`${url}/rest/v1/rpc/pull_workspace_v2`, {
            method: 'POST', headers: authed, body: JSON.stringify({ ws: wsId }),
        });
        const pull = await pullRes.json();
        if (pullRes.ok && pull?.ok && pull.coreVersion === 2
            && Array.isArray(pull.core?.projects)
            && pull.privateVisible === false
            && pull.privateDoc === null) {
            ok('Normalize read RPC çalıştı; RLS-kapsamlı core sürümü 2 döndü');
        } else {
            fail(`Normalize pull başarısız: ${JSON.stringify(pull).slice(0, 180)}`);
            errorCount++;
        }

        // Legacy core artık istemciye hiçbir rolde doğrudan açılmamalı.
        const coreRes = await fetch(`${url}/rest/v1/workspaces?id=eq.${wsId}&select=core`, { headers: authed });
        const coreBody = await coreRes.json();
        if ((coreRes.status === 401 || coreRes.status === 403) && coreBody?.code === '42501') {
            ok('Legacy core belgesine doğrudan istemci erişimi kapalı');
        } else {
            fail(`Legacy core doğrudan erişilebilir durumda: ${coreRes.status} ${JSON.stringify(coreBody).slice(0, 100)}`);
            errorCount++;
        }

        // Private uyumluluk tablosuna istemci erişimi tamamen kapalı olmalı.
        const privRes = await fetch(`${url}/rest/v1/workspace_private?workspace_id=eq.${wsId}&select=data`, { headers: authed });
        const privBody = await privRes.json();
        if ((privRes.status === 401 || privRes.status === 403) && privBody?.code === '42501') {
            ok('Private uyumluluk belgesine istemci erişimi kapalı');
        } else {
            fail(`Private tablo doğrudan erişilebilir durumda: ${privRes.status} ${JSON.stringify(privBody).slice(0, 100)}`);
            errorCount++;
        }

        // Temizlik: çalışma alanını sil (cascade)
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
