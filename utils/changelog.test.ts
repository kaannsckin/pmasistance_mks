import { describe, expect, it } from 'vitest';
import { changelogHighlights } from './changelog';

describe('changelogHighlights', () => {
    it('ilk bölümlerin kalın başlıklarını, yoksa maddelerin ilk cümlesini alır', () => {
        const md = `# Sürüm notları\n\nGiriş.\n\n## Yayımlanmamış\n\n**Whiteboard: FigJam tarzı pano**\n- ayrıntı\n\n**Yetki düzeltmesi**\n- x\n\n## v3.6.0\n\n- **Rapor**: haftalık rapor yenilendi. Ek açıklama.\n- [Bağlantı](docs/x.md) eklendi.\n\n## v3.5.0\n\n**Eski**\n`;
        expect(changelogHighlights(md)).toEqual([
            { title: 'Yayımlanmamış', items: ['Whiteboard: FigJam tarzı pano', 'Yetki düzeltmesi'] },
            { title: 'v3.6.0', items: ['Rapor: haftalık rapor yenilendi.', 'Bağlantı eklendi.'] },
        ]);
    });
});
