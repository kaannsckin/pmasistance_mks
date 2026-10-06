import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TUBITAK_CA_PEM } from './certs';
import { describeNetworkError, extraCaFor, networkErrorCode, splitPem, upstreamFetch } from './tls';

const BILGEM = 'https://ai-api.bilgem.tubitak.gov.tr/v1/chat/completions';

describe('TÜBİTAK sertifika zinciri', () => {
    it('ara ve kök sertifika geçerli ve birbirine bağlı', () => {
        const [ara, kok] = splitPem(TUBITAK_CA_PEM).map(p => new X509Certificate(p));
        expect(ara.subject).toContain('Surum 3');
        expect(kok.subject).toContain('Kok Sertifikasi - Surum 2');
        expect(ara.checkIssued(kok)).toBe(true);
        expect(ara.verify(kok.publicKey)).toBe(true);
        expect(kok.ca && ara.ca).toBe(true);
    });
});

describe('extraCaFor', () => {
    it('*.tubitak.gov.tr için zinciri kendiliğinden ekler, başka adreslere eklemez', () => {
        expect(extraCaFor(BILGEM, {})).toHaveLength(2);
        expect(extraCaFor('https://api.openai.com/v1/chat/completions', {})).toEqual([]);
        expect(extraCaFor('https://tubitak.gov.tr.evil.example/v1', {})).toEqual([]);
        expect(extraCaFor('gecersiz', {})).toEqual([]);
    });

    it('AI_CA_CERTS: çok satırlı ya da \\n kaçışlı PEM kabul edilir, tekrarlar elenir', () => {
        const [ara] = splitPem(TUBITAK_CA_PEM);
        const escaped = ara.replace(/\n/g, '\\n');
        expect(extraCaFor('https://llm.kurum.local/v1', { AI_CA_CERTS: escaped })).toEqual([ara]);
        expect(extraCaFor(BILGEM, { AI_CA_CERTS: ara })).toHaveLength(2);
        expect(extraCaFor('https://llm.kurum.local/v1', { AI_CA_CERTS: 'sertifika değil' })).toEqual([]);
    });
});

describe('upstreamFetch', () => {
    it('ek sertifika yoksa global fetch, varsa önbelleğe alınmış özel fetch döner', () => {
        expect(upstreamFetch('https://api.openai.com/v1/x', {})).toBe(fetch);
        const a = upstreamFetch(BILGEM, {});
        expect(a).not.toBe(fetch);
        expect(upstreamFetch('https://ai-api.bilgem.tubitak.gov.tr/v1/embeddings', {})).toBe(a);
    });
});

describe('ağ hatası açıklaması', () => {
    const fail = (cause: unknown) => new TypeError('fetch failed', { cause });

    it('kodu iç içe nedenlerden ve AggregateError içinden çıkarır', () => {
        expect(networkErrorCode(fail(Object.assign(new Error('x'), { code: 'ENOTFOUND' })))).toBe('ENOTFOUND');
        const agg = new AggregateError([Object.assign(new Error('y'), { code: 'ECONNREFUSED' })]);
        expect(networkErrorCode(fail(agg))).toBe('ECONNREFUSED');
        expect(networkErrorCode(new TypeError('fetch failed'))).toBeUndefined();
    });

    it('sertifika, DNS ve bağlantı hatalarını ayırt eder', () => {
        expect(describeNetworkError(fail({ code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }))).toMatch(/sertifika.*AI_CA_CERTS/);
        expect(describeNetworkError(fail({ code: 'ENOTFOUND' }))).toMatch(/alan adı çözümlenemedi/);
        expect(describeNetworkError(fail({ code: 'UND_ERR_CONNECT_TIMEOUT' }))).toMatch(/bağlantı kurulamadı/);
        expect(describeNetworkError(new TypeError('fetch failed'))).toMatch(/AI_BASE_URL/);
    });
});
