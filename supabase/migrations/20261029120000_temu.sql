-- ============================================================
-- Dropper · Temu (tablero de entregas que vienen de CPS LastMile)
-- Tablas, vistas de resumen y seguridad (RLS).
-- Se aplica con `supabase db push` o pegándolo en el SQL Editor.
-- Es seguro correrlo varias veces.
--
-- Los datos los escribe SOLO la función `temu-sync` (service role).
-- El equipo (usuarios autenticados) puede leer todo y editar
-- las tarifas (temu_config) y el tipo de cada piloto (Fijo/Apoyo).
-- ============================================================

-- ---------- Envíos (un paquete = una fila) ----------
-- Guardamos solo lo necesario para el tablero: nada de direcciones,
-- teléfonos ni nombres de quien recibe.
create table if not exists public.temu_envios (
  id_envio_detalle  bigint not null,               -- ID_ENVIO_DETALLE de CPS (un paquete)
  id_envio          bigint,                         -- ID_ENVIO de CPS
  correlativo       text,                           -- p. ej. ENV26/0709070
  piloto_id         bigint not null,                -- ID_USUARIO del piloto en CPS
  piloto            text not null,                  -- nombre como lo muestra CPS
  fecha             date not null,                  -- día (hora de Guatemala) del último registro
  registrado_at     timestamptz not null,           -- FECHA_REGISTRO de CPS
  estado            text not null check (estado in ('entregado','rechazo','otro')),
  id_estado         int,                            -- ID_ESTADO crudo de CPS
  motivo            text,                           -- motivo del último rechazo, si hubo
  tamano            text,                           -- CODIGO_SIZE (S, M, L…)
  costo_envio       numeric(10,2),                  -- COSTO_ENVIO de CPS
  ganancia_cps      numeric(10,2),                  -- GANANCIA_PILOTO según CPS
  synced_at         timestamptz not null default now()
);
create index if not exists temu_envios_fecha_idx  on public.temu_envios (fecha);
create index if not exists temu_envios_piloto_idx on public.temu_envios (piloto_id, fecha);

-- ---------- Pilotos ----------
-- `tipo` lo define el equipo desde la página (Fijo / Apoyo).
create table if not exists public.temu_pilotos (
  piloto_id   bigint primary key,
  nombre      text not null,
  tipo        text not null default 'Fijo' check (tipo in ('Fijo','Apoyo')),
  updated_at  timestamptz not null default now()
);

-- ---------- Pendientes por ruta (una foto por sincronización) ----------
create table if not exists public.temu_pendientes (
  id         uuid primary key default gen_random_uuid(),
  corte_at   timestamptz not null,
  ruta       text not null,
  recepcion  int not null default 0,   -- ESTADO_11: en centro de recepción
  activo     int not null default 0    -- ESTADO_1: activo en centro
);
create index if not exists temu_pendientes_corte_idx on public.temu_pendientes (corte_at desc);

-- ---------- Registro de sincronizaciones ----------
create table if not exists public.temu_sync_runs (
  id           uuid primary key default gen_random_uuid(),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  origen       text,                  -- 'boton' | 'automatico'
  pedido_por   text,                  -- email de quien lo pidió (si fue el botón)
  desde        date,
  hasta        date,
  pilotos      int,
  envios       int,
  detalle      jsonb not null default '[]'::jsonb,  -- por piloto: {piloto, envios, error?}
  error        text
);
create index if not exists temu_sync_runs_started_idx on public.temu_sync_runs (started_at desc);

-- ---------- Tarifas y metas (una sola fila, editable) ----------
create table if not exists public.temu_config (
  id               int primary key default 1,
  tarifa           numeric(10,2) not null default 9.50,  -- lo que se factura por entrega (IVA incluido)
  pago_motorista   numeric(10,2) not null default 5.00,  -- lo que se le paga al motorista por entrega
  iva              numeric(5,4)  not null default 0.12,
  isr_tasa         numeric(5,4)  not null default 0.07,  -- ISR que se aplica al período (siempre pasan de Q30,000 al mes)
  isr_limite_mes   numeric(12,2) not null default 30000, -- para la proyección del mes
  isr_bajo         numeric(5,4)  not null default 0.05,
  isr_alto         numeric(5,4)  not null default 0.07,
  meta_diaria      int           not null default 500,
  meta_motorista   int           not null default 50,
  dias_mes         int           not null default 26,
  updated_at       timestamptz   not null default now(),
  updated_by       text,
  constraint temu_config_single check (id = 1)
);
insert into public.temu_config (id) values (1) on conflict (id) do nothing;

-- ---------- Vistas de resumen (las usa la página) ----------
-- security_invoker: respetan los permisos de quien consulta.
create or replace view public.temu_dia_piloto
with (security_invoker = true) as
select
  e.fecha,
  e.piloto_id,
  coalesce(p.nombre, max(e.piloto)) as piloto,
  coalesce(p.tipo, 'Fijo')          as tipo,
  count(*) filter (where e.estado = 'entregado') as entregados,
  count(*) filter (where e.estado = 'rechazo')   as rechazos,
  count(*) filter (where e.estado = 'otro')      as otros
from public.temu_envios e
left join public.temu_pilotos p on p.piloto_id = e.piloto_id
group by e.fecha, e.piloto_id, p.nombre, p.tipo;

create or replace view public.temu_motivos_dia
with (security_invoker = true) as
select
  e.fecha,
  e.piloto_id,
  coalesce(e.motivo, 'SIN MOTIVO') as motivo,
  count(*) as cantidad
from public.temu_envios e
where e.estado = 'rechazo'
group by e.fecha, e.piloto_id, coalesce(e.motivo, 'SIN MOTIVO');

-- ------------------------------------------------------------
-- Seguridad (RLS)
-- ------------------------------------------------------------
alter table public.temu_envios     enable row level security;
alter table public.temu_pilotos    enable row level security;
alter table public.temu_pendientes enable row level security;
alter table public.temu_sync_runs  enable row level security;
alter table public.temu_config     enable row level security;

-- Lectura para todo el equipo
drop policy if exists "team_select" on public.temu_envios;
create policy "team_select" on public.temu_envios     for select to authenticated using (true);
drop policy if exists "team_select" on public.temu_pilotos;
create policy "team_select" on public.temu_pilotos    for select to authenticated using (true);
drop policy if exists "team_select" on public.temu_pendientes;
create policy "team_select" on public.temu_pendientes for select to authenticated using (true);
drop policy if exists "team_select" on public.temu_sync_runs;
create policy "team_select" on public.temu_sync_runs  for select to authenticated using (true);
drop policy if exists "team_select" on public.temu_config;
create policy "team_select" on public.temu_config     for select to authenticated using (true);

-- El equipo puede cambiar tarifas/metas y el tipo de cada piloto
drop policy if exists "team_update" on public.temu_config;
create policy "team_update" on public.temu_config  for update to authenticated using (true) with check (id = 1);
drop policy if exists "team_update" on public.temu_pilotos;
create policy "team_update" on public.temu_pilotos for update to authenticated using (true) with check (true);

-- Solo se puede cambiar el tipo del piloto (el nombre lo pone la sincronización)
revoke update on public.temu_pilotos from authenticated;
grant  update (tipo, updated_at) on public.temu_pilotos to authenticated;

grant select on public.temu_dia_piloto  to authenticated;
grant select on public.temu_motivos_dia to authenticated;
