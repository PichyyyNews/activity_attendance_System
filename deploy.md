# คู่มือการขั้นตอนการ Deploy ระบบ (Local Build & Image Transfer)

คู่มือนี้สำหรับขั้นตอนการอัปเดตระบบเข้าร่วมกิจกรรม (Activity Attendance System) ไปยัง AWS EC2 Server โดยการคอมไพล์งานที่เครื่อง Local แล้วทำการส่งภาพจำลองระบบ (Docker Images) ขึ้นไปโหลดบนเซิร์ฟเวอร์ เพื่อลดการใช้ CPU/RAM บนเซิร์ฟเวอร์ปลายทาง

---

## 🛠️ ขั้นตอนที่ 1: อัปเดตและคอมไพล์โค้ดล่าสุดบนเครื่อง Local
ก่อนเริ่มดำเนินการ ให้ตรวจสอบว่าแก้ไขโค้ดเรียบร้อยและสั่ง Build บนเครื่องของคุณผ่านฉลุย:

```powershell
# 1. ตรวจสอบความถูกต้องและสั่ง Build ระบบล่าสุดบน Local
docker compose build
```

---

## 📦 ขั้นตอนที่ 2: บันทึกและบีบอัด Docker Images
ทำการเซฟ Docker images ออกมาเป็นไฟล์ข้อมูล จากนั้นบีบอัดเป็น `.tar.gz` เพื่อความรวดเร็วในการส่งข้อมูล

```powershell
# 1. ย้ายโฟลเดอร์ไปยังที่เก็บ SSH Key (เช่น Desktop\aws) เพื่อความสะดวก
cd C:\Users\Newsk\Desktop\aws

# 2. บันทึก (Save) อิมเมจระบบเป็นไฟล์ Tar
docker save -o backend.tar attendance-backend:latest
docker save -o frontend.tar attendance-frontend:latest

# 3. บีบอัด (Compress) ไฟล์เพื่อลดขนาดการอัปโหลด (ลดลงเหลือ ~111MB)
tar -czf backend.tar.gz backend.tar
tar -czf frontend.tar.gz frontend.tar

# 4. ลบไฟล์ Tar ตัวใหญ่ที่ไม่ได้บีบอัดออกเพื่อประหยัดพื้นที่บน Local
Remove-Item backend.tar, frontend.tar -Force
```

---

## 📤 ขั้นตอนที่ 3: ส่งไฟล์อิมเมจขึ้น AWS Server (SCP)
อัปโหลดไฟล์ที่บีบอัดแล้วขึ้นไปยังเซิร์ฟเวอร์ผ่าน SSH Key `pichyy.pem`

```powershell
# อัปโหลดไฟล์ Backend และ Frontend ไปยัง Directory /home/admin/ บนเซิร์ฟเวอร์
scp -i pichyy.pem backend.tar.gz admin@13.229.211.83:/home/admin/
scp -i pichyy.pem frontend.tar.gz admin@13.229.211.83:/home/admin/
```

---

## 📥 ขั้นตอนที่ 4: อัปเดตโค้ดและโหลดอิมเมจบนเซิร์ฟเวอร์ (SSH)
เชื่อมต่อเข้าไปยังเซิร์ฟเวอร์ปลายทางเพื่อดึงโค้ดล่าสุดจาก Git และโหลดอิมเมจเข้าระบบ Docker

### 4.1 อัปเดต Git repository บน Server
```powershell
# รีโมทเข้าไปอัปเดตโค้ด Git (ในกรณีที่มีการแก้ไขไฟล์ตั้งค่าประกอบร่วมด้วย)
ssh -i pichyy.pem admin@13.229.211.83 "cd /home/admin/activity_attendance_System && git stash && git pull origin main && git stash pop"

# หมายเหตุ: หากมี Conflict ใน docker-compose.yml ให้แก้ไขหรือสั่งเลือกเก็บตัวสแตชไว้ด้วยคำสั่ง:
# git checkout --ours docker-compose.yml && git add docker-compose.yml && git stash drop
```

### 4.2 โหลดอิมเมจเวอร์ชันใหม่เข้าระบบและ Restart Container
รันคำสั่งด้านล่างนี้เพื่อแตกไฟล์ ➡️ โหลดเข้า Docker ➡️ สั่ง Restart Container

```powershell
# รีโมทสั่งการแตกไฟล์ โหลดอิมเมจ และรีสตาร์ทบริการ
ssh -i pichyy.pem admin@13.229.211.83 "tar -xzf /home/admin/backend.tar.gz -C /home/admin/ && sudo docker load -i /home/admin/backend.tar && rm /home/admin/backend.tar /home/admin/backend.tar.gz && tar -xzf /home/admin/frontend.tar.gz -C /home/admin/ && sudo docker load -i /home/admin/frontend.tar && rm /home/admin/frontend.tar /home/admin/frontend.tar.gz && cd /home/admin/activity_attendance_System && sudo docker compose up -d"
```

---

## 🔒 ข้อมูลสำคัญเกี่ยวกับความปลอดภัยของข้อมูล (Database Safety)
- ฐานข้อมูลจริง SQLite และไฟล์ที่เกี่ยวข้องทั้งหมดจะถูกเก็บอยู่ใน Docker Volume ชื่อ **`activity_attendance_system_sqlite-data`** 
- การโหลดอิมเมจใหม่และสั่ง `docker compose up -d` **จะไม่ส่งผลกระทบใดๆ กับข้อมูลใน Volume นี้** ข้อมูลทุกอย่างจะยังคงอยู่ 100% ปลอดภัยแน่นอน
- ห้ามสั่งรัน `docker compose down -v` เด็ดขาด เนื่องจากคำสั่ง `-v` จะเป็นการสั่งลบ Volume ทิ้ง
