// ==========================================
// HANDLERS - Обработчики команд и callback queries
// ==========================================

import { InputFile } from "grammy";
import type { Bot, Context } from "grammy";
import { 
  MAIN_KEYBOARD, 
  TOURS, 
  MONTHS, 
  BOT_COMMANDS,
  MESSAGE_AGE_LIMIT 
} from "./constants.js";
import { 
  fetchBotData, 
  fetchGpxContent, 
  formatDate, 
  formatRideDetails, 
  formatShareCaption,
  sanitizeFileName,
  generateFullIcs,
  convertKomootToGpx,
  parseShareParam
} from "./utils.js";
import type { BotTexts } from "./types.js";

// ==========================================
// ТИПЫ ДЛЯ КОНТЕКСТА
// ==========================================

interface HandlerContext {
  botTexts: BotTexts;
  redis: any;
  getSetting: (key: string) => Promise<string | null>;
  saveSetting: (key: string, value: string) => Promise<void>;
}

// ==========================================
// START COMMAND
// ==========================================

export function handleStart(ctx: Context, botTexts: BotTexts) {
  const startParam = ctx.match;
  
  if (startParam) {
    const shareData = parseShareParam(startParam as string);
    if (shareData) {
      return handleShareGpx(ctx, shareData.dateKey, shareData.rideIndex);
    }
  }
  
  // Regular start
  ctx.reply(botTexts.commands.start, { reply_markup: MAIN_KEYBOARD });
}

// ==========================================
// SHARE GPX (from start param)
// ==========================================

export async function handleShareGpx(ctx: Context, dateKey: string, rideIndex: number) {
  await ctx.reply("Загружаю GPX...");
  
  const data = await fetchBotData();
  if (!data) {
    await ctx.reply("Не удалось загрузить данные");
    return;
  }
  
  const dayInfo = data.groupedByDate?.[dateKey];
  const ride = dayInfo?.rides?.[rideIndex];
  
  if (!ride || !ride.gpxUrl) {
    await ctx.reply("GPX не найден");
    return;
  }
  
  const gpxContent = await fetchGpxContent(ride.gpxUrl);
  if (!gpxContent) {
    await ctx.reply("Не удалось скачать GPX");
    return;
  }
  
  const fileName = `${sanitizeFileName(ride.routeName)}.gpx`;
  const shareCaption = formatShareCaption(ride, dateKey, MONTHS);
  
  await ctx.replyWithDocument(
    new InputFile(Buffer.from(gpxContent), fileName),
    { caption: shareCaption, parse_mode: "HTML" }
  );
}

// ==========================================
// RIDES COMMAND
// ==========================================

export async function handleRidesCommand(ctx: Context) {
  const data = await fetchBotData();
  
  if (!data?.groupedByDate || Object.keys(data.groupedByDate).length === 0) {
    return ctx.reply("Нет подходящих маршрутов под такую погоду. Повтори проверку через 4-8 часов.");
  }
  
  const dates = Object.keys(data.groupedByDate);
  
  if (dates.length === 1) {
    const dateKey = dates[0];
    const dayInfo = data.groupedByDate[dateKey];
    await showRidesForDay(ctx, dateKey, dayInfo);
    return;
  }
  
  const buttons = dates.map(date => {
    const dayInfo = data.groupedByDate[date];
    const dateParts = date.split('-');
    const d = dateParts[2];
    const m = dateParts[1];
    const label = `${dayInfo.dayName} (${d}.${m})`;
    return [{ text: label, callback_data: `ride_day:${date}` }];
  });
  
  await ctx.reply("Выбери день:", {
    reply_markup: {
      inline_keyboard: buttons
    }
  });
}

// ==========================================
// CALLBACK: RIDE DAY SELECTION
// ==========================================

export async function handleRideDayCallback(ctx: Context, dateKey: string) {
  const data = await fetchBotData();
  const dayInfo = data?.groupedByDate?.[dateKey];
  
  if (!dayInfo) {
    await ctx.answerCallbackQuery("Данные не найдены");
    return;
  }
  
  await showRidesForDay(ctx, dateKey, dayInfo);
  await ctx.answerCallbackQuery();
}

// ==========================================
// SHOW RIDES FOR DAY (Helper)
// ==========================================

async function showRidesForDay(ctx: Context, dateKey: string, dayInfo: any) {
  const rides = dayInfo.rides;
  
  if (!rides || rides.length === 0) {
    await ctx.reply("Нет доступных маршрутов для этого дня.");
    return;
  }
  
  const formattedDate = formatDate(dateKey, MONTHS);
  
  if (rides.length === 1) {
    const ride = rides[0];
    const message = formatRideDetails(ride, dateKey, MONTHS) + 
      `\n\n<a href="https://t.me/gstrdnmc_bot?start=share_${dateKey}_0">Скачать GPX</a>`;
    
    await ctx.editMessageText(message, { 
      parse_mode: "HTML", 
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [
          [{ text: "На главную", callback_data: "rides_main" }]
        ]
      }
    });
    return;
  }
  
  const buttons = rides.map(ride => {
    const ps = ride.analysis?.profile?.score ? ` (ps ${ride.analysis.profile.score})` : '';
    return [{
      text: `${ride.routeName}, ${ride.routeParams.distance}км${ps}`,
      callback_data: `ride_detail:${dateKey}:${rides.indexOf(ride)}`
    }];
  });
  
  buttons.push([{ text: "← Назад к дням", callback_data: "rides_main" }]);
  
  await ctx.editMessageText(`<b>${dayInfo.dayName}, ${formattedDate}</b>\nВыбери маршрут:`, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons }
  });
}

// ==========================================
// CALLBACK: RIDE DETAIL
// ==========================================

export async function handleRideDetailCallback(ctx: Context, dateKey: string, rideIndex: number) {
  const data = await fetchBotData();
  const dayInfo = data?.groupedByDate?.[dateKey];
  const ride = dayInfo?.rides?.[rideIndex];
  
  if (!ride) {
    await ctx.answerCallbackQuery("Маршрут не найден");
    return;
  }
  
  const message = formatRideDetails(ride, dateKey, MONTHS) + 
    `\n\n<a href="https://t.me/gstrdnmc_bot?start=share_${dateKey}_${rideIndex}">Скачать GPX</a>`;
  
  // Build inline keyboard with explanation buttons for profile parameters
  const buttons: any[] = [];
  
  // Add profile parameter explanation buttons if available (2x2 grid)
  const profile = ride.analysis?.profile;
  if (profile) {
    const row1: any[] = [];
    const row2: any[] = [];
    
    if (profile.difficulty) {
      row1.push({ text: "Сложность", callback_data: `explain:difficulty:${dateKey}:${rideIndex}` });
    }
    if (profile.distanceRank) {
      row1.push({ text: "Дистанция", callback_data: `explain:distance:${dateKey}:${rideIndex}` });
    }
    if (profile.speedRank) {
      row2.push({ text: "Темп", callback_data: `explain:speed:${dateKey}:${rideIndex}` });
    }
    if (profile.score) {
      row2.push({ text: "ProfileScore", callback_data: `explain:profile:${dateKey}:${rideIndex}` });
    }
    
    if (row1.length > 0) buttons.push(row1);
    if (row2.length > 0) buttons.push(row2);
  }
  
  buttons.push([{ text: "← Назад", callback_data: `ride_day:${dateKey}` }]);
  
  try {
    await ctx.editMessageText(message, { 
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons },
      link_preview_options: { is_disabled: true }
    });
  } catch (e) {
    await ctx.reply(message, { 
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons },
      link_preview_options: { is_disabled: true }
    });
  }
  
  await ctx.answerCallbackQuery();
}

// ==========================================
// CALLBACK: RIDES MAIN (Back to days list)
// ==========================================

export async function handleRidesMainCallback(ctx: Context) {
  const data = await fetchBotData();
  
  if (!data?.groupedByDate || Object.keys(data.groupedByDate).length === 0) {
    await ctx.editMessageText("Пока нет подходящих маршрутов. Попробуй позже.");
    return;
  }
  
  const dates = Object.keys(data.groupedByDate);
  const buttons = dates.map(date => {
    const dayInfo = data.groupedByDate[date];
    const dateParts = date.split('-');
    const d = dateParts[2];
    const m = dateParts[1];
    const label = `${dayInfo.dayName} (${d}.${m})`;
    return [{ text: label, callback_data: `ride_day:${date}` }];
  });
  
  await ctx.editMessageText("Выбери день:", {
    reply_markup: { inline_keyboard: buttons }
  });
  
  await ctx.answerCallbackQuery();
}

// ==========================================
// CALLBACK: OPEN GPX
// ==========================================

export async function handleOpenGpxCallback(ctx: Context, dateKey: string, rideIndex: number) {
  await ctx.answerCallbackQuery("Загружаю GPX...");
  
  const data = await fetchBotData();
  const dayInfo = data?.groupedByDate?.[dateKey];
  const ride = dayInfo?.rides?.[rideIndex];
  
  if (!ride?.gpxUrl) {
    await ctx.answerCallbackQuery("GPX не найден");
    return;
  }
  
  const gpxContent = await fetchGpxContent(ride.gpxUrl);
  if (!gpxContent) {
    await ctx.answerCallbackQuery("Не удалось скачать GPX");
    return;
  }
  
  const fileName = `${sanitizeFileName(ride.routeName)}.gpx`;
  await ctx.replyWithDocument(new InputFile(Buffer.from(gpxContent), fileName));
}

// ==========================================
// CALLBACK: SHARE GPX
// ==========================================

export async function handleShareGpxCallback(ctx: Context, dateKey: string, rideIndex: number) {
  await ctx.answerCallbackQuery("Подготавливаю GPX...");
  
  const data = await fetchBotData();
  const dayInfo = data?.groupedByDate?.[dateKey];
  const ride = dayInfo?.rides?.[rideIndex];
  
  if (!ride?.gpxUrl) {
    await ctx.answerCallbackQuery("GPX не найден");
    return;
  }
  
  const gpxContent = await fetchGpxContent(ride.gpxUrl);
  if (!gpxContent) {
    await ctx.answerCallbackQuery("Не удалось скачать GPX");
    return;
  }
  
  const fileName = `${sanitizeFileName(ride.routeName)}.gpx`;
  const shareCaption = formatShareCaption(ride, dateKey, MONTHS);
  
  await ctx.replyWithDocument(
    new InputFile(Buffer.from(gpxContent), fileName),
    { caption: shareCaption, parse_mode: "HTML" }
  );
}

// ==========================================
// CALLBACK: EXPLANATION (Profile Parameters)
// ==========================================

// Explanation titles for profile parameters
const PROFILE_SCORE_EXPLANATION = `Общий набор высоты обманчив: 800 метров могут быть пологими или крутыми «стенками». ProfileScore показывает реальную сложность, оценивая «убойность» горок. Баллы зависят от крутизны и момента: подъем на финише «дороже», чем на старте. Высокий ProfileScore при малом наборе значит, что маршрут коварен и тяжелое в конце. (Формула ProCyclingStats)`;

const DIFFICULTY_EXPLANATION = `С психологической точки зрения важно заранее понимать характер маршрута. Будет ли это монотонная работа или проверка на силу и выносливость, где придется потерпеть? Речь о влиянии рельефа на ощущения от катания. Тяжелый – Profile Score выше 20. Бодрый – от 12 до 20. Легкий – менее 12.`;

const DISTANCE_RANK_EXPLANATION = `Большой маршрут – дистанция райда выше 160 км. Объемный – от 120 до 160 км. Короткий – менее 120 км.`;

const SPEED_RANK_EXPLANATION = `Темповой – средняя скорость в движении должна быть выше 33 км/ч. Такая средняя необходима как условие для большого райда от 160 до 200 км. Прогулочный – оптимальная средняя от 30 до 33 км/ч.`;

export async function handleExplanationCallback(ctx: Context, type: string, dateKey: string, rideIndex: number) {
  let title = '';
  let explanation = '';
  
  switch (type) {
    case 'profile':
      title = '📊 ProfileScore';
      explanation = PROFILE_SCORE_EXPLANATION;
      break;
    case 'difficulty':
      title = '🏔 Сложность';
      explanation = DIFFICULTY_EXPLANATION;
      break;
    case 'distance':
      title = '📏 Дистанция';
      explanation = DISTANCE_RANK_EXPLANATION;
      break;
    case 'speed':
      title = '⚡ Темп';
      explanation = SPEED_RANK_EXPLANATION;
      break;
    default:
      await ctx.answerCallbackQuery("Неизвестный тип объяснения");
      return;
  }
  
  // Send explanation as a regular message (alert has 200 char limit)
  await ctx.reply(`${title}\n\n${explanation}`);
  
  // Acknowledge callback query (without alert)
  try {
    await ctx.answerCallbackQuery();
  } catch (e) {
    // Query may have expired - ignore
  }
}

// ==========================================
// SIMPLE COMMANDS
// ==========================================

export function handleHelp(ctx: Context, botTexts: BotTexts) {
  ctx.reply(botTexts.commands.help);
}

export function handleManifest(ctx: Context, botTexts: BotTexts) {
  ctx.reply(botTexts.manifest);
}

export function handleRules(ctx: Context, botTexts: BotTexts) {
  ctx.reply(botTexts.rules);
}

export async function handleCalendar(ctx: Context) {
  const text = TOURS.map(t => `<b>${t.name}</b>\n${t.displayDate}\n${t.details}`).join("\n\n");
  await ctx.reply(`Календарь туров\n\n${text}`, { parse_mode: "HTML" });
  await ctx.replyWithDocument(new InputFile(Buffer.from(generateFullIcs(TOURS)), "calendar.ics"));
}

export async function handleGpxCommand(ctx: Context, url: string | undefined) {
  if (!url) {
    return ctx.reply("Пожалуйста, укажи ссылку на Komoot. Пример: /gpx https://www.komoot.com/tour/...");
  }
  
  const result = await convertKomootToGpx(url);
  if (result) {
    await ctx.replyWithDocument(new InputFile(Buffer.from(result.content), result.filename));
  } else {
    await ctx.reply("Не удалось конвертировать. Проверь ссылку.");
  }
}

export function handlePressure(ctx: Context, botTexts: BotTexts) {
  ctx.reply(botTexts.commands.pressure, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
}

export function handleResto(ctx: Context, botTexts: BotTexts) {
  ctx.reply(botTexts.commands.resto, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
}

export function handleKomoot(ctx: Context, botTexts: BotTexts) {
  ctx.reply(botTexts.commands.komoot, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
}

export function handleRainfree(ctx: Context, botTexts: BotTexts) {
  ctx.reply(botTexts.commands.rainfree, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
}

// ==========================================
// UPDATE MENU COMMAND
// ==========================================

export async function handleUpdateMenu(ctx: Context) {
  try {
    await ctx.api.setMyCommands(BOT_COMMANDS);
    try { await ctx.api.setMyCommands(BOT_COMMANDS, { language_code: "ru" }); } catch (e) {}
    try { await ctx.api.setMyCommands(BOT_COMMANDS, { language_code: "en" }); } catch (e) {}
    await ctx.reply("Меню обновлено!");
  } catch (err: any) {
    await ctx.reply(`Ошибка: ${err.message}`);
  }
}

// ==========================================
// MIDDLEWARE: ANTI-SPAM
// ==========================================

export async function antiSpamMiddleware(ctx: Context, next: () => Promise<void>) {
  if (ctx.message?.date) {
    const now = Math.floor(Date.now() / 1000);
    const messageAge = now - ctx.message.date;
    if (messageAge > MESSAGE_AGE_LIMIT) {
      console.log("Пропущено старое сообщение (защита от ретраев)");
      return; 
    }
  }
  await next();
}

// ==========================================
// TEXT MESSAGE HANDLER (AI)
// ==========================================

export async function handleTextMessage(
  ctx: Context,
  getSetting: (key: string) => Promise<string | null>
) {
  if (ctx.chat.type !== 'private' || ctx.message?.text?.startsWith("/")) return;
  
  console.log("[DEBUG] Получено сообщение от пользователя:", ctx.message?.text);
  
  const manualApiKey = await getSetting("groq_api_key");
  const apiKey = process.env.GROQ_API_KEY || manualApiKey;
  
  if (!apiKey) {
    return ctx.reply("API ключ для AI не настроен. Напиши /start для инструкций.");
  }
  
  try {
    const toursContext = TOURS.map(t => `- ${t.name}: ${t.displayDate}, ${t.details}`).join('\n');
    
    const systemPrompt = `
ТЫ — МИНИМАЛИСТИЧНЫЙ И ДРУЖЕЛЮБНЫЙ БОТ-АССИСТЕНТ СООБЩЕСТВА «ГАСТРОДИНАМИКА».

СТРОГИЕ ПРАВИЛА:
1. ДЛИНА ОТВЕТА: Максимум 3-4 коротких предложения. Если ответ длиннее 500 символов — ты проиграл.
2. ТЕМАТИКА: Отвечай ТОЛЬКО на вопросы о велосипедах, еде, ресторанах и кафе (отмеченных на нашей карте), наших турах, райдах на выходных, давлении в колесах (шинах, покрышках, камерах), маршрутах Гастродинамики в Komoot, о правилах и манифесте Гастродинамики. На любые другие темы (политика, космос, кулинария других стран и т.д.) отвечай фразой: «Я здесь для того, чтобы вносить ясность в наши райды. Давай вернемся к велосипедам и еде. Полный список команд - /help».
3. ИСТОЧНИК ДАННЫХ: Используй ТОЛЬКО данные ниже. Не выдумывай даты.

ИНСТРУМЕНТЫ И КОМАНДЫ:
- /rides: Маршруты на выходные с погодой.
- /gpx: Обход ограничений Komoot.
- /pressure: Калькулятор давления.
- /resto: Карта ресторанов.
- /komoot: Коллекции маршрутов.
- /rainfree: Поиск сухих дорог.

ТВОИ ЦИФРОВЫЕ ЗНАНИЯ:
1. Карта ресторанов: https://yandex.com/maps/213/moscow/?bookmarks%5BpublicId%5D=OfCmg0o9
2. Коллекции Komoot: https://www.komoot.com/user/1622023059217/collections

ДАННЫЕ ПО ТУРАМ:
${toursContext}
`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: ctx.message.text }
        ],
        model: "llama-3.1-8b-instant",
        temperature: 0.3,
        max_tokens: 300
      })
    });
    
    if (response.status === 429) {
      return ctx.reply("Лимит запросов временно исчерпан. Подожди минуту и попробуй ещё раз.");
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    const aiText = data.choices?.[0]?.message?.content;
    
    if (!aiText || aiText.length === 0) {
      return ctx.reply("Не удалось получить ответ. Попробуй ещё раз.");
    }
    
    await ctx.reply(aiText, { parse_mode: "Markdown" });
  } catch (e: any) { 
    console.error("[AI Error]:", e);
    const errorMsg = e?.message || e?.toString() || "Unknown error";
    ctx.reply(`Ошибка AI: ${errorMsg.substring(0, 200)}`); 
  }
}
