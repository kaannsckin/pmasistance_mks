import React, { useMemo, useState } from 'react';
import { DashboardDim, DashboardFilter, DashboardMeasure, DashboardWidget, DashboardWidgetType, Project, ProjectKpi, Task } from '../../../types';
import { DIM_LABELS, labelCounts, labelFamilies, MEASURE_LABELS } from '../../../utils/dashboard/data';
import { addKpiPoint, formatKpi, KPI_UNIT_LABELS, METRICS, newKpiId } from '../../../utils/dashboard/metrics';
import { TEMPLATES, WIDGET_BY_TYPE, WIDGETS } from '../../../utils/dashboard/model';
import { Icon, IconName } from '../icons';
import { Field, rowSep, Sheet } from '../ui';

// ------------------------------------------------------------------ bileşen ekle
export const WidgetCatalog: React.FC<{ onAdd: (type: DashboardWidgetType) => void; onTemplate: (key: string) => void; onClose: () => void }> = ({ onAdd, onTemplate, onClose }) => {
    const groups = [...new Set(WIDGETS.map(w => w.group))];
    return (
        <Sheet title="Bileşen ekle" subtitle="Seçtiğiniz bileşen dashboard'un sonuna eklenir; ardından ayarlarından boyut, süzgeç ve gruplama seçilir." onClose={onClose} wide>
            <div className="flex flex-col gap-5">
                {groups.map(g => (
                    <section key={g} aria-label={g} className="flex flex-col gap-2">
                        <h3 className="m-0 text-[13px] font-semibold m-text-3 uppercase tracking-wide">{g}</h3>
                        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                            {WIDGETS.filter(w => w.group === g).map(w => (
                                <button key={w.type} type="button" onClick={() => onAdd(w.type)} className="m-row-link m-surface rounded-xl p-3 flex items-start gap-3 text-left" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }}>
                                    <span className="w-9 h-9 rounded-lg m-tone-accent flex items-center justify-center flex-none"><Icon name={w.icon as IconName} size={18} /></span>
                                    <span className="flex flex-col gap-0.5 min-w-0">
                                        <span className="text-[14.5px] font-semibold m-text">{w.label}</span>
                                        <span className="text-[12.5px] m-text-3 leading-snug">{w.description}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                ))}
                <section aria-label="Hazır şablonlar" className="flex flex-col gap-2">
                    <h3 className="m-0 text-[13px] font-semibold m-text-3 uppercase tracking-wide">Hazır şablonlar (mevcut düzenin yerine geçer)</h3>
                    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                        {TEMPLATES.map(t => (
                            <button key={t.key} type="button" onClick={() => { if (window.confirm(`"${t.label}" şablonu uygulansın mı? Kişisel düzeniniz bu şablonla değişir.`)) onTemplate(t.key); }}
                                className="m-row-link m-surface rounded-xl p-3 flex flex-col gap-0.5 text-left" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }}>
                                <span className="text-[14.5px] font-semibold m-text">{t.label}</span>
                                <span className="text-[12.5px] m-text-3 leading-snug">{t.description}</span>
                            </button>
                        ))}
                    </div>
                </section>
            </div>
        </Sheet>
    );
};

// ------------------------------------------------------------------ boyut (gruplama) seçici
const dimKey = (d?: DashboardDim): string => (!d ? '' : d.kind === 'labels' ? (d.prefix ? `prefix:${d.prefix}` : 'values') : d.kind);

const DimPicker: React.FC<{ id: string; label: string; value?: DashboardDim; tasks: Task[]; onChange: (d: DashboardDim) => void }> = ({ id, label, value, tasks, onChange }) => {
    const fams = useMemo(() => labelFamilies(tasks), [tasks]);
    const labels = useMemo(() => labelCounts(tasks), [tasks]);
    const key = dimKey(value);
    const chosen = value?.kind === 'labels' && !value.prefix ? value.values || [] : [];
    return (
        <Field label={label} htmlFor={id}>
            <select id={id} className="m-input" value={key} onChange={e => {
                const v = e.target.value;
                if (v.startsWith('prefix:')) onChange({ kind: 'labels', prefix: v.slice(7) });
                else if (v === 'values') onChange({ kind: 'labels', values: chosen.length ? chosen : labels.slice(0, 3).map(l => l.label) });
                else onChange({ kind: v as Exclude<DashboardDim['kind'], 'labels'> });
            }}>
                <optgroup label="Alanlar">
                    {(Object.keys(DIM_LABELS) as (keyof typeof DIM_LABELS)[]).map(k => <option key={k} value={k}>{DIM_LABELS[k]}</option>)}
                </optgroup>
                {fams.length > 0 && (
                    <optgroup label="Etiket aileleri (bulunan)">
                        {fams.map(f => <option key={f.prefix} value={`prefix:${f.prefix}`}>{f.prefix.replace(/:$/, '')} ({f.values.slice(0, 4).join(', ')}{f.values.length > 4 ? '…' : ''})</option>)}
                    </optgroup>
                )}
                <optgroup label="Etiketler">
                    <option value="values">Seçtiğim etiketler…</option>
                    {value?.kind === 'labels' && value.prefix && !fams.some(f => f.prefix === value.prefix) && <option value={`prefix:${value.prefix}`}>{value.prefix}…</option>}
                </optgroup>
            </select>
            {value?.kind === 'labels' && !value.prefix && (
                <div className="mt-2 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto" role="group" aria-label="Gruplanacak etiketler">
                    {labels.slice(0, 80).map(l => {
                        const on = chosen.includes(l.label);
                        return (
                            <button key={l.label} type="button" aria-pressed={on} onClick={() => onChange({ kind: 'labels', values: on ? chosen.filter(x => x !== l.label) : [...chosen, l.label] })}
                                className={`m-pill ${on ? 'is-active' : ''} !min-h-[30px] text-[13px]`}>{l.label} <span className="m-text-3">{l.count}</span></button>
                        );
                    })}
                </div>
            )}
        </Field>
    );
};

// ------------------------------------------------------------------ süzgeç
const FilterEditor: React.FC<{ value?: DashboardFilter; project: Project; onChange: (f: DashboardFilter | undefined) => void }> = ({ value, project, onChange }) => {
    const labels = useMemo(() => labelCounts(project.tasks), [project.tasks]);
    const f = value || {};
    const set = (patch: Partial<DashboardFilter>) => {
        const next: DashboardFilter = { ...f, ...patch };
        (Object.keys(next) as (keyof DashboardFilter)[]).forEach(k => { const v = next[k]; if (v === undefined || v === '' || v === false || (Array.isArray(v) && !v.length)) delete next[k]; });
        onChange(Object.keys(next).length ? next : undefined);
    };
    const people = [...new Set(project.tasks.map(t => (t.resourceName || '').trim()).filter(Boolean))].sort((a: string, b: string) => a.localeCompare(b, 'tr'));
    const toggle = (list: string[] | undefined, l: string) => (list?.includes(l) ? list.filter(x => x !== l) : [...(list || []), l]);
    return (
        <fieldset className="m-0 p-0 border-0 flex flex-col gap-3">
            <legend className="text-[13px] font-semibold m-text-3 uppercase tracking-wide mb-1">Süzgeç</legend>
            {labels.length > 0 && (
                <Field label="Şu etiketlerden birini taşıyanlar" hint="Boşsa tüm kayıtlar">
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto" role="group" aria-label="Dahil etiketler">
                        {labels.slice(0, 80).map(l => (
                            <button key={l.label} type="button" aria-pressed={!!f.labels?.includes(l.label)} onClick={() => set({ labels: toggle(f.labels, l.label) })} className={`m-pill ${f.labels?.includes(l.label) ? 'is-active' : ''} !min-h-[30px] text-[13px]`}>{l.label}</button>
                        ))}
                    </div>
                </Field>
            )}
            {labels.length > 0 && (
                <Field label="Şu etiketleri taşımayanlar">
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto" role="group" aria-label="Hariç etiketler">
                        {labels.slice(0, 80).map(l => (
                            <button key={l.label} type="button" aria-pressed={!!f.excludeLabels?.includes(l.label)} onClick={() => set({ excludeLabels: toggle(f.excludeLabels, l.label) })} className={`m-pill ${f.excludeLabels?.includes(l.label) ? 'is-active' : ''} !min-h-[30px] text-[13px]`}>{l.label}</button>
                        ))}
                    </div>
                </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="İş paketi" htmlFor="wf-wp">
                    <select id="wf-wp" className="m-input" value={f.workPackageId || ''} onChange={e => set({ workPackageId: e.target.value || undefined })}>
                        <option value="">Tümü</option>
                        {project.workPackages.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                </Field>
                <Field label="Atanan" htmlFor="wf-who">
                    <select id="wf-who" className="m-input" value={f.assignee || ''} onChange={e => set({ assignee: e.target.value || undefined })}>
                        <option value="">Herkes</option>
                        {people.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </Field>
            </div>
            <label className="inline-flex items-center gap-2 text-[14px] m-text"><input type="checkbox" checked={!!f.openOnly} onChange={e => set({ openOnly: e.target.checked })} />Yalnız açık (bitmemiş) kayıtlar</label>
        </fieldset>
    );
};

// ------------------------------------------------------------------ bileşen ayarları
const USES_FILTER = new Set<DashboardWidgetType>(['metric', 'progress', 'statusMix', 'breakdown', 'milestones', 'workPackages', 'pivot', 'burnup', 'team', 'deadlines', 'worklog', 'activity']);
const USES_MEASURE = new Set<DashboardWidgetType>(['progress', 'breakdown', 'milestones', 'workPackages', 'pivot', 'burnup']);
const USES_LIMIT = new Set<DashboardWidgetType>(['team', 'deadlines', 'risks', 'worklog', 'activity', 'breakdown']);

export const WidgetSettings: React.FC<{
    widget: DashboardWidget;
    project: Project;
    canEditKpi: boolean;
    onSave: (w: DashboardWidget) => void;
    onNewKpi: () => void;
    onClose: () => void;
}> = ({ widget, project, canEditKpi, onSave, onNewKpi, onClose }) => {
    const [w, setW] = useState<DashboardWidget>(structuredClone(widget));
    const cfg = w.config || {};
    const setCfg = (patch: Partial<NonNullable<DashboardWidget['config']>>) => setW(x => ({ ...x, config: { ...(x.config || {}), ...patch } }));
    const def = WIDGET_BY_TYPE.get(w.type)!;
    const groups = [...new Set(METRICS.map(m => m.group))];
    return (
        <Sheet title={`${def.label} ayarları`} subtitle={def.description} onClose={onClose} wide footer={<>
            <span className="flex-1"></span>
            <button type="button" className="m-btn m-btn-gray" onClick={onClose}>Vazgeç</button>
            <button type="button" className="m-btn m-btn-primary" onClick={() => onSave(w)}>Kaydet</button>
        </>}>
            <div className="flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <Field label="Başlık" htmlFor="ws-title" hint="Boş bırakılırsa otomatik">
                        <input id="ws-title" className="m-input" value={w.title || ''} placeholder={def.label} onChange={e => setW(x => ({ ...x, title: e.target.value }))} />
                    </Field>
                    <Field label="Genişlik">
                        <div className="flex gap-1" role="radiogroup" aria-label="Genişlik">
                            {([1, 2, 3, 4] as const).map(s => <button key={s} type="button" role="radio" aria-checked={w.size === s} onClick={() => setW(x => ({ ...x, size: s }))} className={`m-pill ${w.size === s ? 'is-active' : ''}`}>{s === 4 ? 'Tam' : `${s}/4`}</button>)}
                        </div>
                    </Field>
                </div>

                {w.type === 'metric' && (
                    <Field label="Gösterge" htmlFor="ws-metric">
                        <select id="ws-metric" className="m-input" value={cfg.metric || 'progress'} onChange={e => setCfg({ metric: e.target.value })}>
                            {groups.map(g => <optgroup key={g} label={g}>{METRICS.filter(m => m.group === g).map(m => <option key={m.key} value={m.key}>{m.label}{m.filtered ? '' : ' (proje geneli)'}</option>)}</optgroup>)}
                        </select>
                    </Field>
                )}

                {w.type === 'kpi' && (
                    <Field label="Projeye özel gösterge" htmlFor="ws-kpi">
                        <div className="flex gap-2">
                            <select id="ws-kpi" className="m-input flex-1" value={cfg.kpiId || ''} onChange={e => setCfg({ kpiId: e.target.value || undefined })}>
                                {!(project.kpis || []).length && <option value="">Gösterge yok</option>}
                                {(project.kpis || []).map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                            </select>
                            {canEditKpi && <button type="button" className="m-btn m-btn-gray" onClick={onNewKpi}><Icon name="plus" size={15} />Yeni</button>}
                        </div>
                    </Field>
                )}

                {(w.type === 'breakdown' || w.type === 'milestones' || w.type === 'team') && (
                    <DimPicker id="ws-dim" label={w.type === 'milestones' ? 'Kilometre taşları neye göre' : w.type === 'team' ? 'Gruplama' : 'Neye göre kırılsın'} value={cfg.dim} tasks={project.tasks} onChange={d => setCfg({ dim: d })} />
                )}
                {w.type === 'pivot' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <DimPicker id="ws-dim" label="Satırlar" value={cfg.dim} tasks={project.tasks} onChange={d => setCfg({ dim: d })} />
                        <DimPicker id="ws-dim2" label="Sütunlar" value={cfg.dim2} tasks={project.tasks} onChange={d => setCfg({ dim2: d })} />
                    </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                    {USES_MEASURE.has(w.type) && (
                        <Field label="Ölçü" htmlFor="ws-measure">
                            <select id="ws-measure" className="m-input" value={cfg.measure || (w.type === 'workPackages' ? 'effort' : 'count')} onChange={e => setCfg({ measure: e.target.value as DashboardMeasure })}>
                                {(Object.keys(MEASURE_LABELS) as DashboardMeasure[]).map(m => <option key={m} value={m}>{MEASURE_LABELS[m]}</option>)}
                            </select>
                        </Field>
                    )}
                    {w.type === 'breakdown' && (
                        <Field label="Gösterim" htmlFor="ws-chart">
                            <select id="ws-chart" className="m-input" value={cfg.chart || 'bar'} onChange={e => setCfg({ chart: e.target.value as 'bar' | 'donut' | 'table' })}>
                                <option value="bar">Çubuk</option><option value="donut">Halka</option><option value="table">Tablo</option>
                            </select>
                        </Field>
                    )}
                    {USES_LIMIT.has(w.type) && (
                        <Field label="En çok satır" htmlFor="ws-limit">
                            <input id="ws-limit" type="number" min={3} max={50} className="m-input" value={cfg.limit || ''} placeholder="8" onChange={e => setCfg({ limit: e.target.value ? Math.max(3, Math.min(50, Number(e.target.value))) : undefined })} />
                        </Field>
                    )}
                </div>

                {w.type === 'note' && (
                    <Field label="Metin" htmlFor="ws-text">
                        <textarea id="ws-text" className="m-input !py-2 min-h-[140px]" value={cfg.text || ''} onChange={e => setCfg({ text: e.target.value })} placeholder="Ör. GİB ile netleştirme toplantısı 2 Aralık; zorunlu maddelerin yanıtı bekleniyor." />
                    </Field>
                )}

                {USES_FILTER.has(w.type) && <FilterEditor value={cfg.filter} project={project} onChange={f => setCfg({ filter: f })} />}
            </div>
        </Sheet>
    );
};

// ------------------------------------------------------------------ projeye özel göstergeler
const today = () => new Date().toISOString().slice(0, 10);
const parseNum = (s: string): number | undefined => {
    const t = s.replace('%', '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    const n = Number(t);
    return t !== '' && Number.isFinite(n) ? n : undefined;
};

export const KpiSheet: React.FC<{
    kpi: ProjectKpi | null;
    onSave: (k: ProjectKpi) => void;
    onDelete?: (id: string) => void;
    onClose: () => void;
}> = ({ kpi, onSave, onDelete, onClose }) => {
    const [k, setK] = useState<ProjectKpi>(kpi ? structuredClone(kpi) : { id: newKpiId(), name: '', unit: 'percent', points: [], higherIsBetter: true, source: 'manual' });
    const [date, setDate] = useState(today());
    const [value, setValue] = useState('');
    const [note, setNote] = useState('');
    const [target, setTarget] = useState(k.target !== undefined ? String(k.target).replace('.', ',') : '');
    const [baseline, setBaseline] = useState(k.baseline !== undefined ? String(k.baseline).replace('.', ',') : '');
    const add = () => {
        const v = parseNum(value);
        if (v === undefined) return;
        setK(x => addKpiPoint(x, { date, value: v, note: note.trim() || undefined }));
        setValue(''); setNote('');
    };
    const save = () => {
        const v = parseNum(value);
        let out = v !== undefined ? addKpiPoint(k, { date, value: v, note: note.trim() || undefined }) : k;
        const t = parseNum(target), b = parseNum(baseline);
        out = { ...out, name: out.name.trim(), target: t, baseline: b };
        if (t === undefined) delete out.target;
        if (b === undefined) delete out.baseline;
        onSave(out);
    };
    return (
        <Sheet title={kpi ? `Gösterge: ${kpi.name}` : 'Yeni gösterge'} subtitle="Projeye özel ölçüm (ör. PoC skoru, test kapsaması, müşteri memnuniyeti). Her ölçüm tarihiyle saklanır; dashboard'da eğri ve hedefe ilerleme görünür." onClose={onClose} wide footer={<>
            {kpi && onDelete && <button type="button" className="m-btn m-btn-danger" onClick={() => { if (window.confirm(`"${kpi.name}" göstergesi ve tüm ölçümleri silinsin mi?`)) onDelete(kpi.id); }}>Sil</button>}
            <span className="flex-1"></span>
            <button type="button" className="m-btn m-btn-gray" onClick={onClose}>Vazgeç</button>
            <button type="button" className="m-btn m-btn-primary" disabled={!k.name.trim()} onClick={save}>Kaydet</button>
        </>}>
            <div className="flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Ad" htmlFor="kpi-name"><input id="kpi-name" className="m-input" value={k.name} autoFocus={!kpi} placeholder="PoC skoru" onChange={e => setK(x => ({ ...x, name: e.target.value }))} /></Field>
                    <Field label="Birim" htmlFor="kpi-unit">
                        <select id="kpi-unit" className="m-input" value={k.unit} onChange={e => setK(x => ({ ...x, unit: e.target.value as ProjectKpi['unit'] }))}>
                            {(Object.keys(KPI_UNIT_LABELS) as ProjectKpi['unit'][]).map(u => <option key={u} value={u}>{KPI_UNIT_LABELS[u]}</option>)}
                        </select>
                    </Field>
                    <Field label="Hedef" htmlFor="kpi-target" hint={k.unit === 'percent' ? 'Ör. 87,2' : undefined}><input id="kpi-target" className="m-input" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} /></Field>
                    <Field label="Hedef açıklaması" htmlFor="kpi-tl"><input id="kpi-tl" className="m-input" value={k.targetLabel || ''} placeholder="Aralık 2026 teslimatı sonrası" onChange={e => setK(x => ({ ...x, targetLabel: e.target.value || undefined }))} /></Field>
                    <Field label="Başlangıç değeri" htmlFor="kpi-base" hint="Hedefe ilerleme bundan hesaplanır"><input id="kpi-base" className="m-input" inputMode="decimal" value={baseline} onChange={e => setBaseline(e.target.value)} /></Field>
                    <Field label="Yön">
                        <div className="flex gap-1" role="radiogroup" aria-label="Yön">
                            <button type="button" role="radio" aria-checked={k.higherIsBetter !== false} className={`m-pill ${k.higherIsBetter !== false ? 'is-active' : ''}`} onClick={() => setK(x => ({ ...x, higherIsBetter: true }))}>Yüksek iyi</button>
                            <button type="button" role="radio" aria-checked={k.higherIsBetter === false} className={`m-pill ${k.higherIsBetter === false ? 'is-active' : ''}`} onClick={() => setK(x => ({ ...x, higherIsBetter: false }))}>Düşük iyi</button>
                        </div>
                    </Field>
                </div>

                <fieldset className="m-0 p-0 border-0 flex flex-col gap-2">
                    <legend className="text-[13px] font-semibold m-text-3 uppercase tracking-wide mb-1">Ölçüm ekle</legend>
                    <div className="grid gap-2 sm:grid-cols-[150px_120px_1fr_auto] items-end">
                        <Field label="Tarih" htmlFor="kpi-date"><input id="kpi-date" type="date" className="m-input" value={date} onChange={e => setDate(e.target.value)} /></Field>
                        <Field label="Değer" htmlFor="kpi-val"><input id="kpi-val" className="m-input" inputMode="decimal" value={value} placeholder={k.unit === 'percent' ? '45,8' : '0'} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} /></Field>
                        <Field label="Not" htmlFor="kpi-note"><input id="kpi-note" className="m-input" value={note} placeholder="Ör. GİB ilk değerlendirme" onChange={e => setNote(e.target.value)} /></Field>
                        <button type="button" className="m-btn m-btn-gray" disabled={parseNum(value) === undefined} onClick={add}><Icon name="plus" size={15} />Ekle</button>
                    </div>
                </fieldset>

                {k.points.length > 0 && (
                    <ul className="m-0 p-0 list-none m-surface rounded-xl px-3" aria-label="Ölçümler">
                        {[...k.points].reverse().map((p, i) => {
                            const sep = rowSep(i);
                            return (
                                <li key={p.date} className={`flex items-center gap-3 py-2 text-[14px] ${sep.className}`} style={sep.style}>
                                    <span className="w-28 m-text-2 m-tabular">{new Date(`${p.date}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                    <span className="w-24 font-semibold m-text m-tabular">{formatKpi(p.value, k.unit)}</span>
                                    <span className="flex-1 min-w-0 truncate m-text-3">{p.note || ''}</span>
                                    <button type="button" className="m-icon-btn !w-7 !h-7" aria-label={`${p.date} ölçümünü sil`} onClick={() => setK(x => ({ ...x, points: x.points.filter(q => q.date !== p.date) }))}><Icon name="trash" size={14} /></button>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {k.source === 'import' && <p className="m-0 text-[13px] m-text-3">Bu gösterge Excel aktarımıyla güncellenir; elle eklenen ölçümler de korunur.</p>}
            </div>
        </Sheet>
    );
};

// ------------------------------------------------------------------ kayıt listesi (inceleme)
export const DrillSheet: React.FC<{ title: string; tasks: Task[]; statusOf: (t: Task) => string; onOpen: (t: Task) => void; onClose: () => void }> = ({ title, tasks, statusOf, onOpen, onClose }) => (
    <Sheet title={title} subtitle={`${tasks.length} kayıt`} onClose={onClose} wide>
        {tasks.length === 0 ? <p className="m-0 m-text-3">Kayıt yok.</p> : (
            <ul className="m-0 p-0 list-none flex flex-col">
                {tasks.slice(0, 300).map((t, i) => {
                    const sep = rowSep(i);
                    return (
                        <li key={t.id}>
                            <button type="button" className={`m-row-link w-full flex items-center gap-3 px-1 py-2 text-left ${sep.className}`} style={sep.style} onClick={() => onOpen(t)}>
                                <span className="flex-1 min-w-0 flex flex-col">
                                    <span className="text-[14.5px] m-text truncate">{t.name}</span>
                                    <span className="text-[12.5px] m-text-3 truncate">{[t.resourceName || 'Atanmadı', statusOf(t), t.dueDate ? `termin ${new Date(`${t.dueDate.slice(0, 10)}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}` : '', (t.labels || []).slice(0, 4).join(', ')].filter(Boolean).join(' · ')}</span>
                                </span>
                                <Icon name="chevronRight" size={16} />
                            </button>
                        </li>
                    );
                })}
                {tasks.length > 300 && <li className="py-2 text-[13px] m-text-3">ve {tasks.length - 300} kayıt daha</li>}
            </ul>
        )}
    </Sheet>
);
