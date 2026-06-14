export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,x-user-id",
      ...init?.headers,
    },
  });
}

export function ok(data: unknown, message = "ok"): Response {
  return json({ code: 0, message, data });
}

export function fail(code: number, message: string, status = 400, data: unknown = {}): Response {
  return json({ code, message, data }, { status });
}
