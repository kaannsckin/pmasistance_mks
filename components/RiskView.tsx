import React, { useMemo, useState } from 'react';
import { Person, PestelItem, Risk, RiskLevel, RiskStatus } from '../types';
import { createRisk, riskBand, RISK_BAND_HEX, RISK_BAND_LABELS, riskScore, RISK_STATUS_LABELS } from '../utils/risks';
import { summarizePestel } from '../utils/pestel';
import PestelModal from './PestelModal';

interface RiskViewProps {
  projectName: string;
  risks: Risk[];
  people: Person[];
  canEdit: boolean;
  pestelItems: PestelItem[];
  onUpdateRisks: (risks: Risk[]) => void;
  onUpdatePestel: (items: PestelItem[]) => void;
}

const LEVELS: RiskLevel[] = [1, 2, 3, 4, 5];
const PROB_LABELS = ['', 'Çok Düşük', 'Düşük', 'Orta', 'Yüksek', 'Çok Yüksek'];
const inputCls = 'w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none focus:border-primary disabled:opacity-60 disabled:bg-gray-50 dark:disabled:bg-gray-800';
const STATUS_STYLES: Record<RiskStatus, string> = {
  open: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300',
  monitoring: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
  closed: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

const RiskView: React.FC<RiskViewProps> = ({ projectName, risks, people, canEdit, pestelItems, onUpdateRisks, onUpdatePestel }) => {
  const editable = canEdit;
  const [newRisk, setNewRisk] = useState({ title: '', probability: 3 as RiskLevel, impact: 3 as RiskLevel, ownerPersonId: '', mitigation: '' });
  const [showPestel, setShowPestel] = useState(false);
  const pestelSummary = useMemo(() => summarizePestel(pestelItems), [pestelItems]);

  // Havuz — sahibi buradan seçilir (Jira gibi), serbest metin değil
  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr')),
    [people],
  );
  const personName = useMemo(() => {
    const m = new Map(people.map(p => [p.id, `${p.firstName} ${p.lastName}`.trim()]));
    return (id?: string) => (id ? m.get(id) : undefined);
  }, [people]);
  // Bir riskin sahip etiketi: havuz kişisi → güncel ad; yoksa eski serbest metin
  const ownerLabel = (r: Risk): string => personName(r.ownerPersonId) || r.owner || '';

  const activeRisks = useMemo(() => risks.filter(r => r.status !== 'closed'), [risks]);

  // 5×5 matris hücrelerine risk sayısı
  const matrix = useMemo(() => {
    const m: Record<string, number> = {};
    activeRisks.forEach(r => {
      const key = `${r.probability}-${r.impact}`;
      m[key] = (m[key] || 0) + 1;
    });
    return m;
  }, [activeRisks]);

  const updateRisk = (id: string, patch: Partial<Risk>) =>
    onUpdateRisks(risks.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const addRisk = () => {
    if (!newRisk.title.trim()) return;
    const ownerPersonId = newRisk.ownerPersonId || undefined;
    onUpdateRisks([...risks, createRisk({
      title: newRisk.title.trim(),
      probability: newRisk.probability,
      impact: newRisk.impact,
      ownerPersonId,
      owner: personName(ownerPersonId), // ad görüntü/dışa aktarım için sabitlenir
      mitigation: newRisk.mitigation.trim() || undefined,
    })]);
    setNewRisk({ title: '', probability: 3, impact: 3, ownerPersonId: '', mitigation: '' });
  };

  // Havuzdan sahip ata (satır düzenleme): hem id hem ad güncellenir
  const setRiskOwner = (id: string, ownerPersonId: string) =>
    updateRisk(id, { ownerPersonId: ownerPersonId || undefined, owner: personName(ownerPersonId) });

  const sortedRisks = useMemo(
    () => [...risks].sort((a, b) => (a.status === 'closed' ? 1 : 0) - (b.status === 'closed' ? 1 : 0) || riskScore(b) - riskScore(a)),
    [risks]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white tracking-tight">Risk Kaydı</h2>
          <p className="text-gray-400 text-xs font-semibold tracking-[0.2em]">{projectName} · Olasılık × Etki</p>
        </div>
        <button
          onClick={() => setShowPestel(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white shadow-md hover:opacity-90 transition-all"
          style={{ backgroundColor: 'var(--app-primary)' }}
          title="Projenin dış çevre (PESTEL) analizini görüntüle / düzenle"
        >
          <i className="fa-solid fa-globe"></i>
          PESTEL Analizi
          {pestelSummary.total > 0 && <span className="bg-white/25 rounded-md px-1.5 py-0.5 text-[10px]">{pestelSummary.total}</span>}
        </button>
      </div>

      {showPestel && (
        <PestelModal projectName={projectName} items={pestelItems} canEdit={canEdit} onUpdate={onUpdatePestel} onClose={() => setShowPestel(false)} />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* 5×5 risk matrisi */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-4">Risk Matrisi ({activeRisks.length} aktif risk)</h3>
          <div className="flex">
            <div className="flex items-center">
              <span className="text-[10px] font-semibold text-gray-400 -rotate-90 whitespace-nowrap" style={{ writingMode: 'vertical-rl' }}>Olasılık →</span>
            </div>
            <div className="flex-1">
              <table className="w-full border-collapse">
                <tbody>
                  {[5, 4, 3, 2, 1].map(prob => (
                    <tr key={prob}>
                      <td className="text-[10px] font-semibold text-gray-400 pr-2 text-right w-6">{prob}</td>
                      {LEVELS.map(impact => {
                        const score = prob * impact;
                        const band = riskBand(score);
                        const count = matrix[`${prob}-${impact}`] || 0;
                        return (
                          <td key={impact} className="p-0.5">
                            <div
                              className="aspect-square rounded flex items-center justify-center text-xs font-bold transition-transform hover:scale-105"
                              style={{ backgroundColor: RISK_BAND_HEX[band], opacity: count > 0 ? 1 : 0.18, color: '#fff' }}
                              title={`Olasılık ${prob} × Etki ${impact} = ${score} (${RISK_BAND_LABELS[band]})${count > 0 ? ` — ${count} risk` : ''}`}
                            >
                              {count > 0 ? count : ''}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td></td>
                    {LEVELS.map(i => <td key={i} className="text-[10px] font-semibold text-gray-400 text-center pt-1">{i}</td>)}
                  </tr>
                </tbody>
              </table>
              <p className="text-[10px] font-semibold text-gray-400 text-center mt-1">Etki →</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 justify-center">
            {(['low', 'medium', 'high'] as const).map(b => (
              <span key={b} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: RISK_BAND_HEX[b] }}></span>{RISK_BAND_LABELS[b]}
              </span>
            ))}
          </div>
        </div>

        {/* Yeni risk ekleme */}
        {editable ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-300">Yeni Risk</h3>
            <input className={inputCls} placeholder="Risk başlığı" value={newRisk.title} onChange={e => setNewRisk({ ...newRisk, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[11px] text-gray-500">Olasılık
                <select className={inputCls} value={newRisk.probability} onChange={e => setNewRisk({ ...newRisk, probability: Number(e.target.value) as RiskLevel })}>
                  {LEVELS.map(l => <option key={l} value={l}>{l} — {PROB_LABELS[l]}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-gray-500">Etki
                <select className={inputCls} value={newRisk.impact} onChange={e => setNewRisk({ ...newRisk, impact: Number(e.target.value) as RiskLevel })}>
                  {LEVELS.map(l => <option key={l} value={l}>{l} — {PROB_LABELS[l]}</option>)}
                </select>
              </label>
            </div>
            <select className={inputCls} value={newRisk.ownerPersonId} onChange={e => setNewRisk({ ...newRisk, ownerPersonId: e.target.value })}>
              <option value="">Sahibi (havuzdan seç)…</option>
              {sortedPeople.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.departmentCode ? ` (${p.departmentCode})` : ''}</option>)}
            </select>
            <input className={inputCls} placeholder="Azaltıcı aksiyon (opsiyonel)" value={newRisk.mitigation} onChange={e => setNewRisk({ ...newRisk, mitigation: e.target.value })} />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Skor: <b style={{ color: RISK_BAND_HEX[riskBand(newRisk.probability * newRisk.impact)] }}>{newRisk.probability * newRisk.impact} · {RISK_BAND_LABELS[riskBand(newRisk.probability * newRisk.impact)]}</b></span>
              <button onClick={addRisk} disabled={!newRisk.title.trim()} className="text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm hover:opacity-90 disabled:opacity-40" style={{ backgroundColor: 'var(--app-primary)' }}>
                <i className="fa-solid fa-plus mr-1"></i>Ekle
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-3 flex items-center gap-3 self-start">
            <i className="fa-solid fa-lock text-amber-500"></i>
            <p className="text-[11px] text-amber-700 dark:text-amber-300">Riskleri yalnızca Proje Yöneticisi ve Bölüm Sorumlusu düzenleyebilir (salt-okunur görünüm).</p>
          </div>
        )}
      </div>

      {/* Risk tablosu */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="bg-gray-50/80 dark:bg-gray-800/80">
              {['Risk', 'Ol.', 'Etki', 'Skor', 'Sahibi', 'Aksiyon', 'Durum', ...(editable ? [''] : [])].map((h, i) => (
                <th key={i} className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {sortedRisks.map(r => {
              const score = riskScore(r);
              const band = riskBand(score);
              const dim = r.status === 'closed' ? 'opacity-50' : '';
              return (
                <tr key={r.id} className={`hover:bg-gray-50/50 dark:hover:bg-gray-800/40 ${dim}`}>
                  <td className="px-3 py-2 min-w-[220px]">
                    <input disabled={!editable} className={inputCls} value={r.title} onChange={e => updateRisk(r.id, { title: e.target.value })} />
                  </td>
                  <td className="px-2 py-2">
                    <select disabled={!editable} className={`${inputCls} w-14`} value={r.probability} onChange={e => updateRisk(r.id, { probability: Number(e.target.value) as RiskLevel })}>
                      {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select disabled={!editable} className={`${inputCls} w-14`} value={r.impact} onChange={e => updateRisk(r.id, { impact: Number(e.target.value) as RiskLevel })}>
                      {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ backgroundColor: RISK_BAND_HEX[band] }}>{score}</span>
                  </td>
                  <td className="px-3 py-2 min-w-[140px]">
                    {editable ? (
                      <select className={inputCls} value={r.ownerPersonId || ''} onChange={e => setRiskOwner(r.id, e.target.value)}>
                        <option value="">{r.owner && !r.ownerPersonId ? `${r.owner} (havuz dışı)` : 'Sahibi yok'}</option>
                        {sortedPeople.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.departmentCode ? ` (${p.departmentCode})` : ''}</option>)}
                      </select>
                    ) : (
                      <span className="text-[11px] text-gray-600 dark:text-gray-300">{ownerLabel(r) || '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 min-w-[180px]">
                    <input disabled={!editable} className={inputCls} value={r.mitigation || ''} placeholder="—" onChange={e => updateRisk(r.id, { mitigation: e.target.value || undefined })} />
                  </td>
                  <td className="px-3 py-2">
                    {editable ? (
                      <select className={`${inputCls} w-28`} value={r.status} onChange={e => updateRisk(r.id, { status: e.target.value as RiskStatus })}>
                        {(Object.keys(RISK_STATUS_LABELS) as RiskStatus[]).map(s => <option key={s} value={s}>{RISK_STATUS_LABELS[s]}</option>)}
                      </select>
                    ) : (
                      <span className={`text-[11px] font-semibold px-2 py-1 rounded-lg ${STATUS_STYLES[r.status]}`}>{RISK_STATUS_LABELS[r.status]}</span>
                    )}
                  </td>
                  {editable && (
                    <td className="px-2 py-2">
                      <button onClick={() => { if (window.confirm('Bu risk silinsin mi?')) onUpdateRisks(risks.filter(x => x.id !== r.id)); }} className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 transition-colors">
                        <i className="fa-solid fa-trash text-xs"></i>
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {sortedRisks.length === 0 && (
              <tr><td colSpan={8} className="text-center text-gray-400 text-xs py-10">Henüz risk kaydı yok.{editable ? ' Yukarıdan ekleyin.' : ''}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RiskView;
