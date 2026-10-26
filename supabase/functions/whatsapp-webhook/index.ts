// ============================================================
// Dropper · WhatsApp — Webhook (bot de ventas con Claude)
// Recibe los mensajes de la WhatsApp Cloud API, responde con Claude
// siguiendo el flujo de ventas, guarda el historial y pasa el lead a
// humano cuando acepta la prueba, pide una persona, o pregunta algo
// que el bot no sabe.
//
// Es PÚBLICA (Meta la llama sin sesión). Verificamos la firma de Meta
// con el App Secret dentro de la función.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WA_TOKEN     = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const WA_PHONE_ID  = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET   = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const GRAPH_VER    = Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v21.0";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL        = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-5-5";

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const DEFAULT_PROMPT =
  "Sos el asistente de ventas de Dropper por WhatsApp (entregas a domicilio en Guatemala). " +
  "Respondé breve y cálido (de vos). Entendé qué vende el prospecto y conseguí que acepte una prueba. " +
  "Cuando acepte la prueba, pida una persona, o pregunte algo que no sabés, agregá como última línea: " +
  "[[HUMANO]] motivo: <motivo> | resumen: <qué vende y qué necesita>";

// ---------- WhatsApp ----------
async function sendWhatsApp(to: string, body: string) {
  const resp = await fetch(`https://graph.facebook.com/${GRAPH_VER}/${WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${WA_TOKEN}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
  });
  if (!resp.ok) console.error("WhatsApp send falló:", resp.status, await resp.text());
}

// ---------- Claude (API de Anthropic, HTTP directo) ----------
async function callClaude(system: string, messages: { role: string; content: string }[]): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2026-10-21",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages }),
  });
  if (!resp.ok) { console.error("Anthropic falló:", resp.status, await resp.text()); return ""; }
  const data = await resp.json();
  if (data.stop_reason === "refusal") return "";
  return (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("")
    .trim();
}

// Separa la respuesta al cliente del marcador de handoff.
function parseHandoff(raw: string): { reply: string; handoff: { motivo: string; resumen: string } | null } {
  const idx = raw.indexOf("[[HUMANO]]");
  if (idx === -1) return { reply: raw.trim(), handoff: null };
  const reply = raw.slice(0, idx).trim();
  const tail = raw.slice(idx + "[[HUMANO]]".length);
  const motivo = (tail.match(/motivo:\s*([^|]+)/i)?.[1] ?? "").trim();
  const resumen = (tail.match(/resumen:\s*(.+)/is)?.[1] ?? "").trim();
  return { reply, handoff: { motivo: motivo || "El bot pasó la conversación", resumen } };
}

// Historial de la BD -> formato de la API (roles alternados, sin encabezado vacío).
function buildMessages(hist: { direction: string; body: string | null }[]) {
  const out: { role: string; content: string }[] = [];
  for (const m of hist) {
    if (!m.body) continue;
    const role = m.direction === "in" ? "user" : "assistant";
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += "\n" + m.body;
    else out.push({ role, content: m.body });
  }
  while (out.length && out[0].role === "assistant") out.shift();
  return out;
}

// ---------- Firma de Meta (HMAC-SHA256 del cuerpo con el App Secret) ----------
async function verifySignature(raw: string, header: string | null): Promise<boolean> {
  if (!APP_SECRET) return true;           // sin App Secret configurado: no se verifica (ver guía)
  if (!header) return false;
  const expected = header.replace("sha256=", "");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// ---------- Procesa los mensajes entrantes (en segundo plano) ----------
async function handle(payload: any) {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const messages = value?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return;   // ignora recibos de estado, etc.
  const profileName = value?.contacts?.[0]?.profile?.name ?? null;

  const { data: cfg } = await sb.from("wa_config").select("system_prompt, bot_enabled").eq("id", 1).maybeSingle();
  const systemPrompt = cfg?.system_prompt || DEFAULT_PROMPT;
  const botEnabled = cfg?.bot_enabled !== false;

  for (const msg of messages) {
    const from: string = msg.from;
    const msgId: string = msg.id;
    const isText = msg.type === "text";
    const text = isText ? msg.text.body : `[${msg.type}]`;

    // Evitar duplicados (Meta reintrega a veces)
    const { data: dup } = await sb.from("wa_messages").select("id").eq("wa_message_id", msgId).maybeSingle();
    if (dup) continue;

    // Alta / actualización del contacto
    const now = new Date().toISOString();
    let { data: contact } = await sb.from("wa_contacts").select("*").eq("wa_id", from).maybeSingle();
    if (!contact) {
      const ins = await sb.from("wa_contacts")
        .insert({ wa_id: from, name: profileName, last_message_at: now, last_customer_message_at: now })
        .select("*").single();
      contact = ins.data;
    } else {
      await sb.from("wa_contacts")
        .update({ name: contact.name ?? profileName, last_message_at: now, last_customer_message_at: now })
        .eq("id", contact.id);
    }
    if (!contact) continue;

    // Guardar el mensaje entrante
    await sb.from("wa_messages").insert({
      contact_id: contact.id, wa_id: from, direction: "in", sender: "customer",
      body: text, wa_message_id: msgId,
    });

    // Si lo atiende un humano, o el bot está apagado, o no es texto: no responde el bot.
    if (contact.mode === "humano" || !botEnabled || !isText) continue;

    // Historial reciente -> Claude
    const { data: hist } = await sb.from("wa_messages")
      .select("direction, body").eq("contact_id", contact.id)
      .order("created_at", { ascending: true }).limit(30);
    const convo = buildMessages(hist ?? []);
    if (convo.length === 0) continue;

    const raw = await callClaude(systemPrompt, convo);
    if (!raw) continue;
    const { reply, handoff } = parseHandoff(raw);

    if (reply) {
      await sendWhatsApp(from, reply);
      await sb.from("wa_messages").insert({
        contact_id: contact.id, wa_id: from, direction: "out", sender: "bot", body: reply,
      });
      await sb.from("wa_contacts").update({ last_message_at: new Date().toISOString() }).eq("id", contact.id);
    }
    if (handoff) {
      await sb.from("wa_contacts").update({
        mode: "humano", handoff_reason: handoff.motivo, lead_summary: handoff.resumen || contact.lead_summary,
      }).eq("id", contact.id);
    }
  }
}

// ---------- Servidor ----------
Deno.serve(async (req) => {
  // Verificación del webhook (Meta llama con GET al configurarlo)
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("hub.mode") === "subscribe" &&
        url.searchParams.get("hub.verify_token") === VERIFY_TOKEN) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    const raw = await req.text();
    if (!(await verifySignature(raw, req.headers.get("x-hub-signature-256")))) {
      return new Response("invalid signature", { status: 401 });
    }
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
    // Responder 200 YA; procesar en segundo plano (WhatsApp espera respuesta rápida).
    EdgeRuntime.waitUntil(handle(payload).catch((e) => console.error("handle error:", e)));
    return new Response("ok", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
});
