import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { 
  Calendar, 
  Clock, 
  ShieldAlert, 
  Search, 
  UserCheck, 
  TrendingUp, 
  Plus, 
  Building,
  Check,
  RotateCcw,
  Download,
  PieChart,
  Users,
  GraduationCap,
  LayoutDashboard,
  Maximize2,
  Minimize2,
  MapPin,
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

// Fix Leaflet default marker icon issue in Vite/React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  LabelList,
  Cell,
  PieChart as RechartsPieChart,
  Pie,
} from 'recharts';


interface Session {
  id: number;
  week_number: number;
  title: string;
  date: string;
  is_active: number;
  close_at: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radius?: number | null;
}

interface StudentRecord {
  id?: number;
  student_id: string;
  prefix: string;
  first_name: string;
  last_name: string;
  class_year?: string;
  level?: string;
  year?: string;
  major_name?: string;
  major_code: string;
  room: string;
  attended_at?: string;
}

interface WeeklyTrend {
  sessionId: number;
  weekNumber: number;
  title: string;
  rate: number;
}

interface RoomStat {
  room: string;
  expected: number;
  present: number;
  absent: number;
  rate: number;
}

interface ScanTimeData {
  time: string;
  count: number;
}

interface GenderStatDetail {
  expected: number;
  present: number;
  absent: number;
  rate: number;
}

interface DashboardStats {
  sessions: Session[];
  selectedSessionId: number | 'all' | null;
  totalExpected: number;
  totalPresent: number;
  totalAbsent: number;
  attendanceRate: number;
  presentList: StudentRecord[];
  absentList: StudentRecord[];
  weeklyTrend: WeeklyTrend[];
  roomStats: RoomStat[];
  scanDistribution?: ScanTimeData[];
  genderStats?: {
    male: GenderStatDetail;
    female: GenderStatDetail;
  };
  allGroups?: Array<{ code: string; label: string; level: string }>;
}

function getAggregatedScanDistribution(rawDist: ScanTimeData[] | undefined, volume: number): ScanTimeData[] {
  if (!rawDist || rawDist.length === 0) return [];
  
  const aggMap: { [key: string]: { startHour: number; startMin: number; count: number } } = {};
  
  rawDist.forEach(item => {
    const cleanTime = item.time.replace(' น.', '').trim();
    const [hStr, mStr] = cleanTime.split(':');
    const hour = parseInt(hStr, 10);
    const minute = parseInt(mStr, 10);
    
    if (isNaN(hour) || isNaN(minute)) return;
    
    const startMin = Math.floor(minute / volume) * volume;
    const startHour = hour;
    
    const key = `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`;
    
    if (!aggMap[key]) {
      aggMap[key] = { startHour, startMin, count: 0 };
    }
    aggMap[key].count += item.count;
  });
  
  return Object.keys(aggMap)
    .sort()
    .map(key => {
      const { startHour, startMin, count } = aggMap[key];
      
      let endHour = startHour;
      let endMin = startMin + volume - 1;
      if (endMin >= 60) {
        endMin = 59;
      }
      
      const startStr = `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`;
      const endStr = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
      
      return {
        time: `${startStr} - ${endStr} น.`,
        count
      };
    });
}

interface AttendanceMapProps {
  presentList: any[];
  sessionLocation?: { latitude?: number | null; longitude?: number | null; radius?: number | null } | null;
  resolution: 5 | 10 | 50 | 100 | 150;
}

function AttendanceMap({ presentList, sessionLocation, resolution }: AttendanceMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize map with default center (Bangkok) and zoom
    const map = L.map(mapContainerRef.current, {
      center: [13.7563, 100.5018],
      zoom: 12,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    mapRef.current = map;
    layerGroupRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    // Clear previous drawings
    layerGroup.clearLayers();

    // 1. Filter valid check-ins (ignore coordinates near 0/Null Island)
    const validCheckins = presentList.filter(
      item => item.latitude !== null && item.longitude !== null &&
              !isNaN(Number(item.latitude)) && !isNaN(Number(item.longitude)) &&
              Math.abs(Number(item.latitude)) > 0.1 && Math.abs(Number(item.longitude)) > 0.1
    );

    const step = resolution * 0.000009; // degrees per meter approx
    const grid: Record<string, { lat: number; lng: number; count: number; studentNames: string[] }> = {};

    validCheckins.forEach(item => {
      const lat = Number(item.latitude);
      const lng = Number(item.longitude);
      const cellLat = Math.floor(lat / step) * step + step / 2;
      const cellLng = Math.floor(lng / step) * step + step / 2;
      const key = `${cellLat.toFixed(6)},${cellLng.toFixed(6)}`;

      if (!grid[key]) {
        grid[key] = { lat: cellLat, lng: cellLng, count: 0, studentNames: [] };
      }
      grid[key].count++;
      grid[key].studentNames.push(`${item.first_name} ${item.last_name} (${item.student_id})`);
    });

    const cells = Object.values(grid);

    // 2. Find peak coordinate (max density cell)
    let peakCell = cells.reduce((max, c) => (c.count > max.count ? c : max), cells[0] || null);

    // 3. Set map view based on peak cell or session location or fallback
    let focusLatLng: L.LatLngExpression = [13.7563, 100.5018]; // Default Bangkok
    let hasFocus = false;

    if (peakCell) {
      focusLatLng = [peakCell.lat, peakCell.lng];
      hasFocus = true;
    } else if (sessionLocation && sessionLocation.latitude !== null && sessionLocation.longitude !== null && Math.abs(Number(sessionLocation.latitude)) > 0.1) {
      focusLatLng = [Number(sessionLocation.latitude), Number(sessionLocation.longitude)];
      hasFocus = true;
    } else if (validCheckins.length > 0) {
      focusLatLng = [Number(validCheckins[0].latitude), Number(validCheckins[0].longitude)];
      hasFocus = true;
    }

    // Recalculate size and center map after layout stabilizes (in single combined timer)
    const mapTimer = setTimeout(() => {
      map.invalidateSize();
      if (hasFocus) {
        map.setView(focusLatLng, 17); // Detail level zoom
      } else {
        map.setView(focusLatLng, 12);
      }
    }, 250);

    // 4. Draw session Geofencing zone circle if available
    if (sessionLocation && sessionLocation.latitude !== null && sessionLocation.longitude !== null) {
      const sessionLatLng: L.LatLngExpression = [Number(sessionLocation.latitude), Number(sessionLocation.longitude)];
      
      // Draw center marker
      L.marker(sessionLatLng)
        .bindPopup(`<b>จุดจัดกิจกรรม/เรียน</b><br/>รัศมีเช็กชื่อ: ${sessionLocation.radius || 500} เมตร`)
        .addTo(layerGroup);

      // Draw radius circle
      L.circle(sessionLatLng, {
        radius: sessionLocation.radius || 500,
        color: '#10B981',
        fillColor: '#10B981',
        fillOpacity: 0.08,
        dashArray: '5, 5',
        weight: 1.5
      }).addTo(layerGroup);
    }

    // 5. Draw grid cells heatmap
    if (cells.length > 0) {
      const maxCount = Math.max(...cells.map(c => c.count));

      cells.forEach(cell => {
        const ratio = cell.count / maxCount;
        
        // Colors mapping: low (green) -> medium (yellow) -> high (orange) -> very high (red)
        let color = '#10B981'; // green
        if (ratio > 0.75) color = '#ef4444'; // red
        else if (ratio > 0.5) color = '#f97316'; // orange
        else if (ratio > 0.25) color = '#fbbf24'; // yellow-orange

        const halfStep = step / 2;
        const bounds: L.LatLngBoundsExpression = [
          [cell.lat - halfStep, cell.lng - halfStep],
          [cell.lat + halfStep, cell.lng + halfStep]
        ];

        const rect = L.rectangle(bounds, {
          color: color,
          weight: 1,
          opacity: 0.4,
          fillColor: color,
          fillOpacity: 0.55,
        });

        const tooltipContent = `
          <div style="font-family: inherit; font-size: 11px; padding: 2px 4px;">
            <strong>ขอบเขตรัศมี ${resolution}ม.</strong><br/>
            📍 พิกัดกลาง: ${cell.lat.toFixed(5)}, ${cell.lng.toFixed(5)}<br/>
            👤 สแกนเช็กชื่อ: <span style="font-weight:bold; color:${color}">${cell.count} คน-ครั้ง</span>
          </div>
        `;
        rect.bindTooltip(tooltipContent, { sticky: true });

        const namesList = cell.studentNames.slice(0, 10).map(name => `• ${name}`).join('<br/>');
        const moreCount = cell.studentNames.length - 10;
        const popupContent = `
          <div style="font-family: inherit; font-size: 11px;">
            <b>ขอบเขตเช็กชื่อหนาแน่น (${resolution} ม.)</b><br/>
            จำนวนเช็กชื่อ: <b>${cell.count} คน-ครั้ง</b><br/>
            <hr style="margin:6px 0; border:0; border-top:1px solid #ddd;"/>
            <b>รายชื่อผู้เช็กชื่อในโซนนี้:</b><br/>
            ${namesList}
            ${moreCount > 0 ? `<br/><i>...และคนอื่นๆ อีก ${moreCount} คน</i>` : ''}
          </div>
        `;
        rect.bindPopup(popupContent);

        rect.addTo(layerGroup);
      });
    }

    return () => {
      clearTimeout(mapTimer);
    };
  }, [presentList, resolution, sessionLocation]);

  return (
    <div 
      ref={mapContainerRef} 
      style={{ height: 350, width: '100%', borderRadius: 8, zIndex: 1, position: 'relative' }} 
      className="border border-hairline overflow-hidden"
    />
  );
}

export default function AdminDashboard() {
  // Filter States
  const [selectedSessionId, setSelectedSessionId] = useState<number | 'all' | ''>(() => {
    const saved = safeLocalStorage.getItem('filter_sessionId');
    if (saved === 'all') return 'all';
    return saved ? Number(saved) : '';
  });
  const [level, setLevel] = useState<string>(() => safeLocalStorage.getItem('filter_level') || '');
  const [classYear, setClassYear] = useState<string>(() => safeLocalStorage.getItem('filter_classYear') || '');
  const [majorCode, setMajorCode] = useState<string>(() => safeLocalStorage.getItem('filter_majorCode') || '');
  const [room, setRoom] = useState<string>(() => safeLocalStorage.getItem('filter_room') || '');
  const [gender, setGender] = useState<string>(() => safeLocalStorage.getItem('filter_gender') || '');

  // Exclusion States
  const [excludeLevel, setExcludeLevel] = useState<boolean>(() => safeLocalStorage.getItem('filter_excludeLevel') === 'true');
  const [excludeClassYear, setExcludeClassYear] = useState<boolean>(() => safeLocalStorage.getItem('filter_excludeClassYear') === 'true');
  const [excludeMajorCode, setExcludeMajorCode] = useState<boolean>(() => safeLocalStorage.getItem('filter_excludeMajorCode') === 'true');
  const [excludeRoom, setExcludeRoom] = useState<boolean>(() => safeLocalStorage.getItem('filter_excludeRoom') === 'true');
  const [excludeGender, setExcludeGender] = useState<boolean>(() => safeLocalStorage.getItem('filter_excludeGender') === 'true');
  const [excludedGroups, setExcludedGroups] = useState<string[]>(() => {
    const saved = safeLocalStorage.getItem('filter_excludedGroups');
    return saved ? saved.split(',').filter(Boolean) : [];
  });
  const [filterTab, setFilterTab] = useState<'filter' | 'exclude'>('filter');

  const toggleGroupExclusion = (groupCode: string) => {
    setExcludedGroups(prev => 
      prev.includes(groupCode)
        ? prev.filter(c => c !== groupCode)
        : [...prev, groupCode]
    );
  };

  // Dropdown Master Data
  const [sessions, setSessions] = useState<Session[]>([]);
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [availableMajors, setAvailableMajors] = useState<string[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [availableRooms, setAvailableRooms] = useState<string[]>([]);

  // Statistics Data
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSheetsConnected, setIsSheetsConnected] = useState(false);

  // Tab & Local search states
  const [activeTab, setActiveTab] = useState<'present' | 'absent'>('present');
  const [localSearch, setLocalSearch] = useState('');
  const [mapResolution, setMapResolution] = useState<5 | 10 | 50 | 100 | 150>(() => {
    const saved = safeLocalStorage.getItem('filter_mapResolution');
    return saved ? Number(saved) as any : 50;
  });
  
  // Custom Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ show: false, title: '', message: '', onConfirm: () => {} });

  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Individual Student History State
  const [selectedStudentHistory, setSelectedStudentHistory] = useState<{
    student: StudentRecord & { is_temporary?: boolean };
    stats: {
      totalSessions: number;
      totalPresent: number;
      totalAbsent: number;
      attendanceRate: number;
    };
    history: Array<{
      sessionId: number;
      weekNumber: number;
      title: string;
      date: string;
      status: 'present' | 'absent';
      attended_at: string | null;
    }>;
  } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);


  // Trend limit slider state
  const [trendLimit, setTrendLimit] = useState<number>(6);

  // Tab states for ratio display
  const [ratioTab, setRatioTab] = useState<'summary' | 'year' | 'major' | 'room' | 'gender'>('summary');

  // Expanded chart state — แยกต่างหากต่อ row เพื่อป้องกัน row อื่นได้รับผลกระทบ
  const [expandedRow1, setExpandedRow1] = useState<1 | 2 | null>(null);
  const [expandedRow2, setExpandedRow2] = useState<3 | 4 | null>(null);
  const [scanVolume, setScanVolume] = useState<number>(5);
  // Tab for Chart 3+5 combined: 'bar' | 'radar'
  const [roomChartTab, setRoomChartTab] = useState<'bar' | 'radar'>('bar');

  const getGender = (prefix: string) => {
    const p = prefix || '';
    if (p === 'นาย' || p === 'เด็กชาย' || p === 'ด.ช.' || p === 'ด.ช') {
      return 'ชาย';
    }
    return 'หญิง';
  };

  // Concentric Donut Chart states and types
  const [hoveredPath, setHoveredPath] = useState<string[] | null>(null);
  const [hoveredSeg, setHoveredSeg] = useState<{ label: string; value: number; percentage: number; color: string } | null>(null);

  const [searchStudentId, setSearchStudentId] = useState('');

  const getSegmentColor = (status: 'present' | 'absent', path: string[], level: number) => {
    if (level === 1) {
      return status === 'present' ? '#10B981' : '#EF4444';
    }
    
    // Hash the path to get a stable random value
    const str = path.join('-');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    hash = Math.abs(hash);

    if (status === 'present') {
      // Greenish HSL: Hue between 135 and 185
      const h = 135 + (hash % 50);
      // Saturation: 65% - 85%
      const s = 65 + (hash % 20);
      // Lightness: 50%
      const l = 50 + (hash % 6);
      return `hsl(${h}, ${s}%, ${l}%)`;
    } else {
      // Redish HSL: Hue between 345 and 395 (wraps to 0-35)
      const h = (345 + (hash % 45)) % 360;
      // Saturation: 70% - 90%
      const s = 70 + (hash % 20);
      // Lightness: 52%
      const l = 52 + (hash % 6);
      return `hsl(${h}, ${s}%, ${l}%)`;
    }
  };

  const getSegmentsForTab = (tab: 'summary' | 'year' | 'major' | 'room' | 'gender') => {
    if (!stats) return [];

    const allStudents = [
      ...stats.presentList.map(s => ({ ...s, status: 'present' as const })),
      ...stats.absentList.map(s => ({ ...s, status: 'absent' as const }))
    ];

    const totalCount = allStudents.length;
    if (totalCount === 0) return [];

    const groupings: { [key: string]: { present: number; absent: number } } = {};

    allStudents.forEach(s => {
      let key = '';
      if (tab === 'summary') {
        key = s.status === 'present' ? 'เข้ากิจกรรม' : 'ไม่เข้ากิจกรรม';
      } else if (tab === 'year') {
        const yr = s.year || s.class_year;
        key = yr ? `ปี ${yr}` : 'ไม่ระบุ';
      } else if (tab === 'major') {
        key = s.major_code || 'ไม่ระบุ';
      } else if (tab === 'room') {
        const yr = s.year || s.class_year;
        key = s.room ? `${yr || ''}${s.major_code || ''}${s.room}` : 'ไม่ระบุ';
      } else if (tab === 'gender') {
        key = getGender(s.prefix);
      }

      if (!groupings[key]) {
        groupings[key] = { present: 0, absent: 0 };
      }

      if (s.status === 'present') {
        groupings[key].present++;
      } else {
        groupings[key].absent++;
      }
    });

    const segments: Array<{ label: string; status: 'present' | 'absent'; value: number; color: string; path: string[] }> = [];

    const groupEntries = Object.entries(groupings).sort((a, b) => a[0].localeCompare(b[0]));

    groupEntries.forEach(([groupName, counts]) => {
      if (tab === 'summary') {
        if (groupName === 'เข้ากิจกรรม' && counts.present > 0) {
          segments.push({
            label: 'เข้ากิจกรรม (Present)',
            status: 'present',
            value: counts.present,
            color: '#10B981',
            path: ['เข้ากิจกรรม']
          });
        } else if (groupName === 'ไม่เข้ากิจกรรม' && counts.absent > 0) {
          segments.push({
            label: 'ไม่เข้ากิจกรรม (Absent)',
            status: 'absent',
            value: counts.absent,
            color: '#EF4444',
            path: ['ไม่เข้ากิจกรรม']
          });
        }
      } else {
        if (counts.present > 0) {
          segments.push({
            label: `เข้ากิจกรรม (${groupName})`,
            status: 'present',
            value: counts.present,
            color: getSegmentColor('present', [groupName], 2),
            path: ['เข้ากิจกรรม', groupName]
          });
        }
        if (counts.absent > 0) {
          segments.push({
            label: `ไม่เข้ากิจกรรม (${groupName})`,
            status: 'absent',
            value: counts.absent,
            color: getSegmentColor('absent', [groupName], 2),
            path: ['ไม่เข้ากิจกรรม', groupName]
          });
        }
      }
    });

    let currentAngle = -90;
    return segments.map(seg => {
      const percentage = (seg.value / totalCount) * 100;
      const angle = (seg.value / totalCount) * 360;
      const startAngle = currentAngle;
      currentAngle += angle;
      return {
        ...seg,
        percentage: Math.round(percentage * 10) / 10,
        startAngle,
        angle
      };
    });
  };

  const formatPathLabel = (path: string[]) => {
    if (path.length <= 1) return path[0] || '';
    const status = path[0];
    const details = path.slice(1).join(' - ');
    return `${status} (${details})`;
  };

  // Fetch unique majors list for the filters
  const fetchMajors = async () => {
    try {
      const res = await axios.get('/api/majors');
      if (res.data) {
        const uniqueLevels = Array.from(new Set(res.data.map((m: any) => m.level))) as string[];
        setAvailableLevels(uniqueLevels.sort());

        const unique = Array.from(new Set(res.data.map((m: any) => m.major_code))) as string[];
        setAvailableMajors(unique.sort());

        const uniqueYears = Array.from(new Set(res.data.map((m: any) => m.year.toString()))) as string[];
        setAvailableYears(uniqueYears.sort((a, b) => a.localeCompare(b)));

        const uniqueRooms = Array.from(new Set(res.data.map((m: any) => m.room.toString()))) as string[];
        setAvailableRooms(uniqueRooms.sort((a, b) => a.localeCompare(b)));
      }
    } catch (err) {
      console.error('Error fetching majors list:', err);
    }
  };

  // Fetch General System Stats (like Sheet status)
  const fetchGeneralStats = async () => {
    try {
      const res = await axios.get('/api/stats');
      if (res.data) {
        setIsSheetsConnected(res.data.isSheetsConnected || false);
      }
    } catch (err) {
      console.error('Error fetching general stats:', err);
    }
  };

  // Main statistics fetching function (memoized to prevent infinite loop)
  const fetchDashboardStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/dashboard-stats', {
        params: {
          sessionId: selectedSessionId || undefined,
          level: level || undefined,
          classYear: classYear || undefined,
          majorCode: majorCode || undefined,
          room: room || undefined,
          gender: gender || undefined,
          excludeLevel: excludeLevel ? 'true' : undefined,
          excludeClassYear: excludeClassYear ? 'true' : undefined,
          excludeMajorCode: excludeMajorCode ? 'true' : undefined,
          excludeRoom: excludeRoom ? 'true' : undefined,
          excludeGender: excludeGender ? 'true' : undefined,
          excludedGroups: excludedGroups.length > 0 ? excludedGroups.join(',') : undefined
        }
      });
      if (res.data) {
        setStats(res.data);
        setSessions(res.data.sessions || []);
        if (selectedSessionId === '' && res.data.selectedSessionId) {
          setSelectedSessionId(res.data.selectedSessionId);
        }
      }
    } catch (err) {
      console.error('Error fetching dashboard statistics:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId, level, classYear, majorCode, room, gender, excludeLevel, excludeClassYear, excludeMajorCode, excludeRoom, excludeGender, excludedGroups]);

  useEffect(() => {
    fetchMajors();
    fetchGeneralStats();
  }, []);

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  // Persist filter states in safeLocalStorage
  useEffect(() => {
    safeLocalStorage.setItem('filter_sessionId', selectedSessionId.toString());
    safeLocalStorage.setItem('filter_level', level);
    safeLocalStorage.setItem('filter_classYear', classYear);
    safeLocalStorage.setItem('filter_majorCode', majorCode);
    safeLocalStorage.setItem('filter_room', room);
    safeLocalStorage.setItem('filter_gender', gender);
    safeLocalStorage.setItem('filter_excludeLevel', excludeLevel.toString());
    safeLocalStorage.setItem('filter_excludeClassYear', excludeClassYear.toString());
    safeLocalStorage.setItem('filter_excludeMajorCode', excludeMajorCode.toString());
    safeLocalStorage.setItem('filter_excludeRoom', excludeRoom.toString());
    safeLocalStorage.setItem('filter_excludeGender', excludeGender.toString());
    safeLocalStorage.setItem('filter_excludedGroups', excludedGroups.join(','));
    safeLocalStorage.setItem('filter_mapResolution', mapResolution.toString());
  }, [selectedSessionId, level, classYear, majorCode, room, gender, excludeLevel, excludeClassYear, excludeMajorCode, excludeRoom, excludeGender, excludedGroups, mapResolution]);

  // Handle Quick Manual Check-in from Absent List
  const handleQuickCheckin = (student: StudentRecord & { session_id?: number }) => {
    const targetSession = selectedSessionId === 'all' ? student.session_id : selectedSessionId;
    if (!targetSession) return;

    const sessionObj = sessions.find(s => s.id === targetSession);
    const sessionLabel = sessionObj ? `ครั้งที่ ${sessionObj.week_number}` : 'คาบกิจกรรมนี้';

    setConfirmDialog({
      show: true,
      title: 'เช็กชื่อแบบแมนนวล',
      message: `ยืนยันการลงชื่อเข้าเรียนให้ ${student.prefix}${student.first_name} ${student.last_name} (${student.student_id}) ใน${sessionLabel}?`,
      onConfirm: async () => {
        try {
          await axios.post('/api/attendances', {
            session_id: targetSession,
            prefix: student.prefix,
            first_name: student.first_name,
            last_name: student.last_name,
            student_id: student.student_id,
            level: student.level || 'ปวช',
            year: student.year || student.class_year || '1',
            major_name: student.major_name || 'ไม่ระบุสาขา',
            major_code: student.major_code,
            room: student.room,
            bypass_gps: true
          });
          
          setMessage(`ลงชื่อเข้าเรียนให้ ${student.first_name} เรียบร้อยแล้ว!`);
          fetchDashboardStats();
          setTimeout(() => setMessage(''), 3000);
        } catch (err: any) {
          setErrorMsg(err.response?.data?.error || 'เกิดข้อผิดพลาดในการลงชื่อ');
          setTimeout(() => setErrorMsg(''), 3000);
        }
      }
    });
  };

  // Fetch and show individual student history
  const handleOpenStudentHistory = async (studentId: string) => {
    setLoadingHistory(true);
    try {
      const res = await axios.get(`/api/admin/student-attendance/${studentId}`);
      if (res.data) {
        setSelectedStudentHistory(res.data);
      }
    } catch (err) {
      console.error('Error fetching student history:', err);
      setErrorMsg('ไม่สามารถดึงข้อมูลประวัตินักศึกษาได้');
      setTimeout(() => setErrorMsg(''), 3000);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSearchStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchStudentId.trim()) return;
    handleOpenStudentHistory(searchStudentId.trim());
  };

  // Helper: Format ISO date string to Thai short time
  const formatTime = (isoString?: string) => {
    if (!isoString) return '-';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('th-TH', { 
        timeZone: 'Asia/Bangkok',
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false
      }) + ' น.';
    } catch (e) {
      return '-';
    }
  };

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  // Client-side search filtering on the lists
  const filteredPresentList = stats?.presentList.filter(s => 
    s.student_id.includes(localSearch) || 
    s.first_name.toLowerCase().includes(localSearch.toLowerCase()) ||
    s.last_name.toLowerCase().includes(localSearch.toLowerCase())
  ) || [];

  const filteredAbsentList = stats?.absentList.filter(s => 
    s.student_id.includes(localSearch) || 
    s.first_name.toLowerCase().includes(localSearch.toLowerCase()) ||
    s.last_name.toLowerCase().includes(localSearch.toLowerCase())
  ) || [];

  const handleClearFilters = () => {
    setLevel('');
    setClassYear('');
    setMajorCode('');
    setRoom('');
    setGender('');
    setExcludeLevel(false);
    setExcludeClassYear(false);
    setExcludeMajorCode(false);
    setExcludeRoom(false);
    setExcludeGender(false);
    setExcludedGroups([]);
    setFilterTab('filter');
  };

  // Export current list to CSV with Thai BOM support
  const handleExportCSV = () => {
    const dataToExport = activeTab === 'present' ? filteredPresentList : filteredAbsentList;
    if (dataToExport.length === 0) return;

    const headers = activeTab === 'present' 
      ? ['ลำดับ', 'รหัสนักศึกษา', 'คำนำหน้า', 'ชื่อจริง', 'นามสกุล', 'ระดับชั้น', 'ชั้นปี', 'ชื่อย่อสาขา', 'ชื่อเต็มสาขา', 'กลุ่ม', 'เวลาเช็กชื่อ']
      : ['ลำดับ', 'รหัสนักศึกษา', 'คำนำหน้า', 'ชื่อจริง', 'นามสกุล', 'ระดับชั้น', 'ชั้นปี', 'ชื่อย่อสาขา', 'ชื่อเต็มสาขา', 'กลุ่ม'];

    const rows = dataToExport.map((s, idx) => {
      const yr = s.year || s.class_year;
      return activeTab === 'present'
        ? [
            idx + 1,
            `="${s.student_id}"`, // Force Excel string formatting
            s.prefix || '',
            s.first_name,
            s.last_name,
            s.level || 'ปวช',
            yr,
            s.major_code,
            s.major_name || '',
            s.room,
            formatTime(s.attended_at)
          ]
        : [
            idx + 1,
            `="${s.student_id}"`,
            s.prefix || '',
            s.first_name,
            s.last_name,
            s.level || 'ปวช',
            yr,
            s.major_code,
            s.major_name || '',
            s.room
          ];
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const fileLabel = selectedSessionId === 'all' 
      ? 'ทุกครั้ง' 
      : `ครั้งที่_${selectedSession ? selectedSession.week_number : ''}`;
    link.setAttribute("download", `รายงาน_${activeTab === 'present' ? 'คนเข้ากิจกรรม' : 'คนไม่เข้ากิจกรรม'}_${fileLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Radial progress gauge calculations
  const radialRadius = 35;
  const radialCircumference = 2 * Math.PI * radialRadius;
  const rate = Math.min(stats?.attendanceRate || 0, 100);
  const radialOffset = radialCircumference - (rate / 100) * radialCircumference;

  // Donut chart parameters
  const totalExpected = stats?.totalExpected || 0;
  const presentPercent = Math.min(totalExpected > 0 ? ((stats?.totalPresent || 0) / totalExpected) * 100 : 0, 100);

  // Average weekly calculations for All Weeks
  const numWeeks = sessions.length || 1;
  const uniqueExpected = Math.round(totalExpected / numWeeks);
  const avgPresent = Math.round((stats?.totalPresent || 0) / numWeeks);
  const avgAbsent = Math.round((stats?.totalAbsent || 0) / numWeeks);

  if (loading && !stats) {
    return (
      <div className="w-full h-96 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted text-sm font-semibold">กำลังโหลดข้อมูลและสถิติระบบ...</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-semibold text-ink tracking-tight flex items-center space-x-2">
            <Clock className="w-8 h-8 text-primary" />
            <span>ภาพรวมและสถิติเช็กชื่อ</span>
          </h1>
          <p className="text-muted text-sm md:text-base mt-2">
            ตรวจสอบอัตราการเข้าร่วมกิจกรรมครั้งปัจจุบัน วิเคราะห์แนวโน้ม ค้นหาและคัดกรองข้อมูลอย่างละเอียด
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <div className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${
            isSheetsConnected 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isSheetsConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            <span>Google Sheet: {isSheetsConnected ? 'เชื่อมต่อแล้ว' : 'ไม่ได้เชื่อมต่อ'}</span>
          </div>
        </div>
      </div>

      {/* 🔍 ระบบตรวจสอบการเช็กชื่อรายบุคคล */}
      <div className="bg-canvas border border-hairline rounded-lg p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-ink flex items-center space-x-2">
          <Search size={16} className="text-primary" />
          <span>ตรวจสอบประวัติการเช็กชื่อนักศึกษารายบุคคล</span>
        </h3>
        <form onSubmit={handleSearchStudent} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-grow">
            <input 
              type="text" 
              value={searchStudentId}
              onChange={e => setSearchStudentId(e.target.value)}
              className="w-full h-11 border border-hairline rounded-md px-3.5 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
              placeholder="กรอกรหัสนักศึกษา 11 หลัก เช่น 64012345678" 
            />
          </div>
          <button 
            type="submit" 
            className="h-11 bg-primary hover:bg-primary-active text-white px-6 rounded-md text-sm font-semibold flex items-center justify-center space-x-2 transition-all active:scale-98 cursor-pointer"
          >
            <Search size={15} />
            <span>ตรวจสอบสถิติ</span>
          </button>
        </form>
      </div>

      {/* Advanced Filter Controls */}
      <div className="bg-canvas border border-hairline rounded-lg p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-hairline pb-2">
          {/* Tabs Navigation */}
          <div className="flex space-x-4">
            <button
              type="button"
              onClick={() => setFilterTab('filter')}
              className={`text-xs font-bold uppercase tracking-wider pb-2 border-b-2 transition-all cursor-pointer select-none ${
                filterTab === 'filter'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              ตัวกรองและเลือกกลุ่มข้อมูล
            </button>
            
            <button
              type="button"
              onClick={() => setFilterTab('exclude')}
              className={`text-xs font-bold uppercase tracking-wider pb-2 border-b-2 transition-all cursor-pointer select-none flex items-center space-x-1.5 ${
                filterTab === 'exclude'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              <span>ยกเว้นเฉพาะเจาะจง</span>
              {excludedGroups.length > 0 && (
                <span className="bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none">
                  {excludedGroups.length}
                </span>
              )}
            </button>
          </div>

          {(level || classYear || majorCode || room || gender || excludeLevel || excludeClassYear || excludeMajorCode || excludeRoom || excludeGender || excludedGroups.length > 0) && (
            <button 
              onClick={handleClearFilters}
              className="text-xs font-bold text-primary hover:text-primary-active flex items-center space-x-1 transition-colors cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>ล้างตัวกรอง</span>
            </button>
          )}
        </div>
        
        {/* Tab 1: Dropdown Filters */}
        {filterTab === 'filter' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 animation-fade-in">
            {/* Week Selector */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">ครั้งที่กิจกรรม</label>
              <select
                value={selectedSessionId}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'all') {
                    setSelectedSessionId('all');
                  } else {
                    setSelectedSessionId(val ? Number(val) : '');
                  }
                }}
                className="w-full h-9 border border-hairline rounded-md px-2 text-xs bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="all">ทุกครั้ง (All Weeks)</option>
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    ครั้งที่ {s.week_number} • {s.title}
                  </option>
                ))}
                {sessions.length === 0 && <option value="">ไม่มีคาบกิจกรรมในระบบ</option>}
              </select>
            </div>

            {/* Level Selector */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">ระดับชั้น</label>
              <select
                value={level}
                onChange={e => {
                  setLevel(e.target.value);
                  if (!e.target.value) setExcludeLevel(false);
                }}
                className="w-full h-9 border border-hairline rounded-md px-2 text-xs bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="">ทั้งหมด</option>
                {availableLevels.map(lvl => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>
              {level && (
                <label className="flex items-center space-x-1 mt-0.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={excludeLevel}
                    onChange={e => setExcludeLevel(e.target.checked)}
                    className="rounded border-hairline text-primary focus:ring-primary w-3 h-3 accent-emerald-500"
                  />
                  <span className="text-[10px] font-semibold text-rose-500 hover:text-rose-600 transition-colors">ยกเว้นระดับชั้นนี้</span>
                </label>
              )}
            </div>

            {/* Class Year */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">ชั้นปี</label>
              <select
                value={classYear}
                onChange={e => {
                  setClassYear(e.target.value);
                  if (!e.target.value) setExcludeClassYear(false);
                }}
                className="w-full h-9 border border-hairline rounded-md px-2 text-xs bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="">ทั้งหมด</option>
                {availableYears.map(year => (
                  <option key={year} value={year}>ปี {year}</option>
                ))}
              </select>
              {classYear && (
                <label className="flex items-center space-x-1 mt-0.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={excludeClassYear}
                    onChange={e => setExcludeClassYear(e.target.checked)}
                    className="rounded border-hairline text-primary focus:ring-primary w-3 h-3 accent-emerald-500"
                  />
                  <span className="text-[10px] font-semibold text-rose-500 hover:text-rose-600 transition-colors">ยกเว้นชั้นปีนี้</span>
                </label>
              )}
            </div>

            {/* Major Code */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">สาขาวิชา</label>
              <select
                value={majorCode}
                onChange={e => {
                  setMajorCode(e.target.value);
                  if (!e.target.value) setExcludeMajorCode(false);
                }}
                className="w-full h-9 border border-hairline rounded-md px-2 text-xs bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer uppercase"
              >
                <option value="">ทั้งหมด</option>
                {availableMajors.map(major => (
                  <option key={major} value={major}>{major}</option>
                ))}
              </select>
              {majorCode && (
                <label className="flex items-center space-x-1 mt-0.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={excludeMajorCode}
                    onChange={e => setExcludeMajorCode(e.target.checked)}
                    className="rounded border-hairline text-primary focus:ring-primary w-3 h-3 accent-emerald-500"
                  />
                  <span className="text-[10px] font-semibold text-rose-500 hover:text-rose-600 transition-colors">ยกเว้นสาขาวิชานี้</span>
                </label>
              )}
            </div>

            {/* Room Selector */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">กลุ่มเรียน (ห้อง)</label>
              <select
                value={room}
                onChange={e => {
                  setRoom(e.target.value);
                  if (!e.target.value) setExcludeRoom(false);
                }}
                className="w-full h-9 border border-hairline rounded-md px-2 text-xs bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="">ทั้งหมด</option>
                {availableRooms.map(r => (
                  <option key={r} value={r}>กลุ่ม {r}</option>
                ))}
              </select>
              {room && (
                <label className="flex items-center space-x-1 mt-0.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={excludeRoom}
                    onChange={e => setExcludeRoom(e.target.checked)}
                    className="rounded border-hairline text-primary focus:ring-primary w-3 h-3 accent-emerald-500"
                  />
                  <span className="text-[10px] font-semibold text-rose-500 hover:text-rose-600 transition-colors">ยกเว้นห้องเรียนนี้</span>
                </label>
              )}
            </div>

            {/* Gender Selector */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">เพศ</label>
              <select
                value={gender}
                onChange={e => {
                  setGender(e.target.value);
                  if (!e.target.value) setExcludeGender(false);
                }}
                className="w-full h-9 border border-hairline rounded-md px-2 text-xs bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="">ทั้งหมด</option>
                <option value="male">ชาย (นาย)</option>
                <option value="female">หญิง (นางสาว)</option>
              </select>
              {gender && (
                <label className="flex items-center space-x-1 mt-0.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={excludeGender}
                    onChange={e => setExcludeGender(e.target.checked)}
                    className="rounded border-hairline text-primary focus:ring-primary w-3 h-3 accent-emerald-500"
                  />
                  <span className="text-[10px] font-semibold text-rose-500 hover:text-rose-600 transition-colors">ยกเว้นเพศนี้</span>
                </label>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Specific Room Exclusions (Badges) */}
        {filterTab === 'exclude' && stats?.allGroups && stats.allGroups.length > 0 && (
          <div className="space-y-3 animation-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-ink uppercase tracking-wider">
                ยกเว้นกลุ่มเรียนรายห้องเรียนเฉพาะเจาะจง (Exclude Specific Class Rooms)
              </span>
              <span className="text-[9px] text-muted font-medium">
                คลิกกลุ่มเรียนเพื่อยกเว้น/ดึงกลับ (สีแดง/ขอบแดง = ถูกยกเว้นออกจากการคำนวณ)
              </span>
            </div>
            
            {/* Group by Level: ปวช and ปวส */}
            <div className="space-y-2.5">
              {['ปวช', 'ปวส'].map((lvl: string) => {
                const groupsInLvl = stats.allGroups!.filter((g: { code: string; label: string; level: string }) => g.level === lvl);
                if (groupsInLvl.length === 0) return null;
                
                return (
                  <div key={lvl} className="flex flex-wrap items-start sm:items-center gap-1.5">
                    <span className="text-[10px] font-bold text-muted w-10 shrink-0">{lvl}:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {groupsInLvl.map((group: { code: string; label: string; level: string }) => {
                        const isExcluded = excludedGroups.includes(group.code);
                        return (
                          <button
                            key={group.code}
                            type="button"
                            onClick={() => toggleGroupExclusion(group.code)}
                            className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full border transition-all cursor-pointer select-none ${
                              isExcluded 
                                ? 'bg-red-50 dark:bg-rose-950/20 border-red-200 dark:border-rose-900/50 text-red-600 dark:text-rose-400 hover:bg-red-100 dark:hover:bg-rose-950/45 shadow-sm'
                                : 'bg-canvas border-hairline text-muted hover:bg-canvas-subtle hover:text-ink'
                            }`}
                          >
                            {group.code}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* KPI Cards & Radial Progress */}
      {stats && (
        <>
        {/* All-weeks mode info banner */}
        {selectedSessionId === 'all' && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
              <span className="font-bold">โหมดภาพรวมทุกครั้ง:</span>{' '}
              ตัวเลขที่แสดงคือ <span className="font-semibold">ยอดสะสม (คน × ครั้ง)</span> ไม่ใช่จำนวนนักศึกษาจริง{' '}
              เช่น 35 คน × {sessions.length} ครั้ง = {35 * sessions.length} คน-ครั้ง ·{' '}
              ดูค่า <span className="font-semibold">"เฉลี่ยต่อครั้ง"</span> เพื่อเปรียบเทียบจำนวนคนต่อคาบ
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 items-stretch">
          {/* Radial Attendance Circle Card */}
          <div className="bg-canvas border border-hairline rounded-lg p-5 flex items-center justify-between shadow-sm transition-all hover:shadow-md">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted block">อัตราการเข้าเรียน</span>
              <div className="text-3xl font-extrabold text-ink">{stats.attendanceRate}%</div>
              <div className="text-[11px] text-muted-soft">
                {selectedSessionId === 'all' ? 'สะสมจากทุกคาบกิจกรรม' : 'ของนักเรียนทั้งหมดตามตัวกรอง'}
              </div>
            </div>
            
            <div className="relative w-24 h-24 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r={radialRadius}
                  className="stroke-surface-strong fill-none"
                  strokeWidth="8"
                />
                <circle
                  cx="48"
                  cy="48"
                  r={radialRadius}
                  className="stroke-primary fill-none transition-all duration-500 ease-out"
                  strokeWidth="8"
                  strokeDasharray={radialCircumference}
                  strokeDashoffset={radialOffset}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute font-bold text-sm text-ink">{stats.attendanceRate}%</div>
            </div>
          </div>

          {/* Metric Summary Card: Present / Absent */}
          <div className="bg-canvas border border-hairline rounded-lg p-5 flex flex-col justify-between shadow-sm transition-all hover:shadow-md">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                {selectedSessionId === 'all' ? 'เฉลี่ยต่อครั้ง' : 'สรุปจำนวนผู้เข้าร่วม'}
              </span>
              <span className="p-1.5 bg-success/10 text-success rounded-full"><UserCheck size={14} /></span>
            </div>
            
            <div className="grid grid-cols-3 gap-2 mt-4 pt-2">
              {/* Present */}
              <div className="text-center border-r border-hairline">
                <div className="text-xl font-extrabold text-success">
                  {selectedSessionId === 'all' ? avgPresent : stats.totalPresent}
                </div>
                <div className="text-[10px] text-muted-soft uppercase font-bold">เข้ากิจกรรม (คน)</div>
                {selectedSessionId === 'all' && (
                  <div className="text-[9px] text-muted-soft mt-0.5">
                    รวม {stats.totalPresent} คน-ครั้ง
                  </div>
                )}
              </div>
              {/* Absent */}
              <div className="text-center border-r border-hairline">
                <div className="text-xl font-extrabold text-error">
                  {selectedSessionId === 'all' ? avgAbsent : stats.totalAbsent}
                </div>
                <div className="text-[10px] text-muted-soft uppercase font-bold">ไม่เข้ากิจกรรม (คน)</div>
                {selectedSessionId === 'all' && (
                  <div className="text-[9px] text-muted-soft mt-0.5">
                    รวม {stats.totalAbsent} คน-ครั้ง
                  </div>
                )}
              </div>
              {/* Total */}
              <div className="text-center">
                <div className="text-xl font-extrabold text-ink">
                  {selectedSessionId === 'all' ? uniqueExpected : stats.totalExpected}
                </div>
                <div className="text-[10px] text-muted-soft uppercase font-bold">ทั้งหมด (คน)</div>
                {selectedSessionId === 'all' && (
                  <div className="text-[9px] text-muted-soft mt-0.5">
                    รวม {stats.totalExpected} คน-ครั้ง
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active Session details */}
          <div className="bg-canvas border border-hairline rounded-lg p-5 flex flex-col justify-between shadow-sm transition-all hover:shadow-md">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">คาบกิจกรรมเรียน</span>
              <span className="p-1.5 bg-primary/10 text-primary rounded-full"><Calendar size={14} /></span>
            </div>
            
            <div className="space-y-1.5 mt-3">
              <div className="text-sm font-bold text-ink truncate">
                {selectedSessionId === 'all' 
                  ? 'ทุกครั้งรวมกัน' 
                  : `ครั้งที่ ${selectedSession ? selectedSession.week_number : '-'} • ${selectedSession ? selectedSession.title : '-'}`}
              </div>
              <div className="text-xs text-muted-soft flex items-center space-x-1">
                <span>
                  {selectedSessionId === 'all' 
                    ? `คาบกิจกรรมเรียนทั้งหมด: ${sessions.length} คาบ` 
                    : `วันที่: ${selectedSession ? new Date(selectedSession.date).toLocaleDateString('th-TH') : '-'}`}
                </span>
              </div>
              <div className="text-[10px] inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full font-bold uppercase bg-surface-soft border border-hairline text-ink">
                <span>
                  สถานะ: {selectedSessionId === 'all' 
                    ? 'สถิติสะสมภาพรวม' 
                    : (selectedSession?.is_active === 1 ? 'เปิดเช็กชื่อ' : 'ปิดเช็กชื่อ')}
                </span>
              </div>
            </div>
          </div>

          {/* Gender Comparison Card */}
          <div className="bg-canvas border border-hairline rounded-lg p-5 flex flex-col justify-between shadow-sm transition-all hover:shadow-md">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">เปรียบเทียบตามเพศ</span>
              <span className="text-[10px] font-semibold text-muted-soft bg-surface-soft px-1.5 py-0.5 rounded border border-hairline">เข้ากิจกรรม %</span>
            </div>

            {stats.genderStats ? (
              <div className="space-y-2.5 mt-2">
                {/* Male Stats */}
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-primary flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-primary block"></span>
                      <span>ชาย</span>
                    </span>
                    <span className="text-ink">{stats.genderStats.male.rate}% ({stats.genderStats.male.present}/{stats.genderStats.male.expected})</span>
                  </div>
                  <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-primary h-full transition-all duration-500 ease-out" 
                      style={{ width: `${stats.genderStats.male.rate}%` }}
                    ></div>
                  </div>
                </div>

                {/* Female Stats */}
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-accent flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-[#f472b6] block"></span>
                      <span>หญิง</span>
                    </span>
                    <span className="text-ink">{stats.genderStats.female.rate}% ({stats.genderStats.female.present}/{stats.genderStats.female.expected})</span>
                  </div>
                  <div className="w-full bg-surface-strong rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-[#f472b6] h-full transition-all duration-500 ease-out" 
                      style={{ width: `${stats.genderStats.female.rate}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-soft text-center py-2">ไม่มีข้อมูลสถิติเพศ</div>
            )}
          </div>
        </div>
        </>
      )}


      {/* Message Banners */}
      {message && (
        <div className="flex items-center space-x-2.5 p-4 rounded-md bg-success/15 border border-success/30 text-success text-sm font-semibold animate-in fade-in duration-200">
          <Check size={16} />
          <span>{message}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center space-x-2.5 p-4 rounded-md bg-error/15 border border-error/30 text-error text-sm font-semibold animate-in fade-in duration-200">
          <ShieldAlert size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Charts Section - 4 Interactive Native SVG Charts */}
      {stats && (
        <div className="space-y-8">
          
          {/* Row 1: Merged Trend + Compare Chart & Donut Chart */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            
            {/* Chart 1: Merged — Weekly Trend + เข้า vs ขาด % */}
            <div className={`${expandedRow1 === 1 ? 'xl:col-span-2' : expandedRow1 === 2 ? 'hidden' : ''} bg-canvas border border-hairline rounded-lg p-5 shadow-sm space-y-4 transition-all hover:shadow-md`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-hairline pb-3 gap-2 sm:gap-3">
                <h3 className="text-sm font-bold text-ink flex items-center space-x-2 shrink-0">
                  <TrendingUp size={16} className="text-primary" />
                  <span>แนวโน้มและการเปรียบเทียบการเข้า–ขาดรายคาบ</span>
                </h3>
                <div className="flex items-center gap-2 min-w-0 sm:justify-end">
                  {/* Trend limit slider */}
                  <span className="text-[10px] text-muted whitespace-nowrap">ย้อนหลัง</span>
                  <input
                    id="trend-limit-slider"
                    type="range"
                    min={2}
                    max={Math.max(2, stats?.weeklyTrend.length ?? 2)}
                    value={Math.max(2, Math.min(trendLimit, stats?.weeklyTrend.length ?? 2))}
                    onChange={e => { setTrendLimit(Number(e.target.value)); }}
                    className="flex-1 sm:flex-initial w-full sm:w-24 accent-primary cursor-pointer"
                    style={{ height: '4px' }}
                  />
                  <span className="text-[11px] font-bold text-primary whitespace-nowrap font-mono">
                    {trendLimit >= (stats?.weeklyTrend.length ?? 1)
                      ? `ทั้งหมด (${stats?.weeklyTrend.length ?? 0})`
                      : `${trendLimit} คาบ`}
                  </span>
                  {/* Expand/collapse button */}
                  <button
                    onClick={() => setExpandedRow1(expandedRow1 === 1 ? null : 1)}
                    title={expandedRow1 === 1 ? 'ย่อกราฟ' : 'ขยายกราฟ'}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md border border-hairline hover:bg-surface-soft text-muted hover:text-ink transition-colors cursor-pointer"
                  >
                    {expandedRow1 === 1 ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  </button>
                </div>
              </div>
              
              {stats.weeklyTrend.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-muted-soft">ยังไม่มีสถิติสำหรับสร้างกราฟแสดงแนวโน้ม</div>
              ) : (() => {
                const sliced = stats.weeklyTrend.slice(-Math.min(trendLimit, stats.weeklyTrend.length));
                const chartData = sliced.map((t, idx) => ({
                  name: `W${t.weekNumber}`,
                  rate: Math.round(t.rate * 10) / 10,
                  เข้า: Math.round(t.rate * 10) / 10,
                  ขาด: Math.round((100 - t.rate) * 10) / 10,
                  title: t.title,
                  weekNumber: t.weekNumber,
                  delta: idx > 0 ? Math.round((t.rate - sliced[idx - 1].rate) * 10) / 10 : null,
                }));
                const avgRate = chartData.length > 0
                  ? Math.round((chartData.reduce((s, d) => s + d.rate, 0) / chartData.length) * 10) / 10
                  : 0;

                const MergedTooltip = ({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="recharts-custom-tooltip">
                      <div className="tooltip-label">ครั้งที่ {d?.weekNumber} — {d?.title}</div>
                      <div className="tooltip-row">
                        <span className="tooltip-dot" style={{ backgroundColor: '#111111' }} />
                        <span className="tooltip-name">อัตราเข้ากิจกรรม</span>
                        <span className="tooltip-value">{d?.rate}%</span>
                      </div>
                      {d?.delta !== null && (
                        <div className="tooltip-row" style={{ marginTop: 2 }}>
                          <span className="tooltip-dot" style={{ backgroundColor: d.delta > 0 ? '#10B981' : d.delta < 0 ? '#EF4444' : '#6B7280' }} />
                          <span className="tooltip-name">เทียบคาบก่อน</span>
                          <span className="tooltip-value" style={{ color: d.delta > 0 ? '#10B981' : d.delta < 0 ? '#EF4444' : '#6B7280' }}>
                            {d.delta > 0 ? '▲ +' : d.delta < 0 ? '▼ ' : '±'}{d.delta}%
                          </span>
                        </div>
                      )}
                      <div style={{ borderTop: '1px solid var(--color-hairline)', marginTop: 6, paddingTop: 6 }}>
                        <div className="tooltip-row">
                          <span className="tooltip-dot" style={{ backgroundColor: '#10B981' }} />
                          <span className="tooltip-name">เข้ากิจกรรม</span>
                          <span className="tooltip-value" style={{ color: '#10B981' }}>{d?.เข้า}%</span>
                        </div>
                        <div className="tooltip-row">
                          <span className="tooltip-dot" style={{ backgroundColor: '#ef4444' }} />
                          <span className="tooltip-name">ขาดกิจกรรม</span>
                          <span className="tooltip-value" style={{ color: '#ef4444' }}>{d?.ขาด}%</span>
                        </div>
                        <div className="tooltip-row">
                          <span className="tooltip-name">ค่าเฉลี่ยรวม</span>
                          <span className="tooltip-value" style={{ color: '#6b7280' }}>{avgRate}%</span>
                        </div>
                      </div>
                    </div>
                  );
                };

                const CustomDot = (props: any) => {
                  const { cx, cy } = props;
                  return <circle cx={cx} cy={cy} r={5} fill="#ffffff" stroke="#111111" strokeWidth={2.5} />;
                };
                const ActiveDot = (props: any) => {
                  const { cx, cy } = props;
                  return (
                    <g>
                      <circle cx={cx} cy={cy} r={10} fill="#111111" fillOpacity={0.07} />
                      <circle cx={cx} cy={cy} r={6} fill="#ffffff" stroke="#111111" strokeWidth={2.5} />
                    </g>
                  );
                };

                return (
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 20, right: 16, left: 0, bottom: 24 }}>
                        <defs>
                          <linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#111111" stopOpacity={0.12} />
                            <stop offset="100%" stopColor="#111111" stopOpacity={0.01} />
                          </linearGradient>
                          <linearGradient id="mergedPresentGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10B981" stopOpacity={0.22} />
                            <stop offset="100%" stopColor="#10B981" stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="mergedAbsentGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.16} />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline)" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 9.5, fontWeight: 700, fill: '#6b7280', fontStyle: 'italic' }}
                          axisLine={false}
                          tickLine={false}
                          angle={-25}
                          textAnchor="end"
                          dy={6}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tickFormatter={v => `${v}%`}
                          tick={{ fontSize: 10, fontWeight: 600, fill: '#6b7280' }}
                          axisLine={false} tickLine={false} width={38}
                          ticks={[0, 25, 50, 75, 100]}
                        />
                        <Tooltip content={<MergedTooltip />} cursor={{ stroke: 'var(--color-hairline)', strokeWidth: 1.5 }} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingTop: 4 }} />
                        <ReferenceLine
                          y={avgRate}
                          stroke="#6b7280" strokeDasharray="5 4" strokeWidth={1.5}
                          label={{ value: `เฉลี่ย ${avgRate}%`, position: 'insideTopRight', fontSize: 10, fontWeight: 700, fill: '#6b7280', dy: -4 }}
                        />
                        {/* เส้นแนวโน้มหลัก */}
                        <Area
                          type="monotone"
                          dataKey="rate"
                          name="อัตราเข้ากิจกรรม"
                          stroke="#111111"
                          strokeWidth={1.8}
                          fill="url(#trendAreaGrad)"
                          dot={<CustomDot />}
                          activeDot={<ActiveDot />}
                          animationDuration={600}
                          animationEasing="ease-out"
                        />
                        {/* เส้น ขาด */}
                        <Area
                          type="monotone"
                          dataKey="ขาด"
                          stroke="#ef4444"
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          fill="url(#mergedAbsentGrad)"
                          dot={{ r: 3, fill: '#ffffff', stroke: '#ef4444', strokeWidth: 1.5 }}
                          activeDot={{ r: 5 }}
                          animationDuration={700}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}
            </div>



            {/* Chart 2: Single Donut Chart with Folder Tabs */}
            <div className={`${expandedRow1 === 2 ? 'xl:col-span-2' : expandedRow1 === 1 ? 'hidden' : ''} bg-canvas border border-hairline rounded-lg shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md`}>

              {/* Folder Tabs (Tab แบบแฟ้ม) */}
              <div className="flex border-b border-hairline bg-surface-soft/40 px-2 pt-2 gap-1 overflow-x-auto scrollbar-none items-center">
                <div className="flex gap-1 min-w-0 flex-1">
                <button
                  onClick={() => { setRatioTab('summary'); setHoveredPath(null); setHoveredSeg(null); }}
                  className={`px-2.5 py-2 text-[11px] font-bold rounded-t-lg border-t border-x transition-all flex items-center space-x-1 cursor-pointer -mb-px whitespace-nowrap ${
                    ratioTab === 'summary'
                      ? 'bg-canvas border-hairline text-primary border-t-2 border-t-primary font-extrabold shadow-sm'
                      : 'bg-transparent border-transparent text-muted hover:text-ink hover:bg-surface-soft'
                  }`}
                >
                  <PieChart size={13} />
                  <span>1. ภาพรวม</span>
                </button>
                <button
                  onClick={() => { setRatioTab('year'); setHoveredPath(null); setHoveredSeg(null); }}
                  className={`px-2.5 py-2 text-[11px] font-bold rounded-t-lg border-t border-x transition-all flex items-center space-x-1 cursor-pointer -mb-px whitespace-nowrap ${
                    ratioTab === 'year'
                      ? 'bg-canvas border-hairline text-primary border-t-2 border-t-primary font-extrabold shadow-sm'
                      : 'bg-transparent border-transparent text-muted hover:text-ink hover:bg-surface-soft'
                  }`}
                >
                  <GraduationCap size={13} />
                  <span>2. ชั้นปี</span>
                </button>
                <button
                  onClick={() => { setRatioTab('major'); setHoveredPath(null); setHoveredSeg(null); }}
                  className={`px-2.5 py-2 text-[11px] font-bold rounded-t-lg border-t border-x transition-all flex items-center space-x-1 cursor-pointer -mb-px whitespace-nowrap ${
                    ratioTab === 'major'
                      ? 'bg-canvas border-hairline text-primary border-t-2 border-t-primary font-extrabold shadow-sm'
                      : 'bg-transparent border-transparent text-muted hover:text-ink hover:bg-surface-soft'
                  }`}
                >
                  <Building size={13} />
                  <span>3. สาขา</span>
                </button>
                <button
                  onClick={() => { setRatioTab('room'); setHoveredPath(null); setHoveredSeg(null); }}
                  className={`px-2.5 py-2 text-[11px] font-bold rounded-t-lg border-t border-x transition-all flex items-center space-x-1 cursor-pointer -mb-px whitespace-nowrap ${
                    ratioTab === 'room'
                      ? 'bg-canvas border-hairline text-primary border-t-2 border-t-primary font-extrabold shadow-sm'
                      : 'bg-transparent border-transparent text-muted hover:text-ink hover:bg-surface-soft'
                  }`}
                >
                  <LayoutDashboard size={13} />
                  <span>4. กลุ่มเรียน</span>
                </button>
                <button
                  onClick={() => { setRatioTab('gender'); setHoveredPath(null); setHoveredSeg(null); }}
                  className={`px-2.5 py-2 text-[11px] font-bold rounded-t-lg border-t border-x transition-all flex items-center space-x-1 cursor-pointer -mb-px whitespace-nowrap ${
                    ratioTab === 'gender'
                      ? 'bg-canvas border-hairline text-primary border-t-2 border-t-primary font-extrabold shadow-sm'
                      : 'bg-transparent border-transparent text-muted hover:text-ink hover:bg-surface-soft'
                  }`}
                >
                  <Users size={13} />
                  <span>5. เพศ</span>
                </button>
                </div>
                {/* Expand/collapse button */}
                <button
                  onClick={() => setExpandedRow1(expandedRow1 === 2 ? null : 2)}
                  title={expandedRow1 === 2 ? 'ย่อกราฟ' : 'ขยายกราฟ'}
                  className="shrink-0 mr-2 mb-0.5 w-7 h-7 flex items-center justify-center rounded-md border border-hairline bg-canvas hover:bg-surface-soft text-muted hover:text-ink transition-colors cursor-pointer"
                >
                  {expandedRow1 === 2 ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </button>
              </div>

              <div className="p-5 flex-grow flex flex-col justify-between space-y-4">
                {totalExpected === 0 ? (
                  <div className="h-56 flex items-center justify-center text-xs text-muted-soft">ไม่มีรายชื่อที่จะแสดงสัดส่วน</div>
                ) : (
                  <div key={ratioTab} className="flex flex-col sm:flex-row items-center justify-around py-4 gap-6 tab-content-anim">
                    {/* The Single Donut Chart */}
                    {(() => {
                      const segments = getSegmentsForTab(ratioTab);
                      
                      return (
                        <div className="relative w-48 h-48 flex items-center justify-center flex-shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsPieChart>
                              <Pie
                                data={segments}
                                cx="50%"
                                cy="50%"
                                innerRadius={62}
                                outerRadius={80}
                                paddingAngle={1.5}
                                cornerRadius={4}
                                dataKey="value"
                                stroke="none"
                                animationDuration={700}
                                animationEasing="ease-out"
                              >
                                {segments.map((seg, idx) => {
                                  const pathKey = seg.path.join('-');
                                  const isHovered = hoveredPath !== null && pathKey === hoveredPath.join('-');
                                  return (
                                    <Cell
                                      key={`cell-${idx}`}
                                      fill={seg.color}
                                      style={{
                                        filter: isHovered ? 'drop-shadow(0px 2px 5px rgba(0,0,0,0.18))' : 'none',
                                        transition: 'all 0.25s ease',
                                        cursor: 'pointer',
                                        opacity: hoveredPath !== null && !isHovered ? 0.35 : 1
                                      }}
                                      onMouseEnter={() => {
                                        setHoveredPath(seg.path);
                                        setHoveredSeg({
                                          label: formatPathLabel(seg.path),
                                          value: seg.value,
                                          percentage: seg.percentage,
                                          color: seg.color
                                        });
                                      }}
                                      onMouseLeave={() => {
                                        setHoveredPath(null);
                                        setHoveredSeg(null);
                                      }}
                                    />
                                  );
                                })}
                              </Pie>
                            </RechartsPieChart>
                          </ResponsiveContainer>

                          {/* Center Details */}
                          <div className="absolute text-center select-none pointer-events-none px-4 w-full">
                            {hoveredSeg ? (
                              <div className="animate-in fade-in duration-100 flex flex-col items-center justify-center">
                                <div 
                                  className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full mb-1 text-white border shadow-xs text-center max-w-[120px] truncate"
                                  style={{ backgroundColor: hoveredSeg.color, borderColor: 'rgba(0,0,0,0.1)' }}
                                >
                                  {hoveredSeg.label.split(' (')[0]}
                                </div>
                                <div className="text-[8px] font-bold text-muted truncate max-w-[110px] leading-tight mb-0.5">
                                  {hoveredSeg.label.includes(' (') ? hoveredSeg.label.substring(hoveredSeg.label.indexOf('(')) : ''}
                                </div>
                                <div className="text-xl font-black text-ink leading-tight">
                                  {hoveredSeg.percentage}%
                                </div>
                                {selectedSessionId === 'all' ? (
                                  <div className="text-[7.5px] text-muted-soft font-bold leading-tight">
                                    <div>เฉลี่ย {Math.round(hoveredSeg.value / numWeeks)} จาก {uniqueExpected} คน</div>
                                    <div className="text-[6.5px] font-medium opacity-80">({numWeeks} ครั้ง: {hoveredSeg.value}/{totalExpected} คน-ครั้ง)</div>
                                  </div>
                                ) : (
                                  <div className="text-[8px] text-muted-soft font-semibold leading-normal">
                                    {hoveredSeg.value} จาก {totalExpected} คน
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <div className="text-[9px] font-bold text-muted uppercase">เข้ากิจกรรมรวม</div>
                                <div className="text-2xl font-black text-ink">{Math.round(presentPercent)}%</div>
                                {selectedSessionId === 'all' ? (
                                  <div className="text-[7.5px] text-muted-soft font-bold leading-tight">
                                    <div>เฉลี่ย {avgPresent} / {uniqueExpected} คน</div>
                                    <div className="text-[6.5px] font-medium opacity-80">({numWeeks} ครั้ง: {stats.totalPresent}/{totalExpected} คน-ครั้ง)</div>
                                  </div>
                                ) : (
                                  <div className="text-[9px] text-muted-soft font-semibold">{stats.totalPresent} / {totalExpected} คน</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Legends & Details list */}
                    <div className="flex-grow max-h-[220px] overflow-y-auto space-y-2 pr-1 py-1 w-full sm:max-w-[320px] scrollbar-thin">
                      {(() => {
                        const segments = getSegmentsForTab(ratioTab);
                        if (segments.length === 0) {
                          return <div className="text-center py-8 text-xs text-muted-soft">ไม่มีสถิติสำหรับกลุ่มนี้</div>;
                        }

                        return segments.map((seg) => {
                          const pathKey = seg.path.join('-');
                          const isHovered = hoveredPath !== null && pathKey === hoveredPath.join('-');

                          return (
                            <div
                              key={`${ratioTab}-${pathKey}`}
                              className={`p-2 rounded-md border transition-all duration-150 flex flex-col space-y-1 text-xs cursor-pointer ${
                                isHovered
                                  ? 'bg-surface-soft border-primary/20 scale-[1.01] shadow-sm font-semibold'
                                  : 'bg-transparent border-transparent hover:bg-surface-soft/40'
                              }`}
                              onMouseEnter={() => {
                                setHoveredPath(seg.path);
                                setHoveredSeg({
                                  label: formatPathLabel(seg.path),
                                  value: seg.value,
                                  percentage: seg.percentage,
                                  color: seg.color
                                });
                              }}
                              onMouseLeave={() => {
                                setHoveredPath(null);
                                setHoveredSeg(null);
                              }}
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform duration-200"
                                  style={{
                                    backgroundColor: seg.color,
                                    transform: isHovered ? 'scale(1.2)' : 'none'
                                  }}
                                ></span>
                                <span className="text-ink font-bold truncate">
                                  {formatPathLabel(seg.path)}
                                </span>
                              </div>
                              <div className="font-mono text-muted text-[10px] pl-[18px]">
                                {selectedSessionId === 'all' ? (
                                  <span>
                                    เฉลี่ย {Math.round(seg.value / numWeeks)}/{uniqueExpected} คน ({numWeeks} ครั้ง: {seg.value}/{totalExpected} คน-ครั้ง) ({seg.percentage}%)
                                  </span>
                                ) : (
                                  <span>
                                    {seg.value} จากทั้งหมด {totalExpected} คน ({seg.percentage}%)
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Room Bar Chart/Radar & Hourly Scan Time Chart */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            
            {/* Chart 3: Room-wise Attendance Chart (Bar / Radar combined) */}
            <div className={`${expandedRow2 === 3 ? 'xl:col-span-2' : expandedRow2 === 4 ? 'hidden' : ''} bg-canvas border border-hairline rounded-lg p-5 shadow-sm space-y-4 transition-all hover:shadow-md`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-hairline pb-3 gap-2">
                <div className="flex items-center space-x-3">
                  <Building size={16} className="text-primary" />
                  <h3 className="text-sm font-bold text-ink">
                    อัตราการเข้าเรียนแยกตามกลุ่มสาขาวิชา (%)
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {/* Tab Selector Buttons for Bar/Radar */}
                  {stats && stats.roomStats.length >= 2 && (
                    <div className="flex items-center gap-1 bg-surface-soft p-0.5 rounded-lg border border-hairline shrink-0">
                      <button
                        onClick={() => setRoomChartTab('bar')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                          roomChartTab === 'bar'
                            ? 'bg-canvas text-primary shadow-sm border border-hairline/50 font-black'
                            : 'text-muted hover:text-ink'
                        }`}
                      >
                        แท่ง
                      </button>
                      <button
                        onClick={() => setRoomChartTab('radar')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                          roomChartTab === 'radar'
                            ? 'bg-canvas text-primary shadow-sm border border-hairline/50 font-black'
                            : 'text-muted hover:text-ink'
                        }`}
                      >
                        เรดาร์
                      </button>
                    </div>
                  )}
                  {/* Expand/collapse button */}
                  <button
                    onClick={() => setExpandedRow2(expandedRow2 === 3 ? null : 3)}
                    title={expandedRow2 === 3 ? 'ย่อกราฟ' : 'ขยายกราฟ'}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md border border-hairline hover:bg-surface-soft text-muted hover:text-ink transition-colors cursor-pointer"
                  >
                    {expandedRow2 === 3 ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  </button>
                </div>
              </div>

              {stats.roomStats.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-muted-soft">ไม่มีสถิติแยกตามสาขาวิชาในกลุ่มข้อมูลนี้</div>
              ) : roomChartTab === 'radar' && stats.roomStats.length >= 2 ? (() => {
                  const radarData = stats.roomStats.map(r => ({
                    room: r.room,
                    อัตราเข้าเรียน: r.rate,
                  }));

                  const RadarTooltip = ({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0];
                    return (
                      <div className="recharts-custom-tooltip">
                        <div className="tooltip-label">กลุ่ม {d?.payload?.room}</div>
                        <div className="tooltip-row">
                          <span className="tooltip-dot" style={{ backgroundColor: '#111111' }} />
                          <span className="tooltip-name">อัตราเข้าเรียน</span>
                          <span className="tooltip-value">{d?.value}%</span>
                        </div>
                      </div>
                    );
                  };

                  return (
                    <div style={{ height: 260 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={radarData} margin={{ top: 8, right: 20, left: 20, bottom: 8 }}>
                          <PolarGrid stroke="var(--color-hairline)" />
                          <PolarAngleAxis
                            dataKey="room"
                            tick={{ fontSize: 11, fontWeight: 700, fill: '#374151' }}
                          />
                          <PolarRadiusAxis
                            angle={90}
                            domain={[0, 100]}
                            tickFormatter={v => `${v}%`}
                            tick={{ fontSize: 9, fill: '#9ca3af' }}
                            tickCount={5}
                          />
                          <Tooltip content={<RadarTooltip />} />
                          <Radar
                            name="อัตราเข้าเรียน"
                            dataKey="อัตราเข้าเรียน"
                            stroke="#111111"
                            strokeWidth={2.5}
                            fill="#111111"
                            fillOpacity={0.12}
                            animationDuration={700}
                            animationEasing="ease-out"
                            dot={{ r: 4, fill: '#ffffff', stroke: '#111111', strokeWidth: 2 }}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })() : (() => {
                const BAR_PALETTE = [
                  { fill: '#10B981', fillMuted: 'rgba(16,185,129,0.12)', grad: ['#10B981','#059669'] },
                  { fill: '#3b82f6', fillMuted: 'rgba(59,130,246,0.12)', grad: ['#3b82f6','#2563eb'] },
                  { fill: '#8b5cf6', fillMuted: 'rgba(139,92,246,0.12)', grad: ['#8b5cf6','#7c3aed'] },
                  { fill: '#f59e0b', fillMuted: 'rgba(245,158,11,0.12)',  grad: ['#f59e0b','#d97706'] },
                  { fill: '#ec4899', fillMuted: 'rgba(236,72,153,0.12)',  grad: ['#ec4899','#db2777'] },
                  { fill: '#06b6d4', fillMuted: 'rgba(6,182,212,0.12)',   grad: ['#06b6d4','#0891b2'] },
                  { fill: '#f97316', fillMuted: 'rgba(249,115,22,0.12)',  grad: ['#f97316','#ea580c'] },
                  { fill: '#6366f1', fillMuted: 'rgba(99,102,241,0.12)',  grad: ['#6366f1','#4f46e5'] },
                ];

                const chartData = stats.roomStats.map((r, idx) => ({
                  ...r,
                  colorIdx: idx % BAR_PALETTE.length,
                  fill: BAR_PALETTE[idx % BAR_PALETTE.length].fill,
                }));

                const RoomTooltip = ({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as RoomStat & { fill: string };
                  const ratioOfPresent = stats.totalPresent > 0
                    ? Math.round((d.present / stats.totalPresent) * 100) : 0;
                  return (
                    <div className="recharts-custom-tooltip">
                      <div className="tooltip-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: d.fill, flexShrink: 0, display: 'inline-block' }} />
                        กลุ่มเรียน: {d.room}
                      </div>
                      <div className="tooltip-row">
                        <span className="tooltip-name">เข้าเรียนแล้ว</span>
                        <span className="tooltip-value" style={{ color: '#10B981' }}>{d.present} {selectedSessionId === 'all' ? 'คน-ครั้ง' : 'คน'}</span>
                      </div>
                      <div className="tooltip-row">
                        <span className="tooltip-name">ไม่เข้ากิจกรรม</span>
                        <span className="tooltip-value" style={{ color: '#EF4444' }}>{d.absent} {selectedSessionId === 'all' ? 'คน-ครั้ง' : 'คน'}</span>
                      </div>
                      <div className="tooltip-row">
                        <span className="tooltip-name">ในบัญชีรายชื่อ</span>
                        <span className="tooltip-value">{d.expected} {selectedSessionId === 'all' ? 'คน-ครั้ง' : 'คน'}</span>
                      </div>
                      <div className="tooltip-row" style={{ paddingTop: 6, borderTop: '1px solid var(--color-hairline)', marginTop: 4 }}>
                        <span className="tooltip-name">สัดส่วนในกลุ่มผู้เรียน</span>
                        <span className="tooltip-value" style={{ color: d.fill }}>{ratioOfPresent}%</span>
                      </div>
                    </div>
                  );
                };

                return (
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 24, right: 12, left: 0, bottom: 32 }}>
                        <defs>
                          {BAR_PALETTE.map((p, i) => (
                            <linearGradient key={i} id={`roomGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={p.grad[0]} stopOpacity={0.95} />
                              <stop offset="100%" stopColor={p.grad[1]} stopOpacity={0.75} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline)" vertical={false} />
                        <XAxis
                          dataKey="room"
                          tick={{ fontSize: 11, fontWeight: 700, fill: '#6b7280' }}
                          axisLine={false}
                          tickLine={false}
                          angle={-25}
                          textAnchor="end"
                          dy={4}
                          interval={0}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tickFormatter={v => `${v}%`}
                          tick={{ fontSize: 10, fontWeight: 600, fill: '#6b7280' }}
                          axisLine={false}
                          tickLine={false}
                          width={38}
                          ticks={[0, 25, 50, 75, 100]}
                        />
                        <Tooltip content={<RoomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                        <ReferenceLine y={80} stroke="#10B981" strokeDasharray="4 3" strokeWidth={1} label={{ value: '80%', position: 'insideTopRight', fontSize: 9, fill: '#10B981', dy: -4 }} />
                        <Bar
                          dataKey="rate"
                          radius={[5, 5, 0, 0]}
                          maxBarSize={52}
                          animationDuration={700}
                          animationEasing="ease-out"
                        >
                          <LabelList
                            dataKey="rate"
                            position="top"
                            formatter={(v: any) => `${v}%`}
                            style={{ fontSize: 10, fontWeight: 800, fill: '#374151' }}
                          />
                          {chartData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={`url(#roomGrad${entry.colorIdx})`} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}
            </div>

            {/* Chart 4: Hourly Scan Peak Distribution Bar Chart */}
            <div className={`${expandedRow2 === 4 ? 'xl:col-span-2' : expandedRow2 === 3 ? 'hidden' : ''} bg-canvas border border-hairline rounded-lg p-5 shadow-sm space-y-4 transition-all hover:shadow-md`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-hairline pb-3 gap-2">
                <h3 className="text-sm font-bold text-ink flex items-center space-x-2 shrink-0">
                  <Clock size={16} className="text-primary" />
                  <span>ช่วงเวลาที่มีการเช็กชื่อสแกนมากที่สุด (ทุกๆ {scanVolume} นาที)</span>
                </h3>
                <div className="flex items-center gap-2 min-w-0 sm:justify-end">
                  {/* Volume Selector Buttons */}
                  <div className="flex items-center gap-1 bg-surface-soft p-0.5 rounded-lg border border-hairline shrink-0">
                    {[3, 5, 15, 30, 60].map(v => (
                      <button
                        key={v}
                        onClick={() => {
                          setScanVolume(v);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                          scanVolume === v 
                            ? 'bg-canvas text-primary shadow-sm border border-hairline/50 font-black' 
                            : 'text-muted hover:text-ink'
                        }`}
                      >
                        {v}m
                      </button>
                    ))}
                  </div>
                  {/* Expand/collapse button */}
                  <button
                    onClick={() => setExpandedRow2(expandedRow2 === 4 ? null : 4)}
                    title={expandedRow2 === 4 ? 'ย่อกราฟ' : 'ขยายกราฟ'}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md border border-hairline hover:bg-surface-soft text-muted hover:text-ink transition-colors cursor-pointer"
                  >
                    {expandedRow2 === 4 ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  </button>
                </div>
              </div>

              {(() => {
                const aggregatedDistribution = getAggregatedScanDistribution(stats.scanDistribution, scanVolume);
                
                if (aggregatedDistribution.length === 0) {
                  return <div className="h-56 flex items-center justify-center text-xs text-muted-soft">ยังไม่มีสถิติช่วงเวลาสแกนในคาบนี้</div>;
                }

                const maxCount = Math.max(...aggregatedDistribution.map(d => d.count), 1);
                const avgCount = Math.round(aggregatedDistribution.reduce((s, d) => s + d.count, 0) / aggregatedDistribution.length);
                const chartData = aggregatedDistribution.map(d => ({
                  ...d,
                  shortTime: d.time.split(' - ')[0],
                  isPeak: d.count === maxCount,
                }));

                const ScanTooltip = ({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  const pct = maxCount > 0 ? Math.round((d.count / maxCount) * 100) : 0;
                  return (
                    <div className="recharts-custom-tooltip">
                      <div className="tooltip-label">⏱ {d?.time}</div>
                      <div className="tooltip-row">
                        <span className="tooltip-dot" style={{ backgroundColor: d?.isPeak ? '#ef4444' : '#3b82f6' }} />
                        <span className="tooltip-name">เช็กชื่อเข้าเรียน</span>
                        <span className="tooltip-value">{d?.count} {selectedSessionId === 'all' ? 'คน-ครั้ง' : 'คน'}</span>
                      </div>
                      <div className="tooltip-row">
                        <span className="tooltip-name">เทียบค่าสูงสุด</span>
                        <span className="tooltip-value" style={{ color: d?.isPeak ? '#ef4444' : '#6b7280' }}>{pct}%</span>
                      </div>
                      {d?.isPeak && (
                        <div style={{ marginTop: 4, fontSize: 10, color: '#ef4444', fontWeight: 700 }}>⚡ ช่วงที่พลุกพล่านที่สุด</div>
                      )}
                    </div>
                  );
                };

                return (
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 24, right: 12, left: 0, bottom: 36 }}>
                        <defs>
                          <linearGradient id="scanBarNormal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#2563eb" stopOpacity={0.65} />
                          </linearGradient>
                          <linearGradient id="scanBarPeak" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#dc2626" stopOpacity={0.75} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline)" vertical={false} />
                        <XAxis
                          dataKey="shortTime"
                          tick={{ fontSize: 9, fontWeight: 700, fill: '#6b7280', fontStyle: 'italic' }}
                          axisLine={false}
                          tickLine={false}
                          angle={-35}
                          textAnchor="end"
                          dy={4}
                          interval={0}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fontWeight: 600, fill: '#6b7280' }}
                          axisLine={false}
                          tickLine={false}
                          width={32}
                          allowDecimals={false}
                        />
                        <Tooltip content={<ScanTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                        <ReferenceLine
                          y={avgCount}
                          stroke="#6b7280"
                          strokeDasharray="4 3"
                          strokeWidth={1.5}
                          label={{ value: `เฉลี่ย ${avgCount}`, position: 'insideTopRight', fontSize: 9, fill: '#6b7280', dy: -4 }}
                        />
                        <Bar
                          dataKey="count"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={40}
                          animationDuration={700}
                          animationEasing="ease-out"
                        >
                          <LabelList
                            dataKey="count"
                            position="top"
                            style={{ fontSize: 9, fontWeight: 800, fill: '#374151' }}
                          />
                          {chartData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={entry.isPeak ? 'url(#scanBarPeak)' : 'url(#scanBarNormal)'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}
            </div>

          </div>

          {/* Row 2.5: Interactive Attendance Location Heatmap Map */}
          {stats && (
            <div className="bg-canvas border border-hairline rounded-lg p-5 shadow-sm space-y-4 transition-all hover:shadow-md mt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-hairline pb-3 gap-2">
                <div className="flex items-center space-x-2">
                  <MapPin size={16} className="text-primary" />
                  <h3 className="text-sm font-bold text-ink flex items-center space-x-1.5">
                    <span>แผนผังความหนาแน่นจุดเช็กชื่อเข้าเรียน (Location Heatmap Grid)</span>
                  </h3>
                </div>
                {/* Resolution controls */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted whitespace-nowrap">ความละเอียดตาราง</span>
                  <div className="flex items-center gap-1 bg-surface-soft p-0.5 rounded-lg border border-hairline shrink-0">
                    {([5, 10, 50, 100, 150] as const).map(res => (
                      <button
                        key={res}
                        type="button"
                        onClick={() => setMapResolution(res)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                          mapResolution === res 
                            ? 'bg-canvas text-primary shadow-sm border border-hairline/50 font-black' 
                            : 'text-muted hover:text-ink'
                        }`}
                      >
                        {res}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <AttendanceMap 
                presentList={stats.presentList} 
                sessionLocation={(() => {
                  const targetId = selectedSessionId === '' ? stats.selectedSessionId : selectedSessionId;
                  const activeSession = sessions.find(s => s.id === (targetId === 'all' ? null : Number(targetId)));
                  return activeSession || null;
                })()}
                resolution={mapResolution}
              />
            </div>
          )}
        </div>
      )}

      {/* Present vs Absent Lists */}
      {stats && (
        <div className="bg-canvas border border-hairline rounded-lg overflow-hidden shadow-sm transition-all hover:shadow-md">
          {/* Tabs header */}
          <div className="border-b border-hairline bg-surface-soft px-4 sm:px-6 py-3 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="flex space-x-1.5 p-0.5 bg-surface-strong/30 rounded-lg self-start">
              <button
                onClick={() => setActiveTab('present')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  activeTab === 'present'
                    ? 'bg-canvas text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                เช็กชื่อแล้ว ({stats.totalPresent})
              </button>
              <button
                onClick={() => setActiveTab('absent')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  activeTab === 'absent'
                    ? 'bg-canvas text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                ยังไม่ได้เช็กชื่อ ({stats.totalAbsent})
              </button>
            </div>

            {/* List local search and export buttons */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-grow sm:w-64">
                <input
                  type="text"
                  value={localSearch}
                  onChange={e => setLocalSearch(e.target.value)}
                  placeholder="ค้นหารหัส หรือชื่อ..."
                  className="w-full h-8.5 border border-hairline rounded-md pl-8 pr-3 text-xs bg-canvas text-ink focus:outline-none focus:border-primary"
                />
                <Search size={12} className="absolute left-2.5 top-3 text-muted-soft" />
              </div>
              <button
                onClick={handleExportCSV}
                className="h-8.5 px-3 bg-surface-soft hover:bg-surface-strong border border-hairline text-ink text-xs font-bold rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer"
                title="ส่งออกรายงานเป็นไฟล์ CSV"
              >
                <Download size={14} />
                <span className="hidden sm:inline">ส่งออก CSV</span>
              </button>
            </div>
          </div>

          {/* List Local Filters Bar */}
          <div className="bg-surface-soft/20 border-b border-hairline px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 text-xs overflow-x-auto">
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="font-bold text-muted uppercase tracking-wider text-[10px]">ตัวกรองรายชื่อ:</span>
              
              {/* Level */}
              <div className="flex items-center space-x-1.5">
                <span className="text-muted">ระดับชั้น:</span>
                <select
                  value={level}
                  onChange={e => setLevel(e.target.value)}
                  className="h-8 border border-hairline rounded-md px-2 bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer text-xs"
                >
                  <option value="">ทั้งหมด</option>
                  {availableLevels.map(lvl => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                </select>
              </div>

              {/* Class Year */}
              <div className="flex items-center space-x-1.5">
                <span className="text-muted">ชั้นปี:</span>
                <select
                  value={classYear}
                  onChange={e => setClassYear(e.target.value)}
                  className="h-8 border border-hairline rounded-md px-2 bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer text-xs"
                >
                  <option value="">ทั้งหมด</option>
                  {availableYears.map(year => (
                    <option key={year} value={year}>ปี {year}</option>
                  ))}
                </select>
              </div>

              {/* Major */}
              <div className="flex items-center space-x-1.5">
                <span className="text-muted">สาขา:</span>
                <select
                  value={majorCode}
                  onChange={e => setMajorCode(e.target.value)}
                  className="h-8 border border-hairline rounded-md px-2 bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer text-xs uppercase"
                >
                  <option value="">ทั้งหมด</option>
                  {availableMajors.map(major => (
                    <option key={major} value={major}>{major}</option>
                  ))}
                </select>
              </div>

              {/* Room */}
              <div className="flex items-center space-x-1.5">
                <span className="text-muted">กลุ่ม:</span>
                <select
                  value={room}
                  onChange={e => setRoom(e.target.value)}
                  className="h-8 border border-hairline rounded-md px-2 bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer text-xs"
                >
                  <option value="">ทั้งหมด</option>
                  {availableRooms.map(r => (
                    <option key={r} value={r}>กลุ่ม {r}</option>
                  ))}
                </select>
              </div>

              {/* Gender */}
              <div className="flex items-center space-x-1.5">
                <span className="text-muted">เพศ:</span>
                <select
                  value={gender}
                  onChange={e => setGender(e.target.value)}
                  className="h-8 border border-hairline rounded-md px-2 bg-canvas text-ink focus:outline-none focus:border-primary cursor-pointer text-xs"
                >
                  <option value="">ทั้งหมด</option>
                  <option value="male">ชาย</option>
                  <option value="female">หญิง</option>
                </select>
              </div>
            </div>

            {(classYear || majorCode || room || gender) && (
              <button
                onClick={handleClearFilters}
                className="text-xs font-bold text-primary hover:text-primary-active flex items-center space-x-1 transition-colors cursor-pointer"
              >
                <RotateCcw size={11} />
                <span>ล้างตัวกรอง</span>
              </button>
            )}
          </div>

          {/* List display */}
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto scrollbar-thin -mx-4 sm:-mx-5 px-4 sm:px-5">
            {activeTab === 'present' ? (
              // Present Students List
              filteredPresentList.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-soft">ไม่พบรายชื่อในกลุ่มตัวกรองนี้</div>
              ) : (
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead className="sticky top-0 bg-surface-soft z-10">
                    <tr className="border-b border-hairline text-xs font-bold text-muted">
                      <th className="p-3 w-12 text-center">ลำดับ</th>
                      <th className="p-3 w-36">รหัสนักศึกษา</th>
                      <th className="p-3">ชื่อ-นามสกุล</th>
                      {selectedSessionId === 'all' && <th className="p-3 w-40">ครั้งที่กิจกรรม</th>}
                      <th className="p-3 text-center">กลุ่มเรียน / สาขาวิชา</th>
                      <th className="p-3 w-32 text-center">เวลาลงชื่อ</th>
                      <th className="p-3 w-28 text-right">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline text-sm">
                    {filteredPresentList.map((student, idx) => (
                      <tr 
                        key={idx} 
                        className="hover:bg-surface-soft/20 transition-colors cursor-pointer"
                        onClick={() => handleOpenStudentHistory(student.student_id)}
                        title="คลิกเพื่อดูประวัติเข้าเรียนรายบุคคล"
                      >
                        <td className="p-3 text-center text-xs text-muted font-semibold">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-ink hover:underline">{student.student_id}</td>
                        <td className="p-3 font-semibold text-ink">{student.prefix || ''}{student.first_name} {student.last_name}</td>
                        {selectedSessionId === 'all' && (
                          <td className="p-3 text-xs text-ink truncate max-w-[160px]">
                            ครั้งที่ {(student as any).week_number} • {(student as any).session_title}
                          </td>
                        )}
                        <td className="p-3 text-xs text-ink text-center">
                          <span className="font-bold">{student.year || student.class_year}{student.major_code}{student.room}</span>
                          <div className="text-[10px] text-muted-soft mt-0.5">{student.level} • {student.major_name || ''}</div>
                        </td>
                        <td className="p-3 text-xs font-mono text-ink text-center font-semibold">{formatTime(student.attended_at)}</td>
                        <td className="p-3 text-right">
                          <span className="inline-block text-[10px] font-bold bg-success/10 text-success px-2 py-0.5 rounded-full border border-success/20">
                            เข้าเรียนแล้ว
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              // Absent Students List
              filteredAbsentList.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-soft">ไม่พบคนไม่เข้ากิจกรรมในกลุ่มตัวกรองนี้</div>
              ) : (
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead className="sticky top-0 bg-surface-soft z-10">
                    <tr className="border-b border-hairline text-xs font-bold text-muted">
                      <th className="p-3 w-12 text-center">ลำดับ</th>
                      <th className="p-3 w-36">รหัสนักศึกษา</th>
                      <th className="p-3">ชื่อ-นามสกุล</th>
                      {selectedSessionId === 'all' && <th className="p-3 w-40">ครั้งที่กิจกรรม</th>}
                      <th className="p-3 text-center">กลุ่มเรียน / สาขาวิชา</th>
                      <th className="p-3 w-32 text-right">เช็กชื่อแบบแมนนวล</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline text-sm">
                    {filteredAbsentList.map((student, idx) => (
                      <tr 
                        key={idx} 
                        className="hover:bg-surface-soft/20 transition-colors cursor-pointer"
                        onClick={() => handleOpenStudentHistory(student.student_id)}
                        title="คลิกเพื่อดูประวัติเข้าเรียนรายบุคคล"
                      >
                        <td className="p-3 text-center text-xs text-muted font-semibold">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-ink hover:underline">{student.student_id}</td>
                        <td className="p-3 font-semibold text-ink">{student.prefix || ''}{student.first_name} {student.last_name}</td>
                        {selectedSessionId === 'all' && (
                          <td className="p-3 text-xs text-ink truncate max-w-[160px]">
                            ครั้งที่ {(student as any).week_number} • {(student as any).session_title}
                          </td>
                        )}
                        <td className="p-3 text-xs text-ink text-center">
                          <span className="font-bold">{student.year || student.class_year}{student.major_code}{student.room}</span>
                          <div className="text-[10px] text-muted-soft mt-0.5">{student.level} • {student.major_name || ''}</div>
                        </td>
                        <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleQuickCheckin(student)}
                            className="inline-flex items-center space-x-1 text-xs bg-primary hover:bg-primary-active text-white px-2.5 py-1 rounded.5 transition-all shadow-sm active:scale-95 cursor-pointer font-semibold"
                          >
                            <Plus size={12} />
                            <span>ลงชื่อเรียน</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </div>
      )}

      {/* Custom Confirm Modal for Dashboard Manual Check-in */}
      {confirmDialog.show && (
        <div className="fixed inset-0 bg-[#111111]/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-canvas border border-hairline rounded-lg w-full max-w-sm p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="space-y-2 text-center">
              <h3 className="font-bold text-lg text-ink">{confirmDialog.title}</h3>
              <p className="text-sm text-muted">{confirmDialog.message}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setConfirmDialog({ ...confirmDialog, show: false })}
                className="h-10 border border-hairline rounded-md text-sm font-semibold text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog({ ...confirmDialog, show: false });
                }}
                className="h-10 bg-primary hover:bg-primary-active text-white rounded-md text-sm font-semibold transition-colors cursor-pointer"
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Individual Student History Modal */}
      {selectedStudentHistory && (
        <div className="fixed inset-0 bg-[#111111]/45 backdrop-blur-sm z-[110] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-canvas border border-hairline rounded-lg w-full max-w-xl p-5 sm:p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 my-8">
            
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-hairline pb-3">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {selectedStudentHistory.student.is_temporary ? 'นักศึกษานอกบัญชีรายชื่อ' : 'ประวัตินักศึกษาในระบบ'}
                </span>
                <h3 className="font-extrabold text-lg text-ink">
                  {selectedStudentHistory.student.prefix || ''}{selectedStudentHistory.student.first_name} {selectedStudentHistory.student.last_name}
                </h3>
                <p className="text-xs font-semibold font-mono text-muted">
                  รหัสนักศึกษา: {selectedStudentHistory.student.student_id}
                </p>
              </div>
              <button 
                onClick={() => setSelectedStudentHistory(null)}
                className="text-muted hover:text-ink font-bold text-lg p-1 transition-colors cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                ✕
              </button>
            </div>

            {/* Student Info Details */}
            <div className="grid grid-cols-3 gap-3 text-xs bg-surface-soft/40 p-3 rounded-lg border border-hairline">
              <div>
                <span className="text-muted block font-semibold mb-0.5">ชั้นปี</span>
                <span className="font-bold text-ink">ชั้นปีที่ {selectedStudentHistory.student.class_year}</span>
              </div>
              <div>
                <span className="text-muted block font-semibold mb-0.5">สาขาวิชา</span>
                <span className="font-bold text-primary uppercase">{selectedStudentHistory.student.major_code}</span>
              </div>
              <div>
                <span className="text-muted block font-semibold mb-0.5">กลุ่มเรียน</span>
                <span className="font-bold text-ink">ห้อง {selectedStudentHistory.student.room}</span>
              </div>
            </div>

            {/* Stats Dashboard for individual student */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-success/5 border border-success/20 p-2.5 rounded-lg">
                <div className="text-xs font-semibold text-muted mb-0.5">อัตราเข้าเรียน</div>
                <div className="text-lg font-black text-success">{selectedStudentHistory.stats.attendanceRate}%</div>
              </div>
              <div className="bg-primary/5 border border-primary/20 p-2.5 rounded-lg">
                <div className="text-xs font-semibold text-muted mb-0.5 font-bold">เข้าเรียน (มา)</div>
                <div className="text-lg font-black text-primary">{selectedStudentHistory.stats.totalPresent} / {selectedStudentHistory.stats.totalSessions}</div>
              </div>
              <div className="bg-error/5 border border-error/20 p-2.5 rounded-lg">
                <div className="text-xs font-semibold text-muted mb-0.5 font-bold">ไม่เข้ากิจกรรม (ขาด)</div>
                <div className="text-lg font-black text-error">{selectedStudentHistory.stats.totalAbsent} / {selectedStudentHistory.stats.totalSessions}</div>
              </div>
            </div>

            {/* Timeline Attendance History */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center space-x-1">
                <span>ประวัติการเช็กชื่อในแต่ละคาบกิจกรรม</span>
              </h4>
              
              <div className="border border-hairline rounded-lg overflow-hidden max-h-64 overflow-y-auto divide-y divide-hairline">
                {selectedStudentHistory.history.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-soft">ไม่มีประวัติคาบกิจกรรมในระบบ</div>
                ) : (
                  selectedStudentHistory.history.map((h, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 text-xs hover:bg-surface-soft/10 transition-colors">
                      <div className="space-y-0.5">
                        <div className="font-bold text-ink truncate max-w-[250px] sm:max-w-[320px]">
                          ครั้งที่ {h.weekNumber} • {h.title}
                        </div>
                        <div className="text-[10px] text-muted-soft font-medium">
                          วันที่จัดกิจกรรม: {new Date(h.date).toLocaleDateString('th-TH')}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3 text-right">
                        {h.status === 'present' ? (
                          <>
                            <div className="text-[10px] text-muted-soft font-mono font-semibold">
                              {formatTime(h.attended_at || '')}
                            </div>
                            <span className="inline-flex items-center space-x-0.5 px-2 py-0.5 rounded-full font-bold bg-success/10 text-success border border-success/20">
                              <span>มา</span>
                            </span>
                          </>
                        ) : (
                          <span className="inline-flex items-center space-x-0.5 px-2 py-0.5 rounded-full font-bold bg-error/10 text-error border border-error/20">
                            <span>ขาด</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end pt-1">
              <button
                onClick={() => setSelectedStudentHistory(null)}
                className="h-9 px-5 bg-surface-soft hover:bg-surface-strong border border-hairline text-ink text-xs font-bold rounded-md transition-all cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading student history indicator */}
      {loadingHistory && (
        <div className="fixed inset-0 bg-[#111111]/30 backdrop-blur-xs z-[120] flex items-center justify-center">
          <div className="bg-canvas border border-hairline p-4 rounded-lg shadow-lg flex items-center space-x-3">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-bold text-ink">กำลังโหลดประวัตินักศึกษา...</span>
          </div>
        </div>
      )}

    </div>
  );
}
