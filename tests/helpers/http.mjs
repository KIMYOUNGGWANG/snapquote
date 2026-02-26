export function jsonRequest(url, body, init = {}) {
  const headers = new Headers(init.headers || {})
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  return new Request(url, {
    method: init.method || 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function bearerHeader(token = 'test-token') {
  return {
    authorization: `Bearer ${token}`,
  }
}
