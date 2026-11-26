import React from 'react';
import { Project, Task, WbNode } from '../../../types';
import { progressOf } from '../../../utils/progress';
import { colorOf, sprintName, taskStatusText, tasksOfRef, textSegments, voteTotal } from '../../../utils/whiteboard/model';
import TaskKeyButton from '../TaskKeyButton';
import { Icon, IconName } from '../icons';

/** Tek pano nesnesinin çizimi; etkileşim (seçme, sürükleme) üst bileşende */

export interface NodeEnv {
    project: Project;
    tasksById: Map<string, Task>;
    onViewTask: (t: Task) => void;
    /** Oylama sürerken kişinin kendi oyları görünür; bitince toplamlar */
    voter: string;
    votingActive: boolean;
    showVotes: boolean;
}

const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

/** Metin: görev referansları (MPS-123, #kimlik) görev kodu düğmesi olur */
export const RichText: React.FC<{ text?: string; env: NodeEnv; placeholder?: string }> = ({ text, env, placeholder }) => {
    if (!text?.trim()) return placeholder ? <span className="opacity-40">{placeholder}</span> : null;
    const parts = textSegments(text, env.project.tasks);
    return (
        <>
            {parts.map((p, i) => ('task' in p
                ? <span key={i} onPointerDown={stop} className="inline-flex align-middle mx-0.5"><TaskKeyButton task={p.task} onOpen={() => env.onViewTask(p.task)} className="!min-h-[24px] !px-1.5 !text-[12px]" /></span>
                : <React.Fragment key={i}>{p.text}</React.Fragment>))}
        </>
    );
};

const VoteBadge: React.FC<{ n: WbNode; env: NodeEnv }> = ({ n, env }) => {
    const mine = n.votes?.[env.voter] || 0;
    const total = voteTotal(n);
    const shown = env.votingActive ? mine : env.showVotes ? total : 0;
    if (!shown) return null;
    return (
        <span className="absolute -top-2.5 -right-2.5 min-w-[26px] h-[26px] px-1.5 rounded-full grid place-items-center text-[13px] font-bold text-white shadow-md"
            style={{ background: env.votingActive ? '#7c3aed' : '#dc2626' }} title={env.votingActive ? `Sizin oyunuz: ${mine}` : `${total} oy`}>
            {shown}
        </span>
    );
};

const Progress: React.FC<{ tasks: Task[]; project: Project }> = ({ tasks, project }) => {
    const p = progressOf(tasks, project.progressModel);
    return (
        <div className="flex items-center gap-2">
            <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--viz-track, #e5e7eb)' }}>
                <span className="block h-full rounded-full" style={{ width: `${p.pct}%`, background: 'var(--viz-1, #2563eb)' }} />
            </span>
            <span className="text-[12px] m-tabular m-text-2">%{p.pct} · {p.done}/{p.total}</span>
        </div>
    );
};

const STATUS_STRIPE: Record<string, string> = { Backlog: '#a1a1aa', ToDo: '#eab308', InProgress: '#2563eb', Done: '#16a34a' };

const Card: React.FC<{ stripe: string; children: React.ReactNode }> = ({ stripe, children }) => (
    <div className="w-full h-full rounded-xl m-surface m-pop shadow-md overflow-hidden flex" style={{ border: '1px solid var(--m-sep, #e5e7eb)' }}>
        <span className="w-1.5 flex-none" style={{ background: stripe }} />
        <div className="flex-1 min-w-0 p-3 flex flex-col gap-1.5 text-left">{children}</div>
    </div>
);

const Missing: React.FC<{ what: string }> = ({ what }) => (
    <Card stripe="#a1a1aa"><span className="text-[13px] m-text-3">{what} projede bulunamadı (silinmiş olabilir).</span></Card>
);

const Kind: React.FC<{ icon: IconName; label: string }> = ({ icon, label }) => (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold uppercase tracking-wide m-text-3"><Icon name={icon} size={13} />{label}</span>
);

const fmtDate = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '');

const LinkedBody: React.FC<{ n: WbNode; env: NodeEnv }> = ({ n, env }) => {
    const { project } = env;
    if (n.type === 'task') {
        const t = env.tasksById.get(n.ref || '');
        if (!t) return <Missing what="Görev" />;
        const late = t.dueDate && t.status !== 'Done' && t.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10);
        return (
            <Card stripe={STATUS_STRIPE[t.status] || '#a1a1aa'}>
                <div className="flex items-center gap-2" onPointerDown={stop}>
                    <TaskKeyButton task={t} onOpen={() => env.onViewTask(t)} className="!min-h-[26px] !px-2 !text-[12px]" />
                    <span className="text-[12px] px-2 py-0.5 rounded-full m-fill-2 m-text-2 truncate">{taskStatusText(t)}</span>
                    {t.priority === 'Blocker' || t.priority === 'High' ? <span className="ml-auto text-[11.5px] font-semibold m-ink-bad">{t.priority === 'Blocker' ? 'Engelleyici' : 'Yüksek'}</span> : null}
                </div>
                <div className="text-[14px] leading-snug font-semibold m-text line-clamp-2">{t.name}</div>
                <div className="mt-auto text-[12px] m-text-3 truncate">
                    {t.resourceName || 'Atanmamış'}{t.dueDate ? <> · <span className={late ? 'm-ink-bad font-semibold' : ''}>termin {fmtDate(t.dueDate)}</span></> : ''}{t.version ? ` · ${sprintName(t.version, project.settings?.sprintNames)}` : ''}
                </div>
            </Card>
        );
    }
    if (n.type === 'sprint') {
        const num = Number(n.ref);
        const list = tasksOfRef(project, 'sprint', n.ref || '');
        return (
            <Card stripe="#7c3aed">
                <Kind icon="rocket" label="Sprint" />
                <div className="text-[16px] font-semibold m-text truncate">{sprintName(num, project.settings?.sprintNames)}</div>
                <div className="text-[12px] m-text-3">{list.length} görev · {list.filter(t => t.status === 'InProgress').length} süreçte · {list.filter(t => t.status !== 'Done').length} açık</div>
                <Progress tasks={list} project={project} />
            </Card>
        );
    }
    if (n.type === 'workPackage') {
        const w = project.workPackages.find(x => x.id === n.ref);
        if (!w) return <Missing what="İş paketi" />;
        const list = tasksOfRef(project, 'workPackage', w.id);
        return (
            <Card stripe="#0891b2">
                <Kind icon="briefcase" label="İş paketi" />
                <div className="text-[15px] font-semibold m-text line-clamp-2">{w.name}</div>
                <Progress tasks={list} project={project} />
            </Card>
        );
    }
    if (n.type === 'version') {
        const v = project.versions?.find(x => x.id === n.ref);
        if (!v) return <Missing what="Sürüm" />;
        const list = tasksOfRef(project, 'version', v.id);
        return (
            <Card stripe="#16a34a">
                <Kind icon="flag" label={`Sürüm${v.releaseDate ? ` · ${fmtDate(v.releaseDate)}` : ''}`} />
                <div className="text-[15px] font-semibold m-text truncate">{v.name}</div>
                <Progress tasks={list} project={project} />
            </Card>
        );
    }
    if (n.type === 'risk') {
        const r = project.risks?.find(x => x.id === n.ref);
        if (!r) return <Missing what="Risk" />;
        const score = r.probability * r.impact;
        const tone = score >= 15 ? '#dc2626' : score >= 8 ? '#ea580c' : '#16a34a';
        return (
            <Card stripe={tone}>
                <div className="flex items-center gap-2"><Kind icon="shield" label="Risk" /><span className="ml-auto text-[12px] font-bold text-white px-2 rounded-full" style={{ background: tone }}>{score}</span></div>
                <div className="text-[14px] font-semibold m-text line-clamp-2">{r.title}</div>
                <div className="mt-auto text-[12px] m-text-3 truncate">{r.owner || 'Sahip yok'} · {r.status === 'closed' ? 'Kapandı' : r.status === 'monitoring' ? 'İzleniyor' : 'Açık'}</div>
            </Card>
        );
    }
    return null;
};

const ShapeSvg: React.FC<{ n: WbNode; fill: string; edge: string }> = ({ n, fill, edge }) => {
    const { w, h } = n;
    const sw = 2;
    const common = { fill, stroke: edge, strokeWidth: sw };
    return (
        <svg className="absolute inset-0 overflow-visible" width={w} height={h} aria-hidden="true">
            {n.shape === 'ellipse' && <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - sw} ry={h / 2 - sw} {...common} />}
            {n.shape === 'diamond' && <path d={`M${w / 2} ${sw} L${w - sw} ${h / 2} L${w / 2} ${h - sw} L${sw} ${h / 2} Z`} {...common} />}
            {n.shape === 'triangle' && <path d={`M${w / 2} ${sw} L${w - sw} ${h - sw} L${sw} ${h - sw} Z`} {...common} />}
            {(!n.shape || n.shape === 'rect') && <rect x={sw / 2} y={sw / 2} width={w - sw} height={h - sw} rx={10} {...common} />}
        </svg>
    );
};

export const penPath = (pts: number[]): string => {
    if (pts.length < 4) return pts.length === 2 ? `M${pts[0]} ${pts[1]} l0.1 0` : '';
    let d = `M${pts[0]} ${pts[1]}`;
    for (let i = 2; i < pts.length - 2; i += 2) {
        const mx = (pts[i] + pts[i + 2]) / 2, my = (pts[i + 1] + pts[i + 3]) / 2;
        d += ` Q${pts[i]} ${pts[i + 1]} ${mx} ${my}`;
    }
    return `${d} L${pts[pts.length - 2]} ${pts[pts.length - 1]}`;
};

export const PEN_COLORS: Record<string, string> = { gray: '#27272a', blue: '#2563eb', red: '#dc2626', green: '#16a34a', purple: '#7c3aed', orange: '#ea580c', yellow: '#ca8a04', pink: '#db2777', teal: '#0d9488', white: '#ffffff' };

/**
 * Nesnenin içi. `editor` verilirse metin yerine düzenleme alanı çizilir
 * (yapışkan not, metin, şekil, bölüm başlığı).
 */
export const WbNodeBody: React.FC<{ n: WbNode; env: NodeEnv; editor?: React.ReactNode }> = ({ n, env, editor }) => {
    const c = colorOf(n.color, n.type === 'section' ? 'gray' : n.type === 'shape' ? 'blue' : 'yellow');
    const fs = n.fontSize;
    switch (n.type) {
        case 'sticky':
            return (
                <div className="relative w-full h-full rounded-[4px] shadow-[0_2px_6px_rgba(0,0,0,0.18)]" style={{ background: c.fill, color: c.ink }}>
                    <div className="w-full h-full p-4 overflow-hidden text-[16px] leading-snug whitespace-pre-wrap break-words" style={{ fontSize: fs }}>
                        {editor || <RichText text={n.text} env={env} placeholder="Yazmak için çift tıklayın · // ile görev ekleyin" />}
                    </div>
                    {n.author && <span className="absolute left-3 bottom-2 text-[11px] opacity-60 truncate max-w-[85%]">{n.author}</span>}
                    <VoteBadge n={n} env={env} />
                </div>
            );
        case 'text':
            return (
                <div className="relative w-full h-full whitespace-pre-wrap break-words m-text leading-snug" style={{ fontSize: fs || 18, fontWeight: (fs || 18) >= 28 ? 700 : 500 }}>
                    {editor || <RichText text={n.text} env={env} placeholder="Metin" />}
                    <VoteBadge n={n} env={env} />
                </div>
            );
        case 'shape':
            return (
                <div className="relative w-full h-full" style={{ color: c.ink }}>
                    <ShapeSvg n={n} fill={c.fill} edge={c.edge} />
                    <div className="absolute inset-0 grid place-items-center p-4 text-center text-[15px] leading-snug whitespace-pre-wrap break-words" style={{ fontSize: fs }}>
                        <div className="max-h-full overflow-hidden w-full">{editor || <RichText text={n.text} env={env} />}</div>
                    </div>
                    <VoteBadge n={n} env={env} />
                </div>
            );
        case 'section':
            return (
                <div className="w-full h-full rounded-2xl" style={{ background: `${c.fill}66`, border: `2px solid ${c.edge}` }}>
                    <div className="absolute -top-0 left-0 translate-y-[-100%] pb-1.5 max-w-full">
                        <span className="inline-block px-3 py-1 rounded-lg text-[15px] font-semibold truncate max-w-full" style={{ background: c.fill, color: c.ink }}>
                            {editor || n.text || 'Bölüm'}
                        </span>
                    </div>
                </div>
            );
        case 'stamp':
            return <div className="w-full h-full grid place-items-center select-none" style={{ fontSize: Math.min(n.w, n.h) * 0.8, lineHeight: 1 }}>{n.stamp || '👍'}</div>;
        case 'image':
            return n.src
                ? <img src={n.src} alt={n.text || 'Görsel'} draggable={false} className="w-full h-full object-contain rounded-lg shadow-md select-none bg-white" />
                : <div className="w-full h-full grid place-items-center rounded-lg m-fill-2 m-text-3">Görsel yok</div>;
        case 'pen':
            return (
                <svg className="absolute inset-0 overflow-visible" width={Math.max(1, n.w)} height={Math.max(1, n.h)} aria-hidden="true">
                    <path d={penPath(n.points || [])} fill="none" stroke={PEN_COLORS[n.color || 'gray'] || '#27272a'} strokeWidth={n.fontSize || 4} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'stroke' }} />
                </svg>
            );
        default:
            return (
                <div className="relative w-full h-full">
                    <LinkedBody n={n} env={env} />
                    <VoteBadge n={n} env={env} />
                </div>
            );
    }
};
