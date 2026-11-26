import React, { useCallback, useEffect, useState } from 'react';
import { AiAdminError, loadAdminToken, saveAdminToken } from '../../../utils/ai/adminConfig';
import {
    clearIntegrationAdmin, getIntegrationAdmin, INTEGRATION_FIELDS, INTEGRATION_SECRET_KEYS, integrationDraft, IntegrationAdminState,
    IntegrationKey, IntegrationTest, IntegrationValues, saveIntegrationAdmin, testIntegrationAdmin,
} from '../../../utils/integrationAdmin';
import { Icon } from '../icons';
import { Field } from '../ui';

/**
 * Entegrasyonlar (yönetici): .env / planasistan.env dosyasındaki Jira, Teams ve
 * e-posta ayarları buradan girilir. Değerler sunucuda şifreli tutulur ve dosyadaki
 * değerlerin üzerine yazılır; boş alan dosyadakini kullanır. Jeton ve parolalar
 * geri gelmez, yalnız son 4 hanesi gösterilir. Kaydedince uygulama yeniden
 * başlatılmadan (en geç 30 sn içinde) yeni ayarla çalışır.
 */

type Load =
    | { kind: 'loading' }
    | { kind: 'locked'; error?: string }
    | { kind: 'disabled'; error: string }
    | { kind: 'error'; error: string }
    | { kind: 'ready'; state: IntegrationAdminState };

const GROUPS = [
    { id: 'jira', title: 'Jira', hint: 'Excel\'deki Jira No\'ların eşitlenmesi, atananlar, worklog\'lar ve tahsis için' },
    { id: 'teams', title: 'Microsoft Teams', hint: 'Bildirim ve haftalık hatırlatma kanalı' },
    { id: 'email', title: 'E-posta (SMTP)', hint: 'Bildirim ve hatırlatma e-postaları' },
    { id: 'reports', title: 'Rapor kanalları (Slack, Notion)', hint: 'Zamanlanmış proje raporları. Notion: iç entegrasyon oluşturup rapor sayfasını ona paylaşın. Sunucunun kendisi göndermesi için CRON_SECRET ve SUPABASE_SERVICE_ROLE_KEY ortam değişkeni gerekir; yoksa raporu uygulama açıkken tarayıcı gönderir.' },
] as const;

const formOf = (s: IntegrationAdminState): IntegrationValues =>
    Object.fromEntries(Object.entries(s.panel).filter(([k]) => !INTEGRATION_SECRET_KEYS.includes(k as IntegrationKey))) as IntegrationValues;
const isOn = (v: string | undefined) => /^(1|true|evet|yes)$/i.test((v || '').trim());

interface Props { onChanged: (label: string) => void }

const IntegrationSettings: React.FC<Props> = ({ onChanged }) => {
    const [token, setToken] = useState(loadAdminToken);
    const [tokenInput, setTokenInput] = useState('');
    const [load, setLoad] = useState<Load>({ kind: 'loading' });
    const [form, setForm] = useState<IntegrationValues>({});
    const [remove, setRemove] = useState<Partial<Record<IntegrationKey, boolean>>>({});
    const [busy, setBusy] = useState<'test' | 'save' | 'clear' | null>(null);
    const [test, setTest] = useState<IntegrationTest | null>(null);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

    const fetchState = useCallback(async (t: string) => {
        setLoad({ kind: 'loading' });
        try {
            const state = await getIntegrationAdmin(t);
            setLoad({ kind: 'ready', state });
            setForm(formOf(state));
            setRemove({});
            return true;
        } catch (e) {
            const err = e as AiAdminError;
            if (err.status === 401) { saveAdminToken(null); setLoad({ kind: 'locked', error: t ? err.message : undefined }); }
            else if (err.status === 503) setLoad({ kind: 'disabled', error: err.message });
            else setLoad({ kind: 'error', error: err.message });
            return false;
        }
    }, []);
    useEffect(() => { void fetchState(token); }, [fetchState, token]);

    const unlock = async (e: React.FormEvent) => {
        e.preventDefault();
        const t = tokenInput.trim();
        if (t && await fetchState(t)) { saveAdminToken(t); setToken(t); setTokenInput(''); }
    };
    const set = (k: IntegrationKey, v: string) => { setForm(f => ({ ...f, [k]: v })); setTest(null); setMessage(null); };

    const run = async (kind: 'test' | 'save' | 'clear') => {
        if (load.kind !== 'ready') return;
        if (kind === 'clear' && !window.confirm('Paneldeki entegrasyon ayarları silinsin ve ayar dosyasındaki (ortam) değerlere dönülsün mü?')) return;
        setBusy(kind);
        setMessage(null);
        try {
            const values = integrationDraft(form, remove);
            if (kind === 'test') setTest(await testIntegrationAdmin(token, values));
            else {
                if (kind === 'save') await saveIntegrationAdmin(token, values); else await clearIntegrationAdmin(token);
                const changed = INTEGRATION_FIELDS.filter(f => (values[f.key] || '') !== (load.state.panel[f.key] || '') && !(INTEGRATION_SECRET_KEYS.includes(f.key) && values[f.key] === undefined)).map(f => f.label);
                onChanged(kind === 'save' ? `Entegrasyon ayarları panelden güncellendi${changed.length ? ` (${changed.join(', ')})` : ''}` : 'Entegrasyon ayarları ortam değerlerine döndü');
                await fetchState(token);
                setMessage({ ok: true, text: kind === 'save' ? 'Kaydedildi. Uygulama en geç 30 sn içinde yeni ayarla çalışır; yeniden başlatmak gerekmez.' : 'Panel ayarları silindi; ayar dosyasındaki değerler kullanılıyor.' });
            }
        } catch (e) {
            setMessage({ ok: false, text: (e as Error).message });
        } finally {
            setBusy(null);
        }
    };

    if (load.kind === 'loading') return <p className="m-0 text-[14px] m-text-3" role="status">Denetleniyor…</p>;
    if (load.kind === 'disabled' || load.kind === 'error') {
        return (
            <section className="m-surface rounded-2xl p-5 flex flex-col gap-2 text-[14px]">
                <p className={`m-0 ${load.kind === 'error' ? 'm-ink-bad' : 'm-text-2'}`}>{load.error}</p>
                {load.kind === 'disabled' && <p className="m-0 m-text-3">Panelden ayar için sunucuda yönetici anahtarı (AI_ADMIN_TOKEN) ve kalıcı depo gerekir (yapay zekâ bağlantısıyla aynı). Masaüstü sürümünde bunlar kendiliğinden hazırdır. O zamana kadar değerler ayar dosyasından (.env / planasistan.env) okunur.</p>}
                <button type="button" className="m-btn m-btn-plain self-start !px-0" onClick={() => fetchState(token)}><Icon name="refresh" size={16} />Yeniden dene</button>
            </section>
        );
    }
    if (load.kind === 'locked') {
        return (
            <form className="m-surface rounded-2xl p-5 flex flex-col gap-2.5" onSubmit={unlock}>
                <p className="m-0 text-[14px] m-text-2">Entegrasyon ayarlarını görmek ve değiştirmek için yönetici anahtarını (AI_ADMIN_TOKEN) girin. Anahtar yalnız bu sekmede, oturum boyunca tutulur.</p>
                <div className="flex flex-wrap items-end gap-2">
                    <Field label="Yönetici anahtarı" htmlFor="int-admin-token">
                        <input id="int-admin-token" type="password" autoComplete="off" className="m-input !w-[260px]" value={tokenInput} onChange={e => setTokenInput(e.target.value)} />
                    </Field>
                    <button type="submit" className="m-btn m-btn-primary" disabled={!tokenInput.trim()}><Icon name="key" size={18} />Aç</button>
                </div>
                {load.error && <p role="alert" className="m-0 text-[14px] m-ink-bad">{load.error}</p>}
            </form>
        );
    }

    const s = load.state;
    const statusChip = (on: boolean, label: string) => (
        <span className={`inline-flex items-center gap-1 h-7 px-3 rounded-full text-[13px] font-semibold ${on ? 'm-tone-ok' : 'm-fill-2 m-text-3'}`}><Icon name={on ? 'check' : 'x'} size={14} />{label}</span>
    );
    const fieldOf = (f: typeof INTEGRATION_FIELDS[number]) => {
        const id = `int-${f.key}`;
        const envHint = s.env[f.key] ? `Ayar dosyasında: ${s.env[f.key]}` : 'Ayar dosyasında yok';
        if ('bool' in f && f.bool) {
            const effective = form[f.key] !== undefined && form[f.key] !== '' ? form[f.key] : s.env[f.key];
            return (
                <Field key={f.key} label={f.label} htmlFor={id} hint={form[f.key] ? 'Panelde ayarlı' : `${envHint} (panelde boşsa o geçerli)`}>
                    <select id={id} className="m-input" value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)}>
                        <option value="">Ayar dosyasındaki ({isOn(s.env[f.key]) ? 'açık' : 'kapalı'})</option>
                        <option value="1">Açık</option>
                        <option value="0">Kapalı</option>
                    </select>
                    <span className="sr-only">{isOn(effective) ? 'açık' : 'kapalı'}</span>
                </Field>
            );
        }
        if ('secret' in f && f.secret) {
            return (
                <Field key={f.key} label={f.label} htmlFor={id} hint={s.panel[f.key] ? `Panelde kayıtlı ${s.panel[f.key]}; boş bırakılırsa korunur` : s.env[f.key] ? `Ayar dosyasında ${s.env[f.key]}; boş bırakılırsa o kullanılır` : 'Tanımlı değil'}>
                    <div className="flex flex-col gap-1.5">
                        <input id={id} type="password" autoComplete="new-password" className="m-input" placeholder={s.panel[f.key] ? `Kayıtlı ${s.panel[f.key]} — değiştirmek için yazın` : ''} value={form[f.key] || ''} disabled={!!remove[f.key]} onChange={e => set(f.key, e.target.value)} />
                        {s.panel[f.key] && (
                            <label className="inline-flex items-center gap-2 text-[13px] m-text-2">
                                <input type="checkbox" checked={!!remove[f.key]} onChange={e => { setRemove(r => ({ ...r, [f.key]: e.target.checked })); setTest(null); }} />Paneldekini sil (ayar dosyasına dön)
                            </label>
                        )}
                    </div>
                </Field>
            );
        }
        return (
            <Field key={f.key} label={f.label} htmlFor={id} hint={envHint}>
                <input id={id} className="m-input" placeholder={('placeholder' in f && f.placeholder) || s.env[f.key] || ''} value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
            </Field>
        );
    };

    return (
        <section aria-labelledby="int-title" className="m-surface rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-[70ch]">
                    <h2 id="int-title" className="m-0 text-[19px] font-semibold m-text">Entegrasyon ayarları</h2>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Ayar dosyasındaki (.env / planasistan.env) Jira, Teams ve e-posta değerleri burada değiştirilebilir. Panelde girilen değer dosyadakinin üzerine yazılır, boş alan dosyadakini kullanır. Jeton ve parolalar sunucuda şifreli saklanır, tarayıcıya geri gelmez.</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {statusChip(s.status.jira, 'Jira')}
                    {statusChip(s.status.jiraUpdate, 'Jira\'ya yazma')}
                    {statusChip(s.status.teams, 'Teams')}
                    {statusChip(s.status.email, 'E-posta')}
                    {statusChip(!!s.status.slack, 'Slack')}
                    {statusChip(!!s.status.notion, 'Notion')}
                    {statusChip(!!s.status.reportCron, 'Rapor zamanlayıcısı')}
                </div>
            </div>
            {!s.store.available && <p role="alert" className="m-0 text-[14px] m-ink-warn">{s.store.problem} Test edilebilir ama kaydedilemez.</p>}
            {GROUPS.map(g => (
                <fieldset key={g.id} className="m-0 p-0 border-0 flex flex-col gap-2.5">
                    <legend className="text-[16px] font-semibold m-text">{g.title} <span className="text-[13px] font-normal m-text-3">· {g.hint}</span></legend>
                    <div className="grid gap-3 sm:grid-cols-2">{INTEGRATION_FIELDS.filter(f => f.group === g.id).map(fieldOf)}</div>
                </fieldset>
            ))}
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="m-btn m-btn-gray" disabled={busy !== null} onClick={() => run('test')}><Icon name="activity" size={18} />{busy === 'test' ? 'Deneniyor…' : 'Jira bağlantısını dene'}</button>
                <button type="button" className="m-btn m-btn-primary" disabled={busy !== null || !s.store.available} onClick={() => run('save')}><Icon name="check" size={18} />{busy === 'save' ? 'Kaydediliyor…' : 'Kaydet'}</button>
                {Object.keys(s.panel).length > 0 && <button type="button" className="m-btn m-btn-plain" disabled={busy !== null} onClick={() => run('clear')}>Paneldekileri sil</button>}
                {s.updatedAt && <span className="text-[13px] m-text-3">Son kayıt: {new Date(s.updatedAt).toLocaleString('tr-TR')}</span>}
            </div>
            {test && (
                <p role="status" className={`m-0 text-[14px] flex items-start gap-1.5 ${test.jira.ok ? 'm-ink-ok' : 'm-ink-bad'}`}>
                    <Icon name={test.jira.ok ? 'check' : 'alert'} size={16} className="mt-0.5 shrink-0" />
                    <span>{test.jira.ok ? `Jira bağlı: ${test.jira.user || 'jeton sahibi'}${test.jira.projects?.length ? ` · erişilen projeler: ${test.jira.projects.join(', ')}` : ''}` : test.jira.error}</span>
                </p>
            )}
            {message && <p role={message.ok ? 'status' : 'alert'} className={`m-0 text-[14px] ${message.ok ? 'm-ink-ok' : 'm-ink-bad'}`}>{message.text}</p>}
        </section>
    );
};

export default IntegrationSettings;
