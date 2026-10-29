-- ============================================================
-- Dropper · Temu — Tarea automática (actualizar desde CPS sola)
-- Se pega UNA vez en Supabase → SQL Editor, DESPUÉS de desplegar
-- la función temu-sync y cargar sus secretos (ver TEMU_SETUP.md).
--
-- Antes de correrlo, reemplazá  PEGAR_AQUI_EL_TEMU_CRON_SECRET
-- por el mismo valor que pusiste en el secreto TEMU_CRON_SECRET.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guardar el secreto en el cofre de Supabase (no queda en texto plano en las tareas)
select vault.create_secret('PEGAR_AQUI_EL_TEMU_CRON_SECRET', 'temu_cron_secret')
where not exists (select 1 from vault.secrets where name = 'temu_cron_secret');

-- Quitar versiones anteriores de estas tareas (si se vuelve a correr este archivo)
select cron.unschedule(jobname) from cron.job where jobname in ('temu-sync-cada-hora', 'temu-sync-noche');

-- 1) Cada hora, de 6 a. m. a 11 p. m. (Guatemala = UTC−6): trae los últimos 3 días.
select cron.schedule('temu-sync-cada-hora', '7 0-5,12-23 * * *', $$
  select net.http_post(
    url     := 'https://uroqcxlwdzkjmkrpjmxf.supabase.co/functions/v1/temu-sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-temu-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'temu_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000);
$$);

-- 2) Cada noche a las 2:17 a. m. (Guatemala): repasa los últimos 8 días,
--    por si CPS cambió algún estado (un rechazo que se entregó después, etc.).
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

-- Para ver que quedaron:   select jobname, schedule from cron.job;
-- Para apagarlas:          select cron.unschedule('temu-sync-cada-hora'); select cron.unschedule('temu-sync-noche');
