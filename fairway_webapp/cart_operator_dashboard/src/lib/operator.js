export async function operatorRequest(user, apiBaseUrl, path, options = {}) {
  const token = await user.getIdToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new Error((await response.text()).trim() || `Request failed with status ${response.status}`);
  }
  return response.json();
}