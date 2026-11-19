import React, { useEffect, useMemo, useRef, useState } from 'react';
import { JiraSyncSettings, Project } from '../../../types';
import { fetchIntegrationHealth, fetchJiraMeta, fetchJiraSyncPage, IntegrationHealth, JiraIssueRecord, JiraMeta } from '../../../utils/integrations';
import { JiraImportOptions } from '../../../utils/planning/jiraImport';
import { AUTO_SYNC_OPTIONS, hasSyncWork, JIRA_SYNC_EVENT, linkedOpenKeys, parseLabels, readSyncState, runProjectSync, sourceLabel, sourceOf, writeSyncState } from '../../../utils/planning/jiraSync';
import { relativeTime } from '../../../utils/recentChanges';
import { Icon } from '../icons';
import { Field } from '../ui';

/**
 * Jira canlı eşitleme (proje yöneticisi): uygulamada Jira anahtarı olan açık
 * kayıtlar Jira'daki güncel hâliyle yenilenir; istenirse seçili kaynaktaki
 * (proje / etiket / kayıtlı filtre) yeni açık kayıtlar da eklenir. Elle ya da
 * ayarlanan aralıkla otomatik çalışır. Tüm Jira taranmaz; jeton yalnız sunucudadır.
 */

interface Props {
    project: Project;
    onSaveSettings: (settings: JiraSyncSettings) => void;
    onApply: (issues: JiraIssueRecord[], opts: JiraImportOptions, addNew: boolean, label: string) => void;
    onClose: () => void;
}

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{1,19}$/;
const LABEL_RE = /^[^\s"\\,()]{1,100}$/;
const num = (v: number) => v.toLocaleString('tr-TR');

const JiraSync: React.FC<Props> = ({ project, onSaveSettings, onApply, onClose }) => {
    const saved = project.jiraSync;
    const [health, setHealth] = useState<IntegrationHealth | null>(null);
    const [meta, setMeta] = useState<JiraMeta | null>(null);
    const [metaError, setMetaError] = useState<string | null>(null);
    const [projectKey, setProjectKey] = useState(saved?.projectKey || project.jiraProjectKey || '');
    const [labels, setLabels] = useState((saved?.labels || []).join(', '));
    const [filterId, setFilterId] = useState(saved?.filterId || '');
    const [discover, setDiscover] = useState(!!saved?.discover);
    const [autoMinutes, setAutoMinutes] = useState(saved?.autoMinutes || 0);
    const [busy, setBusy] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [state, setState] = useState(() => readSyncState(project.id));
    const abort = useRef<AbortController | null>(null);

    useEffect(() => {
        const c = new AbortController();
        fetchIntegrationHealth(c.signal).then(h => {
            setHealth(h);
            if (h.jira) fetchJiraMeta(h.authMode, c.signal).then(setMeta).catch(e => { if ((e as Error)?.name !== 'AbortError') setMetaError(e instanceof Error ? e.message : String(e)); });
        }).catch(() => undefined);
        const onState = () => setState(readSyncState(project.id));
        window.addEventListener(JIRA_SYNC_EVENT, onState);
        return () => { c.abort(); abort.current?.abort(); window.removeEventListener(JIRA_SYNC_EVENT, onState); };
    }, [project.id]);

    const labelList = useMemo(() => parseLabels(labels), [labels]);
    const filterName = meta?.filters.find(f => f.id === filterId)?.name;
    const draft: JiraSyncSettings = useMemo(() => ({
        ...(projectKey.trim() ? { projectKey: projectKey.trim().toUpperCase() } : {}),
        ...(labelList.length ? { labels: labelList } : {}),
        ...(filterId.trim() ? { filterId: filterId.trim(), ...(filterName ? { filterName } : saved?.filterId === filterId.trim() && saved.filterName ? { filterName: saved.filterName } : {}) } : {}),
        discover,
        autoMinutes,
    }), [projectKey, labelList, filterId, filterName, discover, autoMinutes, saved]);
    const invalid = (!!projectKey.trim() && !KEY_RE.test(projectKey.trim())) || labelList.some(l => !LABEL_RE.test(l)) || (!!filterId.trim() && !/^\d{1,12}$/.test(filterId.trim()));
    const needsSource = discover && !sourceOf(draft);
    const dirty = JSON.stringify(draft) !== JSON.stringify(saved || { discover: false, autoMinutes: 0 });
    const linked = useMemo(() => linkedOpenKeys(project.tasks).length, [project.tasks]);
    const candidate = { ...project, jiraSync: draft };
    const canRun = !!health?.jira && !invalid && !needsSource && busy === null && hasSyncWork(candidate);

    const run = async () => {
        if (!health || !canRun) return;
        if (dirty) onSaveSettings(draft);
        setError(null);
        const c = new AbortController();
        abort.current = c;
        setBusy(0);
        try {
            const r = await runProjectSync(candidate, o => fetchJiraSyncPage(o, health.authMode, c.signal), setBusy);
            if (r.preview.added || r.preview.updated) onApply(r.fetched.issues, r.opts, r.addNew, 'elle');
            writeSyncState(project.id, { at: new Date().toISOString(), ok: true, text: r.text });
        } catch (e) {
            if ((e as Error)?.name !== 'AbortError') setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(null);
        }
    };

    return (
        <section aria-labelledby="js-title" className="m-surface rounded-2xl p-5 flex flex-col gap-3.5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 id="js-title" className="m-0 text-[17px] font-semibold m-text">Jira eşitleme</h3>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Uygulamada Jira anahtarı olan açık kayıtlar Jira'daki güncel hâliyle yenilenir (kapananlar kapanır). Tüm Jira taranmaz: yeni kayıt yalnız seçtiğiniz proje, etiket ya da kayıtlı filtreden gelir. Jeton yalnız sunucudadır.</p>
                </div>
                <button type="button" className="m-icon-btn" aria-label="Kapat" onClick={() => { abort.current?.abort(); onClose(); }}><Icon name="x" size={18} /></button>
            </div>

            {health && !health.jira ? (
                <p className="m-0 rounded-xl m-fill-2 p-3.5 text-[14px] m-text-2">{health.unreachable ? 'Entegrasyon sunucusuna ulaşılamadı.' : 'Jira bağlantısı sunucuda yapılandırılmadı: JIRA_BASE_URL ve JIRA_TOKEN (kişisel erişim jetonu — PAT) tanımlanmalı.'}</p>
            ) : (
                <>
                    <p className="m-0 text-[14px] m-text-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {meta ? <span className="m-ink-ok flex items-center gap-1"><Icon name="check" size={16} />Bağlı: {meta.user || 'Jira'}</span> : metaError ? <span className="m-ink-bad">{metaError}</span> : <span className="m-text-3">Bağlantı denetleniyor…</span>}
                        <span>Bağlı açık kayıt: <strong className="m-tabular">{num(linked)}</strong></span>
                        {health && <span className="m-text-3">Jira'ya yazma: {health.jiraUpdate ? 'açık (görev ayrıntısından)' : 'kapalı (JIRA_ALLOW_UPDATE)'}</span>}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <Field label="Proje" htmlFor="js-project">
                            {meta?.projects.length ? (
                                <select id="js-project" className="m-input" value={projectKey.toUpperCase()} disabled={busy !== null} onChange={e => setProjectKey(e.target.value)}>
                                    <option value="">— seçilmedi —</option>
                                    {projectKey && !meta.projects.some(p => p.key === projectKey.toUpperCase()) && <option value={projectKey.toUpperCase()}>{projectKey.toUpperCase()}</option>}
                                    {meta.projects.map(p => <option key={p.key} value={p.key}>{p.key} · {p.name}</option>)}
                                </select>
                            ) : (
                                <input id="js-project" className="m-input uppercase" value={projectKey} maxLength={20} placeholder="Ör. MKS" disabled={busy !== null} onChange={e => setProjectKey(e.target.value.replace(/\s/g, ''))} />
                            )}
                        </Field>
                        <Field label="Etiket(ler)" htmlFor="js-labels" hint="Virgülle ayırın; herhangi biri eşleşir">
                            <input id="js-labels" className="m-input" value={labels} placeholder="Ör. mks-takip" disabled={busy !== null} onChange={e => setLabels(e.target.value)} />
                        </Field>
                        <Field label="Kayıtlı filtre" htmlFor="js-filter" hint={meta?.filters.length ? "Jira'da sık kullanılanlara eklediğiniz filtreler" : 'Filtre numarası (Jira adresindeki filter=…)'}>
                            {meta?.filters.length ? (
                                <select id="js-filter" className="m-input" value={filterId} disabled={busy !== null} onChange={e => setFilterId(e.target.value)}>
                                    <option value="">— seçilmedi —</option>
                                    {filterId && !meta.filters.some(f => f.id === filterId) && <option value={filterId}>{saved?.filterName || `#${filterId}`}</option>}
                                    {meta.filters.map(f => <option key={f.id} value={f.id} title={f.jql}>{f.name}</option>)}
                                </select>
                            ) : (
                                <input id="js-filter" className="m-input" inputMode="numeric" value={filterId} placeholder="Ör. 12345" disabled={busy !== null} onChange={e => setFilterId(e.target.value.replace(/\D/g, ''))} />
                            )}
                        </Field>
                    </div>
                    <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
                        <label className="flex items-center gap-2.5 text-[15px] m-text min-h-[40px] cursor-pointer">
                            <input type="checkbox" className="w-4 h-4" checked={discover} disabled={busy !== null} onChange={e => setDiscover(e.target.checked)} />
                            Kaynaktaki yeni açık kayıtları da ekle
                        </label>
                        <Field label="Otomatik eşitleme" htmlFor="js-auto">
                            <select id="js-auto" className="m-input" value={autoMinutes} disabled={busy !== null} onChange={e => setAutoMinutes(Number(e.target.value))}>
                                {AUTO_SYNC_OPTIONS.map(m => <option key={m} value={m}>{m ? `${m} dakikada bir` : 'Kapalı (yalnız elle)'}</option>)}
                            </select>
                        </Field>
                    </div>
                    {invalid && <p role="alert" className="m-0 text-[14px] m-ink-bad">Proje anahtarı, etiket ya da filtre numarası geçersiz.</p>}
                    {needsSource && <p role="alert" className="m-0 text-[14px] m-ink-warn">Yeni kayıt eklemek için proje, etiket ya da kayıtlı filtre seçin.</p>}
                    {!needsSource && !invalid && !linked && !discover && <p className="m-0 text-[14px] m-text-3">Bu projede Jira anahtarı olan açık kayıt yok; kaynak seçip "yeni açık kayıtları da ekle"yi açabilirsiniz.</p>}
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" className="m-btn m-btn-primary" disabled={!canRun} onClick={run}>
                            <Icon name="refresh" size={18} />{busy !== null ? `Eşitleniyor… ${num(busy)}` : 'Şimdi eşitle'}
                        </button>
                        {busy !== null && <button type="button" className="m-btn m-btn-plain" onClick={() => abort.current?.abort()}>Durdur</button>}
                        <button type="button" className="m-btn m-btn-gray" disabled={!dirty || invalid || needsSource || busy !== null} onClick={() => onSaveSettings(draft)}>{dirty ? 'Ayarı kaydet' : 'Ayar kayıtlı'}</button>
                        {sourceOf(draft) && <span className="text-[13px] m-text-3">Kaynak: {sourceLabel(draft)} · yalnız açık kayıtlar</span>}
                    </div>
                    {error && <p role="alert" className="m-0 text-[14px] m-ink-bad">{error}</p>}
                    {state && (
                        <p role="status" className={`m-0 text-[14px] flex items-start gap-1.5 ${state.ok ? 'm-text-2' : 'm-ink-bad'}`}>
                            <Icon name={state.ok ? 'clock' : 'alert'} size={16} className="mt-0.5 shrink-0" />
                            <span>Son eşitleme {relativeTime(state.at)}: {state.text}{saved?.autoMinutes ? ` · otomatik: ${saved.autoMinutes} dk (uygulama açıkken)` : ''}</span>
                        </p>
                    )}
                </>
            )}
        </section>
    );
};

export default JiraSync;
