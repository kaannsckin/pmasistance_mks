import React, { useEffect, useRef, useState } from 'react';
import Markdown from '../Markdown';
import { AgentStep } from '../../utils/ai/agent';
import { useAssistant } from './AssistantContext';

/**
 * Sohbet arayüzü — yan panelde (compact) ve Zekâ sekmesinde (page) aynı
 * sohbeti gösterir. Model yanıtları güvenli markdown ile, araç adımları
 * yanıtın üstünde küçük etiketler olarak görünür.
 */

interface Props {
  variant: 'page' | 'panel';
  suggestions: { label: string; prompt: string }[];
  onClose?: () => void;
  onExpand?: () => void;
}

const StepChips: React.FC<{ steps: AgentStep[] }> = ({ steps }) => (
  <div className="flex flex-wrap gap-1.5 mb-2">
    {steps.map(s => (
      <span
        key={s.id}
        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
          s.status === 'error' ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
            : 'border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300'}`}
        title={s.status === 'error' ? 'Araç bir hata döndürdü' : 'Uygulama verisinden okundu'}
      >
        <i className={`fa-solid ${s.status === 'running' ? 'fa-circle-notch fa-spin' : s.status === 'error' ? 'fa-triangle-exclamation' : 'fa-database'} text-[9px]`}></i>
        {s.label}
      </span>
    ))}
  </div>
);

const Dots = () => (
  <div className="flex items-center space-x-1.5 py-1">
    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
  </div>
);

const AssistantChat: React.FC<Props> = ({ variant, suggestions, onClose, onExpand }) => {
  const a = useAssistant();
  const [input, setInput] = useState('');
  const [token, setToken] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const compact = variant === 'panel';

  useEffect(() => { a.ensureReady(); }, [a.ensureReady]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [a.messages]);

  useEffect(() => {
    if (a.phase === 'ready') inputRef.current?.focus();
  }, [a.phase]);

  const submit = (text?: string) => {
    const t = (text ?? input).trim();
    if (!t || a.isStreaming) return;
    if (text === undefined) setInput('');
    a.send(t);
  };

  const header = (
    <div className={`flex-none ${compact ? 'px-4 py-3' : 'px-8 py-4'} border-b dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/20`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-none"><i className="fa-solid fa-wand-magic-sparkles text-xs"></i></span>
        <div className="min-w-0">
          <div className="text-sm font-black text-gray-800 dark:text-white leading-tight">AI Asistan</div>
          <div className="text-[10px] text-gray-400 truncate">
            {a.phase === 'ready' ? `Bağlı${a.status?.model ? ` · ${a.status.model}` : ''} · salt-okunur` : a.phase === 'loading' ? 'Bağlanıyor…' : 'Hazır değil'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-none">
        {a.messages.length > 0 && (
          <button onClick={a.clear} title="Sohbeti temizle" className="w-8 h-8 rounded-lg text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-gray-800 transition-colors">
            <i className="fa-solid fa-broom text-xs"></i>
          </button>
        )}
        {onExpand && (
          <button onClick={onExpand} title="Tam ekranda aç" className="w-8 h-8 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-gray-800 transition-colors">
            <i className="fa-solid fa-up-right-and-down-left-from-center text-xs"></i>
          </button>
        )}
        {onClose && (
          <button onClick={onClose} title="Kapat (Esc)" className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-white dark:hover:bg-gray-800 transition-colors">
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>
    </div>
  );

  const phaseScreen = () => {
    if (!a.enabled) {
      return <div className="h-full flex items-center justify-center text-gray-400 text-sm text-center px-6"><i className="fa-solid fa-power-off mr-2"></i>Yapay zekâ asistanı Ayarlar'dan kapatılmış.</div>;
    }
    if (a.phase === 'idle' || a.phase === 'loading') {
      return <div className="h-full flex items-center justify-center text-gray-400 text-sm"><i className="fa-solid fa-circle-notch fa-spin mr-2"></i>AI bağlantısı kontrol ediliyor…</div>;
    }
    const box = (icon: string, title: string, body: React.ReactNode) => (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-5"><i className={`fa-solid ${icon} text-2xl`}></i></div>
          <h3 className="text-lg font-black text-gray-800 dark:text-white mb-3">{title}</h3>
          {body}
        </div>
      </div>
    );
    if (a.phase === 'unavailable') {
      return box('fa-plug-circle-xmark', 'Yapay Zekâ Henüz Hazır Değil', (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{a.status?.problem || 'AI sunucusu yapılandırılmamış.'}</p>
          <p className="text-xs text-gray-400 mb-5">Kurumsal AI anahtarı yalnızca sunucuda tutulur. Yöneticiniz <code className="font-mono">AI_PROVIDER</code>, <code className="font-mono">AI_API_KEY</code>, <code className="font-mono">AI_MODEL</code> değişkenlerini tanımladığında asistan açılır (docs/AI_KURULUM.md).</p>
          <button onClick={a.recheck} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold"><i className="fa-solid fa-rotate-right mr-2"></i>Tekrar Dene</button>
        </>
      ));
    }
    if (a.phase === 'needs_token') {
      return box('fa-key', 'Erişim Kodu Gerekli', (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Kurumsal AI asistanı yetkili kullanıcılara açıktır. Yöneticinizden aldığınız erişim kodunu girin; kod yalnızca bu cihazda saklanır.</p>
          {a.authError && <p className="text-sm text-red-600 mb-3">{a.authError}</p>}
          <div className="flex gap-2">
            <input
              type="password" value={token} autoComplete="off" placeholder="Erişim kodu"
              onChange={e => setToken(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && token.trim()) { a.saveToken(token); setToken(''); } }}
              className="flex-grow px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-indigo-400 text-sm"
            />
            <button onClick={() => { a.saveToken(token); setToken(''); }} disabled={!token.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">Başlat</button>
          </div>
        </>
      ));
    }
    return box('fa-right-to-bracket', 'Giriş Yapmanız Gerekiyor', (
      <>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">AI asistanı çalışma alanı üyelerine açıktır. Sağ üstteki <i className="fa-solid fa-cloud"></i> bulut penceresinden giriş yapıp tekrar deneyin.</p>
        {a.authError && <p className="text-sm text-red-600 mb-3">{a.authError}</p>}
        <button onClick={a.recheck} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold"><i className="fa-solid fa-rotate-right mr-2"></i>Tekrar Dene</button>
      </>
    ));
  };

  const empty = (
    <div className={`h-full flex flex-col items-center justify-center text-center ${compact ? 'px-2' : 'max-w-2xl mx-auto'}`}>
      <i className="fa-solid fa-comment-dots text-5xl mb-4 text-indigo-200 dark:text-indigo-800"></i>
      <h3 className="text-lg font-black text-gray-800 dark:text-white mb-1">Size nasıl yardımcı olabilirim?</h3>
      <p className="text-xs text-gray-400 mb-5">Portföy, tahsis, kapasite, risk ve görevler hakkında sorun — yanıtlar, yetkinizdeki uygulama verisinden hesaplanır.</p>
      <div className={`grid gap-2 w-full ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {suggestions.map(s => (
          <button key={s.label} onClick={() => submit(s.prompt)} className="text-left px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-indigo-300 hover:text-indigo-600 rounded-xl transition-colors">
            <i className="fa-solid fa-magnifying-glass-chart mr-2 opacity-50"></i>{s.label}
          </button>
        ))}
      </div>
    </div>
  );

  const list = (
    <div className={compact ? 'space-y-5' : 'space-y-8'}>
      {a.messages.map(msg => (
        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`flex gap-3 ${compact ? 'max-w-[95%]' : 'max-w-[90%]'} ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {!compact && (
              <div className={`flex-none w-8 h-8 rounded-xl flex items-center justify-center text-xs shadow-sm ${
                msg.role === 'user' ? 'bg-indigo-600 text-white' : msg.role === 'system_alert' ? 'bg-red-500 text-white' : 'bg-white dark:bg-gray-700 border dark:border-gray-600 text-indigo-600'}`}>
                <i className={`fa-solid ${msg.role === 'user' ? 'fa-user' : msg.role === 'system_alert' ? 'fa-triangle-exclamation' : 'fa-robot'}`}></i>
              </div>
            )}
            <div className={`${compact ? 'px-3.5 py-2.5' : 'p-5'} rounded-2xl text-sm leading-relaxed shadow-sm border min-w-0 ${
              msg.role === 'user' ? 'bg-indigo-600 text-white border-indigo-500'
                : msg.role === 'system_alert' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
                  : 'bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 border-gray-100 dark:border-gray-700'}`}>
              {msg.role === 'assistant' ? (
                <>
                  {msg.steps && msg.steps.length > 0 && <StepChips steps={msg.steps} />}
                  {msg.content ? <Markdown text={msg.content} /> : msg.streaming ? <Dots /> : null}
                </>
              ) : (
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 overflow-hidden">
      {header}
      <div ref={scrollRef} className={`flex-grow overflow-y-auto ${compact ? 'p-4' : 'p-8'} custom-scrollbar`}>
        {a.phase !== 'ready' || !a.enabled ? phaseScreen() : a.messages.length === 0 ? empty : list}
      </div>
      {a.phase === 'ready' && a.enabled && (
        <div className={`flex-none ${compact ? 'p-3' : 'p-6'} bg-gray-50/80 dark:bg-gray-900/40 border-t dark:border-gray-700`}>
          <div className={`${compact ? '' : 'max-w-4xl mx-auto'} relative`}>
            <textarea
              ref={inputRef}
              rows={compact ? 2 : 1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
              placeholder="Sorunuzu yazın… (Shift+Enter: yeni satır)"
              className="w-full pl-4 pr-14 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm outline-none focus:border-indigo-300 resize-none max-h-40 text-sm"
            />
            {a.isStreaming ? (
              <button onClick={a.stop} title="Yanıtı durdur" className="absolute right-2 bottom-2.5 w-10 h-10 bg-red-500 text-white rounded-xl shadow hover:bg-red-600 flex items-center justify-center">
                <i className="fa-solid fa-stop"></i>
              </button>
            ) : (
              <button onClick={() => submit()} disabled={!input.trim()} title="Gönder" className="absolute right-2 bottom-2.5 w-10 h-10 bg-indigo-600 text-white rounded-xl shadow hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center">
                <i className="fa-solid fa-paper-plane"></i>
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">Asistan veriyi okuyabilir, değiştiremez. Önemli kararlardan önce sayıları ilgili ekranda doğrulayın.</p>
        </div>
      )}
    </div>
  );
};

export default AssistantChat;
