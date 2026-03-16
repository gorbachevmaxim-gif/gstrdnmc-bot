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
  distance: number;
  elevationGain: number;
  pace?: number;
  saddleTime: string;
}

export interface WeatherParams {
  temperature: string;
  wind: string;
  gusts?: string;
  precipitation?: number;
  sunshine: string;
}

export interface Transport {
  to: string;
  from: string;
}

export interface Profile {
  score?: number;
  difficulty?: string;
  distanceRank?: string;
  speedRank?: string;
}

export interface Food {
  start: string;
  end: string;
}

export interface Nutrition {
  bidons: number;
  gels: number;
}

export interface Analysis {
  transport?: Transport;
  clothing?: string;
  profile?: Profile;
  food?: Food;
  nutrition?: Nutrition;
}

export interface Ride {
  date?: string;
  dayName?: string;
  routeName: string;
  gpxUrl?: string;
  gpxFilename?: string;
  routeParams: RouteParams;
  weatherParams: WeatherParams;
  analysis?: Analysis;
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
