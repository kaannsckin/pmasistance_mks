import React from 'react';
import { openIndexedDbStore, rawStoreDump } from '../utils/workspaceStore';

/**
 * Uygulama genelinde hata sınırı (UI-KRC-06, UI-GRS-18).
 * Çizim sırasında yakalanmayan bir hata beyaz (koyu modda lacivert) boş ekran bırakıyordu.
 * Burada kullanıcı ne olduğunu görür, veriyi indirebilir ve yeniden yükleyebilir.
 */

interface State { error: Error | null; downloading: boolean }

const downloadRawData = async () => {
    const kv = await openIndexedDbStore();
    if (!kv) return;
    const records = await kv.readAll();
    if (!records.size) return;
    const url = URL.createObjectURL(new Blob([rawStoreDump(records)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `planasistan-ham-depo-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
    // Projede React tip paketi yok; sınıf bileşeninin kullandığı üyeler burada bildirilir
    declare props: Readonly<{ children: React.ReactNode }>;
    declare setState: (state: Partial<State>) => void;
    state: State = { error: null, downloading: false };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Uygulama hatası', error, info.componentStack);
    }

    render() {
        const { error, downloading } = this.state;
        if (!error) return this.props.children;
        return (
            <main className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex items-center justify-center p-4">
                <section role="alert" aria-labelledby="app-error-title" className="w-full max-w-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 flex flex-col gap-4">
                    <h1 id="app-error-title" className="m-0 text-2xl font-bold">Bu ekran açılamadı</h1>
                    <p className="m-0 text-gray-700 dark:text-gray-300">
                        Uygulamada beklenmeyen bir hata oluştu. Verileriniz tarayıcıda duruyor; sayfayı yeniden yüklemek çoğu zaman yeter.
                        Sorun sürerse veriyi indirip destek ekibine iletin.
                    </p>
                    <p className="m-0 text-sm font-mono text-gray-600 dark:text-gray-400 break-words">{error.message}</p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" autoFocus onClick={() => window.location.reload()} className="min-h-[44px] px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold">
                            Sayfayı yeniden yükle
                        </button>
                        <button
                            type="button"
                            disabled={downloading}
                            onClick={async () => { this.setState({ downloading: true }); try { await downloadRawData(); } finally { this.setState({ downloading: false }); } }}
                            className="min-h-[44px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 font-semibold disabled:opacity-60"
                        >
                            Ham veriyi indir
                        </button>
                    </div>
                </section>
            </main>
        );
    }
}

export default ErrorBoundary;
