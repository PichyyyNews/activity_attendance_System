import { useState, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import axios from 'axios';
import {
  Clock,
  QrCode,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Settings,
  Users,
  Calendar,
  ChevronRight,
  ExternalLink,
  Printer,
  X,
  Power,
  BarChart2,
  ShieldAlert,
  MapPin,
  AlertTriangle,
  Target,
  Flame,
  Compass,
  Layers
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  PieChart as RechartsPieChart,
  Pie
} from 'recharts';

interface AssemblyDashboardProps {
  activeYear?: string;
  activeTerm?: string;
}

type TimeframeType = '7d' | '14d' | '30d' | 'term';
type TabType = 'overview' | 'temporal' | 'demographics' | 'risk';

export default function AssemblyDashboard({ activeYear: propYear, activeTerm: propTerm }: AssemblyDashboardProps) {
  const outletCtx = useOutletContext<{ activeYear?: string; activeTerm?: string }>() || {};
  const activeYear = propYear || outletCtx.activeYear;
  const activeTerm = propTerm || outletCtx.activeTerm;

  const [data, setData] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // EDA Controls
  const [timeframe, setTimeframe] = useState<TimeframeType>('14d');
  const [levelFilter, setLevelFilter] = useState<'all' | 'ปวช' | 'ปวส'>('all');
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // QR Modal state
  const [showQrModal, setShowQrModal] = useState(false);
  const [overrideLoading, setOverrideLoading] = useState(false);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const params: any = {
        timeframe,
        level: levelFilter
      };
      if (activeYear) params.academic_year = activeYear;
      if (activeTerm) params.term = activeTerm;

      const [summaryRes, settingsRes] = await Promise.all([
        axios.get('/api/assembly/dashboard-summary', { params }),
        axios.get('/api/assembly/settings')
      ]);
      setData(summaryRes.data);
      setSettings(settingsRes.data);
      setError('');
    } catch (err: any) {
      console.error('Error loading assembly dashboard:', err);
      setError('ไม่สามารถโหลดข้อมูลภาพรวมการเข้าแถวได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [activeYear, activeTerm, timeframe, levelFilter]);

  const handleToggleOverride = async () => {
    try {
      setOverrideLoading(true);
      const nextState = !(settings?.manual_override_open === 1 && settings?.manual_override_date === settings?.today_date);
      await axios.post('/api/assembly/override', { open: nextState });
      await fetchDashboard();
    } catch (err) {
      console.error('Error toggling override:', err);
      alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะเปิด-ปิดรอบ');
    } finally {
      setOverrideLoading(false);
    }
  };

  // Build the QR code URL
  const qrUrl = (() => {
    const origin = window.location.origin;
    if (settings?.qr_mode === 'dynamic' && settings?.today_daily_token) {
      return `${origin}/assembly/scan/${settings.today_daily_token}`;
    }
    if (settings?.static_token) {
      return `${origin}/assembly/scan/${settings.static_token}`;
    }
    return `${origin}/assembly/scan`;
  })();

  const isOverrideActive = settings?.manual_override_open === 1 && settings?.manual_override_date === settings?.today_date;

  const pieData = data ? [
    { name: 'ทันเวลา', value: data.today?.present || 0, color: '#10b981' },
    { name: 'มาสาย', value: data.today?.late || 0, color: '#f59e0b' },
    { name: 'ลา', value: data.today?.leave || 0, color: '#0ea5e9' },
    { name: 'ขาดแถว', value: data.today?.absent || 0, color: '#f43f5e' },
  ].filter(d => d.value > 0) : [];

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-300 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-canvas border border-hairline p-5 rounded-2xl shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
            <span className="text-xs font-bold text-primary uppercase tracking-wider">
              Morning Assembly Analytics • ประจำปี {settings?.academic_year || '2569'} เทอม {settings?.term || '1'}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight flex items-center gap-2">
            <span>ภาพรวมและการวิเคราะห์ข้อมูลการเข้าแถว (EDA)</span>
          </h1>
          <p className="text-xs text-muted">
            วันที่: {data?.today_date ? new Date(data.today_date).toLocaleDateString('th-TH', { dateStyle: 'full' }) : 'วันนี้'} • สำรวจแนวโน้ม พฤติกรรมเชิงเวลา และการกระจายตัวของกลุ่มเสี่ยง
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Emergency Override Button */}
          <button
            type="button"
            disabled={overrideLoading}
            onClick={handleToggleOverride}
            className={`h-9 px-3.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              isOverrideActive
                ? 'bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100'
                : 'bg-canvas border border-hairline text-ink hover:bg-surface-soft'
            }`}
          >
            <Power size={14} className={isOverrideActive ? 'text-rose-600' : 'text-muted'} />
            <span>{isOverrideActive ? 'ปิดรอบพิเศษ' : 'เปิดรอบพิเศษทันที'}</span>
          </button>

          {/* QR Code Projector Modal Button */}
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="h-9 px-4 bg-primary hover:bg-primary-active text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <QrCode size={15} />
            <span>ฉาย QR Code</span>
          </button>

          <Link
            to="/admin/assembly/settings"
            className="h-9 px-3.5 bg-canvas hover:bg-surface-soft border border-hairline text-ink rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <Settings size={14} className="text-muted" />
            <span>ตั้งค่ารอบ</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Core KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Today Checked-In */}
        <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-xs space-y-1">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>เข้าแถววันนี้</span>
            <Users size={16} className="text-primary" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-ink font-mono">
              {loading ? '-' : data?.today?.checked_in || 0}
            </span>
            <span className="text-xs text-muted">/ {data?.total_students || 0} คน</span>
          </div>
          <div className="text-[11px] font-bold text-primary">
            คิดเป็น {loading ? '-' : data?.today?.rate || 0}%
          </div>
        </div>

        {/* Card 2: On-Time */}
        <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-xs space-y-1">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>ทันเวลา</span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-emerald-600 font-mono">
              {loading ? '-' : data?.today?.present || 0}
            </span>
            <span className="text-xs text-muted">คน</span>
          </div>
          <div className="text-[11px] text-emerald-700 font-semibold">
            ตรงเวลา {loading ? '-' : data?.today?.on_time_rate || 0}%
          </div>
        </div>

        {/* Card 3: Late */}
        <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-xs space-y-1">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>มาสาย</span>
            <Clock size={16} className="text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-amber-600 font-mono">
              {loading ? '-' : data?.today?.late || 0}
            </span>
            <span className="text-xs text-muted">คน</span>
          </div>
          <div className="text-[11px] text-amber-600 font-medium">
            หลัง {settings?.late_time || '08:00'} น.
          </div>
        </div>

        {/* Card 4: Leave */}
        <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-xs space-y-1">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>ลา</span>
            <Calendar size={16} className="text-sky-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-sky-600 font-mono">
              {loading ? '-' : data?.today?.leave || 0}
            </span>
            <span className="text-xs text-muted">คน</span>
          </div>
          <div className="text-[11px] text-muted">
            มีใบลา/แจ้งเหตุผล
          </div>
        </div>

        {/* Card 5: Absent */}
        <div className="col-span-2 lg:col-span-1 bg-canvas border border-hairline p-4 rounded-xl shadow-xs space-y-1">
          <div className="flex items-center justify-between text-muted text-xs font-medium">
            <span>ขาดแถว</span>
            <AlertCircle size={16} className="text-rose-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-rose-600 font-mono">
              {loading ? '-' : data?.today?.absent || 0}
            </span>
            <span className="text-xs text-muted">คน</span>
          </div>
          <div className="text-[11px] text-rose-600 font-medium">
            ยังไม่ได้เช็กชื่อวันนี้
          </div>
        </div>
      </div>

      {/* EDA Control Strip: Timeframe & Tabs */}
      <div className="bg-canvas border border-hairline rounded-2xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* EDA Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-surface-soft border border-hairline rounded-xl overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-canvas text-ink shadow-xs border border-hairline'
                : 'text-muted hover:text-ink'
            }`}
          >
            <BarChart2 size={15} className={activeTab === 'overview' ? 'text-primary' : 'text-muted'} />
            <span>ภาพรวม & แนวโน้ม</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('temporal')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'temporal'
                ? 'bg-canvas text-ink shadow-xs border border-hairline'
                : 'text-muted hover:text-ink'
            }`}
          >
            <Clock size={15} className={activeTab === 'temporal' ? 'text-primary' : 'text-muted'} />
            <span>พฤติกรรมเวลา & วัน</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('demographics')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'demographics'
                ? 'bg-canvas text-ink shadow-xs border border-hairline'
                : 'text-muted hover:text-ink'
            }`}
          >
            <Layers size={15} className={activeTab === 'demographics' ? 'text-primary' : 'text-muted'} />
            <span>ระดับชั้น & สาขาวิชา</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('risk')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'risk'
                ? 'bg-canvas text-ink shadow-xs border border-hairline'
                : 'text-muted hover:text-ink'
            }`}
          >
            <Target size={15} className={activeTab === 'risk' ? 'text-primary' : 'text-muted'} />
            <span>การกระจายตัวกลุ่มเสี่ยง</span>
          </button>
        </div>

        {/* Timeframe & Scope Filters */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Level Filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-muted text-[11px] font-semibold">ระดับ:</span>
            <div className="flex items-center bg-surface-soft border border-hairline rounded-lg p-0.5">
              {(['all', 'ปวช', 'ปวส'] as const).map(lvl => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevelFilter(lvl)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                    levelFilter === lvl
                      ? 'bg-canvas text-ink shadow-2xs font-extrabold'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {lvl === 'all' ? 'ทั้งหมด' : lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Timeframe Filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-muted text-[11px] font-semibold">ช่วงเวลา:</span>
            <div className="flex items-center bg-surface-soft border border-hairline rounded-lg p-0.5">
              {(
                [
                  { key: '7d', label: '7 วัน' },
                  { key: '14d', label: '14 วัน' },
                  { key: '30d', label: '30 วัน' },
                  { key: 'term', label: 'ทั้งเทอม' },
                ] as const
              ).map(tf => (
                <button
                  key={tf.key}
                  type="button"
                  onClick={() => setTimeframe(tf.key)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                    timeframe === tf.key
                      ? 'bg-ink text-canvas shadow-2xs'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Trend Composed Chart */}
            <div className="lg:col-span-2 bg-canvas border border-hairline p-5 rounded-2xl shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                    <TrendingUp size={16} className="text-primary" />
                    <span>แนวโน้มการเข้าแถวในช่วงเวลาที่เลือก ({timeframe === '7d' ? '7 วัน' : timeframe === '14d' ? '14 วัน' : timeframe === '30d' ? '30 วัน' : 'ทั้งภาคเรียน'})</span>
                  </h2>
                  <p className="text-xs text-muted">
                    เฉลี่ยเข้าแถว: <strong className="text-ink">{data?.timeframe_overview?.avg_attendance_rate || 0}%</strong> • มาทันเวลาเฉลี่ย: <strong className="text-emerald-600">{data?.timeframe_overview?.avg_on_time_rate || 0}%</strong>
                  </p>
                </div>
                <Link
                  to="/admin/assembly/attendance"
                  className="text-xs font-bold text-primary hover:underline flex items-center gap-1 self-start sm:self-auto"
                >
                  <span>ดูตารางเต็ม</span>
                  <ChevronRight size={14} />
                </Link>
              </div>

              <div className="h-72 w-full pt-2">
                {loading ? (
                  <div className="h-full flex items-center justify-center text-muted text-xs">กำลังโหลดสถิติ...</div>
                ) : !data?.trend || data.trend.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted text-xs space-y-1">
                    <Calendar size={24} className="text-muted-soft" />
                    <span>ยังไม่มีประวัติการเช็กชื่อในรอบที่ผ่านมา</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.trend} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10, fill: '#71717a' }}
                        tickFormatter={(val: string) => {
                          const parts = val.split('-');
                          return `${parts[2]}/${parts[1]}`;
                        }}
                      />
                      <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#71717a' }} />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tickLine={false}
                        axisLine={false}
                        domain={[0, 100]}
                        unit="%"
                        tick={{ fontSize: 10, fill: '#71717a' }}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', fontSize: '11px' }}
                        labelFormatter={(label: any) => `วันที่ ${label}`}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Bar yAxisId="left" dataKey="present" name="ทันเวลา" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                      <Bar yAxisId="left" dataKey="late" name="มาสาย" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                      <Bar yAxisId="left" dataKey="leave" name="ลา" stackId="a" fill="#0ea5e9" radius={[0, 0, 0, 0]} />
                      <Bar yAxisId="left" dataKey="absent" name="ขาด" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="rate" name="อัตราเข้าแถว (%)" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Donut Chart: Today's Breakdown */}
            <div className="bg-canvas border border-hairline p-5 rounded-2xl shadow-xs space-y-4 flex flex-col justify-between">
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-ink">สัดส่วนการเข้าแถววันนี้</h2>
                <p className="text-xs text-muted">แบ่งตามสถานะการเข้าแถวของนักศึกษา</p>
              </div>

              <div className="h-56 flex items-center justify-center relative">
                {loading ? (
                  <span className="text-xs text-muted">กำลังโหลด...</span>
                ) : pieData.length === 0 ? (
                  <span className="text-xs text-muted">ยังไม่มีข้อมูลวันนี้</span>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                )}
                {!loading && data?.today && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-extrabold text-ink font-mono">{data.today.rate}%</span>
                    <span className="text-[10px] text-muted uppercase">อัตราเข้าแถว</span>
                  </div>
                )}
              </div>

              {/* Legend Items */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-hairline">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span className="text-muted">ทันเวลา: <strong className="text-ink">{data?.today?.present || 0}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span className="text-muted">มาสาย: <strong className="text-ink">{data?.today?.late || 0}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                  <span className="text-muted">ลา: <strong className="text-ink">{data?.today?.leave || 0}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  <span className="text-muted">ขาด: <strong className="text-ink">{data?.today?.absent || 0}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Department Rankings Table */}
          <div className="bg-canvas border border-hairline rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-ink">สถิติการเข้าแถวรายสาขาวิชา (วันนี้)</h2>
                <p className="text-xs text-muted">เรียงลำดับจากสาขาวิชาที่มีอัตราการเข้าแถวสูงสุด</p>
              </div>
              <Link
                to="/admin/assembly/attendance"
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                <span>ดูรายชื่อนักเรียนรายห้อง</span>
                <ChevronRight size={14} />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-soft border-b border-hairline text-muted font-bold">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">อันดับ</th>
                    <th className="py-3 px-4">รหัสสาขา</th>
                    <th className="py-3 px-4">ชื่อสาขาวิชา</th>
                    <th className="py-3 px-4 text-center">นักศึกษาทั้งหมด</th>
                    <th className="py-3 px-4 text-center">เข้าแถวแล้ว</th>
                    <th className="py-3 px-4 text-center w-36">อัตราการเข้าแถว</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted">กำลังโหลดข้อมูล...</td>
                    </tr>
                  ) : !data?.department_rankings || data.department_rankings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted">ยังไม่มีข้อมูลรายสาขาวิชา</td>
                    </tr>
                  ) : (
                    data.department_rankings.map((dept: any, idx: number) => (
                      <tr key={dept.major_code} className="hover:bg-surface-soft/40 transition-colors">
                        <td className="py-3 px-4 text-center font-bold text-muted font-mono">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono font-bold text-ink">{dept.major_code}</td>
                        <td className="py-3 px-4 font-semibold text-ink">{dept.major_name || dept.major_code}</td>
                        <td className="py-3 px-4 text-center font-mono text-muted">{dept.total_students} คน</td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-emerald-600">{dept.checked_in} คน</td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-surface-soft rounded-full h-2 overflow-hidden border border-hairline">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  dept.rate >= 80 ? 'bg-emerald-500' : dept.rate >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                }`}
                                style={{ width: `${dept.rate}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-ink w-10 text-right">{dept.rate}%</span>
                          </div>
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

      {/* TAB 2: TEMPORAL BEHAVIOR */}
      {activeTab === 'temporal' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Summary Insight KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-canvas border border-hairline p-4 rounded-2xl shadow-xs flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <Flame size={20} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted">ช่วงเวลาเข้าแถวหนาแน่นที่สุด (Peak)</p>
                <h3 className="text-base font-extrabold text-ink font-mono mt-0.5">
                  {data?.time_distribution?.peak_slot || '07:45 - 08:00'} น.
                </h3>
                <p className="text-[10px] text-muted">สแกนรวม {data?.time_distribution?.total_scans || 0} ครั้ง</p>
              </div>
            </div>

            <div className="bg-canvas border border-hairline p-4 rounded-2xl shadow-xs flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <Target size={20} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted">วันที่มีอัตราเข้าแถวสูงสุด</p>
                <h3 className="text-base font-extrabold text-ink mt-0.5">
                  {(() => {
                    if (!data?.day_of_week_stats || data.day_of_week_stats.length === 0) return 'ไม่มีข้อมูล';
                    const best = [...data.day_of_week_stats].sort((a: any, b: any) => b.rate - a.rate)[0];
                    return best ? `${best.day} (${best.rate}%)` : 'ไม่มีข้อมูล';
                  })()}
                </h3>
                <p className="text-[10px] text-muted">เฉลี่ยจากข้อมูล {timeframe}</p>
              </div>
            </div>

            <div className="bg-canvas border border-hairline p-4 rounded-2xl shadow-xs flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                <Clock size={20} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted">อัตราตรงเวลาเฉลี่ย (On-Time Rate)</p>
                <h3 className="text-base font-extrabold text-ink font-mono mt-0.5">
                  {data?.timeframe_overview?.avg_on_time_rate || 0}%
                </h3>
                <p className="text-[10px] text-muted">
                  สายเฉลี่ย {Math.max(0, 100 - (data?.timeframe_overview?.avg_on_time_rate || 100))}%
                </p>
              </div>
            </div>
          </div>

          {/* Temporal Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 15-Minute Buckets Distribution */}
            <div className="lg:col-span-2 bg-canvas border border-hairline p-5 rounded-2xl shadow-xs space-y-4">
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Clock size={16} className="text-primary" />
                  <span>การกระจายตัวของเวลาสแกนเช็กชื่อ (15-Minute Histogram)</span>
                </h2>
                <p className="text-xs text-muted">ช่วงเวลาที่นักศึกษาสแกนเช็กชื่อหน้าเสาธง แยกทันเวลา vs มาสาย</p>
              </div>

              <div className="h-72 w-full pt-2">
                {loading ? (
                  <div className="h-full flex items-center justify-center text-muted text-xs">กำลังโหลดสถิติเวลา...</div>
                ) : !data?.time_distribution?.buckets ? (
                  <div className="h-full flex items-center justify-center text-muted text-xs">ยังไม่มีข้อมูลเวลาสแกน</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.time_distribution.buckets} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                      <XAxis dataKey="slot" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#71717a' }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#71717a' }} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', fontSize: '11px' }}
                        formatter={(val: any, name: any) => [`${val} คน`, name]}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Bar dataKey="present" name="ทันเวลา" stackId="t" fill="#10b981" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="late" name="มาสาย" stackId="t" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Day of Week Pattern */}
            <div className="bg-canvas border border-hairline p-5 rounded-2xl shadow-xs space-y-4">
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Calendar size={16} className="text-primary" />
                  <span>พฤติกรรมตามวัน (Day-of-Week)</span>
                </h2>
                <p className="text-xs text-muted">อัตราเข้าแถวเฉลี่ยในแต่ละวันทำการ</p>
              </div>

              <div className="h-72 w-full pt-2">
                {loading ? (
                  <div className="h-full flex items-center justify-center text-muted text-xs">กำลังโหลดข้อมูล...</div>
                ) : !data?.day_of_week_stats ? (
                  <div className="h-full flex items-center justify-center text-muted text-xs">ไม่มีข้อมูลวันในสัปดาห์</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.day_of_week_stats} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                      <XAxis
                        dataKey="day"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10, fill: '#71717a' }}
                        tickFormatter={(val: string) => val.replace('วัน', '')}
                      />
                      <YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#71717a' }} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', fontSize: '11px' }}
                        formatter={(val: any) => [`${val}%`, 'อัตราเข้าแถว']}
                      />
                      <Bar dataKey="rate" name="อัตราเข้าแถว (%)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Location & Geofencing Stats */}
          <div className="bg-canvas border border-hairline p-5 rounded-2xl shadow-xs space-y-4">
            <div className="space-y-0.5">
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <MapPin size={16} className="text-primary" />
                <span>การกระจายตัวของพิกัดสแกนเช็กชื่อ (Geofencing Locations)</span>
              </h2>
              <p className="text-xs text-muted">จุดที่ระบบตรวจพบพิกัด GPS ขณะนักศึกษายืนยันการเข้าแถว</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
              {loading ? (
                <div className="col-span-full py-6 text-center text-muted text-xs">กำลังโหลดพิกัด...</div>
              ) : !data?.location_stats || data.location_stats.length === 0 ? (
                <div className="col-span-full py-6 text-center text-muted text-xs">ยังไม่มีข้อมูลจุดสแกนในระบบ</div>
              ) : (
                data.location_stats.map((loc: any, idx: number) => (
                  <div key={idx} className="p-3.5 bg-surface-soft border border-hairline rounded-xl flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-ink flex items-center gap-1.5">
                        <Compass size={14} className="text-primary" />
                        <span>{loc.name}</span>
                      </p>
                      <p className="text-[11px] text-muted">ยืนยันพิกัดสำเร็จ</p>
                    </div>
                    <span className="text-base font-extrabold text-ink font-mono bg-canvas px-2.5 py-1 rounded-lg border border-hairline">
                      {loc.count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DEMOGRAPHICS */}
      {activeTab === 'demographics' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Level Stats Bar Chart */}
            <div className="lg:col-span-2 bg-canvas border border-hairline p-5 rounded-2xl shadow-xs space-y-4">
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Layers size={16} className="text-primary" />
                  <span>เปรียบเทียบอัตราการเข้าแถวตามระดับชั้น (Level & Year)</span>
                </h2>
                <p className="text-xs text-muted">เปรียบเทียบระหว่าง ปวช.1-3 และ ปวส.1-2 (วันนี้)</p>
              </div>

              <div className="h-72 w-full pt-2">
                {loading ? (
                  <div className="h-full flex items-center justify-center text-muted text-xs">กำลังโหลดข้อมูล...</div>
                ) : !data?.level_stats || data.level_stats.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted text-xs">ไม่มีข้อมูลระดับชั้น</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.level_stats} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#71717a' }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#71717a' }} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', fontSize: '11px' }}
                        formatter={(val: any, name: any) => [`${val} คน`, name]}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Bar dataKey="present" name="ทันเวลา" stackId="l" fill="#10b981" />
                      <Bar dataKey="late" name="มาสาย" stackId="l" fill="#f59e0b" />
                      <Bar dataKey="absent" name="ขาด" stackId="l" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Gender Stats Cards */}
            <div className="bg-canvas border border-hairline p-5 rounded-2xl shadow-xs space-y-4 flex flex-col justify-between">
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Users size={16} className="text-primary" />
                  <span>สัดส่วนและอัตราตามเพศ (Gender)</span>
                </h2>
                <p className="text-xs text-muted">เปรียบเทียบพฤติกรรมการเข้าแถว ชาย vs หญิง</p>
              </div>

              <div className="space-y-3 pt-2">
                {loading ? (
                  <div className="py-8 text-center text-muted text-xs">กำลังโหลด...</div>
                ) : !data?.gender_stats || data.gender_stats.length === 0 ? (
                  <div className="py-8 text-center text-muted text-xs">ไม่มีข้อมูลเพศ</div>
                ) : (
                  data.gender_stats.map((g: any) => (
                    <div key={g.gender} className="p-4 bg-surface-soft border border-hairline rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: g.color || '#3b82f6' }}
                          />
                          <span className="font-bold text-sm text-ink">นักศึกษา{g.gender}</span>
                        </div>
                        <span className="font-mono font-extrabold text-sm text-ink">{g.rate}%</span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-canvas rounded-full h-2 overflow-hidden border border-hairline">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${g.rate}%`,
                            backgroundColor: g.color || '#3b82f6'
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted pt-1">
                        <span>เข้าแถว {g.checked_in} / {g.total} คน</span>
                        <span className="text-emerald-600 font-semibold">ทันเวลา {g.on_time_rate}%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-3 bg-surface-soft border border-hairline rounded-xl text-[11px] text-muted flex items-start gap-2">
                <CheckCircle2 size={15} className="text-primary shrink-0 mt-0.5" />
                <span>จำแนกอัตโนมัติจากคำนำหน้าชื่อในฐานข้อมูลนักศึกษา</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: RISK & ANTI-FRAUD */}
      {activeTab === 'risk' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Risk Segmentation 3-Tier Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Good Tier */}
            <div className="bg-canvas border border-emerald-200/80 p-5 rounded-2xl shadow-xs space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none" />
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  เกณฑ์ผ่านกิจกรรม (&ge; 80%)
                </span>
                <CheckCircle2 size={18} className="text-emerald-500" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-3xl font-extrabold text-ink font-mono">
                  {data?.risk_segmentation?.good?.count || 0}
                  <span className="text-xs text-muted font-normal ml-1.5">คน</span>
                </h3>
                <p className="text-xs text-muted">
                  คิดเป็น <strong className="text-emerald-600 font-mono">{data?.risk_segmentation?.good?.percentage || 0}%</strong> ของนักศึกษาทั้งหมด
                </p>
              </div>
              <div className="w-full bg-surface-soft rounded-full h-2 overflow-hidden border border-hairline">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${data?.risk_segmentation?.good?.percentage || 0}%` }}
                />
              </div>
            </div>

            {/* Warning Tier */}
            <div className="bg-canvas border border-amber-200/80 p-5 rounded-2xl shadow-xs space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-full pointer-events-none" />
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  กลุ่มเฝ้าระวัง (60 - 79%)
                </span>
                <AlertTriangle size={18} className="text-amber-500" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-3xl font-extrabold text-ink font-mono">
                  {data?.risk_segmentation?.warning?.count || 0}
                  <span className="text-xs text-muted font-normal ml-1.5">คน</span>
                </h3>
                <p className="text-xs text-muted">
                  คิดเป็น <strong className="text-amber-600 font-mono">{data?.risk_segmentation?.warning?.percentage || 0}%</strong> ของนักศึกษาทั้งหมด
                </p>
              </div>
              <div className="w-full bg-surface-soft rounded-full h-2 overflow-hidden border border-hairline">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${data?.risk_segmentation?.warning?.percentage || 0}%` }}
                />
              </div>
            </div>

            {/* Critical Tier */}
            <div className="bg-canvas border border-rose-200/80 p-5 rounded-2xl shadow-xs space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-bl-full pointer-events-none" />
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  เสี่ยงตกกิจกรรม (&lt; 60%)
                </span>
                <ShieldAlert size={18} className="text-rose-500" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-3xl font-extrabold text-ink font-mono">
                  {data?.risk_segmentation?.critical?.count || 0}
                  <span className="text-xs text-muted font-normal ml-1.5">คน</span>
                </h3>
                <p className="text-xs text-muted">
                  คิดเป็น <strong className="text-rose-600 font-mono">{data?.risk_segmentation?.critical?.percentage || 0}%</strong> ของนักศึกษาทั้งหมด
                </p>
              </div>
              <div className="w-full bg-surface-soft rounded-full h-2 overflow-hidden border border-hairline">
                <div
                  className="h-full bg-rose-500 rounded-full"
                  style={{ width: `${data?.risk_segmentation?.critical?.percentage || 0}%` }}
                />
              </div>
            </div>
          </div>

          {/* At-Risk Classrooms Table & Anti-Fraud Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top 5 At-Risk Rooms */}
            <div className="lg:col-span-2 bg-canvas border border-hairline rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-hairline space-y-0.5">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <AlertTriangle size={16} className="text-rose-500" />
                  <span>5 ห้องเรียนที่มีอัตราการขาดแถวสูงสุด (Top 5 At-Risk Classrooms)</span>
                </h2>
                <p className="text-xs text-muted">พิจารณาจากอัตราการเข้าแถวสะสมตลอดทั้งภาคเรียน</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-soft border-b border-hairline text-muted font-bold">
                    <tr>
                      <th className="py-3 px-4 w-10 text-center">#</th>
                      <th className="py-3 px-4">ระดับ / ห้องเรียน</th>
                      <th className="py-3 px-4">สาขาวิชา</th>
                      <th className="py-3 px-4 text-center">นักศึกษา</th>
                      <th className="py-3 px-4 text-center w-36">อัตราเข้าแถว</th>
                      <th className="py-3 px-4 text-center text-rose-600">ขาดสะสม</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted">กำลังโหลดข้อมูลห้องเสี่ยง...</td>
                      </tr>
                    ) : !data?.at_risk_rooms || data.at_risk_rooms.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted">ไม่พบข้อมูลห้องเรียนที่มีความเสี่ยง</td>
                      </tr>
                    ) : (
                      data.at_risk_rooms.map((rm: any, idx: number) => (
                        <tr key={idx} className="hover:bg-surface-soft/40 transition-colors">
                          <td className="py-3 px-4 text-center font-bold text-rose-600 font-mono">{idx + 1}</td>
                          <td className="py-3 px-4 font-bold text-ink">{rm.room_name}</td>
                          <td className="py-3 px-4 text-muted font-mono">{rm.major_code}</td>
                          <td className="py-3 px-4 text-center font-mono text-muted">{rm.total_students} คน</td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-surface-soft rounded-full h-2 overflow-hidden border border-hairline">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    rm.rate >= 80 ? 'bg-emerald-500' : rm.rate >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${rm.rate}%` }}
                                />
                              </div>
                              <span className="font-mono font-bold text-ink w-10 text-right">{rm.rate}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-rose-600">
                            {rm.absent_count} ครั้ง
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Anti-Fraud & Rejections Summary */}
            <div className="bg-canvas border border-hairline p-5 rounded-2xl shadow-xs space-y-4 flex flex-col justify-between">
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <ShieldAlert size={16} className="text-primary" />
                  <span>สถิติการปฏิเสธ & ป้องกันทุจริต</span>
                </h2>
                <p className="text-xs text-muted">การสแกนที่ไม่ผ่านเงื่อนไขความปลอดภัย</p>
              </div>

              <div className="space-y-3 pt-2">
                {loading ? (
                  <div className="py-6 text-center text-muted text-xs">กำลังโหลด...</div>
                ) : !data?.rejection_summary || data.rejection_summary.length === 0 ? (
                  <div className="py-8 text-center text-muted text-xs space-y-2">
                    <CheckCircle2 size={24} className="text-emerald-500 mx-auto" />
                    <p>ไม่พบรายการปฏิเสธการเช็กชื่อในช่วงเวลานี้</p>
                  </div>
                ) : (
                  data.rejection_summary.map((rej: any, idx: number) => (
                    <div key={idx} className="p-3 bg-surface-soft border border-hairline rounded-xl flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-ink">{rej.rejection_reason || 'ไม่ผ่านเงื่อนไข'}</p>
                        <p className="text-[10px] text-muted">ถูกบล็อกโดยระบบ</p>
                      </div>
                      <span className="text-xs font-bold font-mono text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                        {rej.count} ครั้ง
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="p-3 bg-surface-soft border border-hairline rounded-xl text-[11px] text-muted space-y-1">
                <p className="font-bold text-ink flex items-center gap-1.5">
                  <MapPin size={13} className="text-primary" />
                  <span>รัศมี GPS ปัจจุบัน: {settings?.gps_radius_meters || 100} เมตร</span>
                </p>
                <p>ระบบตรวจจับระยะพิกัด GPS อัตโนมัติ ป้องกันการเช็กชื่อนอกพื้นที่วิทยาลัย</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Presentation Modal (For Projector / Big Screen Display) */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-canvas border border-hairline rounded-2xl w-full max-w-lg p-6 sm:p-8 shadow-2xl space-y-6 text-center animate-in zoom-in-95 duration-150 relative">
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-surface-soft text-muted hover:text-ink flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>

            <div className="space-y-1">
              <span className="bg-primary/10 text-primary text-xs font-bold px-3 py-0.5 rounded-full border border-primary/20">
                {settings?.qr_mode === 'dynamic' ? '⚡ QR Code รายวัน (Dynamic Daily)' : '📌 QR Code ถาวร (Static)'}
              </span>
              <h2 className="text-xl font-extrabold text-ink pt-2">
                สแกนเพื่อเช็กชื่อเข้าแถวหน้าเสาธง
              </h2>
              <p className="text-xs text-muted">
                เปิดกล้องบนสมาร์ตโฟนเพื่อสแกน QR Code นี้ แล้วถ่ายภาพเพื่อยืนยันการเข้าแถว
              </p>
            </div>

            {/* Big QR Code Canvas */}
            <div className="p-4 bg-white border-2 border-hairline rounded-2xl inline-block mx-auto shadow-md">
              <QRCodeSVG
                value={qrUrl}
                size={260}
                level="H"
                includeMargin
              />
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 bg-surface-soft border border-hairline rounded-lg font-mono text-[11px] text-muted break-all">
                {qrUrl}
              </div>
              <div className="text-muted-soft text-[11px]">
                เวลาเปิดรับ: {settings?.start_time} - {settings?.close_time} น. (สายหลัง {settings?.late_time} น.)
              </div>
            </div>

            <div className="flex gap-2 justify-center pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="h-10 px-4 bg-canvas border border-hairline rounded-lg text-xs font-bold text-ink hover:bg-surface-soft flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer size={15} />
                <span>พิมพ์ป้าย QR (Print)</span>
              </button>
              <a
                href={qrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-10 px-4 bg-primary hover:bg-primary-active text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <ExternalLink size={15} />
                <span>เปิดหน้าสแกนในแท็บใหม่</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
