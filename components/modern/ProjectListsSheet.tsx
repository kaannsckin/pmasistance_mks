import React, { useState } from 'react';
import { Person, Project, ProjectComponent, ProjectProgressModel, ProjectRoleDef, ProjectVersion, Task, WorkflowConfig } from '../../types';
import { hasProgressWeights, isProgressPercent, progressOf } from '../../utils/progress';
import { ProgressWeightsEditor } from './dashboard/DashboardSettings';
import {
    componentUsage, listId, listProblems, listSuggestions, releaseVersion, renameComponentInTasks, renameVersionInTasks, VERSION_STATUS_LABELS, versionProgress,
} from '../../utils/projectLists';
import { Icon } from './icons';
import { Sheet } from './ui';

/**
 * Projenin bileşen ve sürüm listeleri (Jira "Components" ve "Releases").
 * Değişiklikler taslakta yapılır; "Kaydet" ile görev başvurularıyla birlikte yazılır.
 */

const STATUS_TONE: Record<ProjectVersion['status'], string> = { unreleased: 'm-tone-accent', released: 'm-tone-ok', archived: 'm-fill-2 m-text-2' };

const ProjectListsSheet: React.FC<{
    project: Project;
    people: string[];
    canEdit: boolean;
    onClose: () => void;
    onSave: (patch: { components: ProjectComponent[]; versions: ProjectVersion[]; tasks: Task[]; roleMembers?: Project['roleMembers']; progressModel?: ProjectProgressModel }, summary: string) => void;
    /** Projenin iş akışı (ilerleme yüzdeleri durum başına girilir) */
    workflow?: WorkflowConfig;
    /** Proje rolleri: tanımlar (yönetici) ve üye seçilecek havuz */
    roleDefs?: ProjectRoleDef[];
    pool?: Person[];
    initialTab?: 'components' | 'versions' | 'roles' | 'progress';
}> = ({ project, people, canEdit, onClose, onSave, roleDefs = [], pool = [], workflow, initialTab }) => {
    const [tab, setTab] = useState<'components' | 'versions' | 'roles' | 'progress'>(initialTab || 'versions');
    const [progressModel, setProgressModel] = useState<ProjectProgressModel | undefined>(() => project.progressModel && JSON.parse(JSON.stringify(project.progressModel)));
    const cleanModel: ProjectProgressModel | undefined = (() => {
        const m: ProjectProgressModel = { ...(hasProgressWeights(progressModel?.weights) ? { weights: progressModel!.weights } : {}), ...(progressModel?.basis === 'effort' ? { basis: 'effort' as const } : {}) };
        return Object.keys(m).length ? m : undefined;
    })();
    const modelChanged = JSON.stringify(cleanModel || null) !== JSON.stringify(project.progressModel || null);
    const invalidWeights = [...Object.values(progressModel?.weights?.categories || {}), ...Object.values(progressModel?.weights?.statuses || {})].some(v => !isProgressPercent(v));
    const [members, setMembers] = useState<Record<string, string[]>>(() => JSON.parse(JSON.stringify(project.roleMembers || {})));
    const personName = (id: string) => { const p = pool.find(x => x.id === id); return p ? `${p.firstName} ${p.lastName}`.trim() : id; };
    const [components, setComponents] = useState<ProjectComponent[]>(() => JSON.parse(JSON.stringify(project.components || [])));
    const [versions, setVersions] = useState<ProjectVersion[]>(() => JSON.parse(JSON.stringify(project.versions || [])));
    const [tasks, setTasks] = useState<Task[]>(project.tasks);
    const [log, setLog] = useState<string[]>([]);
    const [releasing, setReleasing] = useState<{ id: string; moveTo: string } | null>(null);
    const [showArchived, setShowArchived] = useState(false);
    const errors = listProblems(components, versions);
    const sugg = listSuggestions({ tasks, components, versions });
    const note = (s: string) => setLog(l => [...l, s]);

    const addComponent = (name = 'Yeni bileşen') => setComponents(c => [...c, { id: listId('bil'), name }]);
    const addVersion = (name = `Sürüm ${versions.length + 1}`) => setVersions(v => [...v, { id: listId('sur'), name, status: 'unreleased' }]);
    const renameComponent = (c: ProjectComponent, name: string) => {
        setComponents(list => list.map(x => (x.id === c.id ? { ...x, name } : x)));
    };
    const commitComponentName = (c: ProjectComponent, oldName: string) => {
        if (oldName !== c.name && c.name.trim()) { setTasks(t => renameComponentInTasks(t, oldName, c.name.trim())); note(`bileşen "${oldName}" → "${c.name.trim()}"`); }
    };
    const commitVersionName = (v: ProjectVersion, oldName: string) => {
        if (oldName !== v.name && v.name.trim()) { setTasks(t => renameVersionInTasks(t, oldName, v.name.trim())); note(`sürüm "${oldName}" → "${v.name.trim()}"`); }
    };
    const removeComponent = (c: ProjectComponent) => {
        const n = componentUsage(tasks, c.name);
        if (n && !window.confirm(`"${c.name}" ${n} görevde kullanılıyor; görevlerden de çıkarılsın mı?`)) return;
        setComponents(list => list.filter(x => x.id !== c.id));
        setTasks(t => renameComponentInTasks(t, c.name, null));
        note(`bileşen silindi: ${c.name}`);
    };
    const removeVersion = (v: ProjectVersion) => {
        const n = versionProgress(tasks, v).total;
        if (n && !window.confirm(`"${v.name}" ${n} görevin hedef sürümü; görevlerden çıkarılsın mı?`)) return;
        setVersions(list => list.filter(x => x.id !== v.id));
        setTasks(t => renameVersionInTasks(t, v.name, null));
        note(`sürüm silindi: ${v.name}`);
    };
    const doRelease = () => {
        if (!releasing) return;
        const target = versions.find(x => x.id === releasing.moveTo);
        const r = releaseVersion({ tasks, versions }, releasing.id, target?.name || null);
        setTasks(r.tasks);
        setVersions(r.versions);
        const v = versions.find(x => x.id === releasing.id);
        note(`sürüm yayınlandı: ${v?.name}${r.moved ? ` (${r.moved} açık iş ${target ? `"${target.name}" sürümüne taşındı` : 'sürümden çıkarıldı'})` : ''}`);
        setReleasing(null);
    };
    const setV = (id: string, patch: Partial<ProjectVersion>) => setVersions(list => list.map(x => (x.id === id ? { ...x, ...patch } : x)));

    const visibleVersions = versions.filter(v => showArchived || v.status !== 'archived');
    const cleanMembers: Record<string, string[]> = Object.fromEntries((Object.entries(members) as [string, string[]][]).filter(([, v]) => v.length));
    const membersChanged = JSON.stringify(cleanMembers) !== JSON.stringify(Object.fromEntries((Object.entries(project.roleMembers || {}) as [string, string[]][]).filter(([, v]) => v.length)));
    const dirty = log.length > 0 || membersChanged || modelChanged || JSON.stringify(components) !== JSON.stringify(project.components || []) || JSON.stringify(versions) !== JSON.stringify(project.versions || []);

    return (
        <Sheet xl title={`Proje ayarları: ${project.name}`} subtitle="Jira'daki gibi: sürüm = görevlerin hedef sürümü ve yayın planı, bileşen = projenin modülü (sorumlusu olabilir), rol = bu projede kimin hangi ekipte olduğu (geçiş kuralları ve bildirimler role göre çalışır)."
            onClose={onClose}
            footer={canEdit ? (
                <>
                    {errors.length ? <span role="alert" className="flex-1 text-[13px] m-ink-bad">{errors[0]}</span> : <span className="flex-1 text-[13px] m-text-3">{log.length ? `Bekleyen: ${log.join('; ')}` : 'Değişiklikler "Kaydet" ile görevlerle birlikte yazılır.'}</span>}
                    <button type="button" className="m-btn m-btn-gray" onClick={onClose}>Vazgeç</button>
                    <button type="button" className="m-btn m-btn-primary" disabled={!!errors.length || !dirty || invalidWeights} onClick={() => onSave({ components, versions, tasks, roleMembers: Object.keys(cleanMembers).length ? cleanMembers : undefined, progressModel: cleanModel }, [...log, ...(membersChanged ? ['rol üyeleri güncellendi'] : []), ...(modelChanged ? ['ilerleme modeli güncellendi'] : [])].join('; ') || 'liste güncellendi')}><Icon name="check" size={16} />Kaydet</button>
                </>
            ) : undefined}>
            <div role="tablist" className="flex gap-1 p-1 rounded-xl m-fill-2 self-start">
                {([['versions', `Sürümler (${versions.length})`], ['components', `Bileşenler (${components.length})`], ['roles', `Roller (${Object.values(cleanMembers).reduce((n: number, l: string[]) => n + l.length, 0)} üye)`], ...(workflow ? [['progress', 'İlerleme'] as const] : [])] as const).map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                        className={`h-8 px-3 rounded-lg border-0 cursor-pointer text-[14px] ${tab === k ? 'm-surface font-semibold m-text' : 'bg-transparent m-text-2'}`}>{l}</button>
                ))}
            </div>

            {tab === 'versions' && (
                <div className="flex flex-col gap-2">
                    {releasing && (() => {
                        const v = versions.find(x => x.id === releasing.id)!;
                        const pr = versionProgress(tasks, v);
                        return (
                            <div role="dialog" aria-label="Sürümü yayınla" className="m-tone-accent rounded-xl p-3 flex flex-wrap items-center gap-2 text-[14px]">
                                <b>"{v.name}" yayınlanacak.</b>
                                {pr.open ? <>
                                    <span>{pr.open} bitmemiş iş:</span>
                                    <select aria-label="Açık işler" className="m-input !h-8 !py-0 !w-auto text-[13px]" value={releasing.moveTo} onChange={e => setReleasing({ ...releasing, moveTo: e.target.value })}>
                                        <option value="">sürümden çıkar</option>
                                        {versions.filter(x => x.id !== v.id && x.status === 'unreleased').map(x => <option key={x.id} value={x.id}>"{x.name}" sürümüne taşı</option>)}
                                    </select>
                                </> : <span>Tüm işler tamamlanmış.</span>}
                                <span className="flex-1"></span>
                                <button type="button" className="m-btn m-btn-plain !min-h-[32px] !px-2.5 text-[13px]" onClick={() => setReleasing(null)}>Vazgeç</button>
                                <button type="button" className="m-btn m-btn-primary !min-h-[32px] !px-3 text-[13px]" onClick={doRelease}>Yayınla</button>
                            </div>
                        );
                    })()}
                    <div className="grid gap-2 px-1 text-[12px] font-semibold m-text-3" style={{ gridTemplateColumns: 'minmax(140px,1.2fr) 130px 130px minmax(160px,1fr) 110px auto' }}>
                        <span>Ad</span><span>Başlangıç</span><span>Yayın tarihi</span><span>İlerleme</span><span>Durum</span><span></span>
                    </div>
                    {visibleVersions.length === 0 && <p className="m-0 py-3 text-[14px] m-text-3">Henüz sürüm yok.</p>}
                    {visibleVersions.map(v => {
                        const pr = versionProgress(tasks, v, undefined, cleanModel);
                        const pct = pr.pct;
                        return (
                            <div key={v.id} className="grid gap-2 items-center py-1.5 border-t m-sep" style={{ gridTemplateColumns: 'minmax(140px,1.2fr) 130px 130px minmax(160px,1fr) 110px auto', borderTopStyle: 'solid', borderTopWidth: 1 }}>
                                <input aria-label="Sürüm adı" className="m-input !h-9 !py-0 text-[14px]" value={v.name} disabled={!canEdit} maxLength={60}
                                    onFocus={e => (e.currentTarget.dataset.old = v.name)} onChange={e => setV(v.id, { name: e.target.value })} onBlur={e => commitVersionName(v, e.currentTarget.dataset.old || v.name)} />
                                <input type="date" aria-label="Başlangıç" className="m-input !h-9 !py-0 text-[13px]" value={v.startDate || ''} disabled={!canEdit} onChange={e => setV(v.id, { startDate: e.target.value || undefined })} />
                                <input type="date" aria-label="Yayın tarihi" className={`m-input !h-9 !py-0 text-[13px] ${pr.late ? 'm-ink-bad' : ''}`} value={v.releaseDate || ''} disabled={!canEdit} onChange={e => setV(v.id, { releaseDate: e.target.value || undefined })} />
                                <span className="flex items-center gap-2 text-[12.5px] m-text-2" title={`${pr.done} tamamlandı, ${pr.open} açık`}>
                                    <span className="flex-1 h-1.5 rounded-full m-fill overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--m-ok)' }}></span></span>
                                    <span className="m-tabular whitespace-nowrap">{cleanModel?.weights ? `%${pct} · ` : ''}{pr.done}/{pr.total}</span>
                                    {pr.late && <span className="m-ink-bad font-semibold">gecikti</span>}
                                </span>
                                <span className={`inline-flex items-center justify-center h-6 px-2 rounded-full text-[12px] font-semibold ${STATUS_TONE[v.status]}`}>{VERSION_STATUS_LABELS[v.status]}</span>
                                {canEdit ? (
                                    <span className="flex gap-0.5 justify-end">
                                        {v.status === 'unreleased' && <button type="button" className="m-btn m-btn-plain !min-h-[30px] !px-2 text-[13px]" onClick={() => setReleasing({ id: v.id, moveTo: versions.find(x => x.id !== v.id && x.status === 'unreleased')?.id || '' })}>Yayınla</button>}
                                        {v.status === 'released' && <button type="button" className="m-btn m-btn-plain !min-h-[30px] !px-2 text-[13px]" onClick={() => { setV(v.id, { status: 'archived' }); note(`sürüm arşivlendi: ${v.name}`); }}>Arşivle</button>}
                                        {v.status !== 'unreleased' && <button type="button" className="m-btn m-btn-plain !min-h-[30px] !px-2 text-[13px]" onClick={() => { setV(v.id, { status: 'unreleased', releasedAt: undefined }); note(`sürüm geri alındı: ${v.name}`); }}>Geri al</button>}
                                        <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${v.name} sürümünü sil`} onClick={() => removeVersion(v)}><Icon name="trash" size={14} /></button>
                                    </span>
                                ) : <span></span>}
                            </div>
                        );
                    })}
                    <div className="flex flex-wrap items-center gap-1.5">
                        {canEdit && <button type="button" className="m-btn m-btn-gray !min-h-[34px] !px-3 text-[14px]" onClick={() => addVersion()}><Icon name="plus" size={14} />Sürüm ekle</button>}
                        {canEdit && sugg.versions.length > 0 && <span className="text-[13px] m-text-3 ml-2">Görevlerde geçen (Jira dahil):</span>}
                        {canEdit && sugg.versions.map(s => <button key={s.name} type="button" className="m-pill" onClick={() => addVersion(s.name)}><Icon name="plus" size={12} />{s.name} <span className="m-text-3">{s.count}</span></button>)}
                        {versions.some(v => v.status === 'archived') && <label className="ml-auto flex items-center gap-1.5 text-[13px] m-text-2"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />Arşivlenenleri göster</label>}
                    </div>
                </div>
            )}

            {tab === 'roles' && (
                <div className="flex flex-col gap-2">
                    {roleDefs.length === 0 && <p className="m-0 text-[14px] m-text-3">Tanımlı proje rolü yok (yönetici konsolu › Proje yapılandırması).</p>}
                    {roleDefs.map(d => {
                        const ids = members[d.id] || [];
                        return (
                            <div key={d.id} className="grid gap-3 items-start py-2 border-t m-sep" style={{ gridTemplateColumns: 'minmax(140px, 200px) 1fr', borderTopStyle: 'solid', borderTopWidth: 1 }}>
                                <span className="flex flex-col"><span className="text-[15px] font-semibold m-text">{d.name}</span>{d.description && <span className="text-[12.5px] m-text-3">{d.description}</span>}</span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {ids.map(id => (
                                        <span key={id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full m-fill-2 text-[13px] m-text">
                                            {personName(id)}
                                            {canEdit && <button type="button" className="m-icon-btn !w-5 !h-5" aria-label={`${personName(id)} kişisini ${d.name} rolünden çıkar`} onClick={() => setMembers(m => ({ ...m, [d.id]: (m[d.id] || []).filter(x => x !== id) }))}><Icon name="x" size={11} /></button>}
                                        </span>
                                    ))}
                                    {ids.length === 0 && <span className="text-[13px] m-text-3">Üye yok</span>}
                                    {canEdit && (
                                        <select aria-label={`${d.name} rolüne kişi ekle`} className="m-input !h-8 !py-0 !w-auto text-[13px]" value="" onChange={e => e.target.value && setMembers(m => ({ ...m, [d.id]: [...(m[d.id] || []), e.target.value] }))}>
                                            <option value="">+ Kişi ekle…</option>
                                            {pool.filter(p => !ids.includes(p.id)).map(p => <option key={p.id} value={p.id}>{`${p.firstName} ${p.lastName}`.trim()}{p.departmentCode ? ` · ${p.departmentCode}` : ''}</option>)}
                                        </select>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    <p className="m-0 text-[12.5px] m-text-3">Rol tanımlarını yönetici yapar; üyeleri her projede ayrıca atanır. Örn. "Testte → Çözüldü" geçişi yalnız <b>Test</b> rolüne açıksa, bu projede yalnız buraya eklenen kişiler yapabilir.</p>
                </div>
            )}

            {tab === 'progress' && workflow && (() => {
                const before = progressOf(project.tasks, project.progressModel);
                const after = progressOf(project.tasks, cleanModel);
                return (
                    <div className="flex flex-col gap-4">
                        <p className="m-0 text-[14px] m-text-2">Varsayılan ilerleme yalnız <b>Tamamlandı</b> durumunu sayar. Burada yoldaki her duruma tamamlanma yüzdesi verin (ör. geliştirme bitip <b>Testte</b> olan iş %75). Proje genel bakışı, sprint ve sürüm ilerlemesi, dashboard, raporlar ve asistan bu yüzdeleri kullanır.</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl m-fill-2 p-3">
                                <div className="text-[12.5px] m-text-3">Proje ilerlemesi</div>
                                <div className="text-[22px] font-bold m-tabular m-text">%{before.pct}{after.pct !== before.pct && <span className="m-accent"> → %{after.pct}</span>}</div>
                                <div className="text-[12.5px] m-text-3">{after.done} / {after.total} kayıt tamamlandı</div>
                            </div>
                            <fieldset className="m-0 rounded-xl m-fill-2 p-3 border-0 flex flex-col gap-1.5">
                                <legend className="sr-only">Ağırlık</legend>
                                <span className="text-[12.5px] m-text-3">Her kayıt</span>
                                <label className="flex items-center gap-2 text-[14px]"><input type="radio" name="progress-basis" disabled={!canEdit} checked={progressModel?.basis !== 'effort'} onChange={() => setProgressModel(m => ({ ...m, basis: undefined }))} />eşit sayılır (adet)</label>
                                <label className="flex items-center gap-2 text-[14px]"><input type="radio" name="progress-basis" disabled={!canEdit} checked={progressModel?.basis === 'effort'} onChange={() => setProgressModel(m => ({ ...m, basis: 'effort' }))} />eforuyla ağırlıklı (büyük iş daha çok sayar)</label>
                            </fieldset>
                        </div>
                        <fieldset disabled={!canEdit} className="m-0 p-0 border-0">
                            <ProgressWeightsEditor project={project} workflow={workflow} value={progressModel?.weights} title="Durum yüzdeleri"
                                hint="Ayrıntılı durum yüzdesi boşsa kategori yüzdesi kullanılır. Tamamlanan iş her zaman %100."
                                onChange={weights => setProgressModel(m => ({ ...m, weights }))} />
                        </fieldset>
                        {invalidWeights && <p role="alert" className="m-0 text-[13px] m-ink-bad">Yüzdeler 0 ile 100 arasında olmalı.</p>}
                    </div>
                );
            })()}

            {tab === 'components' && (
                <div className="flex flex-col gap-2">
                    <div className="grid gap-2 px-1 text-[12px] font-semibold m-text-3" style={{ gridTemplateColumns: 'minmax(140px,1fr) minmax(160px,1.2fr) 180px 150px 60px 36px' }}>
                        <span>Ad</span><span>Açıklama</span><span>Sorumlu</span><span>Varsayılan atanan</span><span>Görev</span><span></span>
                    </div>
                    {components.length === 0 && <p className="m-0 py-3 text-[14px] m-text-3">Henüz bileşen yok.</p>}
                    {components.map(c => (
                        <div key={c.id} className="grid gap-2 items-center py-1.5 border-t m-sep" style={{ gridTemplateColumns: 'minmax(140px,1fr) minmax(160px,1.2fr) 180px 150px 60px 36px', borderTopStyle: 'solid', borderTopWidth: 1 }}>
                            <input aria-label="Bileşen adı" className="m-input !h-9 !py-0 text-[14px]" value={c.name} disabled={!canEdit} maxLength={60}
                                onFocus={e => (e.currentTarget.dataset.old = c.name)} onChange={e => renameComponent(c, e.target.value)} onBlur={e => commitComponentName(c, e.currentTarget.dataset.old || c.name)} />
                            <input aria-label="Açıklama" className="m-input !h-9 !py-0 text-[13px]" value={c.description || ''} disabled={!canEdit} onChange={e => setComponents(l => l.map(x => (x.id === c.id ? { ...x, description: e.target.value || undefined } : x)))} />
                            <select aria-label="Sorumlu" className="m-input !h-9 !py-0 text-[13px]" value={c.lead || ''} disabled={!canEdit} onChange={e => setComponents(l => l.map(x => (x.id === c.id ? { ...x, lead: e.target.value || undefined, assignLead: e.target.value ? x.assignLead : undefined } : x)))}>
                                <option value="">—</option>{people.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" disabled={!canEdit || !c.lead} checked={!!c.assignLead} onChange={e => setComponents(l => l.map(x => (x.id === c.id ? { ...x, assignLead: e.target.checked || undefined } : x)))} />Sorumluya ata</label>
                            <span className="text-[13px] m-text-3 m-tabular text-center">{componentUsage(tasks, c.name) || '—'}</span>
                            {canEdit ? <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${c.name} bileşenini sil`} onClick={() => removeComponent(c)}><Icon name="trash" size={14} /></button> : <span></span>}
                        </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-1.5">
                        {canEdit && <button type="button" className="m-btn m-btn-gray !min-h-[34px] !px-3 text-[14px]" onClick={() => addComponent()}><Icon name="plus" size={14} />Bileşen ekle</button>}
                        {canEdit && sugg.components.length > 0 && <span className="text-[13px] m-text-3 ml-2">Görevlerde geçen (Jira dahil):</span>}
                        {canEdit && sugg.components.map(s => <button key={s.name} type="button" className="m-pill" onClick={() => addComponent(s.name)}><Icon name="plus" size={12} />{s.name} <span className="m-text-3">{s.count}</span></button>)}
                    </div>
                    <p className="m-0 text-[12.5px] m-text-3">"Sorumluya ata" açıksa, bu bileşenle açılan ya da bileşeni seçilen atanmamış göreve sorumlu otomatik atanır (Jira bileşen sorumlusu).</p>
                </div>
            )}
        </Sheet>
    );
};

export default ProjectListsSheet;
