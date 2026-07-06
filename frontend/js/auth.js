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

  /**
   * Helper: Handle 401 Unauthorized errors
   * Logout user dan redirect ke login page
   */
  function handle401Error(errorMessage = "") {
    console.error('[Auth] 401 Unauthorized error:', errorMessage);
    alert('Sesi Anda telah berakhir atau tidak valid. Silakan login kembali untuk melanjutkan.');
    console.log('[Auth] Logging out user...');
    logout();
  }

  return {
    getToken, getUser, isLoggedIn, isAdmin,
    logout, checkAuth, authHeaders, authHeadersMultipart,
    handle401Error,
  };
})();

window.Auth = Auth;
