# Guía de configuración — WhatsApp de Dropper

Sistema de WhatsApp con bot de ventas (Claude) + bandeja de entrada para el equipo.
Todo vive en el proyecto Supabase que **ya usan** (`uroqcxlwdzkjmkrpjmxf`), así que el
equipo entra con el **mismo login** de siempre.

**Datos del proyecto (ya conocidos):**
- URL del proyecto: `https://uroqcxlwdzkjmkrpjmxf.supabase.co`
- URL del webhook (la usarás en Meta): `https://uroqcxlwdzkjmkrpjmxf.supabase.co/functions/v1/whatsapp-webhook`

Hay que juntar **5 datos de Meta + 1 de Anthropic**, aplicar la base, y desplegar. Seguí en orden.

---

## Parte A — Meta (WhatsApp Cloud API)

> Resultado: 4 valores → **Phone Number ID**, **Token permanente**, **App Secret**, y un **Verify Token** que inventás vos.

1. Entrá a **developers.facebook.com** → *My Apps* → **Create App** → tipo **Business**.
2. En el panel de la app, agregá el producto **WhatsApp** (*Set up*). Esto crea un número de pruebas.
3. En **WhatsApp → API Setup** vas a ver:
   - **Phone number ID** (un número largo) → copialo. *(este es `WHATSAPP_PHONE_NUMBER_ID`)*
   - El número de WhatsApp de pruebas. Más adelante podés conectar tu número real.
4. **Token permanente** (no uses el temporal de 24 h):
   - Andá a **business.facebook.com** → *Configuración del negocio* → **Usuarios → Usuarios del sistema**.
   - Creá un *Usuario del sistema* (rol Admin) → **Agregar activos** → asigná tu **App**.
   - **Generar nuevo token** → elegí la app → permisos: **`whatsapp_business_messaging`** y **`whatsapp_business_management`** → **Generar**. Copiá ese token (es largo, empieza con `EAAG…`). *(este es `WHATSAPP_TOKEN`)*
5. **App Secret**: en developers.facebook.com → tu app → **Configuración → Básica** → **Mostrar** en *Clave secreta de la app*. Copialo. *(este es `WHATSAPP_APP_SECRET`; sirve para verificar que los mensajes vienen de Meta)*
6. **Verify Token**: inventá una frase secreta cualquiera, p. ej. `dropper-verif-7391`. Anotala. *(este es `WHATSAPP_VERIFY_TOKEN`)*

> El webhook en Meta se configura **al final** (Parte E), cuando la función ya esté desplegada.

---

## Parte B — Anthropic (el cerebro del bot)

1. Entrá a **console.anthropic.com** → *Settings* → **API Keys** → **Create Key**.
2. Copiá la llave (empieza con `sk-ant-…`). *(esta es `ANTHROPIC_API_KEY`)*
3. Asegurate de tener saldo/billing activo en la cuenta.

---

## Parte C — Base de datos (crear las tablas)

**La forma más fácil (sin instalar nada):**
1. Entrá a **supabase.com** → tu proyecto → **SQL Editor** → **New query**.
2. Abrí el archivo `supabase/migrations/20261026090000_whatsapp.sql` de este repo, copiá **todo** su contenido, pegalo y **Run**.
3. Debe decir *Success*. Esto crea las tablas `wa_contacts`, `wa_messages`, `wa_config` con seguridad y realtime.

*(Alternativa por terminal: `supabase db push` tras `supabase link`.)*

---

## Parte D — Desplegar las funciones + cargar los secretos

> Esto lo puede hacer Claude por vos (ver abajo), o vos siguiendo estos comandos.

Con la Supabase CLI, parado en la carpeta `dropper-reportes`:

```bash
supabase login
supabase link --project-ref uroqcxlwdzkjmkrpjmxf

# Cargar los secretos (reemplazá cada valor por el tuyo):
supabase secrets set \
  WHATSAPP_TOKEN="EAAG…" \
  WHATSAPP_PHONE_NUMBER_ID="123456…" \
  WHATSAPP_VERIFY_TOKEN="dropper-verif-7391" \
  WHATSAPP_APP_SECRET="xxxxxxxx" \
  ANTHROPIC_API_KEY="sk-ant-…"

# (Opcional) elegir modelo; por defecto usa claude-opus-5-5.
# Para gastar ~5x menos, podés usar Sonnet:
#   supabase secrets set ANTHROPIC_MODEL="claude-sonnet-5-5"

# Desplegar las dos funciones:
supabase functions deploy whatsapp-webhook
supabase functions deploy whatsapp-send
```

> `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase solo; no hay que cargarlos.

---

## Parte E — Conectar el webhook en Meta

1. developers.facebook.com → tu app → **WhatsApp → Configuration** (o *Webhooks*).
2. **Edit** el webhook:
   - **Callback URL:** `https://uroqcxlwdzkjmkrpjmxf.supabase.co/functions/v1/whatsapp-webhook`
   - **Verify token:** el mismo `WHATSAPP_VERIFY_TOKEN` que inventaste.
   - **Verify and save.** (Meta llama a la función; si el token coincide, queda verde.)
3. En **Webhook fields**, suscribite a **`messages`**.
4. Listo. Escribí al número de WhatsApp de la app desde tu teléfono y el bot debería contestar.

---

## Cómo se usa la bandeja

- Entrá a **reportes.droppergt.com/whatsapp.html** (o el enlace **WhatsApp** del menú).
- Las conversaciones en **modo humano** aparecen arriba. El bot atiende solo las de **modo bot**.
- Cuando un lead acepta la prueba, pide una persona, o pregunta algo que el bot no sabe, la conversación pasa sola a **humano** (con un resumen del lead).
- **Atender yo**: tomás la conversación (el bot deja de responder). **Devolver al bot**: se la devolvés.
- Si pasaron **más de 24 h** desde el último mensaje del cliente, WhatsApp no deja enviar texto libre (lo avisa la bandeja).

## Cambiar el "guion" del bot

El texto que guía al bot está en la tabla `wa_config` (columna `system_prompt`). Se puede
editar desde el SQL Editor, o pedíselo a Claude. No hace falta redesplegar para cambiarlo.
