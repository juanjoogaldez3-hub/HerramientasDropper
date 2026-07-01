-- ============================================================
-- Dropper · Reportería — Esquema de base de datos
-- Pegá TODO este archivo en:  Supabase → SQL Editor → New query → Run
-- Es seguro correrlo varias veces (usa IF NOT EXISTS / DROP IF EXISTS).
-- ============================================================

-- Tabla: cada fila = una sesión de generación de reportes.
create table if not exists public.report_sessions (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null,
  created_by_email  text,
  file_name         text,
  clients_count     integer not null default 0,
  deliveries_count  integer not null default 0,
  total_amount      numeric(14,2) not null default 0,
  corrections_count integer not null default 0,
  -- Desglose por cliente (nombre, entregas, total) como JSON.
  clients           jsonb not null default '[]'::jsonb
);

create index if not exists report_sessions_created_at_idx
  on public.report_sessions (created_at desc);

-- ------------------------------------------------------------
-- Seguridad a nivel de fila (RLS)
-- Modelo: equipo interno. Cualquier usuario autenticado puede
-- VER todo el historial e INSERTAR sus propias sesiones.
-- ------------------------------------------------------------
alter table public.report_sessions enable row level security;

drop policy if exists "team_select" on public.report_sessions;
create policy "team_select"
  on public.report_sessions for select
  to authenticated
  using (true);

drop policy if exists "team_insert" on public.report_sessions;
create policy "team_insert"
  on public.report_sessions for insert
  to authenticated
  with check (auth.uid() = created_by);

-- Cada quien puede borrar SOLO lo que generó (opcional).
drop policy if exists "owner_delete" on public.report_sessions;
create policy "owner_delete"
  on public.report_sessions for delete
  to authenticated
  using (auth.uid() = created_by);

-- ============================================================
-- Tabla: cada fila = una sesión de pagos a mensajeros.
-- ============================================================
create table if not exists public.payment_sessions (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null,
  created_by_email  text,
  file_name         text,
  period_text       text,
  rate_entrega      numeric(12,2) not null default 0,
  rate_recolecta    numeric(12,2) not null default 0,
  messengers_count  integer not null default 0,
  deliveries_count  integer not null default 0,
  pickups_count     integer not null default 0,
  discounts_total   numeric(14,2) not null default 0,
  total_paid        numeric(14,2) not null default 0,
  -- Desglose por mensajero (nombre, entregas, recolectas, descuento, motivo, total).
  messengers        jsonb not null default '[]'::jsonb
);

create index if not exists payment_sessions_created_at_idx
  on public.payment_sessions (created_at desc);

alter table public.payment_sessions enable row level security;

drop policy if exists "team_select" on public.payment_sessions;
create policy "team_select"
  on public.payment_sessions for select
  to authenticated
  using (true);

drop policy if exists "team_insert" on public.payment_sessions;
create policy "team_insert"
  on public.payment_sessions for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "owner_delete" on public.payment_sessions;
create policy "owner_delete"
  on public.payment_sessions for delete
  to authenticated
  using (auth.uid() = created_by);

-- ============================================================
-- Control de recibos: cada recibo generado a un mensajero.
-- Sirve para saber qué envíos ya tienen recibo (no pagar dos veces)
-- y para poder ANULAR un recibo (liberar sus envíos).
-- ============================================================
create table if not exists public.receipts (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null,
  created_by_email  text,
  folio             text,
  messenger_name    text,
  period_text       text,
  deliveries_count  integer not null default 0,
  pickups_count     integer not null default 0,
  discount          numeric(14,2) not null default 0,
  discount_reason   text,
  description       text,
  total_paid        numeric(14,2) not null default 0,
  status            text not null default 'activo',  -- 'activo' | 'anulado'
  voided_at         timestamptz
);

create index if not exists receipts_created_at_idx on public.receipts (created_at desc);

alter table public.receipts enable row level security;

drop policy if exists "team_select" on public.receipts;
create policy "team_select" on public.receipts for select to authenticated using (true);

drop policy if exists "team_insert" on public.receipts;
create policy "team_insert" on public.receipts for insert to authenticated with check (auth.uid() = created_by);

-- Anular es una acción de equipo (todos ven todo).
drop policy if exists "team_update" on public.receipts;
create policy "team_update" on public.receipts for update to authenticated using (true) with check (true);

drop policy if exists "owner_delete" on public.receipts;
create policy "owner_delete" on public.receipts for delete to authenticated using (auth.uid() = created_by);

-- Envíos con recibo activo (por "ID de Orden"). Al anular un recibo,
-- sus filas aquí se borran, liberando esos envíos.
create table if not exists public.paid_deliveries (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id) on delete set null,
  order_key      text not null,             -- ID de Orden del envío
  receipt_id     uuid references public.receipts(id) on delete cascade,
  messenger_name text
);

create index if not exists paid_deliveries_order_key_idx on public.paid_deliveries (order_key);
create index if not exists paid_deliveries_receipt_idx on public.paid_deliveries (receipt_id);

alter table public.paid_deliveries enable row level security;

drop policy if exists "team_select" on public.paid_deliveries;
create policy "team_select" on public.paid_deliveries for select to authenticated using (true);

drop policy if exists "team_insert" on public.paid_deliveries;
create policy "team_insert" on public.paid_deliveries for insert to authenticated with check (auth.uid() = created_by);

-- Al anular un recibo se liberan sus envíos (acción de equipo).
drop policy if exists "team_delete" on public.paid_deliveries;
create policy "team_delete" on public.paid_deliveries for delete to authenticated using (true);
