// ============================================================
// Dropper · Temu — Funciones puras (fechas y conversión de envíos de CPS)
// Separadas para poder probarlas (ver cps_test.ts).
// ============================================================
export const TZ_OFFSET_H = -6;          // Guatemala, sin horario de verano

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

