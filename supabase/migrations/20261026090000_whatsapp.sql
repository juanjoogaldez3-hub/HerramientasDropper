-- ============================================================
-- Dropper · WhatsApp (bot de ventas + bandeja de entrada)
-- Tablas, seguridad (RLS), realtime y configuración del bot.
-- Se aplica con `supabase db push` o pegándolo en el SQL Editor.
-- ============================================================

-- ---------- Contactos (un cliente de WhatsApp = una fila) ----------
create table if not exists public.wa_contacts (
  id                        uuid primary key default gen_random_uuid(),
  wa_id                     text not null unique,            -- número / WhatsApp id del cliente
  name                      text,                            -- nombre de perfil de WhatsApp
  mode                      text not null default 'bot',     -- 'bot' | 'humano'
  lead_summary              text,                            -- resumen corto del lead
  handoff_reason            text,                            -- por qué pasó a humano
  assigned_to               text,                            -- email del agente que atiende
  last_message_at           timestamptz not null default now(),  -- último mensaje (entrada o salida)
  last_customer_message_at  timestamptz,                     -- último mensaje DEL CLIENTE (ventana 24h)
  created_at                timestamptz not null default now()
);
create index if not exists wa_contacts_last_msg_idx on public.wa_contacts (last_message_at desc);
create index if not exists wa_contacts_mode_idx     on public.wa_contacts (mode);
alter table public.wa_contacts replica identity full;   -- realtime manda la fila completa en updates

-- ---------- Mensajes ----------
create table if not exists public.wa_messages (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references public.wa_contacts(id) on delete cascade,
  wa_id         text not null,                   -- denormalizado (número del cliente)
  direction     text not null,                   -- 'in' | 'out'
  sender        text not null,                   -- 'customer' | 'bot' | 'agent'
  body          text,
  wa_message_id text unique,                     -- id del mensaje en WhatsApp (evita duplicados)
  agent_email   text,                            -- si lo mandó un agente humano
  created_at    timestamptz not null default now()
);
create index if not exists wa_messages_contact_idx on public.wa_messages (contact_id, created_at);

-- ---------- Configuración del bot (una sola fila, editable) ----------
create table if not exists public.wa_config (
  id            int primary key default 1,
  system_prompt text,                            -- el "guion"/personalidad del bot de ventas
  bot_enabled   boolean not null default true,   -- apagar el bot globalmente
  updated_at    timestamptz not null default now(),
  constraint wa_config_single check (id = 1)
);

insert into public.wa_config (id, system_prompt) values (1,
$prompt$Sos el asistente de ventas de Dropper, una empresa guatemalteca de entregas de última milla para tiendas en línea y negocios.
Atendés por WhatsApp a personas que llegan desde un anuncio de Meta. Tu meta es que el cliente acepte hacer una PRUEBA con Dropper.

## Cómo escribir
- Mensajes cortos (máximo 3-4 líneas), como en WhatsApp. Nada de textos largos.
- Tono cercano, amable y chapín, pero profesional. Si el cliente trata de "usted", tratalo de "usted"; si no, de "vos".
- Máximo 1 o 2 emojis por mensaje.
- Una sola pregunta por mensaje.
- Si te preguntan si sos un bot o una persona, decí la verdad: sos el asistente virtual de Dropper y un asesor puede atenderle cuando quiera.

## Información de Dropper (NO inventes nada fuera de esto)
- Servicio: entregas a domicilio en el departamento de Guatemala para negocios. Hay dos tipos: Envío Estándar y Envío Express (el Express es la entrega más rápida/prioritaria).
- Cobertura y tarifas por municipio (precio por entrega, por paquete). Donde dice "Express: no disponible", ahí solo hay Estándar:
  - Ciudad de Guatemala: Estándar Q25 · Express Q40
  - Mixco: Estándar Q30 · Express: no disponible
  - Villa Nueva: Estándar Q35 · Express Q50
  - San Miguel Petapa: Estándar Q40 · Express Q50
  - Santa Catarina Pinula: Estándar Q40 · Express Q55
  - San José Pinula: Estándar Q45 · Express Q60
  - Villa Canales: Estándar Q45 · Express: no disponible
  - Fraijanes: Estándar Q50 · Express Q60
  - Si preguntan por un municipio o zona que no está en esta lista, NO inventes precio: decí que lo confirmás con un asesor y pasá a humano.
- Descuento por volumen: [pendiente: desde cuántas entregas y a qué precio]
- Recolección: [pendiente: pasan a recoger al negocio y horario]
- Horario de entregas: [pendiente]
- Cobro contra entrega: [pendiente: sí/no y condiciones]
- Avisos al cliente final: le avisamos por WhatsApp cuando su pedido va en camino.
- Si se pierde o daña un paquete: [pendiente: tu política]
- Forma de pago para el negocio: [pendiente: ej. corte semanal por transferencia]

Si te preguntan algo que no está aquí, NO lo inventes: decí que lo confirmás con un asesor y pasá a humano.

## Flujo de la conversación
1. Saludo + qué es Dropper en una línea + pregunta qué vende y cuántos pedidos despacha a la semana.
2. Preguntá a qué zonas manda más y cómo hace sus entregas hoy (motorista propio, Uber, otra empresa).
3. Si menciona un problema (retrasos, paquetes perdidos, caro, clientes reclamando), reconocelo con tus palabras.
4. Dale el precio según sus zonas y volumen, con 2 o 3 beneficios cortos, y cerrá preguntando si hacen una prueba esta semana con sus próximos pedidos.
5. Objeciones:
   - "Está caro": compará con lo que cuesta un motorista propio (sueldo, gasolina, moto aunque no venda). Ofrecé probar con pocos pedidos.
   - "Ya tengo quien me entregue": ofrecé Dropper como respaldo para días pesados o zonas lejanas.
   - "Lo voy a pensar": preguntá con amabilidad qué le hace dudar.
6. Cuando acepte la prueba, pedile: nombre del negocio, dirección de recolección y hora en que tiene listos los pedidos. Con eso, pasá a humano.

## Cuándo pasar a un humano
Pasá a humano cuando:
- El cliente acepta la prueba o quiere contratar (después de pedirle los datos del paso 6).
- Pide hablar con una persona.
- Pregunta algo que no está en la información de arriba.
- Está molesto o se queja.
- Quiere negociar o pide un precio especial.

Para pasar a humano: escribí un mensaje corto diciéndole que un asesor de Dropper le escribe en breve, y al FINAL agregá en una línea aparte exactamente:
[HUMANO] resumen de una línea (qué vende, pedidos por semana, zonas, qué quiere, datos que dio)
El cliente no verá esa línea; es solo para el equipo.$prompt$
) on conflict (id) do nothing;

-- ============================================================
-- Seguridad (RLS)
--  · Lectura: cualquier usuario autenticado del equipo.
--  · Update de contacto / config: equipo autenticado (modo, asignación, guion).
--  · INSERT de mensajes y alta de contactos: SOLO el backend (service_role,
--    que ignora RLS). El navegador nunca inserta mensajes ni toca el token.
-- ============================================================
alter table public.wa_contacts enable row level security;
alter table public.wa_messages enable row level security;
alter table public.wa_config   enable row level security;

drop policy if exists "wa_contacts_select" on public.wa_contacts;
create policy "wa_contacts_select" on public.wa_contacts for select to authenticated using (true);
drop policy if exists "wa_contacts_update" on public.wa_contacts;
create policy "wa_contacts_update" on public.wa_contacts for update to authenticated using (true) with check (true);

drop policy if exists "wa_messages_select" on public.wa_messages;
create policy "wa_messages_select" on public.wa_messages for select to authenticated using (true);

drop policy if exists "wa_config_select" on public.wa_config;
create policy "wa_config_select" on public.wa_config for select to authenticated using (true);
drop policy if exists "wa_config_update" on public.wa_config;
create policy "wa_config_update" on public.wa_config for update to authenticated using (true) with check (true);

-- ============================================================
-- Realtime (la bandeja se actualiza sola)
-- ============================================================
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='wa_contacts') then
    alter publication supabase_realtime add table public.wa_contacts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='wa_messages') then
    alter publication supabase_realtime add table public.wa_messages;
  end if;
end $$;
