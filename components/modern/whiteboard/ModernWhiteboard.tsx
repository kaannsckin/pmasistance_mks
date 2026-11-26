import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Person, Project, Task, WbAccess, Whiteboard } from '../../../types';
import { addNodes, boardOutline, cloneNodes, createBoard } from '../../../utils/whiteboard/model';
import { WB_TEMPLATES, WB_TEMPLATE_BY_KEY } from '../../../utils/whiteboard/templates';
import { Icon, IconName } from '../icons';
import WhiteboardEditor from './WhiteboardEditor';
import { useWhiteboardCollab } from './useWhiteboardCollab';
import { initials } from '../../../utils/whiteboard/collab';
import { boardRole, canCreateBoard, canEditBoard, DEFAULT_ACCESS, LEVEL_LABEL, visibleBoards, WbRole, WbViewer } from '../../../utils/whiteboard/access';
import WbAccessSheet from './WbAccessSheet';

/**
 * Proje whiteboard'u (FigJam tarzı): projeye ait panolar, şablondan pano,
 * yeniden adlandırma, çoğaltma, dışa aktarma ve tuval. Panolar projeyle
 * birlikte saklanır ve bulutla eşitlenir.
 */

const activeKey = (projectId: string) => `PLANASISTAN_WB_ACTIVE:${projectId}`;

const download = (name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const safeName = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'pano';

const ABOUT = 'FigJam tarzı serbest çalışma alanı: yapışkan not, şekil, bağlantı, bölüm ve kalem. "/" ile projenin görev, sprint, iş paketi, risk ve sürümlerini kart olarak ekleyin; kartlar Jira eşitlemesiyle güncel kalır. Notta "//" ile görev referansı ekleyin. Notları tek tıkla göreve dönüştürün, oylama ve zamanlayıcıyla toplantı yürütün. Aynı panoyu açan herkes değişiklikleri canlı görür.';

/** "i" bilgi düğmesi: açıklama düz metin olarak yazılmaz, tıklayınca (ya da üzerine gelince) açılır */
const InfoTip: React.FC<{ text: string; label?: string }> = ({ text, label = 'Bilgi' }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
    }, [open]);
    return (
        <span ref={ref} className="relative inline-flex">
            <button type="button" aria-label={label} aria-expanded={open} title={text} onClick={() => setOpen(o => !o)}
                className="w-7 h-7 rounded-full grid place-items-center border-0 cursor-pointer m-fill-2 m-text-2 hover:m-text">
                <Icon name="info" size={15} />
            </button>
            {open && (
                <span role="tooltip" className="absolute left-0 top-9 z-50 w-[340px] max-w-[80vw] p-3 rounded-xl m-surface m-pop shadow-xl text-[13.5px] leading-relaxed m-text-2" style={{ border: '1px solid var(--m-sep, #e5e7eb)' }}>
                    {text}
                </span>
            )}
        </span>
    );
};

const ROLE_TEXT: Record<WbRole, string> = { manage: 'Yönetiyorsunuz', edit: 'Düzenleyebilirsiniz', view: 'Yalnız görüntüleyebilirsiniz', none: 'Erişiminiz yok' };

const ModernWhiteboard: React.FC<{
    project: Project;
    /** Proje içeriğini düzenleyebilir (projenin PY'si): her panoyu yönetir, nottan görev açar */
    canEdit: boolean;
    /** Profildeki kişi: pano açar (sahibi olur), kişi bazında erişim buna göre */
    viewerPersonId?: string;
    /** Paylaşımda kişi seçmek için Veri Havuzu */
    people: Person[];
    onSwitchProfile?: () => void;
    actor: string;
    voter: string;
    onUpdateProject: (updater: (p: Project) => Project) => void;
    onViewTask: (t: Task) => void;
}> = ({ project, canEdit, viewerPersonId, people, onSwitchProfile, actor, voter, onUpdateProject, onViewTask }) => {
    const viewer: WbViewer = { personId: viewerPersonId, projectEditor: canEdit };
    // Panolar eş zamanlı düzenleme kancasından gelir (proje kaydı önbellek); yalnız görülebilenler listelenir
    const collab = useWhiteboardCollab({ project, actor, viewer, onUpdateProject });
    const boards: Whiteboard[] = visibleBoards<Whiteboard>(collab.boards, viewer);
    const canCreate = canCreateBoard(viewer);
    const [sharing, setSharing] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(() => { try { return localStorage.getItem(activeKey(project.id)); } catch { return null; } });
    const active = boards.find(b => b.id === activeId) || boards[0];
    const [menu, setMenu] = useState<'new' | 'board' | null>(null);
    const [renaming, setRenaming] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const shell = useRef<HTMLDivElement>(null);
    const [full, setFull] = useState(false);

    const role: WbRole = active ? boardRole(active, viewer) : 'none';
    const editable = canEditBoard(role);
    const manage = role === 'manage';
    useEffect(() => { try { if (active) localStorage.setItem(activeKey(project.id), active.id); } catch { /* özel pencere */ } }, [active, project.id]);
    useEffect(() => { if (!collab.denied) return; const id = window.setTimeout(() => collab.clearDenied(), 5000); return () => window.clearTimeout(id); }, [collab.denied, collab]);
    useEffect(() => {
        const on = () => setFull(document.fullscreenElement === shell.current);
        document.addEventListener('fullscreenchange', on);
        return () => document.removeEventListener('fullscreenchange', on);
    }, []);
    useEffect(() => {
        if (!menu) return;
        const close = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('[data-wb-menu]')) setMenu(null); };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, [menu]);

    const { commitBoard, setPresence } = collab;
    const onCommit = useCallback((next: Whiteboard, prev: Whiteboard, newTasks?: Task[]) => commitBoard(next.id, prev, next, newTasks), [commitBoard]);
    // Varlık: hangi panodayım (diğerleri sekmede ve tuvalde görür)
    useEffect(() => { setPresence({ board: active?.id, selection: [], editing: null }); }, [active?.id, setPresence]);
    useEffect(() => () => setPresence({ board: undefined }), [setPresence]);

    const create = (templateKey?: string) => {
        setMenu(null);
        const t = templateKey ? WB_TEMPLATE_BY_KEY.get(templateKey) : undefined;
        // Açan kişi panonun sahibi olur; varsayılan: projeyi gören herkes görüntüler
        let b: Whiteboard = { ...createBoard(t ? t.label : `Pano ${boards.length + 1}`, new Date(), actor), ...(viewerPersonId ? { ownerId: viewerPersonId } : {}), access: { ...DEFAULT_ACCESS } };
        if (t) { const built = t.build(project, { x: 0, y: 0 }); b = addNodes(b, built.nodes, built.edges); }
        if (commitBoard(b.id, undefined, b)) setActiveId(b.id);
    };
    const rename = (b: Whiteboard, name: string) => {
        setRenaming(null);
        const n = name.trim();
        if (n && n !== b.name) commitBoard(b.id, b, { ...b, name: n, updatedAt: new Date().toISOString() });
    };
    const duplicate = (b: Whiteboard) => {
        setMenu(null);
        const c = cloneNodes(b.nodes, b.edges, 0, 0);
        // Kopyanın sahibi kopyalayan; erişimi kaynağınki gibi
        const copy: Whiteboard = { ...createBoard(`${b.name} (kopya)`, new Date(), actor), nodes: c.nodes, edges: c.edges, ...(viewerPersonId ? { ownerId: viewerPersonId } : {}), access: b.access || { ...DEFAULT_ACCESS } };
        if (commitBoard(copy.id, undefined, copy)) setActiveId(copy.id);
    };
    const remove = (b: Whiteboard) => {
        setMenu(null);
        if (!window.confirm(`"${b.name}" panosu silinsin mi? Panodaki notlar ve çizimler silinir; bağlı görevler projede kalır.`)) return;
        commitBoard(b.id, b, undefined);
        setActiveId(boards.find(x => x.id !== b.id)?.id || null);
    };
    const copyOutline = async (b: Whiteboard) => {
        setMenu(null);
        try { await navigator.clipboard.writeText(boardOutline(b, project)); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { download(`${safeName(b.name)}.md`, boardOutline(b, project), 'text/markdown'); }
    };
    const toggleFull = () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void shell.current?.requestFullscreen?.();
    };

    const menuItem = (icon: IconName, label: string, run: () => void, danger = false) => (
        <button type="button" role="menuitem" className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border-0 bg-transparent cursor-pointer text-left text-[14px] hover:m-fill-2 ${danger ? 'm-ink-bad' : 'm-text'}`} onClick={run}>
            <Icon name={icon} size={16} />{label}
        </button>
    );

    const newMenu = (
        <div data-wb-menu role="menu" className="absolute z-50 mt-2 w-80 p-1.5 rounded-2xl m-surface m-pop shadow-xl" style={{ border: '1px solid var(--m-sep, #e5e7eb)' }}>
            {menuItem('plus', 'Boş pano', () => create())}
            <div className="px-3 pt-2 pb-1 text-[12px] font-semibold m-text-3">Şablondan</div>
            {WB_TEMPLATES.map(t => (
                <button key={t.key} type="button" role="menuitem" className="w-full flex items-start gap-2.5 px-3 py-2 rounded-lg border-0 bg-transparent cursor-pointer text-left hover:m-fill-2" onClick={() => create(t.key)}>
                    <Icon name={t.icon as IconName} size={16} className="mt-0.5 m-text-2" />
                    <span><span className="block text-[14px] m-text">{t.label}</span><span className="block text-[12px] m-text-3">{t.description}</span></span>
                </button>
            ))}
        </div>
    );

    const owner = active?.ownerId ? people.find(p => p.id === active.ownerId) : undefined;
    const ownerName = owner ? `${owner.firstName} ${owner.lastName}`.trim() : '';
    const blocked = !canCreate && !boards.length && (
        <div className="flex items-start gap-3 p-4 rounded-2xl m-surface m-pop shadow-sm max-w-[760px]" role="note">
            <span className="w-10 h-10 rounded-xl grid place-items-center m-fill-2 m-text-2 flex-none"><Icon name="lock" size={18} /></span>
            <div className="flex-1 min-w-0">
                <b className="block text-[15px] m-text">Pano açmak için profilinizde kişi seçili olmalı</b>
                <p className="mt-1 mb-0 text-[14px] m-text-2">Panoyu açan kişi panonun sahibi olur ve kimlerin görüp düzenleyeceğini o belirler. Profil seçiminden kendinizi seçin.</p>
            </div>
            {onSwitchProfile && <button type="button" className="m-btn m-btn-primary !min-h-[36px] !px-3 text-[14px] flex-none" onClick={onSwitchProfile}><Icon name="userCog" size={15} />Profil değiştir</button>}
        </div>
    );
    const accessText = active ? `${ROLE_TEXT[role]}. ${ownerName ? `Sahibi: ${ownerName}. ` : ''}Projeyi gören herkes: ${LEVEL_LABEL[(active.access || DEFAULT_ACCESS).everyone].toLocaleLowerCase('tr-TR')}${Object.keys(active.access?.people || {}).length ? `; ${Object.keys(active.access!.people!).length} kişiye özel erişim` : ''}.${manage ? '' : ' Erişimi sahibi ya da projenin PY\'si değiştirir.'}` : '';

    if (!boards.length) {
        return (
            <div className="flex flex-col gap-5">
                <div className="flex items-center gap-2">
                    <h2 className="m-0 text-[22px] font-semibold m-text">Whiteboard</h2>
                    <InfoTip text={ABOUT} label="Whiteboard nedir?" />
                </div>
                {canCreate ? (
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                        <button type="button" className="text-left p-4 rounded-2xl m-surface m-pop shadow-sm border-0 cursor-pointer hover:shadow-md flex flex-col gap-2" onClick={() => create()}>
                            <span className="w-10 h-10 rounded-xl grid place-items-center m-tone-accent"><Icon name="plus" size={20} /></span>
                            <b className="text-[15px] m-text">Boş pano</b><span className="text-[13px] m-text-3">Sıfırdan başlayın</span>
                        </button>
                        {WB_TEMPLATES.map(t => (
                            <button key={t.key} type="button" className="text-left p-4 rounded-2xl m-surface m-pop shadow-sm border-0 cursor-pointer hover:shadow-md flex flex-col gap-2" onClick={() => create(t.key)}>
                                <span className="w-10 h-10 rounded-xl grid place-items-center m-fill-2 m-text-2"><Icon name={t.icon as IconName} size={20} /></span>
                                <b className="text-[15px] m-text">{t.label}</b><span className="text-[13px] m-text-3">{t.description}</span>
                            </button>
                        ))}
                    </div>
                ) : blocked}
            </div>
        );
    }

    return (
        <div ref={shell} className={`flex flex-col gap-3 ${full ? 'p-3 m-bg' : ''}`} style={full ? { background: 'var(--m-bg, #fff)' } : undefined}>
            {collab.denied && <div role="alert" className="px-4 py-2.5 rounded-xl text-[14px] m-tone-bad">{collab.denied}</div>}
            <div className="flex flex-wrap items-center gap-2">
                <InfoTip text={ABOUT} label="Whiteboard nedir?" />
                <div className="flex items-center gap-1 overflow-x-auto max-w-full" role="tablist" aria-label="Panolar">
                    {boards.map(b => (
                        renaming === b.id
                            ? <input key={b.id} autoFocus defaultValue={b.name} aria-label="Pano adı" className="m-input !h-9 !py-0 text-[14px] w-56"
                                onBlur={e => rename(b, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') rename(b, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setRenaming(null); }} />
                            : <button key={b.id} type="button" role="tab" aria-selected={b.id === active?.id} title={canEditBoard(boardRole(b, viewer)) ? 'Çift tıklayarak yeniden adlandırın' : `${b.name} · ${ROLE_TEXT[boardRole(b, viewer)].toLocaleLowerCase('tr-TR')}`}
                                className={`h-9 px-3 rounded-xl border-0 cursor-pointer text-[14px] whitespace-nowrap max-w-[240px] truncate inline-flex items-center gap-1.5 ${b.id === active?.id ? 'm-surface m-pop shadow-sm font-semibold m-text' : 'bg-transparent m-text-2 hover:m-fill-2'}`}
                                onClick={() => setActiveId(b.id)} onDoubleClick={() => canEditBoard(boardRole(b, viewer)) && setRenaming(b.id)}>
                                {(b.access?.everyone === 'none') && <Icon name="lock" size={12} aria-label="Özel pano" />}
                                {!canEditBoard(boardRole(b, viewer)) && <Icon name="eye" size={13} aria-label="Yalnız görüntüleme" />}
                                {b.name}
                                {collab.peers.some(p => p.board === b.id) && <span className="inline-flex ml-1.5 align-middle -space-x-1">{collab.peers.filter(p => p.board === b.id).slice(0, 3).map(p => <span key={p.client} className="w-2.5 h-2.5 rounded-full border" style={{ background: p.color, borderColor: 'var(--m-surface, #fff)' }} />)}</span>}
                            </button>
                    ))}
                </div>
                {canCreate && (
                    <div className="relative" data-wb-menu>
                        <button type="button" className="m-btn m-btn-gray !min-h-[36px] !px-3 text-[14px]" aria-haspopup="menu" aria-expanded={menu === 'new'} onClick={() => setMenu(m => (m === 'new' ? null : 'new'))}><Icon name="plus" size={15} />Yeni pano</button>
                        {menu === 'new' && newMenu}
                    </div>
                )}
                <span className="flex-1" />
                {copied && <span role="status" className="text-[13px] m-ink-ok">Pano özeti panoya kopyalandı</span>}
                <span className="inline-flex items-center gap-2 h-9 px-3 rounded-xl m-fill-2 text-[13px] m-text-2" title={collab.info.detail}>
                    <span className="w-2 h-2 rounded-full" style={{ background: collab.info.status === 'live' ? (collab.info.mode === 'cloud' ? '#16a34a' : '#ca8a04') : collab.info.status === 'error' ? '#dc2626' : '#a1a1aa' }} />
                    {collab.info.mode === 'cloud' ? (collab.info.status === 'live' ? 'Canlı' : collab.info.status === 'error' ? 'Canlı bağlantı yok' : 'Bağlanıyor…') : collab.info.mode === 'local' ? 'Canlı (bu tarayıcı)' : 'Canlı kapalı'}
                    {collab.peers.length > 0 && <span className="flex -space-x-1.5">{collab.peers.slice(0, 5).map(p => <span key={p.client} title={`${p.name}${p.board ? ` · ${boards.find(b => b.id === p.board)?.name || ''}` : ''}`} className="w-6 h-6 rounded-full grid place-items-center text-white text-[10.5px] font-bold border-2" style={{ background: p.color, borderColor: 'var(--m-surface, #fff)' }}>{initials(p.name)}</span>)}</span>}
                </span>
                {active && (
                    <span className="inline-flex items-center gap-1.5">
                        {manage
                            ? <button type="button" className="m-btn m-btn-gray !min-h-[36px] !px-3 text-[14px]" onClick={() => setSharing(true)}><Icon name={(active.access || DEFAULT_ACCESS).everyone === 'none' ? 'lock' : 'users'} size={15} />Erişim</button>
                            : <span className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl m-fill-2 text-[13px] m-text-2"><Icon name={editable ? 'pencil' : 'eye'} size={14} />{editable ? 'Düzenleyebilirsiniz' : 'Görüntüleme'}</span>}
                        <InfoTip label="Bu panoda erişim" text={accessText} />
                    </span>
                )}
                {active && (
                    <div className="relative" data-wb-menu>
                        <button type="button" className="m-btn m-btn-gray !min-h-[36px] !px-3 text-[14px]" aria-haspopup="menu" aria-expanded={menu === 'board'} onClick={() => setMenu(m => (m === 'board' ? null : 'board'))}><Icon name="more" size={16} />Pano</button>
                        {menu === 'board' && (
                            <div data-wb-menu role="menu" className="absolute right-0 z-50 mt-2 w-64 p-1.5 rounded-2xl m-surface m-pop shadow-xl" style={{ border: '1px solid var(--m-sep, #e5e7eb)' }}>
                                {editable && menuItem('pencil', 'Yeniden adlandır', () => { setMenu(null); setRenaming(active.id); })}
                                {manage && menuItem('users', 'Erişim ve paylaşım', () => { setMenu(null); setSharing(true); })}
                                {canCreate && menuItem('copy', 'Çoğalt', () => duplicate(active))}
                                {menuItem('list', 'Özeti kopyala (Markdown)', () => { void copyOutline(active); })}
                                {menuItem('download', 'Özeti indir (.md)', () => { setMenu(null); download(`${safeName(active.name)}.md`, boardOutline(active, project), 'text/markdown'); })}
                                {menuItem('download', 'Panoyu indir (.json)', () => { setMenu(null); download(`${safeName(active.name)}.json`, JSON.stringify(active, null, 2), 'application/json'); })}
                                {manage && menuItem('trash', 'Panoyu sil', () => remove(active), true)}
                            </div>
                        )}
                    </div>
                )}
                <button type="button" className="m-btn m-btn-gray !min-h-[36px] !w-9 !px-0" title={full ? 'Küçült' : 'Tam ekran'} aria-label={full ? 'Küçült' : 'Tam ekran'} onClick={toggleFull}><Icon name={full ? 'minimize' : 'expand'} size={15} /></button>
            </div>
            <div className="relative" style={{ height: full ? 'calc(100vh - 80px)' : 'max(560px, calc(100vh - 300px))' }}>
                {active && (
                    <WhiteboardEditor key={active.id} board={active} project={project} canEdit={editable} canCreateTasks={canEdit} actor={actor} voter={voter}
                        canVote={editable || (!!viewerPersonId && voter === viewerPersonId)}
                        onCommit={onCommit} onViewTask={onViewTask}
                        collab={{
                            peers: collab.peersOn(active.id),
                            live: collab.liveOn(active.id),
                            cursor: (x, y) => collab.sendCursor(active.id, x, y),
                            presence: p => setPresence(p),
                            liveMove: nodes => collab.sendLive(active.id, nodes),
                        }} />
                )}
            </div>
            {sharing && active && manage && (
                <WbAccessSheet board={active} people={people} pmPersonId={project.pmPersonId} onClose={() => setSharing(false)}
                    onSave={(access: WbAccess, ownerId?: string) => {
                        const { ownerId: _o, ...rest } = active;
                        if (commitBoard(active.id, active, { ...rest, ...(ownerId ? { ownerId } : {}), access, updatedAt: new Date().toISOString() })) setSharing(false);
                    }} />
            )}
            {!full && editable && (
                <div className="flex items-center gap-2 text-[12.5px] m-text-3">
                    <InfoTip label="Kısayollar" text="V seç · H el · S not · T metin · R şekil · Shift+S bölüm · L bağlantı · P kalem · E damga · / ekle · Notta // görev referansı · Çift tık: not / düzenle · Ctrl+Enter: yanına not · Boşluk + sürükle: kaydır · Ctrl + tekerlek: yakınlaştır · Ctrl+Z / Ctrl+Shift+Z · Ctrl+D çoğalt · Görsel yapıştırın ya da sürükleyin." />
                    Kısayollar
                </div>
            )}
        </div>
    );
};

export default ModernWhiteboard;
