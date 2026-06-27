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
  PieChart,
  Users,
  GraduationCap,
  LayoutDashboard
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
  class_year?: string;
  level?: string;
  year?: string;
  major_name?: string;
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
  const [level, setLevel] = useState<string>('');
  const [classYear, setClassYear] = useState<string>('');
  const [majorCode, setMajorCode] = useState<string>('');
  const [room, setRoom] = useState<string>('');
  const [gender, setGender] = useState<string>('');

  // Dropdown Master Data
  const [sessions, setSessions] = useState<Session[]>([]);
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [availableMajors, setAvailableMajors] = useState<string[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [availableRooms, setAvailableRooms] = useState<string[]>([]);

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
  const [trendLimit, setTrendLimit] = useState<number>(6);
  const [hoveredRoomIndex, setHoveredRoomIndex] = useState<number | null>(null);
  const [hoveredScanIndex, setHoveredScanIndex] = useState<number | null>(null);

  // Tab states for ratio display
  const [ratioTab, setRatioTab] = useState<'summary' | 'year' | 'major' | 'room' | 'gender'>('summary');

  const getGender = (prefix: string) => {
    const p = prefix || '';
    if (p === 'นาย' || p === 'เด็กชาย' || p === 'ด.ช.' || p === 'ด.ช') {
      return 'ชาย';
    }
    return 'หญิง';
  };

  // Concentric Donut Chart states and types
  const [hoveredPath, setHoveredPath] = useState<string[] | null>(null);
  const [hoveredSeg, setHoveredSeg] = useState<{ label: string; value: number; percentage: number; color: string } | null>(null);

  const [searchStudentId, setSearchStudentId] = useState('');

  const getSegmentColor = (status: 'present' | 'absent', path: string[], level: number) => {
    if (level === 1) {
      return status === 'present' ? '#10B981' : '#EF4444';
    }
    
    // Hash the path to get a stable random value
    const str = path.join('-');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    hash = Math.abs(hash);

    if (status === 'present') {
      // Greenish HSL: Hue between 135 and 185
      const h = 135 + (hash % 50);
      // Saturation: 65% - 85%
      const s = 65 + (hash % 20);
      // Lightness: 50%
      const l = 50 + (hash % 6);
      return `hsl(${h}, ${s}%, ${l}%)`;
    } else {
      // Redish HSL: Hue between 345 and 395 (wraps to 0-35)
      const h = (345 + (hash % 45)) % 360;
      // Saturation: 70% - 90%
      const s = 70 + (hash % 20);
      // Lightness: 52%
      const l = 52 + (hash % 6);
      return `hsl(${h}, ${s}%, ${l}%)`;
    }
  };

  const getSegmentsForTab = (tab: 'summary' | 'year' | 'major' | 'room' | 'gender') => {
    if (!stats) return [];

    const allStudents = [
      ...stats.presentList.map(s => ({ ...s, status: 'present' as const })),
      ...stats.absentList.map(s => ({ ...s, status: 'absent' as const }))
    ];

    const totalCount = allStudents.length;
    if (totalCount === 0) return [];

    const groupings: { [key: string]: { present: number; absent: number } } = {};

    allStudents.forEach(s => {
      let key = '';
      if (tab === 'summary') {
        key = s.status === 'present' ? 'เข้ากิจกรรม' : 'ไม่เข้ากิจกรรม';
      } else if (tab === 'year') {
        const yr = s.year || s.class_year;
        key = yr ? `ปี ${yr}` : 'ไม่ระบุ';
      } else if (tab === 'major') {
        key = s.major_code || 'ไม่ระบุ';
      } else if (tab === 'room') {
        const yr = s.year || s.class_year;
        key = s.room ? `${yr || ''}${s.major_code || ''}${s.room}` : 'ไม่ระบุ';
      } else if (tab === 'gender') {
        key = getGender(s.prefix);
      }

      if (!groupings[key]) {
        groupings[key] = { present: 0, absent: 0 };
      }

      if (s.status === 'present') {
        groupings[key].present++;
      } else {
        groupings[key].absent++;
      }
    });

    const segments: Array<{ label: string; status: 'present' | 'absent'; value: number; color: string; path: string[] }> = [];

    const groupEntries = Object.entries(groupings).sort((a, b) => a[0].localeCompare(b[0]));

    groupEntries.forEach(([groupName, counts]) => {
      if (tab === 'summary') {
        if (groupName === 'เข้ากิจกรรม' && counts.present > 0) {
          segments.push({
            label: 'เข้ากิจกรรม (Present)',
            status: 'present',
            value: counts.present,
            color: '#10B981',
            path: ['เข้ากิจกรรม']
          });
        } else if (groupName === 'ไม่เข้ากิจกรรม' && counts.absent > 0) {
          segments.push({
            label: 'ไม่เข้ากิจกรรม (Absent)',
            status: 'absent',
            value: counts.absent,
            color: '#EF4444',
            path: ['ไม่เข้ากิจกรรม']
          });
        }
      } else {
        if (counts.present > 0) {
          segments.push({
            label: `เข้ากิจกรรม (${groupName})`,
            status: 'present',
            value: counts.present,
            color: getSegmentColor('present', [groupName], 2),
            path: ['เข้ากิจกรรม', groupName]
          });
        }
        if (counts.absent > 0) {
          segments.push({
            label: `ไม่เข้ากิจกรรม (${groupName})`,
            status: 'absent',
            value: counts.absent,
            color: getSegmentColor('absent', [groupName], 2),
            path: ['ไม่เข้ากิจกรรม', groupName]
          });
        }
      }
    });

    let currentAngle = -90;
    return segments.map(seg => {
      const percentage = (seg.value / totalCount) * 100;
      const angle = (seg.value / totalCount) * 360;
      const startAngle = currentAngle;
      currentAngle += angle;
      return {
        ...seg,
        percentage: Math.round(percentage * 10) / 10,
        startAngle,
        angle
      };
    });
  };

  const formatPathLabel = (path: string[]) => {
    if (path.length <= 1) return path[0] || '';
    const status = path[0];
    const details = path.slice(1).join(' - ');
    return `${status} (${details})`;
  };

  // Fetch unique majors list for the filters
  const fetchMajors = async () => {
    try {
      const res = await axios.get('/api/majors');
      if (res.data) {
        const uniqueLevels = Array.from(new Set(res.data.map((m: any) => m.level))) as string[];
        setAvailableLevels(uniqueLevels.sort());

        const unique = Array.from(new Set(res.data.map((m: any) => m.major_code))) as string[];
        setAvailableMajors(unique.sort());

        const uniqueYears = Array.from(new Set(res.data.map((m: any) => m.year.toString()))) as string[];
        setAvailableYears(uniqueYears.sort((a, b) => a.localeCompare(b)));

        const uniqueRooms = Array.from(new Set(res.data.map((m: any) => m.room.toString()))) as string[];
        setAvailableRooms(uniqueRooms.sort((a, b) => a.localeCompare(b)));
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
          level: level || undefined,
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
  }, [selectedSessionId, level, classYear, majorCode, room, gender]);

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
    const sessionLabel = sessionObj ? `ครั้งที่ ${sessionObj.week_number}` : 'คาบกิจกรรมนี้';

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
            level: student.level || 'ปวช',
            year: student.year || student.class_year || '1',
            major_name: student.major_name || 'ไม่ระบุสาขา',
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

  const handleSearchStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchStudentId.trim()) return;
    handleOpenStudentHistory(searchStudentId.trim());
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
    setLevel('');
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
      ? ['ลำดับ', 'รหัสนักศึกษา', 'คำนำหน้า', 'ชื่อจริง', 'นามสกุล', 'ระดับชั้น', 'ชั้นปี', 'ชื่อย่อสาขา', 'ชื่อเต็มสาขา', 'กลุ่ม', 'เวลาเช็กชื่อ']
      : ['ลำดับ', 'รหัสนักศึกษา', 'คำนำหน้า', 'ชื่อจริง', 'นามสกุล', 'ระดับชั้น', 'ชั้นปี', 'ชื่อย่อสาขา', 'ชื่อเต็มสาขา', 'กลุ่ม'];

    const rows = dataToExport.map((s, idx) => {
      const yr = s.year || s.class_year;
      return activeTab === 'present'
        ? [
            idx + 1,
            `="${s.student_id}"`, // Force Excel string formatting
            s.prefix || '',
            s.first_name,
            s.last_name,
            s.level || 'ปวช',
            yr,
            s.major_code,
            s.major_name || '',
            s.room,
            formatTime(s.attended_at)
          ]
        : [
            idx + 1,
            `="${s.student_id}"`,
            s.prefix || '',
            s.first_name,
            s.last_name,
            s.level || 'ปวช',
            yr,
            s.major_code,
            s.major_name || '',
            s.room
          ];
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const fileLabel = selectedSessionId === 'all' 
      ? 'ทุกครั้ง' 
      : `ครั้งที่_${selectedSession ? selectedSession.week_number : ''}`;
    link.setAttribute("download", `รายงาน_${activeTab === 'present' ? 'คนเข้ากิจกรรม' : 'คนไม่เข้ากิจกรรม'}_${fileLabel}.csv`);
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
  const totalExpected = stats?.totalExpected || 0;
  const presentPercent = Math.min(totalExpected > 0 ? ((stats?.totalPresent || 0) / totalExpected) * 100 : 0, 100);

  // Average weekly calculations for All Weeks
  const numWeeks = sessions.length || 1;
  const uniqueExpected = Math.round(totalExpected / numWeeks);
  const avgPresent = Math.round((stats?.totalPresent || 0) / numWeeks);
  const avgAbsent = Math.round((stats?.totalAbsent || 0) / numWeeks);

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
            ตรวจสอบอัตราการเข้าร่วมกิจกรรมครั้งปัจจุบัน วิเคราะห์แนวโน้ม ค้นหาและคัดกรองข้อมูลอย่างละเอียด
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

      {/* 🔍 ระบบตรวจสอบการเช็กชื่อรายบุคคล */}
      <div className="bg-canvas border border-hairline rounded-lg p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-ink flex items-center space-x-2">
          <Search size={16} className="text-primary" />
          <span>ตรวจสอบประวัติการเช็กชื่อนักศึกษารายบุคคล</span>
        </h3>
        <form onSubmit={handleSearchStudent} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-grow">
            <input 
              type="text" 
              value={searchStudentId}
              onChange={e => setSearchStudentId(e.target.value)}
              className="w-full h-11 border border-hairline rounded-md px-3.5 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
              placeholder="กรอกรหัสนักศึกษา 11 หลัก เช่น 64012345678" 
            />
          </div>
          <button 
            type="submit" 
            className="h-11 bg-primary hover:bg-primary-active text-white px-6 rounded-md text-sm font-semibold flex items-center justify-center space-x-2 transition-all active:scale-98 cursor-pointer"
          >
            <Search size={15} />
            <span>ตรวจสอบสถิติ</span>
          </button>
        </form>
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
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Week Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink">ครั้งที่กิจกรรม</label>
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
              <option value="all">ทุกครั้ง (All Weeks)</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  ครั้งที่ {s.week_number} • {s.title}
                </option>
              ))}
              {sessions.length === 0 && <option value="">ไม่มีคาบกิจกรรมในระบบ</option>}
            </select>
          </div>

          {/* Level Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink">ระดับชั้น</label>
            <select
              value={level}
              onChange={e => setLevel(e.target.value)}
              className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="">ทั้งหมด</option>
              {availableLevels.map(lvl => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
          </div>

          {/* Class Year */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink">ชั้นปี</label>
            <select
              value={classYear}
              onChange={e => setClassYear(e.target.value)}
              className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="">ทั้งหมด</option>
              {availableYears.map(year => (
                <option key={year} value={year}>ปี {year}</option>
              ))}
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
            <label className="block text-xs font-semibold text-ink">กลุ่มเรียน (ห้อง)</label>
            <select
              value={room}
              onChange={e => setRoom(e.target.value)}
              className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="">ทั้งหมด</option>
              {availableRooms.map(r => (
                <option key={r} value={r}>กลุ่ม {r}</option>
              ))}
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
        <>
        {/* All-weeks mode info banner */}
        {selectedSessionId === 'all' && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
              <span className="font-bold">โหมดภาพรวมทุกครั้ง:</span>{' '}
              ตัวเลขที่แสดงคือ <span className="font-semibold">ยอดสะสม (คน × ครั้ง)</span> ไม่ใช่จำนวนนักศึกษาจริง{' '}
              เช่น 35 คน × {sessions.length} ครั้ง = {35 * sessions.length} คน-ครั้ง ·{' '}
              ดูค่า <span className="font-semibold">"เฉลี่ยต่อครั้ง"</span> เพื่อเปรียบเทียบจำนวนคนต่อคาบ
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {/* Radial Attendance Circle Card */}
          <div className="bg-canvas border border-hairline rounded-lg p-5 flex items-center justify-between shadow-sm transition-all hover:shadow-md">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted block">อัตราการเข้าเรียน</span>
              <div className="text-3xl font-extrabold text-ink">{stats.attendanceRate}%</div>
              <div className="text-[11px] text-muted-soft">
                {selectedSessionId === 'all' ? 'สะสมจากทุกคาบกิจกรรม' : 'ของนักเรียนทั้งหมดตามตัวกรอง'}
              </div>
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
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                {selectedSessionId === 'all' ? 'เฉลี่ยต่อครั้ง' : 'สรุปจำนวนผู้เข้าร่วม'}
              </span>
              <span className="p-1.5 bg-success/10 text-success rounded-full"><UserCheck size={14} /></span>
            </div>
            
            <div className="grid grid-cols-3 gap-2 mt-4 pt-2">
              {/* Present */}
              <div className="text-center border-r border-hairline">
                <div className="text-xl font-extrabold text-success">
                  {selectedSessionId === 'all' ? avgPresent : stats.totalPresent}
                </div>
                <div className="text-[10px] text-muted-soft uppercase font-bold">เข้ากิจกรรม (คน)</div>
                {selectedSessionId === 'all' && (
                  <div className="text-[9px] text-muted-soft mt-0.5">
                    รวม {stats.totalPresent} คน-ครั้ง
                  </div>
                )}
              </div>
              {/* Absent */}
              <div className="text-center border-r border-hairline">
                <div className="text-xl font-extrabold text-error">
                  {selectedSessionId === 'all' ? avgAbsent : stats.totalAbsent}
                </div>
                <div className="text-[10px] text-muted-soft uppercase font-bold">ไม่เข้ากิจกรรม (คน)</div>
                {selectedSessionId === 'all' && (
                  <div className="text-[9px] text-muted-soft mt-0.5">
                    รวม {stats.totalAbsent} คน-ครั้ง
                  </div>
                )}
              </div>
              {/* Total */}
              <div className="text-center">
                <div className="text-xl font-extrabold text-ink">
                  {selectedSessionId === 'all' ? uniqueExpected : stats.totalExpected}
                </div>
                <div className="text-[10px] text-muted-soft uppercase font-bold">ทั้งหมด (คน)</div>
                {selectedSessionId === 'all' && (
                  <div className="text-[9px] text-muted-soft mt-0.5">
                    รวม {stats.totalExpected} คน-ครั้ง
                  </div>
                )}
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
                  ? 'ทุกครั้งรวมกัน' 
                  : `ครั้งที่ ${selectedSession ? selectedSession.week_number : '-'} • ${selectedSession ? selectedSession.title : '-'}`}
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
              <span className="text-[10px] font-semibold text-muted-soft bg-surface-soft px-1.5 py-0.5 rounded border border-hairline">เข้ากิจกรรม %</span>
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
        </>
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
              <div className="flex items-center justify-between border-b border-hairline pb-3 gap-3">
                <h3 className="text-sm font-bold text-ink flex items-center space-x-2 shrink-0">
                  <TrendingUp size={16} className="text-primary" />
                  <span>แนวโน้มการเช็กชื่อเข้ากิจกรรม</span>
                </h3>
                {/* Trend limit slider — top-right of card */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] text-muted whitespace-nowrap">ย้อนหลัง</span>
                  <input
                    id="trend-limit-slider"
                    type="range"
                    min={1}
                    max={Math.max(1, stats?.weeklyTrend.length ?? 1)}
                    value={Math.min(trendLimit, Math.max(1, stats?.weeklyTrend.length ?? 1))}
                    onChange={e => {
                      setTrendLimit(Number(e.target.value));
                      setHoveredTrendIndex(null);
                    }}
                    className="w-24 accent-primary cursor-pointer"
                    style={{ height: '4px' }}
                  />
                  <span className="text-[11px] font-bold text-primary whitespace-nowrap font-mono">
                    {trendLimit >= (stats?.weeklyTrend.length ?? 1)
                      ? `ทั้งหมด (${stats?.weeklyTrend.length ?? 0})`
                      : `${trendLimit} คาบ`}
                  </span>
                </div>
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
                      const sliced = stats.weeklyTrend.slice(-Math.min(trendLimit, stats.weeklyTrend.length));
                      const len = sliced.length;
                      const points = sliced.map((t, idx) => {
                        const step = len > 1 ? 440 / (len - 1) : 440;
                        const x = 40 + idx * step;
                        const y = 140 - (Math.min(t.rate, 100) / 100) * 120;
                        const diff = idx > 0 ? t.rate - sliced[idx - 1].rate : 0;
                        return { x, y, data: t, diff };
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
                              
                              {/* Stock change indicator label (for index >= 1) */}
                              {idx >= 1 && (
                                <text
                                  x={p.x}
                                  y={p.y - 11}
                                  className="text-[9px] font-black text-center select-none"
                                  textAnchor="middle"
                                  fill={p.diff > 0 ? '#10B981' : p.diff < 0 ? '#EF4444' : '#6B7280'}
                                >
                                  {p.diff > 0 ? '▲ +' : p.diff < 0 ? '▼ ' : ''}
                                  {Math.round(p.diff * 10) / 10}%
                                </text>
                              )}
                              
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
                  {hoveredTrendIndex !== null && (() => {
                    const slicedForTooltip = stats.weeklyTrend.slice(-Math.min(trendLimit, stats.weeklyTrend.length));
                    const hovered = slicedForTooltip[hoveredTrendIndex];
                    if (!hovered) return null;
                    return (
                    <div className="absolute top-0 right-4 bg-canvas border border-hairline p-2.5 rounded shadow-lg text-xs space-y-1.5 animate-in fade-in duration-150 z-10 min-w-[170px] max-w-[220px]">
                      <div className="font-bold text-ink">ครั้งที่ {hovered.weekNumber}</div>
                      <div className="text-muted truncate text-[11px] pb-1 border-b border-hairline">{hovered.title}</div>
                      <div className="flex justify-between items-center gap-4 pt-1 font-semibold">
                        <span className="text-muted">อัตราเข้ากิจกรรม:</span>
                        <span className="text-ink font-mono font-bold text-sm">{hovered.rate}%</span>
                      </div>
                      {hoveredTrendIndex > 0 && (() => {
                        const prevRate = slicedForTooltip[hoveredTrendIndex - 1].rate;
                        const currRate = hovered.rate;
                        const diff = currRate - prevRate;
                        const isUp = diff > 0;
                        const isDown = diff < 0;
                        return (
                          <div className="flex justify-between items-center gap-4 font-bold text-[11px]">
                            <span className="text-muted font-normal">เปรียบเทียบคาบก่อน:</span>
                            <span 
                              className="font-mono flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm text-[10px]"
                              style={{ 
                                color: isUp ? '#10B981' : isDown ? '#EF4444' : '#6B7280',
                                backgroundColor: isUp ? 'rgba(16, 185, 129, 0.1)' : isDown ? 'rgba(239, 68, 68, 0.1)' : 'rgba(107, 114, 128, 0.1)'
                              }}
                            >
                              {isUp ? '▲ +' : isDown ? '▼ ' : ''}
                              {Math.round(diff * 10) / 10}%
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Chart 2: Single Donut Chart with Folder Tabs */}
            <div className="bg-canvas border border-hairline rounded-lg shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md">
              {/* Folder Tabs (Tab แบบแฟ้ม) */}
              <div className="flex border-b border-hairline bg-surface-soft/40 px-2 pt-2 gap-1 overflow-x-auto scrollbar-none">
                <button
                  onClick={() => { setRatioTab('summary'); setHoveredPath(null); setHoveredSeg(null); }}
                  className={`px-2.5 py-2 text-[11px] font-bold rounded-t-lg border-t border-x transition-all flex items-center space-x-1 cursor-pointer -mb-px whitespace-nowrap ${
                    ratioTab === 'summary'
                      ? 'bg-canvas border-hairline text-primary border-t-2 border-t-primary font-extrabold shadow-sm'
                      : 'bg-transparent border-transparent text-muted hover:text-ink hover:bg-surface-soft'
                  }`}
                >
                  <PieChart size={13} />
                  <span>1. ภาพรวม</span>
                </button>
                <button
                  onClick={() => { setRatioTab('year'); setHoveredPath(null); setHoveredSeg(null); }}
                  className={`px-2.5 py-2 text-[11px] font-bold rounded-t-lg border-t border-x transition-all flex items-center space-x-1 cursor-pointer -mb-px whitespace-nowrap ${
                    ratioTab === 'year'
                      ? 'bg-canvas border-hairline text-primary border-t-2 border-t-primary font-extrabold shadow-sm'
                      : 'bg-transparent border-transparent text-muted hover:text-ink hover:bg-surface-soft'
                  }`}
                >
                  <GraduationCap size={13} />
                  <span>2. ชั้นปี</span>
                </button>
                <button
                  onClick={() => { setRatioTab('major'); setHoveredPath(null); setHoveredSeg(null); }}
                  className={`px-2.5 py-2 text-[11px] font-bold rounded-t-lg border-t border-x transition-all flex items-center space-x-1 cursor-pointer -mb-px whitespace-nowrap ${
                    ratioTab === 'major'
                      ? 'bg-canvas border-hairline text-primary border-t-2 border-t-primary font-extrabold shadow-sm'
                      : 'bg-transparent border-transparent text-muted hover:text-ink hover:bg-surface-soft'
                  }`}
                >
                  <Building size={13} />
                  <span>3. สาขา</span>
                </button>
                <button
                  onClick={() => { setRatioTab('room'); setHoveredPath(null); setHoveredSeg(null); }}
                  className={`px-2.5 py-2 text-[11px] font-bold rounded-t-lg border-t border-x transition-all flex items-center space-x-1 cursor-pointer -mb-px whitespace-nowrap ${
                    ratioTab === 'room'
                      ? 'bg-canvas border-hairline text-primary border-t-2 border-t-primary font-extrabold shadow-sm'
                      : 'bg-transparent border-transparent text-muted hover:text-ink hover:bg-surface-soft'
                  }`}
                >
                  <LayoutDashboard size={13} />
                  <span>4. กลุ่มเรียน</span>
                </button>
                <button
                  onClick={() => { setRatioTab('gender'); setHoveredPath(null); setHoveredSeg(null); }}
                  className={`px-2.5 py-2 text-[11px] font-bold rounded-t-lg border-t border-x transition-all flex items-center space-x-1 cursor-pointer -mb-px whitespace-nowrap ${
                    ratioTab === 'gender'
                      ? 'bg-canvas border-hairline text-primary border-t-2 border-t-primary font-extrabold shadow-sm'
                      : 'bg-transparent border-transparent text-muted hover:text-ink hover:bg-surface-soft'
                  }`}
                >
                  <Users size={13} />
                  <span>5. เพศ</span>
                </button>
              </div>

              <div className="p-5 flex-grow flex flex-col justify-between space-y-4">
                {totalExpected === 0 ? (
                  <div className="h-56 flex items-center justify-center text-xs text-muted-soft">ไม่มีรายชื่อที่จะแสดงสัดส่วน</div>
                ) : (
                  <div key={ratioTab} className="flex flex-col sm:flex-row items-center justify-around py-4 gap-6 tab-content-anim">
                    {/* The Single Donut Chart */}
                    {(() => {
                      const segments = getSegmentsForTab(ratioTab);
                      const radius = 48;
                      const circ = 2 * Math.PI * radius; // 301.6
                      
                      return (
                        <div className="relative w-48 h-48 flex items-center justify-center flex-shrink-0">
                          <svg viewBox="0 0 120 120" className="w-full h-full transform -rotate-90 overflow-visible">
                            {segments.map((seg) => {
                              const offset = circ - (seg.percentage / 100) * circ;
                              const pathKey = seg.path.join('-');
                              const isHovered = hoveredPath !== null && pathKey === hoveredPath.join('-');
                              
                              // Determine opacity
                              let opacity = 1.0;
                              if (hoveredPath !== null && !isHovered) {
                                opacity = 0.35;
                              }

                              // Determine stroke width
                              const strokeWidth = isHovered ? 13 : 9.5;

                              return (
                                <circle
                                  key={`${ratioTab}-${pathKey}`}
                                  cx="60"
                                  cy="60"
                                  r={radius}
                                  className="fill-none cursor-pointer animate-draw-circle transition-all duration-300 ease-out"
                                  stroke={seg.color}
                                  strokeWidth={strokeWidth}
                                  strokeDasharray={circ}
                                  strokeDashoffset={offset}
                                  transform={`rotate(${seg.startAngle} 60 60)`}
                                  style={{ opacity, '--circ': `${circ}px`, '--target-offset': `${offset}px` } as React.CSSProperties}
                                  onMouseEnter={() => {
                                    setHoveredPath(seg.path);
                                    setHoveredSeg({
                                      label: formatPathLabel(seg.path),
                                      value: seg.value,
                                      percentage: seg.percentage,
                                      color: seg.color
                                    });
                                  }}
                                  onMouseLeave={() => {
                                    setHoveredPath(null);
                                    setHoveredSeg(null);
                                  }}
                                />
                              );
                            })}
                          </svg>

                          {/* Center Details */}
                          <div className="absolute text-center select-none pointer-events-none px-4 w-full">
                            {hoveredSeg ? (
                              <div className="animate-in fade-in duration-100 flex flex-col items-center justify-center">
                                <div 
                                  className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full mb-1 text-white border shadow-xs text-center max-w-[120px] truncate"
                                  style={{ backgroundColor: hoveredSeg.color, borderColor: 'rgba(0,0,0,0.1)' }}
                                >
                                  {hoveredSeg.label.split(' (')[0]}
                                </div>
                                <div className="text-[8px] font-bold text-muted truncate max-w-[110px] leading-tight mb-0.5">
                                  {hoveredSeg.label.includes(' (') ? hoveredSeg.label.substring(hoveredSeg.label.indexOf('(')) : ''}
                                </div>
                                <div className="text-xl font-black text-ink leading-tight">
                                  {hoveredSeg.percentage}%
                                </div>
                                {selectedSessionId === 'all' ? (
                                  <div className="text-[7.5px] text-muted-soft font-bold leading-tight">
                                    <div>เฉลี่ย {Math.round(hoveredSeg.value / numWeeks)} จาก {uniqueExpected} คน</div>
                                    <div className="text-[6.5px] font-medium opacity-80">({numWeeks} ครั้ง: {hoveredSeg.value}/{totalExpected} คน-ครั้ง)</div>
                                  </div>
                                ) : (
                                  <div className="text-[8px] text-muted-soft font-semibold leading-normal">
                                    {hoveredSeg.value} จาก {totalExpected} คน
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <div className="text-[9px] font-bold text-muted uppercase">เข้ากิจกรรมรวม</div>
                                <div className="text-2xl font-black text-ink">{Math.round(presentPercent)}%</div>
                                {selectedSessionId === 'all' ? (
                                  <div className="text-[7.5px] text-muted-soft font-bold leading-tight">
                                    <div>เฉลี่ย {avgPresent} / {uniqueExpected} คน</div>
                                    <div className="text-[6.5px] font-medium opacity-80">({numWeeks} ครั้ง: {stats.totalPresent}/{totalExpected} คน-ครั้ง)</div>
                                  </div>
                                ) : (
                                  <div className="text-[9px] text-muted-soft font-semibold">{stats.totalPresent} / {totalExpected} คน</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Legends & Details list */}
                    <div className="flex-grow max-h-[220px] overflow-y-auto space-y-2 pr-1 py-1 w-full sm:max-w-[320px] scrollbar-thin">
                      {(() => {
                        const segments = getSegmentsForTab(ratioTab);
                        if (segments.length === 0) {
                          return <div className="text-center py-8 text-xs text-muted-soft">ไม่มีสถิติสำหรับกลุ่มนี้</div>;
                        }

                        return segments.map((seg) => {
                          const pathKey = seg.path.join('-');
                          const isHovered = hoveredPath !== null && pathKey === hoveredPath.join('-');

                          return (
                            <div
                              key={`${ratioTab}-${pathKey}`}
                              className={`p-2 rounded-md border transition-all duration-150 flex flex-col space-y-1 text-xs cursor-pointer ${
                                isHovered
                                  ? 'bg-surface-soft border-primary/20 scale-[1.01] shadow-sm font-semibold'
                                  : 'bg-transparent border-transparent hover:bg-surface-soft/40'
                              }`}
                              onMouseEnter={() => {
                                setHoveredPath(seg.path);
                                setHoveredSeg({
                                  label: formatPathLabel(seg.path),
                                  value: seg.value,
                                  percentage: seg.percentage,
                                  color: seg.color
                                });
                              }}
                              onMouseLeave={() => {
                                setHoveredPath(null);
                                setHoveredSeg(null);
                              }}
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform duration-200"
                                  style={{
                                    backgroundColor: seg.color,
                                    transform: isHovered ? 'scale(1.2)' : 'none'
                                  }}
                                ></span>
                                <span className="text-ink font-bold truncate">
                                  {formatPathLabel(seg.path)}
                                </span>
                              </div>
                              <div className="font-mono text-muted text-[10px] pl-[18px]">
                                {selectedSessionId === 'all' ? (
                                  <span>
                                    เฉลี่ย {Math.round(seg.value / numWeeks)}/{uniqueExpected} คน ({numWeeks} ครั้ง: {seg.value}/{totalExpected} คน-ครั้ง) ({seg.percentage}%)
                                  </span>
                                ) : (
                                  <span>
                                    {seg.value} จากทั้งหมด {totalExpected} คน ({seg.percentage}%)
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>
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
                        <span className="font-bold text-success">{stats.roomStats[hoveredRoomIndex].present} {selectedSessionId === 'all' ? 'คน-ครั้ง' : 'คน'}</span>
                      </div>
                      <div className="flex justify-between text-muted-soft">
                        <span>ไม่เข้ากิจกรรม:</span>
                        <span className="font-bold text-error">{stats.roomStats[hoveredRoomIndex].absent} {selectedSessionId === 'all' ? 'คน-ครั้ง' : 'คน'}</span>
                      </div>
                      <div className="flex justify-between text-muted-soft font-semibold border-b border-hairline pb-1 mb-1">
                        <span>ในบัญชีรายชื่อ:</span>
                        <span>{stats.roomStats[hoveredRoomIndex].expected} {selectedSessionId === 'all' ? 'คน-ครั้ง' : 'คน'}</span>
                      </div>
                      <div className="flex justify-between text-ink text-[11px] font-bold">
                        <span>สัดส่วนในกลุ่มผู้เรียนคลาสนี้:</span>
                        <span className="text-primary">{stats.totalPresent > 0 ? Math.round((stats.roomStats[hoveredRoomIndex].present / stats.totalPresent) * 100) : 0}%</span>
                      </div>
                      <div className="text-[10px] text-muted-soft leading-tight mt-0.5">ของนักศึกษาที่เข้ากิจกรรมคาบนี้ทั้งหมด</div>
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
                  <span>ช่วงเวลาที่มีการเช็กชื่อสแกนมากที่สุด (ทุกๆ 1 นาที)</span>
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
                        เช็กชื่อเข้าเรียน: {stats.scanDistribution[hoveredScanIndex].count} {selectedSessionId === 'all' ? 'คน-ครั้ง' : 'คน'}
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

          {/* List Local Filters Bar */}
          <div className="bg-surface-soft/20 border-b border-hairline px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-muted uppercase tracking-wider text-[10px]">ตัวกรองรายชื่อ:</span>
              
              {/* Level */}
              <div className="flex items-center space-x-1.5">
                <span className="text-muted">ระดับชั้น:</span>
                <select
                  value={level}
                  onChange={e => setLevel(e.target.value)}
                  className="h-8 border border-hairline rounded-md px-2 bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer text-xs"
                >
                  <option value="">ทั้งหมด</option>
                  {availableLevels.map(lvl => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                </select>
              </div>

              {/* Class Year */}
              <div className="flex items-center space-x-1.5">
                <span className="text-muted">ชั้นปี:</span>
                <select
                  value={classYear}
                  onChange={e => setClassYear(e.target.value)}
                  className="h-8 border border-hairline rounded-md px-2 bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer text-xs"
                >
                  <option value="">ทั้งหมด</option>
                  {availableYears.map(year => (
                    <option key={year} value={year}>ปี {year}</option>
                  ))}
                </select>
              </div>

              {/* Major */}
              <div className="flex items-center space-x-1.5">
                <span className="text-muted">สาขา:</span>
                <select
                  value={majorCode}
                  onChange={e => setMajorCode(e.target.value)}
                  className="h-8 border border-hairline rounded-md px-2 bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer text-xs uppercase"
                >
                  <option value="">ทั้งหมด</option>
                  {availableMajors.map(major => (
                    <option key={major} value={major}>{major}</option>
                  ))}
                </select>
              </div>

              {/* Room */}
              <div className="flex items-center space-x-1.5">
                <span className="text-muted">กลุ่ม:</span>
                <select
                  value={room}
                  onChange={e => setRoom(e.target.value)}
                  className="h-8 border border-hairline rounded-md px-2 bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer text-xs"
                >
                  <option value="">ทั้งหมด</option>
                  {availableRooms.map(r => (
                    <option key={r} value={r}>กลุ่ม {r}</option>
                  ))}
                </select>
              </div>

              {/* Gender */}
              <div className="flex items-center space-x-1.5">
                <span className="text-muted">เพศ:</span>
                <select
                  value={gender}
                  onChange={e => setGender(e.target.value)}
                  className="h-8 border border-hairline rounded-md px-2 bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer text-xs"
                >
                  <option value="">ทั้งหมด</option>
                  <option value="male">ชาย</option>
                  <option value="female">หญิง</option>
                </select>
              </div>
            </div>

            {(classYear || majorCode || room || gender) && (
              <button
                onClick={handleClearFilters}
                className="text-xs font-bold text-primary hover:text-primary-active flex items-center space-x-1 transition-colors cursor-pointer"
              >
                <RotateCcw size={11} />
                <span>ล้างตัวกรอง</span>
              </button>
            )}
          </div>

          {/* List display */}
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto scrollbar-thin">
            {activeTab === 'present' ? (
              // Present Students List
              filteredPresentList.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-soft">ไม่พบรายชื่อในกลุ่มตัวกรองนี้</div>
              ) : (
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead className="sticky top-0 bg-surface-soft z-10">
                    <tr className="border-b border-hairline text-xs font-bold text-muted">
                      <th className="p-3 w-12 text-center">ลำดับ</th>
                      <th className="p-3 w-36">รหัสนักศึกษา</th>
                      <th className="p-3">ชื่อ-นามสกุล</th>
                      {selectedSessionId === 'all' && <th className="p-3 w-40">ครั้งที่กิจกรรม</th>}
                      <th className="p-3 text-center">กลุ่มเรียน / สาขาวิชา</th>
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
                            ครั้งที่ {(student as any).week_number} • {(student as any).session_title}
                          </td>
                        )}
                        <td className="p-3 text-xs text-ink text-center">
                          <span className="font-bold">{student.year || student.class_year}{student.major_code}{student.room}</span>
                          <div className="text-[10px] text-muted-soft mt-0.5">{student.level} • {student.major_name || ''}</div>
                        </td>
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
                <div className="p-12 text-center text-xs text-muted-soft">ไม่พบคนไม่เข้ากิจกรรมในกลุ่มตัวกรองนี้</div>
              ) : (
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead className="sticky top-0 bg-surface-soft z-10">
                    <tr className="border-b border-hairline text-xs font-bold text-muted">
                      <th className="p-3 w-12 text-center">ลำดับ</th>
                      <th className="p-3 w-36">รหัสนักศึกษา</th>
                      <th className="p-3">ชื่อ-นามสกุล</th>
                      {selectedSessionId === 'all' && <th className="p-3 w-40">ครั้งที่กิจกรรม</th>}
                      <th className="p-3 text-center">กลุ่มเรียน / สาขาวิชา</th>
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
                            ครั้งที่ {(student as any).week_number} • {(student as any).session_title}
                          </td>
                        )}
                        <td className="p-3 text-xs text-ink text-center">
                          <span className="font-bold">{student.year || student.class_year}{student.major_code}{student.room}</span>
                          <div className="text-[10px] text-muted-soft mt-0.5">{student.level} • {student.major_name || ''}</div>
                        </td>
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
                <span className="text-muted block font-semibold mb-0.5">กลุ่มเรียน</span>
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
                <div className="text-xs font-semibold text-muted mb-0.5 font-bold">ไม่เข้ากิจกรรม (ขาด)</div>
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
                          ครั้งที่ {h.weekNumber} • {h.title}
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
