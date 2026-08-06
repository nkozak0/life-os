import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";

import { getKodaBaseSystemPrompt } from "@/lib/ai/koda";

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

type CheckinUserRow = {
  user_id: string;
  core_memory: string;
  accountability_roast_level: string;
  last_ai_checkin: string;
};

type CheckinWorkoutRow = {
  start_time: string;
  end_time: string | null;
  routines:
    | { name?: string }
    | { name?: string }[]
    | null;
  workout_sets:
    | {
        weight_lbs?: number;
        reps?: number;
      }[]
    | null;
};

type CheckinAssignmentRow = {
  title: string;
  course: string;
  due_date: string;
};

type CheckinHabitRow = {
  name: string;
  habit_completions:
    | {
        completed_date: string;
      }[]
    | null;
};

const reminderBatchSize = 100;
const proactiveBatchSize = 25;
const proactiveNotificationInstruction =
  "You are currently sending a proactive push notification to the user's lock screen. Do not engage in a full conversation. Deliver a single, punchy, 1-2 sentence message checking in on their pending habits, workouts, or assignments. Maintain your exact persona and current roast level.";

function makeSingleLine(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function getRoutineName(
  routines: CheckinWorkoutRow["routines"],
) {
  const routine = Array.isArray(routines)
    ? routines[0]
    : routines;

  return routine?.name?.trim() || "Workout";
}

function summarizeCheckinContext({
  workouts,
  assignments,
  habits,
}: {
  workouts: CheckinWorkoutRow[];
  assignments: CheckinAssignmentRow[];
  habits: CheckinHabitRow[];
}) {
  const recentHabitCutoff = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);

  return {
    recent_workouts: workouts.map((workout) => {
      const sets = workout.workout_sets ?? [];
      const volume = sets.reduce((total, set) => {
        const weight = Number(set.weight_lbs);
        const reps = Number(set.reps);

        return Number.isFinite(weight) &&
          Number.isInteger(reps) &&
          weight >= 0 &&
          reps > 0
          ? total + weight * reps
          : total;
      }, 0);

      return {
        routine: getRoutineName(workout.routines),
        started_at: workout.start_time,
        completed_at: workout.end_time,
        sets: sets.length,
        volume_lbs: Math.round(volume),
      };
    }),
    pending_assignments: assignments.map((assignment) => ({
      title: assignment.title,
      course: assignment.course,
      due_at: assignment.due_date,
    })),
    habits: habits.map((habit) => ({
      name: habit.name,
      completions_last_7_days: (
        habit.habit_completions ?? []
      ).filter(
        (completion) =>
          completion.completed_date >= recentHabitCutoff,
      ).length,
    })),
  };
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
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !vapidPublicKey ||
    !vapidPrivateKey ||
    !vapidSubject ||
    !openaiApiKey
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
  const openai = new OpenAI({ apiKey: openaiApiKey });

  const now = new Date();
  const nowIso = now.toISOString();
  const checkinCutoff = new Date(
    now.getTime() - 8 * 60 * 60 * 1000,
  ).toISOString();
  const [reminderResult, checkinResult] = await Promise.all([
    supabaseAdmin
      .from("ai_reminders")
      .select("id, user_id, scheduled_for, topic")
      .eq("is_sent", false)
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(reminderBatchSize),
    supabaseAdmin
      .from("user_settings")
      .select(
        "user_id, core_memory, accountability_roast_level, last_ai_checkin",
      )
      .lte("last_ai_checkin", checkinCutoff)
      .order("last_ai_checkin", { ascending: true })
      .limit(proactiveBatchSize),
  ]);
  const { data: reminderData, error: reminderError } =
    reminderResult;

  if (reminderError) {
    console.error("Reminder cron queue lookup failed:", {
      code: reminderError.code,
      message: reminderError.message,
    });
    return NextResponse.json({ error: reminderError.message }, { status: 500 });
  }

  const dueReminders = (reminderData ?? []) as ReminderRow[];

  if (checkinResult.error) {
    console.error("Koda check-in candidate lookup failed:", {
      code: checkinResult.error.code,
      message: checkinResult.error.message,
    });
    return NextResponse.json(
      { error: checkinResult.error.message },
      { status: 500 },
    );
  }

  const checkinUsers =
    (checkinResult.data ?? []) as CheckinUserRow[];
  const userIds = [
    ...new Set([
      ...dueReminders.map((reminder) => reminder.user_id),
      ...checkinUsers.map((user) => user.user_id),
    ]),
  ];

  if (userIds.length === 0) {
    return NextResponse.json({
      due: 0,
      processed: 0,
      notificationsSent: 0,
      failed: 0,
      withoutSubscription: 0,
      proactiveEligible: 0,
      proactiveGenerated: 0,
      proactiveSent: 0,
      proactiveFailed: 0,
      proactiveChatLogged: 0,
      proactiveChatLogFailed: 0,
      checkinsUpdated: 0,
    });
  }
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
  let proactiveGenerated = 0;
  let proactiveSent = 0;
  let proactiveFailed = 0;
  let proactiveWithoutSubscription = 0;
  let proactiveContextFailed = 0;
  let proactiveChatLogged = 0;
  let proactiveChatLogFailed = 0;
  let checkinsUpdated = 0;

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

  for (const checkinUser of checkinUsers) {
    const userSubscriptions =
      subscriptionsByUser.get(checkinUser.user_id) ?? [];

    if (userSubscriptions.length === 0) {
      proactiveWithoutSubscription += 1;
      continue;
    }

    const [workoutResult, assignmentResult, habitResult] =
      await Promise.all([
        supabaseAdmin
          .from("workouts")
          .select(
            "start_time, end_time, routines(name), workout_sets(weight_lbs, reps)",
          )
          .eq("user_id", checkinUser.user_id)
          .order("start_time", { ascending: false })
          .limit(3),
        supabaseAdmin
          .from("assignments")
          .select("title, course, due_date")
          .eq("user_id", checkinUser.user_id)
          .eq("is_completed", false)
          .order("due_date", {
            ascending: true,
            nullsFirst: false,
          })
          .limit(10),
        supabaseAdmin
          .from("habits")
          .select("name, habit_completions(completed_date)")
          .eq("user_id", checkinUser.user_id)
          .order("created_at", { ascending: true })
          .limit(10),
      ]);

    if (workoutResult.error) {
      proactiveContextFailed += 1;
      console.error("Koda workout context lookup failed:", {
        userId: checkinUser.user_id,
        code: workoutResult.error.code,
        message: workoutResult.error.message,
      });
    }

    if (assignmentResult.error) {
      proactiveContextFailed += 1;
      console.error("Koda assignment context lookup failed:", {
        userId: checkinUser.user_id,
        code: assignmentResult.error.code,
        message: assignmentResult.error.message,
      });
    }

    if (habitResult.error) {
      proactiveContextFailed += 1;
      console.error("Koda habit context lookup failed:", {
        userId: checkinUser.user_id,
        code: habitResult.error.code,
        message: habitResult.error.message,
      });
    }

    const recentData = summarizeCheckinContext({
      workouts: (workoutResult.data ?? []) as CheckinWorkoutRow[],
      assignments: (assignmentResult.data ?? []) as CheckinAssignmentRow[],
      habits: (habitResult.data ?? []) as CheckinHabitRow[],
    });

    let notificationBody: string;

    try {
      const basePersona = getKodaBaseSystemPrompt({
        roastLevel: checkinUser.accountability_roast_level,
        coreMemory: checkinUser.core_memory,
      });
      const response = await openai.responses.create({
        model: process.env.OPENAI_MODEL ?? "gpt-5.6",
        instructions: `${basePersona}

notification mode:
${proactiveNotificationInstruction}

Return only the notification body. Keep it under 240 characters, use a single continuous line, and do not use markdown.`,
        input: JSON.stringify({
          recent_data: recentData,
        }),
        max_output_tokens: 100,
      });

      notificationBody = makeSingleLine(response.output_text);

      if (!notificationBody) {
        throw new Error("OpenAI returned an empty check-in.");
      }

      proactiveGenerated += 1;
    } catch (error) {
      proactiveFailed += 1;
      console.error("Koda check-in generation failed:", {
        userId: checkinUser.user_id,
        message:
          error instanceof Error ? error.message : "Unknown OpenAI error",
      });
      continue;
    }

    const payload = JSON.stringify({
      title: "Koda check-in",
      body: notificationBody,
      url: "/chat",
      tag: `koda-checkin-${checkinUser.user_id}`,
    });
    let checkinDeliveries = 0;

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
          checkinDeliveries += 1;
          proactiveSent += 1;
        } catch (error) {
          proactiveFailed += 1;
          const statusCode = getPushStatusCode(error);

          console.error("Koda proactive push failed:", {
            userId: checkinUser.user_id,
            subscriptionId: subscription.id,
            statusCode,
            expired: statusCode === 404 || statusCode === 410,
            message:
              error instanceof Error ? error.message : "Unknown web-push error",
          });
        }
      }),
    );

    if (checkinDeliveries === 0) {
      continue;
    }

    const { error: chatMessageError } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        user_id: checkinUser.user_id,
        role: "assistant",
        content: notificationBody,
      });

    if (chatMessageError) {
      proactiveFailed += 1;
      proactiveChatLogFailed += 1;
      console.error("Koda proactive chat-history insert failed:", {
        userId: checkinUser.user_id,
        code: chatMessageError.code,
        message: chatMessageError.message,
      });
      continue;
    }

    proactiveChatLogged += 1;

    const { error: checkinUpdateError } = await supabaseAdmin
      .from("user_settings")
      .update({ last_ai_checkin: nowIso })
      .eq("user_id", checkinUser.user_id)
      .lte("last_ai_checkin", checkinCutoff);

    if (checkinUpdateError) {
      proactiveFailed += 1;
      console.error("Koda check-in timestamp update failed:", {
        userId: checkinUser.user_id,
        code: checkinUpdateError.code,
        message: checkinUpdateError.message,
      });
      continue;
    }

    checkinsUpdated += 1;
  }

  return NextResponse.json({
    due: dueReminders.length,
    processed,
    notificationsSent,
    failed,
    withoutSubscription,
    updateFailed,
    proactiveEligible: checkinUsers.length,
    proactiveGenerated,
    proactiveSent,
    proactiveFailed,
    proactiveWithoutSubscription,
    proactiveContextFailed,
    proactiveChatLogged,
    proactiveChatLogFailed,
    checkinsUpdated,
  });
}
