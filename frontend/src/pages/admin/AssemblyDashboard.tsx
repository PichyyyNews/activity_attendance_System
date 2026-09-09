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
  Power
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
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

export default function AssemblyDashboard({ activeYear: propYear, activeTerm: propTerm }: AssemblyDashboardProps) {
  const outletCtx = useOutletContext<{ activeYear?: string; activeTerm?: string }>() || {};
  const activeYear = propYear || outletCtx.activeYear;
  const activeTerm = propTerm || outletCtx.activeTerm;

  const [data, setData] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // QR Modal state
  const [showQrModal, setShowQrModal] = useState(false);
  const [overrideLoading, setOverrideLoading] = useState(false);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const params: any = {};
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
  }, [activeYear, activeTerm]);

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
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-soft border border-hairline p-5 rounded-2xl shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
            <span className="text-xs font-bold text-primary uppercase tracking-wider">
              Morning Assembly System • ประจำปี {settings?.academic_year} เทอม {settings?.term}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight">
            ภาพรวมการเข้าแถวหน้าเสาธง
          </h1>
          <p className="text-xs text-muted">
            วันที่: {data?.today_date ? new Date(data.today_date).toLocaleDateString('th-TH', { dateStyle: 'full' }) : 'วันนี้'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
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
            className="h-9 px-4 bg-primary hover:bg-primary-active text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <QrCode size={15} />
            <span>ฉาย QR Code เข้าแถว</span>
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

      {/* KPI Cards Grid */}
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
          <div className="text-[11px] text-muted">
            ตรงต่อเวลา
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

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Bar Chart (Last 14 Days) */}
        <div className="lg:col-span-2 bg-canvas border border-hairline p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <TrendingUp size={16} className="text-primary" />
                <span>แนวโน้มการเข้าแถวย้อนหลัง 14 วัน</span>
              </h2>
              <p className="text-xs text-muted">จำนวนนักศึกษาที่ มาทันเวลา vs มาสาย vs ขาด ในแต่ละวัน</p>
            </div>
            <Link
              to="/admin/assembly/attendance"
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
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
                <BarChart data={data.trend} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
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
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#71717a' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', fontSize: '11px' }}
                    labelFormatter={(label: any) => `วันที่ ${label}`}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="present" name="ทันเวลา" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="late" name="มาสาย" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="leave" name="ลา" stackId="a" fill="#0ea5e9" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="absent" name="ขาด" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Donut Chart: Today's Breakdown */}
        <div className="bg-canvas border border-hairline p-5 rounded-2xl shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold text-ink">สัดส่วนการเข้าแถววันนี้</h2>
            <p className="text-xs text-muted">แบ่งตามสถานะการเข้าแถว</p>
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
            {/* Center Rate Text */}
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
              <span className="text-muted">ทันเวลา: <strong>{data?.today?.present || 0}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="text-muted">มาสาย: <strong>{data?.today?.late || 0}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
              <span className="text-muted">ลา: <strong>{data?.today?.leave || 0}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span className="text-muted">ขาด: <strong>{data?.today?.absent || 0}</strong></span>
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
