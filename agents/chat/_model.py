"""
私有模块（文件名以 _ 开头）—— 不被 EdgeOne 映射为公开路由
用于配置 AI 网关。

被 ./index.py 通过 `from ._model import ai_gate_model` 导入。

AI 网关地址和 claude-agent-starter 保持一致，走同一个 EdgeOne AI Gateway。
"""

import os
from dotenv import load_dotenv

load_dotenv()

from openai import AsyncOpenAI
from agents import OpenAIChatCompletionsModel


# AI 网关接入（和 claude-agent-starter 用同一个网关）
ai_gate_client = AsyncOpenAI(
    api_key=os.getenv("AI_GATE_API_KEY"),
    base_url=os.getenv(
        "AI_GATE_BASE_URL",
    ),
)

ai_gate_model = OpenAIChatCompletionsModel(
    model=os.getenv("AI_GATE_MODEL", "@Pages/glm-5"),
    openai_client=ai_gate_client,
)
