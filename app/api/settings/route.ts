import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SettingsRequestBody = {
  preferred_name?: unknown;
  current_focus?: unknown;
  accountability_roast_level?: unknown;
  default_calendar_view?: unknown;
  semester_start?: unknown;
  semester_end?: unknown;
  weight_unit?: unknown;
  default_rest_seconds?: unknown;
};

type SettingsPayload = {
  user_id: string;
  preferred_name?: string | null;
  current_focus?: string | null;
  accountability_roast_level?: string;
  default_calendar_view?: string;
  semester_start?: string | null;
  semester_end?: string | null;
  weight_unit?: string;
  default_rest_seconds?: number;
};

const settingsColumns =
  "preferred_name, current_focus, accountability_roast_level, default_calendar_view, semester_start, semester_end, weight_unit, default_rest_seconds";
const maximumPreferredNameLength = 80;
const maximumCurrentFocusLength = 600;
const roastLevels = ["gentle", "standard", "unhinged"] as const;
const calendarViews = ["day", "week", "month"] as const;
const weightUnits = ["lbs", "kg"] as const;

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

function isOneOf<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
): value is T {
  return (
    typeof value === "string" &&
    allowedValues.includes(value as T)
  );
}

function parseDate(value: unknown) {
  if (typeof value !== "string") {
    return {
      valid: false,
      value: null,
    } as const;
  }

  if (!value) {
    return {
      valid: true,
      value: null,
    } as const;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return {
      valid: false,
      value: null,
    } as const;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return {
    valid: isValid,
    value: isValid ? value : null,
  } as const;
}

function serializeSettings(
  data:
    | {
        preferred_name?: string | null;
        current_focus?: string | null;
        accountability_roast_level?: string | null;
        default_calendar_view?: string | null;
        semester_start?: string | null;
        semester_end?: string | null;
        weight_unit?: string | null;
        default_rest_seconds?: number | null;
      }
    | null,
) {
  return {
    preferred_name: data?.preferred_name ?? "",
    current_focus: data?.current_focus ?? "",
    accountability_roast_level:
      data?.accountability_roast_level ?? "standard",
    default_calendar_view:
      data?.default_calendar_view ?? "month",
    semester_start: data?.semester_start ?? "",
    semester_end: data?.semester_end ?? "",
    weight_unit: data?.weight_unit ?? "lbs",
    default_rest_seconds: data?.default_rest_seconds ?? 90,
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
    .select(settingsColumns)
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
      settings: serializeSettings(data),
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

  const payload: SettingsPayload = {
    user_id: userId,
  };
  let changedFields = 0;

  if (Object.hasOwn(body, "preferred_name")) {
    if (typeof body.preferred_name !== "string") {
      return NextResponse.json(
        { error: "Preferred name must be a text value." },
        { status: 400 },
      );
    }

    const preferredName = body.preferred_name.trim();

    if (preferredName.length > maximumPreferredNameLength) {
      return NextResponse.json(
        {
          error: `Preferred name must be ${maximumPreferredNameLength} characters or fewer.`,
        },
        { status: 400 },
      );
    }

    payload.preferred_name = preferredName || null;
    changedFields += 1;
  }

  if (Object.hasOwn(body, "current_focus")) {
    if (typeof body.current_focus !== "string") {
      return NextResponse.json(
        { error: "Current focus must be a text value." },
        { status: 400 },
      );
    }

    const currentFocus = body.current_focus.trim();

    if (currentFocus.length > maximumCurrentFocusLength) {
      return NextResponse.json(
        {
          error: `Current focus must be ${maximumCurrentFocusLength} characters or fewer.`,
        },
        { status: 400 },
      );
    }

    payload.current_focus = currentFocus || null;
    changedFields += 1;
  }

  if (Object.hasOwn(body, "accountability_roast_level")) {
    if (
      !isOneOf(
        body.accountability_roast_level,
        roastLevels,
      )
    ) {
      return NextResponse.json(
        { error: "Select a valid accountability roast level." },
        { status: 400 },
      );
    }

    payload.accountability_roast_level =
      body.accountability_roast_level;
    changedFields += 1;
  }

  if (Object.hasOwn(body, "default_calendar_view")) {
    if (
      !isOneOf(body.default_calendar_view, calendarViews)
    ) {
      return NextResponse.json(
        { error: "Select a valid default calendar view." },
        { status: 400 },
      );
    }

    payload.default_calendar_view = body.default_calendar_view;
    changedFields += 1;
  }

  const includesSemesterStart = Object.hasOwn(
    body,
    "semester_start",
  );
  const includesSemesterEnd = Object.hasOwn(body, "semester_end");
  let semesterStart: ReturnType<typeof parseDate> | null = null;
  let semesterEnd: ReturnType<typeof parseDate> | null = null;

  if (includesSemesterStart) {
    semesterStart = parseDate(body.semester_start);

    if (!semesterStart.valid) {
      return NextResponse.json(
        { error: "Semester start must be a valid date." },
        { status: 400 },
      );
    }

    payload.semester_start = semesterStart.value;
    changedFields += 1;
  }

  if (includesSemesterEnd) {
    semesterEnd = parseDate(body.semester_end);

    if (!semesterEnd.valid) {
      return NextResponse.json(
        { error: "Semester end must be a valid date." },
        { status: 400 },
      );
    }

    payload.semester_end = semesterEnd.value;
    changedFields += 1;
  }

  if (includesSemesterStart || includesSemesterEnd) {
    const { data: existingSettings, error: existingError } =
      await supabase
        .from("user_settings")
        .select("semester_start, semester_end")
        .eq("user_id", userId)
        .maybeSingle();

    if (existingError) {
      console.error("Semester settings lookup failed:", {
        userId,
        code: existingError.code,
        message: existingError.message,
      });
      return NextResponse.json(
        { error: "Settings could not be validated." },
        { status: 500 },
      );
    }

    const nextStart = includesSemesterStart
      ? semesterStart?.value
      : existingSettings?.semester_start;
    const nextEnd = includesSemesterEnd
      ? semesterEnd?.value
      : existingSettings?.semester_end;

    if (nextStart && nextEnd && nextEnd < nextStart) {
      return NextResponse.json(
        {
          error:
            "Semester end must be on or after semester start.",
        },
        { status: 400 },
      );
    }
  }

  if (Object.hasOwn(body, "weight_unit")) {
    if (!isOneOf(body.weight_unit, weightUnits)) {
      return NextResponse.json(
        { error: "Select a valid weight unit." },
        { status: 400 },
      );
    }

    payload.weight_unit = body.weight_unit;
    changedFields += 1;
  }

  if (Object.hasOwn(body, "default_rest_seconds")) {
    if (
      typeof body.default_rest_seconds !== "number" ||
      !Number.isInteger(body.default_rest_seconds) ||
      body.default_rest_seconds < 15 ||
      body.default_rest_seconds > 900
    ) {
      return NextResponse.json(
        {
          error:
            "Default rest timer must be an integer between 15 and 900 seconds.",
        },
        { status: 400 },
      );
    }

    payload.default_rest_seconds =
      body.default_rest_seconds;
    changedFields += 1;
  }

  if (changedFields === 0) {
    return NextResponse.json(
      { error: "No supported settings were provided." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("user_settings")
    .upsert(payload, {
      onConflict: "user_id",
    })
    .select(settingsColumns)
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
    settings: serializeSettings(data),
  });
}
