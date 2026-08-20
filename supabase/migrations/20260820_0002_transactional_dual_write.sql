-- ===========================================================================
-- PlanAsistan — v2.1 transaction içinde belge + normalize çift-yazma
--
-- Ön koşul:
--   1) ../schema.sql
--   2) 20260820_0001_normalized_rbac.sql
--
-- Bu migration'dan sonra normalize edilmiş bir workspace'in workspaces.core
-- belgesi yalnız push_workspace_v2 RPC'si içinden güncellenebilir. RPC;
-- iyimser sürüm kontrolü, belge yazımı ve RLS kapsamındaki normalize yazımları
-- tek PostgreSQL transaction'ında tamamlar. Herhangi bir adım hata verirse
-- tüm değişiklik geri alınır.
-- ===========================================================================

begin;

alter table public.workspace_normalization_state
    add column if not exists last_synced_at timestamptz;

alter table public.projects
    add column if not exists position integer check (position is null or position >= 0);
alter table public.project_entities
    add column if not exists position integer check (position is null or position >= 0);
alter table public.project_notes
    add column if not exists position integer check (position is null or position >= 0);
alter table public.customer_requests
    add column if not exists position integer check (position is null or position >= 0);

-- 0001 backfill'inden sonra eski istemci belgeyi değiştirdiyse normalize veri
-- geride kalmıştır. Böyle bir durumda sessizce devam edip veri kaybetme.
do $$
begin
    if exists (
        select 1
        from public.workspace_normalization_state s
        join public.workspaces w on w.id = s.workspace_id
        left join public.workspace_private p on p.workspace_id = s.workspace_id
        where s.source_core_version <> w.version
           or s.source_private_version <> coalesce(p.version, 0)
    ) then
        raise exception using
            errcode = 'PZ003',
            message = '0001 backfill sonrası belge değişmiş. 0002 öncesi normalize veriyi güncel belgeden yeniden kurun.';
    end if;
end
$$;

update public.workspace_normalization_state
set last_synced_at = coalesce(last_synced_at, backfilled_at)
where last_synced_at is null;

-- Migration/backfill ve SQL Editor işlemlerini engellemeden, istemci
-- rollerinde proje alan kısıtını koru. PYB Destek sıralama alanını da taşıyabilir.
create or replace function public.guard_project_update()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
    member text := public.member_role(new.workspace_id);
begin
    if auth.uid() is null then
        return new;
    elsif member = 'py' then
        if old.pm_person_id is distinct from public.member_person_id(new.workspace_id)
           or new.pm_person_id is distinct from public.member_person_id(new.workspace_id) then
            raise exception 'Proje yöneticisi proje sahipliğini değiştiremez.';
        end if;
    elsif member = 'pyb_destek' then
        if (to_jsonb(new) - array['pm_person_id','status','position','updated_at'])
           is distinct from
           (to_jsonb(old) - array['pm_person_id','status','position','updated_at']) then
            raise exception 'PYB Destek yalnız proje sahibi, durumu ve sırasını değiştirebilir.';
        end if;
    else
        raise exception 'Bu rol proje kaydını güncelleyemez.';
    end if;
    return new;
end;
$$;

-- 0001 backfill'i daha önce çalışmış workspace'lerde kaynak dizi sırasını
-- normalize satırlara bir kez aktar.
with source_projects as (
    select w.id as workspace_id, project.item->>'id' as project_id,
           (project.ordinality - 1)::integer as position
    from public.workspaces w
    cross join lateral jsonb_array_elements(
        case when jsonb_typeof(w.core->'projects') = 'array'
             then w.core->'projects' else '[]'::jsonb end
    ) with ordinality as project(item, ordinality)
)
update public.projects target
set position = source.position
from source_projects source
where target.workspace_id = source.workspace_id
  and target.id = source.project_id
  and target.position is null;

with source_entities as (
    select w.id as workspace_id, project.item->>'id' as project_id,
           kinds.entity_type, entity.item->>'id' as entity_id,
           (entity.ordinality - 1)::integer as position
    from public.workspaces w
    cross join lateral jsonb_array_elements(
        case when jsonb_typeof(w.core->'projects') = 'array'
             then w.core->'projects' else '[]'::jsonb end
    ) project(item)
    cross join lateral (
        values
            ('task', 'tasks'), ('resource', 'resources'),
            ('objective', 'objectives'), ('work_package', 'workPackages'),
            ('risk', 'risks'), ('pestel', 'pestelItems'), ('swot', 'swotItems')
    ) as kinds(entity_type, json_key)
    cross join lateral jsonb_array_elements(
        case when jsonb_typeof(project.item->kinds.json_key) = 'array'
             then project.item->kinds.json_key else '[]'::jsonb end
    ) with ordinality as entity(item, ordinality)
)
update public.project_entities target
set position = source.position
from source_entities source
where target.workspace_id = source.workspace_id
  and target.project_id = source.project_id
  and target.entity_type = source.entity_type
  and target.id = source.entity_id
  and target.position is null;

with source_notes as (
    select p.workspace_id, grouped.key as project_id,
           note.item->>'id' as note_id,
           (note.ordinality - 1)::integer as position
    from public.workspace_private p
    cross join lateral jsonb_each(
        case when jsonb_typeof(p.data->'notes') = 'object'
             then p.data->'notes' else '{}'::jsonb end
    ) grouped
    cross join lateral jsonb_array_elements(
        case when jsonb_typeof(grouped.value) = 'array'
             then grouped.value else '[]'::jsonb end
    ) with ordinality as note(item, ordinality)
)
update public.project_notes target
set position = source.position
from source_notes source
where target.workspace_id = source.workspace_id
  and target.project_id = source.project_id
  and target.id = source.note_id
  and target.position is null;

with source_requests as (
    select p.workspace_id, grouped.key as project_id,
           request.item->>'id' as request_id,
           (request.ordinality - 1)::integer as position
    from public.workspace_private p
    cross join lateral jsonb_each(
        case when jsonb_typeof(p.data->'customerRequests') = 'object'
             then p.data->'customerRequests' else '{}'::jsonb end
    ) grouped
    cross join lateral jsonb_array_elements(
        case when jsonb_typeof(grouped.value) = 'array'
             then grouped.value else '[]'::jsonb end
    ) with ordinality as request(item, ordinality)
)
update public.customer_requests target
set position = source.position
from source_requests source
where target.workspace_id = source.workspace_id
  and target.project_id = source.project_id
  and target.id = source.request_id
  and target.position is null;

-- PYB Destek Excel/veri havuzu içe aktarımında tahsis satırlarını da taşır.
-- Hücre bazlı sıradan UI düzenlemesi kapalı kalır; veritabanında ise yalnız
-- taslak planlar guard_allocation_plan tetikleyicisinden geçebilir.
create or replace function public.can_edit_allocation(
    ws uuid, target_project_id text, target_person_id text
)
returns boolean
language sql stable security definer
set search_path = public
as $$
    select coalesce(
        public.can_manage_pool(ws)
        or public.can_edit_project(ws, target_project_id)
        or public.can_manage_person(ws, target_person_id),
        false
    )
$$;

revoke all on function public.can_edit_allocation(uuid, text, text) from public;
grant execute on function public.can_edit_allocation(uuid, text, text) to authenticated;

-- PYB Destek proje içeriğinin tamamını değil, veri havuzu içe aktarımından
-- gelen iş paketi kayıtlarını yönetebilir.
drop policy if exists project_entities_insert_owner on public.project_entities;
create policy project_entities_insert_owner on public.project_entities
    for insert with check (
        public.can_edit_project(workspace_id, project_id)
        or (public.can_manage_pool(workspace_id) and entity_type = 'work_package')
    );

drop policy if exists project_entities_update_owner on public.project_entities;
create policy project_entities_update_owner on public.project_entities
    for update using (
        public.can_edit_project(workspace_id, project_id)
        or (public.can_manage_pool(workspace_id) and entity_type = 'work_package')
    ) with check (
        public.can_edit_project(workspace_id, project_id)
        or (public.can_manage_pool(workspace_id) and entity_type = 'work_package')
    );

drop policy if exists project_entities_delete_owner on public.project_entities;
create policy project_entities_delete_owner on public.project_entities
    for delete using (
        public.can_edit_project(workspace_id, project_id)
        or (public.can_manage_pool(workspace_id) and entity_type = 'work_package')
    );

-- V1 private belge yalnız sunucu içi uyumluluk kopyasıdır. İstemci tabloya
-- doğrudan erişemez; pull normalize project_notes/customer_requests kullanır.
drop policy if exists private_select_input_roles on public.workspace_private;
drop policy if exists private_update_input_roles on public.workspace_private;
drop policy if exists private_insert_input_roles on public.workspace_private;

revoke select, insert, update, delete on table public.workspace_private
from authenticated, anon;

create or replace function public.get_private_version(ws uuid)
returns bigint
language plpgsql stable security definer
set search_path = public
as $$
declare
    private_version bigint;
begin
    if public.member_role(ws) <> 'py' then
        return null;
    end if;
    select version into private_version
    from public.workspace_private where workspace_id = ws;
    return private_version;
end;
$$;

revoke all on function public.get_private_version(uuid) from public;
grant execute on function public.get_private_version(uuid) to authenticated;

-- Snapshot append-only kalır; yalnız tüm portföyü gören roller ekleyebilir.
drop policy if exists workspace_snapshots_insert_portfolio on public.workspace_snapshots;
create policy workspace_snapshots_insert_portfolio on public.workspace_snapshots
    for insert with check (public.sees_all_projects(workspace_id));

grant insert on table public.workspace_snapshots to authenticated;

-- Normalize edilmiş çalışma alanında eski istemcinin doğrudan belge update'i
-- yapmasını engelle. SQL Editor/service işlemleri (auth.uid null) etkilenmez.
create or replace function public.guard_workspace_v2_push()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        return new;
    end if;

    if exists (
        select 1
        from public.workspace_normalization_state s
        where s.workspace_id = new.id
    )
       and (new.core, new.version) is distinct from (old.core, old.version)
       and coalesce(current_setting('planasistan.v2_push', true), '') <> 'on' then
        raise exception using
            errcode = 'PZ002',
            message = 'Normalize çalışma alanı yalnız push_workspace_v2 RPC ile güncellenebilir.';
    end if;
    return new;
end;
$$;

drop trigger if exists workspaces_guard_v2_push on public.workspaces;
create trigger workspaces_guard_v2_push
    before update on public.workspaces
    for each row execute function public.guard_workspace_v2_push();

-- Audit eylem kümesi veritabanında da sabitlenir.
create or replace function public.valid_audit_action(event_action text)
returns boolean
language sql immutable strict
as $$
    select event_action in (
        'project.create','project.delete','project.owner','project.rag',
        'risk.add','risk.close','plan.submit','plan.approve','plan.reject',
        'plan.unlock','data.import','identity.change','health.fix','snapshot.create'
    )
$$;

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
    membership public.workspace_members%rowtype;
    inserted public.audit_events%rowtype;
begin
    select * into membership
    from public.workspace_members
    where workspace_id = ws and user_id = auth.uid();

    if membership.user_id is null then
        raise exception 'Çalışma alanı üyeliği gerekli.';
    end if;
    if event_action is null or not public.valid_audit_action(event_action)
       or nullif(btrim(event_summary), '') is null then
        raise exception 'Geçersiz audit aksiyonu veya boş özet.';
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
        ws, 'audit-' || gen_random_uuid()::text, auth.uid(), membership.role,
        membership.person_id, event_action, event_summary, target_project_id,
        coalesce(event_payload, '{}'::jsonb)
    ) returning * into inserted;
    return inserted;
end;
$$;

-- Belgedeki audit id'sini koruyan, tekrar çağrıldığında kopya üretmeyen sürüm.
create or replace function public.append_audit_event_v2(
    ws uuid,
    event_id text,
    event_action text,
    event_summary text,
    target_project_id text default null,
    event_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
    membership public.workspace_members%rowtype;
begin
    select * into membership
    from public.workspace_members
    where workspace_id = ws and user_id = auth.uid();

    if membership.user_id is null then
        raise exception 'Çalışma alanı üyeliği gerekli.';
    end if;
    if nullif(btrim(event_id), '') is null
       or event_action is null
       or not public.valid_audit_action(event_action)
       or nullif(btrim(event_summary), '') is null then
        raise exception 'Geçersiz audit kaydı.';
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
        ws, event_id, auth.uid(), membership.role, membership.person_id,
        event_action, event_summary, target_project_id,
        coalesce(event_payload, '{}'::jsonb)
    ) on conflict (workspace_id, id) do nothing;

    return true;
end;
$$;

revoke all on function public.valid_audit_action(text) from public;
revoke all on function public.append_audit_event_v2(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.valid_audit_action(text) to authenticated;
grant execute on function public.append_audit_event_v2(uuid, text, text, text, text, jsonb) to authenticated;

-- PostgREST varsayılan exposed schema listesinde bulunmayan iç uygulama alanı.
create schema if not exists planasistan_private;
revoke all on schema planasistan_private from public;
grant usage on schema planasistan_private to authenticated;

create or replace function planasistan_private.capture_document_positions(ws uuid)
returns void
language plpgsql security definer
set search_path = public, planasistan_private
as $$
begin
    if not public.can_manage_pool(ws) then
        raise exception 'İlk dizi sırası aktarımını yalnız PYB Destek yapabilir.';
    end if;

    with source as (
        select project.item->>'id' as project_id,
               (project.ordinality - 1)::integer as position
        from public.workspaces w
        cross join lateral jsonb_array_elements(
            case when jsonb_typeof(w.core->'projects') = 'array'
                 then w.core->'projects' else '[]'::jsonb end
        ) with ordinality as project(item, ordinality)
        where w.id = ws
    )
    update public.projects target
    set position = source.position
    from source
    where target.workspace_id = ws and target.id = source.project_id;

    with source as (
        select project.item->>'id' as project_id, kinds.entity_type,
               entity.item->>'id' as entity_id,
               (entity.ordinality - 1)::integer as position
        from public.workspaces w
        cross join lateral jsonb_array_elements(
            case when jsonb_typeof(w.core->'projects') = 'array'
                 then w.core->'projects' else '[]'::jsonb end
        ) project(item)
        cross join lateral (
            values
                ('task', 'tasks'), ('resource', 'resources'),
                ('objective', 'objectives'), ('work_package', 'workPackages'),
                ('risk', 'risks'), ('pestel', 'pestelItems'), ('swot', 'swotItems')
        ) as kinds(entity_type, json_key)
        cross join lateral jsonb_array_elements(
            case when jsonb_typeof(project.item->kinds.json_key) = 'array'
                 then project.item->kinds.json_key else '[]'::jsonb end
        ) with ordinality as entity(item, ordinality)
        where w.id = ws
    )
    update public.project_entities target
    set position = source.position
    from source
    where target.workspace_id = ws
      and target.project_id = source.project_id
      and target.entity_type = source.entity_type
      and target.id = source.entity_id;

    with source as (
        select grouped.key as project_id, note.item->>'id' as note_id,
               (note.ordinality - 1)::integer as position
        from public.workspace_private p
        cross join lateral jsonb_each(
            case when jsonb_typeof(p.data->'notes') = 'object'
                 then p.data->'notes' else '{}'::jsonb end
        ) grouped
        cross join lateral jsonb_array_elements(
            case when jsonb_typeof(grouped.value) = 'array'
                 then grouped.value else '[]'::jsonb end
        ) with ordinality as note(item, ordinality)
        where p.workspace_id = ws
    )
    update public.project_notes target
    set position = source.position
    from source
    where target.workspace_id = ws
      and target.project_id = source.project_id
      and target.id = source.note_id;

    with source as (
        select grouped.key as project_id, request.item->>'id' as request_id,
               (request.ordinality - 1)::integer as position
        from public.workspace_private p
        cross join lateral jsonb_each(
            case when jsonb_typeof(p.data->'customerRequests') = 'object'
                 then p.data->'customerRequests' else '{}'::jsonb end
        ) grouped
        cross join lateral jsonb_array_elements(
            case when jsonb_typeof(grouped.value) = 'array'
                 then grouped.value else '[]'::jsonb end
        ) with ordinality as request(item, ordinality)
        where p.workspace_id = ws
    )
    update public.customer_requests target
    set position = source.position
    from source
    where target.workspace_id = ws
      and target.project_id = source.project_id
      and target.id = source.request_id;
end;
$$;

revoke all on function planasistan_private.capture_document_positions(uuid) from public;
grant execute on function planasistan_private.capture_document_positions(uuid) to authenticated;

create or replace function planasistan_private.sync_normalized_scope(
    ws uuid,
    core_doc jsonb,
    private_doc jsonb
)
returns void
language plpgsql security invoker
set search_path = public, planasistan_private
as $$
declare
    membership_role text := public.member_role(ws);
    membership_person text := public.member_person_id(ws);
begin
    if membership_role is null then
        raise exception 'Çalışma alanı üyeliği gerekli.';
    end if;
    if coalesce(current_setting('planasistan.v2_sync', true), '') <> 'on' then
        raise exception 'Normalize scope yalnız push_workspace_v2 içinden yazılabilir.';
    end if;

    -- -----------------------------------------------------------------------
    -- Master veri — yalnız PYB Destek
    -- -----------------------------------------------------------------------
    if membership_role = 'pyb_destek' then
        insert into public.departments (
            workspace_id, code, name, lead_name, lead_person_id, payload
        )
        select ws, item->>'code', coalesce(item->>'name', ''),
               item->>'leadName', item->>'leadPersonId', item
        from jsonb_array_elements(
            case when jsonb_typeof(core_doc->'departments') = 'array'
                 then core_doc->'departments' else '[]'::jsonb end
        ) item
        where nullif(btrim(item->>'code'), '') is not null
        on conflict (workspace_id, code) do update set
            name = excluded.name,
            lead_name = excluded.lead_name,
            lead_person_id = excluded.lead_person_id,
            payload = excluded.payload;

        delete from public.departments target
        where target.workspace_id = ws
          and not exists (
              select 1
              from jsonb_array_elements(
                  case when jsonb_typeof(core_doc->'departments') = 'array'
                       then core_doc->'departments' else '[]'::jsonb end
              ) item
              where item->>'code' = target.code
          );

        insert into public.people (
            workspace_id, id, sicil, first_name, last_name, emy,
            department_code, title_code, available_aa, roles, payload
        )
        select ws, item->>'id', item->>'sicil',
               coalesce(item->>'firstName', ''), coalesce(item->>'lastName', ''),
               item->>'emy', coalesce(item->>'departmentCode', ''),
               item->>'titleCode',
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
        where nullif(btrim(item->>'id'), '') is not null
        on conflict (workspace_id, id) do update set
            sicil = excluded.sicil,
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            emy = excluded.emy,
            department_code = excluded.department_code,
            title_code = excluded.title_code,
            available_aa = excluded.available_aa,
            roles = excluded.roles,
            payload = excluded.payload;

        -- Kişi silme allocations/person_leaves satırlarını FK ile temizler.
        delete from public.people target
        where target.workspace_id = ws
          and not exists (
              select 1
              from jsonb_array_elements(
                  case when jsonb_typeof(core_doc->'people') = 'array'
                       then core_doc->'people' else '[]'::jsonb end
              ) item
              where item->>'id' = target.id
          );

        insert into public.role_catalog (
            workspace_id, id, department_code, name, payload
        )
        select ws, item->>'id', coalesce(item->>'departmentCode', ''),
               coalesce(item->>'name', ''), item
        from jsonb_array_elements(
            case when jsonb_typeof(core_doc->'roleCatalog') = 'array'
                 then core_doc->'roleCatalog' else '[]'::jsonb end
        ) item
        where nullif(btrim(item->>'id'), '') is not null
        on conflict (workspace_id, id) do update set
            department_code = excluded.department_code,
            name = excluded.name,
            payload = excluded.payload;

        delete from public.role_catalog target
        where target.workspace_id = ws
          and not exists (
              select 1
              from jsonb_array_elements(
                  case when jsonb_typeof(core_doc->'roleCatalog') = 'array'
                       then core_doc->'roleCatalog' else '[]'::jsonb end
              ) item
              where item->>'id' = target.id
          );

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
        where nullif(btrim(item->>'code'), '') is not null
        on conflict (workspace_id, code) do update set
            name = excluded.name,
            monthly_cost = excluded.monthly_cost,
            payload = excluded.payload;

        delete from public.titles target
        where target.workspace_id = ws
          and not exists (
              select 1
              from jsonb_array_elements(
                  case when jsonb_typeof(core_doc->'titles') = 'array'
                       then core_doc->'titles' else '[]'::jsonb end
              ) item
              where item->>'code' = target.code
          );

        insert into public.person_leaves (
            workspace_id, id, person_id, year, month, aa, reason, payload
        )
        select ws, item->>'id', coalesce(item->>'personId', ''),
               case when item->>'year' ~ '^\d{4}$'
                    then (item->>'year')::integer
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
        where nullif(btrim(item->>'id'), '') is not null
        on conflict (workspace_id, id) do update set
            person_id = excluded.person_id,
            year = excluded.year,
            month = excluded.month,
            aa = excluded.aa,
            reason = excluded.reason,
            payload = excluded.payload;

        delete from public.person_leaves target
        where target.workspace_id = ws
          and not exists (
              select 1
              from jsonb_array_elements(
                  case when jsonb_typeof(core_doc->'leaves') = 'array'
                       then core_doc->'leaves' else '[]'::jsonb end
              ) item
              where item->>'id' = target.id
          );
    end if;

    -- -----------------------------------------------------------------------
    -- Proje üst kayıtları — sahip PY veya PYB Destek
    -- -----------------------------------------------------------------------
    if membership_role in ('py','pyb_destek') then
        insert into public.projects (
            workspace_id, id, name, code, status, rag, rag_note, pm_person_id,
            settings, payload, source_created_at, source_updated_at, position
        )
        select ws, item->>'id',
               coalesce(nullif(item->>'name', ''), 'Adsız Proje'),
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
               item->>'createdAt', item->>'updatedAt',
               (project.ordinality - 1)::integer
        from jsonb_array_elements(
            case when jsonb_typeof(core_doc->'projects') = 'array'
                 then core_doc->'projects' else '[]'::jsonb end
        ) with ordinality as project(item, ordinality)
        where nullif(btrim(item->>'id'), '') is not null
          and (
              membership_role = 'pyb_destek'
              or item->>'pmPersonId' = membership_person
          )
        on conflict (workspace_id, id) do update set
            name = excluded.name,
            code = excluded.code,
            status = excluded.status,
            rag = excluded.rag,
            rag_note = excluded.rag_note,
            pm_person_id = excluded.pm_person_id,
            settings = excluded.settings,
            payload = excluded.payload,
            source_created_at = excluded.source_created_at,
            source_updated_at = excluded.source_updated_at,
            position = excluded.position;

        -- Silme yalnız mevcut satırda gerçekten yetkili olunan kapsamda çalışır.
        delete from public.projects target
        where target.workspace_id = ws
          and (
              public.can_manage_pool(ws)
              or public.can_edit_project(ws, target.id)
          )
          and not exists (
              select 1
              from jsonb_array_elements(
                  case when jsonb_typeof(core_doc->'projects') = 'array'
                       then core_doc->'projects' else '[]'::jsonb end
              ) item
              where item->>'id' = target.id
          );
    end if;

    -- -----------------------------------------------------------------------
    -- Proje alt kayıtları
    --   PY: sahip olduğu projedeki tüm türler
    --   PYB Destek: yalnız work_package
    -- -----------------------------------------------------------------------
    if membership_role in ('py','pyb_destek') then
        insert into public.project_entities (
            workspace_id, project_id, entity_type, id, payload, position
        )
        select ws, project->>'id', kinds.entity_type, entity.item->>'id',
               entity.item, (entity.ordinality - 1)::integer
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
        ) with ordinality as entity(item, ordinality)
        where nullif(btrim(project->>'id'), '') is not null
          and nullif(btrim(entity.item->>'id'), '') is not null
          and (
              (membership_role = 'py'
               and public.can_edit_project(ws, project->>'id'))
              or (membership_role = 'pyb_destek'
                  and kinds.entity_type = 'work_package')
          )
        on conflict (workspace_id, project_id, entity_type, id) do update set
            payload = excluded.payload,
            position = excluded.position;

        delete from public.project_entities target
        where target.workspace_id = ws
          and (
              (membership_role = 'py'
               and public.can_edit_project(ws, target.project_id))
              or (membership_role = 'pyb_destek'
                  and target.entity_type = 'work_package')
          )
          and not exists (
              select 1
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
              ) as entity(item)
              where project->>'id' = target.project_id
                and kinds.entity_type = target.entity_type
                and entity.item->>'id' = target.id
          );
    end if;

    -- -----------------------------------------------------------------------
    -- Tahsisler — RLS: sahip PY / bölüm kişisi / PYB Destek toplu içe aktarım
    -- -----------------------------------------------------------------------
    if membership_role in ('py','bolum_sorumlu','pyb_destek') then
        insert into public.allocations (
            workspace_id, id, person_id, project_id, work_package_id,
            role, year, plan, actual
        )
        select ws, item->>'id', coalesce(item->>'personId', ''),
               coalesce(item->>'projectId', ''), item->>'workPackageId',
               item->>'role',
               case when item->>'year' ~ '^\d{4}$'
                    then (item->>'year')::integer
                    else extract(year from now())::integer end,
               case when jsonb_typeof(item->'plan') = 'object'
                    then item->'plan' else '{}'::jsonb end,
               case when jsonb_typeof(item->'actual') = 'object'
                    then item->'actual' else '{}'::jsonb end
        from jsonb_array_elements(
            case when jsonb_typeof(core_doc->'allocations') = 'array'
                 then core_doc->'allocations' else '[]'::jsonb end
        ) item
        where nullif(btrim(item->>'id'), '') is not null
          and public.can_edit_allocation(
              ws, item->>'projectId', item->>'personId'
          )
        on conflict (workspace_id, id) do update set
            person_id = excluded.person_id,
            project_id = excluded.project_id,
            work_package_id = excluded.work_package_id,
            role = excluded.role,
            year = excluded.year,
            plan = excluded.plan,
            actual = excluded.actual;

        delete from public.allocations target
        where target.workspace_id = ws
          and public.can_edit_allocation(
              ws, target.project_id, target.person_id
          )
          and not exists (
              select 1
              from jsonb_array_elements(
                  case when jsonb_typeof(core_doc->'allocations') = 'array'
                       then core_doc->'allocations' else '[]'::jsonb end
              ) item
              where item->>'id' = target.id
          );
    end if;

    -- -----------------------------------------------------------------------
    -- Plan kilitleri — transition trigger gerçek rolü/tarihleri sunucuda yazar
    -- -----------------------------------------------------------------------
    if membership_role in ('py','bolum_sorumlu','mudur','pyb_sorumlu') then
        insert into public.plan_locks (
            workspace_id, project_id, year, status, submitted_at,
            submitted_by_role, decided_at, decided_by_role
        )
        select ws, item->>'projectId',
               case when item->>'year' ~ '^\d{4}$'
                    then (item->>'year')::integer
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
        where nullif(btrim(item->>'projectId'), '') is not null
          and (
              public.can_approve_plan(ws)
              or public.can_submit_plan(ws, item->>'projectId')
          )
        on conflict (workspace_id, project_id, year) do update set
            status = excluded.status,
            submitted_at = excluded.submitted_at,
            submitted_by_role = excluded.submitted_by_role,
            decided_at = excluded.decided_at,
            decided_by_role = excluded.decided_by_role;
    end if;

    -- -----------------------------------------------------------------------
    -- PM özel verisi — yalnız sahip olunan projeler
    -- -----------------------------------------------------------------------
    if membership_role = 'py' then
        insert into public.project_notes (
            workspace_id, project_id, id, payload, position
        )
        select ws, grouped.key, note.item->>'id', note.item,
               (note.ordinality - 1)::integer
        from jsonb_each(
            case when jsonb_typeof(private_doc->'notes') = 'object'
                 then private_doc->'notes' else '{}'::jsonb end
        ) grouped
        cross join lateral jsonb_array_elements(
            case when jsonb_typeof(grouped.value) = 'array'
                 then grouped.value else '[]'::jsonb end
        ) with ordinality as note(item, ordinality)
        where nullif(btrim(note.item->>'id'), '') is not null
          and public.can_edit_project(ws, grouped.key)
        on conflict (workspace_id, project_id, id) do update set
            payload = excluded.payload,
            position = excluded.position;

        delete from public.project_notes target
        where target.workspace_id = ws
          and public.can_edit_project(ws, target.project_id)
          and not exists (
              select 1
              from jsonb_each(
                  case when jsonb_typeof(private_doc->'notes') = 'object'
                       then private_doc->'notes' else '{}'::jsonb end
              ) grouped
              cross join lateral jsonb_array_elements(
                  case when jsonb_typeof(grouped.value) = 'array'
                       then grouped.value else '[]'::jsonb end
              ) as note(item)
              where grouped.key = target.project_id
                and note.item->>'id' = target.id
          );

        insert into public.customer_requests (
            workspace_id, project_id, id, payload, position
        )
        select ws, grouped.key, request.item->>'id', request.item,
               (request.ordinality - 1)::integer
        from jsonb_each(
            case when jsonb_typeof(private_doc->'customerRequests') = 'object'
                 then private_doc->'customerRequests' else '{}'::jsonb end
        ) grouped
        cross join lateral jsonb_array_elements(
            case when jsonb_typeof(grouped.value) = 'array'
                 then grouped.value else '[]'::jsonb end
        ) with ordinality as request(item, ordinality)
        where nullif(btrim(request.item->>'id'), '') is not null
          and public.can_edit_project(ws, grouped.key)
        on conflict (workspace_id, project_id, id) do update set
            payload = excluded.payload,
            position = excluded.position;

        delete from public.customer_requests target
        where target.workspace_id = ws
          and public.can_edit_project(ws, target.project_id)
          and not exists (
              select 1
              from jsonb_each(
                  case when jsonb_typeof(private_doc->'customerRequests') = 'object'
                       then private_doc->'customerRequests' else '{}'::jsonb end
              ) grouped
              cross join lateral jsonb_array_elements(
                  case when jsonb_typeof(grouped.value) = 'array'
                       then grouped.value else '[]'::jsonb end
              ) as request(item)
              where grouped.key = target.project_id
                and request.item->>'id' = target.id
          );
    end if;

    -- Portföy snapshot'ları append-only. PM'in açılışta yerel ürettiği aylık
    -- snapshot kapsam dışıdır ve normalize tabloya yazılmaz.
    if public.sees_all_projects(ws) then
        insert into public.workspace_snapshots (
            workspace_id, id, year, taken_at, trigger_kind, payload
        )
        select ws, item->>'id',
               case when item->>'year' ~ '^\d{4}$'
                    then (item->>'year')::integer
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
        where nullif(btrim(item->>'id'), '') is not null
        on conflict (workspace_id, id) do nothing;
    end if;

    -- Yalnız bu oturum kimliğiyle üretilmiş yeni audit öğelerini ekle. Eski
    -- aktörlere ait satırlar backfill'den gelir ve conflict ile korunur.
    perform public.append_audit_event_v2(
        ws,
        item->>'id',
        item->>'action',
        item->>'summary',
        item->>'projectId',
        item
    )
    from jsonb_array_elements(
        case when jsonb_typeof(core_doc->'auditLog') = 'array'
             then core_doc->'auditLog' else '[]'::jsonb end
    ) item
    where nullif(btrim(item->>'id'), '') is not null
      and item->>'actorRole' = membership_role
      and coalesce(item->>'actorPersonId', '') = coalesce(membership_person, '');
end;
$$;

revoke all on function planasistan_private.sync_normalized_scope(uuid, jsonb, jsonb) from public;
grant execute on function planasistan_private.sync_normalized_scope(uuid, jsonb, jsonb) to authenticated;

-- Normalize tablolardan v1 uyumluluk belgesini yeniden üretir. Kullanıcı
-- girdisi doğrudan workspaces.core'a yazılmaz.
create or replace function planasistan_private.build_core_document(ws uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public, planasistan_private
as $$
declare
    root_doc jsonb;
    projects_doc jsonb;
    people_doc jsonb;
    departments_doc jsonb;
    roles_doc jsonb;
    titles_doc jsonb;
    allocations_doc jsonb;
    locks_doc jsonb;
    snapshots_doc jsonb;
    leaves_doc jsonb;
    audit_doc jsonb;
begin
    select core into root_doc from public.workspaces where id = ws;

    select coalesce(jsonb_agg(
        (p.payload - array[
            'id','name','code','status','rag','ragNote','pmPersonId',
            'createdAt','updatedAt'
        ]) || jsonb_strip_nulls(jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'code', p.code,
                'status', p.status,
                'rag', p.rag,
                'ragNote', p.rag_note,
                'pmPersonId', p.pm_person_id,
                'createdAt', p.source_created_at,
                'updatedAt', p.source_updated_at
            )) || jsonb_build_object(
                'settings', p.settings,
                'tasks', coalesce((
                    select jsonb_agg(e.payload order by e.position nulls last, e.id)
                    from public.project_entities e
                    where e.workspace_id = p.workspace_id
                      and e.project_id = p.id and e.entity_type = 'task'
                ), '[]'::jsonb),
                'resources', coalesce((
                    select jsonb_agg(e.payload order by e.position nulls last, e.id)
                    from public.project_entities e
                    where e.workspace_id = p.workspace_id
                      and e.project_id = p.id and e.entity_type = 'resource'
                ), '[]'::jsonb),
                'objectives', coalesce((
                    select jsonb_agg(e.payload order by e.position nulls last, e.id)
                    from public.project_entities e
                    where e.workspace_id = p.workspace_id
                      and e.project_id = p.id and e.entity_type = 'objective'
                ), '[]'::jsonb),
                'workPackages', coalesce((
                    select jsonb_agg(e.payload order by e.position nulls last, e.id)
                    from public.project_entities e
                    where e.workspace_id = p.workspace_id
                      and e.project_id = p.id and e.entity_type = 'work_package'
                ), '[]'::jsonb),
                'risks', coalesce((
                    select jsonb_agg(e.payload order by e.position nulls last, e.id)
                    from public.project_entities e
                    where e.workspace_id = p.workspace_id
                      and e.project_id = p.id and e.entity_type = 'risk'
                ), '[]'::jsonb),
                'pestelItems', coalesce((
                    select jsonb_agg(e.payload order by e.position nulls last, e.id)
                    from public.project_entities e
                    where e.workspace_id = p.workspace_id
                      and e.project_id = p.id and e.entity_type = 'pestel'
                ), '[]'::jsonb),
                'swotItems', coalesce((
                    select jsonb_agg(e.payload order by e.position nulls last, e.id)
                    from public.project_entities e
                    where e.workspace_id = p.workspace_id
                      and e.project_id = p.id and e.entity_type = 'swot'
                ), '[]'::jsonb),
                'notes', '[]'::jsonb,
                'customerRequests', '[]'::jsonb
            )
        order by p.position nulls last, p.source_created_at nulls last, p.id
    ), '[]'::jsonb) into projects_doc
    from public.projects p where p.workspace_id = ws;

    select coalesce(jsonb_agg(payload order by id), '[]'::jsonb)
      into people_doc from public.people where workspace_id = ws;
    select coalesce(jsonb_agg(payload order by code), '[]'::jsonb)
      into departments_doc from public.departments where workspace_id = ws;
    select coalesce(jsonb_agg(payload order by id), '[]'::jsonb)
      into roles_doc from public.role_catalog where workspace_id = ws;
    select coalesce(jsonb_agg(payload order by code), '[]'::jsonb)
      into titles_doc from public.titles where workspace_id = ws;

    select coalesce(jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
            'id', id, 'personId', person_id, 'projectId', project_id,
            'workPackageId', work_package_id, 'role', role, 'year', year,
            'plan', plan, 'actual', actual
        )) order by id
    ), '[]'::jsonb) into allocations_doc
    from public.allocations where workspace_id = ws;

    select coalesce(jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
            'projectId', project_id, 'year', year, 'status', status,
            'submittedAt', submitted_at, 'submittedByRole', submitted_by_role,
            'decidedAt', decided_at, 'decidedByRole', decided_by_role
        )) order by project_id, year
    ), '[]'::jsonb) into locks_doc
    from public.plan_locks where workspace_id = ws;

    select coalesce(jsonb_agg(payload order by taken_at, id), '[]'::jsonb)
      into snapshots_doc
    from public.workspace_snapshots where workspace_id = ws;

    select coalesce(jsonb_agg(payload order by person_id, year, month, id), '[]'::jsonb)
      into leaves_doc
    from public.person_leaves where workspace_id = ws;

    select coalesce(jsonb_agg(entry order by at desc, id), '[]'::jsonb)
      into audit_doc
    from (
        select a.id, a.at,
               (a.payload - array[
                   'id','at','actorRole','actorPersonId','action','summary','projectId'
               ]) || jsonb_strip_nulls(jsonb_build_object(
                   'id', a.id,
                   'at', a.at,
                   'actorRole', a.actor_role,
                   'actorPersonId', a.actor_person_id,
                   'action', a.action,
                   'summary', a.summary,
                   'projectId', a.project_id
               )) as entry
        from public.audit_events a
        where a.workspace_id = ws
        order by a.at desc, a.id
        limit 500
    ) recent_audit;

    return (coalesce(root_doc, '{}'::jsonb) - array[
        'projects','people','departments','roleCatalog','titles','allocations',
        'planLocks','snapshots','leaves','auditLog'
    ]) || jsonb_build_object(
        'projects', projects_doc,
        'people', people_doc,
        'departments', departments_doc,
        'roleCatalog', roles_doc,
        'titles', titles_doc,
        'allocations', allocations_doc,
        'planLocks', locks_doc,
        'snapshots', snapshots_doc,
        'leaves', leaves_doc,
        'auditLog', audit_doc
    );
end;
$$;

create or replace function planasistan_private.build_private_document(ws uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = public, planasistan_private
as $$
declare
    notes_doc jsonb;
    requests_doc jsonb;
begin
    select coalesce(jsonb_object_agg(project_id, items), '{}'::jsonb)
      into notes_doc
    from (
        select project_id,
               jsonb_agg(payload order by position nulls last, id) as items
        from public.project_notes
        where workspace_id = ws
        group by project_id
    ) grouped_notes;

    select coalesce(jsonb_object_agg(project_id, items), '{}'::jsonb)
      into requests_doc
    from (
        select project_id,
               jsonb_agg(payload order by position nulls last, id) as items
        from public.customer_requests
        where workspace_id = ws
        group by project_id
    ) grouped_requests;

    return jsonb_build_object(
        'notes', notes_doc,
        'customerRequests', requests_doc
    );
end;
$$;

revoke all on function planasistan_private.build_core_document(uuid) from public;
revoke all on function planasistan_private.build_private_document(uuid) from public;

-- Güvenilir normalize tablolardan üretilen uyumluluk belgelerini sürüm
-- kontrolüyle yazar. Kullanıcı tarafından verilen core/private JSON'u almaz.
create or replace function planasistan_private.commit_compat_documents(
    ws uuid,
    expected_core_version bigint,
    expected_private_version bigint,
    require_private_match boolean
)
returns jsonb
language plpgsql security definer
set search_path = public, planasistan_private
as $$
declare
    current_core_version bigint;
    current_private_version bigint;
    next_core_version bigint;
    rebuilt_core jsonb;
    rebuilt_private jsonb;
    affected integer;
begin
    if public.member_role(ws) is null then
        raise exception 'Çalışma alanı üyeliği gerekli.';
    end if;
    if coalesce(current_setting('planasistan.v2_sync', true), '') <> 'on'
       or not exists (
           select 1 from public.workspace_normalization_state
           where workspace_id = ws
       ) then
        raise exception 'Uyumluluk belgesi yalnız normalize push içinden yazılabilir.';
    end if;

    select version into current_core_version
    from public.workspaces where id = ws;
    if current_core_version is distinct from expected_core_version then
        raise exception using errcode = '40001', message = 'Core sürüm çakışması.';
    end if;

    select version into current_private_version
    from public.workspace_private where workspace_id = ws;
    if require_private_match
       and current_private_version is distinct from expected_private_version then
        raise exception using errcode = '40001', message = 'Private sürüm çakışması.';
    end if;

    rebuilt_core := planasistan_private.build_core_document(ws);
    rebuilt_private := planasistan_private.build_private_document(ws);
    next_core_version := expected_core_version + 1;
    perform set_config('planasistan.v2_push', 'on', true);

    update public.workspaces
    set core = rebuilt_core, version = next_core_version
    where id = ws and version = expected_core_version;
    get diagnostics affected = row_count;
    if affected = 0 then
        raise exception using errcode = '40001', message = 'Core sürüm çakışması.';
    end if;

    if exists (
        select 1 from public.workspace_private
        where workspace_id = ws and data is distinct from rebuilt_private
    ) then
        update public.workspace_private
        set data = rebuilt_private, version = version + 1
        where workspace_id = ws;
        current_private_version := current_private_version + 1;
    end if;

    return jsonb_build_object(
        'ok', true,
        'coreVersion', next_core_version,
        'privateVersion', current_private_version
    );
end;
$$;

revoke all on function planasistan_private.commit_compat_documents(uuid, bigint, bigint, boolean) from public;
grant execute on function planasistan_private.commit_compat_documents(uuid, bigint, bigint, boolean) to authenticated;

create or replace function planasistan_private.mark_normalized_sync(
    ws uuid,
    synced_core_version bigint,
    synced_private_version bigint default null
)
returns void
language plpgsql security definer
set search_path = public, planasistan_private
as $$
begin
    if public.member_role(ws) is null then
        raise exception 'Çalışma alanı üyeliği gerekli.';
    end if;
    if coalesce(current_setting('planasistan.v2_sync', true), '') <> 'on' then
        raise exception 'Normalize sürüm yalnız push_workspace_v2 içinden işaretlenebilir.';
    end if;
    if not exists (
        select 1 from public.workspaces
        where id = ws and version = synced_core_version
    ) then
        raise exception 'Normalize sürüm işareti belge sürümüyle uyuşmuyor.';
    end if;

    update public.workspace_normalization_state
    set source_core_version = synced_core_version,
        source_private_version = coalesce(
            synced_private_version, source_private_version
        ),
        last_synced_at = now()
    where workspace_id = ws;
end;
$$;

revoke all on function planasistan_private.mark_normalized_sync(uuid, bigint, bigint) from public;
grant execute on function planasistan_private.mark_normalized_sync(uuid, bigint, bigint) to authenticated;

-- Yeni cloud workspace + private belge + normalize backfill tek transaction.
create or replace function public.create_workspace_v2(
    workspace_name text,
    core_doc jsonb,
    private_doc jsonb
)
returns jsonb
language plpgsql security definer
set search_path = public, planasistan_private
as $$
declare
    created_workspace public.workspaces%rowtype;
    init_summary jsonb;
begin
    if auth.uid() is null then
        raise exception 'Oturum açmanız gerekir.';
    end if;
    if core_doc is null or private_doc is null
       or jsonb_typeof(core_doc) <> 'object'
       or jsonb_typeof(private_doc) <> 'object' then
        raise exception 'Çalışma alanı belgeleri JSON object olmalıdır.';
    end if;

    insert into public.workspaces (name, core, version, created_by)
    values (
        coalesce(nullif(btrim(workspace_name), ''), 'PlanAsistan Çalışma Alanı'),
        core_doc,
        1,
        auth.uid()
    ) returning * into created_workspace;

    -- on_workspace_created tetikleyicisi üyelik ve private satırını oluşturur.
    update public.workspace_private
    set data = private_doc, version = 1
    where workspace_id = created_workspace.id;

    init_summary := public.initialize_normalized_workspace(created_workspace.id);
    perform planasistan_private.capture_document_positions(created_workspace.id);
    update public.workspace_normalization_state
    set last_synced_at = now()
    where workspace_id = created_workspace.id;

    return jsonb_build_object(
        'ok', true,
        'id', created_workspace.id,
        'coreVersion', 1,
        'privateVersion', 1,
        'normalized', init_summary
    );
end;
$$;

revoke all on function public.create_workspace_v2(text, jsonb, jsonb) from public;
grant execute on function public.create_workspace_v2(text, jsonb, jsonb) to authenticated;

-- İyimser sürüm kontrolü + belge/private + normalize scope tek transaction.
create or replace function public.push_workspace_v2(
    ws uuid,
    expected_core_version bigint,
    core_doc jsonb,
    expected_private_version bigint,
    private_doc jsonb
)
returns jsonb
language plpgsql security invoker
set search_path = public, planasistan_private
as $$
declare
    membership_role text := public.member_role(ws);
    has_normalized_state boolean;
    current_core_version bigint;
    compat_result jsonb;
    next_core_version bigint;
    next_private_version bigint;
begin
    if membership_role is null then
        raise exception 'Çalışma alanı üyeliği gerekli.';
    end if;
    if core_doc is null or private_doc is null
       or jsonb_typeof(core_doc) <> 'object'
       or jsonb_typeof(private_doc) <> 'object' then
        raise exception 'Çalışma alanı belgeleri JSON object olmalıdır.';
    end if;

    select exists (
        select 1 from public.workspace_normalization_state
        where workspace_id = ws
    ) into has_normalized_state;

    select version into current_core_version
    from public.workspaces where id = ws;
    if current_core_version is distinct from expected_core_version then
        return jsonb_build_object(
            'ok', false,
            'reason', 'conflict',
            'message', 'Bulutta daha yeni bir sürüm var.'
        );
    end if;

    if not has_normalized_state and membership_role <> 'pyb_destek' then
        return jsonb_build_object(
            'ok', false,
            'reason', 'normalization-required',
            'message', 'İlk normalize senkronunu PYB Destek hesabı başlatmalıdır.'
        );
    end if;

    perform set_config('planasistan.v2_sync', 'on', true);

    if not has_normalized_state then
        -- Yalnız PYB Destek bu dala gelebilir. Önce mevcut sunucu belgesini
        -- normalize eder; ardından bu push'ın yetkili scope değişikliklerini uygular.
        perform public.initialize_normalized_workspace(ws);
        perform planasistan_private.capture_document_positions(ws);
        perform set_config('planasistan.backfill', 'off', true);
    end if;

    perform planasistan_private.sync_normalized_scope(
        ws, core_doc, private_doc
    );

    compat_result := planasistan_private.commit_compat_documents(
        ws,
        expected_core_version,
        expected_private_version,
        membership_role = 'py'
    );
    next_core_version := (compat_result->>'coreVersion')::bigint;
    next_private_version := (compat_result->>'privateVersion')::bigint;

    perform planasistan_private.mark_normalized_sync(
        ws, next_core_version, next_private_version
    );

    return compat_result;
exception
    when serialization_failure then
        return jsonb_build_object(
            'ok', false,
            'reason', 'conflict',
            'message', 'Bulut sürümü işlem sırasında değişti.'
        );
end;
$$;

revoke all on function public.push_workspace_v2(uuid, bigint, jsonb, bigint, jsonb) from public;
grant execute on function public.push_workspace_v2(uuid, bigint, jsonb, bigint, jsonb) to authenticated;

commit;
