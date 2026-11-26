/**
 * Sürüm notlarından (CHANGELOG.md) "Son yenilikler" özeti: ilk bölümlerin
 * kalın başlıkları (**…**). Başlığı olmayan bölümde madde satırlarının ilk
 * cümlesi alınır. Hakkında penceresinde gösterilir.
 */

export interface ChangelogSection {
    /** "Yayımlanmamış" ya da "v3.6.0" */
    title: string;
    items: string[];
}

const clean = (s: string) => s.replace(/\*\*/g, '').replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();

export const changelogHighlights = (md: string, sections = 2, perSection = 6): ChangelogSection[] => {
    const out: ChangelogSection[] = [];
    let cur: (ChangelogSection & { bullets: string[] }) | null = null;
    const flush = () => {
        if (!cur) return;
        const items = cur.items.length ? cur.items : cur.bullets.map(b => b.split(/(?<=\.)\s/)[0]);
        if (items.length) out.push({ title: cur.title, items: items.slice(0, perSection) });
    };
    for (const line of md.split(/\r?\n/)) {
        const h = /^##\s+(.+)$/.exec(line);
        if (h) {
            flush();
            if (out.length >= sections) return out;
            cur = { title: clean(h[1]), items: [], bullets: [] };
            continue;
        }
        if (!cur) continue;
        const bold = /^\*\*(.+?)\*\*\s*$/.exec(line.trim());
        if (bold) { cur.items.push(clean(bold[1])); continue; }
        const bullet = /^- (.+)$/.exec(line);
        if (bullet) cur.bullets.push(clean(bullet[1]));
    }
    flush();
    return out.slice(0, sections);
};
