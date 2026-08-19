/**
 * A plain authenticated fetch helper — adds the bearer header, nothing
 * more. Proactive token refresh lives in `middleware.ts` instead (it runs
 * on every navigation and can mutate the response's cookies; a Server
 * Component render cannot set cookies at all, so a 401-then-refresh-then-
 * retry helper here couldn't actually persist a refreshed token pair —
 * found while building this, not assumed in the plan).
 */

export class BackendApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function baseUrl(): string {
  return process.env.BACKEND_API_BASE_URL ?? "http://localhost:3000/v1";
}

export async function authenticatedFetch(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return res;
}

export async function authenticatedJson<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await authenticatedFetch(accessToken, path, init);
  if (!res.ok) {
    const body = await res.text();
    throw new BackendApiError(res.status, `backend-api ${path} returned ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}
