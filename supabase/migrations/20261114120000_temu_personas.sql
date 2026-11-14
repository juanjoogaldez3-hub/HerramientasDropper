-- ============================================================
-- Dropper · Temu — Contar por PERSONA, no por usuario de CPS.
-- En nov 2026 CPS creó usuarios nuevos para los motoristas y le pasó
-- usuarios viejos a otras personas (el de Fredy quedó a nombre de Douglas,
-- el de Willhen a nombre de Franklin). Cada envío guarda el nombre que tenía
-- el motorista ese día (temu_envios.piloto), así que se agrupa por ese nombre.
-- ============================================================
create or replace function public.temu_persona(nombre text) returns text
language sql immutable as $$
  select nullif(initcap(regexp_replace(regexp_replace(lower(trim(coalesce(nombre, ''))), '\s+dropper$', ''), '\s+', ' ', 'g')), '')
$$;

-- Fijo / Apoyo por persona (lo cambia el equipo en la pestaña Pilotos)
create table if not exists public.temu_personas (
  persona    text primary key,
  tipo       text not null default 'Fijo' check (tipo in ('Fijo', 'Apoyo')),
  updated_at timestamptz not null default now()
);
alter table public.temu_personas enable row level security;
create policy "team_select" on public.temu_personas for select to authenticated using (true);
create policy "team_insert" on public.temu_personas for insert to authenticated with check (true);
create policy "team_update" on public.temu_personas for update to authenticated using (true) with check (true);

insert into public.temu_personas (persona, tipo)
select distinct public.temu_persona(piloto), 'Fijo' from public.temu_envios where public.temu_persona(piloto) is not null
on conflict do nothing;
update public.temu_personas set tipo = 'Apoyo' where persona in ('Willhen Areas', 'Jorge Retana', 'Mynor Garcia', 'Angel Boster', 'Franklin Lucha');

-- Igual que temu_dia_piloto pero por persona (piloto_id = nombre de la persona)
create or replace view public.temu_dia_persona with (security_invoker = true) as
select e.fecha,
       public.temu_persona(e.piloto) as piloto_id,
       public.temu_persona(e.piloto) as piloto,
       coalesce(p.tipo, 'Fijo') as tipo,
       count(*) filter (where e.estado = 'entregado') as entregados,
       count(*) filter (where e.estado = 'rechazo')   as rechazos,
       count(*) filter (where e.estado = 'otro')      as otros
from public.temu_envios e
left join public.temu_personas p on p.persona = public.temu_persona(e.piloto)
group by e.fecha, public.temu_persona(e.piloto), p.tipo;
