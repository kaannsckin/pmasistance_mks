import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout, DashboardWidget, DashboardWidgetType, Project, ProjectKpi, Task, WorkspaceData } from '../../../types';
import { filterLabel } from '../../../utils/dashboard/data';
import { formatKpi, latestPoint, upsertKpi } from '../../../utils/dashboard/metrics';
import {
    addWidget, createWidget, defaultLayout, duplicateWidget, loadPersonal, moveWidget, moveWidgetTo, personalKey, removeWidget, savePersonal,
    TEMPLATE_BY_KEY, updateWidget,
} from '../../../utils/dashboard/model';
import { effectiveScheme } from '../../../utils/projectScheme';
import { taskStatusLabel } from '../../../utils/workflow';
import { useAssistantOptional } from '../../assistant/AssistantContext';
import { Icon } from '../icons';
import { rowSep, Sheet } from '../ui';
import { WidgetBody, WidgetEnv, widgetTitle } from './DashboardWidgets';
import { DrillSheet, KpiSheet, WidgetCatalog, WidgetSettings } from './DashboardSettings';

/**
 * Proje dashboard'u: projeye girince ilk açılan ekran. Kullanıcı bileşen
 * ekler, çıkarır, sürükleyip sıralar, genişliğini ve süzgecini ayarlar.
 *
 *  - Kişisel düzen bu tarayıcıda saklanır (kimlik başına).
 *  - PY "Proje varsayılanı yap" ile düzenini herkese sunar.
 *  - Projeye özel göstergeler (PoC skoru gibi) projede saklanır; PY girer.
 */

interface Props {
    workspace: WorkspaceData;
    project: Project;
    canEdit: boolean;
    role: string;
    personId?: string;
    onUpdateProject: (fn: (p: Project) => Project) => void;
    onViewTask: (t: Task) => void;
}

const SIZE_LABEL: Record<DashboardWidget['size'], string> = { 1: '1/4', 2: '2/4', 3: '3/4', 4: 'Tam' };

const ModernDashboard: React.FC<Props> = ({ workspace, project, canEdit, role, personId, onUpdateProject, onViewTask }) => {
    const key = personalKey(project.id, role, personId);
    const [personal, setPersonal] = useState<DashboardLayout | null>(() => loadPersonal(key));
    useEffect(() => { setPersonal(loadPersonal(key)); }, [key]);
    const hasMs = project.tasks.some(t => (t.labels || []).some(l => /^MS\s*\d/i.test(l)));
    const template = useMemo(() => defaultLayout(project), [project.id, project.kpis?.length, hasMs]); // eslint-disable-line react-hooks/exhaustive-deps
    const layout = personal || project.dashboard || template;
    const source = personal ? 'Kişisel düzeniniz' : project.dashboard ? 'Projenin varsayılan düzeni' : 'Önerilen şablon';

    const [editing, setEditing] = useState(false);
    const [catalog, setCatalog] = useState(false);
    const [settings, setSettings] = useState<DashboardWidget | null>(null);
    const [kpiEdit, setKpiEdit] = useState<{ kpi: ProjectKpi | null; widgetId?: string } | null>(null);
    const [kpiList, setKpiList] = useState(false);
    const [drill, setDrill] = useState<{ title: string; tasks: Task[] } | null>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);
    const assistant = useAssistantOptional();

    const change = useCallback((next: DashboardLayout) => {
        const l = { ...next, updatedAt: new Date().toISOString() };
        setPersonal(l);
        savePersonal(key, l);
    }, [key]);

    const now = useMemo(() => new Date(), []);
    const workflow = useMemo(() => effectiveScheme(workspace, project).workflow, [workspace, project]);
    const env: WidgetEnv = useMemo(() => ({
        ws: workspace, project, workflow, now, canEdit,
        onViewTask,
        onDrill: (title, tasks) => setDrill({ title, tasks }),
        onEditKpi: kpi => setKpiEdit({ kpi }),
    }), [workspace, project, workflow, now, canEdit, onViewTask]);

    const saveKpi = (k: ProjectKpi) => {
        onUpdateProject(p => upsertKpi(p, k));
        if (kpiEdit?.widgetId) change(updateWidget(layout, kpiEdit.widgetId, { config: { ...(layout.widgets.find(w => w.id === kpiEdit.widgetId)?.config || {}), kpiId: k.id } }));
        setKpiEdit(null);
    };

    const add = (type: DashboardWidgetType) => {
        const w = createWidget(type, type === 'kpi' && project.kpis?.[0] ? { config: { kpiId: project.kpis[0].id } } : {});
        change(addWidget(layout, w));
        setCatalog(false);
        setEditing(true);
        // Gruplama / gösterge seçimi isteyen bileşenlerde ayarlar hemen açılır
        if (['breakdown', 'pivot', 'milestones', 'note', 'metric'].includes(type)) setSettings(w);
        window.setTimeout(() => document.getElementById(`dw-${w.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    };

    const askAssistant = () => {
        const kpis = (project.kpis || []).map(k => `${k.name} ${formatKpi(latestPoint(k)?.value, k.unit)}${k.target !== undefined ? ` (hedef ${formatKpi(k.target, k.unit)})` : ''}`).join(', ');
        assistant?.ask(`${project.name} projesinin dashboard'unu yorumla: genel ilerleme, kilometre taşlarının durumu, geciken işler ve riskler${kpis ? `; özel göstergeler: ${kpis}` : ''}. Hedefe ulaşmak için en önemli 3 aksiyonu öner.`);
    };

    const wpName = (id: string) => project.workPackages.find(w => w.id === id)?.name || 'iş paketi';

    return (
        <div className="flex flex-col gap-4">
            <div className="m-dashboard-toolbar flex items-center gap-2 flex-wrap">
                <div className="m-dashboard-heading flex-1 min-w-[200px]">
                    <h2 className="m-0 text-[20px] font-semibold m-text">Dashboard</h2>
                    <p className="m-0 text-[13px] m-text-3">{source}{personal?.updatedAt ? ` · ${new Date(personal.updatedAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}` : ''} · {layout.widgets.length} bileşen</p>
                </div>
                {assistant?.enabled && assistant.chatEnabled && !editing && (
                    <button type="button" className="m-btn m-btn-plain" onClick={askAssistant}><Icon name="sparkles" size={16} />Asistanla yorumla</button>
                )}
                {canEdit && !editing && <button type="button" className="m-btn m-btn-gray" onClick={() => setKpiList(true)}><Icon name="target" size={16} />Göstergeler{project.kpis?.length ? ` (${project.kpis.length})` : ''}</button>}
                {editing ? (
                    <>
                        <button type="button" className="m-btn m-btn-gray" onClick={() => setCatalog(true)}><Icon name="plus" size={16} />Bileşen ekle</button>
                        {canEdit && (
                            <button type="button" className="m-btn m-btn-plain" title="Bu düzeni projede kişisel düzeni olmayan herkes görür"
                                onClick={() => { if (window.confirm('Bu düzen projenin varsayılanı olsun mu? Kişisel düzeni olmayan herkes bunu görür.')) { onUpdateProject(p => ({ ...p, dashboard: { widgets: layout.widgets, updatedAt: new Date().toISOString() } })); setPersonal(null); savePersonal(key, null); } }}>
                                <Icon name="upload" size={16} />Proje varsayılanı yap
                            </button>
                        )}
                        {personal && (
                            <button type="button" className="m-btn m-btn-plain" onClick={() => { if (window.confirm('Kişisel düzeniniz silinsin ve projenin varsayılan düzenine dönülsün mü?')) { setPersonal(null); savePersonal(key, null); } }}>
                                <Icon name="undo" size={16} />Varsayılana dön
                            </button>
                        )}
                        <button type="button" className="m-btn m-btn-primary" onClick={() => setEditing(false)}><Icon name="check" size={16} />Bitti</button>
                    </>
                ) : (
                    <button type="button" className="m-btn m-btn-gray" onClick={() => setEditing(true)}><Icon name="sliders" size={16} />Düzenle</button>
                )}
            </div>
            {editing && <p className="m-0 text-[13px] m-text-3" role="status">Bileşenleri sürükleyerek ya da oklarla sıralayın; genişlik, ayar, çoğaltma ve kaldırma her bileşenin üstünde. Değişiklikler kişisel düzeninize kaydedilir.</p>}

            {layout.widgets.length === 0 ? (
                <div className="m-surface rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
                    <Icon name="grid" size={28} />
                    <p className="m-0 text-[15px] m-text">Dashboard boş.</p>
                    <button type="button" className="m-btn m-btn-primary" onClick={() => setCatalog(true)}><Icon name="plus" size={16} />Bileşen ekle</button>
                </div>
            ) : (
                <div className="m-dash-grid">
                    {layout.widgets.map((w, i) => {
                        const title = widgetTitle(w, project);
                        const sub = filterLabel(w.config?.filter, wpName);
                        return (
                            <section
                                key={w.id}
                                id={`dw-${w.id}`}
                                aria-label={title}
                                data-metric={w.type === 'metric' ? (w.config?.metric || 'progress') : undefined}
                                className={`m-dash-w s${w.size} m-surface rounded-2xl p-4 flex flex-col gap-3 min-w-0 ${editing ? 'is-editing' : ''} ${overId === w.id && dragId !== w.id ? 'is-drop' : ''} ${dragId === w.id ? 'is-dragging' : ''}`}
                                draggable={editing}
                                onDragStart={e => { setDragId(w.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', w.id); }}
                                onDragOver={e => { if (dragId) { e.preventDefault(); setOverId(w.id); } }}
                                onDragLeave={() => setOverId(o => (o === w.id ? null : o))}
                                onDrop={e => { e.preventDefault(); if (dragId) change(moveWidgetTo(layout, dragId, w.id)); setDragId(null); setOverId(null); }}
                                onDragEnd={() => { setDragId(null); setOverId(null); }}
                            >
                                <header className="flex items-start gap-2">
                                    {editing && <span className="m-text-3 cursor-grab pt-0.5" aria-hidden="true" title="Sürükleyin"><Icon name="grid" size={15} /></span>}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="m-0 text-[15.5px] font-semibold m-text truncate">{title}</h3>
                                        {sub && <p className="m-0 text-[12.5px] m-text-3 truncate">{sub}</p>}
                                    </div>
                                    {editing ? (
                                        <div className="flex items-center gap-0.5 flex-none">
                                            <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${title}: öne al`} disabled={i === 0} onClick={() => change(moveWidget(layout, w.id, -1))}><Icon name="chevronLeft" size={15} /></button>
                                            <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${title}: arkaya al`} disabled={i === layout.widgets.length - 1} onClick={() => change(moveWidget(layout, w.id, 1))}><Icon name="chevronRight" size={15} /></button>
                                            <button type="button" className="m-pill !min-h-[30px] !px-2 text-[12.5px]" aria-label={`${title}: genişlik ${SIZE_LABEL[w.size]}, değiştir`} title="Genişlik" onClick={() => change(updateWidget(layout, w.id, { size: ((w.size % 4) + 1) as DashboardWidget['size'] }))}>{SIZE_LABEL[w.size]}</button>
                                            <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${title}: ayarlar`} onClick={() => setSettings(w)}><Icon name="sliders" size={15} /></button>
                                            <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${title}: çoğalt`} onClick={() => change(duplicateWidget(layout, w.id))}><Icon name="copy" size={15} /></button>
                                            <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${title}: kaldır`} onClick={() => change(removeWidget(layout, w.id))}><Icon name="trash" size={15} /></button>
                                        </div>
                                    ) : (
                                        <button type="button" className="m-icon-btn !w-8 !h-8 flex-none opacity-60 hover:opacity-100" aria-label={`${title}: ayarlar`} title="Bu bileşeni ayarla" onClick={() => setSettings(w)}><Icon name="sliders" size={15} /></button>
                                    )}
                                </header>
                                <WidgetBody w={w} env={env} />
                            </section>
                        );
                    })}
                </div>
            )}

            {catalog && <WidgetCatalog onAdd={add} onClose={() => setCatalog(false)} onTemplate={k => { change({ widgets: TEMPLATE_BY_KEY.get(k)!.build(project) }); setCatalog(false); }} />}
            {settings && (
                <WidgetSettings
                    widget={settings}
                    project={project}
                    canEditKpi={canEdit}
                    onClose={() => setSettings(null)}
                    onNewKpi={() => { setKpiEdit({ kpi: null, widgetId: settings.id }); setSettings(null); }}
                    onSave={w => { change(updateWidget(layout, w.id, w)); setSettings(null); }}
                />
            )}
            {kpiEdit && (
                <KpiSheet
                    kpi={kpiEdit.kpi}
                    onClose={() => setKpiEdit(null)}
                    onSave={saveKpi}
                    onDelete={id => { onUpdateProject(p => ({ ...p, kpis: (p.kpis || []).filter(k => k.id !== id) })); setKpiEdit(null); }}
                />
            )}
            {kpiList && (
                <Sheet title="Projeye özel göstergeler" subtitle="PoC skoru, test kapsaması, memnuniyet gibi ölçümler; her ölçüm tarihiyle saklanır." onClose={() => setKpiList(false)} footer={<>
                    <span className="flex-1"></span>
                    <button type="button" className="m-btn m-btn-primary" onClick={() => { setKpiList(false); setKpiEdit({ kpi: null }); }}><Icon name="plus" size={16} />Yeni gösterge</button>
                </>}>
                    {(project.kpis || []).length === 0 ? <p className="m-0 m-text-3">Henüz gösterge yok.</p> : (
                        <ul className="m-0 p-0 list-none flex flex-col">
                            {(project.kpis || []).map((k, i) => {
                                const sep = rowSep(i);
                                return (
                                    <li key={k.id}>
                                        <button type="button" className={`m-row-link w-full flex items-center gap-3 px-1 py-2.5 text-left ${sep.className}`} style={sep.style} onClick={() => { setKpiList(false); setKpiEdit({ kpi: k }); }}>
                                            <span className="flex-1 min-w-0 flex flex-col">
                                                <span className="text-[15px] m-text">{k.name}</span>
                                                <span className="text-[12.5px] m-text-3">{k.points.length} ölçüm{k.target !== undefined ? ` · hedef ${formatKpi(k.target, k.unit)}` : ''}{k.source === 'import' ? ' · aktarımla güncellenir' : ''}</span>
                                            </span>
                                            <span className="text-[17px] font-semibold m-text m-tabular">{formatKpi(latestPoint(k)?.value, k.unit)}</span>
                                            <Icon name="chevronRight" size={16} />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Sheet>
            )}
            {drill && <DrillSheet title={drill.title} tasks={drill.tasks} statusOf={t => taskStatusLabel(t, workflow)} onOpen={t => { setDrill(null); onViewTask(t); }} onClose={() => setDrill(null)} />}
        </div>
    );
};

export default ModernDashboard;
