import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import {
  Search,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Eye,
  X,
  ChevronRight
} from 'lucide-react';

const formatThaiDate = (dateStr: string) => {
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
    console.error('Error formatting date:', e);
  }
  return dateStr;
};

export default function UserDashboard() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<'activity' | 'assembly'>('activity');
  const [studentId, setStudentId] = useState('');
  const [searched, setSearched] = useState(false);

  // Activity States
  const [records, setRecords] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [studentProfile, setStudentProfile] = useState<any>(null);

  // Assembly States
  const [assemblySummary, setAssemblySummary] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get('id');
    const m = searchParams.get('mode');
    if (m === 'assembly') setMode('assembly');
    if (id && /^\d{11}$/.test(id)) {
      setStudentId(id);
      performSearch(id, m === 'assembly' ? 'assembly' : mode);
    }
  }, [searchParams]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(studentId, mode);
  };

  const performSearch = async (id: string, targetMode = mode) => {
    setLoading(true);
    setError('');
    setSearched(false);
    setStudentProfile(null);

    if (!/^\d{11}$/.test(id.trim())) {
      setError('รหัสนักศึกษาต้องเป็นตัวเลข 11 หลักเท่านั้น');
      setLoading(false);
      return;
    }

    try {
      const cleanId = id.trim();
      const profileRes = await axios.get(`/api/students/${cleanId}`).catch(() => ({ data: null }));
      setStudentProfile(profileRes.data);

      if (targetMode === 'activity') {
        const [sessionsRes, attendancesRes] = await Promise.all([
          axios.get('/api/sessions'),
          axios.get(`/api/attendances/student/${cleanId}`)
        ]);
        setSessions(sessionsRes.data || []);
        setRecords(attendancesRes.data || []);
      } else {
        const assemblyRes = await axios.get(`/api/assembly/student-summary/${cleanId}`);
        setAssemblySummary(assemblyRes.data);
      }
      setSearched(true);
    } catch (err) {
      console.error(err);
      setError('เกิดข้อผิดพลาดในการดึงข้อมูลประวัติการเช็กชื่อ');
    }
    setLoading(false);
  };

  // Switch mode and search again if already searched
  const handleModeSwitch = (newMode: 'activity' | 'assembly') => {
    setMode(newMode);
    if (studentId.trim().length === 11) {
      performSearch(studentId, newMode);
    }
  };

  // Activity Timeline
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
      <main className="flex-grow max-w-lg w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
            ตรวจสอบประวัติการเช็กชื่อ
          </h1>
          <p className="text-muted text-xs sm:text-sm max-w-sm mx-auto">
            กรอกรหัสนักศึกษาของคุณเพื่อค้นหาประวัติการเข้าร่วมกิจกรรมและการเข้าแถวหน้าเสาธง
          </p>
        </div>

        {/* Mode Selector Tabs (Activity vs Assembly) */}
        <div className="flex bg-surface-soft p-1 rounded-xl border border-hairline">
          <button
            type="button"
            onClick={() => handleModeSwitch('activity')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              mode === 'activity'
                ? 'bg-canvas text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            <span>🎓 คาบกิจกรรม</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('assembly')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              mode === 'assembly'
                ? 'bg-canvas text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            <span>🏫 เข้าแถวหน้าเสาธง</span>
          </button>
        </div>

        {/* Search Input Form */}
        <form onSubmit={handleSearchSubmit} className="bg-canvas border border-hairline rounded-xl p-5 shadow-[0_4px_12px_rgba(0,0,0,0.02)] space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-ink uppercase tracking-wider">
              รหัสนักศึกษา 11 หลัก
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                required
                maxLength={11}
                inputMode="numeric"
                pattern="[0-9]*"
                value={studentId}
                onChange={e => setStudentId(e.target.value.replace(/\D/g, ''))}
                className="flex-grow h-11 border border-hairline rounded-lg px-3.5 text-base bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono font-bold"
                placeholder="เช่น 66209010001"
              />
              <button
                type="submit"
                disabled={loading}
                className="h-11 bg-primary hover:bg-primary-active text-white px-6 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition-all active:scale-98 cursor-pointer disabled:bg-surface-strong shadow-xs"
              >
                <Search size={14} />
                <span>{loading ? 'ค้นหา...' : 'ค้นหาข้อมูล'}</span>
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="flex items-center space-x-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-lg animate-in fade-in duration-200">
            <ShieldAlert size={16} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* SEARCH RESULTS: ACTIVITY MODE */}
        {searched && mode === 'activity' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
            {/* Student Info & Summary */}
            <div className="bg-canvas border border-hairline rounded-xl p-5 sm:p-6 space-y-5 shadow-xs">
              <div>
                <span className="text-[10px] bg-surface-soft border border-hairline text-muted font-bold px-2 py-0.5 rounded">
                  แฟ้มประวัติคาบกิจกรรม
                </span>
                <h2 className="text-lg font-bold text-ink mt-2">รหัสนักศึกษา {studentId}</h2>
                {studentProfile ? (
                  <div className="text-xs text-muted mt-2 space-y-1 bg-surface-soft border border-hairline p-3 rounded-lg">
                    <div>
                      ชื่อ-นามสกุล: <span className="font-semibold text-ink">{studentProfile.prefix || ''}{studentProfile.first_name} {studentProfile.last_name}</span>
                    </div>
                    <div>
                      กลุ่มเรียน: <span className="font-semibold text-ink">{studentProfile.year || studentProfile.class_year}{studentProfile.major_code}{studentProfile.room}</span> ({studentProfile.level} • {studentProfile.major_name})
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-rose-600 mt-2">ไม่พบประวัตินักศึกษาในระบบ</p>
                )}
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-soft border border-hairline p-4 rounded-xl">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-muted uppercase mb-1">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    <span>เช็กชื่อแล้ว</span>
                  </div>
                  <p className="text-2xl font-extrabold text-ink font-mono">{attendedCount} ครั้ง</p>
                </div>

                <div className="bg-surface-soft border border-hairline p-4 rounded-xl">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-muted uppercase mb-1">
                    <AlertTriangle size={14} className="text-rose-500" />
                    <span>ไม่เข้ากิจกรรม</span>
                  </div>
                  <p className="text-2xl font-extrabold text-ink font-mono">{missedCount} ครั้ง</p>
                </div>
              </div>

              {/* Progress Rate */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-muted">อัตราการเข้ากิจกรรม</span>
                  <span className="text-ink font-mono">{rate}%</span>
                </div>
                <div className="w-full bg-surface-soft border border-hairline rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${rate}%` }}></div>
                </div>
                <p className="text-[11px] text-muted">
                  {rate >= 80
                    ? 'สถิติผ่านเกณฑ์การประเมินกิจกรรม (≥80%)'
                    : 'อัตราเช็กชื่อยังไม่ผ่านเกณฑ์ (กรุณาเข้าร่วมคาบถัดไป)'}
                </p>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-canvas border border-hairline rounded-xl overflow-hidden shadow-xs">
              <div className="px-5 py-3.5 border-b border-hairline bg-surface-soft flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center space-x-1.5">
                  <Calendar size={13} />
                  <span>ประวัติคาบกิจกรรมทั้งหมด</span>
                </h3>
                <span className="text-[10px] text-muted">{timeline.length} คาบ</span>
              </div>
              <div className="divide-y divide-hairline">
                {timeline.length === 0 ? (
                  <div className="p-6 text-center text-muted text-xs">ไม่มีข้อมูลคาบกิจกรรมในระบบขณะนี้</div>
                ) : (
                  timeline.map((item, idx) => (
                    <div key={idx} className="p-3.5 flex items-center justify-between text-xs hover:bg-surface-soft/40 transition-colors">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted font-bold uppercase">ครั้งที่ {item.week}</span>
                        <h4 className="font-semibold text-ink">{item.title}</h4>
                        <p className="text-[11px] text-muted-soft">{formatThaiDate(item.date)}</p>
                      </div>
                      <div>
                        {item.status === 'attended' ? (
                          <span className="inline-block text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2.5 py-0.5 rounded-full">
                            เข้ากิจกรรม
                          </span>
                        ) : (
                          <span className="inline-block text-[11px] bg-rose-50 text-rose-700 border border-rose-200 font-bold px-2.5 py-0.5 rounded-full">
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

        {/* SEARCH RESULTS: ASSEMBLY MODE */}
        {searched && mode === 'assembly' && assemblySummary && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
            {/* Student Info & Assembly Summary */}
            <div className="bg-canvas border border-hairline rounded-xl p-5 sm:p-6 space-y-5 shadow-xs">
              <div>
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 font-bold px-2 py-0.5 rounded">
                  แฟ้มประวัติการเข้าแถวหน้าเสาธง
                </span>
                <h2 className="text-lg font-bold text-ink mt-2">รหัสนักศึกษา {studentId}</h2>
                {studentProfile ? (
                  <div className="text-xs text-muted mt-2 space-y-1 bg-surface-soft border border-hairline p-3 rounded-lg">
                    <div>
                      ชื่อ-นามสกุล: <span className="font-semibold text-ink">{studentProfile.prefix || ''}{studentProfile.first_name} {studentProfile.last_name}</span>
                    </div>
                    <div>
                      กลุ่มเรียน: <span className="font-semibold text-ink">{studentProfile.year || studentProfile.class_year}{studentProfile.major_code}{studentProfile.room}</span> ({studentProfile.level} • {studentProfile.major_name})
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-rose-600 mt-2">ไม่พบประวัตินักศึกษาในระบบ</p>
                )}
              </div>

              {/* Assembly 4-Metric Grid */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-surface-soft border border-hairline p-2.5 rounded-xl">
                  <div className="text-[10px] font-bold text-muted uppercase mb-0.5">ทันเวลา</div>
                  <p className="text-xl font-extrabold text-emerald-600 font-mono">
                    {assemblySummary.summary?.presentCount || 0}
                  </p>
                </div>

                <div className="bg-surface-soft border border-hairline p-2.5 rounded-xl">
                  <div className="text-[10px] font-bold text-muted uppercase mb-0.5">มาสาย</div>
                  <p className="text-xl font-extrabold text-amber-600 font-mono">
                    {assemblySummary.summary?.lateCount || 0}
                  </p>
                </div>

                <div className="bg-surface-soft border border-hairline p-2.5 rounded-xl">
                  <div className="text-[10px] font-bold text-muted uppercase mb-0.5">ลา</div>
                  <p className="text-xl font-extrabold text-sky-600 font-mono">
                    {assemblySummary.summary?.leaveCount || 0}
                  </p>
                </div>

                <div className="bg-surface-soft border border-hairline p-2.5 rounded-xl">
                  <div className="text-[10px] font-bold text-muted uppercase mb-0.5">ขาดแถว</div>
                  <p className="text-xl font-extrabold text-rose-600 font-mono">
                    {assemblySummary.summary?.absentCount || 0}
                  </p>
                </div>
              </div>

              {/* Progress Rate */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-muted">อัตราการเข้าแถวทั้งหมด ({assemblySummary.summary?.totalDays || 0} วัน)</span>
                  <span className="text-ink font-mono">{assemblySummary.summary?.rate || 0}%</span>
                </div>
                <div className="w-full bg-surface-soft border border-hairline rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      (assemblySummary.summary?.rate || 0) >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${assemblySummary.summary?.rate || 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className={assemblySummary.summary?.isPass ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                    {assemblySummary.summary?.isPass ? 'ผ่านเกณฑ์การเข้าแถว (≥80%)' : 'ยังไม่ผ่านเกณฑ์การเข้าแถว'}
                  </span>
                  <Link to="/assembly/scan" className="text-primary hover:underline font-bold flex items-center gap-0.5">
                    <span>สแกนเข้าแถววันนี้</span>
                    <ChevronRight size={12} />
                  </Link>
                </div>
              </div>
            </div>

            {/* Assembly Timeline */}
            <div className="bg-canvas border border-hairline rounded-xl overflow-hidden shadow-xs">
              <div className="px-5 py-3.5 border-b border-hairline bg-surface-soft flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center space-x-1.5">
                  <Clock size={13} />
                  <span>ประวัติการเข้าแถวหน้าเสาธง</span>
                </h3>
                <span className="text-[10px] text-muted">{assemblySummary.history?.length || 0} วันที่บันทึก</span>
              </div>
              <div className="divide-y divide-hairline">
                {!assemblySummary.history || assemblySummary.history.length === 0 ? (
                  <div className="p-6 text-center text-muted text-xs">ยังไม่มีประวัติการเช็กชื่อเข้าแถวในระบบ</div>
                ) : (
                  assemblySummary.history.map((item: any) => {
                    const statusBadge = (() => {
                      if (item.status === 'present') return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">🟢 ทันเวลา</span>;
                      if (item.status === 'late') return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">🟡 มาสาย</span>;
                      if (item.status === 'leave') return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">🔵 ลา</span>;
                      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">🔴 ขาด</span>;
                    })();

                    return (
                      <div key={item.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-surface-soft/40 transition-colors">
                        <div className="space-y-0.5">
                          <h4 className="font-semibold text-ink">{formatThaiDate(item.date)}</h4>
                          <p className="text-[11px] text-muted-soft">
                            เวลา: {item.attended_at ? new Date(item.attended_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'}
                            {item.matched_location ? ` • ${item.matched_location}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {statusBadge}
                          {item.photo_path && (
                            <button
                              type="button"
                              onClick={() => setSelectedPhoto(item.photo_path)}
                              className="w-7 h-7 rounded-lg bg-surface-soft hover:bg-primary hover:text-white border border-hairline flex items-center justify-center transition-colors cursor-pointer"
                              title="ดูรูปหลักฐาน"
                            >
                              <Eye size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Photo Proof Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-canvas border border-hairline rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl p-4 space-y-3 relative">
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
            <span className="text-xs font-bold text-ink block">ภาพถ่ายหลักฐานในแถว</span>
            <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center max-h-80">
              <img src={selectedPhoto} alt="หลักฐาน" className="w-full h-auto object-contain max-h-80" />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-surface-dark text-on-dark-soft border-t border-surface-dark-elevated">
        <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col sm:flex-row justify-between items-center text-xs space-y-4 sm:space-y-0">
          <p>© {new Date().getFullYear()} AAS ระบบเช็กชื่อกิจกรรมและเข้าแถว</p>
          <div className="flex space-x-6 text-[#a1a1aa]">
            <Link to="/assembly/scan" className="hover:text-white transition-colors">สแกนเข้าแถว</Link>
            <Link to="/scan" className="hover:text-white transition-colors">สแกนคาบกิจกรรม</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
