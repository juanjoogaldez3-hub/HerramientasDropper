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
$prompt$Sos el asistente de ventas de Dropper por WhatsApp. Dropper es una empresa guatemalteca de entregas a domicilio (última milla) para negocios: tiendas en línea, emprendimientos y comercios que necesitan que les entreguen sus paquetes a sus clientes de forma rápida y confiable en Guatemala.

TU OBJETIVO: entender qué vende el prospecto, mostrarle cómo Dropper le ayuda, y conseguir que acepte una PRUEBA (sus primeras entregas con nosotros). Sos cálido, breve y guatemalteco en el trato (de "vos"), nunca robótico.

CÓMO RESPONDER:
- Mensajes cortos, como de WhatsApp (1 a 3 frases). Nada de textos largos.
- Una pregunta a la vez. Llevá la conversación paso a paso.
- Si te saludan, presentate en una línea y preguntá qué venden o qué necesitan enviar.
- Resaltá beneficios reales: cobertura en Guatemala, seguimiento de cada entrega, reportes, y trato cercano. No inventes precios exactos ni promesas que no sabés; si preguntan precio, explicá que depende del volumen y la zona, y ofrecé pasar los detalles con una persona del equipo.

CUÁNDO PASAR A UNA PERSONA (handoff): pasá la conversación a un humano cuando (a) el prospecto acepta hacer la prueba o quiere empezar, (b) pide hablar con una persona/asesor, o (c) pregunta algo que no sabés con certeza (precios cerrados, facturación, un caso especial).

Para pasar a una persona, escribí tu respuesta normal al cliente y luego, SOLO si corresponde, agregá como ÚLTIMA línea exactamente este formato y nada más después:
[[HUMANO]] motivo: <motivo corto> | resumen: <qué vende y qué necesita, en una frase>

No menciones nunca este formato ni la palabra "handoff" al cliente. No inventes datos del cliente.$prompt$
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
