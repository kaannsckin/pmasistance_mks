import React, { useMemo, useState } from 'react';
import { Person, Risk, RiskLevel, RiskStatus } from '../../types';
import { cellKey } from '../../utils/riskReport';
import { RiskBand, riskBand, RISK_BAND_LABELS, riskScore, RISK_STATUS_LABELS } from '../../utils/risks';
import { Field, Sheet } from './ui';

/** Modern risk ekranlarının ortak parçaları: matris, skor rozeti, risk sayfası */

export const RISK_TONE: Record<RiskBand, { tone: string; solid: string; on: string; tint: string; ink: string }> = {
    high: { tone: 'm-tone-bad', solid: 'var(--m-bad)', on: 'var(--m-on-bad)', tint: 'var(--m-bad-tint)', ink: 'm-ink-bad' },
    medium: { tone: 'm-tone-warn', solid: 'var(--m-warn)', on: 'var(--m-on-warn)', tint: 'var(--m-warn-tint)', ink: 'm-ink-warn' },
    low: { tone: 'm-tone-ok', solid: 'var(--m-ok)', on: 'var(--m-on-ok)', tint: 'var(--m-ok-tint)', ink: 'm-ink-ok' },
};

export const RISK_STATUS_TONE: Record<RiskStatus, string> = {
    open: 'm-tone-bad',
    monitoring: 'm-tone-warn',
    closed: 'm-tone-hold',
};

const LEVELS: RiskLevel[] = [1, 2, 3, 4, 5];
const LEVEL_LABELS = ['', 'Çok düşük', 'Düşük', 'Orta', 'Yüksek', 'Çok yüksek'];

export const RiskScorePill: React.FC<{ score: number; muted?: boolean }> = ({ score, muted }) => {
    const band = riskBand(score);
    return (
        <span
            className={`inline-flex items-center justify-center min-w-[36px] h-7 px-2 rounded-full text-[13px] font-semibold m-tabular flex-none ${muted ? 'm-tone-hold' : RISK_TONE[band].tone}`}
            aria-label={`Risk skoru ${score}, ${RISK_BAND_LABELS[band]}`}
        >
            {score}
        </span>
    );
};

/**
 * 5×5 olasılık × etki matrisi. Dolu hücre bant rengiyle, boş hücre açık
 * tonla. Tıklanabilirse hücre seçimi listeyi süzer (tekrar tıklama kaldırır).
 */
export const RiskMatrix: React.FC<{ counts: Record<string, number>; selected?: string | null; onSelect?: (key: string | null) => void }> = ({ counts, selected, onSelect }) => (
    <div className="flex flex-col gap-2">
        <div className="flex gap-2">
            <span className="text-[12px] font-semibold m-text-3 self-center" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Olasılık</span>
            <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: '18px repeat(5, minmax(0, 1fr))' }}>
                {[5, 4, 3, 2, 1].map(p => (
                    <React.Fragment key={p}>
                        <span className="text-[12px] m-text-3 m-tabular self-center text-right pr-1">{p}</span>
                        {LEVELS.map(i => {
                            const key = cellKey(p, i);
                            const n = counts[key] || 0;
                            const band = riskBand(p * i);
                            const isSel = selected === key;
                            const style: React.CSSProperties = {
                                background: n > 0 ? RISK_TONE[band].solid : RISK_TONE[band].tint,
                                color: n > 0 ? RISK_TONE[band].on : 'transparent',
                                outline: isSel ? '3px solid var(--m-label)' : undefined,
                                outlineOffset: isSel ? 1 : undefined,
                            };
                            const label = `Olasılık ${p} × Etki ${i} = ${p * i}, ${RISK_BAND_LABELS[band]}: ${n} risk`;
                            return onSelect && n > 0 ? (
                                <button key={key} type="button" aria-label={label} aria-pressed={isSel} title={label} onClick={() => onSelect(isSel ? null : key)} className="aspect-square rounded-lg border-0 text-[15px] font-bold m-tabular cursor-pointer" style={style}>{n}</button>
                            ) : (
                                <span key={key} title={label} className="aspect-square rounded-lg flex items-center justify-center text-[15px] font-bold m-tabular" style={style}>{n || ''}</span>
                            );
                        })}
                    </React.Fragment>
                ))}
                <span></span>
                {LEVELS.map(i => <span key={i} className="text-[12px] m-text-3 m-tabular text-center">{i}</span>)}
            </div>
        </div>
        <div className="flex items-center justify-between gap-3 pl-6">
            <span className="text-[12px] font-semibold m-text-3">Etki →</span>
            <span className="flex flex-wrap gap-3">
                {(['low', 'medium', 'high'] as RiskBand[]).map(b => (
                    <span key={b} className="inline-flex items-center gap-1.5 text-[12px] m-text-2">
                        <span aria-hidden="true" className="w-2.5 h-2.5 rounded-sm" style={{ background: RISK_TONE[b].solid }}></span>
                        {RISK_BAND_LABELS[b]}
                    </span>
                ))}
            </span>
        </div>
    </div>
);

const LevelPicker: React.FC<{ label: string; value: RiskLevel; onChange: (v: RiskLevel) => void; disabled?: boolean }> = ({ label, value, onChange, disabled }) => (
    <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold m-text-2">{label}</span>
        <div className="m-segmented" role="group" aria-label={label}>
            {LEVELS.map(l => (
                <button key={l} type="button" className="m-segment" style={{ padding: '0 14px' }} aria-pressed={value === l} title={LEVEL_LABELS[l]} disabled={disabled} onClick={() => onChange(l)}>{l}</button>
            ))}
        </div>
        <span className="text-[12px] m-text-3">{LEVEL_LABELS[value]}</span>
    </div>
);

export interface RiskSheetProps {
    risk?: Risk; // yoksa yeni risk
    projectName?: string;
    people: Person[];
    canEdit: boolean;
    onClose: () => void;
    onSave?: (risk: Risk) => void;
    onDelete?: (id: string) => void;
    /** Salt okunur görünümde "projede aç" bağlantısı */
    onOpenProject?: () => void;
}

/** Risk ekle/düzenle; yetkisi olmayan için salt okunur ayrıntı */
export const RiskSheet: React.FC<RiskSheetProps> = ({ risk, projectName, people, canEdit, onClose, onSave, onDelete, onOpenProject }) => {
    const [title, setTitle] = useState(risk?.title || '');
    const [description, setDescription] = useState(risk?.description || '');
    const [probability, setProbability] = useState<RiskLevel>(risk?.probability || 3);
    const [impact, setImpact] = useState<RiskLevel>(risk?.impact || 3);
    const [ownerPersonId, setOwnerPersonId] = useState(risk?.ownerPersonId || '');
    const [mitigation, setMitigation] = useState(risk?.mitigation || '');
    const [status, setStatus] = useState<RiskStatus>(risk?.status || 'open');
    const sorted = useMemo(() => [...people].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr')), [people]);
    const nameOf = (id?: string) => {
        const p = id ? people.find(x => x.id === id) : undefined;
        return p ? `${p.firstName} ${p.lastName}`.trim() : undefined;
    };
    const score = probability * impact;
    const band = riskBand(score);

    if (!canEdit && risk) {
        const owner = nameOf(risk.ownerPersonId) || risk.owner;
        return (
            <Sheet
                title="Risk ayrıntısı"
                onClose={onClose}
                footer={<>
                    {onOpenProject && <button type="button" className="m-btn m-btn-gray" onClick={onOpenProject}>Projenin risklerini aç</button>}
                    <span className="flex-1"></span>
                    <button type="button" className="m-btn m-btn-primary" onClick={onClose}>Tamam</button>
                </>}
            >
                <div className="flex items-start gap-3">
                    <RiskScorePill score={riskScore(risk)} muted={risk.status === 'closed'} />
                    <div className="min-w-0 flex flex-col gap-0.5">
                        <span className="text-[17px] font-semibold m-text">{risk.title}</span>
                        <span className="text-[14px] m-text-3">{[projectName, `Olasılık ${risk.probability} × Etki ${risk.impact}`, RISK_BAND_LABELS[riskBand(riskScore(risk))]].filter(Boolean).join(' · ')}</span>
                    </div>
                </div>
                {risk.description && <p className="m-0 text-[15px] leading-relaxed m-text whitespace-pre-line">{risk.description}</p>}
                <dl className="m-0 grid gap-x-4 gap-y-2 text-[15px]" style={{ gridTemplateColumns: 'auto 1fr' }}>
                    <dt className="m-text-3">Durum</dt><dd className="m-0"><span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[13px] font-semibold ${RISK_STATUS_TONE[risk.status]}`}>{RISK_STATUS_LABELS[risk.status]}</span></dd>
                    <dt className="m-text-3">Sahibi</dt><dd className="m-0 m-text">{owner || <span className="m-ink-warn">Atanmamış</span>}</dd>
                    <dt className="m-text-3">Aksiyon</dt><dd className="m-0 m-text whitespace-pre-line">{risk.mitigation || <span className="m-ink-warn">Azaltıcı aksiyon yazılmamış</span>}</dd>
                </dl>
            </Sheet>
        );
    }

    const save = () => {
        if (!title.trim() || !onSave) return;
        const base: Risk = risk || { id: `risk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, title: '', probability: 3, impact: 3, status: 'open', createdAt: new Date().toISOString() };
        onSave({
            ...base,
            title: title.trim(),
            description: description.trim() || undefined,
            probability,
            impact,
            ownerPersonId: ownerPersonId || undefined,
            owner: ownerPersonId ? nameOf(ownerPersonId) : (risk?.ownerPersonId ? undefined : risk?.owner),
            mitigation: mitigation.trim() || undefined,
            status,
        });
    };

    return (
        <Sheet
            title={risk ? 'Riski düzenle' : 'Yeni risk'}
            onClose={onClose}
            footer={<>
                {risk && onDelete && <button type="button" className="m-btn m-btn-danger" onClick={() => { if (window.confirm('Bu risk silinsin mi?')) onDelete(risk.id); }}>Sil</button>}
                <span className="flex-1"></span>
                <button type="button" className="m-btn m-btn-plain" onClick={onClose}>Vazgeç</button>
                <button type="button" className="m-btn m-btn-primary" disabled={!title.trim()} onClick={save}>{risk ? 'Kaydet' : 'Ekle'}</button>
            </>}
        >
            <Field label="Risk" htmlFor="rs-title">
                <input id="rs-title" className="m-input" value={title} autoFocus placeholder="Ör. Tedarikçi API teslimini geciktirebilir" onChange={e => setTitle(e.target.value)} />
            </Field>
            <Field label="Açıklama" htmlFor="rs-desc">
                <textarea id="rs-desc" className="m-input py-2.5" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
            </Field>
            <div className="flex flex-wrap items-start gap-4">
                <LevelPicker label="Olasılık" value={probability} onChange={setProbability} />
                <LevelPicker label="Etki" value={impact} onChange={setImpact} />
                <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold m-text-2">Skor</span>
                    <span className={`inline-flex items-center h-10 px-3 rounded-xl text-[15px] font-bold m-tabular ${RISK_TONE[band].tone}`}>{score} · {RISK_BAND_LABELS[band]}</span>
                </div>
            </div>
            <Field label="Sahibi" htmlFor="rs-owner">
                <select id="rs-owner" className="m-input" value={ownerPersonId} onChange={e => setOwnerPersonId(e.target.value)}>
                    <option value="">{risk?.owner && !risk.ownerPersonId ? `${risk.owner} (havuz dışı)` : 'Atanmamış'}</option>
                    {sorted.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.departmentCode ? ` (${p.departmentCode})` : ''}</option>)}
                </select>
            </Field>
            <Field label="Azaltıcı aksiyon" htmlFor="rs-mit" hint={band === 'high' && !mitigation.trim() ? 'Yüksek risklerde aksiyon yönetim raporunda aranır.' : undefined}>
                <textarea id="rs-mit" className="m-input py-2.5" rows={2} value={mitigation} placeholder="Ne yapılacak, kim, ne zamana kadar" onChange={e => setMitigation(e.target.value)} />
            </Field>
            <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold m-text-2">Durum</span>
                <div className="m-segmented self-start" role="group" aria-label="Durum">
                    {(Object.keys(RISK_STATUS_LABELS) as RiskStatus[]).map(s => (
                        <button key={s} type="button" className="m-segment" aria-pressed={status === s} onClick={() => setStatus(s)}>{RISK_STATUS_LABELS[s]}</button>
                    ))}
                </div>
            </div>
        </Sheet>
    );
};
