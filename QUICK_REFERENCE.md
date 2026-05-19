# Quick Reference Guide

## 🎯 Core Architecture at a Glance

### File → Route Mapping
```
agents/chat/index.py        → POST /chat          (Main streaming handler)
agents/chat/stop.py         → POST /chat/stop     (Cancel mechanism)
agents/history/index.py     → POST /history       (Fetch conversation)
agents/chat/_model.py       → (Private, not a route)
agents/chat/_session.py     → (Private, not a route)
agents/chat/_logger.py      → (Private, not a route)
```

---

## 1️⃣ /chat Endpoint

### What It Does
- Receives: `POST {"message": "user input"}`
- Returns: Server-Sent Events (SSE) stream
- Manages: Streaming LLM response, tool calls, cancellation

### Request Format
```json
{
  "message": "What's the weather in Beijing?"
}
```

### Response (SSE Stream)
```
event: text_delta
data: {"delta":"The"}

event: text_delta
data: {"delta":" "}

event: tool_called
data: {"tool":"get_weather"}

event: text_delta
data: {"delta":"..."}

event: done
data: {"stopped":false}
```

### Handler Logic
1. Extract `message` from `context.request.body`
2. Load conversation history via `session.get_items()`
3. Create agent with 4 tools
4. Run `Runner.run_streamed(agent, input=message, session=session)`
5. Loop:
   - Wait for: stream event OR cancel signal OR 15s timeout
   - If stream: convert to SSE, yield
   - If cancel: break, yield "done" with stopped=true
   - If timeout: send heartbeat ping
6. Finally: close generator (releases LLM connection)

---

## 2️⃣ /chat/stop Endpoint

### What It Does
- Receives: `POST {"conversation_id": "..."}`
- Aborts: The active /chat stream
- Returns: Status JSON

### Request Format
```json
{
  "conversation_id": "conv-12345"
}
```

### Response Format
```json
{
  "status": "aborting",
  "conversationId": "conv-12345",
  "runId": "run-67890",
  "aborted": true
}
```

### How It Works
1. Call `context.utils.abort_active_run(conversation_id)`
2. Platform sets the `cancel_signal` (asyncio.Event)
3. `/chat` handler detects signal in polling loop
4. `/chat` handler breaks, cleans up, yields "done"

---

## 3️⃣ /history Endpoint

### What It Does
- Retrieves: All messages in a conversation
- Used for: Page refresh (restore chat window)

### Request Format
```json
{}
```

### Response Format
```json
{
  "conversation_id": "conv-12345",
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "content": "What's the weather?",
      "timestamp": 1716139500000
    },
    {
      "id": "msg-2",
      "role": "assistant",
      "content": "The weather is sunny...",
      "timestamp": 1716139505000
    }
  ]
}
```

---

## 🔧 Configuration

### Environment Variables (`.env`)
```env
# LLM API
AI_GATEWAY_API_KEY=sk-tp-...
AI_GATEWAY_BASE_URL=https://api.lkeap.cloud.tencent.com/plan/v3
AI_GATEWAY_MODEL=hy3-preview

# Platform
EDGEONE_PAGES_API_TOKEN=QojhSyWK...
PAGES_BLOB_LOCAL_PERSIST=1
OPENAI_AGENTS_DISABLE_TRACING=1
```

### LLM Client Setup (`agents/chat/_model.py`)
```python
from openai import AsyncOpenAI
from agents import OpenAIChatCompletionsModel

llm_client = AsyncOpenAI(
    api_key=os.getenv("AI_GATEWAY_API_KEY"),
    base_url=os.getenv("AI_GATEWAY_BASE_URL"),
)

llm_model = OpenAIChatCompletionsModel(
    model=os.getenv("AI_GATEWAY_MODEL", "@Pages/hy3-preview"),
    openai_client=llm_client,
)
```

### Tools Definition (`agents/chat/index.py`)
```python
@function_tool
def get_weather(city: str) -> str:
    """Get the current weather for a specified city."""
    return f"{city}: 晴天, 18-25°C"

# Register with agent
agent = Agent(
    name="Assistant",
    instructions="You are a helpful assistant.",
    tools=[get_weather, ...],
    model=llm_model,
)
```

---

## 📊 Event Types Reference

| Event | Data | Sent When | Frontend Action |
|-------|------|-----------|-----------------|
| `text_delta` | `{delta: "token"}` | LLM streaming | Append to message |
| `tool_called` | `{tool: "name"}` | Tool invoked | Light up lamp icon |
| `ping` | `{ts: ms}` | 15s idle | (ignore) |
| `error` | `{message: "..."}` | Validation fail | Show error |
| `done` | `{stopped: bool}` | Stream end | Close UI, enable input |

---

## 🔄 Key Flows

### 1. Normal Message Flow
```
User sends message
    ↓
POST /chat {"message": "..."}
    ↓
Handler creates agent
    ↓
LLM streams response
    ↓
For each token: yield text_delta SSE
    ↓
Handler detects tool call
    ↓
Yield tool_called SSE
    ↓
Tool executes, result returned to LLM
    ↓
LLM continues response
    ↓
When done: yield done SSE
    ↓
Frontend closes stream
```

### 2. Cancellation Flow
```
User clicks Stop
    ↓
Frontend: POST /chat/stop {conversation_id}
    ↓
Backend sets cancel_signal
    ↓
/chat handler detects signal
    ↓
Break loop, close generator
    ↓
Yield done {"stopped": true}
    ↓
LLM connection aborted
```

### 3. Heartbeat Flow
```
LLM takes > 15 seconds
    ↓
Handler timeout triggers
    ↓
Yield ping SSE
    ↓
Reset 15s timer
    ↓
Prevents CDN timeout
```

---

## 💻 Frontend Integration (`src/api.ts`)

### Streaming Handler
```typescript
export function sendMessageStream(
  message: string,
  callbacks: StreamCallbacks,
  conversationId?: string,
): AbortController {
  // Returns AbortController for manual cancellation
  // Callbacks: onTextDelta, onToolCalled, onError, onDone
}
```

### Cancel Handler
```typescript
export async function stopAgent(conversationId?: string): Promise<boolean> {
  // Sends POST /chat/stop
  // Returns true if server accepted
}
```

### History Loader
```typescript
export async function fetchConversationHistory(
  conversationId: string
): Promise<Message[]> {
  // Fetches POST /history
  // Retries 3 times on 409 (conflict)
}
```

---

## 🏗️ Session Management

### Automatic via OpenAI SDK
```python
result = Runner.run_streamed(agent, input=message, session=session)
```

**What happens:**
1. SDK calls `session.get_items()` → loads history
2. SDK injects history into request
3. As events come, SDK calls `session.add_items()` to save:
   - User message
   - Tool calls
   - Tool results  
   - Assistant response

### EdgeOneSession Adapter (`agents/chat/_session.py`)
- Wraps `context.store` (KV store)
- Implements OpenAI session protocol
- Handles message-to-item conversion
- Supports legacy text + new SDK formats

---

## 🛑 Important Details

### 1. Context Object
```python
context.conversation_id      # Session ID
context.request.body        # Request JSON
context.request.signal      # asyncio.Event (set on cancel)
context.store              # KV store
context.utils.abort_active_run()  # Abort function
```

### 2. Timeout Behavior
- **handler**: 300 seconds (set in `.edgeone/agent-python/main.py`)
- **heartbeat**: 15 seconds (configured in `index.py`)
- Heartbeat ping prevents CDN/gateway timeout

### 3. Private Modules
Files starting with `_` are NOT exposed as routes:
- `_model.py` - LLM config
- `_session.py` - Session adapter
- `_logger.py` - Logging

Can be imported: `from ._model import llm_model`

### 4. Finally Block is Critical
```python
finally:
    await agen.aclose()  # Must close generator
```

This propagates `GeneratorExit` up to `result.stream_events()`, which closes the httpx connection to the LLM API, truly aborting the request.

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| `agents/chat/index.py` | Main /chat handler with streaming loop |
| `agents/chat/stop.py` | Cancel mechanism |
| `agents/chat/_model.py` | LLM client setup |
| `agents/chat/_session.py` | Session adapter (auto history) |
| `agents/history/index.py` | Conversation history retrieval |
| `src/api.ts` | Frontend API client (SSE parsing) |
| `.env` | API keys and config |
| `.edgeone/agent-python/main.py` | Runtime entry point |
| `.edgeone/agent-python/config.json` | Route definitions |

---

## ⚠️ Common Issues

### Issue: "Message field required"
**Solution**: Ensure JSON body has `{"message": "..."}` field

### Issue: Long operations timeout
**Solution**: Heartbeat ping sends every 15s, prevents CDN timeout

### Issue: Cancel not working
**Solution**: Check `/chat/stop` passes `conversation_id` in body, not header

### Issue: History empty on refresh
**Solution**: Check `context.store` is available, check EdgeOneSession.get_items() works

---

## 🚀 Deployment

### Build
```bash
npm run build              # Compiles TypeScript + React
edgeone pages build        # Packages for EdgeOne
```

### Deploy
```bash
edgeone pages deploy       # Deploys to EdgeOne
```

### Local Dev
```bash
npm run dev:agents        # Runs local dev server
npm run dev               # Runs frontend dev server (separate terminal)
```

---

## 🔗 Cross-File Dependencies

```
agents/chat/index.py
├── imports: from ._model import llm_model
├── imports: from ._session import EdgeOneSession
├── imports: from ._logger import create_logger
└── uses: Runner, Agent, function_tool from openai-agents

src/api.ts
├── imports: POST /chat
├── imports: POST /chat/stop
├── imports: POST /history
└── parses: SSE events

.env
├── read by: agents/chat/_model.py
└── vars: AI_GATEWAY_API_KEY, AI_GATEWAY_BASE_URL, AI_GATEWAY_MODEL
```

---

Generated: 2024-2025 | OpenAI Agent Starter with EdgeOne Pages Functions
