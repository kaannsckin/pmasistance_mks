import { describe, expect, it } from 'vitest';
import { isSafeHref, parseInline, parseMarkdown } from './markdown';

describe('parseInline', () => {
    it('kaçırılmış yıldız vurguyu kapatmaz (model tablolarda *Diğer 31 Personel\\** yazar)', () => {
        expect(parseInline('*Diğer 31 Personel\\**')).toEqual([{ t: 'em', c: [{ t: 'text', v: 'Diğer 31 Personel*' }] }]);
        expect(parseInline('**a\\***')).toEqual([{ t: 'strong', c: [{ t: 'text', v: 'a*' }] }]);
        expect(parseInline('3 \\* 4 = 12')).toEqual([{ t: 'text', v: '3 * 4 = 12' }]);
        expect(parseInline('a\\\\*b*')).toEqual([{ t: 'text', v: 'a\\' }, { t: 'em', c: [{ t: 'text', v: 'b' }] }]);
    });
    it('kalın, italik, kod, üstü çizili', () => {
        expect(parseInline('a **b** *c* `d` ~~e~~')).toEqual([
            { t: 'text', v: 'a ' },
            { t: 'strong', c: [{ t: 'text', v: 'b' }] },
            { t: 'text', v: ' ' },
            { t: 'em', c: [{ t: 'text', v: 'c' }] },
            { t: 'text', v: ' ' },
            { t: 'code', v: 'd' },
            { t: 'text', v: ' ' },
            { t: 'del', c: [{ t: 'text', v: 'e' }] },
        ]);
    });

    it('çarpma işareti gibi yalnız yıldızlar metin kalır', () => {
        expect(parseInline('3 * 4 = 12')).toEqual([{ t: 'text', v: '3 * 4 = 12' }]);
    });

    it('güvenli bağlantılar link, güvensiz şemalar düz metin olur', () => {
        expect(parseInline('[site](https://ornek.com)')).toEqual([{ t: 'link', href: 'https://ornek.com', c: [{ t: 'text', v: 'site' }] }]);
        expect(parseInline('[tıkla](javascript:alert(1))')).toEqual([{ t: 'text', v: 'tıkla' }]);
        expect(isSafeHref('data:text/html,x')).toBe(false);
        expect(isSafeHref('mailto:a@b.c')).toBe(true);
    });

    it('ham HTML yorumlanmaz, metin olarak kalır', () => {
        const html = '<img src=x onerror=alert(1)><script>alert(2)</script>';
        expect(parseInline(html)).toEqual([{ t: 'text', v: html }]);
    });
});

describe('parseMarkdown', () => {
    it('başlık, paragraf, liste, kod bloğu', () => {
        const blocks = parseMarkdown('## Özet\nİlk satır\nikinci satır\n\n- bir\n  - iki\n1. üç\n\n```ts\nconst a = 1;\n```');
        expect(blocks.map(b => b.t)).toEqual(['heading', 'paragraph', 'list', 'list', 'code']);
        const para = blocks[1] as any;
        expect(para.c).toEqual([{ t: 'text', v: 'İlk satır' }, { t: 'br' }, { t: 'text', v: 'ikinci satır' }]);
        const ul = blocks[2] as any;
        expect(ul.ordered).toBe(false);
        expect(ul.items.map((i: any) => i.depth)).toEqual([0, 1]);
        expect((blocks[3] as any).ordered).toBe(true);
        expect(blocks[4]).toEqual({ t: 'code', lang: 'ts', v: 'const a = 1;' });
    });

    it('akış sırasında kapanmamış kod bloğunu tolere eder', () => {
        expect(parseMarkdown('```\nyarım')).toEqual([{ t: 'code', lang: '', v: 'yarım' }]);
    });

    it('GFM tablo + hizalama', () => {
        const [table] = parseMarkdown('| Proje | AA |\n|---|--:|\n| A | 1,5 |\n| B |');
        expect(table.t).toBe('table');
        const t = table as any;
        expect(t.align).toEqual([null, 'right']);
        expect(t.rows).toHaveLength(2);
        expect(t.rows[1][1]).toEqual([]); // eksik hücre boş
    });

    it('alıntı ve yatay çizgi', () => {
        const blocks = parseMarkdown('> not 1\n> not 2\n\n---\nson');
        expect(blocks.map(b => b.t)).toEqual(['quote', 'hr', 'paragraph']);
    });

    it('numaralı liste başlangıç numarasını korur', () => {
        const [list] = parseMarkdown('3. üç\n4. dört');
        expect((list as any).start).toBe(3);
    });
});
