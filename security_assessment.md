# Security Assessment: Activity Attendance System

รายงานการประเมินช่องโหว่ความปลอดภัยของระบบเช็กชื่อเข้าร่วมกิจกรรม (Activity Attendance System) จากการตรวจสอบซอร์สโค้ดในฝั่ง Backend ([server.ts](file:///c:/Users/Newsk/Downloads/activity_attendance_System/backend/src/server.ts)) และ Frontend ([fingerprint.ts](file:///c:/Users/Newsk/Downloads/activity_attendance_System/frontend/src/utils/fingerprint.ts))

---

## 1. ช่องโหว่ระดับสูง (High Severity)

### 🔴 1.1 การโจมตีแบบสุ่มรหัส PIN ของแอดมิน (Brute-Force Attack on Admin PIN)
* **ไฟล์ที่เกี่ยวข้อง**: [server.ts](file:///c:/Users/Newsk/Downloads/activity_attendance_System/backend/src/server.ts) (บรรทัดที่ 54-85, 310-323)
* **รายละเอียด**:
  * ระบบกำหนดให้ใช้ `X-Admin-Pin` ใน Header หรือการส่งรหัสผ่านทาง `/api/auth/verify` เพื่อเข้าถึงสิทธิ์แอดมิน โดยค่าเริ่มต้นคือรหัส 6 หลัก (เช่น `250669`)
  * ปัจจุบันระบบไม่มีกลไก **Rate Limiting** (จำกัดจำนวนครั้งในการส่งรหัส) หรือ **Account Lockout** (การล็อกการเข้าถึงชั่วคราวหลังใส่รหัสผิดหลายครั้ง)
* **ผลกระทบ**:
  * ผู้โจมตีสามารถเขียนสคริปต์ส่งคำขอสุ่มรหัส PIN (ตั้งแต่ `000000` - `999999` ซึ่งมีเพียง 1 ล้านความเป็นไปได้) ได้หลายพันครั้งต่อวินาที และจะสามารถถอดรหัส PIN ได้สำเร็จภายในไม่กี่นาที
  * เมื่อได้ PIN แล้ว ผู้โจมตีจะสามารถควบคุมระบบทั้งหมดได้ รวมถึงการลบประวัติเช็กชื่อ, นำเข้า/ส่งออกข้อมูล, เปลี่ยนแปลงสิทธิ์ และแก้ไขข้อมูล Google Sheets
* **แนวทางแก้ไข**:
  * ติดตั้ง Middleware สำหรับจำกัดอัตราการส่งคำขอ เช่น `express-rate-limit` เพื่อจำกัดให้สามารถตรวจสอบ PIN ผิดได้ไม่เกิน 5 ครั้งใน 15 นาที ต่อ IP Address

### 🔴 1.2 ข้อมูลลับ Google Service Account รั่วไหลผ่านฟังก์ชัน Backup (Credential Exposure via Backup Export)
* **ไฟล์ที่เกี่ยวข้อง**: [server.ts](file:///c:/Users/Newsk/Downloads/activity_attendance_System/backend/src/server.ts) (บรรทัดที่ 2463-2489)
* **รายละเอียด**:
  * ตาราง `settings` ในฐานข้อมูลใช้จัดเก็บ Google Sheets API Credentials (`credentials_json` ซึ่งมี Private Key ของบัญชีบริการ) ในรูปแบบข้อความดิบ (Plaintext)
  * ใน endpoint `GET /api/backup/export` ระบบจะดึงข้อมูลทุกตารางรวมถึง `settings` ออกมาเป็นไฟล์ JSON สำหรับดาวน์โหลด
* **ผลกระทบ**:
  * หากแอดมินดาวน์โหลดไฟล์ Backup หรือหากมีผู้โจมตีที่สุ่มรหัส PIN ได้สำเร็จและทำการดาวน์โหลดไฟล์ Backup ไป ข้อมูล **Google Service Account Private Key** ทั้งหมดจะหลุดไปในรูปแบบ Plaintext
  * ผู้โจมตีจะสามารถนำคีย์นี้ไปเขียนสคริปต์เพื่อแก้ไข ลบ หรือดึงข้อมูลใดๆ ใน Google Spreadsheet ทั้งหมดที่แชร์ไว้กับบัญชีบริการนั้นได้ทันที
* **แนวทางแก้ไข**:
  * แก้ไขฟังก์ชัน `export` ใน [server.ts](file:///c:/Users/Newsk/Downloads/activity_attendance_System/backend/src/server.ts) ให้ข้ามตาราง `settings` หรือทำการลบ/ตัดฟิลด์ `credentials_json` ออกไปก่อนส่งออกเป็นไฟล์
  * หากเป็นไปได้ ควรเก็บ `credentials_json` ไว้ในรูปของ Environment Variable ในไฟล์ `.env` ที่ปลอดภัย แทนการบันทึกใน SQLite

---

## 2. ช่องโหว่ระดับปานกลาง (Medium Severity)

### 🟡 2.1 ข้อมูลส่วนบุคคลรั่วไหลผ่าน API สาธารณะ (Privacy Leak via Unauthenticated APIs)
* **ไฟล์ที่เกี่ยวข้อง**: [server.ts](file:///c:/Users/Newsk/Downloads/activity_attendance_System/backend/src/server.ts) (บรรทัดที่ 1701-1734, 2289-2303)
* **รายละเอียด**:
  * Endpoint `GET /api/students/:studentId` (ดึงข้อมูลนักศึกษา) และ `GET /api/attendances/student/:studentId` (ดึงประวัติการเข้าเรียนของนักศึกษา) **ไม่ถูกจัดอยู่ในกลุ่มควบคุมสิทธิ์แอดมิน** (ไม่มีการตรวจ PIN)
* **ผลกระทบ**:
  * ใครก็ตามที่ทราบรหัสนักศึกษา 11 หลัก สามารถยิงขอข้อมูลได้โดยตรง ซึ่งจะได้รับข้อมูลชื่อ-นามสกุล, ระดับชั้น, สาขาวิชา, เลขห้องเรียน และประวัติการเข้ากิจกรรมทั้งหมดของนักศึกษารายนั้นทันที
  * ถือเป็นปัญหาความเป็นส่วนตัวร้ายแรง (ขัดต่อหลักการ PDPA และความปลอดภัยของข้อมูลนักศึกษา)
* **แนวทางแก้ไข**:
  * จำกัดการเข้าถึง API ทั้งสองตัวนี้ให้อยู่ภายใต้การยืนยันตัวตนแอดมิน (ตรวจสอบ `X-Admin-Pin`) หรือใช้ระบบ Token ส่วนบุคคลในการค้นหา

### 🟡 2.2 การเช็กชื่อโดยไม่มีข้อมูลนักศึกษาจริงในระบบ (Lack of Enrollment Validation)
* **ไฟล์ที่เกี่ยวข้อง**: [server.ts](file:///c:/Users/Newsk/Downloads/activity_attendance_System/backend/src/server.ts) (บรรทัดที่ 990-1220)
* **รายละเอียด**:
  * เมื่อมีการส่งข้อมูลเช็กชื่อเข้ามาทาง `POST /api/attendances` ระบบจะตรวจสอบเพียงแค่รูปแบบรหัส 11 หลัก (`/^\d{11}$/`) แต่**ไม่ได้ตรวจสอบย้อนกลับ**ไปยังตาราง `students` ว่ามีรหัสนักศึกษานี้ลงทะเบียนไว้จริงๆ หรือไม่ และไม่ได้เช็กว่าชื่อจริง-นามสกุลที่ส่งมาสอดคล้องกับรหัสนั้นหรือไม่
* **ผลกระทบ**:
  * ผู้ใช้หรือสคริปต์ก่อกวนสามารถส่งข้อมูลเช็กชื่อปลอมโดยใช้รหัสนักศึกษาใดๆ ก็ได้ และส่งชื่อสะกดแปลกๆ เข้ามา ระบบจะบันทึกลง SQLite และส่งต่อไปเขียนลง Google Sheets ทันที ทำให้ข้อมูลกิจกรรมเสียหาย
* **แนวทางแก้ไข**:
  * เพิ่มการตรวจสอบใน [server.ts](file:///c:/Users/Newsk/Downloads/activity_attendance_System/backend/src/server.ts) ก่อนบันทึกเช็กชื่อ โดยค้นหาข้อมูลจากฐานข้อมูล:
    ```typescript
    const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(student_id);
    if (!student) {
      return res.status(400).json({ error: 'ไม่พบรหัสนักศึกษานี้ในรายชื่อผู้มีสิทธิ์เข้าร่วมกิจกรรม' });
    }
    ```

### 🟡 2.3 การปลอมแปลงพิกัดตำแหน่ง (GPS Spoofing)
* **ไฟล์ที่เกี่ยวข้อง**: [server.ts](file:///c:/Users/Newsk/Downloads/activity_attendance_System/backend/src/server.ts) (บรรทัดที่ 1034-1059)
* **รายละเอียด**:
  * การตรวจพิกัด GPS เพื่อทำ Geofencing ขึ้นอยู่กับค่า `latitude` และ `longitude` ที่ส่งมาใน HTTP Request Body จากฝั่งไคลเอนต์ (เบราว์เซอร์) เท่านั้น
* **ผลกระทบ**:
  * นักศึกษาที่ไม่ได้อยู่ในพื้นที่กิจกรรมสามารถใช้โปรแกรมประเภท Postman, ส่วนขยายของเบราว์เซอร์ (Mock Location) หรือแก้ไขสคริปต์สแกนเพื่อส่งพิกัดปลอมที่ตรงกับเงื่อนไขของห้องเรียนเข้ามาได้โดยตรง ทำให้ระบบ Geofence ถูกข้ามได้ง่าย
* **แนวทางแก้ไข**:
  * กลไกฝั่งไคลเอนต์ไม่สามารถเชื่อถือได้ 100% แต่สามารถเสริมความปลอดภัยได้โดยการใช้ dynamic QR code ที่เปลี่ยนรหัสตามเวลาทุกๆ 10-15 วินาที หรือการนำ IP Address ของระบบ Wi-Fi ภายในสถาบันมาตรวจสอบพิกัดร่วมด้วย

---

## 3. ช่องโหว่ระดับต่ำ / ข้อควรระวัง (Low Severity / Security Warnings)

### 🟢 3.1 การบายพาสระบบตรวจสอบตัวตนของอุปกรณ์ (Device Fingerprint Bypass)
* **ไฟล์ที่เกี่ยวข้อง**: [server.ts](file:///c:/Users/Newsk/Downloads/activity_attendance_System/backend/src/server.ts) และ [fingerprint.ts](file:///c:/Users/Newsk/Downloads/activity_attendance_System/frontend/src/utils/fingerprint.ts)
* **รายละเอียด**:
  * แม้ระบบจะใช้กลไกการสแกนคุณลักษณะอุปกรณ์ (Device Fingerprint) เช่น Canvas Hash, Battery Level, WebGL Renderer, และ Screen Info แต่ค่าทั้งหมดนี้ส่งมาเป็น Plaintext ผ่าน HTTP Request Body
* **ผลกระทบ**:
  * นักศึกษาที่มีความรู้ด้านไอทีสามารถใช้ Developer Tools จับคำขอเครือข่าย จากนั้นจำลองค่านั้นในสคริปต์ และสุ่มเปลี่ยนค่าบางตัว (เช่น Battery Level หรือ User-Agent เล็กน้อย) เพื่อข้ามระบบตรวจจับการสแกนซ้ำแทนเพื่อนได้
* **แนวทางแก้ไข**:
  * ล็อกคู่หูระหว่าง `student_id` กับ `device_uuid` ตั้งแต่เช็กชื่อครั้งแรก และหากต้องการเปลี่ยนอุปกรณ์จะต้องให้แอดมินกดยืนยันปลดล็อกประวัติอุปกรณ์ (Device Registration Reset) บนแผงแอดมินก่อน
