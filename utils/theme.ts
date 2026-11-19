import type { ColorMode, ModernTheme, WorkspaceSettings } from '../types';

/** Modern arayüz temaları (Ayarlar → Görünüm). Sıra, seçim kartlarının sırasıdır. */
export const MODERN_THEMES: { id: ModernTheme; name: string; hint: string }[] = [
    { id: 'bubble', name: 'Baloncuk', hint: 'Yumuşak, buzlu cam, hap butonlar' },
    { id: 'aurora', name: 'Aurora', hint: 'Renk bulutları üstünde cam kartlar' },
    { id: 'pro', name: 'Pro', hint: 'Sık, sade, klavye odaklı' },
    { id: 'clay', name: 'Kil', hint: 'Kabarık, dokunsal kartlar' },
];

export const COLOR_MODES: { id: ColorMode; name: string }[] = [
    { id: 'system', name: 'Sistem' },
    { id: 'light', name: 'Gündüz' },
    { id: 'dark', name: 'Gece' },
];

const isModernTheme = (v: unknown): v is ModernTheme => MODERN_THEMES.some(t => t.id === v);
const isColorMode = (v: unknown): v is ColorMode => COLOR_MODES.some(m => m.id === v);

/**
 * Modern tema henüz seçilmemişse eski vurgu rengine en yakın temaya eşlenir:
 * mavi → Baloncuk, zümrüt → Aurora (turkuaz), mor → Pro (çivit), turuncu → Kil (mercan).
 */
const LEGACY_ACCENT_TO_THEME: Record<string, ModernTheme> = {
    classic: 'bubble',
    emerald: 'aurora',
    purple: 'pro',
    orange: 'clay',
};

export const resolveModernTheme = (s?: Pick<WorkspaceSettings, 'modernTheme' | 'theme'> | null): ModernTheme =>
    isModernTheme(s?.modernTheme) ? s!.modernTheme! : LEGACY_ACCENT_TO_THEME[s?.theme ?? ''] ?? 'bubble';

/**
 * colorMode yoksa 'system': bu sürümden önce gece modu düğmesi etkisizdi ve
 * görünüm hep işletim sistemini izliyordu; kimsenin ekranı kendiliğinden değişmesin.
 */
export const resolveColorMode = (s?: Pick<WorkspaceSettings, 'colorMode'> | null): ColorMode =>
    isColorMode(s?.colorMode) ? s!.colorMode! : 'system';

export const isDarkResolved = (mode: ColorMode, systemPrefersDark: boolean): boolean =>
    mode === 'dark' || (mode === 'system' && systemPrefersDark);
