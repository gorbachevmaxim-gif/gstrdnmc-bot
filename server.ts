import express from "express";
import { Telegraf } from "telegraf";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import Redis from "ioredis";

dotenv.config();

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

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = new Telegraf(botToken || "");

const mainKeyboard = {
    keyboard: [
        [{ text: "RAINFREE", web_app: { url: "https://rain-free.vercel.app" } }, { text: "TIRE PRESSURE", web_app: { url: "https://axs.sram.com/guides/tire/pressure" } }],
        [{ text: "RESTO", web_app: { url: "https://yandex.com/maps/213/moscow/?bookmarks%5BpublicId%5D=OfCmg0o9&ll=37.569611%2C55.726974&mode=bookmarks&utm_campaign=bookmarks&utm_source=share&z=" } }, { text: "KOMOOT", web_app: { url: "https://www.komoot.com/user/1622023059217/collections" } }]
    ],
    resize_keyboard: true,
    is_persistent: true
};

bot.start((ctx) => ctx.reply("Спрашивай меня о правилах и манифесте, уточняй даты в календаре или проси выкачать GPX из Komoot. Также помогу с давлением в шинах и найду сухие дороги.", { reply_markup: mainKeyboard }));

bot.command("rides", async (ctx) => {
    try {
        const apiKey = process.env.BOT_API_KEY;
        const baseUrl = process.env.RAIN_FREE_URL || "https://rain-free.vercel.app";
        const response = await fetch(`${baseUrl}/api/bot-data`, { headers: { 'x-api-key': apiKey || '' } });
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data: any = await response.json();
        if (!data.groupedByDate || Object.keys(data.groupedByDate).length === 0) return ctx.reply("Пока нет заездов. Попробуйте позже.");
        let message = "<b>Ближайшие заезды Гастродинамики</b>\n\n";
        for (const [date, info] of Object.entries(data.groupedByDate) as [string, any][]) {
            const dateParts = (date as string).split('-');
            const d = dateParts[2];
            const m = dateParts[1];
            message += `📅 <b>${info.dayName} (${d}.${m})</b>\n`;
            for (const ride of info.rides) {
                message += `• ${ride.routeName}\n  ${ride.routeParams.distance} км / ${ride.routeParams.elevationGain} м\n  Погода: ${ride.weatherParams.temperature}º, ветер ${ride.weatherParams.wind}\n  <a href="${ride.gpxUrl}">Скачать GPX</a>\n\n`;
            }
        }
        await ctx.reply(message, { parse_mode: "HTML", link_preview_options: { is_disabled: true } } as any);
    } catch (err) { ctx.reply("Не удалось загрузить данные о заездах."); }
});

bot.command("manifest", (ctx) => ctx.reply(MANIFEST_TEXT));
bot.command("rules", (ctx) => ctx.reply(RULES_TEXT));
bot.command("calendar", async (ctx) => {
    const text = TOURS.map(t => `<b>${t.name}</b>\n${t.displayDate}\n${t.details}`).join("\n\n");
    await ctx.reply(`Календарь 2026\n\n${text}`, { parse_mode: "HTML" });
    await ctx.replyWithDocument({ source: Buffer.from(generateFullIcs()), filename: "calendar.ics" });
});
bot.command("gpx", async (ctx) => {
    const url = ctx.payload;
    if (!url) return ctx.reply("Вставьте ссылку на Komoot после /gpx");
    const result = await convertKomootToGpx(url);
    if (result) await ctx.replyWithDocument({ source: Buffer.from(result.content), filename: result.filename });
    else ctx.reply("Не удалось конвертировать.");
});

bot.command("pressure", (ctx) => ctx.reply("Узнать <a href=\"https://axs.sram.com/guides/tire/pressure\">идеальное давление</a> в шинах", { parse_mode: "HTML", link_preview_options: { is_disabled: true } } as any));
bot.command("resto", (ctx) => ctx.reply("Лучшие места на <a href=\"https://yandex.com/maps/213/moscow/?bookmarks%5BpublicId%5D=OfCmg0o9&ll=37.569611%2C55.726974&mode=bookmarks&utm_campaign=bookmarks&utm_source=share&z=8\">Яндекс Карте</a>", { parse_mode: "HTML", link_preview_options: { is_disabled: true } } as any));
bot.command("komoot", (ctx) => ctx.reply("Наши <a href=\"https://www.komoot.com/user/1622023059217/collections\">коллекции маршрутов</a> в Komoot", { parse_mode: "HTML", link_preview_options: { is_disabled: true } } as any));
bot.command("rainfree", (ctx) => ctx.reply("Ищем <a href=\"https://rain-free.vercel.app\">сухие дороги</a> для тебя", { parse_mode: "HTML", link_preview_options: { is_disabled: true } } as any));

bot.command("update_menu", async (ctx) => {
    try {
        const commands = [
            { command: 'manifest', description: 'манифест комьюнити' },
            { command: 'rules', description: 'правила для райдов' },
            { command: 'calendar', description: 'календарь на сезон' },
            { command: 'rides', description: 'ближайшие заезды' },
            { command: 'gpx', description: 'обход ограничений Komoot' },
            { command: 'pressure', description: 'давление в шинах' },
            { command: 'resto', description: 'карта ресторанов' },
            { command: 'komoot', description: 'коллекции маршрутов' },
            { command: 'rainfree', description: 'ищет сухие дороги' },
        ];
        await ctx.telegram.setMyCommands(commands);
        await ctx.reply("✅ Меню обновлено!");
    } catch (err: any) {
        await ctx.reply(`❌ Ошибка: ${err.message}`);
    }
});

bot.on("text", async (ctx) => {
    if (ctx.chat.type !== 'private' || ctx.message.text.startsWith("/")) return;
    const manualApiKey = await getSetting("gemini_api_key");
    const apiKey = [process.env.GEMINI_API_KEY, process.env.API_KEY, manualApiKey].find(k => k && k.length > 10);
    if (!apiKey) return ctx.reply("API ключ для ИИ не настроен. Напишите /start для инструкций.");
    try {
        // Using v1beta API with gemini-1.5-flash
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Origin": "https://gstrdnmc-bot.vercel.app",
                "Referer": "https://gstrdnmc-bot.vercel.app/"
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: ctx.message.text }] }]
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Нет ответа от ИИ";
        await ctx.reply(aiText);
    } catch (e: any) { 
        console.error("[AI Error]:", e);
        const errorMsg = e?.message || e?.toString() || "Unknown error";
        ctx.reply(`Ошибка ИИ: ${errorMsg.substring(0, 200)}`); 
    }
});

const app = express();
app.use(express.json());

// Main webhook handler
app.post("/api/webhook", async (req, res) => {
    try {
        // Telegraf needs getMe info to handle updates. 
        // In Serverless, we fetch it ONCE per instance life.
        if (!bot.botInfo) {
            bot.botInfo = await bot.telegram.getMe();
        }
        
        await bot.handleUpdate(req.body);
        if (!res.headersSent) res.status(200).send("ok");
    } catch (err: any) {
        console.error("[Webhook] error:", err);
        if (!res.headersSent) res.status(500).send("error");
    }
});

// Health and Config API
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.get("/api/config", async (req, res) => {
    const key = await getSetting("gemini_api_key");
    res.json({ hasKey: !!key || !!process.env.GEMINI_API_KEY, botTokenStatus: botToken ? "PRESENT" : "MISSING" });
});
app.post("/api/config", async (req, res) => {
    if (req.body.apiKey) { await saveSetting("gemini_api_key", req.body.apiKey); res.json({ status: "ok" }); }
    else res.status(400).json({ error: "API key required" });
});

app.get("/", (req, res) => res.send("GSTRDNMC BOT is running."));

export default app;
