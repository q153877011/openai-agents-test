/**
 * Agent handler — EdgeOne Pages Functions
 * ========================================
 *
 * File path agents/chat/index.ts maps to **POST /chat**
 * (EdgeOne Pages Functions routing convention: directory name = route, index = default entry)
 *
 * Files starting with _ (e.g. _model.ts) are private modules, not mapped as public routes.
 *
 * context convention:
 *   context.request.body    — object, request body
 *   context.request.signal  — AbortSignal, set when /chat/stop is called
 *   context.conversationId  — conversation ID
 *   context.runId           — current run ID
 */

import { run, Agent, type Session } from '@openai/agents';
import { createLlmModel } from '../_model';
import { createLogger } from '../_logger';
import { createTools } from '../_tools';

const logger = createLogger('chat');

// ========== Agent ==========
type RuntimeEnv = Record<string, string | undefined>;

function createAgent(env: RuntimeEnv) {
  return new Agent({
    name: 'Assistant',
    instructions: 'You are a helpful assistant. Use the available tools to answer questions.',
    tools: createTools(),
    model: createLlmModel(env),
  });
}

// ========== SSE Helper ==========
const encoder = new TextEncoder();

function sseFrame(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ========== Event Stream Generator ==========
/**
 * Async generator that yields SSE frames from the agent stream.
 * Accepts AbortSignal to enable cancellation — when aborted,
 * the for-await loop breaks naturally and the SDK releases its connection.
 *
 * The SDK session handles memory read/write automatically when provided.
 */
async function* eventStream(
  agentInstance: Agent,
  message: string,
  signal?: AbortSignal,
  session?: Session,
): AsyncGenerator<string, void> {
  const result = await run(agentInstance, message, { stream: true, signal, session });

  for await (const event of result.toStream()) {
    // Check abort between each event
    if (signal?.aborted) break;

    // Raw token delta → push per-character
    if (
      event.type === 'raw_model_stream_event' &&
      (event as any).data?.type === 'output_text_delta'
    ) {
      const delta = (event as any).data.delta as string;
      logger.log(`[stream] text_delta: ${JSON.stringify(delta)}`);
      yield sseFrame('text_delta', { delta });
    }

    // Semantic event → tool called
    if (event.type === 'run_item_stream_event' && (event as any).name === 'tool_called') {
      const toolName: string | null =
        (event as any).item?.name ??
        (event as any).item?.rawItem?.name ??
        null;
      if (toolName) {
        logger.log(`[stream] tool_called: ${toolName}`);
        yield sseFrame('tool_called', { tool: toolName });
      }
    }
  }

}

// ========== Core Handler ==========
/**
 * EdgeOne Pages Functions entry point.
 *
 * Uses the same pattern as the reference deepagents-test-starter/agents/stream.ts:
 *   - An async generator (eventStream) produces SSE frames
 *   - A ReadableStream feeds chunks to the Response
 *   - Cancel signal (from /chat/stop) breaks the for-await loop,
 *     which propagates to the SDK's internal stream and truly releases
 *     the upstream LLM connection
 */
export async function onRequest(context: any) {
  const body = context.request.body ?? {};
  const message = body.message as string | undefined;

  if (!message) {
    return new Response(
      JSON.stringify({ error: "'message' is required" }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Get platform cancel signal (AbortSignal), set when /chat/stop is called
  const signal: AbortSignal | undefined = context.request.signal;

  // Use EdgeOne CLI built-in store session adapter for persistence
  const store = context.store ?? null;
  const conversationId: string = context.conversation_id ?? '';
  const session: Session | undefined = store && conversationId
    ? store.openaiSession(conversationId)
    : undefined;

  const agent = createAgent(context.env ?? {});
  let stopped = false;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const gen = eventStream(agent, message, signal, session);
        let next = await gen.next();
        while (!next.done) {
          if (signal?.aborted) {
            stopped = true;
            break;
          }
          controller.enqueue(encoder.encode(next.value));
          next = await gen.next();
        }
      } catch (e: unknown) {
        const error = e as Error;
        if (error.name === 'AbortError' || signal?.aborted) {
          stopped = true;
          logger.log('[stream] aborted by user');
        } else {
          logger.error('[stream] error:', error.message, error.stack);
          controller.enqueue(
            encoder.encode(sseFrame('error', { message: String(error.message ?? e) })),
          );
        }
      } finally {
        // Send done frame
        controller.enqueue(encoder.encode(sseFrame('done', { stopped })));
        controller.close();
      }
    },
    cancel() {
      // Triggered when client disconnects
      logger.log('[stream] client disconnected');
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
