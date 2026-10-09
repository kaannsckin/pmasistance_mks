import React, { useCallback, useEffect, useState } from 'react';
import {
    AI_SECRET_KEYS, AiAdminError, AiAdminState, AiSettingKey, AiSettingValues, AiTestPart, AiTestResult, clearAiAdmin, DEFAULT_BASE_URLS, draftValues,
    GEMINI_KEY_URL, geminiQuickValues, getAiAdmin, loadAdminToken, modelsAiAdmin, PROVIDER_LABELS, saveAdminToken, saveAiAdmin, testAiAdmin,
} from '../../../utils/ai/adminConfig';
import { AiStatus } from '../../../utils/ai/protocol';
import { Icon } from '../icons';
import { Field } from '../ui';
import BrowserGeminiKey from './BrowserGeminiKey';

/**
 * AI bağlantısı (yönetici): sağlayıcı, adres, model ve API anahtarı panelden
 * girilir, kaydetmeden test edilir. Ayarlar sunucuda şifreli tutulur ve ortam
 * değişkenlerinin üzerine yazılır; boş alan ortam değişkenini kullanır. API
 * anahtarı sunucudan geri gelmez, yalnız son 4 hanesi gösterilir. Yönetici
 * anahtarı (AI_ADMIN_TOKEN) bu sekmenin oturumunda tutulur. Sunucu tarafı
 * kurulum yoksa (ya da yalnız denemek için) Gemini anahtarı yalnız bu tarayıcıda
 * kullanılabilir (BrowserGeminiKey).
 */

interface Props {
    /** Kayıt / ortam değişkenlerine dönüş sonrası (denetim günlüğü, asistan durumunu yenileme) */
    onChanged: (label: string) => void;
    /** Proxy'nin bu tarayıcı için bildirdiği durum (tarayıcı test anahtarı kartı için) */
    status?: (AiStatus & { unreachable?: boolean }) | null;
}

type Load =
    | { kind: 'loading' }
    | { kind: 'locked'; error?: string }
    | { kind: 'disabled'; error: string }
    | { kind: 'error'; error: string }
    | { kind: 'ready'; state: AiAdminState };

const PROVIDERS = ['openai', 'azure', 'anthropic', 'gemini'];
const EMBED_PROVIDERS = ['openai', 'azure', 'gemini', 'voyage'];
const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'];
const sec = (ms?: number) => (ms === undefined ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn`);

/** Formun başlangıcı: paneldeki değerler (anahtarlar boş — değiştirmek için yazılır) */
const formOf = (s: AiAdminState): AiSettingValues => Object.fromEntries(
    Object.entries(s.panel).filter(([k]) => !AI_SECRET_KEYS.includes(k as AiSettingKey)),
) as AiSettingValues;

const TestLine: React.FC<{ label: string; part: AiTestPart; ok: string }> = ({ label, part, ok }) => (
    <p className={`m-0 text-[14px] flex items-start gap-1.5 ${part.ok ? 'm-ink-ok' : 'm-ink-bad'}`}>
        <Icon name={part.ok ? 'check' : 'alert'} size={16} className="mt-0.5 shrink-0" />
        <span><b>{label}:</b> {part.ok ? ok : part.error}</span>
    </p>
);

const AiConnection: React.FC<Props> = ({ onChanged, status }) => {
    const [token, setToken] = useState(loadAdminToken);
    const [tokenInput, setTokenInput] = useState('');
    const [load, setLoad] = useState<Load>({ kind: 'loading' });
    const [form, setForm] = useState<AiSettingValues>({});
    const [remove, setRemove] = useState<Partial<Record<AiSettingKey, boolean>>>({});
    const [busy, setBusy] = useState<'test' | 'save' | 'clear' | null>(null);
    const [test, setTest] = useState<AiTestResult | null>(null);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [quickKey, setQuickKey] = useState('');
    const [quick, setQuick] = useState<{ running: boolean; ok?: boolean; text?: string }>({ running: false });
    const [models, setModels] = useState<{ list: string[]; recommended?: string; loading: boolean; error?: string }>({ list: [], loading: false });

    const fetchState = useCallback(async (t: string) => {
        setLoad({ kind: 'loading' });
        try {
            const state = await getAiAdmin(t);
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
        if (!t) return;
        if (await fetchState(t)) { saveAdminToken(t); setToken(t); setTokenInput(''); }
    };
    const set = (k: AiSettingKey, v: string) => { setForm(f => ({ ...f, [k]: v })); setTest(null); setMessage(null); };

    /** Gemini hızlı kurulumu: yalnız anahtar → test → (depo varsa) kayıt */
    const quickSetup = async () => {
        if (load.kind !== 'ready' || !quickKey.trim()) return;
        const values = geminiQuickValues(quickKey);
        setQuick({ running: true });
        setTest(null);
        setMessage(null);
        try {
            const t = await testAiAdmin(token, values);
            setTest(t);
            if (!t.chat.ok) { setQuick({ running: false, ok: false, text: 'Gemini bağlantısı kurulamadı; aşağıdaki nedeni giderip yeniden deneyin.' }); return; }
            const what = `sohbet ${t.chat.model}${t.embed?.ok ? `, anlamsal arama ${t.embed.model}` : ''}`;
            if (!load.state.store.available) {
                setQuick({ running: false, ok: true, text: `Anahtar çalışıyor (${what}). Panelden kaydetmek için sunucuda kalıcı depo gerekli; ya da sunucuya yalnız GEMINI_API_KEY ortam değişkenini ekleyin.` });
                return;
            }
            await saveAiAdmin(token, values);
            onChanged(`AI bağlantısı: Google Gemini hızlı kurulumu (${what})`);
            setQuickKey('');
            await fetchState(token);
            setQuick({ running: false, ok: true, text: `Gemini hazır: ${what}. Asistan kullanıma hazır.` });
        } catch (e) {
            setQuick({ running: false, ok: false, text: (e as Error).message });
        }
    };

    const loadModels = async () => {
        setModels(m => ({ ...m, loading: true, error: undefined }));
        try {
            const r = await modelsAiAdmin(token, draftValues(form, remove));
            setModels({ list: r.models, recommended: r.recommended, loading: false, error: r.error || (r.models.length ? undefined : 'Liste boş döndü.') });
        } catch (e) {
            setModels(m => ({ ...m, loading: false, error: (e as Error).message }));
        }
    };

    const run = async (kind: 'test' | 'save' | 'clear') => {
        if (load.kind !== 'ready') return;
        if (kind === 'clear' && !window.confirm('Paneldeki AI ayarları silinsin ve ortam değişkenlerine dönülsün mü?')) return;
        setBusy(kind);
        setMessage(null);
        try {
            if (kind === 'test') {
                setTest(await testAiAdmin(token, draftValues(form, remove)));
            } else {
                const values = draftValues(form, remove);
                if (kind === 'save') await saveAiAdmin(token, values); else await clearAiAdmin(token);
                const provider = values.AI_PROVIDER || load.state.env.AI_PROVIDER || 'openai';
                const model = values.AI_MODEL || load.state.env.AI_MODEL || '—';
                onChanged(kind === 'save' ? `AI bağlantısı panelden güncellendi (${provider} · ${model}${values.AI_API_KEY ? ' · yeni API anahtarı' : ''})` : 'AI bağlantısı ortam değişkenlerine döndü');
                await fetchState(token);
                setMessage({ ok: true, text: kind === 'save' ? 'Kaydedildi; asistan yeni ayarla çalışır.' : 'Panel ayarları silindi; ortam değişkenleri kullanılıyor.' });
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
            <div className="flex flex-col gap-3 text-[14px]">
                {/* Sunucu tarafı kurulum yok: en kısa yol yalnız bu tarayıcıda anahtar */}
                <BrowserGeminiKey status={status} onChanged={onChanged} open />
                <details open={load.kind === 'error'}>
                    <summary className="cursor-pointer text-[14px] font-semibold m-accent min-h-[34px] flex items-center">Bağlantıyı herkes için sunucuda ayarlamak</summary>
                    <div className="flex flex-col gap-2 mt-1">
                        <p className={`m-0 ${load.kind === 'error' ? 'm-ink-bad' : 'm-text-2'}`}>{load.error}</p>
                        {load.kind === 'disabled' && <p className="m-0 m-text-3">Sunucuya AI_ADMIN_TOKEN (yönetici anahtarı) ve kalıcı depo (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ile AI_CONFIG_SECRET) eklenince bağlantı buradan ayarlanır ve test edilir. Ayrıntı: docs/AI_KURULUM.md.</p>}
                        {load.kind === 'disabled' && <p className="m-0 m-text-3">Ya da Google AI Studio'dan (<a className="m-accent" href={GEMINI_KEY_URL} target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>) aldığınız anahtarı sunucuya yalnız <code>GEMINI_API_KEY</code> ortam değişkeni olarak ekleyin; sağlayıcı, model ve anlamsal arama otomatik seçilir. Yayında erişim koruması (AI_ACCESS_TOKEN ya da Supabase) yine gerekir.</p>}
                        <button type="button" className="m-btn m-btn-plain self-start !px-0" onClick={() => fetchState(token)}><Icon name="refresh" size={16} />Yeniden dene</button>
                    </div>
                </details>
            </div>
        );
    }
    if (load.kind === 'locked') {
        return (
            <div className="flex flex-col gap-3">
                <form className="flex flex-col gap-2.5" onSubmit={unlock}>
                    <p className="m-0 text-[14px] m-text-2">Bağlantı ayarlarını görmek ve değiştirmek için sunucudaki yönetici anahtarını (AI_ADMIN_TOKEN) girin. Anahtar yalnız bu sekmede, oturum boyunca tutulur.</p>
                    <div className="flex flex-wrap items-end gap-2">
                        <Field label="Yönetici anahtarı" htmlFor="ai-admin-token">
                            <input id="ai-admin-token" type="password" autoComplete="off" className="m-input !w-[260px]" value={tokenInput} onChange={e => setTokenInput(e.target.value)} />
                        </Field>
                        <button type="submit" className="m-btn m-btn-primary" disabled={!tokenInput.trim()}><Icon name="key" size={18} />Aç</button>
                    </div>
                    {load.error && <p role="alert" className="m-0 text-[14px] m-ink-bad">{load.error}</p>}
                </form>
                <BrowserGeminiKey status={status} onChanged={onChanged} />
            </div>
        );
    }

    const s = load.state;
    const provider = form.AI_PROVIDER || s.env.AI_PROVIDER || 'openai';
    const embedProvider = form.AI_EMBEDDING_PROVIDER || s.env.AI_EMBEDDING_PROVIDER || '';
    const envHint = (k: AiSettingKey, fallback?: string) => (s.env[k] ? `Ortamda: ${s.env[k]}` : fallback ? `Varsayılan: ${fallback}` : 'Ortamda tanımlı değil');
    const secretField = (k: AiSettingKey, id: string, label: string) => (
        <Field label={label} htmlFor={id} hint={s.panel[k] ? `Panelde kayıtlı ${s.panel[k]}; boş bırakılırsa korunur` : s.env[k] ? `Ortamda ${s.env[k]}; boş bırakılırsa o kullanılır` : 'Tanımlı değil'}>
            <div className="flex flex-col gap-1.5">
                <input id={id} type="password" autoComplete="new-password" className="m-input" placeholder={s.panel[k] ? `Kayıtlı ${s.panel[k]} — değiştirmek için yazın` : 'API anahtarı'} value={form[k] || ''} disabled={!!remove[k]} onChange={e => set(k, e.target.value)} />
                {s.panel[k] && (
                    <label className="inline-flex items-center gap-2 text-[13px] m-text-2">
                        <input type="checkbox" checked={!!remove[k]} onChange={e => { setRemove(r => ({ ...r, [k]: e.target.checked })); setTest(null); }} />Paneldeki anahtarı sil (ortamdakine dön)
                    </label>
                )}
            </div>
        </Field>
    );

    return (
        <div className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold ${s.effective.configured ? 'm-tone-ok' : 'm-tone-warn'}`}>{s.effective.configured ? 'Hazır' : 'Yapılandırılmamış'}</span>
                <span className="inline-flex items-center h-7 px-3 rounded-full text-[13px] m-fill-2 m-text-2">Kaynak: {s.source === 'panel' ? 'yönetici paneli' : 'ortam değişkenleri'}</span>
                {s.effective.provider && <span className="text-[14px] m-text-2 break-all">{s.effective.provider} · {s.effective.model || '—'}</span>}
                <button type="button" className="m-btn m-btn-plain !min-h-[32px] !px-2 ml-auto" onClick={() => { saveAdminToken(null); setToken(''); }}><Icon name="lock" size={16} />Kilitle</button>
            </div>
            {s.effective.problem && <p className="m-0 text-[13px] m-ink-warn">{s.effective.problem}</p>}
            {!s.store.available && <p className="m-0 text-[13px] m-ink-warn">Kaydetme kapalı: {s.store.problem} Test yine çalışır.</p>}

            <details open={!s.effective.configured} className="rounded-xl p-3.5" style={{ background: 'var(--m-accent-tint)' }}>
                <summary className="cursor-pointer text-[15px] font-semibold m-text min-h-[30px] flex items-center gap-2"><Icon name="sparkles" size={18} />Hızlı kurulum: Google Gemini API (yalnız anahtar)</summary>
                <div className="flex flex-col gap-2.5 mt-2">
                    <ol className="m-0 pl-5 list-decimal text-[14px] m-text-2 flex flex-col gap-0.5">
                        <li>Google hesabınızla Google AI Studio'yu açın: <a className="m-accent" href={GEMINI_KEY_URL} target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a></li>
                        <li>"Create API key" ile bir anahtar oluşturup kopyalayın.</li>
                        <li>Anahtarı buraya yapıştırıp "Gemini ile kur" deyin: model ve anlamsal arama anahtarın erişebildiği en güncel kararlı modellerden seçilir, bağlantı test edilip kaydedilir.</li>
                    </ol>
                    <div className="flex flex-wrap items-end gap-2">
                        <Field label="Gemini API anahtarı" htmlFor="ai-gemini-key">
                            <input id="ai-gemini-key" type="password" autoComplete="off" className="m-input !w-[300px] max-w-full" placeholder="AIza…" value={quickKey} onChange={e => setQuickKey(e.target.value)} />
                        </Field>
                        <button type="button" className="m-btn m-btn-primary" disabled={!quickKey.trim() || quick.running || !!busy} onClick={quickSetup}><Icon name="sparkles" size={18} />{quick.running ? 'Kuruluyor…' : 'Gemini ile kur'}</button>
                    </div>
                    {quick.text && <p role={quick.ok ? 'status' : 'alert'} className={`m-0 text-[14px] ${quick.ok ? 'm-ink-ok' : 'm-ink-bad'}`}>{quick.text}</p>}
                    <p className="m-0 text-[12.5px] m-text-3">Ücretsiz katman denemek içindir: dakikalık istek sınırı düşüktür (asistan bir soruda birkaç istek atar) ve Google'ın koşullarına göre ücretsiz katmanda gönderilen içerik Google ürünlerini geliştirmek için kullanılabilir. Kurum verisiyle kalıcı kullanımda faturalı katmanı ve KVKK değerlendirmesini tercih edin.</p>
                </div>
            </details>

            <BrowserGeminiKey status={status} onChanged={onChanged} open={!s.store.available && !s.effective.configured} />

            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))' }}>
                <Field label="Sağlayıcı" htmlFor="ai-provider" hint={envHint('AI_PROVIDER', 'openai')}>
                    <select id="ai-provider" className="m-input" value={form.AI_PROVIDER || ''} onChange={e => set('AI_PROVIDER', e.target.value)}>
                        <option value="">Ortam değişkeni ({s.env.AI_PROVIDER || 'openai'})</option>
                        {PROVIDERS.map(p => <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>)}
                    </select>
                </Field>
                <Field label="Adres (base URL)" htmlFor="ai-base" hint={envHint('AI_BASE_URL', DEFAULT_BASE_URLS[provider] || undefined)}>
                    <input id="ai-base" className="m-input" inputMode="url" placeholder={s.env.AI_BASE_URL || DEFAULT_BASE_URLS[provider] || 'https://KAYNAK.openai.azure.com/openai/v1'} value={form.AI_BASE_URL || ''} onChange={e => set('AI_BASE_URL', e.target.value)} />
                </Field>
                <Field label="Model" htmlFor="ai-model" hint={provider === 'gemini' ? `Boş ya da "auto": anahtarın erişebildiği en güncel kararlı Flash modeli${s.effective.auto?.model ? ` (şu an ${s.effective.auto.model})` : ''}` : envHint('AI_MODEL')}>
                    <div className="flex flex-col gap-1.5">
                        <div className="flex gap-1.5">
                            <input id="ai-model" className="m-input flex-1 min-w-0" list="ai-model-list" placeholder={provider === 'gemini' ? 'auto' : s.env.AI_MODEL || 'Model adı'} value={form.AI_MODEL || ''} onChange={e => set('AI_MODEL', e.target.value)} />
                            {(provider === 'gemini' || provider === 'openai') && <button type="button" className="m-btn m-btn-plain !px-2 shrink-0" disabled={models.loading} onClick={loadModels}>{models.loading ? '…' : 'Listele'}</button>}
                        </div>
                        <datalist id="ai-model-list">{models.list.map(m => <option key={m} value={m}>{m === models.recommended ? 'önerilen' : undefined}</option>)}</datalist>
                        {models.list.length > 0 && <span className="text-[12.5px] m-text-3">{models.list.length} model bulundu{models.recommended ? ` · önerilen ${models.recommended}` : ''}; alana yazarken listeden seçin.</span>}
                        {models.error && <span className="text-[12.5px] m-ink-bad">{models.error}</span>}
                    </div>
                </Field>
                {secretField('AI_API_KEY', 'ai-key', 'API anahtarı')}
            </div>

            <details>
                <summary className="cursor-pointer text-[14px] font-semibold m-accent min-h-[34px] flex items-center">Gelişmiş: üretim ayarları ve anlamsal arama (embedding)</summary>
                <div className="grid gap-3 mt-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))' }}>
                    <Field label="Sıcaklık" htmlFor="ai-temp" hint={envHint('AI_TEMPERATURE', 'sağlayıcınınki')}>
                        <input id="ai-temp" className="m-input m-tabular" inputMode="decimal" placeholder={s.env.AI_TEMPERATURE || '—'} value={form.AI_TEMPERATURE || ''} onChange={e => set('AI_TEMPERATURE', e.target.value.replace(',', '.'))} />
                    </Field>
                    <Field label="En çok çıktı (token)" htmlFor="ai-max" hint={envHint('AI_MAX_OUTPUT_TOKENS', '4096')}>
                        <input id="ai-max" className="m-input m-tabular" inputMode="numeric" placeholder={s.env.AI_MAX_OUTPUT_TOKENS || '4096'} value={form.AI_MAX_OUTPUT_TOKENS || ''} onChange={e => set('AI_MAX_OUTPUT_TOKENS', e.target.value.replace(/\D/g, ''))} />
                    </Field>
                    <Field label="Akıl yürütme seviyesi" htmlFor="ai-effort" hint="Yalnız OpenAI uyumlu akıl yürüten modellerde">
                        <select id="ai-effort" className="m-input" value={form.AI_REASONING_EFFORT || ''} onChange={e => set('AI_REASONING_EFFORT', e.target.value)}>
                            <option value="">Ortam değişkeni ({s.env.AI_REASONING_EFFORT || 'yok'})</option>
                            {EFFORTS.map(x => <option key={x} value={x}>{x}</option>)}
                        </select>
                    </Field>
                    <Field label="Ek istek alanları (JSON)" htmlFor="ai-extra" hint='Ağ geçidine özgü, ör. {"chat_template_kwargs":{"enable_thinking":false}}'>
                        <input id="ai-extra" className="m-input font-mono text-[13px]" placeholder={s.env.AI_EXTRA_BODY || '{}'} value={form.AI_EXTRA_BODY || ''} onChange={e => set('AI_EXTRA_BODY', e.target.value)} />
                    </Field>
                    <Field label="Embedding modeli" htmlFor="ai-emb-model" hint={provider === 'gemini' ? `Boş ya da "auto": Gemini embedding modeli${s.effective.auto?.embeddingModel ? ` (şu an ${s.effective.auto.embeddingModel})` : ''}; "none" kapatır` : envHint('AI_EMBEDDING_MODEL', 'yok: anahtar kelime araması')}>
                        <input id="ai-emb-model" className="m-input" placeholder={s.env.AI_EMBEDDING_MODEL || 'ör. text-embedding-3-small'} value={form.AI_EMBEDDING_MODEL || ''} onChange={e => set('AI_EMBEDDING_MODEL', e.target.value)} />
                    </Field>
                    <Field label="Embedding sağlayıcısı" htmlFor="ai-emb-provider" hint="Boşsa sohbetle aynı sağlayıcı">
                        <select id="ai-emb-provider" className="m-input" value={form.AI_EMBEDDING_PROVIDER || ''} onChange={e => set('AI_EMBEDDING_PROVIDER', e.target.value)}>
                            <option value="">Ortam değişkeni ({s.env.AI_EMBEDDING_PROVIDER || 'sohbetle aynı'})</option>
                            {EMBED_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </Field>
                    <Field label="Embedding adresi" htmlFor="ai-emb-base" hint={envHint('AI_EMBEDDING_BASE_URL', 'sohbetle aynı')}>
                        <input id="ai-emb-base" className="m-input" inputMode="url" placeholder={s.env.AI_EMBEDDING_BASE_URL || (embedProvider && embedProvider !== provider ? 'Adres' : 'Sohbet adresi')} value={form.AI_EMBEDDING_BASE_URL || ''} onChange={e => set('AI_EMBEDDING_BASE_URL', e.target.value)} />
                    </Field>
                    {secretField('AI_EMBEDDING_API_KEY', 'ai-emb-key', 'Embedding API anahtarı')}
                </div>
            </details>

            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="m-btn m-btn-gray" disabled={!!busy} onClick={() => run('test')}><Icon name="activity" size={18} />{busy === 'test' ? 'Test ediliyor…' : 'Bağlantıyı test et'}</button>
                <button type="button" className="m-btn m-btn-primary" disabled={!!busy || !s.store.available} onClick={() => run('save')}><Icon name="check" size={18} />{busy === 'save' ? 'Kaydediliyor…' : 'Kaydet'}</button>
                {s.source === 'panel' && <button type="button" className="m-btn m-btn-plain" disabled={!!busy} onClick={() => run('clear')}>Ortam değişkenlerine dön</button>}
            </div>
            <p className="m-0 text-[13px] m-text-3">Test, formdaki değerlerle (kaydetmeden) sağlayıcıya kısa bir istek atar; embedding modeli varsa onu da dener. Boş alanlar ortam değişkenini kullanır. Erişim koruması, hız sınırı ve izinli kökenler yalnız ortam değişkenidir.</p>

            {test && (
                <div className="flex flex-col gap-1" aria-live="polite">
                    <TestLine label="Sohbet" part={test.chat} ok={`yanıt ${sec(test.chat.latencyMs)} içinde geldi · ${test.chat.model}${test.auto?.model ? ' (otomatik seçildi)' : ''}${test.chat.reply ? ` · "${test.chat.reply}"` : ''}`} />
                    {test.embed && <TestLine label="Anlamsal arama" part={test.embed} ok={`${test.embed.dimensions} boyutlu vektör, ${sec(test.embed.latencyMs)} · ${test.embed.model}${test.auto?.embeddingModel ? ' (otomatik seçildi)' : ''}`} />}
                </div>
            )}
            {message && <p role={message.ok ? 'status' : 'alert'} className={`m-0 text-[14px] ${message.ok ? 'm-ink-ok' : 'm-ink-bad'}`}>{message.text}</p>}
            {s.updatedAt && s.source === 'panel' && <p className="m-0 text-[12.5px] m-text-3">Panel ayarı son güncelleme: {new Date(s.updatedAt).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>}
        </div>
    );
};

export default AiConnection;
