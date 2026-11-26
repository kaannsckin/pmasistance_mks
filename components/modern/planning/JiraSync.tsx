import React, { useEffect, useMemo, useRef, useState } from 'react';
import { JiraSyncDirection, JiraSyncFieldId, JiraSyncSettings, Project } from '../../../types';
import { DayRange, formatRange } from '../../../utils/calendarRange';
import { fetchIntegrationHealth, fetchJiraMeta, fetchJiraSyncPage, IntegrationHealth, JiraIssueRecord, JiraMeta, updateJiraIssue } from '../../../utils/integrations';
import { JiraImportOptions } from '../../../utils/planning/jiraImport';
import { AUTO_SYNC_OPTIONS, hasSyncWork, JIRA_SYNC_EVENT, JiraPushOutcome, linkedSyncKeys, parseLabels, readSyncState, runFullSync, sourceLabel, sourceOf, writeSyncState } from '../../../utils/planning/jiraSync';
import { DIRECTION_LABEL, EXCEL_TRACKING_FIELDS, fieldPolicy, JIRA_SYNC_FIELDS } from '../../../utils/planning/jiraFieldSync';
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
    period?: DayRange;
    onSaveSettings: (settings: JiraSyncSettings) => void;
    onApply: (issues: JiraIssueRecord[], opts: JiraImportOptions, addNew: boolean, label: string, pushed?: JiraPushOutcome, settings?: JiraSyncSettings) => void;
    onClose: () => void;
}

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{1,19}$/;
const LABEL_RE = /^[^\s"\\,()]{1,100}$/;
const num = (v: number) => v.toLocaleString('tr-TR');

const JiraSync: React.FC<Props> = ({ project, period, onSaveSettings, onApply, onClose }) => {
    const saved = project.jiraSync;
    const [health, setHealth] = useState<IntegrationHealth | null>(null);
    const [meta, setMeta] = useState<JiraMeta | null>(null);
    const [metaError, setMetaError] = useState<string | null>(null);
    const [projectKey, setProjectKey] = useState(saved?.projectKey || project.jiraProjectKey || '');
    const [labels, setLabels] = useState((saved?.labels || []).join(', '));
    const [filterId, setFilterId] = useState(saved?.filterId || '');
    const [discover, setDiscover] = useState(!!saved?.discover);
    const [autoMinutes, setAutoMinutes] = useState(saved?.autoMinutes || 0);
    // Alan seçimi: kayıtlı ayar yoksa "tümü Jira'dan" (eski davranış) gösterilir
    const [fields, setFields] = useState<Record<JiraSyncFieldId, JiraSyncDirection> | null>(saved?.fields ? fieldPolicy(saved) : null);
    const [autoPeople, setAutoPeople] = useState(!!saved?.autoPeople);
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
        ...(fields ? { fields } : {}),
        ...(autoPeople ? { autoPeople } : {}),
    }), [projectKey, labelList, filterId, filterName, discover, autoMinutes, fields, autoPeople, saved]);
    const shownFields = fields || fieldPolicy(undefined);
    const setField = (id: JiraSyncFieldId, d: JiraSyncDirection) => setFields({ ...shownFields, [id]: d });
    const invalid = (!!projectKey.trim() && !KEY_RE.test(projectKey.trim())) || labelList.some(l => !LABEL_RE.test(l)) || (!!filterId.trim() && !/^\d{1,12}$/.test(filterId.trim()));
    const needsSource = (!!period || discover) && !sourceOf(draft);
    // Son eşitleme zamanı ayar değil: karşılaştırmaya girmez
    const dirty = useMemo(() => {
        const { lastSyncAt: _at, ...rest } = saved || { discover: false, autoMinutes: 0 };
        return JSON.stringify(draft) !== JSON.stringify(rest);
    }, [draft, saved]);
    const linked = useMemo(() => linkedSyncKeys(project.tasks, draft).length, [project.tasks, draft]);
    const candidate = { ...project, jiraSync: draft };
    const canRun = !!health?.jira && !invalid && !needsSource && busy === null && (!!period || hasSyncWork(candidate));

    const run = async () => {
        if (!health || !canRun) return;
        if (dirty && !period) onSaveSettings(draft);
        setError(null);
        const c = new AbortController();
        abort.current = c;
        setBusy(0);
        try {
            const update = health.jiraUpdate ? (key: string, changes: Parameters<typeof updateJiraIssue>[1]) => updateJiraIssue(key, changes, health.authMode, c.signal) : null;
            const r = await runFullSync(candidate, o => fetchJiraSyncPage(o, health.authMode, c.signal), update, setBusy, period);
            const label = period ? formatRange(period) : 'elle';
            if (r.shouldApply) onApply(r.issues, r.opts, r.addNew, label, r.pushed, period ? draft : undefined);
            writeSyncState(project.id, { at: new Date().toISOString(), ok: true, text: period ? `${label} · ${r.text}` : r.text });
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
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">{period
                        ? <><b>{formatRange(period)}</b> · Seçili kaynakta Jira termin tarihi aralığa giren kayıtlar, seçtiğiniz alanlara göre eşitlenir.</>
                        : "Jira anahtarı olan kayıtlar, seçtiğiniz alanlarda Jira'dan alınır veya Jira'ya yazılır. Yeni kayıtlar seçtiğiniz proje, etiket ya da kayıtlı filtreden gelir."}</p>
                </div>
                <button type="button" className="m-icon-btn" aria-label="Kapat" onClick={() => { abort.current?.abort(); onClose(); }}><Icon name="x" size={18} /></button>
            </div>

            {health && !health.jira ? (
                <p className="m-0 rounded-xl m-fill-2 p-3.5 text-[14px] m-text-2">{health.unreachable ? 'Entegrasyon sunucusuna ulaşılamadı.' : 'Jira bağlantısı sunucuda yapılandırılmadı: JIRA_BASE_URL ve JIRA_TOKEN (kişisel erişim jetonu — PAT) tanımlanmalı.'}</p>
            ) : (
                <>
                    <p className="m-0 text-[14px] m-text-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {meta ? <span className="m-ink-ok flex items-center gap-1"><Icon name="check" size={16} />Bağlı: {meta.user || 'Jira'}</span> : metaError ? <span className="m-ink-bad">{metaError}</span> : <span className="m-text-3">Bağlantı denetleniyor…</span>}
                        <span>Eşitlenecek bağlı kayıt: <strong className="m-tabular">{num(linked)}</strong></span>
                        {health && <span className="m-text-3">Jira'ya yazma: {health.jiraUpdate ? 'açık' : 'kapalı (JIRA_ALLOW_UPDATE)'}</span>}
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
                            {period ? 'Aralıktaki yeni kayıtları da ekle' : 'Kaynaktaki yeni açık kayıtları da ekle'}
                        </label>
                        {!period && <Field label="Otomatik eşitleme" htmlFor="js-auto">
                            <select id="js-auto" className="m-input" value={autoMinutes} disabled={busy !== null} onChange={e => setAutoMinutes(Number(e.target.value))}>
                                {AUTO_SYNC_OPTIONS.map(m => <option key={m} value={m}>{m ? `${m} dakikada bir` : 'Kapalı (yalnız elle)'}</option>)}
                            </select>
                        </Field>}
                    </div>
                    <fieldset className="m-0 p-0 border-0 flex flex-col gap-2">
                        <legend className="text-[15px] font-semibold m-text mb-1">Alanlar ve yön</legend>
                        <p className="m-0 text-[13px] m-text-3">
                            Her alan için yön seçin. <strong>Çift yönlü</strong>: son eşitlemeden beri hangi taraf değiştiyse o kazanır; iki taraf da değiştiyse Jira esas alınır ve çakışma bildirilir.
                            Uygulamadan Jira'ya durum, termin, öncelik, başlık ve kalan süre yazılabilir.
                            {!fields && ' Şu an eski davranış geçerli: tüm alanlar Jira\'dan alınır.'}
                        </p>
                        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                            {JIRA_SYNC_FIELDS.map(f => (
                                <label key={f.id} className="flex items-center justify-between gap-3 text-[14px] m-text min-w-0" title={f.hint}>
                                    <span className="truncate">{f.label}</span>
                                    <select className="m-input max-w-[190px]" value={shownFields[f.id]} disabled={busy !== null} onChange={e => setField(f.id, e.target.value as JiraSyncDirection)}>
                                        {(f.pushable ? ['off', 'pull', 'push', 'both'] as const : ['off', 'pull'] as const).map(d => <option key={d} value={d}>{DIRECTION_LABEL[d]}</option>)}
                                    </select>
                                </label>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" className="m-btn m-btn-gray" disabled={busy !== null} onClick={() => setFields({ ...EXCEL_TRACKING_FIELDS })}>Excel takibi önerisi</button>
                            {fields && <button type="button" className="m-btn m-btn-plain" disabled={busy !== null} onClick={() => setFields(null)}>Eski davranışa dön (tümü Jira'dan)</button>}
                            <span className="text-[13px] m-text-3">Öneri: durum, atanan, termin, harcanan süre ve sürüm Jira'dan; başlık, not, etiket ve öncelik Excel'de kalır.</span>
                        </div>
                        <label className="flex items-center gap-2.5 text-[15px] m-text min-h-[40px] cursor-pointer">
                            <input type="checkbox" className="w-4 h-4" checked={autoPeople} disabled={busy !== null} onChange={e => setAutoPeople(e.target.checked)} />
                            Jira'daki atanan kişileri Veri Havuzu'na ve proje ekibine otomatik ekle
                        </label>
                        {fields && Object.values(fields).some(d => d === 'push' || d === 'both') && health && !health.jiraUpdate && (
                            <p role="alert" className="m-0 text-[14px] m-ink-warn">Jira'ya yazan alan seçtiniz ama sunucuda JIRA_ALLOW_UPDATE kapalı; bu alanlar yazılmaz, yalnız bekleyen olarak bildirilir.</p>
                        )}
                    </fieldset>
                    {invalid && <p role="alert" className="m-0 text-[14px] m-ink-bad">Proje anahtarı, etiket ya da filtre numarası geçersiz.</p>}
                    {needsSource && <p role="alert" className="m-0 text-[14px] m-ink-warn">{period ? 'Aralığı eşitlemek için' : 'Yeni kayıt eklemek için'} proje, etiket ya da kayıtlı filtre seçin.</p>}
                    {!period && !needsSource && !invalid && !linked && !discover && <p className="m-0 text-[14px] m-text-3">Bu projede eşitlenecek Jira anahtarlı kayıt yok; kaynak seçip "yeni açık kayıtları da ekle"yi açabilirsiniz.</p>}
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" className="m-btn m-btn-primary" disabled={!canRun} onClick={run}>
                            <Icon name="refresh" size={18} />{busy !== null ? `Eşitleniyor… ${num(busy)}` : period ? 'Bu aralığı eşitle' : 'Şimdi eşitle'}
                        </button>
                        {busy !== null && <button type="button" className="m-btn m-btn-plain" onClick={() => abort.current?.abort()}>Durdur</button>}
                        {!period && <button type="button" className="m-btn m-btn-gray" disabled={!dirty || invalid || needsSource || busy !== null} onClick={() => onSaveSettings(draft)}>{dirty ? 'Ayarı kaydet' : 'Ayar kayıtlı'}</button>}
                        {sourceOf(draft) && <span className="text-[13px] m-text-3">Kaynak · {sourceLabel(draft)}{period ? '' : ' · yalnız açık kayıtlar'}</span>}
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
