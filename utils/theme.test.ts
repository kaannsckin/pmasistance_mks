import { describe, expect, it } from 'vitest';
import { isDarkResolved, resolveColorMode, resolveModernTheme } from './theme';

describe('resolveModernTheme', () => {
    it('seçili modern temayı döndürür', () => {
        expect(resolveModernTheme({ modernTheme: 'clay', theme: 'classic' })).toBe('clay');
    });
    it('eski vurgu rengini en yakın temaya eşler', () => {
        expect(resolveModernTheme({ theme: 'classic' })).toBe('bubble');
        expect(resolveModernTheme({ theme: 'emerald' })).toBe('aurora');
        expect(resolveModernTheme({ theme: 'purple' })).toBe('pro');
        expect(resolveModernTheme({ theme: 'orange' })).toBe('clay');
    });
    it('bilinmeyen ya da eksik değerde Baloncuk', () => {
        expect(resolveModernTheme(undefined)).toBe('bubble');
        expect(resolveModernTheme({ modernTheme: 'neon' as never, theme: 'x' })).toBe('bubble');
    });
});

describe('renk modu', () => {
    it('tercih yoksa sistemi izler', () => {
        expect(resolveColorMode({})).toBe('system');
        expect(resolveColorMode({ colorMode: 'dark' })).toBe('dark');
    });
    it('koyuluğu çözer', () => {
        expect(isDarkResolved('system', true)).toBe(true);
        expect(isDarkResolved('system', false)).toBe(false);
        expect(isDarkResolved('light', true)).toBe(false);
        expect(isDarkResolved('dark', false)).toBe(true);
    });
});
