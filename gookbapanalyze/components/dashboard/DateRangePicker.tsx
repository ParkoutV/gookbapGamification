'use client';

import React, { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { format, subDays, startOfDay, subHours } from 'date-fns';

interface DateRangePickerProps {
  onFilterChange: (start: Date | null, end: Date | null) => void;
}

export function DateRangePicker({ onFilterChange }: DateRangePickerProps) {
  // null means "Not specified"
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  // Strings for the inputs, keeping them synchronized with Date objects
  const [startInput, setStartInput] = useState<string>('');
  const [endInput, setEndInput] = useState<string>('');

  const [startNotSpecified, setStartNotSpecified] = useState(true);
  const [endNotSpecified, setEndNotSpecified] = useState(true);

  // Update strings when Dates change externally (or via buttons)
  useEffect(() => {
    if (startDate) {
      setStartInput(format(startDate, "yyyy-MM-dd'T'HH:mm"));
    } else {
      setStartInput('');
    }
  }, [startDate]);

  useEffect(() => {
    if (endDate) {
      setEndInput(format(endDate, "yyyy-MM-dd'T'HH:mm"));
    } else {
      setEndInput('');
    }
  }, [endDate]);

  // Handle manual input change
  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setStartInput(val);
    if (val) {
      setStartDate(new Date(val));
    }
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEndInput(val);
    if (val) {
      setEndDate(new Date(val));
    }
  };

  const handleStartCheck = (checked: boolean) => {
    setStartNotSpecified(checked);
    if (checked) {
      setStartDate(null);
    } else {
      const now = new Date();
      setStartDate(now);
    }
  };

  const handleEndCheck = (checked: boolean) => {
    setEndNotSpecified(checked);
    if (checked) {
      setEndDate(null);
    } else {
      const now = new Date();
      setEndDate(now);
    }
  };

  // Preset buttons
  const setPreset = (preset: 'today' | '24h' | '1w' | '2w') => {
    setEndNotSpecified(true);
    setEndDate(null); // End date becomes not specified (infinity)
    setStartNotSpecified(false);
    
    const now = new Date();
    let newStart = now;

    switch (preset) {
      case 'today':
        newStart = startOfDay(now);
        break;
      case '24h':
        newStart = subHours(now, 24);
        break;
      case '1w':
        newStart = subDays(now, 7);
        break;
      case '2w':
        newStart = subDays(now, 14);
        break;
    }
    
    setStartDate(newStart);
  };

  // Trigger parent callback when effective dates change
  useEffect(() => {
    onFilterChange(startDate, endDate);
  }, [startDate, endDate, onFilterChange]);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-4 rounded-xl shadow-sm">
      <div className="flex flex-col space-y-4">
        {/* Date Inputs */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
          
          {/* Start Date */}
          <div className="flex flex-col w-full sm:w-auto space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center">
              <Calendar className="w-3 h-3 mr-1" />
              시작 시간
            </label>
            <input 
              type="datetime-local" 
              value={startInput}
              onChange={handleStartChange}
              disabled={startNotSpecified}
              className="p-2 border rounded-lg text-sm bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300 mt-1 cursor-pointer">
              <input 
                type="checkbox" 
                checked={startNotSpecified}
                onChange={(e) => handleStartCheck(e.target.checked)}
                className="rounded text-blue-500 focus:ring-blue-500"
              />
              <span>지정하지 않음</span>
            </label>
          </div>

          <span className="hidden sm:block text-gray-400">~</span>

          {/* End Date */}
          <div className="flex flex-col w-full sm:w-auto space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center">
              <Calendar className="w-3 h-3 mr-1" />
              종료 시간
            </label>
            <input 
              type="datetime-local" 
              value={endInput}
              onChange={handleEndChange}
              disabled={endNotSpecified}
              className="p-2 border rounded-lg text-sm bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300 mt-1 cursor-pointer">
              <input 
                type="checkbox" 
                checked={endNotSpecified}
                onChange={(e) => handleEndCheck(e.target.checked)}
                className="rounded text-blue-500 focus:ring-blue-500"
              />
              <span>지정하지 않음</span>
            </label>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
          <button onClick={() => setPreset('today')} className="flex items-center px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 rounded-md transition-colors">
            오늘
          </button>
          <button onClick={() => setPreset('24h')} className="flex items-center px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 rounded-md transition-colors">
            최근 24시간
          </button>
          <button onClick={() => setPreset('1w')} className="flex items-center px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 rounded-md transition-colors">
            최근 1주
          </button>
          <button onClick={() => setPreset('2w')} className="flex items-center px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 rounded-md transition-colors">
            최근 2주
          </button>
        </div>
      </div>
    </div>
  );
}
