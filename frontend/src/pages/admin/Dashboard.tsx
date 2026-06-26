import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Calendar, 
  Clock, 
  ShieldAlert, 
  Search, 
  UserCheck, 
  TrendingUp, 
  Plus, 
  Building,
  Check,
  RotateCcw,
  Download,
  PieChart
} from 'lucide-react';

interface Session {
  id: number;
  week_number: number;
  title: string;
  date: string;
  is_active: number;
  close_at: string | null;
}

interface StudentRecord {
  id?: number;
  student_id: string;
  prefix: string;
  first_name: string;
  last_name: string;
  class_year: string;
  major_code: string;
  room: string;
  attended_at?: string;
}

interface WeeklyTrend {
  sessionId: number;
  weekNumber: number;
  title: string;
  rate: number;
}

interface RoomStat {
  room: string;
  expected: number;
  present: number;
  absent: number;
  rate: number;
}

interface ScanTimeData {
  time: string;
  count: number;
}

interface GenderStatDetail {
  expected: number;
  present: number;
  absent: number;
  rate: number;
}

interface DashboardStats {
  sessions: Session[];
  selectedSessionId: number | 'all' | null;
  totalExpected: number;
  totalPresent: number;
  totalAbsent: number;
  attendanceRate: number;
  presentList: StudentRecord[];
  absentList: StudentRecord[];
  weeklyTrend: WeeklyTrend[];
  roomStats: RoomStat[];
  scanDistribution?: ScanTimeData[];
  genderStats?: {
    male: GenderStatDetail;
    female: GenderStatDetail;
  };
}

export default function AdminDashboard() {
  // Filter States
  const [selectedSessionId, setSelectedSessionId] = useState<number | 'all' | ''>('');
  const [classYear, setClassYear] = useState<string>('');
  const [majorCode, setMajorCode] = useState<string>('');
  const [room, setRoom] = useState<string>('');
  const [gender, setGender] = useState<string>('');

  // Dropdown Master Data
  const [sessions, setSessions] = useState<Session[]>([]);
  const [availableMajors, setAvailableMajors] = useState<string[]>([]);

  // Statistics Data
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSheetsConnected, setIsSheetsConnected] = useState(false);

  // Tab & Local search states
  const [activeTab, setActiveTab] = useState<'present' | 'absent'>('present');
  const [localSearch, setLocalSearch] = useState('');
  
  // Custom Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ show: false, title: '', message: '', onConfirm: () => {} });

  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Individual Student History State
  const [selectedStudentHistory, setSelectedStudentHistory] = useState<{
    student: StudentRecord & { is_temporary?: boolean };
    stats: {
      totalSessions: number;
      totalPresent: number;
      totalAbsent: number;
      attendanceRate: number;
    };
    history: Array<{
      sessionId: number;
      weekNumber: number;
      title: string;
      date: string;
      status: 'present' | 'absent';
      attended_at: string | null;
    }>;
  } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Hover states for interactive SVG charts
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);
  const [hoveredRoomIndex, setHoveredRoomIndex] = useState<number | null>(null);
  const [hoveredScanIndex, setHoveredScanIndex] = useState<number | null>(null);
  const [hoveredDonutSegment, setHoveredDonutSegment] = useState<'present' | 'absent' | null>(null);

  // Fetch unique majors list for the filters
  const fetchMajors = async () => {
    try {
      const res = await axios.get('/api/majors');
      if (res.data) {
        const unique = Array.from(new Set(res.data.map((m: any) => m.major_code))) as string[];
        setAvailableMajors(unique.sort());
      }
    } catch (err) {
      console.error('Error fetching majors list:', err);
    }
  };

  // Fetch General System Stats (like Sheet status)
  const fetchGeneralStats = async () => {
    try {
      const res = await axios.get('/api/stats');
      if (res.data) {
        setIsSheetsConnected(res.data.isSheetsConnected || false);
      }
    } catch (err) {
      console.error('Error fetching general stats:', err);
    }
  };

  // Main statistics fetching function (memoized to prevent infinite loop)
  const fetchDashboardStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/dashboard-stats', {
        params: {
          sessionId: selectedSessionId || undefined,
          classYear: classYear || undefined,
          majorCode: majorCode || undefined,
          room: room || undefined,
          gender: gender || undefined
        }
      });
      if (res.data) {
        setStats(res.data);
        setSessions(res.data.sessions || []);
        if (selectedSessionId === '' && res.data.selectedSessionId) {
          setSelectedSessionId(res.data.selectedSessionId);
        }
      }
    } catch (err) {
      console.error('Error fetching dashboard statistics:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId, classYear, majorCode, room, gender]);

  useEffect(() => {
    fetchMajors();
    fetchGeneralStats();
  }, []);

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  // Handle Quick Manual Check-in from Absent List
  const handleQuickCheckin = (student: StudentRecord & { session_id?: number }) => {
    const targetSession = selectedSessionId === 'all' ? student.session_id : selectedSessionId;
    if (!targetSession) return;

    const sessionObj = sessions.find(s => s.id === targetSession);
    const sessionLabel = sessionObj ? `สัปดาห์ที่ ${sessionObj.week_number}` : 'คาบกิจกรรมนี้';

    setConfirmDialog({
      show: true,
      title: 'เช็กชื่อแบบแมนนวล',
      message: `ยืนยันการลงชื่อเข้าเรียนให้ ${student.prefix}${student.first_name} ${student.last_name} (${student.student_id}) ใน${sessionLabel}?`,
      onConfirm: async () => {
        try {
          await axios.post('/api/attendances', {
            session_id: targetSession,
            prefix: student.prefix,
            first_name: student.first_name,
            last_name: student.last_name,
            student_id: student.student_id,
            class_year: student.class_year,
            major_code: student.major_code,
            room: student.room
          });
          
          setMessage(`ลงชื่อเข้าเรียนให้ ${student.first_name} เรียบร้อยแล้ว!`);
          fetchDashboardStats();
          setTimeout(() => setMessage(''), 3000);
        } catch (err: any) {
          setErrorMsg(err.response?.data?.error || 'เกิดข้อผิดพลาดในการลงชื่อ');
          setTimeout(() => setErrorMsg(''), 3000);
        }
      }
    });
  };

  // Fetch and show individual student history
  const handleOpenStudentHistory = async (studentId: string) => {
    setLoadingHistory(true);
    try {
      const res = await axios.get(`/api/admin/student-attendance/${studentId}`);
      if (res.data) {
        setSelectedStudentHistory(res.data);
      }
    } catch (err) {
      console.error('Error fetching student history:', err);
      setErrorMsg('ไม่สามารถดึงข้อมูลประวัตินักศึกษาได้');
      setTimeout(() => setErrorMsg(''), 3000);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Helper: Format ISO date string to Thai short time
  const formatTime = (isoString?: string) => {
    if (!isoString) return '-';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('th-TH', { 
        timeZone: 'Asia/Bangkok',
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false
      }) + ' น.';
    } catch (e) {
      return '-';
    }
  };

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  // Client-side search filtering on the lists
  const filteredPresentList = stats?.presentList.filter(s => 
    s.student_id.includes(localSearch) || 
    s.first_name.toLowerCase().includes(localSearch.toLowerCase()) ||
    s.last_name.toLowerCase().includes(localSearch.toLowerCase())
  ) || [];

  const filteredAbsentList = stats?.absentList.filter(s => 
    s.student_id.includes(localSearch) || 
    s.first_name.toLowerCase().includes(localSearch.toLowerCase()) ||
    s.last_name.toLowerCase().includes(localSearch.toLowerCase())
  ) || [];

  const handleClearFilters = () => {
    setClassYear('');
    setMajorCode('');
    setRoom('');
    setGender('');
  };

  // Export current list to CSV with Thai BOM support
  const handleExportCSV = () => {
    const dataToExport = activeTab === 'present' ? filteredPresentList : filteredAbsentList;
    if (dataToExport.length === 0) return;

    const headers = activeTab === 'present' 
      ? ['ลำดับ', 'รหัสนักศึกษา', 'คำนำหน้า', 'ชื่อจริง', 'นามสกุล', 'ชั้นปี', 'สาขาวิชา', 'ห้องเรียน', 'เวลาเช็กชื่อ']
      : ['ลำดับ', 'รหัสนักศึกษา', 'คำนำหน้า', 'ชื่อจริง', 'นามสกุล', 'ชั้นปี', 'สาขาวิชา', 'ห้องเรียน'];

    const rows = dataToExport.map((s, idx) => {
      return activeTab === 'present'
        ? [
            idx + 1,
            `="${s.student_id}"`, // Force Excel string formatting
            s.prefix || '',
            s.first_name,
            s.last_name,
            s.class_year,
            s.major_code,
            s.room,
            formatTime(s.attended_at)
          ]
        : [
            idx + 1,
            `="${s.student_id}"`,
            s.prefix || '',
            s.first_name,
            s.last_name,
            s.class_year,
            s.major_code,
            s.room
          ];
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const fileLabel = selectedSessionId === 'all' 
      ? 'ทุกสัปดาห์' 
      : `สัปดาห์ที่_${selectedSession ? selectedSession.week_number : ''}`;
    link.setAttribute("download", `รายงาน_${activeTab === 'present' ? 'คนมาเรียน' : 'คนขาดเรียน'}_${fileLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Radial progress gauge calculations
  const radialRadius = 35;
  const radialCircumference = 2 * Math.PI * radialRadius;
  const rate = Math.min(stats?.attendanceRate || 0, 100);
  const radialOffset = radialCircumference - (rate / 100) * radialCircumference;

  // Donut chart parameters
  const donutRadius = 50;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const totalExpected = stats?.totalExpected || 0;
  const presentPercent = Math.min(totalExpected > 0 ? ((stats?.totalPresent || 0) / totalExpected) * 100 : 0, 100);
  const absentPercent = Math.min(totalExpected > 0 ? ((stats?.totalAbsent || 0) / totalExpected) * 100 : 0, 100);

  const donutPresentOffset = 0;
  const donutAbsentOffset = -(presentPercent / 100) * donutCircumference;

  if (loading && !stats) {
    return (
      <div className="w-full h-96 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted text-sm font-semibold">กำลังโหลดข้อมูลและสถิติระบบ...</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-semibold text-ink tracking-tight flex items-center space-x-2">
            <Clock className="w-8 h-8 text-primary" />
            <span>ภาพรวมและสถิติเช็กชื่อ</span>
          </h1>
          <p className="text-muted text-sm md:text-base mt-2">
            ตรวจสอบอัตราการเข้าร่วมกิจกรรมสัปดาห์ปัจจุบัน วิเคราะห์แนวโน้ม ค้นหาและคัดกรองข้อมูลอย่างละเอียด
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <div className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${
            isSheetsConnected 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isSheetsConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            <span>Google Sheet: {isSheetsConnected ? 'เชื่อมต่อแล้ว' : 'ไม่ได้เชื่อมต่อ'}</span>
          </div>
        </div>
      </div>

      {/* Advanced Filter Controls */}
      <div className="bg-canvas border border-hairline rounded-lg p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-hairline pb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center space-x-1.5">
            <span>ตัวกรองและเลือกกลุ่มข้อมูล</span>
          </h3>
          {(classYear || majorCode || room || gender) && (
            <button 
              onClick={handleClearFilters}
              className="text-xs font-bold text-primary hover:text-primary-active flex items-center space-x-1 transition-colors cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>ล้างตัวกรอง</span>
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Week Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink">สัปดาห์กิจกรรม</label>
            <select
              value={selectedSessionId}
              onChange={e => {
                const val = e.target.value;
                if (val === 'all') {
                  setSelectedSessionId('all');
                } else {
                  setSelectedSessionId(val ? Number(val) : '');
                }
              }}
              className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="all">ทุกสัปดาห์ (All Weeks)</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  สัปดาห์ที่ {s.week_number} • {s.title}
                </option>
              ))}
              {sessions.length === 0 && <option value="">ไม่มีคาบเรียนในระบบ</option>}
            </select>
          </div>

          {/* Class Year */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink">ระดับชั้นปี</label>
            <select
              value={classYear}
              onChange={e => setClassYear(e.target.value)}
              className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="">ทั้งหมด</option>
              <option value="1">ปี 1</option>
              <option value="2">ปี 2</option>
              <option value="3">ปี 3</option>
              <option value="4">ปี 4</option>
            </select>
          </div>

          {/* Major Code */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink">สาขาวิชา</label>
            <select
              value={majorCode}
              onChange={e => setMajorCode(e.target.value)}
              className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer uppercase"
            >
              <option value="">ทั้งหมด</option>
              {availableMajors.map(major => (
                <option key={major} value={major}>{major}</option>
              ))}
            </select>
          </div>

          {/* Room Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink">ห้องเรียน</label>
            <select
              value={room}
              onChange={e => setRoom(e.target.value)}
              className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="">ทั้งหมด</option>
              <option value="1">ห้อง 1</option>
              <option value="2">ห้อง 2</option>
              <option value="3">ห้อง 3</option>
              <option value="4">ห้อง 4</option>
              <option value="5">ห้อง 5</option>
            </select>
          </div>

          {/* Gender Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink">เพศ</label>
            <select
              value={gender}
              onChange={e => setGender(e.target.value)}
              className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="">ทั้งหมด</option>
              <option value="male">ชาย (นาย)</option>
              <option value="female">หญิง (นางสาว)</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards & Radial Progress */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {/* Radial Attendance Circle Card */}
          <div className="bg-canvas border border-hairline rounded-lg p-5 flex items-center justify-between shadow-sm transition-all hover:shadow-md">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted block">อัตราการเข้าเรียน</span>
              <div className="text-3xl font-extrabold text-ink">{stats.attendanceRate}%</div>
              <div className="text-[11px] text-muted-soft">ของนักเรียนทั้งหมดตามตัวกรอง</div>
            </div>
            
            <div className="relative w-24 h-24 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r={radialRadius}
                  className="stroke-surface-strong fill-none"
                  strokeWidth="8"
                />
                <circle
                  cx="48"
                  cy="48"
                  r={radialRadius}
                  className="stroke-primary fill-none transition-all duration-500 ease-out"
                  strokeWidth="8"
                  strokeDasharray={radialCircumference}
                  strokeDashoffset={radialOffset}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute font-bold text-sm text-ink">{stats.attendanceRate}%</div>
            </div>
          </div>

          {/* Metric Summary Card: Present / Absent */}
          <div className="bg-canvas border border-hairline rounded-lg p-5 flex flex-col justify-between shadow-sm transition-all hover:shadow-md">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">สรุปจำนวนผู้เข้าร่วม</span>
              <span className="p-1.5 bg-success/10 text-success rounded-full"><UserCheck size={14} /></span>
            </div>
            
            <div className="grid grid-cols-3 gap-2 mt-4 pt-2">
              <div className="text-center border-r border-hairline">
                <div className="text-xl font-extrabold text-success">{stats.totalPresent}</div>
                <div className="text-[10px] text-muted-soft uppercase font-bold">มาเรียน</div>
              </div>
              <div className="text-center border-r border-hairline">
                <div className="text-xl font-extrabold text-error">{stats.totalAbsent}</div>
                <div className="text-[10px] text-muted-soft uppercase font-bold">ขาดเรียน</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-extrabold text-ink">{stats.totalExpected}</div>
                <div className="text-[10px] text-muted-soft uppercase font-bold">ทั้งหมด</div>
              </div>
            </div>
          </div>

          {/* Active Session details */}
          <div className="bg-canvas border border-hairline rounded-lg p-5 flex flex-col justify-between shadow-sm transition-all hover:shadow-md">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">คาบกิจกรรมเรียน</span>
              <span className="p-1.5 bg-primary/10 text-primary rounded-full"><Calendar size={14} /></span>
            </div>
            
            <div className="space-y-1.5 mt-3">
              <div className="text-sm font-bold text-ink truncate">
                {selectedSessionId === 'all' 
                  ? 'ทุกสัปดาห์เรียนรวมกัน' 
                  : `สัปดาห์ที่ ${selectedSession ? selectedSession.week_number : '-'} • ${selectedSession ? selectedSession.title : '-'}`}
              </div>
              <div className="text-xs text-muted-soft flex items-center space-x-1">
                <span>
                  {selectedSessionId === 'all' 
                    ? `คาบกิจกรรมเรียนทั้งหมด: ${sessions.length} คาบ` 
                    : `วันที่: ${selectedSession ? new Date(selectedSession.date).toLocaleDateString('th-TH') : '-'}`}
                </span>
              </div>
              <div className="text-[10px] inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full font-bold uppercase bg-surface-soft border border-hairline text-ink">
                <span>
                  สถานะ: {selectedSessionId === 'all' 
                    ? 'สถิติสะสมภาพรวม' 
                    : (selectedSession?.is_active === 1 ? 'เปิดเช็กชื่อ' : 'ปิดเช็กชื่อ')}
                </span>
              </div>
            </div>
          </div>

          {/* Gender Comparison Card */}
          <div className="bg-canvas border border-hairline rounded-lg p-5 flex flex-col justify-between shadow-sm transition-all hover:shadow-md">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">เปรียบเทียบตามเพศ</span>
              <span className="text-[10px] font-semibold text-muted-soft bg-surface-soft px-1.5 py-0.5 rounded border border-hairline">มาเรียน %</span>
            </div>

            {stats.genderStats ? (
              <div className="space-y-2.5 mt-2">
                {/* Male Stats */}
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-primary flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-primary block"></span>
                      <span>ชาย</span>
                    </span>
                    <span className="text-ink">{stats.genderStats.male.rate}% ({stats.genderStats.male.present}/{stats.genderStats.male.expected})</span>
                  </div>
                  <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-primary h-full transition-all duration-500 ease-out" 
                      style={{ width: `${stats.genderStats.male.rate}%` }}
                    ></div>
                  </div>
                </div>

                {/* Female Stats */}
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-accent flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-[#f472b6] block"></span>
                      <span>หญิง</span>
                    </span>
                    <span className="text-ink">{stats.genderStats.female.rate}% ({stats.genderStats.female.present}/{stats.genderStats.female.expected})</span>
                  </div>
                  <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-[#f472b6] h-full transition-all duration-500 ease-out" 
                      style={{ width: `${stats.genderStats.female.rate}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-soft text-center py-2">ไม่มีข้อมูลสถิติเพศ</div>
            )}
          </div>
        </div>
      )}

      {/* Message Banners */}
      {message && (
        <div className="flex items-center space-x-2.5 p-4 rounded-md bg-success/15 border border-success/30 text-success text-sm font-semibold animate-in fade-in duration-200">
          <Check size={16} />
          <span>{message}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center space-x-2.5 p-4 rounded-md bg-error/15 border border-error/30 text-error text-sm font-semibold animate-in fade-in duration-200">
          <ShieldAlert size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Charts Section - 4 Interactive Native SVG Charts */}
      {stats && (
        <div className="space-y-8">
          
          {/* Row 1: Line Chart & Donut Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Chart 1: Curved Line Chart (Weekly Trend) */}
            <div className="bg-canvas border border-hairline rounded-lg p-5 shadow-sm space-y-4 transition-all hover:shadow-md">
              <div className="flex items-center justify-between border-b border-hairline pb-3">
                <h3 className="text-sm font-bold text-ink flex items-center space-x-2">
                  <TrendingUp size={16} className="text-primary" />
                  <span>แนวโน้มการเช็กชื่อเข้าเรียนรายสัปดาห์ (ย้อนหลังสูงสุด 6 คาบ)</span>
                </h3>
              </div>
              
              {stats.weeklyTrend.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-muted-soft">ยังไม่มีสถิติสำหรับสร้างกราฟแสดงแนวโน้ม</div>
              ) : (
                <div className="relative pt-4">
                  <svg viewBox="0 0 500 180" className="w-full overflow-visible">
                    {/* Y Grid lines */}
                    <line x1="40" y1="20" x2="480" y2="20" stroke="var(--hairline)" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="40" y1="60" x2="480" y2="60" stroke="var(--hairline)" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="40" y1="100" x2="480" y2="100" stroke="var(--hairline)" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="40" y1="140" x2="480" y2="140" stroke="var(--hairline)" strokeWidth="0.5" />
                    
                    {/* Y Axis Labels */}
                    <text x="32" y="24" className="text-[10px] fill-muted font-bold text-right" textAnchor="end">100%</text>
                    <text x="32" y="64" className="text-[10px] fill-muted font-bold text-right" textAnchor="end">75%</text>
                    <text x="32" y="104" className="text-[10px] fill-muted font-bold text-right" textAnchor="end">50%</text>
                    <text x="32" y="144" className="text-[10px] fill-muted font-bold text-right" textAnchor="end">25%</text>
                    
                    {/* Coordinates & Lines */}
                    {(() => {
                      const len = stats.weeklyTrend.length;
                      const points = stats.weeklyTrend.map((t, idx) => {
                        const step = len > 1 ? 440 / (len - 1) : 440;
                        const x = 40 + idx * step;
                        const y = 140 - (Math.min(t.rate, 100) / 100) * 120;
                        return { x, y, data: t };
                      });
                      
                      // Build Bezier Curved Path (Slight curve smoothing)
                      let pathD = '';
                      if (points.length > 0) {
                        pathD = `M ${points[0].x} ${points[0].y}`;
                        for (let i = 0; i < points.length - 1; i++) {
                          const cpX1 = points[i].x + (points[i+1].x - points[i].x) / 3;
                          const cpY1 = points[i].y;
                          const cpX2 = points[i].x + 2 * (points[i+1].x - points[i].x) / 3;
                          const cpY2 = points[i+1].y;
                          pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${points[i+1].x} ${points[i+1].y}`;
                        }
                      }
                      
                      return (
                        <>
                          {/* Gradient shadow under bezier curve */}
                          {points.length > 1 && pathD && (
                            <path
                              d={`${pathD} L ${points[points.length - 1].x} 140 L ${points[0].x} 140 Z`}
                              fill="url(#trend-gradient-flow)"
                              opacity="0.15"
                            />
                          )}
                          
                          {/* Main line path */}
                          {pathD && (
                            <path
                              d={pathD}
                              fill="none"
                              stroke="var(--primary)"
                              strokeWidth="3.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}
                          
                          {/* Data points */}
                          {points.map((p, idx) => (
                            <g 
                              key={idx} 
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredTrendIndex(idx)}
                              onMouseLeave={() => setHoveredTrendIndex(null)}
                            >
                              {/* Pulse circle on hover */}
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r={hoveredTrendIndex === idx ? 8 : 4.5}
                                className="fill-primary/20 stroke-none transition-all"
                              />
                              {/* Actual point dot */}
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r="4"
                                className="fill-canvas stroke-primary transition-all duration-150"
                                strokeWidth="2.5"
                              />
                              
                              {/* X Axis Labels */}
                              <text
                                x={p.x}
                                y="160"
                                className={`text-[10px] font-bold transition-all ${
                                  hoveredTrendIndex === idx ? 'fill-primary font-black' : 'fill-muted'
                                }`}
                                textAnchor="middle"
                              >
                                W{p.data.weekNumber}
                              </text>
                            </g>
                          ))}
                        </>
                      );
                    })()}
                    
                    {/* SVG Definitions */}
                    <defs>
                      <linearGradient id="trend-gradient-flow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                  
                  {/* Floating HTML Tooltip */}
                  {hoveredTrendIndex !== null && stats.weeklyTrend[hoveredTrendIndex] && (
                    <div className="absolute top-0 right-4 bg-canvas border border-hairline p-2.5 rounded shadow-lg text-xs space-y-1 animate-in fade-in duration-150 z-10 max-w-[200px]">
                      <div className="font-bold text-ink">สัปดาห์ที่ {stats.weeklyTrend[hoveredTrendIndex].weekNumber}</div>
                      <div className="text-muted truncate">{stats.weeklyTrend[hoveredTrendIndex].title}</div>
                      <div className="flex justify-between gap-4 pt-1 font-semibold text-primary">
                        <span>อัตราเข้าเรียน:</span>
                        <span>{stats.weeklyTrend[hoveredTrendIndex].rate}%</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chart 2: Donut Chart (Proportion of Present vs Absent) */}
            <div className="bg-canvas border border-hairline rounded-lg p-5 shadow-sm space-y-4 transition-all hover:shadow-md">
              <div className="flex items-center justify-between border-b border-hairline pb-3">
                <h3 className="text-sm font-bold text-ink flex items-center space-x-2">
                  <PieChart size={16} className="text-primary" />
                  <span>สัดส่วนนักเรียนในการเข้าเรียนคาบปัจจุบัน</span>
                </h3>
              </div>

              {totalExpected === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-muted-soft">ไม่มีรายชื่อที่จะแสดงสัดส่วน</div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-around py-4 gap-6">
                  {/* Donut SVG */}
                  <div className="relative w-40 h-40 flex items-center justify-center">
                    <svg viewBox="0 0 120 120" className="w-full h-full transform -rotate-90 overflow-visible">
                      {/* Segment: Present */}
                      <circle
                        cx="60"
                        cy="60"
                        r={donutRadius}
                        className="stroke-success fill-none cursor-pointer transition-all duration-300"
                        strokeWidth={hoveredDonutSegment === 'present' ? '12' : '9'}
                        strokeDasharray={donutCircumference}
                        strokeDashoffset={donutPresentOffset}
                        onMouseEnter={() => setHoveredDonutSegment('present')}
                        onMouseLeave={() => setHoveredDonutSegment(null)}
                      />
                      {/* Segment: Absent */}
                      <circle
                        cx="60"
                        cy="60"
                        r={donutRadius}
                        className="stroke-error fill-none cursor-pointer transition-all duration-300"
                        strokeWidth={hoveredDonutSegment === 'absent' ? '12' : '9'}
                        strokeDasharray={donutCircumference}
                        strokeDashoffset={donutAbsentOffset}
                        onMouseEnter={() => setHoveredDonutSegment('absent')}
                        onMouseLeave={() => setHoveredDonutSegment(null)}
                      />
                    </svg>
                    
                    {/* Donut Centered Details */}
                    {/* Donut Centered Details */}
                    <div className="absolute text-center select-none pointer-events-none">
                      <div className="text-[10px] font-bold text-muted uppercase">มาเรียน</div>
                      <div className="text-2xl font-black text-ink">{Math.round(presentPercent)}%</div>
                      <div className="text-[9px] text-muted-soft font-semibold">{stats.totalPresent} / {totalExpected} คน</div>
                    </div>
                  </div>

                  {/* Interactive Legends */}
                  <div className="space-y-4 min-w-[150px]">
                    <div 
                      className={`p-2 rounded-md border border-hairline transition-all duration-200 ${
                        hoveredDonutSegment === 'present' ? 'bg-success/5 border-success/30 shadow-sm' : ''
                      }`}
                      onMouseEnter={() => setHoveredDonutSegment('present')}
                      onMouseLeave={() => setHoveredDonutSegment(null)}
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 bg-success rounded-full"></span>
                        <span className="text-xs font-bold text-ink">มาเรียน (Present)</span>
                      </div>
                      <div className="text-sm font-extrabold text-success mt-1 pl-4.5">
                        {stats.totalPresent} คน ({Math.round(presentPercent)}%)
                      </div>
                    </div>

                    <div 
                      className={`p-2 rounded-md border border-hairline transition-all duration-200 ${
                        hoveredDonutSegment === 'absent' ? 'bg-error/5 border-error/30 shadow-sm' : ''
                      }`}
                      onMouseEnter={() => setHoveredDonutSegment('absent')}
                      onMouseLeave={() => setHoveredDonutSegment(null)}
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 bg-error rounded-full"></span>
                        <span className="text-xs font-bold text-ink">ขาดเรียน (Absent)</span>
                      </div>
                      <div className="text-sm font-extrabold text-error mt-1 pl-4.5">
                        {stats.totalAbsent} คน ({Math.round(absentPercent)}%)
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Room Bar Chart & Hourly Scan Time Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Chart 3: Room-wise Attendance Vertical Bar Chart */}
            <div className="bg-canvas border border-hairline rounded-lg p-5 shadow-sm space-y-4 transition-all hover:shadow-md">
              <div className="flex items-center justify-between border-b border-hairline pb-3">
                <h3 className="text-sm font-bold text-ink flex items-center space-x-2">
                  <Building size={16} className="text-primary" />
                  <span>อัตราการเข้าเรียนแยกตามกลุ่มสาขาวิชา (%)</span>
                </h3>
              </div>

              {stats.roomStats.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-muted-soft">ไม่มีสถิติแยกตามสาขาวิชาในกลุ่มข้อมูลนี้</div>
              ) : (
                <div className="relative pt-4">
                  {/* Vertical bar chart using SVG */}
                  <svg viewBox="0 0 500 180" className="w-full overflow-visible">
                    {/* Y Grid lines */}
                    <line x1="40" y1="20" x2="480" y2="20" stroke="var(--hairline)" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="40" y1="60" x2="480" y2="60" stroke="var(--hairline)" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="40" y1="100" x2="480" y2="100" stroke="var(--hairline)" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="40" y1="140" x2="480" y2="140" stroke="var(--hairline)" strokeWidth="0.5" />

                    {/* Y Axis Labels */}
                    <text x="32" y="24" className="text-[10px] fill-muted font-bold text-right" textAnchor="end">100%</text>
                    <text x="32" y="64" className="text-[10px] fill-muted font-bold text-right" textAnchor="end">75%</text>
                    <text x="32" y="104" className="text-[10px] fill-muted font-bold text-right" textAnchor="end">50%</text>
                    <text x="32" y="144" className="text-[10px] fill-muted font-bold text-right" textAnchor="end">25%</text>

                    {(() => {
                      const len = stats.roomStats.length;
                      const step = 440 / len;
                      const barWidth = Math.min(step * 0.45, 24);

                      const groupColors = [
                        { stroke: 'stroke-emerald-500', fill: 'fill-emerald-500/20' },
                        { stroke: 'stroke-blue-500', fill: 'fill-blue-500/20' },
                        { stroke: 'stroke-violet-500', fill: 'fill-violet-500/20' },
                        { stroke: 'stroke-pink-500', fill: 'fill-pink-500/20' },
                        { stroke: 'stroke-amber-500', fill: 'fill-amber-500/20' },
                        { stroke: 'stroke-teal-500', fill: 'fill-teal-500/20' },
                        { stroke: 'stroke-rose-500', fill: 'fill-rose-500/20' },
                        { stroke: 'stroke-indigo-500', fill: 'fill-indigo-500/20' }
                      ];

                      return stats.roomStats.map((roomStat, idx) => {
                        const centerX = 40 + idx * step + step / 2;
                        const cappedRate = Math.min(roomStat.rate, 100);
                        const barHeight = (cappedRate / 100) * 120;
                        const barY = 140 - barHeight;

                        // Distinct colors for each group
                        const colorObj = groupColors[idx % groupColors.length];
                        const barColor = `${colorObj.stroke} ${colorObj.fill}`;

                        return (
                          <g 
                            key={idx} 
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredRoomIndex(idx)}
                            onMouseLeave={() => setHoveredRoomIndex(null)}
                          >
                            {/* Bar background hover highlighter */}
                            <rect
                              x={centerX - step / 2}
                              y="10"
                              width={step}
                              height="130"
                              className="fill-primary/0 hover:fill-primary/[0.02] transition-colors"
                            />

                            {/* Main Bar */}
                            <rect
                              x={centerX - barWidth / 2}
                              y={barY}
                              width={barWidth}
                              height={Math.max(barHeight, 2)}
                              rx="2"
                              className={`transition-all duration-300 ${barColor}`}
                              strokeWidth="2"
                            />

                            {/* Label inside/top bar */}
                            <text
                              x={centerX}
                              y={barY - 8}
                              className={`text-[9px] font-bold text-center transition-all ${
                                hoveredRoomIndex === idx ? 'fill-ink scale-105 font-black' : 'fill-muted'
                              }`}
                              textAnchor="middle"
                            >
                              {roomStat.rate}%
                            </text>

                            {/* X Axis label */}
                            <text
                              x={centerX}
                              y="160"
                              className={`text-[9px] font-bold transition-all ${
                                hoveredRoomIndex === idx ? 'fill-primary font-black' : 'fill-muted'
                              }`}
                              textAnchor="middle"
                            >
                              {roomStat.room}
                            </text>
                          </g>
                        );
                      });
                    })()}
                  </svg>

                  {/* Room Details Hover Tooltip */}
                  {hoveredRoomIndex !== null && stats.roomStats[hoveredRoomIndex] && (
                    <div className="absolute top-0 right-4 bg-canvas border border-hairline p-2.5 rounded shadow-lg text-xs space-y-1 animate-in fade-in duration-150 z-10 min-w-[170px]">
                      <div className="font-bold text-ink flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
                        <span>กลุ่มเรียน: {stats.roomStats[hoveredRoomIndex].room}</span>
                      </div>
                      <div className="flex justify-between border-t border-hairline pt-1 text-muted-soft mt-1">
                        <span>เข้าเรียนแล้ว:</span>
                        <span className="font-bold text-success">{stats.roomStats[hoveredRoomIndex].present} คน</span>
                      </div>
                      <div className="flex justify-between text-muted-soft">
                        <span>ขาดเรียน:</span>
                        <span className="font-bold text-error">{stats.roomStats[hoveredRoomIndex].absent} คน</span>
                      </div>
                      <div className="flex justify-between text-muted-soft font-semibold border-b border-hairline pb-1 mb-1">
                        <span>ในบัญชีรายชื่อ:</span>
                        <span>{stats.roomStats[hoveredRoomIndex].expected} คน</span>
                      </div>
                      <div className="flex justify-between text-ink text-[11px] font-bold">
                        <span>สัดส่วนในกลุ่มผู้เรียนคลาสนี้:</span>
                        <span className="text-primary">{stats.totalPresent > 0 ? Math.round((stats.roomStats[hoveredRoomIndex].present / stats.totalPresent) * 100) : 0}%</span>
                      </div>
                      <div className="text-[10px] text-muted-soft leading-tight mt-0.5">ของนักศึกษาที่มาเรียนคาบนี้ทั้งหมด</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chart 4: Hourly Scan Peak Distribution Bar Chart */}
            <div className="bg-canvas border border-hairline rounded-lg p-5 shadow-sm space-y-4 transition-all hover:shadow-md">
              <div className="flex items-center justify-between border-b border-hairline pb-3">
                <h3 className="text-sm font-bold text-ink flex items-center space-x-2">
                  <Clock size={16} className="text-primary" />
                  <span>ช่วงเวลาที่มีการเช็กชื่อสแกนมากที่สุด (ทุกๆ 10 นาที)</span>
                </h3>
              </div>

              {!stats.scanDistribution || stats.scanDistribution.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-muted-soft">ยังไม่มีสถิติช่วงเวลาสแกนในคาบนี้</div>
              ) : (
                <div className="relative pt-4">
                  <svg viewBox="0 0 500 180" className="w-full overflow-visible">
                    {/* Y Grid lines */}
                    <line x1="40" y1="20" x2="480" y2="20" stroke="var(--hairline)" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="40" y1="60" x2="480" y2="60" stroke="var(--hairline)" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="40" y1="100" x2="480" y2="100" stroke="var(--hairline)" strokeWidth="0.5" strokeDasharray="3 3" />
                    <line x1="40" y1="140" x2="480" y2="140" stroke="var(--hairline)" strokeWidth="0.5" />

                    {(() => {
                      const distribution = stats.scanDistribution || [];
                      const maxCount = Math.max(...distribution.map(d => d.count), 1);
                      
                      // Dynamic Y labels based on maxCount
                      const label4 = maxCount;
                      const label3 = Math.round(maxCount * 0.75);
                      const label2 = Math.round(maxCount * 0.5);
                      const label1 = Math.round(maxCount * 0.25);

                      return (
                        <>
                          <text x="32" y="24" className="text-[9px] fill-muted font-bold text-right" textAnchor="end">{label4}</text>
                          <text x="32" y="64" className="text-[9px] fill-muted font-bold text-right" textAnchor="end">{label3}</text>
                          <text x="32" y="104" className="text-[9px] fill-muted font-bold text-right" textAnchor="end">{label2}</text>
                          <text x="32" y="144" className="text-[9px] fill-muted font-bold text-right" textAnchor="end">{label1}</text>
                        </>
                      );
                    })()}

                    {(() => {
                      const distribution = stats.scanDistribution || [];
                      const len = distribution.length;
                      const step = 420 / len;
                      const barWidth = Math.min(step * 0.5, 24);
                      const maxCount = Math.max(...distribution.map(d => d.count), 1);

                      return distribution.map((item, idx) => {
                        const centerX = 40 + idx * step + step / 2;
                        const barHeight = (item.count / maxCount) * 120;
                        const barY = 140 - barHeight;

                        return (
                          <g 
                            key={idx} 
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredScanIndex(idx)}
                            onMouseLeave={() => setHoveredScanIndex(null)}
                          >
                            <rect
                              x={centerX - step / 2}
                              y="10"
                              width={step}
                              height="130"
                              className="fill-primary/0 hover:fill-primary/[0.02] transition-colors"
                            />
                            
                            <rect
                              x={centerX - barWidth / 2}
                              y={barY}
                              width={barWidth}
                              height={Math.max(barHeight, 2)}
                              rx="2"
                              className="stroke-primary fill-primary/30 transition-all duration-300"
                              strokeWidth="1.5"
                            />

                            {/* Counter above bar */}
                            <text
                              x={centerX}
                              y={barY - 6}
                              className={`text-[9px] font-extrabold text-center transition-all ${
                                hoveredScanIndex === idx ? 'fill-primary font-black scale-110' : 'fill-muted-soft'
                              }`}
                              textAnchor="middle"
                            >
                              {item.count}
                            </text>

                            {/* X Axis timestamp */}
                            <text
                              x={centerX}
                              y="160"
                              className={`text-[9px] font-bold transition-all ${
                                hoveredScanIndex === idx ? 'fill-primary font-black' : 'fill-muted'
                              }`}
                              textAnchor="middle"
                            >
                              {item.time.replace(' น.', '')}
                            </text>
                          </g>
                        );
                      });
                    })()}
                  </svg>

                  {hoveredScanIndex !== null && stats.scanDistribution && stats.scanDistribution[hoveredScanIndex] && (
                    <div className="absolute top-0 right-4 bg-canvas border border-hairline p-2.5 rounded shadow-lg text-xs space-y-1 animate-in fade-in duration-150 z-10 min-w-[140px]">
                      <div className="font-bold text-ink">สถิติช่วงเวลาสแกน</div>
                      <div className="text-muted">ช่วงเวลา: {stats.scanDistribution[hoveredScanIndex].time}</div>
                      <div className="font-bold text-primary border-t border-hairline pt-1 mt-1">
                        เช็กชื่อเข้าเรียน: {stats.scanDistribution[hoveredScanIndex].count} คน
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* Present vs Absent Lists */}
      {stats && (
        <div className="bg-canvas border border-hairline rounded-lg overflow-hidden shadow-sm transition-all hover:shadow-md">
          {/* Tabs header */}
          <div className="border-b border-hairline bg-surface-soft px-4 sm:px-6 py-3 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="flex space-x-1.5 p-0.5 bg-surface-strong/30 rounded-lg self-start">
              <button
                onClick={() => setActiveTab('present')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  activeTab === 'present'
                    ? 'bg-canvas text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                เช็กชื่อแล้ว ({stats.totalPresent})
              </button>
              <button
                onClick={() => setActiveTab('absent')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  activeTab === 'absent'
                    ? 'bg-canvas text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                ยังไม่ได้เช็กชื่อ ({stats.totalAbsent})
              </button>
            </div>

            {/* List local search and export buttons */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-grow sm:w-64">
                <input
                  type="text"
                  value={localSearch}
                  onChange={e => setLocalSearch(e.target.value)}
                  placeholder="ค้นหารหัส หรือชื่อ..."
                  className="w-full h-8.5 border border-hairline rounded-md pl-8 pr-3 text-xs bg-canvas text-ink focus:outline-none focus:border-primary"
                />
                <Search size={12} className="absolute left-2.5 top-3 text-muted-soft" />
              </div>
              <button
                onClick={handleExportCSV}
                className="h-8.5 px-3 bg-surface-soft hover:bg-surface-strong border border-hairline text-ink text-xs font-bold rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer"
                title="ส่งออกรายงานเป็นไฟล์ CSV"
              >
                <Download size={14} />
                <span className="hidden sm:inline">ส่งออก CSV</span>
              </button>
            </div>
          </div>

          {/* List display */}
          <div className="overflow-x-auto">
            {activeTab === 'present' ? (
              // Present Students List
              filteredPresentList.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-soft">ไม่พบรายชื่อในกลุ่มตัวกรองนี้</div>
              ) : (
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-surface-soft/40 border-b border-hairline text-xs font-bold text-muted">
                      <th className="p-3 w-12 text-center">ลำดับ</th>
                      <th className="p-3 w-36">รหัสนักศึกษา</th>
                      <th className="p-3">ชื่อ-นามสกุล</th>
                      {selectedSessionId === 'all' && <th className="p-3 w-40">สัปดาห์กิจกรรม</th>}
                      <th className="p-3 w-28 text-center">ระดับชั้นปี</th>
                      <th className="p-3 w-24 text-center">สาขาวิชา</th>
                      <th className="p-3 w-20 text-center">ห้องเรียน</th>
                      <th className="p-3 w-32 text-center">เวลาลงชื่อ</th>
                      <th className="p-3 w-28 text-right">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline text-sm">
                    {filteredPresentList.map((student, idx) => (
                      <tr 
                        key={idx} 
                        className="hover:bg-surface-soft/20 transition-colors cursor-pointer"
                        onClick={() => handleOpenStudentHistory(student.student_id)}
                        title="คลิกเพื่อดูประวัติเข้าเรียนรายบุคคล"
                      >
                        <td className="p-3 text-center text-xs text-muted font-semibold">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-ink hover:underline">{student.student_id}</td>
                        <td className="p-3 font-semibold text-ink">{student.prefix || ''}{student.first_name} {student.last_name}</td>
                        {selectedSessionId === 'all' && (
                          <td className="p-3 text-xs text-ink truncate max-w-[160px]">
                            สัปดาห์ที่ {(student as any).week_number} • {(student as any).session_title}
                          </td>
                        )}
                        <td className="p-3 text-xs text-ink text-center font-bold">ปี {student.class_year}</td>
                        <td className="p-3 text-xs text-center font-bold text-primary uppercase">{student.major_code}</td>
                        <td className="p-3 text-xs text-muted text-center">ห้อง {student.room}</td>
                        <td className="p-3 text-xs font-mono text-ink text-center font-semibold">{formatTime(student.attended_at)}</td>
                        <td className="p-3 text-right">
                          <span className="inline-block text-[10px] font-bold bg-success/10 text-success px-2 py-0.5 rounded-full border border-success/20">
                            เข้าเรียนแล้ว
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              // Absent Students List
              filteredAbsentList.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-soft">ไม่พบคนขาดเรียนในกลุ่มตัวกรองนี้</div>
              ) : (
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-surface-soft/40 border-b border-hairline text-xs font-bold text-muted">
                      <th className="p-3 w-12 text-center">ลำดับ</th>
                      <th className="p-3 w-36">รหัสนักศึกษา</th>
                      <th className="p-3">ชื่อ-นามสกุล</th>
                      {selectedSessionId === 'all' && <th className="p-3 w-40">สัปดาห์กิจกรรม</th>}
                      <th className="p-3 w-28 text-center">ระดับชั้นปี</th>
                      <th className="p-3 w-24 text-center">สาขาวิชา</th>
                      <th className="p-3 w-20 text-center">ห้องเรียน</th>
                      <th className="p-3 w-32 text-right">เช็กชื่อแบบแมนนวล</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline text-sm">
                    {filteredAbsentList.map((student, idx) => (
                      <tr 
                        key={idx} 
                        className="hover:bg-surface-soft/20 transition-colors cursor-pointer"
                        onClick={() => handleOpenStudentHistory(student.student_id)}
                        title="คลิกเพื่อดูประวัติเข้าเรียนรายบุคคล"
                      >
                        <td className="p-3 text-center text-xs text-muted font-semibold">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-ink hover:underline">{student.student_id}</td>
                        <td className="p-3 font-semibold text-ink">{student.prefix || ''}{student.first_name} {student.last_name}</td>
                        {selectedSessionId === 'all' && (
                          <td className="p-3 text-xs text-ink truncate max-w-[160px]">
                            สัปดาห์ที่ {(student as any).week_number} • {(student as any).session_title}
                          </td>
                        )}
                        <td className="p-3 text-xs text-ink text-center font-bold">ปี {student.class_year}</td>
                        <td className="p-3 text-xs text-center font-bold text-primary uppercase">{student.major_code}</td>
                        <td className="p-3 text-xs text-muted text-center">ห้อง {student.room}</td>
                        <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleQuickCheckin(student)}
                            className="inline-flex items-center space-x-1 text-xs bg-primary hover:bg-primary-active text-white px-2.5 py-1 rounded.5 transition-all shadow-sm active:scale-95 cursor-pointer font-semibold"
                          >
                            <Plus size={12} />
                            <span>ลงชื่อเรียน</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </div>
      )}

      {/* Custom Confirm Modal for Dashboard Manual Check-in */}
      {confirmDialog.show && (
        <div className="fixed inset-0 bg-[#111111]/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-canvas border border-hairline rounded-lg w-full max-w-sm p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="space-y-2 text-center">
              <h3 className="font-bold text-lg text-ink">{confirmDialog.title}</h3>
              <p className="text-sm text-muted">{confirmDialog.message}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setConfirmDialog({ ...confirmDialog, show: false })}
                className="h-10 border border-hairline rounded-md text-sm font-semibold text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog({ ...confirmDialog, show: false });
                }}
                className="h-10 bg-primary hover:bg-primary-active text-white rounded-md text-sm font-semibold transition-colors cursor-pointer"
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Individual Student History Modal */}
      {selectedStudentHistory && (
        <div className="fixed inset-0 bg-[#111111]/45 backdrop-blur-sm z-[110] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-canvas border border-hairline rounded-lg w-full max-w-xl p-5 sm:p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 my-8">
            
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-hairline pb-3">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {selectedStudentHistory.student.is_temporary ? 'นักศึกษานอกบัญชีรายชื่อ' : 'ประวัตินักศึกษาในระบบ'}
                </span>
                <h3 className="font-extrabold text-lg text-ink">
                  {selectedStudentHistory.student.prefix || ''}{selectedStudentHistory.student.first_name} {selectedStudentHistory.student.last_name}
                </h3>
                <p className="text-xs font-semibold font-mono text-muted">
                  รหัสนักศึกษา: {selectedStudentHistory.student.student_id}
                </p>
              </div>
              <button 
                onClick={() => setSelectedStudentHistory(null)}
                className="text-muted hover:text-ink font-bold text-lg p-1 transition-colors cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                ✕
              </button>
            </div>

            {/* Student Info Details */}
            <div className="grid grid-cols-3 gap-3 text-xs bg-surface-soft/40 p-3 rounded-lg border border-hairline">
              <div>
                <span className="text-muted block font-semibold mb-0.5">ชั้นปี</span>
                <span className="font-bold text-ink">ชั้นปีที่ {selectedStudentHistory.student.class_year}</span>
              </div>
              <div>
                <span className="text-muted block font-semibold mb-0.5">สาขาวิชา</span>
                <span className="font-bold text-primary uppercase">{selectedStudentHistory.student.major_code}</span>
              </div>
              <div>
                <span className="text-muted block font-semibold mb-0.5">ห้องเรียน</span>
                <span className="font-bold text-ink">ห้อง {selectedStudentHistory.student.room}</span>
              </div>
            </div>

            {/* Stats Dashboard for individual student */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-success/5 border border-success/20 p-2.5 rounded-lg">
                <div className="text-xs font-semibold text-muted mb-0.5">อัตราเข้าเรียน</div>
                <div className="text-lg font-black text-success">{selectedStudentHistory.stats.attendanceRate}%</div>
              </div>
              <div className="bg-primary/5 border border-primary/20 p-2.5 rounded-lg">
                <div className="text-xs font-semibold text-muted mb-0.5 font-bold">เข้าเรียน (มา)</div>
                <div className="text-lg font-black text-primary">{selectedStudentHistory.stats.totalPresent} / {selectedStudentHistory.stats.totalSessions}</div>
              </div>
              <div className="bg-error/5 border border-error/20 p-2.5 rounded-lg">
                <div className="text-xs font-semibold text-muted mb-0.5 font-bold">ขาดเรียน (ขาด)</div>
                <div className="text-lg font-black text-error">{selectedStudentHistory.stats.totalAbsent} / {selectedStudentHistory.stats.totalSessions}</div>
              </div>
            </div>

            {/* Timeline Attendance History */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center space-x-1">
                <span>ประวัติการเช็กชื่อในแต่ละคาบกิจกรรม</span>
              </h4>
              
              <div className="border border-hairline rounded-lg overflow-hidden max-h-64 overflow-y-auto divide-y divide-hairline">
                {selectedStudentHistory.history.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-soft">ไม่มีประวัติคาบกิจกรรมในระบบ</div>
                ) : (
                  selectedStudentHistory.history.map((h, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 text-xs hover:bg-surface-soft/10 transition-colors">
                      <div className="space-y-0.5">
                        <div className="font-bold text-ink truncate max-w-[250px] sm:max-w-[320px]">
                          สัปดาห์ที่ {h.weekNumber} • {h.title}
                        </div>
                        <div className="text-[10px] text-muted-soft font-medium">
                          วันที่จัดกิจกรรม: {new Date(h.date).toLocaleDateString('th-TH')}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3 text-right">
                        {h.status === 'present' ? (
                          <>
                            <div className="text-[10px] text-muted-soft font-mono font-semibold">
                              {formatTime(h.attended_at || '')}
                            </div>
                            <span className="inline-flex items-center space-x-0.5 px-2 py-0.5 rounded-full font-bold bg-success/10 text-success border border-success/20">
                              <span>มา</span>
                            </span>
                          </>
                        ) : (
                          <span className="inline-flex items-center space-x-0.5 px-2 py-0.5 rounded-full font-bold bg-error/10 text-error border border-error/20">
                            <span>ขาด</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end pt-1">
              <button
                onClick={() => setSelectedStudentHistory(null)}
                className="h-9 px-5 bg-surface-soft hover:bg-surface-strong border border-hairline text-ink text-xs font-bold rounded-md transition-all cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading student history indicator */}
      {loadingHistory && (
        <div className="fixed inset-0 bg-[#111111]/30 backdrop-blur-xs z-[120] flex items-center justify-center">
          <div className="bg-canvas border border-hairline p-4 rounded-lg shadow-lg flex items-center space-x-3">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-bold text-ink">กำลังโหลดประวัตินักศึกษา...</span>
          </div>
        </div>
      )}

    </div>
  );
}
