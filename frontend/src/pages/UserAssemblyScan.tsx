import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import {
  Camera,
  RefreshCw,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  CheckSquare,
  ArrowRight,
  XCircle
} from 'lucide-react';
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
    console.error("ErrorBoundary caught an error in UserAssemblyScan", error, errorInfo);
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

const safeLocalStorage = {
  getItem: (key: string): string => {
    try {
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
};

// Client-side image compression helper (~80-120KB JPEG)
function compressImage(fileOrBase64: File | string, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };

    img.onerror = () => reject(new Error('Failed to load image for compression'));

    if (typeof fileOrBase64 === 'string') {
      img.src = fileOrBase64;
    } else {
      const reader = new FileReader();
      reader.onload = e => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(fileOrBase64);
    }
  });
}

function UserAssemblyScan() {
  const { token: urlToken } = useParams<{ token?: string }>();

  // Assembly system status
  const [statusLoading, setStatusLoading] = useState(true);
  const [assemblyStatus, setAssemblyStatus] = useState<any>(null);

  // Form states
  const [studentId, setStudentId] = useState(() => safeLocalStorage.getItem('assembly_studentId'));
  const [studentData, setStudentData] = useState<any>(null);
  const [searchingStudent, setSearchingStudent] = useState(false);
  const [studentNotFound, setStudentNotFound] = useState(false);

  // Photo states
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // GPS states
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Submission & summary states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [checkInResult, setCheckInResult] = useState<any>(null);
  const [studentSummary, setStudentSummary] = useState<any>(null);
  const [summaryTab, setSummaryTab] = useState<'assembly' | 'activity'>('assembly');
  const [activitySummary, setActivitySummary] = useState<any>(null);

  const [deviceUuid, setDeviceUuid] = useState('');
  const [hardwareFingerprint, setHardwareFingerprint] = useState('');
  const [deviceSignals, setDeviceSignals] = useState<DeviceSignals | null>(null);

  // 1. Initialize device fingerprint
  useEffect(() => {
    let uuid = safeLocalStorage.getItem('assembly_device_uuid');
    if (!uuid) {
      uuid = 'dev_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
      safeLocalStorage.setItem('assembly_device_uuid', uuid);
    }
    setDeviceUuid(uuid);

    getDeviceSignals()
      .then(sigs => {
        setDeviceSignals(sigs);
        setHardwareFingerprint(sigs.hardwareFingerprint);
      })
      .catch(() => {
        getHardwareFingerprint()
          .then(fp => setHardwareFingerprint(fp))
          .catch(() => {});
      });
  }, []);

  // 2. Fetch Assembly Status
  const fetchStatus = () => {
    setStatusLoading(true);
    axios.get('/api/assembly/check-status')
      .then(res => {
        setAssemblyStatus(res.data);
      })
      .catch(err => {
        console.error('Failed to get assembly status:', err);
      })
      .finally(() => {
        setStatusLoading(false);
      });
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 30000);
    return () => clearInterval(timer);
  }, []);

  // 3. Background GPS location helper
  const getCurrentCoordinates = (): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง GPS'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          });
        },
        () => {
          reject(new Error('กรุณาเปิดระบบ GPS และอนุญาตสิทธิ์การเข้าถึงตำแหน่งเพื่อเช็กชื่อเข้าแถว'));
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  useEffect(() => {
    if (assemblyStatus?.requireGps && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, [assemblyStatus?.requireGps]);

  // 4. Student lookup when 11 digits typed
  useEffect(() => {
    const cleanId = studentId.trim();
    if (/^\d{11}$/.test(cleanId)) {
      setSearchingStudent(true);
      setStudentNotFound(false);
      axios.get(`/api/students/${cleanId}`)
        .then(res => {
          if (res.data) {
            setStudentData(res.data);
            setStudentNotFound(false);
            safeLocalStorage.setItem('assembly_studentId', cleanId);
          } else {
            setStudentData(null);
            setStudentNotFound(true);
          }
        })
        .catch(() => {
          setStudentData(null);
          setStudentNotFound(true);
        })
        .finally(() => {
          setSearchingStudent(false);
        });
    } else {
      setStudentData(null);
      setStudentNotFound(false);
    }
  }, [studentId]);

  // Camera Management
  const startCamera = async (mode = facingMode) => {
    setCameraError('');
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.warn('Camera access denied or failed:', err);
      setCameraError('ไม่สามารถเข้าถึงกล้องถ่ายภาพได้ กรุณาอนุญาตสิทธิ์การใช้งานกล้อง หรือใช้ปุ่มเลือกรูปถ่ายแทน');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawData = canvas.toDataURL('image/jpeg', 0.85);

    compressImage(rawData, 800, 800, 0.7).then(compressed => {
      setPhotoBase64(compressed);
      stopCamera();
    });
  };

  const toggleFacingMode = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const compressed = await compressImage(file, 800, 800, 0.7);
        setPhotoBase64(compressed);
        stopCamera();
      } catch (err) {
        console.error('File compression error:', err);
        setCameraError('ไม่สามารถประมวลผลรูปภาพได้ กรุณาลองใหม่อีกครั้ง');
      }
    }
  };

  // Submit Check-in
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!studentId || !/^\d{11}$/.test(studentId.trim())) {
      setSubmitError('กรุณาระบุรหัสนักศึกษาให้ถูกต้อง (ตัวเลข 11 หลัก)');
      return;
    }

    if (!studentData) {
      setSubmitError('ไม่พบข้อมูลนักศึกษานี้ในระบบ กรุณาตรวจสอบรหัสอีกครั้ง');
      return;
    }

    if (assemblyStatus?.requirePhoto && !photoBase64) {
      setSubmitError('กรุณาถ่ายภาพหรือแนบรูปภาพหลักฐานขณะอยู่ในแถว');
      return;
    }

    let userCoords = coords;
    if (assemblyStatus?.requireGps && !userCoords) {
      setGpsLoading(true);
      setSubmitError('');
      try {
        userCoords = await getCurrentCoordinates();
        setCoords(userCoords);
      } catch (err: any) {
        setSubmitError(err.message || 'กรุณาเปิดระบบ GPS เพื่อยืนยันว่าคุณอยู่ในบริเวณลานเข้าแถว');
        setGpsLoading(false);
        return;
      }
      setGpsLoading(false);
    }

    setIsSubmitting(true);

    try {
      const payload = {
        student_id: studentId.trim(),
        token: urlToken || assemblyStatus?.activeToken,
        device_uuid: deviceUuid,
        hardware_fingerprint: hardwareFingerprint || deviceSignals?.hardwareFingerprint || null,
        confidence_score: 1.0,
        device_flags: deviceSignals ? JSON.stringify({
          os: deviceSignals.os,
          platform: deviceSignals.platform,
          screen: deviceSignals.screenInfo,
          gpu: deviceSignals.gpuRenderer
        }) : null,
        latitude: userCoords ? userCoords.latitude : null,
        longitude: userCoords ? userCoords.longitude : null,
        photo_base64: photoBase64
      };

      const res = await axios.post('/api/assembly/checkin', payload);
      setCheckInResult(res.data);
      setIsSuccess(true);

      // Fetch student assembly summary
      try {
        const summaryRes = await axios.get(`/api/assembly/student-summary/${studentId.trim()}`);
        setStudentSummary(summaryRes.data);
      } catch {}

      // Fetch student activity summary for easy comparison
      try {
        const actRes = await axios.get(`/api/attendances/student/${studentId.trim()}`);
        setActivitySummary(actRes.data);
      } catch {}

    } catch (err: any) {
      console.error('Assembly check-in error:', err);
      setSubmitError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกการเข้าแถว กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSessionClosed = assemblyStatus ? !assemblyStatus.isOpen : false;
  const sessionClosedReason = assemblyStatus?.reason || 'ระบบปิดรับการเช็กชื่อเข้าแถวแล้ว';

  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-between py-4 px-3 sm:py-12 sm:px-6">
      {/* Top Brand Logo - Perfectly centered matching UserScanForm */}
      <div className="flex justify-center">
        <div className="flex items-center space-x-2">
          <img src="/logo.svg" alt="AAS Logo" className="w-5 h-5 object-contain" />
          <span className="font-extrabold text-base text-ink tracking-tight">AAS</span>
        </div>
      </div>

      {/* Success View */}
      {isSuccess ? (
        <div className="max-w-md w-full mx-auto my-auto bg-canvas border border-hairline rounded-lg p-4 sm:p-6 md:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.04)] text-center space-y-4 sm:space-y-6 animate-in zoom-in-95 duration-200">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto border ${
            checkInResult?.status === 'present'
              ? 'bg-success/15 text-success border-success/30'
              : 'bg-amber-500/15 text-amber-600 border-amber-500/30'
          }`}>
            <CheckCircle2 size={32} />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-ink tracking-tight">
              {checkInResult?.status === 'present' ? 'เช็กชื่อเข้าแถวสำเร็จ!' : 'เช็กชื่อเข้าแถวสำเร็จ (มาสาย)'}
            </h1>
            <p className="text-muted text-sm">
              {checkInResult?.status === 'present'
                ? 'ระบบได้บันทึกสถานะ "มาทันเวลา" เรียบร้อยแล้ว'
                : 'คุณสแกนหลังเวลาที่กำหนด ระบบบันทึกสถานะ "มาสาย"'}
            </p>
          </div>

          {/* Student Info Card */}
          <div className="bg-surface-soft border border-hairline rounded-md p-4 text-left text-sm space-y-2.5">
            <div className="flex justify-between border-b border-hairline pb-2">
              <span className="text-muted">ชื่อ-นามสกุล</span>
              <span className="font-semibold text-ink">
                {checkInResult?.student?.prefix}{checkInResult?.student?.first_name} {checkInResult?.student?.last_name}
              </span>
            </div>
            <div className="flex justify-between border-b border-hairline pb-2">
              <span className="text-muted">รหัสนักศึกษา</span>
              <span className="font-mono font-semibold text-ink">{checkInResult?.student?.student_id}</span>
            </div>
            <div className="flex justify-between border-b border-hairline pb-2">
              <span className="text-muted">กลุ่มเรียน / สาขาวิชา</span>
              <span className="font-semibold text-ink text-right text-xs">
                {checkInResult?.student?.level} {checkInResult?.student?.year} • {checkInResult?.student?.major_name} ({checkInResult?.student?.room})
              </span>
            </div>
            <div className="flex justify-between items-center pt-0.5">
              <span className="text-muted">สถานะการเข้าแถว</span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                checkInResult?.status === 'present'
                  ? 'bg-success/15 text-success border border-success/30'
                  : 'bg-amber-500/15 text-amber-700 border border-amber-500/30'
              }`}>
                {checkInResult?.status === 'present' ? '🟢 ทันเวลา' : '🟡 มาสาย'}
              </span>
            </div>
          </div>

          {/* Tab Switcher: Assembly vs Activity Summary */}
          <div className="space-y-3 pt-1">
            <div className="flex bg-surface-soft p-1 rounded-lg border border-hairline">
              <button
                type="button"
                onClick={() => setSummaryTab('assembly')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  summaryTab === 'assembly'
                    ? 'bg-canvas text-ink shadow-xs'
                    : 'text-muted hover:text-ink'
                }`}
              >
                🏫 สรุปการเข้าแถว
              </button>
              <button
                type="button"
                onClick={() => setSummaryTab('activity')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  summaryTab === 'activity'
                    ? 'bg-canvas text-ink shadow-xs'
                    : 'text-muted hover:text-ink'
                }`}
              >
                🎓 สรุปคาบกิจกรรม
              </button>
            </div>

            {/* Assembly Stats */}
            {summaryTab === 'assembly' && studentSummary?.summary && (
              <div className="bg-canvas border border-hairline rounded-md p-3 text-left space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink">สถิติการเข้าแถวรวม</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    studentSummary.summary.isPass
                      ? 'bg-success/15 text-success border border-success/30'
                      : 'bg-error/15 text-error border border-error/30'
                  }`}>
                    {studentSummary.summary.isPass ? 'ผ่านเกณฑ์ (≥80%)' : 'ยังไม่ผ่านเกณฑ์'}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div className="bg-surface-soft p-2 rounded border border-hairline">
                    <div className="text-[10px] text-muted">มา</div>
                    <div className="text-sm font-bold text-success">{studentSummary.summary.presentCount}</div>
                  </div>
                  <div className="bg-surface-soft p-2 rounded border border-hairline">
                    <div className="text-[10px] text-muted">สาย</div>
                    <div className="text-sm font-bold text-amber-600">{studentSummary.summary.lateCount}</div>
                  </div>
                  <div className="bg-surface-soft p-2 rounded border border-hairline">
                    <div className="text-[10px] text-muted">ลา</div>
                    <div className="text-sm font-bold text-sky-600">{studentSummary.summary.leaveCount}</div>
                  </div>
                  <div className="bg-surface-soft p-2 rounded border border-hairline">
                    <div className="text-[10px] text-muted">ขาด</div>
                    <div className="text-sm font-bold text-error">{studentSummary.summary.absentCount}</div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs pt-1 border-t border-hairline">
                  <span className="text-muted">อัตราการเข้าแถวทั้งหมด:</span>
                  <span className="font-extrabold text-sm text-ink">{studentSummary.summary.rate}%</span>
                </div>
              </div>
            )}

            {/* Activity Stats */}
            {summaryTab === 'activity' && (
              <div className="bg-canvas border border-hairline rounded-md p-3 text-left space-y-2 animate-in fade-in duration-200">
                <span className="text-xs font-bold text-ink">ประวัติการเข้าร่วมคาบกิจกรรม</span>
                {Array.isArray(activitySummary) && activitySummary.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted">
                      เข้าร่วมกิจกรรมแล้ว <strong className="text-ink">{activitySummary.length}</strong> ครั้ง
                    </div>
                    <div className="max-h-32 overflow-y-auto divide-y divide-hairline text-[11px]">
                      {activitySummary.slice(0, 5).map((a: any) => (
                        <div key={a.id} className="py-1 flex justify-between">
                          <span className="text-muted">ครั้งที่ {a.week_number} ({a.session_title})</span>
                          <span className="text-success font-medium">เข้าแล้ว</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted py-2 text-center">
                    ยังไม่มีประวัติการเช็กชื่อในคาบกิจกรรม
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-2">
            <Link
              to={`/?id=${checkInResult?.student?.student_id || studentId}`}
              className="w-full h-11 bg-primary hover:bg-primary-active text-white text-sm font-semibold rounded-md flex items-center justify-center space-x-2 transition-all"
            >
              <span>ตรวจสอบสถิติการเช็กชื่อของฉัน</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      ) : statusLoading ? (
        /* Loading View */
        <div className="max-w-md w-full mx-auto my-auto bg-canvas border border-hairline rounded-lg p-12 text-center space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-muted font-semibold">กำลังตรวจสอบข้อมูลรอบการเข้าแถวและประวัติเครื่อง...</p>
        </div>
      ) : (
        /* Form View - Exactly matches UserScanForm */
        <div className="max-w-md w-full mx-auto my-auto bg-canvas border border-hairline rounded-lg p-4 sm:p-6 md:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.04)] space-y-5 sm:space-y-8">
          {/* Card Header */}
          <div className="text-center space-y-1.5 sm:space-y-3">
            <div className="hidden sm:flex w-12 h-12 bg-surface-soft border border-hairline text-ink rounded-full items-center justify-center mx-auto">
              <Sparkles className="text-primary animate-pulse w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg sm:text-2xl font-bold text-ink tracking-tight">เช็กชื่อเข้าแถวหน้าเสาธง</h1>
              {assemblyStatus && (
                <p className={`text-[11px] sm:text-xs font-semibold mt-0.5 sm:mt-1 ${
                  isSessionClosed ? 'text-error' : assemblyStatus?.currentStatus === 'late' ? 'text-amber-600' : 'text-error'
                }`}>
                  {isSessionClosed
                    ? sessionClosedReason
                    : `เวลาเข้าแถว ${assemblyStatus.startTime} - ${assemblyStatus.closeTime} น. (สายหลัง ${assemblyStatus.lateTime} น.)`}
                </p>
              )}
              <p className="hidden sm:block text-muted text-xs mt-1">กรุณากรอกรหัสนักศึกษาและถ่ายภาพเพื่อยืนยันการเข้าแถว</p>
            </div>
          </div>

          {/* Student Found Banner */}
          {studentData && (
            <div className="flex items-center space-x-2 p-3 bg-success/15 border border-success/30 text-success text-xs font-semibold rounded-md animate-in fade-in duration-200">
              <CheckCircle2 size={16} className="flex-shrink-0" />
              <span>ดึงข้อมูลรายชื่อจากระบบล่วงหน้าสำเร็จ!</span>
            </div>
          )}

          {/* Submit Error Banner */}
          {submitError && (
            <div className="flex items-center space-x-2 p-3 bg-error/15 border border-error/30 text-error text-xs font-semibold rounded-md">
              <ShieldAlert size={16} className="flex-shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* System Closed Banner */}
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
            {/* Student ID (11 Digits) */}
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
              <div className="relative">
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
                  className={`w-full h-11 border rounded-md px-3.5 text-base bg-canvas text-ink placeholder:text-muted-soft focus:outline-none transition-all font-mono ${
                    studentId.length > 0 && studentId.length !== 11
                      ? 'border-error/60 focus:border-error focus:ring-1 focus:ring-error'
                      : 'border-hairline focus:border-primary focus:ring-1 focus:ring-primary'
                  } disabled:bg-surface-soft disabled:text-muted`}
                  placeholder="เช่น 66209010001"
                />
                {searchingStudent && (
                  <div className="absolute right-3 top-3">
                    <RefreshCw size={16} className="text-muted animate-spin" />
                  </div>
                )}
              </div>

              {/* Student Info Card Preview */}
              {studentData && (
                <div className="bg-surface-soft border border-hairline rounded-md p-3.5 text-left text-xs space-y-1.5 animate-in fade-in duration-150 mt-2">
                  <div className="flex justify-between border-b border-hairline pb-1.5">
                    <span className="text-muted">ชื่อ-นามสกุล</span>
                    <span className="font-semibold text-ink">{studentData.prefix}{studentData.first_name} {studentData.last_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">กลุ่มเรียน / สาขาวิชา</span>
                    <span className="font-semibold text-ink">{studentData.level} {studentData.year} • {studentData.major_name} ({studentData.room})</span>
                  </div>
                </div>
              )}

              {studentNotFound && (
                <div className="p-3 bg-error/15 border border-error/30 text-error text-xs font-semibold rounded-md mt-2">
                  ⚠️ ไม่พบข้อมูลนักศึกษารหัสนี้ในระบบ กรุณาตรวจสอบอีกครั้ง
                </div>
              )}
            </div>

            {/* Photo Capture Section - Integrated cleanly */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5">
                  <Camera size={14} className="text-primary" />
                  <span>ภาพถ่ายหลักฐานในแถว</span>
                  {assemblyStatus?.requirePhoto && <span className="text-error">*</span>}
                </label>
                {photoBase64 && (
                  <button
                    type="button"
                    disabled={isSessionClosed}
                    onClick={() => {
                      setPhotoBase64(null);
                      startCamera();
                    }}
                    className="text-xs text-primary hover:underline font-semibold cursor-pointer"
                  >
                    ถ่ายใหม่
                  </button>
                )}
              </div>

              {/* Camera Preview / Photo Box */}
              <div className="border border-hairline rounded-md overflow-hidden bg-surface-soft relative">
                {photoBase64 ? (
                  <div className="relative w-full h-56">
                    <img
                      src={photoBase64}
                      alt="หลักฐานการเข้าแถว"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2.5 left-2.5 bg-black/70 text-white text-[11px] px-2.5 py-1 rounded-md flex items-center gap-1.5 backdrop-blur-xs">
                      <CheckCircle2 size={13} className="text-emerald-400" />
                      <span>บันทึกภาพถ่ายแล้ว</span>
                    </div>
                    <button
                      type="button"
                      disabled={isSessionClosed}
                      onClick={() => {
                        setPhotoBase64(null);
                        startCamera();
                      }}
                      className="absolute bottom-2.5 right-2.5 bg-canvas/90 hover:bg-canvas text-ink text-[11px] font-semibold px-2.5 py-1 rounded-md shadow-xs border border-hairline transition-all cursor-pointer"
                    >
                      เปลี่ยนรูป
                    </button>
                  </div>
                ) : isCameraActive ? (
                  <div className="relative w-full h-60 bg-black flex flex-col items-center justify-center">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={toggleFacingMode}
                        className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md flex items-center justify-center transition-all cursor-pointer"
                        title="สลับกล้องหน้า/หลัง"
                      >
                        <RefreshCw size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="w-12 h-12 rounded-full bg-white text-ink border-2 border-white/70 flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer"
                        title="กดเพื่อถ่ายรูป"
                      >
                        <Camera size={22} className="text-primary" />
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md flex items-center justify-center transition-all cursor-pointer"
                        title="ปิดกล้อง"
                      >
                        <XCircle size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 sm:p-5 text-center space-y-3">
                    <div className="w-11 h-11 rounded-full bg-canvas border border-hairline flex items-center justify-center mx-auto text-muted">
                      <Camera size={20} className="text-primary/80" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-ink">ถ่ายภาพเซลฟี่หรือภาพยืนในแถว</p>
                      <p className="text-[11px] text-muted">จำเป็นต้องมีภาพขณะเข้าแถวเพื่อเป็นหลักฐานยืนยัน</p>
                    </div>
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isSessionClosed}
                        onClick={() => startCamera('user')}
                        className="h-9 px-4 bg-primary hover:bg-primary-active disabled:opacity-50 text-white text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-xs"
                      >
                        <Camera size={14} />
                        <span>เปิดกล้องถ่ายสด</span>
                      </button>
                      <button
                        type="button"
                        disabled={isSessionClosed}
                        onClick={() => fileInputRef.current?.click()}
                        className="h-9 px-3.5 bg-canvas hover:bg-surface-soft disabled:opacity-50 border border-hairline text-ink text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                      >
                        <span>เลือกจากคลังภาพ</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Hidden File Input for photo selection */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleFileChange}
                className="hidden"
              />

              {cameraError && (
                <div className="text-[11px] text-error bg-error/15 p-2 rounded-md border border-error/30 font-medium">
                  {cameraError}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSessionClosed || isSubmitting || gpsLoading}
              className="w-full h-11 bg-primary hover:bg-primary-active disabled:bg-surface-strong text-white text-sm font-semibold rounded-md flex items-center justify-center space-x-2 transition-all shadow-sm active:scale-98 mt-1 sm:mt-2 cursor-pointer"
            >
              {isSubmitting || gpsLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <CheckSquare size={16} />
              )}
              <span>
                {isSessionClosed
                  ? 'ปิดรับการเช็กชื่อเข้าแถวแล้ว'
                  : isSubmitting
                    ? 'กำลังบันทึกข้อมูล...'
                    : gpsLoading
                    ? 'กำลังดึงตำแหน่ง GPS...'
                    : 'ยืนยันการเช็กชื่อเข้าแถว'}
              </span>
            </button>
          </form>

          {/* Footer Link - Exactly matching UserScanForm */}
          <div className="border-t border-hairline pt-4 sm:pt-5 text-center">
            <Link
              to={`/?id=${studentId || ''}`}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-muted hover:text-ink transition-colors"
            >
              <span>ต้องการตรวจสอบประวัติการเข้าแถว?</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      )}

      {/* Footer Branding - Exactly matching UserScanForm */}
      <div className="text-center text-[11px] text-muted-soft mt-4 sm:mt-8">
        © {new Date().getFullYear()} AAS ขับเคลื่อนระบบด้วยฐานข้อมูล SQLite และ Google Sheets API
      </div>
    </div>
  );
}

export default function UserAssemblyScanWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <UserAssemblyScan />
    </ErrorBoundary>
  );
}
