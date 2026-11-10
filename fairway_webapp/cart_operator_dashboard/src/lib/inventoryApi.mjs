async function requestError(response) {
  const contentType = response.headers.get('content-type') || '';
  let details = null;
  let message = `Request failed with status ${response.status}`;
  if (contentType.includes('application/json')) {
    details = await response.json();
    message = details.message || details.error || message;
  } else {
    message = (await response.text()).trim() || message;
  }
  const error = new Error(message);
  error.status = response.status;
  error.details = details;
  return error;
}

async function parseResponse(response) {
  if (!response.ok) throw await requestError(response);
  return response.json();
}

export async function inventoryRequest(user, apiBaseUrl, path, options = {}) {
  const { method = 'GET', body, signal } = options;
  const token = await user.getIdToken();
  return parseResponse(await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  }));
}

export async function publicMenuRequest(apiBaseUrl, slug, { signal } = {}) {
  const path = `/api/v1/public/menus/${encodeURIComponent(slug)}`;
  return parseResponse(await fetch(`${apiBaseUrl}${path}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
  }));
}