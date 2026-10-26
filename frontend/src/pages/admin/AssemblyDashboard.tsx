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
  Layers,
  Zap,
  Pin
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

  // Controls
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
    <div className="space-y-6 max-w-7xl mx-auto pb-16 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-hairline pb-4">
        <div>
          <h1 className="text-xl font-bold text-ink">ภาพรวมและสถิติการเข้าแถวหน้าเสาธง</h1>
          <p className="text-xs text-muted mt-0.5">
            ปีการศึกษา {settings?.academic_year || activeYear || '2569'} / เทอม {settings?.term || activeTerm || '1'} • {data?.today_date ? new Date(data.today_date).toLocaleDateString('th-TH', { dateStyle: 'long' }) : 'วันนี้'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={overrideLoading}
            onClick={handleToggleOverride}
            className={`h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
              isOverrideActive
                ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                : 'bg-canvas border-hairline text-ink hover:bg-surface-soft'
            }`}
            title="เปิดรอบพิเศษนอกช่วงเวลาปกติ"
          >
            <Power size={13} className={isOverrideActive ? 'text-rose-600' : 'text-muted'} />
            <span>{isOverrideActive ? 'ปิดรอบพิเศษ' : 'เปิดรอบพิเศษ'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="h-9 px-3.5 bg-primary hover:bg-primary-active text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
          >
            <QrCode size={14} />
            <span>ฉาย QR Code</span>
          </button>

          <Link
            to="/admin/assembly/settings"
            className="h-9 px-3 bg-canvas hover:bg-surface-soft border border-hairline text-ink rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Settings size={13} className="text-muted" />
            <span>ตั้งค่า</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-xl flex items-center gap-2">
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Today Checked-In */}
        <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-muted text-xs">
            <span className="font-medium">เข้าแถววันนี้</span>
            <Users size={15} className="text-primary" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-ink font-mono">
              {loading ? '-' : data?.today?.checked_in || 0}
            </span>
            <span className="text-xs text-muted">/ {data?.total_students || 0} คน</span>
          </div>
          <div className="text-[11px] font-semibold text-primary">
            คิดเป็น {loading ? '-' : data?.today?.rate || 0}%
          </div>
        </div>

        {/* Card 2: On-Time */}
        <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-muted text-xs">
            <span className="font-medium">ทันเวลา</span>
            <CheckCircle2 size={15} className="text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
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
        <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-muted text-xs">
            <span className="font-medium">มาสาย</span>
            <Clock size={15} className="text-amber-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
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
        <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-muted text-xs">
            <span className="font-medium">ลา</span>
            <Calendar size={15} className="text-sky-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
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
        <div className="col-span-2 lg:col-span-1 bg-canvas border border-hairline p-4 rounded-xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-muted text-xs">
            <span className="font-medium">ขาดแถว</span>
            <AlertCircle size={15} className="text-rose-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
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

      {/* Control Strip: Tabs & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-canvas border border-hairline p-2.5 rounded-xl shadow-2xs">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-surface-soft p-1 rounded-lg border border-hairline overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-canvas text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            <BarChart2 size={13} />
            <span>ภาพรวม & แนวโน้ม</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('temporal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'temporal'
                ? 'bg-canvas text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            <Clock size={13} />
            <span>พฤติกรรมเวลา</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('demographics')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'demographics'
                ? 'bg-canvas text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            <Layers size={13} />
            <span>ระดับชั้น & สาขา</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('risk')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'risk'
                ? 'bg-canvas text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            <Target size={13} />
            <span>วิเคราะห์กลุ่มเสี่ยง</span>
          </button>
        </div>

        {/* Filter Selectors */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1 bg-surface-soft px-2 py-1 rounded-lg border border-hairline">
            <span className="text-muted text-[11px]">ระดับ:</span>
            <select
              value={levelFilter}
              onChange={e => setLevelFilter(e.target.value as any)}
              className="bg-transparent font-semibold text-ink text-xs focus:outline-none cursor-pointer"
            >
              <option value="all">ทั้งหมด</option>
              <option value="ปวช">ปวช.</option>
              <option value="ปวส">ปวส.</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-surface-soft px-2 py-1 rounded-lg border border-hairline">
            <span className="text-muted text-[11px]">ช่วงเวลา:</span>
            <select
              value={timeframe}
              onChange={e => setTimeframe(e.target.value as any)}
              className="bg-transparent font-semibold text-ink text-xs focus:outline-none cursor-pointer"
            >
              <option value="7d">7 วันล่าสุด</option>
              <option value="14d">14 วันล่าสุด</option>
              <option value="30d">30 วันล่าสุด</option>
              <option value="term">ทั้งภาคเรียน</option>
            </select>
          </div>
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Trend Chart */}
            <div className="lg:col-span-2 bg-canvas border border-hairline p-5 rounded-xl shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-hairline pb-3">
                <div className="space-y-0.5">
                  <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                    <TrendingUp size={15} className="text-primary" />
                    <span>แนวโน้มการเข้าแถว</span>
                  </h2>
                  <p className="text-xs text-muted">
                    อัตราเฉลี่ย: <strong className="text-ink font-semibold">{data?.timeframe_overview?.avg_attendance_rate || 0}%</strong> • ทันเวลาเฉลี่ย: <strong className="text-emerald-600 font-semibold">{data?.timeframe_overview?.avg_on_time_rate || 0}%</strong>
                  </p>
                </div>
                <Link
                  to="/admin/assembly/attendance"
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5"
                >
                  <span>ตารางเต็ม</span>
                  <ChevronRight size={13} />
                </Link>
              </div>

              <div className="h-68 w-full pt-1">
                {loading ? (
                  <div className="h-full flex items-center justify-center text-muted text-xs">กำลังโหลดข้อมูล...</div>
                ) : !data?.trend || data.trend.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted text-xs space-y-1">
                    <Calendar size={20} className="text-muted-soft" />
                    <span>ยังไม่มีประวัติการเช็กชื่อในรอบที่ผ่านมา</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.trend} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
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
                        domain={[0, 100]}
                        unit="%"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10, fill: '#71717a' }}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', fontSize: '11px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        labelFormatter={(label: any) => `วันที่ ${label}`}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Bar yAxisId="left" dataKey="present" name="ทันเวลา" stackId="a" fill="#10b981" />
                      <Bar yAxisId="left" dataKey="late" name="มาสาย" stackId="a" fill="#f59e0b" />
                      <Bar yAxisId="left" dataKey="leave" name="ลา" stackId="a" fill="#0ea5e9" />
                      <Bar yAxisId="left" dataKey="absent" name="ขาด" stackId="a" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="rate" name="อัตราเข้าแถว (%)" stroke="#6366f1" strokeWidth={2} dot={{ r: 2.5 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Donut Chart: Today's Breakdown */}
            <div className="bg-canvas border border-hairline p-5 rounded-xl shadow-2xs space-y-4 flex flex-col justify-between">
              <div className="border-b border-hairline pb-3 space-y-0.5">
                <h2 className="text-sm font-bold text-ink">สัดส่วนการเข้าแถววันนี้</h2>
                <p className="text-xs text-muted">แบ่งตามสถานะการเข้าแถว</p>
              </div>

              <div className="h-52 flex items-center justify-center relative">
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
                        innerRadius={50}
                        outerRadius={75}
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
                    <span className="text-xl font-extrabold text-ink font-mono">{data.today.rate}%</span>
                    <span className="text-[10px] text-muted">อัตราเข้าแถว</span>
                  </div>
                )}
              </div>

              {/* Legend Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-hairline">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-muted">ทันเวลา: <strong className="text-ink font-mono">{data?.today?.present || 0}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-muted">มาสาย: <strong className="text-ink font-mono">{data?.today?.late || 0}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-500" />
                  <span className="text-muted">ลา: <strong className="text-ink font-mono">{data?.today?.leave || 0}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-muted">ขาด: <strong className="text-ink font-mono">{data?.today?.absent || 0}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Department Rankings Table */}
          <div className="bg-canvas border border-hairline rounded-xl shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-ink">สถิติการเข้าแถวรายสาขาวิชา (วันนี้)</h2>
                <p className="text-xs text-muted">เรียงลำดับจากสาขาวิชาที่มีอัตราการเข้าแถวสูงสุด</p>
              </div>
              <Link
                to="/admin/assembly/attendance"
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <span>ดูรายชื่อนักเรียนรายห้อง</span>
                <ChevronRight size={13} />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-soft/60 border-b border-hairline text-muted font-semibold text-[11px]">
                  <tr>
                    <th className="py-2.5 px-4 w-12 text-center">อันดับ</th>
                    <th className="py-2.5 px-4">รหัสสาขา</th>
                    <th className="py-2.5 px-4">ชื่อสาขาวิชา</th>
                    <th className="py-2.5 px-4 text-center">นักศึกษาทั้งหมด</th>
                    <th className="py-2.5 px-4 text-center">เข้าแถวแล้ว</th>
                    <th className="py-2.5 px-4 text-center w-36">อัตราการเข้าแถว</th>
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
                        <td className="py-2.5 px-4 text-center font-bold text-muted font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-4 font-mono font-bold text-ink">{dept.major_code}</td>
                        <td className="py-2.5 px-4 font-semibold text-ink">{dept.major_name || dept.major_code}</td>
                        <td className="py-2.5 px-4 text-center font-mono text-muted">{dept.total_students} คน</td>
                        <td className="py-2.5 px-4 text-center font-mono font-bold text-emerald-600">{dept.checked_in} คน</td>
                        <td className="py-2.5 px-4 text-center">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-surface-soft rounded-full h-1.5 overflow-hidden border border-hairline">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  dept.rate >= 80 ? 'bg-emerald-500' : dept.rate >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                }`}
                                style={{ width: `${dept.rate}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-ink w-9 text-right">{dept.rate}%</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-2xs flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
                <Flame size={17} />
              </div>
              <div>
                <p className="text-[11px] text-muted">ช่วงเวลาเข้าแถวหนาแน่นที่สุด (Peak)</p>
                <h3 className="text-sm font-bold text-ink font-mono mt-0.5">
                  {data?.time_distribution?.peak_slot || '07:45 - 08:00'} น.
                </h3>
              </div>
            </div>

            <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-2xs flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
                <Target size={17} />
              </div>
              <div>
                <p className="text-[11px] text-muted">วันที่มีอัตราเข้าแถวสูงสุด</p>
                <h3 className="text-sm font-bold text-ink mt-0.5">
                  {(() => {
                    if (!data?.day_of_week_stats || data.day_of_week_stats.length === 0) return 'ไม่มีข้อมูล';
                    const best = [...data.day_of_week_stats].sort((a: any, b: any) => b.rate - a.rate)[0];
                    return best ? `${best.day} (${best.rate}%)` : 'ไม่มีข้อมูล';
                  })()}
                </h3>
              </div>
            </div>

            <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-2xs flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center shrink-0">
                <Clock size={17} />
              </div>
              <div>
                <p className="text-[11px] text-muted">อัตราตรงเวลาเฉลี่ย (On-Time)</p>
                <h3 className="text-sm font-bold text-ink font-mono mt-0.5">
                  {data?.timeframe_overview?.avg_on_time_rate || 0}%
                </h3>
              </div>
            </div>
          </div>

          {/* Temporal Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-canvas border border-hairline p-5 rounded-xl shadow-2xs space-y-4">
              <div className="border-b border-hairline pb-3 space-y-0.5">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Clock size={15} className="text-primary" />
                  <span>การกระจายตัวของเวลาสแกนเช็กชื่อ (15-Minute Histogram)</span>
                </h2>
                <p className="text-xs text-muted">แยกสถานะทันเวลา vs มาสาย</p>
              </div>

              <div className="h-68 w-full pt-1">
                {loading ? (
                  <div className="h-full flex items-center justify-center text-muted text-xs">กำลังโหลดข้อมูล...</div>
                ) : !data?.time_distribution?.buckets ? (
                  <div className="h-full flex items-center justify-center text-muted text-xs">ยังไม่มีข้อมูลเวลาสแกน</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.time_distribution.buckets} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="slot" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#71717a' }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#71717a' }} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', fontSize: '11px' }}
                        formatter={(val: any, name: any) => [`${val} คน`, name]}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Bar dataKey="present" name="ทันเวลา" stackId="t" fill="#10b981" />
                      <Bar dataKey="late" name="มาสาย" stackId="t" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Day of Week Pattern */}
            <div className="bg-canvas border border-hairline p-5 rounded-xl shadow-2xs space-y-4">
              <div className="border-b border-hairline pb-3 space-y-0.5">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Calendar size={15} className="text-primary" />
                  <span>พฤติกรรมตามวัน (Day-of-Week)</span>
                </h2>
                <p className="text-xs text-muted">อัตราเข้าแถวเฉลี่ยในแต่ละวัน</p>
              </div>

              <div className="h-68 w-full pt-1">
                {loading ? (
                  <div className="h-full flex items-center justify-center text-muted text-xs">กำลังโหลดข้อมูล...</div>
                ) : !data?.day_of_week_stats ? (
                  <div className="h-full flex items-center justify-center text-muted text-xs">ไม่มีข้อมูลวันในสัปดาห์</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.day_of_week_stats} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
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
                      <Bar dataKey="rate" name="อัตราเข้าแถว (%)" fill="#6366f1" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Location & Geofencing Stats */}
          <div className="bg-canvas border border-hairline p-5 rounded-xl shadow-2xs space-y-3">
            <div className="border-b border-hairline pb-3 space-y-0.5">
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <MapPin size={15} className="text-primary" />
                <span>พิกัดจุดสแกนเช็กชื่อ (Geofencing Locations)</span>
              </h2>
              <p className="text-xs text-muted">จุดที่ระบบตรวจพบพิกัด GPS ขณะนักศึกษายืนยันการเข้าแถว</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
              {loading ? (
                <div className="col-span-full py-6 text-center text-muted text-xs">กำลังโหลดพิกัด...</div>
              ) : !data?.location_stats || data.location_stats.length === 0 ? (
                <div className="col-span-full py-6 text-center text-muted text-xs">ยังไม่มีข้อมูลจุดสแกนในระบบ</div>
              ) : (
                data.location_stats.map((loc: any, idx: number) => (
                  <div key={idx} className="p-3 bg-surface-soft border border-hairline rounded-lg flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
                        <Compass size={13} className="text-primary" />
                        <span>{loc.name}</span>
                      </p>
                      <p className="text-[10px] text-muted">ยืนยันพิกัดถูกต้อง</p>
                    </div>
                    <span className="text-sm font-bold text-ink font-mono bg-canvas px-2.5 py-0.5 rounded border border-hairline">
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Level Stats Bar Chart */}
            <div className="lg:col-span-2 bg-canvas border border-hairline p-5 rounded-xl shadow-2xs space-y-4">
              <div className="border-b border-hairline pb-3 space-y-0.5">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Layers size={15} className="text-primary" />
                  <span>เปรียบเทียบตามระดับชั้น (Level & Year)</span>
                </h2>
                <p className="text-xs text-muted">เปรียบเทียบ ปวช.1-3 และ ปวส.1-2 (วันนี้)</p>
              </div>

              <div className="h-68 w-full pt-1">
                {loading ? (
                  <div className="h-full flex items-center justify-center text-muted text-xs">กำลังโหลดข้อมูล...</div>
                ) : !data?.level_stats || data.level_stats.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted text-xs">ไม่มีข้อมูลระดับชั้น</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.level_stats} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#71717a' }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#71717a' }} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', fontSize: '11px' }}
                        formatter={(val: any, name: any) => [`${val} คน`, name]}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Bar dataKey="present" name="ทันเวลา" stackId="l" fill="#10b981" />
                      <Bar dataKey="late" name="มาสาย" stackId="l" fill="#f59e0b" />
                      <Bar dataKey="absent" name="ขาด" stackId="l" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Gender Stats Cards */}
            <div className="bg-canvas border border-hairline p-5 rounded-xl shadow-2xs space-y-4 flex flex-col justify-between">
              <div className="border-b border-hairline pb-3 space-y-0.5">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Users size={15} className="text-primary" />
                  <span>สัดส่วนตามเพศ (Gender)</span>
                </h2>
                <p className="text-xs text-muted">เปรียบเทียบพฤติกรรม ชาย vs หญิง</p>
              </div>

              <div className="space-y-3 pt-1">
                {loading ? (
                  <div className="py-8 text-center text-muted text-xs">กำลังโหลด...</div>
                ) : !data?.gender_stats || data.gender_stats.length === 0 ? (
                  <div className="py-8 text-center text-muted text-xs">ไม่มีข้อมูลเพศ</div>
                ) : (
                  data.gender_stats.map((g: any) => (
                    <div key={g.gender} className="p-3.5 bg-surface-soft border border-hairline rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: g.color || '#3b82f6' }}
                          />
                          <span className="font-bold text-xs text-ink">นักศึกษา{g.gender}</span>
                        </div>
                        <span className="font-mono font-bold text-xs text-ink">{g.rate}%</span>
                      </div>

                      <div className="w-full bg-canvas rounded-full h-1.5 overflow-hidden border border-hairline">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${g.rate}%`,
                            backgroundColor: g.color || '#3b82f6'
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted pt-0.5">
                        <span>เข้าแถว {g.checked_in} / {g.total} คน</span>
                        <span className="text-emerald-600 font-semibold">ทันเวลา {g.on_time_rate}%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-2.5 bg-surface-soft border border-hairline rounded-lg text-[11px] text-muted flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-primary shrink-0" />
                <span>จำแนกอัตโนมัติจากคำนำหน้าชื่อ</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: RISK & ANTI-FRAUD */}
      {activeTab === 'risk' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Risk Segmentation 3-Tier Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Good Tier */}
            <div className="bg-canvas border border-emerald-200/80 p-4 rounded-xl shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  เกณฑ์ผ่านกิจกรรม (&ge; 80%)
                </span>
                <CheckCircle2 size={15} className="text-emerald-500" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-2xl font-extrabold text-ink font-mono">
                  {data?.risk_segmentation?.good?.count || 0}
                  <span className="text-xs text-muted font-normal ml-1">คน</span>
                </h3>
                <p className="text-xs text-muted">
                  คิดเป็น <strong className="text-emerald-600 font-mono">{data?.risk_segmentation?.good?.percentage || 0}%</strong> ของทั้งหมด
                </p>
              </div>
              <div className="w-full bg-surface-soft rounded-full h-1.5 overflow-hidden border border-hairline">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${data?.risk_segmentation?.good?.percentage || 0}%` }}
                />
              </div>
            </div>

            {/* Warning Tier */}
            <div className="bg-canvas border border-amber-200/80 p-4 rounded-xl shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  กลุ่มเฝ้าระวัง (60 - 79%)
                </span>
                <AlertTriangle size={15} className="text-amber-500" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-2xl font-extrabold text-ink font-mono">
                  {data?.risk_segmentation?.warning?.count || 0}
                  <span className="text-xs text-muted font-normal ml-1">คน</span>
                </h3>
                <p className="text-xs text-muted">
                  คิดเป็น <strong className="text-amber-600 font-mono">{data?.risk_segmentation?.warning?.percentage || 0}%</strong> ของทั้งหมด
                </p>
              </div>
              <div className="w-full bg-surface-soft rounded-full h-1.5 overflow-hidden border border-hairline">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${data?.risk_segmentation?.warning?.percentage || 0}%` }}
                />
              </div>
            </div>

            {/* Critical Tier */}
            <div className="bg-canvas border border-rose-200/80 p-4 rounded-xl shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  เสี่ยงตกกิจกรรม (&lt; 60%)
                </span>
                <ShieldAlert size={15} className="text-rose-500" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-2xl font-extrabold text-ink font-mono">
                  {data?.risk_segmentation?.critical?.count || 0}
                  <span className="text-xs text-muted font-normal ml-1">คน</span>
                </h3>
                <p className="text-xs text-muted">
                  คิดเป็น <strong className="text-rose-600 font-mono">{data?.risk_segmentation?.critical?.percentage || 0}%</strong> ของทั้งหมด
                </p>
              </div>
              <div className="w-full bg-surface-soft rounded-full h-1.5 overflow-hidden border border-hairline">
                <div
                  className="h-full bg-rose-500 rounded-full"
                  style={{ width: `${data?.risk_segmentation?.critical?.percentage || 0}%` }}
                />
              </div>
            </div>
          </div>

          {/* At-Risk Classrooms Table & Anti-Fraud Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-canvas border border-hairline rounded-xl shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-hairline space-y-0.5">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <AlertTriangle size={15} className="text-rose-500" />
                  <span>5 ห้องเรียนที่มีอัตราการขาดแถวสูงสุด</span>
                </h2>
                <p className="text-xs text-muted">พิจารณาจากอัตราการเข้าแถวสะสมตลอดทั้งภาคเรียน</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-soft/60 border-b border-hairline text-muted font-semibold text-[11px]">
                    <tr>
                      <th className="py-2.5 px-4 w-10 text-center">#</th>
                      <th className="py-2.5 px-4">ระดับ / ห้องเรียน</th>
                      <th className="py-2.5 px-4">สาขาวิชา</th>
                      <th className="py-2.5 px-4 text-center">นักศึกษา</th>
                      <th className="py-2.5 px-4 text-center w-36">อัตราเข้าแถว</th>
                      <th className="py-2.5 px-4 text-center text-rose-600">ขาดสะสม</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted">กำลังโหลดข้อมูล...</td>
                      </tr>
                    ) : !data?.at_risk_rooms || data.at_risk_rooms.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted">ไม่พบข้อมูลห้องเรียนที่มีความเสี่ยง</td>
                      </tr>
                    ) : (
                      data.at_risk_rooms.map((rm: any, idx: number) => (
                        <tr key={idx} className="hover:bg-surface-soft/40 transition-colors">
                          <td className="py-2.5 px-4 text-center font-bold text-rose-600 font-mono">{idx + 1}</td>
                          <td className="py-2.5 px-4 font-bold text-ink">{rm.room_name}</td>
                          <td className="py-2.5 px-4 text-muted font-mono">{rm.major_code}</td>
                          <td className="py-2.5 px-4 text-center font-mono text-muted">{rm.total_students} คน</td>
                          <td className="py-2.5 px-4 text-center">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-surface-soft rounded-full h-1.5 overflow-hidden border border-hairline">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    rm.rate >= 80 ? 'bg-emerald-500' : rm.rate >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${rm.rate}%` }}
                                />
                              </div>
                              <span className="font-mono font-bold text-ink w-9 text-right">{rm.rate}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-center font-mono font-bold text-rose-600">
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
            <div className="bg-canvas border border-hairline p-5 rounded-xl shadow-2xs space-y-4 flex flex-col justify-between">
              <div className="border-b border-hairline pb-3 space-y-0.5">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <ShieldAlert size={15} className="text-primary" />
                  <span>สถิติการปฏิเสธ & ความปลอดภัย</span>
                </h2>
                <p className="text-xs text-muted">การสแกนที่ไม่ผ่านเงื่อนไขความปลอดภัย</p>
              </div>

              <div className="space-y-2.5 pt-1">
                {loading ? (
                  <div className="py-6 text-center text-muted text-xs">กำลังโหลด...</div>
                ) : !data?.rejection_summary || data.rejection_summary.length === 0 ? (
                  <div className="py-8 text-center text-muted text-xs space-y-2">
                    <CheckCircle2 size={20} className="text-emerald-500 mx-auto" />
                    <p>ไม่พบรายการปฏิเสธการเช็กชื่อในช่วงเวลานี้</p>
                  </div>
                ) : (
                  data.rejection_summary.map((rej: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-surface-soft border border-hairline rounded-lg flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-ink">{rej.rejection_reason || 'ไม่ผ่านเงื่อนไข'}</p>
                        <p className="text-[10px] text-muted">ถูกบล็อกโดยระบบ</p>
                      </div>
                      <span className="text-xs font-bold font-mono text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                        {rej.count} ครั้ง
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="p-2.5 bg-surface-soft border border-hairline rounded-lg text-[11px] text-muted space-y-0.5">
                <p className="font-semibold text-ink flex items-center gap-1.5">
                  <MapPin size={12} className="text-primary" />
                  <span>รัศมี GPS ปัจจุบัน: {settings?.gps_radius_meters || 100} เมตร</span>
                </p>
                <p>ระบบตรวจจับระยะพิกัด GPS ป้องกันการเช็กชื่อนอกพื้นที่</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Presentation Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-canvas border border-hairline rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 text-center animate-in zoom-in-95 duration-150 relative">
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 w-7 h-7 rounded-full bg-surface-soft text-muted hover:text-ink flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>

            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold px-3 py-0.5 rounded-full border border-primary/20">
                {settings?.qr_mode === 'dynamic' ? (
                  <>
                    <Zap size={12} className="text-amber-500" />
                    <span>QR Code รายวัน (Dynamic Daily)</span>
                  </>
                ) : (
                  <>
                    <Pin size={12} className="text-primary" />
                    <span>QR Code ถาวร (Static)</span>
                  </>
                )}
              </span>
              <h2 className="text-lg font-bold text-ink pt-1.5">
                สแกนเพื่อเช็กชื่อเข้าแถวหน้าเสาธง
              </h2>
              <p className="text-xs text-muted">
                เปิดกล้องบนสมาร์ตโฟนเพื่อสแกน QR Code แล้วถ่ายภาพยืนยัน
              </p>
            </div>

            <div className="p-3 bg-white border border-hairline rounded-xl inline-block mx-auto shadow-xs">
              <QRCodeSVG
                value={qrUrl}
                size={220}
                level="H"
                includeMargin
              />
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="p-2 bg-surface-soft border border-hairline rounded-lg font-mono text-[11px] text-muted break-all">
                {qrUrl}
              </div>
              <div className="text-muted text-[11px]">
                เวลาเปิดรับ: {settings?.start_time} - {settings?.close_time} น. (สายหลัง {settings?.late_time} น.)
              </div>
            </div>

            <div className="flex gap-2 justify-center pt-1">
              <button
                type="button"
                onClick={() => window.print()}
                className="h-9 px-3.5 bg-canvas border border-hairline rounded-lg text-xs font-semibold text-ink hover:bg-surface-soft flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer size={13} />
                <span>พิมพ์ป้าย QR</span>
              </button>
              <a
                href={qrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3.5 bg-primary hover:bg-primary-active text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <ExternalLink size={13} />
                <span>เปิดหน้าสแกน</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
