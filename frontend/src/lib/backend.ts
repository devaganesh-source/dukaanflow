
export const BACKEND_ORIGIN = (
  process.env.API_ORIGIN || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export const SESSION_COOKIE = "dukaanflow_session";

export function sessionHeaders(token: string) {
  return {
    Cookie: `${SESSION_COOKIE}=${token}`,
  };
}
