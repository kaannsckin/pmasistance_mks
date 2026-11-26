import React, { useEffect, useMemo, useState } from 'react';
import { Person, Project, ProjectRoleDef, ReportBlockKey, ReportSchedule } from '../../types';
import { fetchIntegrationHealth, IntegrationHealth } from '../../utils/integrations';
import {
    BLOCK_LABELS, buildReport, CADENCE_LABELS, DEFAULT_BLOCKS, describeSchedule, newScheduleId, previousSnapshot, reportText, scheduleProblems, WEEKDAYS_TR,
} from '../../utils/reportAutomation';
import { Icon } from './icons';
import { Sheet, ToggleSwitch } from './ui';

/**
 * Rapor otomasyonu: proje ilerlemesini seçilen periyotta Teams, Slack, Notion
 * ve e-postaya gönderir (ilerleme %, günlük fark, açılan hata, gecikme, sprint,
 * taşlar…). Sunucu zamanlayıcısı yapılandırılmışsa uygulama kapalıyken de
 * gider; değilse uygulama açıkken tarayıcı gönderir.
 */

const BLOCKS = Object.keys(BLOCK_LABELS) as ReportBlockKey[];

const blank = (withPoc = false): ReportSchedule => {
    const now = new Date().toISOString();
    // PoC test listesi olan projede PoC bölümü ilerlemenin hemen ardından gelir
    const blocks: ReportBlockKey[] = withPoc ? ['progress', 'poc', ...DEFAULT_BLOCKS.filter(b => b !== 'progress')] : [...DEFAULT_BLOCKS];
    return { id: newScheduleId(), name: 'Günlük ilerleme raporu', enabled: true, cadence: 'weekdays', hour: 9, channels: { teams: true }, blocks, createdAt: now, updatedAt: now };
};

const ReportSchedulesSheet: React.FC<{
    project: Project;
    people: Person[];
    roleDefs: ProjectRoleDef[];
    canEdit: boolean;
    onClose: () => void;
    onSave: (schedules: ReportSchedule[], summary: string) => void;
    /** Şimdi gönder: sonuç metni döner */
    onSendNow: (s: ReportSchedule) => Promise<string>;
}> = ({ project, people, roleDefs, canEdit, onClose, onSave, onSendNow }) => {
    const [list, setList] = useState<ReportSchedule[]>(() => JSON.parse(JSON.stringify(project.reportSchedules || [])));
    const [editing, setEditing] = useState<ReportSchedule | null>(null);
    const [health, setHealth] = useState<IntegrationHealth | null>(null);
    const [summary, setSummary] = useState<string[]>([]);
    useEffect(() => { fetchIntegrationHealth().then(setHealth).catch(() => setHealth(null)); }, []);
    const dirty = JSON.stringify(list) !== JSON.stringify(project.reportSchedules || []);

    const commit = (s: ReportSchedule) => {
        const exists = list.some(x => x.id === s.id);
        setList(l => (exists ? l.map(x => (x.id === s.id ? { ...s, updatedAt: new Date().toISOString() } : x)) : [...l, s]));
        setSummary(x => [...x, `${exists ? 'güncellendi' : 'eklendi'}: ${s.name}`]);
        setEditing(null);
    };

    const runner = !health ? null : health.reportCron
        ? { tone: 'm-tone-ok', text: 'Sunucu zamanlayıcısı açık: raporlar uygulama kapalıyken de gider (günlük çalışmada sabah 08:00; saatlik cron ayarlıysa raporun saatinde).' }
        : { tone: 'm-tone-warn', text: 'Sunucu zamanlayıcısı kapalı: raporu, saati gelince uygulama açık olan bir proje üyesinin tarayıcısı gönderir. Kapalıyken de gitmesi için sunucuda CRON_SECRET ve SUPABASE_SERVICE_ROLE_KEY tanımlayın (bulut kullanılıyorsa).' };

    return (
        <Sheet xxl title={`Rapor otomasyonu: ${project.name}`}
            subtitle="Proje ilerlemesini belirlediğiniz periyotta Teams, Slack, Notion ya da e-postaya gönderin: ilerleme %, önceki rapora göre fark, açılan/kapanan hata, geciken iş, sprint ve taş durumu."
            onClose={onClose}
            footer={editing ? undefined : (
                <>
                    <span className="flex-1 text-[13px] m-text-3">{summary.length ? `Bekleyen: ${summary.join('; ')}` : 'Kanal adresleri ve jetonlar yönetici konsolunda (Entegrasyonlar) tutulur.'}</span>
                    <button type="button" className="m-btn m-btn-gray" onClick={onClose}>{dirty ? 'Vazgeç' : 'Kapat'}</button>
                    {canEdit && <button type="button" className="m-btn m-btn-primary" disabled={!dirty} onClick={() => onSave(list, summary.join('; ') || 'raporlar güncellendi')}><Icon name="check" size={16} />Kaydet</button>}
                </>
            )}>
            {runner && <div className={`rounded-xl px-3 py-2 text-[13.5px] ${runner.tone}`}>{runner.text}</div>}
            {editing ? (
                <ScheduleEditor draft={editing} project={project} people={people} roleDefs={roleDefs} health={health} canEdit={canEdit}
                    onCancel={() => setEditing(null)} onSave={commit} onSendNow={onSendNow} />
            ) : (
                <div className="flex flex-col gap-3">
                    {list.length === 0 && (
                        <div className="rounded-2xl m-fill-2 px-4 py-6 text-center flex flex-col items-center gap-1.5">
                            <span className="text-[16px] font-semibold m-text">Henüz zamanlanmış rapor yok</span>
                            <span className="text-[14px] m-text-3 max-w-[60ch]">Örn. hafta içi her sabah 09:00'da Teams kanalına günlük ilerleme ve açılan hata sayısı.</span>
                        </div>
                    )}
                    {list.map(s => (
                        <div key={s.id} className="m-surface rounded-2xl px-4 py-3 flex items-start gap-3 border m-sep" style={{ borderStyle: 'solid', borderWidth: 1 }}>
                            <ToggleSwitch label={`${s.name} açık`} checked={s.enabled} disabled={!canEdit} onChange={on => { setList(l => l.map(x => (x.id === s.id ? { ...x, enabled: on } : x))); setSummary(x => [...x, `${on ? 'açıldı' : 'kapatıldı'}: ${s.name}`]); }} />
                            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                <span className={`text-[15px] font-semibold ${s.enabled ? 'm-text' : 'm-text-3'}`}>{s.name}</span>
                                <span className="text-[13.5px] m-text-2">{describeSchedule(s)}{s.fixVersion ? ` · sürüm ${s.fixVersion}` : ''}</span>
                                <span className="text-[12.5px] m-text-3">{s.blocks.map(b => BLOCK_LABELS[b].split(' (')[0]).join(' · ')}</span>
                                {s.lastSentAt && <span className="text-[12px] m-text-3">Son gönderim: {new Date(s.lastSentAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}{s.lastResult ? ` · ${s.lastResult}` : ''}</span>}
                            </span>
                            {canEdit && (
                                <span className="flex gap-0.5">
                                    <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${s.name} raporunu düzenle`} onClick={() => setEditing(JSON.parse(JSON.stringify(s)))}><Icon name="pencil" size={14} /></button>
                                    <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${s.name} raporunu sil`} onClick={() => { if (window.confirm(`"${s.name}" raporu silinsin mi?`)) { setList(l => l.filter(x => x.id !== s.id)); setSummary(x => [...x, `silindi: ${s.name}`]); } }}><Icon name="trash" size={14} /></button>
                                </span>
                            )}
                        </div>
                    ))}
                    {canEdit && <button type="button" className="m-btn m-btn-primary !min-h-[36px] self-start" onClick={() => setEditing(blank(!!project.poc?.tests?.length))}><Icon name="plus" size={15} />Yeni rapor</button>}
                </div>
            )}
        </Sheet>
    );
};

const ScheduleEditor: React.FC<{
    draft: ReportSchedule;
    project: Project;
    people: Person[];
    roleDefs: ProjectRoleDef[];
    health: IntegrationHealth | null;
    canEdit: boolean;
    onCancel: () => void;
    onSave: (s: ReportSchedule) => void;
    onSendNow: (s: ReportSchedule) => Promise<string>;
}> = ({ draft, project, people, roleDefs, health, canEdit, onCancel, onSave, onSendNow }) => {
    const [d, setD] = useState<ReportSchedule>(draft);
    const [emails, setEmails] = useState((draft.channels.email || []).join(', '));
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState<string | null>(null);
    const set = (patch: Partial<ReportSchedule>) => setD(x => ({ ...x, ...patch }));
    const withEmails = (x: ReportSchedule): ReportSchedule => {
        const list = emails.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean);
        return { ...x, channels: { ...x.channels, email: list.length ? list : undefined } };
    };
    const full = withEmails(d);
    const problems = scheduleProblems(full);
    const preview = useMemo(() => {
        const now = new Date();
        return buildReport(project, full, { now, previous: previousSnapshot(project.progressSnapshots, now), since: d.lastSentAt ? new Date(d.lastSentAt) : undefined, people, roleDefs });
    }, [project, full, people, roleDefs, d.lastSentAt]);
    const ch = (k: 'teams' | 'slack' | 'notion', label: string, ok: boolean | undefined) => (
        <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={!!d.channels[k]} onChange={e => set({ channels: { ...d.channels, [k]: e.target.checked || undefined } })} />
            {label}
            {health && <span className={`text-[12px] ${ok ? 'm-ink-ok' : 'm-ink-warn'}`}>{ok ? 'bağlı' : 'sunucuda yapılandırılmadı'}</span>}
        </label>
    );
    const versions = (project.versions || []).filter(v => v.status !== 'archived');

    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1">
                    <span className="text-[13px] font-semibold m-text-2">Rapor adı</span>
                    <input className="m-input" value={d.name} maxLength={80} onChange={e => set({ name: e.target.value })} />
                </label>
                <fieldset className="m-0 p-0 border-0 flex flex-col gap-2">
                    <legend className="text-[13px] font-semibold m-text-2 mb-1">Periyot (Türkiye saati)</legend>
                    <div className="flex flex-wrap items-center gap-2">
                        <select aria-label="Periyot" className="m-input !h-9 !py-0 !w-auto text-[14px]" value={d.cadence} onChange={e => set({ cadence: e.target.value as ReportSchedule['cadence'], weekday: e.target.value === 'weekly' ? d.weekday || 1 : undefined })}>
                            {(Object.keys(CADENCE_LABELS) as ReportSchedule['cadence'][]).map(k => <option key={k} value={k}>{CADENCE_LABELS[k]}</option>)}
                        </select>
                        {d.cadence === 'weekly' && (
                            <select aria-label="Gün" className="m-input !h-9 !py-0 !w-auto text-[14px]" value={d.weekday || 1} onChange={e => set({ weekday: Number(e.target.value) })}>
                                {WEEKDAYS_TR.slice(1).map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
                            </select>
                        )}
                        <select aria-label="Saat" className="m-input !h-9 !py-0 !w-auto text-[14px]" value={d.hour} onChange={e => set({ hour: Number(e.target.value) })}>
                            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                        </select>
                    </div>
                </fieldset>
                <fieldset className="m-0 p-0 border-0 flex flex-col gap-1.5">
                    <legend className="text-[13px] font-semibold m-text-2 mb-1">Kanallar</legend>
                    {ch('teams', 'Microsoft Teams kanalı (iş akışı / webhook)', health?.teams)}
                    {ch('slack', 'Slack kanalı', health?.slack)}
                    {ch('notion', 'Notion (her rapor yeni sayfa)', health?.notion)}
                    <label className="flex flex-col gap-1 text-[14px]">
                        <span>E-posta alıcıları {health && <span className={`text-[12px] ${health.email ? 'm-ink-ok' : 'm-ink-warn'}`}>{health.email ? 'SMTP bağlı' : 'SMTP yapılandırılmadı'}</span>}</span>
                        <input className="m-input !h-9 !py-0 text-[14px]" placeholder="ad@kurum.gov.tr, liste@kurum.gov.tr" value={emails} onChange={e => setEmails(e.target.value)} />
                    </label>
                </fieldset>
                <fieldset className="m-0 p-0 border-0 flex flex-col gap-1.5">
                    <legend className="text-[13px] font-semibold m-text-2 mb-1">İçerik</legend>
                    {BLOCKS.map(b => (
                        <label key={b} className="flex items-center gap-2 text-[14px]">
                            <input type="checkbox" checked={d.blocks.includes(b)} onChange={e => set({ blocks: e.target.checked ? [...d.blocks, b] : d.blocks.filter(x => x !== b) })} />
                            {BLOCK_LABELS[b]}
                        </label>
                    ))}
                </fieldset>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                        <span className="text-[13px] font-semibold m-text-2">Kapsam</span>
                        <select className="m-input !h-9 !py-0 text-[14px]" value={d.fixVersion || ''} onChange={e => set({ fixVersion: e.target.value || undefined })}>
                            <option value="">Tüm proje</option>
                            {versions.map(v => <option key={v.id} value={v.name}>Sürüm: {v.name}</option>)}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[13px] font-semibold m-text-2">Ek not (isteğe bağlı)</span>
                        <input className="m-input !h-9 !py-0 text-[14px]" maxLength={300} value={d.note || ''} onChange={e => set({ note: e.target.value || undefined })} />
                    </label>
                </div>
                <p className="m-0 text-[12.5px] m-text-3">İlerleme, projenin durum yüzdeleriyle hesaplanır (Proje ayarları › İlerleme). Fark, önceki günlük ölçüme göredir.</p>
                {problems.length > 0 && <p role="alert" className="m-0 text-[13px] m-ink-bad">{problems.join(' ')}</p>}
                <div className="flex flex-wrap justify-end gap-2">
                    {sendResult && <span role="status" className="flex-1 text-[13px] m-text-2 self-center">{sendResult}</span>}
                    <button type="button" className="m-btn m-btn-gray" onClick={onCancel}>Vazgeç</button>
                    <button type="button" className="m-btn m-btn-gray" disabled={problems.length > 0 || sending} onClick={async () => { setSending(true); setSendResult(null); try { setSendResult(await onSendNow(full)); } finally { setSending(false); } }}><Icon name="send" size={15} />{sending ? 'Gönderiliyor…' : 'Şimdi gönder (deneme)'}</button>
                    {canEdit && <button type="button" className="m-btn m-btn-primary" disabled={problems.length > 0} onClick={() => onSave({ ...full, name: full.name.trim() })}><Icon name="check" size={16} />Raporu uygula</button>}
                </div>
            </div>
            <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold m-text-2">Önizleme (şu anki veriyle)</span>
                <div className="m-surface rounded-2xl p-4 border m-sep flex flex-col gap-3" style={{ borderStyle: 'solid', borderWidth: 1 }}>
                    <span className="text-[16px] font-semibold m-text">{preview.subject}</span>
                    {preview.sections.map(s => (
                        <div key={s.title} className="flex flex-col gap-0.5">
                            <span className="text-[14px] m-text"><b>{s.title}</b>{s.summary ? `: ${s.summary}` : ''}</span>
                            {s.lines.map((l, i) => <span key={i} className="text-[13px] m-text-2 pl-2">{l}</span>)}
                        </div>
                    ))}
                </div>
                <details className="text-[12.5px] m-text-3">
                    <summary className="cursor-pointer">Slack biçimi</summary>
                    <pre className="whitespace-pre-wrap m-fill-2 rounded-xl p-2 mt-1">{reportText(preview.sections, 'slack')}</pre>
                </details>
            </div>
        </div>
    );
};

export default ReportSchedulesSheet;
