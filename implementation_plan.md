# Activity Attendance System

ระบบเช็กชื่อสำหรับคาบกิจกรรม (Activity Attendance System) ที่ออกแบบมาให้ใช้งานง่าย รองรับการสร้าง QR Code ประจำสัปดาห์, การกรอกข้อมูลของนักศึกษา, และการบันทึกข้อมูลแบบ Dual-storage (SQLite และ Google Sheets) พร้อมระบบตรวจสอบประวัติการเข้าเรียนของนักศึกษา

## User Review Required
> [!IMPORTANT]
> กรุณาตรวจสอบและอนุมัติแผนงานนี้ก่อนที่ระบบจะเริ่มทำการเขียนโค้ดและสร้างโปรเจกต์จริง เมื่ออนุมัติแล้ว ระบบจะดำเนินการตามแผนทันที

## Open Questions
> [!WARNING]
> เพื่อให้การพัฒนาระบบตรงตามความต้องการมากที่สุด รบกวนยืนยันข้อมูลต่อไปนี้:
> 1. **Tech Stack**: ขอเสนอให้ใช้ **Next.js (React)** เนื่องจากรองรับทั้ง Frontend และ Backend (API Routes) ในตัว ทำให้จัดการ SQLite และ Google Sheets ได้ง่าย ส่วน UI จะใช้ **Vanilla CSS** เพื่อความยืดหยุ่นและสวยงามตามมาตรฐาน (หรือหากต้องการใช้ TailwindCSS รบกวนแจ้งเวอร์ชันที่ต้องการครับ)
> 2. **Authentication**: ระบบ Admin จำเป็นต้องมีระบบ Login (Username/Password) หรือไม่?
> 3. **Google Sheets API**: ในการเชื่อมต่อ Google Sheets จะต้องใช้ Service Account Key (`credentials.json`) ผู้ใช้งานสะดวกที่จะสร้างและนำมาใส่ในระบบเองใช่หรือไม่?
> 4. **Hosting/Deployment**: แผนการนำไปใช้งานจริงคือรันบน Local (เครื่องตัวเอง) หรือ Deploy ขึ้น Cloud (เช่น Vercel + ใช้ฐานข้อมูลอื่นแทน SQLite) เพราะ SQLite จะเหมาะกับการรันแบบ Local/VPS มากกว่า Vercel แบบ Serverless ครับ

## Proposed Architecture

1. **Frontend**: Next.js (React) + Vanilla CSS (เน้นความสวยงาม Modern, Responsive)
2. **Backend**: Next.js API Routes (Node.js)
3. **Database 1**: SQLite (เก็บบันทึกข้อมูลแบบ Local รวดเร็วและจัดการง่าย)
4. **Database 2**: Google Sheets API (ซิงค์ข้อมูลลง Spreadsheet แบบ Real-time เพื่อการดูข้อมูลที่ง่ายของผู้สอน)
5. **QR Code Generator**: ใช้ไลบรารี `qrcode.react` หรือ `qrcode` สำหรับสร้าง QR Code แบบ Dynamic ในแต่ละสัปดาห์

## Proposed Changes

การพัฒนาจะถูกแบ่งออกเป็นเฟสต่างๆ ดังนี้:

### 1. Project Initialization & Setup
- สร้างโปรเจกต์ Next.js เปล่า
- ตั้งค่าฐานข้อมูล SQLite (สร้างตาราง `users`, `sessions` สำหรับเก็บคาบเรียน, `attendances` สำหรับเก็บประวัติการเข้าเรียน)
- ตั้งค่า Google Sheets API Client

### 2. Admin Dashboard (CRUD & QR Generation)
- **UI/UX**: หน้า Dashboard ที่ดูพรีเมียม สบายตา
- **Features**:
  - หน้าสร้างคาบกิจกรรม (Session) ระบุสัปดาห์และรายละเอียด
  - หน้ารายการคาบกิจกรรม พร้อมปุ่มแสดง QR Code ของแต่ละคาบ
  - หน้าดูรายการนักศึกษาที่เช็กชื่อแล้ว (ดึงจาก SQLite)
  - ระบบลบ/แก้ไข คาบกิจกรรมและรายชื่อนักศึกษา

### 3. User Facing (Scan & Submit Form)
- **UI/UX**: หน้าเว็บสำหรับสแกน QR Code ที่ออกแบบให้ใช้งานบนมือถือเป็นหลัก (Mobile-first) โหลดเร็วและกรอกง่าย
- **Features**:
  - แบบฟอร์มกรอกข้อมูล: ชื่อ, นามสกุล, รหัสนักศึกษา, สาขา
  - เมื่อกด Submit ข้อมูลจะถูกบันทึกลง SQLite และ ยิง API ไปอัปเดตที่ Google Sheets ทันที
  - แจ้งเตือนสถานะความสำเร็จอย่างสวยงาม (Micro-animations)

### 4. User Dashboard (Attendance Checker)
- **UI/UX**: หน้าเว็บสำหรับให้นักศึกษาตรวจสอบสถานะการเข้าเรียน
- **Features**:
  - ช่องกรอกรหัสนักศึกษาเพื่อค้นหา
  - แสดงจำนวนครั้งที่เข้าเรียน, จำนวนที่ขาด และเปอร์เซ็นต์การเข้าเรียน

## Verification Plan

### Automated Tests
- ตรวจสอบ API Routes เบื้องต้นว่าสามารถเพิ่ม/อ่าน/ลบ ข้อมูลลง SQLite ได้ถูกต้อง

### Manual Verification
- รัน `npm run dev` เพื่อจำลองการใช้งานบน Local
- สร้างคาบเรียนทดสอบจากฝั่ง Admin และเปิดหน้า QR Code
- ใช้โทรศัพท์มือถือแสกน QR Code และทดลองกรอกข้อมูล
- ตรวจสอบว่าข้อมูลเข้าไปยัง SQLite และ Google Sheets อย่างถูกต้อง
- ทดลองใช้รหัสนักศึกษาค้นหาประวัติการเข้าเรียนในหน้า User Dashboard
