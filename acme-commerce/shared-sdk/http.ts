// shared-sdk/http.ts
// Tiny HTTP helper shared by edge services (gateway, inventory, notification).

export interface ServiceResponse<T> {
  status: number;
  body: T;
}

export async function callService<T>(
  url: string,
  init?: RequestInit
): Promise<ServiceResponse<T>> {
  const res = await fetch(url, init);
  const body = (await res.json()) as T;
  return { status: res.status, body };
}
