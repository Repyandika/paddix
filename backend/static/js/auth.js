/**
 * auth.js
 * Modul autentikasi frontend.
 * Mengelola: token, login state, role check, logout.
 */

const Auth = (() => {
  const TOKEN_KEY = 'gis_token';
  const USER_KEY = 'gis_user';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY));
    } catch { return null; }
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function isAdmin() {
    const user = getUser();
    return user && user.role === 'admin';
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = 'login.html';
  }

  /**
   * Proteksi halaman: jika belum login, redirect ke login.
   */
  function checkAuth() {
    if (!isLoggedIn()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }

  /**
   * Helper: tambahkan Authorization header ke fetch options.
   */
  function authHeaders(extra = {}) {
    return {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  /**
   * Helper: fetch dengan auth header (tanpa Content-Type untuk FormData).
   */
  function authHeadersMultipart() {
    return {
      'Authorization': `Bearer ${getToken()}`,
    };
  }

  return {
    getToken, getUser, isLoggedIn, isAdmin,
    logout, checkAuth, authHeaders, authHeadersMultipart,
  };
})();

window.Auth = Auth;
