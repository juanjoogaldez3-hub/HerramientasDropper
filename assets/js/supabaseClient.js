/* ============================================================
   Dropper · Reportería — Cliente Supabase compartido
   Carga el SDK de Supabase y expone window.sb (el cliente).
   Requiere haber cargado antes:
     - https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
     - assets/js/config.js
   ============================================================ */
(function () {
  const cfg = window.DROPPER_CONFIG;
  if (!cfg) {
    console.error("Falta config.js");
    return;
  }
  if (!cfg.isConfigured()) {
    window.sb = null; // sin configurar: las páginas mostrarán aviso
    return;
  }
  // supabase global viene del SDK por CDN
  window.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
})();
