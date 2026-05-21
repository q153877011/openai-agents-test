/**
 * Agent Tools — private module (starts with _), not mapped as a route.
 *
 * All tool definitions live here. Each tool's `execute` body is the only
 * thing you need to change when swapping mock data for a real implementation
 * (e.g. calling a weather API, a translation service, etc.).
 */

import { tool } from '@openai/agents';
import { z } from 'zod';

// ========== Tool: Get Weather ==========
const getWeather = tool({
  name: 'get_weather',
  description: 'Get the current weather for a specified city.',
  parameters: z.object({
    city: z.string().describe('The city to get weather for'),
  }),
  execute: async ({ city }) => {
    // TODO: Replace with real weather API (e.g. OpenWeatherMap, wttr.in)
    const mockWeather = {
      city,
      condition: '晴天',
      temperature: { min: 18, max: 25, unit: '°C' },
      wind: '微风',
    };
    return JSON.stringify(mockWeather);
  },
});

// ========== Tool: Get Clothing Advice ==========
const getClothingAdvice = tool({
  name: 'get_clothing_advice',
  description: 'Give clothing advice based on weather conditions.',
  parameters: z.object({
    weather: z.string().describe('The weather description (JSON or plain text)'),
  }),
  execute: async ({ weather }) => {
    // TODO: Replace with more sophisticated logic or an external service
    // Basic temperature-aware advice based on input
    const cold = /(-\d|[0-9](?=\s*°))/;
    const hot = /(3[0-9]|4[0-9])\s*°/;

    if (hot.test(weather)) {
      return '天气较热，建议穿短袖、短裤，注意防晒和补水。';
    }
    if (cold.test(weather)) {
      return '天气较冷，建议穿羽绒服或厚外套，搭配围巾和手套。';
    }
    return '建议穿轻薄长袖外套，搭配休闲裤和运动鞋，适合外出活动。';
  },
});

// ========== Tool: Translate Text ==========
const translateText = tool({
  name: 'translate_text',
  description: 'Translate text to the specified language.',
  parameters: z.object({
    text: z.string().describe('The text to translate'),
    target_language: z.string().describe('Target language code, e.g. en, ja, fr, ko, de'),
  }),
  execute: async ({ text, target_language }) => {
    // TODO: Replace with real translation API (e.g. DeepL, Google Translate)
    const languageNames: Record<string, string> = {
      en: 'English',
      ja: '日本語',
      fr: 'Français',
      ko: '한국어',
      de: 'Deutsch',
      es: 'Español',
      ru: 'Русский',
    };
    const langName = languageNames[target_language] ?? target_language;
    return `[Mock translation to ${langName}]: ${text}`;
  },
});

// ========== Tool: Text Statistics ==========
const textStatistics = tool({
  name: 'text_statistics',
  description: 'Analyze text and return statistics like character count and word count.',
  parameters: z.object({
    text: z.string().describe('The text to analyze'),
  }),
  execute: async ({ text }) => {
    const charCount = text.length;
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const lineCount = text.split('\n').length;
    return JSON.stringify({ charCount, wordCount, lineCount });
  },
});

// ========== Export ==========
/**
 * Factory that returns all available tools.
 * Add new tools to this array — the agent will automatically pick them up.
 */
export function createTools() {
  return [getWeather, getClothingAdvice, translateText, textStatistics];
}
