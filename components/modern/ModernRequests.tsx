import React, { useMemo, useRef, useState } from 'react';
import { CustomerRequest, Task } from '../../types';
import { createRequest, filterRequests, REQUEST_STATUS_LABELS, requestCounts, RequestStatus, rowsToRequests } from '../../utils/customerRequests';
import { relativeTime } from '../../utils/recentChanges';
import { Icon } from './icons';
import { initialsOf } from './taskMeta';
import { Field, rowSep, Sheet } from './ui';

declare const XLSX: any;
declare const Papa: any;

/**
 * Modern müşteri istekleri: yeni istekler önce; göreve dönüştürülen istek
 * işaretlenir ve görevine bağlanır, uygun olmayanlar reddedilir.
 */

interface ModernRequestsProps {
    requests: CustomerRequest[];
    tasks: Task[];
    onChange: (requests: CustomerRequest[]) => void;
    onConvert: (request: CustomerRequest) => void;
    onViewTask: (task: Task) => void;
}

const TABS: { key: RequestStatus | 'all'; label: string }[] = [
    { key: 'New', label: 'Yeni' },
    { key: 'Converted', label: 'Dönüşen' },
    { key: 'Rejected', label: 'Reddedilen' },
    { key: 'all', label: 'Tümü' },
];

const STATUS_TONE: Record<RequestStatus, string> = { New: 'm-tone-accent', Converted: 'm-tone-ok', Rejected: 'm-tone-hold' };

const readRows = (file: File): Promise<unknown[][]> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    const csv = file.name.toLowerCase().endsWith('.csv');
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.onload = () => {
        try {
            if (csv) {
                if (typeof Papa === 'undefined') throw new Error('CSV kütüphanesi yüklenemedi.');
                resolve(Papa.parse(reader.result as string, { skipEmptyLines: true }).data);
            } else {
                if (typeof XLSX === 'undefined') throw new Error('Excel kütüphanesi yüklenemedi.');
                const wb = XLSX.read(reader.result, { type: 'binary' });
                resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }));
            }
        } catch (e) {
            reject(e);
        }
    };
    if (csv) reader.readAsText(file); else reader.readAsBinaryString(file);
});

const ModernRequests: React.FC<ModernRequestsProps> = ({ requests, tasks, onChange, onConvert, onViewTask }) => {
    const [status, setStatus] = useState<RequestStatus | 'all'>('New');
    const [query, setQuery] = useState('');
    const [adding, setAdding] = useState(false);
    const [title, setTitle] = useState('');
    const [customer, setCustomer] = useState('');
    const [description, setDescription] = useState('');
    const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [menu, setMenu] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const counts = useMemo(() => requestCounts(requests), [requests]);
    const shown = useMemo(() => filterRequests(requests, status, query), [requests, status, query]);

    const add = () => {
        if (!title.trim()) return;
        onChange([createRequest(title, customer, description), ...requests]);
        setAdding(false); setTitle(''); setCustomer(''); setDescription('');
        setStatus('New');
    };
    const importFile = async (file: File) => {
        setBusy(true);
        setNotice(null);
        try {
            const { requests: imported, error } = rowsToRequests(await readRows(file));
            if (error) setNotice({ kind: 'error', text: error });
            else {
                onChange([...imported, ...requests]);
                setNotice({ kind: 'ok', text: `${imported.length} istek içe aktarıldı.` });
                setStatus('New');
            }
        } catch (e) {
            setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'İçe aktarılamadı.' });
        } finally {
            setBusy(false);
        }
    };
    const setReqStatus = (id: string, s: RequestStatus) => onChange(requests.map(r => (r.id === id ? { ...r, status: s } : r)));
    const remove = (id: string) => { if (window.confirm('İstek silinsin mi?')) onChange(requests.filter(r => r.id !== id)); };

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
                <div className="m-segmented" role="group" aria-label="İstek durumu">
                    {TABS.map(t => (
                        <button key={t.key} type="button" className="m-segment" aria-pressed={status === t.key} onClick={() => setStatus(t.key)}>
                            {t.label}<span className="m-text-3 m-tabular">{t.key === 'all' ? counts.total : counts[t.key]}</span>
                        </button>
                    ))}
                </div>
                <label className="m-search flex items-center gap-2 min-h-[40px] px-3 rounded-[10px] m-text-3">
                    <Icon name="search" size={16} />
                    <input aria-label="İsteklerde ara" className="bg-transparent border-0 outline-none text-[15px] m-text w-44" placeholder="Başlık, müşteri" value={query} onChange={e => setQuery(e.target.value)} />
                </label>
                <span className="flex-1"></span>
                <button type="button" className="m-btn m-btn-gray" disabled={busy} onClick={() => fileRef.current?.click()}>
                    <Icon name="upload" size={18} />
                    {busy ? 'Aktarılıyor…' : 'İçe aktar'}
                </button>
                <button type="button" className="m-btn m-btn-primary" onClick={() => setAdding(true)}>
                    <Icon name="plus" size={18} strokeWidth={2.2} />
                    Yeni istek
                </button>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
            </div>

            {notice && (
                <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${notice.kind === 'error' ? 'm-tone-bad' : 'm-tone-ok'}`}>
                    <span className="flex-1 text-[15px]">{notice.text}{notice.kind === 'error' ? ' Dosyada "Başlık", isteğe bağlı "Müşteri" ve "Açıklama" sütunları olmalı.' : ''}</span>
                    <button type="button" className="m-icon-btn" aria-label="Kapat" onClick={() => setNotice(null)}><Icon name="x" size={18} /></button>
                </div>
            )}

            {shown.length === 0 ? (
                <div className="m-surface rounded-2xl px-5 py-12 flex flex-col items-center gap-2 text-center">
                    <span className="w-11 h-11 rounded-full m-tone-accent flex items-center justify-center"><Icon name="inbox" size={22} /></span>
                    <span className="text-[17px] font-semibold m-text">{requests.length === 0 ? 'Henüz müşteri isteği yok' : 'Bu süzgeçte istek yok'}</span>
                    {requests.length === 0 && <span className="text-[15px] m-text-3 max-w-[52ch]">İstekleri tek tek ekleyin ya da Excel/CSV'den aktarın; uygun olanları tek tıkla göreve dönüştürün.</span>}
                </div>
            ) : (
                <div className="m-surface rounded-2xl p-1.5">
                    {shown.map((r, i) => {
                        const sep = rowSep(i);
                        const task = r.convertedTaskId ? tasks.find(t => t.id === r.convertedTaskId) : undefined;
                        return (
                            <div key={r.id} className={`flex items-start gap-3 px-3 py-3.5 ${sep.className}`} style={sep.style}>
                                <span aria-hidden="true" className="w-10 h-10 rounded-full m-fill flex items-center justify-center text-[13px] font-semibold m-text-2 flex-none">{initialsOf(r.customerName || '?')}</span>
                                <div className={`flex-1 min-w-0 flex flex-col gap-1 ${r.status === 'Rejected' ? 'opacity-70' : ''}`}>
                                    <span className="flex flex-wrap items-center gap-2">
                                        <span className="text-[16px] font-semibold m-text">{r.title}</span>
                                        {r.status !== 'New' && <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold ${STATUS_TONE[r.status]}`}>{REQUEST_STATUS_LABELS[r.status]}</span>}
                                    </span>
                                    <span className="text-[13px] m-text-3">{r.customerName} · {relativeTime(r.createdAt)}</span>
                                    {r.description && <p className="m-0 text-[14px] leading-relaxed m-text-2 whitespace-pre-line line-clamp-3">{r.description}</p>}
                                    {task && (
                                        <button type="button" className="self-start inline-flex items-center gap-1 mt-0.5 bg-transparent border-0 p-0 text-[14px] font-semibold m-accent cursor-pointer" onClick={() => onViewTask(task)}>
                                            Görev: {task.name}
                                            <Icon name="chevronRight" size={16} strokeWidth={2.2} />
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 flex-none">
                                    {r.status === 'New' && <button type="button" className="m-btn m-btn-gray" onClick={() => onConvert(r)}>Göreve dönüştür</button>}
                                    <div className="relative">
                                        <button type="button" className="m-icon-btn" aria-label={`${r.title} işlemleri`} aria-haspopup="menu" aria-expanded={menu === r.id} onClick={() => setMenu(menu === r.id ? null : r.id)}><Icon name="more" /></button>
                                        {menu === r.id && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} aria-hidden="true"></div>
                                                <div role="menu" className="absolute right-0 top-full mt-1 w-52 m-surface m-pop rounded-2xl py-1.5 z-50">
                                                    {r.status !== 'Rejected' && r.status !== 'Converted' && <button type="button" role="menuitem" className="m-row-link w-full flex items-center min-h-[44px] px-3.5 text-[15px]" onClick={() => { setMenu(null); setReqStatus(r.id, 'Rejected'); }}>Reddet</button>}
                                                    {r.status === 'Rejected' && <button type="button" role="menuitem" className="m-row-link w-full flex items-center min-h-[44px] px-3.5 text-[15px]" onClick={() => { setMenu(null); setReqStatus(r.id, 'New'); }}>Yeniden aç</button>}
                                                    <button type="button" role="menuitem" className="m-row-link w-full flex items-center min-h-[44px] px-3.5 text-[15px] m-ink-bad" onClick={() => { setMenu(null); remove(r.id); }}>Sil</button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {adding && (
                <Sheet
                    title="Yeni müşteri isteği"
                    onClose={() => setAdding(false)}
                    footer={<>
                        <span className="flex-1"></span>
                        <button type="button" className="m-btn m-btn-plain" onClick={() => setAdding(false)}>Vazgeç</button>
                        <button type="button" className="m-btn m-btn-primary" disabled={!title.trim()} onClick={add}>Ekle</button>
                    </>}
                >
                    <Field label="İstek" htmlFor="cr-title">
                        <input id="cr-title" className="m-input" autoFocus value={title} placeholder="Ör. Aylık özet raporu" onChange={e => setTitle(e.target.value)} />
                    </Field>
                    <Field label="Müşteri / talep eden" htmlFor="cr-customer">
                        <input id="cr-customer" className="m-input" value={customer} placeholder="Ör. Bilgi İşlem Müdürlüğü" onChange={e => setCustomer(e.target.value)} />
                    </Field>
                    <Field label="Açıklama" htmlFor="cr-desc">
                        <textarea id="cr-desc" className="m-input py-2.5" rows={4} value={description} onChange={e => setDescription(e.target.value)} />
                    </Field>
                </Sheet>
            )}
        </div>
    );
};

export default ModernRequests;
