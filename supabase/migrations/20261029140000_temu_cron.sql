-- ============================================================
-- Dropper · Temu — Actualización automática desde CPS
-- Dos tareas (pg_cron) que llaman a la función temu-sync:
--   • cada hora de 6 a. m. a 11 p. m. (Guatemala): últimos 3 días
--   • cada noche a las 2:17 a. m.: repasa los últimos 8 días
-- La clave que usan las tareas se genera sola y vive en el cofre (vault);
-- la función la valida con temu_cron_ok(), así nadie tiene que copiarla a mano.
-- Es seguro correrlo varias veces.
-- ============================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Clave aleatoria para la tarea automática (solo se crea si no existe)
select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'temu_cron_secret')
where not exists (select 1 from vault.secrets where name = 'temu_cron_secret');

-- La función temu-sync pregunta aquí si la clave que recibió es la buena.
create or replace function public.temu_cron_ok(p text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'temu_cron_secret' and decrypted_secret = p);
$$;
revoke all on function public.temu_cron_ok(text) from public, anon, authenticated;
grant execute on function public.temu_cron_ok(text) to service_role;

-- Quitar versiones anteriores de las tareas
select cron.unschedule(jobname) from cron.job where jobname in ('temu-sync-cada-hora', 'temu-sync-noche');

select cron.schedule('temu-sync-cada-hora', '7 0-5,12-23 * * *', $$
  select net.http_post(
    url     := 'https://uroqcxlwdzkjmkrpjmxf.supabase.co/functions/v1/temu-sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-temu-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'temu_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000);
$$);

select cron.schedule('temu-sync-noche', '17 8 * * *', $$
  select net.http_post(
    url     := 'https://uroqcxlwdzkjmkrpjmxf.supabase.co/functions/v1/temu-sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-temu-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'temu_cron_secret')),
    body    := jsonb_build_object(
      'desde', to_char((now() at time zone 'America/Guatemala')::date - 7, 'YYYY-MM-DD'),
      'hasta', to_char((now() at time zone 'America/Guatemala')::date,     'YYYY-MM-DD')),
    timeout_milliseconds := 30000);
$$);
