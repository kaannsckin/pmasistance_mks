import { describe, expect, it } from 'vitest';
import { formatDecimal, parseDecimal } from './decimal';

describe('ondalık giriş (UI-KRC-05)', () => {
    it('virgül ve nokta aynı sonucu verir', () => {
        expect(parseDecimal('1,5')).toBe(1.5);
        expect(parseDecimal('1.5')).toBe(1.5);
        expect(parseDecimal('0,5')).toBe(0.5);
        expect(parseDecimal('2.5')).toBe(2.5);
        expect(parseDecimal('12')).toBe(12);
    });
    it('yazım ortası ve boş değerler', () => {
        expect(parseDecimal('')).toBe(0);
        expect(parseDecimal('1,')).toBe(1);
        expect(parseDecimal(',5')).toBe(0.5);
    });
    it('geçersiz giriş reddedilir', () => {
        expect(parseDecimal('1,5,2')).toBeNull();
        expect(parseDecimal('-1')).toBeNull();
        expect(parseDecimal('abc')).toBeNull();
    });
    it('Türkçe gösterim', () => {
        expect(formatDecimal(1.5)).toBe('1,5');
        expect(formatDecimal(0)).toBe('');
        expect(formatDecimal(3)).toBe('3');
    });
});
