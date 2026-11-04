-- ============================================================
-- Dropper · Temu — Paquetes de cada día por ruta y ZONA (sacada de la dirección).
-- Solo se guarda el conteo por zona; la dirección no se guarda.
-- La llena temu-sync con el detalle de "Rendimiento por ruta" de CPS.
-- ============================================================
create table if not exists public.temu_zonas_ruta (
  fecha       date not null,
  ruta        text not null,
  zona        text not null,              -- "10", "9"… o "?" si la dirección no la dice
  en_camino   int  not null default 0,
  entregados  int  not null default 0,
  rechazados  int  not null default 0,
  total       int  not null default 0,
  corte_at    timestamptz not null default now(),
  primary key (fecha, ruta, zona)
);
alter table public.temu_zonas_ruta enable row level security;
create policy "team_select" on public.temu_zonas_ruta for select to authenticated using (true);
