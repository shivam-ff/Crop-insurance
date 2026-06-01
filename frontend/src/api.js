const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:5050";

export function getBackendUrl() {
  return backendUrl;
}

export async function api(path, { token, method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch(`${backendUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = json?.error ? (typeof json.error === "string" ? json.error : JSON.stringify(json.error)) : `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return json;
}

