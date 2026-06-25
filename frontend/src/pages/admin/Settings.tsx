import { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, FileText, Database, ShieldAlert, Check, X, GraduationCap } from 'lucide-react';

export default function AdminSettings() {
  const [sheetId, setSheetId] = useState('');
  const [credentials, setCredentials] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Majors state
  const [majors, setMajors] = useState<{ id: number; class_year: string; major_code: string; room: string }[]>([]);
  const [classYear, setClassYear] = useState('1');
  const [majorCode, setMajorCode] = useState('');
  const [room, setRoom] = useState('1');
  const [majorError, setMajorError] = useState('');
  const [majorSuccess, setMajorSuccess] = useState('');

  useEffect(() => {
    // Fetch Sheets Config
    axios.get('/api/settings').then(res => {
      if (res.data) {
        setSheetId(res.data.sheet_id || '');
        setCredentials(res.data.credentials_json || '');
      }
    });

    // Fetch Majors
    fetchMajors();
  }, []);

  const fetchMajors = () => {
    axios.get('/api/majors')
      .then(res => setMajors(res.data || []))
      .catch(err => console.error('Error fetching majors:', err));
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      await axios.post('/api/settings', { sheet_id: sheetId, credentials_json: credentials });
      setMessage('บันทึกการตั้งค่าระบบเสร็จสิ้นสมบูรณ์!');
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      setErrorMsg('บันทึกการตั้งค่าล้มเหลว กรุณาตรวจสอบรูปแบบไฟล์ JSON ของคุณ');
    }
    setLoading(false);
    setTimeout(() => {
      setMessage('');
      setErrorMsg('');
    }, 4000);
  };

  const handleAddMajor = async (e: React.FormEvent) => {
    e.preventDefault();
    setMajorError('');
    setMajorSuccess('');
    if (!classYear || !majorCode.trim() || !room) {
      setMajorError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    try {
      await axios.post('/api/majors', {
        class_year: classYear,
        major_code: majorCode.trim().toUpperCase(),
        room: room
      });
      setMajorSuccess('บันทึกข้อมูลสาขาวิชา/ห้องเรียนใหม่เรียบร้อยแล้ว!');
      setMajorCode('');
      fetchMajors();
      setTimeout(() => setMajorSuccess(''), 3000);
    } catch (err: any) {
      setMajorError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
      setTimeout(() => setMajorError(''), 3000);
    }
  };

  const handleDeleteMajor = async (id: number) => {
    if (!confirm('คุณแน่ใจหรือไม่ที่จะลบสาขานี้ออกจากระบบ?')) return;
    try {
      await axios.delete(`/api/majors/${id}`);
      fetchMajors();
    } catch (err) {
      console.error('Error deleting major:', err);
    }
  };

  return (
    <div className="w-full space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl md:text-4xl font-semibold text-ink tracking-tight">
          ตั้งค่าระบบ
        </h1>
        <p className="text-muted text-sm md:text-base mt-2">
          ตั้งค่าบัญชีบริการเชื่อมต่อ Google Sheets API และรหัสสเปรดชีตสำหรับการซิงค์ข้อมูลการลงชื่อเข้าร่วมกิจกรรมลงกูเกิลชีตอัตโนมัติ
        </p>
      </div>

      {/* Grid Container for 2 Columns on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Main Settings Card */}
        <div className="bg-canvas border border-hairline rounded-lg overflow-hidden">
        <div className="p-6 border-b border-hairline flex items-center space-x-3">
          <Database size={20} className="text-ink" />
          <h2 className="text-lg font-semibold text-ink tracking-tight">
            การตั้งค่าบัญชีเชื่อมต่อ Google Sheets API
          </h2>
        </div>

        <div className="p-6 md:p-8 space-y-8">
          {/* Status Message Banners */}
          {message && (
            <div className="flex items-center space-x-2.5 p-4 rounded-md bg-success/15 border border-success/30 text-success text-sm font-semibold animate-in fade-in duration-200">
              <Check size={16} />
              <span>{message}</span>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center space-x-2.5 p-4 rounded-md bg-error/15 border border-error/30 text-error text-sm font-semibold animate-in fade-in duration-200">
              <ShieldAlert size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-6">
            {/* Spreadsheet ID */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-ink">
                รหัสสเปรดชีต (Spreadsheet ID)
              </label>
              <input 
                type="text" 
                value={sheetId}
                onChange={e => setSheetId(e.target.value)}
                className="w-full h-10 border border-hairline rounded-md px-3.5 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="ตัวอย่าง 1BxiMvs0Xryg..."
              />
              <p className="text-xs text-muted-soft">
                สามารถคัดลอกมาจาก URL ของไฟล์ Google Sheets ของคุณ: https://docs.google.com/spreadsheets/d/<span className="font-bold underline">SPREADSHEET_ID</span>/edit
              </p>
            </div>

            {/* Service Account JSON */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-semibold text-ink">
                  รหัสบัญชีผู้ใช้บริการ (Service Account Credentials JSON)
                </label>
                <span className="text-[11px] bg-surface-soft border border-hairline text-muted font-mono px-2 py-0.5 rounded">
                  รูปแบบ JSON
                </span>
              </div>
              <textarea 
                rows={8}
                value={credentials}
                onChange={e => setCredentials(e.target.value)}
                className="w-full border border-hairline rounded-md p-3.5 font-mono text-xs bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all leading-relaxed"
                placeholder='{ "type": "service_account", ... }'
              />
              <p className="text-xs text-muted-soft">
                นำข้อมูลไฟล์คีย์ JSON ทั้งหมดที่ดาวน์โหลดมาจาก Google Cloud Console (Service Account) มาวางในช่องด้านบนนี้
              </p>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="bg-surface-soft border-t border-hairline px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs text-muted">
            <FileText size={14} />
            <span>การปรับเปลี่ยนค่าจำเป็นต้องใช้สิทธิ์เขียนไฟล์บนฐานข้อมูล SQLite</span>
          </div>
          <button 
            onClick={handleSave}
            disabled={loading}
            className="inline-flex items-center space-x-2 bg-primary hover:bg-primary-active disabled:bg-surface-strong text-white px-5 py-2.5 rounded-md text-sm font-semibold transition-all shadow-sm active:scale-98"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-canvas border-t-transparent rounded-full animate-spin"></div>
                <span>กำลังบันทึก...</span>
              </>
            ) : (
              <>
                <Save size={15} />
                <span>บันทึกข้อมูลตั้งค่า</span>
              </>
            )}
          </button>
        </div>
      </div>

        {/* Majors Management Card */}
        <div className="bg-canvas border border-hairline rounded-lg overflow-hidden">
        <div className="p-6 border-b border-hairline flex items-center space-x-3">
          <GraduationCap size={20} className="text-ink" />
          <h2 className="text-lg font-semibold text-ink tracking-tight">
            จัดการสาขาวิชา (Dropdown สำหรับเช็กชื่อ)
          </h2>
        </div>

        <div className="p-6 md:p-8 space-y-6">
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
          <form onSubmit={handleAddMajor} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-muted uppercase">ชั้นปี</label>
              <select
                required
                value={classYear}
                onChange={e => setClassYear(e.target.value)}
                className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="1">ปี 1</option>
                <option value="2">ปี 2</option>
                <option value="3">ปี 3</option>
              </select>
            </div>
            
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-[11px] font-bold text-muted uppercase">รหัสย่อสาขา</label>
              <input 
                type="text" 
                required
                value={majorCode}
                onChange={e => setMajorCode(e.target.value)}
                className="w-full h-10 border border-hairline rounded-md px-3.5 text-sm bg-canvas text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="เช่น ชทค, คพ, ทส"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-muted uppercase">ห้อง</label>
              <select
                required
                value={room}
                onChange={e => setRoom(e.target.value)}
                className="w-full h-10 border border-hairline rounded-md px-3 text-sm bg-canvas text-ink focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="1">ห้อง 1</option>
                <option value="2">ห้อง 2</option>
                <option value="3">ห้อง 3</option>
                <option value="4">ห้อง 4</option>
                <option value="5">ห้อง 5</option>
              </select>
            </div>

            <button 
              type="submit"
              className="h-10 bg-primary hover:bg-primary-active text-white px-4 rounded-md text-sm font-semibold flex items-center justify-center space-x-1.5 transition-all active:scale-98 cursor-pointer w-full"
            >
              <Save size={15} />
              <span>บันทึกข้อมูล</span>
            </button>
          </form>

          {/* Majors Tags Grid */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">สาขาวิชาที่มีในระบบ</h3>
            {majors.length === 0 ? (
              <p className="text-xs text-muted-soft py-4">ไม่มีข้อมูลสาขาวิชา กรุณาเพิ่มสาขาวิชาใหม่ด้านบน</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {majors.map((major) => (
                  <span 
                    key={major.id} 
                    className="inline-flex items-center space-x-1.5 bg-surface-soft border border-hairline text-ink text-xs font-semibold px-3 py-1.5 rounded-full"
                  >
                    <span>{major.class_year}{major.major_code}{major.room}</span>
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
      </div>
    </div>
  );
}
