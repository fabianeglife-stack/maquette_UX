/**
 * Parse a JSON blob stored in the database, returning `fallback` (default
 * `undefined`) instead of throwing on a corrupt row. A single bad row must
 * never 500 an entire list endpoint.
 */
export function safeParse<T>(raw: string | null | undefined): T | undefined;
export function safeParse<T>(raw: string | null | undefined, fallback: T): T;
export function safeParse<T>(raw: string | null | undefined, fallback?: T): T | undefined {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
