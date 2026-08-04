import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE() {
  const supabase = await createClient();
  const { data: authData, error: authError } =
    await supabase.auth.getClaims();
  const userId =
    typeof authData?.claims?.sub === "string"
      ? authData.claims.sub
      : null;

  if (authError || !userId) {
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
