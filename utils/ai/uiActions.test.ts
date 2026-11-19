import { describe, expect, it } from 'vitest';
import { ProjectSectionKey, View } from '../../types';
import { dialogProblem, resolveScreen, UiEnv } from './uiActions';

const env = (o: Partial<UiEnv> = {}): UiEnv => ({
    modern: true, consoleMode: false, canExecutive: false, canAdmin: false, canNotes: true, canAudit: false, canDataHealth: true,
    projectSections: new Set<ProjectSectionKey>(['overview', 'board', 'list', 'timeline', 'planning', 'risks', 'team', 'goals', 'assistant']),
    visibleProjectIds: new Set(['p1']), activeProjectId: 'p1', ...o,
});

describe('asistanın arayüz komutları', () => {
    it('ekran anahtarı arayüze göre doğru View\'e çevrilir', () => {
        expect(resolveScreen('pano', env())).toEqual({ view: View.Roadmap });
        expect(resolveScreen('pano', env({ modern: false }))).toEqual({ view: View.Kanban });
        expect(resolveScreen('tahsis', env({ activeProjectId: null }))).toEqual({ view: View.Allocations });
        expect(resolveScreen('planlama', env({ modern: false }))).toHaveProperty('error');
    });

    it('menüdeki yetki kuralları uygulanır', () => {
        expect(resolveScreen('yonetim', env())).toHaveProperty('error');
        expect(resolveScreen('yonetim', env({ canExecutive: true }))).toEqual({ view: View.Executive });
        expect(resolveScreen('yonetici_konsolu', env())).toHaveProperty('error');
        expect(resolveScreen('gunluk', env({ canNotes: false }))).toHaveProperty('error');
        expect(resolveScreen('portfoy', env({ consoleMode: true }))).toHaveProperty('error');
    });

    it('proje ekranları görünür bir proje ve açık sekme ister', () => {
        expect(resolveScreen('riskler', env({ activeProjectId: null }))).toHaveProperty('error');
        expect(resolveScreen('riskler', env({ activeProjectId: 'gizli' }))).toHaveProperty('error');
        expect(resolveScreen('riskler', env({ projectSections: new Set<ProjectSectionKey>(['overview']) }))).toHaveProperty('error');
        expect(resolveScreen('riskler', env())).toEqual({ view: View.Risks });
    });

    it('pencereler rol yetkisine bağlıdır', () => {
        expect(dialogProblem('veri_sagligi', env())).toBeNull();
        expect(dialogProblem('denetim_gunlugu', env())).not.toBeNull();
        expect(dialogProblem('is_paketleri', env({ activeProjectId: null }))).not.toBeNull();
        expect(dialogProblem('profil', env({ consoleMode: true }))).toBeNull();
    });
});
