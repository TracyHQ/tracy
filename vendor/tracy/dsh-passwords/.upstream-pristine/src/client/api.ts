function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGatewayLoginRedirect(res: Response): boolean {
  if (!res.redirected || typeof res.url !== 'string' || res.url === '') {
    return false;
  }

  try {
    return new URL(res.url).pathname === '/gateway/login';
  } catch {
    return false;
  }
}

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const request: RequestInit = {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  if (signal !== undefined) request.signal = signal;
  const res = await fetch(path, request);

  // An expired gateway session redirects fetch to an HTTP 200 HTML login page.
  if (isGatewayLoginRedirect(res)) {
    throw Object.assign(new Error('Please sign in again'), { code: 'NOT_AUTHENTICATED' });
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(res.ok ? 'Expected a JSON response from the server' : `HTTP ${res.status}`);
  }

  if (!res.ok) {
    const details = isRecord(data) ? data : {};
    throw Object.assign(new Error(typeof details.error === 'string' && details.error
      ? details.error : `HTTP ${res.status}`), {
      code: typeof details.code === 'string' ? details.code : undefined,
      details,
    });
  }
  if (!isRecord(data)) throw new Error('Expected a JSON object from the server');

  // Callers interpret business results: update/apply can return ok:false while busy.
  return data as T;
}
