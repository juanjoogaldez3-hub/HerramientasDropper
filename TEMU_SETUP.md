# Guía de configuración — Tablero Temu

El tablero (`temu.html`) muestra las entregas de Temu que Dropper hace por la plataforma
**CPS LastMile**: avance contra la meta diaria, entregas por piloto y día, pago a motoristas,
ganancia de Dropper (sin IVA ni ISR), rechazos y pendientes por ruta.

Los datos los trae sola la función **`temu-sync`**: entra a CPS con el usuario de Dropper,
pide los envíos de cada piloto y los pendientes, y los guarda en Supabase
(proyecto `uroqcxlwdzkjmkrpjmxf`, el mismo de siempre — el equipo entra con el mismo login).

**Qué se guarda:** número de envío, piloto, fecha, estado (entregado / rechazo), motivo del
rechazo, tamaño y costo. **No** se guardan direcciones, teléfonos ni nombres de quien recibe.

Son 4 pasos, una sola vez.

---

## Paso 1 — Crear las tablas

1. **supabase.com** → tu proyecto → **SQL Editor** → **New query**.
2. Copiá **todo** `supabase/migrations/20261029120000_temu.sql`, pegalo y **Run**. Debe decir *Success*.

Crea `temu_envios`, `temu_pilotos`, `temu_pendientes`, `temu_sync_runs`, `temu_config`
(con las tarifas: Q9.50 por entrega, Q5 al motorista, IVA 12 %, ISR 7 %, meta 500 diarios)
y las vistas que usa la página. Es seguro correrlo otra vez.

## Paso 2 — Guardar los secretos

Inventá una frase larga para `TEMU_CRON_SECRET` (por ejemplo `dropper-temu-8312-xq`); sirve para
que la tarea automática pueda llamar a la función. Después:

**Desde el panel:** **Edge Functions → Secrets → Add new secret** y agregá:

| Nombre | Valor |
|---|---|
| `CPS_USERNAME` | tu usuario de CPS LastMile |
| `CPS_PASSWORD` | tu contraseña de CPS LastMile |
| `TEMU_CRON_SECRET` | la frase que inventaste |

**O por terminal** (parado en esta carpeta):

```bash
supabase secrets set CPS_USERNAME='tu_usuario' CPS_PASSWORD='tu_contraseña' TEMU_CRON_SECRET='dropper-temu-8312-xq'
```

> 🔒 La contraseña queda guardada **solo** en los secretos de Supabase. Nunca la pongas en el código ni en GitHub (este repo es público).
> Si cambiás la contraseña en CPS, actualizá `CPS_PASSWORD` aquí también.

## Paso 3 — Desplegar la función

```bash
supabase functions deploy temu-sync
```

*(Si nunca usaste la CLI en esta compu: `supabase login` y luego `supabase link --project-ref uroqcxlwdzkjmkrpjmxf`.)*

**Probala:** abrí `temu.html` en la página de herramientas → **Actualizar desde CPS**.
En 1–3 minutos debe decir *"Listo: N envíos actualizados desde CPS"*.
Si algo falla, **Ajustes** muestra cada actualización y qué piloto falló.

## Paso 4 — Que se actualice sola

1. Abrí `supabase/temu_cron.sql`, reemplazá `PEGAR_AQUI_EL_TEMU_CRON_SECRET` por tu frase (la del Paso 2).
2. Pegalo en el **SQL Editor** → **Run**.

Quedan dos tareas:
- **Cada hora** de 6 a. m. a 11 p. m.: trae los últimos 3 días.
- **Cada noche** a las 2:17 a. m.: repasa los últimos 8 días por si CPS cambió algún estado.

---

## Cómo se calcula

- **Entregado** = lo que CPS tiene con pago registrado (el mismo criterio del filtro "Entregados" de CPS).
  Si un paquete se rechazó y luego se entregó, cuenta como entregado.
- **Día** = fecha (hora de Guatemala) del último registro del paquete.
- **Promedio diario** = entregados ÷ días que hubo entregas. **Por motorista** = solo los días que cada uno salió.
- **Libre para Dropper** = facturado (entregados × tarifa) − IVA incluido − ISR del período − pago a motoristas.
  No incluye otros gastos (planilla, gasolina, renta) ni crédito de IVA por compras.
- **Proyección del mes** usa el ISR por tramos: 5 % hasta Q30,000 sin IVA y 7 % sobre lo que pase.
- Tarifas, metas e ISR se cambian en **Ajustes** dentro de la página.
- En **Pilotos**, marcá como **Apoyo** a quien sale solo de vez en cuando (sale en gris).

## Problemas comunes

| Síntoma | Solución |
|---|---|
| "No se pudieron cargar los datos" | Falta correr el Paso 1. |
| "CPS no aceptó el usuario o la contraseña" | Revisá `CPS_USERNAME` / `CPS_PASSWORD` (Paso 2). |
| "Faltan los secretos CPS_USERNAME / CPS_PASSWORD" | Cargá los secretos y volvé a desplegar (Pasos 2 y 3). |
| Un piloto sale con error en Ajustes | CPS tardó o falló con ese piloto; la próxima actualización lo vuelve a intentar. |
| No se actualiza sola | Revisá el Paso 4: `select jobname, schedule from cron.job;` debe mostrar las dos tareas. |
| Dejó de funcionar de un día para otro | CPS pudo cambiar su sistema; la conexión no es oficial y hay que ajustar `supabase/functions/temu-sync`. |

**Pruebas:** `deno test supabase/functions/temu-sync/cps_test.ts`
