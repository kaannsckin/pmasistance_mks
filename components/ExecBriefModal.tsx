import React, { useState } from 'react';
import { cleanText, EMBED_SYSTEM, execNarrativePrompt } from '../utils/ai/embedded';
import { AiButton, AiErrorNote, useAiRun } from './assistant/AiButton';

interface ExecBriefModalProps {
  brief: string;
  year: number;
  onClose: () => void;
}

const ExecBriefModal: React.FC<ExecBriefModalProps> = ({ brief, year, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeCopied, setNarrativeCopied] = useState(false);
  const ai = useAiRun();

  const makeNarrative = async () => {
    const t = await ai.run(EMBED_SYSTEM, execNarrativePrompt(brief), cleanText);
    if (t) setNarrative(t);
  };

  const copyNarrative = async () => {
    if (!narrative) return;
    try {
      await navigator.clipboard.writeText(narrative);
      setNarrativeCopied(true);
      setTimeout(() => setNarrativeCopied(false), 1800);
    } catch {
      alert('Panoya kopyalanamadı. Metni elle seçip kopyalayabilirsiniz.');
    }
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      alert('Panoya kopyalanamadı. Metni elle seçip kopyalayabilirsiniz.');
    }
  };

  const download = () => {
    const blob = new Blob([brief], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yonetici-brifingi-${year}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 pt-[6vh] overflow-y-auto" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-gray-900 px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: 'var(--app-primary)' }}>
              <i className="fa-solid fa-clipboard-list"></i>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Yönetici Brifingi</h3>
              <p className="text-xs text-gray-400">{year} · sağlık · dikkat · departman yükü · kritik riskler</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={copy} className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-lg text-white shadow-sm hover:opacity-90" style={{ backgroundColor: 'var(--app-primary)' }} title="Brifingi panoya kopyala">
              <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`}></i>{copied ? 'Kopyalandı' : 'Kopyala'}
            </button>
            <button onClick={download} className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:text-primary" title="Metin dosyası (.txt) olarak indir">
              <i className="fa-solid fa-download"></i>İndir
            </button>
            <button onClick={onClose} className="w-9 h-9 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><i className="fa-solid fa-times"></i></button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {ai.available && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AiButton label={narrative ? 'Yeniden yaz' : 'AI ile yönetici özeti yaz'} loading={ai.loading} onClick={makeNarrative} title="Brifing verilerinden üst yönetime akıcı bir özet paragrafı üretir" />
                {narrative && (
                  <button onClick={copyNarrative} className="text-[11px] font-semibold text-gray-500 hover:text-primary">
                    <i className={`fa-solid ${narrativeCopied ? 'fa-check' : 'fa-copy'} mr-1`}></i>{narrativeCopied ? 'Kopyalandı' : 'Özeti kopyala'}
                  </button>
                )}
              </div>
              <AiErrorNote message={ai.error} onClose={() => ai.setError(null)} />
              {narrative && (
                <div className="text-[13px] leading-relaxed text-gray-700 dark:text-gray-200 whitespace-pre-wrap bg-indigo-50/60 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-xl p-4">
                  {narrative}
                  <p className="mt-2 text-[10px] text-gray-400">AI tarafından brifing verilerinden üretildi — paylaşmadan önce sayıları aşağıdaki brifingle karşılaştırın.</p>
                </div>
              )}
            </div>
          )}
          <pre className="text-[12px] leading-relaxed text-gray-700 dark:text-gray-200 whitespace-pre-wrap font-sans bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700 p-4">{brief}</pre>
        </div>
      </div>
    </div>
  );
};

export default ExecBriefModal;
