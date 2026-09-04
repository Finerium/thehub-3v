// The stand-in for `next/headers` under Vitest (vitest.config.ts aliases it here): one request scope per test,
// set through `setRequest()`. `cookies()` returns a jar with the get/set surface src/auth/session.ts uses;
// `headers()` returns the forwarded request headers (x-request-id, x-request-path). Every cookie a test's code
// sets is recorded in `setCookies`.
type CookieSet = { name: string; value: string; options: Record<string, unknown> };

let requestCookies = new Map<string, string>();
let requestHeaders = new Headers();
export const setCookies: CookieSet[] = [];

export function setRequest(init: { cookies?: Record<string, string>; headers?: Record<string, string> } = {}): void {
  requestCookies = new Map(Object.entries(init.cookies ?? {}));
  requestHeaders = new Headers(init.headers ?? {});
  setCookies.length = 0;
}

export async function cookies() {
  return {
    get(name: string) {
      const value = requestCookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string, options: Record<string, unknown> = {}) {
      setCookies.push({ name, value, options });
      if (options.maxAge === 0) requestCookies.delete(name);
      else requestCookies.set(name, value);
    },
  };
}

export async function headers(): Promise<Headers> {
  return requestHeaders;
}
