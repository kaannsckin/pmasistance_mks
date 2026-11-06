import React, { useState } from 'react';

/**
 * Kayıtlı çalışma alanı açılamadığında gösterilen ekran (UI-KRC-01).
 *
 * Uygulama bu durumda hiçbir şey kaydetmez: depodaki veri, daha yeni bir
 * sürümün biçimi ya da bozuk bir kayıt olabilir; üzerine örnek çalışma alanı
 * yazmak veriyi geri dönülmez biçimde siler. Kullanıcı ham veriyi indirebilir,
 * yeniden deneyebilir ya da açıkça onaylayarak baştan başlayabilir.
 */

export type StoreProblem =
    | { reason: 'format'; format?: unknown }
    | { reason: 'meta' }
    | { reason: 'local' }
    | { reason: 'read'; detail?: string }
    | { reason: 'open'; detail?: string };

const describe = (p: StoreProblem): string => {
    switch (p.reason) {
        case 'format': return `Bu tarayıcıdaki çalışma alanı, uygulamanın bu sürümünün tanımadığı bir biçimde kayıtlı (biçim: ${String(p.format)}). Büyük olasılıkla daha yeni bir sürümle kaydedildi.`;
        case 'meta': return 'Bu tarayıcıdaki çalışma alanı kaydı eksik ya da bozuk.';
        case 'local': return 'Bu tarayıcıdaki çalışma alanı kaydı bozuk; okunamadı.';
        case 'read': return 'Tarayıcının deposu okunamadı. Site verisi engellenmiş ya da depo kullanılamıyor olabilir.';
        case 'open': return 'Çalışma alanı yüklenirken bir hata oluştu.';
    }
};

interface Props {
    problem: StoreProblem;
    /** Ham veri indirilebiliyorsa (okunan kayıtlar varsa) */
    canDownload: boolean;
    onDownload: () => void;
    onRetry: () => void;
    onReset: () => Promise<void> | void;
}

const StoreRecovery: React.FC<Props> = ({ problem, canDownload, onDownload, onRetry, onReset }) => {
    const [understood, setUnderstood] = useState(false);
    const [resetting, setResetting] = useState(false);
    const detail = (problem.reason === 'read' || problem.reason === 'open') ? problem.detail : undefined;
    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex items-center justify-center p-4">
            <section role="alert" aria-labelledby="store-recovery-title" className="w-full max-w-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 flex flex-col gap-4">
                <h1 id="store-recovery-title" className="m-0 text-2xl font-bold">Kayıtlı çalışma alanınız açılamadı</h1>
                <p className="m-0 text-gray-700 dark:text-gray-300">{describe(problem)}</p>
                {detail && <p className="m-0 text-sm font-mono text-gray-600 dark:text-gray-400 break-words">{detail}</p>}
                <p className="m-0 font-medium">Verinizin üzerine yazılmasın diye uygulama hiçbir şey kaydetmedi ve değiştirmedi.</p>
                <div className="flex flex-wrap gap-2">
                    {canDownload && (
                        <button type="button" onClick={onDownload} className="min-h-[44px] px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold">
                            Ham veriyi indir
                        </button>
                    )}
                    <button type="button" onClick={onRetry} className="min-h-[44px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 font-semibold">
                        Yeniden dene
                    </button>
                </div>
                <p className="m-0 text-sm text-gray-600 dark:text-gray-400">
                    İndirdiğiniz dosyayı yöneticinize ya da destek ekibine iletin; veri bu dosyadan geri kazanılabilir.
                </p>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex flex-col gap-3">
                    <h2 className="m-0 text-base font-semibold">Baştan başlamak</h2>
                    <p className="m-0 text-sm text-gray-700 dark:text-gray-300">
                        Bu tarayıcıdaki kayıtlı veriyi siler ve boş bir çalışma alanıyla açar. Geri alınamaz{canDownload ? '; önce ham veriyi indirin' : ''}.
                    </p>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)} className="w-4 h-4" />
                        Kayıtlı verinin silineceğini anlıyorum
                    </label>
                    <div>
                        <button
                            type="button"
                            disabled={!understood || resetting}
                            onClick={async () => { setResetting(true); await onReset(); }}
                            className="min-h-[44px] px-4 rounded-xl border border-red-700 text-red-700 dark:border-red-400 dark:text-red-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Veriyi sil ve baştan başla
                        </button>
                    </div>
                </div>
            </section>
        </main>
    );
};

export default StoreRecovery;
