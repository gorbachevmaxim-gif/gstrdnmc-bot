// ==========================================
// UTILS - Утилиты и вспомогательные функции
// ==========================================

import { API_TIMEOUT_MS } from './constants.js';
import type { BotData } from './types.js';

// ==========================================
// ТРАНСЛИТЕРАЦИЯ
// ==========================================

const CYRILLIC_MAP: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
  'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
  'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
  'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
  'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch', 'Ъ': '',
  'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
};

export function transliterateToLatin(text: string): string {
  return text.split('').map(char => CYRILLIC_MAP[char] || char).join('');
}

export function sanitizeFileName(name: string): string {
  const latinName = transliterateToLatin(name);
  return latinName.replace(/[^a-zA-Z0-9]/g, '_');
}

// ==========================================
// TELEGRAM API HELPERS
// ==========================================

export async function telegramApiCall(
  method: string, 
  body: any, 
  timeoutMs: number = API_TIMEOUT_MS,
  botToken: string
): Promise<any> {
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
// BOT DATA API HELPERS
// ==========================================

export async function fetchBotData(apiKey?: string): Promise<BotData | null> {
  try {
    const key = apiKey || process.env.BOT_API_KEY || '';
    const baseUrl = process.env.RAIN_FREE_URL || "https://rain-free.vercel.app";
    
    const response = await fetch(`${baseUrl}/api/bot-data`, {
      headers: { 'x-api-key': key }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[fetchBotData] Error:', error);
    return null;
  }
}

export async function fetchGpxContent(gpxUrl: string): Promise<string | null> {
  try {
    const response = await fetch(gpxUrl);
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    console.error('[fetchGpxContent] Error:', error);
    return null;
  }
}

// ==========================================
// DATE HELPERS
// ==========================================

export function formatDate(dateKey: string, months: string[]): string {
  const dateParts = dateKey.split('-');
  const day = parseInt(dateParts[2]);
  const month = parseInt(dateParts[1]) - 1;
  
  return `${day} ${months[month]}`;
}

export function parseShareParam(param: string): { dateKey: string; rideIndex: number } | null {
  if (!param || !param.startsWith('share_')) return null;
  
  const shareData = param.replace('share_', '');
  const parts = shareData.split('_');
  
  if (parts.length < 2) return null;
  
  const dateKey = parts.slice(0, -1).join('_');
  const rideIndex = parseInt(parts[parts.length - 1]);
  
  if (isNaN(rideIndex)) return null;
  
  return { dateKey, rideIndex };
}

// ==========================================
// MESSAGE FORMATTING HELPERS
// ==========================================

export function formatRideDetails(ride: any): string {
  const precip = ride.weatherParams.precipitation 
    ? `${Number(ride.weatherParams.precipitation.toFixed(1))} мм` 
    : 'Нет';
  
  return `<b>${ride.routeName}</b>\n\n` +
    `<b>Дистанция:</b> ${ride.routeParams.distance} км\n` +
    `<b>Набор высоты:</b> ${ride.routeParams.elevationGain} м\n` +
    `<b>Время в седле:</b> ${ride.routeParams.saddleTime}\n\n` +
    `<b>Температура:</b> ${ride.weatherParams.temperature}º\n` +
    `<b>Ветер:</b> ${ride.weatherParams.wind}\n` +
    `<b>Порывы:</b> ${ride.weatherParams.gusts || 'Нет'}\n` +
    `<b>Осадки:</b> ${precip}\n` +
    `<b>Солнце:</b> ${ride.weatherParams.sunshine}\n\n` +
    `<b>Бидонов:</b> ${ride.analysis?.nutrition?.bidons || '-'}\n` +
    `<b>Гели:</b> ${ride.analysis?.nutrition?.gels || '-'}`;
}

export function formatShareCaption(ride: any): string {
  return `${ride.routeName}\n\n` +
    `${ride.routeParams.distance} км | ${ride.routeParams.elevationGain} м | ${ride.routeParams.saddleTime}\n` +
    `${ride.weatherParams.temperature}º | ${ride.weatherParams.wind} `;
}

// ==========================================
// ICS CALENDAR GENERATOR
// ==========================================

export function generateFullIcs(tours: any[]): string {
  const events = tours.map(tour => [
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

// ==========================================
// KOMOOT GPX CONVERTER
// ==========================================

export async function convertKomootToGpx(komootUrl: string): Promise<{ filename: string; content: string } | null> {
  try {
    let html = '';
    const proxyUrls = [
      `https://corsproxy.io/?${encodeURIComponent(komootUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(komootUrl)}`
    ];
    
    for (const url of proxyUrls) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (res.ok) {
          html = await res.text();
          break;
        }
      } catch (e) {
        // Continue to next proxy
      }
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
    
    const points = coordinates
      .map((c: any) => `      <trkpt lat="${c.lat}" lon="${c.lng}"><ele>${c.alt}</ele></trkpt>`)
      .join('\n');
    
    const filename = `${sanitizeFileName(tourName)}.gpx`;
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${tourName}</name></metadata>
  <trk>
    <name>${tourName}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`;
    
    return { filename, content };
  } catch (e) {
    console.error('[convertKomootToGpx] Error:', e);
    return null;
  }
}
