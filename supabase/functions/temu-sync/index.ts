// ============================================================
// Dropper · Temu — Sincronizador con CPS LastMile
// Entra a CPS con el usuario de Dropper (guardado como secreto),
// trae los envíos de cada piloto en un rango de fechas y los
// pendientes por ruta, y los guarda en las tablas temu_*.
//
// Quién puede llamarla:
//   • La página temu.html, con el JWT de un usuario del equipo.
//   • La tarea automática (pg_cron), con el header x-temu-cron = TEMU_CRON_SECRET.
//
// Cuerpo (opcional): { "desde": "2026-10-22", "hasta": "2026-10-28" }
//   Sin cuerpo: los últimos 3 días (hora de Guatemala).
//
// Responde enseguida con { run_id } y sigue trabajando en segundo plano;
// la página consulta temu_sync_runs para saber cuándo terminó.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { aFila, DAY, md5hex, esFecha, finUTC, hoyLocal, inicioUTC, sumarDias, type Piloto } from "./cps.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const CPS_API      = (Deno.env.get("CPS_API_URL") ?? "https://app.cpslogistics.com:8042/CpsLastMile").replace(/\/$/, "");
const CRON_SECRET  = Deno.env.get("TEMU_CRON_SECRET") ?? "";

const MAX_DIAS     = 31;          // rango máximo por corrida
const CONCURRENCIA = 4;           // pilotos consultados a la vez
const TIMEOUT_MS   = 120_000;     // CPS a veces tarda bastante

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-temu-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// ---------- CPS ----------
async function cps(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${CPS_API}${path}`, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`CPS ${path} respondió ${r.status}`);
    try { return JSON.parse(text); } catch { throw new Error(`CPS ${path} no devolvió JSON`); }
  } finally {
    clearTimeout(timer);
  }
}

async function loginCps(): Promise<{ token: string; idEmpresa: number | null }> {
  // Se leen en cada corrida para tomar enseguida un secreto recién cambiado.
  const CPS_USER = (Deno.env.get("CPS_USERNAME") ?? "").trim();
  const CPS_PASS = Deno.env.get("CPS_PASSWORD") ?? "";
  const faltan = [!CPS_USER && "CPS_USERNAME", !CPS_PASS && "CPS_PASSWORD"].filter(Boolean);
  if (faltan.length) throw new Error("Falta el secreto " + faltan.join(" y ") + " en Supabase (Edge Functions → Secrets)");
  const r = await cps("/authenticate", { body: { username: CPS_USER, password: md5hex(CPS_PASS) } });
  const token = r?.DATA?.TOKEN;
  if (r?.MSM !== "OK" || !token) throw new Error("CPS no aceptó el usuario o la contraseña");
  return { token, idEmpresa: r?.DATA?.EMPRESA?.ID_EMPRESA ?? null };
}

async function pilotosCps(token: string): Promise<Piloto[]> {
  const r = await cps("/Reports/getPilotosEmpresa", { token });
  const list: any[] = Array.isArray(r?.DATA) ? r.DATA : [];
  return list
    .filter((p) => typeof p?.ID_USUARIO === "number")
    .map((p) => ({
      id: p.ID_USUARIO,
      nombre: [p.PRIMER_NOMBRE, p.PRIMER_APELLIDO].filter(Boolean).join(" ").trim() || p.USERNAME || `Piloto ${p.ID_USUARIO}`,
    }));
}

async function enviosPiloto(token: string, piloto: Piloto, desde: string, hasta: string) {
  const r = await cps("/Reports/getInfoPilotPagosEnvioByDates", {
    token,
    body: { FECHA_INICIO: inicioUTC(desde), FECHA_FIN: finUTC(hasta), ID_USUARIO: piloto.id },
  });
  if (r?.STATUS !== undefined && r?.MSM && r.MSM !== "OK") throw new Error(`CPS: ${r.MSM}`);
  const data: any[] = Array.isArray(r?.DATA) ? r.DATA : [];
  return data.map((x) => aFila(x, piloto)).filter((f): f is NonNullable<ReturnType<typeof aFila>> => f !== null);
}

async function pendientesCps(token: string, idEmpresa: number) {
  const r = await cps("/Graphics/ResumenPendientesTemuProveedor", { token, body: { ID_EMPRESA: idEmpresa } });
  const list: any[] = Array.isArray(r) ? r : Array.isArray(r?.DATA) ? r.DATA : [];
  return list.map((p) => ({
    ruta: String(p?.RUTA_FINAL ?? "Sin ruta"),
    recepcion: Number(p?.ESTADO_11) || 0,
    activo: Number(p?.ESTADO_1) || 0,
  }));
}

// ---------- Corrida completa ----------
async function sincronizar(runId: string, desde: string, hasta: string) {
  const detalle: { piloto: string; envios: number; error?: string }[] = [];
  let total = 0;
  try {
    const { token, idEmpresa } = await loginCps();
    const pilotos = await pilotosCps(token);

    // Pilotos nuevos se agregan como "Fijo"; el tipo (Fijo/Apoyo) lo maneja el equipo y no se toca.
    if (pilotos.length) {
      const { error } = await admin.from("temu_pilotos")
        .upsert(pilotos.map((p) => ({ piloto_id: p.id, nombre: p.nombre })), { onConflict: "piloto_id", ignoreDuplicates: true });
      if (error) throw new Error("No se pudieron guardar los pilotos: " + error.message);
    }

    // Envíos, varios pilotos a la vez
    const cola = [...pilotos];
    const trabajador = async () => {
      while (cola.length) {
        const p = cola.shift()!;
        try {
          const filas = await enviosPiloto(token, p, desde, hasta);
          for (let i = 0; i < filas.length; i += 500) {
            const { error } = await admin.from("temu_envios").upsert(filas.slice(i, i + 500), { onConflict: "id_envio_detalle,piloto_id" });
            if (error) throw new Error(error.message);
          }
          total += filas.length;
          // El nombre que usa CPS en los envíos es el que se muestra en el tablero.
          if (filas.length && filas[0].piloto) {
            await admin.from("temu_pilotos").update({ nombre: filas[0].piloto }).eq("piloto_id", p.id);
          }
          detalle.push({ piloto: p.nombre, envios: filas.length });
        } catch (e) {
          detalle.push({ piloto: p.nombre, envios: 0, error: e instanceof Error ? e.message : String(e) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, pilotos.length) }, trabajador));

    // Pendientes por ruta (una foto)
    let errorPend: string | null = null;
    if (idEmpresa !== null) {
      try {
        const pend = await pendientesCps(token, idEmpresa);
        const corte = new Date().toISOString();
        if (pend.length) {
          const { error } = await admin.from("temu_pendientes").insert(pend.map((p) => ({ ...p, corte_at: corte })));
          if (error) throw new Error(error.message);
        }
      } catch (e) {
        errorPend = "Pendientes: " + (e instanceof Error ? e.message : String(e));
      }
    }

    const fallas = detalle.filter((d) => d.error).length;
    await admin.from("temu_sync_runs").update({
      finished_at: new Date().toISOString(),
      ok: fallas === 0 && !errorPend,
      pilotos: pilotos.length,
      envios: total,
      detalle,
      error: [fallas ? `${fallas} piloto(s) no se pudieron traer` : null, errorPend].filter(Boolean).join(" · ") || null,
    }).eq("id", runId);
  } catch (e) {
    await admin.from("temu_sync_runs").update({
      finished_at: new Date().toISOString(),
      ok: false,
      envios: total,
      detalle,
      error: e instanceof Error ? e.message : String(e),
    }).eq("id", runId);
  }
}

// ---------- HTTP ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // 1) ¿Quién llama?
  let origen = "boton";
  let pedidoPor: string | null = null;
  const cron = req.headers.get("x-temu-cron") ?? "";
  let esCron = false;
  if (cron) {
    if (CRON_SECRET && cron === CRON_SECRET) esCron = true;
    else {
      // La clave de la tarea automática vive en el cofre de Supabase (ver migración temu_cron).
      const { data } = await admin.rpc("temu_cron_ok", { p: cron });
      esCron = data === true;
    }
    if (!esCron) return json({ error: "no_autorizado" }, 401);
  }
  if (esCron) {
    origen = "automatico";
  } else {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data?.user) return json({ error: "no_autorizado" }, 401);
    pedidoPor = data.user.email ?? null;
  }

  // 2) Rango de fechas
  let body: { desde?: unknown; hasta?: unknown } = {};
  try { body = await req.json(); } catch { /* sin cuerpo: usar el rango por defecto */ }
  const hoy = hoyLocal();
  const hasta = esFecha(body.hasta) ? body.hasta : hoy;
  const desde = esFecha(body.desde) ? body.desde : sumarDias(hasta, -2);
  if (desde > hasta) return json({ error: "rango_invalido", detalle: "'desde' es después de 'hasta'" }, 400);
  if (Date.parse(hasta) - Date.parse(desde) > (MAX_DIAS - 1) * DAY) {
    return json({ error: "rango_muy_largo", detalle: `Máximo ${MAX_DIAS} días por corrida` }, 400);
  }

  // 3) No correr dos a la vez
  const hace10 = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: corriendo } = await admin.from("temu_sync_runs")
    .select("id").is("finished_at", null).gte("started_at", hace10).limit(1);
  if (corriendo && corriendo.length) return json({ ok: true, run_id: corriendo[0].id, ya_corriendo: true });

  // 4) Registrar y arrancar en segundo plano
  const { data: run, error: runErr } = await admin.from("temu_sync_runs")
    .insert({ origen, pedido_por: pedidoPor, desde, hasta }).select("id").single();
  if (runErr || !run) return json({ error: "no_se_pudo_registrar", detalle: runErr?.message }, 500);

  const tarea = sincronizar(run.id, desde, hasta);
  // @ts-ignore EdgeRuntime existe en Supabase Edge Functions
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(tarea);
  else await tarea;

  return json({ ok: true, run_id: run.id, desde, hasta });
});
