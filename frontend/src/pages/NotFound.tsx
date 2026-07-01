import { Link } from 'react-router-dom';
import { Home, AlertCircle, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center px-6 py-12 select-none animate-in fade-in duration-300">
      <div className="text-center space-y-6 max-w-md w-full">
        {/* Decorative Circle Icon */}
        <div className="mx-auto w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary animate-bounce duration-1000">
          <AlertCircle size={48} className="stroke-[1.5]" />
        </div>

        <div className="space-y-2">
          <h1 className="text-6xl font-black text-primary tracking-tight">404</h1>
          <h2 className="text-xl font-bold text-ink">ไม่พบหน้าที่คุณต้องการ</h2>
          <p className="text-sm text-muted">
            หน้าเว็บที่คุณกำลังเรียกใช้อาจถูกย้าย ลบออก หรือลิงก์ URL ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง
          </p>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button 
            onClick={() => window.history.back()}
            className="flex items-center justify-center space-x-2 px-5 h-11 border border-hairline rounded-md text-sm font-semibold text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>ย้อนกลับ</span>
          </button>
          
          <Link 
            to="/" 
            className="flex items-center justify-center space-x-2 px-5 h-11 bg-primary hover:bg-primary-active text-white rounded-md text-sm font-semibold transition-colors cursor-pointer"
          >
            <Home size={16} />
            <span>กลับหน้าหลัก</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
