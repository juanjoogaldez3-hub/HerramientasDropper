-- ============================================================
-- Dropper · Temu — Vista "Hoy": actualizar desde CPS cada 5 minutos
--   • cada 5 min de 6:00 a. m. a 9:55 p. m. (Guatemala): solo el día de hoy
--   • cada hora (minuto 32): repasa los últimos 3 días
--   • cada noche 2:17 a. m.: repasa los últimos 8 días (ya existía)
--   • cada noche 3:41 a. m.: borra registros de actualizaciones y fotos de
--     pendientes de hace más de 14 días
-- Es seguro correrlo varias veces.
-- ============================================================
select cron.unschedule(jobname) from cron.job
where jobname in ('temu-sync-cada-hora', 'temu-sync-cada-5-min', 'temu-limpieza');

select cron.schedule('temu-sync-cada-5-min', '*/5 0-3,12-23 * * *', $$
  select net.http_post(
    url     := 'https://uroqcxlwdzkjmkrpjmxf.supabase.co/functions/v1/temu-sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-temu-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'temu_cron_secret')),
    body    := jsonb_build_object(
      'desde', to_char((now() at time zone 'America/Guatemala')::date, 'YYYY-MM-DD'),
      'hasta', to_char((now() at time zone 'America/Guatemala')::date, 'YYYY-MM-DD')),
    timeout_milliseconds := 30000);
$$);

select cron.schedule('temu-sync-cada-hora', '32 0-5,12-23 * * *', $$
  select net.http_post(
    url     := 'https://uroqcxlwdzkjmkrpjmxf.supabase.co/functions/v1/temu-sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-temu-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'temu_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000);
$$);

select cron.schedule('temu-limpieza', '41 9 * * *', $$
  delete from public.temu_sync_runs  where started_at < now() - interval '14 days';
  delete from public.temu_pendientes where corte_at   < now() - interval '14 days';
$$);
