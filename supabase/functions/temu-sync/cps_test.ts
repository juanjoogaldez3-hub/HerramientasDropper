// Pruebas de la conversión de envíos de CPS.  Correr con:  deno test supabase/functions/temu-sync/cps_test.ts
import { aFila, finUTC, inicioUTC, md5hex, sumarDias } from "./cps.ts";

function igual(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: esperaba ${JSON.stringify(b)}, salió ${JSON.stringify(a)}`);
}

const piloto = { id: 602, nombre: "Mario Chapas" };

// Forma real de un envío de CPS: lo rechazaron un día y lo entregaron al siguiente.
const entregadoTrasRechazo = {
  ID_ENVIO: 1257278, CORRELATIVO: "ENV26/0709070", ID_ESTADO: 2,
  FECHA_REGISTRO: "2026-10-28T21:26:20.273+0000", CODIGO_SIZE: "S",
  COSTO_ENVIO: 11.0, GANANCIA_PILOTO: 8.24, PAGOS: "625844", RECHAZOS: null,
  ID_ENVIO_DETALLE: 1481600, NOMBRE_COMPLETO: "Mario Chapas", MOTIVO_RECHAZO: null,
  LIST_PAGO_RECHAZO: [
    { TIPO_PAGO: " (  )", MOTIVO: "NO HAY PASO", FECHA_REGISTRO_RECHAZO: "2026-10-27T23:39:34.580+0000" },
    { TIPO_PAGO: "NO APLICA (  )", MOTIVO: null, FECHA_REGISTRO_PAGO: "2026-10-28T21:26:20.270+0000", FECHA_REGISTRO_RECHAZO: null },
  ],
};

const soloRechazo = {
  ID_ENVIO: 1, ID_ENVIO_DETALLE: 2, ID_ESTADO: 2,
  FECHA_REGISTRO: "2026-10-28T03:10:00.000+0000",   // 9:10 p. m. del 27 en Guatemala
  PAGOS: null, RECHAZOS: "77", MOTIVO_RECHAZO: null, NOMBRE_COMPLETO: "Mario Chapas",
  LIST_PAGO_RECHAZO: [{ MOTIVO: "NO ESTABA EL DESTINATARIO", FECHA_REGISTRO_RECHAZO: "2026-10-28T03:10:00.000+0000" }],
};

Deno.test("rango de fechas igual al que manda la página de CPS", () => {
  igual(inicioUTC("2026-10-22"), "2026-10-22T06:00:00.000Z", "inicio");
  igual(finUTC("2026-10-28"), "2026-10-29T05:59:00.000Z", "fin");
  igual(sumarDias("2026-10-01", -2), "2026-09-29", "restar días cruzando mes");
});

Deno.test("entregado después de un rechazo cuenta como entregado y sin motivo", () => {
  const f = aFila(entregadoTrasRechazo, piloto)!;
  igual(f.estado, "entregado", "estado");
  igual(f.fecha, "2026-10-28", "fecha");
  igual(f.motivo, null, "motivo");
  igual(f.id_envio_detalle, 1481600, "id");
  igual(f.ganancia_cps, 8.24, "ganancia");
});

Deno.test("rechazo de noche cae en el día de Guatemala, con su motivo", () => {
  const f = aFila(soloRechazo, piloto)!;
  igual(f.estado, "rechazo", "estado");
  igual(f.fecha, "2026-10-27", "fecha local");
  igual(f.motivo, "NO ESTABA EL DESTINATARIO", "motivo");
});

Deno.test("sin fecha o sin id no se guarda", () => {
  igual(aFila({ ...soloRechazo, FECHA_REGISTRO: null }, piloto), null, "sin fecha");
  igual(aFila({ ...soloRechazo, ID_ENVIO_DETALLE: undefined }, piloto), null, "sin id");
});

Deno.test("contraseña en MD5 como la manda la página de CPS", () => {
  igual(md5hex("abc"), "900150983cd24fb0d6963f7d28e17f72", "md5 abc");
  igual(md5hex("contraseña"), "4c882dcb24bcb1bc225391a602feca7c", "md5 con ñ (utf-8)");
});
