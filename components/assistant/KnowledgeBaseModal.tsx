import React, { useEffect, useRef, useState } from 'react';
import { extractText, SUPPORTED_EXTENSIONS } from '../../utils/rag/extract';
import { RAG_SOURCE_LABELS, RagSourceType, UploadedDoc } from '../../utils/rag/sources';
import { addUploadedDoc, indexStatus, listUploadedDocs, onDocsChange, removeUploadedDoc, retriever } from '../../utils/rag/service';
import { useAssistant } from './AssistantContext';

/**
 * Bilgi Bankası: asistanın aradığı bilgi tabanının durumu ve kurumsal
 * dokümanlar (PDF, Word, Markdown, metin). Dokümanlar bu cihazda (tarayıcıda)
 * saklanır; metin çıkarma tamamen tarayıcıda yapılır.
 */

const fmtSize = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const KnowledgeBaseModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const a = useAssistant();
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [status, setStatus] = useState(indexStatus());
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = () => { listUploadedDocs().then(setDocs).catch(() => setDocs([])); };
    load();
    const offDocs = onDocsChange(load);
    const offIdx = retriever.onChange(() => setStatus(indexStatus()));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { offDocs(); offIdx(); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await a.refreshIndex();
    } finally {
      setRefreshing(false);
      setStatus(indexStatus());
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const errs: string[] = [];
    for (const file of Array.from(files)) {
      setBusy(`${file.name} okunuyor…`);
      try {
        const text = await extractText(file);
        await addUploadedDoc({ name: file.name, size: file.size, text });
      } catch (e) {
        errs.push(`${file.name}: ${(e as Error)?.message || 'okunamadı'}`);
      }
    }
    setBusy(null);
    setErrors(errs);
    if (fileRef.current) fileRef.current.value = '';
    await refresh();
  };

  const onDelete = async (d: UploadedDoc) => {
    if (!window.confirm(`"${d.name}" Bilgi Bankası'ndan silinsin mi?`)) return;
    await removeUploadedDoc(d.id);
    await refresh();
  };

  const semanticLine = () => {
    if (a.status?.embeddingProblem) return { tone: 'text-amber-600', text: `Anlamsal arama yapılandırılamadı: ${a.status.embeddingProblem}` };
    if (!status.semanticEnabled) {
      return { tone: 'text-gray-500', text: 'Anlamsal arama kapalı — sunucuda embedding modeli (AI_EMBEDDING_MODEL) tanımlı değil. Türkçe ek ve aksan duyarsız anahtar kelime araması kullanılıyor.' };
    }
    if (status.semanticError) return { tone: 'text-red-600', text: `Anlamsal arama durdu: ${status.semanticError} (anahtar kelime aramasıyla devam ediliyor).` };
    return {
      tone: 'text-emerald-600',
      text: `Anlamsal arama açık · ${status.model} · ${status.vectors}/${status.chunks} parça vektörlendi${status.embedding ? ' (sürüyor…)' : ''}`,
    };
  };
  const sem = semanticLine();

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()} role="dialog" aria-label="Bilgi Bankası">
        <div className="px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-gray-800 dark:text-white"><i className="fa-solid fa-book mr-2 text-indigo-600"></i>Bilgi Bankası</h2>
            <p className="text-xs text-gray-400">Asistanın anlam aradığı bilgi tabanı: uygulama içeriği, kullanım kılavuzu ve kurumsal dokümanlar.</p>
          </div>
          <button onClick={onClose} title="Kapat (Esc)" className="w-9 h-9 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white"><i className="fa-solid fa-xmark"></i></button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-500">Dizin durumu</h3>
              <button onClick={refresh} disabled={refreshing} className="text-xs font-bold text-indigo-600 hover:underline disabled:opacity-50">
                <i className={`fa-solid fa-rotate-right mr-1 ${refreshing ? 'fa-spin' : ''}`}></i>Dizini Yenile
              </button>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-200 mb-2"><b>{status.chunks}</b> parça dizinde{status.lastSync ? ` · son güncelleme ${new Date(status.lastSync).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(Object.entries(status.byType) as [RagSourceType, number][]).map(([t, n]) => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">{RAG_SOURCE_LABELS[t]}: {n}</span>
              ))}
              {status.chunks === 0 && <span className="text-[11px] text-gray-400">Dizin henüz kurulmadı — "Dizini Yenile"ye basın ya da bir soru sorun.</span>}
            </div>
            <p className={`text-xs ${sem.tone}`}>{sem.text}</p>
            <p className="text-[11px] text-gray-400 mt-2">Dizin yalnızca sizin yetki kapsamınızdaki içerikten kurulur; yönetici rollerinde notlar ve müşteri istekleri dizine girmez.</p>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-500">Kurumsal dokümanlar ({docs.length})</h3>
              <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50">
                <i className="fa-solid fa-upload mr-1"></i>Doküman Yükle
              </button>
              <input ref={fileRef} type="file" multiple accept={SUPPORTED_EXTENSIONS.join(',')} className="hidden" onChange={e => onFiles(e.target.files)} />
            </div>
            <p className="text-[11px] text-gray-400 mb-3">PDF, Word (.docx), Markdown ve metin dosyaları. Prosedür, şablon, yönetmelik gibi dokümanlar asistanın yanıtlarında kaynak olarak kullanılır.</p>
            {busy && <p className="text-xs text-indigo-600 mb-2"><i className="fa-solid fa-circle-notch fa-spin mr-1"></i>{busy}</p>}
            {errors.map(e => <p key={e} className="text-xs text-red-600 mb-1"><i className="fa-solid fa-triangle-exclamation mr-1"></i>{e}</p>)}
            {docs.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Henüz doküman yüklenmedi.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-100 dark:border-gray-800 rounded-xl">
                {docs.map(d => (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                    <i className="fa-solid fa-file-lines text-gray-400"></i>
                    <div className="min-w-0 flex-grow">
                      <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">{d.name}</div>
                      <div className="text-[11px] text-gray-400">{fmtSize(d.size)} · {d.text.length.toLocaleString('tr-TR')} karakter · {new Date(d.addedAt).toLocaleDateString('tr-TR')}</div>
                    </div>
                    <button onClick={() => onDelete(d)} title="Sil" className="w-8 h-8 rounded-lg text-gray-400 hover:text-red-500"><i className="fa-solid fa-trash-can text-xs"></i></button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-gray-400 mt-3">
              <i className="fa-solid fa-circle-info mr-1"></i>Dokümanlar yalnızca bu cihazda (tarayıcıda) saklanır; ekip arkadaşlarınızla paylaşılmaz.
              Soru sorduğunuzda ilgili bölümleri kurumsal AI sağlayıcısına gönderilir; anlamsal arama açıksa dizinleme için de gönderilir.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBaseModal;
