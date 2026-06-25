import { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar, Users, CheckCircle, Clock, ShieldAlert } from 'lucide-react';

export default function AdminDashboard() {
  const [totalSessions, setTotalSessions] = useState(0);
  const [totalAttendances, setTotalAttendances] = useState(0);
  const [isSheetsConnected, setIsSheetsConnected] = useState(false);
  const [recentAttendances, setRecentAttendances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch stats
    axios.get('/api/stats')
      .then(res => {
        setTotalSessions(res.data.totalSessions || 0);
        setTotalAttendances(res.data.totalAttendances || 0);
        setIsSheetsConnected(res.data.isSheetsConnected || false);
      })
      .catch(err => console.error('Error fetching stats:', err));

    // Fetch recent attendances
    axios.get('/api/attendances/recent')
      .then(res => {
        setRecentAttendances(res.data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching recent attendances:', err);
        setLoading(false);
      });
  }, []);

  const stats = [
    {
      label: 'จำนวนคาบกิจกรรมทั้งหมด',
      value: totalSessions.toString(),
      change: 'คาบเรียนที่มีในฐานข้อมูล',
      icon: Calendar,
    },
    {
      label: 'จำนวนการเช็กชื่อทั้งหมด',
      value: totalAttendances.toString(),
      change: 'รายการเช็กชื่อสำเร็จ',
      icon: Users,
    },
    {
      label: 'สถานะ Google Sheets',
      value: isSheetsConnected ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อมต่อ',
      change: isSheetsConnected ? 'ซิงค์ข้อมูลอัตโนมัติ' : 'กรุณาตั้งค่า Google Sheets API',
      icon: isSheetsConnected ? CheckCircle : ShieldAlert,
      textColor: isSheetsConnected ? 'text-success' : 'text-error',
    },
  ];

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    } catch (e) {
      return 'ไม่ระบุเวลา';
    }
  };

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl md:text-4xl font-semibold text-ink tracking-tight">
          ภาพรวมระบบเช็กชื่อ
        </h1>
        <p className="text-muted text-sm md:text-base mt-2">
          ติดตามสถิติการเช็กชื่อกิจกรรมของนักศึกษา คาบกิจกรรมที่เปิดใช้งาน และความพร้อมการซิงค์ข้อมูล
        </p>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, idx) => (
          <div 
            key={idx} 
            className="bg-surface-card border border-hairline p-6 rounded-lg flex flex-col justify-between h-40 transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)]"
          >
            <div className="flex justify-between items-start">
              <span className="text-muted text-sm font-semibold tracking-wide uppercase">
                {stat.label}
              </span>
              <div className="w-8 h-8 bg-canvas border border-hairline rounded-full flex items-center justify-center text-ink">
                <stat.icon size={16} />
              </div>
            </div>
            <div>
              <p className={`text-3xl font-bold tracking-tight text-ink mt-2 ${stat.textColor || ''}`}>
                {stat.value}
              </p>
              <p className="text-muted-soft text-xs mt-1">
                {stat.change}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Embedded Product UI Fragment: Recent Sign-ins */}
      <div className="bg-canvas border border-hairline rounded-lg overflow-hidden">
        <div className="p-6 border-b border-hairline flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink tracking-tight">การเช็กชื่อล่าสุด</h2>
            <p className="text-muted text-xs mt-0.5">รายชื่อนักศึกษาที่เพิ่งสแกนเช็กชื่อเข้าร่วมกิจกรรมในระบบ</p>
          </div>
          <div className="flex items-center space-x-2 text-xs text-muted bg-surface-soft px-3 py-1.5 rounded-full border border-hairline">
            <Clock size={12} className="animate-pulse text-success" />
            <span className="font-semibold text-ink">กิจกรรมสด (Live)</span>
          </div>
        </div>
        <div className="divide-y divide-hairline">
          {loading ? (
            <div className="p-12 text-center text-muted-soft">กำลังโหลดข้อมูล...</div>
          ) : recentAttendances.length === 0 ? (
            <div className="p-12 text-center text-muted-soft">ไม่มีประวัติการเช็กชื่อกิจกรรมในระบบในขณะนี้</div>
          ) : (
            recentAttendances.map((student, idx) => (
              <div key={idx} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-surface-soft/40 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-ink text-sm sm:text-base">{student.prefix || ''}{student.first_name} {student.last_name}</span>
                    <span className="text-xs text-muted-soft">({student.student_id})</span>
                  </div>
                  <div className="text-xs text-muted flex flex-wrap items-center gap-x-2">
                    <span>{student.class_year}{student.major_code}{student.room}</span>
                    <span className="text-hairline">•</span>
                    <span className="text-muted-soft">สัปดาห์ที่ {student.week_number}: {student.session_title}</span>
                  </div>
                </div>
                <div className="mt-2 sm:mt-0 text-right">
                  <span className="inline-block text-xs bg-success/10 text-success font-semibold px-2.5 py-1 rounded-full">
                    {formatTime(student.attended_at)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
