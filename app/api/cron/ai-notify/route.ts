import { timingSafeEqual } from "node:crypto";

import OpenAI from "openai";
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
  keys: {
    p256dh: string;
    auth: string;
  };
};

const notificationSystemPrompt = `
you write accountability reminders for a busy engineering student balancing a heavy course load, jobs, career prep, chores, and training
be casual, supportive, direct, lowercase, and lightly gen z
mention only facts included in the user prompt
return exactly one brief lock-screen notification body under 160 characters
output one continuous plain-text string
never output newline or carriage-return characters
never use markdown, bullets, headings, or quotation marks
`.trim();

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

function getTodayBoundariesUtc() {
  const now = new Date();
  const today = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ),
  );
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  return {
    today: today.toISOString(),
    tomorrow: tomorrow.toISOString(),
  };
}

function makeSingleLine(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
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

function buildReminderContext(
  chores: DueChore[],
  todayStart: string,
) {
  const overdueCount = chores.filter(
    (chore) =>
      new Date(chore.due_date).getTime() <
      new Date(todayStart).getTime(),
  ).length;
  const visibleChores = chores
    .slice(0, 8)
    .map((chore) => chore.title.trim())
    .filter(Boolean);
  const remainingCount = Math.max(
    0,
    chores.length - visibleChores.length,
  );

  return [
    `incomplete chores due today or overdue: ${visibleChores.join(", ")}`,
    `total due: ${chores.length}`,
    `overdue: ${overdueCount}`,
    remainingCount > 0
      ? `there are ${remainingCount} additional due chores`
      : null,
    "write one concise accountability nudge that helps the user take the next action",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
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
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const vapidPublicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !openaiApiKey ||
    !vapidPublicKey ||
    !vapidPrivateKey ||
    !vapidSubject
  ) {
    return NextResponse.json(
      {
        error:
          "The AI notification service is not fully configured.",
      },
      { status: 500 },
    );
  }

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
  const openai = new OpenAI({ apiKey: openaiApiKey });
  const { today, tomorrow } = getTodayBoundariesUtc();
  const { data: choreData, error: choreError } =
    await supabaseAdmin
      .from("chores")
      .select("id, title, due_date, assigned_user_id")
      .eq("is_completed", false)
      .not("assigned_user_id", "is", null)
      .lt("due_date", tomorrow);

  if (choreError) {
    console.error("AI notify chore lookup failed:", {
      message: choreError.message,
      code: choreError.code,
    });
    return NextResponse.json(
      { error: choreError.message },
      { status: 500 },
    );
  }

  const dueChores = (choreData ?? []) as DueChore[];

  if (dueChores.length === 0) {
    return NextResponse.json({
      users: 0,
      remindersGenerated: 0,
      subscriptions: 0,
      sent: 0,
      failed: 0,
    });
  }

  const choresByUser = new Map<string, DueChore[]>();

  for (const chore of dueChores) {
    const userChores =
      choresByUser.get(chore.assigned_user_id) ?? [];
    userChores.push(chore);
    choresByUser.set(chore.assigned_user_id, userChores);
  }

  const userIds = [...choresByUser.keys()];
  const { data: subscriptionData, error: subscriptionError } =
    await supabaseAdmin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, keys")
      .in("user_id", userIds);

  if (subscriptionError) {
    console.error("AI notify subscription lookup failed:", {
      message: subscriptionError.message,
      code: subscriptionError.code,
    });
    return NextResponse.json(
      { error: subscriptionError.message },
      { status: 500 },
    );
  }

  const subscriptions =
    (subscriptionData ?? []) as PushSubscriptionRow[];
  const subscriptionsByUser = new Map<
    string,
    PushSubscriptionRow[]
  >();

  for (const subscription of subscriptions) {
    const userSubscriptions =
      subscriptionsByUser.get(subscription.user_id) ?? [];
    userSubscriptions.push(subscription);
    subscriptionsByUser.set(
      subscription.user_id,
      userSubscriptions,
    );
  }

  webpush.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey,
  );

  let remindersGenerated = 0;
  let generationFailed = 0;
  let sent = 0;
  let failed = 0;

  for (const [userId, chores] of choresByUser) {
    const userSubscriptions =
      subscriptionsByUser.get(userId) ?? [];

    if (userSubscriptions.length === 0) {
      continue;
    }

    let reminder: string;

    try {
      const response = await openai.responses.create({
        model: process.env.OPENAI_MODEL ?? "gpt-5.6",
        instructions: notificationSystemPrompt,
        input: buildReminderContext(chores, today),
        max_output_tokens: 80,
      });
      reminder = makeSingleLine(response.output_text);

      if (!reminder) {
        throw new Error("OpenAI returned an empty reminder.");
      }

      remindersGenerated += 1;
    } catch (error) {
      generationFailed += 1;
      console.error("AI reminder generation failed:", {
        userId,
        message:
          error instanceof Error
            ? error.message
            : "Unknown OpenAI error",
      });
      continue;
    }

    const payload = JSON.stringify({
      title: "life os check-in",
      body: reminder,
      url: "/chat",
      tag: "life-os-ai-accountability",
    });

    for (const subscription of userSubscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          payload,
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const statusCode = getPushStatusCode(error);

        console.error("AI accountability push failed:", {
          userId,
          subscriptionId: subscription.id,
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
    users: choresByUser.size,
    dueChores: dueChores.length,
    remindersGenerated,
    generationFailed,
    subscriptions: subscriptions.length,
    sent,
    failed,
  });
}
