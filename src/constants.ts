// ==========================================
// CONSTANTS - Константы и статические данные
// ==========================================

import { Tour } from './types.js';

export const TOURS: Tour[] = [
  { id: "uzbekistan", name: "Самарканд и Ташкент", start: "20260409", end: "20260413", location: "Узбекистан", description: "Велотур Самарканд и Ташкент. 4 дня, 2 райда.", displayDate: "с 9 по 12 апреля 2026", details: "4 дня, 2 райда" },
  { id: "minsk", name: "Минск", start: "20260507", end: "20260511", location: "Беларусь, Минск", description: "Велотур в Минск. 3 дня, 2 райда.", displayDate: "с 7 по 10 мая 2026", details: "3 дня, 2 райда" },
  { id: "krasnoyarsk", name: "Красноярск", start: "20260610", end: "20260615", location: "Россия, Красноярск", description: "Велотур в Красноярск. 7 дней, 4 райда.", displayDate: "с 10 по 14 июня 2026", details: "7 дней, 4 райда" },
  { id: "chuvashia", name: "Чувашия", start: "20260708", end: "20260713", location: "Россия, Чувашия", description: "Велотур в Чувашию. 5 дней, 2 райда.", displayDate: "с 8 по 12 июля 2026", details: "5 дней, 2 райда" },
  { id: "vladivostok", name: "Владивосток", start: "20260725", end: "20260802", location: "Россия, Владивосток", description: "Велотур во Владивосток. 7 дней, 4 райда.", displayDate: "с 25 июля по 1 августа 2026", details: "7 дней, 4 райда" },
  { id: "pskov", name: "Пушгоры и Псков", start: "20260813", end: "20260817", location: "Россия, Псков", description: "Велотур в Пушгоры и Псков. 3 дня, 2 райда.", displayDate: "с 13 по 16 августа 2026", details: "3 дня, 2 райда" },
  { id: "kamyshin", name: "Камышин", start: "20260819", end: "20260824", location: "Россия, Камышин", description: "Велотур в Камышин. 5 дней, 4 райда.", displayDate: "с 19 по 23 августа 2026", details: "5 дней, 4 райда" },
  { id: "turkey", name: "Турция", start: "20261030", end: "20261109", location: "Турция", description: "Велотур в Турцию. 10 дней, 7 райдов.", displayDate: "с 30 октября по 8 ноября 2026", details: "10 дней, 7 райдов" }
];

export const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "RAINFREE", web_app: { url: "https://rain-free.vercel.app" } }, { text: "TIRE PRESSURE", web_app: { url: "https://axs.sram.com/guides/tire/pressure" } }],
    [{ text: "RESTO", web_app: { url: "https://yandex.com/maps/213/moscow/?bookmarks%5BpublicId%5D=OfCmg0o9&ll=37.569611%2C55.726974&mode=bookmarks&utm_campaign=bookmarks&utm_source=share&z=" } }, { text: "KOMOOT", web_app: { url: "https://www.komoot.com/user/1622023059217/collections" } }]
  ],
  resize_keyboard: true,
  is_persistent: true
};

export const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export const DEFAULT_TEXTS = {
  manifest: 'Текст манифеста не загружен',
  rules: 'Текст правил не загружен',
  commands: {
    start: 'Привет!',
    help: 'Список команд недоступен',
    pressure: 'Калькулятор давления недоступен',
    resto: 'Карта ресторанов недоступна',
    komoot: 'Коллекции недоступны',
    rainfree: 'Rainfree недоступен',
    gpx_no_url: 'GPX недоступен'
  },
  systemPrompt: 'Системный промпт не загружен'
};

export const BOT_COMMANDS = [
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

export const MESSAGE_AGE_LIMIT = 120; // секунд
export const API_TIMEOUT_MS = 10000;
