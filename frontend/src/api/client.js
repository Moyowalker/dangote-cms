import axios from 'axios';

export const AUTH_UNAUTHORIZED_EVENT = 'dangote-auth-unauthorized';

function normalizeApiBaseUrl(value) {
  const fallback = '/api';
  const raw = String(value || fallback).trim();
  if (!raw) {
    return fallback;
  }

  const trimmed = raw.replace(/\/+$/, '');

  // Keep local relative usage unchanged.
  if (trimmed === '/api') {
    return '/api';
  }

  // If caller passes an absolute backend origin (without /api), append it.
  if (/^https?:\/\//i.test(trimmed)) {
    return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
  }

  return trimmed;
}

function shouldUseSameOriginProxy() {
  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = String(window.location.hostname || '').toLowerCase();
  return hostname.endsWith('.netlify.app');
}

const apiBaseUrl = shouldUseSameOriginProxy()
  ? '/api'
  : normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

const client = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

const csrfClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

let csrfToken = null;
let csrfPromise = null;

function buildCsrfRequestConfig() {
  return {
    params: { _t: Date.now() },
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    }
  };
}

function isStateChangingMethod(method) {
  return ['post', 'put', 'patch', 'delete'].includes(String(method || '').toLowerCase());
}

async function fetchCsrfToken({ force = false } = {}) {
  if (csrfPromise && !force) {
    return csrfPromise;
  }

  csrfPromise = csrfClient.get('/csrf-token', buildCsrfRequestConfig())
    .then((response) => {
      csrfToken = response.data?.csrfToken || null;
      return csrfToken;
    })
    .finally(() => {
      csrfPromise = null;
    });

  return csrfPromise;
}

export async function ensureCsrfToken() {
  if (csrfToken) {
    return csrfToken;
  }

  return fetchCsrfToken();
}

export async function refreshCsrfToken() {
  csrfToken = null;
  return fetchCsrfToken({ force: true });
}

export function clearSessionState() {
  csrfToken = null;
  window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
}

client.interceptors.request.use(async (config) => {
  if (!isStateChangingMethod(config.method)) {
    return config;
  }

  const token = await ensureCsrfToken();
  if (token) {
    config.headers['X-CSRF-Token'] = token;
  }

  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearSessionState();
    }
    return Promise.reject(error);
  }
);

export default client;
