import React, { useMemo, useRef, useState } from 'react';
import { Person, Resource, Task } from '../../types';
import { exportResourcePlanToExcel } from '../../utils/exporter';
import {
    createResource, hasResourceNamed, MONTHS_SHORT, personToResourceFields, resourceTaskCounts, rowsToResourcePlan, setMonthlyValue, unitPlans, updateResource,
} from '../../utils/resourcePlan';
import CostManager from '../CostManager';
import { Icon } from './icons';
import { initialsOf } from './taskMeta';
import { Field, rowSep, Sheet } from './ui';

declare const XLSX: any;

/**
 * Modern Ekip sekmesi: ekip listesi (kişi ekle/düzenle, havuzdan seç),
 * aylık katılım (adam/ay) planı ve ünvan maliyetleri.
 */

interface ModernTeamProps {
    resources: Resource[];
    tasks: Task[];
    people: Person[];
    canEdit: boolean;
    onUpdate: (resources: Resource[], tasks?: Task[]) => void;
    // Maliyet sekmesi (mevcut maliyet bileşeni)
    setResources: React.Dispatch<React.SetStateAction<Resource[]>>;
    titleCosts: Record<string, number>;
    setTitleCosts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    costTableColor: string;
}

type Tab = 'team' | 'plan' | 'cost';
const PALETTE = ['#0066D6', '#1F7A35', '#E07800', '#D70015', '#7C3AED', '#DB2777', '#475569'];

const PersonSheet: React.FC<{
    resource?: Resource;
    resources: Resource[];
    people: Person[];
    taskCount: number;
    onClose: () => void;
    onSave: (fields: { name: string; unit: string; title: string; participation: number; color?: string }) => void;
    onDelete?: () => void;
}> = ({ resource, resources, people, taskCount, onClose, onSave, onDelete }) => {
    const [name, setName] = useState(resource?.name || '');
    const [unit, setUnit] = useState(resource?.unit || '');
    const [title, setTitle] = useState(resource?.title || '');
    const [participation, setParticipation] = useState(resource?.participation ?? 100);
    const [color, setColor] = useState(resource?.color || '');
    const pool = useMemo(() => people.filter(p => !hasResourceNamed(resources, `${p.firstName} ${p.lastName}`)).sort((a, b) => a.firstName.localeCompare(b.firstName, 'tr')), [people, resources]);
    const duplicate = !!name.trim() && hasResourceNamed(resources.filter(r => r.id !== resource?.id), name);
    const valid = !!name.trim() && !!unit.trim() && !duplicate;

    return (
        <Sheet
            title={resource ? 'Kişiyi düzenle' : 'Ekibe kişi ekle'}
            onClose={onClose}
            footer={<>
                {onDelete && <button type="button" className="m-btn m-btn-danger" onClick={() => { if (window.confirm(taskCount ? `Bu kişiye ${taskCount} görev atanmış; görevler kişinin adıyla kalır. Ekipten çıkarılsın mı?` : 'Kişi ekipten çıkarılsın mı?')) onDelete(); }}>Ekipten çıkar</button>}
                <span className="flex-1"></span>
                <button type="button" className="m-btn m-btn-plain" onClick={onClose}>Vazgeç</button>
                <button type="button" className="m-btn m-btn-primary" disabled={!valid} onClick={() => onSave({ name: name.trim(), unit: unit.trim(), title: title.trim(), participation, color: color || undefined })}>{resource ? 'Kaydet' : 'Ekle'}</button>
            </>}
        >
            {!resource && pool.length > 0 && (
                <Field label="Personel havuzundan seç" htmlFor="tm-pool" hint="Ad, birim ve ünvan havuzdan dolar">
                    <select id="tm-pool" className="m-input" value="" onChange={e => {
                        const p = people.find(x => x.id === e.target.value);
                        if (!p) return;
                        const f = personToResourceFields(p);
                        setName(f.name); setUnit(f.unit); setTitle(f.title);
                    }}>
                        <option value="">Kişi seçin…</option>
                        {pool.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.departmentCode ? ` (${p.departmentCode})` : ''}</option>)}
                    </select>
                </Field>
            )}
            <Field label="Ad soyad" htmlFor="tm-name">
                <input id="tm-name" className="m-input" value={name} aria-invalid={duplicate} onChange={e => setName(e.target.value)} />
                {duplicate && <span role="alert" className="text-[13px] m-ink-bad">Bu adla ekipte biri var.</span>}
                {resource && name.trim() !== resource.name && !duplicate && taskCount > 0 && <span className="text-[13px] m-text-3">{taskCount} görevdeki atama da yeni ada geçer.</span>}
            </Field>
            <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="Birim" htmlFor="tm-unit">
                    <input id="tm-unit" className="m-input" value={unit} placeholder="Ör. U310" onChange={e => setUnit(e.target.value)} />
                </Field>
                <Field label="Ünvan" htmlFor="tm-title">
                    <input id="tm-title" className="m-input" value={title} placeholder="Uzman" onChange={e => setTitle(e.target.value)} />
                </Field>
            </div>
            <Field label={`Bu ayki katılım: %${participation}`} htmlFor="tm-part" hint="Kişinin sürüm kapasitesi bu orana göre hesaplanır (iş yükü görev eforudur)">
                <input id="tm-part" type="range" min={0} max={100} step={5} value={participation} onChange={e => setParticipation(parseInt(e.target.value, 10))} />
            </Field>
            <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold m-text-2">Renk</span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Renk">
                    <button type="button" aria-pressed={!color} aria-label="Renk yok" onClick={() => setColor('')} className="w-8 h-8 rounded-full m-fill border-0 cursor-pointer" style={!color ? { boxShadow: '0 0 0 2px var(--m-surface), 0 0 0 4px var(--m-accent)' } : undefined}></button>
                    {PALETTE.map(c => (
                        <button key={c} type="button" aria-pressed={color === c} aria-label={`Renk ${c}`} onClick={() => setColor(c)} className="w-8 h-8 rounded-full border-0 cursor-pointer" style={{ background: c, boxShadow: color === c ? '0 0 0 2px var(--m-surface), 0 0 0 4px var(--m-accent)' : undefined }}></button>
                    ))}
                </div>
            </div>
        </Sheet>
    );
};

const ModernTeam: React.FC<ModernTeamProps> = ({ resources, tasks, people, canEdit, onUpdate, setResources, titleCosts, setTitleCosts, costTableColor }) => {
    const [tab, setTab] = useState<Tab>('team');
    const [sheet, setSheet] = useState<{ resource?: Resource } | null>(null);
    const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const currentMonth = new Date().getMonth();
    const plans = useMemo(() => unitPlans(resources), [resources]);
    const totalAA = resources.reduce((s, r) => s + (r.participation || 0), 0) / 100;
    const sorted = useMemo(() => [...resources].sort((a, b) => (a.unit || '').localeCompare(b.unit || '', 'tr') || a.name.localeCompare(b.name, 'tr')), [resources]);

    const save = (fields: { name: string; unit: string; title: string; participation: number; color?: string }) => {
        if (sheet?.resource) {
            const r = sheet.resource;
            const out = updateResource(resources, tasks, r.id, { name: fields.name, unit: fields.unit, title: fields.title || 'Uzman', color: fields.color });
            const withPart = fields.participation !== r.participation ? setMonthlyValue(out.resources, r.id, currentMonth, fields.participation, currentMonth) : out.resources;
            onUpdate(withPart, out.tasks !== tasks ? out.tasks : undefined);
        } else {
            onUpdate([...resources, { ...createResource(fields.name, fields.unit, fields.title, fields.participation, currentMonth), color: fields.color }]);
        }
        setSheet(null);
    };

    const importExcel = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                if (typeof XLSX === 'undefined') throw new Error('Excel kütüphanesi yüklenemedi.');
                const wb = XLSX.read(reader.result, { type: 'binary' });
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
                const { resources: next, added, updated } = rowsToResourcePlan(rows, resources, currentMonth);
                onUpdate(next);
                setNotice({ kind: 'ok', text: `${added} kişi eklendi, ${updated} kişi güncellendi. Boş hücreler 0 sayıldı.` });
            } catch (e) {
                setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Excel okunamadı.' });
            }
        };
        reader.readAsBinaryString(file);
    };

    const heat = (total: number, capacity: number): React.CSSProperties | undefined =>
        total > capacity ? { background: 'var(--m-bad-tint)', color: 'var(--m-bad-ink)' } : undefined;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2.5">
                <div className="m-segmented" role="group" aria-label="Ekip görünümü">
                    {([['team', 'Ekip'], ['plan', 'Adam/ay planı'], ['cost', 'Maliyet']] as [Tab, string][]).map(([k, l]) => (
                        <button key={k} type="button" className="m-segment" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
                    ))}
                </div>
                <span className="text-[15px] m-text-2">{resources.length} kişi · {plans.length} birim · bu ay {totalAA.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} AA</span>
                <span className="flex-1"></span>
                {tab === 'plan' && (
                    <>
                        {canEdit && <button type="button" className="m-btn m-btn-gray" onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} />İçe aktar</button>}
                        <button type="button" className="m-btn m-btn-gray" onClick={() => exportResourcePlanToExcel(resources)} disabled={!resources.length}><Icon name="download" size={18} />Dışa aktar</button>
                        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importExcel(f); e.target.value = ''; }} />
                    </>
                )}
                {tab === 'team' && canEdit && (
                    <button type="button" className="m-btn m-btn-primary" onClick={() => setSheet({})}>
                        <Icon name="plus" size={18} strokeWidth={2.2} />
                        Kişi ekle
                    </button>
                )}
            </div>

            {notice && (
                <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${notice.kind === 'error' ? 'm-tone-bad' : 'm-tone-ok'}`}>
                    <span className="flex-1 text-[15px]">{notice.text}</span>
                    <button type="button" className="m-icon-btn" aria-label="Kapat" onClick={() => setNotice(null)}><Icon name="x" size={18} /></button>
                </div>
            )}

            {tab === 'team' && (resources.length === 0 ? (
                <div className="m-surface rounded-2xl px-5 py-12 flex flex-col items-center gap-2 text-center">
                    <span className="w-11 h-11 rounded-full m-tone-accent flex items-center justify-center"><Icon name="users" size={22} /></span>
                    <span className="text-[17px] font-semibold m-text">Ekip henüz tanımlı değil</span>
                    <span className="text-[15px] m-text-3 max-w-[52ch]">Kişileri personel havuzundan ekleyin; katılım oranları sürüm kapasitesini belirler.</span>
                    {canEdit && <button type="button" className="m-btn m-btn-primary mt-1" onClick={() => setSheet({})}><Icon name="plus" size={18} strokeWidth={2.2} />İlk kişiyi ekle</button>}
                </div>
            ) : (
                <div className="m-surface rounded-2xl p-1.5">
                    {sorted.map((r, i) => {
                        const sep = rowSep(i);
                        const c = resourceTaskCounts(r.name, tasks);
                        const body = (
                            <>
                                <span aria-hidden="true" className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-semibold flex-none" style={r.color ? { background: r.color, color: '#fff' } : { background: 'var(--m-fill)', color: 'var(--m-label-2)' }}>{initialsOf(r.name)}</span>
                                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <span className="text-[16px] font-semibold m-text truncate">{r.name}</span>
                                    <span className="text-[13px] m-text-3 truncate">{[r.title, r.unit].filter(Boolean).join(' · ')}</span>
                                </span>
                                <span className="hidden sm:flex flex-col items-end gap-1 w-40">
                                    <span className="text-[13px] m-text-2 m-tabular">Katılım %{r.participation}</span>
                                    <span aria-hidden="true" className="block w-full h-1.5 rounded-full m-fill overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, r.participation)}%`, background: 'var(--m-accent)' }}></span></span>
                                </span>
                                <span className="w-24 text-right text-[13px] m-tabular m-text-3">{c.open ? `${c.open} açık görev` : c.total ? 'görevleri bitti' : 'görev yok'}</span>
                            </>
                        );
                        return canEdit ? (
                            <button key={r.id} type="button" onClick={() => setSheet({ resource: r })} className={`m-row-link flex items-center gap-3 px-3 py-2.5 min-h-[64px] ${sep.className}`} style={sep.style}>
                                {body}
                                <span style={{ color: 'var(--m-chevron)' }}><Icon name="chevronRight" size={16} strokeWidth={2.2} /></span>
                            </button>
                        ) : (
                            <div key={r.id} className={`flex items-center gap-3 px-3 py-2.5 min-h-[64px] ${sep.className}`} style={sep.style}>{body}</div>
                        );
                    })}
                </div>
            ))}

            {tab === 'plan' && (
                <section aria-label="Adam/ay planı" className="m-surface rounded-2xl overflow-x-auto">
                    <table className="w-full border-collapse text-[14px]" style={{ minWidth: 980 }}>
                        <thead>
                            <tr className="m-text-3 text-[13px]">
                                <th scope="col" className="text-left font-semibold px-4 py-3 sticky left-0 m-surface">Kişi</th>
                                {MONTHS_SHORT.map((m, i) => (
                                    <th key={m} scope="col" className={`font-semibold px-1 py-3 text-center w-[64px] ${i === currentMonth ? 'm-accent' : ''}`}>{m}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {plans.map(g => (
                                <React.Fragment key={g.unit}>
                                    <tr className="m-fill-2">
                                        <th scope="rowgroup" className="text-left px-4 py-2 font-semibold m-text sticky left-0 m-fill-2">{g.unit} <span className="font-normal m-text-3">· {g.resources.length} kişi</span></th>
                                        {g.totals.map((t, i) => (
                                            <td key={i} className="text-center py-2 font-semibold m-tabular text-[13px]" style={heat(t, g.capacity)} title={t > g.capacity ? `Birim kapasitesi %${g.capacity} aşılıyor` : undefined}>%{t}</td>
                                        ))}
                                    </tr>
                                    {g.resources.map(r => (
                                        <tr key={r.id} className="border-t m-sep" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                                            <th scope="row" className="text-left px-4 py-1.5 font-normal sticky left-0 m-surface">
                                                <span className="flex flex-col">
                                                    <span className="m-text truncate max-w-[220px]">{r.name}</span>
                                                    <span className="text-[12px] m-text-3">{r.title}</span>
                                                </span>
                                            </th>
                                            {MONTHS_SHORT.map((m, i) => {
                                                const v = r.monthlyPlan?.[i] || 0;
                                                return (
                                                    <td key={m} className="px-1 py-1.5 text-center">
                                                        {canEdit ? (
                                                            <input
                                                                aria-label={`${r.name} ${m} katılımı`}
                                                                inputMode="numeric"
                                                                className="w-full h-9 rounded-lg text-center m-tabular border-0 m-text"
                                                                style={{ background: v > 100 ? 'var(--m-warn-tint)' : i === currentMonth ? 'var(--m-accent-tint)' : 'transparent', color: v > 100 ? 'var(--m-warn-ink)' : undefined }}
                                                                value={v || ''}
                                                                placeholder="0"
                                                                onChange={e => onUpdate(setMonthlyValue(resources, r.id, i, Math.max(0, Math.min(300, parseInt(e.target.value, 10) || 0)), currentMonth))}
                                                            />
                                                        ) : (
                                                            <span className="m-tabular m-text-2">{v ? `%${v}` : '—'}</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                            {plans.length === 0 && (
                                <tr><td colSpan={13} className="px-4 py-10 text-center m-text-3">Ekip tanımlı değil. Excel'den içe aktarabilir ya da Ekip sekmesinden kişi ekleyebilirsiniz.</td></tr>
                            )}
                        </tbody>
                    </table>
                    <p className="m-0 px-4 py-3 text-[13px] m-text-3 border-t m-sep" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                        Değerler yüzde (100 = tam zamanlı). Birim satırı, birim kapasitesini (kişi × %100) aşınca kırmızılaşır. İçinde bulunulan ayın değeri güncel katılımdır.
                    </p>
                </section>
            )}

            {tab === 'cost' && (
                <div className="m-legacy">
                    <CostManager resources={resources} setResources={setResources} titleCosts={titleCosts} setTitleCosts={setTitleCosts} costTableColor={costTableColor} />
                </div>
            )}

            {sheet && (
                <PersonSheet
                    resource={sheet.resource}
                    resources={resources}
                    people={people}
                    taskCount={sheet.resource ? resourceTaskCounts(sheet.resource.name, tasks).total : 0}
                    onClose={() => setSheet(null)}
                    onSave={save}
                    onDelete={sheet.resource ? () => { onUpdate(resources.filter(r => r.id !== sheet.resource!.id)); setSheet(null); } : undefined}
                />
            )}
        </div>
    );
};

export default ModernTeam;
