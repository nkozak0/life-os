import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data: { session } } = await supabase.auth.getSession();
    const providerToken = session?.provider_token;

    if (!providerToken) {
      return NextResponse.json({ error: "No provider token found." }, { status: 401 });
    }

    const headers = {
      Authorization: `Bearer ${providerToken}`,
      'Content-Type': 'application/json',
    };

    const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", { headers });
    const listData = await listRes.json();

    if (!listRes.ok) {
      throw new Error(listData.error?.message || "Failed to fetch calendar list");
    }

    // Set fetch window: 1 month ago to 6 months from now
    const timeMin = new Date();
    timeMin.setMonth(timeMin.getMonth() - 1);
    
    const timeMax = new Date();
    timeMax.setMonth(timeMax.getMonth() + 6);

    const eventPromises = (listData.items || []).map(async (calendar: any) => {
      // Increased maxResults to 250 per calendar and added timeMax
      const eventsRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&maxResults=250&singleEvents=true&orderBy=startTime`,
        { headers }
      );
      
      const eventsData = await eventsRes.json();
      
      return (eventsData.items || []).map((event: any) => ({
        ...event,
        calendarName: calendar.summary,
        calendarColor: calendar.backgroundColor
      }));
    });

    const allEventsArrays = await Promise.all(eventPromises);
    let allEvents = allEventsArrays.flat();

    allEvents.sort((a, b) => {
      const dateA = new Date(a.start?.dateTime || a.start?.date).getTime();
      const dateB = new Date(b.start?.dateTime || b.start?.date).getTime();
      return dateA - dateB;
    });

    // Removed the .slice() limit so it returns EVERYTHING in that 7-month window
    return NextResponse.json({ events: allEvents });

  } catch (error: any) {
    console.error("Calendar fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}