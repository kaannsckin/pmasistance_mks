import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AiError } from '../../utils/ai/client';
import { useAssistantOptional } from './AssistantContext';

/**
 * Ekranlara gömülü AI özellikleri için ortak parçalar: tek seferlik çağrı
 * (yükleniyor/hata durumu, ekran kapanınca iptal) ve tutarlı görünümlü düğme.
 * AI ayarlardan kapalıysa ya da sağlayıcı yoksa düğmeler hiç görünmez.
 */

/** kind: 'embedded' ekran içi özellikler (admin kapatabilir); 'scoring' rapor metni puanlaması */
export const useAiRun = (kind: 'embedded' | 'scoring' = 'embedded') => {
  const a = useAssistantOptional();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  const run = useCallback(async <T,>(system: string, prompt: string, parse: (text: string) => T): Promise<T | null> => {
    if (!a) return null;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    setError(null);
    try {
      return parse(await a.complete(system, prompt, c.signal));
    } catch (e) {
      if (c.signal.aborted || (e instanceof AiError && e.code === 'aborted')) return null;
      setError((e as Error)?.message || 'AI isteği başarısız.');
      return null;
    } finally {
      if (ctrl.current === c) setLoading(false);
    }
  }, [a]);

  return { available: !!a?.enabled && (kind === 'scoring' || !!a?.embeddedEnabled), run, loading, error, setError };
};

interface AiButtonProps {
  label: string;
  loading: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  size?: 'sm' | 'md';
}

export const AiButton: React.FC<AiButtonProps> = ({ label, loading, onClick, disabled, title, size = 'md' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading || disabled}
    title={title}
    className={`inline-flex items-center gap-1.5 font-semibold rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50 ${size === 'sm' ? 'text-[11px] px-2.5 py-1' : 'text-xs px-3.5 py-2'}`}
  >
    <i className={`fa-solid ${loading ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles'}`}></i>
    {loading ? 'AI çalışıyor…' : label}
  </button>
);

export const AiErrorNote: React.FC<{ message: string | null; onClose?: () => void }> = ({ message, onClose }) =>
  message ? (
    <div className="flex items-start gap-2 text-[11px] text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
      <i className="fa-solid fa-triangle-exclamation mt-0.5"></i>
      <span className="flex-1">{message}</span>
      {onClose && <button type="button" onClick={onClose} className="text-red-400 hover:text-red-600"><i className="fa-solid fa-xmark"></i></button>}
    </div>
  ) : null;
