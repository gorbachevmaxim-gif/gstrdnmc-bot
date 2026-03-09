import express from "express";
import { createServer as createViteServer } from "vite";
import { Telegraf } from "telegraf";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import Redis from "ioredis";

import path from "path";

dotenv.config();

// Database setup for persistent settings with Redis
const redisUrl = process.env.REDIS_URL || '';
const redis = redisUrl ? new Redis(redisUrl) : null;
if (redis) {
    console.log(`[Database] Connected to Redis`);
} else {
    console.warn(`[Database] REDIS_URL not provided! Using in-memory storage (will be lost on restart).`);
}

const memorySettings = new Map<string, string>();

const TOURS = [
    {
        id: "uzbekistan",
        name: "Самарканд и Ташкент",
        start: "20260409",
        end: "20260413", // ICS end date is exclusive for all-day events
        location: "Узбекистан",
        description: "Велотур Самарканд и Ташкент. 4 дня, 2 райда.",
        displayDate: "с 9 по 12 апреля 2026",
        details: "4 дня, 2 райда"
    },
    {
        id: "minsk",
        name: "Минск",
        start: "20260507",
        end: "20260511",
        location: "Беларусь, Минск",
        description: "Велотур в Минск. 3 дня, 2 райда.",
        displayDate: "с 7 по 10 мая 2026",
        details: "3 дня, 2 райда"
    },
    {
        id: "krasnoyarsk",
        name: "Красноярск",
        start: "20260610",
        end: "20260615",
        location: "Россия, Красноярск",
        description: "Велотур в Красноярск. 7 дней, 4 райда.",
        displayDate: "с 10 по 14 июня 2026",
        details: "7 дней, 4 райда"
    },
    {
        id: "chuvashia",
        name: "Чувашия",
        start: "20260708",
        end: "20260713",
        location: "Россия, Чувашия",
        description: "Велотур в Чувашию. 5 дней, 2 райда.",
        displayDate: "с 8 по 12 июля 2026",
        details: "5 дней, 2 райда"
    },
    {
        id: "vladivostok",
        name: "Владивосток",
        start: "20260725",
        end: "20260802",
        location: "Россия, Владивосток",
        description: "Велотур во Владивосток. 7 дней, 4 райда.",
        displayDate: "с 25 июля по 1 августа 2026",
        details: "7 дней, 4 райда"
    },
    {
        id: "pskov",
        name: "Пушгоры и Псков",
        start: "20260813",
        end: "20260817",
        location: "Россия, Псков",
        description: "Велотур в Пушгоры и Псков. 3 дня, 2 райда.",
        displayDate: "с 13 по 16 августа 2026",
        details: "3 дня, 2 райда"
    },
    {
        id: "kamyshin",
        name: "Камышин",
        start: "20260819",
        end: "20260824",
        location: "Россия, Камышин",
        description: "Велотур в Камышин. 5 дней, 4 райда.",
        displayDate: "с 19 по 23 августа 2026",
        details: "5 дней, 4 райда"
    },
    {
        id: "turkey",
        name: "Турция",
        start: "20261030",
        end: "20261109",
        location: "Турция",
        description: "Велотур в Турцию. 10 дней, 7 райдов.",
        displayDate: "с 30 октября по 8 ноября 2026",
        details: "10 дней, 7 райдов"
    }
];

function generateIcs(tour: typeof TOURS[0]): string {
    return [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Gastrodynamica//Tour Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
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
        "END:VEVENT",
        "END:VCALENDAR"
    ].join("\r\n");
}

function generateFullIcs(): string {
    const events = TOURS.map(tour => {
        return [
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
        ].join("\r\n");
    }).join("\r\n");

    return [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Gastrodynamica//Tour Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        events,
        "END:VCALENDAR"
    ].join("\r\n");
}

async function getSetting(key: string): Promise<string | null> {
    if (redis) {
        try {
            return await redis.get(key);
        } catch (e) {
            console.error(`[Redis] Error getting key ${key}:`, e);
            return null;
        }
    }
    return memorySettings.get(key) || null;
}

async function saveSetting(key: string, value: string): Promise<void> {
    if (redis) {
        try {
            await redis.set(key, value);
        } catch (e) {
            console.error(`[Redis] Error setting key ${key}:`, e);
        }
    } else {
        memorySettings.set(key, value);
    }
}

// Komoot to GPX conversion logic
async function convertKomootToGpx(komootUrl: string): Promise<{ filename: string, content: string } | null> {
    try {
        let html = '';
        try {
            const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(komootUrl)}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) throw new Error('Proxy 1 failed');
            html = await response.text();
        } catch (e) {
            const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(komootUrl)}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) throw new Error('Network response was not ok');
            html = await response.text();
        }
        
        const startMarker = 'kmtBoot.setProps("';
        const endMarker = '");';
        
        const startIndex = html.indexOf(startMarker);
        if (startIndex === -1) throw new Error('Could not find route data in page');
        
        const jsonStart = startIndex + startMarker.length;
        const endIndex = html.indexOf(endMarker, jsonStart);
        if (endIndex === -1) throw new Error('Could not find end of route data');

        const jsonStringEscaped = html.substring(jsonStart, endIndex);
        const jsonString = JSON.parse(`"${jsonStringEscaped}"`);
        const data = JSON.parse(jsonString);

        const tourName = data?.page?._embedded?.tour?.name || 'route';
        const coordinates = data?.page?._embedded?.tour?._embedded?.coordinates?.items;

        if (!coordinates || !Array.isArray(coordinates)) {
            throw new Error('No coordinates found in route data');
        }

        const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="komootgpx-bot" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${tourName}</name>
  </metadata>
  <trk>
    <name>${tourName}</name>
    <trkseg>
`;
        const footer = `    </trkseg>
  </trk>
</gpx>`;

        const points = coordinates.map((coord: any) => {
            return `      <trkpt lat="${coord.lat}" lon="${coord.lng}">
        <ele>${coord.alt}</ele>
      </trkpt>`;
        }).join('\n');

        const gpxContent = header + points + '\n' + footer;
        return { filename: `${tourName.replace(/[^a-z0-9]/gi, '_')}.gpx`, content: gpxContent };
    } catch (error) {
        console.error("Conversion error:", error);
        return null;
    }
}

async function startServer() {
  let manualApiKey: string | null = await getSetting("gemini_api_key");
  console.log(`[Startup] Loaded manual API key from DB: ${manualApiKey ? `Yes (length: ${manualApiKey.length})` : 'No'}`);
  const app = express();
  const PORT = 3000;

  // Telegram Bot Setup
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("TELEGRAM_BOT_TOKEN is not set in environment variables.");
  } else {
    const bot = new Telegraf(botToken);

    // Логирование всех входящих сообщений для отладки
    bot.use(async (ctx, next) => {
        if (ctx.message && "text" in ctx.message) {
            console.log(`[Bot Log] Message from ${ctx.chat.id} (${ctx.chat.type}): ${ctx.message.text}`);
        }
        return next();
    });
    
    // Глобальный список команд для регистрации
    const commands = [
        { command: 'manifest', description: 'манифест комьюнити' },
        { command: 'rules', description: 'правила для райдов' },
        { command: 'calendar', description: 'календарь на сезон' },
        { command: 'gpx', description: 'обход ограничений Komoot' },
        { command: 'pressure', description: 'давление в шинах' },
        { command: 'resto', description: 'карта ресторанов' },
        { command: 'komoot', description: 'коллекции маршрутов' },
        { command: 'rainfree', description: 'ищет сухие дороги' },
    ];

    // Автоматическая регистрация команд при старте
    const setupCommands = async () => {
        try {
            await bot.telegram.setMyCommands(commands); // Дефолт
            await bot.telegram.setMyCommands(commands, { scope: { type: 'all_private_chats' } });
            await bot.telegram.setMyCommands(commands, { scope: { type: 'all_group_chats' } });
            await bot.telegram.setMyCommands(commands, { scope: { type: 'all_chat_administrators' } });
            console.log("✅ Bot commands synchronized successfully");
        } catch (err) {
            console.error("❌ Failed to sync commands:", err);
        }
    };
    setupCommands();
    
    // Set bot description and short description
    const botDescription = "Гастродинамика: правила, туры, коллекции маршрутов, AI-помощник, карта лучших мест для старта/финиша, поиск сухих дорог.";
    bot.telegram.setMyDescription(botDescription).catch(err => console.error("Failed to set bot description:", err));
    bot.telegram.setMyShortDescription("Гастродинамика: правила, туры, коллекции маршрутов, AI-помощник, карта лучших мест для старта/финиша, поиск сухих дорог.").catch(err => console.error("Failed to set bot short description:", err));
    
    const webAppUrl = process.env.SHARED_APP_URL || process.env.APP_URL || "https://ais-dev-l6kj63ksshyi2scgqp76t4-402783856947.us-east1.run.app";

    const mainKeyboard = {
        keyboard: [
            [
                { text: "RAINFREE", web_app: { url: "https://rain-free.vercel.app" } },
                { text: "TIRE PRESSURE", web_app: { url: "https://axs.sram.com/guides/tire/pressure" } }
            ],
            [
                { text: "RESTO", web_app: { url: "https://yandex.com/maps/213/moscow/?bookmarks%5BpublicId%5D=OfCmg0o9&ll=37.569611%2C55.726974&mode=bookmarks&utm_campaign=bookmarks&utm_source=share&z=" } },
                { text: "KOMOOT", web_app: { url: "https://www.komoot.com/user/1622023059217/collections" } }
            ]
        ],
        resize_keyboard: true,
        is_persistent: true
    };

    bot.start(async (ctx) => {
        ctx.reply("Спрашивай меня о правилах и манифесте, уточняй даты в календаре туров или проси выкачать GPX из Komoot для закрытых регионов. Также помогу подобрать идеальное давление в шинах и найду красивые сухие дороги с вкусными ресторанами на старте и финише. Просто напиши мне – поддержу беседу как старый друг.", {
            reply_markup: mainKeyboard
        });
    });

    bot.command("ping", (ctx) => ctx.reply("Понг! Я на связи."));

    bot.command("pressure", (ctx) => {
        ctx.reply("/pressure — [калькулятор](https://axs.sram.com/guides/tire/pressure) точного давления для ваших колес.", {
            parse_mode: "Markdown"
        });
    });

    bot.command("resto", (ctx) => {
        ctx.reply("/resto — места на [Яндекс Карты](https://yandex.com/maps/213/moscow/?bookmarks%5BpublicId%5D=OfCmg0o9&ll=37.569611%2C55.726974&mode=bookmarks&utm_campaign=bookmarks&utm_source=share&z=) с ресторанами и кафе для старта и финиша райда во множестве городов, где мы были или будем.", {
            parse_mode: "Markdown"
        });
    });

    bot.command("komoot", (ctx) => {
        ctx.reply("/komoot — [коллекции](https://www.komoot.com/user/1622023059217/collections) маршрутов Гастродинамики.", {
            parse_mode: "Markdown"
        });
    });

    bot.command("rainfree", (ctx) => {
        ctx.reply("/rainfree — ищет [сухие дороги](https://rain-free.vercel.app/) для тебя", {
            parse_mode: "Markdown"
        });
    });

    bot.command("menu", async (ctx) => {
        console.log(`[Menu Debug] Command received from chat ${ctx.chat.id} (${ctx.chat.type})`);
        try {
            // В группах всегда используем ответ на сообщение (reply)
            const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
            
            await ctx.reply("Пробую развернуть меню Гастродинамики под полем ввода...", {
                reply_parameters: { message_id: ctx.message.message_id }
            });

            // Настраиваем клавиатуру специально для групп
            const keyboardMarkup = {
                ...mainKeyboard,
                selective: isGroup // В группах показываем только тому, кто вызвал
            };

            await ctx.reply("Нажмите на иконку с четырьмя точками в поле ввода. Если она не появилась — значит Telegram ограничивает меню для групп. В этом случае используйте ссылки ниже.", {
                reply_markup: keyboardMarkup
            });
        } catch (err) {
            console.error("Menu command error:", err);
            // План Б: Inline-кнопки (ссылки) - они работают всегда
            await ctx.reply("Используйте быстрые ссылки для доступа к сервисам:", {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "RAINFREE", url: "https://rain-free.vercel.app" },
                            { text: "TIRE PRESSURE", url: "https://axs.sram.com/guides/tire/pressure" }
                        ],
                        [
                            { text: "RESTO", url: "https://yandex.com/maps/213/moscow/?bookmarks%5BpublicId%5D=OfCmg0o9&ll=37.569611%2C55.726974&mode=bookmarks&utm_campaign=bookmarks&utm_source=share&z=" },
                            { text: "KOMOOT", url: "https://www.komoot.com/user/1622023059217/collections" }
                        ]
                    ]
                }
            });
        }
    });

    bot.help((ctx) => ctx.reply("Доступные команды:\n/manifest - манифест комьюнити\n/rules - правила для райдов\n/calendar - календарь на сезон\n/gpx - скачивание закрытых в Komoot gpx-файлов\n/pressure - давление в шинах\n/resto - карта ресторанов\n/komoot - коллекции Komoot\n/rainfree — ищет сухие дороги для тебя\n/menu — показать кнопки управления"));
    
    bot.command("manifest", (ctx) => ctx.reply(`Многие спрашивают, как можно присоединиться к Гастродинамике. Здесь мы описали что нужно делать, чтобы быть внутри комьюнити.

1. Быть вовлеченным в нашу общую жизнь, помогать с организацией туров, не стесняться, проявлять инициативу. У каждого из нас есть свои сильные стороны, профессиональные навыки, связи в обществе и многое другое, что можно отдать ребятам в комьюнити. Подумайте что можете сделать именно вы.

2. Быть сильным во время заездов, не жаловаться, рассчитывать свои силы и поддерживать друг друга.

3. Можно ли быть слабым для больших райдов, но быть в сообществе? Конечно, да! Главное, быть воспитанным, отдавать в комьюнити больше, чем забирать, регулярно тренироваться, если необходимо, прогрессировать и присоединяться к заездам по готовности.

4. Проявлять интерес к еде и к людям, кто её создает. Вы можете не знать чем отличается итальянский трюфель от французского, или же фамилии всех шефов сибирских ресторанов, но нам хочется, чтобы каждый развивал свои вкусы и помогал бы находить новые направления для туров через интересную локальную гастрономию.

5. Следить за питанием, общим состоянием здоровья, не забывать о витаминах. Мы искренне проповедуем максимальную эффективность как во время туров, так и за их пределами, поэтому хотим, чтобы каждый внутри комьюнити ответственно подходил к тому, что он ест, какой образ жизни ведет, как восстанавливается после физических нагрузок.

6. Заботиться о своем велосипеде, делать регулярное обслуживание, располагать расходниками к нему и важными запчастями (особенно в турах, вдалеке от дома). Ни для кого из нас не в кайф вместо классного заезда в хорошей компании, ждать кого-либо на обочине по причине безответственного подхода к своей технике. Проявляйте такую же заботу к велосипеду, как и к самому себе.

7. Управлять ожиданиями в комьюнити, чтобы ни у кого не было недопониманий. Сразу спрашивать, если что-то непонятно, и не молчать, когда видите, что чего-то не хватает. Делать шаг вперед, если есть идея с чем можете всем помочь, но не знаете с чего начать. Говорить заранее, если с чем-то не согласны, а критикуя что-то — всегда предлагать свой вариант. И главное, беря ответственность за что-либо — быть прозрачным, доводить дело до конца или вовремя делегировать на другого участника.

8. Если по каким-то причинам решили не быть частью комьюнити, то это нормально — сообщите всем об этом, поблагодарим друг друга за опыт, обнимемся и будем спокойно жить дальше.`));
    bot.command("rules", (ctx) => ctx.reply(`Мы едем не просто кататься, мы едем вместе. Чтобы райд прошел безопасно и в кайф, мы договариваемся о правилах «на берегу».

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
Любая помощь организаторам приветствуется и повышает карму (резерв ресторанов, организация трансфера и машины сопровождения).`));
    bot.command("calendar", async (ctx) => {
        const calendarText = TOURS.map(tour => {
            return `<b>${tour.name}</b>\n${tour.displayDate}\n${tour.details}`;
        }).join("\n\n");

        await ctx.reply(`Календарь туров Гастродинамики\n\n${calendarText}`, {
            parse_mode: "HTML"
        });

        const fullIcs = generateFullIcs();
        await ctx.replyWithDocument({ 
            source: Buffer.from(fullIcs), 
            filename: "gstrdnmc-tours-2026.ics" 
        }, {
            caption: "Скачать весь календарь одним файлом (.ics)"
        });
    });
    
    bot.command("gpx", async (ctx) => {
        const url = ctx.payload;
        if (!url) {
            return ctx.reply("Обход ограничений Komoot на скачивание GPX. Вставьте ссылку на маршрут Komoot после /gpx, например: /gpx https://www.komoot.com/tour/... Сгенерированный файл будет готов к экспорту в Telegram или сторонние навигаторы.\n\nМаршруты Гастродинамики можно посмотреть в коллекциях Komoot, нажав на кнопку KOMOOT в меню.");
        }
        
        ctx.reply("Конвертирую...");
        const result = await convertKomootToGpx(url);
        
        if (result) {
            ctx.replyWithDocument({ source: Buffer.from(result.content), filename: result.filename });
        } else {
            ctx.reply("Не удалось конвертировать маршрут. Проверьте ссылку или попробуйте позже.");
        }
    });

    bot.command("update_menu", async (ctx) => {
        try {
            const commands = [
                { command: 'manifest', description: 'манифест комьюнити' },
                { command: 'rules', description: 'правила для райдов' },
                { command: 'calendar', description: 'календарь на сезон' },
                { command: 'gpx', description: 'обход ограничений Komoot' },
                { command: 'pressure', description: 'давление в шинах' },
                { command: 'resto', description: 'карта ресторанов' },
                { command: 'komoot', description: 'коллекции маршрутов' },
                { command: 'rainfree', description: 'ищет сухие дороги' },
            ];
            await ctx.telegram.deleteMyCommands();
            await ctx.telegram.setMyCommands(commands);
            await ctx.telegram.setChatMenuButton({ menuButton: { type: 'default' } });
            await ctx.telegram.setMyCommands(commands, { scope: { type: 'all_private_chats' } });
            await ctx.telegram.setMyCommands(commands, { scope: { type: 'all_private_chats' }, language_code: 'ru' });
            await ctx.telegram.setMyCommands(commands, { scope: { type: 'all_group_chats' } });
            await ctx.telegram.setMyCommands(commands, { scope: { type: 'all_chat_administrators' } });
            await ctx.reply("✅ Бургер-меню обновлено и команды возвращены! Попробуйте перезапустить Telegram.");
        } catch (err: any) {
            await ctx.reply(`❌ Ошибка обновления: ${err.message}`);
        }
    });

    // Gemini AI integration for general chat
    bot.on("text", async (ctx) => {
        // Ignore commands (they are handled by specific handlers)
        if (ctx.message.text.startsWith("/")) return;

        // Only respond to AI queries in private chats
        if (ctx.chat.type !== 'private') return;

        try {
            // Helper to check if a key is a placeholder or invalid
            const isPlaceholder = (k: string | null | undefined) => 
                !k || k.trim().length < 10 || k.includes("YOUR_") || k === "MY_GEMINI_API_KEY";

            const envGemini = process.env.GEMINI_API_KEY;
            const envApi = process.env.API_KEY;
            
            // Filter out placeholders and find the first "real" key
            const keys = [envGemini, envApi, manualApiKey];
            const apiKey = keys.find(k => !isPlaceholder(k));
            
            // Debug logging (server-side only)
            const source = apiKey === envGemini ? 'ENV_GEMINI' : 
                          apiKey === envApi ? 'ENV_API' : 
                          apiKey === manualApiKey ? 'MANUAL' : 'NONE';
            
            if (!apiKey) {
                const foundSomething = keys.find(k => k && k.length > 0);
                const debugInfo = foundSomething ? `(Обнаружен плейсхолдер: ${foundSomething.substring(0, 4)}..., длина: ${foundSomething.length})` : "(Ключ не найден)";
                console.error(`[AI Error] API key missing or invalid: ${debugInfo}`);
                return await ctx.reply(`Ошибка: API ключ для ИИ не настроен. Бот не может ответить.\n\nПожалуйста, добавьте рабочий ключ в настройках проекта (Secrets -> GEMINI_API_KEY) или через веб-интерфейс бота.`);
            }

            try {
                const ai = new GoogleGenAI({ apiKey });
                const response = await ai.models.generateContent({
                    model: "gemini-3-flash-preview",
                    contents: [{ role: 'user', parts: [{ text: ctx.message.text }] }],
                    config: {
                        systemInstruction: "Ты — помощник велосипедного комьюнити 'Гастродинамика'. Твоя задача — отвечать на вопросы участников, помогать с информацией о заездах, велосипедах и еде. Будь дружелюбным, лаконичным и полезным. Никогда не используй эмодзи, иконки или любые другие графические символы в своих ответах. Если пользователь спрашивает что-то, на что есть специальная команда, напомни ему об этом (/manifest, /rules, /calendar, /gpx, /pressure, /resto, /komoot, /rainfree). Важно: команда /gpx нужна для скачивания файла по ссылке пользователя, а коллекции маршрутов Гастродинамики доступны по кнопке KOMOOT. Команда /rainfree ищет сухие дороги для катания. Команда /pressure предназначена исключительно для подбора корректного давления в шинах; никогда не давай советов по выбору самой резины (покрышек), вместо этого направляй пользователя к команде /pressure."
                    }
                });
                
                if (response.text) {
                    await ctx.reply(response.text);
                } else {
                    await ctx.reply("К сожалению, я не смог сгенерировать ответ. Попробуйте перефразировать вопрос.");
                }
            } catch (innerError: any) {
                console.error("[AI Runtime Error]:", innerError);
                const innerMsg = innerError?.message || "";
                if (innerMsg.includes("API key not valid") || innerMsg.includes("API_KEY_INVALID")) {
                    await ctx.reply("Критическая ошибка: Используемый API ключ недействителен. Пожалуйста, проверьте настройки ключа в AI Studio.");
                } else {
                    throw innerError; // Передаем дальше в общий обработчик
                }
            }
        } catch (error: any) {
            console.error("Gemini error details:", error);
            const errorMsg = error?.message || error?.toString() || "Unknown error";
            
            if (errorMsg.includes("API key not valid")) {
                await ctx.reply("Ошибка: Ваш API ключ для Gemini недействителен. Пожалуйста, получите новый ключ на ai.google.dev и обновите его в настройках.");
            } else if (errorMsg.includes("quota")) {
                await ctx.reply("Ошибка: Превышена квота (лимит) вашего API ключа. Попробуйте позже или используйте другой ключ.");
            } else if (errorMsg.includes("location")) {
                await ctx.reply("Ошибка: API Gemini недоступно в вашем регионе. Попробуйте использовать ключ, созданный в другом регионе, или проверьте настройки проекта.");
            } else {
                await ctx.reply(`Произошла ошибка при обращении к ИИ: ${errorMsg.substring(0, 100)}...`);
            }
        }
    });

    bot.launch()
      .then(async () => {
        console.log("Telegram bot started.");
        // Set bot commands menu after launch
        try {
            const commands = [
                { command: 'manifest', description: 'манифест комьюнити' },
                { command: 'rules', description: 'правила для райдов' },
                { command: 'calendar', description: 'календарь на сезон' },
                { command: 'gpx', description: 'обход ограничений Komoot' },
                { command: 'pressure', description: 'давление в шинах' },
                { command: 'resto', description: 'карта ресторанов' },
                { command: 'komoot', description: 'коллекции маршрутов' },
                { command: 'rainfree', description: 'ищет сухие дороги' },
            ];
            
            await bot.telegram.deleteMyCommands();
            
            // Set for default scope
            await bot.telegram.setMyCommands(commands);
            
            // Ensure the menu button is set to default (will show commands if set)
            await bot.telegram.setChatMenuButton({ menuButton: { type: 'default' } });
            
            // Set explicitly for private chats
            await bot.telegram.setMyCommands(commands, { 
                scope: { type: 'all_private_chats' } 
            });

            // Set explicitly for RU language
            await bot.telegram.setMyCommands(commands, { 
                scope: { type: 'all_private_chats' },
                language_code: 'ru'
            });

            // Set for groups
            await bot.telegram.setMyCommands(commands, { scope: { type: 'all_group_chats' } });
            await bot.telegram.setMyCommands(commands, { scope: { type: 'all_chat_administrators' } });
            
            console.log("Telegram commands menu updated successfully for all scopes (private, groups, admins) and languages.");
        } catch (err) {
            console.error("Failed to set bot commands:", err);
        }
      })
      .catch((err) => console.error("Failed to start Telegram bot:", err));

    // Enable graceful stop
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));

    // API routes
    app.get("/api/health", (req, res) => {
      res.json({ status: "ok" });
    });

    app.get("/api/calendar/full.ics", (req, res) => {
        const icsContent = generateFullIcs();
        res.setHeader("Content-Type", "text/calendar; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="gstrdnmc-tours-2026.ics"');
        res.send(icsContent);
    });

    app.get("/api/calendar/:tourId.ics", (req, res) => {
        const { tourId } = req.params;
        const tour = TOURS.find(t => t.id === tourId);
        
        if (!tour) {
            return res.status(404).send("Tour not found");
        }

        const icsContent = generateIcs(tour);
        res.setHeader("Content-Type", "text/calendar; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${tour.id}.ics"`);
        res.send(icsContent);
    });

    app.get("/api/tours/:tourId", (req, res) => {
        const { tourId } = req.params;
        const tour = TOURS.find(t => t.id === tourId);
        if (!tour) return res.status(404).json({ error: "Tour not found" });
        res.json(tour);
    });

    app.get("/api/config", (req, res) => {
      try {
        const envGemini = process.env.GEMINI_API_KEY;
        const envApi = process.env.API_KEY;
        
        const isPlaceholder = (k: string | null | undefined) => 
            !k || k.trim().length < 10 || k.includes("YOUR_") || k === "MY_GEMINI_API_KEY";

        let source = 'NONE';
        if (!isPlaceholder(envGemini)) source = 'ENV_GEMINI';
        else if (!isPlaceholder(envApi)) source = 'ENV_API';
        else if (!isPlaceholder(manualApiKey)) source = 'MANUAL';

        res.json({
          hasKey: source !== 'NONE',
          source: source,
          botInfo: { username: bot.botInfo?.username || "bot" }
        });
      } catch (err) {
        res.json({ hasKey: !!manualApiKey, source: 'ERROR', botInfo: null });
      }
    });

    app.get("/api/test-ai", async (req, res) => {
        try {
            const isPlaceholder = (k: string | null | undefined) => 
                !k || k.trim().length < 10 || k.includes("YOUR_") || k === "MY_GEMINI_API_KEY";

            const apiKey = [process.env.GEMINI_API_KEY, process.env.API_KEY, manualApiKey].find(k => !isPlaceholder(k));
            
            if (!apiKey) {
                return res.status(400).json({ error: "API key not configured" });
            }

            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: "Say 'OK' if you can hear me.",
            });
            res.json({ status: "ok", response: response.text });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post("/api/config", express.json(), async (req, res) => {
      const { apiKey } = req.body;
      console.log("POST /api/config received. Body keys:", Object.keys(req.body));
      if (apiKey && apiKey !== '********') {
        manualApiKey = apiKey;
        await saveSetting("gemini_api_key", apiKey);
        console.log(`Manual API Key updated and saved to DB. New length: ${manualApiKey.length}, starts with: ${manualApiKey.substring(0, 4)}...`);
        res.json({ status: "ok" });
      } else if (apiKey === '********') {
        console.log("Received placeholder key, ignoring update.");
        res.json({ status: "ok", message: "No change" });
      } else {
        console.error("POST /api/config: No apiKey in body");
        res.status(400).json({ error: "API key is required" });
      }
    });
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
