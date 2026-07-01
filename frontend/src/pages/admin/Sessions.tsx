import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';
import { Plus, QrCode, Calendar as CalendarIcon, Clipboard, Check, X, Download, Edit2, Trash2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon issue in Vite/React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

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

const formatThaiDateTime = (isoStr: string | null) => {
  if (!isoStr) return '';
  try {
    const date = new Date(isoStr);
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }) + ' ' + date.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit'
    }) + ' น.';
  } catch (e) {
    return isoStr;
  }
};

const MONTH_OPTIONS = [
  { value: '01', label: 'มกราคม' },
  { value: '02', label: 'กุมภาพันธ์' },
  { value: '03', label: 'มีนาคม' },
  { value: '04', label: 'เมษายน' },
  { value: '05', label: 'พฤษภาคม' },
  { value: '06', label: 'มิถุนายน' },
  { value: '07', label: 'กรกฎาคม' },
  { value: '08', label: 'สิงหาคม' },
  { value: '09', label: 'กันยายน' },
  { value: '10', label: 'ตุลาคม' },
  { value: '11', label: 'พฤศจิกายน' },
  { value: '12', label: 'ธันวาคม' }
];

const getYearOptions = () => {
  const currentBeYear = new Date().getFullYear() + 543;
  const options = [];
  for (let y = currentBeYear - 2; y <= currentBeYear + 5; y++) {
    options.push(y.toString());
  }
  return options;
};

const isValidBeDate = (d: string, m: string, y: string) => {
  if (!d || !m || !y) return false;
  const day = Number(d);
  const month = Number(m);
  const year = Number(y);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const adYear = year - 543;
  const daysInMonth = new Date(adYear, month, 0).getDate();
  if (day > daysInMonth) return false;
  return true;
};

export default function AdminSessions() {
  const [sessions, setSessions] = useState<{ id: number; week_number: number; title: string; date: string; is_active: number; close_at: string | null; token: string; latitude?: number | null; longitude?: number | null; radius?: number; require_device_fingerprint?: number }[]>([]);
  const [showQR, setShowQR] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  // Form states
  const [weekNumber, setWeekNumber] = useState('');
  const [title, setTitle] = useState('');
  const [activityDay, setActivityDay] = useState('');
  const [activityMonth, setActivityMonth] = useState('');
  const [activityYear, setActivityYear] = useState('');
  const [enableCloseAt, setEnableCloseAt] = useState(false);
  const [closeDay, setCloseDay] = useState('');
  const [closeMonth, setCloseMonth] = useState('');
  const [closeYear, setCloseYear] = useState('');
  const [closeHour, setCloseHour] = useState('16');
  const [closeMinute, setCloseMinute] = useState('30');
  
  // Geolocation states
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('500');
  
  // Geolocation search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [pinningGPS, setPinningGPS] = useState(false);
  
  // Device Fingerprint validation state
  const [requireDeviceFingerprint, setRequireDeviceFingerprint] = useState(false);
  
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSessions();
  }, []);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  // Helper to update coords in React state
  const updateCoordinates = (lat: number, lng: number) => {
    setLatitude(lat.toString());
    setLongitude(lng.toString());
  };

  // Browser GPS Geolocation helper
  const triggerGPSLocation = () => {
    if (!navigator.geolocation) {
      alert('อุปกรณ์ของคุณไม่รองรับการดึงตำแหน่ง GPS');
      return;
    }
    setPinningGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const currentLat = pos.coords.latitude;
        const currentLng = pos.coords.longitude;
        updateCoordinates(currentLat, currentLng);
        
        if (mapRef.current && markerRef.current && circleRef.current) {
          mapRef.current.setView([currentLat, currentLng], 16);
          markerRef.current.setLatLng([currentLat, currentLng]);
          circleRef.current.setLatLng([currentLat, currentLng]);
        }
        setPinningGPS(false);
      },
      (err) => {
        console.error('GPS trigger error:', err);
        let msg = 'ไม่สามารถดึงตำแหน่ง GPS ได้';
        if (err.code === 1) msg = 'กรุณาอนุญาตสิทธิ์การเข้าถึงพิกัด GPS บนเบราว์เซอร์ของคุณ';
        alert(msg);
        setPinningGPS(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // OpenStreetMap Nominatim address search helper
  const handleSearchAddress = async () => {
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
        
        updateCoordinates(lat, lon);
        
        if (mapRef.current && markerRef.current && circleRef.current) {
          mapRef.current.setView([lat, lon], 16);
          markerRef.current.setLatLng([lat, lon]);
          circleRef.current.setLatLng([lat, lon]);
        }
      } else {
        alert('ไม่พบข้อมูลสถานที่จัดกิจกรรมที่คุณระบุ กรุณาลองค้นหาด้วยคำที่กว้างขึ้น');
      }
    } catch (err) {
      console.error('Search address error:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อค้นหาสถานที่');
    } finally {
      setSearchingAddress(false);
    }
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!showMapModal || !mapContainerRef.current) return;

    let initLat = latitude ? parseFloat(latitude) : 13.7563;
    let initLng = longitude ? parseFloat(longitude) : 100.5018;
    let isDefault = !latitude || !longitude;

    // Create Map
    const map = L.map(mapContainerRef.current).setView([initLat, initLng], 16);
    mapRef.current = map;

    // Add Tile Layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Create Circle
    const radValue = parseInt(radius) || 500;
    const circle = L.circle([initLat, initLng], {
      radius: radValue,
      color: '#2563eb', // Blue-600 border
      fillColor: '#3b82f6', // Blue-500 fill
      fillOpacity: 0.12,
      weight: 1.5
    }).addTo(map);
    circleRef.current = circle;

    // Create Draggable Marker
    const marker = L.marker([initLat, initLng], {
      draggable: true
    }).addTo(map);
    markerRef.current = marker;

    if (isDefault) {
      triggerGPSLocation();
    }

    // Marker drag event
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      if (circleRef.current) {
        circleRef.current.setLatLng(pos);
      }
      updateCoordinates(pos.lat, pos.lng);
    });

    // Map click event to relocate marker
    map.on('click', (e) => {
      if (markerRef.current) markerRef.current.setLatLng(e.latlng);
      if (circleRef.current) circleRef.current.setLatLng(e.latlng);
      updateCoordinates(e.latlng.lat, e.latlng.lng);
    });

    setTimeout(() => {
      map.invalidateSize();
    }, 300);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, [showMapModal]);

  // Update circle radius when radius state changes dynamically
  useEffect(() => {
    if (circleRef.current) {
      const currentRadius = parseInt(radius) || 500;
      circleRef.current.setRadius(currentRadius);
    }
  }, [radius]);

  const fetchSessions = () => {
    axios.get('/api/sessions')
      .then(res => setSessions(res.data || []))
      .catch(err => console.error('Error fetching sessions:', err));
  };

  const copyToClipboard = (id: number) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      navigator.clipboard.writeText(qrUrl(session.token));
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const qrUrl = (token: string) => {
    const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    // Strip trailing slash if present
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${cleanBaseUrl}/scan/${token}`;
  };

  const handleDownloadQR = (sessionId: number) => {
    const svgElement = document.querySelector('#qr-container svg');
    if (!svgElement) {
      alert('ไม่พบรูปภาพ QR Code');
      return;
    }

    try {
      const svgString = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);
      
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 800;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, 800, 800);
          context.drawImage(image, 0, 0, 800, 800);
          
          const png = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          const session = sessions.find((s) => s.id === sessionId);
          const fileName = session 
            ? `QR_Week_${session.week_number}.png` 
            : 'qrcode.png';
          downloadLink.href = png;
          downloadLink.download = fileName;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
          URL.revokeObjectURL(blobURL);
        }
      };
      image.src = blobURL;
    } catch (err) {
      console.error('Error downloading QR code:', err);
      alert('เกิดข้อผิดพลาดในการดาวน์โหลดรูปภาพ QR Code');
    }
  };

  const handleToggleActive = async (id: number, currentStatus: number) => {
    try {
      await axios.post(`/api/sessions/${id}/toggle`, { is_active: currentStatus === 1 ? 0 : 1 });
      fetchSessions();
    } catch (err) {
      console.error('Error toggling session status:', err);
    }
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!weekNumber || !title || !activityDay || !activityMonth || !activityYear) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    if (!isValidBeDate(activityDay, activityMonth, activityYear)) {
      setError('วันที่จัดกิจกรรมที่คุณเลือกไม่มีอยู่ในปฏิทินจริง (เช่น วันที่ 31 กุมภาพันธ์)');
      return;
    }

    if (enableCloseAt && !isValidBeDate(closeDay, closeMonth, closeYear)) {
      setError('วันที่ปิดรับเช็กชื่อที่คุณเลือกไม่มีอยู่ในปฏิทินจริง');
      return;
    }

    // Convert B.E. to A.D. for database
    const dateAd = `${parseInt(activityYear) - 543}-${activityMonth}-${activityDay}`;
    let closeAtAd = null;
    if (enableCloseAt) {
      if (!closeDay || !closeMonth || !closeYear || !closeHour || !closeMinute) {
        setError('กรุณากรอกข้อมูลวันที่และเวลาปิดรับเช็กชื่อให้ครบถ้วน');
        return;
      }
      const yearAd = parseInt(closeYear) - 543;
      const dt = new Date(yearAd, parseInt(closeMonth) - 1, parseInt(closeDay), parseInt(closeHour), parseInt(closeMinute));
      closeAtAd = dt.toISOString();
    }

    const payload = {
      week_number: parseInt(weekNumber),
      title,
      date: dateAd,
      close_at: closeAtAd,
      latitude: latitude.trim() !== '' ? parseFloat(latitude) : null,
      longitude: longitude.trim() !== '' ? parseFloat(longitude) : null,
      radius: radius.trim() !== '' ? parseInt(radius) : 500,
      require_device_fingerprint: requireDeviceFingerprint ? 1 : 0
    };

    try {
      if (modalMode === 'add') {
        await axios.post('/api/sessions', payload);
      } else {
        if (!selectedSessionId) return;
        await axios.put(`/api/sessions/${selectedSessionId}`, payload);
      }
      setShowModal(false);
      setWeekNumber('');
      setTitle('');
      setActivityDay('');
      setActivityMonth('');
      setActivityYear('');
      setEnableCloseAt(false);
      setCloseDay('');
      setCloseMonth('');
      setCloseYear('');
      setCloseHour('16');
      setCloseMinute('30');
      setLatitude('');
      setLongitude('');
      setRadius('500');
      setRequireDeviceFingerprint(false);
      setSelectedSessionId(null);
      fetchSessions();
    } catch (err: any) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลคาบกิจกรรม');
    }
  };

  const handleOpenAdd = () => {
    setModalMode('add');
    setSelectedSessionId(null);
    setWeekNumber('');
    setTitle('');
    
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = String(today.getFullYear() + 543);
    
    setActivityDay(day);
    setActivityMonth(month);
    setActivityYear(year);
    
    setEnableCloseAt(false);
    setCloseDay(day);
    setCloseMonth(month);
    setCloseYear(year);
    setCloseHour('16');
    setCloseMinute('30');
    
    setLatitude('');
    setLongitude('');
    setRadius('500');
    setRequireDeviceFingerprint(false);
    
    setError('');
    setShowModal(true);
  };

  const handleOpenEdit = (session: any) => {
    setModalMode('edit');
    setSelectedSessionId(session.id);
    setWeekNumber(session.week_number.toString());
    setTitle(session.title);
    
    // Parse activity date
    const parts = session.date.split('-');
    if (parts.length === 3) {
      setActivityYear((parseInt(parts[0]) + 543).toString());
      setActivityMonth(parts[1]);
      setActivityDay(parts[2]);
    } else {
      setActivityYear('');
      setActivityMonth('');
      setActivityDay('');
    }
    
    if (session.close_at) {
      const dt = new Date(session.close_at);
      if (!isNaN(dt.getTime())) {
        setEnableCloseAt(true);
        setCloseYear((dt.getFullYear() + 543).toString());
        setCloseMonth(String(dt.getMonth() + 1).padStart(2, '0'));
        setCloseDay(String(dt.getDate()).padStart(2, '0'));
        setCloseHour(String(dt.getHours()).padStart(2, '0'));
        setCloseMinute(String(dt.getMinutes()).padStart(2, '0'));
      } else {
        setEnableCloseAt(false);
        setCloseYear('');
        setCloseMonth('');
        setCloseDay('');
        setCloseHour('16');
        setCloseMinute('30');
      }
    } else {
      setEnableCloseAt(false);
      setCloseYear('');
      setCloseMonth('');
      setCloseDay('');
      setCloseHour('16');
      setCloseMinute('30');
    }
    
    setLatitude(session.latitude !== null && session.latitude !== undefined ? session.latitude.toString() : '');
    setLongitude(session.longitude !== null && session.longitude !== undefined ? session.longitude.toString() : '');
    setRadius(session.radius !== null && session.radius !== undefined ? session.radius.toString() : '500');
    setRequireDeviceFingerprint(session.require_device_fingerprint === 1);
    
    setError('');
    setShowModal(true);
  };

  const handleDeleteSession = async (id: number) => {
    if (!confirm('⚠️ คำเตือน: การลบคาบกิจกรรมครั้งนี้จะลบข้อมูลประวัติการเช็กชื่อของนักศึกษาทั้งหมดในครั้งนี้ออกจากฐานข้อมูลด้วย! คุณแน่ใจหรือไม่ที่จะลบคาบกิจกรรมนี้?')) return;
    
    try {
      await axios.delete(`/api/sessions/${id}`);
      fetchSessions();
    } catch (err) {
      console.error('Error deleting session:', err);
      alert('ไม่สามารถลบคาบกิจกรรมได้');
    }
  };

  return (
    <div className="space-y-6 sm:space-y-10">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-semibold text-ink tracking-tight">
            จัดการคาบกิจกรรม
          </h1>
          <p className="text-muted text-sm md:text-base mt-2">
            สร้างคาบกิจกรรมรายครั้ง ผลิตคิวอาร์โค้ดเพื่อให้นักศึกษาสแกน และคัดลอกลิงก์การลงทะเบียน
          </p>
        </div>
        <div>
          <button 
            onClick={handleOpenAdd}
            className="w-full sm:w-auto bg-primary hover:bg-primary-active text-white px-5 py-2.5 rounded-md text-sm font-semibold flex items-center justify-center space-x-2 transition-all duration-200 shadow-sm active:scale-98 cursor-pointer"
          >
            <Plus size={16} />
            <span>เพิ่มคาบกิจกรรมใหม่</span>
          </button>
        </div>
      </div>

      {/* Desktop Layout: Table */}
      <div className="hidden md:block bg-canvas border border-hairline rounded-lg overflow-hidden">
        {sessions.length === 0 ? (
          <div className="p-12 text-center text-muted-soft">ไม่มีคาบกิจกรรมในระบบ กรุณาคลิกปุ่มเพื่อสร้างคาบกิจกรรมใหม่</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-soft border-b border-hairline">
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted">ครั้งที่</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted">หัวข้อกิจกรรม</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted">วันที่จัดกิจกรรม</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted">สถานะเช็กชื่อ</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {sessions.map((session) => {
                const isExpired = session.close_at && new Date() > new Date(session.close_at);
                const isClosed = session.is_active === 0 || isExpired;
                return (
                  <tr key={session.id} className="hover:bg-surface-soft/40 transition-colors">
                    <td className="p-4 font-bold text-ink">ครั้งที่ {session.week_number}</td>
                    <td className="p-4 text-sm font-semibold text-ink">
                      <div>{session.title}</div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {session.latitude !== null && session.latitude !== undefined && (
                          <span className="inline-flex items-center text-[10px] text-primary font-semibold bg-primary/5 border border-primary/10 rounded px-1.5 py-0.5">
                             กำหนดพิกัด GPS (รัศมี {session.radius || 500} ม.)
                          </span>
                        )}
                        {session.require_device_fingerprint === 1 && (
                          <span className="inline-flex items-center text-[10px] text-success font-semibold bg-success/5 border border-success/10 rounded px-1.5 py-0.5">
                             ยืนยันเครื่องจริง (Device Fingerprint)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-body">{formatThaiDate(session.date)}</td>
                    <td className="p-4 text-sm">
                      <button
                        onClick={() => handleToggleActive(session.id, session.is_active)}
                        className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                          isClosed 
                            ? 'bg-error/10 text-error border-error/20 hover:bg-error/15' 
                            : 'bg-success/10 text-success border-success/20 hover:bg-success/15'
                        }`}
                        title="คลิกเพื่อ เปิด/ปิด การเช็กชื่อครั้งนี้"
                      >
                        {isClosed ? <X size={13} /> : <Check size={13} />}
                        <span>{isClosed ? 'ปิดรับเช็กชื่อ' : 'เปิดรับเช็กชื่อ'}</span>
                      </button>
                      {session.close_at && !isClosed && (
                        <p className="text-[10px] text-muted-soft mt-1">
                          ปิดอัตโนมัติ: {formatThaiDateTime(session.close_at)}
                        </p>
                      )}
                      {isExpired && (
                        <p className="text-[10px] text-error mt-0.5 font-semibold">
                          (หมดเวลาอัตโนมัติ)
                        </p>
                      )}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => copyToClipboard(session.id)}
                        className="inline-flex items-center space-x-1 text-xs font-semibold text-muted hover:text-ink px-2.5 py-1.5 rounded-md border border-hairline bg-canvas transition-colors cursor-pointer"
                      >
                        {copied === session.id ? <Check size={13} className="text-success" /> : <Clipboard size={13} />}
                        <span>{copied === session.id ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}</span>
                      </button>
                      <button
                        onClick={() => setShowQR(session.id)}
                        className="inline-flex items-center space-x-1.5 text-xs font-semibold bg-primary hover:bg-primary-active text-white px-3 py-1.5 rounded-md transition-colors cursor-pointer"
                      >
                        <QrCode size={13} />
                        <span>ดึง QR Code</span>
                      </button>
                      <button
                        onClick={() => handleOpenEdit(session)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-hairline bg-canvas hover:bg-surface-soft text-muted hover:text-ink transition-colors cursor-pointer"
                        title="แก้ไขคาบกิจกรรม"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteSession(session.id)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-error/20 bg-canvas hover:bg-error/10 text-muted hover:text-error transition-colors cursor-pointer"
                        title="ลบคาบกิจกรรม"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Mobile Layout: Stacked Cards */}
      <div className="md:hidden space-y-4">
        {sessions.length === 0 ? (
          <div className="bg-surface-card border border-hairline p-8 text-center text-muted-soft rounded-lg">ไม่มีคาบกิจกรรมในระบบ กรุณาคลิกปุ่มเพื่อสร้างคาบกิจกรรมใหม่</div>
        ) : (
          sessions.map((session) => {
            const isExpired = session.close_at && new Date() > new Date(session.close_at);
            const isClosed = session.is_active === 0 || isExpired;
            return (
              <div key={session.id} className="bg-surface-card border border-hairline p-4 sm:p-5 rounded-lg space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="inline-block text-[11px] bg-primary text-white font-extrabold px-2 py-0.5 rounded uppercase tracking-wider">
                        ครั้งที่ {session.week_number}
                      </span>
                      <button
                        onClick={() => handleToggleActive(session.id, session.is_active)}
                        className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                          isClosed 
                            ? 'bg-error/10 text-error border-error/20 hover:bg-error/15' 
                            : 'bg-success/10 text-success border-success/20 hover:bg-success/15'
                        }`}
                      >
                        {isClosed ? <X size={11} /> : <Check size={11} />}
                        <span>{isClosed ? 'ปิดรับเช็กชื่อ' : 'เปิดรับเช็กชื่อ'}</span>
                      </button>
                    </div>
                    <h3 className="text-base font-bold text-ink mt-2">
                      {session.title}
                      <span className="flex flex-wrap gap-1.5 mt-1 font-normal">
                        {session.latitude !== null && session.latitude !== undefined && (
                          <span className="inline-flex items-center text-[10px] text-primary font-semibold bg-primary/5 border border-primary/10 rounded px-1.5 py-0.5">
                             กำหนดพิกัด GPS (รัศมี {session.radius || 500} ม.)
                          </span>
                        )}
                        {session.require_device_fingerprint === 1 && (
                          <span className="inline-flex items-center text-[10px] text-success font-semibold bg-success/5 border border-success/10 rounded px-1.5 py-0.5">
                             ยืนยันเครื่องจริง (Device Fingerprint)
                          </span>
                        )}
                      </span>
                    </h3>
                    {session.close_at && !isClosed && (
                      <p className="text-[10px] text-muted-soft mt-1">
                        ปิดอัตโนมัติ: {formatThaiDateTime(session.close_at)}
                      </p>
                    )}
                    {isExpired && (
                      <p className="text-[10px] text-error font-semibold">
                        (หมดเวลาอัตโนมัติ)
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-soft flex items-center space-x-1">
                    <CalendarIcon size={12} />
                    <span>{formatThaiDate(session.date)}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => copyToClipboard(session.id)}
                    className="w-full py-2.5 px-3 border border-hairline rounded-md text-xs font-semibold text-ink bg-canvas flex items-center justify-center space-x-1.5 active:bg-surface-soft transition-colors cursor-pointer"
                  >
                    {copied === session.id ? <Check size={14} className="text-success" /> : <Clipboard size={14} />}
                    <span>{copied === session.id ? 'คัดลอกแล้ว!' : 'คัดลอกลิงก์'}</span>
                  </button>
                  <button
                    onClick={() => setShowQR(session.id)}
                    className="w-full py-2.5 px-3 bg-primary text-white rounded-md text-xs font-semibold flex items-center justify-center space-x-1.5 active:bg-primary-active transition-colors cursor-pointer"
                  >
                    <QrCode size={14} />
                    <span>รับ QR Code</span>
                  </button>
                </div>

                <div className="flex justify-between items-center border-t border-hairline pt-3 mt-1">
                  <span className="text-[10px] text-muted-soft font-bold uppercase">การจัดการคาบ:</span>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleOpenEdit(session)}
                      className="px-3 py-1.5 border border-hairline rounded text-xs font-semibold hover:bg-surface-soft text-ink flex items-center space-x-1 cursor-pointer"
                    >
                      <Edit2 size={12} />
                      <span>แก้ไข</span>
                    </button>
                    <button
                      onClick={() => handleDeleteSession(session.id)}
                      className="px-3 py-1.5 border border-error/20 rounded text-xs font-semibold hover:bg-error/10 text-error flex items-center space-x-1 cursor-pointer"
                    >
                      <Trash2 size={12} />
                      <span>ลบ</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add/Edit Session Modal (Premium Dialog Overlay) */}
      {showModal && (
        <div className="fixed inset-0 bg-[#111111]/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 z-50 animate-in fade-in duration-200 overflow-y-auto">
          <form 
            onSubmit={handleModalSubmit}
            className="bg-canvas border border-hairline rounded-lg shadow-2xl p-4 sm:p-6 md:p-8 max-w-md w-full relative flex flex-col animate-in zoom-in-95 duration-200 space-y-5 sm:space-y-6 my-4 sm:my-0"
          >
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border border-hairline text-muted hover:text-ink hover:bg-surface-soft transition-colors"
            >
              <X size={16} />
            </button>

            <div>
              <h2 className="text-xl font-bold text-ink tracking-tight">
                {modalMode === 'add' ? 'เพิ่มคาบกิจกรรมใหม่' : 'แก้ไขคาบกิจกรรม'}
              </h2>
              <p className="text-xs text-muted mt-1">
                {modalMode === 'add' ? 'กรอกข้อมูลรายละเอียดครั้งที่ กิจกรรม และระบุวันที่จัดกิจกรรม' : 'ปรับเปลี่ยนรายละเอียดครั้งที่ หัวข้อกิจกรรม หรือเวลาปิดรับเช็กชื่อ'}
              </p>
            </div>

            {error && (
              <div className="p-3 bg-error/15 border border-error/30 text-error text-xs font-semibold rounded-md">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">ครั้งที่ (ตัวเลข เท่านั้น)</label>
                <input 
                  type="number"
                  required
                  min="1"
                  value={weekNumber}
                  onChange={e => setWeekNumber(e.target.value)}
                  className="w-full h-10 border border-hairline rounded-md px-3.5 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  placeholder="เช่น 1"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">หัวข้อคาบกิจกรรม/กิจกรรม</label>
                <input 
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full h-10 border border-hairline rounded-md px-3.5 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  placeholder="เช่น ปฐมนิเทศกิจกรรม"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-semibold text-ink uppercase tracking-wider">วันที่จัดกิจกรรม</label>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date();
                      setActivityDay(String(today.getDate()).padStart(2, '0'));
                      setActivityMonth(String(today.getMonth() + 1).padStart(2, '0'));
                      setActivityYear(String(today.getFullYear() + 543));
                    }}
                    className="text-[11px] text-primary hover:text-primary-active font-semibold transition-colors flex items-center space-x-1 cursor-pointer"
                  >
                    <span>ตั้งเป็นวันนี้</span>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    required
                    value={activityDay}
                    onChange={e => setActivityDay(e.target.value)}
                    className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="" disabled>วัน</option>
                    {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map(d => (
                      <option key={d} value={d}>{parseInt(d)}</option>
                    ))}
                  </select>

                  <select
                    required
                    value={activityMonth}
                    onChange={e => setActivityMonth(e.target.value)}
                    className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="" disabled>เดือน</option>
                    {MONTH_OPTIONS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>

                  <select
                    required
                    value={activityYear}
                    onChange={e => setActivityYear(e.target.value)}
                    className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="" disabled>ปี พ.ศ.</option>
                    {getYearOptions().map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <div className="flex items-center space-x-2">
                  <input 
                    type="checkbox"
                    id="enableCloseAt"
                    checked={enableCloseAt}
                    onChange={e => {
                      setEnableCloseAt(e.target.checked);
                      if (e.target.checked && !closeDay) {
                        setCloseDay(activityDay || String(new Date().getDate()).padStart(2, '0'));
                        setCloseMonth(activityMonth || String(new Date().getMonth() + 1).padStart(2, '0'));
                        setCloseYear(activityYear || String(new Date().getFullYear() + 543));
                      }
                    }}
                    className="w-4 h-4 border border-hairline rounded text-primary focus:ring-primary cursor-pointer accent-primary"
                  />
                  <label htmlFor="enableCloseAt" className="text-xs font-semibold text-ink cursor-pointer select-none">
                    กำหนดเวลาปิดรับเช็กชื่ออัตโนมัติ
                  </label>
                </div>

                {enableCloseAt && (
                  <div className="p-4 bg-surface-soft border border-hairline rounded-lg space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-muted uppercase">วันที่ปิดรับเช็กชื่อ</label>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          required
                          value={closeDay}
                          onChange={e => setCloseDay(e.target.value)}
                          className="w-full h-9 border border-hairline rounded bg-canvas text-ink text-xs px-2 cursor-pointer focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        >
                          <option value="" disabled>วัน</option>
                          {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map(d => (
                            <option key={d} value={d}>{parseInt(d)}</option>
                          ))}
                        </select>

                        <select
                          required
                          value={closeMonth}
                          onChange={e => setCloseMonth(e.target.value)}
                          className="w-full h-9 border border-hairline rounded bg-canvas text-ink text-xs px-2 cursor-pointer focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        >
                          <option value="" disabled>เดือน</option>
                          {MONTH_OPTIONS.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>

                        <select
                          required
                          value={closeYear}
                          onChange={e => setCloseYear(e.target.value)}
                          className="w-full h-9 border border-hairline rounded bg-canvas text-ink text-xs px-2 cursor-pointer focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        >
                          <option value="" disabled>ปี พ.ศ.</option>
                          {getYearOptions().map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-muted uppercase">เวลาที่ปิดรับเช็กชื่อ</label>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          required
                          value={closeHour}
                          onChange={e => setCloseHour(e.target.value)}
                          className="w-full h-9 border border-hairline rounded bg-canvas text-ink text-xs px-2 cursor-pointer focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        >
                          <option value="" disabled>ชั่วโมง</option>
                          {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => (
                            <option key={h} value={h}>{h} น.</option>
                          ))}
                        </select>

                        <select
                          required
                          value={closeMinute}
                          onChange={e => setCloseMinute(e.target.value)}
                          className="w-full h-9 border border-hairline rounded bg-canvas text-ink text-xs px-2 cursor-pointer focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        >
                          <option value="" disabled>นาที</option>
                          {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                            <option key={m} value={m}>{m} นาที</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* GPS Geofencing Section */}
              <div className="space-y-3 pt-3 border-t border-hairline">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-semibold text-ink uppercase tracking-wider">
                    ข้อจำกัดพิกัด GPS สำหรับเช็กชื่อ
                  </label>
                </div>

                <div className="bg-surface-soft border border-hairline p-3.5 rounded-lg space-y-3.5">
                  <div className="text-xs">
                    {latitude && longitude ? (
                      <div className="space-y-1">
                        <p className="font-bold text-primary"> เปิดใช้งาน GPS Geofencing แล้ว</p>
                        <p className="text-muted-soft">พิกัด: {parseFloat(latitude).toFixed(6)}, {parseFloat(longitude).toFixed(6)}</p>
                        <p className="text-muted-soft">รัศมีเช็กชื่อ: {radius} เมตร</p>
                      </div>
                    ) : (
                      <div className="space-y-1 text-muted-soft">
                        <p className="font-semibold"> X ปิดการระบุตำแหน่ง GPS</p>
                        <p>นักศึกษาสามารถสแกนเช็กชื่อได้จากทุกสถานที่โดยไม่มีข้อจำกัด</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowMapModal(true)}
                      className="flex-grow py-2 border border-primary text-primary hover:bg-primary/5 bg-canvas rounded-md text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                    >
                      <span>ปักหมุดบนแผนที่</span>
                    </button>
                    {latitude && longitude && (
                      <button
                        type="button"
                        onClick={() => {
                          setLatitude('');
                          setLongitude('');
                          setRadius('500');
                        }}
                        className="px-3 py-2 border border-error/30 text-error hover:bg-error/5 bg-canvas rounded-md text-xs font-bold transition-colors flex items-center justify-center cursor-pointer"
                        title="ล้างตำแหน่งที่ตั้ง"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Device Fingerprint Verification Section */}
              <div className="space-y-3 pt-3 border-t border-hairline">
                <div className="flex items-center space-x-2.5">
                  <input 
                    type="checkbox"
                    id="requireDeviceFingerprint"
                    checked={requireDeviceFingerprint}
                    onChange={e => setRequireDeviceFingerprint(e.target.checked)}
                    className="w-4 h-4 border border-hairline rounded text-primary focus:ring-primary cursor-pointer accent-primary"
                  />
                  <label htmlFor="requireDeviceFingerprint" className="text-xs font-semibold text-ink cursor-pointer select-none">
                    เปิดใช้งานระบบยืนยันเครื่องจริง (Device Fingerprint)
                  </label>
                </div>
                <p className="text-[11px] text-muted leading-relaxed pl-6.5">
                  ป้องกันการเช็กชื่อแทนกันด้วยการใช้ลายนิ้วมือเครื่องแบบ Hardware-based (เช่น Canvas, GPU, จอภาพ, เวลา) ทำให้แม้เปลี่ยนเบราว์เซอร์หรือเคลียร์คุกกี้บนเครื่องเดิม ก็ยังระบุเป็นเครื่องเดิมและบล็อกการสแกนซ้ำ
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button 
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-hairline text-ink rounded-md text-xs font-semibold hover:bg-surface-soft transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button 
                type="submit"
                className="px-4 py-2 bg-primary hover:bg-primary-active text-white rounded-md text-xs font-semibold transition-colors cursor-pointer"
              >
                {modalMode === 'add' ? 'สร้างคาบกิจกรรม' : 'บันทึกแก้ไข'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Map Modal */}
      {showMapModal && (
        <div className="fixed inset-0 bg-[#111111]/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 z-[60] animate-in fade-in duration-200">
          <div className="bg-canvas border border-hairline rounded-lg shadow-2xl p-5 md:p-6 max-w-2xl w-full relative flex flex-col animate-in zoom-in-95 duration-200 space-y-4">
            <button
              type="button"
              onClick={() => setShowMapModal(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border border-hairline text-muted hover:text-ink hover:bg-surface-soft transition-colors z-10 bg-canvas"
            >
              <X size={16} />
            </button>

            <div>
              <h2 className="text-lg font-bold text-ink tracking-tight">ปักหมุดสถานที่จัดกิจกรรม</h2>
              <p className="text-xs text-muted mt-0.5">
                คลิกบนแผนที่หรือลากหมุดสีน้ำเงินเพื่อเลือกจุดศูนย์กลาง และปรับแต่งรัศมีขอบเขตการเช็กชื่อ
              </p>
            </div>

            {/* Search and GPS controls */}
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleSearchAddress();
                  }
                }}
                placeholder="ค้นหาชื่อสถานที่จัดกิจกรรม เช่น 'มหาวิทยาลัย...', 'อาคารเรียน...'"
                className="flex-grow h-10 border border-hairline rounded bg-canvas text-ink text-sm px-3.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-muted-soft"
              />
              <button
                type="button"
                onClick={handleSearchAddress}
                disabled={searchingAddress}
                className="px-4 bg-primary hover:bg-primary-active text-white text-xs font-semibold rounded-md transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50 min-w-[70px]"
              >
                {searchingAddress ? 'ค้นหา...' : 'ค้นหา'}
              </button>
              <button
                type="button"
                onClick={triggerGPSLocation}
                disabled={pinningGPS}
                className="px-3 border border-success hover:bg-success/5 text-success text-xs font-semibold rounded-md transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50 whitespace-nowrap"
                title="ปักหมุดตำแหน่ง GPS ปัจจุบันของฉัน"
              >
                 {pinningGPS ? 'กำลังดึง...' : 'ตำแหน่งของฉัน'}
              </button>
            </div>

            {/* IP Geolocation Warning Alert */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2.5 text-[11px] text-amber-600 space-y-0.5 leading-relaxed">
              <p className="font-bold flex items-center gap-1">
                ⚠️ คำชี้แจงเรื่องพิกัดไม่ตรง (IP-based Location):
              </p>
              <p>
                หากเปิดหน้าจอนี้ผ่าน **คอมพิวเตอร์/โน้ตบุ๊ก** พิกัดจากปุ่ม "ตำแหน่งของฉัน" มักจะคลาดเคลื่อน (เช่น ปักไปกรุงเทพฯ) เนื่องจากคอมพิวเตอร์ไม่มีชิป GPS จริง 
                <strong> แนะนำให้พิมพ์ค้นหาชื่อสถานที่ (เช่น มทร.ธัญบุรี) ในช่องค้นหาด้านบน หรือลากหมุดบนแผนที่ไปยังจุดจัดกิจกรรมจริงแทน</strong>
              </p>
            </div>

            {/* Map Container */}
            <div 
              ref={mapContainerRef} 
              className="w-full h-80 sm:h-96 rounded-lg border border-hairline z-0"
              style={{ minHeight: '300px' }}
            ></div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-surface-soft border border-hairline p-3 rounded-lg">
              <div className="flex items-center space-x-2.5">
                <span className="text-xs font-bold text-ink uppercase tracking-wider whitespace-nowrap">ขอบเขตรัศมี:</span>
                <input 
                  type="number"
                  min="10"
                  max="10000"
                  value={radius}
                  onChange={e => setRadius(e.target.value)}
                  className="w-24 h-9 border border-hairline rounded bg-canvas text-ink text-xs px-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-semibold"
                  placeholder="เช่น 500"
                />
                <span className="text-xs text-muted font-medium">เมตร</span>
              </div>
              
              <div className="text-right text-[11px] text-muted-soft hidden sm:block">
                {latitude && longitude ? (
                  <span>พิกัด: {parseFloat(latitude).toFixed(5)}, {parseFloat(longitude).toFixed(5)}</span>
                ) : (
                  <span>กำลังดึงตำแหน่งของท่าน...</span>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-1">
              <button 
                type="button"
                onClick={() => setShowMapModal(false)}
                className="px-4 py-2 border border-hairline text-ink rounded-md text-xs font-semibold hover:bg-surface-soft transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button 
                type="button"
                onClick={() => {
                  if (!latitude || !longitude) {
                    alert('กรุณารอแผนที่โหลดพิกัดหรือระบุตำแหน่งก่อนยืนยัน');
                    return;
                  }
                  setShowMapModal(false);
                }}
                className="px-4 py-2 bg-primary hover:bg-primary-active text-white rounded-md text-xs font-semibold transition-colors cursor-pointer"
              >
                 ยืนยันพิกัดตำแหน่งนี้
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal (Premium Dialog Overlay) */}
      {showQR !== null && (
        <div className="fixed inset-0 bg-[#111111]/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 z-50 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-canvas border border-hairline rounded-lg shadow-2xl p-5 sm:p-8 max-w-sm w-full relative flex flex-col items-center animate-in zoom-in-95 duration-200 my-4">
            {/* Close Button */}
            <button
              onClick={() => setShowQR(null)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border border-hairline text-muted hover:text-ink hover:bg-surface-soft transition-colors focus:outline-none"
              aria-label="Close dialog"
            >
              <X size={16} />
            </button>

            {/* Modal Title */}
            <span className="text-[11px] bg-surface-soft border border-hairline text-muted font-bold px-2 py-0.5 rounded uppercase tracking-wider mb-2">
              QR Code ประจำครั้ง
            </span>
            <h2 className="text-lg font-bold text-ink text-center mb-1">
              {sessions.find((s) => s.id === showQR)?.title}
            </h2>
            <p className="text-xs text-muted mb-6 text-center">
              ครั้งที่ {sessions.find((s) => s.id === showQR)?.week_number} • สแกนเพื่อเช็กชื่อเข้าร่วมกิจกรรม
            </p>

            {/* QR Wrapper (Embedded UI Card Chrome) */}
            <div id="qr-container" className="bg-canvas border border-hairline rounded-lg p-5 shadow-[0_4px_12px_rgba(0,0,0,0.03)] flex justify-center items-center w-full aspect-square max-w-[240px] mb-6">
              <QRCodeSVG value={qrUrl(sessions.find((s) => s.id === showQR)?.token || '')} size={200} level="H" includeMargin={false} />
            </div>

            {/* Link Text and Copy */}
            <div className="w-full bg-surface-soft border border-hairline p-3 rounded-md flex items-center justify-between text-xs mb-4">
              <span className="text-muted truncate mr-2 font-mono">{qrUrl(sessions.find((s) => s.id === showQR)?.token || '')}</span>
              <button
                onClick={() => showQR && copyToClipboard(showQR)}
                className="text-primary hover:text-primary-active font-semibold flex-shrink-0"
              >
                {copied === showQR ? 'คัดลอกแล้ว' : 'คัดลอก'}
              </button>
            </div>

            <button
              onClick={() => handleDownloadQR(showQR)}
              className="w-full py-2.5 px-4 bg-primary hover:bg-primary-active text-white text-xs font-semibold rounded-md flex items-center justify-center space-x-2 transition-colors cursor-pointer"
            >
              <Download size={14} />
              <span>ดาวน์โหลดรูปภาพ</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
