import type React from 'react';
import styles from './CodeViewer.module.css';

/* ── Token factory ── */
const token = (cls: string) =>
  function Token({ t }: { t: string }) { return <span className={cls}>{t}</span>; };

const Cmt = token(styles.cmt);
const Kw  = token(styles.kw);
const Fn  = token(styles.fn);
const Ty  = token(styles.ty);
const Str = token(styles.str);
const Op  = token(styles.op);
const Va  = token(styles.va);

interface LineProps { n: number; children?: React.ReactNode }
const L = ({ n, children }: LineProps) => (
  <div className={styles.line}>
    <span className={styles.ln}>{String(n).padStart(2, '\u00a0')}</span>
    <span className={styles.lc}>{children ?? '\u00a0'}</span>
  </div>
);

export default function CodeViewer() {
  return (
    <div className={styles.panel}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.fileIcon}>⬡</span>
          <span className={styles.filename}>index.ts<span className={styles.sep}></span></span>
        </div>
        <span className={styles.badge}>READ ONLY</span>
      </div>

      {/* ── Code body ── */}
      <div className={styles.body}>
        {/* CRT scanline overlay */}
        <div className={styles.scanline} aria-hidden />

        <div className={styles.code}>
          <L n={1}>
            <Kw t="import " /><Op t="{ " /><Ty t="Agent" /><Op t=", " /><Fn t="tool" /><Op t=" } " />
            <Kw t="from " /><Str t="'@openai/agents'" /><Op t=";" />
          </L>
          <L n={2}>
            <Kw t="import " /><Op t="{ " /><Va t="z" /><Op t=" } " />
            <Kw t="from " /><Str t="'zod'" /><Op t=";" />
          </L>
          <L n={3} />
          <L n={4}><Cmt t="// ========== Tool 1: Get Weather ==========" /></L>
          <L n={5}>
            <Kw t="const " /><Va t="getWeather" /><Op t=" = " /><Fn t="tool" /><Op t="({" />
          </L>
          <L n={6}>
            <span className={styles.indent} />
            <Va t="name" /><Op t=": " /><Str t="'get_weather'" /><Op t="," />
          </L>
          <L n={7}>
            <span className={styles.indent} />
            <Va t="description" /><Op t=": " /><Str t="'Get the current weather for a specified city.'" /><Op t="," />
          </L>
          <L n={8}>
            <span className={styles.indent} />
            <Va t="parameters" /><Op t=": " /><Va t="z" /><Op t="." /><Fn t="object" /><Op t="({" />
          </L>
          <L n={9}>
            <span className={styles.indent} /><span className={styles.indent} />
            <Va t="city" /><Op t=": " /><Va t="z" /><Op t="." /><Fn t="string" /><Op t="()." /><Fn t="describe" /><Op t="(" /><Str t="'The city to get weather for'" /><Op t=")," />
          </L>
          <L n={10}>
            <span className={styles.indent} />
            <Op t="})," />
          </L>
          <L n={11}>
            <span className={styles.indent} />
            <Va t="execute" /><Op t=": " /><Kw t="async " /><Op t="({ " /><Va t="city" /><Op t=" }) => { ... }," />
          </L>
          <L n={12}><Op t="});" /></L>
          <L n={13} />
          <L n={14}><Cmt t="// ========== Tool 2: Get Clothing Advice ==========" /></L>
          <L n={15}>
            <Kw t="const " /><Va t="getClothingAdvice" /><Op t=" = " /><Fn t="tool" /><Op t="({" />
          </L>
          <L n={16}>
            <span className={styles.indent} />
            <Va t="name" /><Op t=": " /><Str t="'get_clothing_advice'" /><Op t="," />
          </L>
          <L n={17}>
            <span className={styles.indent} />
            <Va t="description" /><Op t=": " /><Str t="'Give clothing advice based on weather.'" /><Op t="," />
          </L>
          <L n={18}>
            <span className={styles.indent} />
            <Va t="parameters" /><Op t=": " /><Va t="z" /><Op t="." /><Fn t="object" /><Op t="({" />
          </L>
          <L n={19}>
            <span className={styles.indent} /><span className={styles.indent} />
            <Va t="weather" /><Op t=": " /><Va t="z" /><Op t="." /><Fn t="string" /><Op t="()." /><Fn t="describe" /><Op t="(" /><Str t="'The weather description'" /><Op t=")," />
          </L>
          <L n={20}>
            <span className={styles.indent} />
            <Op t="})," />
          </L>
          <L n={21}>
            <span className={styles.indent} />
            <Va t="execute" /><Op t=": " /><Kw t="async " /><Op t="({ " /><Va t="weather" /><Op t=" }) => { ... }," />
          </L>
          <L n={22}><Op t="});" /></L>
          <L n={23} />
          <L n={24}><Cmt t="// ========== Tool 3: Translate Text ==========" /></L>
          <L n={25}>
            <Kw t="const " /><Va t="translateText" /><Op t=" = " /><Fn t="tool" /><Op t="({" />
          </L>
          <L n={26}>
            <span className={styles.indent} />
            <Va t="name" /><Op t=": " /><Str t="'translate_text'" /><Op t="," />
          </L>
          <L n={27}>
            <span className={styles.indent} />
            <Va t="description" /><Op t=": " /><Str t="'Translate text to the specified language.'" /><Op t="," />
          </L>
          <L n={28}>
            <span className={styles.indent} />
            <Va t="parameters" /><Op t=": " /><Va t="z" /><Op t="." /><Fn t="object" /><Op t="({" />
          </L>
          <L n={29}>
            <span className={styles.indent} /><span className={styles.indent} />
            <Va t="text" /><Op t=": " /><Va t="z" /><Op t="." /><Fn t="string" /><Op t="()." /><Fn t="describe" /><Op t="(" /><Str t="'The text to translate'" /><Op t=")," />
          </L>
          <L n={30}>
            <span className={styles.indent} /><span className={styles.indent} />
            <Va t="target_language" /><Op t=": " /><Va t="z" /><Op t="." /><Fn t="string" /><Op t="()." /><Fn t="describe" /><Op t="(" /><Str t="'Target language code'" /><Op t=")," />
          </L>
          <L n={31}>
            <span className={styles.indent} />
            <Op t="})," />
          </L>
          <L n={32}>
            <span className={styles.indent} />
            <Va t="execute" /><Op t=": " /><Kw t="async " /><Op t="({ " /><Va t="text" /><Op t=", " /><Va t="target_language" /><Op t=" }) => { ... }," />
          </L>
          <L n={33}><Op t="});" /></L>
          <L n={34} />
          <L n={35}><Cmt t="// ========== Tool 4: Text Statistics ==========" /></L>
          <L n={36}>
            <Kw t="const " /><Va t="textStatistics" /><Op t=" = " /><Fn t="tool" /><Op t="({" />
          </L>
          <L n={37}>
            <span className={styles.indent} />
            <Va t="name" /><Op t=": " /><Str t="'text_statistics'" /><Op t="," />
          </L>
          <L n={38}>
            <span className={styles.indent} />
            <Va t="description" /><Op t=": " /><Str t="'Analyze text and return statistics.'" /><Op t="," />
          </L>
          <L n={39}>
            <span className={styles.indent} />
            <Va t="parameters" /><Op t=": " /><Va t="z" /><Op t="." /><Fn t="object" /><Op t="({" />
          </L>
          <L n={40}>
            <span className={styles.indent} /><span className={styles.indent} />
            <Va t="text" /><Op t=": " /><Va t="z" /><Op t="." /><Fn t="string" /><Op t="()." /><Fn t="describe" /><Op t="(" /><Str t="'The text to analyze'" /><Op t=")," />
          </L>
          <L n={41}>
            <span className={styles.indent} />
            <Op t="})," />
          </L>
          <L n={42}>
            <span className={styles.indent} />
            <Va t="execute" /><Op t=": " /><Kw t="async " /><Op t="({ " /><Va t="text" /><Op t=" }) => { ... }," />
          </L>
          <L n={43}><Op t="});" /></L>
          <L n={44} />
          <L n={45}><Cmt t="// ========== Agent ==========" /></L>
          <L n={46}>
            <Kw t="const " /><Va t="agent" /><Op t=" = " /><Kw t="new " /><Ty t="Agent" /><Op t="({" />
          </L>
          <L n={47}>
            <span className={styles.indent} />
            <Va t="name" /><Op t=": " /><Str t="'Assistant'" /><Op t="," />
          </L>
          <L n={48}>
            <span className={styles.indent} />
            <Va t="instructions" /><Op t=": " />
            <Str t="'You are a helpful assistant. Use the available tools to answer questions.'" />
            <Op t="," />
          </L>
          <L n={49}>
            <span className={styles.indent} />
            <Va t="tools" /><Op t=": [" />
            <Va t="getWeather" /><Op t=", " />
            <Va t="getClothingAdvice" /><Op t=", " />
            <Va t="translateText" /><Op t=", " />
            <Va t="textStatistics" />
            <Op t="]," />
          </L>
          <L n={50}>
            <span className={styles.indent} />
            <Va t="model" /><Op t=": " /><Fn t="createLlmModel" /><Op t="(env)," />
          </L>
          <L n={51}><Op t="});" /></L>
        </div>
      </div>

      {/* ── Footer tag ── */}
      <div className={styles.footer}>
        <span className={styles.footerDot} />
        <span>OpenAI Agents SDK · TypeScript</span>
      </div>
    </div>
  );
}
