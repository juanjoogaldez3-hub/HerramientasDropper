// Dropper · Temu — diagnóstico temporal de SOLO LECTURA: cómo vienen las direcciones/zonas por ruta.
// No guarda nada. Solo responde a la clave de la tarea automática (cofre de Supabase).
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CPS_API = (Deno.env.get("CPS_API_URL") ?? "https://app.cpslogistics.com:8042/CpsLastMile").replace(/\/$/, "");
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

async function cps(path: string, token: string | null, body?: unknown) {
  const r = await fetch(CPS_API + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`CPS ${path} ${r.status}`);
  return await r.json();
}

Deno.serve(async (req) => {
  const k = req.headers.get("x-temu-cron") ?? "";
  const { data: ok } = await admin.rpc("temu_cron_ok", { p: k });
  if (ok !== true) return json({ error: "no_autorizado" }, 401);
  const b = await req.json().catch(() => ({}));
  const dias = Math.min(14, Math.max(1, Number(b.dias) || 7));
  const modo = String(b.modo ?? "campos");

  const user = (Deno.env.get("CPS_USERNAME") ?? "").trim(), pass = Deno.env.get("CPS_PASSWORD") ?? "";
  const lg = await cps("/authenticate", null, { username: user, password: createHash("md5").update(pass, "utf8").digest("hex") });
  const token = lg.DATA.TOKEN, idEmpresa = lg.DATA.EMPRESA.ID_EMPRESA;

  const hoy = new Date(Date.now() - 6 * 36e5).toISOString().slice(0, 10);
  const fin = Date.parse(hoy + "T23:59:00Z") + 6 * 36e5;
  const ini = Date.parse(hoy + "T00:00:00Z") + 6 * 36e5 - (dias - 1) * 864e5;
  const barras = await cps("/Graphics/RutasGraficaBarrasTemuEmpresa", token, { ID_EMPRESA: idEmpresa, FECHA_INICIO: ini, FECHA_FIN: fin });
  const lista: any[] = Array.isArray(barras) ? barras : barras?.DATA ?? [];
  const rutas = [...new Set(lista.map((x) => String(x.CODIGO)))];
  const out: Record<string, any[]> = {};
  for (const codigo of rutas) {
    const det = await cps("/Graphics/getReporteRutasDetalleTemuEmpresa", token, { CODIGO: codigo, ID_CLIENTE: "670", FECHA_INICIO: ini, FECHA_FIN: fin, TEMU: 1 });
    out[codigo] = Array.isArray(det) ? det : det?.DATA ?? [];
  }
  if (modo === "campos") {
    const uno = Object.values(out).flat()[0] ?? {};
    const tipos = Object.fromEntries(Object.entries(uno).map(([k, v]) => [k, v === null ? "null" : Array.isArray(v) ? "array" : typeof v]));
    return json({ rutas: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), campos: tipos });
  }
  // modo "zonas": saca zona y municipio de cada dirección y devuelve solo conteos (no se guarda nada)
  const MUNIS: [RegExp, string][] = [
    [/mixco/i, "Mixco"], [/villa\s*nueva/i, "Villa Nueva"], [/chinautla/i, "Chinautla"], [/san\s*juan\s*sac/i, "San Juan Sacatepéquez"],
    [/san\s*pedro\s*sac/i, "San Pedro Sacatepéquez"], [/santa\s*catarina\s*pinula/i, "Santa Catarina Pinula"], [/san\s*miguel\s*petapa|petapa/i, "San Miguel Petapa"],
    [/villa\s*canales/i, "Villa Canales"], [/fraijanes/i, "Fraijanes"], [/san\s*jos[eé]\s*pinula/i, "San José Pinula"], [/amatitl[aá]n/i, "Amatitlán"],
    [/guatemala|ciudad/i, "Guatemala"],
  ];
  const zonaDe = (d: string) => { const m = d.match(/(?<![a-z])(?:zona|zon|z)\s*\.?\s*(\d{1,2})(?!\d)/i); return m ? Number(m[1]) : null; };
  const muniDe = (d: string) => { for (const [re, n] of MUNIS) if (re.test(d)) return n; return "?"; };
  const res: Record<string, any> = {};
  const muestras: string[] = [];
  for (const [r, items] of Object.entries(out)) {
    const cnt: Record<string, number> = {}; const sinZona: string[] = []; let total = 0;
    for (const x of items) {
      const d = String(x?.DIRECCION_DESTINO ?? "").replace(/\s+/g, " ").trim();
      total++;
      const z = zonaDe(d), m = muniDe(d);
      const key = m + " · " + (z === null ? "sin zona" : "zona " + z);
      cnt[key] = (cnt[key] ?? 0) + 1;
      if (z === null && sinZona.length < Number(b.n_sin ?? 6)) sinZona.push(d.slice(-90));
      if (muestras.length < Number(b.n_muestra ?? 0) && Math.random() < 0.05) muestras.push(r + " :: " + d.slice(-110));
    }
    res[r] = { total, por_zona: Object.fromEntries(Object.entries(cnt).sort((a, b) => b[1] - a[1])), sin_zona_ejemplos: sinZona };
  }
  return json({ desde_dias: dias, rutas: res, muestras });
});
