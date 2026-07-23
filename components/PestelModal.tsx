import React, { useMemo, useState } from 'react';
import { PestelItem, RiskLevel } from '../types';
import { createPestelItem, itemsForCategory, PESTEL_KIND_LABELS, PESTEL_LABELS, PESTEL_ORDER, summarizePestel } from '../utils/pestel';

interface PestelModalProps {
  projectName: string;
  items: PestelItem[];
  canEdit: boolean;
  onUpdate: (items: PestelItem[]) => void;
  onClose: () => void;
}

const LEVELS: RiskLevel[] = [1, 2, 3, 4, 5];
const inputCls = 'w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none focus:border-primary';

const kindStyle = (kind: PestelItem['kind']): string =>
  kind === 'opportunity'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300';

const PestelModal: React.FC<PestelModalProps> = ({ projectName, items, canEdit, onUpdate, onClose }) => {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const summary = useMemo(() => summarizePestel(items), [items]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const update = (id: string, patch: Partial<PestelItem>) => onUpdate(items.map(i => i.id === id ? { ...i, ...patch } : i));
  const remove = (id: string) => onUpdate(items.filter(i => i.id !== id));
  const add = (category: PestelItem['category']) => {
    const text = (drafts[category] || '').trim();
    if (!text) return;
    onUpdate([...items, createPestelItem(category, { text })]);
    setDrafts(d => ({ ...d, [category]: '' }));
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 pt-[6vh] overflow-y-auto" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-gray-900 px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: 'var(--app-primary)' }}>
              <i className="fa-solid fa-globe"></i>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">PESTEL Analizi</h3>
              <p className="text-xs text-gray-400">{projectName} · Politik · Ekonomik · Sosyal · Teknolojik · Çevresel · Yasal</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><i className="fa-solid fa-times"></i></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Özet */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-semibold bg-gray-50 dark:bg-gray-800/60 border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300">
              <i className="fa-solid fa-layer-group" style={{ color: 'var(--app-primary)' }}></i>{summary.total} faktör
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-300">
              <i className="fa-solid fa-arrow-trend-up"></i>{summary.opportunities} fırsat
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-semibold bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-300">
              <i className="fa-solid fa-arrow-trend-down"></i>{summary.threats} tehdit
            </div>
            {summary.highImpact > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-semibold bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-300">
                <i className="fa-solid fa-triangle-exclamation"></i>{summary.highImpact} yüksek etki
              </div>
            )}
          </div>

          {items.length === 0 && !canEdit && (
            <div className="text-center py-10 text-gray-400">
              <i className="fa-solid fa-globe text-3xl mb-3 opacity-40"></i>
              <p className="text-xs">Bu proje için henüz PESTEL analizi girilmemiş.</p>
            </div>
          )}

          {/* 6 faktör */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {PESTEL_ORDER.map(cat => {
              const meta = PESTEL_LABELS[cat];
              const catItems = itemsForCategory(items, cat);
              return (
                <div key={cat} className="bg-gray-50/60 dark:bg-gray-800/40 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-none" style={{ backgroundColor: meta.hex }}>{meta.letter}</span>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200"><i className={`fa-solid ${meta.icon} mr-1.5`} style={{ color: meta.hex }}></i>{meta.label}</span>
                    <span className="ml-auto text-[11px] font-semibold text-gray-400">{catItems.length}</span>
                  </div>

                  <div className="space-y-2">
                    {catItems.map(it => (
                      <div key={it.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-2">
                        {canEdit ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => update(it.id, { kind: it.kind === 'threat' ? 'opportunity' : 'threat' })}
                                className={`text-[10px] font-bold px-2 py-1 rounded-md flex-none ${kindStyle(it.kind)}`}
                                title="Fırsat / Tehdit değiştir"
                              >
                                {PESTEL_KIND_LABELS[it.kind]}
                              </button>
                              <input className={inputCls} value={it.text} placeholder="Faktör açıklaması" onChange={e => update(it.id, { text: e.target.value })} />
                              <select className={`${inputCls} w-12 flex-none`} value={it.impact} onChange={e => update(it.id, { impact: Number(e.target.value) as RiskLevel })} title="Etki (1-5)">
                                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                              </select>
                              <button onClick={() => remove(it.id)} className="w-6 h-6 rounded-md text-gray-300 hover:text-red-500 flex-none" title="Sil"><i className="fa-solid fa-trash text-[10px]"></i></button>
                            </div>
                            <input className={inputCls} value={it.note || ''} placeholder="Aksiyon / not (opsiyonel)" onChange={e => update(it.id, { note: e.target.value || undefined })} />
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex-none mt-0.5 ${kindStyle(it.kind)}`}>{PESTEL_KIND_LABELS[it.kind]}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-gray-700 dark:text-gray-200">{it.text}</p>
                              {it.note && <p className="text-[10px] text-gray-400 mt-0.5">{it.note}</p>}
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 flex-none mt-0.5" title="Etki">E{it.impact}</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {catItems.length === 0 && <p className="text-[11px] text-gray-300 dark:text-gray-600 px-1">Madde yok.</p>}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <input
                        className={inputCls}
                        value={drafts[cat] || ''}
                        placeholder={`${meta.label} faktörü ekle…`}
                        onChange={e => setDrafts(d => ({ ...d, [cat]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(cat); } }}
                      />
                      <button onClick={() => add(cat)} className="text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg flex-none hover:opacity-90" style={{ backgroundColor: 'var(--app-primary)' }}>
                        <i className="fa-solid fa-plus"></i>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!canEdit && (
            <p className="text-[11px] text-amber-600 dark:text-amber-300"><i className="fa-solid fa-lock mr-1"></i>PESTEL analizini yalnızca proje sahibi düzenler (salt-okunur görünüm).</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PestelModal;
