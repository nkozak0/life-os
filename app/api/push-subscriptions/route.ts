import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PushSubscriptionBody = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId =
    typeof data?.claims?.sub === "string"
      ? data.claims.sub
      : null;

  return {
    supabase,
    userId: error ? null : userId,
  };
}

function parseSubscription(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const body = value as PushSubscriptionBody;
  const endpoint =
    typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh =
    typeof body.keys?.p256dh === "string"
      ? body.keys.p256dh.trim()
      : "";
  const auth =
    typeof body.keys?.auth === "string"
      ? body.keys.auth.trim()
      : "";

  if (
    !endpoint.startsWith("https://") ||
    endpoint.length > 2048 ||
    !p256dh ||
    p256dh.length > 512 ||
    !auth ||
    auth.length > 512
  ) {
    return null;
  }

  return {
    endpoint,
    p256dh,
    auth,
  };
}

export async function POST(request: Request) {
  const { supabase, userId } = await getAuthenticatedClient();

  if (!userId) {
    return NextResponse.json(
      { error: "You must be signed in to enable notifications." },
      { status: 401 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "The request body must be valid JSON." },
      { status: 400 },
    );
  }

  const subscription = parseSubscription(body);

  if (!subscription) {
    return NextResponse.json(
      { error: "The push subscription is invalid." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
      {
        onConflict: "endpoint",
      },
    );

  if (error) {
    console.error("Push subscription save failed:", {
      userId,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: "The notification subscription could not be saved." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
  });
}

export async function DELETE(request: Request) {
  const { supabase, userId } = await getAuthenticatedClient();

  if (!userId) {
    return NextResponse.json(
      { error: "You must be signed in to disable notifications." },
      { status: 401 },
    );
  }

  let body: {
    endpoint?: unknown;
  };

  try {
    body = (await request.json()) as {
      endpoint?: unknown;
    };
  } catch {
    return NextResponse.json(
      { error: "The request body must be valid JSON." },
      { status: 400 },
    );
  }

  const endpoint =
    typeof body.endpoint === "string" ? body.endpoint.trim() : "";

  if (!endpoint || endpoint.length > 2048) {
    return NextResponse.json(
      { error: "A valid push endpoint is required." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);

  if (error) {
    console.error("Push subscription delete failed:", {
      userId,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      {
        error:
          "The notification subscription could not be removed.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
  });
}
