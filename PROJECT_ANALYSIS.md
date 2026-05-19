# OpenAI Agent Starter - Complete Project Analysis

## Project Overview

This is an **EdgeOne Pages Functions** serverless application that combines:
- **Python backend**: OpenAI Agents SDK with streaming chat handler
- **React frontend**: Real-time chat UI with tool visualization
- **EdgeOne Pages**: Tencent's serverless platform for running functions

The project implements a **conversational AI agent** with tool capabilities, conversation memory, and real-time streaming responses.

---

## 🏗️ Project Structure

```
openAI-agent-starter-python/
├── agents/                          # Python backend source (user code)
│   ├── chat/
│   │   ├── index.py                # Main /chat handler (AsyncGenerator streaming)
│   │   ├── stop.py                 # /chat/stop cancel handler
│   │   ├── _model.py               # LLM client config (private)
│   │   ├── _session.py             # EdgeOne session adapter (private)
│   │   └── _logger.py              # Logging utility (private)
│   └── history/
│       └── index.py                # /history handler (fetch conversation)
├── src/                            # React frontend source
│   ├── App.tsx                     # Main app component
│   ├── api.ts                      # API client (SSE + REST)
│   ├── types.ts                    # TypeScript interfaces
│   ├── main.tsx                    # React entry point
│   └── components/
│       ├── ChatWindow.tsx
│       ├── ChatBubble.tsx
│       ├── ChatInput.tsx
│       ├── ToolIndicators.tsx
│       ├── ToolLamp.tsx
│       └── CodeViewer.tsx
├── .edgeone/                       # EdgeOne dev environment
│   ├── project.json                # Project metadata
│   ├── agent-python/               # Compiled Python runtime
│   │   ├── main.py                 # Entry point
│   │   ├── config.json             # Route configuration
│   │   ├── requirements.txt        # Dependencies
│   │   └── pages_agents/           # Compiled agents code
│   └── assets/                     # Built frontend
├── .env                            # Environment variables
├── package.json                    # Node dependencies
├── uv.toml                         # Python dependency management (uv)
├── vite.config.ts                  # Frontend build config
├── tsconfig.json                   # TypeScript config
└── .edgeone/project.json          # EdgeOne project ID

Key directories:
- agents/        → Python source (mapped to routes by directory structure)
- src/          → React source (compiled to .edgeone/assets/)
- .edgeone/     → Local dev environment (git-ignored)
- .env          → Sensitive config (git-ignored)
```

---

## 1️⃣ The /chat Endpoint Handler

### File: `agents/chat/index.py`

**Route Mapping**: `agents/chat/index.py` → `POST /chat`

#### Handler Signature
```python
async def handler(context: Any) -> AsyncGenerator[str, None]:
```

**Returns**: An async generator that yields SSE-formatted event strings

#### Key Components

##### 1.1 Context Object
The `context` parameter provides platform integration:
```python
context.conversation_id      # Unique session ID (string)
context.request.body        # Request JSON dict
context.request.signal      # asyncio.Event (set when cancel triggered)
context.store              # KV store for persistence
context.utils.abort_active_run()  # Function to abort LLM calls
```

##### 1.2 Input Validation
```python
body = context.request.body
message = body.get("message") if isinstance(body, dict) else None
if not message:
    yield sse_event("error", {"message": "'message' is required"})
    yield sse_event("done", {})
    return
```

##### 1.3 Session Creation (Conversation Memory)
```python
store = getattr(context, "store", None)
if store is not None and hasattr(store, "openai_session"):
    session = store.openai_session(cid)
elif store is not None:
    session = EdgeOneSession(store, cid)  # Adapter pattern
else:
    session = None
```

The `EdgeOneSession` class (in `_session.py`) adapts the platform's KV store to OpenAI's session protocol:
- `get_items()`: Loads conversation history from store
- `add_items()`: Saves messages, tool calls, and responses

##### 1.4 Agent & Tools Definition
```python
# Define 4 tools
@function_tool
def get_weather(city: str) -> str:
    return f"{city}: 晴天, 18-25°C, 微风"

@function_tool
def get_clothing_advice(weather: str) -> str:
    return "建议穿轻薄长袖外套..."

@function_tool
def translate_text(text: str, target_language: str) -> str:
    return translations.get(target_language, f"[Translated]: {text}")

@function_tool
def text_statistics(text: str) -> str:
    return f"字符数: {len(text)}, 词数: {len(text.split())}"

# Create agent
agent = Agent(
    name="Assistant",
    instructions="You are a helpful assistant. Use the available tools...",
    tools=[get_weather, get_clothing_advice, translate_text, text_statistics],
    model=llm_model,  # Configured in _model.py
)
```

##### 1.5 Streaming Loop (The Core)
```python
result = Runner.run_streamed(agent, input=message, session=session)
agen = _stream_events(result).__aiter__()

# Cancel signal from /chat/stop endpoint
cancel_signal = getattr(context.request, "signal", None) or asyncio.Event()
cancel_task = asyncio.ensure_future(cancel_signal.wait())

try:
    while True:
        if pending is None:
            pending = asyncio.ensure_future(agen.__anext__())

        # RACE CONDITION: 3-way wait with timeout
        done, _ = await asyncio.wait(
            {pending, cancel_task},
            timeout=HEARTBEAT_INTERVAL_S,  # 15 seconds
            return_when=asyncio.FIRST_COMPLETED,
        )

        # 1. Cancel signal triggered?
        if cancel_task in done:
            logger.log("[stream] cancel signal received; aborting stream")
            break

        # 2. Timeout (no event)?
        if not done:
            ts = int(time.time() * 1000)
            logger.log(f"[heartbeat] ping {ts}")
            yield sse_event("ping", {"ts": ts})  # Keep connection alive
            continue

        # 3. Got a stream event
        try:
            event_type, data = pending.result()
        except StopAsyncIteration:
            break
        pending = None

        yield sse_event(event_type, data)

finally:
    # CRITICAL CLEANUP: Must close the async generator
    if pending is not None and not pending.done():
        pending.cancel()
    if not cancel_task.done():
        cancel_task.cancel()
    try:
        await agen.aclose()  # Propagates GeneratorExit → closes LLM connection
    except Exception as e:
        logger.error("agen.aclose error:", str(e))

    yield sse_event("done", {"stopped": cancel_signal.is_set()})
```

##### 1.6 Event Stream Conversion
```python
async def _stream_events(result) -> AsyncGenerator[tuple[str, dict], None]:
    """Converts Runner stream events to SSE frames."""
    async for event in result.stream_events():
        # Token deltas (LLM output)
        if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
            logger.log(f"[stream] text_delta: {repr(event.data.delta)}")
            yield ("text_delta", {"delta": event.data.delta})

        # Tool calls (semantic events)
        elif event.type == "run_item_stream_event":
            if event.name == "tool_called":
                tool_name = (
                    getattr(event.item, "name", None)
                    or getattr(getattr(event.item, "raw_item", None), "name", None)
                )
                if tool_name:
                    logger.log(f"[stream] tool_called: {tool_name}")
                    yield ("tool_called", {"tool": tool_name})
```

---

## 2️⃣ Streaming Logic & Architecture

### 2.1 SSE Event Format

The handler yields **Server-Sent Events (SSE)** strings. Format:

```
event: <type>
data: <json>

```

Example stream:
```
event: text_delta
data: {"delta":"Hello"}

event: text_delta
data: {"delta":" "}

event: text_delta
data: {"delta":"world"}

event: tool_called
data: {"tool":"get_weather"}

event: ping
data: {"ts":1716139500000}

event: done
data: {"stopped":false}

```

### 2.2 Event Types

| Event | Format | When | Purpose |
|-------|--------|------|---------|
| `text_delta` | `{"delta": "token"}` | LLM streaming | Token-by-token output |
| `tool_called` | `{"tool": "name"}` | Tool invoked | UI indicator (lamp animation) |
| `ping` | `{"ts": ms}` | Every 15s idle | Heartbeat to prevent timeout |
| `error` | `{"message": "..."}` | Validation/failure | Error message |
| `done` | `{"stopped": bool}` | Stream end | Completion (stopped=true if cancelled) |

### 2.3 Streaming via asyncio.wait()

The handler uses a sophisticated **3-way race** pattern:

```python
await asyncio.wait(
    {pending, cancel_task},
    timeout=15,
    return_when=asyncio.FIRST_COMPLETED,
)
```

This simultaneously:
1. **Waits for next stream event** (`pending` task)
2. **Watches for cancel signal** (`cancel_task`)
3. **Checks timeout** (15 sec heartbeat)

**Who wins?**
- **Cancel signal** → Break immediately, yield "done" with stopped=true
- **Timeout** → Send heartbeat ping, reset timeout
- **Stream event** → Process and yield event

### 2.4 Generator Cleanup (Critical!)

```python
finally:
    try:
        await agen.aclose()  # Closes async generator
    except Exception as e:
        logger.error("agen.aclose error:", str(e))
```

When `aclose()` is called:
1. Propagates `GeneratorExit` into `_stream_events()` 
2. Stops iterating `result.stream_events()`
3. Closes the underlying `httpx` connection to LLM API
4. Aborts the LLM request (like AbortSignal in JS)
5. **Prevents resource leak** and runaway API calls

### 2.5 Session Integration (Automatic Memory)

OpenAI Agents SDK handles session automatically:

```python
result = Runner.run_streamed(agent, input=message, session=session)
```

**Behind the scenes:**
1. SDK calls `session.get_items()` → loads history
2. Injects history into the request
3. As events stream, SDK calls `session.add_items()` to save:
   - User message
   - Tool calls
   - Tool results
   - Assistant response

**EdgeOneSession adapter** (in `_session.py`):
- Converts platform's `ctx.store` to OpenAI session protocol
- Handles role mapping (user/assistant/tool)
- Supports both new (SDK items) and legacy (text) message formats

---

## 3️⃣ Connection/Agent Configuration

### 3.1 LLM Client Setup (`_model.py`)

```python
import os
from dotenv import load_dotenv
from openai import AsyncOpenAI
from agents import OpenAIChatCompletionsModel

load_dotenv()

# Initialize OpenAI client (or compatible API)
llm_client = AsyncOpenAI(
    api_key=os.getenv("AI_GATEWAY_API_KEY"),
    base_url=os.getenv("AI_GATEWAY_BASE_URL"),
)

# Wrap in OpenAI Agents SDK model
llm_model = OpenAIChatCompletionsModel(
    model=os.getenv("AI_GATEWAY_MODEL", "@Pages/hy3-preview"),
    openai_client=llm_client,
)
```

### 3.2 Environment Variables (`.env`)

```env
# EdgeOne Platform
API_ENV=test
EDGEONE_PAGES_API_TOKEN=QojhSyWK2D6J4b4uvFP/ZBOWv7AQuPiuDaxziRzFqjA=
PAGES_BLOB_LOCAL_PERSIST=1
OPENAI_AGENTS_DISABLE_TRACING=1

# LLM API Configuration
AI_GATEWAY_API_KEY=sk-tp-2WervuYfZpcCF2pPyUnmPx61zNBVZXMaZqHb6hWFeDRZRGM5
AI_GATEWAY_BASE_URL=https://api.lkeap.cloud.tencent.com/plan/v3
AI_GATEWAY_MODEL=hy3-preview
```

**Tencent Hunyuan API** (tokenhub.tencentmaas.com or api.lkeap.cloud.tencent.com)

### 3.3 Agent Configuration

```python
agent = Agent(
    name="Assistant",
    instructions="You are a helpful assistant. Use the available tools to answer questions.",
    tools=[
        get_weather,           # Tool 1
        get_clothing_advice,   # Tool 2
        translate_text,        # Tool 3
        text_statistics,       # Tool 4
    ],
    model=llm_model,          # LLM model from _model.py
)
```

**Tools** are decorated with `@function_tool` and provide:
- Name and description (auto-extracted from docstring)
- Parameters with type hints and descriptions
- Return value (converted to tool result)

### 3.4 Runner (Streaming Orchestrator)

```python
result = Runner.run_streamed(
    agent,
    input=message,
    session=session,  # Optional: for conversation memory
)
```

The `Runner` class:
- Orchestrates the agent execution
- Handles tool calling and results
- Streams events as LLM responds
- Manages session callbacks (get_items, add_items)

---

## 4️⃣ EdgeOne Pages Dev Configuration

### 4.1 Project Metadata (`.edgeone/project.json`)

```json
{
  "Name": "openai-node-starter",
  "ProjectId": "pages-edwz59jxjcnm"
}
```

**ProjectId** is the unique identifier for the EdgeOne project.

### 4.2 Route Configuration (`.edgeone/agent-python/config.json`)

```json
{
  "routes": [
    {
      "path": "/chat",
      "src": "^/chat$",
      "method": ["POST"],
      "isIndex": true
    },
    {
      "path": "/chat/stop",
      "src": "^/chat/stop$",
      "method": ["POST"],
      "isIndex": false
    },
    {
      "path": "/history",
      "src": "^/history$",
      "method": ["POST"],
      "isIndex": true
    }
  ]
}
```

**Route Mapping Rules:**
- `isIndex: true` → Maps `agents/<path>/index.py` to route
- `isIndex: false` → Maps `agents/<path>/<filename>.py` to route
- Files starting with `_` are **private** (not mapped)

### 4.3 Runtime Configuration (`.edgeone/agent-python/main.py`)

```python
# Route table: directory → module mapping
os.environ.setdefault('AGENT_ROUTE_TABLE', 
  '{"/chat":{"module":"pages_agents.chat.index","isIndex":true},'
   '/chat/stop":{"module":"pages_agents.chat.stop","isIndex":false},'
   '"/history":{"module":"pages_agents.history.index","isIndex":true}}'
)

# Timeout for agent execution (seconds)
os.environ.setdefault('AGENT_TIMEOUT', '300')

# Start Uvicorn server
uvicorn.run(app, host='0.0.0.0', port=port)
```

### 4.4 Dependencies (`.edgeone/agent-python/requirements.txt`)

```
httptools>=0.5.0
httpx>=0.24.0
openai-agents>=0.0.17
openai>=1.0.0
pages-agent-toolkit[all] @ file://...
pages-blob-python @ file://...
uvicorn>=0.20.0
```

Key packages:
- **openai-agents**: OpenAI Agents SDK (Runner, Agent classes)
- **openai**: OpenAI Python client
- **pages-agent-toolkit**: EdgeOne platform integration
- **pages-blob-python**: KV store implementation

### 4.5 Frontend Build Configuration (Vite)

`vite.config.ts` (currently empty/disabled):
```typescript
export default {}
```

Frontend is built to `.edgeone/assets/` and served statically.

---

## 5️⃣ Stop Handler (`/chat/stop`)

### File: `agents/chat/stop.py`

**Route**: `POST /chat/stop` (via `agents/chat/stop.py`)

```python
async def handler(context):
    body = context.request.body or {}
    conversation_id = body.get('conversation_id')
    
    if not conversation_id:
        return {'status_code': 400, 'body': {'status': 'error', 'message': '...'}}
    
    # Call platform abort mechanism
    result = context.utils.abort_active_run(conversation_id)
    
    return {
        "status": "aborting" if result.aborted else "idle",
        "conversationId": result.conversation_id or conversation_id,
        "runId": result.run_id,
        "aborted": result.aborted,
    }
```

**How it works:**
1. Client sends `POST /chat/stop` with `conversation_id`
2. Handler calls `context.utils.abort_active_run(conversation_id)`
3. Platform **sets** the `cancel_signal` (asyncio.Event) for that conversation
4. `/chat` handler's polling loop detects signal set
5. `/chat` handler breaks loop, cleans up, yields "done" {"stopped": true}

---

## 6️⃣ History Handler (`/history`)

### File: `agents/history/index.py`

**Route**: `POST /history`

```python
async def handler(context: Any):
    cid = context.conversation_id
    store = getattr(context, "store", None)
    
    if store is None:
        return {"messages": []}
    
    # Fetch all messages from store
    history = await store.get_messages(cid, limit=100, order="asc")
    
    # Filter and transform to frontend format
    messages = []
    for item in history:
        role = getattr(item, "role", None)
        if role not in ("user", "assistant"):
            continue  # Skip tool results, etc.
        
        content = _content_to_text(getattr(item, "content", ""))
        if not content:
            continue
        
        messages.append({
            "id": getattr(item, "message_id", None) or f"{role}-{item.created_at}",
            "role": role,
            "content": content,
            "timestamp": getattr(item, "created_at", None) or 0,
        })
    
    return {"conversation_id": cid, "messages": messages}
```

**Purpose**: Allow frontend to restore conversation after page reload

---

## 7️⃣ Frontend API Integration (`src/api.ts`)

### API Endpoints

```typescript
export const API = {
  chat: '/chat',
  chatStop: '/stop',
  history: '/history',
} as const;
```

### Streaming Chat Handler

```typescript
export function sendMessageStream(
  message: string,
  callbacks: StreamCallbacks,
  conversationId?: string,
): AbortController {
  const ctrl = new AbortController();
  
  (async () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (conversationId) {
      headers['pages-agent-conversation-id'] = conversationId;  // Platform knows session
    }

    const res = await fetch(API.chat, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      callbacks.onError(new Error(`HTTP ${res.status}: ...`));
      return;
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let doneReceived = false;

    // SSE parsing loop
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split by \n\n (SSE separator)
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        if (!part.trim()) continue;
        dispatchSseChunk(part, callbacks, () => { doneReceived = true; });
      }
    }

    if (!doneReceived) {
      callbacks.onDone();
    }
  })();

  return ctrl;
}
```

### SSE Event Dispatching

```typescript
function dispatchSseChunk(part: string, cb: StreamCallbacks, markDone: () => void): void {
  let eventType = '';
  let data = '';

  for (const line of part.split('\n')) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7);
    } else if (line.startsWith('data: ')) {
      data = line.slice(6);
    }
  }

  if (!eventType || !data) return;

  try {
    const parsed = JSON.parse(data);
    switch (eventType) {
      case 'text_delta':
        cb.onTextDelta(parsed.delta);
        break;
      case 'tool_called':
        cb.onToolCalled(parsed.tool);
        break;
      case 'error':
        cb.onError(new Error(parsed.message || 'agent returned error'));
        break;
      case 'done':
        markDone();
        cb.onDone();
        break;
    }
  } catch {
    // Ignore parse errors
  }
}
```

### Cancel Handler

```typescript
export async function stopAgent(conversationId?: string): Promise<boolean> {
  try {
    const res = await fetch(API.chatStop, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

---

## ⚠️ Important Notes

### 1. No "Streaming error after 0 chunks" Found

The error message **"Streaming error after 0 chunks"** does not appear in the codebase. This suggests:
- It may come from an external library (OpenAI SDK, httpx, Uvicorn)
- It may occur in production but not be logged in the source
- It may be a recent error not yet captured in code

### 2. Session Persistence

- Messages are persisted to `ctx.store` (EdgeOne KV store)
- Accessible via `/history` endpoint
- Automatically managed by OpenAI Agents SDK
- EdgeOneSession adapter handles protocol conversion

### 3. Cancellation Flow

```
User clicks Stop
    ↓
POST /chat/stop {conversation_id}
    ↓
context.utils.abort_active_run(conversation_id)
    ↓
Platform sets asyncio.Event signal
    ↓
/chat handler's wait() detects signal
    ↓
Break loop, close generator, close LLM connection
    ↓
Yield "done" {"stopped": true}
```

### 4. Heartbeat Mechanism

Sends `ping` event every 15 seconds to prevent:
- CDN timeouts
- Gateway timeouts
- Connection drops during long LLM operations

### 5. Private Modules

Files starting with `_` are NOT exposed as routes:
- `_model.py` - LLM configuration (private)
- `_session.py` - Session adapter (private)
- `_logger.py` - Logging utility (private)

Can be imported by `index.py` via `from ._model import llm_model`

---

## 🔗 Key File Cross-References

| Topic | Files |
|-------|-------|
| Chat streaming | `agents/chat/index.py`, `src/api.ts` |
| LLM API config | `agents/chat/_model.py`, `.env` |
| Conversation memory | `agents/chat/_session.py`, `agents/history/index.py`, `.edgeone/agent-python/config.json` |
| Cancellation | `agents/chat/stop.py`, `agents/chat/index.py` (cancel_signal), `src/api.ts` |
| Tool definitions | `agents/chat/index.py` (@function_tool decorators) |
| Logging | `agents/chat/_logger.py` |
| Frontend integration | `src/api.ts`, `src/types.ts` |
| Build config | `.edgeone/agent-python/main.py`, `vite.config.ts`, `package.json` |

---

## 📊 Summary

| Component | Type | Key Detail |
|-----------|------|-----------|
| `/chat` | Async Generator | Yields SSE events, races between stream/cancel/heartbeat |
| `/chat/stop` | REST | Calls platform abort, triggers cancel_signal |
| `/history` | REST | Returns conversation history from store |
| Session | Adapter | EdgeOneSession wraps platform KV store for OpenAI SDK |
| Tools | Functions | 4 tools: weather, clothing, translation, statistics |
| Frontend | React + SSE | Parses events, displays real-time responses, shows tool lamp |
| LLM | Tencent API | Hunyuan via OpenAI-compatible endpoint |
| Platform | EdgeOne Pages | Serverless, automatic routing, KV store, cancel signals |

