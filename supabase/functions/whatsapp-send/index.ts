// ============================================================
// Dropper · WhatsApp — Envío desde la bandeja (ruta autenticada)
// La bandeja llama aquí con el JWT del usuario. Verificamos que sea un
// usuario del equipo, mandamos el mensaje por WhatsApp (el token vive
// solo en el servidor) y guardamos el mensaje saliente.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const WA_TOKEN     = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const WA_PHONE_ID  = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const GRAPH_VER    = Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v21.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "content-type": "application/json" },
  });
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // 1) Verificar el JWT del usuario (debe ser del equipo).
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userErr || !user) return json({ error: "no_autorizado" }, 401);

  // 2) Leer el cuerpo.
  let payload: { contact_id?: string; text?: string };
  try { payload = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const contactId = (payload.contact_id ?? "").trim();
  const text = (payload.text ?? "").trim();
  if (!contactId || !text) return json({ error: "faltan_datos" }, 400);

  // 3) Buscar el contacto (service role).
  const { data: contact, error: cErr } = await admin.from("wa_contacts").select("*").eq("id", contactId).maybeSingle();
  if (cErr || !contact) return json({ error: "contacto_no_encontrado" }, 404);

  // 4) Enviar por WhatsApp.
  const resp = await fetch(`https://graph.facebook.com/${GRAPH_VER}/${WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${WA_TOKEN}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to: contact.wa_id, type: "text", text: { body: text } }),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    console.error("WhatsApp send falló:", resp.status, detail);
    return json({ error: "whatsapp_falló", status: resp.status, detail }, 502);
  }
  const waData = await resp.json().catch(() => ({}));
  const waMsgId = waData?.messages?.[0]?.id ?? null;

  // 5) Guardar el mensaje saliente + marcar que lo atiende esta persona.
  const now = new Date().toISOString();
  await admin.from("wa_messages").insert({
    contact_id: contact.id, wa_id: contact.wa_id, direction: "out", sender: "agent",
    body: text, agent_email: user.email ?? null, wa_message_id: waMsgId,
  });
  await admin.from("wa_contacts").update({
    mode: "humano", assigned_to: user.email ?? null, last_message_at: now,
  }).eq("id", contact.id);

  return json({ ok: true });
});
