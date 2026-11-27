import React, { useMemo, useState } from 'react';
import { Project, Task } from '../../../types';
import { readWorkbookFile } from '../../../utils/gibFindings';
import { applyBoardImport, BoardField, BoardImportPlan, BoardRow, parseBoardWorkbook, planBoardImport } from '../../../utils/planning/boardImport';
import { Icon } from '../icons';
import { Sheet } from '../ui';
import TaskKeyButton from '../TaskKeyButton';

/**
 * Ekip panosu Excel'ini (ör. EMS Board) projeye aktarır: sorumlu, etiketler,
 * ilerleme yüzdesi ve tahmin. Puan, zorluk ve tarih sütunları alınmaz.
 * Önce değişiklikler gösterilir; seçilen alanlar uygulanır.
 */

interface Props {
    project: Project;
    onClose: () => void;
    onViewTask: (task: Task) => void;
    onApply: (tasks: Task[], summary: string) => void;
}

const FIELDS: { id: BoardField; label: string }[] = [
    { id: 'assignee', label: 'Sorumlu' },
    { id: 'labels', label: 'Etiketler' },
    { id: 'progress', label: 'İlerleme %' },
    { id: 'estimate', label: 'Tahmin' },
];

const BoardImportSheet: React.FC<Props> = ({ project, onClose, onViewTask, onApply }) => {
    const [file, setFile] = useState('');
    const [rows, setRows] = useState<BoardRow[] | null>(null);
    const [problem, setProblem] = useState('');
    const [busy, setBusy] = useState(false);
    const [fields, setFields] = useState<Set<BoardField>>(new Set(FIELDS.map(f => f.id)));
    const plan: BoardImportPlan | null = useMemo(() => rows ? planBoardImport(rows, project.tasks, project.resources) : null, [rows, project.tasks, project.resources]);
    const taskById = useMemo(() => new Map(project.tasks.map(t => [t.id, t])), [project.tasks]);

    const read = async (f: File | undefined) => {
        if (!f) return;
        setBusy(true); setProblem(''); setFile(f.name);
        try {
            const parsed = parseBoardWorkbook(await readWorkbookFile(f));
            setRows(parsed.rows);
            if (parsed.problem) setProblem(parsed.problem);
        } catch {
            setRows(null);
            setProblem('Dosya okunamadı. Pano dışa aktarımındaki .xlsx dosyasını seçin.');
        } finally { setBusy(false); }
    };

    const count = (f: BoardField) => plan ? plan.changes.filter(c => f === 'assignee' ? c.assignee : f === 'labels' ? c.labelsAdded.length : f === 'progress' ? c.progress : c.estimate).length : 0;
    const apply = () => {
        if (!plan) return;
        const { tasks, changed } = applyBoardImport(project.tasks, plan.changes, fields);
        onApply(tasks, `Panodan ${changed} görev güncellendi (${FIELDS.filter(f => fields.has(f.id)).map(f => f.label.toLocaleLowerCase('tr-TR')).join(', ')}).`);
        onClose();
    };
    const shown = plan ? plan.changes.filter(c => (fields.has('assignee') && c.assignee) || (fields.has('labels') && c.labelsAdded.length) || (fields.has('progress') && c.progress) || (fields.has('estimate') && c.estimate)) : [];

    return (
        <Sheet
            title="Panodan aktar"
            subtitle={file || 'Ekip panosu Excel dışa aktarımı (ör. EMS Board)'}
            onClose={onClose}
            xl
            footer={<>
                <span className="flex-1 text-[13px] m-text-3">{plan ? `${shown.length} görev değişecek` : 'Görevler Jira anahtarıyla eşleşir.'}</span>
                <button type="button" className="m-btn m-btn-plain" onClick={onClose}>Vazgeç</button>
                <button type="button" className="m-btn m-btn-primary" disabled={!shown.length} onClick={apply}><Icon name="check" size={18} />Uygula</button>
            </>}
        >
            <label className="m-fill-2 rounded-xl px-4 py-4 flex flex-col items-center gap-1.5 cursor-pointer text-center">
                <Icon name="upload" size={22} />
                <span className="text-[15px] font-semibold m-text">{busy ? 'Okunuyor…' : rows ? 'Başka dosya seç' : 'Pano .xlsx dosyasını seçin'}</span>
                <span className="text-[13px] m-text-3">Alınanlar: sorumlu, etiketler, ilerleme %, tahmin. Puan, zorluk, eklenme ve bitiş tarihi alınmaz; durum değişmez.</span>
                <input type="file" accept=".xlsx,.xlsm" className="hidden" onChange={e => { read(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {problem && <p role="alert" className="m-0 text-[14px] m-ink-bad">{problem}</p>}

            {plan && (
                <>
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[13px] font-semibold m-text-2">Aktarılacak alanlar</span>
                        <div className="flex flex-wrap gap-2">
                            {FIELDS.map(f => (
                                <label key={f.id} className="m-fill-2 rounded-xl px-3 min-h-[40px] inline-flex items-center gap-2 text-[14px] m-text cursor-pointer">
                                    <input type="checkbox" className="w-5 h-5" checked={fields.has(f.id)} onChange={e => { const n = new Set(fields); if (e.target.checked) n.add(f.id); else n.delete(f.id); setFields(n); }} />
                                    {f.label} <span className="m-text-3 m-tabular">{count(f.id)}</span>
                                </label>
                            ))}
                        </div>
                        <span className="text-[13px] m-text-3">
                            {plan.rows} satır · {plan.rows - plan.unmatched.length - plan.duplicateKeys.length} görev eşleşti. İlerleme görevde elle girilmiş yüzde olarak saklanır; PoC katsayısı ve planın kalan eforu bunu kullanır. Eforu olmayan görevin süresi tahminden doldurulur.
                        </span>
                    </div>

                    {plan.duplicateKeys.length > 0 && (
                        <p className="m-0 text-[14px] m-text-2">Panoda birden çok satırda geçen: {plan.duplicateKeys.join(', ')}. İlk satır esas alındı; etiketler birleştirildi.</p>
                    )}
                    {(plan.unknownPeople.length > 0 || plan.ambiguousPeople.length > 0) && (
                        <p className="m-0 text-[14px] m-ink-warn">
                            {plan.unknownPeople.length > 0 && `Ekipte bulunamayan sorumlu: ${plan.unknownPeople.join(', ')}. `}
                            {plan.ambiguousPeople.length > 0 && `Birden çok kişiye uyan: ${plan.ambiguousPeople.join(', ')} (soyadının ilk harflerini ekleyin). `}
                            Bu görevlerin sorumlusu değişmez.
                        </p>
                    )}

                    <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
                        {shown.map(c => {
                            const t = taskById.get(c.taskId);
                            if (!t) return null;
                            const parts = [
                                fields.has('assignee') && c.assignee ? `${c.assignee.from || 'Atanmamış'} → ${c.assignee.to}${c.unit ? ` (${c.unit.to})` : ''}` : '',
                                fields.has('progress') && c.progress ? `ilerleme %${c.progress.to}` : '',
                                fields.has('estimate') && c.estimate ? `tahmin ${c.estimate.text}${c.estimate.days ? ` → ${c.estimate.days.avg.toLocaleString('tr-TR')} g süre` : ''}` : '',
                                fields.has('labels') && c.labelsAdded.length ? `+ ${c.labelsAdded.join(', ')}` : '',
                            ].filter(Boolean);
                            return (
                                <li key={c.taskId} className="m-fill-2 rounded-xl px-3 py-2 flex flex-wrap items-center gap-2 text-[14px] m-text">
                                    <TaskKeyButton task={t} onOpen={() => onViewTask(t)} />
                                    <span className="flex-1 min-w-[160px] truncate">{t.name}</span>
                                    <span className="text-[13px] m-text-2">{parts.join(' · ')}</span>
                                </li>
                            );
                        })}
                    </ul>

                    {plan.unmatched.length > 0 && (
                        <details className="m-fill-2 rounded-xl px-4 py-3">
                            <summary className="cursor-pointer text-[14px] font-semibold m-text">Projede karşılığı olmayan {plan.unmatched.length} kayıt</summary>
                            <ul className="m-0 p-0 pt-2 list-none flex flex-col gap-1">
                                {plan.unmatched.map(r => (
                                    <li key={r.key} className="flex items-center gap-2 text-[14px] m-text">
                                        <span className="inline-flex items-center min-h-[28px] px-2 rounded-lg m-fill text-[13px] font-semibold m-tabular">{r.key}</span>
                                        <span className="truncate">{r.title}</span>
                                    </li>
                                ))}
                            </ul>
                            <p className="m-0 pt-2 text-[13px] m-text-3">Bu kayıtlar aktarılmaz; Jira'dan eşitlenince sonraki aktarımda eşleşir.</p>
                        </details>
                    )}
                </>
            )}
        </Sheet>
    );
};

export default BoardImportSheet;
