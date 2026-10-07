import React, { useMemo } from 'react';
import { WorkspaceData } from '../../types';
import { ProjectHealth } from '../../utils/executive';
import { BAND_GOOD, BAND_WARN, calibrationStatus, CONFIDENCE_LABELS, HEALTH_FACTORS, HEALTH_MODEL_VERSION, PERCEPTION_GAP_ALERT } from '../../utils/healthModel';
import { Icon, IconName } from './icons';
import { BAND_META, rowSep, Sheet } from './ui';

/**
 * Sağlık skorunun nasıl hesaplandığı, (verilirse) bir projenin girdi dökümü,
 * regresyon için toplanan veri ve sıradaki adımlar. Yönetim ve proje genel
 * bakış ekranlarındaki (i) düğmesiyle açılır.
 */

const num = (v: number, digits = 2) => v.toLocaleString('tr-TR', { maximumFractionDigits: digits });
const pct = (v: number) => `%${Math.round(v * 100)}`;

const Frac: React.FC<{ num: React.ReactNode; den: React.ReactNode }> = ({ num: n, den }) => (
    <span className="inline-flex flex-col items-center align-middle mx-1 leading-tight">
        <span className="px-1.5">{n}</span>
        <span className="px-1.5" style={{ borderTop: '1px solid currentColor' }}>{den}</span>
    </span>
);

const Formula: React.FC<{ children: React.ReactNode; label: string }> = ({ children, label }) => (
    <div role="math" aria-label={label} className="rounded-xl m-fill-2 px-4 py-3 text-[18px] m-text overflow-x-auto whitespace-nowrap" style={{ fontFamily: 'ui-serif, Georgia, "Times New Roman", serif' }}>
        {children}
    </div>
);

const Section: React.FC<{ title: string; icon: IconName; children: React.ReactNode; subtitle?: string }> = ({ title, icon, children, subtitle }) => (
    <section className="m-surface rounded-2xl p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-[10px] m-tone-accent flex items-center justify-center flex-none"><Icon name={icon} size={18} /></span>
            <div className="min-w-0">
                <h3 className="m-0 text-[17px] font-semibold m-text">{title}</h3>
                {subtitle && <p className="m-0 mt-0.5 text-[13px] m-text-3">{subtitle}</p>}
            </div>
        </div>
        {children}
    </section>
);

const Bullets: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
    <ul className="m-0 pl-5 flex flex-col gap-1.5">
        {items.map((it, i) => <li key={i} className="text-[14.5px] leading-relaxed m-text-2">{it}</li>)}
    </ul>
);

const NEXT_STEPS: { icon: IconName; title: string; text: React.ReactNode }[] = [
    {
        icon: 'activity',
        title: 'Regresyonla kalibrasyon',
        text: <>Yeterli etiketli gözlem birikince ağırlıklar, uzman ağırlıklarına doğru büzülen ridge regresyonla yeniden tahmin edilir. Veri azken sonuç uzman ağırlıklarında (β<sub>0</sub>) kalır, veri arttıkça veriye yaklaşır. Doğrulama proje bazlı çapraz doğrulamayla yapılır (aynı projenin haftaları birbirinden bağımsız değildir); yeni ağırlıklar PMO onayıyla, sürümlenerek devreye girer.</>,
    },
    { icon: 'flag', title: 'Erken uyarı', text: 'Hedef olarak gelecekteki sonuç kullanılır: lojistik regresyonla “önümüzdeki 8 hafta içinde kritik duruma düşme olasılığı”.' },
    { icon: 'clock', title: 'Kazanılmış takvim (earned schedule)', text: "SPI'ın proje sonuna doğru kendiliğinden 1'e yaklaşma sorununu giderir; takvim sapmasını zaman cinsinden ölçer." },
]

const HealthModelSheet: React.FC<{ workspace: WorkspaceData; onClose: () => void; health?: ProjectHealth }> = ({ workspace, onClose, health }) => {
    const cal = useMemo(() => calibrationStatus(workspace), [workspace]);
    const progress = Math.min(1, cal.labeled / cal.needed);

    return (
        <Sheet wide title="Sağlık skoru nasıl hesaplanır?" subtitle={`Model ${HEALTH_MODEL_VERSION} · uzman ağırlıklı bileşik skor`} onClose={onClose}>
            {health && (
                <Section title={health.name} icon="gauge" subtitle="Bu projenin girdileri ve skora katkıları">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[34px] leading-none font-bold tracking-[-0.02em] m-tabular m-text">{health.score}</span>
                        <span className={`inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold ${BAND_META[health.band].tone}`}>{BAND_META[health.band].label}</span>
                        <span className="text-[14px] m-text-3">Güven: {CONFIDENCE_LABELS[health.confidence]} (kapsam {pct(health.coverage)})</span>
                    </div>
                    <div className="-mx-1 flex flex-col">
                        {health.factors.map((f, i) => {
                            const sep = rowSep(i);
                            const none = f.value === null;
                            return (
                                <div key={f.key} className={`flex items-center gap-3 px-1 py-2 ${sep.className}`} style={sep.style}>
                                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                        <span className={`text-[15px] ${none ? 'm-text-3' : 'm-text'}`}>{f.label} <span className="text-[12.5px] m-text-3 m-tabular">· w {num(f.weight)}</span></span>
                                        <span className="text-[13px] m-text-3 truncate">{f.detail}</span>
                                        {f.note && <span className="text-[13px] m-text-2 leading-snug">{f.note}</span>}
                                    </span>
                                    <span className="w-24 sm:w-32 flex-none flex items-center gap-2" aria-label={none ? 'Veri yok' : `x = ${num(f.value!)}`}>
                                        <span aria-hidden="true" className="flex-1 h-1.5 rounded-full m-fill overflow-hidden">
                                            {!none && <span className="block h-full rounded-full" style={{ width: `${f.value! * 100}%`, background: f.value! >= 0.75 ? 'var(--m-ok)' : f.value! >= 0.5 ? 'var(--m-warn)' : 'var(--m-bad)' }}></span>}
                                        </span>
                                        <span className="w-9 text-right text-[13px] m-tabular m-text-2">{none ? '—' : num(f.value!)}</span>
                                    </span>
                                    <span className={`w-14 flex-none text-right text-[14px] font-semibold m-tabular ${none ? 'm-text-3' : f.points >= 5 ? 'm-ink-bad' : f.points > 0 ? 'm-ink-warn' : 'm-text-3'}`}>
                                        {none ? 'dışarıda' : f.points > 0 ? `−${num(f.points, 1)}` : '0'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <p className="m-0 text-[13px] m-text-3">
                        Sağdaki sayı girdinin skordan düşürdüğü puandır; “dışarıda” olanların verisi yok ve skora girmedi.
                        {health.perceptionGap !== null && <> Algı farkı: <b className={health.perceptionGap >= PERCEPTION_GAP_ALERT ? 'm-ink-bad' : 'm-text-2'}>{health.perceptionGap > 0 ? '+' : ''}{num(health.perceptionGap)}</b>{health.perceptionGap >= PERCEPTION_GAP_ALERT ? ' — PY değerlendirmesi verilerden belirgin iyimser.' : '.'}</>}
                    </p>
                </Section>
            )}

            <Section title="Hesaplama" icon="info" subtitle="Ağırlıklı ortalama; yalnız verisi olan girdiler">
                <Formula label="Skor eşittir 100 çarpı, w i çarpı x i toplamı bölü w i toplamı">
                    Skor = 100 × <Frac num={<>Σ w<sub>i</sub> · x<sub>i</sub></>} den={<>Σ w<sub>i</sub></>} />
                </Formula>
                <Bullets items={[
                    <><b>x<sub>i</sub></b>: girdinin 0–1 arası normalize değeri (1 = sağlıklı). Kurallar aşağıdaki tabloda.</>,
                    <><b>w<sub>i</sub></b>: uzman ağırlığı, toplamı 1. Verisi olmayan girdi paydan da çıkar; ağırlığı diğerlerine orantılı dağılır.</>,
                    <><b>Kapsam</b> = verisi olan girdilerin Σw<sub>i</sub>'si → güven: %70 ve üstü yüksek, %45–69 orta, altı düşük.</>,
                    <><b>Bantlar</b>: {BAND_GOOD} ve üstü Sağlıklı · {BAND_WARN}–{BAND_GOOD - 1} İzlemede · {BAND_WARN} altı Sorunlu.</>,
                    <><b>Skoru düşürenler</b>: her girdinin kaybı 100 × w<sub>i</sub>(1 − x<sub>i</sub>) ÷ Σw<sub>i</sub>; en büyük kayıp başta listelenir.</>,
                    <><b>Algı farkı</b> = ort(RAG, PY puanı) − nesnel girdilerin ağırlıklı ortalaması (AI metin puanı PY'nin kendi metninden türediği için iki tarafa da girmez). +{num(PERCEPTION_GAP_ALERT)} ve üstü “karpuz proje” uyarısıdır: dışı yeşil, içi kırmızı.</>,
                ]} />
            </Section>

            <Section title="Girdiler ve ağırlıklar" icon="sliders" subtitle="Uzman ağırlıkları (β₀) — regresyonun başlangıç noktası">
                <div className="-mx-1 flex flex-col">
                    {HEALTH_FACTORS.map((f, i) => {
                        const sep = rowSep(i);
                        return (
                            <div key={f.key} className={`flex items-start gap-3 px-1 py-2 ${sep.className}`} style={sep.style}>
                                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <span className="text-[15px] font-semibold m-text">{f.label}</span>
                                    <span className="text-[13px] m-text-2">{f.rule}</span>
                                    <span className="text-[12.5px] m-text-3">{f.source}</span>
                                </span>
                                <span className="inline-flex items-center h-7 px-2.5 rounded-full text-[13px] font-semibold m-tabular m-tone-accent flex-none">{pct(f.weight)}</span>
                            </div>
                        );
                    })}
                </div>
            </Section>

            <Section title="Veri toplama" icon="history" subtitle="PMO puanı modelin hedef değişkeni (Y)">
                <p className="m-0 text-[14.5px] leading-relaxed m-text-2">
                    Her ISO haftasında aktif projelerin girdileri ve skoru kaydedilir (hafta içinde günde en çok bir kez tazelenir). PMO (PYB sorumlusu ya da PYB destek) haftalık raporda her projeye 1–10 puan verir. Çapa etkisini azaltmak için puanın verildiği yerde model skoru gösterilmez. AI metin puanı, PYB destek haftayı yayınlarken onaylı rapor metinlerinden hesaplanır; söz tutma oranı PY'nin geçen haftanın planını değerlendirmesinden gelir.
                </p>
                <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-4">
                    {[
                        { label: 'Haftalık fotoğraf', value: cal.weeks },
                        { label: 'PMO puanı', value: cal.ratings },
                        { label: 'Eşleşen gözlem', value: cal.labeled },
                        { label: 'Proje', value: cal.labeledProjects },
                    ].map(s => (
                        <div key={s.label} className="rounded-xl m-fill-2 px-3 py-2.5 flex flex-col">
                            <span className="text-[12.5px] m-text-3">{s.label}</span>
                            <span className="text-[22px] font-bold m-tabular m-text">{s.value}</span>
                        </div>
                    ))}
                </div>
                <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[13px] m-text-2">
                        <span>Regresyon için gereken: ~{cal.needed} etiketli gözlem (girdi başına ~10)</span>
                        <span className="m-tabular">{cal.labeled}/{cal.needed}</span>
                    </div>
                    <span role="progressbar" aria-label="Kalibrasyon için toplanan veri" aria-valuemin={0} aria-valuemax={cal.needed} aria-valuenow={cal.labeled} className="block h-2 rounded-full m-fill overflow-hidden">
                        <span className="block h-full rounded-full" style={{ width: `${progress * 100}%`, background: progress >= 1 ? 'var(--m-ok)' : 'var(--m-accent)' }}></span>
                    </span>
                </div>
                <p className="m-0 text-[13px] m-text-3">
                    {cal.mae === null
                        ? 'Henüz fotoğrafla eşleşen PMO puanı yok; model ile PMO arasındaki uyum, ilk puanlardan sonra burada görünür.'
                        : <>Model ile PMO arasındaki ortalama fark: <b className="m-text-2">{num(cal.mae, 1)} puan</b> (10'luk ölçek){cal.correlation !== null ? <> · korelasyon <b className="m-text-2">r = {num(cal.correlation)}</b></> : ' · korelasyon için en az 5 gözlem gerekir'}.</>}
                </p>
            </Section>

            <Section title="Sırada ne var" icon="target" subtitle="Veri biriktikçe">
                <Formula label="Beta şapka eşittir, X devrik X artı lambda I'nın tersi, çarpı X devrik y artı lambda beta sıfır">
                    <span className="relative inline-block">β<span aria-hidden="true" className="absolute inset-x-0 text-center" style={{ top: '-0.62em', fontSize: '0.85em' }}>ˆ</span></span> = (X<sup>T</sup>X + λI)<sup>−1</sup> (X<sup>T</sup>y + λβ<sub>0</sub>)
                </Formula>
                <div className="flex flex-col gap-3">
                    {NEXT_STEPS.map(s => (
                        <div key={s.title} className="flex items-start gap-3">
                            <span className="w-7 h-7 rounded-full m-fill-2 m-text-2 flex items-center justify-center flex-none" style={{ marginTop: 1 }}><Icon name={s.icon} size={15} /></span>
                            <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-[15px] font-semibold m-text">{s.title}</span>
                                <span className="text-[14px] leading-relaxed m-text-2">{s.text}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </Section>
        </Sheet>
    );
};

/** Sağlık başlığının yanındaki (i) düğmesi */
export const HealthInfoButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button type="button" className="m-icon-btn !w-9 !h-9" aria-label="Sağlık skoru nasıl hesaplanır?" title="Sağlık skoru nasıl hesaplanır?" onClick={onClick}>
        <Icon name="info" size={19} />
    </button>
);

export default HealthModelSheet;
