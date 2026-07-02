// debug-jwt.js
// ─────────────────────────────────────────────────────────────────────────────
// Pegar en la consola del browser (F12) mientras estás logueado.
// Te imprime los campos clave del JWT para entender por qué el módulo
// no aparece en el sidebar.
// ─────────────────────────────────────────────────────────────────────────────

function decodeJwt() {
  // El proyecto guarda el JWT en una cookie httpOnly "aplismart_token".
  // Si la cookie es httpOnly, el browser NO la expone a JS. En ese caso
  // tenés que pedirle a la API que te devuelva los datos de sesión.
  // La ruta es /api/company/:companyId/auth/me — necesitamos el id.
  // Workaround: leemos el companyId de un link del sidebar o del URL.
  const m = location.pathname.match(/^\/company\/(\d+)/) ||
             document.cookie.match(/companyId=(\d+)/);
  const companyId = m ? (Array.isArray(m) ? m[1] : m[1]) : null;

  if (!companyId) {
    console.error("No pude determinar el companyId. Abrí la página de una empresa primero.");
    return;
  }

  return fetch(`/api/company/${companyId}/auth/me`, { credentials: "include" })
    .then((r) => r.json())
    .then((me) => {
      console.group("Sesión actual");
      console.log("role:", me.role);
      console.log("scope:", me.scope);
      console.log("companyId:", me.companyId);
      console.log("companyModules:", me.companyModules);
      console.log("modulePermissions:", me.modulePermissions);
      console.log("¿'auditoria' en companyModules?",
        Array.isArray(me.companyModules) && me.companyModules.includes("auditoria"));
      const mp = me.modulePermissions ?? {};
      console.log("¿'auditoria.auditoria: [ver]' en modulePermissions?",
        Array.isArray(mp.auditoria?.auditoria) && mp.auditoria.auditoria.includes("ver"));
      console.groupEnd();
    })
    .catch((e) => console.error("Error:", e));
}

decodeJwt();
