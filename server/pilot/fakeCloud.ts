import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CloudClients } from './cloud.js';

/**
 * Testler için bellekte Supabase: supabase/schema.sql'deki tablolar, RLS
 * politikaları, çalışma alanı tetikleyicisi ve auth (yönetici API'si dahil).
 * Sunucu anahtarlı istemci RLS'i atlar; hesap istemcileri oturumdaki
 * kullanıcının üyelik rolüyle sınırlanır — gerçek veritabanı gibi.
 */

type Row = Record<string, unknown>;
type Table = 'workspaces' | 'workspace_projects' | 'workspace_private' | 'workspace_members';
type Err = { message: string; code?: string } | null;

export interface FakeCloudServer {
    users: { id: string; email: string; password: string }[];
    tables: Record<Table, Row[]>;
    /** E-posta → kayıtlı oturum (dosyadaki oturum deposunun karşılığı) */
    sessions: Map<string, { user: { id: string; email: string } }>;
    signIns: number;
}

const KEYS: Record<Table, string[]> = {
    workspaces: ['id'],
    workspace_projects: ['workspace_id', 'project_id'],
    workspace_private: ['workspace_id'],
    workspace_members: ['workspace_id', 'user_id'],
};

const INPUT_ROLES = ['py', 'bolum_sorumlu', 'pyb_destek'];
const ADMIN_ROLES = ['pyb_destek', 'mudur'];

class FakeQuery {
    private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
    private filters: ((r: Row) => boolean)[] = [];
    private payload: Row[] = [];
    private patch: Row = {};
    private returning = false;
    private one: 'maybe' | 'single' | null = null;
    private onConflict: string[] | null = null;

    constructor(private server: FakeCloudServer, private table: Table, private uid: () => string | null) {}

    select() { this.returning = true; return this; }
    insert(p: Row | Row[]) { this.op = 'insert'; this.payload = Array.isArray(p) ? p : [p]; return this; }
    upsert(p: Row | Row[], o?: { onConflict?: string }) { this.op = 'upsert'; this.payload = Array.isArray(p) ? p : [p]; this.onConflict = o?.onConflict?.split(',') || null; return this; }
    update(p: Row) { this.op = 'update'; this.patch = p; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(k: string, v: unknown) { this.filters.push(r => r[k] === v); return this; }
    in(k: string, vs: unknown[]) { this.filters.push(r => vs.includes(r[k])); return this; }
    maybeSingle() { this.one = 'maybe'; return this; }
    single() { this.one = 'single'; return this; }

    private role(ws: unknown): string | null {
        const uid = this.uid();
        if (uid === 'service') return 'service';
        const m = this.server.tables.workspace_members.find(r => r.workspace_id === ws && r.user_id === uid);
        return (m?.role as string) || null;
    }

    /** RLS: satır bu işlem için görünür / yazılabilir mi */
    private allowed(r: Row, op: 'select' | 'insert' | 'update' | 'delete'): boolean {
        const uid = this.uid();
        if (uid === 'service') return true;
        switch (this.table) {
            case 'workspaces':
                if (op === 'insert' || op === 'delete') return r.created_by === uid;
                return this.role(r.id) !== null;
            case 'workspace_projects':
                return this.role(r.workspace_id) !== null;
            case 'workspace_private':
                return INPUT_ROLES.includes(this.role(r.workspace_id) || '');
            case 'workspace_members':
                return op === 'select' ? this.role(r.workspace_id) !== null : ADMIN_ROLES.includes(this.role(r.workspace_id) || '');
        }
    }

    private sameKey(a: Row, b: Row, keys = KEYS[this.table]) {
        return keys.every(k => a[k] === b[k]);
    }

    private withDefaults(p: Row): Row {
        const r = structuredClone(p);
        if (this.table === 'workspaces') {
            r.id ??= randomUUID();
            r.version ??= 0;
            r.core ??= {};
            r.created_by ??= this.uid();
        }
        if (this.table === 'workspace_private') { r.data ??= {}; r.version ??= 0; }
        if (this.table === 'workspace_projects') r.version ??= 1;
        return r;
    }

    /** handle_new_workspace tetikleyicisi */
    private afterWorkspaceInsert(r: Row) {
        const t = this.server.tables;
        if (!t.workspace_members.some(m => m.workspace_id === r.id && m.user_id === r.created_by)) t.workspace_members.push({ workspace_id: r.id, user_id: r.created_by, role: 'pyb_destek' });
        if (!t.workspace_private.some(m => m.workspace_id === r.id)) t.workspace_private.push({ workspace_id: r.id, data: {}, version: 0 });
    }

    private exec(): { data: unknown; error: Err } {
        const rows = this.server.tables[this.table];
        const visible = (op: 'select' | 'update' | 'delete') => rows.filter(r => this.filters.every(f => f(r)) && this.allowed(r, op));
        const out = (list: Row[]): { data: unknown; error: Err } => {
            const copy = structuredClone(list);
            if (this.one === 'single') return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
            if (this.one === 'maybe') return { data: copy[0] ?? null, error: null };
            return { data: copy, error: null };
        };
        switch (this.op) {
            case 'select':
                return out(visible('select'));
            case 'insert':
            case 'upsert': {
                const written: Row[] = [];
                for (const p of this.payload) {
                    const r = this.withDefaults(p);
                    if (!this.allowed(r, 'insert')) return { data: null, error: { message: `new row violates row-level security policy for table "${this.table}"`, code: '42501' } };
                    const existing = rows.find(x => this.sameKey(x, r, this.onConflict || KEYS[this.table]));
                    if (existing) {
                        if (this.op === 'insert') return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
                        if (!this.allowed(existing, 'update')) return { data: null, error: { message: 'row-level security', code: '42501' } };
                        Object.assign(existing, r);
                        written.push(existing);
                        continue;
                    }
                    rows.push(r);
                    written.push(r);
                    if (this.table === 'workspaces') this.afterWorkspaceInsert(r);
                }
                return this.returning ? out(written) : { data: null, error: null };
            }
            case 'update': {
                const hit = visible('update');
                hit.forEach(r => Object.assign(r, structuredClone(this.patch)));
                return this.returning ? out(hit) : { data: null, error: null };
            }
            case 'delete': {
                const hit = visible('delete');
                this.server.tables[this.table] = rows.filter(r => !hit.includes(r));
                return this.returning ? out(hit) : { data: null, error: null };
            }
        }
    }

    then<T>(resolve: (v: { data: unknown; error: Err }) => T, reject?: (e: unknown) => T) {
        return Promise.resolve().then(() => this.exec()).then(resolve, reject);
    }
}

export const fakeCloudServer = (): FakeCloudServer => ({
    users: [],
    tables: { workspaces: [], workspace_projects: [], workspace_private: [], workspace_members: [] },
    sessions: new Map(),
    signIns: 0,
});

const serviceClient = (server: FakeCloudServer): SupabaseClient => ({
    auth: {
        admin: {
            listUsers: async ({ page = 1, perPage = 50 }: { page?: number; perPage?: number } = {}) =>
                ({ data: { users: server.users.slice((page - 1) * perPage, page * perPage).map(u => ({ id: u.id, email: u.email })) }, error: null }),
            createUser: async (a: { email: string; password: string }) => {
                if (server.users.some(u => u.email === a.email.toLowerCase())) return { data: { user: null }, error: { message: 'A user with this email address has already been registered' } };
                const user = { id: randomUUID(), email: a.email.toLowerCase(), password: a.password };
                server.users.push(user);
                return { data: { user: { id: user.id, email: user.email } }, error: null };
            },
            updateUserById: async (id: string, a: { password?: string }) => {
                const u = server.users.find(x => x.id === id);
                if (!u) return { data: { user: null }, error: { message: 'User not found' } };
                if (a.password) u.password = a.password;
                return { data: { user: { id: u.id, email: u.email } }, error: null };
            },
        },
    },
    from: (table: Table) => new FakeQuery(server, table, () => 'service'),
}) as unknown as SupabaseClient;

const accountClient = (server: FakeCloudServer, email: string): SupabaseClient => ({
    auth: {
        getSession: async () => ({ data: { session: server.sessions.get(email) || null }, error: null }),
        signInWithPassword: async (c: { email: string; password: string }) => {
            server.signIns++;
            const u = server.users.find(x => x.email === c.email.toLowerCase() && x.password === c.password);
            if (!u) return { data: { user: null, session: null }, error: { name: 'AuthApiError', message: 'Invalid login credentials' } };
            const session = { user: { id: u.id, email: u.email } };
            server.sessions.set(email, session);
            return { data: { user: session.user, session }, error: null };
        },
    },
    from: (table: Table) => new FakeQuery(server, table, () => server.sessions.get(email)?.user.id || null),
}) as unknown as SupabaseClient;

/** Gerçek supabaseClients() ile aynı arayüz; aynı e-posta aynı istemciyi alır */
export const fakeCloudClients = (server: FakeCloudServer): CloudClients => {
    const service = serviceClient(server);
    const accounts = new Map<string, SupabaseClient>();
    return {
        service: () => service,
        account: email => {
            let c = accounts.get(email);
            if (!c) { c = accountClient(server, email); accounts.set(email, c); }
            return c;
        },
    };
};

/** Uygulamada kendi kendine kayıt olmuş gerçek kullanıcı (izleyici) */
export const registerUser = (server: FakeCloudServer, email: string, password = 'izleyici-parola'): string => {
    const id = randomUUID();
    server.users.push({ id, email: email.toLowerCase(), password });
    return id;
};
