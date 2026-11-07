
import { NextRequest } from "next/server";

import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";
import { readSession } from "@/lib/server-session";

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(
  request: NextRequest,
  { params }: Context
) {
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

  const { id } = await params;

  if (
    !/^[1-9]\d*$/.test(id) ||
    !Number.isSafeInteger(Number(id))
  ) {
    return Response.json(
      { detail: "Invalid order ID" },
      { status: 400 }
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
    const headers = new Headers(
      sessionHeaders(session.token)
    );

    headers.set("Content-Type", "application/json");

    const upstream = await fetch(
      `${BACKEND_ORIGIN}/api/order-desk/orders/${id}/status`,
      {
        method: "PATCH",
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
          "Order service unavailable. Refresh the order before retrying.",
      },
      { status: 503 }
    );
  }
}
