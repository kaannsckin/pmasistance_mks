import React, { useState } from 'react';
import { Task, WbNode, Whiteboard } from '../../../types';
import { VotingSetup, voteTally, votesLeft } from '../../../utils/whiteboard/model';
import { Icon } from '../icons';

/**
 * Pano oylaması (FigJam "Voting" gibi): kurulum penceresi, oylama sırasında
 * üst şerit ve sonuç paneli. Oylar oylama bitene kadar gizlidir; herkes yalnız
 * kendi oylarını görür.
 */

const VIOLET = '#7c3aed';

const panel = 'rounded-2xl m-surface m-pop shadow-xl';
const panelBorder = { border: '1px solid var(--m-sep, #e5e7eb)' };

const Choice: React.FC<{ options: { value: number; label: string }[]; value: number; onChange: (v: number) => void; label: string }> = ({ options, value, onChange, label }) => (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
        {options.map(o => (
            <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
                className={`flex-1 h-9 rounded-lg border-0 cursor-pointer text-[13.5px] font-semibold ${value === o.value ? 'text-white' : 'm-fill-2 m-text'}`}
                style={value === o.value ? { background: VIOLET } : undefined} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
    </div>
);

/** Oylama kurulumu: soru, kişi başına oy, nesne başına sınır, kapsam ve süre */
export const VoteSetup: React.FC<{
    /** Seçili bölüm varsa kapsam olarak önerilir */
    section?: WbNode;
    hasResults: boolean;
    onStart: (s: VotingSetup) => void;
    onShowResults: () => void;
    onClose: () => void;
}> = ({ section, hasResults, onStart, onShowResults, onClose }) => {
    const [title, setTitle] = useState('');
    const [per, setPer] = useState(3);
    const [single, setSingle] = useState(false);
    const [inSection, setInSection] = useState(!!section);
    const [minutes, setMinutes] = useState(0);
    return (
        <div data-ui role="dialog" aria-label="Oylama başlat" className={`absolute top-16 right-3 z-30 w-[340px] max-w-[calc(100%-24px)] p-4 flex flex-col gap-3.5 ${panel}`} style={panelBorder}
            onPointerDown={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') onClose(); e.stopPropagation(); }}>
            <div className="flex items-start gap-2">
                <span className="w-9 h-9 rounded-xl grid place-items-center text-white flex-none" style={{ background: VIOLET }}><Icon name="thumbsUp" size={17} /></span>
                <span className="flex-1 min-w-0">
                    <b className="block text-[15.5px] m-text">Oylama başlat</b>
                    <span className="block text-[12.5px] m-text-3 leading-snug">Katılımcılar notlara tıklayarak oy verir. Oylar bitene kadar gizlidir; sonra herkes sonuçları görür.</span>
                </span>
                <button type="button" aria-label="Kapat" className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer m-text-3" onClick={onClose}><Icon name="x" size={15} /></button>
            </div>
            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold m-text-2">Ne oylanıyor? <span className="font-normal m-text-3">(isteğe bağlı)</span></span>
                <input autoFocus className="m-input" maxLength={140} placeholder="ör. Önce hangi sorunu çözelim?" value={title} onChange={e => setTitle(e.target.value)} />
            </label>
            <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold m-text-2">Kişi başına oy</span>
                <Choice label="Kişi başına oy" value={per} onChange={setPer} options={[1, 3, 5, 10].map(v => ({ value: v, label: String(v) }))} />
                <label className="flex items-start gap-2 text-[13px] m-text-2 cursor-pointer">
                    <input type="checkbox" className="mt-0.5" checked={single} disabled={per === 1} onChange={e => setSingle(e.target.checked)} />
                    <span>Bir nota en fazla 1 oy<span className="block text-[12px] m-text-3">{single || per === 1 ? 'Oylar farklı notlara dağıtılır.' : 'Kapalıyken aynı nota birden çok oy verilebilir.'}</span></span>
                </label>
            </div>
            {section && (
                <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold m-text-2">Neler oylanır?</span>
                    <Choice label="Oylama kapsamı" value={inSection ? 1 : 0} onChange={v => setInSection(v === 1)} options={[{ value: 0, label: 'Tüm pano' }, { value: 1, label: `"${(section.text || 'Bölüm').slice(0, 18)}" bölümü` }]} />
                </div>
            )}
            <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold m-text-2">Süre</span>
                <Choice label="Süre" value={minutes} onChange={setMinutes} options={[{ value: 0, label: 'Süresiz' }, { value: 2, label: '2 dk' }, { value: 5, label: '5 dk' }, { value: 10, label: '10 dk' }]} />
            </div>
            <div className="flex items-center gap-2 pt-1">
                {hasResults && <button type="button" className="m-btn m-btn-plain !min-h-[36px] !px-2 text-[13.5px]" onClick={onShowResults}>Son sonuçlar</button>}
                <span className="flex-1" />
                <button type="button" className="m-btn !min-h-[38px] text-white" style={{ background: VIOLET }}
                    onClick={() => onStart({ perPerson: per, title, maxPerNode: single ? 1 : undefined, scope: inSection && section ? section.id : undefined, minutes })}>
                    <Icon name="thumbsUp" size={15} />Başlat
                </button>
            </div>
        </div>
    );
};

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/** Oylama sürerken üst şerit: soru, kalan hak (noktalar), katılım, süre, bitir */
export const VoteBanner: React.FC<{ board: Whiteboard; voter: string; canVote: boolean; canEnd: boolean; secondsLeft: number | null; scopeName?: string; onEnd: () => void }> = ({ board, voter, canVote, canEnd, secondsLeft, scopeName, onEnd }) => {
    const v = board.voting!;
    const left = votesLeft(board, voter);
    const tally = voteTally(board);
    return (
        <div data-ui role="status" className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-24px)] flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-2xl shadow-lg text-white" style={{ background: VIOLET }}
            onPointerDown={e => e.stopPropagation()}>
            <Icon name="thumbsUp" size={17} />
            <span className="min-w-0 flex flex-col leading-tight">
                <b className="text-[14px] truncate">{v.title || 'Oylama'}</b>
                <span className="text-[12px] opacity-90 truncate">
                    {canVote ? `${scopeName ? `"${scopeName}" içindeki ` : ''}notlara tıklayıp oy verin · geri almak için rozete tıklayın` : 'Bu panoda oy veremezsiniz'}
                    {v.maxPerNode === 1 ? ' · bir nota en fazla 1 oy' : ''}
                </span>
            </span>
            {canVote && (
                <span className="flex items-center gap-1" title={`Kalan oy: ${left} / ${v.perPerson}`} aria-label={`Kalan oy: ${left} / ${v.perPerson}`}>
                    {v.perPerson <= 10
                        ? Array.from({ length: v.perPerson }, (_, i) => <span key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: i < left ? '#fff' : 'rgba(255,255,255,0.3)' }} />)
                        : <b className="text-[13px] m-tabular">{left}/{v.perPerson}</b>}
                </span>
            )}
            <span className="hidden sm:inline text-[12.5px] opacity-90 whitespace-nowrap m-tabular">{tally.voters} kişi oy verdi</span>
            {secondsLeft !== null && <span className="text-[14px] font-bold m-tabular">{clock(secondsLeft)}</span>}
            {canEnd && <button type="button" className="h-9 px-3 rounded-xl border-0 cursor-pointer text-[13.5px] font-semibold whitespace-nowrap flex-none" style={{ background: 'rgba(255,255,255,0.22)', color: '#fff' }} onClick={onEnd}>Oylamayı bitir</button>}
        </div>
    );
};

/** Sonuçlar: sıralı liste ve çubuklar; tıklanınca nesneye gider */
export const VoteResults: React.FC<{
    board: Whiteboard;
    results: { node: WbNode; votes: number }[];
    tasksById: Map<string, Task>;
    canEdit: boolean;
    onFocus: (n: WbNode) => void;
    onSelectTop: (ids: string[]) => void;
    onAddSummary: () => void;
    onRestart: () => void;
    onClear: () => void;
    onClose: () => void;
}> = ({ board, results, tasksById, canEdit, onFocus, onSelectTop, onAddSummary, onRestart, onClear, onClose }) => {
    const tally = voteTally(board);
    const max = results[0]?.votes || 1;
    // İlk üç sıradaki oy sayısına eşit olan herkes (beraberlikler dahil)
    const cut = results[Math.min(2, results.length - 1)]?.votes || 0;
    const top = results.filter(r => r.votes >= cut);
    const label = (n: WbNode) => (n.text || (n.type === 'task' ? tasksById.get(n.ref || '')?.name : '') || (n.type === 'image' ? 'Görsel' : n.type === 'stamp' ? n.stamp : '') || 'Adsız').replace(/\s+/g, ' ').slice(0, 90);
    return (
        <div data-ui role="dialog" aria-label="Oylama sonuçları" className={`absolute top-16 right-3 z-30 w-[360px] max-w-[calc(100%-24px)] max-h-[70%] flex flex-col ${panel}`} style={panelBorder} onPointerDown={e => e.stopPropagation()}>
            <div className="flex items-start gap-2 p-4 pb-2">
                <span className="flex-1 min-w-0">
                    <b className="block text-[15.5px] m-text">Oylama sonuçları</b>
                    <span className="block text-[12.5px] m-text-3 truncate">{board.voting?.title ? `${board.voting.title} · ` : ''}{tally.voters} kişi · {tally.votes} oy</span>
                </span>
                <button type="button" aria-label="Kapat" className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer m-text-3" onClick={onClose}><Icon name="x" size={15} /></button>
            </div>
            {results.length === 0
                ? <p className="m-0 px-4 pb-4 text-[14px] m-text-3">Kimse oy vermedi.</p>
                : (
                    <ol className="m-0 px-2 pb-2 list-none flex flex-col gap-0.5 overflow-y-auto">
                        {results.slice(0, 20).map((r, i) => (
                            <li key={r.node.id}>
                                <button type="button" className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg border-0 bg-transparent cursor-pointer text-left hover:m-fill-2" onClick={() => onFocus(r.node)}>
                                    <span className="w-6 text-center text-[13px] font-bold m-text-3 m-tabular">{i + 1}</span>
                                    <span className="flex-1 min-w-0 flex flex-col gap-1">
                                        <span className="text-[14px] m-text truncate">{label(r.node)}</span>
                                        <span className="h-1.5 rounded-full m-fill-2 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(r.votes / max) * 100}%`, background: VIOLET }} /></span>
                                    </span>
                                    <b className="text-[14px] m-text m-tabular w-12 text-right">{r.votes} oy</b>
                                </button>
                            </li>
                        ))}
                    </ol>
                )}
            {canEdit && (
                <div className="flex flex-wrap items-center gap-1.5 p-3 border-t m-sep">
                    {results.length > 0 && <button type="button" className="m-btn m-btn-gray !min-h-[34px] !px-2.5 text-[13px]" onClick={() => onSelectTop(top.map(r => r.node.id))} title="İlk üç sıradakileri (beraberlikler dahil) seçer">En çok oy alanları seç ({top.length})</button>}
                    {results.length > 0 && <button type="button" className="m-btn m-btn-gray !min-h-[34px] !px-2.5 text-[13px]" onClick={onAddSummary}>Sonucu panoya yaz</button>}
                    <span className="flex-1" />
                    <button type="button" className="m-btn m-btn-plain !min-h-[34px] !px-2 text-[13px]" onClick={onRestart}>Yeni oylama</button>
                    <button type="button" className="m-btn m-btn-plain !min-h-[34px] !px-2 text-[13px]" onClick={onClear}>Oyları sil</button>
                </div>
            )}
        </div>
    );
};
