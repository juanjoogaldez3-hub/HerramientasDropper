// ============================================================
// Dropper · Temu — Funciones puras (fechas y conversión de envíos de CPS)
// Separadas para poder probarlas (ver cps_test.ts).
// ============================================================
import { createHash } from "node:crypto";

export const TZ_OFFSET_H = -6;          // Guatemala, sin horario de verano

// La página de CPS manda la contraseña como MD5 en hexadecimal (paquete "md5" de npm).
export function md5hex(texto: string): string {
  return createHash("md5").update(texto, "utf8").digest("hex");
}

export type Piloto = { id: number; nombre: string };

// ---------- Fechas (todo en hora de Guatemala) ----------
export const DAY = 86_400_000;
export function hoyLocal(): string {
  return new Date(Date.now() + TZ_OFFSET_H * 3_600_000).toISOString().slice(0, 10);
}
export function sumarDias(fecha: string, n: number): string {
  return new Date(Date.parse(fecha + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
}
export function esFecha(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));
}
// Inicio del día local en UTC (00:00 GT = 06:00Z) y fin del día (23:59 GT = 05:59Z del día siguiente)
export function inicioUTC(fecha: string): string {
  return new Date(Date.parse(fecha + "T00:00:00Z") - TZ_OFFSET_H * 3_600_000).toISOString();
}
export function finUTC(fecha: string): string {
  return new Date(Date.parse(fecha + "T23:59:00Z") - TZ_OFFSET_H * 3_600_000).toISOString();
}
// "2026-10-28T21:26:20.273+0000" -> Date
export function parseCps(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return isNaN(d.getTime()) ? null : d;
}
export function fechaLocal(d: Date): string {
  return new Date(d.getTime() + TZ_OFFSET_H * 3_600_000).toISOString().slice(0, 10);
}

export function aFila(x: any, piloto: Piloto) {
  const reg = parseCps(x?.FECHA_REGISTRO);
  if (!reg || typeof x?.ID_ENVIO_DETALLE !== "number") return null;
  const lista: any[] = Array.isArray(x?.LIST_PAGO_RECHAZO) ? x.LIST_PAGO_RECHAZO : [];
  const rechazos = lista.filter((p) => p?.FECHA_REGISTRO_RECHAZO);
  const ultimoMotivo = rechazos.length ? rechazos[rechazos.length - 1]?.MOTIVO : null;
  const motivo = x?.MOTIVO_RECHAZO || ultimoMotivo || null;
  // Mismo criterio que el reporte "Entregados" de CPS: entregado = tiene pago registrado.
  const estado = x?.PAGOS ? "entregado" : (x?.RECHAZOS || motivo ? "rechazo" : "otro");
  return {
    id_envio_detalle: x.ID_ENVIO_DETALLE,
    id_envio: typeof x?.ID_ENVIO === "number" ? x.ID_ENVIO : null,
    correlativo: x?.CORRELATIVO ?? null,
    guia: x?.IDENTIFICADOR_DETALLE != null ? String(x.IDENTIFICADOR_DETALLE) : null,
    billing_name: x?.BILLING_NAME ?? null,
    piloto_id: piloto.id,
    piloto: (x?.NOMBRE_COMPLETO || piloto.nombre || "").trim(),
    fecha: fechaLocal(reg),
    registrado_at: reg.toISOString(),
    estado,
    id_estado: typeof x?.ID_ESTADO === "number" ? x.ID_ESTADO : null,
    motivo: estado === "entregado" ? null : motivo,
    tamano: x?.CODIGO_SIZE ?? null,
    costo_envio: typeof x?.COSTO_ENVIO === "number" ? x.COSTO_ENVIO : null,
    ganancia_cps: typeof x?.GANANCIA_PILOTO === "number" ? x.GANANCIA_PILOTO : null,
    synced_at: new Date().toISOString(),
  };
}


// CPS a veces repite el mismo paquete en la lista de un piloto (por ejemplo, rechazado un día
// y entregado otro). Se queda una sola fila: entregado gana a rechazo, y si empatan, la más reciente.
const PESO: Record<string, number> = { entregado: 3, rechazo: 2, otro: 1 };
export function unicos<T extends { id_envio_detalle: number; estado: string; registrado_at: string }>(filas: T[]): T[] {
  const m = new Map<number, T>();
  for (const f of filas) {
    const a = m.get(f.id_envio_detalle);
    if (!a || PESO[f.estado] > PESO[a.estado] || (PESO[f.estado] === PESO[a.estado] && f.registrado_at > a.registrado_at)) m.set(f.id_envio_detalle, f);
  }
  return [...m.values()];
}

// Zona escrita en la dirección: "zona 10", "zona3Mixco", "z7mixco", "Zona 9de Mixco"… null si no la dice.
export function zonaDe(direccion: unknown): number | null {
  const m = String(direccion ?? "").match(/(?<![a-z])(?:zona|zon|z)\s*\.?\s*(\d{1,2})(?!\d)/i);
  if (!m) return null;
  const z = Number(m[1]);
  return z >= 1 && z <= 25 ? z : null;
}

// Cuenta los paquetes de una ruta por zona y estado (1 en camino, 2 entregado, 3 rechazado).
export function contarZonas(items: any[]) {
  const g = new Map<string, { zona: string; en_camino: number; entregados: number; rechazados: number; total: number }>();
  for (const x of items) {
    const z = zonaDe(x?.DIRECCION_DESTINO);
    const k = z === null ? "?" : String(z);
    const f = g.get(k) ?? { zona: k, en_camino: 0, entregados: 0, rechazados: 0, total: 0 };
    if (x?.ID_ESTADO === 1) f.en_camino++;
    else if (x?.ID_ESTADO === 2) f.entregados++;
    else if (x?.ID_ESTADO === 3) f.rechazados++;
    f.total++;
    g.set(k, f);
  }
  return [...g.values()];
}

// Lo que viene para mañana (listado de pendientes Temu de CPS), contado por ruta y zona.
// ID_ESTADO_OBJETO 11 = centro de recepción (por llegar), 1 = activo en centro (en bodega).
export function contarZonasPendientes(items: any[]) {
  const g = new Map<string, { ruta: string; zona: string; por_llegar: number; en_bodega: number }>();
  for (const x of items) {
    const ruta = String(x?.RUTA_FINAL ?? "Sin ruta");
    const z = zonaDe(x?.DIRECCION);
    const zona = z === null ? "?" : String(z);
    const k = ruta + "|" + zona;
    const f = g.get(k) ?? { ruta, zona, por_llegar: 0, en_bodega: 0 };
    if (x?.ID_ESTADO_OBJETO === 1) f.en_bodega++; else f.por_llegar++;
    g.set(k, f);
  }
  return [...g.values()];
}
