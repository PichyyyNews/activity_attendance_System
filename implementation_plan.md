# Activity Attendance System

ระบบเช็กชื่อสำหรับคาบกิจกรรม (Activity Attendance System) ที่ออกแบบมาให้ใช้งานง่าย รองรับการสร้าง QR Code ประจำสัปดาห์, การกรอกข้อมูลของนักศึกษา, และการบันทึกข้อมูลแบบ Dual-storage (SQLite และ Google Sheets) พร้อมระบบตรวจสอบประวัติการเข้าเรียนของนักศึกษา

## User Review Required
> [!IMPORTANT]
> กรุณาตรวจสอบและอนุมัติแผนงานนี้ก่อนที่ระบบจะเริ่มทำการเขียนโค้ดและสร้างโปรเจกต์จริง เมื่ออนุมัติแล้ว ระบบจะดำเนินการตามแผนทันที

## Open Questions
> [!WARNING]
> เพื่อให้การพัฒนาระบบตรงตามความต้องการมากที่สุด รบกวนยืนยันข้อมูลต่อไปนี้:
> 1. **Authentication**: ระบบ Admin จำเป็นต้องมีระบบ Login (Username/Password) หรือไม่?
> 2. **Google Sheets API**: ในการเชื่อมต่อ Google Sheets จะต้องใช้ Service Account Key (`credentials.json`) ผู้ใช้งานสะดวกที่จะสร้างและนำมาใส่ในระบบเองใช่หรือไม่?

## Proposed Architecture

1. **Frontend**: React (TypeScript) + Vite
   - UI/UX เน้น Mobile-first สวยงาม ใช้งานง่ายผ่านมือถือ
   - **Styling**: Tailwind CSS (Responsive 100%)
2. **Backend**: Node.js + Express (TypeScript)
   - จัดการ API สำหรับ Frontend
3. **Database 1**: SQLite (เก็บบันทึกข้อมูลแบบ Local ผ่าน Backend)
4. **Database 2**: Google Sheets API (ซิงค์ข้อมูลลง Spreadsheet)
5. **Infrastructure**: Docker Compose
   - แยก Service ระหว่าง Frontend และ Backend
   - จัดการ Environment Variables (`.env`, `.env.example`)
6. **QR Code Generator**: `qrcode.react` หรือ `qrcode` สำหรับสร้าง QR Code แบบ Dynamic ในแต่ละสัปดาห์

## Proposed Changes

การพัฒนาจะถูกแบ่งออกเป็นเฟสต่างๆ ดังนี้:

### 1. Project Initialization & Setup
- สร้างโฟลเดอร์สำหรับ `frontend` (React TypeScript + Vite + Tailwind CSS)
- สร้างโฟลเดอร์สำหรับ `backend` (Node.js + Express TypeScript)
- สร้างไฟล์ `docker-compose.yml`, `.env`, และ `.env.example`
- ตั้งค่าฐานข้อมูล SQLite (สร้างตาราง `users`, `sessions`, `attendances`)
- ตั้งค่า Google Sheets API Client บน Backend

### 2. Admin Dashboard (CRUD & QR Generation)
- **UI/UX**: หน้า Dashboard ที่ดูพรีเมียม สบายตา (Responsive)
- **Features**:
  - หน้าสร้างคาบกิจกรรม (Session) ระบุสัปดาห์และรายละเอียด
  - หน้ารายการคาบกิจกรรม พร้อมปุ่มแสดง QR Code ของแต่ละคาบ
  - หน้าดูรายการนักศึกษาที่เช็กชื่อแล้ว (ดึงจาก SQLite)
  - ระบบลบ/แก้ไข คาบกิจกรรมและรายชื่อนักศึกษา

### 3. User Facing (Scan & Submit Form)
- **UI/UX**: หน้าเว็บสำหรับสแกน QR Code (Mobile-first 100%)
- **Features**:
  - แบบฟอร์มกรอกข้อมูล: ชื่อ, นามสกุล, รหัสนักศึกษา, สาขา
  - เมื่อกด Submit ข้อมูลจะถูกส่งไปที่ Backend เพื่อบันทึกลง SQLite และ Google Sheets
  - แจ้งเตือนสถานะความสำเร็จอย่างสวยงาม (Micro-animations)

### 4. User Dashboard (Attendance Checker)
- **UI/UX**: หน้าเว็บตรวจสอบสถานะการเข้าเรียน (Mobile-first)
- **Features**:
  - ช่องกรอกรหัสนักศึกษาเพื่อค้นหา
  - แสดงจำนวนครั้งที่เข้าเรียน, จำนวนที่ขาด และเปอร์เซ็นต์การเข้าเรียน

## Verification Plan

### Automated Tests
- ตรวจสอบ API Routes ฝั่ง Backend เบื้องต้นว่าสามารถเพิ่ม/อ่าน/ลบ ข้อมูลลง SQLite ได้ถูกต้อง

### Manual Verification
- รัน `docker-compose up` เพื่อจำลองการใช้งานบน Local
- สร้างคาบเรียนทดสอบจากฝั่ง Admin และเปิดหน้า QR Code
- ใช้โทรศัพท์มือถือแสกน QR Code และทดลองกรอกข้อมูล (ทดสอบ Responsive UI)
- ตรวจสอบว่าข้อมูลเข้าไปยัง SQLite และ Google Sheets อย่างถูกต้อง
- ทดลองใช้รหัสนักศึกษาค้นหาประวัติการเข้าเรียนในหน้า User Dashboard
