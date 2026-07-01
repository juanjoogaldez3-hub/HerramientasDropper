# Dropper · Reportería web

Aplicación web interna para generar reportes de entregas por cliente, con **login para el equipo** e **historial guardado en base de datos**.

Conserva toda la lógica de tu generador original (lectura de Excel, corrección automática de municipios y tarifas, exportación a Excel y PDF) y le agrega:

- 🔐 **Login de equipo** (Supabase Auth)
- 🗂️ **Historial** de cada sesión de reportes (Supabase Postgres)
- 🌐 Lista para publicar en tu **dominio** con Vercel (gratis)

---

## 📁 Qué hay en este proyecto

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Pantalla de **ingreso** (login del equipo) |
| `inicio.html` | **Página de inicio** — el hub con todas las herramientas |
| `generador.html` | **Generador de Reportes** (Excel/PDF por cliente, consolidado, filtros) |
| `pagos.html` | **Pagos a Mensajeros** (pago = entregas × tarifa fija, con planilla y detalle) |
| `historial.html` | **Historial** de reportes generados |
| `assets/js/config.js` | 👈 **Aquí pegás tus llaves de Supabase** |
| `assets/css/app.css` | Estilos compartidos del sitio |
| `supabase/schema.sql` | El "molde" de la base de datos (se pega una vez en Supabase) |

> Podés abrir `generador.html` directo en tu navegador y **ya funciona en "modo vista previa"** (sin login ni historial). Para activar login + historial seguí los pasos de abajo.

---

## 🚀 Puesta en marcha (una sola vez, ~15 min)

### Paso 1 — Crear el proyecto en Supabase (gratis)

1. Entrá a **https://supabase.com** → **Start your project** → registrate (podés usar tu Google).
2. **New project**:
   - **Name:** `dropper-reporteria`
   - **Database Password:** poné una contraseña fuerte y **guardala** (no la vas a necesitar a diario, pero anotala).
   - **Region:** elegí la más cercana (ej. *East US* o *South America* si aparece).
3. Esperá ~2 minutos a que diga **"Project is ready"**.

### Paso 2 — Crear la tabla del historial

1. En tu proyecto Supabase, panel izquierdo → **SQL Editor** → **New query**.
2. Abrí el archivo `supabase/schema.sql` de este proyecto, **copiá todo** su contenido y pegalo.
3. Clic en **Run** (abajo a la derecha). Debe decir *Success*.

### Paso 3 — Copiar tus dos llaves

1. Panel izquierdo → **Settings** (engranaje) → **API**.
2. Copiá estos dos valores:
   - **Project URL** (algo como `https://abcd1234.supabase.co`)
   - **Project API keys → `anon` `public`** (un texto largo que empieza con `eyJ...`)
3. Abrí `assets/js/config.js` y reemplazá los placeholders:

```js
window.DROPPER_CONFIG = {
  SUPABASE_URL: "https://abcd1234.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJI...tu-llave-completa...",
};
```

> ✅ La llave `anon public` es **pública y segura** de poner aquí: la protección real la dan las políticas de seguridad (RLS) que creó el `schema.sql`. **Nunca** uses la llave `service_role` en estos archivos.

### Paso 4 — Crear las cuentas del equipo

Tenés dos formas:

- **Fácil:** abrí `index.html`, clic en **"Crear cuenta"**, y registrá a cada persona con su correo y contraseña.
- **Desde Supabase:** **Authentication → Users → Add user**.

> 💡 **Opcional pero recomendado:** en **Authentication → Providers → Email**, podés *desactivar* "Confirm email" mientras hacés pruebas, así las cuentas entran sin tener que confirmar el correo. Para producción, dejá la confirmación activada.

¡Listo! Ya tenés login + historial funcionando localmente. Abrí `index.html`, ingresá, y probá generar y guardar un reporte.

---

## 🌐 Publicar en tu dominio (Vercel, gratis)

### Opción A — Sin instalar nada (arrastrar y soltar)

1. Entrá a **https://vercel.com** → registrate (con tu cuenta de GitHub o correo).
2. En el dashboard, buscá la opción de **deploy** y subí/arrastrá la carpeta `dropper-reportes` completa.
3. Vercel te da una URL tipo `https://dropper-reporteria.vercel.app`. Probala.

### Opción B — Con GitHub (recomendada para actualizar fácil)

1. Subí esta carpeta a un repositorio en **GitHub**.
2. En Vercel → **Add New → Project → Import** ese repo.
3. **Framework Preset:** *Other*. **Root Directory:** la carpeta `dropper-reportes`. **Deploy**.
4. Cada vez que cambies algo y lo subas a GitHub, Vercel actualiza el sitio solo.

### Conectar tu dominio propio

1. En el proyecto de Vercel → **Settings → Domains → Add**.
2. Escribí el subdominio que quieras, por ejemplo `reportes.tudominio.gt`.
3. Vercel te mostrará un registro **CNAME** para agregar en tu proveedor de dominio (donde compraste el dominio). Lo agregás y en unos minutos queda con HTTPS automático.

### ⚠️ Último ajuste tras publicar

En Supabase → **Authentication → URL Configuration**, agregá tu URL final (ej. `https://reportes.tudominio.gt`) en **Site URL** y en **Redirect URLs**. Esto evita problemas de inicio de sesión en producción.

---

## 🔧 Cómo se usa el día a día

1. Cada miembro entra a la URL → **inicia sesión**.
2. **Generador:** arrastra el Excel de entregas → revisa correcciones → descarga Excel/PDF por cliente o en lote.
3. Clic en **"Guardar en historial"** para dejar registrada esa sesión (clientes, entregas, total, correcciones).
4. **Pagos a Mensajeros:** subí el Excel, definí tarifas, ingresá recolectas/descuentos, y con **"Guardar en historial"** queda registrada la planilla (período, tarifas, total pagado y desglose por mensajero).
5. **Historial:** con las pestañas **Reportes** y **Pagos**, cualquiera del equipo ve todas las sesiones guardadas y los acumulados.

6. **Control de recibos (no pagar dos veces):** cuando generás **Recibos (PDF)** en Pagos, cada envío (por su **ID de Orden**) queda registrado como "con recibo". Al subir un Excel nuevo, los mensajeros muestran un aviso *"⚠ N envíos ya con recibo"* (no se excluyen solos — vos decidís). En **Historial → Recibos** ves cada recibo y podés **Anular** uno: eso libera sus envíos y vuelven a quedar como no pagados.

> El `schema.sql` crea **cuatro** tablas: `report_sessions`, `payment_sessions`, `receipts` y `paid_deliveries`. Si ya lo habías corrido antes, **volvé a correrlo** para crear las que falten (es seguro re-ejecutarlo).

---

## ❓ Problemas comunes

| Síntoma | Solución |
|---|---|
| Sale el aviso amarillo "modo vista previa" | Faltan las llaves en `assets/js/config.js` (Paso 3). |
| "Correo o contraseña incorrectos" | La cuenta no existe o la clave está mal. Creala en *Authentication → Users*. |
| Creé la cuenta pero no me deja entrar | Está pendiente confirmar el correo. Revisá tu bandeja o desactivá "Confirm email" (Paso 4). |
| El historial sale vacío | Aún no le diste a "Guardar en historial" en el Generador. |
| "No se pudo guardar en el historial" | Verificá que corriste el `schema.sql` (Paso 2). |

---

## 📌 Notas técnicas

- **Sin servidor propio:** todo corre en el navegador + Supabase. Costo $0 en planes gratuitos para uso de equipo pequeño.
- **Privacidad:** los archivos Excel se procesan **en el navegador**; a la base de datos solo se manda un resumen (totales por cliente), no las direcciones ni el detalle.
- Modelo de permisos actual: **cualquier usuario autenticado del equipo ve todo el historial**. Si más adelante querés separar por persona o por rol, se ajusta en `supabase/schema.sql` (políticas RLS).
