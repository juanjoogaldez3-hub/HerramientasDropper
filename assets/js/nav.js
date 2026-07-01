/* ============================================================
   Dropper · Reportería — Barra de navegación
   Coloca el logo y la inicial del usuario. Requiere brand.js antes.
   ============================================================ */
(function () {
  function initials(email) {
    if (!email) return "";
    const local = email.split("@")[0];
    const parts = local.split(/[._\-+]+/).filter(Boolean);
    const s = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
    return s.toUpperCase();
  }
  window.dropperNav = {
    setLogo() {
      const img = document.getElementById("brand-logo");
      if (img && window.DROPPER_LOGO) img.src = window.DROPPER_LOGO;
    },
    setUser(email) {
      const av = document.getElementById("nav-av");
      if (av && email) {
        av.textContent = initials(email);
        av.title = email;
        av.classList.add("show");
      }
    },
  };
  document.addEventListener("DOMContentLoaded", () => window.dropperNav.setLogo());
})();
