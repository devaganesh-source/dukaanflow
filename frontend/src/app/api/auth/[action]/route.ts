
import { NextRequest, NextResponse } from "next/server";

import {
  BACKEND_ORIGIN,
  SESSION_COOKIE,
  sessionHeaders,
} from "@/lib/backend";


type Context = {
  params: Promise<{ action: string }>;
};

const postActions = new Set([
  "request-otp",
  "verify-otp",
  "logout",
]);

function errorResponse(detail: string, status: number) {
  return NextResponse.json(
    { detail },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

async function forward(
  request: NextRequest,
  action: string,
  method: "GET" | "POST"
) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;

    const body =
      method === "POST" && action !== "logout"
        ? await request.text()
        : undefined;

    if (body && body.length > 1024) {
      return errorResponse("Request is too large", 413);
    }

    const upstream = await fetch(
      `${BACKEND_ORIGIN}/api/auth/${action}`,
      {
        method,
        headers: {
          ...(body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...(token ? sessionHeaders(token) : {}),
        },
        body,
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      }
    );

    const contentType =
      upstream.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      return errorResponse(
        "Authentication service returned an invalid response",
        502
      );
    }

    const data = await upstream.json();

    const sessionCookie = upstream.headers.get("set-cookie");

    if (
      action === "verify-otp" &&
      upstream.ok &&
      (!sessionCookie ||
        !sessionCookie.includes(`${SESSION_COOKIE}=`))
    ) {
      return errorResponse(
        "Authentication session was not created",
        502
      );
    }

    const retryAfter = upstream.headers.get("retry-after");

    const response = NextResponse.json(data, {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-store",
        ...(retryAfter
          ? { "Retry-After": retryAfter }
          : {}),
      },
    });

    if (
      (action === "verify-otp" || action === "logout") &&
      sessionCookie
    ) {
      response.headers.append("Set-Cookie", sessionCookie);
    }

    return response;
  } catch {
    return errorResponse(
      "Authentication server unavailable. Please try again.",
      503
    );
  }
}

export async function GET(
  request: NextRequest,
  context: Context
) {
  const { action } = await context.params;

  if (action !== "me") {
    return errorResponse("Not found", 404);
  }

  return forward(request, action, "GET");
}

export async function POST(
  request: NextRequest,
  context: Context
) {
  const { action } = await context.params;

  if (!postActions.has(action)) {
    return errorResponse("Not found", 404);
  }


  const origin = request.headers.get("origin");

  if (origin !== request.nextUrl.origin) {
    return errorResponse(
      "Same-origin request required",
      403
    );
  }


  const fetchSite = request.headers.get("sec-fetch-site");

  if (
    fetchSite &&
    fetchSite !== "same-origin" &&
    fetchSite !== "none"
  ) {
    return errorResponse("Cross-site request rejected", 403);
  }

  if (
    action !== "logout" &&
    !request.headers
      .get("content-type")
      ?.includes("application/json")
  ) {
    return errorResponse(
      "Expected application/json",
      415
    );
  }

  return forward(request, action, "POST");
}