import express from "express";
import { Bot, webhookCallback, InputFile } from "grammy";
import dotenv from "dotenv";
import Redis from "ioredis";
import fs from "fs";

// ✅ VERCEL TIMEOUT FIX: Увеличиваем лимит времени до 60 секунд
// По умолчанию Vercel убивает функции через 10 секунд, 
// а генерация ответа от AI может занимать 5-12 секунд
export const maxDuration = 60;

// ✅ Загружаем переменные окружения из разных файлов
// В Vercel продакшене переменные уже в process.env, локально - из .env.local
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

console.log("[INIT] Загрузка env: GROQ_API_KEY =", process.env.GROQ_API_KEY ? "ЕСТЬ" : "НЕТ");
console.log("[INIT] Загрузка env: TELEGRAM_BOT_TOKEN =", process.env.TELEGRAM_BOT_TOKEN ? "ЕСТЬ" : "НЕТ");
console.log("[INIT] Загрузка env: VERCEL_URL =", process.env.VERCEL_URL ? "ЕСТЬ" : "НЕТ");
console.log("[INIT] Загрузка env: WEBHOOK_URL =", process.env.WEBHOOK_URL ? "ЕСТЬ" : "НЕТ");

// Telegram Bot Token - после загрузки env!
const botToken = process.env.TELEGRAM_BOT_TOKEN;

// Создаем бота ПОСЛЕ загрузки env
const bot = new Bot(botToken || "000000000:mock_token");

// Database setup
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

const TOURS = [
    { id: "uzbekistan", name: "Самарканд и Ташкент", start: "20260409", end: "20260413", location: "Узбекистан", description: "Велотур Самарканд и Ташкент. 4 дня, 2 райда.", displayDate: "с 9 по 12 апреля 2026", details: "4 дня, 2 райда" },
    { id: "minsk", name: "Минск", start: "20260507", end: "20260511", location: "Беларусь, Минск", description: "Велотур в Минск. 3 дня, 2 райда.", displayDate: "с 7 по 10 мая 2026", details: "3 дня, 2 райда" },
    { id: "krasnoyarsk", name: "Красноярск", start: "20260610", end: "20260615", location: "Россия, Красноярск", description: "Велотур в Красноярск. 7 дней, 4 райда.", displayDate: "с 10 по 14 июня 2026", details: "7 дней, 4 райда" },
    { id: "chuvashia", name: "Чувашия", start: "20260708", end: "20260713", location: "Россия, Чувашия", description: "Велотур в Чувашию. 5 дней, 2 райда.", displayDate: "с 8 по 12 июля 2026", details: "5 дней, 2 райда" },
    { id: "vladivostok", name: "Владивосток", start: "20260725", end: "20260802", location: "Россия, Владивосток", description: "Велотур во Владивосток. 7 дней, 4 райда.", displayDate: "с 25 июля по 1 августа 2026", details: "7 дней, 4 райда" },
    { id: "pskov", name: "Пушгоры и Псков", start: "20260813", end: "20260817", location: "Россия, Псков", description: "Велотур в Пушгоры и Псков. 3 дня, 2 райда.", displayDate: "с 13 по 16 августа 2026", details: "3 дня, 2 райда" },
    { id: "kamyshin", name: "Камышин", start: "20260819", end: "20260824", location: "Россия, Камышин", description: "Велотур в Камышин. 5 дней, 4 райда.", displayDate: "с 19 по 23 августа 2026", details: "5 дней, 4 райда" },
    { id: "turkey", name: "Турция", start: "20261030", end: "20261109", location: "Турция", description: "Велотур в Турцию. 10 дней, 7 райдов.", displayDate: "с 30 октября по 8 ноября 2026", details: "10 дней, 7 райдов" }
];

const MANIFEST_TEXT = `Многие спрашивают, как можно присоединиться к Гастродинамике. Здесь мы описали что нужно делать, чтобы быть внутри комьюнити.

1. Быть вовлеченным в нашу общую жизнь, помогать с организацией туров, не стесняться, проявлять инициативу. У каждого из нас есть свои сильный стороны, профессиональные навыки, связи в обществе и многое другое, что можно отдать ребятам в комьюнити. Подумайте что можете сделать именно вы.

2. Быть сильным во время заездов, не жаловаться, рассчитывать свои силы и поддерживать друг друга.

3. Можно ли быть слабым для больших райдов, но быть в сообществе? Конечно, да! Главное, быть воспитанным, отдавать в комьюнити больше, чем забирать, регулярно тренироваться, если необходимо, прогрессировать и присоединяться к заездам по готовности.

4. Проявлять интерес к еде и к людям, кто её создает. Вы можете не знать чем отличается итальянский трюфель от французского, или же фамилии всех шефов сибирских ресторанов, но нам хочется, чтобы каждый развивал свои вкусы и помогал бы находить новые направления для туров через интересную локальную гастрономию.

5. Следить за питанием, общим состоянием здоровья, не забывать о витаминах. Мы искренне проповедуем максимальную эффективность как во время туров, так и за их пределами, поэтому хотим, чтобы каждый внутри комьюнити ответственно подходил к тому, что он ест, какой образ жизни ведет, как восстанавливается после физических нагрузок.

6. Заботиться о своем велосипеде, делать регулярное обслуживание, располагать расходниками к нему и важными запчастями (особенно в турах, вдалеке от дома). Ни для кого из нас не в кайф вместо классного заезда в хорошей компании, ждать кого-либо на обочине по причине безответственного подхода к своей технике. Проявляйте такую же заботу к велосипеду, как и к самому себе.

7. Управлять ожиданиями в комьюнити, чтобы ни у кого не было недопониманий. Сразу спрашивать, если что-то непонятно, и не молчать, когда видите, что чего-то не хватает. Делать шаг вперед, если есть идея с чем можете всем помочь, но не знаете с чего начать. Говорить заранее, если с чем-то не согласны, а критикуя что-то — всегда предлагать свой вариант. И главное, беря ответственность за что-либо — быть прозрачным, доводить дело до конца или вовремя делегировать на другого участника.

8. Если по каким-то причинам решили не быть частью комьюнити, то это нормально — сообщите всем об этом, поблагодарим друг друга за опыт, обнимемся и будем спокойно жить дальше.`;

const RULES_TEXT = `Мы едем не просто кататься, мы едем вместе. Чтобы райд прошел безопасно и в кайф, мы договариваемся о правилах «на берегу».

1. Я – не пассажир, я – пилот.
Организаторы обеспечивают логистику, маршрут и сопровождение. Но они не няньки.
Техника. Я гарантирую исправность своего велосипеда, чистоту цепи и надежность тормозов. Навык самостоятельной замены камеры (покрышки) – обязателен.
Специфика маршрута. Я понимаю, что любой райд требует подготовки «железа».
Покрышки: Подбор резины соответствует покрытию. Это мой залог зацепа и безопасности на спусках и поворотах.
Трансмиссия: Моя кассета подходит для рельефа. Я здесь, чтобы крутить педали и любоваться пейзажем, а не ломать колени на слишком тяжелых передачах.
Экипировка. У меня в наличии: шлем (обязательно!), ремкомплект, запаска (камера или покрышка), насос и свет. Отсутствие чего-либо из списка – это моя личная ответственность, которую я решаю без задержки группы.
Тело. У меня адекватная оценка своей физподготовки и полная уверенность в том, что заявленный километраж мне по силам.

2. Дисциплина – это вежливость.
Семеро одного не ждут.
Старт. Если сбор назначен на 8:00, в 8:00 мы уже в движении.
Опоздания. В случае моего опоздания группа уезжает. Догонять придется самостоятельно и за свой счет (такси или своим ходом).
Брифинги. Я внимательно слушаю брифинги и читаю чат. Вопросы о том, что уже было озвучено или написано – это неуважение к времени организаторов.

3. Режим и Безопасность.
Мы здесь ради спорта и эмоций, а не ради угара.
Алкоголь. Сухой закон действует с момента пробуждения и до финиша райда. Вечером – умеренное потребление, чтобы утром быть в отличной форме. Если из-за самочувствия я не могу ехать в общем темпе – см. пункт про «Опоздания».
Правила движения. Мы едем по дорогам общего пользования. Я знаю и уважаю ПДД, следую только командам ведущих группу.

4. Кодекс.
В группе – мы уважаем темп друг друга. «Лоси» не дергают группу, «туристы» не лезут вперед. Желание ехать быстрее или медленнее – это мой выбор: я предупреждаю и еду соло, снимая ответственность с группы.
Поддержка – если райдер пробил колесо или упал, мы останавливаемся и помогаем. Но если кто-то просто не тянет темп из-за отсутствия подготовки, то садится в машину сопровождения, чтобы не задерживать пелотон (см. п.1). Своих не бросаем, но и не тащим.
Гендер – в смешанных группах мы соблюдаем культуру джентльменства. Мы не «дропаем» девушек на сложных участках, если едем в одной пачке.

5. Отношение к организаторам.
Организаторы – это гиды вашего приключения, а не обслуживающий персонал.
Мы общаемся на равных и с уважением.
Любая помощь организаторам приветствуется и повышает карму (резерв ресторанов, организация трансфера и машины сопровождения).`;

function generateFullIcs(): string {
    const events = TOURS.map(tour => [
        "BEGIN:VEVENT",
        `UID:${tour.id}@gastrodynamica.com`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
        `DTSTART;VALUE=DATE:${tour.start}`,
        `DTEND;VALUE=DATE:${tour.end}`,
        `SUMMARY:${tour.name}`,
        `LOCATION:${tour.location}`,
        `DESCRIPTION:${tour.description}`,
        "STATUS:CONFIRMED",
        "SEQUENCE:0",
        "BEGIN:VALARM",
        "TRIGGER:-P1D",
        "DESCRIPTION:Reminder",
        "ACTION:DISPLAY",
        "END:VALARM",
        "END:VEVENT"
    ].join("\r\n")).join("\r\n");

    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gastrodynamica//Tour Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", events, "END:VCALENDAR"].join("\r\n");
}

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

async function convertKomootToGpx(komootUrl: string): Promise<{ filename: string, content: string } | null> {
    try {
        let html = '';
        const proxyUrls = [`https://corsproxy.io/?${encodeURIComponent(komootUrl)}`, `https://api.allorigins.win/raw?url=${encodeURIComponent(komootUrl)}`];
        for (const url of proxyUrls) {
            try {
                const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (res.ok) { html = await res.text(); break; }
            } catch (e) {}
        }
        if (!html) return null;
        const startMarker = 'kmtBoot.setProps("';
        const startIndex = html.indexOf(startMarker);
        if (startIndex === -1) return null;
        const jsonStart = startIndex + startMarker.length;
        const endIndex = html.indexOf('");', jsonStart);
        if (endIndex === -1) return null;
        const data = JSON.parse(JSON.parse(`"${html.substring(jsonStart, endIndex)}"`));
        const tourName = data?.page?._embedded?.tour?.name || 'route';
        const coordinates = data?.page?._embedded?.tour?._embedded?.coordinates?.items;
        if (!coordinates) return null;
        const points = coordinates.map((c: any) => `      <trkpt lat="${c.lat}" lon="${c.lng}"><ele>${c.alt}</ele></trkpt>`).join('\n');
        return { filename: `${tourName.replace(/[^a-z0-9]/gi, '_')}.gpx`, content: `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${tourName}</name></metadata><trk><name>${tourName}</name><trkseg>\n${points}\n</trkseg></trk></gpx>` };
    } catch (e) { return null; }
}


// Создаем бота

// Express app - объявляем здесь, чтобы использовать во всех функциях
const app = express();
app.use(express.json());

// ==========================================
// HELPER: Прямой fetch к Telegram API (для Vercel) с таймаутом
// ==========================================
async function telegramApiCall(method: string, body: any, timeoutMs = 10000): Promise<any> {
    if (!botToken || botToken === "000000000:mock_token") {
        throw new Error("TELEGRAM_BOT_TOKEN не настроен");
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const data = await response.json();
        if (!data.ok) {
            throw new Error(`Telegram API error: ${data.description}`);
        }
        return data.result;
    } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Telegram API timeout after ${timeoutMs}ms`);
        }
        throw error;
    }
}

// ==========================================
// БЛОК 0: РУЧНАЯ УСТАНОВКА WEBHOOK ЧЕРЗ API
// ==========================================
// Убрали автоматическую установку webhook при старте - 
// Vercel имеет ограничения сети, лучше устанавливать вручную
async function setupWebhookManual(): Promise<{ success: boolean; message: string }> {
    const webhookUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}/api/webhook`
        : process.env.WEBHOOK_URL;

    if (!webhookUrl) {
        return { success: false, message: "VERCEL_URL не найден" };
    }

    if (!botToken || botToken === "000000000:mock_token") {
        return { success: false, message: "TELEGRAM_BOT_TOKEN не настроен" };
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
        
        return { success: true, message: `Webhook установлен: ${webhookUrl}` };
    } catch (error: any) {
        const errorMsg = error?.message || error?.toString() || "Unknown error";
        console.error("[WEBHOOK] Ошибка:", errorMsg);
        return { success: false, message: errorMsg };
    }
}

// Эндпоинт для ручной установки webhook
app.post("/api/setup-webhook", async (req, res) => {
    const result = await setupWebhookManual();
    if (result.success) {
        res.json(result);
    } else {
        res.status(400).json(result);
    }
});

// ==========================================
// БЛОК 1: ЗАЩИТА ОТ СПАМА И ПОВТОРОВ (Middleware)
// ==========================================
bot.use(async (ctx, next) => {
  // Если сообщение пришло слишком поздно (старше 2 минут) - игнорируем его.
  // Это убивает ту самую "бесконечную петлю" Телеграма.
  if (ctx.message?.date) {
    const now = Math.floor(Date.now() / 1000);
    const messageAge = now - ctx.message.date;
    if (messageAge > 120) {
      console.log("Пропущено старое сообщение (защита от ретраев)");
      return; 
    }
  }
  await next(); // Передаем сообщение дальше
});

const mainKeyboard = {
    keyboard: [
        [{ text: "RAINFREE", web_app: { url: "https://rain-free.vercel.app" } }, { text: "TIRE PRESSURE", web_app: { url: "https://axs.sram.com/guides/tire/pressure" } }],
        [{ text: "RESTO", web_app: { url: "https://yandex.com/maps/213/moscow/?bookmarks%5BpublicId%5D=OfCmg0o9&ll=37.569611%2C55.726974&mode=bookmarks&utm_campaign=bookmarks&utm_source=share&z=" } }, { text: "KOMOOT", web_app: { url: "https://www.komoot.com/user/1622023059217/collections" } }]
    ],
    resize_keyboard: true,
    is_persistent: true
};

// ==========================================
// БЛОК 2: КОМАНДЫ (Обязательно ПЕРЕД нейросетью!)
// ==========================================
bot.command("start", (ctx) => ctx.reply("Привет! Я @gstrdnmc_bot. Спроси меня о турах, маршрутах или давлении в шинах! Напиши /help для списка команд.", { reply_markup: mainKeyboard }));

bot.command("help", async (ctx) => {
    await ctx.reply("Просто напиши мне вопрос текстом, и я постараюсь помочь.\n\nДоступные команды:\n/manifest - манифест комьюнити\n/rules - правила для райдов\n/calendar - календарь туров\n/rides - маршруты на выходные\n/gpx - скачать GPX из Komoot\n/pressure - давление в шинах\n/resto - карта ресторанов\n/komoot - коллекции маршрутов\n/rainfree - поиск сухих дорог");
});

bot.command("rides", async (ctx) => {
    try {
        const apiKey = process.env.BOT_API_KEY;
        const baseUrl = process.env.RAIN_FREE_URL || "https://rain-free.vercel.app";
        const response = await fetch(`${baseUrl}/api/bot-data`, { headers: { 'x-api-key': apiKey || '' } });
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data: any = await response.json();
        
        if (!data.groupedByDate || Object.keys(data.groupedByDate).length === 0) {
            return ctx.reply("Нет подходящих маршрутов под такую погоду. Повтори проверку через 4-8 часов.");
        }
        
        // Проверяем количество дней - если только один день, сразу показываем маршруты
        const dates = Object.keys(data.groupedByDate);
        
        if (dates.length === 1) {
            // Только один день - показываем маршруты сразу
            const dateKey = dates[0];
            const dayInfo = data.groupedByDate[dateKey];
            await showRidesForDay(ctx, dateKey, dayInfo);
            return;
        }
        
        // Несколько дней - показываем кнопки для выбора дня
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
        
    } catch (err) { 
        console.error("[Rides error]:", err);
        ctx.reply("Не удалось загрузить данные о райдах."); 
    }
});

// Обработчик нажатий на кнопки выбора дня
bot.callbackQuery(/^ride_day:(.+)$/, async (ctx) => {
    const dateKey = ctx.match[1];
    
    try {
        const apiKey = process.env.BOT_API_KEY;
        const baseUrl = process.env.RAIN_FREE_URL || "https://rain-free.vercel.app";
        const response = await fetch(`${baseUrl}/api/bot-data`, { headers: { 'x-api-key': apiKey || '' } });
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data: any = await response.json();
        
        const dayInfo = data.groupedByDate?.[dateKey];
        if (!dayInfo) {
            await ctx.answerCallbackQuery("Данные не найдены");
            return;
        }
        
        await showRidesForDay(ctx, dateKey, dayInfo);
        await ctx.answerCallbackQuery();
        
    } catch (err) {
        console.error("[Callback error]:", err);
        await ctx.answerCallbackQuery("Ошибка загрузки данных");
    }
});

// Функция показа маршрутов для конкретного дня
async function showRidesForDay(ctx: any, dateKey: string, dayInfo: any) {
    const rides = dayInfo.rides;
    
    if (!rides || rides.length === 0) {
        await ctx.reply("Нет доступных маршрутов для этого дня.");
        return;
    }
    
    // Форматируем дату для отображения (день недели + дата)
    const dateParts = dateKey.split('-');
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1;
    const day = parseInt(dateParts[2]);
    const dateObj = new Date(year, month, day);
    
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const formattedDate = `${day} ${months[month]}`;
    
    // Если только один маршрут - сразу показываем детали
    if (rides.length === 1) {
        const ride = rides[0];
        const message = `<b>${ride.routeName}</b>\n\n` +
            `${ride.routeParams.distance} км / ${ride.routeParams.elevationGain} м\n` +
            `Время: ${ride.routeParams.saddleTime}\n\n` +
            `${ride.weatherParams.temperature}º\n` +
            `${ride.weatherParams.wind}\n` +
            `${ride.weatherParams.precipitation ? `${Number(ride.weatherParams.precipitation.toFixed(1))} мм` : 'Нет осадков'}\n` +
            `${ride.weatherParams.sunshine}`;
        
        await ctx.reply(message, { 
            parse_mode: "HTML", 
            link_preview_options: { is_disabled: true },
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Скачать GPX", callback_data: `open_gpx:${dateKey}:0` }, { text: "Поделиться", callback_data: `share_gpx:${dateKey}:0` }],
                    [{ text: "На главную", callback_data: "rides_main" }]
                ]
            }
        });
        return;
    }
    
    // Несколько маршрутов - показываем кнопки
    const buttons = rides.map(ride => [{
        text: `${ride.routeName} (${ride.routeParams.distance}км)`,
        callback_data: `ride_detail:${dateKey}:${rides.indexOf(ride)}`
    }]);
    
    // Кнопка возврата на выбор дней
    buttons.push([{ text: "← Назад к дням", callback_data: "rides_main" }]);
    
    await ctx.editMessageText(`<b>${dayInfo.dayName}, ${formattedDate}</b>\nВыбери маршрут:`, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons }
    });
}

// Обработчик деталей маршрута
bot.callbackQuery(/^ride_detail:(.+):(\d+)$/, async (ctx) => {
    const [dateKey, rideIndex] = [ctx.match[1], parseInt(ctx.match[2])];
    
    try {
        const apiKey = process.env.BOT_API_KEY;
        const baseUrl = process.env.RAIN_FREE_URL || "https://rain-free.vercel.app";
        const response = await fetch(`${baseUrl}/api/bot-data`, { headers: { 'x-api-key': apiKey || '' } });
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data: any = await response.json();
        
        const dayInfo = data.groupedByDate?.[dateKey];
        const ride = dayInfo?.rides?.[rideIndex];
        
        if (!ride) {
            await ctx.answerCallbackQuery("Маршрут не найден");
            return;
        }
        
        const message = `<b>${ride.routeName}</b>\n\n` +
            `<b>Дистанция:</b> ${ride.routeParams.distance} км\n` +
            `<b>Набор высоты:</b> ${ride.routeParams.elevationGain} м\n` +
            `<b>Время в седле:</b> ${ride.routeParams.saddleTime}\n\n` +
            `<b>Температура:</b> ${ride.weatherParams.temperature}º\n` +
            `<b>Ветер:</b> ${ride.weatherParams.wind}\n` +
            `<b>Порывы:</b> ${ride.weatherParams.gusts || 'Нет'}\n` +
            `<b>Осадки:</b> ${ride.weatherParams.precipitation ? `${Number(ride.weatherParams.precipitation.toFixed(1))} мм` : 'Нет'}\n` +
            `<b>Солнце (09:00–18:00):</b> ${ride.weatherParams.sunshine}\n\n` +
            `<b>Бидонов:</b> ${ride.analysis?.nutrition?.bidons || '-'}\n` +
            `<b>Гели:</b> ${ride.analysis?.nutrition?.gels || '-'}`;
        
        const buttons = [
            [{ text: "Скачать GPX", callback_data: `open_gpx:${dateKey}:${rideIndex}` }, { text: "Поделиться", callback_data: `share_gpx:${dateKey}:${rideIndex}` }],
            [{ text: "← Назад", callback_data: `ride_day:${dateKey}` }]
        ];
        
        try {
            await ctx.editMessageText(message, { 
                parse_mode: "HTML",
                reply_markup: { inline_keyboard: buttons },
                link_preview_options: { is_disabled: true }
            });
        } catch (e) {
            // Если не удается редактировать (например, сообщение слишком старое) - отправляем новое
            await ctx.reply(message, { 
                parse_mode: "HTML",
                reply_markup: { inline_keyboard: buttons },
                link_preview_options: { is_disabled: true }
            });
        }
        
        await ctx.answerCallbackQuery();
        
    } catch (err) {
        console.error("[Detail error]:", err);
        await ctx.answerCallbackQuery("Ошибка");
    }
});

// Возврат на главную страницу выбора дней
bot.callbackQuery("rides_main", async (ctx) => {
    try {
        const apiKey = process.env.BOT_API_KEY;
        const baseUrl = process.env.RAIN_FREE_URL || "https://rain-free.vercel.app";
        const response = await fetch(`${baseUrl}/api/bot-data`, { headers: { 'x-api-key': apiKey || '' } });
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data: any = await response.json();
        
        if (!data.groupedByDate || Object.keys(data.groupedByDate).length === 0) {
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
        
    } catch (err) {
        console.error("[Main error]:", err);
        await ctx.answerCallbackQuery("Ошибка");
    }
});

// Обработчик "Открыть GPX" - скачивает файл и отправляет как документ
bot.callbackQuery(/^open_gpx:(.+):(\d+)$/, async (ctx) => {
    const [dateKey, rideIndex] = [ctx.match[1], parseInt(ctx.match[2])];
    
    await ctx.answerCallbackQuery("Загружаю GPX...");
    
    try {
        const apiKey = process.env.BOT_API_KEY;
        const baseUrl = process.env.RAIN_FREE_URL || "https://rain-free.vercel.app";
        const response = await fetch(`${baseUrl}/api/bot-data`, { headers: { 'x-api-key': apiKey || '' } });
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data: any = await response.json();
        
        const dayInfo = data.groupedByDate?.[dateKey];
        const ride = dayInfo?.rides?.[rideIndex];
        
        if (!ride || !ride.gpxUrl) {
            await ctx.answerCallbackQuery("GPX не найден");
            return;
        }
        
        // Скачиваем GPX файл
        const gpxResponse = await fetch(ride.gpxUrl);
        if (!gpxResponse.ok) {
            await ctx.answerCallbackQuery("Не удалось скачать GPX");
            return;
        }
        
        const gpxContent = await gpxResponse.text();
        
        // Формируем имя файла из названия маршрута
        const fileName = `${ride.routeName.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_')}.gpx`;
        
        // Отправляем файл пользователю
        await ctx.replyWithDocument(new InputFile(Buffer.from(gpxContent), fileName));
        
    } catch (err) {
        console.error("[Open GPX error]:", err);
        await ctx.answerCallbackQuery("Ошибка при загрузке GPX");
    }
});

// Обработчик "Поделиться GPX" - отправляет файл с подписью для пересылки друзьям
bot.callbackQuery(/^share_gpx:(.+):(\d+)$/, async (ctx) => {
    const [dateKey, rideIndex] = [ctx.match[1], parseInt(ctx.match[2])];
    
    await ctx.answerCallbackQuery("Подготавливаю GPX...");
    
    try {
        const apiKey = process.env.BOT_API_KEY;
        const baseUrl = process.env.RAIN_FREE_URL || "https://rain-free.vercel.app";
        const response = await fetch(`${baseUrl}/api/bot-data`, { headers: { 'x-api-key': apiKey || '' } });
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data: any = await response.json();
        
        const dayInfo = data.groupedByDate?.[dateKey];
        const ride = dayInfo?.rides?.[rideIndex];
        
        if (!ride || !ride.gpxUrl) {
            await ctx.answerCallbackQuery("GPX не найден");
            return;
        }
        
        // Скачиваем GPX файл
        const gpxResponse = await fetch(ride.gpxUrl);
        if (!gpxResponse.ok) {
            await ctx.answerCallbackQuery("Не удалось скачать GPX");
            return;
        }
        
        const gpxContent = await gpxResponse.text();
        
        // Формируем имя файла и подпись для пересылки друзьям
        const fileName = `${ride.routeName.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_')}.gpx`;
        
        // Формируем подпись с информацией о маршруте
        const shareCaption = `${ride.routeName}

${ride.routeParams.distance} км | ${ride.routeParams.elevationGain} м | ${ride.routeParams.saddleTime}
${ride.weatherParams.temperature}º | ${ride.weatherParams.wind}

GPX-файл для навигатора`;
        
        // Отправляем файл с подписью для удобной пересылки
        await ctx.replyWithDocument(
            new InputFile(Buffer.from(gpxContent), fileName),
            { caption: shareCaption, parse_mode: "HTML" }
        );
        
    } catch (err) {
        console.error("[Share GPX error]:", err);
        await ctx.answerCallbackQuery("Ошибка при загрузке GPX");
    }
});

bot.command("manifest", (ctx) => ctx.reply(MANIFEST_TEXT));
bot.command("rules", (ctx) => ctx.reply(RULES_TEXT));
bot.command("calendar", async (ctx) => {
    const text = TOURS.map(t => `<b>${t.name}</b>\n${t.displayDate}\n${t.details}`).join("\n\n");
    await ctx.reply(`Календарь туров\n\n${text}`, { parse_mode: "HTML" });
    await ctx.replyWithDocument(new InputFile(Buffer.from(generateFullIcs()), "calendar.ics"));
});
bot.command("gpx", async (ctx) => {
    const url = ctx.match;
    if (!url) return ctx.reply("Обход ограничений Komoot на скачивание GPX. Вставь ссылку на маршрут Komoot после /gpx, например: /gpx https://www.komoot.com/tour/... Сгенерированный файл будет готов к экспорту в Telegram или сторонние навигаторы.\n\nМаршруты Гастродинамики можно посмотреть в коллекциях Komoot, нажав на кнопку KOMOOT в меню.");
    const result = await convertKomootToGpx(url);
    if (result) await ctx.replyWithDocument(new InputFile(Buffer.from(result.content), result.filename));
    else ctx.reply("Не удалось конвертировать.");
});

bot.command("pressure", (ctx) => ctx.reply("<a href=\"https://axs.sram.com/guides/tire/pressure\">Калькулятор</a> оптимального давления — это твой накат, зацеп и безопасность. Чтобы не гадать, введи: свой вес и байка, ширину покрышки и обода. Калькулятор выдаст точные цифры для настройки колес.", { parse_mode: "HTML", link_preview_options: { is_disabled: true } }));
bot.command("resto", (ctx) => ctx.reply("Места на <a href=\"https://yandex.com/maps/213/moscow/?bookmarks%5BpublicId%5D=OfCmg0o9&ll=37.569611%2C55.726974&mode=bookmarks&utm_campaign=bookmarks&utm_source=share&z=\">Яндекс Картах</a> — рестораны и кафе для старта и финиша райда во множестве городов, где мы были или обязательно будем", { parse_mode: "HTML", link_preview_options: { is_disabled: true } }));
bot.command("komoot", (ctx) => ctx.reply("<a href=\"https://www.komoot.com/user/1622023059217/collections\">Коллекции</a> маршрутов Гастродинамики — библиотека наших дорог и смыслов. Здесь собраны подмосковные сокровища, рассветные 5AM и легендарные побеги от дождя La Belle Échappée. Ищи полные гиды по всем нашим гастротурам. Твой путь начинается здесь.", { parse_mode: "HTML", link_preview_options: { is_disabled: true } }));
bot.command("rainfree", (ctx) => ctx.reply("Это твой план побега от станка и дивана. Это твой <a href=\"https://rain-free.vercel.app\">ключ к сухому асфальту</a> и свободе от погодных рамок. Это инструмент для тех, кто предпочитает ехать, когда остальные сдаются непогоде.", { parse_mode: "HTML", link_preview_options: { is_disabled: true } }));

bot.command("update_menu", async (ctx) => {
    try {
        const commands = [
            { command: 'start', description: 'начать работу с ботом' },
            { command: 'help', description: 'список команд' },
            { command: 'manifest', description: 'манифест комьюнити' },
            { command: 'rules', description: 'правила для райдов' },
            { command: 'calendar', description: 'календарь туров' },
            { command: 'rides', description: 'маршруты на выходные' },
            { command: 'gpx', description: 'обход ограничений Komoot' },
            { command: 'pressure', description: 'давление в шинах' },
            { command: 'resto', description: 'карта ресторанов' },
            { command: 'komoot', description: 'коллекции маршрутов' },
            { command: 'rainfree', description: 'ищет сухие дороги' },
        ];
        await ctx.api.setMyCommands(commands);
        try { await ctx.api.setMyCommands(commands, { language_code: "ru" }); } catch (e) {}
        try { await ctx.api.setMyCommands(commands, { language_code: "en" }); } catch (e) {}
        await ctx.reply("Меню обновлено!");
    } catch (err: any) {
        await ctx.reply(`Ошибка: ${err.message}`);
    }
});

bot.on("message:text", async (ctx) => {
    if (ctx.chat.type !== 'private' || ctx.message.text.startsWith("/")) return;
    
    // Логируем что пришло сообщение
    console.log("[DEBUG] Получено сообщение от пользователя:", ctx.message.text);
    console.log("[DEBUG] GROQ_API_KEY exists:", !!process.env.GROQ_API_KEY, "length:", process.env.GROQ_API_KEY?.length);
    
    const manualApiKey = await getSetting("groq_api_key");
    const apiKey = process.env.GROQ_API_KEY || manualApiKey;
    console.log("[DEBUG] Выбранный apiKey:", apiKey ? apiKey.substring(0, 5) + "..." : "NULL");
    
    if (!apiKey) return ctx.reply("API ключ для AI не настроен. Напиши /start для инструкций.");
    
    try {
        // Подготавливаем данные для контекста
        const toursContext = TOURS.map(t => `- ${t.name}: ${t.displayDate}, ${t.details}`).join('\n');

        const systemPrompt = `
ТЫ — МИНИМАЛИСТИЧНЫЙ И ДРУЖЕЛЮБНЫЙ БОТ-АССИСТЕНТ СООБЩЕСТВА «ГАСТРОДИНАМИКА».

СТРОГИЕ ПРАВИЛА:
1. ДЛИНА ОТВЕТА: Максимум 3-4 коротких предложения. Если ответ длиннее 500 символов — ты проиграл.
2. ТЕМАТИКА: Отвечай ТОЛЬКО на вопросы о велосипедах, еде, ресторанах и кафе (отмеченных на нашей карте), наших турах, райдах на выходных, давлении в колесах (шинах, покрышках, камерах), маршрутах Гастродинамики в Komoot, о правилах и манифесте Гастродинамики. На любые другие темы (политика, космос, кулинария других стран и т.д.) отвечай фразой: «Я здесь для того, чтобы вносить ясность в наши райды. Давай вернемся к велосипедам и еде. Полный список команд - /help».
3. ИСТОЧНИК ДАННЫХ: Используй ТОЛЬКО данные ниже. Не выдумывай даты.

ИНСТРУМЕНТЫ И КОМАНДЫ:
- /rides: Маршруты на выходные с погодой. Команда показывает доступные райды на ближайшие выходные с полной информацией: дата, маршрут (откуда—куда), дистанция, набор высоты, время в седле, температура, ветер, осадки, солнечные часы. Данные обновляются автоматически на основе прогноза погоды и радаров осадков. Используй /rides когда спрашивают "куда покататься", "какие маршруты", "погода на выходные", "какой райд выбрать".
- /gpx: Обход ограничений Komoot на закрытые платные регионы (Испания, Турция, Беларусь). Позволяет выгрузить файл по ссылке для навигатора. Коллекции маршрутов Гастродинамики — в меню KOMOOT.
- /pressure: Калькулятор давления. Ключевой фактор скорости и комфорта. Параметры для ввода: Тип райда и стиль, Вес райдера и велосипеда, Тип и ширина покрышек, Внутренняя ширина обода. 
- /resto: Проверенные точки старта и финиша на Яндекс Картах. Рестораны и кафе, отобранные нами и для нас.
- /komoot: Наши коллекции. Маршруты Москвы и Подмосковья. Однодневные райды La Belle Échappée — побег от дождя на основе данных радаров и ветра.
- /rainfree: Rainfree — это веб-приложение, которое дает тебе план побега. Оно говорит: смотри, везде льет, а вот здесь есть окошко. И ты катаешься под солнцем, когда другие боятся нос высунуть. Это бунтарство, как и во фрирайде. Это способ обмануть систему и найти сухой асфальт там, где другие видят только тучи. Если freeride – это катание вне трасс, то Rainfree – это катание сквозь погоду. Твой маршрут диктует не чей-то план, а небо. Это новый вид навигации.

ЗНАНИЯ О РАЙДАХ И ПОГОДЕ:
- Бот анализирует погоду и показывает только те маршруты, где ожидается сухая погода без осадков.
- Для каждого маршрута доступна полная информация: дистанция (км), набор высоты (м), ориентировочное время в седле, температура воздуха, направление и скорость ветра, количество осадков (мм), количество солнечных часов (09:00–18:00).
- Система выбирает оптимальное направление маршрута (по ветру) на основе прогноза.
- Маршруты сортируются по дате — от ближайших к более дальним.
- Система показывает дни с хорошей погодой и сортирует маршруты от самого солнечного до менее солнечного.

ТВОИ ЦИФРОВЫЕ ЗНАНИЯ (Гиперссылки):
1. Ты знаешь [карту избранных ресторанов](https://yandex.com/maps/213/moscow/?bookmarks%5BpublicId%5D=OfCmg0o9&ll=37.569611%2C55.726974&mode=bookmarks&utm_campaign=bookmarks&utm_source=share&z=). Это точки старта и финиша в городах наших туров. Если спрашивают, где поесть или про команду /resto — давай ссылку на нее.
2. Ты знаешь [наши коллекции на Komoot](https://www.komoot.com/user/1622023059217/collections). Там собраны маршруты Москвы, Подмосковья и заезды La Belle Échappée. Если спрашивают маршрут или про /komoot — направляй по этой ссылке.

СТРОГИЕ ПРАВИЛА КОММУНИКАЦИИ:
1. ДЛИНА ОТВЕТА: Максимум 3-4 коротких предложения. Ты должен быть лаконичным.
2. ТЕМАТИКА: Отвечай ТОЛЬКО на вопросы о велосипедах, еде и наших турах. Если вопрос не по теме — отвечай: «Я здесь для того, чтобы вносить ясность в наши райды. Давай вернемся к велосипедам и еде. Полный список команд — /help».
3. ФОРМАТ ССЫЛОК: Используй стандартный Markdown Telegram: [текст ссылки](url). Зашивай ссылки в естественную речь.
4. СТИЛЬ: Без воды, без вступлений. Велосипедный сленг приветствуется (бибы, кассеты, зацеп, райдер). Никаких эмодзи.

ДАННЫЕ ПО ТУРАМ:
${toursContext}

МАНИФЕСТ КОМЬЮНИТИ:
${MANIFEST_TEXT}

ПРАВИЛА (КОДЕКС):
${RULES_TEXT}
`;

        // Лог для отладки: проверим, что ключ реально доходит
        console.log("Использую ключ (начало):", apiKey.substring(0, 5));

        // Используем fetch для Groq API
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
        
        // Rate limit - показываем понятное сообщение
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
});

// Main webhook handler
if (process.env.NODE_ENV === "production") {
    app.use("/api/webhook", webhookCallback(bot, "express"));
}

// Health and Config API
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.get("/api/update_commands", async (req, res) => {
    try {
        const commands = [
            { command: 'start', description: 'начать работу с ботом' },
            { command: 'help', description: 'список команд' },
            { command: 'manifest', description: 'манифест комьюнити' },
            { command: 'rules', description: 'правила для райдов' },
            { command: 'calendar', description: 'календарь туров' },
            { command: 'rides', description: 'маршруты на выходные' },
            { command: 'gpx', description: 'обход ограничений Komoot' },
            { command: 'pressure', description: 'давление в шинах' },
            { command: 'resto', description: 'карта ресторанов' },
            { command: 'komoot', description: 'коллекции маршрутов' },
            { command: 'rainfree', description: 'ищет сухие дороги' },
        ];
        await bot.api.setMyCommands(commands);
        try { await bot.api.setMyCommands(commands, { language_code: "ru" }); } catch (e) {}
        try { await bot.api.setMyCommands(commands, { language_code: "en" }); } catch (e) {}
        res.send("Commands successfully updated via API!");
    } catch (err: any) {
        res.status(500).send(`Error: ${err.message}`);
    }
});
app.get("/api/config", async (req, res) => {
    const key = await getSetting("groq_api_key");
    res.json({ hasKey: !!key || !!process.env.GROQ_API_KEY, botTokenStatus: botToken ? "PRESENT" : "MISSING" });
});
app.post("/api/config", async (req, res) => {
    if (req.body.apiKey) { await saveSetting("groq_api_key", req.body.apiKey); res.json({ status: "ok" }); }
    else res.status(400).json({ error: "API key required" });
});

app.get("/", (req, res) => res.send("GSTRDNMC BOT is running"));

if (process.env.NODE_ENV !== "production") {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
    
    // Start bot with polling locally
    bot.start({
        onStart: (botInfo) => {
            console.log(`Bot is active and running as @${botInfo.username}`);
        }
    }).catch(err => {
        console.error("Failed to start bot:", err);
    });
}

export default app;
