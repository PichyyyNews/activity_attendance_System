import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Plus, Edit2, Trash2, X, Check, ClipboardCheck, GraduationCap } from 'lucide-react';

export default function AdminAttendanceList() {
  const [sessions, setSessions] = useState<{ id: number; week_number: number; title: string; date: string }[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [majors, setMajors] = useState<{ id: number; class_year: string; major_code: string; room: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Loading & error states
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingAttendances, setLoadingAttendances] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [currentRecordId, setCurrentRecordId] = useState<number | null>(null);

  // Form states
  const [prefix, setPrefix] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMajorCode, setSelectedMajorCode] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    // Fetch sessions
    axios.get('/api/sessions')
      .then(res => {
        const data = res.data || [];
        setSessions(data);
        if (data.length > 0) {
          // Default to the latest session
          const latest = [...data].sort((a, b) => b.week_number - a.week_number)[0];
          setSelectedSessionId(latest.id);
        }
        setLoadingSessions(false);
      })
      .catch(err => {
        console.error('Error fetching sessions:', err);
        setErrorMsg('ไม่สามารถโหลดข้อมูลคาบกิจกรรมได้');
        setLoadingSessions(false);
      });

    // Fetch majors for cascading selects
    axios.get('/api/majors')
      .then(res => setMajors(res.data || []))
      .catch(err => console.error('Error fetching majors:', err));
  }, []);

  useEffect(() => {
    if (selectedSessionId !== null) {
      fetchAttendances(selectedSessionId);
    }
  }, [selectedSessionId]);

  const fetchAttendances = (sessionId: number) => {
    setLoadingAttendances(true);
    axios.get(`/api/attendances/session/${sessionId}`)
      .then(res => {
        setAttendances(res.data || []);
        setLoadingAttendances(false);
      })
      .catch(err => {
        console.error('Error fetching attendances:', err);
        setErrorMsg('ไม่สามารถโหลดรายชื่อการเข้าเรียนได้');
        setLoadingAttendances(false);
      });
  };

  // Cascading select options helper
  const years = Array.from(new Set(majors.map(m => m.class_year))).sort();
  const majorCodes = Array.from(
    new Set(
      majors
        .filter(m => m.class_year === selectedYear)
        .map(m => m.major_code)
    )
  ).sort();
  const rooms = Array.from(
    new Set(
      majors
        .filter(m => m.class_year === selectedYear && m.major_code === selectedMajorCode)
        .map(m => m.room)
    )
  ).sort();

  const handleOpenAdd = () => {
    setModalMode('add');
    setCurrentRecordId(null);
    setPrefix('');
    setFirstName('');
    setLastName('');
    setStudentId('');
    setSelectedYear('');
    setSelectedMajorCode('');
    setSelectedRoom('');
    setModalError('');
    setShowModal(true);
  };

  const handleOpenEdit = (record: any) => {
    setModalMode('edit');
    setCurrentRecordId(record.id);
    setPrefix(record.prefix || '');
    setFirstName(record.first_name);
    setLastName(record.last_name);
    setStudentId(record.student_id);
    
    // Check if the saved class_year/major_code/room exists in configured majors
    setSelectedYear(record.class_year || '');
    setSelectedMajorCode(record.major_code || '');
    setSelectedRoom(record.room || '');
    
    setModalError('');
    setShowModal(true);
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (!selectedSessionId) {
      setModalError('กรุณาเลือกสัปดาห์กิจกรรมก่อน');
      return;
    }

    if (!prefix || !firstName.trim() || !lastName.trim() || !studentId || !selectedYear || !selectedMajorCode || !selectedRoom) {
      setModalError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    if (!/^\d{11}$/.test(studentId)) {
      setModalError('รหัสนักศึกษาต้องเป็นตัวเลข 11 หลักเท่านั้น');
      return;
    }

    const payload = {
      session_id: selectedSessionId,
      prefix,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      student_id: studentId,
      class_year: selectedYear,
      major_code: selectedMajorCode,
      room: selectedRoom
    };

    try {
      if (modalMode === 'add') {
        await axios.post('/api/attendances', payload);
        setSuccessMsg('เพิ่มรายชื่อการเข้าเรียนแมนนวลเสร็จสิ้น (ซิงค์ลง Google Sheet อัตโนมัติ)');
      } else {
        if (!currentRecordId) return;
        await axios.put(`/api/attendances/${currentRecordId}`, payload);
        setSuccessMsg('แก้ไขข้อมูลการเข้าเรียนเรียบร้อยแล้ว');
      }

      setShowModal(false);
      fetchAttendances(selectedSessionId);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setModalError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('คุณแน่ใจหรือไม่ที่จะลบประวัติการเช็กชื่อของนักศึกษารายนี้จากฐานข้อมูล SQLite?')) return;

    try {
      await axios.delete(`/api/attendances/${id}`);
      setSuccessMsg('ลบรายการเช็กชื่อสำเร็จแล้ว');
      if (selectedSessionId) {
        fetchAttendances(selectedSessionId);
      }
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      console.error('Error deleting record:', err);
      setErrorMsg('ไม่สามารถลบข้อมูลได้');
      setTimeout(() => setErrorMsg(''), 3000);
    }
  };

  // Filter attendances by query
  const filteredAttendances = attendances.filter(record => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      record.student_id.includes(query) ||
      record.first_name.toLowerCase().includes(query) ||
      record.last_name.toLowerCase().includes(query) ||
      (record.major_code && record.major_code.toLowerCase().includes(query))
    );
  });

  const formatThaiDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
      }
    } catch (e) {}
    return dateStr;
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return '-';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    } catch (e) {
      return '-';
    }
  };

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold text-ink tracking-tight flex items-center space-x-2">
            <ClipboardCheck className="w-8 h-8 text-ink" />
            <span>ตารางเช็กชื่อเข้าเรียน</span>
          </h1>
          <p className="text-muted text-sm md:text-base mt-2">
            ค้นหา ตรวจสอบข้อมูล เพิ่ม แฟ้มข้อมูลการเช็กชื่อเข้าเรียนของนักศึกษาที่จัดเก็บในระบบ SQLite
          </p>
        </div>
        <div>
          <button
            onClick={handleOpenAdd}
            disabled={!selectedSessionId}
            className="w-full sm:w-auto bg-primary hover:bg-primary-active disabled:bg-surface-strong text-white px-5 py-2.5 rounded-md text-sm font-semibold flex items-center justify-center space-x-2 transition-all active:scale-98 cursor-pointer"
          >
            <Plus size={16} />
            <span>เพิ่มรายชื่อแมนนวล</span>
          </button>
        </div>
      </div>

      {/* Main Settings/Search Bar */}
      <div className="bg-canvas border border-hairline rounded-lg p-5 flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
        {/* Week Selector Dropdown */}
        <div className="w-full md:w-80 space-y-1.5">
          <label className="block text-xs font-bold text-muted uppercase tracking-wider">เลือกสัปดาห์กิจกรรม</label>
          <select
            value={selectedSessionId || ''}
            onChange={e => setSelectedSessionId(Number(e.target.value))}
            className="w-full h-11 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer font-semibold"
          >
            {sessions.length === 0 ? (
              <option value="" disabled>-- ไม่มีคาบกิจกรรม --</option>
            ) : (
              sessions.map(s => (
                <option key={s.id} value={s.id}>
                  สัปดาห์ที่ {s.week_number} • {s.title} ({formatThaiDate(s.date)})
                </option>
              ))
            )}
          </select>
        </div>

        {/* Filter Search Field */}
        <div className="w-full md:flex-grow max-w-md space-y-1.5">
          <label className="block text-xs font-bold text-muted uppercase tracking-wider">ค้นหาตาม ชื่อ/รหัสนักศึกษา/สาขา</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
              <Search size={16} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="ค้นหา เช่น ณัฐพัทธ์, 64012345678, ชทค..."
              className="w-full h-11 border border-hairline rounded-md pl-10 pr-4 text-sm bg-canvas text-ink focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {successMsg && (
        <div className="flex items-center space-x-2.5 p-4 rounded-md bg-success/15 border border-success/30 text-success text-sm font-semibold animate-in fade-in duration-200">
          <Check size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center space-x-2.5 p-4 rounded-md bg-error/15 border border-error/30 text-error text-sm font-semibold animate-in fade-in duration-200">
          <X size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Attendance Table */}
      <div className="bg-canvas border border-hairline rounded-lg overflow-hidden shadow-sm">
        {loadingSessions || loadingAttendances ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-sm text-muted font-semibold">กำลังโหลดตารางเช็กชื่อเรียน...</p>
          </div>
        ) : filteredAttendances.length === 0 ? (
          <div className="p-16 text-center text-muted-soft text-sm">
            {attendances.length === 0 
              ? 'สัปดาห์นี้ยังไม่มีนักศึกษาเช็กชื่อเข้าร่วมกิจกรรมในระบบ' 
              : 'ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-surface-soft border-b border-hairline">
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted w-16 text-center">ลำดับ</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted w-40">รหัสนักศึกษา</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted">ชื่อ-นามสกุล</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted w-32">ระดับชั้นปี/ห้อง</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted w-36">เวลาเข้าเรียน</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted w-28 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {filteredAttendances.map((record, index) => (
                  <tr key={record.id} className="hover:bg-surface-soft/30 transition-colors">
                    <td className="p-4 text-sm text-center text-muted font-semibold">{index + 1}</td>
                    <td className="p-4 text-sm font-mono font-bold text-ink">{record.student_id}</td>
                    <td className="p-4 text-sm font-semibold text-ink">
                      {record.prefix || ''}{record.first_name} {record.last_name}
                    </td>
                    <td className="p-4 text-sm font-bold text-ink">
                      <span className="bg-surface-soft border border-hairline px-2.5 py-0.5 rounded text-xs">
                        {record.class_year}{record.major_code}{record.room}
                      </span>
                    </td>
                    <td className="p-4 text-sm font-semibold text-muted">
                      {formatTime(record.attended_at)}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpenEdit(record)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-hairline bg-canvas hover:bg-surface-soft text-muted hover:text-ink transition-colors cursor-pointer"
                        title="แก้ไขข้อมูล"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(record.id)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-error/20 bg-canvas hover:bg-error/10 text-muted hover:text-error transition-colors cursor-pointer"
                        title="ลบรายชื่อ"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CRUD Add/Edit Modal overlay */}
      {showModal && (
        <div className="fixed inset-0 bg-[#111111]/40 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-in fade-in duration-200">
          <form
            onSubmit={handleModalSubmit}
            className="bg-canvas border border-hairline rounded-lg shadow-2xl p-6 md:p-8 max-w-md w-full relative flex flex-col animate-in zoom-in-95 duration-200 space-y-6"
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
                {modalMode === 'add' ? 'เพิ่มรายชื่อการเช็กชื่อด้วยตัวเอง' : 'แก้ไขข้อมูลการเช็กชื่อ'}
              </h2>
              <p className="text-xs text-muted mt-1">
                กรอกข้อมูลรายละเอียดของนักศึกษาให้ครบถ้วนเพื่อทำการบันทึกลง SQLite
              </p>
            </div>

            {modalError && (
              <div className="p-3 bg-error/15 border border-error/30 text-error text-xs font-semibold rounded-md">
                {modalError}
              </div>
            )}

            <div className="space-y-4">
              {/* Row 1: Student ID */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">รหัสนักศึกษา 11 หลัก</label>
                <input
                  type="text"
                  required
                  value={studentId}
                  onChange={e => setStudentId(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  className="w-full h-10 border border-hairline rounded-md px-3.5 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono"
                  placeholder="เช่น 64012345678"
                />
              </div>

              {/* Row 2: Prefix, First Name, Last Name */}
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-3 space-y-1.5">
                  <label className="block text-[10px] font-bold text-ink uppercase tracking-wider">คำนำหน้า</label>
                  <select
                    required
                    value={prefix}
                    onChange={e => setPrefix(e.target.value)}
                    className="w-full h-10 border border-hairline rounded-md px-2 text-xs bg-canvas text-ink focus:outline-none cursor-pointer"
                  >
                    <option value="" disabled>เลือก</option>
                    <option value="นาย">นาย</option>
                    <option value="นางสาว">นางสาว</option>
                  </select>
                </div>
                <div className="col-span-4 space-y-1.5">
                  <label className="block text-[10px] font-bold text-ink uppercase tracking-wider">ชื่อจริง</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    className="w-full h-10 border border-hairline rounded-md px-2.5 text-xs bg-canvas text-ink placeholder:text-muted-soft focus:outline-none"
                    placeholder="เช่น สมศักดิ์"
                  />
                </div>
                <div className="col-span-5 space-y-1.5">
                  <label className="block text-[10px] font-bold text-ink uppercase tracking-wider">นามสกุล</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    className="w-full h-10 border border-hairline rounded-md px-2.5 text-xs bg-canvas text-ink placeholder:text-muted-soft focus:outline-none"
                    placeholder="เช่น เรียนดี"
                  />
                </div>
              </div>

              {/* Row 3: Class Year, Major Code, Room (Cascading Dropdowns) */}
              <div className="bg-surface-soft border border-hairline p-3 rounded-md space-y-3">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-ink">
                  <GraduationCap size={15} />
                  <span>ระดับชั้นเรียน / สาขาวิชา / ห้อง</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] text-muted font-bold">ชั้นปี</label>
                    <select
                      required
                      value={selectedYear}
                      onChange={e => {
                        setSelectedYear(e.target.value);
                        setSelectedMajorCode('');
                        setSelectedRoom('');
                      }}
                      className="w-full h-9 border border-hairline rounded bg-canvas text-ink text-xs px-2 cursor-pointer focus:outline-none"
                    >
                      <option value="">-- เลือก --</option>
                      {years.map(y => (
                        <option key={y} value={y}>ปี {y}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] text-muted font-bold">รหัสสาขา</label>
                    <select
                      required
                      disabled={!selectedYear}
                      value={selectedMajorCode}
                      onChange={e => {
                        setSelectedMajorCode(e.target.value);
                        setSelectedRoom('');
                      }}
                      className="w-full h-9 border border-hairline rounded bg-canvas text-ink text-xs px-2 cursor-pointer focus:outline-none disabled:opacity-50"
                    >
                      <option value="">-- เลือก --</option>
                      {majorCodes.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] text-muted font-bold">ห้อง</label>
                    <select
                      required
                      disabled={!selectedMajorCode}
                      value={selectedRoom}
                      onChange={e => setSelectedRoom(e.target.value)}
                      className="w-full h-9 border border-hairline rounded bg-canvas text-ink text-xs px-2 cursor-pointer focus:outline-none disabled:opacity-50"
                    >
                      <option value="">-- เลือก --</option>
                      {rooms.map(r => (
                        <option key={r} value={r}>ห้อง {r}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {majors.length === 0 && (
                  <p className="text-[10px] text-error">
                    *ไม่พบโครงสร้างสาขาวิชาในระบบ กรุณาเพิ่มสาขาวิชาในหน้าตั้งค่าระบบก่อน
                  </p>
                )}
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
                {modalMode === 'add' ? 'บันทึกเข้าตาราง' : 'บันทึกแก้ไข'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
