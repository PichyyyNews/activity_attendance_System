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
  Clock,
  Layers,
  UserX,
  RotateCcw,
  Camera,
  CheckCircle2,
  SlidersHorizontal,
  GraduationCap
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
  attended_at?: string;
  photo_path?: string | null;
  matched_location?: string;
  remark?: string;
  lat?: number | null;
  lng?: number | null;
}

interface AssemblyAttendanceProps {
  activeYear?: string;
  activeTerm?: string;
}

function AttendanceCardPhoto({
  photoPath,
  firstName,
  onView,
}: {
  photoPath?: string | null;
  firstName: string;
  onView: () => void;
}) {
  const [loadError, setLoadError] = useState(false);

  if (!photoPath || loadError) {
    return (
      <div className="flex flex-col items-center justify-center text-muted-soft gap-1.5 p-4 text-center bg-surface-soft w-full h-full">
        <CameraOff size={24} className="opacity-40" />
        <span className="text-[10px]">
          {loadError ? 'ไม่สามารถโหลดภาพได้' : 'ไม่ได้แนบภาพถ่าย'}
        </span>
      </div>
    );
  }

  return (
    <>
      <img
        src={photoPath}
        alt=""
        onError={() => setLoadError(true)}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer"
        onClick={onView}
      />
      <button
        type="button"
        onClick={onView}
        className="absolute bottom-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg backdrop-blur-xs transition-colors cursor-pointer z-10"
        title={`ดูภาพขนาดเต็มของ ${firstName}`}
      >
        <Eye size={13} />
      </button>
    </>
  );
}

export default function AssemblyAttendance({ activeYear: propYear, activeTerm: propTerm }: AssemblyAttendanceProps) {
  const outletCtx = useOutletContext<{ activeYear?: string; activeTerm?: string }>() || {};
  const activeYear = propYear || outletCtx.activeYear;
  const activeTerm = propTerm || outletCtx.activeTerm;

  const [viewMode, setViewMode] = useState<'daily' | 'matrix' | 'summary'>('daily');
  const [dailyDisplayMode, setDailyDisplayMode] = useState<'grid' | 'row'>('grid');

  // Majors database list
  const [majors, setMajors] = useState<any[]>([]);

  // Detailed Filter States
  const [selectedLevel, setSelectedLevel] = useState<string>(''); // '' = all, 'ปวช', 'ปวส'
  const [selectedYear, setSelectedYear] = useState<string>(''); // '' = all, '1', '2', '3', '4'
  const [selectedMajorCode, setSelectedMajorCode] = useState<string>(''); // '' = all
  const [selectedRoom, setSelectedRoom] = useState<string>(''); // '' = all
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'leave' | 'absent' | 'exempted'>('all');
  const [photoFilter, setPhotoFilter] = useState<'all' | 'has_photo' | 'no_photo'>('all');
  const [search, setSearch] = useState('');

  // Date selection
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
    const d = new Date();
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);
  });

  // Attendance Data
  const [dailyData, setDailyData] = useState<{
    students: Student[];
    summary: { total: number; present: number; late: number; leave: number; absent: number; exempted?: number; rate?: number };
    date_category?: string;
    date_message?: string;
    latest_record_date?: string;
  } | null>(null);

  const [matrixData, setMatrixData] = useState<{
    students: any[];
    dates: string[];
    summary?: any;
  } | null>(null);

  const [loading, setLoading] = useState(false);

  // Photo modal
  const [photoModal, setPhotoModal] = useState<{
    open: boolean;
    url: string;
    student?: Student;
    time?: string;
  }>({ open: false, url: '' });

  const openPhotoModal = (data: { url: string; student?: Student; time?: string }) => {
    setPhotoModal({ open: true, ...data });
  };

  const closePhotoModal = () => {
    setPhotoModal({ open: false, url: '' });
  };

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
        setMajors(res.data || []);
      })
      .catch(err => console.error('Error fetching majors:', err));
  }, [activeYear, activeTerm]);

  // Derived options for filters
  const availableLevels = useMemo(() => {
    const set = new Set<string>();
    majors.forEach(m => { if (m.level) set.add(m.level); });
    return Array.from(set);
  }, [majors]);

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    majors.forEach(m => {
      if (!selectedLevel || m.level === selectedLevel) {
        if (m.year) set.add(m.year);
      }
    });
    return Array.from(set).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [majors, selectedLevel]);

  const availableMajors = useMemo(() => {
    const map = new Map<string, string>();
    majors.forEach(m => {
      if ((!selectedLevel || m.level === selectedLevel) && (!selectedYear || m.year === selectedYear)) {
        if (m.major_code) map.set(m.major_code, m.major_name || m.major_code);
      }
    });
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [majors, selectedLevel, selectedYear]);

  const availableRooms = useMemo(() => {
    const set = new Set<string>();
    majors.forEach(m => {
      if (
        (!selectedLevel || m.level === selectedLevel) &&
        (!selectedYear || m.year === selectedYear) &&
        (!selectedMajorCode || m.major_code === selectedMajorCode)
      ) {
        if (m.room) set.add(m.room);
      }
    });
    return Array.from(set).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [majors, selectedLevel, selectedYear, selectedMajorCode]);

  // 2. Fetch Attendance Data with Multi-level Filters
  const fetchAttendance = () => {
    setLoading(true);

    const params: any = {
      academic_year: activeYear,
      term: activeTerm
    };
    if (selectedLevel) params.level = selectedLevel;
    if (selectedYear) params.year = selectedYear;
    if (selectedMajorCode) params.major_code = selectedMajorCode;
    if (selectedRoom) params.room = selectedRoom;

    if (viewMode === 'daily') {
      params.date = selectedDate;
      axios.get('/api/assembly/attendance-daily', { params })
        .then(res => setDailyData(res.data))
        .catch(err => {
          console.error('Error fetching daily attendance:', err);
          setDailyData(null);
        })
        .finally(() => setLoading(false));
    } else {
      if (viewMode === 'matrix') {
        params.startDate = startDate;
        params.endDate = endDate;
      } else {
        params.all = true;
      }

      axios.get('/api/assembly/attendance-matrix', { params })
        .then(res => setMatrixData(res.data))
        .catch(err => {
          console.error('Error fetching attendance matrix:', err);
          setMatrixData(null);
        })
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [
    selectedLevel,
    selectedYear,
    selectedMajorCode,
    selectedRoom,
    viewMode,
    selectedDate,
    startDate,
    endDate,
    activeYear,
    activeTerm
  ]);

  // Quick Date Shift for Daily View
  const handleShiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    const next = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);
    setSelectedDate(next);
  };

  const handleSetToday = () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    setSelectedDate(today);
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSelectedLevel('');
    setSelectedYear('');
    setSelectedMajorCode('');
    setSelectedRoom('');
    setStatusFilter('all');
    setPhotoFilter('all');
    setSearch('');
  };

  const isFiltered = Boolean(
    selectedLevel ||
    selectedYear ||
    selectedMajorCode ||
    selectedRoom ||
    statusFilter !== 'all' ||
    photoFilter !== 'all' ||
    search.trim()
  );

  // Manual Status Edit Submission
  const handleSaveStatus = async () => {
    if (!editingStudent) return;
    try {
      await axios.post('/api/assembly/attendance/manual-edit', {
        student_id: editingStudent.student.student_id,
        date: editingStudent.date,
        status: editStatus,
        remark: editRemark
      });

      // Refresh view
      fetchAttendance();
      setEditingStudent(null);
    } catch (err) {
      console.error('Error saving manual status:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกสถานะ');
    }
  };

  // Format Thai Date string
  const formatThaiDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const date = new Date(year, month, day);
        return date.toLocaleDateString('th-TH', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
    } catch (e) {
      console.error(e);
    }
    return dateStr;
  };

  // Export CSV
  const handleExportCSV = () => {
    if (viewMode === 'daily') {
      if (!dailyData?.students || dailyData.students.length === 0) {
        alert('ไม่มีข้อมูลสำหรับส่งออก');
        return;
      }
      let csv = '\uFEFFลำดับ,รหัสนักศึกษา,คำนำหน้า,ชื่อ,นามสกุล,ระดับชั้น,สาขา,ห้อง,สถานะ,เวลาเข้าแถว,พิกัด/สถานที่,หมายเหตุ\n';
      dailyData.students.forEach((s, idx) => {
        const statusMap: Record<string, string> = {
          present: 'ทันเวลา',
          late: 'มาสาย',
          leave: 'ลา',
          absent: 'ขาด',
          exempted: 'ไม่มีแถว/สลับวัน',
          not_reached: 'ยังไม่ถึงเวลา',
          holiday: 'วันหยุด',
          weekend: 'วันหยุด'
        };
        const statusText = statusMap[s.status || 'absent'] || s.status;
        const timeText = s.attended_at ? new Date(s.attended_at).toLocaleTimeString('th-TH') : '';
        csv += `${idx + 1},"${s.student_id}","${s.prefix || ''}","${s.first_name}","${s.last_name}","${s.level} ${s.year}","${s.major_name}","${s.room}","${statusText}","${timeText}","${s.matched_location || ''}","${s.remark || ''}"\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `เช็กชื่อเข้าแถว_${selectedLevel || 'ทุกระดับ'}_${selectedYear ? 'ปี' + selectedYear : ''}_${selectedMajorCode || 'ทุกสาขา'}_${selectedDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      if (!matrixData?.students || matrixData.students.length === 0) {
        alert('ไม่มีข้อมูลสำหรับส่งออก');
        return;
      }
      let csv = '\uFEFFลำดับ,รหัสนักศึกษา,คำนำหน้า,ชื่อ,นามสกุล,ระดับชั้น,สาขา,ห้อง,';
      if (viewMode === 'matrix' && matrixData.dates) {
        csv += matrixData.dates.join(',') + ',';
      }
      csv += 'มาทัน,มาสาย,ลา,ขาด,รวมวันเปิดแถว,ร้อยละการเข้าแถว,ผลการประเมิน\n';

      matrixData.students.forEach((s, idx) => {
        const stats = s.stats || {};
        const percent = stats.rate_percent || 0;
        const passed = percent >= passThreshold ? 'ผ่าน' : 'ไม่ผ่าน';

        csv += `${idx + 1},"${s.student_id}","${s.prefix || ''}","${s.first_name}","${s.last_name}","${s.level} ${s.year}","${s.major_name}","${s.room}",`;
        if (viewMode === 'matrix' && matrixData.dates) {
          matrixData.dates.forEach(d => {
            const att = s.attendance_map?.[d];
            const statusMap: Record<string, string> = {
              present: 'ทัน',
              late: 'สาย',
              leave: 'ลา',
              absent: 'ขาด',
              exempted: 'สลับวัน',
              holiday: 'หยุด',
              weekend: 'วันหยุด'
            };
            csv += `"${att?.status ? statusMap[att.status] || att.status : '-'}",`;
          });
        }
        csv += `${stats.present_days || 0},${stats.late_days || 0},${stats.leave_days || 0},${stats.absent_days || 0},${stats.total_school_days || 0},${percent}%,${passed}\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `สรุปการเข้าแถว_${selectedLevel || 'ทุกระดับ'}_${selectedYear ? 'ปี' + selectedYear : ''}_${selectedMajorCode || 'ทุกสาขา'}_${viewMode}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Filter students by search, status, and photo
  const filteredDailyStudents = useMemo(() => {
    if (!dailyData?.students) return [];
    let list = dailyData.students;

    // Status filter
    if (statusFilter !== 'all') {
      list = list.filter(s => s.status === statusFilter);
    }

    // Photo evidence filter
    if (photoFilter === 'has_photo') {
      list = list.filter(s => Boolean(s.photo_path && s.status !== 'absent'));
    } else if (photoFilter === 'no_photo') {
      list = list.filter(s => !s.photo_path || s.status === 'absent');
    }

    // Search query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(s =>
        s.student_id.toLowerCase().includes(q) ||
        `${s.prefix || ''}${s.first_name} ${s.last_name}`.toLowerCase().includes(q)
      );
    }
    return list;
  }, [dailyData, search, statusFilter, photoFilter]);

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
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>ทันเวลา</span>
        </span>
      );
    }
    if (status === 'late') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span>มาสาย</span>
        </span>
      );
    }
    if (status === 'leave') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
          <span>ลา</span>
        </span>
      );
    }
    if (status === 'exempted') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
          <Calendar size={11} className="text-slate-500" />
          <span>ไม่มีแถว / สลับวัน</span>
        </span>
      );
    }
    if (status === 'not_reached') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
          <Clock size={11} className="text-slate-500" />
          <span>ยังไม่ถึงเวลา</span>
        </span>
      );
    }
    if (status === 'weekend') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
          <span>วันหยุดสุดสัปดาห์</span>
        </span>
      );
    }
    if (status === 'holiday') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Calendar size={11} className="text-amber-600" />
          <span>วันหยุดนักขัตฤกษ์</span>
        </span>
      );
    }
    if (status === 'before_term') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          <span>ก่อนเปิดภาคเรียน</span>
        </span>
      );
    }
    if (status === 'after_term') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          <span>ปิดภาคเรียนแล้ว</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        <span>ขาด</span>
      </span>
    );
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-16 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-hairline pb-4">
        <div>
          <h1 className="text-xl font-bold text-ink">ตารางเช็กชื่อการเข้าแถวหน้าเสาธง</h1>
          <p className="text-xs text-muted mt-0.5">
            ปีการศึกษา {activeYear || '2569'} / เทอม {activeTerm || '1'} • คัดกรองละเอียดตามระดับชั้น, ชั้นปี, แผนกวิชา, ห้องเรียน, และสถานะรูปถ่าย
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportCSV}
            className="h-9 px-3 bg-canvas border border-hairline hover:bg-surface-soft text-ink rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Download size={13} className="text-emerald-600" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="h-9 px-3.5 bg-ink hover:bg-black text-canvas rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Printer size={13} />
            <span>ออกรายงาน / พิมพ์</span>
          </button>
        </div>
      </div>

      {/* Comprehensive Filter & Toolbar Panel */}
      <div className="bg-canvas border border-hairline rounded-xl p-3.5 shadow-2xs space-y-3">
        {/* Row 1: Mode Switcher + Level Pills + Year Pills */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* View Mode Tabs */}
          <div className="flex items-center gap-1 bg-surface-soft p-1 rounded-lg border border-hairline shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'daily'
                  ? 'bg-canvas text-ink shadow-xs'
                  : 'text-muted hover:text-ink'
              }`}
            >
              รายวัน (ดูภาพถ่าย)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
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
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'summary'
                  ? 'bg-canvas text-ink shadow-xs'
                  : 'text-muted hover:text-ink'
              }`}
            >
              สรุปทั้งภาคเรียน
            </button>
          </div>

          {/* Hierarchical Class Filters: Level + Year */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Level Selector */}
            <div className="flex items-center gap-1 bg-surface-soft p-0.5 rounded-lg border border-hairline text-xs">
              <button
                type="button"
                onClick={() => {
                  setSelectedLevel('');
                  setSelectedYear('');
                  setSelectedMajorCode('');
                  setSelectedRoom('');
                }}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  selectedLevel === ''
                    ? 'bg-canvas text-ink shadow-xs'
                    : 'text-muted hover:text-ink'
                }`}
              >
                ทุกระดับ
              </button>
              {availableLevels.map(lvl => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => {
                    setSelectedLevel(lvl);
                    setSelectedYear('');
                    setSelectedMajorCode('');
                    setSelectedRoom('');
                  }}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    selectedLevel === lvl
                      ? 'bg-canvas text-ink shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            {/* Year Selector */}
            {availableYears.length > 0 && (
              <div className="flex items-center gap-1 bg-surface-soft p-0.5 rounded-lg border border-hairline text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedYear('');
                    setSelectedRoom('');
                  }}
                  className={`px-2 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    selectedYear === ''
                      ? 'bg-canvas text-ink shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  ทุกชั้นปี
                </button>
                {availableYears.map(yr => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => {
                      setSelectedYear(yr);
                      setSelectedRoom('');
                    }}
                    className={`px-2 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                      selectedYear === yr
                        ? 'bg-canvas text-ink shadow-xs'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    ปี {yr}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Major Dropdown + Room Dropdown + Photo Filter + Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-hairline">
          {/* Major / Department Select */}
          <div className="flex items-center gap-1.5 bg-surface-soft px-2.5 py-1 rounded-lg border border-hairline text-xs">
            <GraduationCap size={14} className="text-muted shrink-0" />
            <span className="text-muted text-[11px] font-medium shrink-0">แผนก:</span>
            <select
              value={selectedMajorCode}
              onChange={e => {
                setSelectedMajorCode(e.target.value);
                setSelectedRoom('');
              }}
              className="bg-transparent font-semibold text-ink text-xs focus:outline-none cursor-pointer w-full truncate"
            >
              <option value="">ทุกแผนกวิชา ({availableMajors.length})</option>
              {availableMajors.map(m => (
                <option key={m.code} value={m.code}>
                  {m.name} ({m.code})
                </option>
              ))}
            </select>
          </div>

          {/* Room Select */}
          <div className="flex items-center gap-1.5 bg-surface-soft px-2.5 py-1 rounded-lg border border-hairline text-xs">
            <Layers size={14} className="text-muted shrink-0" />
            <span className="text-muted text-[11px] font-medium shrink-0">ห้อง:</span>
            <select
              value={selectedRoom}
              onChange={e => setSelectedRoom(e.target.value)}
              className="bg-transparent font-semibold text-ink text-xs focus:outline-none cursor-pointer w-full truncate"
            >
              <option value="">ทุกห้องเรียน</option>
              {availableRooms.map(r => (
                <option key={r} value={r}>
                  ห้อง {r}
                </option>
              ))}
            </select>
          </div>

          {/* Photo Evidence Filter (Daily mode only) */}
          {viewMode === 'daily' ? (
            <div className="flex items-center gap-1.5 bg-surface-soft px-2.5 py-1 rounded-lg border border-hairline text-xs">
              <Camera size={14} className="text-muted shrink-0" />
              <span className="text-muted text-[11px] font-medium shrink-0">หลักฐานรูป:</span>
              <select
                value={photoFilter}
                onChange={e => setPhotoFilter(e.target.value as any)}
                className="bg-transparent font-semibold text-ink text-xs focus:outline-none cursor-pointer w-full truncate"
              >
                <option value="all">ทั้งหมด (มี/ไม่มีรูป)</option>
                <option value="has_photo">เฉพาะคนที่มีรูปถ่าย</option>
                <option value="no_photo">เฉพาะคนที่ไม่มีรูป</option>
              </select>
            </div>
          ) : (
            <div className="hidden lg:block" />
          )}

          {/* Search Box */}
          <div className="relative w-full">
            <Search size={13} className="absolute left-2.5 top-2.5 text-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อหรือรหัสนักศึกษา..."
              className="w-full h-8 pl-8 pr-2.5 border border-hairline rounded-lg text-xs bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-medium"
            />
          </div>
        </div>

        {/* Row 3: Date Controls + Display Mode (Grid/Table) + Filter Reset Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-hairline">
          {/* Date Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {viewMode === 'daily' ? (
              <div className="flex items-center gap-1 bg-surface-soft p-1 rounded-lg border border-hairline text-xs">
                <button
                  type="button"
                  onClick={() => handleShiftDate(-1)}
                  className="p-1 hover:bg-canvas rounded text-muted hover:text-ink cursor-pointer"
                  title="ย้อนหลัง 1 วัน"
                >
                  <ChevronLeft size={14} />
                </button>

                <div className="w-40 sm:w-44">
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
                  className="p-1 hover:bg-canvas rounded text-muted hover:text-ink cursor-pointer"
                  title="ถัดไป 1 วัน"
                >
                  <ChevronRight size={14} />
                </button>

                <button
                  type="button"
                  onClick={handleSetToday}
                  className="px-2 py-0.5 bg-canvas hover:bg-surface-strong border border-hairline rounded text-[10px] font-bold text-muted hover:text-ink cursor-pointer ml-1"
                >
                  วันนี้
                </button>
              </div>
            ) : viewMode === 'matrix' ? (
              <div className="flex items-center gap-1.5 bg-surface-soft p-1 rounded-lg border border-hairline text-xs">
                <div className="w-32 sm:w-36">
                  <ThaiDatePicker
                    value={startDate}
                    onChange={setStartDate}
                    size="sm"
                    format="short"
                  />
                </div>
                <span className="text-muted font-bold">-</span>
                <div className="w-32 sm:w-36">
                  <ThaiDatePicker
                    value={endDate}
                    onChange={setEndDate}
                    size="sm"
                    format="short"
                  />
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted flex items-center gap-1.5 font-medium px-2 py-1 bg-surface-soft rounded-lg border border-hairline">
                <Calendar size={13} className="text-primary" />
                <span>สรุปสะสมทั้งภาคเรียน ({activeYear || '2569'} / {activeTerm || '1'})</span>
              </div>
            )}

            {/* Daily View Toggle: Card vs Row */}
            {viewMode === 'daily' && (
              <div className="flex items-center gap-1 bg-surface-soft p-0.5 rounded-lg border border-hairline">
                <button
                  type="button"
                  onClick={() => setDailyDisplayMode('grid')}
                  className={`px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                    dailyDisplayMode === 'grid'
                      ? 'bg-canvas text-primary shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                  title="แสดงผลแบบการ์ดรูปภาพ"
                >
                  <LayoutGrid size={12} />
                  <span>การ์ด</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDailyDisplayMode('row')}
                  className={`px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                    dailyDisplayMode === 'row'
                      ? 'bg-canvas text-primary shadow-xs'
                      : 'text-muted hover:text-ink'
                  }`}
                  title="แสดงผลแบบตาราง"
                >
                  <TableIcon size={12} />
                  <span>ตาราง</span>
                </button>
              </div>
            )}
          </div>

          {/* Results Count & Clear Filter Action */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted font-medium">
              แสดง <strong className="text-ink font-mono">{viewMode === 'daily' ? filteredDailyStudents.length : filteredMatrixStudents.length}</strong> คน
              {dailyData?.students && ` (จากทั้งหมด ${dailyData.students.length} คน)`}
            </span>

            {isFiltered && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-2 py-1 rounded-lg border border-hairline bg-surface-soft hover:bg-surface-strong text-muted hover:text-ink text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                title="ล้างตัวกรองทั้งหมด"
              >
                <RotateCcw size={12} />
                <span>ล้างตัวกรอง</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Filters Bar (Visible when filters are active) */}
        {isFiltered && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-hairline/60">
            <span className="text-[10px] font-bold text-muted uppercase flex items-center gap-1">
              <SlidersHorizontal size={11} />
              <span>ตัวกรองที่ใช้งาน:</span>
            </span>

            {selectedLevel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                <span>ระดับ: {selectedLevel}</span>
                <button type="button" onClick={() => setSelectedLevel('')} className="hover:opacity-75 cursor-pointer"><X size={10} /></button>
              </span>
            )}

            {selectedYear && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                <span>ชั้นปี: ปี {selectedYear}</span>
                <button type="button" onClick={() => setSelectedYear('')} className="hover:opacity-75 cursor-pointer"><X size={10} /></button>
              </span>
            )}

            {selectedMajorCode && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                <span>สาขา: {availableMajors.find(m => m.code === selectedMajorCode)?.name || selectedMajorCode}</span>
                <button type="button" onClick={() => setSelectedMajorCode('')} className="hover:opacity-75 cursor-pointer"><X size={10} /></button>
              </span>
            )}

            {selectedRoom && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                <span>ห้อง: {selectedRoom}</span>
                <button type="button" onClick={() => setSelectedRoom('')} className="hover:opacity-75 cursor-pointer"><X size={10} /></button>
              </span>
            )}

            {statusFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                <span>สถานะ: {statusFilter === 'present' ? 'ทันเวลา' : statusFilter === 'late' ? 'มาสาย' : statusFilter === 'leave' ? 'ลา' : statusFilter === 'exempted' ? 'ไม่มีแถว/สลับวัน' : 'ขาดแถว'}</span>
                <button type="button" onClick={() => setStatusFilter('all')} className="hover:opacity-75 cursor-pointer"><X size={10} /></button>
              </span>
            )}

            {photoFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                <span>รูปถ่าย: {photoFilter === 'has_photo' ? 'เฉพาะคนมีรูป' : 'เฉพาะคนไม่มีรูป'}</span>
                <button type="button" onClick={() => setPhotoFilter('all')} className="hover:opacity-75 cursor-pointer"><X size={10} /></button>
              </span>
            )}

            {search.trim() && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                <span>ค้นหา: "{search.trim()}"</span>
                <button type="button" onClick={() => setSearch('')} className="hover:opacity-75 cursor-pointer"><X size={10} /></button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* VIEW 1: DAILY VIEW */}
      {viewMode === 'daily' && (
        <div className="bg-canvas border border-hairline rounded-xl shadow-2xs overflow-hidden space-y-3">
          {/* Non-normal Day Notice */}
          {dailyData?.date_category && dailyData.date_category !== 'normal' && (
            <div className="m-3 p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-amber-500/10 border-amber-500/20 text-ink">
              <div className="flex items-center gap-2.5">
                <Calendar size={16} className="text-amber-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-xs">{dailyData.date_message || 'วันที่เลือกไม่มีการเข้าแถวตามปกติ'}</h4>
                  <p className="text-[11px] text-muted">ระบบไม่นับว่าเป็นการขาดแถวในวันนี้</p>
                </div>
              </div>
              {dailyData.latest_record_date && dailyData.latest_record_date !== selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(dailyData.latest_record_date!)}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-semibold whitespace-nowrap transition-colors shadow-2xs cursor-pointer self-start sm:self-auto"
                >
                  ไปยังวันล่าสุดที่มีข้อมูล ({formatThaiDate(dailyData.latest_record_date)})
                </button>
              )}
            </div>
          )}

          {/* Daily KPI Ribbon with Interactive Quick Filter */}
          {dailyData?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-6 divide-x divide-hairline border-b border-hairline bg-surface-soft/40 text-center py-2 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`py-1.5 px-2 transition-all cursor-pointer rounded-lg mx-1 ${
                  statusFilter === 'all'
                    ? 'bg-canvas text-ink shadow-2xs font-bold border border-hairline'
                    : 'hover:bg-surface-soft text-muted'
                }`}
                title="แสดงนักศึกษาทั้งหมด"
              >
                <span className="block text-[10px]">นักศึกษาทั้งหมด</span>
                <span className="font-extrabold font-mono text-sm text-ink">{dailyData.summary.total} คน</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('present')}
                className={`py-1.5 px-2 transition-all cursor-pointer rounded-lg mx-1 ${
                  statusFilter === 'present'
                    ? 'bg-emerald-50 text-emerald-800 shadow-2xs font-bold border border-emerald-200'
                    : 'hover:bg-surface-soft text-muted'
                }`}
                title="กรองเฉพาะคนที่มาทันเวลา"
              >
                <span className="block text-[10px] text-emerald-700">ทันเวลา</span>
                <span className="font-extrabold text-emerald-600 font-mono text-sm">{dailyData.summary.present} คน</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('late')}
                className={`py-1.5 px-2 transition-all cursor-pointer rounded-lg mx-1 ${
                  statusFilter === 'late'
                    ? 'bg-amber-50 text-amber-800 shadow-2xs font-bold border border-amber-200'
                    : 'hover:bg-surface-soft text-muted'
                }`}
                title="กรองเฉพาะคนที่มาสาย"
              >
                <span className="block text-[10px] text-amber-700">มาสาย</span>
                <span className="font-extrabold text-amber-600 font-mono text-sm">{dailyData.summary.late} คน</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('leave')}
                className={`py-1.5 px-2 transition-all cursor-pointer rounded-lg mx-1 ${
                  statusFilter === 'leave'
                    ? 'bg-sky-50 text-sky-800 shadow-2xs font-bold border border-sky-200'
                    : 'hover:bg-surface-soft text-muted'
                }`}
                title="กรองเฉพาะคนที่ลา"
              >
                <span className="block text-[10px] text-sky-700">ลา</span>
                <span className="font-extrabold text-sky-600 font-mono text-sm">{dailyData.summary.leave} คน</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('absent')}
                className={`py-1.5 px-2 transition-all cursor-pointer rounded-lg mx-1 ${
                  statusFilter === 'absent'
                    ? 'bg-rose-50 text-rose-800 shadow-2xs font-bold border border-rose-200'
                    : 'hover:bg-surface-soft text-muted'
                }`}
                title="กรองเฉพาะคนที่ขาดแถว"
              >
                <span className="block text-[10px] text-rose-700">ขาดแถว</span>
                <span className="font-extrabold text-rose-600 font-mono text-sm">{dailyData.summary.absent} คน</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('exempted')}
                className={`py-1.5 px-2 transition-all cursor-pointer rounded-lg mx-1 ${
                  statusFilter === 'exempted'
                    ? 'bg-slate-100 text-slate-800 shadow-2xs font-bold border border-slate-300'
                    : 'hover:bg-surface-soft text-muted'
                }`}
                title="กรองเฉพาะคนที่ไม่มีคิวเข้าแถววันนี้ (สลับวัน/ยกเว้น)"
              >
                <span className="block text-[10px] text-slate-600">ไม่มีแถว/สลับวัน</span>
                <span className="font-extrabold text-slate-700 font-mono text-sm">{dailyData.summary.exempted || 0} คน</span>
              </button>
            </div>
          )}

          {/* Sub-view: GRID CARDS */}
          {dailyDisplayMode === 'grid' ? (
            <div className="p-3.5">
              {loading ? (
                <div className="py-16 text-center text-muted text-xs font-semibold">กำลังโหลดข้อมูล...</div>
              ) : filteredDailyStudents.length === 0 ? (
                <div className="py-16 text-center text-muted text-xs font-semibold">
                  {isFiltered ? 'ไม่พบนักศึกษาตามเงื่อนไขตัวกรองที่เลือก' : 'ไม่พบข้อมูลนักศึกษา'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 items-start">
                  {filteredDailyStudents.map((s, idx) => {
                    const hasPhoto = Boolean(s.photo_path && s.status !== 'absent');
                    const isAbsent = s.status === 'absent';
                    const isLeave = s.status === 'leave';

                    return (
                      <div
                        key={s.student_id}
                        className={`bg-canvas border rounded-xl overflow-hidden shadow-2xs hover:border-muted/40 transition-all flex flex-col group ${
                          isAbsent ? 'border-hairline bg-surface-soft/15' : 'border-hairline'
                        }`}
                      >
                        {/* Photo Thumbnail Area: ONLY rendered when student has attended and has a photo */}
                        {hasPhoto ? (
                          <div className="relative h-44 bg-surface-soft overflow-hidden flex items-center justify-center border-b border-hairline">
                            <AttendanceCardPhoto
                              photoPath={s.photo_path}
                              firstName={s.first_name}
                              onView={() => openPhotoModal({ url: s.photo_path!, student: s, time: s.attended_at || '' })}
                            />

                            {/* Status Badge Float */}
                            <div className="absolute top-2 left-2 z-10 pointer-events-none">
                              {getStatusBadge(s.status)}
                            </div>

                            {/* Index Pill */}
                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-xs text-[10px] font-mono font-bold text-white z-10">
                              #{idx + 1}
                            </div>
                          </div>
                        ) : (
                          /* Clean compact header for absent / no-photo students */
                          <div className="p-3 bg-surface-soft/40 border-b border-hairline flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {getStatusBadge(s.status)}
                            </div>
                            <span className="text-[10px] font-mono font-bold text-muted bg-surface-soft px-2 py-0.5 rounded-md border border-hairline">
                              #{idx + 1}
                            </span>
                          </div>
                        )}

                        {/* Card Content Details */}
                        <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5">
                          <div className="space-y-0.5">
                            <span className="font-mono text-[11px] font-bold text-muted block tracking-wide">
                              {s.student_id}
                            </span>
                            <h4 className="font-bold text-xs text-ink line-clamp-1">
                              {s.prefix || ''}{s.first_name} {s.last_name}
                            </h4>
                            <span className="text-[10px] text-muted block truncate">
                              {s.level} {s.year} • {s.major_name} (ห้อง {s.room})
                            </span>
                          </div>

                          {/* Absent / Leave status banners */}
                          {isAbsent && (
                            <div className="py-2 px-2.5 rounded-lg bg-rose-50/70 border border-rose-200/50 text-[11px] text-rose-700 font-semibold flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <UserX size={13} className="text-rose-500 shrink-0" />
                                <span>ไม่พบการเข้าแถว</span>
                              </span>
                              <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">ขาด</span>
                            </div>
                          )}

                          {isLeave && (
                            <div className="py-2 px-2.5 rounded-lg bg-sky-50/70 border border-sky-200/50 text-[11px] text-sky-700 font-semibold flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Calendar size={13} className="text-sky-500 shrink-0" />
                                <span>ลากิจ / ลาป่วย</span>
                              </span>
                              <span className="text-[10px] font-bold bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">ลา</span>
                            </div>
                          )}

                          <div className="space-y-1.5 text-[11px] text-muted border-t border-hairline pt-2">
                            <div className="flex items-center justify-between">
                              <span className="text-muted flex items-center gap-1">
                                <Clock size={11} />
                                <span>เวลาเช็ก:</span>
                              </span>
                              <span className="font-mono font-bold text-ink">
                                {s.attended_at ? `${new Date(s.attended_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.` : '-'}
                              </span>
                            </div>

                            {s.matched_location && (
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-muted flex items-center gap-1">
                                  <MapPin size={10} />
                                  <span>จุดเช็ก:</span>
                                </span>
                                <span className="font-semibold text-ink truncate max-w-[120px]">{s.matched_location}</span>
                              </div>
                            )}

                            {s.remark && (
                              <div className="text-[10px] text-amber-700 bg-amber-50 p-1 rounded border border-amber-200 truncate">
                                หมายเหตุ: {s.remark}
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setEditingStudent({ student: s, date: selectedDate });
                                setEditStatus(s.status || 'present');
                                setEditRemark(s.remark || '');
                              }}
                              className="w-full mt-1 py-1.5 bg-canvas hover:bg-surface-soft border border-hairline rounded-lg text-xs font-semibold text-ink flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            >
                              <Edit3 size={12} className="text-muted" />
                              <span>ปรับสถานะ</span>
                            </button>
                          </div>
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
                <thead className="bg-surface-soft/60 border-b border-hairline text-muted font-semibold text-[11px]">
                  <tr>
                    <th className="py-2.5 px-4 w-12 text-center">ลำดับ</th>
                    <th className="py-2.5 px-4 w-28">รหัส</th>
                    <th className="py-2.5 px-4">ชื่อ - นามสกุล</th>
                    <th className="py-2.5 px-4">กลุ่มเรียน</th>
                    <th className="py-2.5 px-4 text-center">สถานะ</th>
                    <th className="py-2.5 px-4 text-center">เวลาที่บันทึก</th>
                    <th className="py-2.5 px-4 text-center">รูปหลักฐาน</th>
                    <th className="py-2.5 px-4">สถานที่ / หมายเหตุ</th>
                    <th className="py-2.5 px-4 text-center w-24">ปรับสถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-muted">กำลังโหลดข้อมูล...</td>
                    </tr>
                  ) : filteredDailyStudents.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-muted">
                        {isFiltered ? 'ไม่พบนักศึกษาตามเงื่อนไขตัวกรองที่เลือก' : 'ไม่พบข้อมูลนักศึกษา'}
                      </td>
                    </tr>
                  ) : (
                    filteredDailyStudents.map((s, idx) => (
                      <tr key={s.student_id} className="hover:bg-surface-soft/40 transition-colors">
                        <td className="py-2.5 px-4 text-center font-mono text-muted">{idx + 1}</td>
                        <td className="py-2.5 px-4 font-mono font-bold text-ink">{s.student_id}</td>
                        <td className="py-2.5 px-4 font-semibold text-ink">
                          {s.prefix || ''}{s.first_name} {s.last_name}
                        </td>
                        <td className="py-2.5 px-4 text-muted text-[11px]">
                          {s.level} {s.year} • {s.major_name} ({s.room})
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {getStatusBadge(s.status)}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono text-muted text-[11px]">
                          {s.attended_at
                            ? `${new Date(s.attended_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
                            : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {s.photo_path && s.status !== 'absent' ? (
                            <button
                              type="button"
                              onClick={() => openPhotoModal({ url: s.photo_path!, student: s, time: s.attended_at || '' })}
                              className="px-2 py-0.5 bg-surface-soft hover:bg-primary hover:text-white rounded border border-hairline text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Eye size={11} />
                              <span>ดูรูป</span>
                            </button>
                          ) : (
                            <span className="text-muted-soft text-[11px]">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-muted text-[11px]">
                          {s.matched_location && <span className="text-ink font-medium">{s.matched_location}</span>}
                          {s.remark && <span className="block text-muted-soft italic">{s.remark}</span>}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStudent({ student: s, date: selectedDate });
                              setEditStatus(s.status || 'present');
                              setEditRemark(s.remark || '');
                            }}
                            className="px-2.5 py-1 bg-surface-soft hover:bg-primary hover:text-white border border-hairline rounded text-xs font-semibold text-ink transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Edit3 size={11} />
                            <span>ปรับ</span>
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

      {/* VIEW 2: MATRIX VIEW (Weekly / Monthly) */}
      {viewMode === 'matrix' && (
        <div className="bg-canvas border border-hairline rounded-xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-surface-soft/60 border-b border-hairline text-muted font-semibold text-[11px]">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center sticky left-0 bg-surface-soft/90 z-20">ลำดับ</th>
                  <th className="py-2.5 px-3 w-28 sticky left-10 bg-surface-soft/90 z-20">รหัสนักศึกษา</th>
                  <th className="py-2.5 px-3 min-w-[150px] sticky left-38 bg-surface-soft/90 z-20">ชื่อ - สกุล</th>
                  <th className="py-2.5 px-3 min-w-[120px]">กลุ่มเรียน</th>
                  {matrixData?.dates?.map(d => (
                    <th key={d} className="py-2 px-2 text-center border-l border-hairline min-w-[54px] font-mono">
                      <span className="block text-[10px] text-muted-soft">
                        {new Date(d).toLocaleDateString('th-TH', { weekday: 'short' })}
                      </span>
                      <span className="font-bold text-ink">
                        {new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                      </span>
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-center border-l border-hairline bg-surface-soft/40">สรุป (ทัน/สาย/ลา/ขาด)</th>
                  <th className="py-2.5 px-3 text-center border-l border-hairline bg-surface-soft/40">ร้อยละ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {loading ? (
                  <tr>
                    <td colSpan={20} className="py-12 text-center text-muted">กำลังโหลดข้อมูล...</td>
                  </tr>
                ) : filteredMatrixStudents.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="py-12 text-center text-muted">
                      {isFiltered ? 'ไม่พบนักศึกษาตามเงื่อนไขตัวกรองที่เลือก' : 'ไม่พบข้อมูลนักศึกษา'}
                    </td>
                  </tr>
                ) : (
                  filteredMatrixStudents.map((s, idx) => {
                    const stats = s.stats || {};
                    const percent = stats.rate_percent || 0;
                    return (
                      <tr key={s.student_id} className="hover:bg-surface-soft/40 transition-colors">
                        <td className="py-2 px-3 text-center font-mono text-muted sticky left-0 bg-canvas z-10">{idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-ink sticky left-10 bg-canvas z-10">{s.student_id}</td>
                        <td className="py-2 px-3 font-semibold text-ink truncate sticky left-38 bg-canvas z-10">
                          {s.prefix || ''}{s.first_name} {s.last_name}
                        </td>
                        <td className="py-2 px-3 text-muted text-[11px] truncate">
                          {s.level} {s.year} • {s.major_name} ({s.room})
                        </td>
                        {matrixData?.dates?.map(d => {
                          const att = s.attendance_map?.[d];
                          const status = att?.status;
                          return (
                            <td key={d} className="py-2 px-2 text-center border-l border-hairline">
                              {status === 'present' ? (
                                <span className="inline-block w-4 h-4 rounded-full bg-emerald-500 text-white font-bold text-[9px] leading-4" title="ทันเวลา">✓</span>
                              ) : status === 'late' ? (
                                <span className="inline-block w-4 h-4 rounded-full bg-amber-500 text-white font-bold text-[9px] leading-4" title="มาสาย">ส</span>
                              ) : status === 'leave' ? (
                                <span className="inline-block w-4 h-4 rounded-full bg-sky-500 text-white font-bold text-[9px] leading-4" title="ลา">ล</span>
                              ) : status === 'holiday' ? (
                                <span className="text-amber-500 text-[10px] font-bold" title="วันหยุด">ห</span>
                              ) : status === 'weekend' ? (
                                <span className="text-purple-400 text-[10px]" title="วันหยุดสุดสัปดาห์">-</span>
                              ) : status === 'exempted' ? (
                                <span className="inline-block px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium text-[9px] border border-hairline" title="ไม่มีแถว / สลับวัน">-</span>
                              ) : (
                                <span className="inline-block w-4 h-4 rounded-full bg-rose-500 text-white font-bold text-[9px] leading-4" title="ขาด">ข</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2 px-3 text-center border-l border-hairline font-mono font-semibold text-[11px]">
                          <span className="text-emerald-600">{stats.present_days || 0}</span> /{' '}
                          <span className="text-amber-600">{stats.late_days || 0}</span> /{' '}
                          <span className="text-sky-600">{stats.leave_days || 0}</span> /{' '}
                          <span className="text-rose-600">{stats.absent_days || 0}</span>
                        </td>
                        <td className="py-2 px-3 text-center border-l border-hairline font-mono font-bold">
                          <span className={percent >= 80 ? 'text-emerald-600' : percent >= 60 ? 'text-amber-600' : 'text-rose-600'}>
                            {percent}%
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

      {/* VIEW 3: SUMMARY VIEW (Whole Semester) */}
      {viewMode === 'summary' && (
        <div className="bg-canvas border border-hairline rounded-xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-soft/60 border-b border-hairline text-muted font-semibold text-[11px]">
                <tr>
                  <th className="py-2.5 px-4 w-12 text-center">ลำดับ</th>
                  <th className="py-2.5 px-4 w-28">รหัสนักศึกษา</th>
                  <th className="py-2.5 px-4">ชื่อ - นามสกุล</th>
                  <th className="py-2.5 px-4">กลุ่มเรียน</th>
                  <th className="py-2.5 px-4 text-center">ทันเวลา (วัน)</th>
                  <th className="py-2.5 px-4 text-center">มาสาย (วัน)</th>
                  <th className="py-2.5 px-4 text-center">ลา (วัน)</th>
                  <th className="py-2.5 px-4 text-center">ขาดแถว (วัน)</th>
                  <th className="py-2.5 px-4 text-center">รวมวันเปิดแถว</th>
                  <th className="py-2.5 px-4 text-center">ร้อยละการเข้าแถว</th>
                  <th className="py-2.5 px-4 text-center w-24">ผลการประเมิน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {loading ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-muted">กำลังโหลดข้อมูล...</td>
                  </tr>
                ) : filteredMatrixStudents.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-muted">
                      {isFiltered ? 'ไม่พบนักศึกษาตามเงื่อนไขตัวกรองที่เลือก' : 'ไม่พบข้อมูลนักศึกษา'}
                    </td>
                  </tr>
                ) : (
                  filteredMatrixStudents.map((s, idx) => {
                    const stats = s.stats || {};
                    const percent = stats.rate_percent || 0;
                    const passed = percent >= passThreshold;
                    return (
                      <tr key={s.student_id} className="hover:bg-surface-soft/40 transition-colors">
                        <td className="py-2.5 px-4 text-center font-mono text-muted">{idx + 1}</td>
                        <td className="py-2.5 px-4 font-mono font-bold text-ink">{s.student_id}</td>
                        <td className="py-2.5 px-4 font-semibold text-ink">
                          {s.prefix || ''}{s.first_name} {s.last_name}
                        </td>
                        <td className="py-2.5 px-4 text-muted text-[11px]">
                          {s.level} {s.year} • {s.major_name} ({s.room})
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono text-emerald-600 font-bold">{stats.present_days || 0}</td>
                        <td className="py-2.5 px-4 text-center font-mono text-amber-600 font-semibold">{stats.late_days || 0}</td>
                        <td className="py-2.5 px-4 text-center font-mono text-sky-600 font-semibold">{stats.leave_days || 0}</td>
                        <td className="py-2.5 px-4 text-center font-mono text-rose-600 font-bold">{stats.absent_days || 0}</td>
                        <td className="py-2.5 px-4 text-center font-mono text-muted font-bold">{stats.total_school_days || 0}</td>
                        <td className="py-2.5 px-4 text-center font-mono font-extrabold text-sm">
                          <span className={percent >= 80 ? 'text-emerald-600' : percent >= 60 ? 'text-amber-600' : 'text-rose-600'}>
                            {percent}%
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {passed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 size={11} />
                              <span>ผ่าน</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <UserX size={11} />
                              <span>ไม่ผ่าน</span>
                            </span>
                          )}
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

      {/* Photo Modal */}
      {photoModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-canvas border border-hairline rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl relative">
            <div className="p-3.5 border-b border-hairline flex items-center justify-between bg-surface-soft">
              <div>
                <h4 className="font-bold text-xs text-ink">
                  {photoModal.student?.prefix || ''}{photoModal.student?.first_name} {photoModal.student?.last_name}
                </h4>
                <p className="text-[10px] text-muted font-mono">
                  รหัส {photoModal.student?.student_id} • เวลา {photoModal.time ? `${new Date(photoModal.time).toLocaleTimeString('th-TH')} น.` : '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={closePhotoModal}
                className="w-7 h-7 rounded-full border border-hairline flex items-center justify-center hover:bg-surface-soft text-muted hover:text-ink cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-black/10 max-h-[70vh]">
              <img
                src={photoModal.url}
                alt="ภาพถ่ายเช็กชื่อ"
                className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-md"
              />
            </div>
            <div className="p-3 border-t border-hairline bg-surface-soft flex items-center justify-between text-xs">
              <span className="text-[11px] text-muted">
                สถานที่: <strong>{photoModal.student?.matched_location || 'ลานหน้าเสาธง'}</strong>
              </span>
              <button
                type="button"
                onClick={closePhotoModal}
                className="px-3 py-1 bg-ink text-canvas rounded-lg text-xs font-semibold cursor-pointer"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Status Edit Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-canvas border border-hairline rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-hairline pb-2.5">
              <div>
                <h3 className="font-bold text-sm text-ink">ปรับสถานะการเข้าแถว</h3>
                <p className="text-[11px] text-muted font-mono">
                  {editingStudent.student.student_id} • {editingStudent.student.first_name} {editingStudent.student.last_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="w-7 h-7 rounded-full border border-hairline flex items-center justify-center hover:bg-surface-soft text-muted hover:text-ink cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-muted block mb-1">เลือกสถานะใหม่:</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'present', label: 'ทันเวลา', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                    { id: 'late', label: 'มาสาย', color: 'text-amber-700 bg-amber-50 border-amber-200' },
                    { id: 'leave', label: 'ลา', color: 'text-sky-700 bg-sky-50 border-sky-200' },
                    { id: 'absent', label: 'ขาดแถว', color: 'text-rose-700 bg-rose-50 border-rose-200' }
                  ].map(st => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setEditStatus(st.id)}
                      className={`p-2 rounded-lg border text-xs font-bold transition-all cursor-pointer text-center ${
                        editStatus === st.id
                          ? `${st.color} shadow-xs font-extrabold ring-1 ring-current`
                          : 'border-hairline bg-surface-soft/60 text-muted hover:text-ink'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted block mb-1">หมายเหตุ / เหตุผล:</label>
                <input
                  type="text"
                  value={editRemark}
                  onChange={e => setEditRemark(e.target.value)}
                  placeholder="เช่น มีใบรับรองแพทย์, ช่วยงานอาจารย์"
                  className="w-full h-8 px-2.5 text-xs border border-hairline rounded-lg bg-surface-soft text-ink"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="px-3 py-1.5 border border-hairline rounded-lg text-xs font-semibold text-muted hover:text-ink cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveStatus}
                className="px-4 py-1.5 bg-primary hover:bg-primary-active text-white rounded-lg text-xs font-bold shadow-2xs transition-colors cursor-pointer"
              >
                บันทึกการแก้ไข
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-canvas border border-hairline rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-hairline pb-2.5">
              <div className="flex items-center gap-2">
                <Printer size={16} className="text-primary" />
                <h3 className="font-bold text-sm text-ink">ออกรายงานการเข้าแถว</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="w-7 h-7 rounded-full border border-hairline flex items-center justify-center hover:bg-surface-soft text-muted hover:text-ink cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-surface-soft/60 rounded-xl border border-hairline space-y-1.5">
                <div className="text-muted text-[11px]">เกณฑ์เปอร์เซ็นต์ผ่านกิจกรรมเข้าแถว:</div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={50}
                    max={100}
                    value={passThreshold}
                    onChange={e => setPassThreshold(parseInt(e.target.value, 10))}
                    className="flex-1 accent-primary cursor-pointer"
                  />
                  <span className="font-mono font-extrabold text-primary text-sm">{passThreshold}%</span>
                </div>
                <span className="text-[10px] text-muted-soft block">
                  นักศึกษาที่มีร้อยละการเข้าแถวตั้งแต่ {passThreshold}% ขึ้นไปจะถือว่า "ผ่าน"
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-bold text-muted block">ขอบเขตรายงาน:</span>
                <div className="p-2.5 bg-surface-soft rounded-lg text-[11px] text-ink font-medium">
                  {selectedLevel ? `ระดับ ${selectedLevel}` : 'ทุกระดับชั้น'} • {selectedYear ? `ชั้นปี ${selectedYear}` : 'ทุกชั้นปี'} • {selectedMajorCode ? availableMajors.find(m => m.code === selectedMajorCode)?.name || selectedMajorCode : 'ทุกแผนกวิชา'} {selectedRoom ? `(ห้อง ${selectedRoom})` : ''}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="px-3 py-1.5 border border-hairline rounded-lg text-xs font-semibold text-muted hover:text-ink cursor-pointer"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={() => {
                  window.print();
                  setShowReportModal(false);
                }}
                className="px-4 py-1.5 bg-ink hover:bg-black text-canvas rounded-lg text-xs font-bold shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Printer size={13} />
                <span>พิมพ์รายงานตอนนี้</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
