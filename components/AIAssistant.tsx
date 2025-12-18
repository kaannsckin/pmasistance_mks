
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Task, Resource, Note } from '../types';

// Moderasyon Kategorileri ve Eşikleri (Basit tanımlar, SDK kurallarına uygun olarak string değerleri kullanılır)
enum HarmCategory {
  HARM_CATEGORY_HARASSMENT = 'HARM_CATEGORY_HARASSMENT',
  HARM_CATEGORY_HATE_SPEECH = 'HARM_CATEGORY_HATE_SPEECH',
  HARM_CATEGORY_SEXUALLY_EXPLICIT = 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  HARM_CATEGORY_DANGEROUS_CONTENT = 'HARM_CATEGORY_DANGEROUS_CONTENT',
}

enum HarmBlockThreshold {
  BLOCK_LOW_AND_ABOVE = 'BLOCK_LOW_AND_ABOVE',
  BLOCK_MEDIUM_AND_ABOVE = 'BLOCK_MEDIUM_AND_ABOVE',
  BLOCK_ONLY_HIGH = 'BLOCK_ONLY_HIGH',
  BLOCK_NONE = 'BLOCK_NONE',
}

interface AIAssistantProps {
  tasks: Task[];
  resources: Resource[];
  notes: Note[];
}

interface Message {
  role: 'user' | 'assistant' | 'system_alert';
  content: string;
}

// Yerel Hassas Kelime Listesi (Basit Moderasyon Katmanı)
const BLOCKED_KEYWORDS = ['küfür1', 'argo2', 'saldırı', 'tehdit', 'hakaret', 'şifre iste', 'kredi kartı'];

const AIAssistant: React.FC<AIAssistantProps> = ({ tasks, resources, notes }) => {
  const [isActivated, setIsActivated] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Uygulama açıldığında veya sayfa değiştiğinde API anahtarı durumunu kontrol et
  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setIsActivated(hasKey);
      }
    };
    checkApiKey();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleActivateAI = async () => {
    try {
      // Önce diyaloğu aç (Bu işlem kullanıcıdan seçim bekler)
      if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
        await window.aistudio.openSelectKey();
        // Kurallara göre: openSelectKey çağrıldıktan sonra kullanıcı başarılı kabul edilir
        setIsActivated(true);
      } else {
        // Geliştirme ortamı veya fallback
        setIsActivated(true);
      }
    } catch (error) {
      console.error("Anahtar seçim hatası:", error);
      alert("API anahtarı seçimi sırasında bir sorun oluştu.");
    }
  };

  const handleDeactivateAI = () => {
    setIsActivated(false);
    setMessages([]);
    // Not: Kullanıcı tekrar aktif etmek isterse tekrar openSelectKey tetiklenecek
  };

  const checkLocalModeration = (text: string): boolean => {
    const lowerText = text.toLocaleLowerCase('tr-TR');
    return BLOCKED_KEYWORDS.some(word => lowerText.includes(word));
  };

  const generateContext = () => {
    const now = new Date();
    return `
      Sistem Bilgisi:
      - Bugünün Tarihi: ${now.toLocaleDateString('tr-TR')}
      - Proje Verileri: ${tasks.length} Görev, ${resources.length} Kaynak, ${notes.length} Not.
      Talimat: Sadece proje yönetimi ve verileriyle ilgili yanıt ver. Markdown kullan.
    `;
  };

  const handleSend = async (customPrompt?: string) => {
    const prompt = customPrompt || inputValue;
    if (!prompt.trim()) return;

    setModerationError(null);

    // 1. Katman: Yerel Girdi Denetimi
    if (checkLocalModeration(prompt)) {
      setModerationError("Mesajınız güvenlik politikalarımız gereği uygunsuz içerik barındırıyor olabilir.");
      return;
    }

    if (!customPrompt) setInputValue('');
    setMessages(prev => [...prev, { role: 'user', content: prompt }]);
    setIsTyping(true);

    try {
      // Her istekte yeni instance oluştur (Güncel API Key için kritik)
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      // Fix: Structured contents correctly with parts as per guidelines
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { text: generateContext() },
            { text: prompt }
          ]
        },
        config: {
          systemInstruction: 'Sen profesyonel bir proje asistanısın. Etik kurallara uyar, sadece iş verilerini analiz edersin.',
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
          ]
        }
      });

      // Fix: Accessed extracted string output from response.text property directly
      if (!response.text) {
        setMessages(prev => [...prev, { 
          role: 'system_alert', 
          content: "Üretilen yanıt güvenlik filtrelerine takıldığı için görüntülenemiyor. Lütfen sorunuzu iş odaklı şekilde yeniden düzenleyin." 
        }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: response.text }]);
      }

    } catch (error: any) {
      console.error("AI Error:", error);
      let errorMsg = "Bir hata oluştu. Lütfen tekrar deneyin.";
      
      if (error?.message?.includes("safety")) {
        errorMsg = "Güvenlik Duvarı: Talebiniz veya oluşturulan yanıt topluluk kurallarını ihlal ediyor olabilir.";
      } else if (error?.message?.includes("Requested entity was not found") || error?.status === 404) {
        // API Key geçersizse veya bulunamadıysa asistanı kapat ve kullanıcıyı anahtar seçimine zorla
        setIsActivated(false);
        errorMsg = "Geçersiz veya eksik API Anahtarı. Lütfen tekrar yetkilendirin.";
      }

      setMessages(prev => [...prev, { role: 'system_alert', content: errorMsg }]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!isActivated) {
    return (
      <div className="max-w-4xl mx-auto h-[70vh] flex items-center justify-center p-6">
        <div className="bg-white dark:bg-gray-800 rounded-[3rem] shadow-2xl border border-gray-100 dark:border-gray-700 p-12 text-center relative overflow-hidden group">
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-colors"></div>
          <div className="relative z-10">
            <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner ring-8 ring-indigo-50/50">
              <i className="fa-solid fa-shield-halved text-4xl animate-pulse"></i>
            </div>
            <h2 className="text-4xl font-black text-gray-800 dark:text-white mb-6 tracking-tight">Güvenli Yapay Zeka</h2>
            <p className="text-gray-500 dark:text-gray-400 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
              PlanAsistan AI'yı kullanabilmek için Google Gemini API anahtarınızı seçmeniz gerekmektedir. Verileriniz gizli tutulur ve analizler iş verilerinizle sınırlı kalır.
            </p>
            <div className="flex flex-col items-center space-y-4">
              <button 
                onClick={handleActivateAI}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-4 rounded-2xl font-black text-lg shadow-xl transition-all hover:scale-105 flex items-center space-x-3"
              >
                <i className="fa-solid fa-key"></i>
                <span>API Anahtarı Seç ve Başlat</span>
              </button>
              <a 
                href="https://ai.google.dev/gemini-api/docs/billing" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[10px] text-gray-400 hover:text-blue-500 font-bold uppercase tracking-widest transition-colors"
              >
                Faturalandırma ve API Dokümantasyonu <i className="fa-solid fa-external-link-alt ml-1"></i>
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-6 animate-fade-in">
      <aside className="hidden lg:flex w-80 flex-col gap-4">
        <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
          <i className="fa-solid fa-user-shield absolute -right-6 -bottom-6 text-9xl opacity-10"></i>
          <h3 className="font-black text-lg mb-2">Denetimli Erişim</h3>
          <p className="text-xs opacity-80 leading-relaxed mb-6">Tüm sorgular kurumsal güvenlik politikalarına uygun olarak taranmaktadır.</p>
          <div className="space-y-3 relative z-10">
             <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest bg-white/10 p-2 rounded-lg border border-white/20">
              <span>Moderasyon</span>
              <span className="text-emerald-300">AKTİF</span>
            </div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm flex-grow">
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Analiz Önerileri</h4>
          <div className="space-y-2">
            {[
              { l: 'Verimlilik Analizi', p: 'Görevlerin tamamlanma hızına göre ekip verimliliğini değerlendir.' },
              { l: 'Gecikme Tahmini', p: 'Mevcut duruma göre hangi görevlerin sarkma riski var?' },
              { l: 'Birim Dengesi', p: 'Birimler arasındaki iş yükü dağılımını optimize et.' }
            ].map((item, i) => (
              <button key={i} onClick={() => handleSend(item.p)} className="w-full text-left px-4 py-2 text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 rounded-xl transition-all">
                <i className="fa-solid fa-magnifying-glass-chart mr-2 opacity-50"></i> {item.l}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="flex-grow flex-col bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden relative flex">
        <div className="flex-none px-8 py-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/20">
          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest italic">Güvenli Oturum Aktif</span>
          </div>
          <button onClick={handleDeactivateAI} className="text-[10px] font-black text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest">
            Bağlantıyı Kes
          </button>
        </div>

        <div ref={scrollRef} className="flex-grow overflow-y-auto p-8 space-y-8 custom-scrollbar">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center opacity-40">
              <i className="fa-solid fa-comment-dots text-6xl mb-6 text-indigo-200"></i>
              <h3 className="text-2xl font-black text-gray-800 dark:text-white mb-2">Asistan Hazır</h3>
              <p className="text-gray-500 text-sm italic">Projeniz hakkında her şeyi sorabilirsiniz. Yanıtlar gerçek zamanlı analiz edilir.</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                <div className={`flex gap-4 max-w-[90%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`flex-none w-8 h-8 rounded-xl flex items-center justify-center text-xs shadow-sm ${
                    msg.role === 'user' ? 'bg-indigo-600 text-white' : 
                    msg.role === 'system_alert' ? 'bg-red-500 text-white' : 'bg-white dark:bg-gray-700 border dark:border-gray-600 text-indigo-600'
                  }`}>
                    <i className={`fa-solid ${msg.role === 'user' ? 'fa-user' : msg.role === 'system_alert' ? 'fa-triangle-exclamation' : 'fa-robot'}`}></i>
                  </div>
                  <div className={`p-5 rounded-2xl text-sm leading-relaxed shadow-sm border ${
                    msg.role === 'user' ? 'bg-indigo-600 text-white border-indigo-500' : 
                    msg.role === 'system_alert' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 border-gray-100 dark:border-gray-700'
                  }`}>
                    <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                  </div>
                </div>
              </div>
            ))
          )}
          {isTyping && (
            <div className="flex justify-start animate-pulse">
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-2xl flex items-center space-x-2">
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-none p-6 bg-gray-50/80 dark:bg-gray-900/40 border-t dark:border-gray-700">
          {moderationError && (
             <div className="max-w-4xl mx-auto mb-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-3 rounded-xl flex items-center text-xs text-red-700 dark:text-red-400 animate-shake">
                <i className="fa-solid fa-circle-exclamation mr-2"></i>
                {moderationError}
             </div>
          )}
          <div className="max-w-4xl mx-auto relative group">
            <input 
              type="text" 
              value={inputValue} 
              onChange={e => {
                setInputValue(e.target.value);
                if(moderationError) setModerationError(null);
              }} 
              onKeyDown={e => e.key === 'Enter' && handleSend()} 
              placeholder="Güvenli analiz için sorunuzu yazın..." 
              className={`w-full pl-6 pr-16 py-4 bg-white dark:bg-gray-800 border ${moderationError ? 'border-red-500 shadow-red-50' : 'border-gray-200 dark:border-gray-700'} rounded-2xl shadow-xl outline-none transition-all group-hover:border-indigo-300`}
            />
            <button 
              onClick={() => handleSend()} 
              disabled={isTyping || !inputValue.trim()} 
              className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 bg-indigo-600 text-white rounded-xl shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center"
            >
              <i className="fa-solid fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;
