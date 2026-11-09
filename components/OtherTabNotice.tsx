import React, { useState } from 'react';

/**
 * Çalışma alanı başka bir sekmede açıkken gösterilen ekran (UI-KRC-02, UI-KRC-13).
 * Yalnız bir sekme yazar; bu sekme ancak "Burada kullan" ile devralır ve depodan
 * taze veriyle yeniden açılır. Böylece eski veriyle yapılan bir kayıt, öteki
 * sekmedeki işi (ör. gönderilmiş bir raporu) geri alamaz.
 */

interface Props {
    /** passive: başka sekme etkin; released: bu sekme devretti */
    role: 'passive' | 'released';
    /** false dönerse devir vazgeçildi */
    onTakeOver: () => Promise<boolean | void> | boolean | void;
    /** Devrederken bu sekmede kaydedilmemiş iş vardıysa açıklaması (UI-KRC-19) */
    lostUnsaved?: string | null;
}

const OtherTabNotice: React.FC<Props> = ({ role, onTakeOver, lostUnsaved }) => {
    const [busy, setBusy] = useState(false);
    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex items-center justify-center p-4">
            <section role="alert" aria-labelledby="other-tab-title" className="w-full max-w-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 flex flex-col gap-4">
                <h1 id="other-tab-title" className="m-0 text-2xl font-bold">
                    {role === 'released' ? 'PlanAsistan başka bir sekmeye geçti' : 'PlanAsistan başka bir sekmede açık'}
                </h1>
                <p className="m-0 text-gray-700 dark:text-gray-300">
                    {role === 'released'
                        ? lostUnsaved
                            ? `Uygulama başka bir sekmede açıldı. Bu sekmede kaydedilmemiş iş vardı ve kaydedilmedi: ${lostUnsaved} Kaydedilmiş olan her şey öteki sekmede.`
                            : 'Çalışmanız kaydedildi ve uygulama başka bir sekmede açıldı. Bu sekmede yapılan değişiklikler artık kaydedilmez.'
                        : 'Aynı çalışma alanı iki sekmede birden değiştirilirse bir sekmenin işi ötekinin üzerine yazılır. Bu yüzden uygulama tek sekmede çalışır.'}
                </p>
                <div>
                    <button
                        type="button"
                        autoFocus
                        disabled={busy}
                        onClick={async () => { setBusy(true); if ((await onTakeOver()) === false) setBusy(false); }}
                        className="min-h-[44px] px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold disabled:opacity-60"
                    >
                        {busy ? 'Öteki sekme kaydediyor…' : 'Burada kullan'}
                    </button>
                </div>
                <p className="m-0 text-sm text-gray-600 dark:text-gray-400">
                    {role === 'released'
                        ? '"Burada kullan" uygulamayı bu sekmeye geri alır; öteki sekme kaydedip durur.'
                        : '"Burada kullan" öteki sekmenin işini kaydedip durdurur ve uygulamayı bu sekmede güncel veriyle açar.'}
                </p>
            </section>
        </main>
    );
};

export default OtherTabNotice;
