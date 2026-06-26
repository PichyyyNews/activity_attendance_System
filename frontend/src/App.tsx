import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Link, Outlet } from 'react-router-dom';
import axios from 'axios';
import { Settings, LayoutDashboard, Calendar, Menu, X, ArrowRight, FileSpreadsheet, ClipboardCheck, Users } from 'lucide-react';
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
          <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
            <div className="w-2 h-2 bg-surface-dark rounded-full"></div>
          </div>
          <span>attendance.io</span>
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
  const [pin, setPin] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(
    sessionStorage.getItem('admin_authenticated') === 'true'
  );
  const [pinError, setPinError] = useState('');

  // Fetch sheet_id for the shortcut button
  useEffect(() => {
    if (!isAuthenticated) return;
    axios.get('/api/settings')
      .then(res => {
        if (res.data && res.data.sheet_id) {
          setSheetId(res.data.sheet_id);
        }
      })
      .catch(err => console.error('Error fetching settings for shortcut:', err));
  }, [isAuthenticated]);

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
    { to: '/admin/sessions', label: 'คาบเรียน', icon: Calendar },
    { to: '/admin/students', label: 'รายชื่อนักเรียน', icon: Users },
    { to: '/admin/attendance', label: 'ตารางเช็กชื่อ', icon: ClipboardCheck },
    { to: '/admin/settings', label: 'ตั้งค่าระบบ', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      {/* Top Nav */}
      <header className="sticky top-0 z-40 bg-canvas/80 backdrop-blur-md border-b border-hairline w-full">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <Link to="/admin" className="flex items-center space-x-2.5">
              <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                <div className="w-2.5 h-2.5 bg-canvas rounded-full"></div>
              </div>
              <span className="font-extrabold text-lg text-ink tracking-tight">attendance.io</span>
            </Link>
            <span className="bg-surface-soft border border-hairline px-2 py-0.5 rounded text-[11px] font-semibold text-muted tracking-wide uppercase">
              Admin
            </span>
          </div>

          {/* Desktop Navigation (nav-pill-group style) */}
          <nav className="hidden md:flex items-center bg-surface-soft p-1 rounded-full border border-hairline">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-4 py-1.5 text-sm font-semibold rounded-full transition-all duration-200 ${
                    isActive
                      ? 'bg-canvas text-ink shadow-[0_2px_4px_rgba(0,0,0,0.06)]'
                      : 'text-muted hover:text-ink'
                  }`
                }
              >
                <div className="flex items-center space-x-1.5">
                  <item.icon size={15} />
                  <span>{item.label}</span>
                </div>
              </NavLink>
            ))}
          </nav>

          {/* Right Action Button Cluster */}
          <div className="hidden md:flex items-center space-x-3">
            {sheetUrl && (
              <a 
                href={sheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 border border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100 rounded-md text-sm font-semibold transition-colors flex items-center space-x-1.5"
              >
                <FileSpreadsheet size={15} />
                <span>เปิด Google Sheet</span>
              </a>
            )}
            <Link 
              to="/" 
              className="px-4 py-2 border border-hairline text-ink rounded-md text-sm font-semibold hover:bg-surface-soft transition-colors flex items-center space-x-1.5"
            >
              <span>ตรวจสอบรายชื่อ</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="w-9 h-9 flex items-center justify-center rounded-full border border-hairline hover:bg-surface-soft text-ink transition-colors"
              aria-label="Toggle Menu"
            >
              {isMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer (Full-screen sheet style) */}
      {isMenuOpen && (
        <div className="fixed inset-0 top-16 z-30 bg-canvas/95 backdrop-blur-md md:hidden animate-in fade-in slide-in-from-top-5 duration-200 border-b border-hairline">
          <nav className="flex flex-col p-6 space-y-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setIsMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center space-x-3 p-3.5 rounded-lg text-base font-semibold border transition-all ${
                    isActive
                      ? 'bg-primary text-white border-primary'
                      : 'bg-surface-soft text-ink border-hairline hover:bg-surface-strong'
                  }`
                }
              >
                <item.icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            ))}
            
            <div className="border-t border-hairline pt-4 mt-2 space-y-3">
              {sheetUrl && (
                <a
                  href={sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center justify-between p-3.5 rounded-lg text-base font-semibold border border-emerald-200 bg-emerald-50/30 text-emerald-700 hover:bg-emerald-50 transition-all"
                >
                  <span className="flex items-center space-x-3">
                    <FileSpreadsheet size={20} />
                    <span>เปิด Google Sheet</span>
                  </span>
                  <ArrowRight size={18} />
                </a>
              )}
              <Link
                to="/"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center justify-between p-3.5 rounded-lg text-base font-semibold border border-hairline bg-canvas text-ink hover:bg-surface-soft transition-all"
              >
                <span>หน้าตรวจสอบการเช็กชื่อ</span>
                <ArrowRight size={18} />
              </Link>
            </div>
          </nav>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-2.5 sm:px-6 py-6 md:py-16">
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<UserDashboard />} />
        <Route path="/scan/:sessionId" element={<UserScanForm />} />

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
