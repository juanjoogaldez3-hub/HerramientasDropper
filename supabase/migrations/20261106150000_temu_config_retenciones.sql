-- Dropper · Temu — Retenciones que hace CPX al pagar la factura (agente retenedor).
-- Factura de octubre 2026: Q13,233.50 → depósito Q12,430.04 = − 5% ISR de la base − 15% del IVA.
alter table public.temu_config add column if not exists ret_isr numeric not null default 0.05;  -- % de la base sin IVA
alter table public.temu_config add column if not exists ret_iva numeric not null default 0.15;  -- % del IVA de la factura
