import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { ClipboardCheck, Users, ChevronRight, CheckCircle2, XCircle, Minus, X, Printer, Download, SlidersHorizontal } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Major {
  id: number;
  level: string;
  year: string;
  major_name: string;
  major_code: string;
  room: string;
}

interface Session {
  id: number;
  week_number: number;
  title: string;
  date: string;
}

interface Student {
  id: number;
  student_id: string;
  prefix: string;
  first_name: string;
  last_name: string;
  level: string;
  year: string;
  major_code: string;
  major_name: string;
  room: string;
  attendance: Record<number, string>; // session_id -> attended_at
  remarks?: Record<number, string>; // session_id -> remark
}

interface HeatmapData {
  sessions: Session[];
  students: Student[];
}

interface TooltipInfo {
  x: number;
  y: number;
  content: {
    studentName: string;
    weekNumber: number;
    title: string;
    date: string;
    status: 'present' | 'absent' | 'no-session';
    attendedAt?: string;
    remark?: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Label shown on tab: e.g. ปวช.1 ชทค กลุ่ม 1 → "1ชทค1" */
function tabLabel(m: Major) {
  return `${m.year}${m.major_code}${m.room}`;
}

function tabFullLabel(m: Major) {
  return `${m.level}.${m.year} ${m.major_name} กลุ่ม ${m.room}`;
}


/** Color for a heatmap cell - single uniform green level for present */
function cellColor(status: 'present' | 'absent' | 'no-session', hasRemark: boolean): string {
  if (status === 'no-session') return '#e2e8f0';
  if (status === 'absent') {
    return hasRemark ? '#ffedd5' : '#fca5a5';
  }
  // present — uniform single level green
  return '#22c55e';
}

function cellBorderColor(status: 'present' | 'absent' | 'no-session', hasRemark: boolean): string {
  if (status === 'no-session') return '#cbd5e1';
  if (status === 'absent') {
    return hasRemark ? '#f97316' : '#f87171';
  }
  return '#16a34a';
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatShortDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

// ─── Heatmap Row ─────────────────────────────────────────────────────────────

function HeatmapRow({
  student,
  sessions,
  onHover,
  onLeave,
  onClickCell,
}: {
  student: Student;
  sessions: Session[];
  onHover: (info: TooltipInfo) => void;
  onLeave: () => void;
  onClickCell: (student: Student, session: Session) => void;
}) {
  const cells = sessions.map((session) => {
    const hasAttended = student.attendance[session.id] !== undefined;
    const status: 'present' | 'absent' | 'no-session' = hasAttended ? 'present' : 'absent';
    const hasRemark = !!(student.remarks && student.remarks[session.id]);
    const bg = cellColor(status, hasRemark);
    const border = cellBorderColor(status, hasRemark);
    return { session, status, bg, border, attendedAt: student.attendance[session.id] };
  });

  return (
    <div className="flex gap-[3px] items-center">
      {cells.map(({ session, status, bg, border, attendedAt }) => {
        const hasRemark = student.remarks && student.remarks[session.id];
        return (
          <div
            key={session.id}
            className="w-6 h-6 sm:w-5 sm:h-5 rounded-[3px] shrink-0 cursor-pointer touch-manipulation transition-transform hover:scale-125 hover:z-10 relative flex items-center justify-center"
            style={{ backgroundColor: bg, border: `1.5px solid ${border}` }}
            onClick={() => onClickCell(student, session)}
            onMouseEnter={e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onHover({
                x: rect.left + rect.width / 2,
                y: rect.top,
                content: {
                  studentName: `${student.prefix}${student.first_name} ${student.last_name}`,
                  weekNumber: session.week_number,
                  title: session.title,
                  date: session.date,
                  status,
                  attendedAt,
                  remark: student.remarks ? student.remarks[session.id] : undefined,
                },
              });
            }}
            onMouseLeave={onLeave}
            title=""
          >
            {hasRemark && (
              <span className="absolute bottom-[2px] right-[2px] w-[4px] h-[4px] bg-amber-500 rounded-full" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ info }: { info: TooltipInfo }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: info.x, top: info.y });

  useEffect(() => {
    if (ref.current) {
      const w = ref.current.offsetWidth;
      const left = Math.min(Math.max(info.x - w / 2, 8), window.innerWidth - w - 8);
      setPos({ left, top: info.y - ref.current.offsetHeight - 10 });
    }
  }, [info.x, info.y]);

  const { content } = info;

  return (
    <div
      ref={ref}
      className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg shadow-xl border border-hairline bg-canvas text-xs whitespace-nowrap"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="font-bold text-ink mb-0.5">{content.studentName}</div>
      <div className="text-muted">ครั้งที่ {content.weekNumber} — {content.title}</div>
      <div className="text-muted">{formatDate(content.date)}</div>
      <div className={`mt-1 font-semibold flex items-center gap-1 ${
        content.status === 'present' ? 'text-green-600' :
        content.status === 'absent' ? 'text-red-500' : 'text-slate-400'
      }`}>
        {content.status === 'present' ? <><CheckCircle2 size={11} /> เข้ากิจกรรม</> :
         content.status === 'absent' ? <><XCircle size={11} /> ไม่เข้ากิจกรรม</> :
         <><Minus size={11} /> ไม่มีข้อมูล</>}
        {content.status === 'present' && content.attendedAt && (
          <span className="text-muted font-normal ml-1">
            {new Date(content.attendedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
          </span>
        )}
      </div>
      {content.remark && (
        <div className="mt-1.5 pt-1 border-t border-hairline text-amber-600 font-semibold flex items-center gap-1">
          <span>📝 หมายเหตุ:</span>
          <span className="font-medium text-ink truncate max-w-[150px]">{content.remark}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminAttendanceList() {
  const [majors, setMajors] = useState<Major[]>([]);
  const [activeTab, setActiveTab] = useState<string>(''); // "level-year-major_code-room"
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [search, setSearch] = useState('');
  const [showLegend, setShowLegend] = useState(false);

  const [editingCell, setEditingCell] = useState<{
    student: Student;
    session: Session;
    status: 'present' | 'absent';
    remark: string;
  } | null>(null);

  const [quickMode, setQuickMode] = useState<'off' | 'present' | 'absent'>('off');
  const [showReportModal, setShowReportModal] = useState(false);
  const [passThreshold, setPassThreshold] = useState(80);

  const handleCellClick = (student: Student, session: Session) => {
    if (quickMode !== 'off') {
      const status = quickMode;
      const isPresent = student.attendance[session.id] !== undefined;
      const currentStatus = isPresent ? 'present' : 'absent';
      
      if (currentStatus === status) return; // No change needed

      // Optimistic UI update
      setHeatmapData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          students: prev.students.map(s => {
            if (s.student_id === student.student_id) {
              const newAttendance = { ...s.attendance };
              if (status === 'present') {
                newAttendance[session.id] = new Date().toISOString();
              } else {
                delete newAttendance[session.id];
              }
              return { ...s, attendance: newAttendance };
            }
            return s;
          })
        };
      });

      // API Call
      axios.post('/api/attendances/update-status-remark', {
        student_id: student.student_id,
        session_id: session.id,
        status,
        remark: student.remarks ? (student.remarks[session.id] || '') : '',
      })
      .then(() => {
        // Refresh silently in background
        if (!activeTab || majors.length === 0) return;
        const major = majors.find(m => majorKey(m) === activeTab);
        if (!major) return;
        axios.get('/api/attendance-heatmap', {
          params: {
            level: major.level,
            year: major.year,
            major_code: major.major_code,
            room: major.room,
          }
        }).then(res => {
          setHeatmapData(res.data);
        });
      })
      .catch(err => {
        console.error('Error in quick mode update:', err);
        alert('ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
        // Rollback on error
        if (!activeTab || majors.length === 0) return;
        const major = majors.find(m => majorKey(m) === activeTab);
        if (!major) return;
        axios.get('/api/attendance-heatmap', {
          params: {
            level: major.level,
            year: major.year,
            major_code: major.major_code,
            room: major.room,
          }
        }).then(res => {
          setHeatmapData(res.data);
        });
      });
      return;
    }

    // Normal mode (show modal)
    const isPresent = student.attendance[session.id] !== undefined;
    const remark = student.remarks ? (student.remarks[session.id] || '') : '';
    setEditingCell({
      student,
      session,
      status: isPresent ? 'present' : 'absent',
      remark,
    });
  };

  const handleSaveCell = () => {
    if (!editingCell) return;
    const { student, session, status, remark } = editingCell;

    axios.post('/api/attendances/update-status-remark', {
      student_id: student.student_id,
      session_id: session.id,
      status,
      remark,
    })
    .then(() => {
      // Reload heatmap data
      if (!activeTab || majors.length === 0) return;
      const major = majors.find(m => majorKey(m) === activeTab);
      if (!major) return;
      axios.get('/api/attendance-heatmap', {
        params: {
          level: major.level,
          year: major.year,
          major_code: major.major_code,
          room: major.room,
        }
      }).then(res => {
        setHeatmapData(res.data);
        setEditingCell(null);
      });
    })
    .catch(err => {
      console.error('Error updating status and remark:', err);
      alert('ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    });
  };

  // Fetch majors list for tabs
  useEffect(() => {
    axios.get('/api/majors').then(res => {
      const data: Major[] = res.data || [];
      setMajors(data);
      if (data.length > 0) {
        const first = data[0];
        setActiveTab(majorKey(first));
      }
    });
  }, []);

  // Fetch heatmap data when tab changes
  useEffect(() => {
    if (!activeTab || majors.length === 0) return;
    const major = majors.find(m => majorKey(m) === activeTab);
    if (!major) return;
    setLoading(true);
    setHeatmapData(null);
    axios.get('/api/attendance-heatmap', {
      params: {
        level: major.level,
        year: major.year,
        major_code: major.major_code,
        room: major.room,
      }
    }).then(res => {
      setHeatmapData(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [activeTab, majors]);

  const majorKey = (m: Major) => `${m.level}-${m.year}-${m.major_code}-${m.room}`;
  const activeMajor = majors.find(m => majorKey(m) === activeTab);

  const filteredStudents = (heatmapData?.students || []).filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.student_id.includes(q) ||
           s.first_name.toLowerCase().includes(q) ||
           s.last_name.toLowerCase().includes(q);
  });

  const sessions = heatmapData?.sessions || [];

  // Legend stripe bg - single uniform green level
  const legendItems = [
    { label: 'เข้ากิจกรรม', color: '#22c55e', border: '#16a34a' },
    { label: 'ไม่เข้ากิจกรรม', color: '#fca5a5', border: '#f87171' },
    { label: 'ไม่เข้ากิจกรรม (มีหมายเหตุ)', color: '#ffedd5', border: '#f97316' },
  ];

  // Export current active major list to CSV with Thai BOM support
  const handleExportCSV = () => {
    if (!activeMajor || !heatmapData || filteredStudents.length === 0) return;

    const headerCols = [
      'ลำดับ',
      'รหัสนักศึกษา',
      'คำนำหน้า',
      'ชื่อจริง',
      'นามสกุล',
      ...sessions.map(s => `ครั้งที่ ${s.week_number} (${formatShortDate(s.date)})`),
      'เข้ากิจกรรม (ครั้ง)',
      'กิจกรรมทั้งหมด (ครั้ง)',
      'ร้อยละ (%)',
      'ผลการประเมิน'
    ];

    const rows = filteredStudents.map((s, idx) => {
      const attendedCount = sessions.filter(sess => s.attendance[sess.id] !== undefined).length;
      const totalSessions = sessions.length;
      const rate = totalSessions > 0 ? Math.round((attendedCount / totalSessions) * 100) : 0;
      const isPass = rate >= passThreshold;

      const sessionStatuses = sessions.map(sess => {
        return s.attendance[sess.id] !== undefined ? '✓' : '-';
      });

      return [
        idx + 1,
        `="${s.student_id}"`,
        s.prefix || '',
        s.first_name,
        s.last_name,
        ...sessionStatuses,
        attendedCount,
        totalSessions,
        `${rate}%`,
        isPass ? 'ผ่าน' : 'ไม่ผ่าน'
      ];
    });

    const csvContent = "\uFEFF" + [
      headerCols.join(','),
      ...rows.map(r => r.map(val => `"${val}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `รายงานการเข้ากิจกรรม_${tabLabel(activeMajor)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print or save report to PDF
  const handlePrintPDF = () => {
    if (!activeMajor || !heatmapData || filteredStudents.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('กรุณาอนุญาตให้เบราว์เซอร์เปิดหน้าต่างป๊อปอัป (Pop-up) เพื่อพิมพ์รายงาน');
      return;
    }

    const title = `รายงานการเข้ากิจกรรม_${tabFullLabel(activeMajor)}`;
    const printDate = new Date().toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const rowsHtml = filteredStudents.map((s, idx) => {
      const attendedCount = sessions.filter(sess => s.attendance[sess.id] !== undefined).length;
      const totalSessions = sessions.length;
      const rate = totalSessions > 0 ? Math.round((attendedCount / totalSessions) * 100) : 0;
      const isPass = rate >= passThreshold;

      const sessionCells = sessions.map(sess => {
        const attended = s.attendance[sess.id] !== undefined;
        return `<td style="text-align: center; color: ${attended ? '#16a34a' : '#94a3b8'}; font-weight: ${attended ? 'bold' : 'normal'};">${attended ? '✓' : '-'}</td>`;
      }).join('');

      return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td style="text-align: center; font-family: monospace;">${s.student_id}</td>
          <td style="text-align: left; white-space: nowrap;">${s.prefix || ''}${s.first_name} ${s.last_name}</td>
          ${sessionCells}
          <td style="text-align: center;">${attendedCount}/${totalSessions}</td>
          <td style="text-align: center; font-weight: bold;">${rate}%</td>
          <td style="text-align: center; font-weight: bold; color: ${isPass ? '#16a34a' : '#dc2626'};">${isPass ? 'ผ่าน' : 'ไม่ผ่าน'}</td>
        </tr>
      `;
    }).join('');

    const headerSessions = sessions.map(sess => `
      <th style="padding: 4px 6px; text-align: center; font-size: 11px; white-space: nowrap;">
        <div>ครั้งที่ ${sess.week_number}</div>
        <div style="font-size: 9px; font-weight: normal; color: #64748b;">${formatShortDate(sess.date)}</div>
      </th>
    `).join('');

    const totalStudents = filteredStudents.length;
    const passedCount = filteredStudents.filter(s => {
      const att = sessions.filter(sess => s.attendance[sess.id] !== undefined).length;
      return (sessions.length > 0 ? Math.round((att / sessions.length) * 100) : 0) >= passThreshold;
    }).length;
    const failedCount = totalStudents - passedCount;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="th">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page { size: A4 landscape; margin: 8mm; }
          * { box-sizing: border-box; }
          body { font-family: 'Sarabun', 'Noto Sans Thai', 'Segoe UI', Tahoma, sans-serif; font-size: 11px; color: #0f172a; margin: 0; padding: 10px; }
          .header { text-align: center; margin-bottom: 12px; }
          .header h2 { margin: 0 0 4px 0; font-size: 16px; font-weight: bold; }
          .header p { margin: 2px 0; color: #475569; font-size: 11px; }
          .meta-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 11px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; }
          .stats { display: flex; gap: 12px; font-weight: 600; }
          .stat-pass { color: #16a34a; }
          .stat-fail { color: #dc2626; }
          table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10.5px; }
          th, td { border: 1px solid #cbd5e1; padding: 4px 5px; }
          th { background-color: #f1f5f9; font-weight: bold; }
          tr:nth-child(even) { background-color: #f8fafc; }
          @media print {
            body { padding: 0; }
            tr { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>รายงานสรุปการเข้าร่วมกิจกรรม</h2>
          <p>${tabFullLabel(activeMajor)}</p>
        </div>
        <div class="meta-bar">
          <div class="stats">
            <span>นักศึกษาทั้งหมด: ${totalStudents} คน</span>
            <span class="stat-pass">ผ่านเกณฑ์ (≥${passThreshold}%): ${passedCount} คน</span>
            <span class="stat-fail">ไม่ผ่านเกณฑ์: ${failedCount} คน</span>
            <span>จำนวนกิจกรรมทั้งหมด: ${sessions.length} ครั้ง</span>
          </div>
          <div>วันที่พิมพ์: ${printDate}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 35px; text-align: center;">ลำดับ</th>
              <th style="width: 95px; text-align: center;">รหัสนักศึกษา</th>
              <th style="text-align: left; min-width: 140px;">ชื่อ - นามสกุล</th>
              ${headerSessions}
              <th style="width: 50px; text-align: center;">มา/รวม</th>
              <th style="width: 45px; text-align: center;">ร้อยละ</th>
              <th style="width: 60px; text-align: center;">ประเมิน</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 350);
  };

  return (
    <div className="w-full space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-4xl font-semibold text-ink tracking-tight flex items-center space-x-2">
            <ClipboardCheck className="w-8 h-8 text-primary" />
            <span>ตารางเช็กชื่อเข้ากิจกรรม</span>
          </h1>
          <p className="text-muted text-sm mt-1">ดูประวัติการเข้ากิจกรรมรายกลุ่มเรียน แบบ Heatmap รายครั้ง</p>
        </div>
        {/* Legend */}
        <div className="flex flex-col gap-2">
          {/* Mobile toggle button */}
          <button
            onClick={() => setShowLegend(prev => !prev)}
            className="sm:hidden self-start flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-hairline bg-canvas text-xs font-semibold text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
          >
            <span>ดูคำอธิบายสี</span>
            <ChevronRight size={13} className={`text-muted transition-transform ${showLegend ? 'rotate-90' : ''}`} />
          </button>
          {/* Legend items */}
          <div className={`${showLegend ? 'flex' : 'hidden'} sm:flex items-center gap-2 flex-wrap`}>
            <span className="text-xs text-muted font-semibold">สถานะ:</span>
            {legendItems.map(item => (
              <div key={item.label} className="flex items-center gap-1 text-xs text-muted">
                <div
                  className="w-4 h-4 rounded-[3px]"
                  style={{ backgroundColor: item.color, border: `1.5px solid ${item.border}` }}
                />
                <span>{item.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1 text-xs text-muted">
              <div className="w-4 h-4 rounded-[3px]" style={{ backgroundColor: '#e2e8f0', border: '1.5px solid #cbd5e1' }} />
              <span>ไม่มีข้อมูล</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      {majors.length === 0 ? (
        <div className="bg-canvas border border-hairline rounded-lg p-8 text-center text-muted">
          <Users size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">ยังไม่มีกลุ่มเรียนในระบบ</p>
          <p className="text-xs mt-1">กรุณาเพิ่มสาขาวิชา/กลุ่มเรียนในเมนู ตั้งค่า</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {majors.map(m => {
              const key = majorKey(m);
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  title={tabFullLabel(m)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer border ${
                    isActive
                      ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                      : 'bg-canvas text-muted border-hairline hover:border-primary hover:text-primary'
                  }`}
                >
                  {tabLabel(m)}
                </button>
              );
            })}
          </div>

          {/* Active tab info + search */}
          {activeMajor && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface-soft/40 border border-hairline p-3 rounded-xl">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm text-muted">
                <div className="flex items-center gap-2">
                  <ChevronRight size={15} className="text-primary" />
                  <span className="font-semibold text-ink">{tabFullLabel(activeMajor)}</span>
                  {heatmapData && (
                    <span className="text-muted-soft">
                      · {filteredStudents.length} คน · {sessions.length} ครั้ง
                    </span>
                  )}
                </div>

                {/* Quick Check Mode Selector */}
                <div className="flex items-center gap-1 bg-canvas border border-hairline rounded-lg p-1 shadow-sm shrink-0">
                  <span className="text-[11px] font-bold text-muted px-1.5 flex items-center gap-1">
                    <span>⚡</span> โหมดไว:
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuickMode('off')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer transition-all ${
                      quickMode === 'off'
                        ? 'bg-ink text-canvas shadow-sm'
                        : 'text-muted hover:text-ink hover:bg-surface-soft'
                    }`}
                  >
                    ปิด
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickMode('present')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 ${
                      quickMode === 'present'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-emerald-600 hover:bg-emerald-50'
                    }`}
                  >
                    <span>🟢</span> เข้าเรียน
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickMode('absent')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 ${
                      quickMode === 'absent'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-rose-600 hover:bg-rose-50'
                    }`}
                  >
                    <span>🔴</span> ขาดเรียน
                  </button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่อหรือรหัสนักศึกษา..."
                  className="h-9 w-full sm:w-56 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className="h-9 px-3 rounded-md bg-canvas border border-hairline text-ink hover:bg-surface-soft hover:border-primary text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                    title="พิมพ์รายงานสรุปผล หรือ บันทึกเป็น PDF"
                  >
                    <Printer size={15} className="text-primary" />
                    <span>พิมพ์รายงาน / PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="h-9 px-3 rounded-md bg-canvas border border-hairline text-ink hover:bg-surface-soft hover:border-emerald-600 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                    title="ดาวน์โหลดรายงานเป็นไฟล์ CSV"
                  >
                    <Download size={15} className="text-emerald-600" />
                    <span className="hidden sm:inline">ส่งออก CSV</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="bg-canvas border border-hairline rounded-lg p-16 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted font-medium">กำลังโหลดข้อมูล...</p>
            </div>
          ) : heatmapData && (
            <div className="bg-canvas border border-hairline rounded-lg shadow-sm overflow-x-auto scrollbar-thin">
              <div className="min-w-max flex flex-col">
                {/* Column Headers (Week numbers) */}
                <div className="border-b border-hairline flex items-center">
                  {/* Fixed left column header */}
                  <div className="sticky left-0 z-20 bg-surface-soft w-48 sm:w-60 md:w-72 shrink-0 px-3 sm:px-4 py-2.5 border-r border-hairline flex items-center gap-1.5">
                    <Users size={13} className="text-muted" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                      นักศึกษา ({filteredStudents.length} คน)
                    </span>
                  </div>
                  {/* Week columns */}
                  <div className="flex gap-[3px] px-4 py-2.5 items-center">
                    {sessions.map(session => (
                      <div
                        key={session.id}
                        className="w-6 sm:w-5 text-center shrink-0"
                        title={`ครั้งที่ ${session.week_number}: ${session.title} — ${formatDate(session.date)}`}
                      >
                        <div className="text-[9px] font-bold text-muted leading-tight">{session.week_number}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Student rows */}
                {filteredStudents.length === 0 ? (
                  <div className="py-12 text-center text-muted text-sm border-b border-hairline">ไม่พบนักศึกษาในกลุ่มนี้</div>
                ) : (
                  <div className="divide-y divide-hairline">
                    {filteredStudents.map((student, idx) => {
                      // Compute summary
                      const totalPresent = sessions.filter(s => student.attendance[s.id] !== undefined).length;
                      const rate = sessions.length > 0 ? Math.round((totalPresent / sessions.length) * 100) : 0;

                      return (
                        <div
                          key={student.student_id}
                          className={`flex items-center border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-strong ${
                            idx % 2 === 0 ? 'bg-canvas' : 'bg-surface-soft'
                          }`}
                        >
                          {/* Fixed: index + student info */}
                          <div className="sticky left-0 z-10 bg-inherit w-48 sm:w-60 md:w-72 shrink-0 px-3 sm:px-4 py-2.5 border-r border-hairline flex items-center gap-2 sm:gap-3">
                            <span className="text-[11px] text-muted-soft font-bold w-5 text-right shrink-0">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-ink truncate">
                                {student.prefix}{student.first_name} {student.last_name}
                              </div>
                              <div className="text-[10px] text-muted-soft font-mono">{student.student_id}</div>
                            </div>
                            {/* Mini stat */}
                            <div className="text-right shrink-0">
                              <div className={`text-xs font-extrabold ${
                                rate >= 80 ? 'text-green-600' : rate >= 60 ? 'text-amber-500' : 'text-red-500'
                              }`}>{rate}%</div>
                              <div className="text-[9px] text-muted-soft">{totalPresent}/{sessions.length}</div>
                            </div>
                          </div>

                          {/* Heatmap cells */}
                          <div className="px-4 py-2.5">
                            <HeatmapRow
                              student={student}
                              sessions={sessions}
                              onHover={setTooltip}
                              onLeave={() => setTooltip(null)}
                              onClickCell={handleCellClick}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Footer summary */}
                {filteredStudents.length > 0 && sessions.length > 0 && (
                  <div className="border-t border-hairline px-4 py-2.5 bg-surface-soft flex items-center gap-4 text-[11px] text-muted">
                    <div className="sticky left-0 z-10 bg-surface-soft w-48 sm:w-60 md:w-72 shrink-0 px-3 sm:px-4 py-2.5 border-r border-hairline flex items-center gap-3 font-bold text-ink">
                      <span className="w-5" />
                      <span>สรุปรายครั้ง</span>
                    </div>
                    <div className="flex gap-[3px]">
                      {sessions.map(session => {
                        const presentCount = filteredStudents.filter(s => s.attendance[session.id] !== undefined).length;
                        const total = filteredStudents.length;
                        const pct = total > 0 ? Math.round((presentCount / total) * 100) : 0;
                        const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#f87171';
                        return (
                          <div
                            key={session.id}
                            className="w-6 h-6 sm:w-5 sm:h-5 rounded-[3px] shrink-0 flex items-center justify-center cursor-default"
                            style={{ backgroundColor: color + '30', border: `1.5px solid ${color}` }}
                            title={`ค${session.week_number}: ${presentCount}/${total} คน (${pct}%)`}
                          >
                            <span className="text-[7px] font-bold" style={{ color }}>
                              {pct}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal แก้ไขสถานะเช็กชื่อและหมายเหตุ */}
      {editingCell && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-canvas border border-hairline rounded-xl shadow-2xl p-6 w-full max-w-md space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <h3 className="font-bold text-lg text-ink flex items-center gap-2">
                <span>📝 แก้ไขการเช็กชื่อ</span>
              </h3>
              <button
                onClick={() => setEditingCell(null)}
                className="text-muted hover:text-ink cursor-pointer p-1 rounded-md hover:bg-surface-soft border-0 bg-transparent"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-left">
              {/* Student Details */}
              <div className="bg-surface-soft p-3.5 rounded-lg border border-hairline space-y-1 text-xs">
                <div><span className="font-bold text-ink">นักศึกษา:</span> {editingCell.student.prefix}{editingCell.student.first_name} {editingCell.student.last_name}</div>
                <div><span className="font-bold text-ink">รหัสนักศึกษา:</span> <span className="font-mono">{editingCell.student.student_id}</span></div>
                <div><span className="font-bold text-ink">ครั้งที่กิจกรรม:</span> ครั้งที่ {editingCell.session.week_number} ({editingCell.session.title})</div>
                <div><span className="font-bold text-ink">วันที่จัดกิจกรรม:</span> {formatDate(editingCell.session.date)}</div>
              </div>

              {/* Status Radio Toggles */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-ink">สถานะการเช็กชื่อ</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingCell(prev => prev ? { ...prev, status: 'present' } : null)}
                    className={`h-11 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      editingCell.status === 'present'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold shadow-sm shadow-emerald-100'
                        : 'bg-canvas border-hairline text-muted hover:border-emerald-200'
                    }`}
                  >
                    <CheckCircle2 size={16} />
                    <span>เข้ากิจกรรม (Present)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingCell(prev => prev ? { ...prev, status: 'absent' } : null)}
                    className={`h-11 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      editingCell.status === 'absent'
                        ? 'bg-rose-50 border-rose-300 text-rose-700 font-bold shadow-sm shadow-rose-100'
                        : 'bg-canvas border-hairline text-muted hover:border-rose-200'
                    }`}
                  >
                    <XCircle size={16} />
                    <span>ไม่เข้ากิจกรรม (Absent)</span>
                  </button>
                </div>
              </div>

              {/* Remark Input */}
              <div className="space-y-2">
                <label htmlFor="remark-textarea" className="block text-xs font-bold text-ink">หมายเหตุ</label>
                <textarea
                  id="remark-textarea"
                  value={editingCell.remark}
                  onChange={e => setEditingCell(prev => prev ? { ...prev, remark: e.target.value } : null)}
                  placeholder="กรอกหมายเหตุ เช่น ลาป่วย, ลากิจ, มาสาย, ลืมโทรศัพท์ ฯลฯ"
                  rows={3}
                  className="w-full border border-hairline rounded-lg px-3.5 py-2 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2 border-t border-hairline">
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="h-10 px-5 border border-hairline rounded-lg text-sm font-semibold text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer bg-transparent"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveCell}
                className="h-10 px-6 bg-primary hover:bg-primary-active text-white rounded-lg text-sm font-semibold shadow-md shadow-primary/20 transition-all cursor-pointer border-0"
              >
                บันทึกข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Preview Modal */}
      {showReportModal && activeMajor && heatmapData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
          <div className="bg-canvas border border-hairline rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-hairline bg-surface-soft">
              <div>
                <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                  <Printer className="text-primary" size={20} />
                  <span>รายงานสรุปการเข้าร่วมกิจกรรม (Attendance Report)</span>
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  {tabFullLabel(activeMajor)} · ทั้งหมด {filteredStudents.length} คน · {sessions.length} ครั้ง
                </p>
              </div>

              {/* Toolbar in Modal */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Threshold Setting */}
                <div className="flex items-center gap-1.5 bg-canvas border border-hairline px-2.5 py-1 rounded-lg text-xs">
                  <SlidersHorizontal size={13} className="text-muted" />
                  <span className="text-muted font-medium">เกณฑ์ผ่าน:</span>
                  <select
                    value={passThreshold}
                    onChange={e => setPassThreshold(Number(e.target.value))}
                    className="bg-transparent font-bold text-ink outline-none cursor-pointer"
                  >
                    <option value={90}>90%</option>
                    <option value={85}>85%</option>
                    <option value={80}>80% (มาตรฐาน)</option>
                    <option value={75}>75%</option>
                    <option value={70}>70%</option>
                    <option value={60}>60%</option>
                    <option value={50}>50%</option>
                  </select>
                </div>

                {/* Print Button */}
                <button
                  type="button"
                  onClick={handlePrintPDF}
                  className="h-9 px-3.5 bg-primary hover:bg-primary-active text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm shadow-primary/20 transition-all border-0"
                >
                  <Printer size={15} />
                  <span>พิมพ์ / บันทึก PDF</span>
                </button>

                {/* CSV Button */}
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="h-9 px-3 bg-canvas border border-hairline text-ink hover:bg-surface-soft rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Download size={15} className="text-emerald-600" />
                  <span>CSV</span>
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Summary Stat Bar */}
            {(() => {
              const total = filteredStudents.length;
              const passed = filteredStudents.filter(s => {
                const att = sessions.filter(sess => s.attendance[sess.id] !== undefined).length;
                return (sessions.length > 0 ? Math.round((att / sessions.length) * 100) : 0) >= passThreshold;
              }).length;
              const failed = total - passed;
              return (
                <div className="grid grid-cols-3 divide-x divide-hairline border-b border-hairline bg-canvas text-center py-2 text-xs">
                  <div>
                    <span className="text-muted">นักศึกษาทั้งหมด: </span>
                    <span className="font-bold text-ink">{total} คน</span>
                  </div>
                  <div>
                    <span className="text-muted">ผ่านเกณฑ์ (≥{passThreshold}%): </span>
                    <span className="font-bold text-emerald-600">{passed} คน ({total > 0 ? Math.round((passed / total) * 100) : 0}%)</span>
                  </div>
                  <div>
                    <span className="text-muted">ไม่ผ่านเกณฑ์: </span>
                    <span className="font-bold text-rose-600">{failed} คน ({total > 0 ? Math.round((failed / total) * 100) : 0}%)</span>
                  </div>
                </div>
              );
            })()}

            {/* Modal Body / Table Preview */}
            <div className="overflow-auto flex-1 p-4">
              <table className="w-full text-left text-xs border-collapse border border-hairline">
                <thead>
                  <tr className="bg-surface-soft border-b border-hairline text-muted font-bold">
                    <th className="p-2 border border-hairline text-center w-10">ลำดับ</th>
                    <th className="p-2 border border-hairline text-center w-28">รหัสนักศึกษา</th>
                    <th className="p-2 border border-hairline min-w-[140px]">ชื่อ - นามสกุล</th>
                    {sessions.map(s => (
                      <th key={s.id} className="p-2 border border-hairline text-center min-w-[65px]">
                        <div className="font-bold text-ink">ครั้งที่ {s.week_number}</div>
                        <div className="text-[10px] text-muted-soft font-normal">{formatShortDate(s.date)}</div>
                      </th>
                    ))}
                    <th className="p-2 border border-hairline text-center w-16">มา/รวม</th>
                    <th className="p-2 border border-hairline text-center w-14">ร้อยละ</th>
                    <th className="p-2 border border-hairline text-center w-20">ผลประเมิน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline text-ink">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={sessions.length + 6} className="p-8 text-center text-muted">
                        ไม่พบข้อมูลนักศึกษาตามเงื่อนไขที่ค้นหา
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((s, idx) => {
                      const attendedCount = sessions.filter(sess => s.attendance[sess.id] !== undefined).length;
                      const totalSessions = sessions.length;
                      const rate = totalSessions > 0 ? Math.round((attendedCount / totalSessions) * 100) : 0;
                      const isPass = rate >= passThreshold;

                      return (
                        <tr key={s.id} className="hover:bg-surface-soft/40 transition-colors">
                          <td className="p-2 border border-hairline text-center text-muted font-mono">{idx + 1}</td>
                          <td className="p-2 border border-hairline text-center font-mono font-medium">{s.student_id}</td>
                          <td className="p-2 border border-hairline font-medium whitespace-nowrap">
                            {s.prefix || ''}{s.first_name} {s.last_name}
                          </td>
                          {sessions.map(sess => {
                            const attended = s.attendance[sess.id] !== undefined;
                            return (
                              <td key={sess.id} className="p-2 border border-hairline text-center font-bold">
                                {attended ? (
                                  <span className="text-emerald-600">✓</span>
                                ) : (
                                  <span className="text-muted-soft font-normal">-</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="p-2 border border-hairline text-center font-mono">
                            {attendedCount}/{totalSessions}
                          </td>
                          <td className="p-2 border border-hairline text-center font-bold font-mono">
                            {rate}%
                          </td>
                          <td className="p-2 border border-hairline text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                                isPass
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {isPass ? 'ผ่าน' : 'ไม่ผ่าน'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-hairline bg-surface-soft/50 flex items-center justify-between">
              <span className="text-xs text-muted">
                กด <strong>พิมพ์ / บันทึก PDF</strong> เพื่อเลือกพิมพ์ลงกระดาษ A4 แนวนอน หรือบันทึกเป็นไฟล์ PDF
              </span>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="h-8 px-4 bg-canvas border border-hairline rounded-lg text-xs font-semibold text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip (portal-like fixed) */}
      {tooltip && <Tooltip info={tooltip} />}
    </div>
  );
}
