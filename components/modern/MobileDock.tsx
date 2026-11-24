import React from 'react';
import { ProjectSectionKey, View } from '../../types';
import { Icon, IconName } from './icons';

interface DockLink {
    view: View;
    label: string;
    icon: IconName;
    section?: ProjectSectionKey;
}

const PORTFOLIO: DockLink = { view: View.Portfolio, label: 'Portföy', icon: 'grid' };
const WORKSPACE_LINKS: DockLink[] = [
    PORTFOLIO,
    { view: View.Allocations, label: 'Tahsis', icon: 'users' },
    { view: View.Calendar, label: 'Takvim', icon: 'calendar' },
];
const PROJECT_LINKS: DockLink[] = [
    PORTFOLIO,
    { view: View.Tasks, label: 'Görevler', icon: 'list', section: 'list' },
    { view: View.Kanban, label: 'Sprint', icon: 'calendar', section: 'timeline' },
];

interface MobileDockProps {
    view: View;
    sections?: ReadonlySet<ProjectSectionKey>;
    menuOpen: boolean;
    onNavigate: (view: View) => void;
    onOpenMenu: () => void;
}

const MobileDock: React.FC<MobileDockProps> = ({ view, sections, menuOpen, onNavigate, onOpenMenu }) => {
    const links = sections ? PROJECT_LINKS.filter(link => !link.section || sections.has(link.section)) : WORKSPACE_LINKS;
    return (
        <nav className="m-mobile-dock lg:hidden" aria-label="Alt gezinme">
            {links.map(link => (
                <button key={link.view} type="button" aria-current={view === link.view ? 'page' : undefined} onClick={() => onNavigate(link.view)}>
                    <Icon name={link.icon} size={21} />
                    <span>{link.label}</span>
                </button>
            ))}
            <button type="button" aria-expanded={menuOpen} aria-controls="modern-sidebar" onClick={onOpenMenu}>
                <Icon name="more" size={22} />
                <span>Menü</span>
            </button>
        </nav>
    );
};

export default MobileDock;
