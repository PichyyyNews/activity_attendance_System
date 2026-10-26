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
  XCircle,
  Pin,
  Zap,
  ExternalLink,
  Power
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
  presets?: string[];
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

function ThaiTimePicker({
  label,
  sublabel,
  value,
  onChange,
  accentColor = 'text-ink',
  icon: Icon,
  presets = ['06:00', '06:30', '07:00', '07:30']
}: ThaiTimePickerProps) {
  const parts = (value || '07:30').split(':');
  const hour = parts[0] || '07';
  const minute = parts[1] || '30';

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  return (
    <div className="flex flex-col justify-between space-y-3 bg-surface-soft/40 p-3.5 rounded-xl border border-hairline h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-hairline/60">
        <div className="flex items-center gap-1.5 min-w-0">
          {Icon && <Icon size={15} className={accentColor} />}
          <label className="text-xs font-bold text-ink truncate">{label}</label>
        </div>
        <span className={`text-xs font-mono font-extrabold bg-canvas px-2.5 py-0.5 rounded-md border border-hairline shrink-0 shadow-2xs ${accentColor}`}>
          {hour}:{minute} น.
        </span>
      </div>

      {/* Select boxes */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center bg-canvas border border-hairline rounded-lg px-2.5 py-1.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary shadow-2xs">
          <span className="text-[10px] font-bold text-muted uppercase mr-1.5 shrink-0">ชั่วโมง:</span>
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

        <div className="flex-1 flex items-center bg-canvas border border-hairline rounded-lg px-2.5 py-1.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary shadow-2xs">
          <span className="text-[10px] font-bold text-muted uppercase mr-1.5 shrink-0">นาที:</span>
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
      <div className="space-y-1">
        <div className="text-[10px] font-bold text-muted">เวลาด่วน:</div>
        <div className="grid grid-cols-4 gap-1.5">
          {presets.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={`text-xs py-1 rounded-md border font-mono font-bold transition-all cursor-pointer text-center ${
                value === p
                  ? 'bg-ink text-canvas border-ink shadow-2xs'
                  : 'bg-canvas border-hairline text-muted hover:text-ink hover:bg-surface-soft'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Sublabel */}
      <p className="text-[11px] text-muted-soft leading-relaxed pt-2 border-t border-hairline/60">
        {sublabel}
      </p>
    </div>
  );
}

type TabType = 'schedule' | 'qrcode' | 'gps' | 'security';

export default function AssemblySettings() {
  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [settings, setSettings] = useState<any>({
    is_enabled: 1,
    qr_mode: 'static',
    static_token: '',
    start_time: '07:30',
    late_time: '08:00',
    close_time: '08:30',
    active_days: '1,2,3,4,5',
    active_days_voc: '1,3,5',
    active_days_dvoc: '2,4',
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
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);

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
      const data = setRes.data || {};
      setSettings({
        ...data,
        is_enabled: data.is_enabled === 1 || data.is_enabled === true ? 1 : 0,
        require_photo: data.require_photo === 1 || data.require_photo === true ? 1 : 0,
        require_gps: data.require_gps === 1 || data.require_gps === true ? 1 : 0,
        require_device_fingerprint: data.require_device_fingerprint === 1 || data.require_device_fingerprint === true ? 1 : 0,
        location2_enabled: data.location2_enabled === 1 || data.location2_enabled === true ? 1 : 0
      });
      setHolidays(holRes.data || []);
      setError('');
      setIsDirty(false);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError('ไม่สามารถโหลดข้อมูลการตั้งค่าได้');
    }
  };

  useEffect(() => {
    fetchSettingsAndHolidays();
  }, []);

  const updateField = (field: string, value: any) => {
    setSettings((prev: any) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleLevelDayToggle = (level: 'voc' | 'dvoc', dayNum: number) => {
    const field = level === 'voc' ? 'active_days_voc' : 'active_days_dvoc';
    const currentStr = settings[field] || (level === 'voc' ? '1,3,5' : '2,4');
    const days = currentStr.split(',').map((d: string) => d.trim()).filter(Boolean);
    const dayStr = dayNum.toString();
    let newDays: string[];
    if (days.includes(dayStr)) {
      newDays = days.filter((d: string) => d !== dayStr);
    } else {
      newDays = [...days, dayStr].sort((a: string, b: string) => parseInt(a, 10) - parseInt(b, 10));
    }
    updateField(field, newDays.join(','));
  };

  const applySchedulePreset = (preset: 'alternating' | 'everyday') => {
    if (preset === 'alternating') {
      updateField('active_days_voc', '1,3,5');
      updateField('active_days_dvoc', '2,4');
      updateField('active_days', '1,2,3,4,5');
    } else {
      updateField('active_days_voc', '1,2,3,4,5');
      updateField('active_days_dvoc', '1,2,3,4,5');
      updateField('active_days', '1,2,3,4,5');
    }
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
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        if (pointNumber === 1) {
          setSettings((prev: any) => ({
            ...prev,
            location1_lat: lat,
            location1_lng: lng
          }));
          setLocating1(false);
        } else {
          setSettings((prev: any) => ({
            ...prev,
            location2_lat: lat,
            location2_lng: lng
          }));
          setLocating2(false);
        }
        setIsDirty(true);
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

    const initLat = currentLat && !isNaN(parseFloat(currentLat)) ? parseFloat(currentLat) : 13.7563;
    const initLng = currentLng && !isNaN(parseFloat(currentLng)) ? parseFloat(currentLng) : 100.5018;

    setModalLat(initLat);
    setModalLng(initLng);
    setModalRadius(currentRad || 150);
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

  const handleSaveSettings = async (customPayload?: any) => {
    const payload = customPayload || settings;
    try {
      setSaving(true);
      setError('');
      setSaveSuccessMsg('');
      const res = await axios.post('/api/assembly/settings', payload);
      if (res.data?.settings) {
        const s = res.data.settings;
        setSettings({
          ...s,
          is_enabled: s.is_enabled === 1 || s.is_enabled === true ? 1 : 0,
          require_photo: s.require_photo === 1 || s.require_photo === true ? 1 : 0,
          require_gps: s.require_gps === 1 || s.require_gps === true ? 1 : 0,
          require_device_fingerprint: s.require_device_fingerprint === 1 || s.require_device_fingerprint === true ? 1 : 0,
          location2_enabled: s.location2_enabled === 1 || s.location2_enabled === true ? 1 : 0
        });
      }
      setIsDirty(false);
      const timeStr = new Date().toLocaleTimeString('th-TH');
      setSaveSuccessMsg(`บันทึกการตั้งค่าระบบเข้าแถวครบทุกจุดเรียบร้อยแล้ว (${timeStr})`);
      setTimeout(() => setSaveSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error('Error saving settings:', err);
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMapCoordinates = async () => {
    const updated = { ...settings };
    if (showMapModal === 1) {
      updated.location1_lat = modalLat.toFixed(6);
      updated.location1_lng = modalLng.toFixed(6);
      updated.location1_radius = modalRadius;
    } else if (showMapModal === 2) {
      updated.location2_lat = modalLat.toFixed(6);
      updated.location2_lng = modalLng.toFixed(6);
      updated.location2_radius = modalRadius;
    }
    setSettings(updated);
    setShowMapModal(null);
    // Directly save to backend so coordinates are never lost
    await handleSaveSettings(updated);
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
        setSettings((prev: any) => ({ ...prev, static_token: res.data.static_token }));
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

  const activeDaysVocList = (settings.active_days_voc || '1,3,5').split(',').map((d: string) => d.trim());
  const activeDaysDvocList = (settings.active_days_dvoc || '2,4').split(',').map((d: string) => d.trim());
  const qrScanUrl = `${window.location.origin}/assembly/scan/${settings.qr_mode === 'static' ? (settings.static_token || '') : (settings.today_daily_token || '')}`;

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-20 animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-canvas border border-hairline rounded-xl p-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-ink">ตั้งค่าระบบเช็กชื่อเข้าแถว</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono">
              ปี {settings.academic_year || '2569'} / เทอม {settings.term || '1'}
            </span>
            {isDirty && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</span>
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">
            จัดการช่วงเวลานับแถว, วันเปิด-ปิดภาคเรียน, QR Code, พิกัด Geofencing และเงื่อนไขความปลอดภัย
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Master System On/Off Toggle */}
          <button
            type="button"
            onClick={() => updateField('is_enabled', Boolean(settings.is_enabled) ? 0 : 1)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              Boolean(settings.is_enabled)
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
            title="คลิกเพื่อสลับเปิดหรือปิดรับการเช็กชื่อเข้าแถว"
          >
            <Power size={13} />
            <span>{Boolean(settings.is_enabled) ? 'ระบบเปิดใช้งาน' : 'ปิดระบบชั่วคราว'}</span>
          </button>

          {/* Primary Save Button */}
          <button
            type="button"
            onClick={() => handleSaveSettings()}
            disabled={saving}
            className="h-9 px-4 bg-primary hover:bg-primary-active text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            <span>{saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {saveSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-between gap-2 shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveSuccessMsg('')}
            className="text-emerald-600 hover:text-emerald-900 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center justify-between gap-2 shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError('')}
            className="text-rose-600 hover:text-rose-900 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-hairline pb-px overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('schedule')}
          className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition-all flex items-center gap-1.5 border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'schedule'
              ? 'border-primary text-primary bg-canvas shadow-2xs'
              : 'border-transparent text-muted hover:text-ink hover:bg-surface-soft/60'
          }`}
        >
          <Clock size={14} />
          <span>รอบเวลา & วันเข้าแถว</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('qrcode')}
          className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition-all flex items-center gap-1.5 border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'qrcode'
              ? 'border-primary text-primary bg-canvas shadow-2xs'
              : 'border-transparent text-muted hover:text-ink hover:bg-surface-soft/60'
          }`}
        >
          <QrCode size={14} />
          <span>รหัสและป้าย QR Code</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gps')}
          className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition-all flex items-center gap-1.5 border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'gps'
              ? 'border-primary text-primary bg-canvas shadow-2xs'
              : 'border-transparent text-muted hover:text-ink hover:bg-surface-soft/60'
          }`}
        >
          <MapPin size={14} />
          <span>พิกัดสถานที่ GPS ({Boolean(settings.require_gps) ? 'เปิดใช้' : 'ปิดอยู่'})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`px-3.5 py-2 text-xs font-bold rounded-t-lg transition-all flex items-center gap-1.5 border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'security'
              ? 'border-primary text-primary bg-canvas shadow-2xs'
              : 'border-transparent text-muted hover:text-ink hover:bg-surface-soft/60'
          }`}
        >
          <ShieldCheck size={14} />
          <span>ความปลอดภัย & วันหยุด ({holidays.length} วัน)</span>
        </button>
      </div>

      {/* Tab 1: รอบเวลา & วันเข้าแถว */}
      {activeTab === 'schedule' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Card: วันเริ่ม - วันปิดภาคเรียน */}
          <div className="bg-canvas border border-hairline rounded-xl p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-ink border-b border-hairline pb-2.5">
              <Calendar size={15} className="text-primary" />
              <span>ช่วงวันที่เปิดภาคเรียนและการนับรอบ (เริ่ม - สิ้นสุด)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* วันเริ่มต้นภาคเรียน */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-ink flex items-center gap-1">
                    <span>วันเริ่มต้นภาคเรียน (เริ่มนับแถว)</span>
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  {settings.start_date && (
                    <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 font-mono">
                      {formatThaiDateDisplay(settings.start_date)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted leading-relaxed">
                  ระบบจะเริ่มเปิดรอบเช็กชื่อและเริ่มนับสถิติตั้งแต่วันที่ระบุนี้เป็นต้นไป (วันก่อนหน้านี้จะไม่ถูกนับเป็นวันขาด)
                </p>
                <div className="pt-1">
                  <ThaiDatePicker
                    required
                    value={settings.start_date || ''}
                    onChange={val => updateField('start_date', val)}
                    size="md"
                    placeholder="เลือกวันเริ่มต้นภาคเรียน (พ.ศ.)"
                  />
                </div>
              </div>

              {/* การสิ้นสุดภาคเรียน */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-ink block">การสิ้นสุดภาคเรียน (วันปิดเทอม)</label>
                <p className="text-[11px] text-muted leading-relaxed">
                  เลือกวิธีกำหนดวันสิ้นสุดการนับสถิติเข้าแถวของภาคเรียนนี้
                </p>

                <div className="space-y-2 pt-1">
                  <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer ${
                    settings.end_date_type === 'manual'
                      ? 'border-primary/50 bg-primary/[0.03] shadow-2xs'
                      : 'border-hairline hover:bg-surface-soft/50'
                  }`}>
                    <input
                      type="radio"
                      name="end_date_type"
                      value="manual"
                      checked={settings.end_date_type === 'manual'}
                      onChange={() => updateField('end_date_type', 'manual')}
                      className="mt-0.5 text-primary focus:ring-primary h-3.5 w-3.5 shrink-0"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-ink block">จนกว่าจะสั่งปิดภาคเรียนเอง (แนะนำ)</span>
                      <span className="text-[11px] text-muted block leading-relaxed">
                        ระบบนับวันเข้าแถวต่อเนื่องตามวันทำการ จนกว่าผู้ดูแลระบบจะปิดรอบหรือเปลี่ยนเทอม
                      </span>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-all cursor-pointer ${
                    settings.end_date_type === 'specific'
                      ? 'border-primary/50 bg-primary/[0.03] shadow-2xs'
                      : 'border-hairline hover:bg-surface-soft/50'
                  }`}>
                    <input
                      type="radio"
                      name="end_date_type"
                      value="specific"
                      checked={settings.end_date_type === 'specific'}
                      onChange={() => updateField('end_date_type', 'specific')}
                      className="mt-0.5 text-primary focus:ring-primary h-3.5 w-3.5 shrink-0"
                    />
                    <div className="space-y-1.5 w-full">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-ink block">กำหนดวันสิ้นสุดภาคเรียนแน่นอน</span>
                        <span className="text-[11px] text-muted block leading-relaxed">
                          เมื่อพ้นวันที่นี้ ระบบจะหยุดนับสถิติและปิดรับการเข้าแถวโดยอัตโนมัติ
                        </span>
                      </div>

                      {settings.end_date_type === 'specific' && (
                        <div className="pt-1">
                          <ThaiDatePicker
                            required
                            value={settings.end_date || ''}
                            minDate={settings.start_date || undefined}
                            onChange={val => updateField('end_date', val)}
                            size="sm"
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

          {/* Card: ช่วงเวลาเข้าแถว 24 ชั่วโมง */}
          <div className="bg-canvas border border-hairline rounded-xl p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-ink border-b border-hairline pb-2.5">
              <Clock size={15} className="text-primary" />
              <span>กำหนดเวลาเข้าแถว (รูปแบบ 24 ชั่วโมง)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ThaiTimePicker
                label="เวลาเริ่มเข้าแถว (เปิดรับ)"
                sublabel="ก่อนเวลานี้ระบบจะไม่เปิดให้นักศึกษาสแกนเข้าแถว"
                value={settings.start_time || '07:30'}
                onChange={val => updateField('start_time', val)}
                accentColor="text-emerald-600"
                icon={Clock}
                presets={['06:00', '06:30', '07:00', '07:30']}
              />

              <ThaiTimePicker
                label="เวลาตัดสาย (สถานะมาสาย)"
                sublabel="นักศึกษาที่สแกนหลังเวลานี้จะถูกบันทึกสถานะ 'มาสาย'"
                value={settings.late_time || '08:00'}
                onChange={val => updateField('late_time', val)}
                accentColor="text-amber-600"
                icon={AlertTriangle}
                presets={['07:15', '07:30', '07:45', '08:00']}
              />

              <ThaiTimePicker
                label="เวลาปิดรับ (สิ้นสุดรอบ)"
                sublabel="พ้นเวลานี้ระบบจะปิดรับสแกนทันทีและถือว่า 'ขาด'"
                value={settings.close_time || '08:30'}
                onChange={val => updateField('close_time', val)}
                accentColor="text-rose-600"
                icon={XCircle}
                presets={['07:45', '08:00', '08:15', '08:30']}
              />
            </div>

            {/* Alternating Level Schedule Section (ปวช: จ/พ/ศ, ปวส: อ/พฤ) */}
            <div className="pt-4 border-t border-hairline space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Calendar size={15} className="text-primary" />
                    <label className="text-xs font-bold text-ink block">
                      ตารางวันเข้าแถวสลับวันตามระดับชั้น (Alternating Schedule)
                    </label>
                  </div>
                  <span className="text-[11px] text-muted block">
                    กำหนดวันเข้าแถวแยกอิสระระหว่างระดับ ปวช. และ ปวส. โดยวันที่ไม่มีคิวเข้าแถวจะได้รับการยกเว้น (ไม่นับเป็นวันขาด)
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => applySchedulePreset('alternating')}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                    title="ปวช: จันทร์, พุธ, ศุกร์ / ปวส: อังคาร, พฤหัสบดี"
                  >
                    ใช้ตารางสลับวันมาตรฐาน (ปวช: จ/พ/ศ, ปวส: อ/พฤ)
                  </button>
                  <button
                    type="button"
                    onClick={() => applySchedulePreset('everyday')}
                    className="px-2 py-1 text-[11px] font-bold rounded-lg border border-hairline bg-canvas hover:bg-surface-soft text-muted hover:text-ink transition-colors cursor-pointer"
                    title="เข้าพร้อมกันทุกวัน จันทร์ - ศุกร์"
                  >
                    เข้าพร้อมกันทุกวัน (จ-ศ)
                  </button>
                </div>
              </div>

              {/* Row 1: ระดับ ปวช. */}
              <div className="p-3.5 rounded-xl border border-indigo-200/60 bg-indigo-50/30 dark:bg-indigo-950/20 dark:border-indigo-900/40 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-indigo-600 text-white shadow-2xs">
                      ระดับ ปวช.
                    </span>
                    <span className="text-xs font-bold text-ink">
                      ประกาศนียบัตรวิชาชีพ (ชั้นปี 1 - 3)
                    </span>
                  </div>
                  <span className="text-[11px] text-indigo-700 dark:text-indigo-300 font-semibold">
                    เข้าแถว {activeDaysVocList.filter((d: string) => ['1','2','3','4','5'].includes(d)).length} วัน/สัปดาห์
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {daysOfWeek.map(d => {
                    const isActive = activeDaysVocList.includes(d.num.toString());
                    return (
                      <button
                        key={`voc-${d.num}`}
                        type="button"
                        onClick={() => handleLevelDayToggle('voc', d.num)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          isActive
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                            : 'bg-canvas border-hairline text-muted hover:text-ink'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 2: ระดับ ปวส. */}
              <div className="p-3.5 rounded-xl border border-purple-200/60 bg-purple-50/30 dark:bg-purple-950/20 dark:border-purple-900/40 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-purple-600 text-white shadow-2xs">
                      ระดับ ปวส.
                    </span>
                    <span className="text-xs font-bold text-ink">
                      ประกาศนียบัตรวิชาชีพชั้นสูง (ชั้นปี 1 - 2)
                    </span>
                  </div>
                  <span className="text-[11px] text-purple-700 dark:text-purple-300 font-semibold">
                    เข้าแถว {activeDaysDvocList.filter((d: string) => ['1','2','3','4','5'].includes(d)).length} วัน/สัปดาห์
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {daysOfWeek.map(d => {
                    const isActive = activeDaysDvocList.includes(d.num.toString());
                    return (
                      <button
                        key={`dvoc-${d.num}`}
                        type="button"
                        onClick={() => handleLevelDayToggle('dvoc', d.num)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          isActive
                            ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                            : 'bg-canvas border-hairline text-muted hover:text-ink'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: รหัสและป้าย QR Code */}
      {activeTab === 'qrcode' && (
        <div className="bg-canvas border border-hairline rounded-xl p-4 sm:p-5 shadow-2xs space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center gap-2 text-xs font-bold text-ink border-b border-hairline pb-2.5">
            <QrCode size={15} className="text-primary" />
            <span>รูปแบบและตัวอย่าง QR Code สำหรับจุดเข้าแถว</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 divide-y md:divide-y-0 md:divide-x divide-hairline">
            {/* Left: Mode Selection */}
            <div className="space-y-3 md:pr-5">
              <label className="text-xs font-bold text-ink block">เลือกโหมดการแสดง QR Code</label>

              <div className="space-y-2.5">
                <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  settings.qr_mode === 'static'
                    ? 'border-primary/50 bg-primary/[0.03] shadow-2xs'
                    : 'border-hairline hover:bg-surface-soft/50'
                }`}>
                  <input
                    type="radio"
                    name="qr_mode"
                    value="static"
                    checked={settings.qr_mode === 'static'}
                    onChange={() => updateField('qr_mode', 'static')}
                    className="mt-0.5 text-primary focus:ring-primary h-3.5 w-3.5 shrink-0"
                  />
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                      <Pin size={13} className="text-primary" />
                      <span>ป้ายถาวร (Static QR Code) - แนะนำ</span>
                    </span>
                    <span className="text-[11px] text-muted block leading-relaxed">
                      พิมพ์เป็นป้ายไวนิล/กระดาษไปติดที่เสาธงหรือลานเข้าแถวได้ถาวร ระบบจะเปิด-ปิดรับอัตโนมัติตามช่วงเวลา
                    </span>
                  </div>
                </label>

                <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                  settings.qr_mode === 'dynamic'
                    ? 'border-primary/50 bg-primary/[0.03] shadow-2xs'
                    : 'border-hairline hover:bg-surface-soft/50'
                }`}>
                  <input
                    type="radio"
                    name="qr_mode"
                    value="dynamic"
                    checked={settings.qr_mode === 'dynamic'}
                    onChange={() => updateField('qr_mode', 'dynamic')}
                    className="mt-0.5 text-primary focus:ring-primary h-3.5 w-3.5 shrink-0"
                  />
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                      <Zap size={13} className="text-amber-500" />
                      <span>หมุนเวียนรายวัน (Daily Dynamic QR)</span>
                    </span>
                    <span className="text-[11px] text-muted block leading-relaxed">
                      เปลี่ยนรหัส Token ใหม่ทุกวัน เหมาะสำหรับการฉายบนจอโปรเจกเตอร์หรือแท็บเล็ตหน้าแถว
                    </span>
                  </div>
                </label>
              </div>

              {settings.qr_mode === 'static' && (
                <div className="pt-2 flex items-center justify-between bg-surface-soft/60 p-3 rounded-xl border border-hairline">
                  <div className="text-xs">
                    <span className="text-muted block text-[10px] font-bold">Static Token ปัจจุบัน:</span>
                    <span className="font-mono font-bold text-ink">{settings.static_token || '-'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRegenerateToken}
                    className="px-2.5 py-1 text-xs border border-hairline rounded-lg bg-canvas text-muted hover:text-ink font-bold transition-colors cursor-pointer shadow-2xs"
                  >
                    สุ่มรหัสใหม่
                  </button>
                </div>
              )}
            </div>

            {/* Right: Live Preview */}
            <div className="pt-5 md:pt-0 md:pl-5 flex flex-col items-center justify-center space-y-3">
              <span className="text-xs font-bold text-muted">ตัวอย่าง QR Code สำหรับนักศึกษาสแกน</span>
              <div className="p-4 bg-canvas border border-hairline rounded-2xl shadow-xs">
                <QRCodeSVG
                  value={qrScanUrl}
                  size={144}
                  level="M"
                />
              </div>

              <div className="text-center space-y-1 w-full max-w-sm">
                <a
                  href={qrScanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-primary hover:underline font-mono truncate block flex items-center justify-center gap-1"
                >
                  <span className="truncate">{qrScanUrl}</span>
                  <ExternalLink size={12} className="shrink-0" />
                </a>
                <span className="text-[10px] text-muted block">
                  สามารถแคปเจอร์หน้าจอนี้เพื่อนำไปพิมพ์ป้ายไวนิล หรือเปิดฉายบนจอทีวี/มอนิเตอร์
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: พิกัดสถานที่ GPS */}
      {activeTab === 'gps' && (
        <div className="bg-canvas border border-hairline rounded-xl p-4 sm:p-5 shadow-2xs space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-hairline pb-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <MapPin size={15} className="text-primary" />
              <span>สถานที่เข้าแถวและพิกัด Geofencing (รองรับ 2 จุด)</span>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(settings.require_gps)}
                onChange={e => updateField('require_gps', e.target.checked ? 1 : 0)}
                className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span>เปิดการบังคับตรวจสอบพิกัด GPS</span>
            </label>
          </div>

          {/* Point 1 (Main) */}
          <div className="bg-surface-soft/50 p-4 rounded-xl border border-hairline space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-primary text-white text-[9px] flex items-center justify-center font-bold">1</span>
                <span>จุดเข้าแถวที่ 1 (หลัก)</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openMapPicker(1)}
                  className="px-2.5 py-1 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-primary/20 transition-colors cursor-pointer"
                >
                  <Map size={13} />
                  <span>ปักหมุดบนแผนที่</span>
                </button>
                <button
                  type="button"
                  disabled={locating1}
                  onClick={() => handleGetCurrentLocation(1)}
                  className="text-xs text-muted hover:text-ink font-bold flex items-center gap-1 cursor-pointer px-2 py-1 border border-hairline bg-canvas rounded-lg shadow-2xs"
                >
                  <LocateFixed size={13} className={locating1 ? 'animate-spin' : ''} />
                  <span>{locating1 ? 'กำลังดึง...' : 'ดึงพิกัดฉัน'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-1 space-y-1">
                <label className="text-[11px] font-bold text-muted">ชื่อสถานที่</label>
                <input
                  type="text"
                  value={settings.location1_name || ''}
                  onChange={e => updateField('location1_name', e.target.value)}
                  placeholder="เช่น ลานหน้าเสาธง"
                  className="w-full h-8 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted">ละติจูด (Lat)</label>
                <input
                  type="text"
                  value={settings.location1_lat ?? ''}
                  onChange={e => updateField('location1_lat', e.target.value)}
                  placeholder="เช่น 13.756300"
                  className="w-full h-8 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted">ลองจิจูด (Lng)</label>
                <input
                  type="text"
                  value={settings.location1_lng ?? ''}
                  onChange={e => updateField('location1_lng', e.target.value)}
                  placeholder="เช่น 100.501800"
                  className="w-full h-8 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted">รัศมีที่อนุญาต (เมตร)</label>
                <input
                  type="number"
                  min={20}
                  max={2000}
                  value={settings.location1_radius ?? ''}
                  onChange={e => updateField('location1_radius', e.target.value === '' ? '' : Number(e.target.value))}
                  onBlur={() => {
                    if (!settings.location1_radius || Number(settings.location1_radius) < 20) {
                      updateField('location1_radius', 150);
                    }
                  }}
                  className="w-full h-8 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Point 2 (Secondary) */}
          <div className="bg-surface-soft/50 p-4 rounded-xl border border-hairline space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(settings.location2_enabled)}
                  onChange={e => updateField('location2_enabled', e.target.checked ? 1 : 0)}
                  className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
                />
                <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-muted-soft text-muted text-[9px] flex items-center justify-center font-bold">2</span>
                  <span>จุดเข้าแถวที่ 2 (ตัวเลือกเสริม เช่น โดมอเนกประสงค์/โรงยิม)</span>
                </span>
              </label>

              {Boolean(settings.location2_enabled) && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openMapPicker(2)}
                    className="px-2.5 py-1 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-primary/20 transition-colors cursor-pointer"
                  >
                    <Map size={13} />
                    <span>ปักหมุดบนแผนที่</span>
                  </button>
                  <button
                    type="button"
                    disabled={locating2}
                    onClick={() => handleGetCurrentLocation(2)}
                    className="text-xs text-muted hover:text-ink font-bold flex items-center gap-1 cursor-pointer px-2 py-1 border border-hairline bg-canvas rounded-lg shadow-2xs"
                  >
                    <LocateFixed size={13} className={locating2 ? 'animate-spin' : ''} />
                    <span>{locating2 ? 'กำลังดึง...' : 'ดึงพิกัดฉัน'}</span>
                  </button>
                </div>
              )}
            </div>

            {Boolean(settings.location2_enabled) && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1 animate-in fade-in">
                <div className="sm:col-span-1 space-y-1">
                  <label className="text-[11px] font-bold text-muted">ชื่อสถานที่</label>
                  <input
                    type="text"
                    value={settings.location2_name || ''}
                    onChange={e => updateField('location2_name', e.target.value)}
                    placeholder="เช่น โดมอเนกประสงค์"
                    className="w-full h-8 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted">ละติจูด (Lat)</label>
                  <input
                    type="text"
                    value={settings.location2_lat ?? ''}
                    onChange={e => updateField('location2_lat', e.target.value)}
                    placeholder="เช่น 13.756500"
                    className="w-full h-8 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted">ลองจิจูด (Lng)</label>
                  <input
                    type="text"
                    value={settings.location2_lng ?? ''}
                    onChange={e => updateField('location2_lng', e.target.value)}
                    placeholder="เช่น 100.502000"
                    className="w-full h-8 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-muted">รัศมีที่อนุญาต (เมตร)</label>
                  <input
                    type="number"
                    min={20}
                    max={2000}
                    value={settings.location2_radius ?? ''}
                    onChange={e => updateField('location2_radius', e.target.value === '' ? '' : Number(e.target.value))}
                    onBlur={() => {
                      if (!settings.location2_radius || Number(settings.location2_radius) < 20) {
                        updateField('location2_radius', 150);
                      }
                    }}
                    className="w-full h-8 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: ความปลอดภัย & วันหยุด */}
      {activeTab === 'security' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Security Rules */}
          <div className="bg-canvas border border-hairline rounded-xl p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-ink border-b border-hairline pb-2.5">
              <ShieldCheck size={15} className="text-primary" />
              <span>ความปลอดภัยและการตรวจสอบอัตลักษณ์</span>
            </div>

            <div className="space-y-2">
              <label className="flex items-center justify-between p-3 rounded-lg border border-hairline hover:bg-surface-soft/40 cursor-pointer transition-colors">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-ink block">บังคับถ่ายภาพตนเองขณะอยู่ในแถว (Live Photo Proof)</span>
                  <span className="text-[11px] text-muted block">
                    รูปถ่ายจะถูกบีบอัดขนาดเหลือ ~80KB เพื่อประหยัดพื้นที่เซิร์ฟเวอร์
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings.require_photo)}
                  onChange={e => updateField('require_photo', e.target.checked ? 1 : 0)}
                  className="rounded text-primary focus:ring-primary h-4 w-4 shrink-0"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg border border-hairline hover:bg-surface-soft/40 cursor-pointer transition-colors">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-ink block">บังคับตรวจสอบลายนิ้วมืออุปกรณ์ (Device Fingerprint) ป้องกันเครื่องซ้ำ</span>
                  <span className="text-[11px] text-muted block">
                    ไม่อนุญาตให้อุปกรณ์เครื่องเดียวกันสแกนแทนกันในวันเดียวกัน
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings.require_device_fingerprint)}
                  onChange={e => updateField('require_device_fingerprint', e.target.checked ? 1 : 0)}
                  className="rounded text-primary focus:ring-primary h-4 w-4 shrink-0"
                />
              </label>
            </div>
          </div>

          {/* Holidays */}
          <div className="bg-canvas border border-hairline rounded-xl p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-hairline pb-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <Calendar size={15} className="text-primary" />
                <span>วันหยุดสถานศึกษา / วันหยุดนักขัตฤกษ์ (ไม่เปิดให้เข้าแถว)</span>
              </div>
              <span className="text-[11px] text-muted font-bold">จำนวน {holidays.length} วัน</span>
            </div>

            {/* Add Holiday Form */}
            <form onSubmit={handleAddHoliday} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-surface-soft/50 p-3 rounded-xl border border-hairline">
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
                <label className="text-[11px] font-bold text-muted block mb-1">ชื่อวันหยุด / กิจกรรม</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น วันปิยมหาราช, กีฬาสีภายใน"
                  value={newHolidayTitle}
                  onChange={e => setNewHolidayTitle(e.target.value)}
                  className="w-full h-8 border border-hairline rounded-lg px-2.5 bg-canvas text-ink text-xs"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={addingHoliday}
                  className="w-full h-8 bg-ink hover:bg-black text-canvas rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus size={13} />
                  <span>{addingHoliday ? 'กำลังเพิ่ม...' : 'เพิ่มวันหยุด'}</span>
                </button>
              </div>
            </form>

            {/* Holidays Table */}
            <div className="overflow-x-auto border border-hairline rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-soft border-b border-hairline text-muted font-bold text-[11px]">
                  <tr>
                    <th className="py-2 px-3 w-36">วันที่ (พ.ศ.)</th>
                    <th className="py-2 px-3">ชื่อวันหยุด / กิจกรรมพิเศษ</th>
                    <th className="py-2 px-3 w-16 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {holidays.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-5 text-center text-muted text-xs">
                        ยังไม่มีการกำหนดวันหยุดพิเศษในเทอมนี้ (ระบบจะหยุดเฉพาะเสาร์-อาทิตย์ตามที่เลือกไว้)
                      </td>
                    </tr>
                  ) : (
                    holidays.map(h => (
                      <tr key={h.id} className="hover:bg-surface-soft/40 transition-colors">
                        <td className="py-2 px-3 font-mono font-bold text-ink">
                          {new Date(h.date).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                        </td>
                        <td className="py-2 px-3 font-semibold text-ink">{h.title}</td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteHoliday(h.id)}
                            className="text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                            title="ลบวันหยุด"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Save Action Bar */}
      <div className="flex items-center justify-between p-3.5 bg-canvas border border-hairline rounded-xl shadow-2xs">
        <div className="text-xs text-muted">
          {isDirty ? (
            <span className="text-amber-600 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>มีข้อมูลเปลี่ยนแปลงที่ยังไม่ได้บันทึก กดปุ่มเพื่อบันทึกลงระบบ</span>
            </span>
          ) : (
            <span className="text-muted flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-500" />
              <span>ข้อมูลการตั้งค่าทุกจุดตรงกับฐานข้อมูลล่าสุด</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => handleSaveSettings()}
          disabled={saving}
          className="h-9 px-5 bg-primary hover:bg-primary-active text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          <span>{saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าทั้งหมด'}</span>
        </button>
      </div>

      {/* Leaflet Map Modal Picker */}
      {showMapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-canvas border border-hairline w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-3.5 border-b border-hairline flex items-center justify-between bg-surface-soft">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-primary" />
                <h3 className="font-bold text-xs text-ink">
                  ปักหมุดพิกัด Geofencing • {showMapModal === 1 ? (settings.location1_name || 'จุดที่ 1 หลัก') : (settings.location2_name || 'จุดที่ 2 เสริม')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMapModal(null)}
                className="w-7 h-7 rounded-full border border-hairline flex items-center justify-center hover:bg-surface-soft text-muted hover:text-ink cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {/* Address Search Bar */}
            <div className="p-2.5 border-b border-hairline bg-canvas flex gap-2">
              <form onSubmit={handleSearchAddress} className="flex-1 flex gap-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="พิมพ์ชื่อสถานที่หรือวิทยาลัยเพื่อค้นหา..."
                    className="w-full h-8 pl-8 pr-3 text-xs border border-hairline rounded-lg bg-surface-soft focus:bg-canvas focus:outline-none focus:border-primary font-medium"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searchingAddress}
                  className="px-3 h-8 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary-active transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {searchingAddress ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
                  <span>ค้นหา</span>
                </button>
              </form>

              <button
                type="button"
                onClick={handleModalGetCurrentGPS}
                className="px-2.5 h-8 border border-hairline bg-surface-soft text-ink rounded-lg text-xs font-bold hover:bg-surface-strong transition-colors flex items-center gap-1 cursor-pointer"
                title="ย้ายหมุดมายังตำแหน่งปัจจุบันของคุณ"
              >
                <LocateFixed size={12} className="text-primary" />
                <span className="hidden sm:inline">ตำแหน่งฉัน</span>
              </button>
            </div>

            {/* Map Container */}
            <div className="relative flex-1 min-h-[340px]">
              <div ref={mapContainerRef} className="absolute inset-0 z-0" />
            </div>

            {/* Modal Controls & Coordinates */}
            <div className="p-3 border-t border-hairline bg-surface-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                  className="px-3 py-1.5 border border-hairline rounded-lg text-xs font-bold hover:bg-surface-soft transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleSaveMapCoordinates}
                  className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary-active transition-colors shadow-2xs cursor-pointer"
                >
                  บันทึกพิกัดนี้ลงระบบทันที
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
