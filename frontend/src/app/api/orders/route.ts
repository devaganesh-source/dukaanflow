
import { NextRequest } from "next/server";

import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";
import { readSession } from "@/lib/server-session";

export async function POST(request: NextRequest) {
  // Reject cross-origin order submissions.
  if (
    request.headers.get("origin") !==
    request.nextUrl.origin
  ) {
    return Response.json(
      { detail: "Same-origin request required" },
      { status: 403 }
    );
  }

  const contentType =
    request.headers.get("content-type") ?? "";

  if (!contentType.startsWith("application/json")) {
    return Response.json(
      { detail: "JSON request required" },
      { status: 415 }
    );
  }

  const session = await readSession();

  if (session.status === "guest") {
    return Response.json(
      { detail: "Login required" },
      { status: 401 }
    );
  }

  if (session.status === "unavailable") {
    return Response.json(
      { detail: "Authentication service unavailable" },
      { status: 503 }
    );
  }

  if (session.user.role !== "retailer") {
    return Response.json(
      { detail: "Retailer access required" },
      { status: 403 }
    );
  }

  const body = await request.text();

  if (body.length > 8192) {
    return Response.json(
      { detail: "Order request too large" },
      { status: 413 }
    );
  }

  try {
    JSON.parse(body);
  } catch {
    return Response.json(
      { detail: "Invalid JSON" },
      { status: 400 }
    );
  }

  try {
    const headers = new Headers(
      sessionHeaders(session.token)
    );

    headers.set("Content-Type", "application/json");

    const upstream = await fetch(
      `${BACKEND_ORIGIN}/api/orders`,
      {
        method: "POST",
        headers,
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      }
    );

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        detail:
          "Order service unavailable. Retry using the same request.",
      },
      { status: 503 }
    );
  }
}
