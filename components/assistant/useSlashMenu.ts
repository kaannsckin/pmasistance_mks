import React, { useEffect, useState } from 'react';
import { SlashCommand, slashMatches } from '../../utils/ai/slashCommands';

/**
 * Sohbet kutusunda "/" ile açılan komut menüsü: ok tuşlarıyla gezilir,
 * Enter / Tab seçer (komut kutuya yazılır; metin gerekiyorsa beklenir,
 * gerekmiyorsa hemen gönderilir), Esc kapatır.
 */
export const useSlashMenu = (input: string, setInput: (v: string) => void, onRun: (text: string) => void) => {
    const items = slashMatches(input);
    const [active, setActive] = useState(0);
    const [dismissed, setDismissed] = useState<string | null>(null);
    const open = items.length > 0 && dismissed !== input;
    useEffect(() => { setActive(0); }, [input]);

    const choose = (c: SlashCommand) => {
        if (c.arg) setInput(`/${c.cmd} `);
        else { setInput(''); onRun(`/${c.cmd}`); }
    };

    /** true dönerse tuş menü tarafından işlendi */
    const onKeyDown = (e: React.KeyboardEvent): boolean => {
        if (!open) return false;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % items.length); return true; }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + items.length) % items.length); return true; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(items[Math.min(active, items.length - 1)]); return true; }
        if (e.key === 'Escape') { e.preventDefault(); setDismissed(input); return true; }
        return false;
    };

    return { open, items, active, setActive, choose, onKeyDown };
};
