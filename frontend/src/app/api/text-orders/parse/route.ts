
import { NextRequest } from "next/server";

import {
  BACKEND_ORIGIN,
  sessionHeaders,
} from "@/lib/backend";
import { readSession } from "@/lib/server-session";

export async function POST(request: NextRequest) {
  if (
    request.headers.get("origin") !==
    request.nextUrl.origin
  ) {
    return Response.json(
      { detail: "Same-origin request required" },
      { status: 403 }
    );
  }

  const contentType = request.headers.get("content-type");

  if (
    !contentType?.toLowerCase().startsWith(
      "application/json"
    )
  ) {
    return Response.json(
      { detail: "JSON request required" },
      { status: 415 }
    );
  }

  let data: unknown;

  try {
    data = await request.json();
  } catch {
    return Response.json(
      { detail: "Invalid JSON" },
      { status: 400 }
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("text" in data) ||
    typeof data.text !== "string" ||
    !data.text.trim() ||
    data.text.length > 2000
  ) {
    return Response.json(
      {
        detail:
          "Enter an order message up to 2,000 characters.",
      },
      { status: 422 }
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

  if (session.user.role !== "retailer") {
    return Response.json(
      { detail: "Retailer access required" },
      { status: 403 }
    );
  }

  try {
    const upstream = await fetch(
      `${BACKEND_ORIGIN}/api/text-orders/parse`,
      {
        method: "POST",
        headers: {
          ...sessionHeaders(session.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: data.text }),
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
          "Text-order service unavailable. Please try again.",
      },
      { status: 503 }
    );
  }
}
