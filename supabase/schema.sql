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

-- ============================================================
-- Tabla: cada fila = una sesión de comisiones de cobro contra entrega.
-- Es la comisión (% del monto cobrado) que Dropper le cobra al cliente/tienda.
-- ============================================================
create table if not exists public.commission_sessions (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null,
  created_by_email  text,
  file_name         text,
  period_text       text,
  rate_percent      numeric(6,2) not null default 0,
  clients_count     integer not null default 0,
  orders_count      integer not null default 0,
  collected_total   numeric(14,2) not null default 0,
  commission_total  numeric(14,2) not null default 0,
  -- Desglose por cliente (nombre, pedidos, cobrado, pct, comision) como JSON.
  clients           jsonb not null default '[]'::jsonb
);

create index if not exists commission_sessions_created_at_idx
  on public.commission_sessions (created_at desc);

alter table public.commission_sessions enable row level security;

drop policy if exists "team_select" on public.commission_sessions;
create policy "team_select"
  on public.commission_sessions for select
  to authenticated
  using (true);

drop policy if exists "team_insert" on public.commission_sessions;
create policy "team_insert"
  on public.commission_sessions for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "owner_delete" on public.commission_sessions;
create policy "owner_delete"
  on public.commission_sessions for delete
  to authenticated
  using (auth.uid() = created_by);

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

-- ============================================================
-- Control de Motoristas: un registro por motorista y día.
-- Datos del Excel (asignados/entregados/horas) + manuales (hora de
-- entrada real, incidencias por orden). Se hace UPSERT por (motorista, fecha).
-- ============================================================
create table if not exists public.motorista_dias (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null,
  created_by_email   text,
  motorista          text not null,
  fecha              date not null,
  asignados          integer not null default 0,
  entregados         integer not null default 0,
  horas              numeric(8,2) not null default 0,
  eph                numeric(8,2) not null default 0,
  entrada_prog       text default '08:00',
  entrada_real       text,
  tardanza_min       integer not null default 0,
  incidencias        jsonb not null default '[]'::jsonb,   -- [{orden, tipo, monto}]
  incidencias_total  numeric(12,2) not null default 0,
  intentos_culpa     jsonb not null default '[]'::jsonb,   -- números de orden de intentos marcados como culpa del motorista

  pago_base          numeric(12,2) not null default 0,
  bono               numeric(12,2) not null default 0,
  desc_tardanza      numeric(12,2) not null default 0,
  pago               numeric(12,2) not null default 0,
  baja               boolean not null default false,
  unique (motorista, fecha)
);

create index if not exists motorista_dias_fecha_idx on public.motorista_dias (fecha desc);
create index if not exists motorista_dias_mot_idx on public.motorista_dias (motorista);

alter table public.motorista_dias enable row level security;

drop policy if exists "team_select" on public.motorista_dias;
create policy "team_select" on public.motorista_dias for select to authenticated using (true);

drop policy if exists "team_insert" on public.motorista_dias;
create policy "team_insert" on public.motorista_dias for insert to authenticated with check (auth.uid() = created_by);

-- El registro del día lo edita el equipo (varios supervisores).
drop policy if exists "team_update" on public.motorista_dias;
create policy "team_update" on public.motorista_dias for update to authenticated using (true) with check (true);

drop policy if exists "team_delete" on public.motorista_dias;
create policy "team_delete" on public.motorista_dias for delete to authenticated using (true);

-- ============================================================
-- Asistencia de oficina: empleados (con su horario) y registro diario.
-- ============================================================
-- Admin de asistencia: define en UN solo lugar quien puede editar/borrar/administrar.
-- Para agregar mas admins: in ('juanjoogaldez3@gmail.com','otro@correo.com')
create or replace function public.is_asis_admin() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() ->> 'email') in ('juanjoogaldez3@gmail.com'), false)
$$;

create table if not exists public.empleados_oficina (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  nombre        text not null unique,
  entrada_prog  text not null default '08:00',
  salida_prog   text not null default '17:00',
  activo        boolean not null default true
);
alter table public.empleados_oficina enable row level security;
drop policy if exists "team_select" on public.empleados_oficina;
create policy "team_select" on public.empleados_oficina for select to authenticated using (true);
drop policy if exists "team_insert" on public.empleados_oficina;
drop policy if exists "admin_insert" on public.empleados_oficina;
create policy "admin_insert" on public.empleados_oficina for insert to authenticated with check (public.is_asis_admin());
drop policy if exists "team_update" on public.empleados_oficina;
drop policy if exists "admin_update" on public.empleados_oficina;
create policy "admin_update" on public.empleados_oficina for update to authenticated using (public.is_asis_admin()) with check (public.is_asis_admin());
drop policy if exists "team_delete" on public.empleados_oficina;
drop policy if exists "admin_delete" on public.empleados_oficina;
create policy "admin_delete" on public.empleados_oficina for delete to authenticated using (public.is_asis_admin());

create table if not exists public.asistencia_dias (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  created_by_email text,
  empleado      text not null,
  fecha         date not null,
  entrada_prog  text,
  salida_prog   text,
  entrada_real  text,
  salida_real   text,
  tardanza_min  integer not null default 0,
  horas         numeric(8,2) not null default 0,
  ausente       boolean not null default false,
  nota          text,
  unique (empleado, fecha)
);
create index if not exists asistencia_fecha_idx on public.asistencia_dias (fecha desc);
create index if not exists asistencia_emp_idx on public.asistencia_dias (empleado);
alter table public.asistencia_dias enable row level security;
drop policy if exists "team_select" on public.asistencia_dias;
create policy "team_select" on public.asistencia_dias for select to authenticated using (true);
drop policy if exists "team_insert" on public.asistencia_dias;
drop policy if exists "admin_insert" on public.asistencia_dias;
create policy "admin_insert" on public.asistencia_dias for insert to authenticated with check (public.is_asis_admin());
drop policy if exists "team_update" on public.asistencia_dias;
drop policy if exists "admin_update" on public.asistencia_dias;
create policy "admin_update" on public.asistencia_dias for update to authenticated using (public.is_asis_admin()) with check (public.is_asis_admin());
drop policy if exists "team_delete" on public.asistencia_dias;
drop policy if exists "admin_delete" on public.asistencia_dias;
create policy "admin_delete" on public.asistencia_dias for delete to authenticated using (public.is_asis_admin());

-- ============================================================
--  CHECADOR (puncheo con foto) — marcajes + actividad
-- ============================================================

-- Cada puncheo individual (entrada / refaccion_salida / refaccion_regreso / salida) con su foto.
create table if not exists public.asistencia_marcajes (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  created_by_email text,
  empleado      text not null,
  fecha         date not null,
  tipo          text not null,          -- entrada | refaccion_salida | refaccion_regreso | salida
  hora          text not null,          -- HH:MM:SS local
  ts            timestamptz not null default now(),
  foto          text,                   -- JPEG en data URL (base64, reducido)
  nota          text
);
create index if not exists marcajes_fecha_idx on public.asistencia_marcajes (fecha desc);
create index if not exists marcajes_emp_idx on public.asistencia_marcajes (empleado);
create index if not exists marcajes_emp_fecha_idx on public.asistencia_marcajes (empleado, fecha);
alter table public.asistencia_marcajes enable row level security;
drop policy if exists "team_select" on public.asistencia_marcajes;
create policy "team_select" on public.asistencia_marcajes for select to authenticated using (true);
drop policy if exists "team_insert" on public.asistencia_marcajes;
create policy "team_insert" on public.asistencia_marcajes for insert to authenticated with check (auth.uid() = created_by);
drop policy if exists "team_update" on public.asistencia_marcajes;
drop policy if exists "admin_update" on public.asistencia_marcajes;
create policy "admin_update" on public.asistencia_marcajes for update to authenticated using (public.is_asis_admin()) with check (public.is_asis_admin());
drop policy if exists "team_delete" on public.asistencia_marcajes;
drop policy if exists "admin_delete" on public.asistencia_marcajes;
create policy "admin_delete" on public.asistencia_marcajes for delete to authenticated using (public.is_asis_admin());

-- Latido e inactividad por empleado y día (una fila por empleado/fecha).
create table if not exists public.asistencia_actividad (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  empleado        text not null,
  fecha           date not null,
  primer_latido   timestamptz,
  ultimo_latido   timestamptz,
  inactividad_min integer not null default 0,
  eventos         jsonb not null default '[]'::jsonb,   -- [{desde, hasta, min}]
  unique (empleado, fecha)
);
create index if not exists actividad_fecha_idx on public.asistencia_actividad (fecha desc);
alter table public.asistencia_actividad enable row level security;
drop policy if exists "team_select" on public.asistencia_actividad;
create policy "team_select" on public.asistencia_actividad for select to authenticated using (true);
drop policy if exists "team_insert" on public.asistencia_actividad;
create policy "team_insert" on public.asistencia_actividad for insert to authenticated with check (auth.uid() = created_by);
drop policy if exists "team_update" on public.asistencia_actividad;
drop policy if exists "own_update" on public.asistencia_actividad;
create policy "own_update" on public.asistencia_actividad for update to authenticated using (auth.uid() = created_by or public.is_asis_admin()) with check (auth.uid() = created_by or public.is_asis_admin());
drop policy if exists "team_delete" on public.asistencia_actividad;
drop policy if exists "admin_delete" on public.asistencia_actividad;
create policy "admin_delete" on public.asistencia_actividad for delete to authenticated using (public.is_asis_admin());
