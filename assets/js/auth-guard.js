/* ============================================================
   Dropper · Reportería — Guardia de sesión
   Protege las páginas internas: si no hay sesión activa,
   redirige al login. Expone window.dropperAuth con helpers.
   Requiere: supabaseClient.js cargado antes.
   ============================================================ */
(function () {
  const sb = window.sb;

  async function getUser() {
    if (!sb) return null;
    const { data } = await sb.auth.getUser();
    return data ? data.user : null;
  }

  // Llamar al inicio de cada página protegida.
  async function requireSession() {
    if (!sb) {
      // Supabase no configurado: avisar y dejar pasar en "modo vista previa".
      console.warn("Supabase no está configurado (assets/js/config.js).");
      return { previewMode: true, user: null };
    }
    const user = await getUser();
    if (!user) {
      const here = encodeURIComponent(location.pathname.split("/").pop() || "");
      location.replace("index.html?next=" + here);
      return null;
    }
    return { previewMode: false, user };
  }

  async function signOut() {
    if (sb) await sb.auth.signOut();
    location.replace("index.html");
  }

  window.dropperAuth = { getUser, requireSession, signOut };
})();
