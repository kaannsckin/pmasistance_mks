import React, { useMemo, useState } from 'react';
import { KeyResult, Objective, Task, TaskStatus, View } from '../../types';
import { objectiveProgress, ObjectiveProgress, quarterLabel, unitProgress, unlinkedOpenTasks } from '../../utils/goals';
import { Icon } from './icons';
import { COLUMN_META, columnOf } from './taskMeta';
import { Card, Field, rowSep, Sheet } from './ui';

/**
 * Modern Hedefler (OKR) sekmesi. Her hedef bir kart: çeyrek, ilerleme ve
 * anahtar sonuçlar; anahtar sonuç açılınca bağlı görevler görünür. Düzenleme
 * tek tek hedef sayfasında yapılır (klasikteki "tümünü düzenle" yerine).
 */

interface ModernGoalsProps {
    objectives: Objective[];
    tasks: Task[];
    canEdit: boolean;
    onUpdateObjectives: (objectives: Objective[]) => void;
    onViewTask: (task: Task) => void;
    onNavigate: (view: View) => void;
}

const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const Bar: React.FC<{ pct: number | null; label: string }> = ({ pct, label }) => (
    <span role="img" aria-label={label} className="block h-2 rounded-full m-fill overflow-hidden">
        <span className="block h-full rounded-full" style={{ width: `${pct || 0}%`, background: pct === 100 ? 'var(--m-ok)' : 'var(--m-accent)' }}></span>
    </span>
);

const ObjectiveSheet: React.FC<{ objective?: Objective; linkedCount: (krId: string) => number; onClose: () => void; onSave: (o: Objective) => void; onDelete?: () => void }> = ({ objective, linkedCount, onClose, onSave, onDelete }) => {
    const [name, setName] = useState(objective?.name || '');
    const [quarter, setQuarter] = useState(objective?.quarter || quarterLabel());
    const [description, setDescription] = useState(objective?.description || '');
    const [krs, setKrs] = useState<KeyResult[]>(objective?.keyResults.length ? objective.keyResults : [{ id: newId('kr'), name: '' }]);
    const valid = name.trim() && krs.some(k => k.name.trim());

    const save = () => {
        if (!valid) return;
        onSave({
            id: objective?.id || newId('obj'),
            name: name.trim(),
            quarter: quarter.trim(),
            description: description.trim(),
            keyResults: krs.filter(k => k.name.trim()).map(k => ({ ...k, name: k.name.trim() })),
        });
    };

    return (
        <Sheet
            title={objective ? 'Hedefi düzenle' : 'Yeni hedef'}
            onClose={onClose}
            footer={<>
                {onDelete && <button type="button" className="m-btn m-btn-danger" onClick={() => { if (window.confirm('Hedef silinsin mi? Bağlı görevler hedefsiz kalır.')) onDelete(); }}>Sil</button>}
                <span className="flex-1"></span>
                <button type="button" className="m-btn m-btn-plain" onClick={onClose}>Vazgeç</button>
                <button type="button" className="m-btn m-btn-primary" disabled={!valid} onClick={save}>{objective ? 'Kaydet' : 'Ekle'}</button>
            </>}
        >
            <Field label="Hedef" htmlFor="og-name">
                <input id="og-name" className="m-input" autoFocus value={name} placeholder="Ör. Posta altyapısını yenile" onChange={e => setName(e.target.value)} />
            </Field>
            <div className="grid gap-3.5 sm:grid-cols-[140px_minmax(0,1fr)]">
                <Field label="Dönem" htmlFor="og-q">
                    <input id="og-q" className="m-input" value={quarter} placeholder="Q4 2026" onChange={e => setQuarter(e.target.value)} />
                </Field>
                <Field label="Açıklama" htmlFor="og-desc">
                    <input id="og-desc" className="m-input" value={description} placeholder="Neden önemli?" onChange={e => setDescription(e.target.value)} />
                </Field>
            </div>
            <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold m-text-2">Anahtar sonuçlar</span>
                {krs.map((kr, i) => (
                    <div key={kr.id} className="flex items-center gap-2">
                        <input aria-label={`Anahtar sonuç ${i + 1}`} className="m-input flex-1" value={kr.name} placeholder="Ölçülebilir sonuç: Ör. Kuyruk gecikmesi < 2 sn"
                            onChange={e => setKrs(krs.map(k => (k.id === kr.id ? { ...k, name: e.target.value } : k)))} />
                        {linkedCount(kr.id) > 0 && <span className="text-[12px] m-text-3 whitespace-nowrap">{linkedCount(kr.id)} görev</span>}
                        <button type="button" className="m-icon-btn" aria-label={`${kr.name || 'Anahtar sonuç'} kaldır`} disabled={krs.length === 1}
                            onClick={() => { if (!linkedCount(kr.id) || window.confirm('Bu anahtar sonuca bağlı görevler var; yine de kaldırılsın mı?')) setKrs(krs.filter(k => k.id !== kr.id)); }}>
                            <Icon name="x" size={18} />
                        </button>
                    </div>
                ))}
                <button type="button" className="m-btn m-btn-plain self-start" onClick={() => setKrs([...krs, { id: newId('kr'), name: '' }])}>
                    <Icon name="plus" size={16} strokeWidth={2.2} />
                    Anahtar sonuç ekle
                </button>
            </div>
        </Sheet>
    );
};

const ObjectiveCard: React.FC<{ g: ObjectiveProgress; tasks: Task[]; canEdit: boolean; onEdit: () => void; onViewTask: (t: Task) => void }> = ({ g, tasks, canEdit, onEdit, onViewTask }) => {
    const [open, setOpen] = useState<string | null>(null);
    return (
        <section aria-label={g.name} className="m-surface rounded-2xl p-5 flex flex-col gap-4 min-w-0">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex flex-col gap-1">
                    {g.quarter && <span className="self-start inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold m-tone-accent">{g.quarter}</span>}
                    <h2 className="m-0 text-[19px] leading-snug font-semibold m-text">{g.name}</h2>
                    {g.description && <p className="m-0 text-[14px] m-text-3">{g.description}</p>}
                </div>
                <div className="flex items-start gap-1 flex-none">
                    <span className="flex flex-col items-end">
                        <span className="text-[28px] leading-none font-bold m-tabular m-text">{g.progressPct === null ? '—' : `%${g.progressPct}`}</span>
                        <span className="text-[12px] m-text-3 mt-1">{g.linkedTasks ? `${g.doneTasks}/${g.linkedTasks} görev` : 'Bağlı görev yok'}</span>
                    </span>
                    {canEdit && <button type="button" className="m-icon-btn" aria-label={`${g.name} hedefini düzenle`} onClick={onEdit}><Icon name="pencil" size={18} /></button>}
                </div>
            </div>
            <Bar pct={g.progressPct} label={`${g.name}: %${g.progressPct || 0}`} />
            <div className="flex flex-col">
                {g.keyResults.map((kr, i) => {
                    const sep = rowSep(i);
                    const linked = tasks.filter(t => t.keyResultId === kr.id);
                    const isOpen = open === kr.id;
                    return (
                        <div key={kr.id} className={sep.className} style={sep.style}>
                            <button type="button" aria-expanded={isOpen} disabled={!linked.length} onClick={() => setOpen(isOpen ? null : kr.id)} className="m-row-link flex flex-col gap-1.5 py-2.5 px-1 rounded-lg disabled:cursor-default">
                                <span className="flex items-center gap-2">
                                    <span className="flex-1 min-w-0 text-[15px] m-text">{kr.name}</span>
                                    <span className="text-[13px] m-text-3 m-tabular whitespace-nowrap">{kr.total ? `${kr.done}/${kr.total}` : 'görev yok'}</span>
                                    {linked.length > 0 && <span style={{ color: 'var(--m-chevron)', transform: isOpen ? 'rotate(90deg)' : undefined }}><Icon name="chevronRight" size={16} strokeWidth={2.2} /></span>}
                                </span>
                                <Bar pct={kr.progressPct} label={`${kr.name}: %${kr.progressPct || 0}`} />
                            </button>
                            {isOpen && (
                                <div className="pl-3 pb-2 flex flex-col">
                                    {linked.map(t => (
                                        <button key={t.id} type="button" onClick={() => onViewTask(t)} className="m-row-link flex items-center gap-2.5 min-h-[40px] px-2 rounded-lg text-[14px]">
                                            <span aria-hidden="true" className="w-3 h-3 rounded-full flex-none" style={{ boxShadow: `inset 0 0 0 2px ${COLUMN_META[columnOf(t.status)].ring}`, background: COLUMN_META[columnOf(t.status)].fill }}></span>
                                            <span className={`flex-1 min-w-0 truncate ${columnOf(t.status) === TaskStatus.Done ? 'm-text-3 line-through' : 'm-text'}`}>{t.name}</span>
                                            <span className="text-[13px] m-text-3">{t.resourceName}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

const ModernGoals: React.FC<ModernGoalsProps> = ({ objectives, tasks, canEdit, onUpdateObjectives, onViewTask, onNavigate }) => {
    const goals = useMemo(() => objectiveProgress({ objectives, tasks }), [objectives, tasks]);
    const units = useMemo(() => unitProgress(tasks, objectives), [tasks, objectives]);
    const unlinked = useMemo(() => unlinkedOpenTasks(tasks, objectives), [tasks, objectives]);
    const [sheet, setSheet] = useState<{ objective?: Objective } | null>(null);
    const measured = goals.filter(g => g.progressPct !== null);
    const avg = measured.length ? Math.round(measured.reduce((s, g) => s + (g.progressPct || 0), 0) / measured.length) : null;
    const linkedCount = (krId: string) => tasks.filter(t => t.keyResultId === krId).length;

    const saveObjective = (o: Objective) => {
        onUpdateObjectives(objectives.some(x => x.id === o.id) ? objectives.map(x => (x.id === o.id ? o : x)) : [...objectives, o]);
        setSheet(null);
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 text-[15px] m-text-2">
                    {goals.length === 0 ? 'Henüz hedef yok.' : `${goals.length} hedef${avg !== null ? ` · ortalama ilerleme %${avg}` : ''}`}
                    {unlinked > 0 && goals.length > 0 && (
                        <> · <button type="button" className="bg-transparent border-0 p-0 m-accent font-semibold cursor-pointer text-[15px]" onClick={() => onNavigate(View.Tasks)}>{unlinked} açık görev hedefe bağlı değil</button></>
                    )}
                </p>
                {canEdit && (
                    <button type="button" className="m-btn m-btn-primary" onClick={() => setSheet({})}>
                        <Icon name="plus" size={18} strokeWidth={2.2} />
                        Yeni hedef
                    </button>
                )}
            </div>

            {goals.length === 0 ? (
                <div className="m-surface rounded-2xl px-5 py-12 flex flex-col items-center gap-2 text-center">
                    <span className="w-11 h-11 rounded-full m-tone-accent flex items-center justify-center"><Icon name="target" size={22} /></span>
                    <span className="text-[17px] font-semibold m-text">Projenin hedeflerini tanımlayın</span>
                    <span className="text-[15px] m-text-3 max-w-[52ch]">Her hedefe ölçülebilir anahtar sonuçlar ekleyin; görevleri anahtar sonuçlara bağladıkça ilerleme kendiliğinden hesaplanır.</span>
                    {canEdit && <button type="button" className="m-btn m-btn-primary mt-1" onClick={() => setSheet({})}><Icon name="plus" size={18} strokeWidth={2.2} />İlk hedefi ekle</button>}
                </div>
            ) : (
                <div className="grid gap-5 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))' }}>
                    {goals.map(g => (
                        <ObjectiveCard key={g.id} g={g} tasks={tasks} canEdit={canEdit} onViewTask={onViewTask} onEdit={() => setSheet({ objective: objectives.find(o => o.id === g.id) })} />
                    ))}
                </div>
            )}

            {units.length > 0 && (
                <Card title="Birimlerin katkısı" labelledBy="og-units" subtitle="Birim görevlerinin tamamlanma oranı ve katkı verdiği hedefler">
                    <div className="flex flex-col gap-1">
                        {units.map(u => (
                            <div key={u.unit} className="grid items-center gap-3 min-h-[48px]" style={{ gridTemplateColumns: 'minmax(90px, 160px) minmax(0, 1fr) 64px' }}>
                                <span className="flex flex-col min-w-0">
                                    <span className="text-[15px] m-text truncate">{u.unit}</span>
                                    <span className="text-[12px] m-text-3 truncate">{u.objectives.length ? u.objectives.join(', ') : `${u.done}/${u.total} görev`}</span>
                                </span>
                                <Bar pct={u.progressPct} label={`${u.unit}: %${u.progressPct}`} />
                                <span className="text-right text-[15px] font-semibold m-tabular m-text">%{u.progressPct}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {sheet && (
                <ObjectiveSheet
                    objective={sheet.objective}
                    linkedCount={linkedCount}
                    onClose={() => setSheet(null)}
                    onSave={saveObjective}
                    onDelete={sheet.objective ? () => { onUpdateObjectives(objectives.filter(o => o.id !== sheet.objective!.id)); setSheet(null); } : undefined}
                />
            )}
        </div>
    );
};

export default ModernGoals;
