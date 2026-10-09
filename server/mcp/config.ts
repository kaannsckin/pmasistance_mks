import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { UserRole } from '../../types.js';
import { PlanAsistanMcpOptions } from './planasistan.js';
import { fileSource, supabaseSource, WorkspaceSource } from './source.js';

/**
 * MCP sunucusunun ayarları — MCP istemcisinin (Claude Desktop, Claude Code…)
 * yapılandırmasındaki ortam değişkenlerinden okunur. Tüm adlar PLANASISTAN_
 * önekiyle başlar; AI proxy'sinin değişkenleriyle karışmaz.
 * Ayrıntı: docs/MCP_KURULUM.md
 */

export type McpEnv = Record<string, string | undefined>;

export const MCP_ROLES: UserRole[] = ['mudur', 'pyb_sorumlu', 'pyb_destek', 'py', 'bolum_sorumlu', 'admin'];

const truthy = (v: string | undefined): boolean => ['1', 'true', 'evet', 'yes', 'on'].includes((v || '').trim().toLowerCase());

export interface McpConfigDeps {
    createSupabase?: (url: string, anonKey: string) => SupabaseClient;
}

const defaultSupabase = (url: string, anonKey: string): SupabaseClient =>
    createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } });

export const readMcpConfig = (env: McpEnv, deps: McpConfigDeps = {}): PlanAsistanMcpOptions => {
    const v = (k: string) => env[k]?.trim() || undefined;
    const file = v('PLANASISTAN_WORKSPACE_FILE');
    const url = v('PLANASISTAN_SUPABASE_URL');
    const anonKey = v('PLANASISTAN_SUPABASE_ANON_KEY');
    const email = v('PLANASISTAN_EMAIL');
    const password = env.PLANASISTAN_PASSWORD || undefined; // parola kırpılmaz
    const roleRaw = v('PLANASISTAN_ROLE');

    const base = {
        person: v('PLANASISTAN_PERSON'),
        project: v('PLANASISTAN_PROJECT'),
        allowWrite: truthy(env.PLANASISTAN_MCP_WRITE),
    };
    const failWith = (setupError: string): PlanAsistanMcpOptions => ({ ...base, source: null, setupError });

    let role: UserRole | undefined;
    if (roleRaw) {
        if (!MCP_ROLES.includes(roleRaw as UserRole)) return failWith(`PLANASISTAN_ROLE geçersiz: "${roleRaw}". Geçerli değerler: ${MCP_ROLES.join(', ')}.`);
        role = roleRaw as UserRole;
    }

    if (file && url) return failWith('Hem PLANASISTAN_WORKSPACE_FILE hem PLANASISTAN_SUPABASE_URL verilmiş; veri kaynağı olarak yalnız birini seçin.');

    let source: WorkspaceSource | null = null;
    if (file) {
        source = fileSource(file, undefined, { writable: truthy(env.PLANASISTAN_FILE_WRITE) });
    } else if (url) {
        const missing = [
            !anonKey && 'PLANASISTAN_SUPABASE_ANON_KEY',
            !email && 'PLANASISTAN_EMAIL',
            !password && 'PLANASISTAN_PASSWORD',
        ].filter(Boolean);
        if (missing.length) return failWith(`Supabase bağlantısı için eksik ayar: ${missing.join(', ')}.`);
        try {
            const client = (deps.createSupabase || defaultSupabase)(url, anonKey!);
            source = supabaseSource({ url, email: email!, password: password!, workspaceId: v('PLANASISTAN_WORKSPACE_ID') }, client);
        } catch (e) {
            return failWith(`Supabase istemcisi kurulamadı (${url}): ${(e as Error).message}`);
        }
    }

    return { ...base, role, source };
};
