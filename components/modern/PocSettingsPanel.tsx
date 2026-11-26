import React, { useMemo } from 'react';
import { PocScoreSettings, Project, WorkflowConfig } from '../../types';
import { categoryName, categoryPrefixOf, computePocScores, pct, pocCategories, pocDistribution, signedPoints, syncLabel } from '../../utils/gibPoc';
import { isProgressPercent } from '../../utils/progress';
import { ProgressWeightsEditor } from './dashboard/DashboardSettings';

/**
 * Proje ayarları › PoC skoru: süreç katsayısı k (Jira durumu başına), değerlendirilmemiş
 * testlerin kuralı ve Olası skorun kapsamı. Değişikliğin skora etkisi canlı önizlenir.
 */

export const pocSettingsInvalid = (s: PocScoreSettings | undefined): boolean =>
    [...Object.values(s?.coefficients?.categories || {}), ...Object.values(s?.coefficients?.statuses || {})].some(v => !isProgressPercent(v));

/** Boş alanları atar; hiçbir ayar yoksa undefined */
export const cleanPocSettings = (s: PocScoreSettings | undefined): PocScoreSettings | undefined => {
    if (!s) return undefined;
    const c = s.coefficients;
    const hasC = !!c && (Object.keys(c.categories || {}).length > 0 || Object.keys(c.statuses || {}).length > 0);
    const out: PocScoreSettings = {
        ...(hasC ? { coefficients: c } : {}),
        ...(s.unevaluated === 'never' ? { unevaluated: 'never' as const } : {}),
        ...(s.scopeLabels?.length ? { scopeLabels: s.scopeLabels } : {}),
        ...(s.categoryPrefix?.trim() ? { categoryPrefix: s.categoryPrefix.trim() } : {}),
    };
    return Object.keys(out).length ? out : undefined;
};

const PocSettingsPanel: React.FC<{
    project: Project;
    workflow: WorkflowConfig;
    value: PocScoreSettings | undefined;
    canEdit: boolean;
    onChange: (s: PocScoreSettings | undefined) => void;
}> = ({ project, workflow, value, canEdit, onChange }) => {
    const before = useMemo(() => computePocScores(project), [project]);
    const after = useMemo(() => computePocScores({ ...project, poc: project.poc ? { ...project.poc, settings: value } : undefined }), [project, value]);
    const categories = useMemo(() => pocCategories(project.tasks, categoryPrefixOf({ settings: value })), [project.tasks, value]);
    const dist = useMemo(() => pocDistribution(project.poc?.tests || []), [project.poc]);
    if (!before || !after) {
        return <p className="m-0 text-[14px] m-text-3">Bu projede PoC test listesi yok. PoC Bulgu Takip Excel'i aktarıldığında Test Kalemleri burada skora dönüşür.</p>;
    }
    const scope = value?.scopeLabels?.length ? value.scopeLabels : after.scope;
    const toggleScope = (label: string) => {
        const next = scope.includes(label) ? scope.filter(l => l !== label) : [...scope, label];
        onChange({ ...value, scopeLabels: next });
    };
    const tile = (label: string, a: number, b: number, hint: string) => (
        <div className="rounded-xl m-fill-2 p-3 min-w-0">
            <div className="text-[12.5px] m-text-3">{label}</div>
            <div className="text-[20px] font-bold m-tabular m-text">{pct(a)}{Math.abs(b - a) >= 0.005 && <span className="m-accent"> → {pct(b)}</span>}</div>
            <div className="text-[12px] m-text-3">{hint}</div>
        </div>
    );
    return (
        <div className="flex flex-col gap-4">
            <p className="m-0 text-[14px] m-text-2">
                Her test GİB puanından başlar (karşılandı 1, kısmen 0,5, karşılanmadı 0; Güncel Sonuç varsa o). Kalan açığı, bağlı görevin <b>son Jira eşitlemesindeki</b> durumuna girdiğiniz katsayı (k) kadar kapatır: p = b + (1 − b) · k.
                {' '}{project.poc?.tests.length} test kalemi · {dist.met} karşılandı · {dist.partial} kısmen · {dist.other} diğer · Jira verisi: {syncLabel(after.syncAt)}.
            </p>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                {tile('İlk', before.initial, after.initial, 'GİB PoC sonucu')}
                {tile('Doğrulanmış', before.verified, after.verified, 'Güncel Sonuç ile')}
                {tile('Bugün', before.today, after.today, 'Jira durumu × k')}
                {tile('Olası', before.possible, after.possible, scope.map(categoryName).join(' + ') || 'kapsam seçilmedi')}
            </div>

            <fieldset disabled={!canEdit} className="m-0 p-0 border-0">
                <ProgressWeightsEditor project={project} workflow={workflow} value={value?.coefficients} includeDone
                    title="Süreç katsayısı (k × 100)"
                    hint="Ör. Testte 70 → k = 0,7: geliştirmesi bitmiş maddenin kalan açığının %70'i kapanmış sayılır. Ayrıntılı Jira durumu boşsa kategori değeri kullanılır. Boş bırakılırsa yalnız Tamamlandı = 100. İptal edilen madde 0 sayılır."
                    resetLabel="Varsayılan katsayılara dön (yalnız Tamamlandı = 1)"
                    onChange={coefficients => onChange({ ...value, coefficients })} />
            </fieldset>
            {pocSettingsInvalid(value) && <p role="alert" className="m-0 text-[13px] m-ink-bad">Katsayılar 0 ile 100 arasında olmalı.</p>}

            <fieldset disabled={!canEdit} className="m-0 rounded-xl m-fill-2 p-3 border-0 flex flex-col gap-1.5">
                <legend className="sr-only">Değerlendirilmemiş testler</legend>
                <span className="text-[13px] font-semibold m-text">Değerlendirilmemiş testler (test edilemedi, üreticiye sorulacak, değerlendirme dışı)</span>
                <label className="flex items-center gap-2 text-[14px]"><input type="radio" name="poc-uneval" checked={value?.unevaluated !== 'never'} onChange={() => onChange({ ...value, unevaluated: undefined })} />k = 1 olunca (madde tamamlanınca) paydaya 1 puanla girer</label>
                <label className="flex items-center gap-2 text-[14px]"><input type="radio" name="poc-uneval" checked={value?.unevaluated === 'never'} onChange={() => onChange({ ...value, unevaluated: 'never' })} />GİB yeniden değerlendirene kadar paydaya girmez</label>
            </fieldset>

            <fieldset disabled={!canEdit} className="m-0 rounded-xl m-fill-2 p-3 border-0 flex flex-col gap-2">
                <legend className="sr-only">Olası skor kapsamı</legend>
                <span className="text-[13px] font-semibold m-text">Olası skorun kapsamı</span>
                <span className="text-[12.5px] m-text-3">Seçilen kategorilerdeki maddeler tamamlanmış sayılır; diğerleri Bugün'deki gibi kalır. Birden çok kategori seçilebilir; sıra yoktur. Dashboard bileşeni ve rapor bu kapsamı kullanır.</span>
                {categories.length === 0 && <span className="text-[13px] m-text-3">Projede "{categoryPrefixOf({ settings: value })}" etiketli madde yok.</span>}
                <div className="flex flex-wrap gap-2">
                    {categories.map(c => {
                        const contrib = after.contributions.find(x => x.label === c);
                        return (
                            <label key={c} className="flex items-center gap-2 text-[14px] m-pill">
                                <input type="checkbox" checked={scope.includes(c)} onChange={() => toggleScope(c)} />
                                {categoryName(c)}
                                {contrib && <span className="m-text-3 m-tabular">{signedPoints(contrib.value)}</span>}
                            </label>
                        );
                    })}
                </div>
            </fieldset>
        </div>
    );
};

export default PocSettingsPanel;
