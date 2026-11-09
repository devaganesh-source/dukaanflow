import type { NextRequest } from "next/server";

import { BACKEND_ORIGIN, sessionHeaders } from "@/lib/backend";
import { readSession } from "@/lib/server-session";

const MAX_BODY_CHARS = 8192;

function reject(detail: string, status: number) {
  return Response.json(
    { detail },
    {
      status,
      headers: { "Cache-Control": "private, no-store" },
    }
  );
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return reject("Same-origin request required", 403);
  }

  const contentType = (request.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    return reject("JSON request required", 415);
  }

  const size = Number(request.headers.get("content-length") ?? "0");
  if (size > MAX_BODY_CHARS) {
    return reject("Sync request too large", 413);
  }

  const session = await readSession();
  if (session.status === "guest") return reject("Login required", 401);
  if (session.status === "unavailable") {
    return reject("Authentication service unavailable", 503);
  }
  if (session.user.role !== "salesman") {
    return reject("Salesman access required", 403);
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return reject("Unable to read request", 400);
  }
  if (body.length > MAX_BODY_CHARS) {
    return reject("Sync request too large", 413);
  }

  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return reject("Invalid sync request", 400);
    }
  } catch {
    return reject("Invalid JSON", 400);
  }

  try {
    const upstream = await fetch(`${BACKEND_ORIGIN}/api/salesman/sync`, {
      method: "POST",
      headers: {
        ...sessionHeaders(session.token),
        "Content-Type": "application/json",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // The server might have committed before the connection failed.
    // The caller MUST retain the same draft UUID when retrying.
    return reject(
      "Sync result is unknown. Keep this draft and retry with the same ID after reconnecting.",
      503
    );
  }
}
