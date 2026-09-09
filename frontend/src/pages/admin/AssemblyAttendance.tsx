import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import {
  Calendar,
  Search,
  Download,
  Printer,
  Eye,
  X,
  LayoutGrid,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  CameraOff,
  Edit3,
  MapPin,
  Clock
} from 'lucide-react';
import ThaiDatePicker from '../../components/ThaiDatePicker';

interface Student {
  id: number;
  student_id: string;
  prefix?: string;
  first_name: string;
  last_name: string;
  level: string;
  year: string;
  major_name: string;
  major_code: string;
  room: string;
  status?: string;
  attended_at?: string | null;
  photo_path?: string | null;
  remark?: string;
  matched_location?: string | null;
  attendance?: Record<string, any>;
  stats?: {
    totalDays: number;
    present: number;
    late: number;
    leave: number;
    absent: number;
    rate: number;
  };
}

interface AssemblyAttendanceProps {
  activeYear?: string;
  activeTerm?: string;
}

export default function AssemblyAttendance({ activeYear: propYear, activeTerm: propTerm }: AssemblyAttendanceProps) {
  const outletCtx = useOutletContext<{ activeYear?: string; activeTerm?: string }>() || {};
  const activeYear = propYear || outletCtx.activeYear;
  const activeTerm = propTerm || outletCtx.activeTerm;

  const [viewMode, setViewMode] = useState<'daily' | 'matrix' | 'summary'>('daily');
  const [dailyDisplayMode, setDailyDisplayMode] = useState<'grid' | 'row'>('grid');

  // Majors and Classes
  const [majors, setMajors] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');

  // Search & Filter
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);
  });

  // Range for matrix
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);
  });
  const [endDate, setEndDate] = useState(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  });

  // Data states
  const [dailyData, setDailyData] = useState<{
    students: Student[];
    summary: any;
    date?: string;
    date_category?: string;
    date_message?: string;
    latest_record_date?: string | null;
  } | null>(null);
  const [matrixData, setMatrixData] = useState<{ dates: string[]; students: Student[] } | null>(null);
  const [loading, setLoading] = useState(false);

  // Photo modal
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; student: Student; time?: string } | null>(null);

  // Status edit modal
  const [editingStudent, setEditingStudent] = useState<{ student: Student; date: string } | null>(null);
  const [editStatus, setEditStatus] = useState<string>('present');
  const [editRemark, setEditRemark] = useState<string>('');

  // Report Modal
  const [showReportModal, setShowReportModal] = useState(false);
  const [passThreshold, setPassThreshold] = useState(80);

  // 1. Fetch majors list
  useEffect(() => {
    const params: any = {};
    if (activeYear) params.academic_year = activeYear;
    if (activeTerm) params.term = activeTerm;

    axios.get('/api/majors', { params })
      .then(res => {
        const list = res.data || [];
        setMajors(list);
        if (list.length > 0 && (!activeTab || !list.some((m: any) => `${m.level}-${m.year}-${m.major_code}-${m.room}` === activeTab))) {
          const first = list[0];
          setActiveTab(`${first.level}-${first.year}-${first.major_code}-${first.room}`);
        }
      })
      .catch(err => console.error('Failed to fetch majors:', err));
  }, [activeYear, activeTerm]);

  const activeMajor = useMemo(() => {
    if (!activeTab || majors.length === 0) return null;
    return majors.find(m => `${m.level}-${m.year}-${m.major_code}-${m.room}` === activeTab);
  }, [activeTab, majors]);

  // 2. Fetch attendance data based on view mode and active class
  const fetchData = () => {
    if (!activeMajor) return;
    setLoading(true);

    const baseParams: any = {
      level: activeMajor.level,
      year: activeMajor.year,
      major_code: activeMajor.major_code,
      room: activeMajor.room
    };
    if (activeYear) baseParams.academic_year = activeYear;
    if (activeTerm) baseParams.term = activeTerm;

    if (viewMode === 'daily') {
      axios.get('/api/assembly/attendance-daily', {
        params: { ...baseParams, date: selectedDate }
      })
      .then(res => {
        setDailyData(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching daily assembly attendance:', err);
        setLoading(false);
      });
    } else {
      // Matrix or Summary view
      const matrixParams: any = { ...baseParams };
      if (viewMode === 'matrix') {
        matrixParams.start_date = startDate;
        matrixParams.end_date = endDate;
      }
      axios.get('/api/assembly/attendance-matrix', { params: matrixParams })
      .then(res => {
        setMatrixData(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching matrix attendance:', err);
        setLoading(false);
      });
    }
  };

  useEffect(() => {
    fetchData();
  }, [viewMode, activeTab, selectedDate, startDate, endDate, activeYear, activeTerm]);

  // Date shifting helpers - safe date computation without timezone offsets
  const handleShiftDate = (days: number) => {
    const parts = selectedDate.split('-').map(Number);
    if (parts.length !== 3) return;
    const [year, month, day] = parts;
    const current = new Date(year, month - 1, day);
    current.setDate(current.getDate() + days);
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${d}`);
  };

  const handleSetToday = () => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    setSelectedDate(todayStr);
  };

  // Format date to full Thai string
  const formatThaiDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('th-TH', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch (e) {
      return dateStr;
    }
  };

  // Handle manual update of attendance status/remark
  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    try {
      await axios.post('/api/assembly/update-status', {
        student_id: editingStudent.student.student_id,
        date: editingStudent.date,
        status: editStatus,
        remark: editRemark.trim(),
        academic_year: activeYear,
        term: activeTerm
      });
      setEditingStudent(null);
      fetchData();
    } catch (err: any) {
      console.error('Error updating status:', err);
      alert(err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกสถานะ');
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!activeMajor) return;
    const params = new URLSearchParams({
      level: activeMajor.level,
      year: activeMajor.year,
      major_code: activeMajor.major_code,
      room: activeMajor.room
    });
    if (activeYear) params.append('academic_year', activeYear);
    if (activeTerm) params.append('term', activeTerm);
    if (viewMode === 'matrix') {
      params.append('start_date', startDate);
      params.append('end_date', endDate);
    }
    window.open(`/api/assembly/report-export?${params.toString()}`, '_blank');
  };

  // Filtered students by search term
  const filteredDailyStudents = useMemo(() => {
    if (!dailyData?.students) return [];
    if (!search.trim()) return dailyData.students;
    const q = search.trim().toLowerCase();
    return dailyData.students.filter(s =>
      s.student_id.toLowerCase().includes(q) ||
      `${s.prefix || ''}${s.first_name} ${s.last_name}`.toLowerCase().includes(q)
    );
  }, [dailyData, search]);

  const filteredMatrixStudents = useMemo(() => {
    if (!matrixData?.students) return [];
    if (!search.trim()) return matrixData.students;
    const q = search.trim().toLowerCase();
    return matrixData.students.filter(s =>
      s.student_id.toLowerCase().includes(q) ||
      `${s.prefix || ''}${s.first_name} ${s.last_name}`.toLowerCase().includes(q)
    );
  }, [matrixData, search]);

  const getStatusBadge = (status?: string) => {
    if (status === 'present') {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">🟢 ทันเวลา</span>;
    }
    if (status === 'late') {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">🟡 มาสาย</span>;
    }
    if (status === 'leave') {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">🔵 ลา</span>;
    }
    if (status === 'not_reached') {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">⏳ ยังไม่ถึงเวลา</span>;
    }
    if (status === 'weekend') {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">🏖️ วันหยุดสุดสัปดาห์</span>;
    }
    if (status === 'holiday') {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">🎌 วันหยุดนักขัตฤกษ์</span>;
    }
    if (status === 'before_term') {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">📅 ก่อนเปิดภาคเรียน</span>;
    }
    if (status === 'after_term') {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">🏁 ปิดภาคเรียนแล้ว</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">🔴 ขาด</span>;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-hairline pb-4">
        <div>
          <h1 className="text-xl font-bold text-ink">ตารางเช็กชื่อการเข้าแถวหน้าเสาธง</h1>
          <p className="text-xs text-muted">
            ตรวจสอบข้อมูลการเข้าแถวรายวัน ตรวจรูปภาพหลักฐาน รายสัปดาห์ และออกรายงานสรุป (ปี {activeYear || '2569'} / เทอม {activeTerm || '1'})
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-1.5 bg-canvas border border-hairline hover:bg-surface-soft text-ink rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Download size={14} className="text-emerald-600" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="px-3.5 py-1.5 bg-ink hover:bg-black text-canvas rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Printer size={14} />
            <span>ออกรายงาน / พิมพ์</span>
          </button>
        </div>
      </div>

      {/* Class / Major Pill Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {majors.map(m => {
          const key = `${m.level}-${m.year}-${m.major_code}-${m.room}`;
          const isSelected = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                isSelected
                  ? 'bg-ink text-canvas shadow-xs scale-102'
                  : 'bg-surface-soft border border-hairline text-muted hover:text-ink hover:bg-surface-strong'
              }`}
            >
              {m.level} {m.year} • {m.major_code} ({m.room})
            </button>
          );
        })}
      </div>

      {/* Toolbar: Mode switcher + Date + Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-canvas border border-hairline p-3.5 rounded-2xl shadow-xs">
        {/* Left: View Mode Tabs */}
        <div className="flex items-center gap-1 bg-surface-soft p-1 rounded-xl border border-hairline w-fit">
          <button
            type="button"
            onClick={() => setViewMode('daily')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'daily'
                ? 'bg-canvas text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            รายวัน (ดูรูปภาพ)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('matrix')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'matrix'
                ? 'bg-canvas text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            รายสัปดาห์ / เดือน
          </button>
          <button
            type="button"
            onClick={() => setViewMode('summary')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'summary'
                ? 'bg-canvas text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            สรุปทั้งเทอม
          </button>
        </div>

        {/* Center: Date picker with Thai date and quick controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {viewMode === 'daily' ? (
            <div className="flex items-center gap-1.5 bg-surface-soft p-1 rounded-xl border border-hairline text-xs">
              <button
                type="button"
                onClick={() => handleShiftDate(-1)}
                className="p-1.5 hover:bg-canvas rounded text-muted hover:text-ink cursor-pointer"
                title="ย้อนหลัง 1 วัน"
              >
                <ChevronLeft size={14} />
              </button>

              <div className="w-44 sm:w-48">
                <ThaiDatePicker
                  value={selectedDate}
                  onChange={setSelectedDate}
                  size="sm"
                  format="short"
                />
              </div>

              <button
                type="button"
                onClick={() => handleShiftDate(1)}
                className="p-1.5 hover:bg-canvas rounded text-muted hover:text-ink cursor-pointer"
                title="ถัดไป 1 วัน"
              >
                <ChevronRight size={14} />
              </button>

              <button
                type="button"
                onClick={handleSetToday}
                className="px-2 py-1 bg-canvas hover:bg-surface-strong border border-hairline rounded-lg text-[10px] font-bold text-muted hover:text-ink cursor-pointer"
              >
                วันนี้
              </button>
            </div>
          ) : viewMode === 'matrix' ? (
            <div className="flex items-center gap-1.5 bg-surface-soft p-1 rounded-xl border border-hairline text-xs">
              <div className="w-36">
                <ThaiDatePicker
                  value={startDate}
                  onChange={setStartDate}
                  size="sm"
                  format="short"
                />
              </div>
              <span className="text-muted font-bold">-</span>
              <div className="w-36">
                <ThaiDatePicker
                  value={endDate}
                  onChange={setEndDate}
                  size="sm"
                  format="short"
                />
              </div>
            </div>
          ) : null}

          {/* Daily View Toggle: Row vs Grid */}
          {viewMode === 'daily' && (
            <div className="flex items-center gap-1 bg-surface-soft p-1 rounded-xl border border-hairline">
              <button
                type="button"
                onClick={() => setDailyDisplayMode('grid')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  dailyDisplayMode === 'grid'
                    ? 'bg-canvas text-primary shadow-xs'
                    : 'text-muted hover:text-ink'
                }`}
                title="แสดงผลแบบการ์ดรูปภาพ Thumbnail ชัดเจน"
              >
                <LayoutGrid size={13} />
                <span>การ์ดรูปภาพ</span>
              </button>
              <button
                type="button"
                onClick={() => setDailyDisplayMode('row')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  dailyDisplayMode === 'row'
                    ? 'bg-canvas text-primary shadow-xs'
                    : 'text-muted hover:text-ink'
                }`}
                title="แสดงผลแบบตารางแถวมาตรฐาน"
              >
                <TableIcon size={13} />
                <span>ตาราง</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Search Input */}
        <div className="relative w-full sm:w-56">
          <Search size={14} className="absolute left-3 top-2.5 text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อหรือรหัส..."
            className="w-full h-9 pl-9 pr-3 border border-hairline rounded-xl text-xs bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-medium"
          />
        </div>
      </div>

      {/* VIEW 1: DAILY VIEW */}
      {viewMode === 'daily' && (
        <div className="bg-canvas border border-hairline rounded-2xl shadow-xs overflow-hidden space-y-4">
          {/* Date Status Notice Banner */}
          {dailyData?.date_category && dailyData.date_category !== 'normal' && (
            <div className="mx-4 mt-4 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-500/10 border-amber-500/20 text-ink">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg shrink-0">
                  <Calendar size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-xs">{dailyData.date_message || 'วันที่เลือกไม่มีการเข้าแถวตามปกติ'}</h4>
                  <p className="text-[11px] text-muted">ระบบไม่นับว่าเป็นการขาดแถวในวันนี้</p>
                </div>
              </div>
              {dailyData.latest_record_date && dailyData.latest_record_date !== selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(dailyData.latest_record_date!)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold whitespace-nowrap transition-colors shadow-xs cursor-pointer self-start sm:self-auto"
                >
                  ไปยังวันล่าสุดที่มีข้อมูล ({formatThaiDate(dailyData.latest_record_date)})
                </button>
              )}
            </div>
          )}

          {/* Summary Stat Bar */}
          {dailyData?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-hairline border-b border-hairline bg-surface-soft/40 text-center py-3 text-xs">
              <div>
                <span className="text-muted block text-[10px]">นักศึกษาทั้งหมด</span>
                <span className="font-extrabold text-ink font-mono text-sm">{dailyData.summary.total} คน</span>
              </div>
              <div>
                <span className="text-muted block text-[10px]">ทันเวลา</span>
                <span className="font-extrabold text-emerald-600 font-mono text-sm">{dailyData.summary.present} คน</span>
              </div>
              <div>
                <span className="text-muted block text-[10px]">มาสาย</span>
                <span className="font-extrabold text-amber-600 font-mono text-sm">{dailyData.summary.late} คน</span>
              </div>
              <div>
                <span className="text-muted block text-[10px]">ลา</span>
                <span className="font-extrabold text-sky-600 font-mono text-sm">{dailyData.summary.leave} คน</span>
              </div>
              <div>
                <span className="text-muted block text-[10px]">ขาดแถว</span>
                <span className="font-extrabold text-rose-600 font-mono text-sm">{dailyData.summary.absent} คน</span>
              </div>
            </div>
          )}

          {/* Sub-view: GRID CARDS (Thumbnail Focus) */}
          {dailyDisplayMode === 'grid' ? (
            <div className="p-4">
              {loading ? (
                <div className="py-16 text-center text-muted text-xs font-semibold">กำลังโหลดข้อมูล...</div>
              ) : filteredDailyStudents.length === 0 ? (
                <div className="py-16 text-center text-muted text-xs font-semibold">ไม่พบข้อมูลนักศึกษา</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredDailyStudents.map((s, idx) => {
                    return (
                      <div
                        key={s.student_id}
                        className="bg-canvas border border-hairline rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col group"
                      >
                        {/* Photo Thumbnail Area */}
                        <div className="relative h-48 bg-surface-soft overflow-hidden flex items-center justify-center border-b border-hairline">
                          {s.photo_path ? (
                            <>
                              <img
                                src={s.photo_path}
                                alt={`รูปของ ${s.first_name}`}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer"
                                onClick={() => setSelectedPhoto({ url: s.photo_path!, student: s, time: s.attended_at || '' })}
                              />
                              <button
                                type="button"
                                onClick={() => setSelectedPhoto({ url: s.photo_path!, student: s, time: s.attended_at || '' })}
                                className="absolute bottom-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-xs transition-colors cursor-pointer"
                                title="ดูภาพขนาดเต็ม"
                              >
                                <Eye size={13} />
                              </button>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-muted-soft gap-1.5 p-4 text-center">
                              <CameraOff size={28} className="opacity-40" />
                              <span className="text-[10px]">ไม่มีภาพถ่ายหลักฐาน</span>
                            </div>
                          )}

                          {/* Status Badge Float */}
                          <div className="absolute top-2 left-2">
                            {getStatusBadge(s.status)}
                          </div>

                          {/* Index Pill */}
                          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-xs text-[10px] font-mono font-bold text-white">
                            #{idx + 1}
                          </div>
                        </div>

                        {/* Card Content Details */}
                        <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                          <div className="space-y-1">
                            <span className="font-mono text-[11px] font-bold text-muted block tracking-wide">
                              {s.student_id}
                            </span>
                            <h4 className="font-bold text-xs text-ink line-clamp-1">
                              {s.prefix || ''}{s.first_name} {s.last_name}
                            </h4>
                            <span className="text-[10px] text-muted block">
                              {s.level} {s.year} • {s.major_name} (ห้อง {s.room})
                            </span>
                          </div>

                          <div className="space-y-1 pt-2 border-t border-hairline text-[11px]">
                            <div className="flex items-center justify-between text-muted">
                              <span className="flex items-center gap-1">
                                <Clock size={11} className="text-primary" />
                                <span>เวลาเช็ก:</span>
                              </span>
                              <span className="font-mono font-bold text-ink">
                                {s.attended_at
                                  ? `${new Date(s.attended_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
                                  : '-'}
                              </span>
                            </div>

                            {s.matched_location && (
                              <div className="flex items-center justify-between text-muted text-[10px]">
                                <span className="flex items-center gap-1">
                                  <MapPin size={10} className="text-primary" />
                                  <span>จุดเช็ก:</span>
                                </span>
                                <span className="font-medium text-ink truncate max-w-[120px]" title={s.matched_location}>
                                  {s.matched_location}
                                </span>
                              </div>
                            )}

                            {s.remark && (
                              <div className="text-[10px] text-muted-soft italic truncate" title={s.remark}>
                                หมายเหตุ: {s.remark}
                              </div>
                            )}
                          </div>

                          {/* Card Action Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStudent({ student: s, date: selectedDate });
                              setEditStatus(s.status || 'present');
                              setEditRemark(s.remark || '');
                            }}
                            className="w-full py-1.5 bg-surface-soft hover:bg-surface-strong border border-hairline rounded-xl text-xs font-bold text-muted hover:text-ink flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Edit3 size={12} />
                            <span>ปรับสถานะ</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Sub-view: ROW TABLE */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-soft border-b border-hairline text-muted font-bold">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">ลำดับ</th>
                    <th className="py-3 px-4 w-32">รหัสนักศึกษา</th>
                    <th className="py-3 px-4">ชื่อ - นามสกุล</th>
                    <th className="py-3 px-4 text-center w-28">สถานะ</th>
                    <th className="py-3 px-4 text-center w-24">เวลาที่เช็ก</th>
                    <th className="py-3 px-4 text-center w-24">รูปหลักฐาน</th>
                    <th className="py-3 px-4">จุดที่เช็ก / หมายเหตุ</th>
                    <th className="py-3 px-4 text-center w-28">ปรับสถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-muted">กำลังโหลดข้อมูล...</td>
                    </tr>
                  ) : filteredDailyStudents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-muted">ไม่พบข้อมูลนักศึกษา</td>
                    </tr>
                  ) : (
                    filteredDailyStudents.map((s, idx) => (
                      <tr key={s.student_id} className="hover:bg-surface-soft/40 transition-colors">
                        <td className="py-3 px-4 text-center font-mono text-muted">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono font-bold text-ink">{s.student_id}</td>
                        <td className="py-3 px-4 font-semibold text-ink">
                          {s.prefix || ''}{s.first_name} {s.last_name}
                        </td>
                        <td className="py-3 px-4 text-center">{getStatusBadge(s.status)}</td>
                        <td className="py-3 px-4 text-center font-mono text-muted text-[11px]">
                          {s.attended_at
                            ? `${new Date(s.attended_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
                            : '-'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {s.photo_path ? (
                            <button
                              type="button"
                              onClick={() => setSelectedPhoto({ url: s.photo_path!, student: s, time: s.attended_at || '' })}
                              className="px-2 py-1 bg-surface-soft hover:bg-primary hover:text-white rounded border border-hairline text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Eye size={12} />
                              <span>ดูรูป</span>
                            </button>
                          ) : (
                            <span className="text-muted-soft text-[11px]">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-muted text-[11px]">
                          {s.matched_location && <span className="text-ink font-medium">{s.matched_location}</span>}
                          {s.remark && <span className="block text-muted-soft italic">{s.remark}</span>}
                          {!s.matched_location && !s.remark && '-'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStudent({ student: s, date: selectedDate });
                              setEditStatus(s.status || 'present');
                              setEditRemark(s.remark || '');
                            }}
                            className="px-2 py-1 bg-canvas hover:bg-surface-soft border border-hairline rounded text-[11px] font-bold text-muted hover:text-ink transition-colors cursor-pointer"
                          >
                            แก้ไข
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2 & 3: MATRIX & SUMMARY VIEW */}
      {(viewMode === 'matrix' || viewMode === 'summary') && (
        <div className="bg-canvas border border-hairline rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-soft border-b border-hairline text-muted font-bold">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">ลำดับ</th>
                  <th className="py-3 px-4 w-28">รหัสนักศึกษา</th>
                  <th className="py-3 px-4 min-w-[140px]">ชื่อ - นามสกุล</th>
                  
                  {/* Dynamic Date Columns for Matrix */}
                  {viewMode === 'matrix' && matrixData?.dates.map(d => {
                    const dateObj = new Date(d);
                    const dayName = dateObj.toLocaleDateString('th-TH', { weekday: 'short' });
                    const dayNum = dateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'numeric' });
                    return (
                      <th key={d} className="py-2 px-2 text-center min-w-[42px] border-l border-hairline">
                        <span className="block text-[10px] text-muted">{dayName}</span>
                        <span className="block font-mono text-ink text-[11px]">{dayNum}</span>
                      </th>
                    );
                  })}

                  <th className="py-3 px-3 text-center w-14 bg-surface-soft/80 border-l border-hairline">มา</th>
                  <th className="py-3 px-3 text-center w-14 bg-surface-soft/80 border-l border-hairline">สาย</th>
                  <th className="py-3 px-3 text-center w-14 bg-surface-soft/80 border-l border-hairline">ลา</th>
                  <th className="py-3 px-3 text-center w-14 bg-surface-soft/80 border-l border-hairline">ขาด</th>
                  <th className="py-3 px-4 text-center w-20 bg-surface-soft/80 border-l border-hairline">ร้อยละ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-muted">กำลังโหลดข้อมูล...</td>
                  </tr>
                ) : filteredMatrixStudents.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-muted">ไม่พบข้อมูลนักศึกษา</td>
                  </tr>
                ) : (
                  filteredMatrixStudents.map((s, idx) => {
                    const stats = s.stats || { present: 0, late: 0, leave: 0, absent: 0, rate: 0 };
                    return (
                      <tr key={s.student_id} className="hover:bg-surface-soft/40 transition-colors">
                        <td className="py-3 px-4 text-center font-mono text-muted">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono font-bold text-ink">{s.student_id}</td>
                        <td className="py-3 px-4 font-semibold text-ink whitespace-nowrap">
                          {s.prefix || ''}{s.first_name} {s.last_name}
                        </td>

                        {viewMode === 'matrix' && matrixData?.dates.map(d => {
                          const item = s.attendance?.[d];
                          const st = item?.status;
                          return (
                            <td key={d} className="py-2 px-1 text-center border-l border-hairline">
                              {st === 'present' ? (
                                <span className="inline-block w-6 h-6 leading-6 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px]">✓</span>
                              ) : st === 'late' ? (
                                <span className="inline-block w-6 h-6 leading-6 rounded-full bg-amber-50 text-amber-700 font-bold text-[10px]">ส</span>
                              ) : st === 'leave' ? (
                                <span className="inline-block w-6 h-6 leading-6 rounded-full bg-sky-50 text-sky-700 font-bold text-[10px]">ล</span>
                              ) : (
                                <span className="inline-block w-6 h-6 leading-6 rounded-full bg-rose-50 text-rose-600 font-bold text-[10px]">✕</span>
                              )}
                            </td>
                          );
                        })}

                        <td className="py-3 px-3 text-center font-mono font-bold text-emerald-600 border-l border-hairline">{stats.present}</td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-amber-600 border-l border-hairline">{stats.late}</td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-sky-600 border-l border-hairline">{stats.leave}</td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-rose-600 border-l border-hairline">{stats.absent}</td>
                        <td className="py-3 px-4 text-center font-mono font-extrabold text-ink border-l border-hairline">
                          <span className={stats.rate >= 80 ? 'text-emerald-600' : 'text-rose-600'}>
                            {stats.rate}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Photo Lightbox Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative bg-canvas border border-hairline rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-hairline flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-ink">
                  รูปถ่ายเข้าแถว: {selectedPhoto.student.prefix || ''}{selectedPhoto.student.first_name} {selectedPhoto.student.last_name}
                </h3>
                <span className="text-xs text-muted font-mono">{selectedPhoto.student.student_id}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="w-8 h-8 rounded-full border border-hairline flex items-center justify-center hover:bg-surface-soft text-muted hover:text-ink cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 flex items-center justify-center bg-black/5">
              <img
                src={selectedPhoto.url}
                alt="ภาพถ่ายเช็กชื่อ"
                className="max-h-[65vh] w-auto object-contain rounded-xl shadow-md"
              />
            </div>

            <div className="p-3 bg-surface-soft border-t border-hairline text-center text-xs text-muted flex items-center justify-around">
              <span>เวลาที่บันทึก: {selectedPhoto.time ? `${new Date(selectedPhoto.time).toLocaleTimeString('th-TH')} น.` : '-'}</span>
              <span>สถานะ: {getStatusBadge(selectedPhoto.student.status)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Manual Status Edit Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-canvas border border-hairline rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-hairline flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-ink">ปรับสถานะการเข้าแถว (ผู้ดูแลระบบ)</h3>
                <span className="text-xs text-muted">
                  {editingStudent.student.prefix || ''}{editingStudent.student.first_name} {editingStudent.student.last_name} ({editingStudent.student.student_id})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="w-8 h-8 rounded-full border border-hairline flex items-center justify-center hover:bg-surface-soft text-muted hover:text-ink cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveStatus} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink">วันที่</label>
                <input
                  type="date"
                  disabled
                  value={editingStudent.date}
                  className="w-full h-9 border border-hairline rounded-lg px-3 bg-surface-soft text-muted text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink">เลือกสถานะ</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                    editStatus === 'present' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-hairline bg-canvas text-ink'
                  }`}>
                    <input
                      type="radio"
                      name="status"
                      value="present"
                      checked={editStatus === 'present'}
                      onChange={() => setEditStatus('present')}
                    />
                    <span>🟢 ทันเวลา</span>
                  </label>

                  <label className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                    editStatus === 'late' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-hairline bg-canvas text-ink'
                  }`}>
                    <input
                      type="radio"
                      name="status"
                      value="late"
                      checked={editStatus === 'late'}
                      onChange={() => setEditStatus('late')}
                    />
                    <span>🟡 มาสาย</span>
                  </label>

                  <label className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                    editStatus === 'leave' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-hairline bg-canvas text-ink'
                  }`}>
                    <input
                      type="radio"
                      name="status"
                      value="leave"
                      checked={editStatus === 'leave'}
                      onChange={() => setEditStatus('leave')}
                    />
                    <span>🔵 ลา</span>
                  </label>

                  <label className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                    editStatus === 'absent' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-hairline bg-canvas text-ink'
                  }`}>
                    <input
                      type="radio"
                      name="status"
                      value="absent"
                      checked={editStatus === 'absent'}
                      onChange={() => setEditStatus('absent')}
                    />
                    <span>🔴 ขาด</span>
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink">หมายเหตุเพิ่มเติม</label>
                <input
                  type="text"
                  placeholder="เช่น ลากิจมีใบรับรอง, เข้าแถวสายเนื่องจากฝนตก"
                  value={editRemark}
                  onChange={e => setEditRemark(e.target.value)}
                  className="w-full h-9 border border-hairline rounded-lg px-3 bg-canvas text-ink text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 border border-hairline rounded-lg text-xs font-bold hover:bg-surface-soft transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary-active transition-colors cursor-pointer shadow-xs"
                >
                  บันทึกสถานะ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF Print Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="bg-canvas border border-hairline rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-4 border-b border-hairline flex items-center justify-between bg-surface-soft">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-primary" />
                <h3 className="font-bold text-sm text-ink">พิมพ์รายงานสรุปการเข้าแถว (มาตรฐาน A4)</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary-active flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Printer size={13} />
                  <span>พิมพ์ทันที</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="w-8 h-8 rounded-full border border-hairline flex items-center justify-center hover:bg-surface-soft text-muted hover:text-ink cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Threshold Option */}
            <div className="p-3 bg-canvas border-b border-hairline flex items-center justify-between text-xs px-6">
              <span className="text-muted">กำหนดเกณฑ์ผ่านการประเมิน (ร้อยละ):</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={50}
                  max={100}
                  value={passThreshold}
                  onChange={e => setPassThreshold(parseInt(e.target.value, 10) || 80)}
                  className="w-16 h-8 border border-hairline rounded px-2 text-center font-bold text-xs"
                />
                <span className="font-bold text-ink">%</span>
              </div>
            </div>

            {/* Printable Preview Page */}
            <div className="p-6 overflow-y-auto bg-gray-100 flex-1 flex justify-center">
              <div className="bg-white text-black p-8 rounded-lg shadow-md w-full max-w-[210mm] min-h-[297mm] text-xs font-sans space-y-4">
                <div className="text-center space-y-1 border-b border-gray-300 pb-4">
                  <h2 className="text-lg font-bold">แบบสรุปประเมินผลการเข้าร่วมกิจกรรมเข้าแถวหน้าเสาธง</h2>
                  <p className="text-xs text-gray-700">
                    กลุ่มเรียน: {activeMajor?.level} {activeMajor?.year} สาขาวิชา: {activeMajor?.major_name} ห้อง {activeMajor?.room} • ปีการศึกษา {activeYear || '2569'} / เทอม {activeTerm || '1'}
                  </p>
                  <p className="text-xs text-gray-600">
                    เกณฑ์การประเมิน: ผ่านไม่น้อยกว่าร้อยละ {passThreshold} • ข้อมูล ณ วันที่ {new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}
                  </p>
                </div>

                <table className="w-full text-left text-xs border-collapse border border-gray-400">
                  <thead>
                    <tr className="bg-gray-100 text-black font-bold">
                      <th className="p-2 border border-gray-400 text-center w-10">ลำดับ</th>
                      <th className="p-2 border border-gray-400 w-28 text-center">รหัสนักศึกษา</th>
                      <th className="p-2 border border-gray-400 min-w-[140px]">ชื่อ - นามสกุล</th>
                      <th className="p-2 border border-gray-400 text-center w-16">วันทั้งหมด</th>
                      <th className="p-2 border border-gray-400 text-center w-14">ทันเวลา</th>
                      <th className="p-2 border border-gray-400 text-center w-14">สาย</th>
                      <th className="p-2 border border-gray-400 text-center w-14">ลา</th>
                      <th className="p-2 border border-gray-400 text-center w-14">ขาด</th>
                      <th className="p-2 border border-gray-400 text-center w-16">ร้อยละ</th>
                      <th className="p-2 border border-gray-400 text-center w-20">ผลประเมิน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMatrixStudents.map((s, idx) => {
                      const stats = s.stats || { totalDays: 0, present: 0, late: 0, leave: 0, absent: 0, rate: 0 };
                      const isPass = stats.rate >= passThreshold;
                      return (
                        <tr key={s.student_id}>
                          <td className="p-2 border border-gray-400 text-center font-mono">{idx + 1}</td>
                          <td className="p-2 border border-gray-400 text-center font-mono font-bold">{s.student_id}</td>
                          <td className="p-2 border border-gray-400 font-medium whitespace-nowrap">
                            {s.prefix || ''}{s.first_name} {s.last_name}
                          </td>
                          <td className="p-2 border border-gray-400 text-center font-mono">{stats.totalDays}</td>
                          <td className="p-2 border border-gray-400 text-center font-mono">{stats.present}</td>
                          <td className="p-2 border border-gray-400 text-center font-mono">{stats.late}</td>
                          <td className="p-2 border border-gray-400 text-center font-mono">{stats.leave}</td>
                          <td className="p-2 border border-gray-400 text-center font-mono">{stats.absent}</td>
                          <td className="p-2 border border-gray-400 text-center font-bold font-mono">{stats.rate}%</td>
                          <td className="p-2 border border-gray-400 text-center font-bold">
                            {isPass ? 'ผ่าน' : 'ไม่ผ่าน'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Signatures */}
                <div className="signature-section flex justify-between mt-8 pt-4 text-xs">
                  <div className="signature-box text-center w-48">
                    <p className="mb-12">ลงชื่อ......................................................</p>
                    <p>(......................................................)</p>
                    <p className="text-gray-600">ครูที่ปรึกษา / ผู้บันทึก</p>
                  </div>
                  <div className="signature-box text-center w-48">
                    <p className="mb-12">ลงชื่อ......................................................</p>
                    <p>(......................................................)</p>
                    <p className="text-gray-600">หัวหน้างานกิจกรรมนักเรียนนักศึกษา</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
