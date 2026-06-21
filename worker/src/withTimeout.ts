/**
 * Races a promise against a timeout. If `promise` doesn't settle within `ms`,
 * the returned promise rejects with `Error(label)`.
 *
 * This exists because some Playwright calls have no timeout of their own —
 * notably `page.evaluate`, which waits forever for the page's JS context. A
 * heavy single-page app (e.g. LinkedIn) whose context never settles can hang
 * `evaluate` indefinitely, stranding a capture job with no error. Wrapping such
 * calls in `withTimeout` turns an unbounded hang into a fast, catchable failure.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
