import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pageSize = 500;
const deleteBatchSize = 100;

export async function DELETE() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();
  const userId =
    typeof authData?.claims?.sub === "string" ? authData.claims.sub : null;

  if (authError || !userId) {
    return NextResponse.json(
      { error: "You must be signed in to clear workout history." },
      { status: 401 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Workout history deletion is not configured." },
      { status: 500 },
    );
  }

  const supabaseAdmin = createSupabaseAdmin(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const workoutIds: string[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("workouts")
      .select("id")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("Workout history lookup failed:", {
        userId,
        code: error.code,
        message: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const page = (data ?? []) as { id: string }[];
    workoutIds.push(...page.map((workout) => workout.id));

    if (page.length < pageSize) {
      break;
    }
  }

  if (workoutIds.length === 0) {
    return NextResponse.json({
      workoutsDeleted: 0,
      setsDeleted: 0,
    });
  }

  let setsDeleted = 0;

  for (let index = 0; index < workoutIds.length; index += deleteBatchSize) {
    const workoutIdBatch = workoutIds.slice(index, index + deleteBatchSize);
    const { data, error } = await supabaseAdmin
      .from("workout_sets")
      .delete()
      .in("workout_id", workoutIdBatch)
      .select("id");

    if (error) {
      console.error("Workout set history deletion failed:", {
        userId,
        code: error.code,
        message: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    setsDeleted += data?.length ?? 0;
  }

  const { data: deletedWorkouts, error: workoutDeleteError } =
    await supabaseAdmin
      .from("workouts")
      .delete()
      .eq("user_id", userId)
      .select("id");

  if (workoutDeleteError) {
    console.error("Workout history deletion failed:", {
      userId,
      code: workoutDeleteError.code,
      message: workoutDeleteError.message,
    });
    return NextResponse.json(
      { error: workoutDeleteError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    workoutsDeleted: deletedWorkouts?.length ?? 0,
    setsDeleted,
  });
}
