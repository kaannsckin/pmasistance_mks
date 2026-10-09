import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Project, Task } from '../../../types';
import { createJiraIssues, fetchIntegrationHealth, IntegrationHealth, JiraCreateResult } from '../../../utils/integrations';
import { chunk, JIRA_BATCH, JIRA_FIELD_LABELS, jiraExportCandidates, jiraInputOf, summarizeJiraResults } from '../../../utils/planning/jiraExport';
import { ISSUE_TYPE_LABELS, pertDays } from '../../../utils/planning/lifecycle';
import { Icon } from '../icons';
import { PRIORITY_META } from '../taskMeta';
import { Field, rowSep } from '../ui';

/**
 * Jira'ya gönder (proje yöneticisi): planlamada oluşan, Jira anahtarı
 * olmayan açık kayıtlar Jira'da açılır; dönen anahtar göreve yazılır, böylece
 * sonraki "Jira'dan geçmiş" aktarımı aynı kaydı günceller. Tür, önem, birim
 * (bileşen) ve tahmin Jira'daki adlarla sunucuda eşlenir; sorumlu gönderilmez.
 * Jira adresi ve jetonu yalnız sunucudadır; kayıt açma sunucuda ayrıca
 * açılmalıdır (JIRA_ALLOW_CREATE).
 */

interface Props {
    project: Project;
    /** Önceden seçili görevler (yeni kayıt, aktarılan sürüm planı) */
    preselect?: string[];
    onLinked: (key: string, links: Record<string, string>) => void;
    onClose: () => void;
}

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{1,19}$/;
const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

type Phase =
    | { kind: 'select' }
    | { kind: 'confirm' }
    | { kind: 'sending'; done: number; total: number }
    | { kind: 'done'; results: JiraCreateResult[]; stopped?: string };

const JiraExport: React.FC<Props> = ({ project, preselect = [], onLinked, onClose }) => {
    const [health, setHealth] = useState<IntegrationHealth | null>(null);
    const [key, setKey] = useState(project.jiraProjectKey || '');
    const candidates = useMemo<Task[]>(() => jiraExportCandidates(project), [project]);
    const [selected, setSelected] = useState<Set<string>>(() => new Set(preselect));
    const [phase, setPhase] = useState<Phase>({ kind: 'select' });
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        const c = new AbortController();
        fetchIntegrationHealth(c.signal).then(setHealth).catch(() => undefined);
        return () => { alive.current = false; c.abort(); };
    }, []);
    // Önceden seçilenler sonradan gelebilir (yeni kayıt gönderildikten hemen sonra)
    const preKey = preselect.join(',');
    useEffect(() => { if (preKey) setSelected(new Set(preKey.split(','))); }, [preKey]);

    const chosen = candidates.filter(t => selected.has(t.id));
    const validKey = KEY_RE.test(key.trim());
    const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const allOn = candidates.length > 0 && candidates.every(t => selected.has(t.id));

    const send = async () => {
        if (!health || !validKey || !chosen.length) return;
        const k = key.trim().toUpperCase();
        const results: JiraCreateResult[] = [];
        let stopped: string | undefined;
        setPhase({ kind: 'sending', done: 0, total: chosen.length });
        // Parça parça: her parçanın anahtarları hemen yazılır (sonraki parça hata verse de çift kayıt olmaz)
        for (const part of chunk<Task>(chosen, JIRA_BATCH)) {
            try {
                const r = await createJiraIssues(k, part.map(jiraInputOf), health.authMode);
                results.push(...r);
                const { links } = summarizeJiraResults(r);
                if (Object.keys(links).length) onLinked(k, links);
            } catch (e) {
                // Yanıt gelmediyse bu parçadaki kayıtlar Jira'da açılmış olabilir
                stopped = `${e instanceof Error ? e.message : String(e)} Son gönderilen ${part.length} kaydın (${part.map(t => `"${t.name}"`).join(', ')}) Jira'da açılıp açılmadığını denetleyin; açıldıysa yeniden göndermeyin.`;
                break;
            }
            if (alive.current) setPhase({ kind: 'sending', done: results.length, total: chosen.length });
        }
        // Açılanlar listeden düşer; açılamayan ve gönderilemeyenler seçili kalır
        const opened = new Set(results.filter(r => r.key).map(r => r.ref));
        if (alive.current) { setPhase({ kind: 'done', results, stopped }); setSelected(new Set(chosen.map(t => t.id).filter(id => !opened.has(id)))); }
    };

    const summary = phase.kind === 'done' ? summarizeJiraResults(phase.results) : null;
    const names = useMemo<Map<string, string>>(() => new Map(project.tasks.map(t => [t.id, t.name])), [project.tasks]);
    const busy = phase.kind === 'sending';
    const ready = !!health?.jira && !!health.jiraCreate;

    return (
        <section aria-labelledby="jx-title" className="m-surface rounded-2xl p-5 flex flex-col gap-3.5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 id="jx-title" className="m-0 text-[17px] font-semibold m-text">Jira'ya gönder</h3>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Seçilen kayıtlar Jira'da açılır ve Jira anahtarı göreve yazılır. Tür, önem, birim (Jira'da aynı adlı bileşen varsa) ve tahmin (ilk tahmin) gönderilir; sorumlu gönderilmez, atama Jira'da yapılır.</p>
                </div>
                <button type="button" className="m-icon-btn" aria-label="Kapat" disabled={busy} onClick={onClose}><Icon name="x" size={18} /></button>
            </div>

            {!health ? (
                <p className="m-0 text-[14px] m-text-3" role="status">Bağlantı denetleniyor…</p>
            ) : !ready ? (
                <p className="m-0 rounded-xl m-fill-2 p-3.5 text-[14px] m-text-2">
                    {health.unreachable ? 'Entegrasyon sunucusuna ulaşılamadı.'
                        : !health.jira ? 'Jira bağlantısı sunucuda yapılandırılmadı (JIRA_BASE_URL ve JIRA_TOKEN ya da JIRA_EMAIL + JIRA_API_TOKEN).'
                            : "Jira'da kayıt açma sunucuda kapalı. Yönetici JIRA_ALLOW_CREATE=1 ayarını ekleyince açılır; Jira jetonunun projede kayıt açma izni olmalı."}
                </p>
            ) : (
                <>
                    <div className="flex flex-wrap items-end gap-3">
                        <Field label="Jira proje anahtarı" htmlFor="jx-key">
                            <input id="jx-key" className="m-input uppercase !w-[160px]" value={key} maxLength={20} placeholder="Ör. MKS" disabled={busy} onChange={e => setKey(e.target.value.replace(/\s/g, ''))} aria-invalid={!!key && !validKey} />
                        </Field>
                        <span className="text-[14px] m-text-3 min-h-[44px] inline-flex items-center">{num(candidates.length)} kaydın Jira anahtarı yok · {num(chosen.length)} seçili</span>
                    </div>

                    {candidates.length === 0 ? (
                        <p className="m-0 text-[15px] m-text-2">Jira'ya gönderilecek kayıt yok: açık kayıtların hepsinin Jira anahtarı var.</p>
                    ) : (
                        <div className="relative overflow-x-auto -mx-1 max-h-[360px] overflow-y-auto">
                            <table className="w-full min-w-[560px] text-[14px] border-collapse">
                                <thead><tr className="text-left m-text-3 text-[13px]">
                                    <th className="font-semibold py-2 px-1 w-8">
                                        <input type="checkbox" aria-label="Tümünü seç" checked={allOn} disabled={busy} onChange={() => setSelected(allOn ? new Set() : new Set(candidates.map(t => t.id)))} />
                                    </th>
                                    <th className="font-semibold py-2 px-1">Kayıt</th><th className="font-semibold py-2 px-1">Tür</th><th className="font-semibold py-2 px-1">Önem</th>
                                    <th className="font-semibold py-2 px-1">Birim</th><th className="font-semibold py-2 px-1 text-right">Tahmin</th>
                                </tr></thead>
                                <tbody>{candidates.map((t, i) => { const sep = rowSep(i); const d = pertDays(t); return (
                                    <tr key={t.id} className={sep.className} style={sep.style}>
                                        <td className="py-2 px-1"><input type="checkbox" aria-label={`${t.name} seç`} checked={selected.has(t.id)} disabled={busy} onChange={() => toggle(t.id)} /></td>
                                        <td className="py-2 px-1 m-text max-w-[320px] truncate">{t.name}</td>
                                        <td className="py-2 px-1 m-text-2 whitespace-nowrap">{t.issueType ? ISSUE_TYPE_LABELS[t.issueType] : '—'}</td>
                                        <td className="py-2 px-1 m-text-2 whitespace-nowrap">{PRIORITY_META[t.priority].label}</td>
                                        <td className="py-2 px-1 m-text-2 whitespace-nowrap">{t.unit || '—'}</td>
                                        <td className="py-2 px-1 text-right m-tabular whitespace-nowrap">{d ? `${num(d)} gün` : '—'}</td>
                                    </tr>
                                ); })}</tbody>
                            </table>
                        </div>
                    )}

                    {phase.kind === 'confirm' ? (
                        <div className="rounded-xl p-3.5 flex flex-col gap-2.5" style={{ background: 'var(--m-accent-tint)' }} role="alertdialog" aria-labelledby="jx-confirm">
                            <p id="jx-confirm" className="m-0 text-[15px] m-text"><b>{num(chosen.length)}</b> kayıt Jira'daki <b>{key.trim().toUpperCase()}</b> projesinde açılacak. Jira'da açılan kayıt buradan geri alınamaz.</p>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className="m-btn m-btn-primary" onClick={send}><Icon name="send" size={18} />Onayla ve gönder</button>
                                <button type="button" className="m-btn m-btn-plain" onClick={() => setPhase({ kind: 'select' })}>Vazgeç</button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" className="m-btn m-btn-primary" disabled={!validKey || !chosen.length || busy} onClick={() => setPhase({ kind: 'confirm' })}>
                                <Icon name="send" size={18} />{busy ? `Gönderiliyor… ${num(phase.done)} / ${num(phase.total)}` : `Jira'da aç${chosen.length ? ` (${num(chosen.length)} kayıt)` : ''}`}
                            </button>
                            {!validKey && key && <span className="text-[13px] m-ink-bad">Proje anahtarı harf ile başlamalı (ör. MKS).</span>}
                        </div>
                    )}
                </>
            )}

            {phase.kind === 'done' && summary && (
                <div className="flex flex-col gap-1.5 text-[14px]" aria-live="polite">
                    {summary.created > 0 && (
                        <p role="status" className="m-0 m-ink-ok flex items-start gap-1.5"><Icon name="check" size={18} className="mt-0.5 shrink-0" />
                            {num(summary.created)} kayıt Jira'da açıldı: {Object.values(summary.links).slice(0, 8).join(', ')}{summary.created > 8 ? '…' : ''}. Anahtarlar görevlere yazıldı.
                        </p>
                    )}
                    {summary.dropped.length > 0 && (
                        <p className="m-0 m-text-3">Jira ekranında olmadığı için gönderilmeyen alanlar: {summary.dropped.map(f => JIRA_FIELD_LABELS[f] || f).join(', ')}.</p>
                    )}
                    {summary.failed.length > 0 && (
                        <div role="alert" className="flex flex-col gap-1">
                            <p className="m-0 m-ink-bad">{num(summary.failed.length)} kayıt açılamadı; seçili kaldı, düzeltip yeniden gönderebilirsiniz:</p>
                            <ul className="m-0 pl-5 m-text-2">{summary.failed.slice(0, 6).map(f => <li key={f.ref}>{names.get(f.ref) || f.ref}: {f.error}</li>)}</ul>
                        </div>
                    )}
                    {phase.stopped && <p role="alert" className="m-0 m-ink-bad">Gönderim durdu: {phase.stopped}</p>}
                </div>
            )}
        </section>
    );
};

export default JiraExport;
