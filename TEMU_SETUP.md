# Guía de configuración — Tablero Temu

El tablero (`temu.html`) muestra las entregas de Temu que Dropper hace por la plataforma
**CPS LastMile**: avance contra la meta diaria, entregas por piloto y día, pago a motoristas,
ganancia de Dropper (sin IVA ni ISR), rechazos y pendientes por ruta.

Los datos los trae sola la función **`temu-sync`**: entra a CPS con el usuario de Dropper,
pide los envíos de cada piloto y los pendientes, y los guarda en Supabase
(proyecto `uroqcxlwdzkjmkrpjmxf`, el mismo de siempre — el equipo entra con el mismo login).

**Qué se guarda:** número de envío, piloto, fecha, estado (entregado / rechazo), motivo del
rechazo, tamaño y costo. **No** se guardan direcciones, teléfonos ni nombres de quien recibe.

## Estado (29 oct 2026)

Ya está hecho en Supabase: las tablas (migración `20261029120000_temu.sql`), la función
`temu-sync` desplegada y las dos tareas automáticas (migración `20261029140000_temu_cron.sql`):
- **Cada 5 minutos** de 6 a. m. a 10 p. m.: trae el día de hoy (para la pestaña **Hoy**).
- **Cada hora** (minuto 32) de 6 a. m. a 11 p. m.: repasa los últimos 3 días.
- **Cada noche** a las 2:17 a. m.: repasa los últimos 8 días por si CPS cambió algún estado.
- **Cada noche** a las 3:41 a. m.: borra el registro de actualizaciones y las fotos de pendientes de hace más de 14 días.

La clave de las tareas automáticas se generó sola y vive en el cofre de Supabase (`temu_cron_secret`);
no hay que copiarla a ningún lado.

## Lo único que falta: el usuario de CPS

En **supabase.com** → proyecto → **Edge Functions → Secrets** agregá:

| Nombre | Valor |
|---|---|
| `CPS_USERNAME` | tu usuario de CPS LastMile |
| `CPS_PASSWORD` | tu contraseña de CPS LastMile |

> 🔒 La contraseña queda guardada **solo** en los secretos de Supabase. Nunca la pongas en el código ni en GitHub (este repo es público).
> Si cambiás la contraseña en CPS, actualizá `CPS_PASSWORD` aquí también.

**Probalo:** abrí **Temu** en la página de herramientas → **Actualizar desde CPS**.
En 1–3 minutos debe decir *"Listo: N envíos actualizados desde CPS"*. Si algo falla, **Ajustes** muestra cada actualización y qué piloto falló.

## Si hay que volver a montarlo en otro proyecto

1. Correr las dos migraciones de `supabase/migrations/` que empiezan con `20261029` (SQL Editor o `supabase db push`). En la de `temu_cron`, cambiar la URL del proyecto.
2. `supabase functions deploy temu-sync`
3. Cargar los secretos `CPS_USERNAME` y `CPS_PASSWORD`.

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
| "No se pudieron cargar los datos" | Falta correr la migración de las tablas. |
| "CPS no aceptó el usuario o la contraseña" | Revisá `CPS_USERNAME` / `CPS_PASSWORD`. |
| "Faltan los secretos CPS_USERNAME / CPS_PASSWORD" | Cargá los dos secretos (ver arriba). |
| Un piloto sale con error en Ajustes | CPS tardó o falló con ese piloto; la próxima actualización lo vuelve a intentar. |
| No se actualiza sola | En el SQL Editor, `select jobname, schedule from cron.job;` debe mostrar `temu-sync-cada-5-min`, `temu-sync-cada-hora`, `temu-sync-noche` y `temu-limpieza`. |
| Dejó de funcionar de un día para otro | CPS pudo cambiar su sistema; la conexión no es oficial y hay que ajustar `supabase/functions/temu-sync`. |

**Pruebas:** `deno test supabase/functions/temu-sync/cps_test.ts`
