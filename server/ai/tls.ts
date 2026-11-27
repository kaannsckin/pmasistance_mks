import * as tls from 'node:tls';
import { Agent, EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';
import { TUBITAK_CA_PEM } from './certs.js';
import { Env } from './config.js';

/**
 * Sağlayıcıya giden isteklerde ek güvenilir sertifikalar (kurumsal CA'lar).
 *
 *  - *.tubitak.gov.tr adreslerinde TÜBİTAK Kamu SM zinciri kendiliğinden eklenir
 *    (bkz. certs.ts — BİLGEM sunucusu ara sertifikayı göndermiyor).
 *  - AI_CA_CERTS: başka bir kurumsal CA için PEM metni (bir ya da birden çok
 *    sertifika; tek satırlık değerlerde "\n" kaçışları da kabul edilir).
 *
 * Ek sertifikalar Node.js'in kendi güven listesinin YERİNE değil YANINA konur
 * ve yalnızca bu isteklerde kullanılır; doğrulama hiçbir koşulda kapatılmaz.
 */

const PEM_BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

export const splitPem = (text: string | undefined): string[] =>
    (text || '').replace(/\\n/g, '\n').match(PEM_BLOCK)?.map(p => p.trim()) || [];

const isTubitakHost = (url: string): boolean => {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host === 'tubitak.gov.tr' || host.endsWith('.tubitak.gov.tr');
    } catch {
        return false;
    }
};

export const extraCaFor = (url: string, env: Env): string[] => {
    const certs = splitPem(env.AI_CA_CERTS);
    if (isTubitakHost(url)) certs.push(...splitPem(TUBITAK_CA_PEM));
    return [...new Set(certs)];
};

/** Varsayılan güven listesi (NODE_EXTRA_CA_CERTS dahil, Node ≥ 22.15) */
const defaultCas = (): string[] => {
    const get = (tls as { getCACertificates?: (type: string) => string[] }).getCACertificates;
    return get ? get('default') : [...tls.rootCertificates];
};

const fetchers = new Map<string, typeof fetch>();

const envValue = (env: Env, ...keys: string[]): string => {
    for (const k of keys) {
        const v = env[k]?.trim();
        if (v) return v;
    }
    return '';
};

/**
 * Vekil sunucu (HTTPS_PROXY / HTTP_PROXY, NO_PROXY). Kurum ağı internete
 * vekil sunucuyla çıkıyorsa Teams, Slack, Notion ve bulut AI istekleri ancak
 * bununla gider; NO_PROXY'deki (ör. kurum içi Jira) adreslere doğrudan gidilir.
 * Yalnız verilen ortamdan okunur (yerel sürümde planasistan.env de dahil).
 */
export const proxySettings = (env: Env): { httpsProxy: string; httpProxy: string; noProxy: string } | null => {
    const httpsProxy = envValue(env, 'HTTPS_PROXY', 'https_proxy');
    const httpProxy = envValue(env, 'HTTP_PROXY', 'http_proxy');
    if (!httpsProxy && !httpProxy) return null;
    return { httpsProxy, httpProxy, noProxy: envValue(env, 'NO_PROXY', 'no_proxy') };
};

/** url'ye istek atarken kullanılacak fetch — ek sertifika ve vekil gerekmiyorsa global fetch */
export const upstreamFetch = (url: string, env: Env): typeof fetch => {
    const extra = extraCaFor(url, env);
    const proxy = proxySettings(env);
    if (!extra.length && !proxy) return fetch;
    const key = JSON.stringify([extra, proxy]);
    let f = fetchers.get(key);
    if (!f) {
        const tlsOpts = extra.length ? { ca: [...defaultCas(), ...extra] } : undefined;
        // Boş dize verilir ki undici eksik değeri process.env'den tamamlamasın
        const dispatcher = proxy
            ? new EnvHttpProxyAgent({ ...proxy, ...(tlsOpts ? { connect: tlsOpts, requestTls: tlsOpts } : {}) })
            : new Agent({ connect: tlsOpts });
        f = ((input: string, init?: RequestInit) =>
            undiciFetch(input, { ...(init as object), dispatcher })) as unknown as typeof fetch;
        fetchers.set(key, f);
    }
    return f;
};

const CERT_CODES = new Set([
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID',
    'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_UNTRUSTED', 'CERT_SIGNATURE_FAILURE',
]);
const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN']);
const CONNECT_CODES = new Set([
    'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH',
    'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
]);

/** fetch'in fırlattığı hatadan kök neden kodu (TypeError → cause → AggregateError) */
export const networkErrorCode = (err: unknown): string | undefined => {
    let e = err as { code?: unknown; cause?: unknown; errors?: unknown[] } | undefined;
    for (let depth = 0; e && depth < 5; depth++) {
        if (typeof e.code === 'string' && e.code) return e.code;
        e = (e.cause ?? (Array.isArray(e.errors) ? e.errors[0] : undefined)) as typeof e;
    }
    return undefined;
};

/**
 * "AI sağlayıcısına ulaşılamadı: …" cümlesinin devamı — anahtar/içerik içermez.
 * setting: kontrol edilecek adres ayarı (ör. TEAMS_WEBHOOK_URL).
 */
export const describeNetworkError = (err: unknown, setting = 'AI_BASE_URL'): string => {
    if ((err as { name?: unknown } | undefined)?.name === 'TimeoutError') {
        return `sunucu zamanında yanıt vermedi; ${setting} adresini ve ağ erişimini kontrol edin`;
    }
    const code = networkErrorCode(err);
    const proxyHint = 'kurum ağı internete vekil sunucuyla çıkıyorsa HTTPS_PROXY tanımlayın';
    if (!code) return `ağ hatası; ${setting} adresini ve sunucunun bu ağdan erişilebilir olduğunu kontrol edin`;
    if (CERT_CODES.has(code)) {
        return `sunucunun TLS sertifikası doğrulanamadı (${code}); kurumsal sertifika zinciri için AI_CA_CERTS tanımlayın`;
    }
    if (DNS_CODES.has(code)) {
        return `alan adı çözümlenemedi (${code}); ${setting} yanlış olabilir, adres yalnızca kurum ağından erişilebilir olabilir ya da ${proxyHint}`;
    }
    if (CONNECT_CODES.has(code)) {
        return `bağlantı kurulamadı (${code}); sunucu bu ağdan (ör. Vercel'den) erişilebilir olmayabilir — kurum içi ağ ya da güvenlik duvarı; ${proxyHint}`;
    }
    return `ağ hatası (${code}); ${setting} ve ağ erişimini kontrol edin`;
};
