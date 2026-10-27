import React, { useState } from 'react';
import { GEMINI_KEY_URL } from '../../../utils/ai/adminConfig';
import {
    AiError, BrowserAiProvider, BrowserConnection, browserSettingsExpired, fetchAiStatus, isBrowserKeyFormat, loadAccessToken, loadBrowserConnection,
    saveAccessToken, saveBrowserConnection, streamChat,
} from '../../../utils/ai/client';
import { AiStatus } from '../../../utils/ai/protocol';
import { Icon } from '../icons';
import { Field } from '../ui';

/**
 * Bu tarayıcıda AI bağlantısı: sunucuda hiçbir ayar (Vercel ortam değişkeni)
 * gerekmeden sağlayıcı, model ve API anahtarı buradan girilir. Bağlantı ve
 * (sunucu isterse) AI erişim kodu yalnız bu tarayıcıda 24 saat saklanır; süre
 * dolunca silinir ve bu bölüm yeniden sorar. AI istekleri uygulamanın sunucusu
 * üzerinden sağlayıcıya gider; sunucu anahtarı saklamaz. Diğer kullanıcılar ve
 * cihazlar sunucu ayarıyla çalışmaya devam eder.
 */

interface Props {
    /** Proxy'nin bu tarayıcı için bildirdiği durum (kayıtlı bağlantı dahil) */
    status?: (AiStatus & { unreachable?: boolean }) | null;
    onChanged: (label: string) => void;
    /** Sunucu tarafı kurulum yoksa açık gelir */
    open?: boolean;
}

const PROVIDERS: { id: BrowserAiProvider; label: string; keyHint: string; modelHint: string }[] = [
    { id: 'gemini', label: 'Google Gemini', keyHint: 'AIza…', modelHint: 'Boş bırakın: en güncel kararlı Flash modeli seçilir' },
    { id: 'openai', label: 'OpenAI', keyHint: 'sk-…', modelHint: 'ör. gpt-4.1-mini' },
    { id: 'anthropic', label: 'Anthropic', keyHint: 'sk-ant-…', modelHint: 'ör. claude-sonnet-5-5' },
    { id: 'azure', label: 'Azure OpenAI', keyHint: 'Azure anahtarı', modelHint: 'Dağıtım (deployment) adı' },
];

const sec = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn`);
const until = (t: number) => new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const BrowserAiConnection: React.FC<Props> = ({ status, onChanged, open }) => {
    const [active, setActive] = useState(loadBrowserConnection);
    const [expired] = useState(() => !active && browserSettingsExpired());
    const [form, setForm] = useState<{ provider: BrowserAiProvider; apiKey: string; model: string; baseUrl: string; accessToken: string }>(() => ({
        provider: active?.provider || 'gemini', apiKey: '', model: active?.model || '', baseUrl: active?.baseUrl || '', accessToken: '',
    }));
    const [editing, setEditing] = useState(false);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
    const disabled = status?.browserKeyAllowed === false;
    const current = active && status?.configSource === 'browser' ? status : null;
    const needsToken = status?.authMode === 'token';
    const meta = PROVIDERS.find(p => p.id === form.provider)!;
    const set = (patch: Partial<typeof form>) => { setForm(f => ({ ...f, ...patch })); setResult(null); };

    const use = async () => {
        const conn: BrowserConnection = {
            provider: form.provider,
            apiKey: form.apiKey.trim(),
            ...(form.model.trim() ? { model: form.model.trim() } : {}),
            ...(form.provider === 'azure' ? { baseUrl: form.baseUrl.trim().replace(/\/+$/, '') } : {}),
        };
        if (!isBrowserKeyFormat(conn.apiKey)) {
            setResult({ ok: false, text: 'API anahtarı biçimi tanınmadı: harf, rakam, nokta, - ve _ karakterlerinden oluşan en az 20 karakterlik bir anahtar girin.' });
            return;
        }
        if (form.provider !== 'gemini' && !conn.model) { setResult({ ok: false, text: 'Model adını girin.' }); return; }
        if (form.provider === 'azure' && !/^https:\/\/[a-z0-9-]+\.openai\.azure\.com/.test(conn.baseUrl || '')) {
            setResult({ ok: false, text: 'Azure adresi https://KAYNAK.openai.azure.com/openai/v1 biçiminde olmalı.' });
            return;
        }
        setRunning(true);
        setResult(null);
        try {
            // 1) Sunucu bağlantıyı tanıyor mu, yapılandırma tamam mı (Gemini'de model listesi alınır)
            const s = await fetchAiStatus(undefined, conn);
            if (s.unreachable) throw new Error(s.problem || 'AI sunucusuna ulaşılamadı.');
            if (s.configSource !== 'browser') throw new Error('Sunucu tarayıcı bağlantısını tanımadı; uygulamanın yayındaki sürümü eski olabilir.');
            if (!s.configured || !s.model) throw new Error(s.problem || 'Bağlantı kurulamadı.');
            // 2) Erişim kodu: sunucu istiyorsa formdaki ya da kayıtlı kod (24 saat)
            const token = form.accessToken.trim();
            if (s.authMode === 'token' && token) saveAccessToken(token);
            // 3) Kısa bir sohbet isteği: anahtar ve model gerçekten çalışıyor mu
            let note = '';
            if (s.authMode === 'supabase' || (s.authMode === 'token' && !loadAccessToken())) {
                note = s.authMode === 'token' ? ' Sohbet için AI erişim kodunu da girin.' : ' Sohbet için bulut penceresinden giriş yapın.';
            } else {
                const t0 = performance.now();
                try {
                    await streamChat({ messages: [{ role: 'user', content: 'Yalnızca "tamam" yaz.' }] }, { authMode: s.authMode, browserKey: conn });
                    note = ` Deneme yanıtı ${sec(performance.now() - t0)} içinde geldi.`;
                } catch (e) {
                    const code = (e as AiError).code;
                    if (code === 'auth' || code === 'forbidden') {
                        if (s.authMode === 'token') saveAccessToken(null);
                        throw new Error(`AI erişim kodu doğrulanamadı: ${(e as Error).message}`);
                    }
                    if (code === 'rate_limited') note = ' Sağlayıcı şu an hız sınırında; biraz sonra yanıt verir.';
                    else throw e;
                }
            }
            saveBrowserConnection(conn);
            const saved = loadBrowserConnection();
            setActive(saved);
            setForm(f => ({ ...f, apiKey: '', accessToken: '' }));
            setEditing(false);
            const what = `${meta.label} · ${s.model}${s.embeddingModel ? `, anlamsal arama ${s.embeddingModel}` : ''}`;
            onChanged(`AI bağlantısı: bu tarayıcıda ${what}`);
            setResult({ ok: true, text: `Hazır: ${what}. ${saved ? `${until(saved.expiresAt)} tarihine kadar geçerli; sonra yeniden sorulur.` : ''}${note}` });
        } catch (e) {
            setResult({ ok: false, text: (e as Error).message });
        } finally {
            setRunning(false);
        }
    };

    const remove = () => {
        saveBrowserConnection(null);
        setActive(null);
        setResult({ ok: true, text: 'Bağlantı bu tarayıcıdan silindi; sunucu ayarı kullanılıyor.' });
        onChanged('AI bağlantısı: bu tarayıcıdaki bağlantı kaldırıldı');
    };

    const form_ = (
        <div className="flex flex-col gap-2.5">
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}>
                <Field label="Sağlayıcı" htmlFor="ai-browser-provider">
                    <select id="ai-browser-provider" className="m-input" value={form.provider} onChange={e => set({ provider: e.target.value as BrowserAiProvider, model: '' })}>
                        {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                </Field>
                <Field label="API anahtarı" htmlFor="ai-browser-key" hint={form.provider === 'gemini' ? undefined : 'Sağlayıcının konsolundan alınan anahtar'}>
                    <input id="ai-browser-key" type="password" autoComplete="off" className="m-input" placeholder={meta.keyHint} value={form.apiKey} onChange={e => set({ apiKey: e.target.value })} />
                </Field>
                <Field label={form.provider === 'gemini' ? 'Model (isteğe bağlı)' : 'Model'} htmlFor="ai-browser-model" hint={meta.modelHint}>
                    <input id="ai-browser-model" className="m-input" placeholder={form.provider === 'gemini' ? 'auto' : 'Model adı'} value={form.model} onChange={e => set({ model: e.target.value })} />
                </Field>
                {form.provider === 'azure' && (
                    <Field label="Azure adresi" htmlFor="ai-browser-base">
                        <input id="ai-browser-base" className="m-input" inputMode="url" placeholder="https://KAYNAK.openai.azure.com/openai/v1" value={form.baseUrl} onChange={e => set({ baseUrl: e.target.value })} />
                    </Field>
                )}
                {needsToken && (
                    <Field label="AI erişim kodu" htmlFor="ai-browser-token" hint={loadAccessToken() ? 'Kayıtlı kod var; değiştirmek için yazın' : 'Sunucu erişim kodu istiyor (AI_ACCESS_TOKEN)'}>
                        <input id="ai-browser-token" type="password" autoComplete="off" className="m-input" placeholder={loadAccessToken() ? 'Kayıtlı' : 'Erişim kodu'} value={form.accessToken} onChange={e => set({ accessToken: e.target.value })} />
                    </Field>
                )}
            </div>
            {form.provider === 'gemini' && !active && (
                <p className="m-0 text-[13px] m-text-3">Gemini anahtarı: <a className="m-accent" href={GEMINI_KEY_URL} target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a> › "Create API key".</p>
            )}
            <div className="flex flex-wrap gap-2">
                <button type="button" className="m-btn m-btn-primary" disabled={!form.apiKey.trim() || running} onClick={use}><Icon name="key" size={18} />{running ? 'Deneniyor…' : 'Dene ve bu tarayıcıda kullan'}</button>
                {active && <button type="button" className="m-btn m-btn-plain" disabled={running} onClick={() => { setEditing(false); set({ apiKey: '', accessToken: '' }); }}>Vazgeç</button>}
            </div>
        </div>
    );

    return (
        <details open={open || !!active || expired} className="rounded-xl p-3.5 m-fill-2">
            <summary className="cursor-pointer text-[15px] font-semibold m-text min-h-[30px] flex flex-wrap items-center gap-2">
                <Icon name="key" size={18} />Bu tarayıcıda AI bağlantısı
                <span className="text-[13px] font-normal m-text-3">sunucuda ayar gerekmez · 24 saat geçerli</span>
                {active && <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[12.5px] font-semibold m-tone-ok">Etkin · {PROVIDERS.find(p => p.id === active.provider)?.label} · …{active.apiKey.slice(-4)}</span>}
                {expired && <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[12.5px] font-semibold m-tone-warn">Süresi doldu</span>}
            </summary>
            <div className="flex flex-col gap-2.5 mt-2">
                {disabled ? (
                    <p className="m-0 text-[14px] m-ink-warn">Bu sunucuda tarayıcı bağlantısı kapalı (AI_ALLOW_BROWSER_KEY=0).{active ? ' Kayıtlı bağlantıyı kaldırın.' : ''}</p>
                ) : active ? (
                    <p className="m-0 text-[14px] m-text-2 flex items-start gap-1.5">
                        <Icon name="clock" size={16} className="mt-0.5 shrink-0" />
                        <span>Asistan ve ekran içi AI bu tarayıcıda {PROVIDERS.find(p => p.id === active.provider)?.label}{current?.model ? ` (${current.model}${current.embeddingModel ? `, anlamsal arama ${current.embeddingModel}` : ''})` : ''} ile çalışır. {until(active.expiresAt)} tarihine kadar geçerli; sonra bu bölüm yeniden sorar.</span>
                    </p>
                ) : expired ? (
                    <p className="m-0 text-[14px] m-ink-warn">Önceki bağlantının 24 saatlik süresi doldu; bilgileri yeniden girin.</p>
                ) : (
                    <p className="m-0 text-[14px] m-text-2">Sunucu ayarına (Vercel ortam değişkenlerine) dokunmadan sağlayıcı, model ve API anahtarını buradan girin. Bilgiler 24 saat bu tarayıcıda kalır, sonra yeniden sorulur.</p>
                )}
                {active && current && !current.configured && current.problem && <p className="m-0 text-[13px] m-ink-warn">{current.problem}</p>}
                {!disabled && (!active || editing) && form_}
                {active && !editing && (
                    <div className="flex flex-wrap gap-2">
                        {!disabled && <button type="button" className="m-btn m-btn-gray" onClick={() => { setEditing(true); setResult(null); }}><Icon name="pencil" size={16} />Değiştir / süreyi yenile</button>}
                        <button type="button" className="m-btn m-btn-plain" onClick={remove}><Icon name="trash" size={16} />Kaldır</button>
                    </div>
                )}
                {result && <p role={result.ok ? 'status' : 'alert'} className={`m-0 text-[14px] ${result.ok ? 'm-ink-ok' : 'm-ink-bad'}`}>{result.text}</p>}
                <p className="m-0 text-[12.5px] m-text-3">
                    Anahtar yalnız bu tarayıcının deposunda 24 saat tutulur (çalışma alanı verisine ve buluta girmez) ve her AI isteğinde uygulamanın sunucusu üzerinden sağlayıcıya iletilir; sunucu onu saklamaz. Asistan sorunuza göre proje, görev ve kişi bilgilerini sağlayıcıya gönderir; "Ad maskeleme" açıkken (varsayılan) kişi, proje ve kurum adları takma adla gider, sicil numaraları her durumda maskelenir. Ücretsiz katmanlarda gönderilen içerik sağlayıcının koşullarına göre ürün geliştirmede kullanılabilir; gerçek kurum verisiyle kalıcı kullanımda faturalı katmanı ve KVKK değerlendirmesini tercih edin. Paylaşılan bilgisayarda kullanmayın; işiniz bitince kaldırın.
                </p>
            </div>
        </details>
    );
};

export default BrowserAiConnection;
