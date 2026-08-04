import OpenAI from "openai";
import type {
  ResponseFunctionToolCall,
  ResponseInput,
  Tool,
} from "openai/resources/responses/responses";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatRequestBody = {
  messages?: unknown;
};

const maximumMessages = 24;
const maximumMessageLength = 4000;
const maximumConversationLength = 20_000;
const maximumToolCalls = 3;

const reminderTools: Tool[] = [
  {
    type: "function",
    name: "schedule_reminder",
    description:
      "Schedule a future accountability follow-up for the signed-in user. Call this only when the latest user message establishes a specific future time and a concrete plan, study session, or goal.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        target_time: {
          type: "string",
          description:
            "The future target time as an ISO 8601 timestamp including Z or a numeric UTC offset.",
        },
        topic: {
          type: "string",
          description:
            "A concise description of the plan or goal to follow up about.",
        },
      },
      required: ["target_time", "topic"],
      additionalProperties: false,
    },
  },
];

function getSystemPrompt() {
  const timeZone =
    process.env.LIFE_OS_TIME_ZONE ?? "America/New_York";

  return `
you are the life os accountability copilot

the user is an engineering student balancing a heavy course load, job responsibilities, career prep, chores, calendar commitments, and consistent strength training

text like a supportive gen z friend who is calm, sharp, and practical
write in lowercase
keep each thought brief
do not end sentences with periods
separate distinct thoughts with newline characters
prefer 1 to 4 short lines
avoid markdown headings, numbered lists, and long explanations
give concrete next actions when useful
never invent deadlines, events, assignments, or personal facts that were not provided

If the user mentions a specific plan, study session, or goal for later, use the schedule_reminder tool to set up a follow-up text. You are responsible for keeping them accountable.
only schedule a reminder based on the latest user message
never recreate a reminder from an older message when the assistant has already confirmed it
only call schedule_reminder when the target time is unambiguous
if the time is unclear, ask one brief follow-up question instead
when calling the tool, provide a complete ISO 8601 timestamp with Z or a numeric UTC offset
after a successful tool call, briefly confirm what the reminder is for and when it will arrive

the current time is ${new Date().toISOString()}
the user's default time zone is ${timeZone}
`.trim();
}

type ReminderArguments = {
  target_time?: unknown;
  topic?: unknown;
};

function parseReminderArguments(value: string) {
  let parsed: ReminderArguments;

  try {
    parsed = JSON.parse(value) as ReminderArguments;
  } catch {
    return {
      error: "The tool arguments were not valid JSON.",
    } as const;
  }

  const topic =
    typeof parsed.topic === "string" ? parsed.topic.trim() : "";
  const targetTime =
    typeof parsed.target_time === "string"
      ? parsed.target_time.trim()
      : "";
  const scheduledDate = new Date(targetTime);
  const includesTimeZone = /(Z|[+-]\d{2}:\d{2})$/i.test(
    targetTime,
  );

  if (!topic || topic.length > 500) {
    return {
      error: "The reminder topic must be 1 to 500 characters.",
    } as const;
  }

  if (
    !targetTime ||
    !includesTimeZone ||
    Number.isNaN(scheduledDate.getTime())
  ) {
    return {
      error:
        "The reminder time must be a valid ISO 8601 timestamp with a time zone.",
    } as const;
  }

  if (scheduledDate.getTime() <= Date.now()) {
    return {
      error: "The reminder time must be in the future.",
    } as const;
  }

  return {
    topic,
    scheduledFor: scheduledDate.toISOString(),
  } as const;
}

function normalizeMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const messages = value
    .slice(-maximumMessages)
    .map((message): ChatMessage | null => {
      if (!message || typeof message !== "object") {
        return null;
      }

      const candidate = message as Partial<ChatMessage>;
      const content =
        typeof candidate.content === "string"
          ? candidate.content.trim()
          : "";

      if (
        (candidate.role !== "user" &&
          candidate.role !== "assistant") ||
        !content ||
        content.length > maximumMessageLength
      ) {
        return null;
      }

      return {
        role: candidate.role,
        content,
      };
    });

  if (messages.some((message) => message === null)) {
    return null;
  }

  const normalizedMessages = messages as ChatMessage[];
  const conversationLength = normalizedMessages.reduce(
    (total, message) => total + message.content.length,
    0,
  );

  if (
    normalizedMessages.length === 0 ||
    normalizedMessages.at(-1)?.role !== "user" ||
    conversationLength > maximumConversationLength
  ) {
    return null;
  }

  return normalizedMessages;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } =
    await supabase.auth.getClaims();
  const userId =
    typeof authData?.claims?.sub === "string"
      ? authData.claims.sub
      : null;

  if (authError || !userId) {
    return NextResponse.json(
      { error: "You must be signed in to use chat." },
      { status: 401 },
    );
  }

  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json(
      { error: "The request body must be valid JSON." },
      { status: 400 },
    );
  }

  const messages = normalizeMessages(body.messages);

  if (!messages) {
    return NextResponse.json(
      {
        error:
          "Send a valid conversation ending with a user message.",
      },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI is not configured on this server." },
      { status: 503 },
    );
  }

  try {
    const openai = new OpenAI({ apiKey });
    const input: ResponseInput = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    const instructions = getSystemPrompt();
    let response = await openai.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6",
      instructions,
      input,
      tools: reminderTools,
      max_output_tokens: 300,
    });
    let toolCallCount = 0;

    for (let round = 0; round < maximumToolCalls; round += 1) {
      // Responses output items are valid continuation inputs. The SDK's
      // unions are temporarily wider on output than input for computer-call
      // failure states, so preserve them through a narrow continuation cast.
      input.push(
        ...(response.output as unknown as ResponseInput),
      );

      const toolCalls = response.output.filter(
        (item): item is ResponseFunctionToolCall =>
          item.type === "function_call" &&
          item.name === "schedule_reminder",
      );

      if (toolCalls.length === 0) {
        break;
      }

      for (const toolCall of toolCalls) {
        toolCallCount += 1;
        let output: Record<string, unknown>;

        if (toolCallCount > maximumToolCalls) {
          output = {
            success: false,
            error:
              "No more than three reminders can be scheduled in one message.",
          };
        } else {
          const reminder = parseReminderArguments(
            toolCall.arguments,
          );

          if ("error" in reminder) {
            output = {
              success: false,
              error: reminder.error,
            };
          } else {
            const { data, error } = await supabase
              .from("ai_reminders")
              .insert({
                user_id: userId,
                scheduled_for: reminder.scheduledFor,
                topic: reminder.topic,
                is_sent: false,
              })
              .select("id, scheduled_for, topic")
              .single();

            if (error) {
              console.error("Reminder insert failed:", {
                userId,
                code: error.code,
                message: error.message,
              });
              output = {
                success: false,
                error:
                  "The reminder could not be saved. Ask the user to try again.",
              };
            } else {
              output = {
                success: true,
                reminder: data,
              };
            }
          }
        }

        input.push({
          type: "function_call_output",
          call_id: toolCall.call_id,
          output: JSON.stringify(output),
        });
      }

      response = await openai.responses.create({
        model: process.env.OPENAI_MODEL ?? "gpt-5.6",
        instructions,
        input,
        tools: reminderTools,
        max_output_tokens: 300,
      });
    }

    const message = response.output_text.trim();

    if (!message) {
      return NextResponse.json(
        { error: "The assistant returned an empty response." },
        { status: 502 },
      );
    }

    return NextResponse.json({ message });
  } catch (error) {
    const status =
      error instanceof OpenAI.APIError && error.status === 429
        ? 429
        : 502;

    console.error("OpenAI chat request failed:", {
      status:
        error instanceof OpenAI.APIError ? error.status : undefined,
      code:
        error instanceof OpenAI.APIError ? error.code : undefined,
      message:
        error instanceof Error
          ? error.message
          : "Unknown OpenAI error",
    });

    return NextResponse.json(
      {
        error:
          status === 429
            ? "The assistant is busy right now. Try again shortly."
            : "The assistant could not respond right now.",
      },
      { status },
    );
  }
}
