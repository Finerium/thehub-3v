// The request id (9.9: every response carries x-request-id equal to the trace id or the audit event id).
// src/proxy.ts mints one UUID per request, writes it on the forwarded request headers and on the response;
// a handler that persists an answer trace or an audit event uses this id as that row's id, so the header, the
// log line and the row agree (AC-NFR-11). x-request-path carries the pathname for authorize() and requireSession().
import { headers } from "next/headers";

export const REQUEST_ID_HEADER = "x-request-id";
export const REQUEST_PATH_HEADER = "x-request-path";

// In a route handler, from the request the proxy forwarded.
export function requestIdOf(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
}

// In a server component or anywhere the request object is out of reach.
export async function getRequestId(): Promise<string> {
  return (await headers()).get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
}

export async function getRequestPath(): Promise<string> {
  return (await headers()).get(REQUEST_PATH_HEADER) ?? "/";
}
