export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${url}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: response.status===429 ? "Too many requests. Please wait a moment and try again." : response.status===401 ? "Your session has expired. Please sign in again." : "Connection failed. Please retry." }));
    throw new Error(body.error ?? "Request failed.");
  }
  return response.json();
}
export const post = <T>(url: string, body: unknown = {}) =>
  api<T>(url, { method: "POST", body: JSON.stringify(body) });
