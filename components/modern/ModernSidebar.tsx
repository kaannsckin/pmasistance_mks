import React, { useRef, useState } from 'react';
import { RagStatus, UserRole, View } from '../../types';
import { ROLE_LABELS } from '../../utils/allocations';
import { useAssistantOptional } from '../assistant/AssistantContext';
import { RocketLogo } from './Eggs';
import { Icon, IconName } from './icons';
import { AdminSection, ADMIN_SECTIONS } from './adminSections';

export interface SidebarProject {
    id: string;
    name: string;
    rag?: RagStatus;
    openTasks: number;
}

export interface SidebarPerson {
    id: string;
    name: string;
    initials: string;
    departmentCode: string;
}

interface ModernSidebarProps {
    isOpen: boolean; // dar ekranda çekmece açık mı
    onClose: () => void;
    currentView: View;
    hasActiveProject: boolean;
    onNavigate: (view: View) => void;
    exec: boolean; // Yönetim ekranı yetkisi
    canAdmin: boolean; // Yönetici (admin) ekranı yetkisi
    /** Admin rolü: yalnız yönetici konsolu (proje yönetimi ekranları yok) */
    consoleMode?: boolean;
    adminSection?: AdminSection;
    onAdminSection?: (s: AdminSection) => void;
    /** Profil değiştirme penceresini aç */
    onOpenProfile: () => void;
    /** Yönetimden beklentiler rozeti (yönetim: yanıtsız, diğerleri: aktif) */
    expectationBadge?: number;
    /** Haftalık rapor: rolün beklenen işi (gönderilmemiş, onay bekleyen) */
    reportBadge?: number;
    /** Müşteri görüşmeleri: yönetim için onay bekleyen, sahibi için sonucu yazılmamış */
    meetingBadge?: number;
    projects: SidebarProject[];
    activeProjectId: string | null;
    onOpenProject: (id: string) => void;
    canCreateProject: boolean;
    onNewProject: () => void;
    onOpenSearch: () => void;
    // Kimlik (RBAC)
    currentRole: UserRole;
    currentPersonId?: string;
    people: SidebarPerson[];
    needsPerson: boolean;
    // Ayarlar ve veri işlemleri
    onOpenSettings: () => void;
    onSwitchToClassic: () => void;
    /** Yedek, veri sağlığı ve denetim günlüğü yalnız ilgili app.* yetkisiyle verilir */
    onSaveBackup?: () => void;
    onLoadBackup?: (file: File) => void;
    cloudLinked: boolean;
    onOpenCloud: () => void;
    healthAlerts: number;
    onOpenHealth?: () => void;
    onOpenAudit?: () => void;
    onOpenAbout: () => void;
    // Sürprizler
    onLogoLaunch: () => void;
    onHyperdrive: () => void;
}

/** Kenar çubuğunda en fazla bu kadar proje; açık proje her zaman görünür, önce sorunlular */
export const SIDEBAR_PROJECT_LIMIT = 8;
const RAG_ORDER: Record<RagStatus | 'none', number> = { red: 0, amber: 1, none: 2, green: 3 };
export const sidebarProjects = (projects: SidebarProject[], activeId: string | null): SidebarProject[] => {
    if (projects.length <= SIDEBAR_PROJECT_LIMIT) return projects;
    const sorted = [...projects].sort((a, b) => RAG_ORDER[a.rag || 'none'] - RAG_ORDER[b.rag || 'none'] || a.name.localeCompare(b.name, 'tr'));
    const top = sorted.slice(0, SIDEBAR_PROJECT_LIMIT);
    const active = activeId ? projects.find(p => p.id === activeId) : undefined;
    return active && !top.some(p => p.id === active.id) ? [active, ...top.slice(0, SIDEBAR_PROJECT_LIMIT - 1)] : top;
};

export const RAG_DOT: Record<RagStatus | 'none', string> = {
    green: 'var(--m-ok)',
    amber: 'var(--m-warn)',
    red: 'var(--m-bad)',
    none: 'var(--m-hold)',
};

const NavItem: React.FC<{ icon: IconName; label: string; active: boolean; onClick: () => void; badge?: number }> = ({ icon, label, active, onClick, badge }) => (
    <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`w-full flex items-center gap-3 min-h-[44px] px-2.5 rounded-[10px] text-[15px] text-left ${active ? 'm-accent-bg font-semibold' : 'm-text font-medium m-row-link'}`}
    >
        <span className={active ? '' : 'm-accent'}><Icon name={icon} size={20} /></span>
        <span className="flex-1 min-w-0 truncate">{label}</span>
        {!!badge && <span className={`text-[13px] m-tabular ${active ? '' : 'm-text-3'}`}>{badge}</span>}
    </button>
);

/** "Diğer" menüsü: yedek, bulut, veri sağlığı, denetim ve arayüz (profil seçimi ayrı pencerede) */
const ToolsMenu: React.FC<Pick<ModernSidebarProps, 'onSwitchToClassic' | 'onSaveBackup' | 'onLoadBackup' | 'cloudLinked' | 'onOpenCloud' | 'healthAlerts' | 'onOpenHealth' | 'onOpenAudit' | 'onOpenAbout' | 'onOpenProfile' | 'consoleMode'> & { onDone: () => void }> = (p) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const item = (icon: IconName, label: string, run: () => void, trailing?: React.ReactNode) => (
        <button type="button" role="menuitem" onClick={() => { run(); p.onDone(); }} className="m-row-link w-full flex items-center gap-3 min-h-[44px] px-3.5 text-[15px]">
            <span className="m-text-3"><Icon name={icon} size={18} /></span>
            <span className="flex-1 min-w-0 truncate">{label}</span>
            {trailing}
        </button>
    );
    return (
        <div role="menu" aria-label="Diğer araçlar" className="absolute bottom-full left-2 right-2 mb-2 m-surface m-pop rounded-2xl py-1.5 z-50 max-h-[70vh] overflow-y-auto">
            {item('userCog', 'Profil değiştir', p.onOpenProfile)}
            <div className="border-t m-sep my-1"></div>
            {p.onSaveBackup && item('download', 'Yedeği indir', p.onSaveBackup)}
            {p.onLoadBackup && item('upload', 'Yedekten yükle', () => fileRef.current?.click())}
            {item('cloud', 'Bulut eşitleme', p.onOpenCloud, p.cloudLinked ? <span className="text-[13px] m-ink-ok font-semibold">Bağlı</span> : undefined)}
            {p.onOpenHealth && item('activity', 'Veri sağlığı', p.onOpenHealth, p.healthAlerts > 0 ? <span className="text-[13px] font-semibold m-ink-warn">{p.healthAlerts}</span> : undefined)}
            {p.onOpenAudit && item('history', 'Denetim günlüğü', p.onOpenAudit)}
            {item('info', 'Hakkında', p.onOpenAbout)}
            {!p.consoleMode && <div className="border-t m-sep my-1"></div>}
            {!p.consoleMode && item('swap', 'Klasik arayüze dön', p.onSwitchToClassic)}
            {p.onLoadBackup && (
                <input
                    ref={fileRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onLoadBackup!(f); e.target.value = ''; p.onDone(); }}
                />
            )}
        </div>
    );
};

const ModernSidebar: React.FC<ModernSidebarProps> = (props) => {
    const { consoleMode, adminSection, onAdminSection } = props;
    const { isOpen, onClose, currentView, hasActiveProject, onNavigate, exec, canAdmin, onOpenProfile, expectationBadge, reportBadge, meetingBadge, projects, activeProjectId, onOpenProject, canCreateProject, onNewProject, onOpenSearch, currentRole, currentPersonId, people, needsPerson, onOpenSettings, onLogoLaunch, onHyperdrive } = props;
    const [menuOpen, setMenuOpen] = useState(false);
    const assistant = useAssistantOptional();
    const person = people.find(p => p.id === currentPersonId);
    const go = (view: View) => { onNavigate(view); onClose(); };
    // Proje içindeyken üst menüde hiçbir genel ekran seçili görünmez
    const isActive = (view: View) => currentView === view && (view !== View.Portfolio || !hasActiveProject);

    return (
        <>
            {isOpen && <div className="lg:hidden fixed inset-0 z-[65] bg-black/30" onClick={onClose} aria-hidden="true"></div>}
            <nav
                aria-label="Ana menü"
                className={`m-sidebar m-surface border-r m-sep h-screen lg:sticky top-0 flex flex-col gap-5 px-3 py-4 overflow-y-auto ${isOpen ? 'is-open' : ''}`}
            >
                <div className="flex items-center justify-between">
                    <RocketLogo onLaunch={onLogoLaunch} onHyperdrive={onHyperdrive} />
                    <button type="button" className="m-icon-btn lg:hidden" aria-label="Menüyü kapat" onClick={onClose}><Icon name="x" /></button>
                </div>

                {!consoleMode && <button
                    type="button"
                    onClick={() => { onOpenSearch(); onClose(); }}
                    className="m-search flex items-center gap-2 min-h-[40px] px-2.5 rounded-[10px] text-[15px] m-text-3 text-left"
                    aria-label="Ara: proje, görev, kişi (Ctrl+K)"
                >
                    <Icon name="search" size={18} strokeWidth={2} />
                    <span className="flex-1">Ara</span>
                    <kbd className="text-[12px] px-1.5 rounded-[5px] border m-sep font-sans">⌘K</kbd>
                </button>}

                {consoleMode ? (
                    <div className="flex flex-col gap-0.5">
                        <span className="pl-2.5 pb-1 text-[13px] font-semibold m-text-3">Yönetici konsolu</span>
                        {ADMIN_SECTIONS.map(s => (
                            <NavItem key={s.key} icon={s.icon} label={s.label} active={currentView === View.Admin && adminSection === s.key} onClick={() => { onAdminSection?.(s.key); go(View.Admin); }} />
                        ))}
                    </div>
                ) : <>
                <div className="flex flex-col gap-0.5">
                    {exec && <NavItem icon="gauge" label="Yönetim" active={isActive(View.Executive)} onClick={() => go(View.Executive)} />}
                    <NavItem icon="grid" label="Portföy" active={isActive(View.Portfolio)} onClick={() => go(View.Portfolio)} />
                    <NavItem icon="users" label="Ekip ve tahsis" active={isActive(View.Allocations)} onClick={() => go(View.Allocations)} />
                    <NavItem icon="calendar" label="Takvim" active={isActive(View.Calendar)} onClick={() => go(View.Calendar)} />
                    <NavItem icon="shield" label="Risk raporu" active={isActive(View.RiskReport)} onClick={() => go(View.RiskReport)} />
                    <NavItem icon="report" label="Haftalık rapor" active={isActive(View.WeeklyReport)} onClick={() => go(View.WeeklyReport)} badge={reportBadge} />
                    <NavItem icon="calendarCheck" label="Görüşmeler" active={isActive(View.Meetings)} onClick={() => go(View.Meetings)} badge={meetingBadge} />
                    <NavItem icon="flag" label="Beklentiler" active={isActive(View.Expectations)} onClick={() => go(View.Expectations)} badge={expectationBadge} />
                    <NavItem icon="database" label="Veri havuzu" active={isActive(View.DataPool)} onClick={() => go(View.DataPool)} />
                    {canAdmin && <NavItem icon="key" label="Yönetici" active={isActive(View.Admin)} onClick={() => go(View.Admin)} />}
                </div>

                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between pl-2.5">
                        <span className="text-[15px] font-semibold m-text">Projeler</span>
                        {canCreateProject && (
                            <button type="button" className="m-icon-btn" style={{ color: 'var(--m-accent)' }} aria-label="Yeni proje" onClick={() => { onNewProject(); onClose(); }}>
                                <Icon name="plus" strokeWidth={2} />
                            </button>
                        )}
                    </div>
                    {projects.length === 0 && <p className="px-2.5 py-2 text-[14px] m-text-3">Kapsamınızda proje yok.</p>}
                    {sidebarProjects(projects, hasActiveProject ? activeProjectId : null).map(p => {
                        const active = hasActiveProject && p.id === activeProjectId;
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => { onOpenProject(p.id); onClose(); }}
                                aria-current={active ? 'true' : undefined}
                                className={`w-full flex items-center gap-3 min-h-[44px] px-2.5 rounded-[10px] text-[15px] text-left ${active ? 'm-accent-tint font-semibold' : 'm-row-link m-text'}`}
                            >
                                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: RAG_DOT[p.rag || 'none'] }}></span>
                                <span className="flex-1 min-w-0 truncate">{p.name}</span>
                                {p.openTasks > 0 && <span className="text-[13px] m-text-3 m-tabular" aria-label={`${p.openTasks} açık görev`}>{p.openTasks}</span>}
                            </button>
                        );
                    })}
                    {projects.length > SIDEBAR_PROJECT_LIMIT && (
                        <button type="button" onClick={() => go(View.Portfolio)} className="m-row-link w-full flex items-center gap-3 min-h-[44px] px-2.5 rounded-[10px] text-[15px] m-accent font-medium">
                            <span className="w-2.5 flex-none"></span>
                            <span className="flex-1">Tüm projeler ({projects.length})</span>
                            <Icon name="chevronRight" size={16} strokeWidth={2.2} />
                        </button>
                    )}
                </div>
                </>}

                <div className="mt-auto flex flex-col gap-1.5">
                    {assistant?.chatEnabled && !consoleMode && (
                        <button type="button" onClick={() => { assistant.setOpen(true); onClose(); }} className="m-row-link w-full flex items-center gap-3 min-h-[44px] px-2.5 rounded-[10px] text-[15px] font-medium">
                            <span className="m-text-3"><Icon name="message" /></span>
                            Asistan
                        </button>
                    )}
                    <div className="relative flex items-center gap-1 pt-2 border-t m-sep">
                        <button
                            type="button"
                            onClick={() => { onOpenProfile(); onClose(); }}
                            aria-haspopup="dialog"
                            title="Profil değiştir"
                            className="m-row-link flex-1 min-w-0 flex items-center gap-2.5 min-h-[52px] px-2 rounded-xl"
                        >
                            <span className="w-9 h-9 rounded-full m-fill flex items-center justify-center text-[13px] font-semibold flex-none" aria-hidden="true">
                                {person ? person.initials : ROLE_LABELS[currentRole].charAt(0)}
                            </span>
                            <span className="flex-1 min-w-0 flex flex-col leading-tight">
                                <span className="text-[15px] font-semibold truncate">{person ? person.name : ROLE_LABELS[currentRole]}</span>
                                <span className={`text-[13px] truncate ${needsPerson ? 'm-ink-warn font-semibold' : 'm-text-3'}`}>
                                    {needsPerson ? 'Kişi seçin' : person ? ROLE_LABELS[currentRole] : 'Profil değiştir'}
                                </span>
                            </span>
                        </button>
                        <button type="button" className="m-icon-btn" aria-label="Diğer araçlar" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}><Icon name="more" /></button>
                        <button type="button" className="m-icon-btn" aria-label="Ayarlar" onClick={onOpenSettings}><Icon name="sliders" /></button>
                        {menuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden="true"></div>
                                <ToolsMenu {...props} onOpenProfile={() => { onOpenProfile(); onClose(); }} onDone={() => setMenuOpen(false)} />
                            </>
                        )}
                    </div>
                </div>
            </nav>
        </>
    );
};

export default ModernSidebar;
