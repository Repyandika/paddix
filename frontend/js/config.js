/**
 * config.js
 * Konfigurasi endpoint terpusat untuk frontend PADDIX.
 */

(function initAppConfig() {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_BASE = isLocal ? `${window.location.origin}/api` : '/api';

  const endpoints = Object.freeze({
    authLogin: `${API_BASE}/auth/login`,
    authRegister: `${API_BASE}/auth/register`,
    authUsers: `${API_BASE}/auth/users`,
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
