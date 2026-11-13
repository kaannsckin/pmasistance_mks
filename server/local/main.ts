import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { createAiMiddleware } from '../ai/nodeAdapter';
import { handleIntegrationRequest, IntegrationRoute } from '../integrations/handler';
import { parseEnvFile } from './envFile';

/**
 * PlanAsistan yerel sürümü: arayüz ve sunucu (AI vekili, Jira / Teams /
 * e-posta entegrasyonları) tek süreçte, yalnız bu bilgisayardan erişilebilir
 * (127.0.0.1). Tek dosyalık çalıştırılabilir (exe) olarak paketlendiğinde
 * arayüz dosyaları exe'nin içindedir; ayarlar exe'nin yanındaki
 * `planasistan.env` dosyasından okunur.
 *
 *   PlanAsistan.exe                 → sunucuyu başlatır, tarayıcıyı açar
 *   PlanAsistan.exe --no-browser    → tarayıcı açılmaz
 *   PORT=5190 PlanAsistan.exe       → başka port (varsayılan 5180)
 *
 * Proje verisi tarayıcıda (adrese bağlı yerel depo) tutulur; bu yüzden port
 * sabittir: port değişirse tarayıcı verileri başka adreste arar.
 */

type Sea = { isSea: () => boolean; getAsset: (key: string) => ArrayBuffer };

const loadSea = (): Sea | null => {
    try {
        // node:sea yalnız Node 20+'da; paket dışında (node ile) çalışırken de güvenle denenir
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const sea = require('node:sea') as Sea;
        return sea.isSea() ? sea : null;
    } catch {
        return null;
    }
};

const sea = loadSea();
/** exe ise exe'nin klasörü; değilse çalışma klasörü */
const HOME = sea ? dirname(process.execPath) : process.cwd();
const DATA_DIR = join(HOME, 'planasistan-veri');
const ENV_FILE = join(HOME, 'planasistan.env');
/** Paket dışında çalışırken arayüz dosyalarının yeri */
const WEB_DIR = process.env.PLANASISTAN_WEB_DIR || join(process.cwd(), 'dist');
const DEFAULT_PORT = 5180;

const ENV_TEMPLATE = `# PlanAsistan yerel ayarları — değişiklikten sonra PlanAsistan'ı kapatıp yeniden açın.
# Satır başındaki # işaretini kaldırıp değeri yazın. Bu dosyada parola / jeton vardır: paylaşmayın.

# ---- Jira (kişisel erişim jetonu — PAT) ----
# JIRA_BASE_URL=https://jira.kurum.gov.tr
# JIRA_TOKEN=
# JIRA_ALLOWED_PROJECTS=MKS
# JIRA_ALLOW_UPDATE=1
# JIRA_ALLOW_CREATE=1

# ---- Yapay zekâ ----
# İki yol var (biri yeter):
#  a) Anahtarı buraya yazın:
# AI_PROVIDER=openai          # openai | azure | anthropic | gemini
# AI_API_KEY=
# AI_MODEL=
# AI_BASE_URL=                # kurum içi / Azure uç noktası gerekiyorsa
#  b) Uygulamada Yönetici konsolu → Yapay zekâ panelinden girin (şifreli olarak planasistan-veri klasörüne yazılır).

# ---- Vercel'deki panel ayarlarını ortak kullanmak (isteğe bağlı) ----
# Vercel'de AI ayarları panelden girildiyse Supabase'de şifreli durur. Aynı ayarları okumak için Vercel'deki
# üç değeri buraya yazın. DİKKAT: SUPABASE_SERVICE_ROLE_KEY veritabanının tam yetkili anahtarıdır; yalnız
# kendi bilgisayarınızda ve gerçekten gerekiyorsa kullanın (yoksa yukarıdaki a/b yolu yeterli).
# SUPABASE_URL=
# SUPABASE_SERVICE_ROLE_KEY=
# AI_CONFIG_SECRET=

# ---- Kurum ağı ----
# TÜBİTAK kök sertifikası uygulamada hazırdır. Başka bir kurum sertifikası gerekirse
# (Jira / AI adresinde TLS hatası) PEM dosyasının yolunu yazın:
# AI_CA_CERTS_FILE=C:/kurum/kok-sertifika.pem

# ---- Teams / e-posta (isteğe bağlı) ----
# TEAMS_WEBHOOK_URL=
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASS=
# SMTP_FROM=

# ---- Diğer ----
# PORT=5180
`;

const log = (msg: string) => console.log(`[PlanAsistan] ${msg}`);

/** İlk açılışta ayar şablonu ve veri klasörü; AI anahtarlarını şifreleyen gizli değer bir kez üretilir */
const prepareHome = (): Record<string, string> => {
    try { mkdirSync(DATA_DIR, { recursive: true }); } catch { /* salt-okunur klasör: aşağıda uyarılır */ }
    if (!existsSync(ENV_FILE)) {
        try { writeFileSync(ENV_FILE, ENV_TEMPLATE, 'utf8'); log(`Ayar dosyası oluşturuldu: ${ENV_FILE}`); } catch { /* yazılamadı */ }
    }
    const secretFile = join(DATA_DIR, 'gizli-anahtar.txt');
    let secret = '';
    try { secret = readFileSync(secretFile, 'utf8').trim(); } catch { /* ilk açılış */ }
    if (secret.length < 32) {
        secret = randomBytes(32).toString('hex');
        try { writeFileSync(secretFile, secret, { encoding: 'utf8', mode: 0o600 }); } catch { log('Uyarı: veri klasörüne yazılamadı; AI ayarları kalıcı olmayabilir.'); }
    }
    // Varsayılanlar: ayar dosyası bunları ezebilir (ör. Vercel'deki AI_CONFIG_SECRET ile ortak panel ayarları).
    // Yalnız bu bilgisayardan erişildiği için erişim koruması varsayılan olarak kapalı.
    return { AI_AUTH_MODE: 'none', AI_CONFIG_SECRET: secret, AI_SETTINGS_FILE: join(DATA_DIR, 'ai-settings.json') };
};

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
    '.wasm': 'application/wasm', '.map': 'application/json',
};

const readStatic = (rel: string): Buffer | null => {
    if (sea) {
        try { return Buffer.from(sea.getAsset(`web/${rel}`)); } catch { return null; }
    }
    const file = normalize(join(WEB_DIR, rel));
    if (!file.startsWith(normalize(WEB_DIR) + sep)) return null;
    try { return readFileSync(file); } catch { return null; }
};

const serveStatic = (req: IncomingMessage, res: ServerResponse) => {
    let rel = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname).replace(/^\/+/, '');
    if (rel.split('/').includes('..')) { res.statusCode = 400; res.end(); return; }
    let body = rel ? readStatic(rel) : null;
    // Tek sayfalı uygulama: bilinmeyen yollar (uzantısız) index.html'e düşer
    if (!body && !extname(rel)) { rel = 'index.html'; body = readStatic(rel); }
    if (!body) { res.statusCode = 404; res.end('Bulunamadı'); return; }
    res.setHeader('content-type', MIME[extname(rel).toLowerCase()] || 'application/octet-stream');
    // Adı özetli dosyalar değişmez; index.html her açılışta tazelenir
    res.setHeader('cache-control', rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    res.end(req.method === 'HEAD' ? undefined : body);
};

const INTEGRATION_ROUTES: IntegrationRoute[] = ['health', 'jira-worklogs', 'jira-issues', 'jira-create', 'jira-sync', 'notify', 'cron-reminder'];

const openBrowser = (url: string) => {
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
        : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    try { spawn(cmd, args as string[], { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' }).unref(); } catch { /* elle açılır */ }
};

/** Port doluysa: zaten açık bir PlanAsistan mı? */
const isPlanAsistan = async (url: string): Promise<boolean> => {
    try {
        const r = await fetch(`${url}/api/integrations/health`, { signal: AbortSignal.timeout(2000) });
        const j = await r.json() as { jira?: unknown };
        return typeof j.jira === 'boolean';
    } catch { return false; }
};

const waitForEnter = (): Promise<void> => new Promise(resolve => {
    if (!process.stdin.isTTY) { resolve(); return; }
    console.log('\nKapatmak için Enter tuşuna basın.');
    process.stdin.once('data', () => resolve());
});

export const main = async (): Promise<void> => {
    const defaults = prepareHome();
    // Her istekte okunur: ayar dosyası değişirse yeniden başlatmadan da geçerli olur (AI paneli dahil)
    const getEnv = (): Record<string, string | undefined> => {
        let file: Record<string, string> = {};
        try { file = parseEnvFile(readFileSync(ENV_FILE, 'utf8')); } catch { /* dosya yok */ }
        const env: Record<string, string | undefined> = { ...defaults, ...process.env, ...file };
        if (env.AI_CA_CERTS_FILE && !env.AI_CA_CERTS) {
            try { env.AI_CA_CERTS = readFileSync(env.AI_CA_CERTS_FILE, 'utf8'); } catch { log(`Sertifika dosyası okunamadı: ${env.AI_CA_CERTS_FILE}`); }
        }
        return env;
    };
    const initial = getEnv();

    const ai = createAiMiddleware(getEnv, { isDev: true });
    const integrations = createAiMiddleware(getEnv, {
        isDev: true,
        mountPath: '/api/integrations',
        handler: (request, env, opts) => {
            const route = new URL(request.url).pathname.split('/').pop() as IntegrationRoute;
            if (!INTEGRATION_ROUTES.includes(route)) return Promise.resolve(new Response('Not found', { status: 404 }));
            return handleIntegrationRequest(request, env, { route, isDev: opts.isDev });
        },
    });

    const server = createServer((req, res) => {
        const path = (req.url || '/').split('?')[0];
        // Yalnız bu bilgisayardan; başka sitenin tarayıcı üzerinden yerel sunucuya istek atması engellenir
        const host = (req.headers.host || '').toLowerCase();
        if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) { res.statusCode = 403; res.end('Yalnız yerel erişim.'); return; }
        const origin = req.headers.origin;
        if (origin && path.startsWith('/api/') && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) { res.statusCode = 403; res.end('Yalnız yerel erişim.'); return; }
        if (path.startsWith('/api/ai/') || path === '/api/ai') {
            (req as IncomingMessage & { originalUrl?: string }).originalUrl = req.url;
            void ai(req, res);
            return;
        }
        if (path.startsWith('/api/integrations/')) {
            (req as IncomingMessage & { originalUrl?: string }).originalUrl = req.url;
            void integrations(req, res);
            return;
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end(); return; }
        serveStatic(req, res);
    });

    const port = Number(initial.PORT) || DEFAULT_PORT;
    const url = `http://localhost:${port}`;
    const noBrowser = process.argv.includes('--no-browser');

    server.on('error', async (e: NodeJS.ErrnoException) => {
        if (e.code === 'EADDRINUSE') {
            if (await isPlanAsistan(url)) {
                log(`PlanAsistan zaten açık: ${url}`);
                if (!noBrowser) openBrowser(url);
                setTimeout(() => process.exit(0), 1500);
                return;
            }
            log(`${port} numaralı port başka bir program tarafından kullanılıyor. planasistan.env dosyasında PORT=5190 gibi başka bir port seçin.`);
        } else {
            log(`Sunucu başlatılamadı: ${e.message}`);
        }
        await waitForEnter();
        process.exit(1);
    });

    server.listen(port, '127.0.0.1', () => {
        const env = getEnv();
        console.log('');
        log(`Hazır: ${url}`);
        log(`Ayarlar: ${ENV_FILE}`);
        log(`Jira: ${env.JIRA_BASE_URL && (env.JIRA_TOKEN || env.JIRA_API_TOKEN) ? env.JIRA_BASE_URL : 'yapılandırılmadı (ayar dosyasına JIRA_BASE_URL ve JIRA_TOKEN yazın)'}`);
        log('Proje verileriniz bu bilgisayarda, tarayıcıda saklanır. Kapatmak için bu pencereyi kapatın.');
        console.log('');
        if (!noBrowser) openBrowser(url);
    });

    const stop = () => server.close(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
};

void main();
