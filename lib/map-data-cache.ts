const jsonRequests = new Map<string, Promise<unknown>>();

/**
 * Fetch remote GeoJSON once per server process. The Quebec and Ontario routes
 * share the same Natural Earth source file, so this avoids downloading and
 * parsing it twice.
 */
export function fetchJsonCached<T>(url: string): Promise<T> {
  const existing = jsonRequests.get(url);
  if (existing) return existing as Promise<T>;

  const request = fetch(url, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load ${url}`);
      return response.json() as Promise<T>;
    })
    .catch((error) => {
      jsonRequests.delete(url);
      throw error;
    });

  jsonRequests.set(url, request);
  return request;
}
