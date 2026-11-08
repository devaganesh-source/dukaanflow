
import { NextRequest } from "next/server";

import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";
import { readSession } from "@/lib/server-session";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return Response.json(
      { detail: "Same-origin request required" },
      { status: 403 }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";

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
      { detail: "Authentication unavailable" },
      { status: 503 }
    );
  }

  if (session.user.role !== "order_desk") {
    return Response.json(
      { detail: "Order-desk access required" },
      { status: 403 }
    );
  }

  const body = await request.text();

  if (body.length > 4096) {
    return Response.json(
      { detail: "Request too large" },
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
    const upstream = await fetch(
      `${BACKEND_ORIGIN}/api/order-desk/loading-list/preview`,
      {
        method: "POST",
        headers: {
          ...sessionHeaders(session.token),
          "Content-Type": "application/json",
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      }
    );

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      {
        detail:
          "Loading list service unavailable. Retry after reconnecting.",
      },
      { status: 503 }
    );
  }
}
