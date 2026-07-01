/* ============================================================
   Dropper · Reportería — Configuración
   ------------------------------------------------------------
   Pegá aquí las dos llaves de tu proyecto Supabase.
   Las encontrás en:  Supabase → tu proyecto → Settings → API
     • Project URL        → SUPABASE_URL
     • Project API keys → "anon public"  → SUPABASE_ANON_KEY

   La "anon key" es PÚBLICA y segura de exponer en el navegador:
   la seguridad real la dan las políticas RLS de la base de datos.
   ============================================================ */
window.DROPPER_CONFIG = {
  SUPABASE_URL: "https://uroqcxlwdzkjmkrpjmxf.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyb3FjeGx3ZHpram1rcnBqbXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTc2NTcsImV4cCI6MjA5ODQ5MzY1N30.zl5Uanpd-RLkiF6becB8ugfPUO2DBWIDZLKlChFl8i0",
};

/* No tocar de aquí para abajo --------------------------------- */
window.DROPPER_CONFIG.isConfigured = function () {
  const c = window.DROPPER_CONFIG;
  return (
    c.SUPABASE_URL &&
    c.SUPABASE_ANON_KEY &&
    !c.SUPABASE_URL.startsWith("TU_") &&
    !c.SUPABASE_ANON_KEY.startsWith("TU_")
  );
};
