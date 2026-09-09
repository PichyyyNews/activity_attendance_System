import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import {
  Camera,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  XCircle,
  Fingerprint
} from 'lucide-react';
import { getHardwareFingerprint, getDeviceSignals } from '../utils/fingerprint';
import type { DeviceSignals } from '../utils/fingerprint';

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

export default function UserAssemblyScan() {
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
  const [gpsError, setGpsError] = useState('');
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

  // 3. Auto-fetch GPS location if required
  useEffect(() => {
    if (assemblyStatus?.requireGps && navigator.geolocation) {
      setGpsLoading(true);
      navigator.geolocation.getCurrentPosition(
        pos => {
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          });
          setGpsLoading(false);
        },
        err => {
          console.warn('GPS error:', err);
          setGpsError('กรุณาเปิด GPS และอนุญาตการเข้าถึงตำแหน่งเพื่อเช็กชื่อเข้าแถว');
          setGpsLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, [assemblyStatus]);

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

    if (assemblyStatus?.requireGps && !coords) {
      setSubmitError('กรุณาเปิดระบบ GPS เพื่อยืนยันว่าคุณอยู่ในบริเวณลานเข้าแถว');
      return;
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
        latitude: coords ? coords.latitude : null,
        longitude: coords ? coords.longitude : null,
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

  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-between py-6 px-3 sm:px-6">
      {/* Top Brand Header */}
      <div className="max-w-md w-full mx-auto flex items-center justify-between pb-4 border-b border-hairline">
        <div className="flex items-center space-x-2.5">
          <img src="/logo.svg" alt="AAS Logo" className="w-6 h-6 object-contain" />
          <span className="font-extrabold text-base text-ink tracking-tight">AAS</span>
          <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold px-2 py-0.5 rounded-full">
            เข้าแถวหน้าเสาธง
          </span>
        </div>
        <Link
          to="/"
          className="text-xs text-muted hover:text-ink flex items-center gap-1 transition-colors"
        >
          <span>หน้าหลัก</span>
          <ChevronRight size={14} />
        </Link>
      </div>

      {/* Success View */}
      {isSuccess ? (
        <div className="max-w-md w-full mx-auto my-auto bg-canvas border border-hairline rounded-xl p-5 sm:p-7 shadow-[0_8px_32px_rgba(0,0,0,0.04)] text-center space-y-5 animate-in zoom-in-95 duration-200">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto border ${
            checkInResult?.status === 'present'
              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
              : 'bg-amber-50 text-amber-600 border-amber-200'
          }`}>
            <CheckCircle2 size={34} />
          </div>

          <div className="space-y-1">
            <h1 className="text-xl font-bold text-ink">
              {checkInResult?.status === 'present' ? 'เช็กชื่อเข้าแถวสำเร็จ!' : 'เช็กชื่อเข้าแถวสำเร็จ (มาสาย)'}
            </h1>
            <p className="text-xs text-muted">
              {checkInResult?.status === 'present'
                ? 'ระบบบันทึกสถานะ "มาทันเวลา" เรียบร้อยแล้ว'
                : 'คุณสแกนหลังเวลาที่กำหนด ระบบบันทึกสถานะ "มาสาย"'}
            </p>
          </div>

          {/* Student Info Card */}
          <div className="bg-surface-soft border border-hairline rounded-lg p-3.5 text-left text-xs space-y-2">
            <div className="flex justify-between border-b border-hairline pb-1.5">
              <span className="text-muted">ชื่อ-นามสกุล</span>
              <span className="font-semibold text-ink">
                {checkInResult?.student?.prefix}{checkInResult?.student?.first_name} {checkInResult?.student?.last_name}
              </span>
            </div>
            <div className="flex justify-between border-b border-hairline pb-1.5">
              <span className="text-muted">รหัสนักศึกษา</span>
              <span className="font-mono font-bold text-ink">{checkInResult?.student?.student_id}</span>
            </div>
            <div className="flex justify-between border-b border-hairline pb-1.5">
              <span className="text-muted">ระดับชั้น / สาขา</span>
              <span className="font-medium text-ink">
                {checkInResult?.student?.level} {checkInResult?.student?.year} • {checkInResult?.student?.major_name} ({checkInResult?.student?.room})
              </span>
            </div>
            <div className="flex justify-between items-center pt-0.5">
              <span className="text-muted">สถานะการบันทึก</span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                checkInResult?.status === 'present'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
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
              <div className="bg-canvas border border-hairline rounded-lg p-3 text-left space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink">สถิติการเข้าแถวรวม</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    studentSummary.summary.isPass
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    {studentSummary.summary.isPass ? 'ผ่านเกณฑ์ (≥80%)' : 'ยังไม่ผ่านเกณฑ์'}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div className="bg-surface-soft p-2 rounded border border-hairline">
                    <div className="text-[10px] text-muted">มา</div>
                    <div className="text-sm font-bold text-emerald-600">{studentSummary.summary.presentCount}</div>
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
                    <div className="text-sm font-bold text-rose-600">{studentSummary.summary.absentCount}</div>
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
              <div className="bg-canvas border border-hairline rounded-lg p-3 text-left space-y-2 animate-in fade-in duration-200">
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
                          <span className="text-emerald-600 font-medium">เข้าแล้ว</span>
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
              to="/"
              className="w-full py-2.5 bg-ink text-canvas hover:bg-black text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all"
            >
              <span>เสร็จสิ้น / กลับหน้าหลัก</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      ) : (
        /* Check-in Form View */
        <div className="max-w-md w-full mx-auto my-4 bg-canvas border border-hairline rounded-xl p-5 sm:p-7 shadow-[0_8px_32px_rgba(0,0,0,0.04)] space-y-5">
          {/* Header & Status Indicator */}
          <div className="space-y-2 text-center">
            <div className="w-12 h-12 bg-primary/10 text-primary border border-primary/20 rounded-full flex items-center justify-center mx-auto">
              <Clock size={24} />
            </div>
            <h1 className="text-lg font-bold text-ink tracking-tight">เช็กชื่อเข้าแถวหน้าเสาธง</h1>

            {/* Live Status Badge */}
            {statusLoading ? (
              <div className="text-xs text-muted">กำลังตรวจสอบสถานะรอบเข้าแถว...</div>
            ) : assemblyStatus ? (
              <div className="space-y-1">
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  !assemblyStatus.isOpen
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : assemblyStatus.currentStatus === 'late'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    !assemblyStatus.isOpen ? 'bg-rose-500' : assemblyStatus.currentStatus === 'late' ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'
                  }`}></span>
                  <span>{assemblyStatus.reason}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-soft">
                  <span>เวลาเข้าแถว: {assemblyStatus.startTime} - {assemblyStatus.closeTime} น. (สายหลัง {assemblyStatus.lateTime} น.)</span>
                  {assemblyStatus.requireDeviceFingerprint && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                      <Fingerprint size={11} /> ตรวจสอบเครื่อง
                    </span>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* Form Errors */}
          {submitError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-lg text-center flex items-center justify-center gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Student ID Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-ink uppercase tracking-wider">
                รหัสนักศึกษา (11 หลัก) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  maxLength={11}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={studentId}
                  onChange={e => setStudentId(e.target.value.replace(/\D/g, ''))}
                  placeholder="เช่น 66209010001"
                  className="w-full h-11 border border-hairline rounded-lg px-3.5 bg-canvas text-ink text-sm font-mono font-bold placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
                {searchingStudent && (
                  <div className="absolute right-3 top-3">
                    <RefreshCw size={16} className="text-muted animate-spin" />
                  </div>
                )}
              </div>

              {/* Student info preview if found */}
              {studentData && (
                <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs space-y-0.5 animate-in fade-in duration-150">
                  <div className="font-bold text-emerald-900">
                    {studentData.prefix}{studentData.first_name} {studentData.last_name}
                  </div>
                  <div className="text-emerald-700 text-[11px]">
                    {studentData.level} {studentData.year} • {studentData.major_name} (ห้อง {studentData.room})
                  </div>
                </div>
              )}

              {studentNotFound && (
                <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                  ⚠️ ไม่พบข้อมูลนักศึกษารหัสนี้ในระบบ กรุณาตรวจสอบอีกครั้ง
                </div>
              )}
            </div>

            {/* Photo Capture Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                  <Camera size={14} className="text-primary" />
                  <span>ภาพถ่ายหลักฐานในแถว</span>
                  {assemblyStatus?.requirePhoto && <span className="text-rose-500">*</span>}
                </label>
                {photoBase64 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoBase64(null);
                      startCamera();
                    }}
                    className="text-[11px] text-primary hover:underline cursor-pointer"
                  >
                    ถ่ายใหม่
                  </button>
                )}
              </div>

              {/* Camera Preview / Photo Box */}
              <div className="border border-hairline rounded-xl overflow-hidden bg-surface-soft relative flex flex-col items-center justify-center min-h-[220px]">
                {photoBase64 ? (
                  <div className="relative w-full h-full">
                    <img
                      src={photoBase64}
                      alt="หลักฐานการเข้าแถว"
                      className="w-full h-64 object-cover"
                    />
                    <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 size={12} className="text-emerald-400" />
                      <span>บันทึกภาพถ่ายแล้ว</span>
                    </div>
                  </div>
                ) : isCameraActive ? (
                  <div className="relative w-full h-64 bg-black flex flex-col items-center justify-center">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-4">
                      <button
                        type="button"
                        onClick={toggleFacingMode}
                        className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md flex items-center justify-center transition-all cursor-pointer"
                        title="สลับกล้องหน้า/หลัง"
                      >
                        <RefreshCw size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="w-13 h-13 rounded-full bg-white text-ink border-4 border-white/50 flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer"
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
                  <div className="p-6 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-canvas border border-hairline flex items-center justify-center mx-auto text-muted">
                      <Camera size={20} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-ink">ถ่ายภาพเซลฟี่หรือภาพยืนในแถว</p>
                      <p className="text-[10px] text-muted">จำเป็นต้องมีภาพขณะเข้าแถวเพื่อเป็นหลักฐานยืนยัน</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center pt-1">
                      <button
                        type="button"
                        onClick={() => startCamera('user')}
                        className="px-3.5 py-2 bg-primary hover:bg-primary-active text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-xs"
                      >
                        <Camera size={14} />
                        <span>เปิดกล้องถ่ายสด</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3.5 py-2 bg-canvas hover:bg-surface-soft border border-hairline text-ink text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                      >
                        <span>เลือกจากคลังภาพ</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Hidden File Input for fallback */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleFileChange}
                className="hidden"
              />

              {cameraError && (
                <div className="text-[11px] text-rose-600 bg-rose-50 p-2 rounded-md border border-rose-200">
                  {cameraError}
                </div>
              )}
            </div>

            {/* GPS Status Indicator */}
            {assemblyStatus?.requireGps && (
              <div className="p-3 bg-surface-soft border border-hairline rounded-lg text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-ink">
                    <MapPin size={14} className={coords ? 'text-emerald-600' : 'text-amber-500'} />
                    <span>ตำแหน่งที่ตั้ง (GPS)</span>
                  </div>
                  {gpsLoading ? (
                    <span className="text-[11px] text-muted flex items-center gap-1">
                      <RefreshCw size={11} className="animate-spin" />
                      <span>กำลังหาพิกัด...</span>
                    </span>
                  ) : coords ? (
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      <span>ระบุตำแหน่งแล้ว</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setGpsLoading(true);
                        navigator.geolocation.getCurrentPosition(
                          pos => {
                            setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
                            setGpsLoading(false);
                            setGpsError('');
                          },
                          () => {
                            setGpsError('ไม่สามารถอ่านพิกัดได้ กรุณาเปิด Location Service');
                            setGpsLoading(false);
                          },
                          { enableHighAccuracy: true }
                        );
                      }}
                      className="text-[11px] text-primary hover:underline font-bold cursor-pointer"
                    >
                      กดอนุญาตพิกัด
                    </button>
                  )}
                </div>

                {gpsError && (
                  <p className="text-[11px] text-rose-600">{gpsError}</p>
                )}

                {assemblyStatus.locations && assemblyStatus.locations.length > 0 && (
                  <div className="text-[10px] text-muted-soft">
                    จุดที่อนุญาต: {assemblyStatus.locations.map((l: any) => `${l.name} (${l.radius} ม.)`).join(' หรือ ')}
                  </div>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || (assemblyStatus && !assemblyStatus.isOpen)}
              className={`w-full h-11 text-white text-sm font-bold rounded-lg flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                assemblyStatus && !assemblyStatus.isOpen
                  ? 'bg-muted-soft cursor-not-allowed text-muted'
                  : 'bg-primary hover:bg-primary-active active:scale-98 shadow-md'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>กำลังบันทึกข้อมูล...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>ยืนยันการเช็กชื่อเข้าแถว</span>
                </>
              )}
            </button>
          </form>

          {/* Footer Info */}
          <div className="text-center text-[11px] text-muted-soft space-y-1 pt-1 border-t border-hairline">
            <div className="flex items-center justify-center gap-1">
              <ShieldCheck size={13} className="text-emerald-600" />
              <span>ระบบตรวจสอบอุปกรณ์เดี่ยว ป้องกันการสแกนแทนกัน</span>
            </div>
            <div>วิทยาลัยจัดการเช็กชื่อผ่านระบบ AAS Assembly System</div>
          </div>
        </div>
      )}
    </div>
  );
}
