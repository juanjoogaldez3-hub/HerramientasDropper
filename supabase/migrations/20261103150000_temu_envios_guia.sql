-- Dropper · Temu — guía (IDENTIFICADOR_DETALLE / WRHS) y a quién se le factura,
-- para el reporte de cobro a CPS.
alter table public.temu_envios add column if not exists guia text;
alter table public.temu_envios add column if not exists billing_name text;
