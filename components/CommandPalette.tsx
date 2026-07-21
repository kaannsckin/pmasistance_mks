import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface CommandItem {
  id: string;
  group: string;
  label: string;
  sublabel?: string;
  icon: string;
  keywords?: string;
  run: () => void;
}

interface CommandPaletteProps {
  items: CommandItem[];
  onClose: () => void;
}

const lower = (s: string): string => s.toLocaleLowerCase('tr-TR');

/** Alt-dizi (subsequence) — "vh" → "veri havuzu" */
const isSubsequence = (q: string, t: string): boolean => {
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return q.length === 0;
};

/**
 * Eşleşme skoru — tam/önek/kelime-öneki eşleşmeleri gevşek alt-dizi
 * eşleşmesinin ÜSTÜNDE sıralanır ki "ALTAY" yazınca ALTAY projesi başa gelsin,
 * alakasız aksiyonlar (anahtar kelime tesadüfü) altta kalsın. 0 = eşleşme yok.
 */
const scoreItem = (query: string, item: CommandItem): number => {
  const q = lower(query.trim());
  if (!q) return 1;
  const label = lower(item.label);
  if (label === q) return 1000;
  if (label.startsWith(q)) return 900;
  if (label.split(/\s+/).some(w => w.startsWith(q))) return 800;
  if (label.includes(q)) return 700;
  const hay = lower(`${item.label} ${item.sublabel || ''} ${item.keywords || ''}`);
  if (hay.includes(q)) return 500;
  if (isSubsequence(q, label)) return 300;
  if (isSubsequence(q.replace(/\s+/g, ''), hay.replace(/\s+/g, ''))) return 100;
  return 0;
};

const CommandPalette: React.FC<CommandPaletteProps> = ({ items, onClose }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    return items
      .map((it, i) => ({ it, i, s: scoreItem(query, it) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i) // skor; eşitlikte özgün sıra
      .map(x => x.it);
  }, [items, query]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Aktif öğe görünürde kalsın
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (idx: number) => {
    const it = filtered[idx];
    if (!it) return;
    onClose();
    it.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(active); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  // Grup başlıklarını satır sırasına göre yerleştir
  let lastGroup = '';

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center bg-black/50 backdrop-blur-sm pt-[12vh] px-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl border border-gray-100 dark:border-gray-700 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <i className="fa-solid fa-magnifying-glass text-gray-400 text-sm"></i>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Projeye, kişiye ya da ekrana git…"
            className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none"
          />
          <kbd className="hidden sm:inline text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-400">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="text-center text-xs text-gray-400 py-8">Sonuç yok.</p>
          )}
          {filtered.map((it, idx) => {
            const showGroup = !query.trim() && it.group !== lastGroup;
            lastGroup = it.group;
            return (
              <React.Fragment key={it.id}>
                {showGroup && (
                  <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{it.group}</div>
                )}
                <button
                  data-idx={idx}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => run(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${idx === active ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                >
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-none text-white" style={{ backgroundColor: 'var(--app-primary)' }}>
                    <i className={`fa-solid ${it.icon} text-[11px]`}></i>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{it.label}</span>
                    {it.sublabel && <span className="block text-[11px] text-gray-400 truncate">{it.sublabel}</span>}
                  </span>
                  {idx === active && <kbd className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-400 flex-none">↵</kbd>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
