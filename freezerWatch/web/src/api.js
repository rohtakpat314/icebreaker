export async function api(path, options = {}) {
  const response = await fetch(path, options)
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) {
    const error = new Error(data.error || "Request failed")
    error.status = response.status
    throw error
  }
  return data
}

export function me() {
  return api("/api/me")
}

export function login(username, password) {
  return api("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
}

export function logout() {
  return api("/api/logout", { method: "POST" })
}
