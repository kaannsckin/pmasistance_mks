import React, { useEffect } from 'react';
import CommandPalette, { CommandItem } from '../CommandPalette';
import AssistantChat from './AssistantChat';
import { useAssistant } from './AssistantContext';

/**
 * Her ekranda erişilebilen AI asistanı: sağ altta açma düğmesi + sağdan açılan
 * panel. Arkadaki ekran kullanılabilir kalır (örtü yok); Esc ile kapanır.
 */

interface Props {
  suggestions: { label: string; prompt: string }[];
  /** Zekâ sekmesi açıkken panel gizlenir (aynı sohbet tam ekranda) */
  hidden?: boolean;
  /** Tam ekran (Zekâ) — yalnızca bir proje açıkken */
  onExpand?: () => void;
}

const AssistantPanel: React.FC<Props> = ({ suggestions, hidden, onExpand }) => {
  const a = useAssistant();

  useEffect(() => {
    if (!a.isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') a.setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [a.isOpen, a.setOpen]);

  if (!a.enabled || hidden) return null;

  return (
    <>
      {!a.isOpen && (
        <button
          onClick={() => a.setOpen(true)}
          title="AI Asistan"
          aria-label="AI Asistanı aç"
          className="fixed bottom-5 right-5 z-[60] w-14 h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xl flex items-center justify-center transition-transform hover:scale-105"
        >
          <i className="fa-solid fa-wand-magic-sparkles text-lg"></i>
          {a.isStreaming && <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse border-2 border-indigo-600"></span>}
        </button>
      )}
      {a.isOpen && (
        <aside
          role="dialog"
          aria-label="AI Asistan"
          className="fixed top-0 right-0 z-[60] h-full w-full sm:w-[440px] border-l border-gray-200 dark:border-gray-700 shadow-2xl animate-fade-in"
        >
          <AssistantChat variant="panel" suggestions={suggestions} onClose={() => a.setOpen(false)} onExpand={onExpand ? () => { a.setOpen(false); onExpand(); } : undefined} />
        </aside>
      )}
    </>
  );
};

export default AssistantPanel;

/** Komut paleti + AI: serbest metin asistana sorulabilir, "AI Asistan" ekran öğesi eklenir */
export const AssistantCommandPalette: React.FC<{ items: CommandItem[]; onClose: () => void }> = ({ items, onClose }) => {
  const a = useAssistant();
  const all = a.enabled
    ? [{ id: 'a-ai', group: 'Aksiyonlar', label: 'AI Asistan', sublabel: 'Sohbet panelini aç', icon: 'fa-wand-magic-sparkles', keywords: 'ai yapay zeka asistan zeka sor', run: () => a.setOpen(true) }, ...items]
    : items;
  return <CommandPalette items={all} onClose={onClose} onAskAI={a.enabled ? q => a.ask(q) : undefined} />;
};
