import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Save, FileText, Database, ShieldAlert, Download, Upload, Camera,
  RotateCcw, Clock, List, Trash2, ChevronRight, HardDrive,
  RefreshCw, FileDown, CheckCircle2, XCircle, Info, BarChart2
} from 'lucide-react';

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDateTH(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'Asia/Bangkok'
    });
  } catch { return dateStr; }
}

// ── Log Type Badge — uses design system semantic colors only ──
function LogTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    export:   { label: 'Export',   cls: 'bg-[#f5f5f5] text-[#374151] border-[#e5e7eb]' },
    import:   { label: 'Import',   cls: 'bg-[#f5f5f5] text-[#374151] border-[#e5e7eb]' },
    snapshot: { label: 'Snapshot', cls: 'bg-[#f5f5f5] text-[#374151] border-[#e5e7eb]' },
    rollback: { label: 'Rollback', cls: 'bg-[#fef3c7] text-[#92400e] border-[#fde68a]' },
  };
  const d = map[type] || { label: type, cls: 'bg-[#f5f5f5] text-[#374151] border-[#e5e7eb]' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${d.cls} tracking-tight`}>
      {d.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'success') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
      <CheckCircle2 size={11} /> สำเร็จ
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-error">
      <XCircle size={11} /> ล้มเหลว
    </span>
  );
}

// ── Section header shared component ──
function SectionHeader({ icon, title, description, action }: {
  icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="p-4 sm:p-6 border-b border-hairline flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <h2 className="text-base font-semibold text-ink tracking-tight">{title}</h2>
          {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ── Alert banner ──
function AlertBanner({ type, children }: { type: 'success' | 'error' | 'warning'; children: React.ReactNode }) {
  const styles = {
    success: 'bg-success/10 border-success/25 text-success',
    error:   'bg-error/10 border-error/25 text-error',
    warning: 'bg-[#fffbeb] border-[#fde68a] text-[#92400e]',
  };
  const icons = {
    success: <CheckCircle2 size={14} />,
    error:   <XCircle size={14} />,
    warning: <ShieldAlert size={14} />,
  };
  return (
    <div className={`flex items-start gap-2.5 p-3.5 rounded-lg border text-sm font-medium animate-in fade-in duration-200 ${styles[type]}`}>
      <span className="mt-0.5 flex-shrink-0">{icons[type]}</span>
      <span>{children}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AdminSettings() {

  // ── Google Sheets ──
  const [sheetId, setSheetId] = useState('');
  const [credentials, setCredentials] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncError, setSyncError] = useState('');

  // ── Export ──
  const [exportLoading, setExportLoading] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  // ── Import ──
  const [importLoading, setImportLoading] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<any>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importFileName, setImportFileName] = useState('');

  // ── Snapshot ──
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [snapshotDesc, setSnapshotDesc] = useState('');
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState('');
  const [snapshotError, setSnapshotError] = useState('');
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);

  // ── Rollback ──
  const [rollbackLoading, setRollbackLoading] = useState<number | null>(null);

  // ── Logs ──
  const [logTab, setLogTab] = useState<'all' | 'export' | 'import' | 'snapshot' | 'rollback'>('all');
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // ── Init ──
  useEffect(() => {
    axios.get('/api/settings').then(res => {
      if (res.data) { setSheetId(res.data.sheet_id || ''); setCredentials(res.data.credentials_json || ''); }
    });
    fetchSnapshots();
    fetchLogs();
  }, []);

  const fetchSnapshots = async () => {
    setSnapshotsLoading(true);
    try { const r = await axios.get('/api/backup/snapshots'); setSnapshots(r.data || []); }
    catch { setSnapshots([]); }
    setSnapshotsLoading(false);
  };

  const fetchLogs = async (type?: string) => {
    setLogsLoading(true);
    try {
      const params: any = { limit: 200 };
      if (type && type !== 'all') params.log_type = type;
      const r = await axios.get('/api/backup/logs', { params });
      setLogs(r.data || []);
    } catch { setLogs([]); }
    setLogsLoading(false);
  };

  useEffect(() => { fetchLogs(logTab === 'all' ? undefined : logTab); }, [logTab]);

  // ── Google Sheets ──
  const handleSave = async () => {
    setLoading(true); setMessage(''); setErrorMsg('');
    try {
      await axios.post('/api/settings', { sheet_id: sheetId, credentials_json: credentials });
      setMessage('บันทึกการตั้งค่าระบบเสร็จสมบูรณ์!');
      setTimeout(() => window.location.reload(), 1000);
    } catch { setErrorMsg('บันทึกการตั้งค่าล้มเหลว กรุณาตรวจสอบรูปแบบไฟล์ JSON'); }
    setLoading(false);
    setTimeout(() => { setMessage(''); setErrorMsg(''); }, 4000);
  };

  const handleSyncAll = async () => {
    if (!window.confirm('⚠️ ข้อมูลเดิมทั้งหมดบน Google Sheets จะถูกลบและเขียนทับใหม่\n\nคุณแน่ใจหรือไม่?')) return;
    setSyncLoading(true); setSyncMessage(''); setSyncError('');
    try {
      const r = await axios.post('/api/settings/sync-all');
      if (r.data?.success) setSyncMessage(`เสร็จสมบูรณ์ — เขียนข้อมูลทั้งหมด ${r.data.count} รายการ`);
      else setSyncError('การเขียนข้อมูลลง Google Sheets ล้มเหลว');
    } catch (e: any) { setSyncError(e.response?.data?.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อ'); }
    setSyncLoading(false);
    setTimeout(() => { setSyncMessage(''); setSyncError(''); }, 6000);
  };

  // ── Export ──
  const handleExport = async () => {
    setExportLoading(true); setExportMsg('');
    try {
      const r = await axios.get('/api/backup/export', { responseType: 'blob' });
      const cd = r.headers['content-disposition'] || '';
      const m = cd.match(/filename="?([^"]+)"?/);
      const fn = m ? m[1] : `AAS_backup_${Date.now()}.json`;
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = fn; a.click();
      URL.revokeObjectURL(url);
      setExportMsg('ดาวน์โหลด backup เสร็จสมบูรณ์');
      fetchLogs(logTab === 'all' ? undefined : logTab);
    } catch { setExportMsg('Export ล้มเหลว'); }
    setExportLoading(false);
    setTimeout(() => setExportMsg(''), 4000);
  };

  // ── Import ──
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { setImportPreview(null); setImportFileName(''); return; }
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        setImportPreview(data); setImportError('');
      } catch { setImportError('ไฟล์ไม่ใช่ JSON ที่ถูกต้อง'); setImportPreview(null); }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    const file = importFileRef.current?.files?.[0];
    if (!file) { setImportError('กรุณาเลือกไฟล์ก่อน'); return; }
    if (!window.confirm('⚠️ การนำเข้าจะทับข้อมูลปัจจุบันทั้งหมด\n\nแนะนำให้สร้าง Snapshot ก่อนดำเนินการ\nคุณแน่ใจหรือไม่?')) return;
    setImportLoading(true); setImportMsg(''); setImportError(''); setImportResult(null);
    const form = new FormData(); form.append('backup_file', file);
    try {
      const r = await axios.post('/api/backup/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(r.data.imported_counts);
      setImportMsg('นำเข้าข้อมูลเสร็จสมบูรณ์');
      setImportPreview(null); setImportFileName('');
      if (importFileRef.current) importFileRef.current.value = '';
      fetchLogs(logTab === 'all' ? undefined : logTab);
    } catch (e: any) { setImportError(e.response?.data?.error || 'Import ล้มเหลว'); }
    setImportLoading(false);
    setTimeout(() => { setImportMsg(''); setImportResult(null); }, 8000);
  };

  // ── Snapshot ──
  const handleSnapshot = async () => {
    if (!snapshotLabel.trim()) { setSnapshotError('กรุณาใส่ชื่อ snapshot'); return; }
    setSnapshotLoading(true); setSnapshotMsg(''); setSnapshotError('');
    try {
      await axios.post('/api/backup/snapshot', { label: snapshotLabel, description: snapshotDesc });
      setSnapshotMsg(`สร้าง snapshot "${snapshotLabel}" เสร็จสมบูรณ์`);
      setSnapshotLabel(''); setSnapshotDesc('');
      fetchSnapshots(); fetchLogs(logTab === 'all' ? undefined : logTab);
    } catch (e: any) { setSnapshotError(e.response?.data?.error || 'สร้าง snapshot ล้มเหลว'); }
    setSnapshotLoading(false);
    setTimeout(() => setSnapshotMsg(''), 5000);
  };

  const handleDeleteSnapshot = async (id: number, label: string) => {
    if (!window.confirm(`ลบ snapshot "${label}"?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    try {
      await axios.delete(`/api/backup/snapshots/${id}`);
      fetchSnapshots(); fetchLogs(logTab === 'all' ? undefined : logTab);
    } catch (e: any) { alert(e.response?.data?.error || 'ลบ snapshot ล้มเหลว'); }
  };

  const handleDownloadSnapshot = (id: number, filename: string) => {
    const a = document.createElement('a'); a.href = `/api/backup/download/${id}`; a.download = filename; a.click();
  };

  // ── Rollback ──
  const handleRollback = async (snap: any) => {
    if (!window.confirm(
      `คืนข้อมูลไปยัง snapshot:\n"${snap.label}"\nสร้างเมื่อ: ${formatDateTH(snap.created_at)}\n\n• ระบบจะสำรองข้อมูลปัจจุบันอัตโนมัติก่อน rollback\n• ข้อมูลหลัง snapshot นี้จะหายไปทั้งหมด\n\nคุณแน่ใจหรือไม่?`
    )) return;
    setRollbackLoading(snap.id);
    try {
      await axios.post(`/api/backup/rollback/${snap.id}`);
      alert(`Rollback สำเร็จ — ข้อมูลถูกคืนไปยัง snapshot "${snap.label}" แล้ว`);
      fetchSnapshots(); fetchLogs(logTab === 'all' ? undefined : logTab);
    } catch (e: any) { alert(e.response?.data?.error || 'Rollback ล้มเหลว'); }
    setRollbackLoading(null);
  };

  // ── Log tabs ──
  const logTabs = [
    { key: 'all',      label: 'DataLog',      icon: <List size={13} /> },
    { key: 'export',   label: 'DataTimeline', icon: <BarChart2 size={13} /> },
    { key: 'snapshot', label: 'SnapshotLog',  icon: <Camera size={13} /> },
    { key: 'rollback', label: 'RollbackLog',  icon: <RotateCcw size={13} /> },
  ] as const;

  // ── Stat summary for logs ──
  const logStats = (['export','import','snapshot','rollback'] as const).map(type => ({
    type,
    label: type.charAt(0).toUpperCase() + type.slice(1),
    total: logs.filter(l => l.log_type === type).length,
    success: logs.filter(l => l.log_type === type && l.status === 'success').length,
  }));

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-6 sm:space-y-8 animate-in fade-in duration-300">

      {/* Page Header */}
      <div>
        <h1 className="text-2xl md:text-4xl font-semibold text-ink tracking-tight">ตั้งค่าระบบ</h1>
        <p className="text-muted text-sm md:text-base mt-2">
          จัดการการตั้งค่า Google Sheets API และระบบสำรองข้อมูล SQLite
        </p>
      </div>

      {/* ── 1. Google Sheets ──────────────────────────────────────────────── */}
      <div className="bg-canvas border border-hairline rounded-lg overflow-hidden shadow-sm">
        <SectionHeader
          icon={<Database size={18} className="text-ink" />}
          title="การตั้งค่าบัญชีเชื่อมต่อ Google Sheets API"
        />
        <div className="p-4 sm:p-6 md:p-8 space-y-6">
          {message  && <AlertBanner type="success">{message}</AlertBanner>}
          {errorMsg && <AlertBanner type="error">{errorMsg}</AlertBanner>}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink">รหัสสเปรดชีต (Spreadsheet ID)</label>
            <input type="text" value={sheetId} onChange={e => setSheetId(e.target.value)}
              className="w-full h-10 border border-hairline rounded-md px-3.5 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              placeholder="ตัวอย่าง 1BxiMvs0Xryg..." />
            <p className="text-xs text-muted-soft">
              คัดลอกจาก URL: docs.google.com/spreadsheets/d/<span className="font-semibold text-ink">SPREADSHEET_ID</span>/edit
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="block text-sm font-semibold text-ink">Service Account Credentials JSON</label>
              <span className="text-[11px] bg-surface-soft border border-hairline text-muted font-mono px-2 py-0.5 rounded">JSON</span>
            </div>
            <textarea rows={10} value={credentials} onChange={e => setCredentials(e.target.value)}
              className="w-full border border-hairline rounded-md p-3.5 font-mono text-xs bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all leading-relaxed"
              placeholder='{ "type": "service_account", ... }' />
            <p className="text-xs text-muted-soft">นำไฟล์คีย์ JSON จาก Google Cloud Console (Service Account) มาวางในช่องด้านบน</p>
          </div>
        </div>
        <div className="bg-surface-soft border-t border-hairline px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <FileText size={13} className="shrink-0" /><span>การปรับเปลี่ยนค่าจำเป็นต้องใช้สิทธิ์เขียนไฟล์บนฐานข้อมูล SQLite</span>
          </div>
          <button onClick={handleSave} disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-active disabled:bg-surface-strong text-white px-5 py-2.5 rounded-md text-sm font-semibold transition-all active:scale-98 cursor-pointer">
            {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>กำลังบันทึก...</span></>
                     : <><Save size={14} /><span>บันทึกข้อมูลตั้งค่า</span></>}
          </button>
        </div>
      </div>

      {/* Google Sheets Sync */}
      <div className="bg-canvas border border-hairline rounded-lg overflow-hidden shadow-sm">
        <SectionHeader
          icon={<ShieldAlert size={18} className="text-error" />}
          title="ล้างและเขียนข้อมูลลง Google Sheets ใหม่ทั้งหมด"
        />
        <div className="p-4 sm:p-6 md:p-8 space-y-4">
          <p className="text-sm text-muted leading-relaxed">
            เขียนข้อมูลการสแกนและเช็กชื่อนักศึกษาทั้งหมดจาก SQLite ลงใน Google Sheets ใหม่
            โดยระบบจะเคลียร์ข้อมูลเดิม (คอลัมน์ A–J) และเขียนทับใหม่ทั้งหมด
          </p>
          {syncMessage && <AlertBanner type="success">{syncMessage}</AlertBanner>}
          {syncError   && <AlertBanner type="error">{syncError}</AlertBanner>}
        </div>
        <div className="bg-surface-soft border-t border-hairline px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs text-muted-soft">ตรวจสอบว่า Spreadsheet ID และ Credentials บันทึกถูกต้องก่อนดำเนินการ</p>
          <button onClick={handleSyncAll} disabled={syncLoading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-error hover:bg-error-active disabled:bg-surface-strong text-white px-5 py-2.5 rounded-md text-sm font-semibold transition-all active:scale-98 cursor-pointer">
            {syncLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>กำลังบันทึก...</span></>
                        : <span>ล้างและเขียนข้อมูลใหม่ทั้งหมด</span>}
          </button>
        </div>
      </div>

      {/* ── 2. Export & Import ────────────────────────────────────────────── */}
      <div className="bg-canvas border border-hairline rounded-lg overflow-hidden shadow-sm">
        <SectionHeader
          icon={<HardDrive size={18} className="text-ink" />}
          title="Export & Import ข้อมูล"
          description="สำรองข้อมูลเป็นไฟล์ JSON และนำเข้าข้อมูลกลับสู่ระบบ"
        />
        <div className="p-4 sm:p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-hairline rounded-lg overflow-hidden border border-hairline">

            {/* Export */}
            <div className="bg-canvas p-6 space-y-4">
              <div className="flex items-center gap-2">
                <FileDown size={16} className="text-ink" />
                <h3 className="text-sm font-semibold text-ink tracking-tight">Export ข้อมูล</h3>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                ดาวน์โหลดข้อมูลทั้งหมดจากฐานข้อมูลเป็นไฟล์ <span className="font-mono font-semibold text-ink">.json</span>
                &ensp;ครอบคลุม sessions, attendances, students, majors, academic_years และ remarks
              </p>
              {exportMsg && (
                <div className="flex items-center gap-2 text-xs font-semibold text-success">
                  <CheckCircle2 size={12} />{exportMsg}
                </div>
              )}
              <button onClick={handleExport} disabled={exportLoading}
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary-active disabled:bg-surface-strong text-white px-4 py-2 rounded-md text-sm font-semibold transition-all active:scale-98 cursor-pointer">
                {exportLoading
                  ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>กำลัง Export...</span></>
                  : <><Download size={14} /><span>ดาวน์โหลด JSON Backup</span></>}
              </button>
            </div>

            {/* Import */}
            <div className="bg-canvas p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Upload size={16} className="text-ink" />
                <h3 className="text-sm font-semibold text-ink tracking-tight">Import ข้อมูล</h3>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                นำเข้าข้อมูลจากไฟล์ backup&ensp;<span className="font-mono font-semibold text-ink">.json</span>
                &ensp;<span className="text-warning font-semibold">จะทับข้อมูลปัจจุบันทั้งหมด</span>
              </p>

              {/* File picker */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-9 border border-hairline rounded-md px-3 flex items-center text-xs text-muted truncate bg-surface-soft">
                  {importFileName || 'ยังไม่ได้เลือกไฟล์'}
                </div>
                <button type="button" onClick={() => importFileRef.current?.click()}
                  className="h-9 px-3 bg-canvas border border-hairline rounded-md text-xs font-semibold text-ink hover:bg-surface-soft transition-all cursor-pointer">
                  เลือกไฟล์
                </button>
                <input ref={importFileRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
              </div>

              {/* Preview */}
              {importPreview && (
                <div className="bg-[#f5f5f5] rounded-lg p-3.5 space-y-2 border border-hairline">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <Info size={12} />ข้อมูล Preview
                  </div>
                  <div className="text-xs text-muted space-y-0.5">
                    <div>Export เมื่อ: <span className="text-ink font-medium">{formatDateTH(importPreview.exported_at)}</span></div>
                    <div>ระบบ: <span className="text-ink font-medium">{importPreview.system || '-'}</span></div>
                  </div>
                  {importPreview.record_counts && (
                    <div className="grid grid-cols-2 gap-1.5 mt-2">
                      {Object.entries(importPreview.record_counts).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between bg-canvas rounded-md px-2.5 py-1.5 border border-hairline">
                          <span className="text-[11px] text-muted">{k}</span>
                          <span className="text-[11px] font-semibold text-ink">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {importMsg   && <div className="flex items-center gap-1.5 text-xs font-semibold text-success"><CheckCircle2 size={12}/>{importMsg}</div>}
              {importError && <div className="flex items-center gap-1.5 text-xs font-semibold text-error"><XCircle size={12}/>{importError}</div>}

              {importResult && (
                <div className="bg-success/10 border border-success/20 rounded-lg p-3 space-y-1.5">
                  <div className="text-xs font-semibold text-success">นำเข้าสำเร็จ</div>
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(importResult).map(([k, v]) => (
                      <div key={k} className="flex justify-between bg-canvas rounded px-2 py-1 text-[11px] border border-hairline">
                        <span className="text-muted">{k}</span>
                        <span className="font-semibold text-success">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={handleImport} disabled={importLoading || !importPreview}
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary-active disabled:bg-surface-strong text-white px-4 py-2 rounded-md text-sm font-semibold transition-all active:scale-98 cursor-pointer disabled:cursor-not-allowed">
                {importLoading
                  ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>กำลัง Import...</span></>
                  : <><Upload size={14} /><span>นำเข้าข้อมูล</span></>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Snapshot & Rollback ────────────────────────────────────────── */}
      <div className="bg-canvas border border-hairline rounded-lg overflow-hidden shadow-sm">
        <SectionHeader
          icon={<Camera size={18} className="text-ink" />}
          title="Snapshot & Rollback"
          description="สร้างจุดบันทึกข้อมูลและคืนค่าฐานข้อมูลได้ทุกเมื่อ"
          action={
            <button onClick={fetchSnapshots} title="รีเฟรช"
              className="p-2 rounded-md hover:bg-surface-soft transition-all text-muted hover:text-ink cursor-pointer">
              <RefreshCw size={14} className={snapshotsLoading ? 'animate-spin' : ''} />
            </button>
          }
        />

        <div className="p-4 sm:p-6 md:p-8 space-y-6">

          {/* Create Snapshot */}
          <div className="bg-[#f5f5f5] rounded-lg p-5 border border-hairline space-y-4">
            <h3 className="text-sm font-semibold text-ink tracking-tight flex items-center gap-2">
              <Camera size={14} className="text-ink" />สร้าง Snapshot ใหม่
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted">
                  ชื่อ Snapshot <span className="text-error">*</span>
                </label>
                <input type="text" value={snapshotLabel} onChange={e => setSnapshotLabel(e.target.value)}
                  className="w-full h-9 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  placeholder="เช่น ก่อนอัปเดตข้อมูลนักศึกษา" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted">หมายเหตุ</label>
                <input type="text" value={snapshotDesc} onChange={e => setSnapshotDesc(e.target.value)}
                  className="w-full h-9 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)" />
              </div>
            </div>
            {snapshotMsg   && <div className="flex items-center gap-1.5 text-xs font-semibold text-success"><CheckCircle2 size={12}/>{snapshotMsg}</div>}
            {snapshotError && <div className="flex items-center gap-1.5 text-xs font-semibold text-error"><XCircle size={12}/>{snapshotError}</div>}
            <button onClick={handleSnapshot} disabled={snapshotLoading}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary-active disabled:bg-surface-strong text-white px-4 py-2 rounded-md text-sm font-semibold transition-all active:scale-98 cursor-pointer">
              {snapshotLoading
                ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>กำลังสร้าง...</span></>
                : <><Camera size={14} /><span>สร้าง Snapshot</span></>}
            </button>
          </div>

          {/* Snapshot List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink tracking-tight">รายการ Snapshot</h3>
              <span className="text-xs text-muted">{snapshots.length} รายการ</span>
            </div>

            {snapshotsLoading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-sm text-muted">
                <div className="w-4 h-4 border-2 border-hairline border-t-muted rounded-full animate-spin" />
                กำลังโหลด...
              </div>
            ) : snapshots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted border border-dashed border-hairline rounded-lg">
                <Camera size={28} className="text-[#e5e7eb]" />
                <span className="text-sm">ยังไม่มี snapshot — สร้าง snapshot แรกด้านบนได้เลย</span>
              </div>
            ) : (
              <div className="divide-y divide-hairline border border-hairline rounded-lg overflow-hidden">
                {snapshots.map((snap) => (
                  <div key={snap.id} className={`flex flex-col sm:flex-row items-stretch sm:items-start gap-4 p-4 bg-canvas ${!snap.file_exists ? 'bg-[#fef2f2]' : ''}`}>
                    <div className="flex items-start gap-4 flex-grow min-w-0">
                      {/* Icon */}
                      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#f5f5f5] border border-hairline flex items-center justify-center">
                        <Camera size={16} className="text-ink" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-ink text-sm">{snap.label}</span>
                          {!snap.file_exists && (
                            <span className="text-[10px] bg-error/10 text-error border border-error/20 rounded px-1.5 py-0.5 font-semibold">ไฟล์หาย</span>
                          )}
                        </div>
                        {snap.description && <p className="text-xs text-muted">{snap.description}</p>}
                        <div className="flex items-center gap-4 flex-wrap">
                          <span className="flex items-center gap-1 text-xs text-muted-soft">
                            <Clock size={10} />{formatDateTH(snap.created_at)}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-soft">
                            <HardDrive size={10} />{formatBytes(snap.size_bytes)}
                          </span>
                          {snap.record_counts?.attendances !== undefined && (
                            <span className="text-xs text-muted-soft">
                              เช็กชื่อ&ensp;<strong className="text-ink">{snap.record_counts.attendances}</strong>&ensp;รายการ
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1.5 flex-shrink-0 sm:pt-1">
                      {snap.file_exists && (
                        <button onClick={() => handleDownloadSnapshot(snap.id, snap.filename)}
                          title="ดาวน์โหลด .sqlite"
                          className="p-2 rounded-md border border-hairline hover:bg-surface-soft transition-all text-muted hover:text-ink cursor-pointer">
                          <Download size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => handleRollback(snap)}
                        disabled={!snap.file_exists || rollbackLoading === snap.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border border-hairline bg-canvas hover:bg-surface-soft text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer">
                        {rollbackLoading === snap.id
                          ? <div className="w-3 h-3 border-2 border-hairline border-t-ink rounded-full animate-spin" />
                          : <RotateCcw size={12} />}
                        Rollback
                      </button>
                      <button onClick={() => handleDeleteSnapshot(snap.id, snap.label)}
                        title="ลบ"
                        className="p-2 rounded-md border border-hairline hover:bg-[#fef2f2] hover:border-error/30 transition-all text-muted hover:text-error cursor-pointer">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. Backup Logs ───────────────────────────────────────────────── */}
      <div className="bg-canvas border border-hairline rounded-lg overflow-hidden shadow-sm">
        <SectionHeader
          icon={<Clock size={18} className="text-ink" />}
          title="Backup Logs"
          description="DataLog · DataTimeline · SnapshotLog · RollbackLog"
          action={
            <button onClick={() => fetchLogs(logTab === 'all' ? undefined : logTab)} title="รีเฟรช"
              className="p-2 rounded-md hover:bg-surface-soft transition-all text-muted hover:text-ink cursor-pointer">
              <RefreshCw size={14} className={logsLoading ? 'animate-spin' : ''} />
            </button>
          }
        />

        {/* Log stats */}
        {logs.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-hairline border-b border-hairline">
            {logStats.map(s => (
              <div key={s.type} className="px-4 sm:px-6 py-4 text-center">
                <div className="text-2xl font-semibold text-ink tracking-tight">{s.total}</div>
                <div className="text-xs text-muted mt-0.5 font-medium">{s.label}</div>
                <div className="text-[11px] text-muted-soft mt-0.5">สำเร็จ {s.success}/{s.total}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tab Bar */}
        <div className="flex border-b border-hairline overflow-x-auto bg-surface-soft">
          {logTabs.map(tab => (
            <button key={tab.key} onClick={() => setLogTab(tab.key as any)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
                logTab === tab.key
                  ? 'border-primary text-ink bg-canvas'
                  : 'border-transparent text-muted hover:text-ink hover:bg-canvas/60'
              }`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* Log list */}
        <div className="p-4 sm:p-6">
          {logsLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-sm text-muted">
              <div className="w-4 h-4 border-2 border-hairline border-t-muted rounded-full animate-spin" />
              กำลังโหลด logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted border border-dashed border-hairline rounded-lg">
              <List size={28} className="text-[#e5e7eb]" />
              <span className="text-sm">ไม่พบบันทึก log ในหมวดนี้</span>
            </div>
          ) : (
            <div className="divide-y divide-hairline border border-hairline rounded-lg overflow-hidden max-h-[540px] overflow-y-auto">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-3.5 bg-canvas hover:bg-surface-soft transition-all">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <LogTypeBadge type={log.log_type} />
                      <span className="text-xs font-semibold text-ink font-mono">{log.action}</span>
                      <StatusBadge status={log.status} />
                      <span className="ml-auto text-[10px] text-muted-soft flex items-center gap-1">
                        <Clock size={9} />{formatDateTH(log.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-muted">{log.description}</p>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <details className="group">
                        <summary className="cursor-pointer text-[11px] text-muted-soft hover:text-ink flex items-center gap-1 select-none w-fit">
                          <ChevronRight size={10} className="group-open:rotate-90 transition-transform" />
                          Metadata
                        </summary>
                        <div className="mt-1.5 bg-[#f5f5f5] rounded-md p-2.5 border border-hairline overflow-auto max-h-36">
                          <pre className="text-[10px] text-muted font-mono whitespace-pre-wrap break-all leading-relaxed">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      </details>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-muted-soft flex-shrink-0">#{log.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
