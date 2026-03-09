/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
    Telegram?: {
      WebApp: {
        ready: () => void;
        close: () => void;
        expand: () => void;
        platform: string;
      };
    };
  }
}

interface Tour {
  id: string;
  name: string;
  start: string;
  end: string;
  location: string;
  description: string;
  displayDate: string;
  details: string;
}

function CalendarApp({ tourId }: { tourId: string }) {
  const [tour, setTour] = useState<Tour | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }

    fetch(`/api/tours/${tourId}`)
      .then(res => res.json())
      .then(data => {
        setTour(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch tour:', err);
        setLoading(false);
      });
  }, [tourId]);

  if (loading || !tour) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center font-sans uppercase tracking-[0.2em] text-[10px]">
        {loading ? '...' : 'Tour not found'}
      </div>
    );
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (window.Telegram?.WebApp?.platform === 'ios');

  const gCalUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(tour.name)}&dates=${tour.start}/${tour.end}&details=${encodeURIComponent(tour.description)}&location=${encodeURIComponent(tour.location)}`;
  const webcalUrl = `webcal://${window.location.host}/api/calendar/${tour.id}.ics`;

  return (
    <div className="min-h-screen bg-black text-white p-12 flex flex-col justify-center items-center text-center font-sans selection:bg-white selection:text-black">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="max-w-xs w-full space-y-16"
      >
        <header className="space-y-4">
          <h1 className="text-3xl font-serif italic tracking-tight leading-none">{tour.name}</h1>
          <div className="h-px w-8 bg-white/20 mx-auto"></div>
          <p className="text-[10px] uppercase tracking-[0.3em] opacity-40">{tour.displayDate}</p>
        </header>

        <div className="flex flex-col space-y-8">
          {isIOS ? (
            <a 
              href={webcalUrl}
              className="text-[11px] uppercase tracking-[0.4em] font-bold hover:opacity-50 transition-opacity"
            >
              Apple Calendar
            </a>
          ) : (
            <a 
              href={gCalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] uppercase tracking-[0.4em] font-bold hover:opacity-50 transition-opacity"
            >
              Google Calendar
            </a>
          )}
          
          <button 
            onClick={() => window.Telegram?.WebApp?.close()}
            className="text-[9px] uppercase tracking-[0.2em] opacity-20 hover:opacity-100 transition-opacity pt-8"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [botInfo, setBotInfo] = useState<{ username: string } | null>(null);
  const [keySource, setKeySource] = useState<string>('NONE');

  // Simple routing
  const urlParams = new URLSearchParams(window.location.search);
  const tourId = urlParams.get('tourId');

  useEffect(() => {
    if (tourId) return; // Don't fetch config if in Mini App mode
    // Fetch current config and bot info
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.hasKey) setApiKey('********');
        setBotInfo(data.botInfo);
        setKeySource(data.source);
      })
      .catch(err => console.error('Failed to fetch config:', err));
  }, []);

  const handleTestAI = async () => {
    setTestStatus('testing');
    try {
      const res = await fetch('/api/test-ai');
      if (res.ok) {
        setTestStatus('success');
        setTimeout(() => setTestStatus('idle'), 3000);
      } else {
        setTestStatus('error');
      }
    } catch (err) {
      setTestStatus('error');
    }
  };

  const handleSave = async () => {
    if (apiKey === '********') {
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
      return;
    }
    setStatus('saving');
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      if (res.ok) {
        setStatus('success');
        setTimeout(() => setStatus('idle'), 3000);
      } else {
        setStatus('error');
      }
    } catch (err) {
      setStatus('error');
    }
  };

  const handleSelectKey = async () => {
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        // After selection, the container will likely restart, but we can also refresh
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to open key selection:', err);
    }
  };

  if (tourId) {
    return <CalendarApp tourId={tourId} />;
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#1a1a1a] font-serif p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-12 flex justify-between items-end border-b border-[#1a1a1a]/10 pb-6">
          <div>
            <h1 className="text-5xl font-light tracking-tight mb-2 italic">Гастродинамика</h1>
            <p className="text-sm uppercase tracking-widest opacity-60 font-sans">Велосипедное комьюнити • Бот-помощник</p>
          </div>
          <div className="text-right font-sans text-xs opacity-40 uppercase tracking-tighter">
            v1.2.0 / 2026
          </div>
        </header>

        <main className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left Column: Info */}
          <div className="md:col-span-2 space-y-8">
            <section className="bg-white rounded-[32px] p-8 shadow-sm border border-black/5">
              <div className="flex items-center gap-3 mb-6">
                <h2 className="text-2xl font-medium italic">Статус бота</h2>
              </div>
              
              <div className="space-y-4 font-sans">
                <div className="flex justify-between items-center p-4 bg-[#f5f5f0] rounded-2xl">
                  <span className="text-sm opacity-60 uppercase tracking-wider">Имя бота</span>
                  <span className="font-medium">@{botInfo?.username || 'Загрузка...'}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-[#f5f5f0] rounded-2xl">
                  <span className="text-sm opacity-60 uppercase tracking-wider">ИИ Интеграция</span>
                  <div className="flex flex-col items-end">
                    <span className={`font-medium uppercase tracking-widest text-[10px] ${keySource !== 'NONE' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {keySource !== 'NONE' ? 'Активна' : 'Не настроена'}
                    </span>
                    {keySource !== 'NONE' && (
                      <span className="text-[8px] opacity-40 uppercase tracking-tighter mt-1">
                        Источник: {keySource}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-4">
                <button 
                  onClick={handleTestAI}
                  disabled={testStatus === 'testing' || keySource === 'NONE'}
                  className={`p-4 border rounded-2xl flex flex-col items-center text-center transition-all ${
                    testStatus === 'success' ? 'bg-emerald-50 border-emerald-200' : 
                    testStatus === 'error' ? 'bg-red-50 border-red-200' :
                    'border-black/5 hover:bg-black/5'
                  }`}
                >
                  <span className="text-xs uppercase tracking-widest opacity-60 mb-1">Проверка ИИ</span>
                  <span className={`text-sm font-medium italic ${
                    testStatus === 'testing' ? 'animate-pulse' : 
                    testStatus === 'success' ? 'text-emerald-600' : 
                    testStatus === 'error' ? 'text-red-600' : ''
                  }`}>
                    {testStatus === 'testing' ? 'Тестирую...' : 
                     testStatus === 'success' ? 'Работает' : 
                     testStatus === 'error' ? 'Ошибка' : 'Запустить тест'}
                  </span>
                </button>
                <div className="p-4 border border-black/5 rounded-2xl flex flex-col items-center text-center">
                  <span className="text-xs uppercase tracking-widest opacity-60 mb-1">Команды</span>
                  <span className="text-xl font-medium italic">9 активных</span>
                </div>
                <div className="p-4 border border-black/5 rounded-2xl flex flex-col items-center text-center">
                  <span className="text-xs uppercase tracking-widest opacity-60 mb-1">Доступ</span>
                  <span className="text-xl font-medium italic">Публичный</span>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-4">
              <div className="bg-[#5A5A40] text-white rounded-[32px] p-6 flex flex-col justify-end aspect-square">
                <div>
                  <h3 className="text-xl italic mb-1">Календарь</h3>
                  <p className="text-xs opacity-70 font-sans uppercase tracking-wider">Сезон 2026</p>
                </div>
              </div>
              <div className="bg-white border border-black/5 rounded-[32px] p-6 flex flex-col justify-end aspect-square cursor-pointer hover:bg-black/5 transition-colors">
                <div>
                  <h3 className="text-xl italic mb-1">GPX Треки</h3>
                  <p className="text-xs opacity-40 font-sans uppercase tracking-wider">Unbounded маршруты</p>
                </div>
              </div>
              <div className="bg-white border border-black/5 rounded-[32px] p-6 flex flex-col justify-end aspect-square cursor-pointer hover:bg-black/5 transition-colors" onClick={() => window.open('https://yandex.com/maps?bookmarks%5BpublicId%5D=OfCmg0o9&utm_source=share&utm_campaign=bookmarks', '_blank')}>
                <div>
                  <h3 className="text-xl italic mb-1">RESTO</h3>
                  <p className="text-xs opacity-40 font-sans uppercase tracking-wider">Карта ресторанов</p>
                </div>
              </div>
              <div className="bg-[#1a1a1a] text-white rounded-[32px] p-6 flex flex-col justify-end aspect-square cursor-pointer hover:bg-[#1a1a1a]/90 transition-colors" onClick={() => window.open('https://www.komoot.com/collection/2674102/-lechappe-belle?ref=collection', '_blank')}>
                <div>
                  <h3 className="text-xl italic mb-1 text-emerald-400">KOMOOT</h3>
                  <p className="text-xs opacity-70 font-sans uppercase tracking-wider">Collection</p>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Settings */}
          <div className="space-y-6">
            <section className="bg-white rounded-[32px] p-8 shadow-sm border border-black/5">
              <div className="flex items-center gap-3 mb-6">
                <h2 className="text-xl font-medium italic">Настройки ИИ</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest opacity-40 font-sans mb-2 ml-1">
                    Gemini API Key
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full bg-[#f5f5f0] border-none rounded-2xl px-4 py-3 text-sm font-sans focus:ring-2 focus:ring-[#5A5A40]/20 transition-all"
                    />
                  </div>
                  <p className="text-[10px] mt-2 opacity-40 font-sans leading-relaxed">
                    Введите ключ вручную, если переменная окружения не подхватилась.
                  </p>
                </div>

                <button
                  onClick={handleSelectKey}
                  className="w-full py-3 rounded-2xl font-sans text-xs uppercase tracking-widest font-bold bg-[#5A5A40] text-white hover:bg-[#5A5A40]/90 transition-all flex items-center justify-center gap-2 mb-2"
                >
                  Выбрать ключ (AI Studio)
                </button>

                <button
                  onClick={handleSave}
                  disabled={status === 'saving'}
                  className={`w-full py-3 rounded-2xl font-sans text-xs uppercase tracking-widest font-bold transition-all flex items-center justify-center gap-2 ${
                    status === 'success' 
                      ? 'bg-emerald-500 text-white' 
                      : status === 'error'
                      ? 'bg-red-500 text-white'
                      : 'bg-[#1a1a1a] text-white hover:bg-[#1a1a1a]/90'
                  }`}
                >
                  {status === 'saving' ? (
                    'Сохранение...'
                  ) : status === 'success' ? (
                    'Сохранено'
                  ) : status === 'error' ? (
                    'Ошибка'
                  ) : (
                    'Сохранить ключ'
                  )}
                </button>
              </div>
            </section>

            <section className="p-6 border border-black/10 rounded-[32px] bg-[#f5f5f0]">
              <div className="flex items-start gap-3">
                <div>
                  <h4 className="text-sm font-medium italic mb-1">Помощь</h4>
                  <p className="text-[11px] leading-relaxed opacity-60 font-sans">
                    Ключ сохраняется в базе данных сервера и действует постоянно. Вы также можете использовать кнопку "Выбрать ключ", чтобы использовать официальный механизм AI Studio.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </main>

        <footer className="mt-16 pt-8 border-t border-[#1a1a1a]/10 text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] opacity-30 font-sans">
            Гастродинамика Cycling Community • 2026
          </p>
        </footer>
      </div>
    </div>
  );
}
