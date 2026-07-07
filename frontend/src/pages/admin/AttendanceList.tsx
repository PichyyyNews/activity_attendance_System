import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { ClipboardCheck, Users, ChevronRight, CheckCircle2, XCircle, Minus, X } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Major {
  id: number;
  level: string;
  year: string;
  major_name: string;
  major_code: string;
  room: string;
}

interface Session {
  id: number;
  week_number: number;
  title: string;
  date: string;
}

interface Student {
  id: number;
  student_id: string;
  prefix: string;
  first_name: string;
  last_name: string;
  level: string;
  year: string;
  major_code: string;
  major_name: string;
  room: string;
  attendance: Record<number, string>; // session_id -> attended_at
  remarks?: Record<number, string>; // session_id -> remark
}

interface HeatmapData {
  sessions: Session[];
  students: Student[];
}

interface TooltipInfo {
  x: number;
  y: number;
  content: {
    studentName: string;
    weekNumber: number;
    title: string;
    date: string;
    status: 'present' | 'absent' | 'no-session';
    attendedAt?: string;
    remark?: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Label shown on tab: e.g. ปวช.1 ชทค กลุ่ม 1 → "1ชทค1" */
function tabLabel(m: Major) {
  return `${m.year}${m.major_code}${m.room}`;
}

function tabFullLabel(m: Major) {
  return `${m.level}.${m.year} ${m.major_name} กลุ่ม ${m.room}`;
}

/** Compute streak of consecutive presents ending at index i */
function streakAt(student: Student, sessions: Session[], idx: number): number {
  let streak = 0;
  for (let k = idx; k >= 0; k--) {
    if (student.attendance[sessions[k].id] !== undefined) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/** Color for a heatmap cell */
function cellColor(status: 'present' | 'absent' | 'no-session', streak: number, hasRemark: boolean): string {
  if (status === 'no-session') return '#e2e8f0';
  if (status === 'absent') {
    return hasRemark ? '#ffedd5' : '#fca5a5';
  }
  // present — ramp by streak
  if (streak >= 5) return '#14532d';
  if (streak >= 4) return '#166534';
  if (streak >= 3) return '#15803d';
  if (streak >= 2) return '#22c55e';
  return '#86efac';
}

function cellBorderColor(status: 'present' | 'absent' | 'no-session', streak: number, hasRemark: boolean): string {
  if (status === 'no-session') return '#cbd5e1';
  if (status === 'absent') {
    return hasRemark ? '#f97316' : '#f87171';
  }
  if (streak >= 3) return '#15803d';
  if (streak >= 2) return '#16a34a';
  return '#4ade80';
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch {
    return dateStr;
  }
}

// ─── Heatmap Row ─────────────────────────────────────────────────────────────

function HeatmapRow({
  student,
  sessions,
  onHover,
  onLeave,
  onClickCell,
}: {
  student: Student;
  sessions: Session[];
  onHover: (info: TooltipInfo) => void;
  onLeave: () => void;
  onClickCell: (student: Student, session: Session) => void;
}) {
  const cells = sessions.map((session, idx) => {
    const hasAttended = student.attendance[session.id] !== undefined;
    const status: 'present' | 'absent' | 'no-session' = hasAttended ? 'present' : 'absent';
    const streak = hasAttended ? streakAt(student, sessions, idx) : 0;
    const hasRemark = !!(student.remarks && student.remarks[session.id]);
    const bg = cellColor(status, streak, hasRemark);
    const border = cellBorderColor(status, streak, hasRemark);
    return { session, status, bg, border, attendedAt: student.attendance[session.id] };
  });

  return (
    <div className="flex gap-[3px] items-center">
      {cells.map(({ session, status, bg, border, attendedAt }) => {
        const hasRemark = student.remarks && student.remarks[session.id];
        return (
          <div
            key={session.id}
            className="w-6 h-6 sm:w-5 sm:h-5 rounded-[3px] shrink-0 cursor-pointer touch-manipulation transition-transform hover:scale-125 hover:z-10 relative flex items-center justify-center"
            style={{ backgroundColor: bg, border: `1.5px solid ${border}` }}
            onClick={() => onClickCell(student, session)}
            onMouseEnter={e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onHover({
                x: rect.left + rect.width / 2,
                y: rect.top,
                content: {
                  studentName: `${student.prefix}${student.first_name} ${student.last_name}`,
                  weekNumber: session.week_number,
                  title: session.title,
                  date: session.date,
                  status,
                  attendedAt,
                  remark: student.remarks ? student.remarks[session.id] : undefined,
                },
              });
            }}
            onMouseLeave={onLeave}
            title=""
          >
            {hasRemark && (
              <span className="absolute bottom-[2px] right-[2px] w-[4px] h-[4px] bg-amber-500 rounded-full" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ info }: { info: TooltipInfo }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: info.x, top: info.y });

  useEffect(() => {
    if (ref.current) {
      const w = ref.current.offsetWidth;
      const left = Math.min(Math.max(info.x - w / 2, 8), window.innerWidth - w - 8);
      setPos({ left, top: info.y - ref.current.offsetHeight - 10 });
    }
  }, [info.x, info.y]);

  const { content } = info;

  return (
    <div
      ref={ref}
      className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg shadow-xl border border-hairline bg-canvas text-xs whitespace-nowrap"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="font-bold text-ink mb-0.5">{content.studentName}</div>
      <div className="text-muted">ครั้งที่ {content.weekNumber} — {content.title}</div>
      <div className="text-muted">{formatDate(content.date)}</div>
      <div className={`mt-1 font-semibold flex items-center gap-1 ${
        content.status === 'present' ? 'text-green-600' :
        content.status === 'absent' ? 'text-red-500' : 'text-slate-400'
      }`}>
        {content.status === 'present' ? <><CheckCircle2 size={11} /> เข้ากิจกรรม</> :
         content.status === 'absent' ? <><XCircle size={11} /> ไม่เข้ากิจกรรม</> :
         <><Minus size={11} /> ไม่มีข้อมูล</>}
        {content.status === 'present' && content.attendedAt && (
          <span className="text-muted font-normal ml-1">
            {new Date(content.attendedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
          </span>
        )}
      </div>
      {content.remark && (
        <div className="mt-1.5 pt-1 border-t border-hairline text-amber-600 font-semibold flex items-center gap-1">
          <span>📝 หมายเหตุ:</span>
          <span className="font-medium text-ink truncate max-w-[150px]">{content.remark}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminAttendanceList() {
  const [majors, setMajors] = useState<Major[]>([]);
  const [activeTab, setActiveTab] = useState<string>(''); // "level-year-major_code-room"
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [search, setSearch] = useState('');
  const [showLegend, setShowLegend] = useState(false);

  const [editingCell, setEditingCell] = useState<{
    student: Student;
    session: Session;
    status: 'present' | 'absent';
    remark: string;
  } | null>(null);

  const [quickMode, setQuickMode] = useState<'off' | 'present' | 'absent'>('off');

  const handleCellClick = (student: Student, session: Session) => {
    if (quickMode !== 'off') {
      const status = quickMode;
      const isPresent = student.attendance[session.id] !== undefined;
      const currentStatus = isPresent ? 'present' : 'absent';
      
      if (currentStatus === status) return; // No change needed

      // Optimistic UI update
      setHeatmapData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          students: prev.students.map(s => {
            if (s.student_id === student.student_id) {
              const newAttendance = { ...s.attendance };
              if (status === 'present') {
                newAttendance[session.id] = new Date().toISOString();
              } else {
                delete newAttendance[session.id];
              }
              return { ...s, attendance: newAttendance };
            }
            return s;
          })
        };
      });

      // API Call
      axios.post('/api/attendances/update-status-remark', {
        student_id: student.student_id,
        session_id: session.id,
        status,
        remark: student.remarks ? (student.remarks[session.id] || '') : '',
      })
      .then(() => {
        // Refresh silently in background
        if (!activeTab || majors.length === 0) return;
        const major = majors.find(m => majorKey(m) === activeTab);
        if (!major) return;
        axios.get('/api/attendance-heatmap', {
          params: {
            level: major.level,
            year: major.year,
            major_code: major.major_code,
            room: major.room,
          }
        }).then(res => {
          setHeatmapData(res.data);
        });
      })
      .catch(err => {
        console.error('Error in quick mode update:', err);
        alert('ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
        // Rollback on error
        if (!activeTab || majors.length === 0) return;
        const major = majors.find(m => majorKey(m) === activeTab);
        if (!major) return;
        axios.get('/api/attendance-heatmap', {
          params: {
            level: major.level,
            year: major.year,
            major_code: major.major_code,
            room: major.room,
          }
        }).then(res => {
          setHeatmapData(res.data);
        });
      });
      return;
    }

    // Normal mode (show modal)
    const isPresent = student.attendance[session.id] !== undefined;
    const remark = student.remarks ? (student.remarks[session.id] || '') : '';
    setEditingCell({
      student,
      session,
      status: isPresent ? 'present' : 'absent',
      remark,
    });
  };

  const handleSaveCell = () => {
    if (!editingCell) return;
    const { student, session, status, remark } = editingCell;

    axios.post('/api/attendances/update-status-remark', {
      student_id: student.student_id,
      session_id: session.id,
      status,
      remark,
    })
    .then(() => {
      // Reload heatmap data
      if (!activeTab || majors.length === 0) return;
      const major = majors.find(m => majorKey(m) === activeTab);
      if (!major) return;
      axios.get('/api/attendance-heatmap', {
        params: {
          level: major.level,
          year: major.year,
          major_code: major.major_code,
          room: major.room,
        }
      }).then(res => {
        setHeatmapData(res.data);
        setEditingCell(null);
      });
    })
    .catch(err => {
      console.error('Error updating status and remark:', err);
      alert('ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    });
  };

  // Fetch majors list for tabs
  useEffect(() => {
    axios.get('/api/majors').then(res => {
      const data: Major[] = res.data || [];
      setMajors(data);
      if (data.length > 0) {
        const first = data[0];
        setActiveTab(majorKey(first));
      }
    });
  }, []);

  // Fetch heatmap data when tab changes
  useEffect(() => {
    if (!activeTab || majors.length === 0) return;
    const major = majors.find(m => majorKey(m) === activeTab);
    if (!major) return;
    setLoading(true);
    setHeatmapData(null);
    axios.get('/api/attendance-heatmap', {
      params: {
        level: major.level,
        year: major.year,
        major_code: major.major_code,
        room: major.room,
      }
    }).then(res => {
      setHeatmapData(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [activeTab, majors]);

  const majorKey = (m: Major) => `${m.level}-${m.year}-${m.major_code}-${m.room}`;
  const activeMajor = majors.find(m => majorKey(m) === activeTab);

  const filteredStudents = (heatmapData?.students || []).filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.student_id.includes(q) ||
           s.first_name.toLowerCase().includes(q) ||
           s.last_name.toLowerCase().includes(q);
  });

  const sessions = heatmapData?.sessions || [];

  // Legend stripe bg for streak
  const legendItems = [
    { label: 'ไม่เข้ากิจกรรม', color: '#fca5a5', border: '#f87171' },
    { label: 'ไม่เข้ากิจกรรม (มีหมายเหตุ)', color: '#ffedd5', border: '#f97316' },
    { label: 'เข้ากิจกรรม ×1', color: '#86efac', border: '#4ade80' },
    { label: 'เข้ากิจกรรม ×2', color: '#22c55e', border: '#16a34a' },
    { label: 'เข้ากิจกรรม ×3+', color: '#15803d', border: '#15803d' },
  ];

  return (
    <div className="w-full space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-4xl font-semibold text-ink tracking-tight flex items-center space-x-2">
            <ClipboardCheck className="w-8 h-8 text-primary" />
            <span>ตารางเช็กชื่อเข้ากิจกรรม</span>
          </h1>
          <p className="text-muted text-sm mt-1">ดูประวัติการเข้ากิจกรรมรายกลุ่มเรียน แบบ Heatmap รายครั้ง</p>
        </div>
        {/* Legend */}
        <div className="flex flex-col gap-2">
          {/* Mobile toggle button */}
          <button
            onClick={() => setShowLegend(prev => !prev)}
            className="sm:hidden self-start flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-hairline bg-canvas text-xs font-semibold text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
          >
            <span>ดูคำอธิบายสี</span>
            <ChevronRight size={13} className={`text-muted transition-transform ${showLegend ? 'rotate-90' : ''}`} />
          </button>
          {/* Legend items */}
          <div className={`${showLegend ? 'flex' : 'hidden'} sm:flex items-center gap-2 flex-wrap`}>
            <span className="text-xs text-muted font-semibold">สถานะ:</span>
            {legendItems.map(item => (
              <div key={item.label} className="flex items-center gap-1 text-xs text-muted">
                <div
                  className="w-4 h-4 rounded-[3px]"
                  style={{ backgroundColor: item.color, border: `1.5px solid ${item.border}` }}
                />
                <span>{item.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1 text-xs text-muted">
              <div className="w-4 h-4 rounded-[3px]" style={{ backgroundColor: '#e2e8f0', border: '1.5px solid #cbd5e1' }} />
              <span>ไม่มีข้อมูล</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      {majors.length === 0 ? (
        <div className="bg-canvas border border-hairline rounded-lg p-8 text-center text-muted">
          <Users size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">ยังไม่มีกลุ่มเรียนในระบบ</p>
          <p className="text-xs mt-1">กรุณาเพิ่มสาขาวิชา/กลุ่มเรียนในเมนู ตั้งค่า</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {majors.map(m => {
              const key = majorKey(m);
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  title={tabFullLabel(m)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer border ${
                    isActive
                      ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                      : 'bg-canvas text-muted border-hairline hover:border-primary hover:text-primary'
                  }`}
                >
                  {tabLabel(m)}
                </button>
              );
            })}
          </div>

          {/* Active tab info + search */}
          {activeMajor && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface-soft/40 border border-hairline p-3 rounded-xl">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm text-muted">
                <div className="flex items-center gap-2">
                  <ChevronRight size={15} className="text-primary" />
                  <span className="font-semibold text-ink">{tabFullLabel(activeMajor)}</span>
                  {heatmapData && (
                    <span className="text-muted-soft">
                      · {filteredStudents.length} คน · {sessions.length} ครั้ง
                    </span>
                  )}
                </div>

                {/* Quick Check Mode Selector */}
                <div className="flex items-center gap-1 bg-canvas border border-hairline rounded-lg p-1 shadow-sm shrink-0">
                  <span className="text-[11px] font-bold text-muted px-1.5 flex items-center gap-1">
                    <span>⚡</span> โหมดไว:
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuickMode('off')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer transition-all ${
                      quickMode === 'off'
                        ? 'bg-ink text-canvas shadow-sm'
                        : 'text-muted hover:text-ink hover:bg-surface-soft'
                    }`}
                  >
                    ปิด
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickMode('present')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 ${
                      quickMode === 'present'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-emerald-600 hover:bg-emerald-50'
                    }`}
                  >
                    <span>🟢</span> เข้าเรียน
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickMode('absent')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 ${
                      quickMode === 'absent'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-rose-600 hover:bg-rose-50'
                    }`}
                  >
                    <span>🔴</span> ขาดเรียน
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อหรือรหัสนักศึกษา..."
                className="h-9 w-full md:w-64 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="bg-canvas border border-hairline rounded-lg p-16 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted font-medium">กำลังโหลดข้อมูล...</p>
            </div>
          ) : heatmapData && (
            <div className="bg-canvas border border-hairline rounded-lg shadow-sm overflow-x-auto scrollbar-thin">
              <div className="min-w-max flex flex-col">
                {/* Column Headers (Week numbers) */}
                <div className="border-b border-hairline flex items-center">
                  {/* Fixed left column header */}
                  <div className="sticky left-0 z-20 bg-surface-soft w-48 sm:w-60 md:w-72 shrink-0 px-3 sm:px-4 py-2.5 border-r border-hairline flex items-center gap-1.5">
                    <Users size={13} className="text-muted" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                      นักศึกษา ({filteredStudents.length} คน)
                    </span>
                  </div>
                  {/* Week columns */}
                  <div className="flex gap-[3px] px-4 py-2.5 items-center">
                    {sessions.map(session => (
                      <div
                        key={session.id}
                        className="w-6 sm:w-5 text-center shrink-0"
                        title={`ครั้งที่ ${session.week_number}: ${session.title} — ${formatDate(session.date)}`}
                      >
                        <div className="text-[9px] font-bold text-muted leading-tight">{session.week_number}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Student rows */}
                {filteredStudents.length === 0 ? (
                  <div className="py-12 text-center text-muted text-sm border-b border-hairline">ไม่พบนักศึกษาในกลุ่มนี้</div>
                ) : (
                  <div className="divide-y divide-hairline">
                    {filteredStudents.map((student, idx) => {
                      // Compute summary
                      const totalPresent = sessions.filter(s => student.attendance[s.id] !== undefined).length;
                      const rate = sessions.length > 0 ? Math.round((totalPresent / sessions.length) * 100) : 0;

                      return (
                        <div
                          key={student.student_id}
                          className={`flex items-center border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-strong ${
                            idx % 2 === 0 ? 'bg-canvas' : 'bg-surface-soft'
                          }`}
                        >
                          {/* Fixed: index + student info */}
                          <div className="sticky left-0 z-10 bg-inherit w-48 sm:w-60 md:w-72 shrink-0 px-3 sm:px-4 py-2.5 border-r border-hairline flex items-center gap-2 sm:gap-3">
                            <span className="text-[11px] text-muted-soft font-bold w-5 text-right shrink-0">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-ink truncate">
                                {student.prefix}{student.first_name} {student.last_name}
                              </div>
                              <div className="text-[10px] text-muted-soft font-mono">{student.student_id}</div>
                            </div>
                            {/* Mini stat */}
                            <div className="text-right shrink-0">
                              <div className={`text-xs font-extrabold ${
                                rate >= 80 ? 'text-green-600' : rate >= 60 ? 'text-amber-500' : 'text-red-500'
                              }`}>{rate}%</div>
                              <div className="text-[9px] text-muted-soft">{totalPresent}/{sessions.length}</div>
                            </div>
                          </div>

                          {/* Heatmap cells */}
                          <div className="px-4 py-2.5">
                            <HeatmapRow
                              student={student}
                              sessions={sessions}
                              onHover={setTooltip}
                              onLeave={() => setTooltip(null)}
                              onClickCell={handleCellClick}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Footer summary */}
                {filteredStudents.length > 0 && sessions.length > 0 && (
                  <div className="border-t border-hairline px-4 py-2.5 bg-surface-soft flex items-center gap-4 text-[11px] text-muted">
                    <div className="sticky left-0 z-10 bg-surface-soft w-48 sm:w-60 md:w-72 shrink-0 px-3 sm:px-4 py-2.5 border-r border-hairline flex items-center gap-3 font-bold text-ink">
                      <span className="w-5" />
                      <span>สรุปรายครั้ง</span>
                    </div>
                    <div className="flex gap-[3px]">
                      {sessions.map(session => {
                        const presentCount = filteredStudents.filter(s => s.attendance[session.id] !== undefined).length;
                        const total = filteredStudents.length;
                        const pct = total > 0 ? Math.round((presentCount / total) * 100) : 0;
                        const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#f87171';
                        return (
                          <div
                            key={session.id}
                            className="w-6 h-6 sm:w-5 sm:h-5 rounded-[3px] shrink-0 flex items-center justify-center cursor-default"
                            style={{ backgroundColor: color + '30', border: `1.5px solid ${color}` }}
                            title={`ค${session.week_number}: ${presentCount}/${total} คน (${pct}%)`}
                          >
                            <span className="text-[7px] font-bold" style={{ color }}>
                              {pct}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal แก้ไขสถานะเช็กชื่อและหมายเหตุ */}
      {editingCell && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-canvas border border-hairline rounded-xl shadow-2xl p-6 w-full max-w-md space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <h3 className="font-bold text-lg text-ink flex items-center gap-2">
                <span>📝 แก้ไขการเช็กชื่อ</span>
              </h3>
              <button
                onClick={() => setEditingCell(null)}
                className="text-muted hover:text-ink cursor-pointer p-1 rounded-md hover:bg-surface-soft border-0 bg-transparent"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-left">
              {/* Student Details */}
              <div className="bg-surface-soft p-3.5 rounded-lg border border-hairline space-y-1 text-xs">
                <div><span className="font-bold text-ink">นักศึกษา:</span> {editingCell.student.prefix}{editingCell.student.first_name} {editingCell.student.last_name}</div>
                <div><span className="font-bold text-ink">รหัสนักศึกษา:</span> <span className="font-mono">{editingCell.student.student_id}</span></div>
                <div><span className="font-bold text-ink">ครั้งที่กิจกรรม:</span> ครั้งที่ {editingCell.session.week_number} ({editingCell.session.title})</div>
                <div><span className="font-bold text-ink">วันที่จัดกิจกรรม:</span> {formatDate(editingCell.session.date)}</div>
              </div>

              {/* Status Radio Toggles */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-ink">สถานะการเช็กชื่อ</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingCell(prev => prev ? { ...prev, status: 'present' } : null)}
                    className={`h-11 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      editingCell.status === 'present'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold shadow-sm shadow-emerald-100'
                        : 'bg-canvas border-hairline text-muted hover:border-emerald-200'
                    }`}
                  >
                    <CheckCircle2 size={16} />
                    <span>เข้ากิจกรรม (Present)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingCell(prev => prev ? { ...prev, status: 'absent' } : null)}
                    className={`h-11 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      editingCell.status === 'absent'
                        ? 'bg-rose-50 border-rose-300 text-rose-700 font-bold shadow-sm shadow-rose-100'
                        : 'bg-canvas border-hairline text-muted hover:border-rose-200'
                    }`}
                  >
                    <XCircle size={16} />
                    <span>ไม่เข้ากิจกรรม (Absent)</span>
                  </button>
                </div>
              </div>

              {/* Remark Input */}
              <div className="space-y-2">
                <label htmlFor="remark-textarea" className="block text-xs font-bold text-ink">หมายเหตุ</label>
                <textarea
                  id="remark-textarea"
                  value={editingCell.remark}
                  onChange={e => setEditingCell(prev => prev ? { ...prev, remark: e.target.value } : null)}
                  placeholder="กรอกหมายเหตุ เช่น ลาป่วย, ลากิจ, มาสาย, ลืมโทรศัพท์ ฯลฯ"
                  rows={3}
                  className="w-full border border-hairline rounded-lg px-3.5 py-2 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2 border-t border-hairline">
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="h-10 px-5 border border-hairline rounded-lg text-sm font-semibold text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer bg-transparent"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveCell}
                className="h-10 px-6 bg-primary hover:bg-primary-active text-white rounded-lg text-sm font-semibold shadow-md shadow-primary/20 transition-all cursor-pointer border-0"
              >
                บันทึกข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip (portal-like fixed) */}
      {tooltip && <Tooltip info={tooltip} />}
    </div>
  );
}
