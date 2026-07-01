import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  Sparkles,
  RefreshCw,
  Trash,
  Edit2,
  GraduationCap,
  Check,
  ShieldAlert,
  Save,
  X,
  Plus
} from 'lucide-react';

interface Student {
  id: number;
  student_id: string;
  prefix: string;
  first_name: string;
  last_name: string;
  level: string;
  year: string;
  major_name: string;
  major_code: string;
  room: string;
  created_at: string;
}

interface Major {
  id: number;
  level: string;
  year: string;
  major_name: string;
  major_code: string;
  room: string;
}

export default function AdminStudents() {
  // Roster state
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterMajor, setFilterMajor] = useState('');
  const [filterRoom, setFilterRoom] = useState('');

  // Import form state
  const [majors, setMajors] = useState<Major[]>([]);
  const [selectedMajorId, setSelectedMajorId] = useState('');
  const [level, setLevel] = useState('ปวช');
  const [classYear, setClassYear] = useState('1');
  const [majorName, setMajorName] = useState('เทคนิคคอมพิวเตอร์');
  const [majorCode, setMajorCode] = useState('ชทค');
  const [room, setRoom] = useState('1');
  
  const [inputIds, setInputIds] = useState('');
  const [inputNames, setInputNames] = useState('');
  
  const [importing, setImporting] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Academic Year Management States (CRUD)
  interface AcademicYear { id: number; year: string; term: string; is_active: number; }
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loadingYears, setLoadingYears] = useState(false);

  // Add Academic Year Modal
  const [showAddYearModal, setShowAddYearModal] = useState(false);
  const [newYear, setNewYear] = useState('');
  const [newTerm, setNewTerm] = useState('1');
  const [addYearError, setAddYearError] = useState('');
  const [addYearLoading, setAddYearLoading] = useState(false);

  // Edit Academic Year Modal
  const [showEditYearModal, setShowEditYearModal] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);
  const [editYear, setEditYear] = useState('');
  const [editTerm, setEditTerm] = useState('1');
  const [editYearError, setEditYearError] = useState('');
  const [editYearLoading, setEditYearLoading] = useState(false);

  const [yearActionMsg, setYearActionMsg] = useState('');
  const [yearActionError, setYearActionError] = useState('');
  
  // Edit Student Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editStudentId, setEditStudentId] = useState('');
  const [editPrefix, setEditPrefix] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editMajorId, setEditMajorId] = useState('');
  const [editLevel, setEditLevel] = useState('');
  const [editClassYear, setEditClassYear] = useState('');
  const [editMajorName, setEditMajorName] = useState('');
  const [editMajorCode, setEditMajorCode] = useState('');
  const [editRoom, setEditRoom] = useState('');
  const [editModalError, setEditModalError] = useState('');
  
  // Custom Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{ show: boolean; title: string; message: string; onConfirm: () => void }>({ show: false, title: '', message: '', onConfirm: () => {} });

  // States for adding a new major/room
  const [newLevel, setNewLevel] = useState('ปวช');
  const [newClassYear, setNewClassYear] = useState('1');
  const [newMajorName, setNewMajorName] = useState('เทคนิคคอมพิวเตอร์');
  const [newMajorCode, setNewMajorCode] = useState('ชทค');
  const [newRoom, setNewRoom] = useState('1');
  const [majorError, setMajorError] = useState('');
  const [majorSuccess, setMajorSuccess] = useState('');

  // Unique majors list for filtering
  const [uniqueLevels, setUniqueLevels] = useState<string[]>([]);
  const [uniqueYears, setUniqueYears] = useState<string[]>([]);
  const [uniqueMajors, setUniqueMajors] = useState<string[]>([]);
  const [uniqueRooms, setUniqueRooms] = useState<string[]>([]);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      clearTimeout(handler);
    };
  }, [search]);

  const fetchMajors = async () => {
    try {
      const res = await axios.get('/api/majors');
      const data = res.data || [];
      setMajors(data);
      if (data.length > 0) {
        setSelectedMajorId(data[0].id.toString());
        setLevel(data[0].level);
        setClassYear(data[0].year);
        setMajorName(data[0].major_name);
        setMajorCode(data[0].major_code);
        setRoom(data[0].room);
      } else {
        setSelectedMajorId('');
      }
    } catch (err) {
      console.error('Error fetching majors:', err);
    }
  };

  const fetchAcademicYears = async () => {
    setLoadingYears(true);
    try {
      const res = await axios.get('/api/academic-years');
      setAcademicYears(res.data || []);
    } catch (err) {
      console.error('Error fetching academic years:', err);
    } finally {
      setLoadingYears(false);
    }
  };

  const handleAddYear = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddYearError('');
    if (!/^\d{4}$/.test(newYear.trim())) {
      setAddYearError('ปีการศึกษาต้องเป็นตัวเลข 4 หลัก (เช่น 2570)');
      return;
    }
    setAddYearLoading(true);
    try {
      await axios.post('/api/academic-years', { year: newYear.trim(), term: newTerm });
      setNewYear('');
      setNewTerm('1');
      setShowAddYearModal(false);
      await fetchAcademicYears();
      setYearActionMsg('เพิ่มปีการศึกษาใหม่เรียบร้อยแล้ว');
      setTimeout(() => setYearActionMsg(''), 3000);
    } catch (err: any) {
      setAddYearError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการเพิ่มปีการศึกษา');
    } finally {
      setAddYearLoading(false);
    }
  };

  const handleEditYearClick = (ay: AcademicYear) => {
    setEditingYear(ay);
    setEditYear(ay.year);
    setEditTerm(ay.term);
    setEditYearError('');
    setShowEditYearModal(true);
  };

  const handleEditYearSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingYear) return;
    setEditYearError('');
    if (!/^\d{4}$/.test(editYear.trim())) {
      setEditYearError('ปีการศึกษาต้องเป็นตัวเลข 4 หลัก');
      return;
    }
    setEditYearLoading(true);
    try {
      await axios.put(`/api/academic-years/${editingYear.id}`, { year: editYear.trim(), term: editTerm });
      setShowEditYearModal(false);
      setEditingYear(null);
      await fetchAcademicYears();
      setYearActionMsg('แก้ไขปีการศึกษาเรียบร้อยแล้ว');
      setTimeout(() => setYearActionMsg(''), 3000);
    } catch (err: any) {
      setEditYearError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการแก้ไขปีการศึกษา');
    } finally {
      setEditYearLoading(false);
    }
  };

  const handleDeleteYear = (ay: AcademicYear) => {
    setConfirmDialog({
      show: true,
      title: 'ลบปีการศึกษา',
      message: `คุณแน่ใจหรือไม่ที่จะลบปีการศึกษา ${ay.year} เทอม ${ay.term} ออกจากระบบ?`,
      onConfirm: async () => {
        try {
          await axios.delete(`/api/academic-years/${ay.id}`);
          await fetchAcademicYears();
          setYearActionMsg('ลบปีการศึกษาเรียบร้อยแล้ว');
          setTimeout(() => setYearActionMsg(''), 3000);
        } catch (err: any) {
          setYearActionError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการลบปีการศึกษา');
          setTimeout(() => setYearActionError(''), 4000);
        }
      }
    });
  };

  const handleActivateYear = async (ay: AcademicYear) => {
    try {
      await axios.post(`/api/academic-years/${ay.id}/activate`);
      await fetchAcademicYears();
      setYearActionMsg(`ตั้งปีการศึกษา ${ay.year} เทอม ${ay.term} เป็นปีการศึกษาปัจจุบันแล้ว`);
      setTimeout(() => setYearActionMsg(''), 3000);
    } catch (err: any) {
      setYearActionError(err.response?.data?.error || 'เกิดข้อผิดพลาด');
      setTimeout(() => setYearActionError(''), 4000);
    }
  };

  useEffect(() => {
    fetchMajors();
    fetchAcademicYears();
  }, []);

  useEffect(() => {
    // Generate unique values for filters from the master majors config list
    const levels = Array.from(new Set(majors.map(m => m.level))).sort();
    const years = Array.from(new Set(majors.map(m => m.year))).sort();
    const majorCodes = Array.from(new Set(majors.map(m => m.major_code))).sort();
    const rooms = Array.from(new Set(majors.map(m => m.room))).sort();
    
    setUniqueLevels(levels);
    setUniqueYears(years);
    setUniqueMajors(majorCodes);
    setUniqueRooms(rooms);
  }, [majors]);

  const fetchStudents = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await axios.get('/api/students', {
        params: {
          search: debouncedSearch.trim() || undefined,
          level: filterLevel || undefined,
          year: filterYear || undefined,
          major_code: filterMajor || undefined,
          room: filterRoom || undefined
        }
      });
      setStudents(res.data || []);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setLoadingList(false);
    }
  }, [debouncedSearch, filterLevel, filterYear, filterMajor, filterRoom]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const triggerSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(search);
  };

  // Helper to count non-empty lines
  const getLineCount = (text: string) => {
    return text.split('\n').map(l => l.trim()).filter(Boolean).length;
  };

  const idLinesCount = getLineCount(inputIds);
  const nameLinesCount = getLineCount(inputNames);
  const isLineCountMismatch = idLinesCount !== nameLinesCount;

  // Helper to parse Thai name and extract prefix, first name, last name
  const parseName = (fullName: string) => {
    fullName = fullName.trim();
    const prefixes = ['นาย', 'นางสาว', 'นาง', 'เด็กชาย', 'เด็กหญิง', 'ด.ช.', 'ด.ญ.', 'น.ส.', 'ด.ญ', 'ด.ช'];
    let prefix = '';
    let restOfName = fullName;
    
    for (const p of prefixes) {
      if (fullName.startsWith(p)) {
        prefix = p;
        restOfName = fullName.slice(p.length).trim();
        break;
      }
    }

    // Normalize prefix to 'นาย' or 'นางสาว' (Gender Splitting)
    if (prefix === 'น.ส.' || prefix === 'น.ส' || prefix === 'นาง' || prefix === 'นางสาว' || prefix === 'เด็กหญิง' || prefix === 'ด.ญ.' || prefix === 'ด.ญ') {
      prefix = 'นางสาว';
    } else if (prefix === 'นาย' || prefix === 'เด็กชาย' || prefix === 'ด.ช.' || prefix === 'ด.ช') {
      prefix = 'นาย';
    }
    
    const parts = restOfName.split(/\s+/).filter(Boolean);
    const first_name = parts[0] || '';
    const last_name = parts.slice(1).join(' ') || '';
    
    return { prefix, first_name, last_name };
  };

  // Get preview list of students parsed from the textareas
  const getPreviewList = () => {
    const ids = inputIds.split('\n').map(l => l.trim()).filter(Boolean);
    const names = inputNames.split('\n').map(l => l.trim()).filter(Boolean);
    const count = Math.min(ids.length, names.length);
    
    const preview = [];
    for (let i = 0; i < count; i++) {
      const { prefix, first_name, last_name } = parseName(names[i]);
      preview.push({
        student_id: ids[i],
        prefix,
        first_name,
        last_name
      });
    }
    return preview;
  };

  const previewData = getPreviewList();

  const handleImport = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setErrorMsg('');

    if (idLinesCount === 0 || nameLinesCount === 0) {
      setErrorMsg('กรุณากรอกรหัสนักศึกษาและชื่อนักศึกษา');
      return;
    }

    if (isLineCountMismatch) {
      setErrorMsg(`จำนวนรายการรหัส (${idLinesCount}) และรายชื่อ (${nameLinesCount}) ไม่เท่ากัน กรุณาตรวจสอบอีกครั้ง`);
      return;
    }

    if (!selectedMajorId) {
      setErrorMsg('กรุณาเลือกกลุ่มเรียน / สาขาวิชา');
      return;
    }

    setShowImportConfirm(true);
  };

  const executeImport = async () => {
    setImporting(true);
    try {
      const res = await axios.post('/api/students/import', {
        level,
        year: classYear,
        major_name: majorName,
        major_code: majorCode,
        room,
        student_ids: inputIds,
        student_names: inputNames
      });
      
      setMessage(`นำเข้าข้อมูลนักเรียนสำเร็จทั้งหมด ${res.data.count} คน!`);
      setInputIds('');
      setInputNames('');
      fetchStudents();
      
      setTimeout(() => setMessage(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'เกิดข้อผิดพลาดในการนำเข้าข้อมูล');
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteStudent = async (id: number, studentId: string) => {
    setConfirmDialog({
      show: true,
      title: 'ลบรายชื่อนักศึกษา',
      message: `คุณแน่ใจหรือไม่ที่จะลบรหัสนักศึกษา ${studentId} ออกจากระบบ?`,
      onConfirm: async () => {
        try {
          await axios.delete(`/api/students/${id}`);
          fetchStudents();
        } catch (err) {
          console.error('Error deleting student:', err);
        }
      }
    });
  };

  const handleEditClick = (student: Student) => {
    setEditingStudent(student);
    setEditStudentId(student.student_id);
    setEditPrefix(student.prefix || 'นาย');
    setEditFirstName(student.first_name);
    setEditLastName(student.last_name);
    
    // Find matching major
    const matchedMajor = majors.find(m => m.level === student.level && m.year === student.year && m.major_code === student.major_code && m.room === student.room);
    if (matchedMajor) {
      setEditMajorId(matchedMajor.id.toString());
      setEditLevel(matchedMajor.level);
      setEditClassYear(matchedMajor.year);
      setEditMajorName(matchedMajor.major_name);
      setEditMajorCode(matchedMajor.major_code);
      setEditRoom(matchedMajor.room);
    } else {
      setEditMajorId('');
      setEditLevel(student.level);
      setEditClassYear(student.year);
      setEditMajorName(student.major_name);
      setEditMajorCode(student.major_code);
      setEditRoom(student.room);
    }
    setEditModalError('');
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setEditModalError('');

    if (!editStudentId || !editPrefix || !editFirstName || !editLastName || !editLevel || !editClassYear || !editMajorName || !editMajorCode || !editRoom) {
      setEditModalError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    if (!/^\d{11}$/.test(editStudentId)) {
      setEditModalError('รหัสนักศึกษาต้องเป็นตัวเลข 11 หลักเท่านั้น');
      return;
    }

    try {
      await axios.put(`/api/students/${editingStudent.id}`, {
        student_id: editStudentId,
        prefix: editPrefix,
        first_name: editFirstName,
        last_name: editLastName,
        level: editLevel,
        year: editClassYear,
        major_name: editMajorName,
        major_code: editMajorCode,
        room: editRoom
      });
      
      setShowEditModal(false);
      fetchStudents();
    } catch (err: any) {
      setEditModalError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล');
    }
  };

  const handleClearRoster = async () => {
    setConfirmDialog({
      show: true,
      title: '⚠️ คำเตือนสำคัญ!',
      message: 'คุณแน่ใจหรือไม่ที่จะล้างรายชื่อนักเรียนทั้งหมดในระบบล่วงหน้า? การกระทำนี้ไม่สามารถย้อนกลับได้',
      onConfirm: () => {
        setTimeout(() => {
          setConfirmDialog({
            show: true,
            title: 'ยืนยันการดำเนินการสุดท้าย',
            message: 'ยืนยันอีกครั้ง! ลบข้อมูลนักเรียนทั้งหมดจริงหรือไม่?',
            onConfirm: async () => {
              try {
                await axios.delete('/api/students');
                fetchStudents();
                setMessage('ล้างข้อมูลรายชื่อนักเรียนทั้งหมดเสร็จสิ้น');
                setTimeout(() => setMessage(''), 3000);
              } catch (err) {
                console.error('Error clearing roster:', err);
                setErrorMsg('ไม่สามารถล้างรายชื่อนักเรียนได้');
                setTimeout(() => setErrorMsg(''), 3000);
              }
            }
          });
        }, 150);
      }
    });
  };

  const handleAddMajor = async (e: React.FormEvent) => {
    e.preventDefault();
    setMajorError('');
    setMajorSuccess('');
    if (!newLevel || !newClassYear || !newMajorName.trim() || !newMajorCode.trim() || !newRoom) {
      setMajorError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    try {
      await axios.post('/api/majors', {
        level: newLevel,
        year: newClassYear,
        major_name: newMajorName.trim(),
        major_code: newMajorCode.trim().toUpperCase(),
        room: newRoom
      });
      setMajorSuccess('บันทึกข้อมูลสาขาวิชา/กลุ่มเรียนใหม่เรียบร้อยแล้ว!');
      setNewMajorName('เทคนิคคอมพิวเตอร์');
      setNewMajorCode('ชทค');
      fetchMajors();
      setTimeout(() => setMajorSuccess(''), 3000);
    } catch (err: any) {
      setMajorError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
      setTimeout(() => setMajorError(''), 3000);
    }
  };

  const handleDeleteMajor = async (id: number) => {
    setConfirmDialog({
      show: true,
      title: 'ลบสาขาวิชา/กลุ่มเรียน',
      message: 'คุณแน่ใจหรือไม่ที่จะลบสาขานี้ออกจากระบบ?',
      onConfirm: async () => {
        try {
          await axios.delete(`/api/majors/${id}`);
          fetchMajors();
        } catch (err) {
          console.error('Error deleting major:', err);
        }
      }
    });
  };

  const maleCount = students.filter(s => s.prefix === 'นาย').length;
  const femaleCount = students.filter(s => s.prefix === 'นางสาว').length;

  return (
    <div className="w-full space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl md:text-4xl font-semibold text-ink tracking-tight flex items-center space-x-3">
            <Users className="text-primary" size={32} />
            <span>จัดการรายชื่อนักเรียน</span>
          </h1>
          <p className="text-muted text-sm md:text-base mt-2">
            นำเข้ารายชื่อนักเรียนในระบบล่วงหน้า เพื่อความสะดวกรวดเร็วในการตรวจสอบสถิติและการเช็กชื่ออัตโนมัติ
          </p>
        </div>
        <div className="w-full sm:w-auto bg-canvas border border-hairline px-4 py-3 rounded-lg flex items-center space-x-3.5 shadow-sm sm:self-start">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
            <Users size={20} />
          </div>
          <div>
            <div className="text-[11px] text-muted uppercase font-bold tracking-wider">นักเรียนทั้งหมด</div>
            <div className="text-xl font-bold text-ink">{students.length} คน</div>
            <div className="text-[11px] text-muted-soft mt-0.5 font-semibold">
              ชาย: <span className="text-ink">{maleCount}</span> | หญิง: <span className="text-ink">{femaleCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Academic Year CRUD Management Card */}
      <div className="bg-canvas border border-hairline rounded-lg overflow-hidden shadow-sm">
        <div className="p-4 sm:p-5 border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <GraduationCap size={16} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink tracking-tight">จัดการปีการศึกษาในระบบ</h2>
              <p className="text-xs text-muted-soft mt-0.5">เพิ่ม แก้ไข ลบ และกำหนดปีการศึกษาปัจจุบันที่ใช้งาน</p>
            </div>
          </div>
          <button
            id="btn-add-academic-year"
            onClick={() => { setNewYear(''); setNewTerm('1'); setAddYearError(''); setShowAddYearModal(true); }}
            className="flex items-center space-x-1.5 h-9 px-4 bg-primary hover:bg-primary-active text-white text-xs font-semibold rounded-md transition-all shadow-sm cursor-pointer shrink-0"
          >
            <Plus size={14} />
            <span>เพิ่มปีการศึกษา</span>
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-3">
          {/* Action feedback */}
          {yearActionMsg && (
            <div className="flex items-center space-x-2.5 p-3 rounded-md bg-success/15 border border-success/30 text-success text-sm font-semibold animate-in fade-in duration-200">
              <Check size={15} />
              <span>{yearActionMsg}</span>
            </div>
          )}
          {yearActionError && (
            <div className="flex items-center space-x-2.5 p-3 rounded-md bg-error/15 border border-error/30 text-error text-sm font-semibold animate-in fade-in duration-200">
              <ShieldAlert size={15} />
              <span>{yearActionError}</span>
            </div>
          )}

          {loadingYears ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : academicYears.length === 0 ? (
            <div className="text-center py-8 text-muted-soft text-sm">
              ยังไม่มีปีการศึกษาในระบบ กรุณากดปุ่ม &ldquo;เพิ่มปีการศึกษา&rdquo;
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-hairline">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-surface-soft border-b border-hairline">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[11px] font-bold text-muted uppercase tracking-wider">ปีการศึกษา</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-bold text-muted uppercase tracking-wider">เทอม</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-bold text-muted uppercase tracking-wider">สถานะ</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-bold text-muted uppercase tracking-wider">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {academicYears.map((ay) => (
                    <tr
                      key={ay.id}
                      className={`transition-colors ${
                        ay.is_active ? 'bg-primary/5' : 'bg-canvas hover:bg-surface-soft/50'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span className={`font-bold text-sm ${ ay.is_active ? 'text-primary' : 'text-ink' }`}>
                          {ay.year}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-ink text-sm">เทอม {ay.term}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {ay.is_active ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold border border-primary/25">
                            <Check size={10} />
                            <span>ใช้งานอยู่</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleActivateYear(ay)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md bg-surface-soft hover:bg-primary/10 hover:text-primary border border-hairline text-muted text-[11px] font-semibold transition-all cursor-pointer"
                          >
                            <span>ตั้งเป็นปัจจุบัน</span>
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleEditYearClick(ay)}
                            title="แก้ไข"
                            className="w-7 h-7 flex items-center justify-center rounded-md border border-hairline hover:bg-surface-soft text-muted hover:text-ink transition-colors cursor-pointer"
                          >
                            <Edit2 size={13} />
                          </button>
                          {!ay.is_active && (
                            <button
                              onClick={() => handleDeleteYear(ay)}
                              title="ลบ"
                              className="w-7 h-7 flex items-center justify-center rounded-md border border-hairline hover:bg-error/10 text-muted hover:text-error transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Grid Container for 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="bg-canvas border border-hairline rounded-lg overflow-hidden shadow-sm">
            <div className="p-4 sm:p-6 border-b border-hairline flex items-center space-x-3">
              <GraduationCap size={20} className="text-ink" />
              <h2 className="text-lg font-semibold text-ink tracking-tight">
                จัดการสาขาวิชา (Dropdown สำหรับเช็กชื่อ)
              </h2>
            </div>

            <div className="p-4 sm:p-6 md:p-8 space-y-6">
              {/* Status Message Banners */}
              {majorSuccess && (
                <div className="flex items-center space-x-2.5 p-4 rounded-md bg-success/15 border border-success/30 text-success text-sm font-semibold animate-in fade-in duration-200">
                  <Check size={16} />
                  <span>{majorSuccess}</span>
                </div>
              )}

              {majorError && (
                <div className="flex items-center space-x-2.5 p-4 rounded-md bg-error/15 border border-error/30 text-error text-sm font-semibold animate-in fade-in duration-200">
                  <ShieldAlert size={16} />
                  <span>{majorError}</span>
                </div>
              )}

              {/* Add Major Form */}
              <form onSubmit={handleAddMajor} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-muted uppercase">ระดับชั้น</label>
                    <select
                      required
                      value={newLevel}
                      onChange={e => setNewLevel(e.target.value)}
                      className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                    >
                      <option value="ปวช">ปวช</option>
                      <option value="ปวส">ปวส</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-muted uppercase">ชั้นปี</label>
                    <select
                      required
                      value={newClassYear}
                      onChange={e => setNewClassYear(e.target.value)}
                      className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                    >
                      <option value="1">ปี 1</option>
                      <option value="2">ปี 2</option>
                      <option value="3">ปี 3</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-muted uppercase">กลุ่มเรียน (ห้อง)</label>
                    <select
                      required
                      value={newRoom}
                      onChange={e => setNewRoom(e.target.value)}
                      className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
                    >
                      <option value="1">กลุ่ม 1</option>
                      <option value="2">กลุ่ม 2</option>
                      <option value="3">กลุ่ม 3</option>
                      <option value="4">กลุ่ม 4</option>
                      <option value="5">กลุ่ม 5</option>
                      <option value="6">กลุ่ม 6</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="block text-[11px] font-bold text-muted uppercase">ชื่อเต็มสาขาวิชา</label>
                    <input 
                      type="text" 
                      required
                      value={newMajorName}
                      onChange={e => setNewMajorName(e.target.value)}
                      className="w-full h-10 border border-hairline rounded-md px-3.5 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                      placeholder="เช่น เทคนิคคอมพิวเตอร์"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-muted uppercase">ชื่อย่อสาขา</label>
                    <input 
                      type="text" 
                      required
                      value={newMajorCode}
                      onChange={e => setNewMajorCode(e.target.value)}
                      className="w-full h-10 border border-hairline rounded-md px-3.5 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                      placeholder="เช่น ชทค"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button 
                    type="submit"
                    className="h-10 bg-primary hover:bg-primary-active text-white px-6 rounded-md text-sm font-semibold flex items-center justify-center space-x-1.5 transition-all active:scale-98 cursor-pointer w-full sm:w-auto"
                  >
                    <Save size={15} />
                    <span>บันทึกข้อมูลกลุ่มเรียน</span>
                  </button>
                </div>
              </form>

              {/* Majors Tags Grid */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">กลุ่มเรียนที่มีในระบบ</h3>
                {majors.length === 0 ? (
                  <p className="text-xs text-muted-soft py-4">ไม่มีข้อมูลกลุ่มเรียน กรุณาเพิ่มกลุ่มเรียนใหม่ด้านบน</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {majors.map((major) => (
                      <span 
                        key={major.id} 
                        className="inline-flex items-center space-x-1.5 bg-surface-soft border border-hairline text-ink text-xs font-semibold px-3 py-1.5 rounded-full"
                      >
                        <span title={`${major.level} ปี ${major.year} ${major.major_name} กลุ่ม ${major.room}`}>
                          {major.year}{major.major_code}{major.room} ({major.level})
                        </span>
                        <button 
                          type="button" 
                          onClick={() => handleDeleteMajor(major.id)}
                          className="text-muted hover:text-error transition-colors focus:outline-none"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-canvas border border-hairline rounded-lg overflow-hidden shadow-sm">
            <div className="p-4 sm:p-6 border-b border-hairline flex items-center space-x-3">
              <UserPlus size={20} className="text-ink" />
              <h2 className="text-lg font-semibold text-ink tracking-tight">
                นำเข้ารายชื่อนักเรียนแบบกลุ่ม (Bulk Import)
              </h2>
            </div>

            <form onSubmit={handleImport} className="p-4 sm:p-6 space-y-6">
              {/* Success/Error Message Banners */}
              {message && (
                <div className="flex items-center space-x-2.5 p-4 rounded-md bg-success/15 border border-success/30 text-success text-sm font-semibold animate-in fade-in duration-200">
                  <CheckCircle size={16} />
                  <span>{message}</span>
                </div>
              )}

              {errorMsg && (
                <div className="flex items-center space-x-2.5 p-4 rounded-md bg-error/15 border border-error/30 text-error text-sm font-semibold animate-in fade-in duration-200">
                  <AlertTriangle size={16} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Target Selectors */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">เลือกกลุ่มเรียน / สาขาวิชา</label>
                <select
                  value={selectedMajorId}
                  onChange={(e) => {
                    const mId = e.target.value;
                    setSelectedMajorId(mId);
                    const found = majors.find(m => m.id.toString() === mId);
                    if (found) {
                      setLevel(found.level);
                      setClassYear(found.year);
                      setMajorName(found.major_name);
                      setMajorCode(found.major_code);
                      setRoom(found.room);
                    }
                  }}
                  className="w-full h-10 border border-hairline rounded-md px-3 bg-canvas text-ink text-sm focus:outline-none focus:border-primary cursor-pointer"
                >
                  {majors.map((m) => (
                    <option key={m.id} value={m.id}>
                      [{m.level}] ปี {m.year} {m.major_name} กลุ่ม {m.room} ({m.year}{m.major_code}{m.room})
                    </option>
                  ))}
                  {majors.length === 0 && (
                    <option value="">ไม่มีข้อมูลชั้นเรียน (กรุณาเพิ่มกลุ่มเรียนด้านบนก่อน)</option>
                  )}
                </select>
              </div>

              {/* Textareas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* IDs Textarea */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="block text-sm font-semibold text-ink">
                      1. รหัสนักศึกษา (11 หลัก)
                    </label>
                    <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                      isLineCountMismatch && idLinesCount > 0 ? 'bg-error/10 text-error' : 'bg-surface-soft text-muted'
                    }`}>
                      {idLinesCount} แถว
                    </span>
                  </div>
                  <textarea
                    rows={10}
                    value={inputIds}
                    onChange={(e) => setInputIds(e.target.value)}
                    className="w-full border border-hairline rounded-md p-3 font-mono text-xs bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary leading-relaxed"
                    placeholder={`69xxxxxxxx1\n69xxxxxxxx2\n69xxxxxxxx3`}
                  />
                </div>

                {/* Names Textarea */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="block text-sm font-semibold text-ink">
                      2. รายชื่อนักเรียน (ชื่อ-นามสกุล)
                    </label>
                    <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                      isLineCountMismatch && nameLinesCount > 0 ? 'bg-error/10 text-error' : 'bg-surface-soft text-muted'
                    }`}>
                      {nameLinesCount} แถว
                    </span>
                  </div>
                  <textarea
                    rows={10}
                    value={inputNames}
                    onChange={(e) => setInputNames(e.target.value)}
                    className="w-full border border-hairline rounded-md p-3 font-sans text-xs bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary leading-relaxed"
                    placeholder={`นายสมชาย ใจดี\nนางสาวสมหญิง รักดี\nด.ช.วิชัย ว่องไว`}
                  />
                </div>
              </div>

              {/* Warning Alert if line count differs */}
              {isLineCountMismatch && idLinesCount > 0 && nameLinesCount > 0 && (
                <div className="flex items-start space-x-3 p-4 rounded-md bg-warning/10 border border-warning/30 text-warning text-xs font-semibold animate-pulse">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-bold">ข้อมูลจำนวนรายการไม่ตรงกัน!</div>
                    <div className="mt-0.5 text-muted leading-relaxed">
                      จำนวนแถวของรหัสนักศึกษา ({idLinesCount}) และรายชื่อนักเรียน ({nameLinesCount}) จำเป็นต้องเท่ากันจึงจะกดนำเข้าเข้าระบบได้
                    </div>
                  </div>
                </div>
              )}

              {/* Preview Box */}
              {previewData.length > 0 && (
                <div className="space-y-2 border border-hairline rounded-md overflow-hidden bg-surface-soft/30 p-4">
                  <h4 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center space-x-1.5">
                    <Sparkles size={13} className="text-primary animate-bounce" />
                    <span>ตัวอย่างการแบ่งคอลัมน์ชื่อ ({previewData.length} รายการแรก)</span>
                  </h4>
                  <div className="max-h-40 overflow-y-auto border border-hairline rounded bg-canvas text-xs">
                    <table className="w-full border-collapse">
                      <thead className="bg-surface-soft sticky top-0 border-b border-hairline">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-bold text-muted">รหัสนักศึกษา</th>
                          <th className="px-3 py-1.5 text-left font-bold text-muted">คำนำหน้า</th>
                          <th className="px-3 py-1.5 text-left font-bold text-muted">ชื่อจริง</th>
                          <th className="px-3 py-1.5 text-left font-bold text-muted">นามสกุล</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {previewData.slice(0, 20).map((p, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-1.5 font-mono text-ink">{p.student_id}</td>
                            <td className="px-3 py-1.5 text-ink">{p.prefix || '-'}</td>
                            <td className="px-3 py-1.5 text-ink font-semibold">{p.first_name || 'ไม่มี'}</td>
                            <td className="px-3 py-1.5 text-muted">{p.last_name || 'ไม่มี'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {previewData.length > 20 && (
                    <p className="text-[10px] text-muted text-right">แสดงผลพรีวิวเฉพาะ 20 รายการแรกเท่านั้น</p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={importing || isLineCountMismatch || idLinesCount === 0}
                  className="inline-flex items-center space-x-2 bg-primary hover:bg-primary-active disabled:bg-surface-strong text-white px-5 py-2.5 rounded-md text-sm font-semibold transition-all shadow-sm active:scale-98"
                >
                  {importing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-canvas border-t-transparent rounded-full animate-spin"></div>
                      <span>กำลังนำเข้าข้อมูล...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={15} />
                      <span>นำรายชื่อนักเรียนเข้าระบบ</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

      {/* Student Roster List Card */}
      <div className="bg-canvas border border-hairline rounded-lg overflow-hidden shadow-sm">
          <div className="p-4 sm:p-6 border-b border-hairline flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Users size={20} className="text-ink" />
              <h2 className="text-lg font-semibold text-ink tracking-tight font-sans">
                รายชื่อนักเรียนที่ลงทะเบียนล่วงหน้า
              </h2>
            </div>
            {students.length > 0 && (
              <button 
                onClick={handleClearRoster}
                className="text-xs text-error hover:text-error-active font-semibold flex items-center space-x-1 border border-error/20 hover:border-error/40 px-2.5 py-1.5 rounded transition-all bg-error/5"
              >
                <Trash size={13} />
                <span>ล้างรายชื่อทั้งหมด</span>
              </button>
            )}
          </div>

          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Filters and Search */}
            <form onSubmit={triggerSearch} className="space-y-4">
              <div className="flex space-x-2">
                <div className="relative flex-grow">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหาด้วยรหัส หรือ ชื่อ-นามสกุล..."
                    className="w-full h-10 border border-hairline rounded-md pl-10 pr-4 text-sm bg-canvas text-ink focus:outline-none focus:border-primary"
                  />
                  <Search size={16} className="absolute left-3.5 top-3 text-muted" />
                </div>
                <button
                  type="submit"
                  className="h-10 bg-surface-soft hover:bg-surface-strong text-ink border border-hairline px-4 rounded-md text-sm font-semibold transition-colors"
                >
                  ค้นหา
                </button>
              </div>

              {/* Advanced Filter Dropdowns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <select
                  value={filterLevel}
                  onChange={(e) => setFilterLevel(e.target.value)}
                  className="h-9 border border-hairline rounded px-2.5 bg-canvas text-ink"
                >
                  <option value="">ระดับชั้นทั้งหมด</option>
                  {uniqueLevels.map(l => <option key={l} value={l}>{l}</option>)}
                </select>

                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="h-9 border border-hairline rounded px-2.5 bg-canvas text-ink"
                >
                  <option value="">ชั้นปีทั้งหมด</option>
                  {uniqueYears.map(y => <option key={y} value={y}>ปี {y}</option>)}
                </select>

                <select
                  value={filterMajor}
                  onChange={(e) => setFilterMajor(e.target.value)}
                  className="h-9 border border-hairline rounded px-2.5 bg-canvas text-ink uppercase"
                >
                  <option value="">สาขาทั้งหมด</option>
                  {uniqueMajors.map(m => <option key={m} value={m}>{m}</option>)}
                </select>

                <select
                  value={filterRoom}
                  onChange={(e) => setFilterRoom(e.target.value)}
                  className="h-9 border border-hairline rounded px-2.5 bg-canvas text-ink"
                >
                  <option value="">กลุ่มทั้งหมด</option>
                  {uniqueRooms.map(r => <option key={r} value={r}>กลุ่ม {r}</option>)}
                </select>
              </div>
            </form>
 
            {/* Student List Table */}
            <div className="border border-hairline rounded-lg overflow-hidden bg-canvas">
              <div className="overflow-x-auto max-h-[460px]">
                <table className="w-full border-collapse">
                  <thead className="bg-surface-soft border-b border-hairline text-xs sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-muted">รหัสนักศึกษา</th>
                      <th className="px-4 py-3 text-left font-bold text-muted">ชื่อ-นามสกุล</th>
                      <th className="px-4 py-3 text-left font-bold text-muted">กลุ่มเรียน / สาขาวิชา</th>
                      <th className="px-4 py-3 text-center font-bold text-muted w-24">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline text-sm">
                    {loadingList ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-muted">
                          <div className="flex items-center justify-center space-x-2">
                            <RefreshCw className="animate-spin text-primary" size={16} />
                            <span>กำลังโหลดข้อมูล...</span>
                          </div>
                        </td>
                      </tr>
                    ) : students.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-muted">
                          ไม่พบข้อมูลรายชื่อนักเรียนในระบบ
                        </td>
                      </tr>
                    ) : (
                      students.map((s) => (
                        <tr key={s.id} className="hover:bg-surface-soft/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-ink font-medium">{s.student_id}</td>
                          <td className="px-4 py-3 text-ink">
                            <span className="text-muted mr-0.5">{s.prefix}</span>
                            <span className="font-semibold">{s.first_name}</span> {s.last_name}
                          </td>
                          <td className="px-4 py-3 text-muted text-xs">
                            <span className="font-bold text-ink">{s.year}{s.major_code}{s.room}</span>
                            <div className="text-[10px] text-muted-soft mt-0.5">
                              {s.level} ปี {s.year} {s.major_name} กลุ่ม {s.room}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center space-x-1.5">
                              <button
                                onClick={() => handleEditClick(s)}
                                className="text-muted hover:text-primary p-1 hover:bg-surface-soft rounded-full transition-all inline-flex items-center justify-center cursor-pointer"
                                title="แก้ไขรายชื่อนักเรียน"
                              >
                                <Edit2 size={15} />
                              </button>
                              <button
                                onClick={() => handleDeleteStudent(s.id, s.student_id)}
                                className="text-error hover:text-error-active p-1 hover:bg-error/5 rounded-full transition-all inline-flex items-center justify-center cursor-pointer"
                                title="ลบรายชื่อนักเรียน"
                              >
                                <Trash2 size={15} />
                              </button>
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
        </div>

      </div>

      {/* Edit Student Modal Overlay */}
      {showEditModal && editingStudent && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form 
            onSubmit={handleEditSubmit}
            className="bg-canvas border border-hairline rounded-lg w-full max-w-md p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex justify-between items-center pb-2 border-b border-hairline">
              <h3 className="font-bold text-lg text-ink flex items-center space-x-2">
                <Users size={20} className="text-primary" />
                <span>แก้ไขข้อมูลนักเรียน</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setShowEditModal(false)}
                className="text-muted hover:text-ink transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {editModalError && (
              <div className="flex items-center space-x-2.5 p-3 rounded-md bg-error/15 border border-error/30 text-error text-xs font-semibold">
                <AlertTriangle size={15} />
                <span>{editModalError}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* Student ID */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">รหัสนักศึกษา (11 หลัก)</label>
                <input
                  required
                  type="text"
                  maxLength={11}
                  value={editStudentId}
                  onChange={(e) => setEditStudentId(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full h-10 border border-hairline rounded-md px-3 bg-canvas text-ink text-sm focus:outline-none focus:border-primary font-mono"
                  placeholder="เช่น 64012345678"
                />
              </div>

              {/* Prefix selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">คำนำหน้าชื่อ</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditPrefix('นาย')}
                    className={`h-10 flex items-center justify-center space-x-1.5 border rounded-md font-semibold text-sm transition-all cursor-pointer ${
                      editPrefix === 'นาย'
                        ? 'border-brand-accent bg-brand-accent/5 text-brand-accent ring-1 ring-brand-accent'
                        : 'border-hairline bg-canvas text-ink hover:bg-surface-soft'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <circle cx="10" cy="14" r="6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="15" y1="9" x2="21" y2="3" />
                    </svg>
                    <span>นาย</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPrefix('นางสาว')}
                    className={`h-10 flex items-center justify-center space-x-1.5 border rounded-md font-semibold text-sm transition-all cursor-pointer ${
                      editPrefix === 'นางสาว'
                        ? 'border-rose-500 bg-rose-500/5 text-rose-600 ring-1 ring-rose-500'
                        : 'border-hairline bg-canvas text-ink hover:bg-surface-soft'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <circle cx="12" cy="9" r="6" />
                      <line x1="12" y1="15" x2="12" y2="21" />
                      <line x1="9" y1="18" x2="15" y2="18" />
                    </svg>
                    <span>นางสาว</span>
                  </button>
                </div>
              </div>

              {/* First & Last Name */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-ink uppercase tracking-wider">ชื่อจริง</label>
                  <input
                    required
                    type="text"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    className="w-full h-10 border border-hairline rounded-md px-3 bg-canvas text-ink text-sm focus:outline-none focus:border-primary"
                    placeholder="ชื่อจริง"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-ink uppercase tracking-wider">นามสกุล</label>
                  <input
                    required
                    type="text"
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    className="w-full h-10 border border-hairline rounded-md px-3 bg-canvas text-ink text-sm focus:outline-none focus:border-primary"
                    placeholder="นามสกุล"
                  />
                </div>
              </div>

              {/* Year, Major, Room */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">กลุ่มเรียน / สาขาวิชา</label>
                <select
                  value={editMajorId}
                  onChange={(e) => {
                    const mId = e.target.value;
                    setEditMajorId(mId);
                    const found = majors.find(m => m.id.toString() === mId);
                    if (found) {
                      setEditLevel(found.level);
                      setEditClassYear(found.year);
                      setEditMajorName(found.major_name);
                      setEditMajorCode(found.major_code);
                      setEditRoom(found.room);
                    }
                  }}
                  className="w-full h-10 border border-hairline rounded-md px-3 bg-canvas text-ink text-sm focus:outline-none focus:border-primary cursor-pointer"
                >
                  {majors.map((m) => (
                    <option key={m.id} value={m.id}>
                      [{m.level}] ปี {m.year} {m.major_name} กลุ่ม {m.room} ({m.year}{m.major_code}{m.room})
                    </option>
                  ))}
                  {majors.length === 0 && (
                    <option value="">ไม่มีข้อมูลชั้นเรียน (กรุณาเพิ่มกลุ่มเรียนในระบบก่อน)</option>
                  )}
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-hairline">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-4 h-10 border border-hairline rounded-md text-sm font-semibold text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-4 h-10 bg-primary hover:bg-primary-active text-white rounded-md text-sm font-semibold transition-colors cursor-pointer"
              >
                บันทึกแก้ไข
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Custom Confirm Modal */}
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
                className="h-10 bg-error hover:bg-error-active text-white rounded-md text-sm font-semibold transition-colors cursor-pointer"
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Confirmation Modal */}
      {showImportConfirm && (
        <div className="fixed inset-0 bg-[#111111]/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-canvas border border-hairline rounded-lg w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="space-y-2 text-center">
              <h3 className="font-bold text-lg text-ink">ตรวจสอบและยืนยันการนำเข้าข้อมูล</h3>
              <p className="text-xs text-muted">กรุณาตรวจสอบรายละเอียดความถูกต้องของกลุ่มเรียนด้านล่างนี้</p>
              
              <div className="text-left text-xs text-body space-y-2.5 bg-surface-soft p-4 border border-hairline rounded-lg mt-3">
                <p>จำนวนรายชื่อนักศึกษาที่จะเพิ่ม: <strong className="text-primary text-sm">{idLinesCount}</strong> คน</p>
                <p><strong>ระดับการศึกษา:</strong> {level}</p>
                <p><strong>ชั้นปี:</strong> ปี {classYear}</p>
                <p><strong>กลุ่มเรียน/ห้อง:</strong> กลุ่ม {room} (รหัสกลุ่ม: {classYear}{majorCode}{room})</p>
                <p><strong>สาขาวิชา/สาขางาน:</strong> {majorName}</p>
              </div>
              
              <p className="text-[11px] text-error font-medium pt-2 text-center">
                * กรุณาตรวจสอบให้แน่ใจว่ารหัสกลุ่มเรียนและจำนวนข้อมูลนักเรียนตรงกับกลุ่มจริงในชั้นเรียน
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setShowImportConfirm(false)}
                className="h-10 border border-hairline rounded-md text-sm font-semibold text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  setShowImportConfirm(false);
                  executeImport();
                }}
                className="h-10 bg-primary hover:bg-primary-active text-white rounded-md text-sm font-semibold transition-colors cursor-pointer"
              >
                ยืนยันการนำเข้า
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Academic Year Modal */}
      {showAddYearModal && (
        <div className="fixed inset-0 bg-[#111111]/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-canvas border border-hairline rounded-lg w-full max-w-sm p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="space-y-1 text-center">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary mx-auto mb-2">
                <Plus size={18} />
              </div>
              <h3 className="font-bold text-lg text-ink">เพิ่มปีการศึกษาใหม่</h3>
              <p className="text-xs text-muted">กำหนดปีการศึกษาและเทอมใหม่เพื่อเพิ่มในระบบ</p>
            </div>

            {addYearError && (
              <div className="p-3 bg-error/15 border border-error/30 text-error text-xs font-semibold rounded-md text-center">
                {addYearError}
              </div>
            )}

            <form onSubmit={handleAddYear} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">ปีการศึกษา (ตัวเลข 4 หลัก)</label>
                <input
                  required
                  type="text"
                  maxLength={4}
                  placeholder="เช่น 2570"
                  value={newYear}
                  onChange={e => setNewYear(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-11 border border-hairline rounded-md px-3 bg-canvas text-ink text-sm font-bold placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">เทอมการศึกษา</label>
                <select
                  value={newTerm}
                  onChange={e => setNewTerm(e.target.value)}
                  className="w-full h-11 border border-hairline rounded-md px-3 bg-canvas text-ink text-sm font-bold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer"
                >
                  <option value="1">เทอม 1</option>
                  <option value="2">เทอม 2</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddYearModal(false); setAddYearError(''); }}
                  className="h-10 border border-hairline rounded-md text-sm font-semibold text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={addYearLoading}
                  className="h-10 bg-primary hover:bg-primary-active disabled:bg-surface-strong text-white rounded-md text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  {addYearLoading ? (
                    <div className="w-4 h-4 border-2 border-canvas border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span>เพิ่มปีการศึกษา</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Academic Year Modal */}
      {showEditYearModal && editingYear && (
        <div className="fixed inset-0 bg-[#111111]/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-canvas border border-hairline rounded-lg w-full max-w-sm p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="space-y-1 text-center">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary mx-auto mb-2">
                <Edit2 size={18} />
              </div>
              <h3 className="font-bold text-lg text-ink">แก้ไขปีการศึกษา</h3>
              <p className="text-xs text-muted">แก้ไขข้อมูลปีการศึกษา {editingYear.year} เทอม {editingYear.term}</p>
            </div>

            {editYearError && (
              <div className="p-3 bg-error/15 border border-error/30 text-error text-xs font-semibold rounded-md text-center">
                {editYearError}
              </div>
            )}

            <form onSubmit={handleEditYearSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">ปีการศึกษา (ตัวเลข 4 หลัก)</label>
                <input
                  required
                  type="text"
                  maxLength={4}
                  placeholder="เช่น 2570"
                  value={editYear}
                  onChange={e => setEditYear(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-11 border border-hairline rounded-md px-3 bg-canvas text-ink text-sm font-bold placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">เทอมการศึกษา</label>
                <select
                  value={editTerm}
                  onChange={e => setEditTerm(e.target.value)}
                  className="w-full h-11 border border-hairline rounded-md px-3 bg-canvas text-ink text-sm font-bold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer"
                >
                  <option value="1">เทอม 1</option>
                  <option value="2">เทอม 2</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowEditYearModal(false); setEditingYear(null); setEditYearError(''); }}
                  className="h-10 border border-hairline rounded-md text-sm font-semibold text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={editYearLoading}
                  className="h-10 bg-primary hover:bg-primary-active disabled:bg-surface-strong text-white rounded-md text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  {editYearLoading ? (
                    <div className="w-4 h-4 border-2 border-canvas border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span>บันทึกการแก้ไข</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
