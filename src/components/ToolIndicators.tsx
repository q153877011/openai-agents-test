import type { ToolLampState } from '../types';
import ToolLamp from './ToolLamp';
import styles from './ToolIndicators.module.css';

interface Props {
  lamps: ToolLampState[];
}

export default function ToolIndicators({ lamps }: Props) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        {lamps.map(lamp => (
          <ToolLamp key={lamp.id} lamp={lamp} />
        ))}
      </div>
      <p className={styles.hint}>当前 Agent 使用 tools</p>
    </div>
  );
}
