import React, { useMemo, useState } from 'react';
import { Person, Project } from '../types';
import {
    findImportedProject,
    findPersonByName,
    formatPercent,
    GIB_TEAMS,
    GibImportPackage,
    isGibWorkbook,
    parseGibWorkbook,
    readWorkbookFile,
} from '../utils/gibFindings';
import { foldTr } from '../utils/rag/text';

export interface GibImportChoice {
    projectId?: string;
    projectName: string;
    pmPersonId?: string;
    newPmName?: string;
}

interface Props {
    people: Person[];
    projects: Project[];
    /** Yeni kişi havuza açılabilir mi (datapool.edit) */
    canAddPerson: boolean;
    /** Güncellemeye açık projeler (içerik düzenleme yetkisi olanlar) */
    editableProjectIds: Set<string>;
    currentPersonId?: string;
    defaultProjectName?: string;
    defaultPmName?: string;
    onApply: (pkg: GibImportPackage, choice: GibImportChoice) => void;
    onClose: () => void;
}

const NEW = '__new__';
const fmt = (v: number): string => (Math.round(v * 10) / 10).toString().replace('.', ',');
const fullName = (p: Person): string => `${p.firstName} ${p.lastName}`.trim();

/**
 * PoC Bulgu Takip Excel'ini (GİB çalışması) projeye aktarır: dosya okunur,
 * önizlenir, hedef proje ve proje yöneticisi (PY) seçilir. Aynı dosya tekrar
 * aktarılınca bulgular Test No ile eşleşip güncellenir.
 */
const GibImportModal: React.FC<Props> = ({
    people, projects, canAddPerson, editableProjectIds, currentPersonId,
    defaultProjectName = 'GİB', defaultPmName = 'MKS', onApply, onClose,
}) => {
    const [pkg, setPkg] = useState<GibImportPackage | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [target, setTarget] = useState<string>(NEW);
    const [projectName, setProjectName] = useState(defaultProjectName);
    const [pm, setPm] = useState<string>(NEW);
    const [newPmName, setNewPmName] = useState(defaultPmName);

    const editable = useMemo(() => projects.filter(p => editableProjectIds.has(p.id)), [projects, editableProjectIds]);
    const sortedPeople = useMemo(() => [...people].sort((a, b) => fullName(a).localeCompare(fullName(b), 'tr')), [people]);

    const handleFile = async (file?: File) => {
        if (!file) return;
        setError(null);
        setBusy(true);
        try {
            const wb = await readWorkbookFile(file);
            if (!isGibWorkbook(Object.keys(wb))) throw new Error('"Genel Liste" sayfası bulunamadı — PoC Bulgu Takip Excel\'i seçin.');
            const parsed = parseGibWorkbook(wb);
            setPkg(parsed);
            // Önceden aktarılmış proje ya da aynı adlı proje varsa onu güncellemeyi öner
            const prior = findImportedProject(editable, parsed)
                || editable.find(p => foldTr(p.name) === foldTr(defaultProjectName));
            setTarget(prior ? prior.id : NEW);
            setProjectName(prior ? prior.name : defaultProjectName);
            const pmPerson = (prior?.pmPersonId && people.find(p => p.id === prior.pmPersonId)) || findPersonByName(people, defaultPmName);
            setPm(pmPerson ? pmPerson.id : canAddPerson ? NEW : currentPersonId || '');
        } catch (e) {
            setPkg(null);
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const s = pkg?.summary;
    const pmMissing = pm === NEW ? !newPmName.trim() : !pm;
    const canApply = !!pkg && !!projectName.trim() && !pmMissing;
    const msEntries = s ? Object.entries(s.byMs).sort(([a], [b]) => a.localeCompare(b)) : [];

    const chip = (label: string, strong = false) => (
        <span className={`px-2.5 py-1 rounded-lg ${strong ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 font-semibold' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>{label}</span>
    );

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-labelledby="gib-import-title" className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-y-auto border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 bg-white dark:bg-gray-900 px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
                    <div>
                        <h3 id="gib-import-title" className="text-base font-semibold text-gray-800 dark:text-white">PoC Bulgu Takip Excel'i → Proje</h3>
                        <p className="text-xs text-gray-400">Genel Liste → görevler · Epic → iş paketleri · EMS kişi havuzu → kaynaklar · toplantı çıktıları → müşteri istekleri</p>
                    </div>
                    <button aria-label="Kapat" onClick={onClose} className="w-9 h-9 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><i aria-hidden="true" className="fa-solid fa-times"></i></button>
                </div>

                <div className="p-5 space-y-4">
                    {!pkg && (
                        <label className="block cursor-pointer">
                            <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl px-4 py-6 text-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                                <div className="text-2xl mb-1"><i aria-hidden="true" className="fa-solid fa-file-arrow-up"></i></div>
                                <div className="text-sm">Bulgu takip <b>.xlsx</b> dosyasını seçin</div>
                                <div className="text-[11px] mt-1">Genel Liste, CR Listesi, Epic Listesi, EMS ve Test Kalemleri sayfaları okunur</div>
                                <input type="file" accept=".xlsx,.xlsm" className="hidden" onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
                            </div>
                        </label>
                    )}

                    {busy && <p className="text-xs text-gray-400"><i aria-hidden="true" className="fa-solid fa-spinner fa-spin mr-1"></i>Dosya okunuyor…</p>}
                    {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-[11px] text-red-600 dark:text-red-300">{error}</div>}

                    {pkg && s && (
                        <>
                            <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                {chip(`${s.findings} bulgu`, true)}
                                {chip(`${s.rapor51} Rapor 5.1`)}
                                {chip(`${s.mandatory} zorunlu`)}
                                {chip(`${s.epics} epic · ${s.crs} CR`)}
                                {chip(`${fmt(s.totalEffortDays)} gün efor`)}
                                {s.pocScore !== undefined && chip(`PoC skoru ${formatPercent(s.pocScore)}`, true)}
                                {s.mandatoryOpen !== undefined && chip(`${s.mandatoryOpen} zorunlu açık`)}
                                <button onClick={() => setPkg(null)} className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><i aria-hidden="true" className="fa-solid fa-rotate-left mr-1"></i>Başka dosya</button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
                                <div className="rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2">
                                    <p className="font-semibold text-gray-500 dark:text-gray-300 mb-1">Milestone</p>
                                    {msEntries.map(([ms, n]) => <div key={ms} className="flex justify-between text-gray-500 dark:text-gray-400"><span>{ms}</span><span>{n}</span></div>)}
                                </div>
                                <div className="rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2">
                                    <p className="font-semibold text-gray-500 dark:text-gray-300 mb-1">Ekip eforu (gün)</p>
                                    {GIB_TEAMS.map(t => <div key={t} className="flex justify-between text-gray-500 dark:text-gray-400"><span>{t}</span><span>{fmt(s.effortByTeam[t])}</span></div>)}
                                    <div className="flex justify-between text-gray-400 mt-1"><span>Eforu girilmemiş</span><span>{s.withoutEffort}</span></div>
                                </div>
                                <div className="rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2">
                                    <p className="font-semibold text-gray-500 dark:text-gray-300 mb-1">Ayrıca</p>
                                    <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>Kaynak (EMS havuzu)</span><span>{s.resources}</span></div>
                                    <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>Atanmış bulgu</span><span>{s.assigned}</span></div>
                                    <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>Öncül bağı</span><span>{s.predecessors}</span></div>
                                    <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>Müşteri isteği</span><span>{s.requests}</span></div>
                                </div>
                            </div>

                            {pkg.warnings.length > 0 && (
                                <details className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-[11px] text-amber-700 dark:text-amber-300">
                                    <summary className="cursor-pointer font-semibold">{pkg.warnings.length} uyarı</summary>
                                    <ul className="mt-1 list-disc pl-4">{pkg.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                                </details>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-3">
                                <label className="text-xs text-gray-500 dark:text-gray-300">
                                    <span className="block mb-1 font-semibold">Hedef proje</span>
                                    <select
                                        value={target}
                                        onChange={e => {
                                            setTarget(e.target.value);
                                            const p = projects.find(x => x.id === e.target.value);
                                            setProjectName(p ? p.name : defaultProjectName);
                                            if (p?.pmPersonId) setPm(p.pmPersonId);
                                        }}
                                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200"
                                    >
                                        <option value={NEW}>Yeni proje oluştur</option>
                                        {editable.map(p => <option key={p.id} value={p.id}>Güncelle: {p.name}</option>)}
                                    </select>
                                    <input
                                        value={projectName}
                                        onChange={e => setProjectName(e.target.value)}
                                        placeholder="Proje adı"
                                        aria-label="Proje adı"
                                        className="mt-2 w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200"
                                    />
                                </label>
                                <label className="text-xs text-gray-500 dark:text-gray-300">
                                    <span className="block mb-1 font-semibold">Proje yöneticisi (PY)</span>
                                    <select value={pm} onChange={e => setPm(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200">
                                        {canAddPerson && <option value={NEW}>Havuza yeni kişi ekle…</option>}
                                        {!canAddPerson && !pm && <option value="">Kişi seçin</option>}
                                        {sortedPeople.map(p => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
                                    </select>
                                    {pm === NEW && (
                                        <input
                                            value={newPmName}
                                            onChange={e => setNewPmName(e.target.value)}
                                            placeholder="Ad Soyad ya da kısaltma (ör. MKS)"
                                            aria-label="Yeni proje yöneticisinin adı"
                                            className="mt-2 w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200"
                                        />
                                    )}
                                </label>
                            </div>
                            <p className="text-[11px] text-gray-400">
                                {target === NEW
                                    ? `"${projectName.trim() || defaultProjectName}" adıyla yeni proje açılır; ${s.findings} bulgu görev olarak eklenir.`
                                    : 'Bulgular Test No ile eşleşir: Excel alanları güncellenir; durum yalnız Excel\'de "Durum" yazılıysa değişir. Uygulamada eklenen görevler, notlar ve sürüm planı korunur.'}
                                {pm === NEW && ' Yeni kişi "Tanımsız" bölümle açılır; bölümünü Veri Havuzu\'ndan atayın.'}
                                {' '}Bulut bağlıysa değişiklik otomatik gönderilir.
                            </p>
                        </>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                        <button onClick={onClose} className="text-xs font-semibold px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300">Vazgeç</button>
                        <button
                            onClick={() => {
                                if (!pkg || !canApply) return;
                                onApply(pkg, {
                                    projectId: target === NEW ? undefined : target,
                                    projectName: projectName.trim(),
                                    ...(pm === NEW ? { newPmName: newPmName.trim() } : { pmPersonId: pm }),
                                });
                                onClose();
                            }}
                            disabled={!canApply}
                            className="text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-md hover:opacity-90 disabled:opacity-40"
                            style={{ backgroundColor: 'var(--app-primary)' }}
                        >
                            <i aria-hidden="true" className="fa-solid fa-check mr-1"></i>{target === NEW ? 'Projeyi oluştur' : 'Projeyi güncelle'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GibImportModal;
