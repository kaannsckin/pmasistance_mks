import React, { useMemo, useState } from 'react';
import { PestelItem, Risk, SwotItem } from '../types';
import { createSwotItem, itemsForQuadrant, SWOT_KIND_LABELS, SWOT_LABELS, SWOT_ORDER, suggestSwotFromContext, summarizeSwot } from '../utils/swot';
import { exportSwotPng, exportSwotSvg } from '../utils/swotExport';

interface SwotModalProps {
  projectName: string;
  items: SwotItem[];
  canEdit: boolean;
  pestelItems: PestelItem[];
  risks: Risk[];
  onUpdate: (items: SwotItem[]) => void;
  onClose: () => void;
}

const inputCls = 'w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none focus:border-primary';

const SwotModal: React.FC<SwotModalProps> = ({ projectName, items, canEdit, pestelItems, risks, onUpdate, onClose }) => {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const summary = useMemo(() => summarizeSwot(items), [items]);
  const suggestions = useMemo(() => suggestSwotFromContext(items, pestelItems, risks), [items, pestelItems, risks]);

  const handlePng = async () => {
    setExporting(true);
    try { await exportSwotPng(projectName, items); }
    catch (e) { alert(`PNG dışa aktarılamadı: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setExporting(false); }
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const update = (id: string, patch: Partial<SwotItem>) => onUpdate(items.map(i => i.id === id ? { ...i, ...patch } : i));
  const remove = (id: string) => onUpdate(items.filter(i => i.id !== id));
  const add = (quadrant: SwotItem['quadrant']) => {
    const text = (drafts[quadrant] || '').trim();
    if (!text) return;
    onUpdate([...items, createSwotItem(quadrant, { text })]);
    setDrafts(d => ({ ...d, [quadrant]: '' }));
  };
  const applySuggestions = () => { if (suggestions.length) onUpdate([...items, ...suggestions]); };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 pt-[6vh] overflow-y-auto" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-gray-900 px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: 'var(--app-primary)' }}>
              <i className="fa-solid fa-table-cells-large"></i>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">SWOT Analizi</h3>
              <p className="text-xs text-gray-400">{projectName} · Güçlü/Zayıf Yönler (içsel) · Fırsatlar/Tehditler (dışsal)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePng} disabled={exporting || items.length === 0} className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-lg text-white shadow-sm hover:opacity-90 disabled:opacity-40" style={{ backgroundColor: 'var(--app-primary)' }} title="SWOT panosunu PNG görsel olarak indir">
              {exporting ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-image"></i>}PNG
            </button>
            <button onClick={() => exportSwotSvg(projectName, items)} disabled={items.length === 0} className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:text-primary disabled:opacity-40" title="Vektörel (SVG) olarak indir">
              <i className="fa-solid fa-bezier-curve"></i>SVG
            </button>
            <button onClick={onClose} className="w-9 h-9 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><i className="fa-solid fa-times"></i></button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Özet + öneri */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-semibold bg-gray-50 dark:bg-gray-800/60 border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300">
              <i className="fa-solid fa-layer-group" style={{ color: 'var(--app-primary)' }}></i>{summary.total} madde
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-300">
              <i className="fa-solid fa-thumbs-up"></i>{summary.positive} olumlu (S+O)
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-semibold bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-300">
              <i className="fa-solid fa-thumbs-down"></i>{summary.negative} olumsuz (W+T)
            </div>
            {canEdit && (
              <button
                onClick={applySuggestions}
                disabled={suggestions.length === 0}
                className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2.5 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-40 transition-colors"
                title="PESTEL fırsat/tehditlerini ve yüksek riskleri SWOT'a ekle"
              >
                <i className="fa-solid fa-wand-magic-sparkles"></i>
                PESTEL & risklerden öner{suggestions.length > 0 && ` (${suggestions.length})`}
              </button>
            )}
          </div>

          {items.length === 0 && !canEdit && (
            <div className="text-center py-10 text-gray-400">
              <i className="fa-solid fa-table-cells-large text-3xl mb-3 opacity-40"></i>
              <p className="text-xs">Bu proje için henüz SWOT analizi girilmemiş.</p>
            </div>
          )}

          {/* 2×2 kadran */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SWOT_ORDER.map(q => {
              const meta = SWOT_LABELS[q];
              const quadItems = itemsForQuadrant(items, q);
              return (
                <div key={q} className="rounded-2xl border p-4" style={{ borderColor: `${meta.hex}55`, backgroundColor: `${meta.hex}0d` }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-extrabold flex-none" style={{ backgroundColor: meta.hex }}>{meta.short}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-gray-700 dark:text-gray-200"><i className={`fa-solid ${meta.icon} mr-1.5`} style={{ color: meta.hex }}></i>{meta.label}</div>
                      <div className="text-[10px] text-gray-400">{SWOT_KIND_LABELS[meta.kind]} · {meta.tone === 'pos' ? 'Olumlu' : 'Olumsuz'}</div>
                    </div>
                    <span className="ml-auto text-[11px] font-semibold text-gray-400">{quadItems.length}</span>
                  </div>

                  <div className="space-y-2">
                    {quadItems.map(it => (
                      <div key={it.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-2">
                        {canEdit ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <input className={inputCls} value={it.text} placeholder={`${meta.label} maddesi`} onChange={e => update(it.id, { text: e.target.value })} />
                              <button onClick={() => remove(it.id)} className="w-6 h-6 rounded-md text-gray-300 hover:text-red-500 flex-none" title="Sil"><i className="fa-solid fa-trash text-[10px]"></i></button>
                            </div>
                            <input className={inputCls} value={it.note || ''} placeholder="Aksiyon / not (opsiyonel)" onChange={e => update(it.id, { note: e.target.value || undefined })} />
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full flex-none mt-1.5" style={{ backgroundColor: meta.hex }}></span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-gray-700 dark:text-gray-200">{it.text}</p>
                              {it.note && <p className="text-[10px] text-gray-400 mt-0.5">{it.note}</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {quadItems.length === 0 && <p className="text-[11px] text-gray-300 dark:text-gray-600 px-1">Madde yok.</p>}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <input
                        className={inputCls}
                        value={drafts[q] || ''}
                        placeholder={`${meta.label} ekle…`}
                        onChange={e => setDrafts(d => ({ ...d, [q]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(q); } }}
                      />
                      <button onClick={() => add(q)} className="text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg flex-none hover:opacity-90" style={{ backgroundColor: meta.hex }}>
                        <i className="fa-solid fa-plus"></i>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!canEdit && (
            <p className="text-[11px] text-amber-600 dark:text-amber-300"><i className="fa-solid fa-lock mr-1"></i>SWOT analizini yalnızca proje sahibi düzenler (salt-okunur görünüm).</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SwotModal;
