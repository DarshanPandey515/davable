export const API_BASE = 'http://127.0.0.1:8000'

const ACCESS_KEY = 'davable_access_token'
const REFRESH_KEY = 'davable_refresh_token'

export function getToken() {
  return localStorage.getItem(ACCESS_KEY)
}

export function setTokens({ access, refresh }) {
  if (access) localStorage.setItem(ACCESS_KEY, access)
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export function isLoggedIn() {
  return !!getToken()
}

export function consumeOAuthTokensFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const access = params.get('access')
  const refresh = params.get('refresh')
  const oauthError = params.get('oauth_error')

  if (access) {
    setTokens({ access, refresh })
  }

  if (access || oauthError) {
    window.history.replaceState({}, '', window.location.pathname)
  }

  return { success: !!access, error: oauthError }
}

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...options.headers,
    },
  })
  return res
}

export async function signup(email, password) {
  const res = await apiFetch('/auth/signup/', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.email?.[0] || data.password?.[0] || data.detail || 'Signup failed')
  setTokens(data)
  return data
}

export async function login(email, password) {
  const res = await apiFetch('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || 'Incorrect email or password')
  setTokens(data)
  return data
}

export function logout() {
  clearTokens()
}

export function oauthLoginUrl(provider) {
  return `${API_BASE}/auth/oauth/${provider}/login/`
}

export async function listConversations() {
  const res = await apiFetch('/conversations/')
  if (!res.ok) throw new Error('Failed to load past sessions')
  return res.json()
}

export async function getConversation(conversationId) {
  const res = await apiFetch(`/conversations/${conversationId}/`)
  if (!res.ok) throw new Error('Failed to load conversation')
  return res.json()
}

export async function deleteConversation(conversationId) {
  const res = await apiFetch(`/conversations/${conversationId}/`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete project')
}