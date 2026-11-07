
import { NextRequest } from "next/server";

import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";
import { readSession } from "@/lib/server-session";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(
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

  try {
    const upstream = await fetch(
      `${BACKEND_ORIGIN}/api/order-desk/orders/${id}/export`,
      {
        method: "POST",
        headers: sessionHeaders(session.token),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!upstream.ok) {
      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }

    return new Response(
      await upstream.arrayBuffer(),
      {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Content-Disposition": (
            `attachment; filename="dukaanflow-order-${id}.xml"`
          ),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch {
    return Response.json(
      {
        detail:
          "Export request failed. Retry to download the same file.",
      },
      { status: 503 }
    );
  }
}
