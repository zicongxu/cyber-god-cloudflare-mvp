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

async function requestStream(apiBase, path, options = {}) {
  const response = await fetch(`${normalizeApiBase(apiBase)}${path}`, {
    method: options.method || "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": options.userId || "demo_user",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    const error = new Error(text || `HTTP ${response.status}`);
    error.code = response.status;
    error.data = text;
    throw error;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = "";

  while (true) {
    const { value, done } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) {
          continue;
        }

        const raw = trimmed.slice(5).trim();
        if (!raw || raw === "[DONE]") {
          continue;
        }

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }

        const delta = parsed?.choices?.[0]?.delta || {};
        const content = typeof delta.content === "string" ? delta.content : "";
        if (content) {
          result += content;
        }

        if (typeof options.onChunk === "function") {
          options.onChunk({ delta, parsed, text: result });
        }
      }
    }

    if (done) {
      break;
    }
  }

  return result;
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
    streamAgentChat(payload, options = {}) {
      return requestStream(apiBase, "/api/v1/agent/chat-stream", {
        body: payload,
        onChunk: options.onChunk,
      });
    },
  };
}
