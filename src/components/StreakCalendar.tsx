import { useState } from 'react';
import { JournalEntry } from '../types';
import { Calendar as CalendarIcon, Flame, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

interface StreakCalendarProps {
  entries: JournalEntry[];
  onSelectEntry?: (entry: JournalEntry) => void;
}

export default function StreakCalendar({ entries, onSelectEntry }: StreakCalendarProps) {
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date());

  // Compute Streak
  const calculateStreak = () => {
    if (entries.length === 0) return 0;

    // Set of local date strings YYYY-MM-DD
    const uniqueDates = new Set<string>();
    entries.forEach(e => {
      try {
        const d = new Date(e.date);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        uniqueDates.add(dateStr);
      } catch (err) {
        console.error("Invalid date", e.date);
      }
    });

    if (uniqueDates.size === 0) return 0;

    let streak = 0;
    const tempDate = new Date();
    const formatDateStr = (d: Date) => {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    let todayStr = formatDateStr(tempDate);

    // If no entry today, check if yesterday has an entry. If not, streak is 0
    if (!uniqueDates.has(todayStr)) {
      tempDate.setDate(tempDate.getDate() - 1);
      const yesterdayStr = formatDateStr(tempDate);
      if (!uniqueDates.has(yesterdayStr)) {
        return 0;
      }
    }

    // Work backwards counting consecutive active days
    while (true) {
      const checkStr = formatDateStr(tempDate);
      if (uniqueDates.has(checkStr)) {
        streak++;
        tempDate.setDate(tempDate.getDate() - 1);
      } else {
        break;
      }
    }

    return streak;
  };

  const streak = calculateStreak();

  // Calendar Math
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const firstDayIndex = new Date(year, month, 1).getDay(); // Day of week (0-6)
  const daysInMonth = new Date(year, month + 1, 0).getDate(); // Number of days in current month

  const prevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

  // Find entries on a given date (local)
  const getEntriesForDate = (dayNum: number) => {
    return entries.filter(e => {
      try {
        const d = new Date(e.date);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === dayNum;
      } catch (err) {
        return false;
      }
    });
  };

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="bg-[#0F1115] border border-[#1F2229] p-5 rounded-xl space-y-5">
      {/* Streak Header Indicator */}
      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 text-zinc-200">
            <Flame className="w-5 h-5 text-zinc-300" />
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-wider text-zinc-400 font-bold">Reflection Streak</h4>
            <p className="text-[10px] text-zinc-500">Consecutive days journaling</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black text-white font-mono">
            {streak}
          </span>
          <span className="text-xs text-zinc-400 font-bold ml-1">Days</span>
        </div>
      </div>

      {/* Monthly Calendar View */}
      <div className="space-y-4">
        {/* Navigation Row */}
        <div className="flex items-center justify-between border-b border-[#1F2229] pb-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-zinc-400" />
            <h4 className="text-xs uppercase tracking-wider text-slate-300 font-bold">
              {monthNames[month]} {year}
            </h4>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={prevMonth}
              className="p-1 hover:bg-[#15171C] rounded border border-[#1F2229] text-slate-400 hover:text-white transition"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextMonth}
              className="p-1 hover:bg-[#15171C] rounded border border-[#1F2229] text-slate-400 hover:text-white transition"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-2 text-center text-xs">
          {weekdays.map((day) => (
            <span key={day} className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-semibold py-1">
              {day}
            </span>
          ))}

          {/* Empty prefix padding days */}
          {Array.from({ length: firstDayIndex }).map((_, idx) => (
            <div key={`empty-${idx}`} className="h-9" />
          ))}

          {/* Actual days of month */}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const dayNum = idx + 1;
            const dayEntries = getEntriesForDate(dayNum);
            const hasEntry = dayEntries.length > 0;

            return (
              <button
                key={`day-${dayNum}`}
                disabled={!hasEntry}
                onClick={() => {
                  if (hasEntry && onSelectEntry) {
                    onSelectEntry(dayEntries[0]);
                  }
                }}
                className={`h-9 flex flex-col items-center justify-center rounded-lg text-xs relative transition group font-mono ${
                  hasEntry
                    ? 'bg-zinc-800 border border-zinc-600 text-white hover:bg-zinc-700 active:scale-95 cursor-pointer shadow-md shadow-black/30'
                    : 'bg-[#15171C]/40 border border-transparent text-slate-600'
                }`}
                title={hasEntry ? `${dayEntries.length} reflection(s) recorded` : "No reflection"}
              >
                <span>{dayNum}</span>
                {hasEntry && (
                  <span className="absolute bottom-1 w-1 h-1 bg-zinc-200 rounded-full animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
