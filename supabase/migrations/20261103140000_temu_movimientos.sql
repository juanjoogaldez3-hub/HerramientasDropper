-- ============================================================
-- Dropper · Temu — Registro de "Mover en ruta" hecho desde el tablero.
-- Cada fila = un paquete que se intentó mover de un motorista a otro.
-- Solo la función temu-mover escribe; el equipo puede leer.
-- ============================================================
create table if not exists public.temu_movimientos (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  hecho_por          text,               -- email de quien lo hizo
  wrhs               text not null,      -- guía del paquete (IDENTIFICADOR_DETALLE / WRHS)
  correlativo        text,
  ruta_origen        text,
  piloto_origen_id   bigint,
  piloto_origen      text,
  ruta_destino_id    bigint,
  ruta_destino       text,
  piloto_destino_id  bigint,
  piloto_destino     text,
  motivo             text,
  ok                 boolean not null,
  mensaje            text
);
create index if not exists temu_movimientos_created_idx on public.temu_movimientos (created_at desc);
alter table public.temu_movimientos enable row level security;
create policy "team_select" on public.temu_movimientos for select to authenticated using (true);
