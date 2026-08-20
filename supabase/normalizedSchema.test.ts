import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(
    new URL('./migrations/20260820_0001_normalized_rbac.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

const normalizedTables = [
    'departments',
    'people',
    'role_catalog',
    'titles',
    'projects',
    'project_entities',
    'allocations',
    'plan_locks',
    'project_notes',
    'customer_requests',
    'person_leaves',
    'workspace_snapshots',
    'audit_events',
    'workspace_normalization_state',
];

describe('normalized RBAC migration', () => {
    it('her normalize tabloyu kurar ve RLS açar', () => {
        normalizedTables.forEach(table => {
            expect(sql).toContain(`create table if not exists public.${table}`);
            expect(sql).toContain(`alter table public.${table} enable row level security`);
        });
    });

    it('yetki kararlarını sunucu kimliğine bağlar', () => {
        expect(sql).toContain('create or replace function public.member_person_id(ws uuid)');
        expect(sql).toContain('where workspace_id = ws and user_id = auth.uid()');
        expect(sql).toContain('create or replace function public.can_view_project');
        expect(sql).toContain('create or replace function public.can_edit_allocation');
        expect(sql).toContain('create or replace function public.can_approve_plan');
    });

    it('özel veriyi yalnız proje sahibi PY politikasına bağlar', () => {
        expect(sql).toContain('create policy project_notes_owner_only');
        expect(sql).toContain('create policy customer_requests_owner_only');
        expect(sql.match(/public\.can_edit_project\(workspace_id, project_id\)/g)?.length).toBeGreaterThanOrEqual(4);
    });

    it('kilitli planı ve plan durum geçişlerini trigger ile korur', () => {
        expect(sql).toContain('create or replace function public.valid_monthly_effort');
        expect(sql).toContain('check (public.valid_monthly_effort(plan))');
        expect(sql).toContain('check (public.valid_monthly_effort(actual))');
        expect(sql).toContain('create trigger allocations_guard_plan');
        expect(sql).toContain('create trigger plan_locks_guard_transition');
        expect(sql).toContain("raise exception 'Kilitli/gönderilmiş tahsisin kapsam alanları değiştirilemez.'");
        expect(sql).toContain('new.submitted_by_user := auth.uid()');
        expect(sql).toContain('new.decided_by_user := auth.uid()');
        expect(sql).toContain("old.status = 'draft' and new.status = 'submitted'");
        expect(sql).toContain("old.status = 'submitted' and new.status in ('locked','draft')");
    });

    it('audit kaydını append-only RPC üzerinden gerçek üyelikle üretir', () => {
        expect(sql).toContain('create or replace function public.append_audit_event');
        expect(sql).toContain('actor_user_id, actor_role, actor_person_id');
        expect(sql).not.toContain('create policy audit_events_insert');
    });

    it('backfill tek seferliktir ve belge tablolarını silmez', () => {
        expect(sql).toContain('create or replace function public.initialize_normalized_workspace');
        expect(sql).toContain("raise exception 'Bu çalışma alanı daha önce normalize edildi.'");
        expect(sql).not.toMatch(/delete\s+from\s+public\.(workspaces|workspace_private)/i);
        expect(sql.trim().startsWith('--')).toBe(true);
        expect(sql.trim().endsWith('commit;')).toBe(true);
    });
});
