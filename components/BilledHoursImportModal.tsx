import React, { useMemo, useState } from 'react';
import { Person, Project } from '../types';
import { MONTHS_TR } from '../utils/allocations';
import {
    BilledApplyMode,
    BilledHoursOptions,
    BilledHoursRecord,
    DEFAULT_HOURS_PER_DAY,
    parseBilledHoursText,
    parseBilledHoursWorkbook,
    planBilledHoursPoolAdditions,
    suggestBilledHoursActuals,
} from '../utils/billedHours';

interface Props {
    people: Person[];
    projects: Project[];
    defaultYear: number;
    onApply: (records: BilledHoursRecord[], options: BilledHoursOptions, mode: BilledApplyMode, autoCreate: boolean) => void;
    onClose: () => void;
}

const YEARS = (() => {
    const y = new Date().getFullYear();
    return [y - 2, y - 1, y, y + 1];
})();

const fmt = (v: number): string => (Math.round(v * 100) / 100).toString().replace('.', ',');

/**
 * Jira "Toplam Billed Hours" pivotunu içe aktarıp gerçekleşen (actual) tahsise
 * çeviren modal. Saat → Gün → Adam-Ay (TR çalışma takvimi); havuzdaki kişi ve
 * projelerle eşleştirir, önizler ve doldur/üzerine-yaz moduyla uygular.
 */
const BilledHoursImportModal: React.FC<Props> = ({ people, projects, defaultYear, onApply, onClose }) => {
    const [year, setYear] = useState(defaultYear);
    const [hoursPerDay, setHoursPerDay] = useState(DEFAULT_HOURS_PER_DAY);
    const [records, setRecords] = useState<BilledHoursRecord[] | null>(null);
    const [mode, setMode] = useState<BilledApplyMode>('overwrite');
    const [autoCreate, setAutoCreate] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [paste, setPaste] = useState('');
    const [showPaste, setShowPaste] = useState(false);

    const result = useMemo(
        () => (records ? suggestBilledHoursActuals({ projects, people }, records, { year, hoursPerDay }) : null),
        [records, projects, people, year, hoursPerDay],
    );
    const additions = useMemo(() => (result ? planBilledHoursPoolAdditions(result) : null), [result]);
    const hasUnmatched = !!result && (result.unmatchedPeople.length > 0 || result.unmatchedProjects.length > 0);

    const handleFile = async (file?: File) => {
        if (!file) return;
        setError(null);
        setBusy(true);
        try {
            setRecords(await parseBilledHoursWorkbook(file));
        } catch (e) {
            setRecords(null);
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const handlePaste = () => {
        setError(null);
        const recs = parseBilledHoursText(paste);
        if (!recs.length) {
            setError('Yapıştırılan metinden kayıt çıkarılamadı. Başlık satırı ve ay sütunları olmalı.');
            return;
        }
        setRecords(recs);
    };

    const canApply = !!result && (result.rows.length > 0 || (autoCreate && hasUnmatched));

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-y-auto border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 bg-white dark:bg-gray-900 px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
                    <div>
                        <h3 className="text-base font-semibold text-gray-800 dark:text-white">Jira Billed Hours → Gerçekleşen Tahsis</h3>
                        <p className="text-xs text-gray-400">
                            "Toplam Billed Hours" pivotu · Saat → Gün (1 gün={fmt(hoursPerDay)} saat) → Adam-Ay (TR çalışma takvimi)
                        </p>
                    </div>
                    <button onClick={onClose} className="w-9 h-9 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><i className="fa-solid fa-times"></i></button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Parametreler */}
                    <div className="flex flex-wrap items-end gap-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-3">
                        <label className="text-xs text-gray-500 dark:text-gray-300">
                            <span className="block mb-1 font-semibold">Yıl (gerçekleşen)</span>
                            <select value={year} onChange={e => setYear(Number(e.target.value))} className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200">
                                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </label>
                        <label className="text-xs text-gray-500 dark:text-gray-300">
                            <span className="block mb-1 font-semibold">1 iş günü = kaç saat?</span>
                            <input type="number" min={1} step={0.5} value={hoursPerDay} onChange={e => setHoursPerDay(Number(e.target.value) || DEFAULT_HOURS_PER_DAY)} className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200" />
                        </label>
                    </div>

                    {/* Kaynak seçimi */}
                    {!records && (
                        <div className="space-y-3">
                            <label className="block cursor-pointer">
                                <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl px-4 py-6 text-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                                    <div className="text-2xl mb-1"><i className="fa-solid fa-file-arrow-up"></i></div>
                                    <div className="text-sm">Pivot içeren <b>.xlsx</b> dosyasını seçin</div>
                                    <div className="text-[11px] mt-1">Sayfa1 / pivot sayfası otomatik bulunur (Project Name · Full name · aylar)</div>
                                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
                                </div>
                            </label>
                            <div className="text-center">
                                <button onClick={() => setShowPaste(v => !v)} className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                    {showPaste ? 'Yapıştırmayı gizle' : 'ya da Excel’den yapıştır'}
                                </button>
                            </div>
                            {showPaste && (
                                <div className="space-y-2">
                                    <textarea value={paste} onChange={e => setPaste(e.target.value)} placeholder={'Project Name\tFull name\t…\tOcak\tŞubat\t…'} className="w-full min-h-[110px] p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-mono text-gray-700 dark:text-gray-200" />
                                    <div className="text-right">
                                        <button onClick={handlePaste} disabled={!paste.trim()} className="text-white text-xs font-semibold px-4 py-2 rounded-xl disabled:opacity-40" style={{ backgroundColor: 'var(--app-primary)' }}>Metni Aktar</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {busy && <p className="text-xs text-gray-400"><i className="fa-solid fa-spinner fa-spin mr-1"></i>Dosya okunuyor…</p>}
                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-[11px] text-red-600 dark:text-red-300">{error}</div>
                    )}

                    {/* Önizleme */}
                    {result && (
                        <>
                            <div className="flex flex-wrap items-center gap-3 text-[11px]">
                                <span className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">{result.recordCount} kayıt</span>
                                <span className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">Toplam {fmt(result.totalHours)} saat</span>
                                <span className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 font-semibold">Eşleşen {fmt(result.totalAA)} AA</span>
                                <span className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">{result.rows.length} kişi×proje · {result.matchedProjectCount} proje</span>
                                <button onClick={() => { setRecords(null); setPaste(''); }} className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i className="fa-solid fa-rotate-left mr-1"></i>Başka dosya</button>
                            </div>

                            {hasUnmatched && (
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-[11px] text-amber-700 dark:text-amber-300 space-y-1">
                                    {result.unmatchedProjects.length > 0 && (
                                        <div><b>Eşleşmeyen proje ({result.unmatchedProjects.length}):</b> {result.unmatchedProjects.join(', ')}</div>
                                    )}
                                    {result.unmatchedPeople.length > 0 && (
                                        <div><b>Eşleşmeyen kişi ({result.unmatchedPeople.length}):</b> {result.unmatchedPeople.join(', ')}</div>
                                    )}
                                </div>
                            )}

                            {hasUnmatched && (
                                <label className={`flex items-start gap-3 rounded-xl px-4 py-3 cursor-pointer border transition-colors ${autoCreate ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700'}`}>
                                    <input type="checkbox" checked={autoCreate} onChange={e => setAutoCreate(e.target.checked)} className="mt-0.5 accent-emerald-600" />
                                    <span className="text-[11px] text-gray-600 dark:text-gray-300">
                                        <b>Eşleşmeyenleri Veri Havuzu'na otomatik ekle</b> — {additions?.projects.length || 0} proje (koduyla) ve {additions?.people.length || 0} kişi (ad/soyad) havuza açılır, ardından tüm kayıtlar uygulanır.
                                        {autoCreate && <span className="block mt-0.5 text-emerald-600 dark:text-emerald-400">Uygulanacak toplam: {fmt(result.totalAllAA)} AA · Yeni kişiler "Tanımsız" bölüm/ünvansız açılır (maliyet için ünvanı sonra atayın).</span>}
                                    </span>
                                </label>
                            )}

                            {result.rows.length > 0 ? (
                                <div className="max-h-[34vh] overflow-y-auto rounded-xl border border-gray-100 dark:border-gray-800">
                                    <table className="w-full">
                                        <thead className="sticky top-0">
                                            <tr className="bg-gray-50 dark:bg-gray-800/80">
                                                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400">Proje</th>
                                                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400">Kişi</th>
                                                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400">Aylar (AA)</th>
                                                <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400">Toplam</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                            {result.rows.map(r => (
                                                <tr key={`${r.projectId}-${r.personId}`}>
                                                    <td className="px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400">{r.projectName}</td>
                                                    <td className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
                                                        {r.personName}
                                                        {r.sourceName !== r.personName && <span className="ml-1 text-[10px] text-gray-400">({r.sourceName})</span>}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex flex-wrap gap-1">
                                                            {Object.entries(r.months).filter(([, aa]) => Number(aa) > 0).map(([m, aa]) => (
                                                                <span key={m} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">{MONTHS_TR[Number(m) - 1]} {fmt(Number(aa))}</span>
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--app-primary)' }}>{fmt(r.totalAA)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="text-xs text-gray-400">
                                    {autoCreate && hasUnmatched
                                        ? 'Havuzda eşleşen yok; “otomatik ekle” işaretli olduğundan proje/kişiler açılıp uygulanacak.'
                                        : 'Havuzla eşleşen kişi×proje bulunamadı — yukarıdaki seçenekle havuza ekleyin ya da havuzu güncelleyin.'}
                                </p>
                            )}

                            <div className="flex flex-wrap items-center gap-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-3">
                                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                                    <input type="radio" name="billedMode" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} className="accent-blue-600" />
                                    <span><b>Üzerine yaz</b> — pivotta değeri olan ayları değiştir</span>
                                </label>
                                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                                    <input type="radio" name="billedMode" checked={mode === 'fill'} onChange={() => setMode('fill')} className="accent-blue-600" />
                                    <span><b>Boş ayları doldur</b> — elle girilmiş gerçekleşene dokunma</span>
                                </label>
                            </div>
                        </>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                        <button onClick={onClose} className="text-xs font-semibold px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300">Vazgeç</button>
                        <button
                            onClick={() => { if (result && records) { onApply(records, { year, hoursPerDay }, mode, autoCreate); onClose(); } }}
                            disabled={!canApply}
                            className="text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-md hover:opacity-90 disabled:opacity-40"
                            style={{ backgroundColor: 'var(--app-primary)' }}
                        >
                            <i className="fa-solid fa-check mr-1"></i>Gerçekleşene Uygula
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BilledHoursImportModal;
