import axios from 'axios';

export const AUTH_UNAUTHORIZED_EVENT = 'dangote-auth-unauthorized';

const client = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

const csrfClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});

let csrfToken = null;
let csrfPromise = null;

function isStateChangingMethod(method) {
  return ['post', 'put', 'patch', 'delete'].includes(String(method || '').toLowerCase());
}

async function fetchCsrfToken() {
  if (csrfPromise) {
    return csrfPromise;
  }

  csrfPromise = csrfClient.get('/csrf-token')
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
