import { timingSafeEqual } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DueChore = {
  id: string;
  title: string;
  due_date: string;
  assigned_user_id: string;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function isAuthorized(request: Request, cronSecret: string) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const suppliedSecret = authorization.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(cronSecret);
  const suppliedBuffer = Buffer.from(suppliedSecret);

  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

function getStartOfTomorrowUtc() {
  const now = new Date();

  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    ),
  ).toISOString();
}

function getPushStatusCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return null;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET is not configured.");
    return NextResponse.json(
      { error: "Cron authentication is not configured." },
      { status: 500 },
    );
  }

  if (!isAuthorized(request, cronSecret)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !vapidPublicKey ||
    !vapidPrivateKey ||
    !vapidSubject
  ) {
    console.error(
      "Missing Supabase admin or VAPID environment variables.",
    );
    return NextResponse.json(
      { error: "Notification service is not configured." },
      { status: 500 },
    );
  }

  webpush.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey,
  );

  const supabaseAdmin = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const { data: choresData, error: choresError } =
    await supabaseAdmin
      .from("chores")
      .select("id, title, due_date, assigned_user_id")
      .eq("is_completed", false)
      .not("assigned_user_id", "is", null)
      .lt("due_date", getStartOfTomorrowUtc());

  if (choresError) {
    console.error("Unable to fetch due chores:", choresError);
    return NextResponse.json(
      { error: choresError.message },
      { status: 500 },
    );
  }

  const dueChores = (choresData ?? []) as DueChore[];

  if (dueChores.length === 0) {
    return NextResponse.json({
      chores: 0,
      subscriptions: 0,
      sent: 0,
      failed: 0,
    });
  }

  const assignedUserIds = [
    ...new Set(dueChores.map((chore) => chore.assigned_user_id)),
  ];
  const { data: subscriptionsData, error: subscriptionsError } =
    await supabaseAdmin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", assignedUserIds);

  if (subscriptionsError) {
    console.error(
      "Unable to fetch push subscriptions:",
      subscriptionsError,
    );
    return NextResponse.json(
      { error: subscriptionsError.message },
      { status: 500 },
    );
  }

  const subscriptions =
    (subscriptionsData ?? []) as PushSubscriptionRow[];
  const subscriptionsByUser = new Map<
    string,
    PushSubscriptionRow[]
  >();

  for (const subscription of subscriptions) {
    const userSubscriptions =
      subscriptionsByUser.get(subscription.user_id) ?? [];
    userSubscriptions.push(subscription);
    subscriptionsByUser.set(subscription.user_id, userSubscriptions);
  }

  let sent = 0;
  let failed = 0;

  for (const chore of dueChores) {
    const userSubscriptions =
      subscriptionsByUser.get(chore.assigned_user_id) ?? [];

    for (const subscription of userSubscriptions) {
      const payload = JSON.stringify({
        title: `Chore reminder: ${chore.title}`,
        body: `${chore.title} is due today or overdue.`,
        choreId: chore.id,
        url: "/chores",
      });

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode = getPushStatusCode(error);

        console.error("Push notification failed:", {
          subscriptionId: subscription.id,
          choreId: chore.id,
          statusCode,
          expired: statusCode === 404 || statusCode === 410,
          message:
            error instanceof Error
              ? error.message
              : "Unknown web-push error",
        });
      }
    }
  }

  return NextResponse.json({
    chores: dueChores.length,
    subscriptions: subscriptions.length,
    sent,
    failed,
  });
}
