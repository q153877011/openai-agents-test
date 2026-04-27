import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import styles from './ChatInput.module.css';

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

const PRESETS = [
  '现在北京天气怎么样，有什么穿衣建议吗？',
  '帮我翻译"你好，欢迎来到北京！"，并统计翻译字符数。',
];

export default function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const handlePreset = (text: string) => {
    if (disabled) return;
    onSend(text);
  };

  return (
    <div className={styles.bar}>
      <div className={styles.presets}>
        {PRESETS.map(text => (
          <button
            key={text}
            className={styles.presetChip}
            onClick={() => handlePreset(text)}
            disabled={disabled}
          >
            {text}
          </button>
        ))}
      </div>

      <div className={`${styles.inputWrap} ${disabled ? styles.inputDisabled : ''}`}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder="发消息…  ⏎ 发送 · Shift+⏎ 换行"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          rows={1}
          disabled={disabled}
        />
        <button
          className={`${styles.sendBtn} ${(!value.trim() || disabled) ? styles.sendDisabled : ''}`}
          onClick={handleSend}
          disabled={!value.trim() || disabled}
          aria-label="发送"
        >
          {disabled
            ? <span className={styles.spinner} />
            : <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
                <path d="M3 10L17 3l-4 7 4 7L3 10z" fill="currentColor"/>
              </svg>
          }
        </button>
      </div>
      <p className={styles.hint}>由 OpenAI Agents SDK 驱动 · 仅供演示</p>
    </div>
  );
}
