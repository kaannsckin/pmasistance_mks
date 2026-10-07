import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AiAssessmentFlag, AiPolicy, AiScoringPolicy, HealthConfig, HealthFactorKey, PermissionKey, ProjectStatus, ReportFlow, RoleViewConfig, UserRole, WorkspaceData } from '../../types';
import { fetchAiStatus } from '../../utils/ai/client';
import { aiPolicyOf } from '../../utils/ai/policy';
import { FLAG_LABELS } from '../../utils/ai/reportAssessment';
import { scoringStats } from '../../utils/ai/scoringStats';
import { AiStatus } from '../../utils/ai/protocol';
import { ROLE_LABELS } from '../../utils/allocations';
import { HealthFix } from '../../utils/dataHealth';
import { portfolioHealth } from '../../utils/executive';
import { BAND_GOOD, BAND_WARN, cleanHealthConfig, HEALTH_FACTORS, HEALTH_MODEL_VERSION, healthSettingsOf } from '../../utils/healthModel';
import {
    customizedRoles, isConsoleRole, isEditable, PERMISSION_GROUP_LABELS, PermissionGroup, PERMISSIONS, permissionsFor, ROLE_DESCRIPTIONS, ROLE_ORDER,
} from '../../utils/permissions';
import { profileOptions, ProfileOption, roleNeedsPerson } from '../../utils/profiles';
import {
    EXEC_SECTIONS, matchingPreset, MIN_PRIORITY_OPTIONS, MIN_RISK_OPTIONS, PROJECT_SECTIONS, PROJECT_SORT_LABELS, PROJECT_STATUS_ORDER, RISK_SORT_LABELS,
    TASK_SORT_LABELS, TaskPriority, viewFor, VIEW_PRESETS, ViewPresetKey, viewSummary,
} from '../../utils/viewConfig';
import { flowStages, reportFlowOf, reportSettingsOf, STAGE_LABELS, WEEKDAYS } from '../../utils/weeklyReport';
import { AdminSection, ADMIN_SECTIONS } from './adminSections';
import { Icon } from './icons';
import { PROJECT_STATUS_LABEL } from './ModernProjectHeader';
import { AuditLogPanel } from './sheets/AuditLogSheet';
import { DataHealthPanel } from './sheets/DataHealthSheet';
import { BAND_META, Card, Field, rowSep } from './ui';

/**
 * Yönetici konsolu — yalnız yetki ve uygulama yönetimi (proje yönetimi yok):
 *  - Yetkiler: rol × özellik matrisi (varsayılandan farklı hücreler işaretli)
 *  - Görünüm ve filtreler: rol bazında proje sekmeleri, yönetim kartları,
 *    kayıt süzgeçleri (proje durumu, görev önceliği, risk skoru) ve
 *    sıralamalar; hazır ayarlar tek tıkla uygulanır
 *  - Haftalık rapor akışı: onay adımları ve gönderim kuralları
 *  - Sağlık puanı: girdi ağırlıkları ve bant eşikleri (önizlemeli)
 *  - Profiller, denetim günlüğü, uygulama araçları (yedek, veri sağlığı, bulut)
 * Her değişiklik hemen uygulanır ve denetim günlüğüne yazılır.
 */

export interface ModernAdminProps {
    workspace: WorkspaceData;
    section: AdminSection;
    onSection: (s: AdminSection) => void;
    /** Konsol dışından (admin rolü olmayan yetkili) açılınca bölüm seçici ekranın üstünde */
    showSectionNav: boolean;
    onSetPermission: (role: UserRole, key: PermissionKey, on: boolean) => void;
    onResetRole: (role: UserRole) => void;
    onAddProfile: (role: UserRole, personId?: string) => boolean;
    onRemoveProfile: (id: string) => void;
    onUpdateRoleView: (role: UserRole, patch: Partial<RoleViewConfig>, label: string) => void;
    onApplyViewPreset: (role: UserRole, key: ViewPresetKey) => void;
    onResetRoleView: (role: UserRole) => void;
    onSaveHealthConfig: (draft: HealthConfig | undefined, label: string) => boolean;
    onUpdateReportFlow: (patch: Partial<ReportFlow> & { dueWeekday?: number }, label: string) => void;
    onUpdateAiPolicy: (patch: Partial<Omit<AiPolicy, 'scoring'>> & { scoring?: Partial<AiScoringPolicy> }, label: string) => void;
    canAudit: boolean;
    onSaveBackup?: () => void;
    onLoadBackup?: (file: File) => void;
    onApplyHealthFix?: (fix: HealthFix) => void;
    cloudLinked: boolean;
    onOpenCloud: () => void;
    onOpenProfile: () => void;
}

const SHORT_ROLE: Record<UserRole, string> = {
    py: 'PY', bolum_sorumlu: 'Bölüm S.', pyb_destek: 'PYB Destek', pyb_sorumlu: 'PYB Sorumlusu', mudur: 'Müdür', admin: 'Admin',
};
const GROUP_ORDER: PermissionGroup[] = ['screens', 'portfolio', 'decisions', 'report', 'app', 'privacy'];
/** Yetki ve görünüm ayarı yapılan roller (admin'in kendi yetkileri sabittir) */
const MANAGED_ROLES = ROLE_ORDER.filter(r => !isConsoleRole(r));

const Switch: React.FC<{ on: boolean; label: string; disabled?: boolean; changed?: boolean; title?: string; onChange: (on: boolean) => void }> = ({ on, label, disabled, changed, title, onChange }) => (
    <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        title={title}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className="relative inline-flex flex-none w-[46px] h-7 rounded-full border-0 cursor-pointer disabled:cursor-not-allowed"
        style={{
            background: on ? 'var(--m-accent)' : 'var(--m-fill)',
            boxShadow: changed ? '0 0 0 2px var(--m-surface), 0 0 0 4px var(--m-warn)' : undefined,
            opacity: disabled ? 0.5 : 1,
            transition: 'background-color .15s ease',
        }}
    >
        <span aria-hidden="true" className="absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white" style={{ left: on ? 21 : 3, boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .15s ease' }}></span>
    </button>
);

/** Etiket + açıklama + anahtar satırı */
const SwitchRow: React.FC<{ index: number; label: string; hint?: string; on: boolean; disabled?: boolean; title?: string; onChange: (on: boolean) => void }> = ({ index, label, hint, on, disabled, title, onChange }) => {
    const sep = rowSep(index);
    return (
        <div className={`flex items-center gap-3 py-2.5 ${sep.className}`} style={sep.style}>
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[15px] m-text">{label}</span>
                {hint && <span className="text-[13px] m-text-3">{hint}</span>}
            </span>
            <Switch on={on} label={label} disabled={disabled} title={title} onChange={onChange} />
        </div>
    );
};

const Note: React.FC<{ children: React.ReactNode; tone?: 'info' | 'warn' }> = ({ children, tone = 'info' }) => (
    <div className={`rounded-2xl px-4 py-3 flex items-start gap-3 ${tone === 'warn' ? 'm-tone-warn' : 'm-surface'}`}>
        <span className={tone === 'warn' ? '' : 'm-accent'} style={{ marginTop: 2 }}><Icon name={tone === 'warn' ? 'alert' : 'info'} size={18} /></span>
        <p className="m-0 flex-1 text-[14px] leading-relaxed m-text-2">{children}</p>
    </div>
);

// ------------------------------------------------------------------ yetkiler

const PermissionMatrix: React.FC<Pick<ModernAdminProps, 'workspace' | 'onSetPermission' | 'onResetRole'>> = ({ workspace, onSetPermission, onResetRole }) => {
    const overrides = workspace.rolePermissions;
    const effective = useMemo(() => new Map(MANAGED_ROLES.map(r => [r, permissionsFor(r, overrides)])), [overrides]);
    const defaults = useMemo(() => new Map(MANAGED_ROLES.map(r => [r, permissionsFor(r)])), []);
    const customized = useMemo(() => new Set(customizedRoles(overrides)), [overrides]);
    const grid = `minmax(260px, 2.2fr) repeat(${MANAGED_ROLES.length}, minmax(92px, 1fr))`;
    const [mobileRole, setMobileRole] = useState<UserRole>('py');
    const cell = (r: UserRole, key: PermissionKey) => {
        const def = PERMISSIONS.find(p => p.key === key)!;
        const on = effective.get(r)!.has(key);
        const editable = isEditable(key, r);
        const changed = on !== defaults.get(r)!.has(key);
        return (
            <Switch
                on={on}
                disabled={!editable}
                changed={changed}
                label={`${ROLE_LABELS[r]}: ${def.label}`}
                title={!editable ? (def.locked || `${ROLE_LABELS[r]} bu yetkiyi her zaman taşır`) : changed ? `Varsayılan: ${defaults.get(r)!.has(key) ? 'verili' : 'verili değil'}` : undefined}
                onChange={v => onSetPermission(r, key, v)}
            />
        );
    };
    const labelOf = (p: typeof PERMISSIONS[number]) => (
        <span className="min-w-0 flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold m-text flex items-center gap-1.5">
                {p.label}
                {p.locked && <span className="m-text-3" title={p.locked}><Icon name="lock" size={14} /></span>}
            </span>
            <span className="text-[13px] m-text-3">{p.locked || p.description}</span>
        </span>
    );

    return (
        <div className="flex flex-col gap-4">
            <Note>
                Bir rolün hangi özellikleri kullanacağını buradan belirleyin; değişiklik hemen uygulanır ve denetim günlüğüne yazılır. Sarı halkalı hücreler varsayılandan farklıdır.
                Kilitli satırlar değiştirilemez. Sahiplik kuralları (PY yalnız kendi projesini, bölüm sorumlusu yalnız kendi bölümünü düzenler) yetki değil kimlik kuralıdır.
                Admin yalnız bu konsolu kullanır; uygulama araçları (denetim günlüğü, yedek, veri sağlığı) admin'de her zaman açıktır, diğer rollere buradan verilebilir.
            </Note>

            {/* Dar ekran: rol seçilir, yetkileri tek sütunda */}
            <div className="md:hidden flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <select aria-label="Rol" className="m-pill flex-1 min-w-0" value={mobileRole} onChange={e => setMobileRole(e.target.value as UserRole)}>
                        {MANAGED_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}{customized.has(r) ? ' · değişti' : ''}</option>)}
                    </select>
                    {customized.has(mobileRole) && <button type="button" className="m-btn m-btn-plain" onClick={() => onResetRole(mobileRole)}>Varsayılana dön</button>}
                </div>
                <p className="m-0 px-1 text-[13px] m-text-3">{ROLE_DESCRIPTIONS[mobileRole]}</p>
                {GROUP_ORDER.map(group => (
                    <section key={group} aria-label={PERMISSION_GROUP_LABELS[group]} className="m-surface rounded-2xl px-4 py-2">
                        <h3 className="m-0 pt-1.5 pb-1 text-[13px] font-semibold m-text-3">{PERMISSION_GROUP_LABELS[group]}</h3>
                        {PERMISSIONS.filter(p => p.group === group).map((p, i) => {
                            const sep = rowSep(i);
                            return (
                                <div key={p.key} className={`flex items-center gap-3 py-2.5 ${sep.className}`} style={sep.style}>
                                    <span className="flex-1 min-w-0">{labelOf(p)}</span>
                                    {cell(mobileRole, p.key)}
                                </div>
                            );
                        })}
                    </section>
                ))}
            </div>

            <div className="hidden md:block m-surface rounded-2xl overflow-x-auto">
                <div role="table" aria-label="Rol yetkileri" style={{ minWidth: 780 }}>
                    <div role="row" className="grid items-end gap-2 px-4 pt-4 pb-2.5" style={{ gridTemplateColumns: grid }}>
                        <span role="columnheader" className="text-[13px] m-text-3">Özellik</span>
                        {MANAGED_ROLES.map(r => (
                            <span key={r} role="columnheader" className="flex flex-col items-center gap-1 text-center">
                                <span className="text-[14px] font-semibold m-text" title={ROLE_DESCRIPTIONS[r]}>{SHORT_ROLE[r]}</span>
                                {customized.has(r) ? (
                                    <button type="button" className="bg-transparent border-0 p-0 text-[12.5px] font-semibold m-accent cursor-pointer" onClick={() => onResetRole(r)} title={`${ROLE_LABELS[r]} yetkilerini varsayılana döndür`}>
                                        Varsayılana dön
                                    </button>
                                ) : <span className="text-[12.5px] m-text-3">Varsayılan</span>}
                            </span>
                        ))}
                    </div>
                    {GROUP_ORDER.map(group => (
                        <div key={group} role="rowgroup">
                            <div role="row" className="px-4 pt-3 pb-1.5 border-t m-sep" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                                <span role="cell" className="text-[13px] font-semibold m-text-3">{PERMISSION_GROUP_LABELS[group]}</span>
                            </div>
                            {PERMISSIONS.filter(p => p.group === group).map(p => (
                                <div key={p.key} role="row" className="grid items-center gap-2 px-4 py-2.5" style={{ gridTemplateColumns: grid }}>
                                    <span role="rowheader">{labelOf(p)}</span>
                                    {MANAGED_ROLES.map(r => <span key={r} role="cell" className="flex justify-center">{cell(r, p.key)}</span>)}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            <p className="m-0 text-[13px] m-text-3">
                Yetkiler bu çalışma alanının tüm kullanıcılarına uygulanır (bulut eşitlemesiyle paylaşılır). Kimlik bu sürümde istemcide seçildiğinden yetkiler kullanıcı deneyimini düzenler; sunucu tarafı zorlama ileride Supabase üyelik rolüyle yapılacak.
            </p>
        </div>
    );
};

// ------------------------------------------------------------------ görünüm ve filtreler

const ViewSettings: React.FC<Pick<ModernAdminProps, 'workspace' | 'onUpdateRoleView' | 'onApplyViewPreset' | 'onResetRoleView'>> = ({ workspace, onUpdateRoleView, onApplyViewPreset, onResetRoleView }) => {
    const [role, setRole] = useState<UserRole>('mudur');
    const cfg = workspace.viewConfig;
    const v = useMemo(() => viewFor(cfg, role), [cfg, role]);
    const preset = matchingPreset(cfg, role);
    const hasExec = permissionsFor(role, workspace.rolePermissions).has('screen.executive');
    const set = (patch: Partial<RoleViewConfig>, label: string) => onUpdateRoleView(role, patch, label);
    const presetLabel = (r: UserRole) => {
        const k = matchingPreset(cfg, r);
        return k ? VIEW_PRESETS.find(p => p.key === k)!.label : 'Özel ayar';
    };

    const toggleProjectSection = (key: typeof PROJECT_SECTIONS[number]['key'], on: boolean) =>
        set({ projectSections: PROJECT_SECTIONS.filter(s => (s.key === key ? on : v.projectSections.has(s.key))).map(s => s.key) },
            `"${PROJECT_SECTIONS.find(s => s.key === key)!.label}" sekmesi ${on ? 'açıldı' : 'gizlendi'}`);
    const toggleExecSection = (key: typeof EXEC_SECTIONS[number]['key'], on: boolean) =>
        set({ execSections: EXEC_SECTIONS.filter(s => (s.key === key ? on : v.execSections.has(s.key))).map(s => s.key) },
            `"${EXEC_SECTIONS.find(s => s.key === key)!.label}" kartı ${on ? 'açıldı' : 'gizlendi'}`);
    const statuses = v.projectStatuses || PROJECT_STATUS_ORDER;
    const toggleStatus = (st: ProjectStatus) => {
        const next = statuses.includes(st) ? statuses.filter(x => x !== st) : PROJECT_STATUS_ORDER.filter(x => x === st || statuses.includes(x));
        if (!next.length) return; // en az bir durum
        set({ projectStatuses: next }, `proje durumları: ${next.map(x => PROJECT_STATUS_LABEL[x]).join(', ')}`);
    };

    return (
        <div className="flex flex-col gap-4">
            <Note>
                Her rolün hangi sekmeleri ve kartları göreceğini, hangi kayıtların listeleneceğini ve listelerin nasıl sıralanacağını seçin. Hazır ayarlar tek tıkla uygulanır.
                Süzgeçler yalnız gösterimi daraltır: sağlık skoru, EVM ve sayaçlar tüm veriden hesaplanır; ekranlarda süzgecin etkin olduğu not olarak görünür.
            </Note>
            <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
                <section aria-label="Roller" className="m-surface rounded-2xl p-1.5 flex flex-col">
                    {MANAGED_ROLES.map((r, i) => {
                        const sep = rowSep(i);
                        const sum = viewSummary(viewFor(cfg, r));
                        const active = r === role;
                        return (
                            <button key={r} type="button" aria-pressed={active} onClick={() => setRole(r)} className={`m-row-link flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl text-left ${sep.className}`} style={{ ...sep.style, ...(active ? { background: 'var(--m-accent-tint)' } : {}) }}>
                                <span className="w-full flex items-center gap-2">
                                    <span className={`flex-1 min-w-0 truncate text-[15px] ${active ? 'font-semibold m-text' : 'm-text'}`}>{ROLE_LABELS[r]}</span>
                                    <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${sum.length ? 'm-tone-warn' : 'm-tone-hold'}`}>{presetLabel(r)}</span>
                                </span>
                                <span className="text-[13px] m-text-3 line-clamp-2">{sum.length ? sum.slice(0, 3).join(' · ') : 'Her şey görünür'}</span>
                            </button>
                        );
                    })}
                </section>

                <div className="flex flex-col gap-4 min-w-0">
                    <section aria-label={`${ROLE_LABELS[role]} için hazır ayarlar`} className="m-surface rounded-2xl p-5 flex flex-col gap-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="m-0 text-[17px] font-semibold m-text">{ROLE_LABELS[role]}</h2>
                                <p className="m-0 mt-0.5 text-[14px] m-text-3">{ROLE_DESCRIPTIONS[role]}</p>
                            </div>
                            {v.customized && <button type="button" className="m-btn m-btn-plain" onClick={() => onResetRoleView(role)}>Varsayılana dön</button>}
                        </div>
                        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>
                            {VIEW_PRESETS.map(p => {
                                const on = preset === p.key;
                                return (
                                    <button key={p.key} type="button" aria-pressed={on} onClick={() => onApplyViewPreset(role, p.key)} className="m-row-link rounded-xl px-3.5 py-3 flex flex-col items-start gap-1 text-left" style={on ? { border: '1px solid var(--m-accent)', boxShadow: 'inset 0 0 0 1px var(--m-accent)' } : { border: '1px solid var(--m-sep)' }}>
                                        <span className="w-full flex items-center gap-2">
                                            <span className="flex-1 text-[15px] font-semibold m-text">{p.label}</span>
                                            {on && <span className="m-accent"><Icon name="check" size={18} strokeWidth={2.4} /></span>}
                                        </span>
                                        <span className="text-[13px] m-text-3 leading-snug">{p.description}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))' }}>
                        <Card title="Proje sekmeleri" subtitle="Projede görünen sekmeler; genel bakış her zaman açık">
                            <div className="flex flex-col -my-1">
                                {PROJECT_SECTIONS.map((s, i) => (
                                    <SwitchRow key={s.key} index={i} label={s.label} on={v.projectSections.has(s.key)} disabled={s.locked} title={s.locked ? 'Genel bakış her zaman açık' : undefined} onChange={on => toggleProjectSection(s.key, on)} />
                                ))}
                            </div>
                        </Card>
                        <Card title="Yönetim ekranı kartları" subtitle={hasExec ? 'Yönetim ekranında görünen bölümler' : 'Bu rolün yönetim ekranı yetkisi yok; kartlar yetki verilirse uygulanır'}>
                            <div className="flex flex-col -my-1">
                                {EXEC_SECTIONS.map((s, i) => (
                                    <SwitchRow key={s.key} index={i} label={s.label} hint={s.hint} on={v.execSections.has(s.key)} onChange={on => toggleExecSection(s.key, on)} />
                                ))}
                            </div>
                        </Card>
                        <Card title="Kayıt süzgeçleri" subtitle="Bu rolün listelerinde hangi kayıtlar görünsün">
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-2">
                                    <span className="text-[14px] font-semibold m-text-2">Proje durumu</span>
                                    <div className="flex flex-wrap gap-2" role="group" aria-label="Görünen proje durumları">
                                        {PROJECT_STATUS_ORDER.map(st => {
                                            const on = statuses.includes(st);
                                            return (
                                                <button key={st} type="button" aria-pressed={on} className={`m-pill !min-h-[36px] ${on ? 'is-active' : ''}`} style={on ? undefined : { background: 'var(--m-fill-2)' }} onClick={() => toggleStatus(st)} disabled={on && statuses.length === 1} title={on && statuses.length === 1 ? 'En az bir durum seçili olmalı' : undefined}>
                                                    {on && <Icon name="check" size={14} strokeWidth={2.4} />}{PROJECT_STATUS_LABEL[st]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <Field label="Görev önceliği" htmlFor="av-prio" hint="Liste, pano ve salt okunur zaman çizelgesi">
                                    <select id="av-prio" className="m-input" value={v.minTaskPriority} onChange={e => set({ minTaskPriority: e.target.value as TaskPriority }, `görev önceliği: ${MIN_PRIORITY_OPTIONS.find(o => o.value === e.target.value)!.label}`)}>
                                        {MIN_PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </Field>
                                <Field label="Risk skoru" htmlFor="av-risk" hint="Proje riskleri, risk raporu ve yönetim kartları">
                                    <select id="av-risk" className="m-input" value={v.minRiskScore} onChange={e => set({ minRiskScore: Number(e.target.value) }, `risk eşiği: ${MIN_RISK_OPTIONS.find(o => o.value === Number(e.target.value))!.label}`)}>
                                        {MIN_RISK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </Field>
                                <div className="flex flex-col -my-1">
                                    <SwitchRow index={0} label="Kapanan riskler" hint="Kapalıysa listelerde ve “Kapanan” sekmesinde görünmez" on={v.showClosedRisks} onChange={on => set({ showClosedRisks: on }, `kapanan riskler ${on ? 'görünür' : 'gizli'}`)} />
                                </div>
                            </div>
                        </Card>
                        <Card title="Varsayılan sıralama" subtitle="Listeler bu sırayla açılır">
                            <div className="flex flex-col gap-4">
                                <Field label="Görevler" htmlFor="av-tsort">
                                    <select id="av-tsort" className="m-input" value={v.taskSort} onChange={e => set({ taskSort: e.target.value as typeof v.taskSort }, `görev sırası: ${TASK_SORT_LABELS[e.target.value as typeof v.taskSort]}`)}>
                                        {(Object.keys(TASK_SORT_LABELS) as (typeof v.taskSort)[]).map(k => <option key={k} value={k}>{TASK_SORT_LABELS[k]}</option>)}
                                    </select>
                                </Field>
                                <Field label="Riskler" htmlFor="av-rsort">
                                    <select id="av-rsort" className="m-input" value={v.riskSort} onChange={e => set({ riskSort: e.target.value as typeof v.riskSort }, `risk sırası: ${RISK_SORT_LABELS[e.target.value as typeof v.riskSort]}`)}>
                                        {(Object.keys(RISK_SORT_LABELS) as (typeof v.riskSort)[]).map(k => <option key={k} value={k}>{RISK_SORT_LABELS[k]}</option>)}
                                    </select>
                                </Field>
                                <Field label="Projeler" htmlFor="av-psort" hint="Portföy ve yönetimdeki “Tüm projeler” tablosu">
                                    <select id="av-psort" className="m-input" value={v.projectSort || ''} onChange={e => set({ projectSort: (e.target.value || undefined) as RoleViewConfig['projectSort'] }, `proje sırası: ${e.target.value ? PROJECT_SORT_LABELS[e.target.value as keyof typeof PROJECT_SORT_LABELS] : 'ekranın kendi sırası'}`)}>
                                        <option value="">Ekranın kendi sırası</option>
                                        {(Object.keys(PROJECT_SORT_LABELS) as (keyof typeof PROJECT_SORT_LABELS)[]).map(k => <option key={k} value={k}>{PROJECT_SORT_LABELS[k]}</option>)}
                                    </select>
                                </Field>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ------------------------------------------------------------------ haftalık rapor akışı

const ReportFlowSettings: React.FC<Pick<ModernAdminProps, 'workspace' | 'onUpdateReportFlow'>> = ({ workspace, onUpdateReportFlow }) => {
    const flow = reportFlowOf(workspace);
    const settings = reportSettingsOf(workspace);
    const stages = flowStages(flow);
    const waiting = (stage: 'bs_review' | 'pyds_review') => (workspace.weeklyReports || []).filter(r => r.stage === stage).length;
    const set = (patch: Partial<ReportFlow>, label: string) => onUpdateReportFlow(patch, label);
    const steps: { key: string; label: string; who: string; on: boolean }[] = [
        { key: 'draft', label: 'Yazım', who: 'Proje yöneticisi', on: true },
        { key: 'bs', label: 'Bölüm onayı', who: 'Bölüm sorumlusu', on: flow.bsReview },
        { key: 'pyds', label: 'Format denetimi', who: 'PYB destek', on: flow.pydsReview },
        { key: 'approved', label: STAGE_LABELS.approved, who: 'Yayını bekler', on: true },
        { key: 'publish', label: 'Yayın', who: 'Rapor denetimi yetkisi', on: true },
    ];

    return (
        <div className="flex flex-col gap-4">
            <section aria-label="Akış" className="m-surface rounded-2xl p-5 flex flex-col gap-3">
                <div>
                    <h2 className="m-0 text-[17px] font-semibold m-text">Onay akışı</h2>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Proje raporu {stages.length} aşamadan geçer: {stages.map(s => STAGE_LABELS[s]).join(' → ')}. Bölüm eklemeleri bölüm onayını atlar.</p>
                </div>
                <ol className="m-0 p-0 list-none flex flex-wrap items-center gap-2" aria-label="Aşamalar">
                    {steps.map((s, i) => (
                        <li key={s.key} className="flex items-center gap-2">
                            {i > 0 && <span aria-hidden="true" style={{ color: 'var(--m-chevron)' }}><Icon name="chevronRight" size={16} strokeWidth={2.2} /></span>}
                            <span className={`flex flex-col rounded-xl px-3 py-2 ${s.on ? 'm-tone-accent' : 'm-fill-2 m-text-3'}`} style={s.on ? undefined : { textDecoration: 'line-through' }}>
                                <span className="text-[14px] font-semibold">{s.label}</span>
                                <span className="text-[12px] opacity-80">{s.on ? s.who : 'Atlanır'}</span>
                            </span>
                        </li>
                    ))}
                </ol>
            </section>

            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))' }}>
                <Card title="Onay adımları" subtitle="Kapatılan adım atlanır; o aşamadaki raporlar yine sahibince onaylanır">
                    <div className="flex flex-col -my-1">
                        <SwitchRow index={0} label="Bölüm sorumlusu onayı" hint={`Proje raporu önce PY'nin bölüm sorumlusuna gider${waiting('bs_review') ? ` · şu an ${waiting('bs_review')} rapor bu aşamada` : ''}`} on={flow.bsReview} onChange={on => set({ bsReview: on }, `bölüm sorumlusu onayı ${on ? 'açıldı' : 'kapatıldı'}`)} />
                        <SwitchRow index={1} label="PYB destek format denetimi" hint={`Kılavuza uygunluk denetimi; kapalıysa rapor bir önceki adımdan doğrudan onaylanır${waiting('pyds_review') ? ` · şu an ${waiting('pyds_review')} rapor bu aşamada` : ''}`} on={flow.pydsReview} onChange={on => set({ pydsReview: on }, `PYB destek format denetimi ${on ? 'açıldı' : 'kapatıldı'}`)} />
                    </div>
                </Card>
                <Card title="Gönderim kuralları" subtitle="PY raporu taslaktan gönderirken">
                    <div className="flex flex-col -my-1">
                        <SwitchRow index={0} label="Proje sağlığı puanı zorunlu" hint="PY 1–10 puanını vermeden gönderemez" on={flow.requirePmScore} onChange={on => set({ requirePmScore: on }, `PY puanı ${on ? 'zorunlu' : 'isteğe bağlı'}`)} />
                        <SwitchRow index={1} label="Geçen haftanın planı değerlendirilmeli" hint="Söz tutma oranının girdisi; her plan maddesi Yapıldı / Kısmen / Ertelendi / İptal" on={flow.requirePlanReview} onChange={on => set({ requirePlanReview: on }, `plan değerlendirmesi ${on ? 'zorunlu' : 'isteğe bağlı'}`)} />
                    </div>
                </Card>
                <Card title="Yayın ve takvim">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col -my-1">
                            <SwitchRow index={0} label="Yayınlarken AI metin puanı" hint="Hafta yayınlanınca onaylı rapor metinleri 1–10 değerlendirilir (sağlık skorunun girdisi)" on={flow.aiOnPublish} onChange={on => set({ aiOnPublish: on }, `yayında AI metin puanı ${on ? 'açıldı' : 'kapatıldı'}`)} />
                        </div>
                        <Field label="Raporun son günü" htmlFor="af-due" hint="Hatırlatmalar ve gecikme rozetleri bu güne göre">
                            <select id="af-due" className="m-input" value={settings.dueWeekday} onChange={e => onUpdateReportFlow({ dueWeekday: Number(e.target.value) }, `son gün ${WEEKDAYS[Number(e.target.value)]}`)}>
                                {[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                            </select>
                        </Field>
                    </div>
                </Card>
            </div>
            <p className="m-0 text-[13px] m-text-3">Haftayı yayınlama, yayından kaldırma ve rapor sözlüğü “Rapor denetimi” yetkisini taşıyan rolündür (Yetkiler bölümü). Müdür e-posta listesi ve kısaltmalar rapor ekranındaki ayarlardan yönetilir.</p>
        </div>
    );
};

// ------------------------------------------------------------------ sağlık puanı

const pts = (w: number) => Math.round(w * 100);

const HealthMethodSettings: React.FC<Pick<ModernAdminProps, 'workspace' | 'onSaveHealthConfig'>> = ({ workspace, onSaveHealthConfig }) => {
    const cfg = workspace.healthConfig;
    const current = useMemo(() => healthSettingsOf(workspace), [workspace]);
    const initial = () => ({
        weights: Object.fromEntries(HEALTH_FACTORS.map(f => [f.key, pts(cfg?.weights?.[f.key] ?? f.weight)])) as Record<HealthFactorKey, number>,
        good: current.bandGood,
        warn: current.bandWarn,
    });
    const [draft, setDraft] = useState(initial);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    // Ayar başka yerden değişirse (bulut, geri al) taslak yenilensin
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { setDraft(initial()); }, [cfg]);

    const draftCfg: HealthConfig = useMemo(() => ({
        weights: Object.fromEntries(HEALTH_FACTORS.map(f => [f.key, draft.weights[f.key] / 100])),
        bandGood: draft.good,
        bandWarn: draft.warn,
    }), [draft]);
    const cleaned = useMemo(() => cleanHealthConfig(draftCfg), [draftCfg]);
    const total = HEALTH_FACTORS.reduce((s, f) => s + draft.weights[f.key], 0);
    const error = total <= 0 ? 'En az bir girdi açık olmalı.' : draft.warn >= draft.good ? '“İzlemede” eşiği “Sağlıklı” eşiğinden küçük olmalı.' : draft.good > 100 || draft.warn < 0 ? 'Eşikler 0–100 arasında olmalı.' : cleaned === null ? 'Ayar geçersiz.' : null;
    const dirty = JSON.stringify(initial()) !== JSON.stringify(draft);

    const year = new Date().getFullYear();
    const before = useMemo(() => portfolioHealth(workspace, year), [workspace, year]);
    const after = useMemo(() => (dirty && !error ? portfolioHealth({ ...workspace, healthConfig: cleaned || undefined }, year) : null), [workspace, year, dirty, error, cleaned]);
    const dist = (ph: typeof before) => ({ good: ph.projects.filter(p => p.band === 'good').length, warn: ph.projects.filter(p => p.band === 'warn').length, bad: ph.projects.filter(p => p.band === 'bad').length });

    const changes = (): string => {
        const init = initial();
        const parts = HEALTH_FACTORS.filter(f => init.weights[f.key] !== draft.weights[f.key])
            .map(f => (draft.weights[f.key] === 0 ? `${f.label} kapatıldı` : `${f.label} ${init.weights[f.key]}→${draft.weights[f.key]}`));
        if (init.good !== draft.good || init.warn !== draft.warn) parts.push(`bantlar ${init.good}/${init.warn} → ${draft.good}/${draft.warn}`);
        return parts.join(', ') || 'güncellendi';
    };
    const save = () => {
        if (error) return;
        const ok = onSaveHealthConfig(draftCfg, changes());
        setMessage(ok ? { ok: true, text: 'Yöntem kaydedildi; tüm skorlar yeni ağırlıklarla hesaplanıyor.' } : { ok: false, text: 'Kaydedilemedi.' });
    };
    const reset = () => {
        if (onSaveHealthConfig(undefined, 'uzman yöntemine döndü')) setMessage({ ok: true, text: 'Uzman yöntemine dönüldü.' });
    };
    const setWeight = (key: HealthFactorKey, raw: string) => {
        const n = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
        setDraft(d => ({ ...d, weights: { ...d.weights, [key]: n } }));
        setMessage(null);
    };
    const setBand = (k: 'good' | 'warn', raw: string) => {
        const n = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
        setDraft(d => ({ ...d, [k]: n }));
        setMessage(null);
    };

    return (
        <div className="flex flex-col gap-4">
            <Note>
                Sağlık skoru girdilerin ağırlıklı ortalamasıdır: Skor = 100 × Σ wᵢxᵢ ÷ Σ wᵢ (yalnız verisi olan girdiler). Ağırlıklar göreli puandır ve paylarına çevrilir; 0 girdiyi kapatır.
                Değişiklik kaydedilene kadar uygulanmaz; altta portföye etkisi önizlenir. Özel ağırlıkla alınan haftalık fotoğraflar “{HEALTH_MODEL_VERSION}/özel” olarak işaretlenir; regresyon kalibrasyonu ileride bu ağırlıklardan başlar.
            </Note>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))' }}>
                <Card title="Girdi ağırlıkları" subtitle={`Model ${current.version}${current.customized ? ' · yönetici ayarlı' : ' · uzman ağırlıkları'}`}>
                    <div className="flex flex-col -my-1">
                        {HEALTH_FACTORS.map((f, i) => {
                            const sep = rowSep(i);
                            const w = draft.weights[f.key];
                            const share = total > 0 ? w / total : 0;
                            const changed = w !== pts(f.weight);
                            return (
                                <div key={f.key} className={`flex items-center gap-3 py-2 ${sep.className}`} style={sep.style}>
                                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                        <span className={`text-[15px] ${w ? 'm-text' : 'm-text-3'}`}>{f.label}{changed && <span className="ml-1.5 text-[12px] m-ink-warn">uzman {pts(f.weight)}</span>}</span>
                                        <span className="text-[12.5px] m-text-3 truncate" title={f.rule}>{f.rule}</span>
                                    </span>
                                    <input type="number" inputMode="numeric" min={0} max={100} step={1} aria-label={`${f.label} ağırlığı`} className="m-input !w-[76px] text-right m-tabular" value={w} onChange={e => setWeight(f.key, e.target.value)} />
                                    <span className={`w-16 text-right text-[13px] font-semibold m-tabular ${w ? 'm-text-2' : 'm-text-3'}`}>{w ? `%${Math.round(share * 100)}` : 'Kapalı'}</span>
                                </div>
                            );
                        })}
                    </div>
                </Card>
                <div className="flex flex-col gap-4 min-w-0">
                    <Card title="Bant eşikleri" subtitle="Skorun hangi aralığı hangi duruma karşılık gelir">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Sağlıklı (ve üstü)" htmlFor="ah-good"><input id="ah-good" type="number" min={1} max={100} className="m-input m-tabular" value={draft.good} onChange={e => setBand('good', e.target.value)} /></Field>
                            <Field label="İzlemede (ve üstü)" htmlFor="ah-warn"><input id="ah-warn" type="number" min={0} max={99} className="m-input m-tabular" value={draft.warn} onChange={e => setBand('warn', e.target.value)} /></Field>
                        </div>
                        <div aria-hidden="true" className="flex h-2.5 rounded-full overflow-hidden">
                            <span style={{ width: `${Math.max(0, draft.warn)}%`, background: 'var(--m-bad)' }}></span>
                            <span style={{ width: `${Math.max(0, draft.good - draft.warn)}%`, background: 'var(--m-warn)' }}></span>
                            <span style={{ flex: 1, background: 'var(--m-ok)' }}></span>
                        </div>
                        <p className="m-0 text-[13px] m-text-3">{draft.good} ve üstü {BAND_META.good.label} · {draft.warn}–{Math.max(draft.warn, draft.good - 1)} {BAND_META.warn.label} · {draft.warn} altı {BAND_META.bad.label}{draft.good !== BAND_GOOD || draft.warn !== BAND_WARN ? ` (uzman: ${BAND_GOOD}/${BAND_WARN})` : ''}</p>
                    </Card>
                    <Card title="Portföye etkisi" subtitle={after ? 'Kaydetmeden önce önizleme' : 'Bugünkü portföy'}>
                        <div className="flex flex-wrap items-baseline gap-3">
                            <span className="text-[32px] leading-none font-bold m-tabular m-text">{before.orgScore}</span>
                            {after && <><span className="m-text-3"><Icon name="chevronRight" size={18} /></span><span className={`text-[32px] leading-none font-bold m-tabular ${after.orgScore < before.orgScore ? 'm-ink-bad' : after.orgScore > before.orgScore ? 'm-ink-ok' : 'm-text'}`}>{after.orgScore}</span></>}
                            <span className="text-[14px] m-text-3">portföy skoru · {before.projects.length} proje</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {(['bad', 'warn', 'good'] as const).map(b => {
                                const n0 = dist(before)[b];
                                const n1 = after ? dist(after)[b] : n0;
                                return <span key={b} className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[13px] font-semibold ${BAND_META[b].tone}`}>{BAND_META[b].label}: {n0}{after && n1 !== n0 ? ` → ${n1}` : ''}</span>;
                            })}
                        </div>
                    </Card>
                    {error && <p role="alert" className="m-0 text-[14px] m-ink-bad">{error}</p>}
                    {message && <p role="status" className={`m-0 text-[14px] ${message.ok ? 'm-ink-ok' : 'm-ink-bad'}`}>{message.text}</p>}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <button type="button" className="m-btn m-btn-primary" disabled={!dirty || !!error} onClick={save}><Icon name="check" size={18} />Kaydet</button>
                        {dirty && <button type="button" className="m-btn m-btn-gray" onClick={() => { setDraft(initial()); setMessage(null); }}>Vazgeç</button>}
                        {current.customized && <button type="button" className="m-btn m-btn-plain" onClick={reset}>Uzman yöntemine dön</button>}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ------------------------------------------------------------------ yapay zekâ

const SegmentedNumber: React.FC<{ label: string; options: { value: number; label: string }[]; value: number; onChange: (v: number) => void }> = ({ label, options, value, onChange }) => (
    <div className="m-segmented self-start" role="group" aria-label={label}>
        {options.map(o => <button key={o.value} type="button" className="m-segment" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
);

const AiSettings: React.FC<Pick<ModernAdminProps, 'workspace' | 'onUpdateAiPolicy' | 'onUpdateReportFlow' | 'onSection'>> = ({ workspace, onUpdateAiPolicy, onUpdateReportFlow, onSection }) => {
    const policy = aiPolicyOf(workspace);
    const sc = policy.scoring;
    const flow = reportFlowOf(workspace);
    const health = healthSettingsOf(workspace);
    const stats = useMemo(() => scoringStats(workspace), [workspace]);
    const [status, setStatus] = useState<(AiStatus & { unreachable?: boolean }) | null>(null);
    useEffect(() => {
        const c = new AbortController();
        fetchAiStatus(c.signal).then(setStatus).catch(() => setStatus({ configured: false, authMode: 'none', unreachable: true }));
        return () => c.abort();
    }, []);
    const set = (patch: Parameters<ModernAdminProps['onUpdateAiPolicy']>[0], label: string) => onUpdateAiPolicy(patch, label);
    const setScoring = (patch: Partial<AiScoringPolicy>, label: string) => set({ scoring: patch }, label);
    const pctNum = (v: number) => `%${Math.round(v * 100)}`;
    const num = (v: number | null) => (v === null ? '—' : String(v).replace('.', ','));
    const flags = (Object.keys(FLAG_LABELS) as AiAssessmentFlag[]).filter(f => stats.byFlag[f]);

    return (
        <div className="flex flex-col gap-4">
            <Note>
                Sağlayıcı, model ve API anahtarı güvenlik gereği yalnız sunucu ortam değişkenlerindedir (AI_PROVIDER, AI_MODEL, AI_API_KEY; bkz. docs/AI_KURULUM.md) ve bu panele ya da tarayıcıya girmez. Buradan kurum genelinde AI kullanımını, özellikleri ve rapor puanlamasının güvencelerini yönetirsiniz; hangi rolün AI kullanacağı Yetkiler bölümündeki “Yapay zekâ özelliklerini kullanır” satırındadır.
            </Note>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))' }}>
                <Card title="Kurum geneli" subtitle="Kapalı özellik hiçbir kullanıcıda görünmez">
                    <div className="flex flex-col -my-1">
                        <SwitchRow index={0} label="Yapay zekâ özellikleri" hint="Ana anahtar: kapalıysa asistan, ekran içi AI ve puanlama çalışmaz" on={policy.enabled} onChange={on => set({ enabled: on }, `yapay zekâ ${on ? 'açıldı' : 'kapatıldı'}`)} />
                        <SwitchRow index={1} label="Asistan sohbeti" hint="Sağ alttaki asistan, ⌘K'den soru ve projedeki tam ekran sohbet" on={policy.chat} disabled={!policy.enabled} onChange={on => set({ chat: on }, `asistan sohbeti ${on ? 'açıldı' : 'kapatıldı'}`)} />
                        <SwitchRow index={2} label="Ekran içi AI" hint="Rapor taslağı, risk önerisi, PERT tahmini, brifing ve durum raporu metni" on={policy.embedded} disabled={!policy.enabled} onChange={on => set({ embedded: on }, `ekran içi AI ${on ? 'açıldı' : 'kapatıldı'}`)} />
                        <SwitchRow index={3} label="Değişiklik önerileri" hint="Asistan “şu riski ekle” gibi istekte öneri kartı hazırlar; kullanıcı onaylamadan hiçbir şey değişmez" on={policy.proposals} disabled={!policy.enabled} onChange={on => set({ proposals: on }, `değişiklik önerileri ${on ? 'açıldı' : 'kapatıldı'}`)} />
                    </div>
                </Card>
                <Card title="Sunucu bağlantısı" subtitle="Ortam değişkenlerinden, salt okunur">
                    {!status ? <p className="m-0 text-[14px] m-text-3">Denetleniyor…</p> : (
                        <div className="flex flex-col gap-2.5">
                            <span className={`self-start inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold ${status.configured ? 'm-tone-ok' : 'm-tone-warn'}`}>{status.configured ? 'Hazır' : status.unreachable ? 'Sunucuya ulaşılamadı' : 'Yapılandırılmamış'}</span>
                            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
                                <dt className="m-text-3">Sağlayıcı</dt><dd className="m-0 m-text">{status.provider || '—'}</dd>
                                <dt className="m-text-3">Model</dt><dd className="m-0 m-text break-all">{status.model || '—'}</dd>
                                <dt className="m-text-3">Anlamsal arama</dt><dd className="m-0 m-text break-all">{status.embeddingModel || 'Kapalı (anahtar kelime araması)'}</dd>
                                <dt className="m-text-3">Erişim koruması</dt><dd className="m-0 m-text">{status.authMode === 'token' ? 'Erişim kodu' : status.authMode === 'supabase' ? 'Supabase üyeliği' : 'Yok (yalnız kurum içi ağ)'}</dd>
                            </dl>
                            {status.problem && <p className="m-0 text-[13px] m-ink-warn">{status.problem}</p>}
                        </div>
                    )}
                </Card>
            </div>

            <section aria-labelledby="ad-ai-guard" className="m-surface rounded-2xl p-5 flex flex-col gap-4">
                <div>
                    <h2 id="ad-ai-guard" className="m-0 text-[17px] font-semibold m-text">Rapor metni puanlama — halüsinasyon güvenceleri</h2>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Model yalnız onaylı rapor metnini görür, önce rapordan birebir alıntı çıkarır sonra puanlar; metinde geçmeyen alıntı atılır. Aşağıdaki kurallardan biri karşılanmazsa değerlendirme “düşük güven” olur.</p>
                </div>
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
                    <Field label="Bağımsız değerlendirme sayısı" hint="Aynı rapor N kez puanlanır; skor medyandır. 3 önerilir (maliyet N katı).">
                        <SegmentedNumber label="Değerlendirme sayısı" value={sc.runs} options={[{ value: 1, label: '1' }, { value: 3, label: '3' }, { value: 5, label: '5' }]} onChange={v => setScoring({ runs: v }, `değerlendirme sayısı ${v}`)} />
                    </Field>
                    <Field label="Kabul edilen en büyük dağılım" hint="Tekrarlar arasındaki en yüksek − en düşük puan farkı">
                        <SegmentedNumber label="Dağılım" value={sc.maxSpread} options={[1, 2, 3, 4].map(v => ({ value: v, label: `${v} puan` }))} onChange={v => setScoring({ maxSpread: v }, `dağılım sınırı ${v}`)} />
                    </Field>
                    <Field label="Doğrulanmış kanıt alt sınırı" hint="Rapor metninde birebir bulunan alıntı sayısı">
                        <SegmentedNumber label="Kanıt" value={sc.minEvidence} options={[0, 1, 2, 3].map(v => ({ value: v, label: v === 0 ? 'Yok' : String(v) }))} onChange={v => setScoring({ minEvidence: v }, `kanıt alt sınırı ${v}`)} />
                    </Field>
                    <Field label="Kural göstergesiyle en büyük fark" hint="Tarih, tutar, teslimat, genel ifade ve olumsuzluk sayan kural tabanlı göstergeyle karşılaştırma">
                        <SegmentedNumber label="Kural farkı" value={sc.maxRuleGap} options={[2, 3, 4, 5, 6].map(v => ({ value: v, label: String(v) }))} onChange={v => setScoring({ maxRuleGap: v }, `kural farkı sınırı ${v}`)} />
                    </Field>
                </div>
                <div className="flex flex-col -my-1">
                    <SwitchRow index={0} label="Güveni düşük puan sağlık skoruna girmesin" hint={sc.lowConfidence === 'exclude' ? 'Düşük güvenli değerlendirme dışarıda kalır; proje sağlığında bir önceki güvenilir değerlendirme kullanılır' : 'Düşük güvenli değerlendirme “güven düşük” notuyla skora girer'} on={sc.lowConfidence === 'exclude'} onChange={on => setScoring({ lowConfidence: on ? 'exclude' : 'flag' }, on ? 'düşük güvenli puan dışarıda' : 'düşük güvenli puan işaretli girer')} />
                    <SwitchRow index={1} label="Hafta yayınlanırken otomatik puanla" hint="Haftalık rapor akışındaki ayarla aynıdır" on={flow.aiOnPublish} onChange={on => onUpdateReportFlow({ aiOnPublish: on }, `yayında AI metin puanı ${on ? 'açıldı' : 'kapatıldı'}`)} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[14px] m-text-2">
                    <span>Sağlık skorundaki ağırlığı: <b className="m-text">{health.weights.ai > 0 ? pctNum(health.weights.ai) : 'Kapalı'}</b></span>
                    <button type="button" className="m-btn m-btn-plain !min-h-[34px] !px-2.5" onClick={() => onSection('health')}>Sağlık puanında değiştir</button>
                </div>
            </section>

            <section aria-labelledby="ad-ai-mon" className="m-surface rounded-2xl p-5 flex flex-col gap-3">
                <div>
                    <h2 id="ad-ai-mon" className="m-0 text-[17px] font-semibold m-text">İzleme (son {stats.weeks} hafta)</h2>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">PMO'nun 1–10 puanı insan ölçüsüdür: AI puanının ne kadar güvenilir olduğu ona göre izlenir.</p>
                </div>
                <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-4">
                    {[
                        { label: 'Değerlendirme', value: String(stats.assessed) },
                        { label: 'Güveni düşük', value: stats.assessed ? `${stats.low} (${pctNum(stats.low / stats.assessed)})` : '0', tone: stats.low ? 'm-ink-warn' : 'm-text' },
                        { label: 'PMO ile ortalama fark', value: stats.pmo.mae === null ? '—' : `${num(stats.pmo.mae)} puan`, tone: stats.pmo.mae !== null && stats.pmo.mae > 2 ? 'm-ink-bad' : 'm-text' },
                        { label: 'Tekrarlar arası dağılım', value: stats.avgSpread === null ? '—' : `${num(stats.avgSpread)} puan` },
                    ].map(t => (
                        <div key={t.label} className="rounded-xl m-fill-2 px-3 py-2.5 flex flex-col">
                            <span className="text-[12.5px] m-text-3">{t.label}</span>
                            <span className={`text-[20px] font-bold m-tabular ${t.tone || 'm-text'}`}>{t.value}</span>
                        </div>
                    ))}
                </div>
                <p className="m-0 text-[13px] m-text-3">PMO eşleşmesi: {stats.pmo.n} değerlendirme{stats.pmo.r !== null ? ` · korelasyon r = ${num(stats.pmo.r)}` : ''} · kural göstergesiyle ortalama fark: {stats.rule.mae === null ? '—' : `${num(stats.rule.mae)} puan`}{flags.length ? ` · ${flags.map(f => `${FLAG_LABELS[f]}: ${stats.byFlag[f]}`).join(' · ')}` : ''}</p>
                {stats.advice.map(a => <p key={a} className="m-0 text-[14px] m-text-2 flex items-start gap-2"><span className="m-accent" style={{ marginTop: 2 }}><Icon name="info" size={16} /></span>{a}</p>)}
            </section>
        </div>
    );
};

// ------------------------------------------------------------------ profiller

const SOURCE_LABEL = (o: ProfileOption): { text: string; tone: string } =>
    o.source === 'defined' ? { text: 'Tanımlı', tone: 'm-tone-accent' }
        : o.source === 'auto' ? { text: o.role === 'py' ? 'Otomatik · proje sahibi' : 'Otomatik · bölüm sorumlusu', tone: 'm-tone-hold' }
            : { text: 'Kişisiz', tone: 'm-fill m-text-3' };

const ProfileManager: React.FC<Pick<ModernAdminProps, 'workspace' | 'onAddProfile' | 'onRemoveProfile'>> = ({ workspace, onAddProfile, onRemoveProfile }) => {
    const [role, setRole] = useState<UserRole>('py');
    const [personId, setPersonId] = useState('');
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const options = useMemo(() => profileOptions(workspace), [workspace]);
    const people = useMemo(() => [...workspace.people].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr')), [workspace.people]);
    const needsPerson = roleNeedsPerson(role);

    const add = (e: React.FormEvent) => {
        e.preventDefault();
        if (needsPerson && !personId) return;
        const ok = onAddProfile(role, personId || undefined);
        setMessage(ok ? { ok: true, text: 'Profil eklendi; profil değiştirme penceresinde görünür.' } : { ok: false, text: 'Bu profil zaten tanımlı.' });
        if (ok) setPersonId('');
    };

    return (
        <div className="flex flex-col gap-5">
            <form onSubmit={add} className="m-surface rounded-2xl p-5 flex flex-col gap-3">
                <div>
                    <h2 className="m-0 text-[17px] font-semibold m-text">Profil ekle</h2>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Bir kişiyi bir rolle eşleştirin. Proje yöneticileri ve bölüm sorumluları kendiliğinden listelenir; burada ek profiller (ör. Müdür, PYB destek) tanımlanır.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] items-end">
                    <Field label="Rol" htmlFor="ad-role">
                        <select id="ad-role" className="m-input" value={role} onChange={e => { setRole(e.target.value as UserRole); setMessage(null); }}>
                            {ROLE_ORDER.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                    </Field>
                    <Field label={needsPerson ? 'Kişi' : 'Kişi (isteğe bağlı)'} htmlFor="ad-person">
                        <select id="ad-person" className="m-input" value={personId} onChange={e => { setPersonId(e.target.value); setMessage(null); }}>
                            <option value="">{needsPerson ? 'Kişi seçin' : 'Kişi seçmeden'}</option>
                            {people.map(p => <option key={p.id} value={p.id}>{`${p.firstName} ${p.lastName}`.trim()}{p.departmentCode ? ` · ${p.departmentCode}` : ''}</option>)}
                        </select>
                    </Field>
                    <button type="submit" className="m-btn m-btn-primary" disabled={needsPerson && !personId}><Icon name="plus" size={18} strokeWidth={2.2} />Ekle</button>
                </div>
                {message && <p role="status" className={`m-0 text-[14px] ${message.ok ? 'm-ink-ok' : 'm-ink-warn'}`}>{message.text}</p>}
            </form>

            {ROLE_ORDER.map(r => {
                const items = options.filter(o => o.role === r);
                if (!items.length) return null;
                return (
                    <section key={r} aria-label={ROLE_LABELS[r]} className="flex flex-col gap-1.5">
                        <div className="px-1 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-2">
                            <h3 className="m-0 text-[15px] font-semibold m-text">{ROLE_LABELS[r]} <span className="m-text-3 font-normal m-tabular">{items.length}</span></h3>
                            <span className="text-[13px] m-text-3 truncate">{ROLE_DESCRIPTIONS[r]}</span>
                        </div>
                        <div className="m-surface rounded-2xl p-1.5">
                            {items.map((o, i) => {
                                const sep = rowSep(i);
                                const src = SOURCE_LABEL(o);
                                return (
                                    <div key={o.key} className={`flex items-center gap-3 px-2.5 py-2 min-h-[56px] ${sep.className}`} style={sep.style}>
                                        <span aria-hidden="true" className="w-9 h-9 rounded-full m-fill flex items-center justify-center text-[13px] font-semibold m-text-2 flex-none">{o.initials}</span>
                                        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                            <span className="text-[15px] font-semibold m-text truncate">{o.name}</span>
                                            <span className="text-[13px] m-text-3 truncate">{o.personId ? o.detail : 'Kişi seçmeden çalışılır'}</span>
                                        </span>
                                        <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${src.tone}`}>{src.text}</span>
                                        {o.profileId ? (
                                            <button type="button" className="m-icon-btn !w-9 !h-9" aria-label={`${o.name} (${ROLE_LABELS[o.role]}) profilini kaldır`} onClick={() => onRemoveProfile(o.profileId!)}><Icon name="trash" size={16} /></button>
                                        ) : <span className="w-9 flex-none"></span>}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
};

// ------------------------------------------------------------------ uygulama araçları

const AppTools: React.FC<Pick<ModernAdminProps, 'workspace' | 'onSaveBackup' | 'onLoadBackup' | 'onApplyHealthFix' | 'cloudLinked' | 'onOpenCloud'>> = ({ workspace, onSaveBackup, onLoadBackup, onApplyHealthFix, cloudLinked, onOpenCloud }) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const stats = [
        { label: 'Proje', value: workspace.projects.length },
        { label: 'Kişi', value: workspace.people.length },
        { label: 'Haftalık rapor', value: (workspace.weeklyReports || []).length },
        { label: 'Günlük kaydı', value: (workspace.auditLog || []).length },
    ];
    return (
        <div className="flex flex-col gap-4">
            <section aria-label="Çalışma alanı" className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                {stats.map(s => (
                    <div key={s.label} className="m-surface rounded-2xl px-4 py-3 flex flex-col">
                        <span className="text-[13px] m-text-3">{s.label}</span>
                        <span className="text-[26px] font-bold m-tabular m-text">{s.value}</span>
                    </div>
                ))}
            </section>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))' }}>
                {(onSaveBackup || onLoadBackup) && (
                    <Card title="Yedek" subtitle="Çalışma alanının tamamı tek JSON dosyasında">
                        <div className="flex flex-wrap gap-2.5">
                            {onSaveBackup && <button type="button" className="m-btn m-btn-gray" onClick={onSaveBackup}><Icon name="download" size={18} />Yedeği indir</button>}
                            {onLoadBackup && <button type="button" className="m-btn m-btn-gray" onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} />Yedekten yükle</button>}
                            {onLoadBackup && <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onLoadBackup(f); e.target.value = ''; }} />}
                        </div>
                        <p className="m-0 text-[13px] m-text-3">Yedekten yükleme mevcut çalışma alanının tamamını değiştirir; önce onay istenir ve denetim günlüğüne yazılır.</p>
                    </Card>
                )}
                <Card title="Bulut eşitleme" subtitle={cloudLinked ? 'Bu tarayıcı bir bulut çalışma alanına bağlı' : 'Bağlı değil'}>
                    <div className="flex flex-wrap items-center gap-2.5">
                        <span className={`inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold ${cloudLinked ? 'm-tone-ok' : 'm-tone-hold'}`}>{cloudLinked ? 'Bağlı' : 'Yerel'}</span>
                        <button type="button" className="m-btn m-btn-gray" onClick={onOpenCloud}><Icon name="cloud" size={18} />Bulut ayarları</button>
                    </div>
                    <p className="m-0 text-[13px] m-text-3">Yetkiler, görünüm ayarları, rapor akışı ve sağlık yöntemi bulut eşitlemesiyle tüm kullanıcılara uygulanır.</p>
                </Card>
            </div>
            {onApplyHealthFix && (
                <section aria-labelledby="ad-dh" className="flex flex-col gap-3">
                    <div>
                        <h2 id="ad-dh" className="m-0 text-[17px] font-semibold m-text">Veri sağlığı</h2>
                        <p className="m-0 mt-0.5 text-[14px] m-text-3">Gerçek veriyle çalışmadan önce tutarsızlıkları bulun ve düzeltin.</p>
                    </div>
                    <DataHealthPanel workspace={workspace} onApplyFix={onApplyHealthFix} />
                </section>
            )}
        </div>
    );
};

// ------------------------------------------------------------------ konsol

const ModernAdmin: React.FC<ModernAdminProps> = props => {
    const { workspace, section, onSection, showSectionNav, canAudit } = props;
    const sections = ADMIN_SECTIONS.filter(s => s.key !== 'audit' || canAudit);
    const active = sections.find(s => s.key === section) || sections[0];
    const customizedPerms = customizedRoles(workspace.rolePermissions).length;
    const customizedViews = Object.keys(workspace.viewConfig || {}).length;

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-[72ch]">
                    <p className="m-0 text-[15px] m-text-3">Yönetici konsolu</p>
                    <h1 className="m-0 mt-0.5 text-[34px] leading-tight font-bold tracking-[-0.02em] m-text">{active.label}</h1>
                    <p className="m-0 mt-1 text-[15px] m-text-3">{active.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {customizedPerms > 0 && <span className="inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold m-tone-warn">{customizedPerms} rolde özel yetki</span>}
                    {customizedViews > 0 && <span className="inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold m-tone-warn">{customizedViews} rolde özel görünüm</span>}
                </div>
            </header>
            {showSectionNav && (
                <div className="-mx-1 px-1 overflow-x-auto">
                    <div className="m-segmented" role="group" aria-label="Konsol bölümü">
                        {sections.map(s => (
                            <button key={s.key} type="button" className="m-segment whitespace-nowrap" aria-pressed={active.key === s.key} onClick={() => onSection(s.key)}><Icon name={s.icon} size={16} />{s.label}</button>
                        ))}
                    </div>
                </div>
            )}
            {active.key === 'permissions' && <PermissionMatrix {...props} />}
            {active.key === 'views' && <ViewSettings {...props} />}
            {active.key === 'report' && <ReportFlowSettings {...props} />}
            {active.key === 'health' && <HealthMethodSettings {...props} />}
            {active.key === 'ai' && <AiSettings {...props} />}
            {active.key === 'profiles' && <ProfileManager {...props} />}
            {active.key === 'audit' && canAudit && <div className="flex flex-col gap-4"><AuditLogPanel workspace={workspace} /></div>}
            {active.key === 'app' && <AppTools {...props} />}
        </div>
    );
};

export default ModernAdmin;
