import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReminderRow = {
  id: string;
  user_id: string;
  scheduled_for: string;
  topic: string;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

const reminderBatchSize = 100;

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
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
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
      "Reminder cron is missing Supabase admin or VAPID configuration.",
    );
    return NextResponse.json(
      { error: "Reminder delivery is not configured." },
      { status: 500 },
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const now = new Date().toISOString();
  const { data: reminderData, error: reminderError } = await supabaseAdmin
    .from("ai_reminders")
    .select("id, user_id, scheduled_for, topic")
    .eq("is_sent", false)
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(reminderBatchSize);

  if (reminderError) {
    console.error("Reminder cron queue lookup failed:", {
      code: reminderError.code,
      message: reminderError.message,
    });
    return NextResponse.json({ error: reminderError.message }, { status: 500 });
  }

  const dueReminders = (reminderData ?? []) as ReminderRow[];

  if (dueReminders.length === 0) {
    return NextResponse.json({
      due: 0,
      processed: 0,
      notificationsSent: 0,
      failed: 0,
      withoutSubscription: 0,
    });
  }

  const userIds = [
    ...new Set(dueReminders.map((reminder) => reminder.user_id)),
  ];
  const { data: subscriptionData, error: subscriptionError } =
    await supabaseAdmin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, keys")
      .in("user_id", userIds);

  if (subscriptionError) {
    console.error("Reminder cron subscription lookup failed:", {
      code: subscriptionError.code,
      message: subscriptionError.message,
    });
    return NextResponse.json(
      { error: subscriptionError.message },
      { status: 500 },
    );
  }

  const subscriptions = (subscriptionData ?? []) as PushSubscriptionRow[];
  const subscriptionsByUser = new Map<string, PushSubscriptionRow[]>();

  for (const subscription of subscriptions) {
    const userSubscriptions =
      subscriptionsByUser.get(subscription.user_id) ?? [];
    userSubscriptions.push(subscription);
    subscriptionsByUser.set(subscription.user_id, userSubscriptions);
  }

  let processed = 0;
  let notificationsSent = 0;
  let failed = 0;
  let withoutSubscription = 0;
  let updateFailed = 0;

  for (const reminder of dueReminders) {
    const userSubscriptions = subscriptionsByUser.get(reminder.user_id) ?? [];

    if (userSubscriptions.length === 0) {
      withoutSubscription += 1;
      continue;
    }

    const payload = JSON.stringify({
      title: "Life OS reminder",
      body: reminder.topic,
      url: "/chat",
      tag: `ai-reminder-${reminder.id}`,
    });
    let reminderDeliveries = 0;

    await Promise.all(
      userSubscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: subscription.keys,
            },
            payload,
          );
          reminderDeliveries += 1;
          notificationsSent += 1;
        } catch (error) {
          failed += 1;
          const statusCode = getPushStatusCode(error);

          console.error("Scheduled reminder push failed:", {
            reminderId: reminder.id,
            userId: reminder.user_id,
            subscriptionId: subscription.id,
            statusCode,
            expired: statusCode === 404 || statusCode === 410,
            message:
              error instanceof Error ? error.message : "Unknown web-push error",
          });
        }
      }),
    );

    if (reminderDeliveries === 0) {
      continue;
    }

    const { error: updateError } = await supabaseAdmin
      .from("ai_reminders")
      .update({ is_sent: true })
      .eq("id", reminder.id)
      .eq("is_sent", false);

    if (updateError) {
      updateFailed += 1;
      console.error("Reminder sent-state update failed:", {
        reminderId: reminder.id,
        code: updateError.code,
        message: updateError.message,
      });
      continue;
    }

    processed += 1;
  }

  return NextResponse.json({
    due: dueReminders.length,
    processed,
    notificationsSent,
    failed,
    withoutSubscription,
    updateFailed,
  });
}
