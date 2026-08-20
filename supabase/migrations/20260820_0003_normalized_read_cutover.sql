-- ===========================================================================
-- PlanAsistan — v2.2 normalize okuma cutover
--
-- Ön koşul:
--   1) ../schema.sql
--   2) 20260820_0001_normalized_rbac.sql
--   3) 20260820_0002_transactional_dual_write.sql
--
-- Tarayıcı artık tam workspaces.core belgesini okuyamaz. pull_workspace_v2,
-- normalize tablolardan yalnız oturumun RLS ile görebildiği satırları tek bir
-- transaction snapshot'ında belge biçimine getirir. Uyumluluk JSON'u yalnız
-- sunucu içi geçiş kopyası olarak kalır.
-- ===========================================================================

begin;

-- Core erişimini kapatmadan önce bütün eski workspace'lerin normalize ve
-- uyumluluk belgeleriyle aynı sürümde olması zorunludur. Böylece cutover,
-- henüz aktarılmamış bir legacy belgenin tek okuma yolunu yanlışlıkla kesmez.
do $$
begin
    if exists (
        select 1
        from public.workspaces w
        left join public.workspace_normalization_state s
          on s.workspace_id = w.id
        left join public.workspace_private p
          on p.workspace_id = w.id
        where s.workspace_id is null
           or s.source_core_version <> w.version
           or s.source_private_version <> coalesce(p.version, 0)
    ) then
        raise exception using
            errcode = 'PZ004',
            message = 'Normalize edilmemiş veya sürümü geride workspace var. 0003 öncesi PYB Destek ile pull + push tamamlanmalıdır.';
    end if;
end
$$;

-- İstemcinin RLS kapsamındaki normalize satırlarından paylaşılan belgeyi
-- üretir. SECURITY INVOKER bilinçli seçilmiştir: aşağıdaki her SELECT çağıran
-- kullanıcının tablo izinleri ve RLS politikalarıyla çalışır.
create or replace function planasistan_private.build_scoped_core_document(ws uuid)
returns jsonb
language plpgsql stable security invoker
set search_path = public, planasistan_private
as $$
declare
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

    return jsonb_build_object(
        'schemaVersion', 3,
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

create or replace function planasistan_private.build_scoped_private_document(ws uuid)
returns jsonb
language plpgsql stable security invoker
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

revoke all on function planasistan_private.build_scoped_core_document(uuid) from public;
revoke all on function planasistan_private.build_scoped_private_document(uuid) from public;
grant execute on function planasistan_private.build_scoped_core_document(uuid) to authenticated;
grant execute on function planasistan_private.build_scoped_private_document(uuid) to authenticated;

-- Tek RPC hem sürüm bilgisini hem RLS-kapsamlı core/private belgeyi aynı
-- transaction snapshot'ında döndürür. SECURITY INVOKER, builder'lardaki RLS
-- kapsamının korunması için zorunludur.
create or replace function public.pull_workspace_v2(ws uuid)
returns jsonb
language plpgsql stable security invoker
set search_path = public, planasistan_private
as $$
declare
    membership_role text := public.member_role(ws);
    normalized_core_version bigint;
    current_core_version bigint;
    private_visible boolean;
begin
    if membership_role is null then
        raise exception 'Çalışma alanı üyeliği gerekli.';
    end if;

    select source_core_version into normalized_core_version
    from public.workspace_normalization_state
    where workspace_id = ws;

    if normalized_core_version is null then
        return jsonb_build_object(
            'ok', false,
            'reason', 'normalization-required',
            'message', 'Çalışma alanı normalize okuma için hazır değil.'
        );
    end if;

    select version into current_core_version
    from public.workspaces where id = ws;

    if current_core_version is null then
        raise exception 'Çalışma alanı bulunamadı.';
    end if;
    if normalized_core_version <> current_core_version then
        return jsonb_build_object(
            'ok', false,
            'reason', 'normalization-required',
            'message', 'Normalize veri sürümü uyumluluk sürümünün gerisinde.'
        );
    end if;

    private_visible := membership_role = 'py';

    return jsonb_build_object(
        'ok', true,
        'core', planasistan_private.build_scoped_core_document(ws),
        'coreVersion', current_core_version,
        'privateDoc', case when private_visible
                           then planasistan_private.build_scoped_private_document(ws)
                           else null end,
        'privateVersion', case when private_visible
                               then public.get_private_version(ws)
                               else null end,
        'privateVisible', private_visible
    );
end;
$$;

revoke all on function public.pull_workspace_v2(uuid) from public;
grant execute on function public.pull_workspace_v2(uuid) to authenticated;

-- Tam legacy core artık PostgREST üzerinden okunamaz veya yazılamaz. RPC'lerin
-- iyimser sürüm kontrolü ve owner cleanup için gereken güvenli sütun/DELETE
-- izinleri ayrı bırakılır; RLS bunları da üyelik/sahiplik ile sınırlar.
revoke select, insert, update, delete on table public.workspaces from anon;
revoke select, insert, update on table public.workspaces from authenticated;
grant select (id, name, version, updated_at, created_by)
    on table public.workspaces to authenticated;
grant delete on table public.workspaces to authenticated;

commit;
