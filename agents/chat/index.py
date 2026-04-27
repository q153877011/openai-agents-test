"""
Agent handler — EdgeOne Pages Functions
========================================

文件路径 agents/chat/index.py 自动映射到  **POST /chat**
（EdgeOne Pages Functions 的路由约定：目录名即路由名，index 为默认入口）

同目录下以 _ 开头的文件（如 _model.py）是私有模块，不会被映射为公开路由，
可以被 index.py import 使用。

context 约定：
    context.request.body    — dict，请求体
    context.conversation_id — 会话 ID
    context.run_id          — 本次运行 ID
"""

from typing import Annotated, Any, AsyncGenerator
import json

from openai.types.responses import ResponseTextDeltaEvent
from agents import Agent, Runner, function_tool

# 私有模块：不映射为路由
from ._model import llm_model


# ========== Tool 1: 获取天气 ==========
@function_tool
def get_weather(city: Annotated[str, "The city to get weather for"]) -> str:
    """Get the current weather for a specified city."""
    print("[debug] get_weather called")
    return f"{city}: 晴天, 18-25°C, 微风"


# ========== Tool 2: 获取穿衣建议 ==========
@function_tool
def get_clothing_advice(weather: Annotated[str, "The weather description"]) -> str:
    """Give clothing advice based on weather conditions."""
    print("[debug] get_clothing_advice called")
    return "建议穿轻薄长袖外套，搭配休闲裤和运动鞋，适合外出活动。"


# ========== Tool 3: 翻译文本 ==========
@function_tool
def translate_text(
    text: Annotated[str, "The text to translate"],
    target_language: Annotated[str, "Target language code, e.g. en, ja, fr"],
) -> str:
    """Translate text to the specified language."""
    print("[debug] translate_text called")
    translations = {
        "en": "Hello, welcome to Beijing!",
        "ja": "こんにちは、北京へようこそ！",
        "fr": "Bonjour, bienvenue à Pékin!",
    }
    return translations.get(target_language, f"[Translated to {target_language}]: {text}")


# ========== Tool 4: 统计文本信息 ==========
@function_tool
def text_statistics(text: Annotated[str, "The text to analyze"]) -> str:
    """Analyze text and return statistics like character count and word count."""
    print("[debug] text_statistics called")
    char_count = len(text)
    word_count = len(text.split())
    return f"字符数: {char_count}, 词数: {word_count}"


# ========== Agent ==========
agent = Agent(
    name="Assistant",
    instructions="You are a helpful assistant. Use the available tools to answer questions.",
    tools=[get_weather, get_clothing_advice, translate_text, text_statistics],
    model=llm_model,
)


# ========== SSE Helper ==========
def sse_event(event: str, data: dict) -> str:
    """Format a single SSE event."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ========== 核心 handler ==========
async def handler(context: Any) -> AsyncGenerator[str, None]:
    """EdgeOne Pages Functions 入口。"""
    body = getattr(getattr(context, "request", None), "body", None) or context

    message = body.get("message") if isinstance(body, dict) else None
    if not message:
        yield sse_event("error", {"message": "'message' is required"})
        yield sse_event("done", {})
        return

    result = Runner.run_streamed(agent, input=message)
    async for event in result.stream_events():
        # 原始 token 增量 → 逐字推送
        if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
            yield sse_event("text_delta", {"delta": event.data.delta})

        # 高级语义事件 → tool 调用推送
        elif event.type == "run_item_stream_event":
            if event.name == "tool_called":
                tool_name = (
                    getattr(event.item, "name", None)
                    or getattr(getattr(event.item, "raw_item", None), "name", None)
                )
                if tool_name:
                    print(f"[debug] tool_called: {tool_name}")
                    yield sse_event("tool_called", {"tool": tool_name})

    yield sse_event("done", {})


# ========== 本地调试 ==========
if __name__ == "__main__":
    import asyncio
    import sys

    async def _main():
        message = sys.argv[1] if len(sys.argv) > 1 else "北京明天天气怎么样，该穿什么？"
        async for chunk in handler({"message": message}):
            print(chunk, end="", flush=True)

    asyncio.run(_main())
