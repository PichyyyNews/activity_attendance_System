import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Link, Outlet } from 'react-router-dom';
import axios from 'axios';
import { Settings, LayoutDashboard, Calendar, Menu, X, ArrowRight, FileSpreadsheet, ClipboardCheck, Users, Plus } from 'lucide-react';
import AdminDashboard from './pages/admin/Dashboard';
import AdminSettings from './pages/admin/Settings';
import AdminSessions from './pages/admin/Sessions';
import AdminAttendanceList from './pages/admin/AttendanceList';
import AdminStudents from './pages/admin/Students';
import UserScanForm from './pages/UserScanForm';
import UserDashboard from './pages/UserDashboard';

function Footer() {
  return (
    <footer className="bg-surface-dark text-on-dark-soft border-t border-surface-dark-elevated">
      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row justify-between items-center text-xs text-[#898989] space-y-3 sm:space-y-0">
        <div className="flex items-center space-x-2 text-white font-extrabold text-sm tracking-tight">
          <span>AAS</span>
        </div>
        <p className="text-[#a1a1aa]">© {new Date().getFullYear()} ระบบเช็กชื่อและบันทึกประวัติการเข้าเรียน</p>
        <div className="flex items-center space-x-6">
          <span className="flex items-center space-x-1.5 text-xs text-[#a1a1aa]">
            <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
            <span>SQLite & Google Sheets API Active</span>
          </span>
          <span className="text-[#6b7280]">v1.0.0</span>
        </div>
      </div>
    </footer>
  );
}

function AdminLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [sheetId, setSheetId] = useState('');
  const [activeYear, setActiveYear] = useState('2569');
  const [activeTerm, setActiveTerm] = useState('1');
  const [settings, setSettings] = useState<any>(null);

  // Custom academic years and terms states
  const [academicYears, setAcademicYears] = useState<string[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [showYearModal, setShowYearModal] = useState(false);
  const [newCustomYear, setNewCustomYear] = useState('');
  const [newCustomTerm, setNewCustomTerm] = useState('1');
  const [yearModalError, setYearModalError] = useState('');

  const [pin, setPin] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(
    sessionStorage.getItem('admin_authenticated') === 'true'
  );
  const [pinError, setPinError] = useState('');

  // Fetch settings, academic years and terms
  useEffect(() => {
    if (!isAuthenticated) return;
    
    Promise.all([
      axios.get('/api/settings'),
      axios.get('/api/academic-years/list'),
      axios.get('/api/terms')
    ])
      .then(([settingsRes, yearsRes, termsRes]) => {
        const data = settingsRes.data;
        if (data) {
          setSettings(data);
          setSheetId(data.sheet_id || '');
          setActiveYear(data.academic_year || '2569');
          setActiveTerm(data.term || '1');
        }
        setAcademicYears(yearsRes.data || []);
        setTerms(termsRes.data || []);
      })
      .catch(err => console.error('Error fetching settings and lookup lists:', err));
  }, [isAuthenticated]);

  const handleSemesterChange = async (year: string, term: string) => {
    try {
      await axios.post('/api/settings', {
        sheet_id: settings?.sheet_id || '',
        credentials_json: settings?.credentials_json || '',
        academic_year: year,
        term: term
      });
      setActiveYear(year);
      setActiveTerm(term);
      window.location.reload();
    } catch (err) {
      console.error('Failed to change semester:', err);
    }
  };

  const handleAddYearSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setYearModalError('');

    const yearVal = newCustomYear.trim();
    if (!/^\d{4}$/.test(yearVal)) {
      setYearModalError('ปีการศึกษาต้องเป็นตัวเลข 4 หลัก (เช่น 2570)');
      return;
    }

    try {
      await axios.post('/api/settings', {
        sheet_id: settings?.sheet_id || '',
        credentials_json: settings?.credentials_json || '',
        academic_year: yearVal,
        term: newCustomTerm
      });
      setActiveYear(yearVal);
      setActiveTerm(newCustomTerm);
      setShowYearModal(false);
      setNewCustomYear('');
      window.location.reload();
    } catch (err: any) {
      setYearModalError('เกิดข้อผิดพลาดในการบันทึกปีการศึกษาใหม่');
    }
  };

  const sheetUrl = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : null;

  if (!isAuthenticated) {
    const handlePinSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (pin === '250669') {
        sessionStorage.setItem('admin_authenticated', 'true');
        setIsAuthenticated(true);
        setPinError('');
      } else {
        setPinError('รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
        setPin('');
      }
    };

    return (
      <div className="min-h-screen bg-canvas flex flex-col justify-between py-12 px-6">
        {/* Top Brand Logo */}
        <div className="flex justify-center">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center">
              <div className="w-2.5 h-2.5 bg-canvas rounded-full"></div>
            </div>
            <span className="font-extrabold text-base text-ink tracking-tight">attendance.io</span>
          </div>
        </div>

        {/* PIN Form card */}
        <div className="max-w-md w-full mx-auto my-auto bg-canvas border border-hairline rounded-lg p-8 shadow-[0_8px_32px_rgba(0,0,0,0.04)] space-y-6 animate-in zoom-in-95 duration-200">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-surface-soft border border-hairline text-ink rounded-full flex items-center justify-center mx-auto">
              <Settings size={20} />
            </div>
            <h1 className="text-xl font-bold text-ink tracking-tight">สำหรับผู้ดูแลระบบ</h1>
            <p className="text-muted text-xs">กรุณากรอกรหัส PIN เพื่อเข้าสู่ระบบการบริหารจัดการหลังบ้าน</p>
          </div>

          {pinError && (
            <div className="p-3.5 bg-error/15 border border-error/30 text-error text-xs font-semibold rounded-md text-center">
              {pinError}
            </div>
          )}

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ink uppercase tracking-wider">รหัสผ่าน PIN 6 หลัก</label>
              <input 
                type="password"
                required
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full h-11 border border-hairline rounded-md text-center text-lg font-bold tracking-widest bg-canvas text-ink focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="••••••"
              />
            </div>

            <button 
              type="submit"
              className="w-full h-11 bg-primary hover:bg-primary-active text-white text-sm font-semibold rounded-md flex items-center justify-center space-x-2 transition-all active:scale-98 cursor-pointer"
            >
              <span>ยืนยันรหัส PIN</span>
            </button>
          </form>
          
          <div className="text-center">
            <Link 
              to="/"
              className="text-xs text-muted hover:text-ink transition-colors underline"
            >
              ย้อนกลับหน้าแรก (นักศึกษา)
            </Link>
          </div>
        </div>

        {/* Footer Branding */}
        <div className="text-center text-[11px] text-muted-soft mt-8">
          © {new Date().getFullYear()} attendance.io • ระบบบริหารจัดการหลังบ้านที่ปลอดภัย
        </div>
      </div>
    );
  }

  const navItems = [
    { to: '/admin', label: 'ภาพรวม', icon: LayoutDashboard, end: true },
    { to: '/admin/sessions', label: 'คาบกิจกรรม', icon: Calendar },
    { to: '/admin/students', label: 'รายชื่อนักเรียน', icon: Users },
    { to: '/admin/attendance', label: 'ตารางเช็กชื่อ', icon: ClipboardCheck },
    { to: '/admin/settings', label: 'ตั้งค่าระบบ', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-canvas/80 backdrop-blur-md border-b border-hairline w-full h-16 flex items-center justify-between px-6 shrink-0">
        {/* Left branding */}
        <div className="flex items-center space-x-3">
          <Link to="/admin" className="flex items-center space-x-2.5">
            <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
              <div className="w-2.5 h-2.5 bg-canvas rounded-full"></div>
            </div>
            <span className="font-extrabold text-lg text-ink tracking-tight">attendance.io</span>
          </Link>
          <span className="bg-surface-soft border border-hairline px-2 py-0.5 rounded text-[10px] font-bold text-muted tracking-wide uppercase">
            Admin
          </span>
        </div>

        {/* Right Action buttons */}
        <div className="flex items-center space-x-3">
          {sheetUrl && (
            <a 
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex px-3.5 py-1.5 border border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100 rounded-md text-xs font-semibold transition-colors items-center space-x-1.5"
            >
              <FileSpreadsheet size={14} />
              <span>เปิด Google Sheet</span>
            </a>
          )}
          <Link 
            to="/" 
            className="hidden md:flex px-3.5 py-1.5 border border-hairline text-ink rounded-md text-xs font-semibold hover:bg-surface-soft transition-colors items-center space-x-1.5"
          >
            <span>ตรวจสอบรายชื่อ</span>
            <ArrowRight size={13} />
          </Link>

          {/* Hamburger Menu on Mobile */}
          <button
            onClick={() => setIsMenuOpen(true)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-full border border-hairline hover:bg-surface-soft text-ink transition-colors"
            aria-label="Open Menu"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      {/* Main Container below navbar */}
      <div className="flex-grow flex flex-col md:flex-row min-h-0">
        {/* Desktop Left Sidebar */}
        <aside className="hidden md:flex flex-col w-64 bg-canvas border-r border-hairline sticky top-16 h-[calc(100vh-64px)] shrink-0 overflow-y-auto p-4 justify-between animate-in fade-in duration-300">
          <div className="space-y-6">
            {/* Global Academic Year & Term Selector (25% Larger & First item) */}
            <div className="bg-surface-soft border border-hairline p-4 rounded-lg space-y-3 shadow-xs">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider">ปีการศึกษา / เทอม ปัจจุบัน</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col bg-canvas border border-hairline p-2 rounded-md">
                  <span className="text-[9px] font-bold text-muted-soft uppercase">ปีการศึกษา</span>
                  <select 
                    value={activeYear} 
                    onChange={e => handleSemesterChange(e.target.value, activeTerm)}
                    className="bg-transparent border-none focus:ring-0 focus:outline-none text-ink font-extrabold text-sm cursor-pointer w-full p-0 mt-0.5"
                  >
                    {Array.from(new Set([activeYear, ...academicYears])).sort((a, b) => b.localeCompare(a)).map(yr => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col bg-canvas border border-hairline p-2 rounded-md">
                  <span className="text-[9px] font-bold text-muted-soft uppercase">เทอม</span>
                  <select 
                    value={activeTerm} 
                    onChange={e => handleSemesterChange(activeYear, e.target.value)}
                    className="bg-transparent border-none focus:ring-0 focus:outline-none text-ink font-extrabold text-sm cursor-pointer w-full p-0 mt-0.5"
                  >
                    {Array.from(new Set([activeTerm, ...terms])).sort((a, b) => a.localeCompare(b)).map(tm => (
                      <option key={tm} value={tm}>{tm}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={() => setShowYearModal(true)}
                className="w-full py-2 bg-canvas hover:bg-surface-strong border border-hairline text-ink text-xs font-bold rounded-md flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
              >
                <Plus size={13} />
                <span>เพิ่มปีการศึกษา/เทอมเอง</span>
              </button>
            </div>

            <div className="space-y-3">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider px-3">เมนูการใช้งาน</div>
              <nav className="flex flex-col space-y-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center space-x-3 px-3 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                        isActive
                          ? 'bg-primary text-white shadow-md'
                          : 'text-muted hover:text-ink hover:bg-surface-soft'
                      }`
                    }
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-hairline px-3">
            <div className="text-[10px] text-muted-soft">
              ระบบเช็กชื่อกิจกรรมวิทยาลัย • v1.0.0
            </div>
          </div>
        </aside>

        {/* Mobile slide-over drawer menu */}
        {isMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div 
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-surface-dark/25 backdrop-blur-sm transition-opacity"
            />
            <div className="relative flex flex-col w-64 max-w-xs bg-canvas h-full p-6 justify-between shadow-2xl animate-in slide-in-from-left duration-200 border-r border-hairline">
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                      <div className="w-2.5 h-2.5 bg-canvas rounded-full"></div>
                    </div>
                    <span className="font-extrabold text-base text-ink tracking-tight">attendance.io</span>
                  </div>
                  <button
                    onClick={() => setIsMenuOpen(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-full border border-hairline hover:bg-surface-soft text-muted hover:text-ink transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                <nav className="flex flex-col space-y-1">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setIsMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center space-x-3 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                          isActive
                            ? 'bg-primary text-white shadow-md'
                            : 'text-muted hover:text-ink hover:bg-surface-soft'
                        }`
                      }
                    >
                      <item.icon size={18} />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </nav>
              </div>

              <div className="space-y-6 pt-6 border-t border-hairline">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-muted uppercase tracking-wider">ปีการศึกษา / เทอมที่แสดง</label>
                  <div className="grid grid-cols-2 gap-2 bg-surface-soft p-1.5 rounded-lg border border-hairline">
                    <div className="flex flex-col px-1.5 py-0.5">
                      <span className="text-[9px] text-muted-soft">ปีการศึกษา</span>
                      <select 
                        value={activeYear} 
                        onChange={e => {
                          handleSemesterChange(e.target.value, activeTerm);
                          setIsMenuOpen(false);
                        }}
                        className="bg-transparent border-none focus:ring-0 focus:outline-none text-ink font-bold text-xs cursor-pointer w-full p-0"
                      >
                        {Array.from(new Set([activeYear, ...academicYears])).sort((a, b) => b.localeCompare(a)).map(yr => (
                          <option key={yr} value={yr}>{yr}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col px-1.5 py-0.5 border-l border-hairline">
                      <span className="text-[9px] text-muted-soft">เทอม</span>
                      <select 
                        value={activeTerm} 
                        onChange={e => {
                          handleSemesterChange(activeYear, e.target.value);
                          setIsMenuOpen(false);
                        }}
                        className="bg-transparent border-none focus:ring-0 focus:outline-none text-ink font-bold text-xs cursor-pointer w-full p-0"
                      >
                        {Array.from(new Set([activeTerm, ...terms])).sort((a, b) => a.localeCompare(b)).map(tm => (
                          <option key={tm} value={tm}>{tm}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {sheetUrl && (
                    <a 
                      href={sheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsMenuOpen(false)}
                      className="w-full py-2 px-3 border border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100 rounded-md text-xs font-semibold transition-colors flex items-center justify-center space-x-2"
                    >
                      <FileSpreadsheet size={14} />
                      <span>เปิด Google Sheet</span>
                    </a>
                  )}
                  <Link 
                    to="/" 
                    onClick={() => setIsMenuOpen(false)}
                    className="w-full py-2 px-3 border border-hairline text-ink rounded-md text-xs font-semibold hover:bg-surface-soft transition-colors flex items-center justify-center space-x-2"
                  >
                    <span>ตรวจสอบรายชื่อ</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content Panel */}
        <div className="flex-grow flex flex-col min-w-0">
          <main className="flex-grow px-4 sm:px-6 py-6 md:py-8 max-w-7xl w-full mx-auto">
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <Outlet />
            </div>
          </main>
          
          <Footer />
        </div>
      </div>

      {/* Custom Add Academic Year Modal */}
      {showYearModal && (
        <div className="fixed inset-0 bg-[#111111]/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-canvas border border-hairline rounded-lg w-full max-w-sm p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="space-y-1 text-center">
              <h3 className="font-bold text-lg text-ink">เพิ่มปีการศึกษาใหม่</h3>
              <p className="text-xs text-muted">กำหนดปีการศึกษาและเทอมที่ต้องการเปิดใช้งานระบบ</p>
            </div>

            {yearModalError && (
              <div className="p-3 bg-error/15 border border-error/30 text-error text-xs font-semibold rounded-md text-center">
                {yearModalError}
              </div>
            )}

            <form onSubmit={handleAddYearSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">ปีการศึกษา (ตัวเลข 4 หลัก)</label>
                <input
                  required
                  type="text"
                  maxLength={4}
                  placeholder="เช่น 2570"
                  value={newCustomYear}
                  onChange={e => setNewCustomYear(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-11 border border-hairline rounded-md px-3 bg-canvas text-ink text-sm font-bold placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">เทอมการศึกษา</label>
                <select
                  value={newCustomTerm}
                  onChange={e => setNewCustomTerm(e.target.value)}
                  className="w-full h-11 border border-hairline rounded-md px-3 bg-canvas text-ink text-sm font-bold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer"
                >
                  <option value="1">เทอม 1</option>
                  <option value="2">เทอม 2</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowYearModal(false);
                    setNewCustomYear('');
                    setYearModalError('');
                  }}
                  className="h-10 border border-hairline rounded-md text-sm font-semibold text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="h-10 bg-primary hover:bg-primary-active text-white rounded-md text-sm font-semibold transition-colors cursor-pointer"
                >
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<UserDashboard />} />
        <Route path="/scan/:token" element={<UserScanForm />} />

        {/* Admin Routes */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="sessions" element={<AdminSessions />} />
          <Route path="students" element={<AdminStudents />} />
          <Route path="attendance" element={<AdminAttendanceList />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
