import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { CheckSquare, ArrowRight, Sparkles, CheckCircle2, ShieldAlert } from 'lucide-react';
import { getHardwareFingerprint, getDeviceSignals } from '../utils/fingerprint';
import type { DeviceSignals } from '../utils/fingerprint';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-md mx-auto my-10 bg-error/15 border border-error/30 text-error rounded-lg space-y-3">
          <h1 className="text-lg font-bold">⚠️ เกิดข้อผิดพลาดในการโหลดหน้าจอ (React Crash)</h1>
          <p className="text-xs font-mono bg-canvas p-3 rounded border border-hairline overflow-auto max-h-40">
            {this.state.error?.toString() || 'Unknown Error'}
          </p>
          <p className="text-xs text-muted">กรุณาแจ้งข้อความแสดงความผิดพลาดนี้ให้กับผู้ดูแลระบบ</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-error text-white text-xs font-bold rounded-md hover:bg-error-active transition-colors cursor-pointer"
          >
            โหลดหน้าจอใหม่
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function getCookie(name: string) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
  return null;
}

function setCookie(name: string, value: string, days: number) {
  const d = new Date();
  d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = "expires=" + d.toUTCString();
  document.cookie = `${name}=${value}; ${expires}; path=/; SameSite=Lax`;
}

const safeLocalStorage = {
  getItem: (key: string): string => {
    try {
      return localStorage.getItem(key) || '';
    } catch (e) {
      console.warn('localStorage getItem blocked', e);
      return '';
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('localStorage setItem blocked', e);
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('localStorage removeItem blocked', e);
    }
  }
};

function UserScanForm() {
  const { token } = useParams();
  const [majors, setMajors] = useState<{ id: number; level: string; year: string; major_name: string; major_code: string; room: string }[]>([]);

  // Form states
  const [prefix, setPrefix] = useState(() => safeLocalStorage.getItem('attendance_prefix'));
  const [firstName, setFirstName] = useState(() => safeLocalStorage.getItem('attendance_firstName'));
  const [lastName, setLastName] = useState(() => safeLocalStorage.getItem('attendance_lastName'));
  const [studentId, setStudentId] = useState(() => safeLocalStorage.getItem('attendance_studentId'));
  const [selectedMajorId, setSelectedMajorId] = useState(() => safeLocalStorage.getItem('attendance_selectedMajorId'));
  const [level, setLevel] = useState(() => safeLocalStorage.getItem('attendance_level') || 'ปวช');
  const [selectedYear, setSelectedYear] = useState(() => safeLocalStorage.getItem('attendance_selectedYear') || '1');
  const [majorName, setMajorName] = useState(() => safeLocalStorage.getItem('attendance_majorName') || 'เทคนิคคอมพิวเตอร์');
  const [selectedMajorCode, setSelectedMajorCode] = useState(() => safeLocalStorage.getItem('attendance_selectedMajorCode') || 'ชทค');
  const [selectedRoom, setSelectedRoom] = useState(() => safeLocalStorage.getItem('attendance_selectedRoom') || '1');
  const [rememberMe, setRememberMe] = useState(() => safeLocalStorage.getItem('attendance_remember') !== 'false');
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Session status states
  const [sessionInfo, setSessionInfo] = useState<{ id: number; week_number: number; title: string; date: string; is_active: number; close_at: string | null; token: string; latitude?: number | null; longitude?: number | null; radius?: number; require_device_fingerprint?: number } | null>(null);
  const [isSessionClosed, setIsSessionClosed] = useState(false);
  const [sessionClosedReason, setSessionClosedReason] = useState('');
  const [loadingSession, setLoadingSession] = useState(true);

  // Device check & anti proxy check-in states
  const [deviceUuid, setDeviceUuid] = useState('');
  const [alreadyCheckedDetails, setAlreadyCheckedDetails] = useState<{
    student_id: string;
    prefix: string;
    first_name: string;
    last_name: string;
    level: string;
    year: string;
    major_code: string;
    major_name: string;
    room: string;
    attended_at: string;
  } | null>(null);
  const [loadingDeviceCheck, setLoadingDeviceCheck] = useState(true);
  const [confidenceWarning, setConfidenceWarning] = useState<{ score: number; level: string } | null>(null);
  const [deviceSignalsRef, setDeviceSignalsRef] = useState<DeviceSignals | null>(null);

  useEffect(() => {
    // Generate or retrieve persistent device UUID
    let uuid = safeLocalStorage.getItem('device_uuid') || getCookie('device_uuid');
    if (!uuid) {
      uuid = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
      safeLocalStorage.setItem('device_uuid', uuid);
      setCookie('device_uuid', uuid, 365);
    } else {
      safeLocalStorage.setItem('device_uuid', uuid);
      setCookie('device_uuid', uuid, 365);
    }
    setDeviceUuid(uuid);

    // Fetch majors from backend
    axios.get('/api/majors')
      .then(res => setMajors(res.data || []))
      .catch(err => console.error('Error fetching majors:', err));

    // Fetch session details and accurate server time if token exists
    if (!token) {
      setLoadingSession(false);
      setLoadingDeviceCheck(false);
      setError('ไม่พบคิวอาร์โค้ดเช็กชื่อ หรือคิวอาร์โค้ดไม่ถูกต้อง กรุณาสแกนใหม่อีกครั้ง');
      return;
    }

    if (token) {
      setLoadingSession(true);
      setLoadingDeviceCheck(true);
      Promise.all([
        axios.get(`/api/sessions/by-token/${token}`),
        axios.get('/api/time')
      ])
        .then(async ([sessionRes, timeRes]) => {
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

          let finalDeviceUuid = uuid;
          let hwFpForCheck = '';
          let signals: DeviceSignals | null = null;
          if (session.require_device_fingerprint === 1) {
            try {
              const sigs = await getDeviceSignals();
              signals = sigs;
              setDeviceSignalsRef(sigs);
              finalDeviceUuid = sigs.hardwareFingerprint;
              hwFpForCheck = sigs.hardwareFingerprint;
              setDeviceUuid(uuid); // Keep software UUID as primary identifier
            } catch (e) {
              console.error('Failed to get device signals:', e);
              // Fallback: try hardware fingerprint only
              try {
                const hwFp = await getHardwareFingerprint();
                hwFpForCheck = hwFp;
              } catch (e2) {
                console.error('Failed to get hardware fingerprint:', e2);
              }
            }
          }

          // Check if device already checked in for this session
          // Uses composite check: software UUID + hardware fingerprint
          try {
            const hwParam = hwFpForCheck ? `?hw=${encodeURIComponent(hwFpForCheck)}` : '';
            const deviceCheckRes = await axios.get(`/api/attendances/session/${session.id}/device/${finalDeviceUuid}${hwParam}`);
            if (deviceCheckRes && deviceCheckRes.data) {
              setAlreadyCheckedDetails(deviceCheckRes.data);

              // Background log attempt (without user interface interaction)
              const storedStudentId = safeLocalStorage.getItem('attendance_studentId');
              axios.post('/api/attendance-rejections/log-attempt', {
                session_id: session.id,
                device_uuid: uuid,
                hardware_fingerprint: hwFpForCheck || null,
                stored_student_id: storedStudentId || null,
                device_signals: signals || undefined
              }).catch(err => {
                console.error('Background log attempt failed:', err);
              });
            }
          } catch (deviceErr) {
            console.error('Failed to check device attendance:', deviceErr);
          }
          
          setLoadingSession(false);
          setLoadingDeviceCheck(false);
        })
        .catch(err => {
          console.error('Error loading session or device check:', err);
          setError('ไม่พบคลาสกิจกรรมที่ระบุ หรือเกิดข้อผิดพลาดในการโหลดข้อมูล');
          setLoadingSession(false);
          setLoadingDeviceCheck(false);
        });
    } else {
      setLoadingSession(false);
      setLoadingDeviceCheck(false);
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

  const getCurrentCoordinates = (): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('อุปกรณ์ของคุณไม่รองรับการดึงข้อมูลพิกัด GPS'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (err) => {
          console.error('GPS error:', err);
          if (err.code === 1) {
            reject(new Error('กรุณาอนุญาตสิทธิ์การเข้าถึงตำแหน่งที่ตั้ง (GPS) บนเบราว์เซอร์ของท่านเพื่อเช็กชื่อ'));
          } else {
            reject(new Error('ไม่สามารถระบุพิกัดตำแหน่งที่ตั้งได้ กรุณาลองใหม่อีกครั้ง'));
          }
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  };

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

    const hasGpsEnforcement = sessionInfo && sessionInfo.latitude !== null && sessionInfo.latitude !== undefined && sessionInfo.longitude !== null && sessionInfo.longitude !== undefined;

    let coords = null;
    if (hasGpsEnforcement) {
      setGpsLoading(true);
      setError('');
      try {
        coords = await getCurrentCoordinates();
      } catch (err: any) {
        setError(err.message || 'ไม่สามารถดึงตำแหน่ง GPS ได้');
        setGpsLoading(false);
        return;
      }
      setGpsLoading(false);
    }

    try {
      const response = await axios.post('/api/attendances', {
        session_id: sessionInfo.id,
        prefix: prefix,
        first_name: firstName,
        last_name: lastName,
        student_id: studentId,
        level,
        year: selectedYear,
        major_name: majorName,
        major_code: selectedMajorCode,
        room: selectedRoom,
        device_uuid: deviceUuid,
        latitude: coords ? coords.latitude : null,
        longitude: coords ? coords.longitude : null,
        device_signals: deviceSignalsRef || undefined
      });

      // Handle confidence warning from backend (soft accept)
      if (response.data?.confidence_warning) {
        setConfidenceWarning({
          score: response.data.confidence_score,
          level: response.data.confidence_level
        });
      }

      if (rememberMe) {
        safeLocalStorage.setItem('attendance_prefix', prefix);
        safeLocalStorage.setItem('attendance_firstName', firstName);
        safeLocalStorage.setItem('attendance_lastName', lastName);
        safeLocalStorage.setItem('attendance_studentId', studentId);
        safeLocalStorage.setItem('attendance_selectedMajorId', selectedMajorId);
        safeLocalStorage.setItem('attendance_level', level);
        safeLocalStorage.setItem('attendance_selectedYear', selectedYear);
        safeLocalStorage.setItem('attendance_majorName', majorName);
        safeLocalStorage.setItem('attendance_selectedMajorCode', selectedMajorCode);
        safeLocalStorage.setItem('attendance_selectedRoom', selectedRoom);
        safeLocalStorage.setItem('attendance_remember', 'true');
      } else {
        safeLocalStorage.removeItem('attendance_prefix');
        safeLocalStorage.removeItem('attendance_firstName');
        safeLocalStorage.removeItem('attendance_lastName');
        safeLocalStorage.removeItem('attendance_studentId');
        safeLocalStorage.removeItem('attendance_selectedMajorId');
        safeLocalStorage.removeItem('attendance_level');
        safeLocalStorage.removeItem('attendance_selectedYear');
        safeLocalStorage.removeItem('attendance_majorName');
        safeLocalStorage.removeItem('attendance_selectedMajorCode');
        safeLocalStorage.removeItem('attendance_selectedRoom');
        safeLocalStorage.setItem('attendance_remember', 'false');
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
          <img src="/logo.svg" alt="AAS Logo" className="w-5 h-5 object-contain" />
          <span className="font-extrabold text-base text-ink tracking-tight">AAS</span>
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

          {/* Confidence Warning Banner */}
          {confidenceWarning && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-left space-y-1">
              <div className="flex items-center space-x-2">
                <ShieldAlert size={16} className="text-amber-600 shrink-0" />
                <span className="text-xs font-bold text-amber-700">พบการเปลี่ยนแปลงอุปกรณ์</span>
              </div>
              <p className="text-xs text-amber-600 leading-relaxed">
                ระบบตรวจพบว่าอุปกรณ์หรือสภาพแวดล้อมของคุณมีการเปลี่ยนแปลง
                {confidenceWarning.level === 'low'
                  ? ' (ความน่าเชื่อถือต่ำ) ข้อมูลนี้ถูก flag ไว้เพื่อให้ผู้ดูแลระบบตรวจสอบ'
                  : ' การเช็กชื่อได้รับการบันทึกเรียบร้อยแล้ว'}
              </p>
            </div>
          )}

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
      ) : alreadyCheckedDetails ? (
        <div className="max-w-md w-full mx-auto my-auto bg-canvas border border-hairline rounded-lg p-4 sm:p-6 md:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.04)] text-center space-y-4 sm:space-y-6 animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-amber-500/15 text-amber-600 rounded-full flex items-center justify-center mx-auto border border-amber-500/30">
            <ShieldAlert size={32} />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-bold text-[#b45309] tracking-tight">เครื่องนี้ได้เช็กชื่อกิจกรรมไปแล้ว</h1>
            <p className="text-muted text-xs leading-relaxed">
              เครื่องนี้ทำรายการเช็กชื่อกิจกรรมครั้งที่ {sessionInfo?.week_number} สำเร็จแล้ว
              <br /><strong>ระบบไม่อนุญาตให้ใช้เช็กชื่อให้บุคคลอื่นหรือลงชื่อแทนกันได้</strong>
            </p>
          </div>

          <div className="bg-surface-soft border border-hairline rounded-md p-4 text-left text-sm space-y-2.5">
            <div className="flex justify-between border-b border-hairline pb-2">
              <span className="text-muted">ชื่อ-นามสกุล</span>
              <span className="font-semibold text-ink">{alreadyCheckedDetails.prefix}{alreadyCheckedDetails.first_name} {alreadyCheckedDetails.last_name}</span>
            </div>
            <div className="flex justify-between border-b border-hairline pb-2">
              <span className="text-muted">รหัสนักศึกษา</span>
              <span className="font-mono font-semibold text-ink">{alreadyCheckedDetails.student_id}</span>
            </div>
            <div className="flex justify-between border-b border-hairline pb-2">
              <span className="text-muted">กลุ่มเรียน</span>
              <span className="font-semibold text-ink">{alreadyCheckedDetails.year}{alreadyCheckedDetails.major_code}{alreadyCheckedDetails.room}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">ระดับชั้น / สาขาวิชา</span>
              <span className="font-semibold text-ink text-right text-xs">{alreadyCheckedDetails.level} • {alreadyCheckedDetails.major_name}</span>
            </div>
          </div>

          <div className="pt-2">
            <Link
              to={`/?id=${alreadyCheckedDetails.student_id}`}
              className="w-full h-11 bg-primary hover:bg-primary-active text-white text-sm font-semibold rounded-md flex items-center justify-center space-x-2 transition-all"
            >
              <span>ตรวจสอบสถิติการเช็กชื่อของฉัน</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      ) : loadingSession || loadingDeviceCheck ? (
        <div className="max-w-md w-full mx-auto my-auto bg-canvas border border-hairline rounded-lg p-12 text-center space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-muted font-semibold">กำลังตรวจสอบข้อมูลประวัติเครื่องและคาบกิจกรรม...</p>
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
                  ปิดรับเวลา {new Date(sessionInfo.close_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
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
                className={`w-full h-11 border rounded-md px-3.5 text-base bg-canvas text-ink placeholder:text-muted-soft focus:outline-none transition-all font-mono ${studentId.length > 0 && studentId.length !== 11
                  ? 'border-error/60 focus:border-error focus:ring-1 focus:ring-error'
                  : 'border-hairline focus:border-primary focus:ring-1 focus:ring-primary'
                  } disabled:bg-surface-soft disabled:text-muted`}
                placeholder="เช่น 64012345678"
              />
            </div>

            {/* คำนำหน้าชื่อ (Prefix Selection Buttons) */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink uppercase tracking-wider">คำนำหน้าชื่อ</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isSessionClosed}
                  onClick={() => setPrefix('นาย')}
                  className={`h-10 flex items-center justify-center space-x-1.5 border rounded-md font-semibold text-sm transition-all cursor-pointer ${prefix === 'นาย'
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
                  className={`h-10 flex items-center justify-center space-x-1.5 border rounded-md font-semibold text-sm transition-all cursor-pointer ${prefix === 'นางสาว'
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
                  className="w-full h-11 border border-hairline rounded-md px-3.5 text-base bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:bg-surface-soft disabled:text-muted"
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
                  className="w-full h-11 border border-hairline rounded-md px-3.5 text-base bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:bg-surface-soft disabled:text-muted"
                  placeholder="เช่น นิวส์ก้า"
                />
              </div>
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
                className="w-full h-11 border border-hairline rounded-md px-3 text-base bg-canvas text-ink focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer disabled:bg-surface-soft disabled:text-muted"
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
              disabled={isSessionClosed || gpsLoading}
              className="w-full h-11 bg-primary hover:bg-primary-active disabled:bg-surface-strong text-white text-sm font-semibold rounded-md flex items-center justify-center space-x-2 transition-all shadow-sm active:scale-98 mt-1 sm:mt-2 cursor-pointer"
            >
              {gpsLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <CheckSquare size={16} />
              )}
              <span>
                {isSessionClosed
                  ? 'ปิดรับเช็กชื่อแล้ว'
                  : gpsLoading
                    ? 'กำลังดึงตำแหน่ง GPS...'
                    : 'ยืนยันการเช็กชื่อกิจกรรม'}
              </span>
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
        © {new Date().getFullYear()} AAS ขับเคลื่อนระบบด้วยฐานข้อมูล SQLite และ Google Sheets API
      </div>
    </div>
  );
}

export default function UserScanFormWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <UserScanForm />
    </ErrorBoundary>
  );
}
