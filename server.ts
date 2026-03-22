// ==========================================
// GSTRDNMC BOT - REFACTORED VERSION
// ==========================================
// Структура проекта:
// - src/types.ts     - TypeScript типы
// - src/constants.ts - Константы и статические данные
// - src/utils.ts    - Утилиты (транслитерация, fetch, форматирование)
// - src/handlers.ts - Обработчики команд и callback queries
// - src/routes.ts   - API эндпоинты
// - server.ts       - Главный файл (точка входа)
// ==========================================

import express from "express";
import { Bot, webhookCallback, InputFile } from "grammy";
import dotenv from "dotenv";
import Redis from "ioredis";
import fs from "fs";
import path from "path";

// ✅ VERCEL TIMEOUT FIX
export const maxDuration = 60;

// Импорты из модулей
import { TOURS } from "./src/constants.js";
import { DEFAULT_TEXTS } from "./src/constants.js";
import { telegramApiCall } from "./src/utils.js";
import { setupRoutes } from "./src/routes.js";
import {
  handleStart,
  handleHelp,
  handleManifest,
  handleRules,
  handleCalendar,
  handleGpxCommand,
  handlePressure,
  handleResto,
  handleKomoot,
  handleRainfree,
  handleUpdateMenu,
  handleRidesCommand,
  handleRideDayCallback,
  handleRideDetailCallback,
  handleRidesMainCallback,
  handleOpenGpxCallback,
  handleShareGpxCallback,
  handleExplanationCallback,
  antiSpamMiddleware,
  handleTextMessage
} from "./src/handlers.js";
import type { BotTexts } from "./src/types.js";

// ==========================================
// ЗАГРУЗКА ТЕКСТОВ БОТА
// ==========================================

function loadBotTexts(): BotTexts {
  try {
    const textsPath = path.join(process.cwd(), 'bot-texts.json');
    const data = fs.readFileSync(textsPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[TEXTS] Ошибка загрузки текстов:', error);
    return DEFAULT_TEXTS;
  }
}

let botTexts = loadBotTexts();
console.log('[TEXTS] Тексты бота загружены');

function reloadBotTexts(): void {
  botTexts = loadBotTexts();
  console.log('[TEXTS] Тексты бота перезагружены');
}

// ✅ Загружаем переменные окружения
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

console.log("[INIT] Загрузка env: GROQ_API_KEY =", process.env.GROQ_API_KEY ? "ЕСТЬ" : "НЕТ");
console.log("[INIT] Загрузка env: TELEGRAM_BOT_TOKEN =", process.env.TELEGRAM_BOT_TOKEN ? "ЕСТЬ" : "НЕТ");
console.log("[INIT] Загрузка env: VERCEL_URL =", process.env.VERCEL_URL ? "ЕСТЬ" : "НЕТ");
console.log("[INIT] Загрузка env: WEBHOOK_URL =", process.env.WEBHOOK_URL ? "ЕСТЬ" : "НЕТ");

// Telegram Bot Token
const botToken = process.env.TELEGRAM_BOT_TOKEN;

// Создаем бота
const bot = new Bot(botToken || "000000000:mock_token");

// ==========================================
// DATABASE (REDIS) SETUP
// ==========================================

const redisUrl = process.env.REDIS_URL || '';
let redis: Redis | null = null;

if (redisUrl) {
  try {
    redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null
    });
  } catch (e) {
    console.error(`[Database] Redis initialization failed:`, e);
  }
}

const memorySettings = new Map<string, string>();

async function getSetting(key: string): Promise<string | null> {
  if (redis) {
    try { return await redis.get(key); } catch (e) { return null; }
  }
  return memorySettings.get(key) || null;
}

async function saveSetting(key: string, value: string): Promise<void> {
  if (redis) {
    try { await redis.set(key, value); } catch (e) {}
  } else {
    memorySettings.set(key, value);
  }
}

// ==========================================
// EXPRESS APP SETUP
// ==========================================

const app = express();
app.use(express.json());

// ==========================================
// SETUP ROUTES
// ==========================================

setupRoutes({
  app,
  bot,
  botTexts,
  reloadBotTexts,
  getSetting,
  saveSetting,
  telegramApiCall: (method: string, body: any) => telegramApiCall(method, body, 10000, botToken || "")
});

// ==========================================
// BOT MIDDLEWARE
// ==========================================

bot.use(antiSpamMiddleware);

// ==========================================
// BOT COMMANDS
// ==========================================

bot.command("start", (ctx) => handleStart(ctx, botTexts));
bot.command("help", (ctx) => handleHelp(ctx, botTexts));
bot.command("rides", (ctx) => handleRidesCommand(ctx));
bot.command("manifest", (ctx) => handleManifest(ctx, botTexts));
bot.command("rules", (ctx) => handleRules(ctx, botTexts));
bot.command("calendar", (ctx) => handleCalendar(ctx));
bot.command("gpx", (ctx) => handleGpxCommand(ctx, ctx.match as string | undefined));
bot.command("pressure", (ctx) => handlePressure(ctx, botTexts));
bot.command("resto", (ctx) => handleResto(ctx, botTexts));
bot.command("komoot", (ctx) => handleKomoot(ctx, botTexts));
bot.command("rainfree", (ctx) => handleRainfree(ctx, botTexts));
bot.command("update_menu", (ctx) => handleUpdateMenu(ctx));

// ==========================================
// CALLBACK QUERIES
// ==========================================

bot.callbackQuery(/^ride_day:(.+)$/, async (ctx) => {
  const dateKey = ctx.match[1];
  await handleRideDayCallback(ctx, dateKey);
});

bot.callbackQuery(/^ride_detail:(.+):(\d+)$/, async (ctx) => {
  const dateKey = ctx.match[1];
  const rideIndex = parseInt(ctx.match[2]);
  await handleRideDetailCallback(ctx, dateKey, rideIndex);
});

bot.callbackQuery("rides_main", async (ctx) => {
  await handleRidesMainCallback(ctx);
});

bot.callbackQuery(/^open_gpx:(.+):(\d+)$/, async (ctx) => {
  const dateKey = ctx.match[1];
  const rideIndex = parseInt(ctx.match[2]);
  await handleOpenGpxCallback(ctx, dateKey, rideIndex);
});

bot.callbackQuery(/^share_gpx:(.+):(\d+)$/, async (ctx) => {
  const dateKey = ctx.match[1];
  const rideIndex = parseInt(ctx.match[2]);
  await handleShareGpxCallback(ctx, dateKey, rideIndex);
});

// Callback for profile parameter explanations
bot.callbackQuery(/^explain:(profile|difficulty|distance|speed):(.+):(\d+)$/, async (ctx) => {
  const type = ctx.match[1];
  const dateKey = ctx.match[2];
  const rideIndex = parseInt(ctx.match[3]);
  await handleExplanationCallback(ctx, type, dateKey, rideIndex);
});

// ==========================================
// TEXT MESSAGE HANDLER (AI)
// ==========================================

bot.on("message:text", (ctx) => handleTextMessage(ctx, getSetting));

// ==========================================
// WEBHOOK HANDLER
// ==========================================

if (process.env.NODE_ENV === "production") {
  app.use("/api/webhook", webhookCallback(bot, "express"));
}

// ==========================================
// AUTO WEBHOOK SETUP (Production)
// ==========================================

async function autoSetupWebhook(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log("[DEPLOY] Автоматическая настройка webhook...");
  
  const webhookUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}/api/webhook`
    : process.env.WEBHOOK_URL;

  if (!webhookUrl || !botToken) {
    console.log("[DEPLOY] ⚠️ Не удалось настроить webhook: нет URL или токена");
    return;
  }
  
  try {
    await telegramApiCall("setWebhook", { url: webhookUrl }, 10000, botToken);
    console.log("[DEPLOY] ✅ Webhook настроен успешно");
  } catch (err) {
    console.log("[DEPLOY] ⚠️ Ошибка настройки webhook:", err);
  }
}

if (process.env.NODE_ENV === "production") {
  autoSetupWebhook().catch(err => console.error("[DEPLOY] Ошибка авто-настройки webhook:", err));
}

// ==========================================
// LOCAL DEVELOPMENT
// ==========================================

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
  
  bot.start({
    onStart: (botInfo) => {
      console.log(`Bot is active and running as @${botInfo.username}`);
    }
  }).catch(err => {
    console.error("Failed to start bot:", err);
  });
}

export default app;
