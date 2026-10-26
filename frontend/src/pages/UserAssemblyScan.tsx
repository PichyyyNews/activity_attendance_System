import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import {
  Camera,
  RefreshCw,
  CheckCircle2,
  ShieldAlert,
  CheckSquare,
  ArrowRight,
  AlertCircle,
  Image as ImageIcon,
  X,
  Trash2,
  Calendar
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
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [isShutterFlashing, setIsShutterFlashing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

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

  // Lock body scroll when camera is active
  useEffect(() => {
    if (isCameraActive) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isCameraActive]);

  // Synchronize stream with video element when camera mounts or facingMode changes
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch(err => {
        console.warn('Video play() caught in useEffect:', err);
      });
    }
  }, [isCameraActive, facingMode]);

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

  // Check if today is the scheduled assembly day for this student's level
  const levelScheduleCheck = useMemo(() => {
    if (!studentData || !assemblyStatus || assemblyStatus.isOverridden) {
      return { isAllowed: true, reason: '' };
    }

    const todayDate = assemblyStatus.todayDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    const dayNum = new Date(`${todayDate}T12:00:00+07:00`).getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

    const vocDays = (assemblyStatus.activeDaysVoc || '1,3,5').split(',').map((d: string) => parseInt(d.trim(), 10));
    const dvocDays = (assemblyStatus.activeDaysDvoc || '2,4').split(',').map((d: string) => parseInt(d.trim(), 10));

    const level = (studentData.level || '').trim();
    const isVoc = level.startsWith('ปวช');
    const isDvoc = level.startsWith('ปวส');

    const dayNameMap: Record<number, string> = { 1: 'จันทร์', 2: 'อังคาร', 3: 'พุธ', 4: 'พฤหัสบดี', 5: 'ศุกร์', 6: 'เสาร์', 0: 'อาทิตย์' };
    const vocDayNames = vocDays.map((d: number) => dayNameMap[d] || d).join('/');
    const dvocDayNames = dvocDays.map((d: number) => dayNameMap[d] || d).join('/');

    if (isVoc && !vocDays.includes(dayNum)) {
      return {
        isAllowed: false,
        reason: `วันนี้เป็นคิวเข้าแถวของระดับ ปวส. (ระดับ ปวช. มีกำหนดเข้าแถววัน ${vocDayNames})`
      };
    }

    if (isDvoc && !dvocDays.includes(dayNum)) {
      return {
        isAllowed: false,
        reason: `วันนี้เป็นคิวเข้าแถวของระดับ ปวช. (ระดับ ปวส. มีกำหนดเข้าแถววัน ${dvocDayNames})`
      };
    }

    return { isAllowed: true, reason: '' };
  }, [studentData, assemblyStatus]);

  // Camera Management
  const openNativeCamera = () => {
    setCameraError('');
    stopCamera();
    cameraInputRef.current?.click();
  };

  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    setCameraError('');
    setIsCameraLoading(true);

    // Fallback if mediaDevices or getUserMedia is not supported in this browser (e.g. non-HTTPS, iOS LINE/FB webview)
    if (!navigator?.mediaDevices?.getUserMedia) {
      setIsCameraLoading(false);
      console.warn('getUserMedia not supported, falling back to native camera input');
      openNativeCamera();
      return;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => {
          try { t.stop(); } catch (_) {}
        });
        streamRef.current = null;
      }

      let stream: MediaStream | null = null;
      // Step 1: Attempt with ideal 720p constraints
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (err1) {
        console.warn('Constraint stage 1 failed, trying relaxed facingMode:', err1);
        try {
          // Step 2: Attempt with simple facingMode
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: mode },
            audio: false,
          });
        } catch (err2) {
          console.warn('Constraint stage 2 failed, falling back to basic video:', err2);
          // Step 3: Attempt bare minimum video
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      if (!stream) {
        throw new Error('No video stream available');
      }

      streamRef.current = stream;
      setFacingMode(mode);
      setIsCameraActive(true);
      setIsCameraLoading(false);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(playErr => {
          console.warn('Video play() interrupted:', playErr);
        });
      }
    } catch (err: any) {
      setIsCameraLoading(false);
      console.warn('Camera access denied or failed:', err);
      stopCamera();
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setCameraError('ไม่ได้รับอนุญาตให้เข้าถึงกล้อง กรุณาเปิดสิทธิ์ในตั้งค่าเบราว์เซอร์ หรือกด "เลือกรูปจากเครื่อง / ถ่ายด้วยกล้องมือถือ"');
      } else {
        setCameraError('ไม่สามารถเปิดกล้องสดได้ กรุณาใช้ "กล้องมือถือ" หรือ "เลือกรูปจากคลังภาพ" ด้านล่าง');
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch (_) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsCameraLoading(false);
  };

  // Cleanup camera stream when component unmounts
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    try { navigator.vibrate?.(50); } catch (_) {}
    setIsShutterFlashing(true);
    setTimeout(() => setIsShutterFlashing(false), 200);

    const video = videoRef.current;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror image if using front camera so it matches user expectation
    if (facingMode === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, w, h);
    const rawData = canvas.toDataURL('image/jpeg', 0.85);

    compressImage(rawData, 960, 960, 0.75).then(compressed => {
      setPhotoBase64(compressed);
      stopCamera();
    }).catch(err => {
      console.error('Capture photo compression error:', err);
      setCameraError('ไม่สามารถประมวลผลรูปถ่ายได้ กรุณาลองใหม่อีกครั้ง');
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
        setCameraError('');
        const compressed = await compressImage(file, 960, 960, 0.75);
        setPhotoBase64(compressed);
        stopCamera();
      } catch (err) {
        console.error('File compression error:', err);
        setCameraError('ไม่สามารถประมวลผลรูปภาพได้ กรุณาลองใหม่อีกครั้ง');
      } finally {
        e.target.value = '';
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

    if (!levelScheduleCheck.isAllowed) {
      setSubmitError(levelScheduleCheck.reason);
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
        /* Form View - Compact & Highly Responsive */
        <div className="max-w-md w-full mx-auto my-auto bg-canvas border border-hairline rounded-xl p-4 sm:p-6 shadow-[0_8px_32px_rgba(0,0,0,0.04)] space-y-4">
          {/* Card Header */}
          <div className="text-center space-y-1.5">
            <h1 className="text-lg sm:text-xl font-bold text-ink tracking-tight">เช็กชื่อเข้าแถวหน้าเสาธง</h1>
            {assemblyStatus && (
              <div className="flex items-center justify-center">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-surface-soft border border-hairline text-ink shadow-2xs">
                  <span className={`w-1.5 h-1.5 rounded-full ${isSessionClosed ? 'bg-muted-soft' : 'bg-ink'}`} />
                  <span>
                    {isSessionClosed
                      ? sessionClosedReason
                      : assemblyStatus?.currentStatus === 'late'
                      ? `เปิดรับเช็กชื่อ (เริ่มสายหลัง ${assemblyStatus.lateTime} น.)`
                      : `เปิดรับเช็กชื่อ ${assemblyStatus.startTime} - ${assemblyStatus.closeTime} น.`}
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Submit Error Banner (Only shown on actual error) */}
          {submitError && (
            <div className="flex items-center space-x-2 p-2.5 bg-surface-soft border border-hairline text-ink text-xs font-semibold rounded-lg animate-in fade-in">
              <ShieldAlert size={15} className="shrink-0 text-ink" />
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Student ID (11 Digits) */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="block text-[11px] font-semibold text-ink uppercase tracking-wider">รหัสนักศึกษา (11 หลัก)</label>
                {studentId.length > 0 && (
                  <span className="text-[11px] font-mono font-bold text-ink">
                    {studentId.length === 11
                      ? '✓ ครบ 11 หลัก'
                      : `${studentId.length}/11`}
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
                  className="w-full h-10 border rounded-lg px-3 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none transition-all font-mono border-hairline focus:border-ink focus:ring-1 focus:ring-ink disabled:bg-surface-soft disabled:text-muted"
                  placeholder="เช่น 66209010001"
                />
                {searchingStudent && (
                  <div className="absolute right-3 top-2.5">
                    <RefreshCw size={15} className="text-muted animate-spin" />
                  </div>
                )}
              </div>

              {/* Integrated Student Info Card Preview */}
              {studentData && (
                <div className="rounded-lg p-3.5 text-left text-xs space-y-2 transition-all mt-2 bg-surface-soft border border-hairline shadow-2xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink text-sm truncate">
                      {studentData.prefix}{studentData.first_name} {studentData.last_name}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-canvas border border-hairline shrink-0 text-ink font-mono shadow-2xs">
                      {studentData.level} {studentData.year}
                    </span>
                  </div>
                  <div className="text-xs text-muted truncate">
                    {studentData.major_name} {studentData.room ? `(${studentData.room})` : ''}
                  </div>

                  {/* Alternating schedule notice integrated with high contrast black/white */}
                  {!levelScheduleCheck.isAllowed && (
                    <div className="pt-2.5 border-t border-hairline text-xs space-y-1">
                      <div className="flex items-start gap-2 text-ink font-bold">
                        <Calendar size={14} className="shrink-0 mt-0.5 text-ink" />
                        <span className="text-ink leading-snug">{levelScheduleCheck.reason}</span>
                      </div>
                      <p className="text-[11px] text-muted pl-5.5">
                        * ระบบยกเว้นการเข้าแถวให้อัตโนมัติ (ไม่นับเป็นวันขาด)
                      </p>
                    </div>
                  )}
                </div>
              )}

              {studentNotFound && (
                <div className="p-2.5 bg-surface-soft border border-hairline text-ink text-xs font-semibold rounded-lg mt-1.5 flex items-center gap-1.5">
                  <AlertCircle size={14} className="shrink-0 text-ink" />
                  <span>ไม่พบข้อมูลนักศึกษารหัสนี้ในระบบ กรุณาตรวจสอบอีกครั้ง</span>
                </div>
              )}
            </div>

            {/* 2. Photo Evidence Section (Shown only when check-in is relevant) */}
            {(!isSessionClosed && levelScheduleCheck.isAllowed) || photoBase64 ? (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-semibold text-ink uppercase tracking-wider flex items-center gap-1.5">
                    <Camera size={13} className="text-primary" />
                    <span>ภาพถ่ายหลักฐานในแถว</span>
                    {assemblyStatus?.requirePhoto && <span className="text-error font-bold">*</span>}
                  </label>
                  {photoBase64 && (
                    <button
                      type="button"
                      disabled={isSessionClosed}
                      onClick={() => {
                        setPhotoBase64(null);
                        startCamera('user');
                      }}
                      className="text-[11px] text-primary hover:underline font-semibold cursor-pointer"
                    >
                      ถ่ายใหม่
                    </button>
                  )}
                </div>

                {/* Photo Box or Dual Action Card */}
                {photoBase64 ? (
                  <div className="border border-hairline rounded-lg overflow-hidden bg-canvas shadow-xs">
                    <div className="relative w-full aspect-[4/3] max-h-56 bg-black flex items-center justify-center overflow-hidden">
                      <img
                        src={photoBase64}
                        alt="หลักฐานการเข้าแถว"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 left-2 bg-black/75 text-white text-[10px] font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-xs">
                        <CheckCircle2 size={12} className="text-white" />
                        <span>บันทึกภาพถ่ายแล้ว</span>
                      </div>
                      <button
                        type="button"
                        disabled={isSessionClosed}
                        onClick={() => setPhotoBase64(null)}
                        className="absolute top-2 right-2 bg-black/75 text-white hover:text-white/80 p-1 rounded-full backdrop-blur-xs cursor-pointer transition-colors"
                        title="ลบภาพ"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="p-2 bg-surface-soft/60 border-t border-hairline flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isSessionClosed}
                          onClick={() => {
                            setPhotoBase64(null);
                            startCamera('user');
                          }}
                          className="h-7 px-2.5 bg-canvas hover:bg-surface-soft border border-hairline text-ink text-xs font-semibold rounded-md flex items-center gap-1 shadow-2xs transition-all cursor-pointer active:scale-95"
                        >
                          <RefreshCw size={11} />
                          <span>ถ่ายใหม่</span>
                        </button>

                        <label
                          htmlFor="main-gallery-input"
                          className={`h-7 px-2.5 bg-canvas hover:bg-surface-soft border border-hairline text-ink text-xs font-semibold rounded-md flex items-center gap-1 shadow-2xs transition-all cursor-pointer active:scale-95 ${isSessionClosed ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                          <ImageIcon size={11} />
                          <span>เลือกรูปใหม่</span>
                        </label>
                      </div>

                      <button
                        type="button"
                        disabled={isSessionClosed}
                        onClick={() => setPhotoBase64(null)}
                        className="h-7 px-2 text-muted hover:text-ink text-xs font-semibold rounded-md flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                        title="ลบรูปภาพ"
                      >
                        <Trash2 size={12} />
                        <span>ลบ</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border border-hairline rounded-lg overflow-hidden bg-surface-soft/40 p-3 space-y-2 text-center">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isSessionClosed || isCameraLoading}
                        onClick={() => startCamera('user')}
                        className="h-9 px-3 bg-primary hover:bg-primary-active disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-xs active:scale-98"
                      >
                        {isCameraLoading ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Camera size={14} />
                        )}
                        <span>{isCameraLoading ? 'เปิดกล้อง...' : 'เปิดกล้องถ่ายภาพ'}</span>
                      </button>

                      <label
                        htmlFor="main-gallery-input"
                        className={`h-9 px-3 bg-canvas hover:bg-surface-soft border border-hairline text-ink text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-2xs active:scale-98 ${isSessionClosed ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <ImageIcon size={14} className="text-muted" />
                        <span>เลือกจากคลังภาพ</span>
                      </label>
                    </div>

                    <div className="text-center pt-0.5">
                      <label
                        htmlFor="main-camera-input"
                        className={`text-[10px] text-muted hover:text-primary font-medium inline-flex items-center gap-1 cursor-pointer transition-colors ${isSessionClosed ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <Camera size={11} />
                        <span>หรือถ่ายด้วยแอปกล้องในเครื่อง</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Native Inputs for File/Gallery & Native Camera */}
                <input
                  id="main-camera-input"
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <input
                  id="main-gallery-input"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <input
                  id="fullscreen-camera-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <input
                  id="fullscreen-gallery-input"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {cameraError && (
                  <div className="text-[11px] text-ink bg-surface-soft p-2.5 rounded-lg border border-hairline font-medium flex items-start gap-1.5 text-left shadow-2xs">
                    <AlertCircle size={14} className="shrink-0 mt-0.5 text-ink" />
                    <div className="space-y-1 flex-1">
                      <span>{cameraError}</span>
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <label
                          htmlFor="main-camera-input"
                          className="text-[10px] text-white bg-primary px-2.5 py-1 rounded cursor-pointer font-semibold shadow-2xs hover:bg-primary-active inline-flex items-center gap-1"
                        >
                          <Camera size={11} />
                          <span>กล้องมือถือ</span>
                        </label>
                        <label
                          htmlFor="main-gallery-input"
                          className="text-[10px] text-ink bg-canvas px-2.5 py-1 rounded border border-hairline cursor-pointer font-semibold shadow-2xs hover:bg-surface-soft inline-flex items-center gap-1"
                        >
                          <ImageIcon size={11} />
                          <span>เลือกจากเครื่อง</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSessionClosed || isSubmitting || gpsLoading || !levelScheduleCheck.isAllowed}
              className="w-full h-10 bg-primary hover:bg-primary-active disabled:bg-surface-strong text-white text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center space-x-2 transition-all shadow-sm active:scale-98 mt-1 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting || gpsLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <CheckSquare size={15} />
              )}
              <span>
                {isSessionClosed
                  ? 'ปิดรับการเช็กชื่อเข้าแถวแล้ว'
                  : !levelScheduleCheck.isAllowed
                    ? `วันนี้ไม่ใช่คิวเข้าแถวของระดับ ${studentData?.level || ''}`
                    : isSubmitting
                      ? 'กำลังบันทึกข้อมูล...'
                      : gpsLoading
                        ? 'กำลังดึงตำแหน่ง GPS...'
                        : 'ยืนยันการเช็กชื่อเข้าแถว'}
              </span>
            </button>
          </form>

          {/* Footer Link */}
          <div className="border-t border-hairline pt-3 text-center">
            <Link
              to={`/?id=${studentId || ''}`}
              className="inline-flex items-center space-x-1 text-xs font-semibold text-muted hover:text-ink transition-colors"
            >
              <span>ต้องการตรวจสอบประวัติการเข้าแถว?</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      )}

      {/* Fullscreen Mobile Camera HUD */}
      {isCameraActive && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none overflow-hidden touch-none animate-in fade-in duration-200">
          {/* Shutter Flash Animation */}
          {isShutterFlashing && (
            <div className="absolute inset-0 bg-white z-50 transition-opacity duration-200 pointer-events-none" />
          )}

          {/* Top Bar */}
          <div
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
            className="relative z-30 px-4 py-3 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent"
          >
            <button
              type="button"
              onClick={stopCamera}
              className="h-10 px-3.5 rounded-full bg-black/60 hover:bg-black/80 text-white text-xs font-semibold backdrop-blur-md flex items-center gap-1.5 border border-white/20 active:scale-95 transition-all cursor-pointer"
            >
              <X size={16} />
              <span>ปิดกล้อง</span>
            </button>

            <div className="text-white text-xs font-semibold px-3 py-1 bg-black/50 backdrop-blur-md rounded-full border border-white/10 flex items-center gap-1.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>กล้องถ่ายสด ({facingMode === 'user' ? 'กล้องหน้า' : 'กล้องหลัง'})</span>
            </div>

            <button
              type="button"
              onClick={toggleFacingMode}
              className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md flex items-center justify-center border border-white/20 active:scale-95 transition-all cursor-pointer"
              title="สลับกล้องหน้า/หลัง"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {/* Center Viewfinder */}
          <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden bg-black">
            <video
              ref={(node) => {
                videoRef.current = node;
                if (node && streamRef.current && node.srcObject !== streamRef.current) {
                  node.srcObject = streamRef.current;
                  node.play().catch(e => console.warn('Autoplay caught:', e));
                }
              }}
              autoPlay
              playsInline
              muted
              style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Attendance Framing Reticle */}
            <div className="relative z-20 pointer-events-none flex flex-col items-center justify-center p-4">
              <div className="w-64 h-80 sm:w-80 sm:h-96 border-2 border-white/50 border-dashed rounded-3xl relative flex flex-col items-center justify-between p-4 shadow-2xl">
                {/* Corner Accents */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-xl" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-xl" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-xl" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-xl" />

                <span className="text-[11px] text-white font-medium bg-black/60 px-3 py-1 rounded-full backdrop-blur-md border border-white/10 shadow-sm">
                  จัดใบหน้าให้อยู่ในกรอบและเห็นบริเวณแถว
                </span>
                <span className="text-[10px] text-white/90 bg-black/50 px-2.5 py-0.5 rounded-full backdrop-blur-md">
                  กดปุ่มสีขาวด้านล่างเพื่อถ่ายภาพ
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Bar Controls */}
          <div
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            className="relative z-30 px-6 py-5 flex items-center justify-around bg-gradient-to-t from-black/90 via-black/60 to-transparent"
          >
            {/* Gallery Upload Option */}
            <label
              htmlFor="fullscreen-gallery-input"
              className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md flex flex-col items-center justify-center border border-white/20 active:scale-95 transition-all cursor-pointer shadow-lg"
              title="เลือกรูปจากคลังภาพในเครื่อง"
            >
              <ImageIcon size={18} />
              <span className="text-[9px] mt-0.5 font-medium">คลังภาพ</span>
            </label>

            {/* Large Shutter Button */}
            <button
              type="button"
              onClick={capturePhoto}
              className="w-20 h-20 rounded-full border-4 border-white/90 p-1 flex items-center justify-center active:scale-90 transition-transform shadow-2xl cursor-pointer"
              title="กดถ่ายภาพ"
            >
              <div className="w-full h-full rounded-full bg-white active:bg-gray-200 transition-colors shadow-inner" />
            </button>

            {/* Native Camera App Option */}
            <label
              htmlFor="fullscreen-camera-input"
              className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md flex flex-col items-center justify-center border border-white/20 active:scale-95 transition-all cursor-pointer shadow-lg"
              title="เปิดกล้องมือถือโดยตรง"
            >
              <Camera size={18} />
              <span className="text-[9px] mt-0.5 font-medium">กล้องมือถือ</span>
            </label>
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
