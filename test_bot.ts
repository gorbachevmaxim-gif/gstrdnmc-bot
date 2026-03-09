import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
console.log("Token exists:", !!token);

if (token) {
  const bot = new Telegraf(token);
  bot.telegram.getMe().then(me => {
    console.log("Bot info:", me.username);
    process.exit(0);
  }).catch(err => {
    console.error("Error getting bot info:", err.message);
    process.exit(1);
  });
} else {
  console.log("No token");
  process.exit(1);
}
