-- Respaldo antes de corregir los números de motorista que CPS cambió (nov 2026).
create table if not exists public.temu_envios_respaldo_20261115 as select * from public.temu_envios;
create table if not exists public.temu_rutas_piloto_respaldo_20261115 as select * from public.temu_rutas_piloto;
create table if not exists public.temu_pilotos_respaldo_20261115 as select * from public.temu_pilotos;
alter table public.temu_envios_respaldo_20261115 enable row level security;
alter table public.temu_rutas_piloto_respaldo_20261115 enable row level security;
alter table public.temu_pilotos_respaldo_20261115 enable row level security;
