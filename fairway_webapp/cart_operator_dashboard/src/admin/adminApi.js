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

function serviceCutoverPath(customerId, courseId) {
  return `/api/v1/admin/customers/${encodeURIComponent(customerId)}/courses/${encodeURIComponent(courseId)}/service-cutover`;
}

function validateCutoverTarget(response, customerId, courseId, dryRun) {
  if (!response ||
      response.customer_id !== customerId ||
      response.course_id !== courseId ||
      response.dry_run !== dryRun ||
      typeof response.already_initialized !== 'boolean') {
    throw new Error('Cutover response did not match the explicitly selected Course and operation.');
  }
  const state = response.service_state;
  if (state?.status !== 'ready' ||
      typeof state.active !== 'boolean' ||
      !Number.isSafeInteger(state.generation) ||
      state.generation < 0) {
    throw new Error('Cutover response did not contain valid authoritative service state.');
  }
  if (dryRun && !response.already_initialized &&
      (!['active', 'off'].includes(response.migration_baseline) ||
        response.removes_legacy_schedule !== true)) {
    throw new Error('Cutover preflight did not confirm migration eligibility.');
  }
  return response;
}

export async function preflightCourseCutover(user, apiBaseUrl, customerId, courseId) {
  const response = await adminRequest(
    user,
    apiBaseUrl,
    serviceCutoverPath(customerId, courseId),
    { method: 'POST', body: { dry_run: true } }
  );
  return validateCutoverTarget(response, customerId, courseId, true);
}

export async function executeCourseCutover(user, apiBaseUrl, customerId, courseId) {
  const response = await adminRequest(
    user,
    apiBaseUrl,
    serviceCutoverPath(customerId, courseId),
    { method: 'POST', body: {} }
  );
  return validateCutoverTarget(response, customerId, courseId, false);
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