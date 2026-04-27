/**
 * 后端接口（EdgeOne Pages Functions）
 *
 * 路由映射规则（文件 → 路由）：
 *   agents/chat/index.py   → POST /chat          主聊天入口
 *   agents/chat/stop.py    → POST /chat/stop     中断正在执行的 agent（预留）
 *   agents/chat/_model.py  → （私有，不映射）     AI 网关 / 模型配置
 *
 * 本文件集中定义所有路径 + 请求封装，方便以后扩展子路由。
 */

export const API = {
  chat: '/chat',
  chatStop: '/chat/stop',   // 预留：中断正在执行的 agent
} as const;

export interface StreamCallbacks {
  onTextDelta: (delta: string) => void;
  onToolCalled: (toolName: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

/**
 * 通过 SSE 流式调用 POST /chat
 * 后端推送三种事件：text_delta / tool_called / done / error
 *
 * 返回一个 AbortController，调用方可用它中断请求（或配合 /chat/stop 端点优雅中止）。
 */
export function sendMessageStream(
  message: string,
  callbacks: StreamCallbacks,
): AbortController {
  const ctrl = new AbortController();

  (async () => {
    try {
      const res = await fetch(API.chat, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        callbacks.onError(new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError(new Error('ReadableStream not supported'));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE 格式：每个事件以 \n\n 分隔
        const parts = buffer.split('\n\n');
        // 最后一段可能不完整，保留在 buffer 里
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.trim()) continue;
          dispatchSseChunk(part, callbacks);
        }
      }

      // 流正常结束但没收到 done 事件时也触发完成
      callbacks.onDone();
    } catch (err) {
      // AbortError 不触发错误回调
      if (err instanceof DOMException && err.name === 'AbortError') return;
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return ctrl;
}

/** 解析一条 SSE 事件并分发给对应回调 */
function dispatchSseChunk(part: string, cb: StreamCallbacks): void {
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
        cb.onDone();
        break;
    }
  } catch {
    // 忽略解析失败的事件
  }
}

/**
 * 请求后端中断当前正在执行的 agent
 * 对应 agents/chat/stop.py → POST /chat/stop
 * 当前后端还没实现，调用会失败。前端可以先准备好调用点，后端实现后自然生效。
 */
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
