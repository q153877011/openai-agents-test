# Architecture Diagrams & Visual Flows

## 1. Request/Response Flow (Streaming)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                             │
│                                                                       │
│  POST /chat {"message": "What's the weather?"}                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Header: pages-agent-conversation-id: conv-12345            │   │
│  └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    EDGEONE PAGES (Platform)                           │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Routes request to: agents/chat/index.py::handler()            │ │
│  │ Provides context object:                                       │ │
│  │  - conversation_id: conv-12345                                │ │
│  │  - request.body: {"message": "..."}                           │ │
│  │  - store: KV store reference                                  │ │
│  │  - utils.abort_active_run()                                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│           HANDLER: agents/chat/index.py::handler(context)            │
│                                                                       │
│  1. Extract: message = context.request.body["message"]              │
│  2. Create session from context.store                               │
│  3. Load history via session.get_items()                            │
│  4. Create agent with 4 tools                                       │
│  5. Run: result = Runner.run_streamed(agent, input, session)       │
│  6. Loop:                                                            │
│     - Race: stream_event || cancel_signal || 15s_timeout           │
│     - Yield SSE events                                              │
│  7. Finally: await agen.aclose()                                    │
│                                                                       │
│  Returns: AsyncGenerator[str, None]  (SSE event strings)           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ↓                     ↓
    ┌─────────────────────────┐  ┌──────────────────────────┐
    │  LLM API Stream         │  │  Content Transformation  │
    │  (Tencent Hunyuan)      │  │  (_stream_events)        │
    │                         │  │                          │
    │ Tokens: "Hello", " ",   │  │ raw_response_event       │
    │ "world"                 │  │  → text_delta SSE        │
    │                         │  │                          │
    │ Tool calls detected     │  │ run_item_stream_event    │
    │                         │  │  → tool_called SSE       │
    └─────────────────────────┘  └──────────────────────────┘
                    │                     │
                    └──────────┬──────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│                    SSE Event Stream Response                          │
│                                                                       │
│  event: text_delta                                                   │
│  data: {"delta":"Hello"}                                             │
│                                                                       │
│  event: text_delta                                                   │
│  data: {"delta":" "}                                                 │
│                                                                       │
│  event: text_delta                                                   │
│  data: {"delta":"world"}                                             │
│                                                                       │
│  event: tool_called                                                  │
│  data: {"tool":"get_weather"}                                        │
│                                                                       │
│  event: text_delta                                                   │
│  data: {"delta":"..."}                                               │
│                                                                       │
│  event: done                                                         │
│  data: {"stopped":false}                                             │
│                                                                       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│                   CLIENT: SSE Event Handler                          │
│                                                                       │
│  while (not done) {                                                  │
│    event = await reader.read()                                      │
│    parse(event)                                                      │
│    switch (event.type) {                                             │
│      case "text_delta": append to message_buffer                    │
│      case "tool_called": light up tool lamp                         │
│      case "ping": ignore (heartbeat)                                │
│      case "done": close stream, enable input                        │
│    }                                                                  │
│  }                                                                    │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. 3-Way Race: asyncio.wait()

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Handler Main Loop                                 │
│                                                                       │
│  while True:                                                         │
│      pending = asyncio.ensure_future(agen.__anext__())              │
│                                                                       │
│      done, _ = await asyncio.wait(                                  │
│          {pending, cancel_task},                                    │
│          timeout=15,                    ← HEARTBEAT INTERVAL        │
│          return_when=asyncio.FIRST_COMPLETED,                       │
│      )                                                               │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ THREE OUTCOMES:                                               │  │
│  │                                                               │  │
│  │ 1. Cancel task wins:                                          │  │
│  │    ├─ cancel_task in done                                    │  │
│  │    └─ break; yield "done" {"stopped": true}                  │  │
│  │                                                               │  │
│  │ 2. Timeout (nothing ready):                                  │  │
│  │    ├─ not done (empty set after timeout)                     │  │
│  │    ├─ yield "ping" SSE  (heartbeat)                          │  │
│  │    └─ continue (restart 15s timer)                           │  │
│  │                                                               │  │
│  │ 3. Stream event ready:                                        │  │
│  │    ├─ pending in done                                        │  │
│  │    ├─ event_type, data = pending.result()                    │  │
│  │    └─ yield sse_event(event_type, data)                      │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Cancellation Sequence

```
┌──────────────────┐
│ USER: Click STOP │
└────────┬─────────┘
         │
         ↓
┌──────────────────────────────────────────────────┐
│ FRONTEND: POST /chat/stop                        │
│ {conversation_id: "conv-12345"}                 │
│                                                  │
│ Headers: Content-Type: application/json         │
│ (NO conversation-id header - important!)        │
└────────┬─────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────┐
│ EDGEONE PLATFORM                                 │
│ Routes to: agents/chat/stop.py::handler()       │
└────────┬─────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────┐
│ STOP HANDLER: agents/chat/stop.py                │
│                                                  │
│  1. Extract conversation_id from body            │
│  2. Call: context.utils.abort_active_run(cid)   │
│  3. Platform action:                             │
│     - Find /chat handler for that cid            │
│     - SET the asyncio.Event signal               │
│     - Cancel the task                            │
│  4. Return: {"aborted": true, ...}              │
└────────┬─────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────┐
│ CHAT HANDLER: Still in asyncio.wait()            │
│                                                  │
│  await asyncio.wait({pending, cancel_task})     │
│                                                  │
│  cancel_task detects signal.is_set() == True   │
│  ↓                                               │
│  cancel_task COMPLETES                          │
│  ↓                                               │
│  asyncio.wait() returns with cancel_task ready │
└────────┬─────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────┐
│ CHAT HANDLER: Break loop                         │
│                                                  │
│  if cancel_task in done:                        │
│      logger.log("cancel received")              │
│      break  ← Exit the while loop                │
└────────┬─────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────┐
│ CHAT HANDLER: Finally block executes             │
│                                                  │
│  finally:                                       │
│      await agen.aclose()                        │
│      ↓                                           │
│      Propagates GeneratorExit                    │
│      ↓                                           │
│      Stops _stream_events() iteration            │
│      ↓                                           │
│      Closes httpx connection                     │
│      ↓                                           │
│      LLM API call is aborted                     │
│                                                  │
└────────┬─────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────┐
│ CHAT HANDLER: Yield final done event             │
│                                                  │
│  yield sse_event("done", {                       │
│      "stopped": cancel_signal.is_set()  # true │
│  })                                              │
│                                                  │
│  Stream closes                                   │
└────────┬─────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────┐
│ FRONTEND: Detects "done" event                   │
│                                                  │
│  if (eventType === "done") {                    │
│      markDone()                                  │
│      if (data.stopped) {                         │
│          show "Cancelled by user"                │
│      }                                            │
│      enable input                                │
│  }                                               │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## 4. Session Flow: Automatic Memory

```
┌──────────────────────────────────────────────────────────────┐
│ REQUEST: POST /chat {"message": "What's the weather?"}      │
└─────────────────────────┬──────────────────────────────────┘
                          │
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ HANDLER:                                                     │
│                                                              │
│  session = EdgeOneSession(store, conversation_id)           │
│                                                              │
└─────────────────────────────┬──────────────────────────────┘
                          │
                          ↓
┌──────────────────────────────────────────────────────────────┐
│ RUNNER.RUN_STREAMED():                                       │
│                                                              │
│  1. Call: session.get_items(limit=100)                      │
│     ↓                                                        │
│     EdgeOneSession queries store:                           │
│     store.get_messages(session_id, limit=100, order="asc") │
│     ↓                                                        │
│     Returns: [Message{role: "user", content: "..."},        │
│               Message{role: "assistant", content: "..."}]  │
│     ↓                                                        │
│     Convert to Agent SDK format:                            │
│     [{role: "user", content: "..."},                        │
│      {role: "assistant", content: "..."}]                  │
│                                                              │
│  2. Inject into LLM request:                                │
│     LLM sees full conversation history                      │
│                                                              │
│  3. Stream response:                                         │
│     For each token: yield text_delta SSE                    │
│                                                              │
│  4. Call: session.add_items() multiple times:              │
│                                                              │
│     a) append_message(id, "user",                          │
│        {role: "user", content: "What's weather?"})         │
│        ↓ stored with: metadata{agent_sdk_session: true}   │
│                                                              │
│     b) append_message(id, "assistant",                     │
│        {type: "function_call",                             │
│         name: "get_weather",                                │
│         arguments: {"city": "Beijing"}})                   │
│        ↓ stored with: metadata{item_type: "function_call"} │
│                                                              │
│     c) append_message(id, "tool",                          │
│        {type: "function_call_output",                      │
│         output: "Beijing: sunny, 18-25°C"})                │
│        ↓ stored with: metadata{item_type: "..."}           │
│                                                              │
│     d) append_message(id, "assistant",                     │
│        {role: "assistant",                                 │
│         content: "Based on the weather..."})               │
│        ↓ stored with: metadata{agent_sdk_session: true}   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────────────┐
│ HISTORY HANDLER: POST /history                              │
│                                                              │
│ User refreshes page → frontend calls /history               │
│  ↓                                                           │
│ Handler queries store.get_messages(cid, limit=100)         │
│  ↓                                                           │
│ Filters: role in ["user", "assistant"] only                │
│          (skip tool intermediate items)                     │
│  ↓                                                           │
│ Returns only the actual messages:                           │
│ [                                                            │
│   {role: "user", content: "What's the weather?"},          │
│   {role: "assistant", content: "Based on..."}              │
│ ]                                                            │
│  ↓                                                           │
│ Frontend restores chat window with history                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Tool Calling Flow

```
LLM Response Stream:
"The weather in Beijing is sunny."
[LLM decides: need weather data, invoke get_weather]
                    │
                    ↓
         ┌──────────────────────────┐
         │ Tool Call Detected        │
         │ name: "get_weather"       │
         │ arguments: {"city": "Beijing"} │
         └──────────────────────────┘
                    │
                    ↓
         ┌──────────────────────────────────────┐
         │ _stream_events() yields:              │
         │ ("tool_called", {"tool": "get_weather"}) │
         └──────────────────────────────────────┘
                    │
                    ↓
         ┌──────────────────────────────────────┐
         │ Handler yields SSE:                   │
         │ event: tool_called                    │
         │ data: {"tool":"get_weather"}         │
         └──────────────────────────────────────┘
                    │
                    ↓
         ┌──────────────────────────────────────┐
         │ Frontend receives event:              │
         │  - Light up "Weather" tool lamp       │
         │  - Show animation                     │
         └──────────────────────────────────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
         ↓                     ↓
    Backend            Frontend (UI)
    Executes:          - Lamp glows
    get_weather("Beijing")  - Pulsing animation
         │
         ↓
    Returns:
    "Beijing: sunny, 18-25°C"
         │
         ↓
    LLM gets result, continues
    "...it is sunny with a high of 25°C,
     so I'd recommend light clothing."
         │
         ↓
    More text_delta SSEs yielded
         │
         ↓
    Frontend appends to message
         │
         ↓
    User sees full response with
    integrated weather data
```

---

## 6. Private Module Import Pattern

```
Public Routes:
┌────────────────────────────────────────┐
│ agents/chat/index.py                   │
│ → POST /chat (exposed)                │
│                                        │
│ from ._model import llm_model          │
│ from ._session import EdgeOneSession   │
│ from ._logger import create_logger     │
│                                        │
└────────────────────────────────────────┘
         │
         ├─ (private import)
         ├─ (private import)
         └─ (private import)
         │
         ↓
┌────────────────────────────────────────┐
│ agents/chat/_model.py (starts with _)  │
│ → NOT exposed as route                 │
│ → Can only be imported                 │
│                                        │
│ Creates llm_model:                     │
│ - AsyncOpenAI client                   │
│ - OpenAIChatCompletionsModel wrapper   │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ agents/chat/_session.py                │
│ → NOT exposed as route                 │
│ → Implements EdgeOneSession class      │
│                                        │
│ class EdgeOneSession:                  │
│   - get_items() → load history        │
│   - add_items() → save messages       │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ agents/chat/_logger.py                 │
│ → NOT exposed as route                 │
│ → create_logger() factory              │
│                                        │
│ Returns logger with:                   │
│ - .log() method                        │
│ - .error() method                      │
│ - Auto timestamp                       │
└────────────────────────────────────────┘

Public Routes (cont'd):
┌────────────────────────────────────────┐
│ agents/chat/stop.py                    │
│ → POST /chat/stop (exposed)           │
│                                        │
│ from ._logger import create_logger     │
│                                        │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ agents/history/index.py                │
│ → POST /history (exposed)              │
│                                        │
└────────────────────────────────────────┘
```

---

## 7. Heartbeat: Keeping Connection Alive

```
Timeline:
─────────────────────────────────────────────────────────────────────

T=0s: POST /chat received
      Handler starts streaming
      t_heartbeat = 15s

──────┴─────────────────────┬──────────────────────────────────────
      LLM responds quickly
      Tokens streamed: "Hello", " ", "world"
      
T=2s: text_delta ← Yields immediately
      text_delta ← Yields immediately
      text_delta ← Yields immediately
      
      t_heartbeat = 15s (still active)

──────┴──────────────────────┬───────────────────────────────────
      (pause - no response)
      
T=15s: TIMEOUT! No stream event received for 15 seconds
       
       Handler sends:
       event: ping
       data: {"ts": 1716139515000}
       
       Resets t_heartbeat = 15s (now 30s from start)

──────┴──────────────────────┬───────────────────────────────────
      Frontend receives ping
      (ignores it - just heartbeat)
      CDN/Gateway receive ping
      → Connection marked as alive
      
T=28s: LLM finally returns next token
       Handler yields:
       event: text_delta
       data: {"delta":"..."}
       
       Resets t_heartbeat (no timeout needed)

──────┴──────────────────────┬───────────────────────────────────
      More tokens come
      
T=35s: (no activity again)
       TIMEOUT! 15s since last event (T=20s was last content)
       
       Wait - that's only 5s idle...
       Actually: t_heartbeat tracks from last asyncio.wait()
       
       When event came at T=28, timeout was reset.
       Now at T=43 (15s later):
       
       Handler sends:
       event: ping
       data: {"ts": 1716139543000}

──────┴──────────────────────┬───────────────────────────────────
      More activity, tokens stream faster
      No timeout needed
      
T=50s: LLM completes
       event: done
       data: {"stopped": false}
       
       Stream ends, connection closes

─────────────────────────────────────────────────────────────────────
```

**Why this matters:**
- CDN timeout: often 30-60 seconds of inactivity
- Heartbeat every 15s: keeps connection alive even during slow LLM processing
- Prevents random "connection dropped" errors
- Client can distinguish: heartbeat vs content vs error

---

## 8. Directory-to-Route Mapping

```
EdgeOne Routing Convention:
(files mapped based on filename and _prefix)

┌─────────────────────────────────┐
│ agents/                         │ Directory prefix
├─────────────────────────────────┤
│ ├─ chat/                        │
│ │  ├─ index.py                  │ → POST /chat (isIndex: true)
│ │  ├─ stop.py                   │ → POST /chat/stop (isIndex: false)
│ │  ├─ _model.py                 │ → (NOT mapped, private)
│ │  ├─ _session.py               │ → (NOT mapped, private)
│ │  └─ _logger.py                │ → (NOT mapped, private)
│ │                               │
│ └─ history/                     │
│    └─ index.py                  │ → POST /history (isIndex: true)
│                                 │
└─────────────────────────────────┘

Mapping Rules:
1. Directory name → first part of route path
2. index.py → mapped (if isIndex: true in config)
3. <name>.py → mapped (if isIndex: false in config)
4. _<name>.py → NEVER mapped (private module)

Route Config (.edgeone/agent-python/config.json):
{
  "routes": [
    {
      "path": "/chat",
      "src": "^/chat$",
      "method": ["POST"],
      "isIndex": true           ← Maps to chat/index.py
    },
    {
      "path": "/chat/stop",
      "src": "^/chat/stop$",
      "method": ["POST"],
      "isIndex": false          ← Maps to chat/stop.py
    },
    {
      "path": "/history",
      "src": "^/history$",
      "method": ["POST"],
      "isIndex": true           ← Maps to history/index.py
    }
  ]
}

Env Variable (main.py):
AGENT_ROUTE_TABLE = '{
  "/chat": {"module": "pages_agents.chat.index", "isIndex": true},
  "/chat/stop": {"module": "pages_agents.chat.stop", "isIndex": false},
  "/history": {"module": "pages_agents.history.index", "isIndex": true}
}'
```

---

## 9. Error Handling Flow

```
┌─────────────────────────────────────────────────────────────┐
│ REQUEST: POST /chat {}  (missing "message" field)           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ HANDLER: Input Validation                                   │
│                                                              │
│  body = context.request.body                                │
│  message = body.get("message") if isinstance(body, dict)   │
│                                                              │
│  if not message:                                            │
│      yield sse_event("error", {                             │
│          "message": "'message' is required"                │
│      })                                                      │
│      yield sse_event("done", {})                            │
│      return  ← Exit early                                   │
│                                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ CLIENT: Receives SSE                                        │
│                                                              │
│  event: error                                               │
│  data: {"message":"'message' is required"}                 │
│                                                              │
│  event: done                                                │
│  data: {}                                                    │
│                                                              │
│  if (eventType === "error") {                              │
│    console.error("Agent error:", msg)                      │
│    show_error_notification(msg)                            │
│  }                                                           │
│                                                              │
│  if (eventType === "done") {                               │
│    stream.close()                                           │
│    enable_input()                                           │
│  }                                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Possible Error Scenarios:
─────────────────────────

1. VALIDATION ERROR:
   Request: {"message": null}
   Response: "error" + "done"

2. LLM API ERROR:
   LLM returns error status
   Runner.run_streamed() propagates
   Generator might not yield anything
   agen.aclose() in finally handles cleanup

3. PARSE ERROR (JSON):
   dispatchSseChunk() has try/catch
   Malformed JSON is silently ignored
   (keeps stream alive for next events)

4. NETWORK ERROR:
   Reader.read() throws
   catch block: callbacks.onError()
   Stream stops

5. CANCEL DURING PROCESSING:
   cancel_signal fires
   Finally block: await agen.aclose()
   Yields done {"stopped": true}
   Stream closes gracefully
```

---

## 10. Data Flow: Message Persistence

```
Scenario: User sends 3 messages in sequence

────────────────────────────────────────────────────────────────

Message 1: "What's the weather?"
     │
     ├─ POST /chat {"message": "What's the weather?"}
     │                    │
     │                    ↓
     │      session.get_items()
     │      Returns: []  (empty history)
     │                    │
     │                    ↓
     │      Runner executes, saves via session.add_items():
     │         append_message(id1, "user", {"role": "user", "content": "What's the weather?"})
     │         append_message(id2, "assistant", {"role": "assistant", "content": "It's sunny..."})
     │                    │
     │                    ↓
     │      store.messages[conv_id]:
     │      [
     │        {role: "user", content: "What's the weather?", metadata: {agent_sdk_session: true}},
     │        {role: "assistant", content: "It's sunny...", metadata: {agent_sdk_session: true}}
     │      ]
     │
     └─ Response stream ends

────────────────────────────────────────────────────────────────

Message 2: "What should I wear?"
     │
     ├─ POST /chat {"message": "What should I wear?"}
     │                    │
     │                    ↓
     │      session.get_items()
     │      Returns: [
     │        {role: "user", content: "What's the weather?"},
     │        {role: "assistant", content: "It's sunny..."}
     │      ]
     │      
     │      LLM sees context: "Hey assistant, the user said
     │                         'What's the weather?' and you replied...
     │                         Now they're asking 'What should I wear?'"
     │                    │
     │                    ↓
     │      Runner executes, saves via session.add_items():
     │         append_message(id3, "user", {"role": "user", "content": "What should I wear?"})
     │         append_message(id4, "assistant", {"role": "assistant", "content": "Light clothing..."})
     │                    │
     │                    ↓
     │      store.messages[conv_id]:
     │      [
     │        {role: "user", content: "What's the weather?"},
     │        {role: "assistant", content: "It's sunny..."},
     │        {role: "user", content: "What should I wear?"},
     │        {role: "assistant", content: "Light clothing..."}
     │      ]
     │
     └─ Response stream ends

────────────────────────────────────────────────────────────────

Page Refresh: User reloads browser
     │
     ├─ Frontend: POST /history
     │                    │
     │                    ↓
     │      Handler: store.get_messages(conv_id, limit=100)
     │      Returns all 4 messages
     │      Filters to user/assistant only (skips tool items)
     │      Returns: [msg1, msg2, msg3, msg4]
     │                    │
     │                    ↓
     │      Frontend: Populates chat window with all 4 messages
     │      Conversation context fully restored
     │
     └─ User can continue from where they left off

────────────────────────────────────────────────────────────────

Message 3: "I'll buy a light jacket"
     │
     └─ Same as Message 2: session.get_items() returns all 4,
        LLM has full context, continues conversation
```

---

Generated: 2024-2025 | OpenAI Agent Starter with EdgeOne Pages Functions
