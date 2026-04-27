# Agent Chat 前端展示计划

## 一、整体概述

使用 React（Vite + TypeScript）构建一个简洁美观的聊天窗口，顶部展示四个 Tool 指示灯，当 Agent 调用了某个 Tool 时，对应灯泡点亮，1 秒后自动熄灭。

---

## 二、页面布局

```
┌──────────────────────────────────────────────┐
│              Tool 指示灯区域（Header）          │
│  💡天气查询   💡穿衣建议   💡文本翻译   💡文本统计  │
├──────────────────────────────────────────────┤
│                                              │
│              聊天消息区域                       │
│  ┌────────────────────────────────┐          │
│  │ 🧑 用户: 帮我查一下北京天气...    │          │
│  └────────────────────────────────┘          │
│  ┌────────────────────────────────┐          │
│  │ 🤖 助手: 北京今天晴天...         │          │
│  └────────────────────────────────┘          │
│                                              │
├──────────────────────────────────────────────┤
│  [  输入框                        ] [发送]    │
└──────────────────────────────────────────────┘
```

---

## 三、核心组件拆分

| 组件 | 职责 |
|------|------|
| `App` | 根组件，管理全局状态 |
| `ToolIndicators` | 顶部灯泡区域，展示 4 个 Tool 的亮灭状态 |
| `ToolLamp` | 单个灯泡组件（名称 + 图标 + 亮/灭状态） |
| `ChatWindow` | 聊天消息滚动区域 |
| `ChatBubble` | 单条消息气泡（区分用户/助手） |
| `ChatInput` | 底部输入框 + 发送按钮 |

---

## 四、Tool 灯泡交互设计

### 4.1 四个灯泡映射

| 灯泡名称 | 对应 Tool 标识 | 图标含义 |
|----------|---------------|---------|
| 天气查询 | `get_weather` | ☀️ |
| 穿衣建议 | `get_clothing_advice` | 👔 |
| 文本翻译 | `translate_text` | 🌐 |
| 文本统计 | `text_statistics` | 📊 |

### 4.2 亮灭逻辑

1. 默认状态：灰色（熄灭），灯泡无发光效果
2. 当 `/chat` 接口返回的 `tools_called` 中包含某个 tool 标识时，对应灯泡点亮（高亮 + glow 动画）
3. 点亮 1 秒后自动熄灭，回到灰色状态

### 4.3 视觉效果

- **熄灭态**：灰色灯泡图标，灰色文字，无阴影
- **点亮态**：黄色/金色灯泡图标，白色文字，外发光（box-shadow glow），带一个短暂的 scale 弹跳动画
- 过渡使用 CSS transition 实现平滑切换

---

## 五、后端接口适配

### 5.1 当前接口

```
POST /chat
Request:  { "message": "..." }
Response: { "reply": "..." }
```

### 5.2 需要扩展的接口（返回被调用的 tools）

```
POST /chat
Request:  { "message": "..." }
Response: {
  "reply": "...",
  "tools_called": ["get_weather", "get_clothing_advice"]
}
```

> **后端改动**：需在 `tools.py` 中通过 `RunResult` 的 `new_items` 解析出本轮调用了哪些 tool，并在响应中携带 `tools_called` 字段。

---

## 六、技术选型

| 类别 | 方案 |
|------|------|
| 构建工具 | Vite |
| 框架 | React 18 + TypeScript |
| 样式 | CSS Modules / Tailwind CSS（轻量即可） |
| HTTP 请求 | fetch API（无需额外依赖） |
| 动画 | CSS transition + keyframes |

---

## 七、目录结构

```
frontend/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.tsx                 # 入口
│   ├── App.tsx                  # 根组件
│   ├── App.css                  # 全局/根组件样式
│   ├── components/
│   │   ├── ToolIndicators.tsx   # 灯泡区域
│   │   ├── ToolLamp.tsx         # 单个灯泡
│   │   ├── ChatWindow.tsx       # 消息列表
│   │   ├── ChatBubble.tsx       # 消息气泡
│   │   └── ChatInput.tsx        # 输入框
│   ├── types.ts                 # 类型定义
│   └── api.ts                   # 后端请求封装
```

---

## 八、关键状态设计

```typescript
// 消息
interface Message {
  role: "user" | "assistant";
  content: string;
}

// Tool 灯泡状态
interface ToolLampState {
  id: string;       // e.g. "get_weather"
  label: string;    // e.g. "天气查询"
  icon: string;     // e.g. "☀️"
  active: boolean;  // 是否点亮
}

// App 状态
const [messages, setMessages] = useState<Message[]>([]);
const [lamps, setLamps] = useState<ToolLampState[]>(INITIAL_LAMPS);
const [loading, setLoading] = useState(false);
```

---

## 九、核心流程

```
用户输入消息 → 点击发送
  ↓
setLoading(true)，追加用户消息到列表
  ↓
POST /chat { message }
  ↓
收到响应 { reply, tools_called }
  ↓
追加助手消息到列表，setLoading(false)
  ↓
遍历 tools_called，将对应灯泡设为 active=true
  ↓
setTimeout 1000ms 后，将所有灯泡设回 active=false
```

---

## 十、实施步骤

1. **Step 1**：后端扩展 — 修改 `/chat` 接口，返回 `tools_called` 字段
2. **Step 2**：前端初始化 — 用 Vite 创建 React + TS 项目
3. **Step 3**：实现组件 — 按组件拆分逐个实现
4. **Step 4**：样式打磨 — 灯泡 glow 动画、聊天气泡样式、响应式布局
5. **Step 5**：联调测试 — 前后端联调，确认灯泡亮灭效果正确
