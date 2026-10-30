-- ============================================================
-- Dropper · Temu — Paquetes de hoy por motorista y ruta (de CPS:
-- Graphics/RutasGraficaBarrasTemuEmpresa): asignados, pendientes,
-- entregados y rechazados. La sincronización reemplaza las filas
-- del día en cada vuelta.
-- ============================================================
create table if not exists public.temu_rutas_piloto (
  fecha       date   not null,
  piloto_id   bigint not null,
  ruta        text   not null,
  piloto_cps  text,                  -- usuario de CPS (p. ej. "Aramon")
  total       int not null default 0,
  pendientes  int not null default 0,
  entregados  int not null default 0,
  rechazados  int not null default 0,
  corte_at    timestamptz not null default now(),
  primary key (fecha, piloto_id, ruta)
);
alter table public.temu_rutas_piloto enable row level security;
drop policy if exists "team_select" on public.temu_rutas_piloto;
create policy "team_select" on public.temu_rutas_piloto for select to authenticated using (true);
