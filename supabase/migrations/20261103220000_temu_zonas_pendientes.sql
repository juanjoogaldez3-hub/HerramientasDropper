-- ============================================================
-- Dropper · Temu — Lo que viene para mañana, por ruta y ZONA (sacada de la dirección).
-- Foto del último corte: temu-sync la reemplaza en cada corrida.
-- Solo se guarda el conteo; la dirección no se guarda.
-- (temu_zonas_ruta, de los paquetes de hoy, ya no se usa en el tablero.)
-- ============================================================
create table if not exists public.temu_zonas_pendientes (
  ruta        text not null,
  zona        text not null,              -- "10", "9"… o "?" si la dirección no la dice
  por_llegar  int  not null default 0,    -- centro de recepción de CPS (estado 11)
  en_bodega   int  not null default 0,    -- activo en centro, sin asignar (estado 1)
  corte_at    timestamptz not null default now(),
  primary key (ruta, zona)
);
alter table public.temu_zonas_pendientes enable row level security;
create policy "team_select" on public.temu_zonas_pendientes for select to authenticated using (true);
