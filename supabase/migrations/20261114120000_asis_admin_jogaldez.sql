-- Asistencia: Juanjo entra al sitio con jogaldez@droppergt.com; también es administrador
-- (aprobar, rechazar y quitar solicitudes; configuración).
create or replace function public.is_asis_admin()
 returns boolean
 language sql
 stable
as $function$
  select coalesce(lower(auth.jwt() ->> 'email') in ('juanjoogaldez3@gmail.com', 'jogaldez@droppergt.com'), false)
$function$;
