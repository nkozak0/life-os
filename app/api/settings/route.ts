import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SettingsRequestBody = {
  preferred_name?: unknown;
  current_focus?: unknown;
};

const maximumPreferredNameLength = 80;
const maximumCurrentFocusLength = 600;

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

export async function GET() {
  const { supabase, userId } = await getAuthenticatedClient();

  if (!userId) {
    return NextResponse.json(
      { error: "You must be signed in to view settings." },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("user_settings")
    .select("preferred_name, current_focus")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Settings lookup failed:", {
      userId,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: "Settings could not be loaded." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      settings: {
        preferred_name: data?.preferred_name ?? "",
        current_focus: data?.current_focus ?? "",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  const { supabase, userId } = await getAuthenticatedClient();

  if (!userId) {
    return NextResponse.json(
      { error: "You must be signed in to update settings." },
      { status: 401 },
    );
  }

  let body: SettingsRequestBody;

  try {
    body = (await request.json()) as SettingsRequestBody;
  } catch {
    return NextResponse.json(
      { error: "The request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (
    typeof body.preferred_name !== "string" ||
    typeof body.current_focus !== "string"
  ) {
    return NextResponse.json(
      {
        error:
          "Preferred name and current focus must be text values.",
      },
      { status: 400 },
    );
  }

  const preferredName = body.preferred_name.trim();
  const currentFocus = body.current_focus.trim();

  if (preferredName.length > maximumPreferredNameLength) {
    return NextResponse.json(
      {
        error: `Preferred name must be ${maximumPreferredNameLength} characters or fewer.`,
      },
      { status: 400 },
    );
  }

  if (currentFocus.length > maximumCurrentFocusLength) {
    return NextResponse.json(
      {
        error: `Current focus must be ${maximumCurrentFocusLength} characters or fewer.`,
      },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("user_settings")
    .upsert(
      {
        user_id: userId,
        preferred_name: preferredName || null,
        current_focus: currentFocus || null,
      },
      {
        onConflict: "user_id",
      },
    )
    .select("preferred_name, current_focus")
    .single();

  if (error) {
    console.error("Settings update failed:", {
      userId,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: "Settings could not be saved." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    settings: {
      preferred_name: data.preferred_name ?? "",
      current_focus: data.current_focus ?? "",
    },
  });
}

