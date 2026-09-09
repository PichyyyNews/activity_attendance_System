import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Clock } from 'lucide-react';

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.',
  'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.',
  'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

const THAI_DAYS = [
  { label: 'อา', fullName: 'อาทิตย์', isWeekend: true },
  { label: 'จ', fullName: 'จันทร์', isWeekend: false },
  { label: 'อ', fullName: 'อังคาร', isWeekend: false },
  { label: 'พ', fullName: 'พุธ', isWeekend: false },
  { label: 'พฤ', fullName: 'พฤหัสบดี', isWeekend: false },
  { label: 'ศ', fullName: 'ศุกร์', isWeekend: false },
  { label: 'ส', fullName: 'เสาร์', isWeekend: true }
];

export interface ThaiDatePickerProps {
  value?: string; // Format: 'YYYY-MM-DD'
  onChange: (dateStr: string) => void;
  minDate?: string; // Format: 'YYYY-MM-DD'
  maxDate?: string; // Format: 'YYYY-MM-DD'
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  align?: 'left' | 'right';
  size?: 'sm' | 'md' | 'lg';
  format?: 'short' | 'full';
}

export default function ThaiDatePicker({
  value = '',
  onChange,
  minDate,
  maxDate,
  placeholder = 'เลือกวันที่ (พ.ศ.)',
  required = false,
  disabled = false,
  clearable = false,
  className = '',
  align = 'left',
  size = 'md',
  format = 'short'
}: ThaiDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current value or fallback to today
  const parsedValue = useMemo(() => {
    if (!value) return null;
    const parts = value.split('-').map(Number);
    if (parts.length !== 3) return null;
    return { year: parts[0], month: parts[1] - 1, day: parts[2] };
  }, [value]);

  const today = useMemo(() => {
    const d = new Date();
    return {
      year: d.getFullYear(),
      month: d.getMonth(),
      day: d.getDate()
    };
  }, []);

  // View state (which month/year is shown in calendar)
  const [viewYear, setViewYear] = useState<number>(() => parsedValue?.year || today.year);
  const [viewMonth, setViewMonth] = useState<number>(() => parsedValue?.month ?? today.month);

  // Sync view when opened
  useEffect(() => {
    if (isOpen) {
      if (parsedValue) {
        setViewYear(parsedValue.year);
        setViewMonth(parsedValue.month);
      } else {
        setViewYear(today.year);
        setViewMonth(today.month);
      }
    }
  }, [isOpen, parsedValue, today]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Navigate months
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  // Generate Buddhist Year options (current +- 5 years)
  const yearOptions = useMemo(() => {
    const currentBE = today.year + 543;
    const list: { ce: number; be: number }[] = [];
    for (let be = currentBE - 6; be <= currentBE + 6; be++) {
      list.push({ ce: be - 543, be });
    }
    return list;
  }, [today.year]);

  // Format date display in Thai
  const displayText = useMemo(() => {
    if (!parsedValue) return '';
    const beYear = parsedValue.year + 543;
    const monthName = format === 'full'
      ? THAI_MONTHS_FULL[parsedValue.month]
      : THAI_MONTHS_SHORT[parsedValue.month];
    return `${parsedValue.day} ${monthName} ${beYear}`;
  }, [parsedValue, format]);

  // Days in month calculation
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun, 1 = Mon ...
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const cells: {
      day: number;
      month: number;
      year: number;
      isCurrentMonth: boolean;
      dateStr: string;
      isDisabled: boolean;
      isSelected: boolean;
      isToday: boolean;
    }[] = [];

    // Prev month days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        day: d,
        month: m,
        year: y,
        isCurrentMonth: false,
        dateStr,
        isDisabled: true,
        isSelected: false,
        isToday: false
      });
    }

    // Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isDisabled = (minDate && dateStr < minDate) || (maxDate && dateStr > maxDate) || false;
      const isSelected = parsedValue
        ? parsedValue.year === viewYear && parsedValue.month === viewMonth && parsedValue.day === d
        : false;
      const isToday = today.year === viewYear && today.month === viewMonth && today.day === d;

      cells.push({
        day: d,
        month: viewMonth,
        year: viewYear,
        isCurrentMonth: true,
        dateStr,
        isDisabled,
        isSelected,
        isToday
      });
    }

    // Next month days to fill 35 or 42 grid
    const totalCells = cells.length > 35 ? 42 : 35;
    const remaining = totalCells - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        day: d,
        month: m,
        year: y,
        isCurrentMonth: false,
        dateStr,
        isDisabled: true,
        isSelected: false,
        isToday: false
      });
    }

    return cells;
  }, [viewYear, viewMonth, parsedValue, today, minDate, maxDate]);

  const handleSelectDate = (dateStr: string) => {
    onChange(dateStr);
    setIsOpen(false);
  };

  const handleSelectToday = () => {
    const todayStr = `${today.year}-${String(today.month + 1).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
    onChange(todayStr);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
  };

  // Size styles
  const sizeStyles = {
    sm: 'h-9 text-xs px-2.5 rounded-lg',
    md: 'h-10 text-xs sm:text-sm px-3.5 rounded-xl',
    lg: 'h-11 text-sm px-4 rounded-xl'
  }[size];

  return (
    <div ref={containerRef} className={`relative inline-block w-full ${className}`}>
      {/* Hidden input for HTML form validation if required */}
      {required && (
        <input
          type="text"
          value={value}
          required={required}
          readOnly
          className="sr-only"
          tabIndex={-1}
        />
      )}

      {/* Main Trigger Button */}
      <div
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        className={`w-full flex items-center justify-between gap-2 border border-hairline bg-canvas text-ink transition-all cursor-pointer select-none shadow-2xs hover:border-primary/50 focus-within:border-primary ${sizeStyles} ${
          disabled ? 'opacity-50 cursor-not-allowed bg-surface-soft' : ''
        } ${isOpen ? 'border-primary ring-1 ring-primary' : ''}`}
      >
        <div className="flex items-center gap-2 truncate">
          <CalendarIcon size={15} className="text-primary shrink-0" />
          {displayText ? (
            <span className="font-mono font-bold text-ink truncate">{displayText}</span>
          ) : (
            <span className="text-muted-soft truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {clearable && value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:bg-surface-soft text-muted hover:text-rose-500 rounded-md transition-colors"
              title="ล้างค่าวันที่"
            >
              <X size={13} />
            </button>
          )}
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-soft border border-hairline text-muted font-mono">
            พ.ศ.
          </span>
        </div>
      </div>

      {/* Thai Calendar Dropdown Popover */}
      {isOpen && (
        <div
          className={`absolute z-50 mt-1.5 w-72 sm:w-80 bg-canvas border border-hairline rounded-2xl shadow-xl p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150 select-none ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {/* Header Controls: Month, Year and Next/Prev */}
          <div className="flex items-center justify-between gap-1 pb-2 border-b border-hairline">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-surface-soft rounded-lg text-muted hover:text-ink transition-colors cursor-pointer"
              title="เดือนก่อนหน้า"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="flex items-center gap-1.5">
              {/* Month Dropdown */}
              <select
                value={viewMonth}
                onChange={e => setViewMonth(Number(e.target.value))}
                className="bg-surface-soft hover:bg-surface-strong border border-hairline rounded-lg px-2 py-1 text-xs font-bold text-ink focus:outline-none focus:border-primary cursor-pointer"
              >
                {THAI_MONTHS_FULL.map((name, idx) => (
                  <option key={idx} value={idx}>
                    {name}
                  </option>
                ))}
              </select>

              {/* Buddhist Year Dropdown */}
              <select
                value={viewYear}
                onChange={e => setViewYear(Number(e.target.value))}
                className="bg-surface-soft hover:bg-surface-strong border border-hairline rounded-lg px-2 py-1 text-xs font-bold font-mono text-ink focus:outline-none focus:border-primary cursor-pointer"
              >
                {yearOptions.map(opt => (
                  <option key={opt.ce} value={opt.ce}>
                    {opt.be}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-surface-soft rounded-lg text-muted hover:text-ink transition-colors cursor-pointer"
              title="เดือนถัดไป"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday Names */}
          <div className="grid grid-cols-7 text-center">
            {THAI_DAYS.map((d, idx) => (
              <span
                key={idx}
                title={d.fullName}
                className={`text-[11px] font-bold py-1 ${
                  d.isWeekend ? 'text-rose-500/80 font-extrabold' : 'text-muted'
                }`}
              >
                {d.label}
              </span>
            ))}
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarCells.map((cell, idx) => {
              if (!cell.isCurrentMonth) {
                return (
                  <div
                    key={idx}
                    className="h-8 flex items-center justify-center text-[11px] font-mono text-muted/30 cursor-default"
                  >
                    {cell.day}
                  </div>
                );
              }

              if (cell.isDisabled) {
                return (
                  <div
                    key={idx}
                    className="h-8 flex items-center justify-center text-[11px] font-mono text-muted/40 bg-surface-soft/40 rounded-lg cursor-not-allowed line-through"
                  >
                    {cell.day}
                  </div>
                );
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectDate(cell.dateStr)}
                  className={`h-8 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center relative cursor-pointer ${
                    cell.isSelected
                      ? 'bg-primary text-white shadow-xs scale-105 z-10'
                      : cell.isToday
                      ? 'bg-primary/10 text-primary border border-primary/40 hover:bg-primary/20'
                      : 'hover:bg-surface-soft text-ink'
                  }`}
                >
                  {cell.day}
                  {cell.isToday && !cell.isSelected && (
                    <span className="absolute bottom-1 w-1 h-1 bg-primary rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer Bar: Today and Clear Button */}
          <div className="pt-2 border-t border-hairline flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleSelectToday}
              className="px-2.5 py-1 text-primary hover:bg-primary/10 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1"
            >
              <Clock size={12} />
              <span>วันนี้ ({today.day} {THAI_MONTHS_SHORT[today.month]} {today.year + 543})</span>
            </button>

            {clearable && value && (
              <button
                type="button"
                onClick={handleClear}
                className="px-2.5 py-1 text-muted hover:text-rose-600 hover:bg-rose-50 rounded-lg font-bold transition-colors cursor-pointer"
              >
                ล้างค่า
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
