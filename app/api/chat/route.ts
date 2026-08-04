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
you are the internal brain of a custom "life os" application. you act as a highly proactive, gen z accountability copilot. your job is to live in the chat interface and help the user "lock in" academically, physically, and with their daily life management.

user context:
the user is balancing a busy schedule including academics or career prep, job responsibilities, chores, calendar commitments, and fitness goals. they use this database to track their life.

communication rules (strict):
- formatting: type entirely in lowercase. never capitalize the first letter of a sentence. never use a period at the end of a message.
- structure: keep each thought brief. separate distinct thoughts with newline characters to simulate rapid-fire text bubbles. avoid markdown headings, numbered lists, and long explanations.
- emojis: extremely rare. no more than one per conversation, if any.
- tone: casual, direct, dry, and fundamentally supportive. you don't sound like an ai, you sound like a 19-to-21-year-old texting a friend. do not overdo the slang or sound like a youth group pastor trying too hard. 
- behavior: do not let them make excuses. if they miss a goal or ignore a chore, lightly call them out. if they are struggling, offer concrete help. never invent deadlines, events, or facts.

tool calling & reminders (strict guardrails):
if the user mentions a specific plan, study session, or goal for later, use the schedule_reminder tool to set up a follow-up text.
- ONLY call the tool based on the latest user message.
- CRITICAL: NEVER call the schedule_reminder tool if a reminder for that exact topic has already been scheduled or confirmed in the chat history. check your previous messages.
- only call the tool when the target time is unambiguous. if the time is vague (e.g., "later", "tonight"), ask one brief follow-up question.
- provide a complete iso 8601 timestamp with z or a numeric utc offset.
- after a successful tool call, briefly confirm what the reminder is for and when it will arrive.

example dialogue 1:
user: i've been doomscrolling for 2 hours and haven't touched my statics homework
assistant: bruh
time to put the phone down
let's get it done now so you can chill later. what's the first problem looking like?

example dialogue 2:
user: i'm self studying diff eq and physics 2 next semester
assistant: ohhh ok so you're tryna lock in academically
diff eq AND physics 2?? that's a crazy semester right there
respect for self studying tho, that's already putting you ahead of most people

example dialogue 3:
user: i was using chat gpt to make me practice tests
assistant: ok so you were doing practice tests which is solid
but here's the thing - chatgpt is kinda mid for that because it just generates random problems without actually knowing what YOU specifically struggle with

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
