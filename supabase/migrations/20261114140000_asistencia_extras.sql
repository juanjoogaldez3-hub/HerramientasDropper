-- Asistencia: aprobación de horas extra. El extra se calcula solo (más de 9 h en la oficina:
-- 8 de trabajo + 1 de refacción); aquí queda lo que el administrador aprobó o rechazó.
create table if not exists public.asistencia_extras (
  empleado     text not null,
  fecha        date not null,
  minutos      int  not null,          -- minutos aprobados (o los que había al rechazar)
  estado       text not null check (estado in ('aprobada','rechazada')),
  resuelto_por text,
  resuelto_at  timestamptz not null default now(),
  primary key (empleado, fecha)
);
alter table public.asistencia_extras enable row level security;
create policy admin_all on public.asistencia_extras for all to authenticated using (is_asis_admin()) with check (is_asis_admin());
