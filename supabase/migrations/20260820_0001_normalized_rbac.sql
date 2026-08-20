-- ===========================================================================
-- PlanAsistan — v2 normalize veri katmanı + satır seviyesinde RBAC
--
-- Ön koşul: ../schema.sql uygulanmış olmalıdır.
-- Bu migration mevcut workspaces.core / workspace_private.data belgelerini
-- silmez ve uygulamanın v1 senkronizasyonunu kesmez. Yeni tablolar paralel
-- kurulur; backfill, PYB Destek kullanıcısı tarafından en son adımda RPC ile
-- başlatılır (bkz. KURULUM.md).
-- ===========================================================================

begin;

-- Aylık efor nesnesi yalnız "1".."12" anahtarlarını ve negatif olmayan
-- sayıları kabul eder. Böylece RLS'yi geçen bir API isteği bozuk ay/veri
-- biçimi enjekte edemez.
create or replace function public.valid_monthly_effort(doc jsonb)
returns boolean
language sql immutable strict
set search_path = public
as $$
    select jsonb_typeof(doc) = 'object'
       and not exists (
           select 1
           from jsonb_each(doc) cell
           where cell.key !~ '^([1-9]|1[0-2])$'
              or jsonb_typeof(cell.value) <> 'number'
              or case when jsonb_typeof(cell.value) = 'number'
                      then (cell.value #>> '{}')::numeric < 0
                      else false end
       )
$$;

-- ---------------------------------------------------------------------------
-- Normalize tablolar
-- ---------------------------------------------------------------------------

create table if not exists public.departments (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    code text not null check (nullif(btrim(code), '') is not null),
    name text not null,
    lead_name text,
    lead_person_id text,
    payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
    updated_at timestamptz not null default now(),
    primary key (workspace_id, code)
);

create table if not exists public.people (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    id text not null check (nullif(btrim(id), '') is not null),
    sicil text,
    first_name text not null default '',
    last_name text not null default '',
    emy text,
    department_code text not null default '',
    title_code text,
    available_aa numeric(8,4) not null default 1 check (available_aa >= 0),
    roles text[] not null default '{}',
    payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
    updated_at timestamptz not null default now(),
    primary key (workspace_id, id)
);

create index if not exists people_workspace_department_idx
    on public.people (workspace_id, department_code, id);

create table if not exists public.role_catalog (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    id text not null check (nullif(btrim(id), '') is not null),
    department_code text not null default '',
    name text not null,
    payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
    updated_at timestamptz not null default now(),
    primary key (workspace_id, id)
);

create table if not exists public.titles (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    code text not null check (nullif(btrim(code), '') is not null),
    name text not null,
    monthly_cost numeric(16,2) check (monthly_cost is null or monthly_cost >= 0),
    payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
    updated_at timestamptz not null default now(),
    primary key (workspace_id, code)
);

create table if not exists public.projects (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    id text not null check (nullif(btrim(id), '') is not null),
    name text not null,
    code text,
    status text not null default 'devam'
        check (status in ('devam','teklif','beklemede','tamamlandi')),
    rag text check (rag is null or rag in ('green','amber','red')),
    rag_note text,
    pm_person_id text,
    settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
    payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
    source_created_at text,
    source_updated_at text,
    updated_at timestamptz not null default now(),
    primary key (workspace_id, id)
);

create index if not exists projects_workspace_pm_idx
    on public.projects (workspace_id, pm_person_id, id);
create index if not exists projects_workspace_status_idx
    on public.projects (workspace_id, status, id);

-- Farklı şekle sahip proje alt kayıtları satır bazında ayrılır. payload,
-- mevcut TypeScript modelini kayıpsız taşırken proje + tür + kayıt kimliği
-- granülerliğinde çakışma çözümü ve RLS sağlar.
create table if not exists public.project_entities (
    workspace_id uuid not null,
    project_id text not null,
    entity_type text not null check (entity_type in (
        'task','resource','objective','work_package','risk','pestel','swot'
    )),
    id text not null check (nullif(btrim(id), '') is not null),
    payload jsonb not null check (jsonb_typeof(payload) = 'object'),
    updated_at timestamptz not null default now(),
    primary key (workspace_id, project_id, entity_type, id),
    foreign key (workspace_id, project_id)
        references public.projects(workspace_id, id) on delete cascade
);

create index if not exists project_entities_lookup_idx
    on public.project_entities (workspace_id, project_id, entity_type);

create table if not exists public.allocations (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    id text not null check (nullif(btrim(id), '') is not null),
    person_id text not null,
    project_id text not null,
    work_package_id text,
    role text,
    year integer not null check (year between 1900 and 2200),
    plan jsonb not null default '{}'::jsonb check (public.valid_monthly_effort(plan)),
    actual jsonb not null default '{}'::jsonb check (public.valid_monthly_effort(actual)),
    updated_at timestamptz not null default now(),
    primary key (workspace_id, id),
    foreign key (workspace_id, project_id)
        references public.projects(workspace_id, id) on delete cascade,
    foreign key (workspace_id, person_id)
        references public.people(workspace_id, id) on delete cascade
);

create index if not exists allocations_workspace_project_year_idx
    on public.allocations (workspace_id, project_id, year, person_id);
create index if not exists allocations_workspace_person_year_idx
    on public.allocations (workspace_id, person_id, year, project_id);

create table if not exists public.plan_locks (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    project_id text not null,
    year integer not null check (year between 1900 and 2200),
    status text not null default 'draft' check (status in ('draft','submitted','locked')),
    submitted_at timestamptz,
    submitted_by_role text check (
        submitted_by_role is null or submitted_by_role in ('py','bolum_sorumlu')
    ),
    submitted_by_user uuid references auth.users(id) on delete set null,
    decided_at timestamptz,
    decided_by_role text check (
        decided_by_role is null or decided_by_role in ('mudur','pyb_sorumlu')
    ),
    decided_by_user uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now(),
    primary key (workspace_id, project_id, year),
    foreign key (workspace_id, project_id)
        references public.projects(workspace_id, id) on delete cascade
);

create table if not exists public.project_notes (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    project_id text not null,
    id text not null check (nullif(btrim(id), '') is not null),
    payload jsonb not null check (jsonb_typeof(payload) = 'object'),
    updated_at timestamptz not null default now(),
    primary key (workspace_id, project_id, id),
    foreign key (workspace_id, project_id)
        references public.projects(workspace_id, id) on delete cascade
);

create table if not exists public.customer_requests (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    project_id text not null,
    id text not null check (nullif(btrim(id), '') is not null),
    payload jsonb not null check (jsonb_typeof(payload) = 'object'),
    updated_at timestamptz not null default now(),
    primary key (workspace_id, project_id, id),
    foreign key (workspace_id, project_id)
        references public.projects(workspace_id, id) on delete cascade
);

create table if not exists public.person_leaves (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    id text not null check (nullif(btrim(id), '') is not null),
    person_id text not null,
    year integer not null check (year between 1900 and 2200),
    month integer not null check (month between 1 and 12),
    aa numeric(8,4) not null check (aa >= 0),
    reason text,
    payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
    updated_at timestamptz not null default now(),
    primary key (workspace_id, id),
    foreign key (workspace_id, person_id)
        references public.people(workspace_id, id) on delete cascade
);

create index if not exists person_leaves_workspace_person_period_idx
    on public.person_leaves (workspace_id, person_id, year, month);

-- Snapshot payload'ı portföy toplamlarını içerdiği için sadece tüm portföyü
-- görebilen rollere açılır.
create table if not exists public.workspace_snapshots (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    id text not null check (nullif(btrim(id), '') is not null),
    year integer not null check (year between 1900 and 2200),
    taken_at timestamptz not null,
    trigger_kind text not null check (trigger_kind in ('manual','lock','monthly')),
    payload jsonb not null check (jsonb_typeof(payload) = 'object'),
    primary key (workspace_id, id)
);

create index if not exists workspace_snapshots_period_idx
    on public.workspace_snapshots (workspace_id, year, taken_at);

-- Audit tablosu append-only'dir. Doğrudan INSERT politikası yoktur; yeni
-- kayıtlar append_audit_event RPC'siyle sunucu kimliğinden üretilir.
create table if not exists public.audit_events (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    id text not null check (nullif(btrim(id), '') is not null),
    at timestamptz not null default now(),
    actor_user_id uuid references auth.users(id) on delete set null,
    actor_role text not null check (
        actor_role in ('mudur','pyb_sorumlu','pyb_destek','py','bolum_sorumlu')
    ),
    actor_person_id text,
    action text not null,
    summary text not null,
    project_id text,
    payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
    primary key (workspace_id, id)
);

create index if not exists audit_events_workspace_at_idx
    on public.audit_events (workspace_id, at desc);
create index if not exists audit_events_workspace_project_at_idx
    on public.audit_events (workspace_id, project_id, at desc);

-- Bir kerelik belge → satır backfill'inin durum kaydı.
create table if not exists public.workspace_normalization_state (
    workspace_id uuid primary key references public.workspaces(id) on delete cascade,
    source_core_version bigint not null,
    source_private_version bigint not null,
    backfilled_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sunucu tarafı kimlik ve kapsam yardımcıları
-- ---------------------------------------------------------------------------

create or replace function public.member_person_id(ws uuid)
returns text
language sql stable security definer
set search_path = public
as $$
    select person_id
    from public.workspace_members
    where workspace_id = ws and user_id = auth.uid()
    limit 1
$$;

create or replace function public.member_department_code(ws uuid)
returns text
language sql stable security definer
set search_path = public
as $$
    select p.department_code
    from public.workspace_members m
    join public.people p
      on p.workspace_id = m.workspace_id and p.id = m.person_id
    where m.workspace_id = ws and m.user_id = auth.uid()
    limit 1
$$;

create or replace function public.sees_all_projects(ws uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select coalesce(public.member_role(ws) in ('mudur','pyb_sorumlu','pyb_destek'), false)
$$;

create or replace function public.can_manage_pool(ws uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select coalesce(public.member_role(ws) = 'pyb_destek', false)
$$;

create or replace function public.can_approve_plan(ws uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select coalesce(public.member_role(ws) in ('mudur','pyb_sorumlu'), false)
$$;

create or replace function public.can_view_person(ws uuid, target_person_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select case public.member_role(ws)
        when 'bolum_sorumlu' then exists (
            select 1
            from public.people p
            where p.workspace_id = ws
              and p.id = target_person_id
              and p.department_code = public.member_department_code(ws)
        )
        when 'mudur' then true
        when 'pyb_sorumlu' then true
        when 'pyb_destek' then true
        when 'py' then true
        else false
    end
$$;

create or replace function public.can_view_project(ws uuid, target_project_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select case public.member_role(ws)
        when 'mudur' then true
        when 'pyb_sorumlu' then true
        when 'pyb_destek' then true
        when 'py' then exists (
            select 1
            from public.projects p
            where p.workspace_id = ws
              and p.id = target_project_id
              and p.pm_person_id = public.member_person_id(ws)
        )
        when 'bolum_sorumlu' then exists (
            select 1
            from public.allocations a
            join public.people p
              on p.workspace_id = a.workspace_id and p.id = a.person_id
            where a.workspace_id = ws
              and a.project_id = target_project_id
              and p.department_code = public.member_department_code(ws)
        )
        else false
    end
$$;

create or replace function public.can_edit_project(ws uuid, target_project_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select coalesce(
        public.member_role(ws) = 'py'
        and exists (
            select 1
            from public.projects p
            where p.workspace_id = ws
              and p.id = target_project_id
              and p.pm_person_id = public.member_person_id(ws)
        ),
        false
    )
$$;

create or replace function public.can_manage_person(ws uuid, target_person_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select coalesce(
        public.member_role(ws) = 'bolum_sorumlu'
        and exists (
            select 1
            from public.people p
            where p.workspace_id = ws
              and p.id = target_person_id
              and p.department_code = public.member_department_code(ws)
        ),
        false
    )
$$;

create or replace function public.can_view_allocation(
    ws uuid, target_project_id text, target_person_id text
)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select coalesce(
        public.can_view_project(ws, target_project_id)
        and (
            public.member_role(ws) <> 'bolum_sorumlu'
            or public.can_manage_person(ws, target_person_id)
        ),
        false
    )
$$;

create or replace function public.can_edit_allocation(
    ws uuid, target_project_id text, target_person_id text
)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select coalesce(
        public.can_edit_project(ws, target_project_id)
        or public.can_manage_person(ws, target_person_id),
        false
    )
$$;

create or replace function public.plan_is_draft(
    ws uuid, target_project_id text, target_year integer
)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select coalesce((
        select status = 'draft'
        from public.plan_locks
        where workspace_id = ws
          and project_id = target_project_id
          and year = target_year
    ), true)
$$;

create or replace function public.can_submit_plan(ws uuid, target_project_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select coalesce(
        public.can_edit_project(ws, target_project_id)
        or (
            public.member_role(ws) = 'bolum_sorumlu'
            and public.can_view_project(ws, target_project_id)
        ),
        false
    )
$$;

-- Yardımcıların doğrudan anonim çağrılmasını kapat; RLS içindeki çağrılar ve
-- oturum açmış istemciler için gerekli EXECUTE iznini açıkça ver.
revoke all on function public.valid_monthly_effort(jsonb) from public;
revoke all on function public.member_person_id(uuid) from public;
revoke all on function public.member_department_code(uuid) from public;
revoke all on function public.sees_all_projects(uuid) from public;
revoke all on function public.can_manage_pool(uuid) from public;
revoke all on function public.can_approve_plan(uuid) from public;
revoke all on function public.can_view_person(uuid, text) from public;
revoke all on function public.can_view_project(uuid, text) from public;
revoke all on function public.can_edit_project(uuid, text) from public;
revoke all on function public.can_manage_person(uuid, text) from public;
revoke all on function public.can_view_allocation(uuid, text, text) from public;
revoke all on function public.can_edit_allocation(uuid, text, text) from public;
revoke all on function public.plan_is_draft(uuid, text, integer) from public;
revoke all on function public.can_submit_plan(uuid, text) from public;

grant execute on function public.valid_monthly_effort(jsonb) to authenticated;
grant execute on function public.member_person_id(uuid) to authenticated;
grant execute on function public.member_department_code(uuid) to authenticated;
grant execute on function public.sees_all_projects(uuid) to authenticated;
grant execute on function public.can_manage_pool(uuid) to authenticated;
grant execute on function public.can_approve_plan(uuid) to authenticated;
grant execute on function public.can_view_person(uuid, text) to authenticated;
grant execute on function public.can_view_project(uuid, text) to authenticated;
grant execute on function public.can_edit_project(uuid, text) to authenticated;
grant execute on function public.can_manage_person(uuid, text) to authenticated;
grant execute on function public.can_view_allocation(uuid, text, text) to authenticated;
grant execute on function public.can_edit_allocation(uuid, text, text) to authenticated;
grant execute on function public.plan_is_draft(uuid, text, integer) to authenticated;
grant execute on function public.can_submit_plan(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Alan/state koruma tetikleyicileri
-- ---------------------------------------------------------------------------

create or replace function public.guard_project_update()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
    member text := public.member_role(new.workspace_id);
begin
    if member = 'py' then
        if old.pm_person_id is distinct from public.member_person_id(new.workspace_id)
           or new.pm_person_id is distinct from public.member_person_id(new.workspace_id) then
            raise exception 'Proje yöneticisi proje sahipliğini değiştiremez.';
        end if;
    elsif member = 'pyb_destek' then
        if (to_jsonb(new) - array['pm_person_id','status','updated_at'])
           is distinct from
           (to_jsonb(old) - array['pm_person_id','status','updated_at']) then
            raise exception 'PYB Destek yalnız proje sahibi ve durumunu değiştirebilir.';
        end if;
    else
        raise exception 'Bu rol proje kaydını güncelleyemez.';
    end if;
    return new;
end;
$$;

drop trigger if exists projects_guard_update on public.projects;
create trigger projects_guard_update
    before update on public.projects
    for each row execute function public.guard_project_update();

create or replace function public.guard_allocation_plan()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
    ws uuid := coalesce(new.workspace_id, old.workspace_id);
    project_key text := coalesce(new.project_id, old.project_id);
    target_year integer := coalesce(new.year, old.year);
begin
    if current_setting('planasistan.backfill', true) = 'on' then
        if tg_op = 'DELETE' then
            return old;
        end if;
        return new;
    end if;

    if tg_op = 'UPDATE'
       and (new.workspace_id, new.id) is distinct from (old.workspace_id, old.id) then
        raise exception 'Tahsis çalışma alanı/kimliği değiştirilemez.';
    end if;

    if tg_op = 'DELETE' and not public.plan_is_draft(ws, project_key, target_year) then
        raise exception 'Kilitli/gönderilmiş planda tahsis satırı silinemez.';
    elsif tg_op = 'UPDATE'
          and (new.project_id, new.person_id, new.year, new.work_package_id, new.role)
              is distinct from
              (old.project_id, old.person_id, old.year, old.work_package_id, old.role)
          and (
              not public.plan_is_draft(old.workspace_id, old.project_id, old.year)
              or not public.plan_is_draft(new.workspace_id, new.project_id, new.year)
          ) then
        raise exception 'Kilitli/gönderilmiş tahsisin kapsam alanları değiştirilemez.';
    elsif tg_op = 'UPDATE'
          and new.plan is distinct from old.plan
          and not public.plan_is_draft(ws, project_key, target_year) then
        raise exception 'Kilitli/gönderilmiş plan değiştirilemez.';
    elsif tg_op = 'INSERT'
          and new.plan <> '{}'::jsonb
          and not public.plan_is_draft(ws, project_key, target_year) then
        raise exception 'Kilitli/gönderilmiş plana tahsis satırı eklenemez.';
    end if;
    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

drop trigger if exists allocations_guard_plan on public.allocations;
create trigger allocations_guard_plan
    before insert or update or delete on public.allocations
    for each row execute function public.guard_allocation_plan();

create or replace function public.guard_plan_lock_transition()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
    member text := public.member_role(new.workspace_id);
begin
    if current_setting('planasistan.backfill', true) = 'on' then
        return new;
    end if;

    if tg_op = 'UPDATE'
       and (new.workspace_id, new.project_id, new.year)
           is distinct from (old.workspace_id, old.project_id, old.year) then
        raise exception 'Plan kilidi başka proje/yıla taşınamaz.';
    end if;

    if tg_op = 'UPDATE' then
        -- İstemcinin karar veren/gönderen kimliğini taklit etmesine izin verme.
        new.submitted_at := old.submitted_at;
        new.submitted_by_role := old.submitted_by_role;
        new.submitted_by_user := old.submitted_by_user;
        new.decided_at := old.decided_at;
        new.decided_by_role := old.decided_by_role;
        new.decided_by_user := old.decided_by_user;
    end if;

    if tg_op = 'INSERT' then
        new.submitted_at := null;
        new.submitted_by_role := null;
        new.submitted_by_user := null;
        new.decided_at := null;
        new.decided_by_role := null;
        new.decided_by_user := null;
        if new.status not in ('draft','submitted')
           or not public.can_submit_plan(new.workspace_id, new.project_id) then
            raise exception 'Plan kilidi yalnız taslak/onaya gönderildi durumunda başlatılabilir.';
        end if;
        if new.status = 'submitted' then
            new.submitted_at := now();
            new.submitted_by_role := member;
            new.submitted_by_user := auth.uid();
        end if;
    elsif old.status = 'draft' and new.status = 'submitted' then
        if not public.can_submit_plan(new.workspace_id, new.project_id) then
            raise exception 'Bu planı onaya gönderme yetkiniz yok.';
        end if;
        new.submitted_at := now();
        new.submitted_by_role := member;
        new.submitted_by_user := auth.uid();
    elsif old.status = 'submitted' and new.status in ('locked','draft') then
        if not public.can_approve_plan(new.workspace_id) then
            raise exception 'Bu planı karara bağlama yetkiniz yok.';
        end if;
        new.decided_at := now();
        new.decided_by_role := member;
        new.decided_by_user := auth.uid();
    elsif old.status = 'locked' and new.status = 'draft' then
        if not public.can_approve_plan(new.workspace_id) then
            raise exception 'Plan kilidini açma yetkiniz yok.';
        end if;
        new.decided_at := now();
        new.decided_by_role := member;
        new.decided_by_user := auth.uid();
    elsif new.status is distinct from old.status then
        raise exception 'Geçersiz plan durumu geçişi: % -> %', old.status, new.status;
    end if;
    return new;
end;
$$;

drop trigger if exists plan_locks_guard_transition on public.plan_locks;
create trigger plan_locks_guard_transition
    before insert or update on public.plan_locks
    for each row execute function public.guard_plan_lock_transition();

-- updated_at bakımı. Trigger adı tabloya özel üretilir; migration tekrar
-- çalıştırıldığında aynı trigger güvenle yenilenir.
do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'departments','people','role_catalog','titles','projects',
        'project_entities','allocations','plan_locks','project_notes',
        'customer_requests','person_leaves'
    ] loop
        execute format('drop trigger if exists %I on public.%I', table_name || '_touch', table_name);
        execute format(
            'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
            table_name || '_touch', table_name
        );
    end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- RLS politikaları
-- ---------------------------------------------------------------------------

alter table public.departments enable row level security;
alter table public.people enable row level security;
alter table public.role_catalog enable row level security;
alter table public.titles enable row level security;
alter table public.projects enable row level security;
alter table public.project_entities enable row level security;
alter table public.allocations enable row level security;
alter table public.plan_locks enable row level security;
alter table public.project_notes enable row level security;
alter table public.customer_requests enable row level security;
alter table public.person_leaves enable row level security;
alter table public.workspace_snapshots enable row level security;
alter table public.audit_events enable row level security;
alter table public.workspace_normalization_state enable row level security;

-- Master veri: üyeler kapsamına göre okur, yalnız PYB Destek yazar.
drop policy if exists departments_select_members on public.departments;
create policy departments_select_members on public.departments
    for select using (public.member_role(workspace_id) is not null);
drop policy if exists departments_manage_pool on public.departments;
create policy departments_manage_pool on public.departments
    for all using (public.can_manage_pool(workspace_id))
    with check (public.can_manage_pool(workspace_id));

drop policy if exists people_select_scoped on public.people;
create policy people_select_scoped on public.people
    for select using (public.can_view_person(workspace_id, id));
drop policy if exists people_manage_pool on public.people;
create policy people_manage_pool on public.people
    for all using (public.can_manage_pool(workspace_id))
    with check (public.can_manage_pool(workspace_id));

drop policy if exists role_catalog_select_members on public.role_catalog;
create policy role_catalog_select_members on public.role_catalog
    for select using (public.member_role(workspace_id) is not null);
drop policy if exists role_catalog_manage_pool on public.role_catalog;
create policy role_catalog_manage_pool on public.role_catalog
    for all using (public.can_manage_pool(workspace_id))
    with check (public.can_manage_pool(workspace_id));

drop policy if exists titles_select_members on public.titles;
create policy titles_select_members on public.titles
    for select using (public.member_role(workspace_id) is not null);
drop policy if exists titles_manage_pool on public.titles;
create policy titles_manage_pool on public.titles
    for all using (public.can_manage_pool(workspace_id))
    with check (public.can_manage_pool(workspace_id));

-- Proje listesi: yönetim/PYB Destek tümü, PY sahip olduğu, bölüm sorumlusu
-- kendi bölümü tahsisli olan projeleri görür.
drop policy if exists projects_select_scoped on public.projects;
create policy projects_select_scoped on public.projects
    for select using (public.can_view_project(workspace_id, id));
drop policy if exists projects_insert_authorized on public.projects;
create policy projects_insert_authorized on public.projects
    for insert with check (
        public.can_manage_pool(workspace_id)
        or (
            public.member_role(workspace_id) = 'py'
            and pm_person_id = public.member_person_id(workspace_id)
        )
    );
drop policy if exists projects_update_authorized on public.projects;
create policy projects_update_authorized on public.projects
    for update using (
        public.can_edit_project(workspace_id, id) or public.can_manage_pool(workspace_id)
    ) with check (
        public.can_edit_project(workspace_id, id) or public.can_manage_pool(workspace_id)
    );
drop policy if exists projects_delete_authorized on public.projects;
create policy projects_delete_authorized on public.projects
    for delete using (
        public.can_edit_project(workspace_id, id) or public.can_manage_pool(workspace_id)
    );

drop policy if exists project_entities_select_scoped on public.project_entities;
create policy project_entities_select_scoped on public.project_entities
    for select using (public.can_view_project(workspace_id, project_id));
drop policy if exists project_entities_insert_owner on public.project_entities;
create policy project_entities_insert_owner on public.project_entities
    for insert with check (public.can_edit_project(workspace_id, project_id));
drop policy if exists project_entities_update_owner on public.project_entities;
create policy project_entities_update_owner on public.project_entities
    for update using (public.can_edit_project(workspace_id, project_id))
    with check (public.can_edit_project(workspace_id, project_id));
drop policy if exists project_entities_delete_owner on public.project_entities;
create policy project_entities_delete_owner on public.project_entities
    for delete using (public.can_edit_project(workspace_id, project_id));

-- Tahsis: PM kendi projesindeki herkesi; bölüm sorumlusu kendi bölümündeki
-- kişileri düzenler. Plan JSON'u kilitliyken tetikleyici tarafından korunur.
drop policy if exists allocations_select_scoped on public.allocations;
create policy allocations_select_scoped on public.allocations
    for select using (public.can_view_allocation(workspace_id, project_id, person_id));
drop policy if exists allocations_insert_scoped on public.allocations;
create policy allocations_insert_scoped on public.allocations
    for insert with check (public.can_edit_allocation(workspace_id, project_id, person_id));
drop policy if exists allocations_update_scoped on public.allocations;
create policy allocations_update_scoped on public.allocations
    for update using (public.can_edit_allocation(workspace_id, project_id, person_id))
    with check (public.can_edit_allocation(workspace_id, project_id, person_id));
drop policy if exists allocations_delete_scoped on public.allocations;
create policy allocations_delete_scoped on public.allocations
    for delete using (
        public.can_edit_allocation(workspace_id, project_id, person_id)
        and public.plan_is_draft(workspace_id, project_id, year)
    );

drop policy if exists plan_locks_select_scoped on public.plan_locks;
create policy plan_locks_select_scoped on public.plan_locks
    for select using (public.can_view_project(workspace_id, project_id));
drop policy if exists plan_locks_insert_submitter on public.plan_locks;
create policy plan_locks_insert_submitter on public.plan_locks
    for insert with check (public.can_submit_plan(workspace_id, project_id));
drop policy if exists plan_locks_update_authorized on public.plan_locks;
create policy plan_locks_update_authorized on public.plan_locks
    for update using (
        public.can_submit_plan(workspace_id, project_id)
        or public.can_approve_plan(workspace_id)
    ) with check (
        public.can_submit_plan(workspace_id, project_id)
        or public.can_approve_plan(workspace_id)
    );

-- Özel proje verisi: yalnız o projenin sahibi PY. Müdür, PYB Sorumlusu,
-- PYB Destek ve bölüm sorumlusu API düzeyinde dahi okuyamaz.
drop policy if exists project_notes_owner_only on public.project_notes;
create policy project_notes_owner_only on public.project_notes
    for all using (public.can_edit_project(workspace_id, project_id))
    with check (public.can_edit_project(workspace_id, project_id));
drop policy if exists customer_requests_owner_only on public.customer_requests;
create policy customer_requests_owner_only on public.customer_requests
    for all using (public.can_edit_project(workspace_id, project_id))
    with check (public.can_edit_project(workspace_id, project_id));

drop policy if exists person_leaves_select_scoped on public.person_leaves;
create policy person_leaves_select_scoped on public.person_leaves
    for select using (public.can_view_person(workspace_id, person_id));
drop policy if exists person_leaves_manage_pool on public.person_leaves;
create policy person_leaves_manage_pool on public.person_leaves
    for all using (public.can_manage_pool(workspace_id))
    with check (public.can_manage_pool(workspace_id));

drop policy if exists workspace_snapshots_select_portfolio on public.workspace_snapshots;
create policy workspace_snapshots_select_portfolio on public.workspace_snapshots
    for select using (public.sees_all_projects(workspace_id));

drop policy if exists audit_events_select_scoped on public.audit_events;
create policy audit_events_select_scoped on public.audit_events
    for select using (
        public.sees_all_projects(workspace_id)
        or (project_id is not null and public.can_view_project(workspace_id, project_id))
    );

drop policy if exists normalization_state_select_members on public.workspace_normalization_state;
create policy normalization_state_select_members on public.workspace_normalization_state
    for select using (public.member_role(workspace_id) is not null);

-- ---------------------------------------------------------------------------
-- Append-only audit RPC
-- ---------------------------------------------------------------------------

create or replace function public.append_audit_event(
    ws uuid,
    event_action text,
    event_summary text,
    target_project_id text default null,
    event_payload jsonb default '{}'::jsonb
)
returns public.audit_events
language plpgsql security definer
set search_path = public
as $$
declare
    member public.workspace_members%rowtype;
    inserted public.audit_events%rowtype;
begin
    select * into member
    from public.workspace_members
    where workspace_id = ws and user_id = auth.uid();

    if member.user_id is null then
        raise exception 'Çalışma alanı üyeliği gerekli.';
    end if;
    if nullif(btrim(event_action), '') is null or nullif(btrim(event_summary), '') is null then
        raise exception 'Audit aksiyonu ve özeti boş olamaz.';
    end if;
    if target_project_id is not null
       and (
           not exists (
               select 1 from public.projects
               where workspace_id = ws and id = target_project_id
           )
           or not public.can_view_project(ws, target_project_id)
       ) then
        raise exception 'Bu proje için audit kaydı oluşturamazsınız.';
    end if;

    insert into public.audit_events (
        workspace_id, id, actor_user_id, actor_role, actor_person_id,
        action, summary, project_id, payload
    ) values (
        ws, 'audit-' || gen_random_uuid()::text, auth.uid(), member.role,
        member.person_id, event_action, event_summary, target_project_id,
        coalesce(event_payload, '{}'::jsonb)
    ) returning * into inserted;
    return inserted;
end;
$$;

revoke all on function public.append_audit_event(uuid, text, text, text, jsonb) from public;
grant execute on function public.append_audit_event(uuid, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Bir kerelik, tekrar çalıştırmayı reddeden belge → normalize tablo backfill RPC'si
-- ---------------------------------------------------------------------------

create or replace function public.initialize_normalized_workspace(ws uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
    core_doc jsonb;
    private_doc jsonb;
    core_ver bigint;
    private_ver bigint;
begin
    if auth.uid() is null or not public.can_manage_pool(ws) then
        raise exception 'Normalize backfill işlemini yalnız PYB Destek başlatabilir.';
    end if;
    if exists (
        select 1 from public.workspace_normalization_state where workspace_id = ws
    ) then
        raise exception 'Bu çalışma alanı daha önce normalize edildi.';
    end if;

    select w.core, w.version, coalesce(p.data, '{}'::jsonb), coalesce(p.version, 0)
      into core_doc, core_ver, private_doc, private_ver
    from public.workspaces w
    left join public.workspace_private p on p.workspace_id = w.id
    where w.id = ws;

    if core_doc is null then
        raise exception 'Çalışma alanı bulunamadı.';
    end if;

    perform set_config('planasistan.backfill', 'on', true);

    insert into public.departments (
        workspace_id, code, name, lead_name, lead_person_id, payload
    )
    select ws, item->>'code', coalesce(item->>'name', ''), item->>'leadName',
           item->>'leadPersonId', item
    from jsonb_array_elements(
        case when jsonb_typeof(core_doc->'departments') = 'array'
             then core_doc->'departments' else '[]'::jsonb end
    ) item
    where nullif(btrim(item->>'code'), '') is not null;

    insert into public.people (
        workspace_id, id, sicil, first_name, last_name, emy,
        department_code, title_code, available_aa, roles, payload
    )
    select ws, item->>'id', item->>'sicil', coalesce(item->>'firstName', ''),
           coalesce(item->>'lastName', ''), item->>'emy',
           coalesce(item->>'departmentCode', ''), item->>'titleCode',
           case when jsonb_typeof(item->'availableAA') = 'number'
                then greatest((item->>'availableAA')::numeric, 0) else 1 end,
           case when jsonb_typeof(item->'roles') = 'array'
                then array(select jsonb_array_elements_text(item->'roles'))
                else '{}'::text[] end,
           item
    from jsonb_array_elements(
        case when jsonb_typeof(core_doc->'people') = 'array'
             then core_doc->'people' else '[]'::jsonb end
    ) item
    where nullif(btrim(item->>'id'), '') is not null;

    insert into public.role_catalog (
        workspace_id, id, department_code, name, payload
    )
    select ws, item->>'id', coalesce(item->>'departmentCode', ''),
           coalesce(item->>'name', ''), item
    from jsonb_array_elements(
        case when jsonb_typeof(core_doc->'roleCatalog') = 'array'
             then core_doc->'roleCatalog' else '[]'::jsonb end
    ) item
    where nullif(btrim(item->>'id'), '') is not null;

    insert into public.titles (
        workspace_id, code, name, monthly_cost, payload
    )
    select ws, item->>'code', coalesce(item->>'name', ''),
           case when jsonb_typeof(item->'monthlyCost') = 'number'
                then (item->>'monthlyCost')::numeric else null end,
           item
    from jsonb_array_elements(
        case when jsonb_typeof(core_doc->'titles') = 'array'
             then core_doc->'titles' else '[]'::jsonb end
    ) item
    where nullif(btrim(item->>'code'), '') is not null;

    insert into public.projects (
        workspace_id, id, name, code, status, rag, rag_note, pm_person_id,
        settings, payload, source_created_at, source_updated_at
    )
    select ws, item->>'id', coalesce(nullif(item->>'name', ''), 'Adsız Proje'),
           item->>'code',
           case when item->>'status' in ('devam','teklif','beklemede','tamamlandi')
                then item->>'status' else 'devam' end,
           case when item->>'rag' in ('green','amber','red')
                then item->>'rag' else null end,
           item->>'ragNote', item->>'pmPersonId',
           case when jsonb_typeof(item->'settings') = 'object'
                then item->'settings' else '{}'::jsonb end,
           item - array[
               'tasks','resources','objectives','workPackages','risks',
               'pestelItems','swotItems','notes','customerRequests','settings'
           ],
           item->>'createdAt', item->>'updatedAt'
    from jsonb_array_elements(
        case when jsonb_typeof(core_doc->'projects') = 'array'
             then core_doc->'projects' else '[]'::jsonb end
    ) item
    where nullif(btrim(item->>'id'), '') is not null;

    insert into public.project_entities (
        workspace_id, project_id, entity_type, id, payload
    )
    select ws, project->>'id', kinds.entity_type, entity->>'id', entity
    from jsonb_array_elements(
        case when jsonb_typeof(core_doc->'projects') = 'array'
             then core_doc->'projects' else '[]'::jsonb end
    ) project
    cross join lateral (
        values
            ('task', 'tasks'),
            ('resource', 'resources'),
            ('objective', 'objectives'),
            ('work_package', 'workPackages'),
            ('risk', 'risks'),
            ('pestel', 'pestelItems'),
            ('swot', 'swotItems')
    ) as kinds(entity_type, json_key)
    cross join lateral jsonb_array_elements(
        case when jsonb_typeof(project->kinds.json_key) = 'array'
             then project->kinds.json_key else '[]'::jsonb end
    ) entity
    where nullif(btrim(project->>'id'), '') is not null
      and nullif(btrim(entity->>'id'), '') is not null;

    insert into public.allocations (
        workspace_id, id, person_id, project_id, work_package_id,
        role, year, plan, actual
    )
    select ws, item->>'id', coalesce(item->>'personId', ''),
           coalesce(item->>'projectId', ''), item->>'workPackageId',
           item->>'role',
           case when item->>'year' ~ '^\d{4}$' then (item->>'year')::integer
                else extract(year from now())::integer end,
           case when jsonb_typeof(item->'plan') = 'object'
                then item->'plan' else '{}'::jsonb end,
           case when jsonb_typeof(item->'actual') = 'object'
                then item->'actual' else '{}'::jsonb end
    from jsonb_array_elements(
        case when jsonb_typeof(core_doc->'allocations') = 'array'
             then core_doc->'allocations' else '[]'::jsonb end
    ) item
    where nullif(btrim(item->>'id'), '') is not null;

    insert into public.plan_locks (
        workspace_id, project_id, year, status, submitted_at,
        submitted_by_role, decided_at, decided_by_role
    )
    select ws, coalesce(item->>'projectId', ''),
           case when item->>'year' ~ '^\d{4}$' then (item->>'year')::integer
                else extract(year from now())::integer end,
           case when item->>'status' in ('draft','submitted','locked')
                then item->>'status' else 'draft' end,
           case when item->>'submittedAt' is not null
                     and item->>'submittedAt' ~ '^\d{4}-\d{2}-\d{2}T'
                then (item->>'submittedAt')::timestamptz else null end,
           case when item->>'submittedByRole' in ('py','bolum_sorumlu')
                then item->>'submittedByRole' else null end,
           case when item->>'decidedAt' is not null
                     and item->>'decidedAt' ~ '^\d{4}-\d{2}-\d{2}T'
                then (item->>'decidedAt')::timestamptz else null end,
           case when item->>'decidedByRole' in ('mudur','pyb_sorumlu')
                then item->>'decidedByRole' else null end
    from jsonb_array_elements(
        case when jsonb_typeof(core_doc->'planLocks') = 'array'
             then core_doc->'planLocks' else '[]'::jsonb end
    ) item
    where nullif(btrim(item->>'projectId'), '') is not null;

    insert into public.project_notes (workspace_id, project_id, id, payload)
    select ws, grouped.key, item->>'id', item
    from jsonb_each(
        case when jsonb_typeof(private_doc->'notes') = 'object'
             then private_doc->'notes' else '{}'::jsonb end
    ) grouped
    cross join lateral jsonb_array_elements(
        case when jsonb_typeof(grouped.value) = 'array'
             then grouped.value else '[]'::jsonb end
    ) item
    where nullif(btrim(item->>'id'), '') is not null;

    insert into public.customer_requests (workspace_id, project_id, id, payload)
    select ws, grouped.key, item->>'id', item
    from jsonb_each(
        case when jsonb_typeof(private_doc->'customerRequests') = 'object'
             then private_doc->'customerRequests' else '{}'::jsonb end
    ) grouped
    cross join lateral jsonb_array_elements(
        case when jsonb_typeof(grouped.value) = 'array'
             then grouped.value else '[]'::jsonb end
    ) item
    where nullif(btrim(item->>'id'), '') is not null;

    insert into public.person_leaves (
        workspace_id, id, person_id, year, month, aa, reason, payload
    )
    select ws, item->>'id', coalesce(item->>'personId', ''),
           case when item->>'year' ~ '^\d{4}$' then (item->>'year')::integer
                else extract(year from now())::integer end,
           case when item->>'month' ~ '^\d{1,2}$'
                then least(greatest((item->>'month')::integer, 1), 12)
                else 1 end,
           case when jsonb_typeof(item->'aa') = 'number'
                then greatest((item->>'aa')::numeric, 0) else 0 end,
           item->>'reason', item
    from jsonb_array_elements(
        case when jsonb_typeof(core_doc->'leaves') = 'array'
             then core_doc->'leaves' else '[]'::jsonb end
    ) item
    where nullif(btrim(item->>'id'), '') is not null;

    insert into public.workspace_snapshots (
        workspace_id, id, year, taken_at, trigger_kind, payload
    )
    select ws, item->>'id',
           case when item->>'year' ~ '^\d{4}$' then (item->>'year')::integer
                else extract(year from now())::integer end,
           case when item->>'takenAt' is not null
                     and item->>'takenAt' ~ '^\d{4}-\d{2}-\d{2}T'
                then (item->>'takenAt')::timestamptz else now() end,
           case when item->>'trigger' in ('manual','lock','monthly')
                then item->>'trigger' else 'manual' end,
           item
    from jsonb_array_elements(
        case when jsonb_typeof(core_doc->'snapshots') = 'array'
             then core_doc->'snapshots' else '[]'::jsonb end
    ) item
    where nullif(btrim(item->>'id'), '') is not null;

    insert into public.audit_events (
        workspace_id, id, at, actor_role, actor_person_id,
        action, summary, project_id, payload
    )
    select ws, item->>'id',
           case when item->>'at' is not null and item->>'at' ~ '^\d{4}-\d{2}-\d{2}T'
                then (item->>'at')::timestamptz else now() end,
           case when item->>'actorRole' in ('mudur','pyb_sorumlu','pyb_destek','py','bolum_sorumlu')
                then item->>'actorRole' else 'pyb_destek' end,
           item->>'actorPersonId', coalesce(item->>'action', 'data.import'),
           coalesce(item->>'summary', 'Eski belgeden aktarıldı'),
           item->>'projectId', item
    from jsonb_array_elements(
        case when jsonb_typeof(core_doc->'auditLog') = 'array'
             then core_doc->'auditLog' else '[]'::jsonb end
    ) item
    where nullif(btrim(item->>'id'), '') is not null;

    insert into public.workspace_normalization_state (
        workspace_id, source_core_version, source_private_version
    ) values (ws, core_ver, private_ver);

    return jsonb_build_object(
        'workspaceId', ws,
        'coreVersion', core_ver,
        'privateVersion', private_ver,
        'projects', (select count(*) from public.projects where workspace_id = ws),
        'people', (select count(*) from public.people where workspace_id = ws),
        'allocations', (select count(*) from public.allocations where workspace_id = ws),
        'privateNotes', (select count(*) from public.project_notes where workspace_id = ws)
    );
end;
$$;

revoke all on function public.initialize_normalized_workspace(uuid) from public;
grant execute on function public.initialize_normalized_workspace(uuid) to authenticated;

-- PostgREST tablo izinleri. RLS bütün satır erişimlerini ayrıca sınırlar.
revoke all on table
    public.departments, public.people, public.role_catalog, public.titles,
    public.projects, public.project_entities, public.allocations,
    public.plan_locks, public.project_notes, public.customer_requests,
    public.person_leaves, public.workspace_snapshots, public.audit_events,
    public.workspace_normalization_state
from anon;

grant select, insert, update, delete on table
    public.departments, public.people, public.role_catalog, public.titles,
    public.projects, public.project_entities, public.allocations,
    public.plan_locks, public.project_notes, public.customer_requests,
    public.person_leaves
to authenticated;

grant select on table
    public.workspace_snapshots, public.audit_events,
    public.workspace_normalization_state
to authenticated;

commit;
