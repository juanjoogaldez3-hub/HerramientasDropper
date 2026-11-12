// ============================================================
// Dropper · Temu — "Mover en ruta" desde el tablero
// Solo para usuarios del equipo (JWT de Supabase).
//
//   { "accion": "destinos" }
//       → rutas y motoristas de Dropper en CPS.
//   { "accion": "listar", "piloto_id": 599 }
//       → paquetes de HOY que ese motorista lleva EN CAMINO, por ruta,
//         con su guía (WRHS) y si CPS deja moverlo.
//   { "accion": "buscar", "guia": "94647158" }
//       → dónde está ese paquete ahorita en CPS (ruta, motorista, estado) y si
//         está en lo que viene mañana. Solo lectura; sin datos de quien recibe.
//   { "accion": "paquetes", "piloto_id": 599 }  ó  { "accion": "paquetes", "ruta": "DP 7 MIXCO" }
//       → paquetes de HOY de ese motorista o de esa ruta (en una ruta, también los que
//         siguen en bodega), con guía, envío, estado,
//         dirección y zona (y si la zona no es la de la ruta). Solo lectura; la
//         dirección se lee de CPS en el momento y no se guarda.
//   { "accion": "paquetes", "ruta": "DP 7 MIXCO", "manana": true }
//       → solo los de esa ruta que llegan mañana (centro de recepción de CPS).
//   { "accion": "mover", "wrhs": ["9466..."], "piloto_destino_id": 607,
//     "ruta_destino_id": 338 | null, "motivo": "..." }
//       → mueve cada paquete (uno por uno, como la página de CPS).
//         Antes de mover vuelve a consultar el paquete: si ya no está en
//         camino o CPS no deja moverlo, no lo toca. ruta_destino_id null =
//         cada paquete se queda en su misma ruta.
//         Cada intento queda en temu_movimientos.
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const CPS_API      = (Deno.env.get("CPS_API_URL") ?? "https://app.cpslogistics.com:8042/CpsLastMile").replace(/\/$/, "");
const ID_CLIENTE_TEMU = "670";        // el que usa CPS en "Rendimiento por ruta"
const MAX_MOVER    = 150;
const CONCURRENCIA = 8;
const TZ_H         = -6;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// ---------- CPS ----------
async function cps(path: string, token: string | null, body?: unknown) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetch(CPS_API + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`CPS ${path.split("?")[0]} respondió ${r.status}`);
    try { return JSON.parse(txt); } catch { throw new Error(`CPS ${path.split("?")[0]} no devolvió JSON`); }
  } finally { clearTimeout(t); }
}
async function login() {
  const user = (Deno.env.get("CPS_USERNAME") ?? "").trim(), pass = Deno.env.get("CPS_PASSWORD") ?? "";
  if (!user || !pass) throw new Error("Faltan los secretos CPS_USERNAME / CPS_PASSWORD en Supabase");
  const r = await cps("/authenticate", null, { username: user, password: createHash("md5").update(pass, "utf8").digest("hex") });
  if (r?.MSM !== "OK" || !r?.DATA?.TOKEN) throw new Error("CPS no aceptó el usuario o la contraseña");
  return { token: r.DATA.TOKEN as string, idEmpresa: r.DATA?.EMPRESA?.ID_EMPRESA as number };
}
async function destinos(token: string, idEmpresa: number) {
  const r = await cps(`/MoverEnRuta/destinos?idEmpresa=${idEmpresa}`, token);
  if (r?.STATUS !== 1) throw new Error(r?.ERROR || "CPS no devolvió las rutas y motoristas");
  return {
    rutas: (r.DATA?.RUTAS ?? []).map((x: any) => ({ id: x.ID_RUTA, codigo: x.CODIGO, descripcion: x.DESCRIPCION, pilotos: x.PILOTOS_ASIGNADOS ?? [] })),
    pilotos: (r.DATA?.PILOTOS ?? []).map((x: any) => ({ id: x.ID_USUARIO, nombre: x.NOMBRE })),
  };
}
async function consultar(token: string, wrhs: string) {
  const r = await cps(`/MoverEnRuta/envio?wrhs=${encodeURIComponent(wrhs)}`, token);
  if (r?.STATUS !== 1 || !r?.DATA) throw new Error(r?.ERROR || "No se pudo consultar el paquete");
  const d = r.DATA;
  return {
    wrhs: String(d.WRHS ?? wrhs), id_envio: d.ID_ENVIO, correlativo: d.CORRELATIVO ?? null,
    id_ruta: d.ID_RUTA ?? null, ruta: d.RUTA_CODIGO ?? null,
    piloto_id: d.ID_USUARIO_PILOTO ?? null, piloto: d.PILOTO ?? null,
    puede_mover: d.PUEDE_MOVER === true, motivo_no: d.MOTIVO_NO_MOVER ?? null,
    id_estado_objeto: typeof d.ID_ESTADO_OBJETO === "number" ? d.ID_ESTADO_OBJETO : null,
    asignaciones_activas: typeof d.ASIGNACIONES_ACTIVAS === "number" ? d.ASIGNACIONES_ACTIVAS : null,
  };
}
async function enParalelo<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}
function hoyRango() {
  const hoy = new Date(Date.now() + TZ_H * 36e5).toISOString().slice(0, 10);
  const ini = Date.parse(hoy + "T00:00:00Z") - TZ_H * 36e5;
  return { hoy, ini, fin: ini + (24 * 60 - 1) * 60_000 };
}

// ---------- acciones ----------
async function listar(token: string, idEmpresa: number, pilotoId: number) {
  const { hoy, ini, fin } = hoyRango();
  // En qué rutas tiene paquetes en camino hoy (mismo reporte que "Rendimiento por ruta")
  const barras = await cps("/Graphics/RutasGraficaBarrasTemuEmpresa", token, { ID_EMPRESA: idEmpresa, FECHA_INICIO: ini, FECHA_FIN: fin });
  const lista: any[] = Array.isArray(barras) ? barras : barras?.DATA ?? [];
  const rutas = [...new Set(lista.filter((x) => x?.ID_USUARIO_PILOTO === pilotoId && Number(x?.PENDIENTES) > 0).map((x) => String(x.CODIGO)))];
  const paquetes: any[] = [];
  let sinConsultar = 0;
  for (const codigo of rutas) {
    const det = await cps("/Graphics/getReporteRutasDetalleTemuEmpresa", token, { CODIGO: codigo, ID_CLIENTE: ID_CLIENTE_TEMU, FECHA_INICIO: ini, FECHA_FIN: fin, TEMU: 1 });
    const items: any[] = Array.isArray(det) ? det : det?.DATA ?? [];
    const enRuta = items.filter((x) => x?.ID_ESTADO === 1 && x?.IDENTIFICADOR_DETALLE).map((x) => String(x.IDENTIFICADOR_DETALLE));
    const info = await enParalelo(enRuta, async (w) => { try { return await consultar(token, w); } catch (e) { return { wrhs: w, error: e instanceof Error ? e.message : String(e) } as any; } });
    for (const p of info) {
      if (p.error) sinConsultar++;          // no sabemos de quién es: no se muestra
      else if (p.piloto_id === pilotoId) paquetes.push({ ...p, ruta: p.ruta ?? codigo });
    }
  }
  return { fecha: hoy, rutas_revisadas: rutas, paquetes, sin_consultar: sinConsultar };
}

// Zonas de una ruta según su código: "DP 7 MIXCO" → [7], "MIXCO Z9" → [9], "3 MIXCO" → [3]
function zonasRuta(codigo: string): number[] { return [...String(codigo).matchAll(/\d{1,2}/g)].map((m) => Number(m[0])); }
function zonaDe(d: unknown): number | null {
  const m = String(d ?? "").match(/(?<![a-z])(?:zona|zon|z)\s*\.?\s*(\d{1,2})(?!\d)/i);
  if (!m) return null; const z = Number(m[1]); return z >= 1 && z <= 25 ? z : null;
}
const ESTADO_RUTA: Record<number, string> = { 1: "en_camino", 2: "entregado", 3: "rechazado" };

async function paquetes(token: string, idEmpresa: number, body: any) {
  const { hoy, ini, fin } = hoyRango();
  const pilotoId = body.piloto_id == null || body.piloto_id === "" ? null : Number(body.piloto_id);
  const rutaPedida = body.ruta ? String(body.ruta) : null;
  if (pilotoId === null && !rutaPedida) throw new Error("Falta el motorista o la ruta");
  const manana = body.manana === true && !!rutaPedida;
  if (manana) {
    const out = await pendientesRuta(token, idEmpresa, rutaPedida!, new Set([11]), new Set());
    out.sort((a, b) => (a.zona_ok === false ? 0 : 1) - (b.zona_ok === false ? 0 : 1) || (a.zona ?? 99) - (b.zona ?? 99));
    return { fecha: hoy, rutas: [rutaPedida], paquetes: out, sin_consultar: 0, manana: true };
  }
  const barras = await cps("/Graphics/RutasGraficaBarrasTemuEmpresa", token, { ID_EMPRESA: idEmpresa, FECHA_INICIO: ini, FECHA_FIN: fin });
  const lista: any[] = Array.isArray(barras) ? barras : barras?.DATA ?? [];
  const rutas = rutaPedida ? [rutaPedida]
    : [...new Set(lista.filter((x) => x?.ID_USUARIO_PILOTO === pilotoId && Number(x?.TOTAL_PAQUETES) > 0).map((x) => String(x.CODIGO)))];
  const out: any[] = [];
  let sinConsultar = 0;
  for (const codigo of rutas) {
    const det = await cps("/Graphics/getReporteRutasDetalleTemuEmpresa", token, { CODIGO: codigo, ID_CLIENTE: ID_CLIENTE_TEMU, FECHA_INICIO: ini, FECHA_FIN: fin, TEMU: 1 });
    const items: any[] = (Array.isArray(det) ? det : det?.DATA ?? []).filter((x: any) => x?.IDENTIFICADOR_DETALLE);
    const esperadas = zonasRuta(codigo);
    // De quién es cada paquete: se consulta en CPS (el detalle por ruta no lo trae)
    const info = await enParalelo(items, async (x: any) => { try { return await consultar(token, String(x.IDENTIFICADOR_DETALLE)); } catch { return null; } });
    items.forEach((x: any, k: number) => {
      const c = info[k];
      if (pilotoId !== null) { if (!c) { sinConsultar++; return; } if (c.piloto_id !== pilotoId) return; }
      const z = zonaDe(x.DIRECCION_DESTINO);
      out.push({
        guia: String(x.IDENTIFICADOR_DETALLE), correlativo: x.CORRELATIVO ?? c?.correlativo ?? null,
        estado: ESTADO_RUTA[x.ID_ESTADO] ?? "otro", motivo: x.MOTIVO_RECHAZO ?? null,
        ruta: codigo, piloto: c?.piloto ?? null, piloto_id: c?.piloto_id ?? null,
        direccion: String(x.DIRECCION_DESTINO ?? "").replace(/\s+/g, " ").trim() || null,
        zona: z, zona_ok: z === null || !esperadas.length ? null : esperadas.includes(z),
      });
    });
  }
  // En una ruta, también lo que sigue en bodega sin asignar (lo de mañana va en "Llegan mañana")
  if (rutaPedida) {
    try { out.push(...await pendientesRuta(token, idEmpresa, rutaPedida, new Set([1]), new Set(out.map((p) => p.guia)))); }
    catch { /* si falla, se muestra lo de hoy */ }
  }
  const orden: Record<string, number> = { en_camino: 0, bodega: 1, rechazado: 2, entregado: 3, por_llegar: 4, otro: 5 };
  out.sort((a, b) => (orden[a.estado] - orden[b.estado]) || String(a.ruta).localeCompare(String(b.ruta)) || (a.zona ?? 99) - (b.zona ?? 99));
  return { fecha: hoy, rutas, paquetes: out, sin_consultar: sinConsultar };
}

// Paquetes de una ruta en el listado de pendientes de CPS: 1 = en bodega sin asignar, 11 = llega mañana
async function pendientesRuta(token: string, idEmpresa: number, ruta: string, estados: Set<number>, ya: Set<string>) {
  const r = await cps("/Graphics/EnviosPendientesTemuProveedor", token, { ID_EMPRESA: idEmpresa });
  const l: any[] = (Array.isArray(r) ? r : r?.DATA ?? []).filter((x: any) => String(x?.RUTA_FINAL) === ruta && x?.IDENTIFICADOR_DETALLE && estados.has(x?.ID_ESTADO_OBJETO));
  const esperadas = zonasRuta(ruta);
  return l.filter((x) => !ya.has(String(x.IDENTIFICADOR_DETALLE))).map((x) => {
    const z = zonaDe(x.DIRECCION);
    return {
      guia: String(x.IDENTIFICADOR_DETALLE), correlativo: x.CORRELATIVO ?? null,
      estado: x.ID_ESTADO_OBJETO === 1 ? "bodega" : "por_llegar", motivo: null,
      ruta, piloto: null, piloto_id: null,
      direccion: String(x.DIRECCION ?? "").replace(/\s+/g, " ").trim() || null,
      zona: z, zona_ok: z === null || !esperadas.length ? null : esperadas.includes(z),
    };
  });
}

async function buscar(token: string, idEmpresa: number, guia: string) {
  const g = String(guia ?? "").trim();
  if (!/^[A-Za-z0-9-]{4,30}$/.test(g)) throw new Error("Escribí un número de guía válido");
  let cps_: any = null, errorCps: string | null = null;
  try { cps_ = await consultar(token, g); } catch (e) { errorCps = e instanceof Error ? e.message : String(e); }
  // ¿Está en lo que viene para mañana (recepción / bodega)?
  let pendiente: any = null;
  try {
    const r = await cps("/Graphics/EnviosPendientesTemuProveedor", token, { ID_EMPRESA: idEmpresa });
    const l: any[] = Array.isArray(r) ? r : r?.DATA ?? [];
    const x = l.find((p) => String(p?.IDENTIFICADOR_DETALLE) === g);
    if (x) pendiente = { ruta: x.RUTA_FINAL ?? null, estado: x.ESTADO_OBJETO ?? null, id_estado_objeto: x.ID_ESTADO_OBJETO ?? null, desde: x.FECHA_PENDIENTE ?? null, correlativo: x.CORRELATIVO ?? null };
  } catch { /* si falla, se muestra lo demás */ }
  return { guia: g, cps: cps_, error_cps: errorCps, pendiente };
}

async function mover(token: string, idEmpresa: number, body: any, email: string | null) {
  const wrhs: string[] = Array.isArray(body.wrhs) ? [...new Set(body.wrhs.map((x: unknown) => String(x).trim()).filter(Boolean))] as string[] : [];
  const destino = Number(body.piloto_destino_id);
  const rutaFija = body.ruta_destino_id == null || body.ruta_destino_id === "" ? null : Number(body.ruta_destino_id);
  const motivo = String(body.motivo ?? "").trim().slice(0, 150);
  if (!wrhs.length) throw new Error("No mandaste paquetes");
  if (wrhs.length > MAX_MOVER) throw new Error(`Máximo ${MAX_MOVER} paquetes a la vez`);
  if (!Number.isFinite(destino)) throw new Error("Falta el motorista destino");
  if (motivo.length < 3) throw new Error("Escribí un motivo");
  const d = await destinos(token, idEmpresa);
  const pDest = d.pilotos.find((p: any) => p.id === destino);
  if (!pDest) throw new Error("Ese motorista destino no está en CPS");
  if (rutaFija !== null && !d.rutas.find((r: any) => r.id === rutaFija)) throw new Error("Esa ruta destino no está en CPS");

  const resultados = await enParalelo(wrhs, async (w) => {
    let antes: any = null;
    try {
      antes = await consultar(token, w);
      if (!antes.puede_mover) throw new Error(antes.motivo_no || "CPS no deja mover este paquete (ya no está en camino)");
      if (antes.piloto_id === destino && (rutaFija === null || antes.id_ruta === rutaFija)) throw new Error("Ya está con ese motorista");
      const idRuta = rutaFija ?? antes.id_ruta;
      if (!idRuta) throw new Error("El paquete no tiene ruta en CPS");
      const r = await cps("/MoverEnRuta/mover", token, { WRHS: antes.wrhs, ID_RUTA: idRuta, ID_USUARIO_PILOTO: destino, MOTIVO: motivo });
      if (r?.STATUS !== 1) throw new Error(r?.ERROR || (r?.MSM && r.MSM !== "OK" ? r.MSM : "CPS no confirmó el movimiento"));
      return { wrhs: w, correlativo: antes.correlativo, ok: true, mensaje: r?.DATA?.MENSAJE || "Movido", antes, id_ruta_destino: idRuta };
    } catch (e) {
      return { wrhs: w, correlativo: antes?.correlativo ?? null, ok: false, mensaje: e instanceof Error ? e.message : String(e), antes, id_ruta_destino: rutaFija ?? antes?.id_ruta ?? null };
    }
  });

  const rutaNombre = (id: number | null) => d.rutas.find((r: any) => r.id === id)?.codigo ?? null;
  await admin.from("temu_movimientos").insert(resultados.map((r) => ({
    hecho_por: email, wrhs: r.wrhs, correlativo: r.correlativo,
    ruta_origen: r.antes?.ruta ?? null, piloto_origen_id: r.antes?.piloto_id ?? null, piloto_origen: r.antes?.piloto ?? null,
    ruta_destino_id: r.id_ruta_destino, ruta_destino: rutaNombre(r.id_ruta_destino),
    piloto_destino_id: destino, piloto_destino: pDest.nombre, motivo, ok: r.ok, mensaje: r.mensaje,
  })));
  return {
    movidos: resultados.filter((r) => r.ok).length, fallidos: resultados.filter((r) => !r.ok).length,
    resultados: resultados.map((r) => ({ wrhs: r.wrhs, correlativo: r.correlativo, ok: r.ok, mensaje: r.mensaje })),
  };
}

// ---------- HTTP ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: u, error: ue } = await userClient.auth.getUser();
  if (ue || !u?.user) return json({ error: "no_autorizado" }, 401);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  try {
    const { token, idEmpresa } = await login();
    if (body.accion === "destinos") return json({ ok: true, ...(await destinos(token, idEmpresa)) });
    if (body.accion === "listar") {
      const pid = Number(body.piloto_id);
      if (!Number.isFinite(pid)) return json({ error: "Falta el motorista" }, 400);
      return json({ ok: true, ...(await listar(token, idEmpresa, pid)) });
    }
    if (body.accion === "paquetes") return json({ ok: true, ...(await paquetes(token, idEmpresa, body)) });
    if (body.accion === "buscar") return json({ ok: true, ...(await buscar(token, idEmpresa, body.guia)) });
    if (body.accion === "mover") return json({ ok: true, ...(await mover(token, idEmpresa, body, u.user.email ?? null)) });
    return json({ error: "accion_desconocida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
