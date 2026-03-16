// ==========================================
// TYPES - Все типы для бота
// ==========================================

export interface BotTexts {
  manifest: string;
  rules: string;
  commands: {
    start: string;
    help: string;
    pressure: string;
    resto: string;
    komoot: string;
    rainfree: string;
    gpx_no_url: string;
  };
  systemPrompt: string;
}

export interface Tour {
  id: string;
  name: string;
  start: string;
  end: string;
  location: string;
  description: string;
  displayDate: string;
  details: string;
}

export interface RouteParams {
  distance: string;
  elevationGain: string;
  saddleTime: string;
}

export interface WeatherParams {
  temperature: string;
  wind: string;
  gusts?: string;
  precipitation?: number;
  sunshine: string;
}

export interface Nutrition {
  bidons: string;
  gels: string;
}

export interface Ride {
  routeName: string;
  routeParams: RouteParams;
  weatherParams: WeatherParams;
  gpxUrl?: string;
  analysis?: {
    nutrition?: Nutrition;
  };
}

export interface DayInfo {
  dayName: string;
  rides: Ride[];
}

export interface GroupedByDate {
  [dateKey: string]: DayInfo;
}

export interface BotData {
  groupedByDate?: GroupedByDate;
}

export interface ShareData {
  dateKey: string;
  rideIndex: number;
}

export interface TelegramUpdateResult {
  success: boolean;
  message: string;
}

export interface ApiResponse<T = any> {
  status: 'ok' | 'error';
  message?: string;
  data?: T;
  error?: string;
}
