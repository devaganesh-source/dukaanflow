
import type { NextRequest } from "next/server";

import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";
import { readSession } from "@/lib/server-session";

// 3 MiB of media becomes approximately 4 MiB of base64 JSON.
const MAX_BODY_CHARS = 4_250_000;

function failure(detail: string, status: number) {
  return Response.json(
    { detail },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
      },
    }
  );
}

export async function POST(request: NextRequest) {
  if (
    request.headers.get("origin") !==
    request.nextUrl.origin
  ) {
    return failure("Same-origin request required", 403);
  }

  const contentType = (
    request.headers.get("content-type") ?? ""
  )
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    return failure("JSON request required", 415);
  }

  const length = Number(
    request.headers.get("content-length") ?? 0
  );

  if (length > MAX_BODY_CHARS) {
    return failure("Media request is too large", 413);
  }

  const session = await readSession();

  if (session.status === "guest") {
    return failure("Login required", 401);
  }

  if (session.status === "unavailable") {
    return failure("Authentication unavailable", 503);
  }

  if (session.user.role !== "retailer") {
    return failure("Retailer access required", 403);
  }

  let body: string;

  try {
    body = await request.text();
  } catch {
    return failure("Unable to read media request", 400);
  }

  if (body.length > MAX_BODY_CHARS) {
    return failure("Media request is too large", 413);
  }

  try {
    const parsed: unknown = JSON.parse(body);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return failure("Invalid media request", 400);
    }
  } catch {
    return failure("Invalid JSON", 400);
  }

  try {
    const upstream = await fetch(
      `${BACKEND_ORIGIN}/api/text-orders/transcribe-media`,
      {
        method: "POST",
        headers: {
          ...sessionHeaders(session.token),
          "Content-Type": "application/json",
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      }
    );

    const responseText = await upstream.text();

    return new Response(responseText, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return failure(
      "Media extraction service unavailable. You can type the order manually.",
      503
    );
  }
}
