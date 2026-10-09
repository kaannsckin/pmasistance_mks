import type { JsonSchema } from '../../utils/ai/protocol.js';

/**
 * Araç argümanlarının şemaya göre denetimi. Uygulamanın araçları bilinmeyen
 * parametreyi ve geçersiz seçeneği sessizce yok sayar (ör. `gecikme` yerine
 * `geciken`, `alan: "gerceklesen"` yerine `actual`) — MCP istemcisi bunu fark
 * edemez ve yanlış sonucu doğru sanar. Burada açık bir hata döner; hata,
 * geçerli parametreleri sayar ki model kendini düzeltebilsin. Sayı ve mantıksal
 * değerler metin olarak gelirse dönüştürülür.
 */

/** Parametrelerin kısa dökümü: `ad* (tür|seçenekler)`; * zorunlu */
export const describeParams = (schema: JsonSchema): string => {
    const props = Object.entries(schema.properties || {});
    if (!props.length) return 'parametre almaz';
    const required = new Set(schema.required || []);
    return props.map(([k, p]) => {
        const kind = p.enum ? p.enum.join('|') : p.type === 'boolean' ? 'true|false' : p.type === 'integer' || p.type === 'number' ? 'sayı' : p.type === 'array' ? 'liste' : 'metin';
        return `${k}${required.has(k) ? '*' : ''} (${kind})`;
    }).join(', ');
};

const asNumber = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN);

export const validateArgs = (tool: string, schema: JsonSchema, args: Record<string, unknown>): { args: Record<string, unknown> } | { error: string } => {
    const props = schema.properties || {};
    const out: Record<string, unknown> = {};
    const bad = (msg: string) => ({ error: `${msg} ${tool} parametreleri: ${describeParams(schema)}${(schema.required || []).length ? ' (* zorunlu)' : ''}.` });
    for (const [key, value] of Object.entries(args)) {
        const p = props[key];
        if (!p) return bad(`"${key}" bu aracın parametresi değil.`);
        if (value === undefined || value === null || value === '') continue;
        let v: unknown = value;
        switch (p.type) {
            case 'integer':
            case 'number': {
                const n = asNumber(value);
                if (!Number.isFinite(n) || (p.type === 'integer' && !Number.isInteger(n))) return bad(`"${key}" ${p.type === 'integer' ? 'tam sayı' : 'sayı'} olmalı (gelen: ${JSON.stringify(value)}).`);
                v = n;
                break;
            }
            case 'boolean':
                if (value === 'true' || value === 'false') v = value === 'true';
                else if (typeof value !== 'boolean') return bad(`"${key}" true ya da false olmalı (gelen: ${JSON.stringify(value)}).`);
                break;
            case 'string': {
                // Bazı araçlar seçenekli metin parametresinde liste de kabul eder (ör. bilgi_ara kaynak)
                const list = Array.isArray(value) && p.enum && value.every(x => typeof x === 'string');
                if (typeof value !== 'string' && !list) return bad(`"${key}" metin olmalı (gelen: ${JSON.stringify(value)}).`);
                break;
            }
            case 'array':
                if (!Array.isArray(value)) return bad(`"${key}" liste olmalı.`);
                break;
            default:
                break;
        }
        if (p.enum) {
            const values = Array.isArray(v) ? v : [v];
            const wrong = values.find(x => !p.enum!.includes(x as string | number));
            if (wrong !== undefined) return bad(`"${key}" için geçersiz değer ${JSON.stringify(wrong)}; geçerli: ${p.enum.join(', ')}.`);
        }
        out[key] = v;
    }
    const missing = (schema.required || []).filter(k => out[k] === undefined);
    if (missing.length) return bad(`Zorunlu parametre eksik: ${missing.join(', ')}.`);
    return { args: out };
};
