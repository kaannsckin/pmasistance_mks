import React, { useEffect, useRef } from 'react';

/**
 * Açılır pencere odak yönetimi (UI-ERS-01, UI-ERS-06, UI-ERS-07, UI-ERS-08, UI-ERS-15).
 *
 *  - Açılınca odak pencereye girer (içeride zaten odaklanan bir alan yoksa pencerenin kendisi):
 *    ekran okuyucu pencere başlığını okur, klavye kullanıcısı arka plandaki 3–52 durağı geçmez.
 *  - Tab ve Shift+Tab pencerenin içinde döner; arka sayfaya kaçmaz.
 *  - Esc kapatır (onClose verildiyse).
 *  - Kapanınca odak pencereyi açan öğeye döner; sayfanın başına düşmez.
 *
 * Üstte başka bir pencere ya da palet açıksa (odak bu pencerenin dışında bir öğedeyse) bu pencere
 * Esc'e de Tab'a da karışmaz.
 */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const isVisible = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

export const useModalFocus = (ref: React.RefObject<HTMLElement | null>, onClose?: () => void, active = true): void => {
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    // Açan öğe çizim anında yakalanır: içerideki bir alanın autoFocus'u (ör. görev adı) efektten önce
    // odağı alır; efektte okunsa açan düğme kaybolur ve kapanışta odak sayfanın başına düşerdi
    const openerRef = useRef<HTMLElement | null>(null);
    const wasActive = useRef(false);
    if (active && !wasActive.current && typeof document !== 'undefined') {
        openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    wasActive.current = active;

    useEffect(() => {
        if (!active) return;
        const root = ref.current;
        if (!root) return;
        const captured = openerRef.current;
        const opener = captured && !root.contains(captured) ? captured : null;
        if (!root.contains(document.activeElement)) {
            if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
            root.focus({ preventScroll: true });
        }
        const focusables = () => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);
        // Odak başka bir açılır öğedeyse (ör. komut paleti) bu pencere karışmaz
        const ownsFocus = () => {
            const a = document.activeElement;
            return !a || a === document.body || root.contains(a);
        };
        const onKey = (e: KeyboardEvent) => {
            if (!ownsFocus()) return;
            if (e.key === 'Escape' && closeRef.current) {
                e.preventDefault();
                closeRef.current();
                return;
            }
            if (e.key !== 'Tab') return;
            const items = focusables();
            if (!items.length) { e.preventDefault(); root.focus(); return; }
            const first = items[0];
            const last = items[items.length - 1];
            const a = document.activeElement;
            if (e.shiftKey && (a === first || a === root || !root.contains(a))) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && (a === last || !root.contains(a))) { e.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            if (opener && opener.isConnected) opener.focus({ preventScroll: true });
        };
    }, [ref, active]);
};
