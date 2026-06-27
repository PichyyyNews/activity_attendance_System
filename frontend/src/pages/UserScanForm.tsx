import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { CheckSquare, ArrowRight, Sparkles, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function UserScanForm() {
  const { token } = useParams();
  const [majors, setMajors] = useState<{ id: number; level: string; year: string; major_name: string; major_code: string; room: string }[]>([]);
  
  // Form states
  const [prefix, setPrefix] = useState(() => localStorage.getItem('attendance_prefix') || '');
  const [firstName, setFirstName] = useState(() => localStorage.getItem('attendance_firstName') || '');
  const [lastName, setLastName] = useState(() => localStorage.getItem('attendance_lastName') || '');
  const [studentId, setStudentId] = useState(() => localStorage.getItem('attendance_studentId') || '');
  const [selectedMajorId, setSelectedMajorId] = useState(() => localStorage.getItem('attendance_selectedMajorId') || '');
  const [level, setLevel] = useState(() => localStorage.getItem('attendance_level') || 'ปวช');
  const [selectedYear, setSelectedYear] = useState(() => localStorage.getItem('attendance_selectedYear') || '1');
  const [majorName, setMajorName] = useState(() => localStorage.getItem('attendance_majorName') || 'เทคนิคคอมพิวเตอร์');
  const [selectedMajorCode, setSelectedMajorCode] = useState(() => localStorage.getItem('attendance_selectedMajorCode') || 'ชทค');
  const [selectedRoom, setSelectedRoom] = useState(() => localStorage.getItem('attendance_selectedRoom') || '1');
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('attendance_remember') !== 'false');
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  // Session status states
  const [sessionInfo, setSessionInfo] = useState<{ id: number; week_number: number; title: string; date: string; is_active: number; close_at: string | null; token: string } | null>(null);
  const [isSessionClosed, setIsSessionClosed] = useState(false);
  const [sessionClosedReason, setSessionClosedReason] = useState('');
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    // Fetch majors from backend
    axios.get('/api/majors')
      .then(res => setMajors(res.data || []))
      .catch(err => console.error('Error fetching majors:', err));

    // Fetch session details and accurate server time if token exists
    if (token) {
      setLoadingSession(true);
      Promise.all([
        axios.get(`/api/sessions/by-token/${token}`),
        axios.get('/api/time')
      ])
        .then(([sessionRes, timeRes]) => {
          const session = sessionRes.data;
          setSessionInfo(session);
          
          const nowServer = new Date(timeRes.data.datetime);
          const isExpired = session.close_at && nowServer > new Date(session.close_at);
          if (session.is_active === 0) {
            setIsSessionClosed(true);
            setSessionClosedReason('ผู้ดูแลระบบได้ปิดระบบการสแกนเช็กชื่อสำหรับกิจกรรมครั้งนี้แล้ว');
          } else if (isExpired) {
            setIsSessionClosed(true);
            setSessionClosedReason('หมดเวลาการเช็กชื่อเข้าร่วมกิจกรรมในสัปดาห์นี้แล้ว (ระบบปิดรับอัตโนมัติ)');
          }
          setLoadingSession(false);
        })
        .catch(err => {
          console.error('Error fetching session details:', err);
          setError('ไม่พบคลาสกิจกรรมที่ระบุ หรือเกิดข้อผิดพลาดในการโหลดข้อมูล');
          setLoadingSession(false);
        });
    } else {
      setLoadingSession(false);
    }
  }, [token]);

  useEffect(() => {
    if (studentId.length === 11) {
      axios.get(`/api/students/${studentId}`)
        .then(res => {
          if (res.data) {
            setPrefix(res.data.prefix || 'นาย');
            setFirstName(res.data.first_name);
            setLastName(res.data.last_name);
            setLevel(res.data.level);
            setSelectedYear(res.data.year);
            setMajorName(res.data.major_name);
            setSelectedMajorCode(res.data.major_code);
            setSelectedRoom(res.data.room);
            
            const matched = majors.find(m => m.level === res.data.level && m.year === res.data.year && m.major_code === res.data.major_code && m.room === res.data.room);
            if (matched) {
              setSelectedMajorId(matched.id.toString());
            } else {
              setSelectedMajorId('');
            }
            setAutoFilled(true);
            setTimeout(() => setAutoFilled(false), 5000);
          }
        })
        .catch(err => {
          console.log('Student not found in pre-registered roster:', err.response?.data?.error || err.message);
        });
    }
  }, [studentId, majors]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!sessionInfo) {
      setError('ไม่พบคลาสกิจกรรมที่ระบุ');
      return;
    }

    if (isSessionClosed) {
      setError('คาบกิจกรรมนี้ปิดรับการลงชื่อเข้าเรียนแล้ว');
      return;
    }

    if (!prefix) {
      setError('กรุณาเลือกคำนำหน้าชื่อ (นาย หรือ นางสาว)');
      return;
    }

    if (!/^\d{11}$/.test(studentId)) {
      setError('รหัสนักศึกษาต้องเป็นตัวเลข 11 หลักเท่านั้น');
      return;
    }

    if (!level || !selectedYear || !majorName || !selectedMajorCode || !selectedRoom) {
      setError('กรุณาเลือกข้อมูลกลุ่มเรียน / สาขาวิชาให้ครบถ้วน');
      return;
    }

    try {
      await axios.post('/api/attendances', {
        session_id: sessionInfo.id,
        prefix: prefix,
        first_name: firstName,
        last_name: lastName,
        student_id: studentId,
        level,
        year: selectedYear,
        major_name: majorName,
        major_code: selectedMajorCode,
        room: selectedRoom
      });

      if (rememberMe) {
        localStorage.setItem('attendance_prefix', prefix);
        localStorage.setItem('attendance_firstName', firstName);
        localStorage.setItem('attendance_lastName', lastName);
        localStorage.setItem('attendance_studentId', studentId);
        localStorage.setItem('attendance_selectedMajorId', selectedMajorId);
        localStorage.setItem('attendance_level', level);
        localStorage.setItem('attendance_selectedYear', selectedYear);
        localStorage.setItem('attendance_majorName', majorName);
        localStorage.setItem('attendance_selectedMajorCode', selectedMajorCode);
        localStorage.setItem('attendance_selectedRoom', selectedRoom);
        localStorage.setItem('attendance_remember', 'true');
      } else {
        localStorage.removeItem('attendance_prefix');
        localStorage.removeItem('attendance_firstName');
        localStorage.removeItem('attendance_lastName');
        localStorage.removeItem('attendance_studentId');
        localStorage.removeItem('attendance_selectedMajorId');
        localStorage.removeItem('attendance_level');
        localStorage.removeItem('attendance_selectedYear');
        localStorage.removeItem('attendance_majorName');
        localStorage.removeItem('attendance_selectedMajorCode');
        localStorage.removeItem('attendance_selectedRoom');
        localStorage.setItem('attendance_remember', 'false');
      }

      setIsSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกการเช็กชื่อ');
    }
  };



  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-between py-4 px-3 sm:py-12 sm:px-6">
      {/* Top Brand Logo */}
      <div className="flex justify-center">
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center">
            <div className="w-2.5 h-2.5 bg-canvas rounded-full"></div>
          </div>
          <span className="font-extrabold text-base text-ink tracking-tight">attendance.io</span>
        </div>
      </div>

      {/* Success View */}
      {isSuccess ? (
        <div className="max-w-md w-full mx-auto my-auto bg-canvas border border-hairline rounded-lg p-4 sm:p-6 md:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.04)] text-center space-y-4 sm:space-y-6 animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-success/15 text-success rounded-full flex items-center justify-center mx-auto border border-success/30">
            <CheckCircle2 size={32} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-ink tracking-tight">เช็กชื่อสำเร็จแล้ว!</h1>
            <p className="text-muted text-sm">ระบบได้บันทึกข้อมูลการเข้ากิจกรรมครั้งที่ {sessionInfo?.week_number} เรียบร้อยแล้ว</p>
          </div>

          <div className="bg-surface-soft border border-hairline rounded-md p-4 text-left text-sm space-y-2.5">
            <div className="flex justify-between border-b border-hairline pb-2">
              <span className="text-muted">ชื่อ-นามสกุล</span>
              <span className="font-semibold text-ink">{prefix}{firstName} {lastName}</span>
            </div>
            <div className="flex justify-between border-b border-hairline pb-2">
              <span className="text-muted">รหัสนักศึกษา</span>
              <span className="font-mono font-semibold text-ink">{studentId}</span>
            </div>
            <div className="flex justify-between border-b border-hairline pb-2">
              <span className="text-muted">กลุ่มเรียน</span>
              <span className="font-semibold text-ink">{selectedYear}{selectedMajorCode}{selectedRoom}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">ระดับชั้น / สาขาวิชา</span>
              <span className="font-semibold text-ink text-right text-xs">{level} • {majorName}</span>
            </div>
          </div>

          <div className="pt-2">
            <Link 
              to={`/?id=${studentId}`}
              className="w-full h-11 bg-primary hover:bg-primary-active text-white text-sm font-semibold rounded-md flex items-center justify-center space-x-2 transition-all"
            >
              <span>ตรวจสอบสถิติการเช็กชื่อของฉัน</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      ) : loadingSession ? (
        <div className="max-w-md w-full mx-auto my-auto bg-canvas border border-hairline rounded-lg p-12 text-center space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-muted font-semibold">กำลังโหลดข้อมูลคาบกิจกรรม...</p>
        </div>
      ) : (
        /* Form View */
        <div className="max-w-md w-full mx-auto my-auto bg-canvas border border-hairline rounded-lg p-4 sm:p-6 md:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.04)] space-y-5 sm:space-y-8">
          <div className="text-center space-y-1.5 sm:space-y-3">
            <div className="hidden sm:flex w-12 h-12 bg-surface-soft border border-hairline text-ink rounded-full items-center justify-center mx-auto">
              <Sparkles className="text-primary animate-pulse w-6 h-6" />
            </div>
            <div className="space-y-1">
              <span className="inline-block text-[10px] sm:text-[11px] bg-primary text-white font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider">
                ครั้งที่ {sessionInfo?.week_number || ''} {sessionInfo ? `(${sessionInfo.title})` : ''}
              </span>
              <h1 className="text-lg sm:text-2xl font-bold text-ink tracking-tight mt-1">เช็กชื่อเข้าร่วมกิจกรรม</h1>
              {sessionInfo && sessionInfo.close_at && !isSessionClosed && (
                <p className="text-error text-[11px] sm:text-xs font-semibold mt-0.5 sm:mt-1">
                  ⏰ ปิดรับเวลา {new Date(sessionInfo.close_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                </p>
              )}
              <p className="hidden sm:block text-muted text-xs mt-1">กรุณากรอกข้อมูลเพื่อใช้เป็นหลักฐานยืนยันการเช็กชื่อ</p>
            </div>
          </div>

          {autoFilled && (
            <div className="flex items-center space-x-2 p-3 bg-success/15 border border-success/30 text-success text-xs font-semibold rounded-md animate-in fade-in duration-200">
              <CheckCircle2 size={16} className="flex-shrink-0" />
              <span>ดึงข้อมูลรายชื่อจากระบบล่วงหน้าสำเร็จ!</span>
            </div>
          )}

          {error && (
            <div className="flex items-center space-x-2 p-3 bg-error/15 border border-error/30 text-error text-xs font-semibold rounded-md">
              <ShieldAlert size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isSessionClosed && (
            <div className="flex items-start space-x-2.5 p-4 bg-error/15 border border-error/30 text-error text-xs font-bold rounded-md animate-in fade-in duration-200">
              <ShieldAlert size={18} className="flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-extrabold text-sm">การเช็กชื่อเสร็จสิ้น/ปิดระบบแล้ว</p>
                <p className="font-semibold opacity-90">{sessionClosedReason}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {/* คำนำหน้าชื่อ (Prefix Selection Buttons) */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink uppercase tracking-wider">คำนำหน้าชื่อ</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isSessionClosed}
                  onClick={() => setPrefix('นาย')}
                  className={`h-10 flex items-center justify-center space-x-1.5 border rounded-md font-semibold text-sm transition-all cursor-pointer ${
                    prefix === 'นาย'
                      ? 'border-brand-accent bg-brand-accent/5 text-brand-accent ring-1 ring-brand-accent'
                      : 'border-hairline bg-canvas text-ink hover:bg-surface-soft'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <circle cx="10" cy="14" r="6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="15" y1="9" x2="21" y2="3" />
                  </svg>
                  <span>นาย</span>
                </button>
                <button
                  type="button"
                  disabled={isSessionClosed}
                  onClick={() => setPrefix('นางสาว')}
                  className={`h-10 flex items-center justify-center space-x-1.5 border rounded-md font-semibold text-sm transition-all cursor-pointer ${
                    prefix === 'นางสาว'
                      ? 'border-rose-500 bg-rose-500/5 text-rose-600 ring-1 ring-rose-500'
                      : 'border-hairline bg-canvas text-ink hover:bg-surface-soft'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <circle cx="12" cy="9" r="6" />
                    <line x1="12" y1="15" x2="12" y2="21" />
                    <line x1="9" y1="18" x2="15" y2="18" />
                  </svg>
                  <span>นางสาว</span>
                </button>
              </div>
            </div>

            {/* ชื่อจริง และ นามสกุล */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">ชื่อจริง</label>
                <input 
                  required 
                  type="text" 
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  disabled={isSessionClosed}
                  className="w-full h-11 border border-hairline rounded-md px-3.5 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:bg-surface-soft disabled:text-muted"
                  placeholder="เช่น ณัฐพัทธ์"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">นามสกุล</label>
                <input 
                  required 
                  type="text" 
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  disabled={isSessionClosed}
                  className="w-full h-11 border border-hairline rounded-md px-3.5 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:bg-surface-soft disabled:text-muted"
                  placeholder="เช่น นิวส์ก้า"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">รหัสนักศึกษา (11 หลัก)</label>
                {studentId.length > 0 && (
                  <span className={`text-[11px] font-bold transition-colors ${studentId.length === 11 ? 'text-success' : 'text-error'}`}>
                    {studentId.length === 11 
                      ? '✓ ครบ 11 หลักแล้ว' 
                      : `ขาดอีก ${11 - studentId.length} หลัก (กรอกแล้ว ${studentId.length}/11)`
                    }
                  </span>
                )}
              </div>
              <input 
                required 
                type="text" 
                inputMode="numeric"
                pattern="[0-9]{11}" 
                maxLength={11}
                title="กรุณากรอกรหัสนักศึกษา 11 หลักให้ถูกต้อง" 
                value={studentId}
                disabled={isSessionClosed}
                onChange={e => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  if (val.length <= 11) {
                    setStudentId(val);
                  }
                }}
                className={`w-full h-11 border rounded-md px-3.5 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none transition-all font-mono ${
                  studentId.length > 0 && studentId.length !== 11
                    ? 'border-error/60 focus:border-error focus:ring-1 focus:ring-error'
                    : 'border-hairline focus:border-primary focus:ring-1 focus:ring-primary'
                } disabled:bg-surface-soft disabled:text-muted`}
                placeholder="เช่น 64012345678" 
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink uppercase tracking-wider">กลุ่มเรียน / สาขาวิชา</label>
              <select
                required
                value={selectedMajorId}
                onChange={e => {
                  const mId = e.target.value;
                  setSelectedMajorId(mId);
                  const found = majors.find(m => m.id.toString() === mId);
                  if (found) {
                    setLevel(found.level);
                    setSelectedYear(found.year);
                    setMajorName(found.major_name);
                    setSelectedMajorCode(found.major_code);
                    setSelectedRoom(found.room);
                  }
                }}
                disabled={isSessionClosed}
                className="w-full h-11 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer disabled:bg-surface-soft disabled:text-muted"
              >
                <option value="" disabled>-- เลือกกลุ่มเรียน / สาขาวิชา --</option>
                {majors.map((m) => (
                  <option key={m.id} value={m.id}>
                    [{m.level}] ปี {m.year} {m.major_name} กลุ่ม {m.room} ({m.year}{m.major_code}{m.room})
                  </option>
                ))}
                {majors.length === 0 && (
                  <option value="">ไม่มีข้อมูลชั้นเรียนในระบบ</option>
                )}
              </select>
            </div>

            <div className="flex items-center space-x-2 py-0.5">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                disabled={isSessionClosed}
                className="w-4 h-4 border border-hairline rounded text-primary focus:ring-primary cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <label htmlFor="rememberMe" className="text-xs font-semibold text-muted hover:text-ink cursor-pointer select-none transition-colors">
                บันทึกข้อมูลและสาขาวิชาไว้บนเครื่องนี้ เพื่อความสะดวกรวดเร็วในครั้งถัดไป
              </label>
            </div>

            <button 
              type="submit" 
              disabled={isSessionClosed}
              className="w-full h-11 bg-primary hover:bg-primary-active disabled:bg-surface-strong text-white text-sm font-semibold rounded-md flex items-center justify-center space-x-2 transition-all shadow-sm active:scale-98 mt-1 sm:mt-2 cursor-pointer"
            >
              <CheckSquare size={16} />
              <span>{isSessionClosed ? 'ปิดรับเช็กชื่อแล้ว' : 'ยืนยันการเช็กชื่อกิจกรรม'}</span>
            </button>
          </form>

          <div className="border-t border-hairline pt-4 sm:pt-5 text-center">
            <Link 
              to="/" 
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-muted hover:text-ink transition-colors"
            >
              <span>ต้องการตรวจสอบประวัติการเข้าร่วมกิจกรรม?</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      )}

      {/* Footer Branding */}
      <div className="text-center text-[11px] text-muted-soft mt-4 sm:mt-8">
        © {new Date().getFullYear()} attendance.io ขับเคลื่อนระบบด้วยฐานข้อมูล SQLite และ Google Sheets API
      </div>
    </div>
  );
}
