function normalizeApiBase(apiBase) {
  return String(apiBase || "").replace(/\/$/, "");
}

async function requestJson(apiBase, path, options = {}) {
  const response = await fetch(`${normalizeApiBase(apiBase)}${path}`, {
    method: options.method || "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": options.userId || "demo_user",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.message || `HTTP ${response.status}`);
    error.code = response.status;
    error.data = payload;
    throw error;
  }

  if (payload.code !== 0) {
    const error = new Error(payload.message || "request failed");
    error.code = payload.code;
    error.data = payload.data;
    throw error;
  }

  return payload.data;
}

async function requestGet(apiBase, path, options = {}) {
  const response = await fetch(`${normalizeApiBase(apiBase)}${path}`, {
    method: "GET",
    headers: {
      "x-user-id": options.userId || "demo_user",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.message || `HTTP ${response.status}`);
    error.code = response.status;
    error.data = payload;
    throw error;
  }

  if (payload.code !== 0) {
    const error = new Error(payload.message || "request failed");
    error.code = payload.code;
    error.data = payload.data;
    throw error;
  }

  return payload.data;
}

export function createApiClient(apiBase) {
  return {
    createConfessionFlow(payload) {
      return requestJson(apiBase, "/api/v1/confession-flows", { body: payload });
    },
    getConfessionFlow(flowId) {
      return requestGet(apiBase, `/api/v1/confession-flows/${encodeURIComponent(flowId)}`);
    },
    startCompletionRitual(taskId, payload) {
      return requestJson(apiBase, `/api/v1/tasks/${encodeURIComponent(taskId)}/completion-ritual`, { body: payload });
    },
    downgradeTask(taskId, payload) {
      return requestJson(apiBase, `/api/v1/tasks/${encodeURIComponent(taskId)}/downgrade`, { body: payload });
    },
    selfConfirmTask(taskId, payload) {
      return requestJson(apiBase, `/api/v1/tasks/${encodeURIComponent(taskId)}/self-confirm`, { body: payload });
    },
    settleTask(taskId, payload) {
      return requestJson(apiBase, `/api/v1/tasks/${encodeURIComponent(taskId)}/settle`, { body: payload });
    },
    getProfile() {
      return requestGet(apiBase, "/api/v1/users/me/profile");
    },
  };
}

