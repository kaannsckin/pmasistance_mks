import type { SupabaseClient } from '@supabase/supabase-js';
import { Allocation, Person, Task, TaskStatus, UserRole, WorkspaceData } from '../../types.js';
import { createEmptyWorkspace, createProject } from '../../utils/workspace.js';
import { LoadedWorkspace, WorkspaceSource } from './source.js';

/** MCP testlerinin ortak örnek verisi: iki proje (altay: p1'in, gizli: p2'nin), notlar, tahsis */

const person = (id: string, first: string, last: string, dept = 'U310'): Person => ({
    id, firstName: first, lastName: last, departmentCode: dept, availableAA: 1, roles: ['Yazılım Geliştirme Mühendisi'], sicil: `SC${id}99`, titleCode: 'ARŞ',
});

const task = (id: string, name: string, extra: Partial<Task> = {}): Task => ({
    id, name, availability: true, priority: 'High', version: 1, predecessor: null, unit: 'U310', resourceName: 'Ayşe Kaya',
    time: { best: 1, avg: 2, worst: 4 }, jiraId: '', notes: '', status: TaskStatus.ToDo, ...extra,
});

export const sampleWorkspace = (role?: UserRole, personId?: string): WorkspaceData => {
    const altay = createProject('ALTAY Sistemi', { code: 'ALT-01' });
    altay.id = 'altay';
    altay.pmPersonId = 'p1';
    altay.rag = 'amber';
    altay.tasks = [task('t1', 'Arayüz tasarımı', { dueDate: '2026-06-01' }), task('t2', 'Test planı', { dueDate: '2026-07-20' })];
    altay.notes = [{ id: 'n1', content: 'Müşteri toplantısı: kapsam genişliyor, ek bütçe isteyeceğiz.', createdAt: '2026-07-10T10:00:00Z', weekNumber: 28, year: 2026, tags: [], mentions: [] }];

    const gizli = createProject('Gizli Proje', { code: 'GZL' });
    gizli.id = 'gizli';
    gizli.pmPersonId = 'p2';
    gizli.tasks = [task('g1', 'Gizli görev')];

    return {
        ...createEmptyWorkspace(),
        currentRole: role,
        currentPersonId: personId,
        projects: [altay, gizli],
        people: [person('p1', 'Ayşe', 'Kaya'), person('p2', 'Mehmet', 'Demir'), person('p3', 'Zeynep', 'Şahin', 'U320')],
        departments: [{ code: 'U310', name: 'Yazılım' }, { code: 'U320', name: 'Test' }],
        titles: [{ code: 'ARŞ', name: 'Araştırmacı', monthlyCost: 100000 }],
        allocations: [
            { id: 'a1', personId: 'p1', projectId: 'altay', year: 2026, plan: { 7: 1, 8: 0.5 }, actual: {} } as Allocation,
            { id: 'a2', personId: 'p2', projectId: 'gizli', year: 2026, plan: { 7: 0.5 }, actual: {} } as Allocation,
        ],
    };
};

/** Bellekte veri kaynağı: kaydedilenler `saved`'a düşer, sonraki okuma onları döndürür */
export const memorySource = (initial: WorkspaceData, o: { kind?: WorkspaceSource['kind']; readOnlyReason?: string; memberRole?: UserRole } = {}) => {
    let current = initial;
    const saved: { before: WorkspaceData; after: WorkspaceData }[] = [];
    let loads = 0;
    const source: WorkspaceSource = {
        kind: o.kind || 'supabase',
        readOnlyReason: () => o.readOnlyReason || null,
        load: async (): Promise<LoadedWorkspace> => {
            loads++;
            return { ws: current, memberRole: o.memberRole, privateVisible: true, label: 'bellek', dataAt: '2026-07-15T09:00:00Z' };
        },
        save: async (before, after) => {
            saved.push({ before, after });
            current = after;
        },
    };
    return { source, saved, set: (ws: WorkspaceData) => { current = ws; }, loads: () => loads };
};

// ---------------------------------------------------------------------------
// Supabase sahtesi: PostgREST sorgu zincirinin kullanılan alt kümesi
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
export type FakeDb = Record<'workspaces' | 'workspace_projects' | 'workspace_private' | 'workspace_members', Row[]>;

class FakeQuery {
    private op: 'select' | 'insert' | 'update' = 'select';
    private filters: ((r: Row) => boolean)[] = [];
    private payload: Row | null = null;
    private single = false;
    private returning = false;

    constructor(private db: FakeDb, private table: keyof FakeDb, private calls: { table: string; op: string; payload?: Row }[], private failures: { table: string; message: string }[]) {}

    select() { this.returning = true; return this; }
    insert(p: Row) { this.op = 'insert'; this.payload = p; return this; }
    update(p: Row) { this.op = 'update'; this.payload = p; return this; }
    eq(k: string, v: unknown) { this.filters.push(r => r[k] === v); return this; }
    in(k: string, vs: unknown[]) { this.filters.push(r => vs.includes(r[k])); return this; }
    maybeSingle() { this.single = true; return this; }

    private exec(): { data: unknown; error: { message: string; code?: string } | null } {
        const fail = this.failures.findIndex(f => f.table === this.table);
        if (fail >= 0) return { data: null, error: { message: this.failures.splice(fail, 1)[0].message } };
        const rows = this.db[this.table];
        const match = rows.filter(r => this.filters.every(f => f(r)));
        if (this.op === 'insert') {
            this.calls.push({ table: this.table, op: 'insert', payload: this.payload! });
            const p = this.payload!;
            if (this.table === 'workspace_projects' && rows.some(r => r.workspace_id === p.workspace_id && r.project_id === p.project_id)) {
                return { data: null, error: { message: 'duplicate key', code: '23505' } };
            }
            rows.push(structuredClone(p));
            return { data: null, error: null };
        }
        if (this.op === 'update') {
            this.calls.push({ table: this.table, op: 'update', payload: this.payload! });
            match.forEach(r => Object.assign(r, structuredClone(this.payload!)));
            return { data: this.returning ? match.map(r => ({ ...r })) : null, error: null };
        }
        const out = structuredClone(match);
        return { data: this.single ? out[0] ?? null : out, error: null };
    }

    then<T>(resolve: (v: { data: unknown; error: { message: string; code?: string } | null }) => T, reject?: (e: unknown) => T) {
        return Promise.resolve().then(() => this.exec()).then(resolve, reject);
    }
}

export const fakeSupabase = (db: FakeDb, user = { id: 'u1' }, password = 'dogru-parola') => {
    const calls: { table: string; op: string; payload?: Row }[] = [];
    /** Sıradaki ilgili sorgu bu hatayla döner (bir kez) */
    const failures: { table: string; message: string }[] = [];
    let signIns = 0;
    const client = {
        auth: {
            getSession: async () => ({ data: { session: null } }),
            signInWithPassword: async (c: { email: string; password: string }) => {
                signIns++;
                return c.password === password
                    ? { data: { user, session: {} }, error: null }
                    : { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
            },
        },
        from: (table: keyof FakeDb) => new FakeQuery(db, table, calls, failures),
    };
    return { client: client as unknown as SupabaseClient, calls, failures, signIns: () => signIns };
};
