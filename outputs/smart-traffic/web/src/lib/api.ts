const BASE = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8900/api/v1';

export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('smart_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(username: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const body = await res.json();
  if (body.access_token) localStorage.setItem('smart_token', body.access_token);
  return body;
}

export async function listViolations(query: Record<string, string>) {
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${BASE}/officer/violations?${qs}`, { headers: authHeaders() });
  return res.json();
}

export async function getViolation(id: string) {
  const res = await fetch(`${BASE}/officer/violations/${id}`, { headers: authHeaders() });
  return res.json();
}

export async function review(id: string, action: 'confirm' | 'dismiss' | 'needs-review', note: string) {
  const res = await fetch(`${BASE}/officer/violations/${id}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ note })
  });
  return res.json();
}

export async function getKpi() {
  const res = await fetch(`${BASE}/officer/kpi`, { headers: authHeaders() });
  return res.json();
}

export async function getStreams() {
  const res = await fetch(`${BASE}/officer/streams`, { headers: authHeaders() });
  return res.json();
}

export const streamUrl = (cameraId: string) => `${BASE}/media/stream/${cameraId}`;
