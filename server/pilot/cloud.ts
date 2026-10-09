import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { UserRole, WorkspaceData } from '../../types.js';
import { splitWorkspaceDoc } from '../../utils/cloudSync.js';
import { supabaseSource, WorkspaceSource } from '../mcp/source.js';
import type { AddCheck, PilotTarget } from './check.js';
import { fullName, Persona, PERSONAS, personById } from './world.js';

/**
 * Pilotun bulut modu: kurgusal birimin çalışma alanı Supabase'de durur.
 *
 *  - 1. rutin (Jira ajanı) sistem işi yapar: sunucu anahtarıyla (service role)
 *    çalışma alanını kurar, günleri ilerletir, not/istek ekler.
 *  - 2. rutinin beş kullanıcısı kendi pilot hesaplarıyla girer
 *    (pilot-<persona>@example.com); RLS ve üyelik rolleri gerçekte olduğu gibi
 *    uygulanır — müdür notları veritabanından da okuyamaz.
 *  - İzleyiciler (pilotu tarayıcıdan izleyen gerçek kullanıcılar) uygulamada
 *    kendi hesaplarıyla "Bağlan" der; e-postaları depoya yazılmaz.
 *
 * Gizli bilgiler yalnız ortam değişkenlerindedir: PILOT_SUPABASE_URL,
 * PILOT_SUPABASE_ANON_KEY, PILOT_SUPABASE_SERVICE_ROLE_KEY, PILOT_PASSWORD.
 * Depoda (pilot-data/bulut.json) yalnız çalışma alanı kimliği durur.
 */

export const PILOT_ENV_KEYS = ['PILOT_SUPABASE_URL', 'PILOT_SUPABASE_ANON_KEY', 'PILOT_SUPABASE_SERVICE_ROLE_KEY', 'PILOT_PASSWORD'] as const;

export interface PilotCloudConfig {
    url: string;
    anonKey: string;
    serviceKey: string;
    /** Tüm pilot hesaplarının parolası */
    password: string;
}

/** Anahtarın türü: eski JWT anahtarlarında role alanı, yenilerinde sb_publishable_ / sb_secret_ öneki */
const keyKind = (key: string): 'anon' | 'service' | 'unknown' => {
    if (key.startsWith('sb_publishable_')) return 'anon';
    if (key.startsWith('sb_secret_')) return 'service';
    try {
        const role = (JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString('utf8')) as { role?: string }).role;
        return role === 'anon' ? 'anon' : role === 'service_role' ? 'service' : 'unknown';
    } catch {
        return 'unknown';
    }
};

/**
 * Ortamdaki bulut ayarları. Eksik ve biçimce geçersiz değişkenler adıyla
 * bildirilir (değerler hiçbir mesajda yer almaz): kopyalanmamış yer tutucu,
 * boşluk / Türkçe karakter (HTTP başlığına giremez), yer değiştirmiş anahtarlar.
 */
export const cloudConfigFromEnv = (env: Record<string, string | undefined>): { config: PilotCloudConfig | null; missing: string[]; invalid: string[] } => {
    const v = (k: string) => env[k]?.trim() || '';
    const missing = PILOT_ENV_KEYS.filter(k => !v(k));
    const invalid: string[] = [];
    const placeholder = (x: string) => /^<.*>$/.test(x);
    const url = v('PILOT_SUPABASE_URL');
    if (url && !/^https:\/\/[^\s/<>]+\.[^\s/<>]+\/?$/.test(url)) invalid.push('PILOT_SUPABASE_URL (https://<proje>.supabase.co biçiminde olmalı)');
    const keyRule = (name: string, want: 'anon' | 'service') => {
        const key = v(name);
        if (!key) return;
        if (placeholder(key) || !/^[A-Za-z0-9_.-]{30,}$/.test(key)) {
            invalid.push(`${name} (Supabase anahtarı değil: panelden kopyalanan uzun, boşluksuz değer olmalı; yer tutucu metin kalmış olabilir)`);
            return;
        }
        const kind = keyKind(key);
        if (kind !== 'unknown' && kind !== want) invalid.push(`${name} (${want === 'anon' ? 'anon/publishable yerine gizli anahtar' : 'service_role/secret yerine herkese açık anahtar'} girilmiş)`);
    };
    keyRule('PILOT_SUPABASE_ANON_KEY', 'anon');
    keyRule('PILOT_SUPABASE_SERVICE_ROLE_KEY', 'service');
    const password = v('PILOT_PASSWORD');
    if (password && (placeholder(password) || password.length < 12)) invalid.push('PILOT_PASSWORD (yer tutucu metin kalmış ya da 12 karakterden kısa)');
    if (missing.length || invalid.length) return { config: null, missing, invalid };
    return { config: { url: url.replace(/\/$/, ''), anonKey: v('PILOT_SUPABASE_ANON_KEY'), serviceKey: v('PILOT_SUPABASE_SERVICE_ROLE_KEY'), password }, missing: [], invalid: [] };
};

/** Kullanıcıya gösterilecek ortam sorunu (yalnız değişken adları) */
export const cloudEnvProblem = (env: Record<string, string | undefined>): string => {
    const { missing, invalid } = cloudConfigFromEnv(env);
    return [missing.length ? `eksik: ${missing.join(', ')}` : '', invalid.length ? `geçersiz: ${invalid.join('; ')}` : ''].filter(Boolean).join(' · ');
};

/** Jira ajanının (çalışma alanı sahibi) ve personaların hesapları */
export const JIRA_AGENT = 'jira';
export const pilotEmail = (id: string): string => `pilot-${id}@example.com`;
export const PILOT_WORKSPACE_NAME = 'PlanAsistan Pilot (kurgusal birim)';

const ROLES: UserRole[] = ['mudur', 'pyb_sorumlu', 'pyb_destek', 'py', 'bolum_sorumlu'];

// ---------------------------------------------------------------------------
// İstemciler
// ---------------------------------------------------------------------------

export interface CloudClients {
    /** Sunucu anahtarlı istemci (RLS uygulanmaz) */
    service: () => SupabaseClient;
    /** Pilot hesabının istemcisi (anon anahtar + oturum; RLS uygulanır) */
    account: (email: string) => SupabaseClient;
}

/**
 * Oturum dosyada saklanır: `pilot arac` her çağrıda ayrı süreçtir; her seferinde
 * parolayla giriş Supabase'in giriş sınırına takılır. Dosya geçici klasördedir
 * (veri dalına girmez) ve yalnız sahibi okuyabilir.
 */
export const fileAuthStorage = (file: string) => {
    const read = (): Record<string, string> => {
        try { return JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>; } catch { return {}; }
    };
    const write = (m: Record<string, string>) => {
        mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
        const tmp = `${file}.${process.pid}.tmp`;
        writeFileSync(tmp, JSON.stringify(m), { mode: 0o600 });
        renameSync(tmp, file);
    };
    return {
        getItem: (k: string) => read()[k] ?? null,
        setItem: (k: string, v: string) => { const m = read(); m[k] = v; write(m); },
        removeItem: (k: string) => { const m = read(); if (k in m) { delete m[k]; write(m); } },
    };
};

const sessionFile = (url: string, email: string) =>
    join(tmpdir(), 'planasistan-pilot-oturum', `${createHash('sha1').update(`${url}|${email}`).digest('hex').slice(0, 12)}.json`);

export const supabaseClients = (cfg: PilotCloudConfig): CloudClients => {
    let service: SupabaseClient | null = null;
    const accounts = new Map<string, SupabaseClient>();
    return {
        service: () => {
            service ??= createClient(cfg.url, cfg.serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
            return service;
        },
        account: email => {
            let c = accounts.get(email);
            if (!c) {
                c = createClient(cfg.url, cfg.anonKey, {
                    auth: { storage: fileAuthStorage(sessionFile(cfg.url, email)), storageKey: 'planasistan-pilot', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
                });
                accounts.set(email, c);
            }
            return c;
        },
    };
};

// ---------------------------------------------------------------------------
// Hesaplar ve üyelikler (sunucu anahtarıyla)
// ---------------------------------------------------------------------------

/** E-posta → kullanıcı kimliği (küçük harf) */
export const usersByEmail = async (admin: SupabaseClient): Promise<Map<string, string>> => {
    const out = new Map<string, string>();
    for (let page = 1; page <= 50; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new Error(`Kullanıcılar listelenemedi: ${error.message} (PILOT_SUPABASE_SERVICE_ROLE_KEY doğru mu?)`);
        const users = (data?.users || []) as { id: string; email?: string }[];
        users.forEach(u => { if (u.email) out.set(u.email.toLowerCase(), u.id); });
        if (users.length < 1000) break;
    }
    return out;
};

/**
 * Jira ajanının ve beş personanın hesabını kurar (e-posta doğrulanmış sayılır,
 * e-posta gönderilmez). Var olanların parolası PILOT_PASSWORD'e eşitlenir.
 * Döner: hesap kimliği (jira, elif, …) → kullanıcı kimliği.
 */
export const ensurePilotUsers = async (admin: SupabaseClient, password: string): Promise<Record<string, string>> => {
    const known = await usersByEmail(admin);
    const out: Record<string, string> = {};
    for (const id of [JIRA_AGENT, ...PERSONAS.map(p => p.id)]) {
        const email = pilotEmail(id);
        const existing = known.get(email);
        if (existing) {
            const { error } = await admin.auth.admin.updateUserById(existing, { password, email_confirm: true });
            if (error) throw new Error(`${email} güncellenemedi: ${error.message}`);
            out[id] = existing;
            continue;
        }
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { pilot: true } });
        if (error || !data.user) throw new Error(`${email} oluşturulamadı: ${error?.message || 'bilinmeyen hata'}`);
        out[id] = data.user.id;
    }
    return out;
};

export interface Viewer { email: string; role: UserRole }

/** "a@x.com, b@y.com:py" → izleyiciler (varsayılan rol: pyb_destek, her şeyi görür) */
export const parseViewers = (spec: string | undefined): Viewer[] => {
    if (!spec?.trim()) return [];
    return spec.split(/[,;\s]+/).filter(Boolean).map(item => {
        const [email, role = 'pyb_destek'] = item.split(':');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`Geçersiz e-posta: ${email}`);
        if (!ROLES.includes(role as UserRole)) throw new Error(`Geçersiz rol (${email}): ${role}. Seçenekler: ${ROLES.join(', ')}`);
        return { email: email.toLowerCase(), role: role as UserRole };
    });
};

export interface MembershipReport {
    eklenen: { email: string; rol: UserRole }[];
    /** Uygulamada henüz kayıt olmamış izleyiciler (hesap açılmaz) */
    kayitsiz: string[];
}

/**
 * Personaların ve izleyicilerin üyeliklerini kurar / rolünü düzeltir.
 * İzleyici hesapları açılmaz: kişi önce uygulamadan kendisi kayıt olur.
 */
export const ensureMemberships = async (admin: SupabaseClient, workspaceId: string, users: Record<string, string>, viewers: Viewer[]): Promise<MembershipReport> => {
    const rows: { workspace_id: string; user_id: string; role: UserRole }[] = [];
    const report: MembershipReport = { eklenen: [], kayitsiz: [] };
    for (const p of PERSONAS) {
        if (!users[p.id]) continue;
        rows.push({ workspace_id: workspaceId, user_id: users[p.id], role: p.role });
        report.eklenen.push({ email: pilotEmail(p.id), rol: p.role });
    }
    if (viewers.length) {
        const known = await usersByEmail(admin);
        for (const v of viewers) {
            const id = known.get(v.email);
            if (!id) { report.kayitsiz.push(v.email); continue; }
            rows.push({ workspace_id: workspaceId, user_id: id, role: v.role });
            report.eklenen.push({ email: v.email, rol: v.role });
        }
    }
    if (rows.length) {
        const { error } = await admin.from('workspace_members').upsert(rows, { onConflict: 'workspace_id,user_id' });
        if (error) throw new Error(`Üyelikler yazılamadı: ${error.message}`);
    }
    return report;
};

export const listMembers = async (admin: SupabaseClient, workspaceId: string): Promise<{ email: string; rol: UserRole }[]> => {
    const { data, error } = await admin.from('workspace_members').select('user_id, role').eq('workspace_id', workspaceId);
    if (error) throw new Error(`Üyeler okunamadı: ${error.message}`);
    const emails = new Map([...(await usersByEmail(admin)).entries()].map(([e, id]) => [id, e]));
    return ((data || []) as { user_id: string; role: UserRole }[]).map(r => ({ email: emails.get(r.user_id) || r.user_id, rol: r.role }));
};

// ---------------------------------------------------------------------------
// Çalışma alanı (sunucu anahtarıyla)
// ---------------------------------------------------------------------------

/** Yeni pilot çalışma alanı; sahibi Jira ajanı. Tetikleyici sahibi pyb_destek üye yapar ve özel satırı açar. */
export const createPilotWorkspace = async (admin: SupabaseClient, ownerId: string, ws: WorkspaceData): Promise<string> => {
    const { core, privateDoc, projects } = splitWorkspaceDoc(ws);
    const { data, error } = await admin.from('workspaces').insert({ name: PILOT_WORKSPACE_NAME, core, version: 1, created_by: ownerId }).select('id').single();
    if (error || !data) throw new Error(`Çalışma alanı oluşturulamadı: ${error?.message || 'bilinmeyen hata'} (supabase/schema.sql çalıştırıldı mı?)`);
    const id = (data as { id: string }).id;
    if (projects.length) {
        const { error: pErr } = await admin.from('workspace_projects').insert(projects.map(p => ({ workspace_id: id, project_id: p.id, data: p, version: 1 })));
        if (pErr) throw new Error(`Projeler yazılamadı: ${pErr.message}`);
    }
    await writePrivate(admin, id, privateDoc, 0);
    return id;
};

const writePrivate = async (admin: SupabaseClient, id: string, doc: unknown, expected: number | undefined) => {
    if (expected !== undefined) {
        const { data, error } = await admin.from('workspace_private').update({ data: doc, version: expected + 1 }).eq('workspace_id', id).eq('version', expected).select('version');
        if (error) throw new Error(`Notlar yazılamadı: ${error.message}`);
        if (data && data.length) return;
    }
    // Tetikleyici satırı açmamışsa (eski şema) satır eklenir
    const { error } = await admin.from('workspace_private').insert({ workspace_id: id, data: doc, version: 1 });
    if (error) throw new Error(`Notlar yazılamadı: ${error.message}`);
};

/**
 * Var olan pilot çalışma alanının verisini baştan yazar (baslat --zorla):
 * kimlik ve üyelikler korunur, izleyiciler yeniden bağlanmak zorunda kalmaz.
 * Sürümler artırılır; tarayıcıda eski veriyle açık kalan bir oturum gönderim
 * yapamaz, önce "Buluttan Çek" der. Çalışma alanı yoksa false döner.
 */
export const replacePilotWorkspace = async (admin: SupabaseClient, id: string, ws: WorkspaceData): Promise<boolean> => {
    const { data: row, error } = await admin.from('workspaces').select('version').eq('id', id).maybeSingle();
    if (error) throw new Error(`Çalışma alanı okunamadı: ${error.message}`);
    if (!row) return false;
    const { core, privateDoc, projects } = splitWorkspaceDoc(ws);
    const { data: oldRows, error: rErr } = await admin.from('workspace_projects').select('project_id, version').eq('workspace_id', id);
    if (rErr) throw new Error(`Projeler okunamadı: ${rErr.message}`);
    const old = new Map(((oldRows || []) as { project_id: string; version: number }[]).map(r => [r.project_id, r.version]));
    for (const p of projects) {
        const v = old.get(p.id);
        const { error: e } = v === undefined
            ? await admin.from('workspace_projects').insert({ workspace_id: id, project_id: p.id, data: p, version: 1 })
            : await admin.from('workspace_projects').update({ data: p, version: v + 1 }).eq('workspace_id', id).eq('project_id', p.id);
        if (e) throw new Error(`"${p.name}" yazılamadı: ${e.message}`);
    }
    const gone = [...old.keys()].filter(k => !projects.some(p => p.id === k));
    if (gone.length) {
        const { error: e } = await admin.from('workspace_projects').delete().eq('workspace_id', id).in('project_id', gone);
        if (e) throw new Error(`Eski projeler silinemedi: ${e.message}`);
    }
    const { error: cErr } = await admin.from('workspaces').update({ core, name: PILOT_WORKSPACE_NAME, version: (row as { version: number }).version + 1 }).eq('id', id);
    if (cErr) throw new Error(`Çalışma alanı yazılamadı: ${cErr.message}`);
    const { data: priv } = await admin.from('workspace_private').select('version').eq('workspace_id', id).maybeSingle();
    await writePrivate(admin, id, privateDoc, (priv as { version: number } | null)?.version);
    return true;
};

// ---------------------------------------------------------------------------
// Veri kaynakları
// ---------------------------------------------------------------------------

/** 1. rutinin kaynağı: sunucu anahtarı, önbelleksiz (her okuma güncel) */
export const serviceSource = (cfg: PilotCloudConfig, clients: CloudClients, workspaceId: string): WorkspaceSource =>
    supabaseSource({ url: cfg.url, email: '', password: '', workspaceId, service: true, ttlMs: 0 }, clients.service());

/** Personanın kaynağı: kendi pilot hesabı, RLS ve üyelik rolü geçerli */
export const personaSource = (cfg: PilotCloudConfig, clients: CloudClients, workspaceId: string, persona: Persona): WorkspaceSource =>
    supabaseSource({ url: cfg.url, email: pilotEmail(persona.id), password: cfg.password, workspaceId }, clients.account(pilotEmail(persona.id)));

// ---------------------------------------------------------------------------
// pilot-data/bulut.json
// ---------------------------------------------------------------------------

export interface CloudLink {
    workspaceId: string;
    /** Supabase projesinin adresi (kimlik bilgisi değildir; yanlış projeye bağlanmayı önler) */
    host: string;
    kuruldu: string;
}

export const cloudLinkPath = (dir: string) => join(dir, 'bulut.json');

export const readCloudLink = (dir: string): CloudLink | null => {
    try {
        const v = JSON.parse(readFileSync(cloudLinkPath(dir), 'utf8')) as CloudLink;
        return v.workspaceId ? v : null;
    } catch {
        return null;
    }
};

export const writeCloudLink = (dir: string, link: CloudLink) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(cloudLinkPath(dir), `${JSON.stringify(link, null, 2)}\n`);
};

export const hostOf = (url: string) => {
    try { return new URL(url).host; } catch { return url; }
};

// ---------------------------------------------------------------------------
// Kontroller ve araç çağrıları için hedef
// ---------------------------------------------------------------------------

const personaOf = (id: string): Persona => PERSONAS.find(p => p.id === id)!;

/** Hesabın oturumu yoksa parolayla açılır (kayıtlı oturum varsa yeniden kullanılır) */
const signedIn = async (cfg: PilotCloudConfig, clients: CloudClients, id: string): Promise<SupabaseClient> => {
    const c = clients.account(pilotEmail(id));
    const { data } = await c.auth.getSession();
    if (!data.session) {
        const { error } = await c.auth.signInWithPassword({ email: pilotEmail(id), password: cfg.password });
        if (error) throw new Error(`${pilotEmail(id)} girişi başarısız: ${error.message} (hesaplar için: pilot uyeler)`);
    }
    return c;
};

/**
 * Bulut hedefi: personalar kendi hesaplarıyla bağlanır, rolü üyelik belirler
 * (MCP ayarında rol verilmez — Claude Desktop'taki gerçek kullanım gibi).
 */
export const cloudTarget = (cfg: PilotCloudConfig, clients: CloudClients, workspaceId: string, jiraDir: string): PilotTarget => ({
    key: `supabase:${hostOf(cfg.url)}:${workspaceId}`,
    kind: 'supabase',
    jiraDir,
    source: persona => personaSource(cfg, clients, workspaceId, persona),
    explicitRole: false,
    readAll: async () => (await serviceSource(cfg, clients, workspaceId).load({ fresh: true })).ws,
    stdioEnv: p => ({
        PLANASISTAN_SUPABASE_URL: cfg.url,
        PLANASISTAN_SUPABASE_ANON_KEY: cfg.anonKey,
        PLANASISTAN_EMAIL: pilotEmail(p.id),
        PLANASISTAN_PASSWORD: cfg.password,
        PLANASISTAN_WORKSPACE_ID: workspaceId,
        PLANASISTAN_PERSON: fullName(personById(p.personId)),
    }),
    extraChecks: async (add: AddCheck) => {
        const admin = clients.service();
        const members = await listMembers(admin, workspaceId);
        const wrong = PERSONAS.map(p => ({ p, rol: members.find(m => m.email === pilotEmail(p.id))?.rol })).filter(x => x.rol !== x.p.role);
        add('bulut: persona üyelikleri ve rolleri', wrong.length === 0, wrong.length
            ? wrong.map(x => `${x.p.id}: ${x.rol || 'üye değil'} (beklenen ${x.p.role})`).join('; ')
            : `${PERSONAS.length} persona doğru rolde · çalışma alanında ${members.length} üye`);

        const { data: priv } = await admin.from('workspace_private').select('version').eq('workspace_id', workspaceId).maybeSingle();
        const ahmet = await signedIn(cfg, clients, personaOf('ahmet').id);
        const { data: aRead } = await ahmet.from('workspace_private').select('version').eq('workspace_id', workspaceId).maybeSingle();
        add('ahmet (müdür): notlar veritabanında okunamaz (RLS)', !aRead, aRead ? 'özel satır döndü — RLS politikası eksik!' : 'özel satır görünmüyor');
        // İçerik değiştirmeyen yazma denemesi: RLS bozuksa bile yalnız updated_at değişir
        const { data: aWrite } = await ahmet.from('workspace_private').update({ version: (priv as { version: number } | null)?.version ?? 0 }).eq('workspace_id', workspaceId).select('version');
        add('ahmet (müdür): notlara yazamaz (RLS)', !aWrite?.length, aWrite?.length ? 'yazma kabul edildi — RLS politikası eksik!' : 'yazma reddedildi (0 satır)');
        const elif = await signedIn(cfg, clients, personaOf('elif').id);
        const { data: eRead } = await elif.from('workspace_private').select('version').eq('workspace_id', workspaceId).maybeSingle();
        add('elif (PY): notlar veritabanından okunur', !!eRead, eRead ? `özel belge sürüm ${(eRead as { version: number }).version}` : 'özel satır görünmüyor — üyelik rolü yanlış olabilir');
    },
});
