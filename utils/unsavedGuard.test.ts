import { afterEach, describe, expect, it } from 'vitest';
import { clearUnsaved, confirmLeave, hasUnsaved, markUnsaved } from './unsavedGuard';
import { confirmDestructive, resetConfirmDestructive } from './confirmOnce';

describe('kaydedilmemiş iş koruması (UI-KRC-04, UI-KRC-09)', () => {
    afterEach(() => { clearUnsaved('rapor'); clearUnsaved('gorev'); });

    it('kayıt yoksa sormadan geçer', () => {
        let asked = 0;
        expect(confirmLeave(() => { asked++; return false; })).toBe(true);
        expect(asked).toBe(0);
    });

    it('kayıt varsa sorar; vazgeçilirse kalır, onaylanırsa temizler', () => {
        markUnsaved('rapor', 'Rapor kaydedilmedi');
        let seen = '';
        expect(confirmLeave(m => { seen = m; return false; })).toBe(false);
        expect(seen).toBe('Rapor kaydedilmedi');
        expect(hasUnsaved()).toBe(true);
        expect(confirmLeave(() => true)).toBe(true);
        expect(hasUnsaved()).toBe(false);
    });

    it('temizlenen düzenleyici artık sorulmaz', () => {
        markUnsaved('gorev');
        clearUnsaved('gorev');
        expect(hasUnsaved()).toBe(false);
    });
});

describe('yıkıcı işlem onayı (UI-KRC-03, UI-KRC-15)', () => {
    it('çift tıkın ikinci tıkı (ilk onaydan hemen sonra) yok sayılır', () => {
        resetConfirmDestructive();
        let t = 1000;
        let asked = 0;
        const ask = () => { asked++; return true; };
        expect(confirmDestructive('A silinsin mi?', ask, () => t)).toBe(true);
        t += 50;
        expect(confirmDestructive('B silinsin mi?', ask, () => t)).toBe(false);
        expect(asked).toBe(1);
        t += 2000;
        expect(confirmDestructive('B silinsin mi?', ask, () => t)).toBe(true);
        expect(asked).toBe(2);
    });
});
