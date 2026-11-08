
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{ size: string }>;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const { size: requestedSize } = await context.params;

  if (
    requestedSize !== "192" &&
    requestedSize !== "512"
  ) {
    return new Response("Icon not found", {
      status: 404,
    });
  }

  const size = Number(requestedSize);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#176b52",
        }}
      >
        <div
          style={{
            width: "66%",
            height: "66%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "23%",
            backgroundColor: "#ffffff",
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#176b52",
              fontSize: size * 0.38,
              fontWeight: 800,
            }}
          >
            D
          </div>
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        "Cache-Control": "public, max-age=86400",
      },
    }
  );
}
