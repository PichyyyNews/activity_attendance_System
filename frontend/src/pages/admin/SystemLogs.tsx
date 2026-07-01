import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  ShieldAlert, RefreshCw, Search, HardDrive, 
  Globe, AlertTriangle, CheckCircle, Info, ChevronDown, ChevronUp 
} from 'lucide-react';

interface FlaggedDetail {
  student_id: string;
  name: string;
  attended_at: string;
}

interface SystemLog {
  id: number;
  session_id: number;
  prefix: string;
  first_name: string;
  last_name: string;
  student_id: string;
  major_name: string;
  class_year: string;
  major_code: string;
  room: string;
  attended_at: string;
  device_uuid: string | null;
  ip_address: string | null;
  session_title: string;
  week_number: number;
  is_flagged: boolean;
  flagged_count: number;
  flagged_details: FlaggedDetail[];
}

export default function AdminSystemLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filtering & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWeek, setSelectedWeek] = useState<string>('all');
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  
  // Expanded rows state for details
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/systemlogs');
      setLogs(res.data || []);
    } catch (err: any) {
      console.error('Error fetching system logs:', err);
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการดึงข้อมูลบันทึกระบบ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const toggleRow = (id: number) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Helper formats
  const formatThaiDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Bangkok'
      }) + ' น.';
    } catch (e) {
      return dateStr;
    }
  };

  // Get unique weeks for dropdown
  const uniqueWeeks = Array.from(new Set(logs.map(log => log.week_number))).sort((a, b) => a - b);

  // Filter logs
  const filteredLogs = logs.filter(log => {
    // 1. Search Query
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      log.student_id.toLowerCase().includes(searchLower) ||
      `${log.prefix || ''}${log.first_name} ${log.last_name}`.toLowerCase().includes(searchLower) ||
      (log.ip_address && log.ip_address.toLowerCase().includes(searchLower)) ||
      (log.device_uuid && log.device_uuid.toLowerCase().includes(searchLower)) ||
      log.session_title.toLowerCase().includes(searchLower);

    // 2. Week Filter
    const matchesWeek = selectedWeek === 'all' || log.week_number.toString() === selectedWeek;

    // 3. Flagged Only Filter
    const matchesFlagged = !showFlaggedOnly || log.is_flagged;

    return matchesSearch && matchesWeek && matchesFlagged;
  });

  // Calculate statistics
  const totalCount = logs.length;
  const flaggedCount = logs.filter(l => l.is_flagged).length;
  const uniqueIps = new Set(logs.map(l => l.ip_address).filter(Boolean)).size;
  const uniqueDevices = new Set(logs.map(l => l.device_uuid).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight flex items-center gap-2">
            <ShieldAlert className="text-primary w-7 h-7" />
            บันทึกระบบและการตรวจสอบการทุจริต
          </h1>
          <p className="text-xs text-muted mt-1">
            เก็บบันทึก IP Address และลายนิ้วมือเครื่อง (Device Fingerprint) ของนักศึกษา เพื่อคอยเฝ้าระวังการสแกนเช็กชื่อแทนกัน
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="h-9 px-4 border border-hairline hover:bg-surface-soft text-ink text-xs font-bold rounded-md flex items-center justify-center space-x-2 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>{loading ? 'กำลังโหลด...' : 'รีเฟรชข้อมูล'}</span>
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-error/15 border border-error/30 text-error rounded-lg text-sm flex items-start gap-2.5">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stats Dashboard Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-xs space-y-2">
          <div className="flex justify-between items-center text-muted text-[11px] font-bold uppercase tracking-wider">
            <span>ประวัติเช็กชื่อทั้งหมด</span>
            <HardDrive size={14} className="text-muted-soft" />
          </div>
          <p className="text-2xl font-black text-ink">{totalCount} <span className="text-xs font-semibold text-muted">ครั้ง</span></p>
        </div>

        <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-xs space-y-2 border-l-4 border-l-error">
          <div className="flex justify-between items-center text-error text-[11px] font-bold uppercase tracking-wider">
            <span>รายการต้องสงสัย (Flagged)</span>
            <ShieldAlert size={14} />
          </div>
          <p className="text-2xl font-black text-error">{flaggedCount} <span className="text-xs font-semibold text-error/80">ครั้ง</span></p>
        </div>

        <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-xs space-y-2">
          <div className="flex justify-between items-center text-muted text-[11px] font-bold uppercase tracking-wider">
            <span>ที่อยู่ IP ทั้งหมด</span>
            <Globe size={14} className="text-muted-soft" />
          </div>
          <p className="text-2xl font-black text-ink">{uniqueIps} <span className="text-xs font-semibold text-muted">IPs</span></p>
        </div>

        <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-xs space-y-2">
          <div className="flex justify-between items-center text-muted text-[11px] font-bold uppercase tracking-wider">
            <span>ลายนิ้วมือเครื่องจริง</span>
            <HardDrive size={14} className="text-muted-soft" />
          </div>
          <p className="text-2xl font-black text-ink">{uniqueDevices} <span className="text-xs font-semibold text-muted">เครื่อง</span></p>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="bg-surface-soft border border-hairline p-4 rounded-lg text-xs leading-relaxed text-muted space-y-1.5">
        <div className="flex items-center gap-1.5 font-bold text-ink text-sm">
          <Info size={15} className="text-primary" />
          <span>เกณฑ์การแจ้งเตือนพฤติกรรมต้องสงสัย (IP Proxy Flag)</span>
        </div>
        <p>
          ระบบจะทำการแจ้งเตือน (Flag) รายการเช็กชื่อที่มีการใช้ <strong>IP Address เดียวกัน</strong> ในการกดสแกนเช็กชื่อให้ <strong>หลายรหัสนักศึกษา</strong> ของคาบสัปดาห์นั้น ๆ <strong>ภายในช่วงเวลาห่างกันไม่เกิน 5 นาที</strong> เพื่อให้คุณครูผู้สอนตรวจสอบย้อนหลังเพิ่มเติม
        </p>
        <p className="text-error font-semibold">
          * หมายเหตุ: ระบบจะไม่ระงับการเช็กชื่อของนักศึกษาโดยอัตโนมัติ เนื่องจากมีความเป็นไปได้ปกติที่นักศึกษาในห้องเรียนจะแชร์ Wi-Fi สถาบันหรือแชร์ Hotspot ร่วมกัน ทำให้ IP ภายนอกซ้ำกัน
        </p>
      </div>

      {/* Filter and Search Panel */}
      <div className="bg-canvas border border-hairline p-4 rounded-xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-grow max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft" />
          <input
            type="text"
            placeholder="ค้นหาด้วยรหัสนักศึกษา, ชื่อ, หรือที่อยู่ IP..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-4 border border-hairline rounded-md bg-canvas text-ink text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted font-semibold whitespace-nowrap">ครั้งที่:</span>
            <select
              value={selectedWeek}
              onChange={e => setSelectedWeek(e.target.value)}
              className="h-10 border border-hairline rounded bg-canvas text-ink text-xs px-2.5 cursor-pointer focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="all">ทั้งหมด ทุกคาบ</option>
              {uniqueWeeks.map(wk => (
                <option key={wk} value={wk.toString()}>ครั้งที่ {wk}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2.5">
            <input
              type="checkbox"
              id="flaggedFilter"
              checked={showFlaggedOnly}
              onChange={e => setShowFlaggedOnly(e.target.checked)}
              className="w-4 h-4 border border-hairline rounded text-primary focus:ring-primary cursor-pointer accent-primary"
            />
            <label htmlFor="flaggedFilter" className="text-xs font-semibold text-ink cursor-pointer select-none">
              แสดงเฉพาะรายการต้องสงสัย (Flagged Only)
            </label>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-canvas border border-hairline rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-muted-soft flex flex-col items-center justify-center gap-2">
            <RefreshCw size={24} className="animate-spin text-primary" />
            <span>กำลังโหลดบันทึกข้อมูลระบบ...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-16 text-center text-muted-soft">
            ไม่พบประวัติบันทึกข้อมูลระบบตามเงื่อนไขที่ระบุ
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-soft border-b border-hairline">
                  <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted w-10"></th>
                  <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted">วันเวลาเช็กชื่อ</th>
                  <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted">นักศึกษา</th>
                  <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted">คาบเรียน</th>
                  <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted">IP Address</th>
                  <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted">ลายนิ้วมือเครื่อง (Fingerprint)</th>
                  <th className="p-3.5 text-xs font-bold uppercase tracking-wider text-muted">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline text-xs">
                {filteredLogs.map(log => {
                  const isExpanded = !!expandedRows[log.id];
                  return (
                    <>
                      <tr 
                        key={log.id} 
                        className={`transition-colors hover:bg-surface-soft/40 ${
                          log.is_flagged ? 'bg-error/5 hover:bg-error/10' : ''
                        }`}
                      >
                        <td className="p-3.5 text-center">
                          {log.is_flagged && (
                            <button
                              onClick={() => toggleRow(log.id)}
                              className="text-muted hover:text-ink cursor-pointer focus:outline-none"
                              title="ดูรายละเอียดการทุจริต"
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          )}
                        </td>
                        <td className="p-3.5 text-body font-medium">
                          {formatThaiDateTime(log.attended_at)}
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-ink">{log.prefix || ''}{log.first_name} {log.last_name}</div>
                          <div className="text-[10px] text-muted-soft mt-0.5">รหัส: {log.student_id} • {log.major_code} ห้อง {log.room}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-ink">ครั้งที่ {log.week_number}</div>
                          <div className="text-[10px] text-muted-soft mt-0.5">{log.session_title}</div>
                        </td>
                        <td className="p-3.5 font-mono text-body">
                          {log.ip_address || '-'}
                        </td>
                        <td className="p-3.5 font-mono text-[10px] text-body-soft max-w-[150px] truncate" title={log.device_uuid || ''}>
                          {log.device_uuid ? (
                            log.device_uuid.startsWith('hw_') ? (
                              <span className="text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 font-semibold">
                                {log.device_uuid.substring(0, 10)}...
                              </span>
                            ) : (
                              <span className="text-muted-soft">
                                {log.device_uuid.substring(0, 10)}...
                              </span>
                            )
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-3.5">
                          {log.is_flagged ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-error bg-error/10 border border-error/20 rounded-full px-2.5 py-1">
                              <ShieldAlert size={11} /> 
                              IP ซ้ำ ({log.flagged_count} คนร่วม)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success bg-success/5 border border-success/15 rounded-full px-2.5 py-1">
                              <CheckCircle size={11} />
                              ปกติ
                            </span>
                          )}
                        </td>
                      </tr>
                      {log.is_flagged && isExpanded && (
                        <tr className="bg-error/[0.02]">
                          <td colSpan={7} className="p-4 border-t border-hairline pl-12">
                            <div className="space-y-2 border-l-2 border-error pl-4">
                              <h4 className="font-bold text-error text-[11px] uppercase tracking-wider flex items-center gap-1">
                                <AlertTriangle size={13} />
                                รายการสแกนร่วมจากที่อยู่ IP เดียวกัน ({log.ip_address}) ในเวลาไล่เลี่ยกัน (ช่วง 5 นาที):
                              </h4>
                              <div className="divide-y divide-hairline bg-canvas border border-hairline rounded-lg overflow-hidden max-w-2xl">
                                {log.flagged_details.map((detail, idx) => (
                                  <div key={idx} className="p-2.5 flex justify-between items-center text-xs">
                                    <div>
                                      <span className="font-bold text-ink">{detail.name}</span>
                                      <span className="text-muted-soft ml-2">(รหัส: {detail.student_id})</span>
                                    </div>
                                    <span className="text-muted font-medium">เวลาสแกน: {formatThaiDateTime(detail.attended_at)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
