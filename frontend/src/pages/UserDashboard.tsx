import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Search, Calendar, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';

const formatThaiDate = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[2]);
      const date = new Date(year, month, day);
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  } catch (e) {
    console.error('Error formatting date:', e);
  }
  return dateStr;
};

export default function UserDashboard() {
  const [searchParams] = useSearchParams();
  const [studentId, setStudentId] = useState('');
  const [searched, setSearched] = useState(false);
  
  // Dynamic fetch states
  const [records, setRecords] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = searchParams.get('id');
    if (id && /^\d{11}$/.test(id)) {
      setStudentId(id);
      performSearch(id);
    }
  }, [searchParams]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(studentId);
  };

  const performSearch = async (id: string) => {
    setLoading(true);
    setError('');
    setSearched(false);
    setStudentProfile(null);
    
    if (!/^\d{11}$/.test(id)) {
      setError('รหัสนักศึกษาต้องเป็นตัวเลข 11 หลักเท่านั้น');
      setLoading(false);
      return;
    }

    try {
      const [sessionsRes, attendancesRes, profileRes] = await Promise.all([
        axios.get('/api/sessions'),
        axios.get(`/api/attendances/student/${id}`),
        axios.get(`/api/students/${id}`).catch(() => ({ data: null }))
      ]);
      setSessions(sessionsRes.data || []);
      setRecords(attendancesRes.data || []);
      setStudentProfile(profileRes.data);
      setSearched(true);
    } catch (err) {
      console.error(err);
      setError('เกิดข้อผิดพลาดในการดึงข้อมูลประวัติการเช็กชื่อ');
    }
    setLoading(false);
  };

  // Process timeline
  const timeline = sessions.map(session => {
    const match = records.find(r => r.session_id === session.id);
    return {
      week: session.week_number,
      title: session.title,
      date: session.date,
      status: match ? 'attended' : 'missed',
      attended_at: match ? match.attended_at : null
    };
  });

  const totalSessionsCount = sessions.length;
  const attendedCount = timeline.filter(t => t.status === 'attended').length;
  const missedCount = totalSessionsCount - attendedCount;
  const rate = totalSessionsCount > 0 ? parseFloat(((attendedCount / totalSessionsCount) * 100).toFixed(1)) : 0;

  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-between">
      {/* Navigation Header */}
      <header className="sticky top-0 bg-canvas/80 backdrop-blur-md border-b border-hairline w-full z-40">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <img src="/logo.svg" alt="AAS Logo" className="w-6 h-6 object-contain" />
            <span className="font-extrabold text-base text-ink tracking-tight">AAS</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-lg w-full mx-auto px-6 py-12 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold text-ink tracking-tight">
            ตรวจสอบการเช็กชื่อ
          </h1>
          <p className="text-muted text-sm max-w-sm mx-auto">
            กรอกรหัสนักศึกษาของคุณเพื่อค้นหาประวัติการสแกนเช็กชื่อรายครั้งและสถิติภาพรวมทั้งหมด
          </p>
        </div>

        {/* Search Input Form */}
        <form onSubmit={handleSearchSubmit} className="bg-canvas border border-hairline rounded-lg p-5 shadow-[0_4px_12px_rgba(0,0,0,0.02)] space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink uppercase tracking-wider">
              รหัสนักศึกษา 11 หลัก
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input 
                type="text" 
                required
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                className="flex-grow h-11 border border-hairline rounded-md px-3.5 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
                placeholder="เช่น 64012345678" 
              />
              <button 
                type="submit" 
                disabled={loading}
                className="h-11 bg-primary hover:bg-primary-active text-white px-6 rounded-md text-sm font-semibold flex items-center justify-center space-x-2 transition-all active:scale-98 cursor-pointer disabled:bg-surface-strong"
              >
                <Search size={15} />
                <span>{loading ? 'กำลังค้นหา...' : 'ค้นหาข้อมูล'}</span>
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="flex items-center space-x-2 p-3 bg-error/15 border border-error/30 text-error text-xs font-semibold rounded-md animate-in fade-in duration-200">
            <ShieldAlert size={16} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Search Results */}
        {searched && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Summary Card */}
            <div className="bg-canvas border border-hairline rounded-lg p-6 space-y-6 shadow-[0_6px_20px_rgba(0,0,0,0.03)]">
              <div>
                <span className="text-[10px] bg-surface-soft border border-hairline text-muted font-mono px-2 py-0.5 rounded">
                  ประวัตินักศึกษา
                </span>
                <h2 className="text-xl font-bold text-ink mt-2">แฟ้มข้อมูลสำหรับรหัส {studentId}</h2>
                {studentProfile ? (
                  <div className="text-xs text-muted-soft mt-2 space-y-1 bg-surface-soft border border-hairline p-3 rounded-md">
                    <div>
                      ชื่อ-นามสกุล: <span className="font-semibold text-ink">{studentProfile.prefix || ''}{studentProfile.first_name} {studentProfile.last_name}</span>
                    </div>
                    <div>
                      กลุ่มเรียน: <span className="font-semibold text-ink">{studentProfile.year || studentProfile.class_year}{studentProfile.major_code}{studentProfile.room}</span> ({studentProfile.level} • {studentProfile.major_name})
                    </div>
                  </div>
                ) : records.length > 0 ? (
                  <div className="text-xs text-muted-soft mt-2 space-y-1 bg-surface-soft border border-hairline p-3 rounded-md">
                    <div>
                      ชื่อ-นามสกุล: <span className="font-semibold text-ink">{records[0].prefix || ''}{records[0].first_name} {records[0].last_name}</span>
                    </div>
                    <div>
                      กลุ่มเรียน: <span className="font-semibold text-ink">{records[0].year || records[0].class_year}{records[0].major_code}{records[0].room}</span> ({records[0].level} • {records[0].major_name})
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-error mt-2">ไม่พบรายชื่อในระบบ (ยังไม่ถึงเวลาเรียน หรือไม่มีการลงทะเบียน)</p>
                )}
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-card border border-hairline p-5 rounded-lg">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    <CheckCircle2 size={14} className="text-success" />
                    <span>เช็กชื่อแล้ว</span>
                  </div>
                  <p className="text-3xl font-black text-ink">{attendedCount} คาบ</p>
                </div>

                <div className="bg-surface-card border border-hairline p-5 rounded-lg">
                  <div className="flex items-center space-x-2 text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                    <AlertTriangle size={14} className="text-error" />
                    <span>ไม่เข้ากิจกรรม</span>
                  </div>
                  <p className="text-3xl font-black text-ink">{missedCount} คาบ</p>
                </div>
              </div>

              {/* Progress Rate Indicator */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-muted">อัตราการเข้ากิจกรรม</span>
                  <span className="text-ink font-bold">{rate}%</span>
                </div>
                <div className="w-full bg-surface-soft border border-hairline rounded-full h-2">
                  <div className="bg-primary h-1.5 rounded-full" style={{ width: `${rate}%` }}></div>
                </div>
                <p className="text-[10px] text-muted-soft">
                  {rate >= 80 
                    ? 'สถิติยอดเยี่ยม! อันตราการเข้ากิจกรรมของคุณผ่านเกณฑ์ขั้นต่ำ 80%' 
                    : 'อัตราเช็กชื่อต่ำกว่าเกณฑ์ 80% (กรุณาเข้ากิจกรรมถัดไปเพื่อป้องกันชั่วโมงไม่ครบ)'}
                </p>
              </div>
            </div>

            {/* Detailed Timeline Card */}
            <div className="bg-canvas border border-hairline rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-hairline bg-surface-soft">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center space-x-1.5">
                  <Calendar size={13} />
                  <span>ประวัติคาบกิจกรรมทั้งหมด</span>
                </h3>
              </div>
              <div className="divide-y divide-hairline">
                {timeline.length === 0 ? (
                  <div className="p-6 text-center text-muted-soft text-sm">ไม่มีข้อมูลคาบกิจกรรมในระบบขณะนี้</div>
                ) : (
                  timeline.map((item, idx) => (
                    <div key={idx} className="p-4 flex items-center justify-between text-sm hover:bg-surface-soft/20 transition-colors">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-soft font-bold uppercase">ครั้งที่ {item.week}</span>
                        <h4 className="font-semibold text-ink">{item.title}</h4>
                        <p className="text-xs text-muted-soft">{formatThaiDate(item.date)}</p>
                      </div>
                      <div>
                        {item.status === 'attended' ? (
                          <span className="inline-block text-xs bg-success/10 text-success font-semibold px-2.5 py-1 rounded-full">
                            เข้ากิจกรรม
                          </span>
                        ) : (
                          <span className="inline-block text-xs bg-error/10 text-error font-semibold px-2.5 py-1 rounded-full">
                            ไม่เข้ากิจกรรม
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-surface-dark text-on-dark-soft border-t border-surface-dark-elevated">
        <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col sm:flex-row justify-between items-center text-xs space-y-4 sm:space-y-0">
          <p>© {new Date().getFullYear()} AAS สงวนลิขสิทธิ์ทั้งหมด</p>
          <div className="flex space-x-6 text-[#a1a1aa]">
            <a href="#" className="hover:text-white transition-colors">ติดต่อรับความช่วยเหลือ</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
