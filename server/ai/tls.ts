import * as tls from 'node:tls';
import { Agent, fetch as undiciFetch } from 'undici';
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

/** url'ye istek atarken kullanılacak fetch — ek sertifika gerekmiyorsa global fetch */
export const upstreamFetch = (url: string, env: Env): typeof fetch => {
    const extra = extraCaFor(url, env);
    if (!extra.length) return fetch;
    const key = extra.join('\n');
    let f = fetchers.get(key);
    if (!f) {
        const dispatcher = new Agent({ connect: { ca: [...defaultCas(), ...extra] } });
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

/** "AI sağlayıcısına ulaşılamadı: …" cümlesinin devamı — anahtar/içerik içermez */
export const describeNetworkError = (err: unknown): string => {
    const code = networkErrorCode(err);
    if (!code) return 'ağ hatası; AI_BASE_URL adresini ve sunucunun bu ağdan erişilebilir olduğunu kontrol edin';
    if (CERT_CODES.has(code)) {
        return `sunucunun TLS sertifikası doğrulanamadı (${code}); kurumsal sertifika zinciri için AI_CA_CERTS tanımlayın`;
    }
    if (DNS_CODES.has(code)) {
        return `alan adı çözümlenemedi (${code}); AI_BASE_URL yanlış olabilir ya da adres yalnızca kurum ağından erişilebilir`;
    }
    if (CONNECT_CODES.has(code)) {
        return `bağlantı kurulamadı (${code}); sunucu bu ağdan (ör. Vercel'den) erişilebilir olmayabilir — kurum içi ağ ya da güvenlik duvarı`;
    }
    return `ağ hatası (${code}); AI_BASE_URL ve ağ erişimini kontrol edin`;
};
