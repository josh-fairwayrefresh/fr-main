async function readError(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await response.json();
    return {
      message: body.error || body.message || `Request failed with status ${response.status}`,
      details: body,
    };
  }
  return {
    message: (await response.text()).trim() || `Request failed with status ${response.status}`,
    details: null,
  };
}

export async function adminRequest(user, apiBaseUrl, path, options = {}) {
  const { method = 'GET', body, responseType = 'json' } = options;
  const token = await user.getIdToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const failure = await readError(response);
    const error = new Error(failure.message);
    error.details = failure.details;
    throw error;
  }
  return responseType === 'blob' ? response.blob() : response.json();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}