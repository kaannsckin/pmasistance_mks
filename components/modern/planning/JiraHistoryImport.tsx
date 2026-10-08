import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Project, TaskStatus } from '../../../types';
import { fetchIntegrationHealth, fetchJiraIssuesPage, IntegrationHealth, JiraIssueRecord } from '../../../utils/integrations';
import { issueToTask, JiraImportOptions, previewJiraImport, sinceMonths } from '../../../utils/planning/jiraImport';
import { ISSUE_TYPE_LABELS, taskDurations } from '../../../utils/planning/lifecycle';
import { Icon } from '../icons';
import { Field, rowSep } from '../ui';

/**
 * Jira'dan kayıt geçmişi (proje yöneticisi): projenin kapanmış (istenirse
 * açık) kayıtları durum geçmişi, tahmin ve harcanan süreyle sayfa sayfa
 * çekilir, önizlenir ve görevlerle Jira anahtarı üzerinden birleştirilir.
 * Jira adresi ve jetonu yalnız sunucudadır.
 */

interface Props {
    project: Project;
    onImport: (key: string, issues: JiraIssueRecord[], opts: JiraImportOptions, label: string) => void;
    onOpenList: () => void;
    onClose: () => void;
}

const PERIODS: { months: number; label: string }[] = [
    { months: 6, label: 'Son 6 ay' }, { months: 12, label: 'Son 12 ay' }, { months: 24, label: 'Son 2 yıl' }, { months: 36, label: 'Son 3 yıl' }, { months: 0, label: 'Tümü' },
];
const MAX_PAGES = 50; // en çok 5.000 kayıt
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{1,19}$/;
const num = (v: number) => v.toLocaleString('tr-TR');
const pct = (v: number) => `%${Math.round(v * 100)}`;

type Phase =
    | { kind: 'idle' }
    | { kind: 'fetching'; done: number; total: number | null }
    | { kind: 'preview'; issues: JiraIssueRecord[]; opts: JiraImportOptions; note?: string }
    | { kind: 'done'; text: string };

const JiraHistoryImport: React.FC<Props> = ({ project, onImport, onOpenList, onClose }) => {
    const units = useMemo<string[]>(() => {
        const n = new Map<string, number>();
        project.resources.forEach(r => { const u = (r.unit || '').trim(); if (u) n.set(u, (n.get(u) || 0) + 1); });
        return [...n].sort((a, b) => b[1] - a[1]).map(([u]) => u);
    }, [project.resources]);
    const [health, setHealth] = useState<IntegrationHealth | null>(null);
    const [key, setKey] = useState(project.jiraProjectKey || '');
    const [months, setMonths] = useState(12);
    const [scope, setScope] = useState<'done' | 'all'>('done');
    const [unit, setUnit] = useState(units[0] || 'Genel');
    const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
    const [error, setError] = useState<string | null>(null);
    const abort = useRef<AbortController | null>(null);

    useEffect(() => {
        const c = new AbortController();
        fetchIntegrationHealth(c.signal).then(setHealth).catch(() => undefined);
        return () => { c.abort(); abort.current?.abort(); };
    }, []);

    const validKey = KEY_RE.test(key.trim());
    const run = async () => {
        if (!health || !validKey) return;
        setError(null);
        const c = new AbortController();
        abort.current = c;
        const opts: JiraImportOptions = { importedAt: new Date().toISOString(), defaultUnit: unit };
        const issues: JiraIssueRecord[] = [];
        let cursor: string | null = null;
        let total: number | null = null;
        let note: string | undefined;
        setPhase({ kind: 'fetching', done: 0, total: null });
        try {
            for (let page = 0; ; page++) {
                if (page >= MAX_PAGES) { note = `İlk ${num(issues.length)} kayıt alındı; daha fazlası için dönemi daraltıp yeniden aktarın.`; break; }
                const r = await fetchJiraIssuesPage({ projectKey: key.trim(), scope, since: sinceMonths(months), cursor }, health.authMode, c.signal);
                issues.push(...r.issues);
                total = r.total ?? total;
                setPhase({ kind: 'fetching', done: issues.length, total });
                if (!r.next) break;
                cursor = r.next;
            }
        } catch (e) {
            if ((e as Error)?.name === 'AbortError') note = `Durduruldu: ${num(issues.length)} kayıt alındı.`;
            else { setError(e instanceof Error ? e.message : String(e)); setPhase({ kind: 'idle' }); return; }
        }
        setPhase({ kind: 'preview', issues, opts, note });
    };

    const preview = useMemo(() => (phase.kind === 'preview' ? previewJiraImport(project, phase.issues, phase.opts) : null), [phase, project]);
    const sample = useMemo(() => (phase.kind === 'preview'
        ? phase.issues.slice(0, 6).map(i => { const t = issueToTask(i, phase.opts); const d = taskDurations(t); return { t, days: d.cycleDays ?? d.leadDays }; })
        : []), [phase]);
    const commit = () => {
        if (phase.kind !== 'preview' || !preview) return;
        const k = key.trim().toUpperCase();
        const period = PERIODS.find(p => p.months === months)?.label.toLocaleLowerCase('tr-TR') || '';
        onImport(k, phase.issues, phase.opts, `${period}, ${scope === 'done' ? 'kapanmış' : 'açıklar dahil'}`);
        setPhase({ kind: 'done', text: `${num(preview.added)} yeni, ${num(preview.updated)} güncellenen kayıt aktarıldı. Eğitime uygun kapanmış kayıt: ${num(preview.usableBefore)} → ${num(preview.usableAfter)}.` });
    };

    const busy = phase.kind === 'fetching';
    return (
        <section aria-labelledby="jh-title" className="m-surface rounded-2xl p-5 flex flex-col gap-3.5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 id="jh-title" className="m-0 text-[17px] font-semibold m-text">Jira'dan kayıt geçmişi</h3>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Kapanmış kayıtlar durum geçmişi, ilk tahmin ve harcanan süreyle aktarılır; asistan kapanma sürelerini ve tahmin sapmasını bunlardan öğrenir. Jira adresi ve jetonu yalnız sunucudadır.</p>
                </div>
                <button type="button" className="m-icon-btn" aria-label="Kapat" onClick={() => { abort.current?.abort(); onClose(); }}><Icon name="x" size={18} /></button>
            </div>

            {health && !health.jira ? (
                <div className="rounded-xl m-fill-2 p-3.5 flex flex-col gap-2 text-[14px] m-text-2">
                    <p className="m-0">{health.unreachable ? 'Entegrasyon sunucusuna ulaşılamadı.' : 'Jira bağlantısı sunucuda yapılandırılmadı (JIRA_BASE_URL ve JIRA_TOKEN ya da JIRA_EMAIL + JIRA_API_TOKEN).'} Jira'dan dışa aktardığınız CSV dosyasını görev listesinden içe aktarabilirsiniz; aynı alanlar okunur, durum geçmişi hariç.</p>
                    <button type="button" className="m-btn m-btn-plain self-start !px-0" onClick={onOpenList}>Görev listesine git<Icon name="chevronRight" size={16} /></button>
                </div>
            ) : (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Jira proje anahtarı" htmlFor="jh-key">
                            <input id="jh-key" className="m-input uppercase" value={key} maxLength={20} placeholder="Ör. MKS" disabled={busy} onChange={e => setKey(e.target.value.replace(/\s/g, ''))} aria-invalid={!!key && !validKey} />
                        </Field>
                        <Field label="Dönem (kapanış tarihi)" htmlFor="jh-period">
                            <select id="jh-period" className="m-input" value={months} disabled={busy} onChange={e => setMonths(Number(e.target.value))}>
                                {PERIODS.map(p => <option key={p.months} value={p.months}>{p.label}</option>)}
                            </select>
                        </Field>
                        <Field label="Kapsam" htmlFor="jh-scope">
                            <select id="jh-scope" className="m-input" value={scope} disabled={busy} onChange={e => setScope(e.target.value as 'done' | 'all')}>
                                <option value="done">Yalnız kapanmış kayıtlar</option>
                                <option value="all">Açık kayıtlar dahil</option>
                            </select>
                        </Field>
                        <Field label="Bileşeni olmayanların birimi" htmlFor="jh-unit">
                            <select id="jh-unit" className="m-input" value={unit} disabled={busy} onChange={e => setUnit(e.target.value)}>
                                {[...units, ...(units.includes('Genel') ? [] : ['Genel'])].map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </Field>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" className="m-btn m-btn-gray" disabled={!health || !validKey || busy} onClick={run}>
                            <Icon name="download" size={18} />{busy ? `Getiriliyor… ${num(phase.done)}${phase.total !== null ? ` / ${num(phase.total)}` : ''}` : phase.kind === 'preview' ? 'Yeniden getir' : "Jira'dan getir"}
                        </button>
                        {busy && <button type="button" className="m-btn m-btn-plain" onClick={() => abort.current?.abort()}>Durdur</button>}
                        {!health && <span className="text-[13px] m-text-3">Bağlantı denetleniyor…</span>}
                    </div>
                    {error && <p role="alert" className="m-0 text-[14px] m-ink-bad">{error}</p>}
                </>
            )}

            {phase.kind === 'preview' && preview && (
                <div className="flex flex-col gap-3" aria-live="polite">
                    {phase.note && <p className="m-0 text-[14px] m-ink-warn flex items-start gap-1.5"><Icon name="alert" size={16} className="mt-0.5 shrink-0" />{phase.note}</p>}
                    {preview.total === 0 ? (
                        <p className="m-0 text-[15px] m-text-2">Bu dönemde aktarılacak kayıt bulunamadı.</p>
                    ) : (
                        <>
                            <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-4">
                                {[
                                    { label: 'Bulunan', value: num(preview.total), hint: `${num(preview.closed)} kapanmış · ${num(preview.open)} açık` },
                                    { label: 'Yeni', value: num(preview.added) },
                                    { label: 'Güncellenecek', value: num(preview.updated), hint: preview.unchanged ? `${num(preview.unchanged)} kayıt değişmedi` : undefined },
                                    { label: 'Eğitime uygun kapanmış', value: `${num(preview.usableBefore)} → ${num(preview.usableAfter)}`, hint: preview.excluded ? `${num(preview.excluded)} kayıt kalite testinden geçmedi` : undefined },
                                ].map(t => (
                                    <div key={t.label} className="rounded-xl m-fill-2 px-3 py-2.5 flex flex-col">
                                        <span className="text-[12.5px] m-text-3">{t.label}</span>
                                        <span className="text-[20px] font-bold m-tabular m-text">{t.value}</span>
                                        {t.hint && <span className="text-[12px] m-text-3">{t.hint}</span>}
                                    </div>
                                ))}
                            </div>
                            {preview.closed > 0 && (
                                <p className="m-0 text-[14px] m-text-2">
                                    Kapanmış kayıtlarda ilk tahmini olan {pct(preview.withEstimate)}, harcanan süresi olan {pct(preview.withSpent)}, işe başlama anı bilinen {pct(preview.withStart)} oranında.
                                    {' '}Türler: {preview.byType.map(b => `${b.type === 'none' ? 'türsüz' : ISSUE_TYPE_LABELS[b.type]} ${num(b.n)}`).join(' · ')}.
                                </p>
                            )}
                            <div className="relative overflow-x-auto -mx-1">
                                <table className="w-full min-w-[560px] text-[14px] border-collapse">
                                    <thead><tr className="text-left m-text-3 text-[13px]">
                                        <th className="font-semibold py-2 px-1">Kayıt</th><th className="font-semibold py-2 px-1">Tür</th><th className="font-semibold py-2 px-1">Durum</th>
                                        <th className="font-semibold py-2 px-1 text-right">Kapanma süresi</th><th className="font-semibold py-2 px-1 text-right">Harcanan</th>
                                    </tr></thead>
                                    <tbody>{sample.map(({ t, days }, i) => { const sep = rowSep(i); return (
                                        <tr key={t.jiraId} className={sep.className} style={sep.style}>
                                            <td className="py-2 px-1 m-text max-w-[320px] truncate"><span className="m-text-3 m-tabular">{t.jiraId}</span> {t.name}</td>
                                            <td className="py-2 px-1 m-text-2 whitespace-nowrap">{t.issueType ? ISSUE_TYPE_LABELS[t.issueType] : '—'}</td>
                                            <td className="py-2 px-1 m-text-2 whitespace-nowrap">{t.status === TaskStatus.Done ? 'Kapandı' : t.status === TaskStatus.InProgress ? 'Sürüyor' : 'Açık'}</td>
                                            <td className="py-2 px-1 text-right m-tabular whitespace-nowrap">{days !== null ? `${num(days)} iş günü` : '—'}</td>
                                            <td className="py-2 px-1 text-right m-tabular whitespace-nowrap">{t.actualHours ? `${num(t.actualHours)} sa` : '—'}</td>
                                        </tr>
                                    ); })}</tbody>
                                </table>
                            </div>
                            <p className="m-0 text-[13px] m-text-3">Var olan kayıtlar Jira anahtarıyla eşleşir. Uygulamadaki sürüm, öncül, iş paketi, hedef bağlantısı, termin ve kendi tahmininiz korunur; kapanmış kayıtlar sürüm planına girmez, geçmiş veri olarak kalır.</p>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className="m-btn m-btn-primary" disabled={!preview.added && !preview.updated} onClick={commit}>
                                    <Icon name="check" size={18} />{preview.added || preview.updated ? `Aktar (${num(preview.added + preview.updated)} kayıt)` : 'Değişiklik yok'}
                                </button>
                                <button type="button" className="m-btn m-btn-plain" onClick={() => setPhase({ kind: 'idle' })}>Vazgeç</button>
                            </div>
                        </>
                    )}
                </div>
            )}
            {phase.kind === 'done' && <p role="status" className="m-0 text-[15px] m-ink-ok flex items-start gap-1.5"><Icon name="check" size={18} className="mt-0.5 shrink-0" />{phase.text}</p>}
        </section>
    );
};

export default JiraHistoryImport;
