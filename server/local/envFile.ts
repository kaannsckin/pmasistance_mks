/**
 * `KEY=değer` biçimindeki ayar dosyası (.env). Boş satırlar ve # ile başlayan
 * satırlar atlanır; değer tek ya da çift tırnak içinde olabilir. Windows
 * satır sonları (CRLF) ve dosya başındaki BOM desteklenir.
 */
export const parseEnvFile = (text: string): Record<string, string> => {
    const out: Record<string, string> = {};
    text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach(line => {
        const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
        if (!m || line.trim().startsWith('#')) return;
        let v = m[2];
        const q = v[0];
        if ((q === '"' || q === "'") && v.length >= 2 && v.endsWith(q)) {
            v = v.slice(1, -1);
            if (q === '"') v = v.replace(/\\n/g, '\n');
        } else {
            v = v.replace(/\s+#.*$/, ''); // satır sonu yorumu (tırnaksız değerde)
        }
        out[m[1]] = v;
    });
    return out;
};
