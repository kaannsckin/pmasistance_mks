import React, { useMemo, useState } from 'react';
import { Abbreviation, ReportSettings, WeeklyReport } from '../../../types';
import { REPORT_SYSTEM } from '../../../utils/ai/weeklyReportPrompt';
import { describeNotify, IntegrationHealth, sendNotification } from '../../../utils/integrations';
import { DEFAULT_ABBREVIATIONS, fineTuneLines, mailtoLink, reminderText, teamsChatLink, WEEKDAYS } from '../../../utils/weeklyReport';
import { Icon } from '../icons';
import { Card, Field, rowSep } from '../ui';
import { downloadFile, Notice, NoticeState, Pill } from './shared';

// ---------------------------------------------------------------- hatırlatma

export interface PendingAuthor {
    personId: string;
    name: string;
    email?: string;
    projects: string[];
}

/**
 * Raporunu göndermemiş PY'lere hatırlatma: Teams sohbeti ve e-posta her
 * zaman (kullanıcının kendi hesabından); sunucuda Teams/e-posta
 * yapılandırılmışsa tek tıkla otomatik gönderim.
 */
export const ReminderPanel: React.FC<{
    authors: PendingAuthor[];
    year: number;
    week: number;
    dueWeekday: number;
    health: IntegrationHealth | null;
}> = ({ authors, year, week, dueWeekday, health }) => {
    const [notice, setNotice] = useState<NoticeState>(null);
    const [sending, setSending] = useState(false);
    const emails = authors.map(a => a.email).filter((e): e is string => !!e);
    const noEmail = authors.filter(a => !a.email);
    const appUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
    const msg = reminderText(year, week, dueWeekday, authors.length === 1 ? authors[0].projects : [], appUrl);
    const auto = !!health && (health.email || health.teams);

    const send = async () => {
        if (!health) return;
        setSending(true);
        setNotice(null);
        try {
            const r = await sendNotification({ subject: msg.subject, text: msg.text, teams: health.teams, email: health.email && emails.length ? { bcc: emails } : undefined }, health.authMode);
            const d = describeNotify(r);
            setNotice({ kind: d.ok ? 'ok' : 'error', text: d.text });
        } catch (e) {
            setNotice({ kind: 'error', text: (e as Error).message });
        } finally {
            setSending(false);
        }
    };

    return (
        <Card title="Hatırlatma" subtitle={authors.length ? `${authors.length} proje yöneticisi raporunu henüz göndermedi.` : 'Tüm proje yöneticileri raporunu gönderdi.'} labelledBy="wr-remind">
            {authors.length > 0 && (
                <>
                    <div className="flex flex-col">
                        {authors.map((a, i) => {
                            const sep = rowSep(i);
                            return (
                                <div key={a.personId} className={`flex items-center gap-3 py-2 ${sep.className}`} style={sep.style}>
                                    <span className="flex-1 min-w-0 flex flex-col">
                                        <span className="text-[15px] m-text">{a.name}</span>
                                        <span className="text-[13px] m-text-3 truncate">{a.projects.join(', ')}</span>
                                    </span>
                                    {a.email ? (
                                        <a className="m-icon-btn" aria-label={`${a.name} kişisine Teams'te yaz`} title="Teams'te yaz" target="_blank" rel="noopener noreferrer"
                                            href={teamsChatLink([a.email], reminderText(year, week, dueWeekday, a.projects, appUrl).text)}><Icon name="message" size={18} /></a>
                                    ) : <Pill tone="m-tone-warn">E-posta yok</Pill>}
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <a className={`m-btn m-btn-gray ${emails.length ? '' : 'pointer-events-none opacity-50'}`} target="_blank" rel="noopener noreferrer" href={emails.length ? teamsChatLink(emails, msg.text, 'Haftalık rapor') : undefined}>
                            <Icon name="message" size={17} />Teams'te toplu yaz
                        </a>
                        <a className={`m-btn m-btn-gray ${emails.length ? '' : 'pointer-events-none opacity-50'}`} href={emails.length ? mailtoLink({ bcc: emails, subject: msg.subject, body: msg.text }) : undefined}>
                            <Icon name="mail" size={17} />E-posta
                        </a>
                        {auto && (
                            <button type="button" className="m-btn m-btn-primary" disabled={sending} onClick={send}>
                                <Icon name="send" size={17} />{sending ? 'Gönderiliyor…' : 'Otomatik gönder'}
                            </button>
                        )}
                    </div>
                    {noEmail.length > 0 && <p className="m-0 text-[13px] m-ink-warn">E-posta adresi eksik: {noEmail.map(a => a.name).join(', ')} — Veri havuzundan ekleyin.</p>}
                    <p className="m-0 text-[13px] m-text-3">
                        {health?.reminder
                            ? `Otomatik haftalık hatırlatma açık: her ${WEEKDAYS[4]} 10:00'da Teams kanalına ve dağıtım listesine gider.`
                            : 'Teams sohbeti ve e-posta kendi hesabınızdan açılır. Sunucuda Teams webhook / SMTP tanımlanınca hatırlatmalar otomatik gider.'}
                    </p>
                    <Notice notice={notice} onClose={() => setNotice(null)} />
                </>
            )}
        </Card>
    );
};

// ---------------------------------------------------------------- ayarlar

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_ROWS: { key: keyof Omit<IntegrationHealth, 'authMode' | 'unreachable'>; label: string; env: string; hint: string }[] = [
    { key: 'jira', label: 'Jira worklog', env: 'JIRA_BASE_URL + JIRA_TOKEN (ya da JIRA_EMAIL + JIRA_API_TOKEN)', hint: 'Kurum izniyle; salt okuma yetkili hizmet hesabı önerilir.' },
    { key: 'teams', label: 'Teams kanalı', env: 'TEAMS_WEBHOOK_URL', hint: 'Kanala gelen webhook (Workflows) adresi.' },
    { key: 'email', label: 'E-posta (SMTP)', env: 'SMTP_HOST, SMTP_FROM (+ SMTP_USER, SMTP_PASS)', hint: 'Yalnız kurum alan adlarına gönderilir (NOTIFY_ALLOWED_DOMAINS).' },
    { key: 'reminder', label: 'Haftalık otomatik hatırlatma', env: 'CRON_SECRET + REPORT_REMINDER_TO', hint: 'Perşembe 10:00 (Vercel cron).' },
];

export const ReportSettingsPanel: React.FC<{
    settings: ReportSettings;
    reports: WeeklyReport[];
    health: IntegrationHealth | null;
    onChange: (s: ReportSettings) => void;
}> = ({ settings, reports, health, onChange }) => {
    const [emails, setEmails] = useState(settings.directorEmails.join(', '));
    const [abbr, setAbbr] = useState('');
    const [exp, setExp] = useState('');
    const [saved, setSaved] = useState(false);
    const parsed = emails.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean);
    const bad = parsed.filter(e => !EMAIL_RE.test(e));
    const fineTune = useMemo(() => fineTuneLines(reports, REPORT_SYSTEM), [reports]);
    const approvedCount = reports.filter(r => r.stage === 'approved').length;

    const saveEmails = () => {
        if (bad.length) return;
        onChange({ ...settings, directorEmails: [...new Set(parsed.map(e => e.toLowerCase()))] });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };
    const addAbbr = (e: React.FormEvent) => {
        e.preventDefault();
        if (!abbr.trim() || !exp.trim()) return;
        const a: Abbreviation = { abbr: abbr.trim(), expansion: exp.trim() };
        onChange({ ...settings, abbreviations: [...settings.abbreviations.filter(x => x.abbr.toLocaleUpperCase('tr-TR') !== a.abbr.toLocaleUpperCase('tr-TR')), a].sort((x, y) => x.abbr.localeCompare(y.abbr, 'tr')) });
        setAbbr('');
        setExp('');
    };

    return (
        <div className="grid gap-5 lg:grid-cols-2 items-start">
            <Card title="Dağıtım" subtitle="Yayınlanan haftalık raporun gönderileceği müdür / yönetim adresleri." labelledBy="wr-dist">
                <Field label="Müdür e-posta adresleri" htmlFor="wr-emails" hint="Virgülle ayırın.">
                    <textarea id="wr-emails" className="m-input py-2.5" rows={2} value={emails} placeholder="mudur@kurum.gov.tr, pyb@kurum.gov.tr" onChange={e => setEmails(e.target.value)} />
                </Field>
                {bad.length > 0 && <p className="m-0 text-[13px] m-ink-bad">Geçersiz adres: {bad.join(', ')}</p>}
                <Field label="Rapor son günü" htmlFor="wr-due">
                    <select id="wr-due" className="m-input" value={settings.dueWeekday} onChange={e => onChange({ ...settings, dueWeekday: Number(e.target.value) })}>
                        {[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
                    </select>
                </Field>
                <div className="flex items-center gap-2">
                    <button type="button" className="m-btn m-btn-primary" disabled={bad.length > 0} onClick={saveEmails}>Kaydet</button>
                    {saved && <span className="text-[14px] m-ink-ok">Kaydedildi</span>}
                </div>
            </Card>

            <Card title="Entegrasyonlar" subtitle="Sunucu ortam değişkenleriyle açılır; gizli bilgiler tarayıcıya gelmez." labelledBy="wr-int">
                {health?.unreachable && <p className="m-0 text-[14px] m-ink-warn">Entegrasyon sunucusuna ulaşılamadı; Teams ve e-posta kendi hesabınızdan açılır.</p>}
                <div className="flex flex-col">
                    {STATUS_ROWS.map((r, i) => {
                        const sep = rowSep(i);
                        const on = !!health?.[r.key];
                        return (
                            <div key={r.key} className={`flex items-start gap-3 py-2.5 ${sep.className}`} style={sep.style}>
                                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <span className="text-[15px] m-text">{r.label}</span>
                                    <span className="text-[12.5px] m-text-3">{on ? r.hint : `Tanımlanacak: ${r.env}. ${r.hint}`}</span>
                                </span>
                                <Pill tone={on ? 'm-tone-ok' : 'm-tone-hold'}>{on ? 'Açık' : 'Kapalı'}</Pill>
                            </div>
                        );
                    })}
                </div>
            </Card>

            <Card title="Kısaltma sözlüğü" subtitle="Raporlarda geçen kısaltmalar bu sözlükten otomatik açılır." labelledBy="wr-dict">
                <form className="flex flex-wrap items-end gap-2" onSubmit={addAbbr}>
                    <div className="w-28"><Field label="Kısaltma" htmlFor="wr-abbr"><input id="wr-abbr" className="m-input" value={abbr} placeholder="KYS" onChange={e => setAbbr(e.target.value)} /></Field></div>
                    <div className="flex-1 min-w-[180px]"><Field label="Açılımı" htmlFor="wr-exp"><input id="wr-exp" className="m-input" value={exp} placeholder="Kurumsal Yazışma Sistemi" onChange={e => setExp(e.target.value)} /></Field></div>
                    <button type="submit" className="m-btn m-btn-gray" disabled={!abbr.trim() || !exp.trim()}>Ekle</button>
                </form>
                <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
                    {settings.abbreviations.map(a => (
                        <li key={a.abbr} className="inline-flex items-center gap-1 pl-3 pr-1 h-8 rounded-full m-tone-accent text-[14px]">
                            <b>{a.abbr}</b>: {a.expansion}
                            <button type="button" className="m-icon-btn !w-7 !h-7" aria-label={`${a.abbr} kısaltmasını sil`} onClick={() => onChange({ ...settings, abbreviations: settings.abbreviations.filter(x => x.abbr !== a.abbr) })}><Icon name="x" size={14} /></button>
                        </li>
                    ))}
                    {DEFAULT_ABBREVIATIONS.filter(d => !settings.abbreviations.some(a => a.abbr.toLocaleUpperCase('tr-TR') === d.abbr.toLocaleUpperCase('tr-TR'))).map(a => (
                        <li key={a.abbr} className="inline-flex items-center px-3 h-8 rounded-full m-fill-2 text-[14px] m-text-2"><b className="mr-1">{a.abbr}</b>: {a.expansion}</li>
                    ))}
                </ul>
            </Card>

            <Card title="AI ince ayarı" subtitle="AI önerisi ile onaylanan son hâl çiftleri, modeli kurum diline uyarlamak için eğitim verisidir." labelledBy="wr-ft">
                <p className="m-0 text-[14px] m-text-2">
                    Öneriler şimdiden kurum rapor kılavuzu, örnek rapor ve onaylanmış önceki raporlardan seçilen örneklerle yönlendirilir. {approvedCount} onaylı raporun {fineTune.length} tanesi AI taslağıyla başladı ve veri setine girer.
                </p>
                <div>
                    <button type="button" className="m-btn m-btn-gray" disabled={!fineTune.length} onClick={() => downloadFile(`rapor-ince-ayar-${new Date().toISOString().slice(0, 10)}.jsonl`, `${fineTune.join('\n')}\n`, 'application/jsonl')}>
                        <Icon name="download" size={17} />Veri setini indir (JSONL)
                    </button>
                </div>
            </Card>
        </div>
    );
};
