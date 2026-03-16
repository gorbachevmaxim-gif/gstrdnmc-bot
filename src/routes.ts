// ==========================================
// ROUTES - API эндпоинты для бота
// ==========================================

import type { Express, Request, Response } from "express";
import { InputFile } from "grammy";
import type { Bot } from "grammy";
import fs from "fs";
import path from "path";
import { BOT_COMMANDS, TOURS } from "./constants.js";
import { generateFullIcs } from "./utils.js";
import type { BotTexts } from "./types.js";

interface RouteDeps {
  app: Express;
  bot: Bot;
  botTexts: BotTexts;
  reloadBotTexts: () => void;
  getSetting: (key: string) => Promise<string | null>;
  saveSetting: (key: string, value: string) => Promise<void>;
  telegramApiCall: (method: string, body: any) => Promise<any>;
}

export function setupRoutes(deps: RouteDeps) {
  const { app, bot, botTexts, reloadBotTexts, getSetting, saveSetting, telegramApiCall } = deps;

  // Health check
  app.get("/api/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // Update commands via API
  app.get("/api/update_commands", async (req: Request, res: Response) => {
    try {
      await bot.api.setMyCommands(BOT_COMMANDS);
      try { await bot.api.setMyCommands(BOT_COMMANDS, { language_code: "ru" }); } catch (e) {}
      try { await bot.api.setMyCommands(BOT_COMMANDS, { language_code: "en" }); } catch (e) {}
      res.send("Commands successfully updated via API!");
    } catch (err: any) {
      res.status(500).send(`Error: ${err.message}`);
    }
  });

  // Config endpoints
  app.get("/api/config", async (req: Request, res: Response) => {
    const key = await getSetting("groq_api_key");
    res.json({ 
      hasKey: !!key || !!process.env.GROQ_API_KEY, 
      botTokenStatus: process.env.TELEGRAM_BOT_TOKEN ? "PRESENT" : "MISSING" 
    });
  });

  app.post("/api/config", async (req: Request, res: Response) => {
    if (req.body.apiKey) {
      await saveSetting("groq_api_key", req.body.apiKey);
      res.json({ status: "ok" });
    } else {
      res.status(400).json({ error: "API key required" });
    }
  });

  // Webhook endpoints
  app.post("/api/delete-webhook", async (req: Request, res: Response) => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({ error: "TELEGRAM_BOT_TOKEN не настроен" });
    }
    
    try {
      console.log("[WEBHOOK] Удаление webhook...");
      await telegramApiCall("deleteWebhook", {});
      console.log("[WEBHOOK] ✅ Webhook удален");
      res.json({ success: true, message: "Webhook удален. Теперь нужно установить новый через /api/setup-webhook" });
    } catch (error: any) {
      const errorMsg = error?.message || error?.toString() || "Unknown error";
      console.error("[WEBHOOK] Ошибка удаления:", errorMsg);
      res.status(500).json({ error: errorMsg });
    }
  });

  app.post("/api/setup-webhook", async (req: Request, res: Response) => {
    const webhookUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/webhook`
      : process.env.WEBHOOK_URL;

    if (!webhookUrl) {
      return res.status(400).json({ success: false, message: "VERCEL_URL не найден" });
    }

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({ success: false, message: "TELEGRAM_BOT_TOKEN не настроен" });
    }
    
    try {
      console.log("[WEBHOOK] Проверка текущего webhook...");
      const currentWebhook = await telegramApiCall("getWebhookInfo", {});
      console.log("[WEBHOOK] Текущий webhook:", currentWebhook.url || "не установлен");
      
      console.log("[WEBHOOK] Установка нового webhook...");
      await telegramApiCall("setWebhook", { url: webhookUrl });
      console.log("[WEBHOOK] ✅ Установлен:", webhookUrl);
      
      const newWebhook = await telegramApiCall("getWebhookInfo", {});
      console.log("[WEBHOOK] Подтверждено:", newWebhook.url);
      
      res.json({ success: true, message: `Webhook установлен: ${webhookUrl}` });
    } catch (error: any) {
      const errorMsg = error?.message || error?.toString() || "Unknown error";
      console.error("[WEBHOOK] Ошибка:", errorMsg);
      res.status(400).json({ success: false, message: errorMsg });
    }
  });

  // Bot texts endpoints
  app.get("/api/texts", (req: Request, res: Response) => {
    res.json({
      manifest: botTexts.manifest,
      rules: botTexts.rules,
      commands: botTexts.commands,
      systemPrompt: botTexts.systemPrompt
    });
  });

  app.post("/api/texts", async (req: Request, res: Response) => {
    const { manifest, rules, commands, systemPrompt } = req.body;
    
    const apiKey = req.headers['x-api-key'];
    const validKey = process.env.BOT_API_KEY;
    
    if (validKey && apiKey !== validKey) {
      return res.status(403).json({ error: "Неверный API ключ" });
    }
    
    try {
      const newTexts = {
        manifest: manifest || botTexts.manifest,
        rules: rules || botTexts.rules,
        commands: commands || botTexts.commands,
        systemPrompt: systemPrompt || botTexts.systemPrompt
      };
      
      const textsPath = path.join(process.cwd(), 'bot-texts.json');
      fs.writeFileSync(textsPath, JSON.stringify(newTexts, null, 2), 'utf-8');
      
      reloadBotTexts();
      
      res.json({ status: "ok", message: "Тексты обновлены и перезагружены" });
    } catch (error: any) {
      console.error('[TEXTS] Ошибка обновления:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/texts/:key", async (req: Request, res: Response) => {
    const { key } = req.params;
    const { value } = req.body;
    
    const apiKey = req.headers['x-api-key'];
    const validKey = process.env.BOT_API_KEY;
    
    if (validKey && apiKey !== validKey) {
      return res.status(403).json({ error: "Неверный API ключ" });
    }
    
    if (!value) {
      return res.status(400).json({ error: "Требуется параметр value" });
    }
    
    const allowedKeys = ['manifest', 'rules', 'systemPrompt'];
    const allowedCommandKeys = ['start', 'help', 'pressure', 'resto', 'komoot', 'rainfree', 'gpx_no_url'];
    
    try {
      if (allowedKeys.includes(key)) {
        (botTexts as any)[key] = value;
      } else if (allowedCommandKeys.includes(key)) {
        botTexts.commands[key] = value;
      } else {
        return res.status(400).json({ error: `Недопустимый ключ: ${key}` });
      }
      
      const textsPath = path.join(process.cwd(), 'bot-texts.json');
      fs.writeFileSync(textsPath, JSON.stringify(botTexts, null, 2), 'utf-8');
      
      reloadBotTexts();
      
      res.json({ status: "ok", key, value: value.substring(0, 50) + '...' });
    } catch (error: any) {
      console.error('[TEXTS] Ошибка обновления ключа:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Root endpoint
  app.get("/", (req: Request, res: Response) => {
    res.send("GSTRDNMC BOT is running");
  });
}
