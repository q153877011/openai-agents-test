import { useState, useCallback, useRef } from 'react';
import type { Message, ToolLampState } from './types';
import { sendMessageStream } from './api';
import ToolIndicators from './components/ToolIndicators';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import CodeViewer from './components/CodeViewer';
import styles from './App.module.css';

const INITIAL_LAMPS: ToolLampState[] = [
  { id: 'get_weather',         label: '天气查询', icon: '☀️', active: false, animKey: 0 },
  { id: 'get_clothing_advice', label: '穿衣建议', icon: '👔', active: false, animKey: 0 },
  { id: 'translate_text',      label: '文本翻译', icon: '🌐', active: false, animKey: 0 },
  { id: 'text_statistics',     label: '文本统计', icon: '📊', active: false, animKey: 0 },
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [lamps, setLamps]       = useState<ToolLampState[]>(INITIAL_LAMPS);
  const [loading, setLoading]   = useState(false);

  // 用 ref 持有当前助手消息 id，方便在回调中追加文本
  const botMsgIdRef = useRef<string>('');

  const handleSend = useCallback(async (text: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    // 预创建一条空的助手消息，后续逐字追加
    const botMsgId = crypto.randomUUID();
    botMsgIdRef.current = botMsgId;
    const botMsg: Message = {
      id: botMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg, botMsg]);
    setLoading(true);

    sendMessageStream(text, {
      onTextDelta(delta) {
        // 逐字追加到助手消息
        setMessages(prev =>
          prev.map(m =>
            m.id === botMsgIdRef.current
              ? { ...m, content: m.content + delta }
              : m
          )
        );
      },

      onToolCalled(toolName) {
        // 点亮对应灯泡
        setLamps(prev =>
          prev.map(l =>
            l.id === toolName
              ? { ...l, active: true, animKey: l.animKey + 1 }
              : l
          )
        );
        // 1 秒后熄灭该灯泡
        setTimeout(() => {
          setLamps(prev =>
            prev.map(l => (l.id === toolName ? { ...l, active: false } : l))
          );
        }, 1000);
      },

      onDone() {
        setLoading(false);
      },

      onError() {
        setMessages(prev =>
          prev.map(m =>
            m.id === botMsgIdRef.current
              ? { ...m, content: m.content || '⚠️ 请求失败，请检查后端服务是否启动。' }
              : m
          )
        );
        setLoading(false);
      },
    });
  }, []);

  return (
    <div className={styles.shell}>
      <div className={styles.blob1} />
      <div className={styles.blob2} />

      <div className={styles.stage}>
        {/* ── Left: Chat panel ── */}
        <div className={styles.chatPanel}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <span className={styles.logo}>⬡</span>
              <div>
                <p className={styles.title}>Agent Chat</p>
                <p className={styles.subtitle}>Powered by OpenAI Agents SDK</p>
              </div>
            </div>
            <ToolIndicators lamps={lamps} />
          </header>

          <ChatWindow messages={messages} loading={loading} />
          <ChatInput onSend={handleSend} disabled={loading} />
        </div>

        {/* ── Right: Code viewer ── */}
        <div className={styles.codePanel}>
          <CodeViewer />
        </div>
      </div>
    </div>
  );
}
