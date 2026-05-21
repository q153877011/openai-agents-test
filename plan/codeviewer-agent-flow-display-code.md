# 首页右侧 CodeViewer 展示代码草案

这份代码用于首页右侧 `CodeViewer` 展示，目标是**简洁表达 EdgeOne 上创建 OpenAI Agent 的关键流程**，不要求直接运行。重点展示：

- `context.store`：保存用户/助手消息，支持历史恢复；
- `store.openaiSession()`：注入 OpenAI Agents SDK 会话记忆；
- `createTools()`：使用当前项目中定义的 Agent tools；
- `new Agent()`：创建 OpenAI Agent；
- `run()`：启动 Agent。

```ts
import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';
import { createLlmModel } from './_model';

const INSTRUCTIONS = `...`;

export async function onRequest(context: any) {
  const message = context.request.body?.message ?? '';
  const conversationId = context.conversation_id;
  const store = context.store;

  // 1. EdgeOne Store：保存用户消息，供历史恢复
  await store?.appendMessage?.({
    conversationId,
    role: 'user',
    content: message,
  });

  // 2. EdgeOne Store：注入 OpenAI Agents SDK 会话记忆
  const session = store?.openaiSession?.(conversationId);

  // 3. 使用当前项目定义的 Agent tools
  const getWeather = tool({
    name: 'get_weather',
    description: 'Get the current weather for a specified city.',
    parameters: z.object({
      city: z.string().describe('The city to get weather for'),
    }),
    execute: async ({ city }) => {
      // TODO
    },
  });

  const tools = [
    getWeather,
    // More tools...

  // 4. 创建 OpenAI Agent
  const agent = new Agent({
    name: 'EdgeOne Assistant',
    instructions: INSTRUCTIONS,
    model: createLlmModel(context.env),
    tools,
  });

  // 5. 启动 Agent，并注入 Store Session
  const result = await run(agent, message, {
    session,
    stream: true,
    signal: context.request.signal,
  });

  // 这里省略 SSE、text_delta、tool_called 等流式细节
  const assistantText = await collectAssistantText(result);

  // 6. EdgeOne Store：保存助手回复，供 /history 恢复
  await store?.appendMessage?.({
    conversationId,
    role: 'assistant',
    content: assistantText,
  });

  return Response.json({ answer: assistantText });
}

async function collectAssistantText(result: any) {
  // 伪代码：消费 OpenAI Agents SDK 输出并拼接 assistant 文本
  return '...';
}
```

## 建议在 CodeViewer 中突出展示的流程

1. `context.store`：读写用户/助手消息；
2. `store.openaiSession(conversationId)`：为 OpenAI Agents SDK 注入会话记忆；
3. `createTools()`：加载当前项目定义的 `get_weather`、`get_clothing_advice`、`translate_text`、`text_statistics`；
4. `new Agent()`：创建 Agent；
5. `run(agent, message, { session, stream })`：启动 Agent；
6. `store.appendMessage()`：保存助手回复，支持历史恢复。
