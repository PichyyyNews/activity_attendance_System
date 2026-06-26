import { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, FileText, Database, ShieldAlert, Check } from 'lucide-react';

export default function AdminSettings() {
  const [sheetId, setSheetId] = useState('');
  const [credentials, setCredentials] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Fetch Sheets Config
    axios.get('/api/settings').then(res => {
      if (res.data) {
        setSheetId(res.data.sheet_id || '');
        setCredentials(res.data.credentials_json || '');
      }
    });
  }, []);

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

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl md:text-4xl font-semibold text-ink tracking-tight">
          ตั้งค่าระบบ
        </h1>
        <p className="text-muted text-sm md:text-base mt-2">
          ตั้งค่าบัญชีบริการเชื่อมต่อ Google Sheets API และรหัสสเปรดชีตสำหรับการซิงค์ข้อมูลการลงชื่อเข้าร่วมกิจกรรมลงกูเกิลชีตอัตโนมัติ
        </p>
      </div>

      {/* Main Settings Card */}
      <div className="bg-canvas border border-hairline rounded-lg overflow-hidden shadow-sm">
        <div className="p-4 sm:p-6 border-b border-hairline flex items-center space-x-3">
          <Database size={20} className="text-ink" />
          <h2 className="text-lg font-semibold text-ink tracking-tight">
            การตั้งค่าบัญชีเชื่อมต่อ Google Sheets API
          </h2>
        </div>

        <div className="p-4 sm:p-6 md:p-8 space-y-8">
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
                rows={10}
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
        <div className="bg-surface-soft border-t border-hairline px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs text-muted">
            <FileText size={14} />
            <span>การปรับเปลี่ยนค่าจำเป็นต้องใช้สิทธิ์เขียนไฟล์บนฐานข้อมูล SQLite</span>
          </div>
          <button 
            onClick={handleSave}
            disabled={loading}
            className="inline-flex items-center space-x-2 bg-primary hover:bg-primary-active disabled:bg-surface-strong text-white px-5 py-2.5 rounded-md text-sm font-semibold transition-all shadow-sm active:scale-98 cursor-pointer"
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
    </div>
  );
}
