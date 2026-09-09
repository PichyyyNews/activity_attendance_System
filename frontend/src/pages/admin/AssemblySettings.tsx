import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Clock,
  QrCode,
  MapPin,
  Calendar,
  Save,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  RefreshCw,
  LocateFixed,
  Map,
  Search,
  X,
  ShieldCheck,
  XCircle
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import ThaiDatePicker from '../../components/ThaiDatePicker';

// Fix Leaflet default marker icon issue in Vite/React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface ThaiTimePickerProps {
  label: string;
  sublabel: string;
  value: string;
  onChange: (val: string) => void;
  accentColor?: string;
  icon?: any;
}

function formatThaiDateDisplay(dateStr?: string) {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

function ThaiTimePicker({ label, sublabel, value, onChange, accentColor = 'text-ink', icon: Icon }: ThaiTimePickerProps) {
  const parts = (value || '07:30').split(':');
  const hour = parts[0] || '07';
  const minute = parts[1] || '30';

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
  const presets = ['07:30', '07:45', '08:00', '08:30'];

  return (
    <div className="bg-surface-soft/60 border border-hairline rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-3.5 shadow-2xs hover:border-hairline/80 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-hairline/60">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={16} className={accentColor} />}
          <label className="text-xs font-bold text-ink truncate">{label}</label>
        </div>
        <span className={`text-xs font-extrabold font-mono bg-canvas px-2.5 py-1 rounded-lg border border-hairline shadow-2xs shrink-0 ${accentColor}`}>
          {hour}:{minute} น.
        </span>
      </div>

      {/* Select boxes */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center bg-canvas border border-hairline rounded-xl px-3 py-1.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary shadow-2xs">
          <span className="text-[10px] font-bold text-muted uppercase mr-2 shrink-0">ชั่วโมง:</span>
          <select
            value={hour}
            onChange={e => onChange(`${e.target.value}:${minute}`)}
            className="bg-transparent border-none p-0 text-sm font-mono font-bold text-ink w-full focus:outline-none cursor-pointer text-center"
          >
            {hours.map(h => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>

        <span className="text-muted font-extrabold text-base">:</span>

        <div className="flex-1 flex items-center bg-canvas border border-hairline rounded-xl px-3 py-1.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary shadow-2xs">
          <span className="text-[10px] font-bold text-muted uppercase mr-2 shrink-0">นาที:</span>
          <select
            value={minute}
            onChange={e => onChange(`${hour}:${e.target.value}`)}
            className="bg-transparent border-none p-0 text-sm font-mono font-bold text-ink w-full focus:outline-none cursor-pointer text-center"
          >
            {minutes.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <span className="text-xs font-bold text-muted shrink-0">น.</span>
      </div>

      {/* Presets Grid */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold text-muted">เวลาด่วน:</div>
        <div className="grid grid-cols-4 gap-1.5">
          {presets.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={`text-xs py-1.5 rounded-lg border font-mono font-semibold transition-all cursor-pointer text-center whitespace-nowrap ${
                value === p
                  ? 'bg-primary text-white border-primary shadow-xs font-bold'
                  : 'bg-canvas border-hairline text-muted hover:text-ink hover:bg-surface-soft'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Sublabel */}
      <p className="text-[11px] text-muted-soft leading-relaxed pt-1.5 border-t border-hairline/60">
        {sublabel}
      </p>
    </div>
  );
}

export default function AssemblySettings() {
  const [settings, setSettings] = useState<any>({
    is_enabled: 1,
    qr_mode: 'static',
    static_token: '',
    start_time: '07:30',
    late_time: '08:00',
    close_time: '08:30',
    active_days: '1,2,3,4,5',
    require_photo: 1,
    require_gps: 1,
    require_device_fingerprint: 0,
    start_date: '2026-05-18',
    end_date_type: 'manual',
    end_date: '',
    location1_name: 'ลานหน้าเสาธง',
    location1_lat: '',
    location1_lng: '',
    location1_radius: 150,
    location2_enabled: 0,
    location2_name: 'โดมอเนกประสงค์',
    location2_lat: '',
    location2_lng: '',
    location2_radius: 150,
    academic_year: '2569',
    term: '1'
  });

  const [holidays, setHolidays] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  // New holiday form
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayTitle, setNewHolidayTitle] = useState('');
  const [addingHoliday, setAddingHoliday] = useState(false);

  // GPS locating states
  const [locating1, setLocating1] = useState(false);
  const [locating2, setLocating2] = useState(false);

  // Leaflet Map Modal States
  const [showMapModal, setShowMapModal] = useState<1 | 2 | null>(null);
  const [modalLat, setModalLat] = useState<number>(13.7563);
  const [modalLng, setModalLng] = useState<number>(100.5018);
  const [modalRadius, setModalRadius] = useState<number>(150);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingAddress, setSearchingAddress] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const fetchSettingsAndHolidays = async () => {
    try {
      const [setRes, holRes] = await Promise.all([
        axios.get('/api/assembly/settings'),
        axios.get('/api/assembly/holidays')
      ]);
      setSettings(setRes.data);
      setHolidays(holRes.data || []);
      setError('');
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError('ไม่สามารถโหลดข้อมูลการตั้งค่าได้');
    }
  };

  useEffect(() => {
    fetchSettingsAndHolidays();
  }, []);

  const handleDayToggle = (dayNum: number) => {
    const days = (settings.active_days || '').split(',').map((d: string) => d.trim()).filter(Boolean);
    const dayStr = dayNum.toString();
    let newDays: string[];
    if (days.includes(dayStr)) {
      newDays = days.filter((d: string) => d !== dayStr);
    } else {
      newDays = [...days, dayStr].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    }
    setSettings({ ...settings, active_days: newDays.join(',') });
  };

  const handleGetCurrentLocation = (pointNumber: 1 | 2) => {
    if (!navigator.geolocation) {
      alert('เบราว์เซอร์นี้ไม่รองรับการดึงพิกัด Geolocation');
      return;
    }
    if (pointNumber === 1) setLocating1(true);
    else setLocating2(true);

    navigator.geolocation.getCurrentPosition(
      pos => {
        if (pointNumber === 1) {
          setSettings((prev: any) => ({
            ...prev,
            location1_lat: pos.coords.latitude.toFixed(6),
            location1_lng: pos.coords.longitude.toFixed(6)
          }));
          setLocating1(false);
        } else {
          setSettings((prev: any) => ({
            ...prev,
            location2_lat: pos.coords.latitude.toFixed(6),
            location2_lng: pos.coords.longitude.toFixed(6)
          }));
          setLocating2(false);
        }
      },
      err => {
        alert(`ไม่สามารถดึงพิกัดได้: ${err.message}`);
        if (pointNumber === 1) setLocating1(false);
        else setLocating2(false);
      },
      { enableHighAccuracy: true }
    );
  };

  // Open Leaflet map picker modal for Point 1 or Point 2
  const openMapPicker = (pointNumber: 1 | 2) => {
    const currentLat = pointNumber === 1 ? settings.location1_lat : settings.location2_lat;
    const currentLng = pointNumber === 1 ? settings.location1_lng : settings.location2_lng;
    const currentRad = pointNumber === 1 ? (settings.location1_radius || 150) : (settings.location2_radius || 150);

    const initLat = currentLat ? parseFloat(currentLat) : 13.7563;
    const initLng = currentLng ? parseFloat(currentLng) : 100.5018;

    setModalLat(initLat);
    setModalLng(initLng);
    setModalRadius(currentRad);
    setSearchQuery('');
    setShowMapModal(pointNumber);
  };

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!showMapModal || !mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current).setView([modalLat, modalLng], 17);
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const circle = L.circle([modalLat, modalLng], {
      radius: modalRadius,
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.15,
      weight: 2
    }).addTo(map);
    circleRef.current = circle;

    const marker = L.marker([modalLat, modalLng], {
      draggable: true
    }).addTo(map);
    markerRef.current = marker;

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      setModalLat(pos.lat);
      setModalLng(pos.lng);
      if (circleRef.current) circleRef.current.setLatLng(pos);
    });

    map.on('click', (e) => {
      setModalLat(e.latlng.lat);
      setModalLng(e.latlng.lng);
      if (markerRef.current) markerRef.current.setLatLng(e.latlng);
      if (circleRef.current) circleRef.current.setLatLng(e.latlng);
    });

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, [showMapModal]);

  // Update circle radius dynamically
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(modalRadius);
    }
  }, [modalRadius]);

  const handleSearchAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchingAddress(true);
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`
      );
      if (response.data && response.data.length > 0) {
        const first = response.data[0];
        const lat = parseFloat(first.lat);
        const lon = parseFloat(first.lon);

        setModalLat(lat);
        setModalLng(lon);

        if (mapRef.current && markerRef.current && circleRef.current) {
          mapRef.current.setView([lat, lon], 17);
          markerRef.current.setLatLng([lat, lon]);
          circleRef.current.setLatLng([lat, lon]);
        }
      } else {
        alert('ไม่พบสถานที่ตามที่ค้นหา กรุณาลองค้นหาด้วยคำที่กว้างขึ้นหรือลากหมุดบนแผนที่');
      }
    } catch (err) {
      console.error('Search address error:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อค้นหาสถานที่');
    } finally {
      setSearchingAddress(false);
    }
  };

  const handleModalGetCurrentGPS = () => {
    if (!navigator.geolocation) {
      alert('เบราว์เซอร์นี้ไม่รองรับ Geolocation');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setModalLat(lat);
        setModalLng(lon);
        if (mapRef.current && markerRef.current && circleRef.current) {
          mapRef.current.setView([lat, lon], 18);
          markerRef.current.setLatLng([lat, lon]);
          circleRef.current.setLatLng([lat, lon]);
        }
      },
      err => alert(`ดึงพิกัดไม่สำเร็จ: ${err.message}`),
      { enableHighAccuracy: true }
    );
  };

  const handleSaveMapCoordinates = () => {
    if (showMapModal === 1) {
      setSettings((prev: any) => ({
        ...prev,
        location1_lat: modalLat.toFixed(6),
        location1_lng: modalLng.toFixed(6),
        location1_radius: modalRadius
      }));
    } else if (showMapModal === 2) {
      setSettings((prev: any) => ({
        ...prev,
        location2_lat: modalLat.toFixed(6),
        location2_lng: modalLng.toFixed(6),
        location2_radius: modalRadius
      }));
    }
    setShowMapModal(null);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setSaveSuccess(false);
      setError('');
      await axios.post('/api/assembly/settings', settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await fetchSettingsAndHolidays();
    } catch (err: any) {
      console.error('Error saving settings:', err);
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
    } finally {
      setSaving(false);
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayDate || !newHolidayTitle.trim()) return;
    try {
      setAddingHoliday(true);
      await axios.post('/api/assembly/holidays', {
        date: newHolidayDate,
        title: newHolidayTitle.trim()
      });
      setNewHolidayDate('');
      setNewHolidayTitle('');
      await fetchSettingsAndHolidays();
    } catch (err: any) {
      console.error('Error adding holiday:', err);
      alert(err.response?.data?.error || 'เกิดข้อผิดพลาดในการเพิ่มวันหยุด');
    } finally {
      setAddingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (id: number) => {
    if (!confirm('ต้องการลบวันหยุดนี้ใช่หรือไม่?')) return;
    try {
      await axios.delete(`/api/assembly/holidays/${id}`);
      await fetchSettingsAndHolidays();
    } catch (err) {
      console.error('Error deleting holiday:', err);
      alert('ไม่สามารถลบวันหยุดได้');
    }
  };

  const handleRegenerateToken = async () => {
    if (!confirm('การเปลี่ยนรหัส Token จะทำให้ QR Code เดิมใช้ไม่ได้ทันที คุณแน่ใจหรือไม่?')) return;
    try {
      const res = await axios.post('/api/assembly/settings', {
        ...settings,
        regenerate_static_token: true
      });
      if (res.data.static_token) {
        setSettings({ ...settings, static_token: res.data.static_token });
      }
      alert('สร้างรหัส Static Token ใหม่เรียบร้อยแล้ว');
    } catch (err) {
      console.error('Failed to regenerate token:', err);
      alert('ไม่สามารถสร้างรหัสใหม่ได้');
    }
  };

  const daysOfWeek = [
    { num: 1, label: 'จันทร์' },
    { num: 2, label: 'อังคาร' },
    { num: 3, label: 'พุธ' },
    { num: 4, label: 'พฤหัสบดี' },
    { num: 5, label: 'ศุกร์' },
    { num: 6, label: 'เสาร์' },
    { num: 0, label: 'อาทิตย์' }
  ];

  const activeDaysList = (settings.active_days || '').split(',').map((d: string) => d.trim());

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-4">
        <div>
          <h1 className="text-xl font-bold text-ink">ตั้งค่าระบบเช็กชื่อเข้าแถวหน้าเสาธง</h1>
          <p className="text-xs text-muted">
            ปีการศึกษา {settings.academic_year || '2569'} / เทอม {settings.term || '1'} • กำหนดช่วงเวลาเข้าแถวแบบ 24 ชม., แผนที่ Geofencing, และความปลอดภัย
          </p>
        </div>
        {saveSuccess && (
          <div className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 size={15} />
            <span>บันทึกการตั้งค่าเรียบร้อยแล้ว</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Section 1: กำหนดช่วงวันที่เปิดภาคเรียน (วันเริ่ม - วันปิดเทอม) */}
        <div className="bg-canvas border border-hairline rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2 text-sm font-bold text-ink border-b border-hairline pb-3">
            <Calendar size={18} className="text-primary" />
            <span>กำหนดช่วงวันที่เปิดภาคเรียนและนับการเข้าแถว (วันเริ่ม - วันปิดเทอม)</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* วันเริ่มต้นภาคเรียน (จำเป็น) */}
            <div className="bg-surface-soft/60 border border-hairline rounded-2xl p-5 space-y-3.5 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                    <span>วันเริ่มต้นนับการเข้าแถว (วันเปิดภาคเรียน)</span>
                    <span className="text-rose-500 font-bold">*จำเป็น</span>
                  </label>
                  {settings.start_date && (
                    <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20 shrink-0 font-mono">
                      {formatThaiDateDisplay(settings.start_date)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted leading-relaxed">
                  ระบบจะเริ่มเปิดรอบเช็กชื่อและเริ่มนับสถิติการเข้าแถวของนักศึกษาตั้งแต่วันที่ระบุนี้เป็นต้นไป (วันก่อนหน้านี้จะไม่ถูกนับเป็นวันขาด)
                </p>
              </div>

              <div className="space-y-1.5">
                <ThaiDatePicker
                  required
                  value={settings.start_date || ''}
                  onChange={val => setSettings({ ...settings, start_date: val })}
                  size="lg"
                  placeholder="เลือกวันเริ่มต้นภาคเรียน (พ.ศ.)"
                />
                <span className="text-[10px] text-muted-soft block">
                  ตัวอย่าง: 18 พฤษภาคม 2569 (สำหรับเทอม 1) หรือตามกำหนดการเปิดภาคเรียนของวิทยาลัย
                </span>
              </div>
            </div>

            {/* การสิ้นสุดภาคเรียน (วันปิดเทอม) */}
            <div className="bg-surface-soft/60 border border-hairline rounded-2xl p-5 space-y-3.5 flex flex-col justify-between">
              <div className="space-y-1">
                <label className="text-xs font-bold text-ink block">
                  การสิ้นสุดภาคเรียน (วันปิดเทอม)
                </label>
                <p className="text-[11px] text-muted leading-relaxed">
                  เลือกวิธีกำหนดวันสิ้นสุดการนับสถิติเข้าแถวของภาคเรียนนี้
                </p>
              </div>

              <div className="space-y-2.5">
                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  settings.end_date_type === 'manual'
                    ? 'border-primary bg-canvas shadow-xs'
                    : 'border-hairline bg-canvas/60 hover:bg-canvas'
                }`}>
                  <input
                    type="radio"
                    name="end_date_type"
                    value="manual"
                    checked={settings.end_date_type === 'manual'}
                    onChange={() => setSettings({ ...settings, end_date_type: 'manual' })}
                    className="mt-0.5 text-primary"
                  />
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-ink block">จนกว่าจะสั่งปิดภาคเรียนเอง (ปิดเทอมตามประกาศ) - แนะนำ</span>
                    <span className="text-[11px] text-muted block leading-relaxed">
                      ระบบจะนับวันเข้าแถวต่อเนื่องไปเรื่อยๆ ตามวันทำการ จนกว่าผู้ดูแลระบบจะปิดรอบหรือเปลี่ยนเทอม เหมาะสำหรับกรณีที่ยังไม่มีกำหนดการปิดเทอมแน่นอน
                    </span>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  settings.end_date_type === 'specific'
                    ? 'border-primary bg-canvas shadow-xs'
                    : 'border-hairline bg-canvas/60 hover:bg-canvas'
                }`}>
                  <input
                    type="radio"
                    name="end_date_type"
                    value="specific"
                    checked={settings.end_date_type === 'specific'}
                    onChange={() => setSettings({ ...settings, end_date_type: 'specific' })}
                    className="mt-0.5 text-primary"
                  />
                  <div className="space-y-2 w-full">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-ink block">กำหนดวันสิ้นสุดภาคเรียนแน่นอน</span>
                      <span className="text-[11px] text-muted block leading-relaxed">
                        ระบุวันปิดเทอมล่วงหน้า เมื่อพ้นวันที่นี้ระบบจะหยุดนับสถิติและปิดรับการเข้าแถวโดยอัตโนมัติ
                      </span>
                    </div>

                    {settings.end_date_type === 'specific' && (
                      <div className="space-y-1.5 pt-1.5 animate-in fade-in duration-150">
                        <span className="text-[11px] text-muted font-semibold block">เลือกวันที่ปิดภาคเรียน:</span>
                        <ThaiDatePicker
                          required
                          value={settings.end_date || ''}
                          minDate={settings.start_date || undefined}
                          onChange={val => setSettings({ ...settings, end_date: val })}
                          size="md"
                          placeholder="เลือกวันปิดภาคเรียน (พ.ศ.)"
                        />
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: เวลาเข้าแถว & วันทำการ (Thai 24-hr Time Picker) */}
        <div className="bg-canvas border border-hairline rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2 text-sm font-bold text-ink border-b border-hairline pb-3">
            <Clock size={18} className="text-primary" />
            <span>กำหนดช่วงเวลาเข้าแถวและวันทำการ (รูปแบบ 24 ชั่วโมง)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <ThaiTimePicker
              label="เวลาเริ่มเข้าแถว (เปิดรับ)"
              sublabel="ก่อนเวลานี้ระบบจะไม่เปิดให้สแกนเข้าแถว"
              value={settings.start_time || '07:30'}
              onChange={val => setSettings({ ...settings, start_time: val })}
              accentColor="text-emerald-600"
              icon={Clock}
            />

            <ThaiTimePicker
              label="เวลาเริ่มตัดสาย (สถานะมาสาย)"
              sublabel="นักศึกษาที่สแกนหลังเวลานี้จะถือว่า 'มาสาย'"
              value={settings.late_time || '08:00'}
              onChange={val => setSettings({ ...settings, late_time: val })}
              accentColor="text-amber-600"
              icon={AlertTriangle}
            />

            <ThaiTimePicker
              label="เวลาปิดรับ (สิ้นสุดการเข้าแถว)"
              sublabel="พ้นเวลานี้ระบบจะปิดรับสแกนอัตโนมัติ"
              value={settings.close_time || '08:30'}
              onChange={val => setSettings({ ...settings, close_time: val })}
              accentColor="text-rose-600"
              icon={XCircle}
            />
          </div>

          {/* Active Days Checkboxes */}
          <div className="space-y-2 pt-3 border-t border-hairline">
            <label className="text-xs font-bold text-ink block">วันที่มีการเข้าแถวประจำสัปดาห์</label>
            <div className="flex flex-wrap gap-2">
              {daysOfWeek.map(d => {
                const isActive = activeDaysList.includes(d.num.toString());
                return (
                  <button
                    key={d.num}
                    type="button"
                    onClick={() => handleDayToggle(d.num)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-primary text-white border-primary shadow-xs'
                        : 'bg-surface-soft border-hairline text-muted hover:text-ink'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <span className="text-[11px] text-muted block">
              วันที่ไม่ได้เลือกจะถือเป็นวันยกเว้น ระบบจะไม่เปิดรอบและไม่นับเป็นวันขาด
            </span>
          </div>
        </div>

        {/* Section 2: รูปแบบ QR Code */}
        <div className="bg-canvas border border-hairline rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2 text-sm font-bold text-ink border-b border-hairline pb-3">
            <QrCode size={18} className="text-primary" />
            <span>รูปแบบ QR Code สำหรับการเข้าแถว</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-3">
              <label className="text-xs font-bold text-ink block">เลือกโหมดการแสดง QR Code</label>
              
              <div className="space-y-2">
                <label className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  settings.qr_mode === 'static'
                    ? 'border-primary bg-primary/5'
                    : 'border-hairline bg-surface-soft hover:bg-surface-soft/80'
                }`}>
                  <input
                    type="radio"
                    name="qr_mode"
                    value="static"
                    checked={settings.qr_mode === 'static'}
                    onChange={() => setSettings({ ...settings, qr_mode: 'static' })}
                    className="mt-0.5 text-primary"
                  />
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-ink block">📌 ป้ายถาวร (Static QR Code) - แนะนำ</span>
                    <span className="text-[11px] text-muted block leading-relaxed">
                      สามารถพิมพ์เป็นแผ่นป้ายไวนิล/กระดาษไปติดไว้ที่เสาธงหรือลานเข้าแถวได้ถาวร ระบบจะเปิดและปิดรับอัตโนมัติตามช่วงเวลาที่กำหนดในแต่ละวัน
                    </span>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  settings.qr_mode === 'dynamic'
                    ? 'border-primary bg-primary/5'
                    : 'border-hairline bg-surface-soft hover:bg-surface-soft/80'
                }`}>
                  <input
                    type="radio"
                    name="qr_mode"
                    value="dynamic"
                    checked={settings.qr_mode === 'dynamic'}
                    onChange={() => setSettings({ ...settings, qr_mode: 'dynamic' })}
                    className="mt-0.5 text-primary"
                  />
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-ink block">⚡ หมุนเวียนรายวัน (Daily Dynamic QR)</span>
                    <span className="text-[11px] text-muted block leading-relaxed">
                      เปลี่ยนรหัส Token ใหม่ทุกวัน เหมาะสำหรับการเปิดฉายบนจอโปรเจกเตอร์หรือแท็บเล็ตหน้าแถว เพื่อป้องกันนักศึกษาถ่ายรูป QR ไปสแกนจากที่อื่น
                    </span>
                  </div>
                </label>
              </div>

              {settings.qr_mode === 'static' && (
                <div className="pt-2 flex items-center justify-between bg-surface-soft p-3 rounded-lg border border-hairline">
                  <div className="text-xs">
                    <span className="text-muted block text-[10px]">Static Token ปัจจุบัน:</span>
                    <span className="font-mono font-bold text-ink">{settings.static_token || '-'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRegenerateToken}
                    className="px-2.5 py-1 text-xs border border-hairline rounded bg-canvas text-muted hover:text-ink font-bold transition-colors cursor-pointer"
                  >
                    สุ่มรหัสใหม่
                  </button>
                </div>
              )}
            </div>

            {/* QR Preview Box */}
            <div className="flex flex-col items-center justify-center p-5 bg-surface-soft rounded-xl border border-hairline space-y-3">
              <span className="text-xs font-bold text-muted">ตัวอย่าง QR Code สำหรับนักศึกษา</span>
              <div className="p-3 bg-white border border-hairline rounded-xl shadow-xs">
                <QRCodeSVG
                  value={`${window.location.origin}/assembly/scan/${settings.qr_mode === 'static' ? settings.static_token : settings.today_daily_token || ''}`}
                  size={140}
                  level="M"
                />
              </div>
              <span className="text-[11px] text-muted text-center font-mono">
                {window.location.origin}/assembly/scan/{settings.qr_mode === 'static' ? settings.static_token : (settings.today_daily_token || '...')}
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: สถานที่เข้าแถวและ Geofencing (2 จุด) */}
        <div className="bg-canvas border border-hairline rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-hairline pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-ink">
              <MapPin size={18} className="text-primary" />
              <span>สถานที่เข้าแถวและพิกัด Geofencing (รองรับ 2 จุด)</span>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={settings.require_gps === 1}
                onChange={e => setSettings({ ...settings, require_gps: e.target.checked ? 1 : 0 })}
                className="rounded text-primary focus:ring-primary"
              />
              <span>เปิดการบังคับตรวจสอบพิกัด GPS</span>
            </label>
          </div>

          {/* Location Point 1 */}
          <div className="bg-surface-soft p-4 rounded-xl border border-hairline space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold">1</span>
                <span>จุดเข้าแถวที่ 1 (หลัก)</span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => openMapPicker(1)}
                  className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  <Map size={13} />
                  <span>ปักหมุดบนแผนที่</span>
                </button>
                <button
                  type="button"
                  disabled={locating1}
                  onClick={() => handleGetCurrentLocation(1)}
                  className="text-[11px] text-primary hover:underline font-bold flex items-center gap-1 cursor-pointer"
                >
                  <LocateFixed size={13} className={locating1 ? 'animate-spin' : ''} />
                  <span>{locating1 ? 'กำลังดึงพิกัด...' : 'ดึงพิกัดปัจจุบัน'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-1 space-y-1">
                <label className="text-[11px] font-bold text-muted">ชื่อสถานที่</label>
                <input
                  type="text"
                  value={settings.location1_name || ''}
                  onChange={e => setSettings({ ...settings, location1_name: e.target.value })}
                  placeholder="เช่น ลานหน้าเสาธง"
                  className="w-full h-9 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted">ละติจูด (Latitude)</label>
                <input
                  type="text"
                  value={settings.location1_lat || ''}
                  onChange={e => setSettings({ ...settings, location1_lat: e.target.value })}
                  placeholder="เช่น 13.756300"
                  className="w-full h-9 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted">ลองจิจูด (Longitude)</label>
                <input
                  type="text"
                  value={settings.location1_lng || ''}
                  onChange={e => setSettings({ ...settings, location1_lng: e.target.value })}
                  placeholder="เช่น 100.501800"
                  className="w-full h-9 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted">รัศมีที่อนุญาต (เมตร)</label>
                <input
                  type="number"
                  min={20}
                  max={2000}
                  value={settings.location1_radius || 150}
                  onChange={e => setSettings({ ...settings, location1_radius: parseInt(e.target.value, 10) || 150 })}
                  className="w-full h-9 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Location Point 2 (Optional) */}
          <div className="bg-surface-soft p-4 rounded-xl border border-hairline space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.location2_enabled === 1}
                  onChange={e => setSettings({ ...settings, location2_enabled: e.target.checked ? 1 : 0 })}
                  className="rounded text-primary focus:ring-primary"
                />
                <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-muted-soft text-muted text-[10px] flex items-center justify-center font-bold">2</span>
                  <span>จุดเข้าแถวที่ 2 (ตัวเลือกเสริม เช่น โดมอเนกประสงค์/โรงยิม)</span>
                </span>
              </label>

              {settings.location2_enabled === 1 && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openMapPicker(2)}
                    className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-blue-100 transition-colors cursor-pointer"
                  >
                    <Map size={13} />
                    <span>ปักหมุดบนแผนที่</span>
                  </button>
                  <button
                    type="button"
                    disabled={locating2}
                    onClick={() => handleGetCurrentLocation(2)}
                    className="text-[11px] text-primary hover:underline font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <LocateFixed size={13} className={locating2 ? 'animate-spin' : ''} />
                    <span>{locating2 ? 'กำลังดึงพิกัด...' : 'ดึงพิกัดปัจจุบัน'}</span>
                  </button>
                </div>
              )}
            </div>

            {settings.location2_enabled === 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1 animate-in fade-in">
                <div className="sm:col-span-1 space-y-1">
                  <label className="text-[11px] font-bold text-muted">ชื่อสถานที่</label>
                  <input
                    type="text"
                    value={settings.location2_name || ''}
                    onChange={e => setSettings({ ...settings, location2_name: e.target.value })}
                    placeholder="เช่น โดมอเนกประสงค์"
                    className="w-full h-9 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted">ละติจูด (Latitude)</label>
                  <input
                    type="text"
                    value={settings.location2_lat || ''}
                    onChange={e => setSettings({ ...settings, location2_lat: e.target.value })}
                    placeholder="เช่น 13.756500"
                    className="w-full h-9 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted">ลองจิจูด (Longitude)</label>
                  <input
                    type="text"
                    value={settings.location2_lng || ''}
                    onChange={e => setSettings({ ...settings, location2_lng: e.target.value })}
                    placeholder="เช่น 100.502000"
                    className="w-full h-9 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted">รัศมีที่อนุญาต (เมตร)</label>
                  <input
                    type="number"
                    min={20}
                    max={2000}
                    value={settings.location2_radius || 150}
                    onChange={e => setSettings({ ...settings, location2_radius: parseInt(e.target.value, 10) || 150 })}
                    className="w-full h-9 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section: รูปถ่าย และ ความปลอดภัย Device Fingerprint */}
          <div className="pt-3 border-t border-hairline space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.require_photo === 1}
                  onChange={e => setSettings({ ...settings, require_photo: e.target.checked ? 1 : 0 })}
                  className="rounded text-primary focus:ring-primary"
                />
                <span>บังคับแนบภาพถ่ายหลักฐานขณะอยู่ในแถว</span>
              </label>
              <span className="text-[11px] text-muted">รูปถ่ายจะถูกย่อขนาดเหลือ ~80KB อัตโนมัติ</span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs font-bold text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.require_device_fingerprint === 1}
                  onChange={e => setSettings({ ...settings, require_device_fingerprint: e.target.checked ? 1 : 0 })}
                  className="rounded text-primary focus:ring-primary"
                />
                <span className="flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-primary" />
                  <span>บังคับตรวจสอบลายนิ้วมืออุปกรณ์ (Device Fingerprint) ป้องกันเครื่องซ้ำ</span>
                </span>
              </label>
              <span className="text-[11px] text-muted">ไม่อนุญาตให้อุปกรณ์เครื่องเดียวกันสแกนแทนกันในวันเดียวกัน</span>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="h-11 px-6 bg-primary hover:bg-primary-active text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer"
          >
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            <span>บันทึกการตั้งค่าระบบเข้าแถว</span>
          </button>
        </div>
      </form>

      {/* Section 4: จัดการวันหยุดสถานศึกษา (Assembly Holidays) */}
      <div className="bg-canvas border border-hairline rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <Calendar size={18} className="text-primary" />
            <span>วันหยุดสถานศึกษา / วันหยุดนักขัตฤกษ์ (ไม่เปิดให้เข้าแถว)</span>
          </div>
          <span className="text-xs text-muted font-bold">จำนวน {holidays.length} วัน</span>
        </div>

        {/* Add Holiday Form */}
        <form onSubmit={handleAddHoliday} className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-surface-soft p-3.5 rounded-xl border border-hairline">
          <div>
            <label className="text-[11px] font-bold text-muted block mb-1">เลือกวันที่</label>
            <ThaiDatePicker
              required
              value={newHolidayDate}
              onChange={val => setNewHolidayDate(val)}
              size="sm"
              clearable
              placeholder="เลือกวันที่หยุด (พ.ศ.)"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-muted block mb-1">ชื่อวันหยุด / เหตุผล</label>
            <input
              type="text"
              required
              placeholder="เช่น วันปิยมหาราช, กีฬาสีภายใน"
              value={newHolidayTitle}
              onChange={e => setNewHolidayTitle(e.target.value)}
              className="w-full h-9 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={addingHoliday}
              className="w-full h-9 bg-ink hover:bg-black text-canvas rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>{addingHoliday ? 'กำลังเพิ่ม...' : 'เพิ่มวันหยุด'}</span>
            </button>
          </div>
        </form>

        {/* Holidays Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-soft border-b border-hairline text-muted font-bold">
              <tr>
                <th className="py-2.5 px-4 w-36">วันที่ (พ.ศ.)</th>
                <th className="py-2.5 px-4">ชื่อวันหยุด / กิจกรรมพิเศษ</th>
                <th className="py-2.5 px-4 w-20 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {holidays.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-muted">
                    ยังไม่มีการกำหนดวันหยุดพิเศษในเทอมนี้ (ระบบจะหยุดเฉพาะเสาร์-อาทิตย์ตามที่เลือกไว้)
                  </td>
                </tr>
              ) : (
                holidays.map(h => (
                  <tr key={h.id} className="hover:bg-surface-soft/40 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-bold text-ink">
                      {new Date(h.date).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-ink">{h.title}</td>
                    <td className="py-2.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteHoliday(h.id)}
                        className="text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                        title="ลบวันหยุด"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leaflet Map Modal Picker */}
      {showMapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-canvas border border-hairline w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-hairline flex items-center justify-between bg-surface-soft">
              <div className="flex items-center gap-2">
                <MapPin size={18} className="text-primary" />
                <h3 className="font-bold text-sm text-ink">
                  ปักหมุดพิกัด Geofencing • {showMapModal === 1 ? (settings.location1_name || 'จุดที่ 1 หลัก') : (settings.location2_name || 'จุดที่ 2 เสริม')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMapModal(null)}
                className="w-8 h-8 rounded-full border border-hairline flex items-center justify-center hover:bg-surface-soft text-muted hover:text-ink cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Address Search Bar */}
            <div className="p-3 border-b border-hairline bg-canvas flex gap-2">
              <form onSubmit={handleSearchAddress} className="flex-1 flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="พิมพ์ชื่อสถานที่หรือวิทยาลัยเพื่อค้นหาตำแหน่ง..."
                    className="w-full h-9 pl-9 pr-3 text-xs border border-hairline rounded-lg bg-surface-soft focus:bg-canvas focus:outline-none focus:border-primary font-medium"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searchingAddress}
                  className="px-3 h-9 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary-active transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {searchingAddress ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
                  <span>ค้นหา</span>
                </button>
              </form>

              <button
                type="button"
                onClick={handleModalGetCurrentGPS}
                className="px-3 h-9 border border-hairline bg-surface-soft text-ink rounded-lg text-xs font-bold hover:bg-surface-strong transition-colors flex items-center gap-1 cursor-pointer"
                title="ย้ายหมุดมายังตำแหน่งปัจจุบันของคุณ"
              >
                <LocateFixed size={13} className="text-primary" />
                <span className="hidden sm:inline">ตำแหน่งฉัน</span>
              </button>
            </div>

            {/* Map Container */}
            <div className="relative flex-1 min-h-[350px]">
              <div ref={mapContainerRef} className="absolute inset-0 z-0" />
            </div>

            {/* Modal Controls & Coordinates */}
            <div className="p-4 border-t border-hairline bg-surface-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-[11px] text-muted flex items-center gap-3">
                  <span>Lat: <strong className="font-mono text-ink">{modalLat.toFixed(6)}</strong></span>
                  <span>Lng: <strong className="font-mono text-ink">{modalLng.toFixed(6)}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-muted">รัศมี:</span>
                  <input
                    type="range"
                    min={30}
                    max={1000}
                    step={10}
                    value={modalRadius}
                    onChange={e => setModalRadius(parseInt(e.target.value, 10))}
                    className="w-28 accent-primary cursor-pointer"
                  />
                  <span className="text-xs font-bold text-primary font-mono">{modalRadius} เมตร</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowMapModal(null)}
                  className="px-4 py-2 border border-hairline rounded-lg text-xs font-bold hover:bg-surface-soft transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleSaveMapCoordinates}
                  className="px-5 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary-active transition-colors shadow-xs cursor-pointer"
                >
                  บันทึกพิกัดนี้
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
