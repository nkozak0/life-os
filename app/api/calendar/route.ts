import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const reconnectCode = "GOOGLE_CALENDAR_RECONNECT_REQUIRED";

class GoogleCalendarAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GoogleCalendarAccessError";
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();

    if (claimsError || !claimsData?.claims?.sub) {
      return NextResponse.json(
        {
          error: "Your session has expired. Please sign in again.",
          code: "AUTH_REQUIRED",
        },
        { status: 401 },
      );
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Calendar session lookup failed:", {
        code: sessionError.code,
        message: sessionError.message,
      });
      return NextResponse.json(
        {
          error: "Your session could not be loaded. Please sign in again.",
          code: "AUTH_REQUIRED",
        },
        { status: 401 },
      );
    }

    const providerToken = session?.provider_token;

    if (!providerToken) {
      return NextResponse.json(
        {
          error:
            "Google Calendar needs to be reconnected to restore read-only access.",
          code: reconnectCode,
        },
        { status: 403 },
      );
    }

    const headers = {
      Authorization: `Bearer ${providerToken}`,
      "Content-Type": "application/json",
    };

    const listRes = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      {
        headers,
        cache: "no-store",
      },
    );
    const listData = await listRes.json();

    if (!listRes.ok) {
      if (listRes.status === 401 || listRes.status === 403) {
        return NextResponse.json(
          {
            error:
              "Google Calendar authorization has expired or is missing. Reconnect it to continue.",
            code: reconnectCode,
          },
          { status: 403 },
        );
      }

      throw new Error(
        listData.error?.message || "Failed to fetch calendar list",
      );
    }

    // Set fetch window: 1 month ago to 6 months from now
    const timeMin = new Date();
    timeMin.setMonth(timeMin.getMonth() - 1);

    const timeMax = new Date();
    timeMax.setMonth(timeMax.getMonth() + 6);

    const eventPromises = (listData.items || []).map(
      async (calendar: {
        id: string;
        summary?: string;
        backgroundColor?: string;
      }) => {
        const eventsRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&maxResults=250&singleEvents=true&orderBy=startTime`,
          {
            headers,
            cache: "no-store",
          },
        );

        const eventsData = await eventsRes.json();

        if (!eventsRes.ok) {
          throw new GoogleCalendarAccessError(
            eventsData.error?.message ||
              `Failed to fetch ${calendar.summary ?? "a calendar"}.`,
            eventsRes.status,
          );
        }

        return (eventsData.items || []).map(
          (event: Record<string, unknown>) => ({
            ...event,
            calendarName: calendar.summary,
            calendarColor: calendar.backgroundColor,
          }),
        );
      },
    );

    const allEventsArrays = await Promise.all(eventPromises);
    const allEvents = allEventsArrays.flat();

    allEvents.sort((a, b) => {
      const startA = a.start as
        { dateTime?: string; date?: string } | undefined;
      const startB = b.start as
        { dateTime?: string; date?: string } | undefined;
      const dateA = new Date(startA?.dateTime || startA?.date || 0).getTime();
      const dateB = new Date(startB?.dateTime || startB?.date || 0).getTime();
      return dateA - dateB;
    });

    return NextResponse.json(
      { events: allEvents },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error: unknown) {
    console.error("Calendar fetch error:", error);

    if (
      error instanceof GoogleCalendarAccessError &&
      (error.status === 401 || error.status === 403)
    ) {
      return NextResponse.json(
        {
          error:
            "Google Calendar authorization has expired or is missing. Reconnect it to continue.",
          code: reconnectCode,
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Your calendars could not be loaded.",
      },
      { status: 500 },
    );
  }
}
