import React, { useEffect, useMemo, useState } from 'react';
import { Project, ProjectRoleDef, TestBoardColumn, TestBoardItem, TestBoardSettings, TestColumnMeaning, TestRuleCondition, TestRuleField } from '../../../types';
import { fetchIntegrationHealth, fetchJiraMeta, JiraMeta } from '../../../utils/integrations';
import { CATEGORY_LABELS, columnOf, defaultTestSettings, describeCondition, FIELD_LABELS, MEANING_LABELS, TestRuleContext } from '../../../utils/testBoard';
import { Icon } from '../icons';
import { Field, Sheet } from '../ui';

/**
 * Test panosu ayarı: kayıtlı Jira filtresi ve kolonlar. Her kolonun kuralı
 * VE ile bağlı koşullardır; kart sıradaki ilk uyan kolona düşer. Her
 * kolonda şu anki kayıtlardan kaçının oraya düştüğü canlı gösterilir.
 */

interface Props {
    project: Project;
    items: TestBoardItem[];
    ctx: TestRuleContext;
    roleDefs: ProjectRoleDef[];
    initial?: TestBoardSettings;
    onClose: () => void;
    onSave: (s: TestBoardSettings) => void;
}

const FIELDS: TestRuleField[] = ['status', 'category', 'type', 'assignee', 'assigneeLead', 'assigneeRole', 'reporter', 'reporterRole', 'priority', 'component', 'label', 'reopened'];
const MEANINGS: (TestColumnMeaning | '')[] = ['', 'bugs', 'changes', 'reopened', 'waiting', 'testing', 'approved'];
const newColId = () => `col-${Math.random().toString(36).slice(2, 8)}`;

const TestSettingsSheet: React.FC<Props> = ({ project, items, ctx, roleDefs, initial, onClose, onSave }) => {
    const [s, setS] = useState<TestBoardSettings>(() => JSON.parse(JSON.stringify(initial || defaultTestSettings())));
    const [meta, setMeta] = useState<JiraMeta | null>(null);
    const [metaError, setMetaError] = useState<string | null>(null);
    const roleName = (id: string) => roleDefs.find(r => r.id === id)?.name || id;

    useEffect(() => {
        const c = new AbortController();
        fetchIntegrationHealth(c.signal).then(h => {
            if (!h.jira) { setMetaError('Jira bağlantısı bu sunucuda yapılandırılmamış.'); return; }
            return fetchJiraMeta(h.authMode, c.signal).then(m => {
                setMeta(m);
                // İlk kurulumda adında "testset" geçen favori filtre önerilir
                if (!initial) {
                    const f = m.filters.find(x => /testset/i.test(x.name));
                    if (f) setS(prev => (prev.filterId ? prev : { ...prev, filterId: f.id, filterName: f.name }));
                }
            });
        }).catch(e => { if ((e as Error)?.name !== 'AbortError') setMetaError(e instanceof Error ? e.message : String(e)); });
        return () => c.abort();
    }, [initial]);

    // Kolon başına şu an düşen kayıt (sıradaki ilk uyan)
    const counts = useMemo(() => {
        const n = new Map<string, number>();
        items.forEach(i => { const c = columnOf(s.columns, i, ctx); n.set(c, (n.get(c) || 0) + 1); });
        return n;
    }, [s.columns, items, ctx]);

    // Değer önerileri: kayıtlarda geçen değerler
    const suggestions = useMemo(() => {
        const uniq = (xs: string[]) => [...new Set(xs.map(x => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
        return {
            status: uniq([...items.map(i => i.status), 'Open', 'In Progress', 'Resolved', 'Reopened', 'Testing', 'Closed']),
            type: uniq([...items.map(i => i.type), 'Bug', 'Change Request', 'Task', 'Sub-task']),
            priority: uniq(items.map(i => i.priority)),
            assignee: uniq(items.map(i => i.assignee)),
            reporter: uniq(items.map(i => i.reporter)),
            component: uniq([...items.flatMap(i => i.components), ...(project.components || []).map(c => c.name)]),
            label: uniq(items.flatMap(i => i.labels)),
        } as Partial<Record<TestRuleField, string[]>>;
    }, [items, project.components]);

    const setCol = (id: string, patch: Partial<TestBoardColumn>) => setS(x => ({ ...x, columns: x.columns.map(c => (c.id === id ? { ...c, ...patch } : c)) }));
    const move = (idx: number, d: -1 | 1) => setS(x => {
        const cols = [...x.columns];
        const j = idx + d;
        if (j < 0 || j >= cols.length) return x;
        [cols[idx], cols[j]] = [cols[j], cols[idx]];
        return { ...x, columns: cols };
    });
    const problems = [
        !/^\d{1,12}$/.test(s.filterId.trim()) ? 'Kayıtlı filtreyi seçin ya da numarasını girin.' : '',
        !s.columns.length ? 'En az bir kolon ekleyin.' : '',
        s.columns.some(c => !c.name.trim()) ? 'Her kolona ad verin.' : '',
    ].filter(Boolean);
    const filterName = meta?.filters.find(f => f.id === s.filterId.trim())?.name || (initial?.filterId === s.filterId.trim() ? initial.filterName : undefined);

    return (
        <Sheet xxl title="Test panosu: kolonlar ve kurallar" subtitle="Kart, sıradaki ilk uyan kolona düşer; kolonları yukarı/aşağı taşıyarak sırayı belirleyin. Bir kolonun koşullarının hepsi sağlanmalıdır." onClose={onClose}
            footer={(
                <>
                    <span className="flex-1 text-[13px] m-ink-bad">{problems.join(' ')}</span>
                    <button type="button" className="m-btn m-btn-plain" onClick={() => { if (window.confirm('Kolonlar varsayılana dönsün mü?')) setS(x => ({ ...x, columns: defaultTestSettings().columns })); }}>Varsayılan kolonlar</button>
                    <button type="button" className="m-btn m-btn-gray" onClick={onClose}>Vazgeç</button>
                    <button type="button" className="m-btn m-btn-primary" disabled={problems.length > 0}
                        onClick={() => onSave({ ...s, filterId: s.filterId.trim(), ...(filterName ? { filterName } : {}), columns: s.columns.map(c => ({ ...c, name: c.name.trim() })), since: s.since || new Date().toISOString() })}>
                        <Icon name="check" size={16} />Kaydet
                    </button>
                </>
            )}>
            <Field label="Kayıtlı Jira filtresi" htmlFor="tb-filter" hint={metaError || 'Filtredeki açık ve kapalı tüm kayıtlar okunur (en çok 2.000). Listede yalnız Jira\'da favorilerinize eklediğiniz filtreler görünür; yoksa filtre numarasını girin.'}>
                <div className="flex flex-wrap gap-2">
                    <select id="tb-filter" className="m-input !w-auto min-w-[240px]" value={meta?.filters.some(f => f.id === s.filterId) ? s.filterId : ''} onChange={e => { const f = meta?.filters.find(x => x.id === e.target.value); if (f) setS(x => ({ ...x, filterId: f.id, filterName: f.name })); }}>
                        <option value="">{meta ? (meta.filters.length ? 'Favori filtre seçin…' : 'Favori filtre yok') : 'Filtreler yükleniyor…'}</option>
                        {(meta?.filters || []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <input aria-label="Filtre numarası" className="m-input !w-[160px]" inputMode="numeric" placeholder="Filtre no (ör. 12345)" value={s.filterId} onChange={e => setS(x => ({ ...x, filterId: e.target.value.replace(/\D/g, '').slice(0, 12), filterName: undefined }))} />
                </div>
            </Field>

            <div className="flex flex-col gap-3">
                {s.columns.map((c, idx) => (
                    <div key={c.id} className="m-surface rounded-2xl px-4 py-3 flex flex-col gap-2.5 border m-sep" style={{ borderStyle: 'solid', borderWidth: 1 }}>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="w-6 text-[13px] font-bold m-text-3 m-tabular">{idx + 1}.</span>
                            <input aria-label="Kolon adı" className="m-input !h-9 !py-0 !w-[220px] text-[14.5px] font-semibold" value={c.name} maxLength={40} onChange={e => setCol(c.id, { name: e.target.value })} />
                            <select aria-label="Raporda" className="m-input !h-9 !py-0 !w-auto text-[14px]" value={c.meaning || ''} onChange={e => setCol(c.id, { meaning: (e.target.value || undefined) as TestColumnMeaning | undefined })}>
                                {MEANINGS.map(m => <option key={m} value={m}>{m ? `Raporda: ${MEANING_LABELS[m]}` : 'Raporda özel anlamı yok'}</option>)}
                            </select>
                            <span className="text-[13.5px] m-text-2">şu an <b className="m-tabular m-text">{counts.get(c.id) || 0}</b> kayıt</span>
                            <span className="ml-auto flex gap-0.5">
                                <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${c.name} kolonunu yukarı taşı`} disabled={idx === 0} onClick={() => move(idx, -1)}><Icon name="arrowUp" size={14} /></button>
                                <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${c.name} kolonunu aşağı taşı`} disabled={idx === s.columns.length - 1} onClick={() => move(idx, 1)}><Icon name="arrowDown" size={14} /></button>
                                <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${c.name} kolonunu sil`} onClick={() => setS(x => ({ ...x, columns: x.columns.filter(y => y.id !== c.id) }))}><Icon name="trash" size={14} /></button>
                            </span>
                        </div>
                        {c.when.map((w, wi) => (
                            <ConditionRow key={wi} value={w} roleDefs={roleDefs} components={(project.components || []).map(x => x.name)} suggestions={suggestions[w.field] || []}
                                onChange={nw => setCol(c.id, { when: c.when.map((x, j) => (j === wi ? nw : x)) })}
                                onRemove={() => setCol(c.id, { when: c.when.filter((_, j) => j !== wi) })} />
                        ))}
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" className="m-btn m-btn-plain !min-h-[30px] text-[13.5px]" onClick={() => setCol(c.id, { when: [...c.when, { field: 'status', values: [] }] })}><Icon name="plus" size={13} />Koşul ekle</button>
                            <span className="text-[12.5px] m-text-3">{c.when.length ? c.when.map(w => describeCondition(w, roleName)).join(' ve ') : 'Koşulsuz: önceki kolonlara uymayan her kayıt buraya düşer.'}</span>
                        </div>
                    </div>
                ))}
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="m-btn m-btn-gray !min-h-[36px] self-start" onClick={() => setS(x => ({ ...x, columns: [...x.columns, { id: newColId(), name: 'Yeni kolon', when: [] }] }))}><Icon name="plus" size={15} />Kolon ekle</button>
                    {(counts.get('') || 0) > 0 && <span className="text-[13.5px] m-ink-warn flex items-center gap-1.5"><Icon name="alert" size={14} />{counts.get('')} kayıt hiçbir kolona uymuyor (panoda "Eşleşmeyen")</span>}
                </div>
                <p className="m-0 text-[12.5px] m-text-3">Rol koşulları kişiyi Veri Havuzu'ndaki adıyla eşler: test ekibini Proje ayarları › Roller'de "Test" rolüne, bileşen liderini Proje ayarları › Bileşenler'de tanımlayın. Jira'daki ad ile havuzdaki ad aynı olmalıdır.</p>
            </div>
        </Sheet>
    );
};

const ConditionRow: React.FC<{
    value: TestRuleCondition; roleDefs: ProjectRoleDef[]; components: string[]; suggestions: string[];
    onChange: (c: TestRuleCondition) => void; onRemove: () => void;
}> = ({ value, roleDefs, components, suggestions, onChange, onRemove }) => {
    const [text, setText] = useState('');
    const toggle = (v: string) => onChange({ ...value, values: value.values.includes(v) ? value.values.filter(x => x !== v) : [...value.values, v] });
    const add = () => { const v = text.trim(); if (v && !value.values.includes(v)) onChange({ ...value, values: [...value.values, v] }); setText(''); };
    const options: { value: string; label: string }[] | null =
        value.field === 'category' ? Object.entries(CATEGORY_LABELS).map(([k, l]) => ({ value: k, label: l }))
            : value.field === 'assigneeRole' || value.field === 'reporterRole' ? roleDefs.map(r => ({ value: r.id, label: r.name }))
                : value.field === 'assigneeLead' ? components.map(c => ({ value: c, label: c }))
                    : value.field === 'reopened' ? [] : null;
    const pills = options ?? [...new Set([...value.values, ...suggestions])].slice(0, 30).map(v => ({ value: v, label: v }));
    return (
        <div className="flex flex-wrap items-start gap-2 pl-8">
            <select aria-label="Alan" className="m-input !h-9 !py-0 !w-auto text-[14px]" value={value.field} onChange={e => onChange({ field: e.target.value as TestRuleField, values: [], ...(value.not ? { not: true } : {}) })}>
                {FIELDS.map(f => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
            </select>
            <select aria-label="Koşul" className="m-input !h-9 !py-0 !w-auto text-[14px]" value={value.not ? 'not' : 'is'} onChange={e => onChange({ ...value, not: e.target.value === 'not' || undefined })}>
                <option value="is">{value.field === 'reopened' ? 'evet' : value.field === 'assigneeLead' ? 'olan' : 'şunlardan biri'}</option>
                <option value="not">{value.field === 'reopened' ? 'hayır' : value.field === 'assigneeLead' ? 'olmayan' : 'şunlardan biri değil'}</option>
            </select>
            <div className="flex-1 min-w-[260px] flex flex-wrap items-center gap-1.5">
                {pills.map(p => {
                    const on = value.values.includes(p.value);
                    return <button key={p.value} type="button" className={`m-pill !min-h-[30px] text-[13px] ${on ? 'is-active' : ''}`} aria-pressed={on} onClick={() => toggle(p.value)}>{p.label}</button>;
                })}
                {value.field === 'assigneeLead' && <span className="text-[12.5px] m-text-3">{components.length ? 'Seçim yoksa herhangi bir bileşenin lideri.' : 'Projede bileşen lideri tanımlı değil (Proje ayarları › Bileşenler).'}</span>}
                {!options && (
                    <input aria-label="Değer ekle" className="m-input !h-8 !py-0 !w-[160px] text-[13.5px]" placeholder="Değer yazıp Enter" value={text}
                        onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} />
                )}
            </div>
            <button type="button" className="m-icon-btn !w-8 !h-8" aria-label="Koşulu sil" onClick={onRemove}><Icon name="x" size={14} /></button>
        </div>
    );
};

export default TestSettingsSheet;
