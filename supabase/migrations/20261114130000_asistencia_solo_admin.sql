-- Asistencia es solo para el administrador (Juanjo).
-- Los demás siguen pudiendo marcar y crear solicitudes desde Marcaje, y ven solo lo suyo.
-- empleados_oficina y asistencia_config siguen legibles: Marcaje los necesita (lista de empleados, ubicación de la oficina).
drop policy if exists team_select on public.asistencia_marcajes;
create policy own_or_admin_select on public.asistencia_marcajes for select to authenticated using (is_asis_admin() or auth.uid() = created_by);
drop policy if exists team_select on public.asistencia_actividad;
create policy own_or_admin_select on public.asistencia_actividad for select to authenticated using (is_asis_admin() or auth.uid() = created_by);
drop policy if exists team_select on public.solicitudes;
create policy own_or_admin_select on public.solicitudes for select to authenticated using (is_asis_admin() or auth.uid() = created_by);
drop policy if exists team_select on public.asistencia_dias;
create policy admin_select on public.asistencia_dias for select to authenticated using (is_asis_admin());
