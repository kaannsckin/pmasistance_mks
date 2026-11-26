import { describe, expect, it } from 'vitest';
import { Task, TaskStatus } from '../../types';
import { createProject } from '../workspace';
import {
    addEdge, addNodes, boardOutline, castVote, createBoard, dragSet, duplicateNodes, edgeEnds, endVoting, insertToken, makeNode, moveNodes,
    projectSprints, removeNodes, searchProject, sectionChildren, startTimer, startVoting, taskFromNode, tasksOfRef, textSegments, timerLeft,
    voteRefusal, voteResults, votesUsed, voteTally, votingDue, wantsReference,
} from './model';
import { WB_TEMPLATES } from './templates';

const task = (id: string, over: Partial<Task> = {}): Task => ({
    id, name: `Görev ${id}`, availability: true, priority: 'Medium', version: 0, predecessor: null, unit: 'EMS', resourceName: 'Ayşe',
    time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.ToDo, ...over,
});

const project = () => ({
    ...createProject('Safir'),
    tasks: [
        task('t1', { jiraId: 'MPS-101', name: 'Parola politikası', version: 1, workPackageId: 'wp1', fixVersion: 'R1' }),
        task('t2', { jiraId: 'MPS-102', name: 'Hesap kilitleme', version: 1, status: TaskStatus.Done }),
        task('t3', { name: 'Adres defteri', version: 2, priority: 'High' as const }),
        task('t4', { jiraId: 'MPS-104', name: 'Yedekleme', version: 0 }),
    ],
    workPackages: [{ id: 'wp1', name: 'EP-01 · Kimlik', description: '' }],
    risks: [{ id: 'r1', title: 'Jira erişimi gecikir', probability: 4 as const, impact: 4 as const, status: 'open' as const, createdAt: '2026-11-01' }],
    versions: [{ id: 'v1', name: 'R1', status: 'unreleased' as const, releaseDate: '2026-12-20' }],
    settings: { ...createProject('x').settings, sprintNames: { 3: 'Kapanış' } },
});

describe('whiteboard: pano işlemleri', () => {
    it('bölüm taşınınca içindekiler de taşınır; kilitliler taşınmaz', () => {
        const sec = makeNode('section', 0, 0, { w: 400, h: 300 });
        const inside = makeNode('sticky', 50, 50);
        const outside = makeNode('sticky', 600, 50);
        const locked = makeNode('sticky', 100, 60, { locked: true });
        const b = addNodes(createBoard('X'), [sec, inside, outside, locked]);
        expect(sectionChildren(b, sec).map(n => n.id)).toEqual([inside.id, locked.id]);
        const set = dragSet(b, [sec.id]);
        expect([...set].sort()).toEqual([sec.id, inside.id].sort());
        const moved = moveNodes(b, set, 10, 5);
        expect(moved.nodes.find(n => n.id === inside.id)).toMatchObject({ x: 60, y: 55 });
        expect(moved.nodes.find(n => n.id === outside.id)!.x).toBe(600);
    });

    it('silme bağlantıları da kaldırır; kilitli nesne silinmez', () => {
        const a = makeNode('sticky', 0, 0), c = makeNode('sticky', 400, 0), l = makeNode('sticky', 800, 0, { locked: true });
        let b = addEdge(addNodes(createBoard('X'), [a, c, l]), a.id, c.id);
        b = addEdge(b, a.id, c.id); // aynı bağlantı ikinci kez eklenmez
        expect(b.edges).toHaveLength(1);
        b = removeNodes(b, [a.id, l.id]);
        expect(b.nodes.map(n => n.id)).toEqual([c.id, l.id]);
        expect(b.edges).toEqual([]);
    });

    it('çoğaltma: kopyalar kaydırılır, aradaki bağlantı kopyalanır, oy ve kilit taşınmaz', () => {
        const a = makeNode('sticky', 0, 0, { votes: { me: 2 }, locked: true }), c = makeNode('sticky', 300, 0);
        const b = addEdge(addNodes(createBoard('X'), [a, c]), a.id, c.id);
        const r = duplicateNodes(b, [a.id, c.id]);
        expect(r.board.nodes).toHaveLength(4);
        const copies = r.board.nodes.filter(n => r.ids.includes(n.id));
        expect(copies.map(n => n.x).sort((x, y) => x - y)).toEqual([24, 324]);
        expect(copies.every(n => !n.votes && !n.locked)).toBe(true);
        expect(r.board.edges).toHaveLength(2);
    });

    it('bağlantı uçları kenarlarda kesilir', () => {
        expect(edgeEnds({ x: 0, y: 0, w: 100, h: 100 }, { x: 300, y: 0, w: 100, h: 100 })).toEqual({ x1: 100, y1: 50, x2: 300, y2: 50 });
    });
});

describe('whiteboard: "/" araması ve referanslar', () => {
    const p = project();

    it('görev anahtarı, ad, sprint, iş paketi, risk ve sürüm bulunur; tam anahtar en üstte', () => {
        expect(searchProject(p, 'mps-102')[0]).toMatchObject({ kind: 'task', ref: 't2', token: 'MPS-102' });
        expect(searchProject(p, 'parola').map(h => h.ref)).toEqual(['t1']);
        expect(searchProject(p, 'kapanış')).toEqual([expect.objectContaining({ kind: 'sprint', ref: '3', label: 'Kapanış' })]);
        expect(searchProject(p, 'kimlik').map(h => h.kind)).toEqual(['workPackage']);
        expect(searchProject(p, 'jira erişimi')[0]).toMatchObject({ kind: 'risk', sub: 'Skor 16' });
        expect(searchProject(p, 'r1', { kinds: ['version'] })[0]).toMatchObject({ kind: 'version', ref: 'v1' });
        // Anahtarı olmayan görev #kimlik ile referanslanır
        expect(searchProject(p, 'adres')[0].token).toBe('#t3');
    });

    it('boş sorguda her türden kayıt gelir; açık görevler önce', () => {
        const hits = searchProject(p, '');
        expect(new Set(hits.map(h => h.kind))).toEqual(new Set(['task', 'sprint', 'workPackage', 'risk', 'version']));
        expect(hits.filter(h => h.kind === 'task').at(-1)!.ref).toBe('t2'); // tamamlanan sonda
    });

    it('sprintler ve kayıtların görevleri', () => {
        expect(projectSprints(p)).toEqual([1, 2, 3]);
        expect(tasksOfRef(p, 'sprint', '1').map(t => t.id)).toEqual(['t1', 't2']);
        expect(tasksOfRef(p, 'workPackage', 'wp1').map(t => t.id)).toEqual(['t1']);
        expect(tasksOfRef(p, 'version', 'v1').map(t => t.id)).toEqual(['t1']);
    });

    it('metindeki görev anahtarları ve #kimlik görev parçası olur; bilinmeyen anahtar metin kalır', () => {
        const seg = textSegments('Önce MPS-101, sonra #t3 ve ABC-9 bakılacak', p.tasks);
        expect(seg.map(s => ('task' in s ? `[${s.task.id}]` : s.text))).toEqual(['Önce ', '[t1]', ', sonra ', '[t3]', ' ve ABC-9 bakılacak']);
    });

    it('"//" referans paletini açar ve seçilen token "//" yerine yazılır', () => {
        expect(wantsReference('bakılacak //', 12)).toBe(true);
        expect(wantsReference('//', 2)).toBe(true);
        expect(wantsReference('satır\n//', 8)).toBe(true);
        expect(wantsReference('http://', 7)).toBe(false);
        expect(wantsReference('///', 3)).toBe(false);
        expect(insertToken('bağlı: // sonra', 9, 'MPS-101')).toEqual({ text: 'bağlı: MPS-101  sonra', caret: 15 });
    });
});

describe('whiteboard: oylama, zamanlayıcı, göreve dönüştürme', () => {
    it('kişi başına oy hakkı; geri alma; sonuçlar çoktan aza', () => {
        const a = makeNode('sticky', 0, 0), c = makeNode('sticky', 300, 0);
        let b = startVoting(addNodes(createBoard('X'), [a, c]), 2);
        b = castVote(b, a.id, 'ayse');
        b = castVote(b, a.id, 'ayse');
        expect(castVote(b, c.id, 'ayse')).toBe(b); // hak bitti
        b = castVote(b, a.id, 'ayse', -1);
        b = castVote(b, c.id, 'ayse');
        b = castVote(b, c.id, 'mehmet');
        expect(votesUsed(b, 'ayse')).toBe(2);
        b = endVoting(b);
        expect(castVote(b, a.id, 'zeynep')).toBe(b); // oylama bitti
        expect(voteResults(b).map(r => [r.node.id, r.votes])).toEqual([[c.id, 2], [a.id, 1]]);
        // Yeni oylama eski oyları temizler
        expect(voteResults(startVoting(b, 3))).toEqual([]);
    });

    it('zamanlayıcı kalan süreyi saniye olarak verir', () => {
        const now = new Date('2026-11-26T10:00:00Z');
        const b = startTimer(createBoard('X'), 300, now);
        expect(timerLeft(b, new Date('2026-11-26T10:01:30Z'))).toBe(210);
        expect(timerLeft(b, new Date('2026-11-26T10:06:00Z'))).toBe(0);
        expect(timerLeft(createBoard('Y'))).toBeNull();
    });

    it('yapışkan not → görev: ilk satır ad, kalanı not; boş not görev olmaz', () => {
        const t = taskFromNode({ text: 'Parola sıfırlama e-postası\nŞablon gözden geçirilecek' }, { now: new Date('2026-11-26T10:00:00Z'), unit: 'EMS', boardName: 'Retro', author: 'Ayşe' })!;
        expect(t).toMatchObject({ name: 'Parola sıfırlama e-postası', status: TaskStatus.ToDo, version: 0, unit: 'EMS', labels: ['Whiteboard'], resourceName: 'Atanmamış' });
        expect(t.notes).toBe('Şablon gözden geçirilecek\nWhiteboard: Retro · Ayşe');
        expect(taskFromNode({ text: '  \n ' }, { now: new Date(), unit: 'EMS', boardName: 'X' })).toBeNull();
    });

    it('pano özeti bölüm bölüm', () => {
        const p = project();
        const sec = makeNode('section', 0, 0, { w: 600, h: 400, text: 'Aksiyonlar' });
        const b = addNodes(createBoard('Retro'), [sec, makeNode('sticky', 20, 40, { text: 'Testi hızlandır', votes: { a: 2 } }), makeNode('task', 300, 40, { ref: 't1' }), makeNode('sticky', 900, 0, { text: 'Serbest not' })]);
        expect(boardOutline(b, p)).toBe('# Retro\n\n## Aksiyonlar\n- Testi hızlandır (2 oy)\n- MPS-101 Parola politikası (Yapılacak)\n\n## Diğer\n- Serbest not');
    });
});

describe('whiteboard şablonları', () => {
    it('her şablon nesne üretir; bağlantılar var olan nesnelere gider', () => {
        const p = project();
        for (const t of WB_TEMPLATES) {
            const r = t.build(p, { x: 0, y: 0 });
            expect(r.nodes.length, t.key).toBeGreaterThan(0);
            const ids = new Set(r.nodes.map(n => n.id));
            expect(r.edges.every(e => ids.has(e.from) && ids.has(e.to)), t.key).toBe(true);
        }
    });

    it('sprint planlama şu anki sprintin görevlerini, Kanban açık görevleri, risk şablonu riskleri karta bağlar', () => {
        const p = project();
        const sprint = WB_TEMPLATES.find(t => t.key === 'sprint')!.build(p, { x: 0, y: 0 });
        expect(sprint.nodes.filter(n => n.type === 'task').map(n => n.ref).sort()).toEqual(['t1', 't2', 't3', 't4']);
        const kanban = WB_TEMPLATES.find(t => t.key === 'kanban')!.build(p, { x: 0, y: 0 });
        expect(kanban.nodes.filter(n => n.type === 'task')).toHaveLength(4);
        const risk = WB_TEMPLATES.find(t => t.key === 'risk')!.build(p, { x: 0, y: 0 });
        expect(risk.nodes.filter(n => n.type === 'risk').map(n => n.ref)).toEqual(['r1']);
        const ux = WB_TEMPLATES.find(t => t.key === 'uxreview')!.build(p, { x: 0, y: 0 });
        expect(ux.nodes.filter(n => n.type === 'section').map(n => n.text)).toEqual(['01 — Gereksinim', '02 — Mevcut arayüz', '03 — Alternatif tasarımlar', '04 — Ekip değerlendirmesi', '05 — Oylama', '06 — Karar ve aksiyon']);
    });
});

describe('whiteboard: oylama kurulumu', () => {
    const sec = makeNode('section', 0, 0, { w: 600, h: 400 });
    const inside = makeNode('sticky', 50, 50);
    const outside = makeNode('sticky', 900, 50);
    const base = addNodes(createBoard('X'), [sec, inside, outside]);
    it('kapsam: yalnız bölümün içindekiler oylanır', () => {
        const b = startVoting(base, { perPerson: 3, scope: sec.id, title: '  Öncelik? ' });
        expect(b.voting).toMatchObject({ active: true, perPerson: 3, scope: sec.id, title: 'Öncelik?' });
        expect(voteRefusal(b, outside.id, 'k1')).toBe('notVotable');
        expect(voteRefusal(b, sec.id, 'k1')).toBe('notVotable');
        expect(castVote(b, inside.id, 'k1').nodes.find(n => n.id === inside.id)?.votes).toEqual({ k1: 1 });
    });
    it('nota en fazla 1 oy ve kalan hak', () => {
        let b = startVoting(base, { perPerson: 3, maxPerNode: 1 });
        b = castVote(b, inside.id, 'k1');
        expect(voteRefusal(b, inside.id, 'k1')).toBe('nodeLimit');
        b = castVote(b, outside.id, 'k1');
        b = castVote(b, outside.id, 'k2');
        expect(voteTally(b)).toEqual({ voters: 2, votes: 3 });
        expect(voteRefusal(b, inside.id, 'k1', -1)).toBeNull();
    });
    it('süreli oylama zamanlayıcıyla başlar, süresi dolunca biter ve zamanlayıcıyı kapatır', () => {
        const t0 = new Date('2026-11-26T10:00:00Z');
        const b = startVoting(base, { perPerson: 2, minutes: 5 }, t0);
        expect(b.timer?.seconds).toBe(300);
        expect(votingDue(b, new Date('2026-11-26T10:04:59Z'))).toBe(false);
        expect(votingDue(b, new Date('2026-11-26T10:05:00Z'))).toBe(true);
        const ended = endVoting(b, new Date('2026-11-26T10:05:01Z'));
        expect(ended.voting?.active).toBe(false);
        expect(ended.timer).toBeUndefined();
        expect(endVoting(startTimer(startVoting(base, 2), 60)).timer).toBeDefined(); // ayrı zamanlayıcı kalır
    });
});
