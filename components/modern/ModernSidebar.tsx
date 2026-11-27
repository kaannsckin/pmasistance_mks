import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
    onOpenGuide: () => void;
    /** Geniş ekranda yalnız simgelerden oluşan dar şerit (tercih tarayıcıda saklanır) */
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
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

const NavItem: React.FC<{ icon: IconName; label: string; active: boolean; onClick: () => void; badge?: number; compact?: boolean }> = ({ icon, label, active, onClick, badge, compact }) => (
    <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        aria-label={compact ? `${label}${badge ? ` (${badge})` : ''}` : undefined}
        title={compact ? label : undefined}
        className={`m-nav-item relative w-full flex items-center gap-3 min-h-[44px] px-2.5 rounded-[10px] text-[15px] text-left ${active ? 'm-accent-bg font-semibold' : 'm-text font-medium m-row-link'}`}
    >
        <span className={active ? '' : 'm-accent'}><Icon name={icon} size={20} /></span>
        <span className="m-nav-label flex-1 min-w-0 truncate">{label}</span>
        {!!badge && <span className={`m-nav-badge text-[13px] m-tabular ${active ? '' : 'm-text-3'}`}>{badge}</span>}
    </button>
);

/** Proje kısaltması: iki kelimenin baş harfleri ("GİB PoC" → "GP"), tek kelimede ilk iki harf */
export const projectInitials = (name: string): string => {
    const words = name.trim().split(/[\s\-_/·.]+/).filter(w => /[\p{L}\p{N}]/u.test(w));
    if (!words.length) return '?';
    const pick = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
    return pick.toLocaleUpperCase('tr-TR');
};

/** "Diğer" menüsü: yedek, bulut, veri sağlığı, denetim ve arayüz (profil seçimi ayrı pencerede) */
const ToolsMenu: React.FC<Pick<ModernSidebarProps, 'onSwitchToClassic' | 'onSaveBackup' | 'onLoadBackup' | 'cloudLinked' | 'onOpenCloud' | 'healthAlerts' | 'onOpenHealth' | 'onOpenAudit' | 'onOpenAbout' | 'onOpenProfile' | 'consoleMode'> & { onDone: () => void; onPickBackup: () => void; style?: React.CSSProperties; floating?: boolean }> = (p) => {
    const item = (icon: IconName, label: string, run: () => void, trailing?: React.ReactNode) => (
        <button type="button" role="menuitem" onClick={() => { run(); p.onDone(); }} className="m-row-link w-full flex items-center gap-3 min-h-[44px] px-3.5 text-[15px]">
            <span className="m-text-3"><Icon name={icon} size={18} /></span>
            <span className="flex-1 min-w-0 truncate">{label}</span>
            {trailing}
        </button>
    );
    return (
        <div role="menu" aria-label="Diğer araçlar" style={p.style}
            className={`${p.floating ? 'fixed w-[280px]' : 'absolute bottom-full left-2 right-2 mb-2'} m-surface m-pop rounded-2xl py-1.5 z-[90] max-h-[70vh] overflow-y-auto`}>
            {item('userCog', p.cloudLinked ? 'Bulut hesabı' : 'Profil değiştir', p.onOpenProfile)}
            <div className="border-t m-sep my-1"></div>
            {p.onSaveBackup && item('download', 'Yedeği indir', p.onSaveBackup)}
            {p.onLoadBackup && item('upload', 'Yedekten yükle', p.onPickBackup)}
            {/* Yerel modda yedek yalnız Yönetici yetkisiyle: düğme gizlenmesin, yolu göstersin */}
            {!p.onSaveBackup && !p.onLoadBackup && !p.cloudLinked && item('upload', 'Yedek al / yükle', p.onOpenProfile, <span className="text-[13px] m-text-3">Admin kimliğiyle</span>)}
            {item('cloud', 'Bulut veritabanı', p.onOpenCloud, p.cloudLinked ? <span className="text-[13px] m-ink-ok font-semibold">Bağlı</span> : undefined)}
            {p.onOpenHealth && item('activity', 'Veri sağlığı', p.onOpenHealth, p.healthAlerts > 0 ? <span className="text-[13px] font-semibold m-ink-warn">{p.healthAlerts}</span> : undefined)}
            {p.onOpenAudit && item('history', 'Denetim günlüğü', p.onOpenAudit)}
            <div className="border-t m-sep my-1"></div>
            {item('info', 'PlanAsistan hakkında', p.onOpenAbout)}
            {!p.consoleMode && <div className="border-t m-sep my-1"></div>}
            {!p.consoleMode && item('swap', 'Klasik arayüze dön', p.onSwitchToClassic)}
        </div>
    );
};

const ModernSidebar: React.FC<ModernSidebarProps> = (props) => {
    const { consoleMode, adminSection, onAdminSection } = props;
    const { isOpen, onClose, currentView, hasActiveProject, onNavigate, exec, canAdmin, onOpenProfile, expectationBadge, reportBadge, meetingBadge, projects, activeProjectId, onOpenProject, canCreateProject, onNewProject, onOpenSearch, currentRole, currentPersonId, people, needsPerson, onOpenSettings, onOpenGuide, onToggleCollapsed } = props;
    // Dar şerit yalnız çekmece kapalıyken (geniş ekran); dar ekranda açılan çekmece her zaman tam genişlikte
    const compact = !!props.collapsed && !isOpen;
    const [menuOpen, setMenuOpen] = useState(false);
    // Dar şeritte menü şeridin sağına açılır (şerit taşmayı kestiği için sayfa köküne çizilir)
    const moreRef = useRef<HTMLButtonElement>(null);
    const [menuPos, setMenuPos] = useState<React.CSSProperties | undefined>();
    useLayoutEffect(() => {
        if (!menuOpen || !compact) { setMenuPos(undefined); return; }
        const r = moreRef.current?.getBoundingClientRect();
        if (r) setMenuPos({ left: r.right + 10, bottom: Math.max(8, window.innerHeight - r.bottom) });
    }, [menuOpen, compact]);
    const portalHost = typeof document !== 'undefined' ? (document.querySelector('.ui-modern') as HTMLElement | null) || document.body : null;
    // Yedek dosyası seçici menünün dışında: menü kapanınca (öğe tıklanınca) kaldırılırsa seçilen dosya okunmuyordu
    const backupRef = useRef<HTMLInputElement>(null);
    const assistant = useAssistantOptional();
    const person = people.find(p => p.id === currentPersonId);
    const go = (view: View) => { onNavigate(view); onClose(); };
    // Proje içindeyken üst menüde hiçbir genel ekran seçili görünmez
    const isActive = (view: View) => currentView === view && (view !== View.Portfolio || !hasActiveProject);

    return (
        <>
            {isOpen && <div className="m-sidebar-overlay lg:hidden fixed inset-0 z-[65] bg-black/30" onClick={onClose} aria-hidden="true"></div>}
            <nav
                id="modern-sidebar"
                aria-label="Ana menü"
                className={`m-sidebar m-surface border-r m-sep h-screen lg:sticky top-0 flex flex-col gap-5 px-3 py-4 overflow-y-auto ${isOpen ? 'is-open' : ''} ${compact ? 'is-collapsed' : ''}`}
            >
                <div className="m-sidebar-head flex items-center justify-between gap-1">
                    <span className="m-sidebar-logo"><RocketLogo onOpenGuide={onOpenGuide} /></span>
                    {onToggleCollapsed && !compact && (
                        <button type="button" className="m-icon-btn m-sidebar-collapse" aria-controls="modern-sidebar" aria-expanded="true"
                            aria-label="Menüyü daralt" title="Menüyü daralt" onClick={onToggleCollapsed}>
                            <Icon name="panelLeft" size={19} />
                        </button>
                    )}
                    <button type="button" className="m-icon-btn lg:hidden" aria-label="Menüyü kapat" onClick={onClose}><Icon name="x" /></button>
                </div>

                {!consoleMode && <button
                    type="button"
                    onClick={() => { onOpenSearch(); onClose(); }}
                    className="m-search flex items-center gap-2 min-h-[40px] px-2.5 rounded-[10px] text-[15px] m-text-3 text-left"
                    aria-label="Ara: proje, görev, kişi (Ctrl+K)"
                    title={compact ? 'Ara (Ctrl+K)' : undefined}
                >
                    <Icon name="search" size={18} strokeWidth={2} />
                    <span className="m-nav-label flex-1">Ara</span>
                    <kbd className="m-nav-label text-[12px] px-1.5 rounded-[5px] border m-sep font-sans">⌘K</kbd>
                </button>}

                {/* Yalnız orta bölüm kayar: proje listesi uzasa da logo, arama ve
                    alttaki profil/ayarlar her zaman görünür kalır */}
                <div className="flex-1 min-h-0 overflow-y-auto -mx-3 px-3 flex flex-col gap-5">
                {consoleMode ? (
                    <div className="flex flex-col gap-0.5">
                        <span className="pl-2.5 pb-1 text-[13px] font-semibold m-text-3">Yönetici konsolu</span>
                        {ADMIN_SECTIONS.map(s => (
                            <NavItem compact={compact} key={s.key} icon={s.icon} label={s.label} active={currentView === View.Admin && adminSection === s.key} onClick={() => { onAdminSection?.(s.key); go(View.Admin); }} />
                        ))}
                    </div>
                ) : <>
                <div className="flex flex-col gap-0.5">
                    {exec && <NavItem compact={compact} icon="gauge" label="Yönetim" active={isActive(View.Executive)} onClick={() => go(View.Executive)} />}
                    <NavItem compact={compact} icon="grid" label="Portföy" active={isActive(View.Portfolio)} onClick={() => go(View.Portfolio)} />
                    <NavItem compact={compact} icon="users" label="Ekip ve tahsis" active={isActive(View.Allocations)} onClick={() => go(View.Allocations)} />
                    <NavItem compact={compact} icon="calendar" label="Takvim" active={isActive(View.Calendar)} onClick={() => go(View.Calendar)} />
                    <NavItem compact={compact} icon="shield" label="Risk raporu" active={isActive(View.RiskReport)} onClick={() => go(View.RiskReport)} />
                    <NavItem compact={compact} icon="report" label="Haftalık rapor" active={isActive(View.WeeklyReport)} onClick={() => go(View.WeeklyReport)} badge={reportBadge} />
                    <NavItem compact={compact} icon="calendarCheck" label="Görüşmeler" active={isActive(View.Meetings)} onClick={() => go(View.Meetings)} badge={meetingBadge} />
                    <NavItem compact={compact} icon="flag" label="Beklentiler" active={isActive(View.Expectations)} onClick={() => go(View.Expectations)} badge={expectationBadge} />
                    <NavItem compact={compact} icon="database" label="Veri havuzu" active={isActive(View.DataPool)} onClick={() => go(View.DataPool)} />
                    {canAdmin && <NavItem compact={compact} icon="key" label="Yönetici" active={isActive(View.Admin)} onClick={() => go(View.Admin)} />}
                </div>

                <div className="flex flex-col gap-0.5">
                    <div className="m-nav-label flex items-center justify-between pl-2.5">
                        <span className="text-[15px] font-semibold m-text">Projeler</span>
                        {canCreateProject && (
                            <button type="button" className="m-icon-btn" style={{ color: 'var(--m-accent)' }} aria-label="Yeni proje" onClick={() => { onNewProject(); onClose(); }}>
                                <Icon name="plus" strokeWidth={2} />
                            </button>
                        )}
                    </div>
                    {compact && <div className="m-sidebar-sep" aria-hidden="true"></div>}
                    {projects.length === 0 && <p className="m-nav-label px-2.5 py-2 text-[14px] m-text-3">Kapsamınızda proje yok.</p>}
                    {sidebarProjects(projects, hasActiveProject ? activeProjectId : null).map(p => {
                        const active = hasActiveProject && p.id === activeProjectId;
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => { onOpenProject(p.id); onClose(); }}
                                aria-current={active ? 'true' : undefined}
                                aria-label={compact ? `${p.name}${p.openTasks ? `, ${p.openTasks} açık görev` : ''}` : undefined}
                                title={compact ? p.name : undefined}
                                className={`m-nav-item m-nav-project relative w-full flex items-center gap-3 min-h-[44px] px-2.5 rounded-[10px] text-[15px] text-left ${active ? 'm-accent-tint font-semibold' : 'm-row-link m-text'}`}
                            >
                                {compact
                                    ? <span aria-hidden="true" className="m-project-tile" style={p.rag ? { boxShadow: `inset 0 0 0 2px ${RAG_DOT[p.rag]}` } : undefined}>{projectInitials(p.name)}</span>
                                    : <span aria-hidden="true" className="m-project-dot w-2.5 h-2.5 rounded-full flex-none" style={{ background: RAG_DOT[p.rag || 'none'] }}></span>}
                                <span className="m-nav-label flex-1 min-w-0 truncate">{p.name}</span>
                                {p.openTasks > 0 && <span className="m-nav-label text-[13px] m-text-3 m-tabular" aria-label={`${p.openTasks} açık görev`}>{p.openTasks}</span>}
                            </button>
                        );
                    })}
                    {projects.length > SIDEBAR_PROJECT_LIMIT && (
                        <button type="button" onClick={() => go(View.Portfolio)} title={compact ? `Tüm projeler (${projects.length})` : undefined} aria-label={compact ? `Tüm projeler (${projects.length})` : undefined}
                            className="m-nav-item m-row-link w-full flex items-center gap-3 min-h-[44px] px-2.5 rounded-[10px] text-[15px] m-accent font-medium">
                            <span className="m-nav-label w-2.5 flex-none"></span>
                            <span className="m-nav-label flex-1">Tüm projeler ({projects.length})</span>
                            <Icon name="chevronRight" size={16} strokeWidth={2.2} />
                        </button>
                    )}
                </div>
                </>}
                </div>

                <div className="mt-auto flex flex-col gap-0.5">
                    {assistant?.chatEnabled && !consoleMode && (
                        <NavItem compact={compact} icon="sparkles" label="Asistan" active={!!assistant.isOpen} onClick={() => { assistant.setOpen(true); onClose(); }} />
                    )}
                    <NavItem compact={compact} icon="sliders" label="Ayarlar" active={false} onClick={() => { onOpenSettings(); onClose(); }} />
                    {onToggleCollapsed && compact && (
                        <NavItem compact icon="panelLeft" label="Menüyü genişlet" active={false} onClick={onToggleCollapsed} />
                    )}
                    <div className="m-sidebar-footer relative flex items-center gap-1 mt-1.5 pt-2 border-t m-sep">
                        <button
                            type="button"
                            onClick={() => { onOpenProfile(); onClose(); }}
                            aria-haspopup="dialog"
                            aria-label={compact ? `${person ? person.name : ROLE_LABELS[currentRole]} · ${props.cloudLinked ? 'Bulut hesabı' : 'Profil değiştir'}` : undefined}
                            title={compact ? `${person ? `${person.name} · ` : ''}${ROLE_LABELS[currentRole]}` : props.cloudLinked ? 'Bulut hesabı' : 'Profil değiştir'}
                            className="m-sidebar-profile m-row-link flex-1 min-w-0 flex items-center gap-2.5 min-h-[52px] px-2 rounded-xl"
                        >
                            <span className={`relative w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold flex-none ${needsPerson ? 'm-tone-warn' : 'm-fill'}`} aria-hidden="true">
                                {person ? person.initials : ROLE_LABELS[currentRole].charAt(0)}
                                {props.cloudLinked && <span className="m-sidebar-cloud" title="Bulut hesabı"><Icon name="cloud" size={10} strokeWidth={2.4} /></span>}
                            </span>
                            <span className="m-nav-label flex-1 min-w-0 flex flex-col leading-tight">
                                <span className="text-[15px] font-semibold truncate">{person ? person.name : ROLE_LABELS[currentRole]}</span>
                                <span className={`text-[13px] truncate ${needsPerson ? 'm-ink-warn font-semibold' : 'm-text-3'}`}>
                                    {needsPerson ? 'Kişi seçin' : person ? ROLE_LABELS[currentRole] : props.cloudLinked ? 'Bulut hesabı' : 'Profil değiştir'}
                                </span>
                            </span>
                        </button>
                        <button ref={moreRef} type="button" className="m-icon-btn m-sidebar-more" aria-label="Diğer araçlar" title="Diğer araçlar" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}><Icon name="more" /></button>
                        {menuOpen && !compact && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden="true"></div>
                                <ToolsMenu {...props} onOpenProfile={() => { onOpenProfile(); onClose(); }} onDone={() => setMenuOpen(false)} onPickBackup={() => backupRef.current?.click()} />
                            </>
                        )}
                        {menuOpen && compact && menuPos && portalHost && createPortal(
                            <>
                                <div className="fixed inset-0 z-[85]" onClick={() => setMenuOpen(false)} aria-hidden="true"></div>
                                <ToolsMenu {...props} floating style={menuPos} onOpenProfile={() => { onOpenProfile(); onClose(); }} onDone={() => setMenuOpen(false)} onPickBackup={() => backupRef.current?.click()} />
                            </>,
                            portalHost,
                        )}
                    </div>
                </div>
                {props.onLoadBackup && (
                    <input ref={backupRef} type="file" accept=".json,application/json" className="hidden" aria-hidden="true" tabIndex={-1}
                        onChange={e => { const f = e.target.files?.[0]; if (f) props.onLoadBackup!(f); e.target.value = ''; }} />
                )}
            </nav>
        </>
    );
};

export default ModernSidebar;
