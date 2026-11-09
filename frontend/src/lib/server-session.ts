import { cookies } from "next/headers";

import {
  BACKEND_ORIGIN,
  SESSION_COOKIE,
  sessionHeaders,
} from "./backend";

export type AuthUser = {
  id: number;
  name: string;
  role: "retailer" | "order_desk" | "salesman";
};

type SessionResult =
  | { status: "guest" }
  | { status: "unavailable" }
  | {
      status: "authenticated";
      token: string;
      user: AuthUser;
    };

export async function readSession(): Promise<SessionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) return { status: "guest" };

  try {
    const response = await fetch(`${BACKEND_ORIGIN}/api/auth/me`, {
      headers: sessionHeaders(token),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 401) return { status: "guest" };
    if (!response.ok) return { status: "unavailable" };

    const user = (await response.json()) as AuthUser;
    if (
      user.role !== "retailer" &&
      user.role !== "order_desk" &&
      user.role !== "salesman"
    ) {
      return { status: "unavailable" };
    }

    return { status: "authenticated", token, user };
  } catch {
    return { status: "unavailable" };
  }
}
