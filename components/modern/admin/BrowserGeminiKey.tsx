import React, { useState } from 'react';
import { GEMINI_KEY_URL } from '../../../utils/ai/adminConfig';
import { AiError, fetchAiStatus, hasCredentials, isBrowserKeyFormat, loadBrowserKey, saveBrowserKey, streamChat } from '../../../utils/ai/client';
import { AiStatus } from '../../../utils/ai/protocol';
import { Icon } from '../icons';
import { Field } from '../ui';

/**
 * Bu tarayıcıda Gemini test anahtarı: sunucuda hiçbir ayar gerekmeden yalnız
 * Google AI Studio anahtarıyla asistanı denemek için. Anahtar yalnız bu
 * tarayıcıda saklanır ve AI isteklerinde proxy'ye gider; proxy bu tarayıcının
 * isteklerini Gemini'ye yönlendirir (model ve anlamsal arama otomatik seçilir).
 * Diğer kullanıcılar sunucu ayarıyla çalışmaya devam eder.
 */

interface Props {
    /** Proxy'nin bu tarayıcı için bildirdiği durum (kayıtlı anahtar dahil) */
    status?: (AiStatus & { unreachable?: boolean }) | null;
    onChanged: (label: string) => void;
    /** Sunucu tarafı kurulum yoksa açık gelir */
    open?: boolean;
}

const sec = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn`);

const BrowserGeminiKey: React.FC<Props> = ({ status, onChanged, open }) => {
    const [active, setActive] = useState(loadBrowserKey);
    const [input, setInput] = useState('');
    const [editing, setEditing] = useState(false);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
    const disabled = status?.browserKeyAllowed === false;
    const current = active && status?.configSource === 'browser' ? status : null;

    const use = async () => {
        const key = input.trim();
        if (!isBrowserKeyFormat(key)) {
            setResult({ ok: false, text: 'Anahtar biçimi tanınmadı: Google AI Studio anahtarı harf, rakam, - ve _ karakterlerinden oluşur (genellikle "AIza" ile başlar).' });
            return;
        }
        setRunning(true);
        setResult(null);
        try {
            // 1) Anahtarla model listesi: anahtar geçerli mi, hangi modeller seçildi
            const s = await fetchAiStatus(undefined, key);
            if (s.unreachable) throw new Error(s.problem || 'AI sunucusuna ulaşılamadı.');
            if (s.configSource !== 'browser') throw new Error('Sunucu tarayıcı anahtarını tanımadı; uygulamanın yayındaki sürümü eski olabilir.');
            if (!s.configured || !s.model) throw new Error(s.problem || 'Gemini bağlantısı kurulamadı.');
            // 2) Kısa bir sohbet isteği (erişim kodu / oturum varsa)
            let note = '';
            if (await hasCredentials(s.authMode)) {
                const t0 = performance.now();
                try {
                    await streamChat({ messages: [{ role: 'user', content: 'Yalnızca "tamam" yaz.' }] }, { authMode: s.authMode, browserKey: key });
                    note = ` Deneme yanıtı ${sec(performance.now() - t0)} içinde geldi.`;
                } catch (e) {
                    const code = (e as AiError).code;
                    // Anahtar geçerli (model listesi alındı); oturum ya da Gemini hız sınırı sonradan düzelir
                    if (code === 'auth' || code === 'forbidden') note = ' Sohbet denenemedi: AI erişim kodu ya da oturumu doğrulanamadı (asistandan yeniden girin).';
                    else if (code === 'rate_limited') note = ' Gemini şu an hız sınırında; biraz sonra yanıt verir.';
                    else throw e;
                }
            } else {
                note = s.authMode === 'token' ? ' Sohbet için asistanda AI erişim kodunu da girin.' : ' Sohbet için bulut penceresinden giriş yapın.';
            }
            saveBrowserKey(key);
            setActive(key);
            setInput('');
            setEditing(false);
            const what = `${s.model}${s.embeddingModel ? `, anlamsal arama ${s.embeddingModel}` : ''}`;
            onChanged(`AI bağlantısı: bu tarayıcıda Gemini test anahtarı (${what})`);
            setResult({ ok: true, text: `Hazır: ${what}. Asistan ve ekran içi AI bu tarayıcıda Gemini ile çalışır.${note}` });
        } catch (e) {
            setResult({ ok: false, text: (e as Error).message });
        } finally {
            setRunning(false);
        }
    };

    const remove = () => {
        saveBrowserKey(null);
        setActive(null);
        setResult({ ok: true, text: 'Test anahtarı bu tarayıcıdan silindi; sunucu ayarı kullanılıyor.' });
        onChanged('AI bağlantısı: bu tarayıcıdaki Gemini test anahtarı kaldırıldı');
    };

    const form = (
        <div className="flex flex-col gap-2.5">
            {!active && (
                <ol className="m-0 pl-5 list-decimal text-[14px] m-text-2 flex flex-col gap-0.5">
                    <li>Google hesabınızla Google AI Studio'yu açın: <a className="m-accent" href={GEMINI_KEY_URL} target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a></li>
                    <li>"Create API key" ile bir anahtar oluşturup kopyalayın.</li>
                    <li>Anahtarı buraya yapıştırıp "Bu tarayıcıda kullan" deyin: anahtar denenir, model ve anlamsal arama otomatik seçilir. Sunucuda ayar gerekmez.</li>
                </ol>
            )}
            <div className="flex flex-wrap items-end gap-2">
                <Field label={active ? 'Yeni Gemini API anahtarı' : 'Gemini API anahtarı'} htmlFor="ai-browser-key">
                    <input id="ai-browser-key" type="password" autoComplete="off" className="m-input !w-[300px] max-w-full" placeholder="AIza…" value={input} onChange={e => { setInput(e.target.value); setResult(null); }} />
                </Field>
                <button type="button" className="m-btn m-btn-primary" disabled={!input.trim() || running} onClick={use}><Icon name="key" size={18} />{running ? 'Deneniyor…' : 'Bu tarayıcıda kullan'}</button>
                {active && <button type="button" className="m-btn m-btn-plain" disabled={running} onClick={() => { setEditing(false); setInput(''); setResult(null); }}>Vazgeç</button>}
            </div>
        </div>
    );

    return (
        <details open={open || !!active} className="rounded-xl p-3.5 m-fill-2">
            <summary className="cursor-pointer text-[15px] font-semibold m-text min-h-[30px] flex flex-wrap items-center gap-2">
                <Icon name="key" size={18} />Bu tarayıcıda Gemini test anahtarı
                <span className="text-[13px] font-normal m-text-3">sunucuda ayar gerekmez</span>
                {active && <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[12.5px] font-semibold m-tone-ok">Etkin · …{active.slice(-4)}</span>}
            </summary>
            <div className="flex flex-col gap-2.5 mt-2">
                {disabled ? (
                    <p className="m-0 text-[14px] m-ink-warn">Bu sunucuda tarayıcı test anahtarı kapalı (AI_ALLOW_BROWSER_KEY=0).{active ? ' Kayıtlı anahtarı kaldırın.' : ''}</p>
                ) : active ? (
                    <p className="m-0 text-[14px] m-text-2">
                        Asistan ve ekran içi AI bu tarayıcıda Google Gemini'ye gider{current?.model ? ` (${current.model}${current.embeddingModel ? `, anlamsal arama ${current.embeddingModel}` : ''})` : ''}. Diğer kullanıcılar ve cihazlar sunucu ayarıyla çalışır.
                    </p>
                ) : (
                    <p className="m-0 text-[14px] m-text-2">Sunucu ayarına dokunmadan, yalnız bu tarayıcıda kendi Google AI Studio anahtarınızla asistanı deneyin.</p>
                )}
                {active && current && !current.configured && current.problem && <p className="m-0 text-[13px] m-ink-warn">{current.problem}</p>}
                {!disabled && (!active || editing) && form}
                {active && !editing && (
                    <div className="flex flex-wrap gap-2">
                        {!disabled && <button type="button" className="m-btn m-btn-gray" onClick={() => { setEditing(true); setResult(null); }}><Icon name="pencil" size={16} />Anahtarı değiştir</button>}
                        <button type="button" className="m-btn m-btn-plain" onClick={remove}><Icon name="trash" size={16} />Kaldır</button>
                    </div>
                )}
                {result && <p role={result.ok ? 'status' : 'alert'} className={`m-0 text-[14px] ${result.ok ? 'm-ink-ok' : 'm-ink-bad'}`}>{result.text}</p>}
                <p className="m-0 text-[12.5px] m-text-3">
                    Anahtar yalnız bu tarayıcının deposunda tutulur (çalışma alanı verisine ve buluta girmez) ve her AI isteğinde uygulamanın sunucusu üzerinden Google'a iletilir; sunucu onu saklamaz. Asistan sorunuza göre proje, görev ve kişi bilgilerini Google'a gönderir; "Ad maskeleme" açıkken (varsayılan) kişi, proje ve kurum adları takma adla gider, sicil numaraları her durumda maskelenir. Ücretsiz katman denemek içindir: dakikalık istek sınırı düşüktür ve Google'ın koşullarına göre gönderilen içerik Google ürünlerini geliştirmek için kullanılabilir; gerçek kurum verisiyle kalıcı kullanımda faturalı katmanı ve KVKK değerlendirmesini tercih edin. Paylaşılan bilgisayarda kullanmayın; işiniz bitince kaldırın.
                </p>
            </div>
        </details>
    );
};

export default BrowserGeminiKey;
