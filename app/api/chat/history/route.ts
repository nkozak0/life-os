import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const { data: authData, error: authError } =
    await supabase.auth.getClaims();
  const userId =
    typeof authData?.claims?.sub === "string"
      ? authData.claims.sub
      : null;

  return {
    supabase,
    userId: authError ? null : userId,
  };
}

export async function GET() {
  const { supabase, userId } = await getAuthenticatedClient();

  if (!userId) {
    return NextResponse.json(
      { error: "You must be signed in to load chat history." },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Chat history lookup failed:", {
      userId,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: "Chat history could not be loaded." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      messages: [...(data ?? [])].reverse(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function DELETE() {
  const { supabase, userId } = await getAuthenticatedClient();

  if (!userId) {
    return NextResponse.json(
      { error: "You must be signed in to clear chat history." },
      { status: 401 },
    );
  }

  const { error, count } = await supabase
    .from("chat_messages")
    .delete({ count: "exact" })
    .eq("user_id", userId);

  if (error) {
    console.error("Chat history delete failed:", {
      userId,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: "Chat history could not be cleared." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    deleted: count ?? 0,
  });
}
