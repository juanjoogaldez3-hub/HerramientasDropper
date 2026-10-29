-- ============================================================
-- Dropper · Temu — Un paquete puede aparecer en el reporte de dos pilotos
-- (por ejemplo, si CPS se lo reasigna a otro). El reporte de CPS lo cuenta
-- en cada piloto, así que la llave es (paquete, piloto).
-- ============================================================
alter table public.temu_envios drop constraint if exists temu_envios_pkey;
alter table public.temu_envios add constraint temu_envios_pkey primary key (id_envio_detalle, piloto_id);
