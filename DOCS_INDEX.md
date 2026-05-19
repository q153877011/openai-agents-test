# Documentation Index

This project now includes comprehensive documentation. Use this index to find what you need.

## 📚 Available Documentation

### 1. **PROJECT_ANALYSIS.md** (Main Reference)
**~3000 lines | Comprehensive deep dive**

Complete technical analysis covering:
- ✅ Project structure and file organization
- ✅ `/chat` endpoint handler (detailed walkthrough)
- ✅ Streaming logic and asyncio.wait() pattern
- ✅ SSE event format and types
- ✅ LLM client configuration
- ✅ Environment variables
- ✅ Agent and tools definition
- ✅ `/chat/stop` cancellation mechanism
- ✅ `/history` endpoint for conversation retrieval
- ✅ Frontend API integration (src/api.ts)
- ✅ Session management and conversation memory
- ✅ EdgeOne Pages configuration

**Use this when:** You need the complete picture of how the system works.

---

### 2. **QUICK_REFERENCE.md** (Quick Lookup)
**~300 lines | At-a-glance reference**

Quick reference guide with:
- 🎯 Core architecture at a glance
- 🎯 Route mapping rules
- 🎯 /chat endpoint request/response format
- 🎯 /chat/stop cancellation flow
- 🎯 /history endpoint details
- 🎯 Configuration examples
- 🎯 Event types table
- 🎯 Key flows (normal, cancellation, heartbeat)
- 🎯 Context object fields
- 🎯 Important implementation details
- 🎯 Common issues and solutions

**Use this when:** You need quick answers without reading everything.

---

### 3. **ARCHITECTURE_DIAGRAMS.md** (Visual Reference)
**~1000 lines | ASCII diagrams and flows**

Visual diagrams showing:
- 📊 Request/Response flow (complete)
- 📊 3-way race: asyncio.wait()
- 📊 Cancellation sequence
- 📊 Session flow (automatic memory)
- 📊 Tool calling flow
- 📊 Private module import pattern
- 📊 Heartbeat mechanism (keeping connection alive)
- 📊 Directory-to-route mapping
- 📊 Error handling flow
- 📊 Data flow: Message persistence

**Use this when:** You want to visualize how components interact.

---

## 🎯 Quick Navigation by Task

### "I want to understand the /chat endpoint"
1. Start: **QUICK_REFERENCE.md** § /chat Endpoint
2. Deep dive: **PROJECT_ANALYSIS.md** § 1️⃣ /chat Endpoint Handler
3. Visualize: **ARCHITECTURE_DIAGRAMS.md** § 1 & 2

### "I need to understand streaming"
1. Overview: **QUICK_REFERENCE.md** § Event Types Reference
2. Details: **PROJECT_ANALYSIS.md** § 2️⃣ Streaming Logic
3. Visualize: **ARCHITECTURE_DIAGRAMS.md** § 3-way race pattern

### "How do I configure the LLM?"
1. Quick: **QUICK_REFERENCE.md** § Configuration
2. Details: **PROJECT_ANALYSIS.md** § 3️⃣ Connection/Agent Configuration
3. Files: `agents/chat/_model.py`, `.env`

### "How does cancellation work?"
1. Quick flow: **QUICK_REFERENCE.md** § Cancellation Flow
2. Details: **PROJECT_ANALYSIS.md** § /chat/stop Endpoint
3. Visualize: **ARCHITECTURE_DIAGRAMS.md** § Cancellation Sequence

### "How is conversation history maintained?"
1. Quick: **QUICK_REFERENCE.md** § Session Management
2. Details: **PROJECT_ANALYSIS.md** § Session Integration
3. Visualize: **ARCHITECTURE_DIAGRAMS.md** § Session Flow
4. Code: `agents/chat/_session.py`, `agents/history/index.py`

### "What's the complete request/response flow?"
1. Visualize: **ARCHITECTURE_DIAGRAMS.md** § Request/Response Flow
2. Details: **PROJECT_ANALYSIS.md** § 1️⃣ & 2️⃣
3. Code: `agents/chat/index.py`, `src/api.ts`

### "How do tools work?"
1. Basics: **QUICK_REFERENCE.md** § Tools Definition
2. Flow: **ARCHITECTURE_DIAGRAMS.md** § Tool Calling Flow
3. Code: `agents/chat/index.py` (get_weather, etc.)

### "I'm debugging an issue"
1. Common issues: **QUICK_REFERENCE.md** § Common Issues
2. Error handling: **ARCHITECTURE_DIAGRAMS.md** § Error Handling Flow
3. Full details: **PROJECT_ANALYSIS.md** § Important Notes

---

## 📁 Key Files Referenced in Docs

| File | Purpose | Reference |
|------|---------|-----------|
| `agents/chat/index.py` | Main /chat handler | PROJECT_ANALYSIS 1️⃣ |
| `agents/chat/stop.py` | Cancellation | PROJECT_ANALYSIS 5️⃣ |
| `agents/chat/_model.py` | LLM config | PROJECT_ANALYSIS 3️⃣ |
| `agents/chat/_session.py` | Session adapter | PROJECT_ANALYSIS 2️⃣.5 |
| `agents/chat/_logger.py` | Logging | PROJECT_ANALYSIS 1️⃣.1.6 |
| `agents/history/index.py` | History retrieval | PROJECT_ANALYSIS 6️⃣ |
| `src/api.ts` | Frontend client | PROJECT_ANALYSIS 7️⃣ |
| `.env` | Configuration | PROJECT_ANALYSIS 3️⃣.2 |
| `.edgeone/agent-python/main.py` | Runtime | PROJECT_ANALYSIS 4️⃣.3 |
| `.edgeone/agent-python/config.json` | Routes | PROJECT_ANALYSIS 4️⃣.2 |

---

## 🔑 Key Concepts

### Handler Pattern
```python
async def handler(context: Any) -> AsyncGenerator[str, None]:
    # Yields SSE-formatted event strings
    yield sse_event("event_type", {"data": "..."})
```

### SSE Format
```
event: text_delta
data: {"delta":"token"}

```

### 3-Way Race
```python
await asyncio.wait(
    {pending, cancel_task},
    timeout=15,  # heartbeat
    return_when=asyncio.FIRST_COMPLETED,
)
```

### Session Integration
```python
result = Runner.run_streamed(
    agent,
    input=message,
    session=session,  # automatic history
)
```

---

## 📊 Architecture Summary

```
Frontend (React)
    ↓
SSE Stream: /chat
    ↓
Handler (agents/chat/index.py)
    ├─ Load history (session.get_items)
    ├─ Run agent (Runner.run_streamed)
    ├─ Stream events (text_delta, tool_called, ping)
    ├─ Save responses (session.add_items)
    └─ Handle cancellation (cancel_signal)
    ↓
Backend (Python)
    ├─ LLM API (Tencent Hunyuan)
    ├─ Store (KV store for history)
    └─ Tools (4 tool functions)
```

---

## 🚀 Getting Started

**New to the project?**
1. Read **QUICK_REFERENCE.md** first (10 min read)
2. Check **ARCHITECTURE_DIAGRAMS.md** for visuals (10 min)
3. Deep dive into **PROJECT_ANALYSIS.md** as needed

**Implementing changes?**
1. Find the relevant section in **QUICK_REFERENCE.md**
2. Check the code reference in **PROJECT_ANALYSIS.md**
3. Use **ARCHITECTURE_DIAGRAMS.md** to visualize the flow

**Debugging issues?**
1. Check **QUICK_REFERENCE.md** § Common Issues
2. Review the relevant diagram in **ARCHITECTURE_DIAGRAMS.md**
3. Examine the code in the referenced files

---

## ⚠️ Important Notes

### The "Streaming error after 0 chunks" Error
- **Status**: Not found in source code
- **Likely source**: External library (OpenAI SDK, httpx, Uvicorn)
- **Debugging**: Check error logs during production runs

### Critical: Finally Block
```python
finally:
    await agen.aclose()  # Must execute to release LLM connection
```

### Heartbeat Mechanism
- Sends `ping` event every 15 seconds
- Prevents CDN/gateway timeouts during long LLM operations
- Essential for reliability

### Private Modules
Files starting with `_`:
- NOT exposed as routes
- Can only be imported by index.py
- Examples: `_model.py`, `_session.py`, `_logger.py`

---

## 📞 Questions?

### "Where do I find [topic]?"
Check the **Quick Navigation** section above for your specific topic.

### "I need code examples"
Check **PROJECT_ANALYSIS.md** - it includes actual code snippets and patterns.

### "I need a visual explanation"
Check **ARCHITECTURE_DIAGRAMS.md** - ASCII diagrams for all major flows.

### "I need quick facts"
Check **QUICK_REFERENCE.md** - tables and bullet points for quick lookup.

---

## 📈 Documentation Stats

- **PROJECT_ANALYSIS.md**: ~3000 lines (main reference)
- **QUICK_REFERENCE.md**: ~300 lines (quick lookup)
- **ARCHITECTURE_DIAGRAMS.md**: ~1000 lines (visual reference)
- **Total**: ~4300 lines of comprehensive documentation

---

**Last Updated**: May 2026
**Project**: OpenAI Agent Starter with EdgeOne Pages Functions
**Coverage**: Complete architecture, all endpoints, all components
