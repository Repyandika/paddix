/**
 * config.js
 * Konfigurasi endpoint terpusat untuk frontend PADDIX.
 * [PRODUCTION] API_BASE menggunakan path relatif agar kompatibel
 * dengan Nginx reverse proxy di VPS maupun pengembangan lokal.
 */

(function initAppConfig() {
  // Relative path: bekerja di semua environment (localhost via proxy & VPS).
  const API_BASE = '/api';

  const endpoints = Object.freeze({
    authLogin:    `${API_BASE}/auth/login`,
    authRegister: `${API_BASE}/auth/register`,
    authUsers:    `${API_BASE}/auth/users`,
  });

  function apiUrl(path) {
    if (!path) return API_BASE;
    return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  }

  window.APP_CONFIG = Object.freeze({
    API_BASE,
    endpoints,
    apiUrl,
  });
})();

