# 🌸 PocketBloom — เกมจัดการเงิน

แอปพลิเคชันจัดการเงินส่วนตัว ที่สนุก ใช้งานง่าย และปลอดภัยด้วย Supabase Cloud Backend

## ✨ ฟีเจอร์

- 📊 **Dashboard** — ภาพรวมรายรับ/รายจ่ายประจำเดือน พร้อมกราฟ Donut Chart
- 💸 **รายการทั้งหมด** — เพิ่ม/แก้ไข/ลบ รายรับ-รายจ่าย พร้อม filter
- 📅 **ผ่อนชำระ** — ติดตามรายการผ่อนชำระอัตโนมัติ
- 📝 **บันทึกความจำ** — จดบันทึกเรื่องสำคัญทางการเงิน
- ☁️ **Cloud Sync** — บันทึกข้อมูลบน Supabase เข้าถึงได้ทุกอุปกรณ์
- 🔐 **Auth** — ระบบสมัคร/เข้าสู่ระบบ Email + Password
- 📱 **Responsive** — ใช้งานได้ทั้งมือถือและเดสก์ท็อป

## 🗂️ โครงสร้างโปรเจค

```
payment/
├── index.html       # HTML หลัก + Auth modal
├── styles.css       # Vanilla CSS — dark mode, glassmorphism
├── app.js           # Logic หลัก + Auth integration
├── supabase.js      # Supabase Backend Layer (Auth, DB, Realtime)
├── schema.sql       # SQL Schema — รัน ใน Supabase SQL Editor
└── README.md
```

## 🚀 เริ่มใช้งาน

### 1. ตั้งค่า Supabase

1. ไปที่ [Supabase Dashboard](https://bzdrnwzrefyhclwviiuz.supabase.co)
2. **SQL Editor** → **New Query** → วาง `schema.sql` ทั้งหมด → **Run**
3. ไปที่ **Settings** → **API** → คัดลอก **anon public key**

### 2. ใส่ Anon Key

เปิด `index.html` ค้นหาบรรทัด:
```js
window.__SUPABASE_ANON_KEY__ = "...REPLACE_WITH_ACTUAL_ANON_KEY";
```
แทน `REPLACE_WITH_ACTUAL_ANON_KEY` ด้วย Anon Key ที่ได้จาก Dashboard

### 3. เปิดแอป

เปิด `index.html` ในเบราว์เซอร์โดยตรง หรือ serve ด้วย:
```bash
npx serve .
```

## 🏗️ Supabase Architecture

| ตาราง | คำอธิบาย |
|-------|----------|
| `transactions` | รายรับ/รายจ่าย ทุกประเภท |
| `installments` | รายการผ่อนชำระ |
| `notes` | บันทึกความจำ |

ทุกตารางมี **Row Level Security (RLS)** — ผู้ใช้เห็นเฉพาะข้อมูลของตัวเอง

## 🔒 Security

- **RLS Policies** คุ้มครองทุก query
- **Auth.users** ผ่าน Supabase JWT
- **Anon Key** ปลอดภัย — ถูก restrict ด้วย RLS
- **reCAPTCHA v3** ป้องกัน bot สมัคร/ล็อกอิน (ดูด้านล่าง)

### 🤖 ตั้งค่า reCAPTCHA v3

- **Site key** (`window.__RECAPTCHA_SITE_KEY__` ใน `index.html`) — ใช้ในฝั่ง client ได้ปกติ ระบบจะ execute แบบ invisible ทุกครั้งที่ login/signup (action: `auth`)
- **Secret key** — ⚠️ ห้ามใส่ในโค้ดฝั่ง client เด็ดขาด ใช้ verify ฝั่ง server เท่านั้น:
  ```
  POST https://www.google.com/recaptcha/api/siteverify
  secret=<SECRET_KEY>&response=<TOKEN>
  ```
  หมายเหตุ: Supabase Auth รองรับ captcha ฝั่ง server เฉพาะ hCaptcha/Turnstile — token reCAPTCHA v3 จึงถูก enforce ที่ client + ตรวจ score ผ่าน backend ของคุณเองหากต้องการ

## 🛠️ Supabase Backend API

```js
// Auth (captchaToken = token จาก reCAPTCHA)
await SupabaseAuth.signUp(email, password, displayName, captchaToken)
await SupabaseAuth.signIn(email, password, captchaToken)
await SupabaseAuth.signOut()
await SupabaseAuth.getUser()

// Database
await SupabaseDB.getTransactions()
await SupabaseDB.addTransaction(tx)
await SupabaseDB.updateTransaction(id, tx)
await SupabaseDB.deleteTransaction(id)

await SupabaseDB.getInstallments()
await SupabaseDB.addInstallment(inst)
await SupabaseDB.updateInstallment(id, inst)
await SupabaseDB.deleteInstallment(id)

await SupabaseDB.getNotes()
await SupabaseDB.addNote(note)
await SupabaseDB.deleteNote(id)

// Load all at once
await SupabaseDB.loadAll()

// Realtime
await SupabaseRealtime.subscribe(userId, onChange)
await SupabaseRealtime.unsubscribeAll()

// Migration
await SupabaseMigration.migrateFromLocalStorage("pocketbloom-v2")
```
