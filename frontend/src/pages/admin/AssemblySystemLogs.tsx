import { useState, useEffect, useMemo, Fragment } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import {
  ShieldAlert,
  RefreshCw,
  Search,
  Globe,
  AlertTriangle,
  CheckCircle,
  Eye,
  X,
  Fingerprint,
  Smartphone,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import ThaiDatePicker from '../../components/ThaiDatePicker';
import Pagination from '../../components/Pagination';

interface FlaggedDetail {
  student_id: string;
  name: string;
  attended_at: string;
  reason: string;
}

interface AssemblySystemLog {
  id: number;
  date: string;
  student_id: string;
  prefix?: string;
  first_name: string;
  last_name: string;
  level: string;
  year: string;
  major_name: string;
  major_code: string;
  room: string;
  status: string;
  photo_path?: string | null;
  attended_at: string;
  device_uuid?: string | null;
  hardware_fingerprint?: string | null;
  ip_address?: string | null;
  confidence_score?: number | null;
  device_flags?: string | null;
  matched_location?: string | null;
  is_flagged: boolean;
  flagged_count: number;
  flagged_details: FlaggedDetail[];
}

interface AssemblyRejection {
  id: number;
  date: string;
  student_id: string;
  prefix?: string;
  first_name?: string;
  last_name?: string;
  level?: string;
  year?: string;
  major_name?: string;
  major_code?: string;
  room?: string;
  device_uuid?: string | null;
  hardware_fingerprint?: string | null;
  ip_address?: string | null;
  confidence_score?: number | null;
  device_flags?: string | null;
  rejection_reason: string;
  rejected_at: string;
}

interface AssemblySystemLogsProps {
  activeYear?: string;
  activeTerm?: string;
}

export default function AssemblySystemLogs({ activeYear: propYear, activeTerm: propTerm }: AssemblySystemLogsProps) {
  const outletCtx = useOutletContext<{ activeYear?: string; activeTerm?: string }>() || {};
  const activeYear = propYear || outletCtx.activeYear;
  const activeTerm = propTerm || outletCtx.activeTerm;

  const [logs, setLogs] = useState<AssemblySystemLog[]>([]);
  const [rejections, setRejections] = useState<AssemblyRejection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [activeTab, setActiveTab] = useState<'attendances' | 'rejections'>('attendances');
  const [search, setSearch] = useState('');
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Detail accordion & photo modal
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [viewPhotoUrl, setViewPhotoUrl] = useState<string | null>(null);

  const fetchLogsAndRejections = async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {};
      if (activeYear) params.academic_year = activeYear;
      if (activeTerm) params.term = activeTerm;
      if (selectedDate) params.date = selectedDate;

      const [logsRes, rejRes] = await Promise.all([
        axios.get('/api/assembly/systemlogs', { params }),
        axios.get('/api/assembly/rejections', { params })
      ]);

      setLogs(logsRes.data || []);
      setRejections(rejRes.data || []);
    } catch (err: any) {
      console.error('Error fetching assembly logs:', err);
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการโหลดบันทึกระบบเข้าแถว');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogsAndRejections();
  }, [activeYear, activeTerm, selectedDate]);

  const handleShiftDate = (days: number) => {
    const base = selectedDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    const parts = base.split('-').map(Number);
    if (parts.length !== 3) return;
    const [year, month, day] = parts;
    const current = new Date(year, month - 1, day);
    current.setDate(current.getDate() + days);
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    setSelectedDate(`${y}-${m}-${d}`);
  };

  const handleSetToday = () => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    setSelectedDate(todayStr);
  };

  const toggleRow = (id: number) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatThaiDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }) + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    } catch (e) {
      return dateStr;
    }
  };

  // Filtered lists
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (showFlaggedOnly && !log.is_flagged) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        log.student_id.toLowerCase().includes(q) ||
        `${log.prefix || ''}${log.first_name} ${log.last_name}`.toLowerCase().includes(q) ||
        (log.device_uuid && log.device_uuid.toLowerCase().includes(q)) ||
        (log.ip_address && log.ip_address.toLowerCase().includes(q)) ||
        (log.major_name && log.major_name.toLowerCase().includes(q))
      );
    });
  }, [logs, search, showFlaggedOnly]);

  const filteredRejections = useMemo(() => {
    return rejections.filter(rej => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        rej.student_id.toLowerCase().includes(q) ||
        `${rej.prefix || ''}${rej.first_name || ''} ${rej.last_name || ''}`.toLowerCase().includes(q) ||
        rej.rejection_reason.toLowerCase().includes(q) ||
        (rej.ip_address && rej.ip_address.toLowerCase().includes(q)) ||
        (rej.device_uuid && rej.device_uuid.toLowerCase().includes(q))
      );
    });
  }, [rejections, search]);

  const flaggedCount = useMemo(() => logs.filter(l => l.is_flagged).length, [logs]);

  // Pagination state (default 100 rows per page as requested)
  const [pageSize, setPageSize] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, showFlaggedOnly, selectedDate, activeTab, pageSize]);

  const totalItems = activeTab === 'attendances' ? filteredLogs.length : filteredRejections.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  const paginatedRejections = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRejections.slice(start, start + pageSize);
  }, [filteredRejections, currentPage, pageSize]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-hairline pb-4">
        <div>
          <h1 className="text-xl font-bold text-ink flex items-center gap-2">
            <ShieldAlert size={22} className="text-primary" />
            <span>บันทึกระบบและการตรวจสอบการทุจริต (เข้าแถวหน้าเสาธง)</span>
          </h1>
          <p className="text-xs text-muted">
            ตรวจจับการใช้อุปกรณ์เครื่องเดียวกันสแกนแทนกัน (Device Fingerprint), IP ซ้ำซ้อน, และประวัติการถูกปฏิเสธ (ปี {activeYear || '2569'} / เทอม {activeTerm || '1'})
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={fetchLogsAndRejections}
          className="px-3.5 py-1.5 bg-canvas hover:bg-surface-soft border border-hairline rounded-lg text-xs font-bold text-ink flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>รีเฟรชข้อมูล</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-canvas border border-hairline p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-xs font-bold text-muted block">รายการเช็กชื่อเข้าแถวทั้งหมด</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-ink font-mono">{logs.length}</span>
            <span className="text-xs text-muted">รายการ</span>
          </div>
        </div>

        <div className="bg-canvas border border-rose-200 p-4 rounded-2xl shadow-xs space-y-1 bg-rose-50/20">
          <span className="text-xs font-bold text-rose-700 flex items-center gap-1">
            <AlertTriangle size={14} />
            <span>รายการต้องสงสัย / เครื่องซ้ำ (Flagged)</span>
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-rose-600 font-mono">{flaggedCount}</span>
            <span className="text-xs text-rose-600 font-bold">
              {logs.length > 0 ? `${Math.round((flaggedCount / logs.length) * 100)}% ของทั้งหมด` : '0%'}
            </span>
          </div>
        </div>

        <div className="bg-canvas border border-amber-200 p-4 rounded-2xl shadow-xs space-y-1 bg-amber-50/20">
          <span className="text-xs font-bold text-amber-700 flex items-center gap-1">
            <ShieldAlert size={14} />
            <span>รายการที่ถูกปฏิเสธ (Rejections)</span>
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-amber-600 font-mono">{rejections.length}</span>
            <span className="text-xs text-amber-600 font-bold">พยายามสแกนไม่ผ่าน</span>
          </div>
        </div>
      </div>

      {/* Toolbar & Tab Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-canvas border border-hairline p-3.5 rounded-2xl shadow-xs">
        {/* Left: Tab Buttons */}
        <div className="flex items-center gap-1 bg-surface-soft p-1 rounded-xl border border-hairline w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('attendances')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'attendances'
                ? 'bg-canvas text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            ประวัติการเช็กชื่อและสถิติเครื่อง ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rejections')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'rejections'
                ? 'bg-canvas text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            }`}
          >
            รายการที่ถูกปฏิเสธ ({rejections.length})
          </button>
        </div>

        {/* Right: Date Filter & Search */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-surface-soft p-1 rounded-xl border border-hairline text-xs">
            <button
              type="button"
              onClick={() => handleShiftDate(-1)}
              className="p-1.5 hover:bg-canvas rounded text-muted hover:text-ink cursor-pointer"
              title="ย้อนหลัง 1 วัน"
            >
              <ChevronLeft size={13} />
            </button>
            <div className="w-40 sm:w-44">
              <ThaiDatePicker
                value={selectedDate}
                onChange={setSelectedDate}
                size="sm"
                placeholder="ทุกวัน (ทั้งหมด)"
                clearable
                format="short"
              />
            </div>
            <button
              type="button"
              onClick={() => handleShiftDate(1)}
              className="p-1.5 hover:bg-canvas rounded text-muted hover:text-ink cursor-pointer"
              title="ถัดไป 1 วัน"
            >
              <ChevronRight size={13} />
            </button>
            <button
              type="button"
              onClick={handleSetToday}
              className="px-2 py-1 bg-canvas hover:bg-surface-strong border border-hairline rounded-lg text-[10px] font-bold text-muted hover:text-ink cursor-pointer"
            >
              วันนี้
            </button>
            {selectedDate && (
              <button
                type="button"
                onClick={() => setSelectedDate('')}
                className="px-2 py-1 bg-canvas hover:bg-surface-strong border border-hairline rounded-lg text-[10px] font-bold text-muted hover:text-ink cursor-pointer"
                title="แสดงทั้งหมดทุกวัน"
              >
                ทั้งหมด
              </button>
            )}
          </div>

          {activeTab === 'attendances' && (
            <label className="flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1.5 rounded-xl border border-rose-200 cursor-pointer">
              <input
                type="checkbox"
                checked={showFlaggedOnly}
                onChange={e => setShowFlaggedOnly(e.target.checked)}
                className="rounded text-rose-600 focus:ring-rose-500"
              />
              <span>เฉพาะรายการต้องสงสัย ({flaggedCount})</span>
            </label>
          )}

          <div className="relative w-full sm:w-56">
            <Search size={14} className="absolute left-3 top-2.5 text-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหารหัส, ชื่อ, IP, หรือ UUID..."
              className="w-full h-9 pl-9 pr-3 border border-hairline rounded-xl text-xs bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-medium"
            />
          </div>
        </div>
      </div>

      {/* TAB 1: ATTENDANCES & DEVICE FLAGS */}
      {activeTab === 'attendances' && (
        <div className="bg-canvas border border-hairline rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-soft border-b border-hairline text-muted font-bold">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">ลำดับ</th>
                  <th className="py-3 px-4 w-32">วันที่ / เวลา</th>
                  <th className="py-3 px-4 w-28">รหัสนักศึกษา</th>
                  <th className="py-3 px-4">ชื่อ - นามสกุล</th>
                  <th className="py-3 px-4 text-center w-24">สถานะ</th>
                  <th className="py-3 px-4 text-center w-20">รูปภาพ</th>
                  <th className="py-3 px-4">อุปกรณ์ & IP</th>
                  <th className="py-3 px-4 text-center w-36">การตรวจสอบทุจริต</th>
                  <th className="py-3 px-4 w-12 text-center">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted">กำลังโหลดข้อมูล...</td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted">ไม่พบบันทึกการเข้าแถวตามเงื่อนไข</td>
                  </tr>
                ) : (
                  paginatedLogs.map((log, idx) => {
                    const isExpanded = !!expandedRows[log.id];
                    const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                    return (
                      <Fragment key={log.id}>
                        <tr className={`hover:bg-surface-soft/40 transition-colors ${log.is_flagged ? 'bg-rose-50/20' : ''}`}>
                          <td className="py-3 px-4 text-center font-mono text-muted">{rowNumber}</td>
                          <td className="py-3 px-4 text-[11px] font-mono text-muted">
                            {formatThaiDateTime(log.attended_at)}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-ink">{log.student_id}</td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-ink block">
                              {log.prefix || ''}{log.first_name} {log.last_name}
                            </span>
                            <span className="text-[10px] text-muted block">
                              {log.level} {log.year} • {log.major_name} ({log.room})
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {log.status === 'present' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">ทันเวลา</span>
                            ) : log.status === 'late' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">มาสาย</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">ลา</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {log.photo_path ? (
                              <button
                                type="button"
                                onClick={() => setViewPhotoUrl(log.photo_path!)}
                                className="p-1 rounded bg-surface-soft hover:bg-primary hover:text-white border border-hairline inline-flex items-center gap-1 transition-colors cursor-pointer"
                                title="ดูภาพถ่าย"
                              >
                                <Eye size={12} />
                              </button>
                            ) : (
                              <span className="text-muted-soft text-[11px]">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 space-y-0.5">
                            {log.device_uuid ? (
                              <span className="font-mono text-[10px] text-muted flex items-center gap-1" title={log.device_uuid}>
                                <Smartphone size={11} className="text-primary shrink-0" />
                                <span className="truncate max-w-[120px]">{log.device_uuid.slice(0, 10)}...</span>
                              </span>
                            ) : null}
                            {log.hardware_fingerprint ? (
                              <span className="font-mono text-[10px] text-muted flex items-center gap-1" title={log.hardware_fingerprint}>
                                <Fingerprint size={11} className="text-emerald-600 shrink-0" />
                                <span className="truncate max-w-[120px]">{log.hardware_fingerprint.slice(0, 10)}...</span>
                              </span>
                            ) : null}
                            {log.ip_address && (
                              <span className="font-mono text-[10px] text-muted-soft flex items-center gap-1">
                                <Globe size={11} className="shrink-0" />
                                <span>{log.ip_address}</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {log.is_flagged ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse inline-flex items-center gap-1">
                                <AlertTriangle size={11} />
                                <span>พบเครื่องซ้ำ ({log.flagged_count})</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                                <CheckCircle size={11} />
                                <span>ปกติ</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => toggleRow(log.id)}
                              className="p-1 rounded hover:bg-surface-soft text-muted hover:text-ink transition-colors cursor-pointer"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          </td>
                        </tr>

                        {/* Expandable row for fraud matches */}
                        {isExpanded && (
                          <tr className="bg-surface-soft/60">
                            <td colSpan={9} className="p-4 space-y-2 text-xs">
                              <div className="font-bold text-ink">รายละเอียดและประวัติอุปกรณ์ที่ตรวจพบ:</div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="bg-canvas p-3 rounded-xl border border-hairline space-y-1">
                                  <span className="text-[10px] text-muted font-bold block uppercase">ข้อมูลอุปกรณ์ปัจจุบัน:</span>
                                  <div className="font-mono text-[11px] text-ink break-all">UUID: {log.device_uuid || '-'}</div>
                                  <div className="font-mono text-[11px] text-ink break-all">Fingerprint: {log.hardware_fingerprint || '-'}</div>
                                  <div className="font-mono text-[11px] text-ink">IP: {log.ip_address || '-'}</div>
                                  <div className="text-[11px] text-muted">พิกัดสถานที่: {log.matched_location || '-'}</div>
                                </div>

                                <div className="bg-canvas p-3 rounded-xl border border-hairline space-y-1.5">
                                  <span className="text-[10px] text-rose-700 font-bold block uppercase">
                                    รายการชนกัน / ตรวจพบการใช้งานซ้ำ ({log.flagged_details.length}):
                                  </span>
                                  {log.flagged_details.length === 0 ? (
                                    <span className="text-xs text-emerald-600">ไม่พบประวัติการใช้งานซ้ำซ้อนในวันเดียวกัน</span>
                                  ) : (
                                    <div className="space-y-1 max-h-32 overflow-y-auto">
                                      {log.flagged_details.map((m, mIdx) => (
                                        <div key={mIdx} className="p-1.5 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-900 flex justify-between items-center">
                                          <span>{m.name} ({m.student_id})</span>
                                          <span className="text-[10px] text-rose-700 font-bold">{m.reason}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredLogs.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[50, 100, 200, 500]}
          />
        </div>
      )}

      {/* TAB 2: REJECTIONS LOG */}
      {activeTab === 'rejections' && (
        <div className="bg-canvas border border-hairline rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-soft border-b border-hairline text-muted font-bold">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">ลำดับ</th>
                  <th className="py-3 px-4 w-36">วันเวลาที่ถูกปฏิเสธ</th>
                  <th className="py-3 px-4 w-28">รหัสนักศึกษา</th>
                  <th className="py-3 px-4">ชื่อ - นามสกุล</th>
                  <th className="py-3 px-4">สาเหตุที่ไม่สามารถเช็กชื่อได้</th>
                  <th className="py-3 px-4">อุปกรณ์ & IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted">กำลังโหลดข้อมูล...</td>
                  </tr>
                ) : filteredRejections.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted">ไม่พบรายการที่ถูกปฏิเสธ</td>
                  </tr>
                ) : (
                  paginatedRejections.map((rej, idx) => {
                    const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                    return (
                      <tr key={rej.id} className="hover:bg-surface-soft/40 transition-colors">
                        <td className="py-3 px-4 text-center font-mono text-muted">{rowNumber}</td>
                        <td className="py-3 px-4 text-[11px] font-mono text-muted">
                          {formatThaiDateTime(rej.rejected_at)}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-ink">{rej.student_id}</td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-ink block">
                            {rej.prefix || ''}{rej.first_name || ''} {rej.last_name || ''}
                          </span>
                          {rej.major_name && (
                            <span className="text-[10px] text-muted block">
                              {rej.level} {rej.year} • {rej.major_name} ({rej.room})
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-semibold text-rose-700">
                          {rej.rejection_reason}
                        </td>
                        <td className="py-3 px-4 space-y-0.5">
                          {rej.device_uuid && (
                            <span className="font-mono text-[10px] text-muted flex items-center gap-1">
                              <Smartphone size={11} className="shrink-0 text-primary" />
                              <span className="truncate max-w-[120px]">{rej.device_uuid.slice(0, 10)}...</span>
                            </span>
                          )}
                          {rej.ip_address && (
                            <span className="font-mono text-[10px] text-muted-soft flex items-center gap-1">
                              <Globe size={11} className="shrink-0" />
                              <span>{rej.ip_address}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredRejections.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[50, 100, 200, 500]}
          />
        </div>
      )}

      {/* Full Photo Modal */}
      {viewPhotoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative bg-canvas border border-hairline rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold text-ink">ภาพถ่ายหลักฐานในแถว</span>
              <button
                type="button"
                onClick={() => setViewPhotoUrl(null)}
                className="w-7 h-7 rounded-full border border-hairline flex items-center justify-center hover:bg-surface-soft text-muted hover:text-ink cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            <img src={viewPhotoUrl} alt="หลักฐาน" className="w-full max-h-[70vh] object-contain rounded-xl" />
          </div>
        </div>
      )}
    </div>
  );
}
