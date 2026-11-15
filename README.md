# RustPad

โปรแกรมแก้ไขข้อความและซอร์สโค้ดสำหรับ macOS และ Windows ที่ทำงานกับไฟล์ในเครื่องและใช้งานออฟไลน์ได้ สร้างด้วย Tauri 2, Rust, React, TypeScript แบบ strict, Vite, Tailwind CSS 4, CodeMirror 6, Zustand, Lucide และคอมโพเนนต์ dialog ที่ดูแลในโครงการโดยใช้ Radix ตามแนวทาง shadcn/ui

ไม่มีบัญชีผู้ใช้ telemetry บริการคลาวด์ ฐานข้อมูล การเรียก shell ฟอนต์ภายนอก CDN หรือเว็บเซิร์ฟเวอร์ขณะใช้งานแอป ส่วน Vite ใช้เฉพาะระหว่างพัฒนา

## แอปที่ build แล้ว

รุ่นที่ตรวจสอบในเครื่องพัฒนาเป็น Apple Silicon และต้องใช้ macOS 13.3 ขึ้นไป เปิด `RustPad.app` ได้โดยไม่ต้องติดตั้ง Node.js, Rust หรือเซิร์ฟเวอร์ สามารถย้ายแอปไปไว้ในโฟลเดอร์ Applications ได้

ไฟล์ใน workspace ที่ใช้พัฒนาอยู่ที่ `release/RustPad.app` และ `release/RustPad-macOS-arm64.zip` พร้อม checksum ใน `release/SHA256SUMS.txt` โฟลเดอร์ `release/` ถูกยกเว้นจาก Git จึงไม่มีไฟล์เหล่านี้ในซอร์สที่ clone จาก repository ให้ build ตามขั้นตอนด้านล่าง

แอปที่ส่งมอบในเครื่องมีลายเซ็น ad-hoc ที่ตรวจสอบแล้ว แต่ยังไม่ได้ลงลายเซ็น Developer ID หรือผ่าน notarization ของ Apple

## Windows

เตรียมโค้ดและการตั้งค่า installer สำหรับ **Windows 10/11 x64** โดยใช้แถบหน้าต่างของระบบ ปุ่มย่อ/ขยาย/ปิด และคีย์ลัด Ctrl ตามแพลตฟอร์ม การปิดด้วย Alt+F4 จะผ่านขั้นตอนถามบันทึกเอกสารเช่นเดียวกับการปิดหน้าต่าง

ค่าเริ่มต้นของ editor บน Windows คือฟอนต์ Consolas และ CRLF ส่วน macOS ยังคงใช้ Menlo และ LF การตั้งค่าเดิมของผู้ใช้ยังใช้ต่อได้ รายการไฟล์ล่าสุดรองรับทั้ง path แบบ drive letter, UNC และ path ของ macOS

สถานะการตรวจสอบ: ทดสอบโค้ดร่วมและการอ่าน configuration ของทั้งสองแพลตฟอร์มบน macOS แล้ว แต่เครื่องพัฒนาไม่มี Windows SDK หรือ Windows runner จึงยังไม่ได้ยืนยันว่า Windows build, installer และ UI ผ่านจริง ดูรายการที่ต้องตรวจใน [QA.md](QA.md)

### เตรียมเครื่อง Windows

ติดตั้งตาม [ข้อกำหนดของ Tauri สำหรับ Windows](https://v2.tauri.app/start/prerequisites/#windows):

- Microsoft C++ Build Tools พร้อม workload **Desktop development with C++** และ Windows SDK
- Rust toolchain แบบ MSVC ผ่าน rustup
- Node.js 22.12 ขึ้นไป และ pnpm 10.28.2
- Microsoft Edge WebView2 Runtime สำหรับการรันระหว่างพัฒนา

รันใน PowerShell จากโฟลเดอร์โครงการ:

```powershell
pnpm install --frozen-lockfile
pnpm tauri dev

# ทดสอบและ build installer
pnpm test
pnpm check
pnpm test:rust
pnpm lint:rust
pnpm tauri build --bundles nsis
```

ผลลัพธ์ installer อยู่ที่ `src-tauri/target/release/bundle/nsis/` ใช้การติดตั้งเฉพาะผู้ใช้ปัจจุบัน และกำหนดให้แนบตัวติดตั้ง WebView2 แบบ offline ตาม [คู่มือ Windows installer ของ Tauri](https://v2.tauri.app/distribute/windows-installer/)

ขั้นตอน build ยังต้องใช้อินเทอร์เน็ตเพื่อดาวน์โหลด dependency, NSIS และ WebView2 payload แต่ installer ที่สร้างตาม configuration นี้แนบ runtime ไว้สำหรับเครื่องปลายทางที่ไม่มีอินเทอร์เน็ต จึงมีขนาดใหญ่กว่า macOS bundle ต้องตรวจการติดตั้งออฟไลน์บน Windows จริงก่อนแจกจ่าย ยังไม่มี Windows code-signing certificate และอาจพบคำเตือนจาก SmartScreen

Configuration บน Windows อยู่ที่ `%APPDATA%\app.rustpad.editor\settings.json` รองรับการเปิดไฟล์จาก argument ของ native process ซึ่ง Windows ใช้กับ Open With ส่วนการเปิดไฟล์เข้าสู่โปรเซสที่รันอยู่แล้วไม่อยู่ในขอบเขตนี้

### Build ผ่าน GitHub Actions

ไฟล์ `.github/workflows/windows.yml` จะรันทดสอบ TypeScript/Rust, ตรวจรูปแบบและ Clippy, build NSIS แล้วแนบ installer พร้อม SHA-256 ไว้ใน artifact ชื่อ `RustPad-windows-x64` เมื่อ push ไป `main`, เปิด pull request หรือสั่ง workflow ด้วยตนเอง

ดาวน์โหลดได้จากหน้า Actions ของรอบที่สำเร็จ โดย artifact เก็บไว้ 14 วัน Workflow ใช้สิทธิ์อ่าน repository และ **ไม่สร้าง GitHub Release หรือเผยแพร่แอปโดยอัตโนมัติ** ยังไม่ได้รัน workflow นี้บน GitHub จากงานครั้งนี้

## เริ่มพัฒนาจากซอร์ส

ติดตั้งเครื่องมือต่อไปนี้บน macOS:

- Xcode Command Line Tools: `xcode-select --install`
- Rust ผ่าน rustup
- Node.js 22.12 ขึ้นไป หรือ LTS รุ่นใหม่ที่เครื่องมือรองรับ
- pnpm 10.28.2

การติดตั้ง dependency ครั้งแรกต้องใช้อินเทอร์เน็ต แต่แอปที่ build แล้วไม่ต้องใช้

```sh
pnpm install --frozen-lockfile
pnpm tauri dev
```

โครงการเริ่มจาก template React TypeScript ทางการของ `create-tauri-app` ใช้ `pnpm-lock.yaml` เพื่อกำหนด dependency ให้ตรงกัน

เครื่องที่ใช้พัฒนาเดิมไม่มี pnpm จึงมีตัวช่วยเฉพาะเครื่องดังนี้:

```sh
export PATH="$PWD/.tools/bin:$PATH"
pnpm tauri dev
```

`.tools` เป็นข้อมูลและ cache เฉพาะเครื่องที่ถูกยกเว้นจาก Git ไม่ใช่ dependency ของซอร์ส หาก clone ไปเครื่องอื่น ให้ติดตั้ง pnpm ตามปกติ ข้อจำกัด DNS ใน shell ของเครื่องพัฒนาเดิมทำให้ต้องดาวน์โหลดแพ็กเกจจาก registry ที่ตรวจสอบแล้วมาเก็บใน cache ภายในเครื่อง

## ความสามารถ

- สร้างเอกสาร เปิดไฟล์ผ่าน dialog ของระบบ บันทึก และ Save As รองรับหลายแท็บ ลากจัดลำดับแท็บ และสลับแท็บด้วยคีย์บอร์ด
- ตรวจสถานะแก้ไขจาก snapshot ของข้อความ แยกประวัติ undo ของแต่ละแท็บ และเก็บตำแหน่งเคอร์เซอร์กับตำแหน่งเลื่อนหน้าจอ
- ถาม Save / Don’t Save / Cancel ก่อนปิดเอกสารที่แก้ไข การยกเลิกหรือบันทึกไม่สำเร็จจะเก็บเอกสารไว้ การปิดหน้าต่างและ Quit จะรอการตัดสินใจและการเขียนไฟล์ให้เสร็จ
- เน้นไวยากรณ์ Rust, TypeScript, JavaScript, JSON, HTML, CSS, Markdown, Python, PHP, SQL, TOML และข้อความธรรมดา ตรวจภาษาจากชื่อไฟล์หรือเลือกเองได้ แพ็กเกจภาษาถูกโหลดจากแอปเมื่อจำเป็น
- ค้นหาและแทนที่ ไปผลลัพธ์ถัดไปหรือก่อนหน้า และ Replace All รองรับการแยกตัวพิมพ์ใหญ่เล็ก การค้นหาทั้งคำ และ regex
- ไปยังบรรทัดและคอลัมน์ พับโค้ด จับคู่และปิดวงเล็บอัตโนมัติ ตั้งค่าการเยื้อง ตัดบรรทัด ฟอนต์ และเลขบรรทัด
- Command palette, sidebar ที่ยุบได้, dialog เลือกโฟลเดอร์ของระบบ, ต้นไม้ไฟล์ที่ขยายได้ และรายการไฟล์ล่าสุด
- มีตัวรับไฟล์ที่ลากลงหน้าต่างผ่าน native runtime และกำหนด document associations สำหรับ Finder ในแอปที่แพ็กแล้ว
- ตรวจการเปลี่ยนไฟล์จากภายนอกทุก 3 วินาทีขณะหน้าต่างมองเห็น ผู้ใช้ต้องเลือกก่อน Reload ส่วน Keep Local จะเก็บข้อความใน editor และป้องกันการเขียนทับไฟล์ที่เปลี่ยนแล้ว ให้ใช้ Save As เพื่อเก็บงานแยก
- บันทึกธีม System / Dark / Light และการตั้งค่า editor ไว้ในเครื่อง
- Auto save ปิดเป็นค่าเริ่มต้น เมื่อเปิด จะบันทึกไฟล์ที่มีปลายทางแล้วหลังหยุดแก้ไข 1.5 วินาที หากบันทึกไม่สำเร็จ จะพัก auto save ของแท็บนั้นจนกว่าจะบันทึกด้วยตนเองสำเร็จ เอกสาร Untitled และไฟล์ที่มีรูปแบบขึ้นบรรทัดผสมต้องบันทึกด้วยตนเอง
- กู้ session จาก metadata ได้แก่ path ของไฟล์ที่บันทึกแล้ว แท็บที่เลือก เคอร์เซอร์ และตำแหน่งเลื่อนหน้าจอ ไม่เขียนข้อความที่ยังไม่บันทึกลงใน configuration

## คีย์ลัด

| การทำงาน                                  | macOS                | Windows                           |
| ----------------------------------------- | -------------------- | --------------------------------- |
| สร้าง / เปิด / บันทึก                     | ⌘N / ⌘O / ⌘S         | Ctrl+N / Ctrl+O / Ctrl+S          |
| Save As                                   | ⇧⌘S                  | Ctrl+Shift+S                      |
| ปิดแท็บ / ออกจากแอป                       | ⌘W / ⌘Q              | Ctrl+W / Alt+F4                   |
| ค้นหา / แทนที่                            | ⌘F / ⇧⌘F             | Ctrl+F / Ctrl+H                   |
| ไปบรรทัด หรือ line:column                 | ⌘G                   | Ctrl+G                            |
| Command palette                           | ⇧⌘P หรือ ⌘P          | Ctrl+Shift+P หรือ Ctrl+P          |
| ตั้งค่า / แสดงหรือซ่อน sidebar            | ⌘, / ⌘B              | Ctrl+, / Ctrl+B                   |
| แท็บก่อนหน้า / ถัดไป                      | ⇧⌘[ / ⇧⌘]            | Ctrl+Shift+Tab / Ctrl+Tab         |
| จัดลำดับแท็บที่มีโฟกัส                    | Ctrl+Shift+Arrow key | Ctrl+Shift+Arrow key              |
| ผลค้นหาถัดไป / ก่อนหน้า ขณะโฟกัสช่องค้นหา | Enter / Shift+Enter  | Enter / Shift+Enter               |
| Undo / Redo                               | ⌘Z / ⇧⌘Z             | Ctrl+Z / Ctrl+Y หรือ Ctrl+Shift+Z |

ภายใน CodeMirror ปุ่ม Tab ใช้เยื้องข้อความ กด Escape แล้วกด Tab เพื่อย้ายโฟกัสออกจาก editor ส่วนแถบแท็บใช้ปุ่มลูกศรเพื่อนำทางได้

## ความปลอดภัยของไฟล์

Rust เป็นผู้เรียก dialog ของระบบและออก document ID ให้เอกสารที่ได้รับอนุญาต Frontend IPC ไม่รับ path อิสระสำหรับอ่านหรือเขียนไฟล์ รายการในต้นไม้ไฟล์ใช้ ID เช่นกัน โดยไม่แสดง symlink และตรวจว่าไฟล์ที่เปิดยังอยู่ภายในโฟลเดอร์ที่เลือก

รายการไฟล์ล่าสุดและ session มาจาก configuration ในเครื่องที่เคยบันทึกจากเอกสารที่ได้รับอนุญาต ส่วน path จากการลากไฟล์และเหตุการณ์ของ Finder มาจาก native runtime

รองรับเฉพาะไฟล์ข้อความ UTF-8 แบบมีหรือไม่มี BOM ขนาดไม่เกิน **10 MiB** ระบบปฏิเสธ UTF-8 ที่ไม่ถูกต้อง อักขระควบคุมที่บ่งชี้ข้อมูลไบนารี และไฟล์เกินขนาด โดยไม่แก้ไขไฟล์ต้นฉบับ สำหรับ encoding รุ่นเก่า ให้แปลงสำเนาเป็น UTF-8 ด้วยเครื่องมืออื่นก่อนเปิด

การบันทึกข้อความที่ไม่เปลี่ยนจะรักษา LF, CRLF และรูปแบบขึ้นบรรทัดผสมเดิมไว้ หากแก้ไขไฟล์ที่มีรูปแบบขึ้นบรรทัดผสม ระบบจะถามให้เลือก LF หรือ CRLF ก่อนบันทึก แถบสถานะมีตัวเลือกแปลงรูปแบบขึ้นบรรทัดและเลือก UTF-8 BOM การนับคอลัมน์และความยาว selection ใช้ Unicode code point ส่วน CodeMirror ดูแล composition และการแก้ไขตาม grapheme

การบันทึกจะเขียนไฟล์ชั่วคราวในโฟลเดอร์เดียวกับปลายทาง รักษาสิทธิ์ไฟล์ที่ระบบรองรับ ทำ sync ตรวจ fingerprint ของต้นฉบับซ้ำ แล้วแทนที่ไฟล์แบบ atomic สำหรับปลายทางใหม่จะใช้วิธีที่ไม่เขียนทับไฟล์ที่เพิ่งปรากฏขึ้นระหว่างทาง

หากต้นฉบับเปลี่ยนหรือถูกลบ จะไม่ให้ใช้ Save ปกติ ระบบปฏิเสธกรณีไฟล์ถูกแทนด้วย symlink หรือโฟลเดอร์แม่เปลี่ยน ข้อผิดพลาดจะไม่ลบข้อความใน editor และ Save As จะไม่เขียนทับไฟล์ที่เปิดอยู่ในแท็บอื่น

การแทนที่แบบ atomic ทำให้ inode เปลี่ยน ไม่รักษา extended attributes, ACL และความสัมพันธ์ hard link ยังมีช่วงเวลาสั้น ๆ ที่อีกโปรเซสอาจเขียนไฟล์ระหว่างการตรวจ fingerprint ครั้งสุดท้ายกับ rename ระบบนี้จึงไม่ใช่กลไกล็อกไฟล์สำหรับการแก้ไขร่วมกัน ส่วน Save As ใช้การยืนยันเขียนทับของ dialog ระบบ

บน Unix จะ sync โฟลเดอร์หลังแทนที่ด้วย ส่วน Windows จะ sync ไฟล์ชั่วคราวก่อนแทนที่ และไม่เรียก `File::open` กับโฟลเดอร์ซึ่งไม่รองรับบน Windows

Configuration บน macOS อยู่ที่ `~/Library/Application Support/app.rustpad.editor/settings.json` เก็บการตั้งค่าและ path ของไฟล์ แต่ไม่เก็บข้อความในเอกสาร และเขียนแบบ atomic หาก configuration เสียหาย แอปจะเริ่มด้วยค่าเริ่มต้นและหยุดเขียน configuration จนกว่าจะซ่อมหรือย้ายไฟล์ที่เสียออก ข้อมูลเดิมจะยังอยู่ โค้ดแอปไม่บันทึก path ที่ละเอียดอ่อนหรือเนื้อหาเอกสารลง log

CSP สำหรับ production อนุญาตเฉพาะทรัพยากรใน bundle และ Tauri IPC โดย CodeMirror และ React ต้องใช้ inline style ส่วน CSP สำหรับพัฒนาอนุญาต Vite ที่ `localhost:1420` และ WebSocket เพิ่มเติม JavaScript ไม่ได้รับสิทธิ์ plugin สำหรับ filesystem, shell, HTTP หรือ opener และเรียกใช้ dialog plugin จาก Rust เท่านั้น

## โครงสร้างระบบ

- `src/services/editor`: สถานะเอกสาร CodeMirror, snapshot ที่บันทึกแล้ว, การเลือกภาษา และการค้นหา ไม่ส่งข้อความทั้งเอกสารเข้า Zustand ทุกครั้งที่พิมพ์
- `src/services/documents`: วงจรชีวิตเอกสาร การจัดลำดับการบันทึกและการปิด auto save การตัดสินใจเมื่อไฟล์ภายนอกเปลี่ยน และการจัดการคีย์ลัด
- `src/stores`: metadata ของแท็บ การตั้งค่า ตำแหน่งเคอร์เซอร์ และสถานะแจ้งเตือน
- `src/components`: โครงหน้าต่าง แท็บ sidebar พื้นที่ CodeMirror การค้นหา แถบสถานะ และ dialog ที่ใช้ Radix
- `src/services/tauri`: ตัวเรียก IPC ที่มี type และรวมไว้จุดเดียว
- `src-tauri/src/services`: การอ่านไฟล์แบบจำกัดขนาด ตรวจ UTF-8 สร้าง fingerprint เขียนไฟล์อย่างปลอดภัย และจัดเก็บ configuration
- `src-tauri/src/commands`: dialog ของระบบ การอนุญาตเอกสารและโฟลเดอร์ คำสั่งเอกสาร metadata ของ session และการอนุมัติออกจากแอป

## การตรวจสอบ

```sh
pnpm test
pnpm check
pnpm test:rust
pnpm lint:rust
cargo fmt --manifest-path src-tauri/Cargo.toml --check
pnpm build
pnpm tauri build --bundles app
```

บนเครื่องพัฒนาเดิม มี cache ของ Rust registry ใน workspace และตั้งค่าได้ดังนี้ ไม่จำเป็นสำหรับเครื่องที่ติดตั้ง Rust ตามปกติ:

```sh
export CARGO_HOME="$PWD/.tools/cargo"
```

ผลที่ตรวจล่าสุด: frontend **25 รายการ** และ Rust **14 รายการบน macOS** ผ่าน รวมถึง strict TypeScript, Clippy ที่ไม่ยอมรับ warning, การจัดรูปแบบ Rust และ production build ดูรายละเอียดกับรายการที่ยังไม่ได้ตรวจใน [QA.md](QA.md)

การทดสอบครอบคลุม CodeMirror จริงสำหรับค้นหา แทนที่ และ undo, สถานะแท็บ, validation ของการตั้งค่า, การแก้ไขระหว่างบันทึก, การยกเลิก Save As และ Quit, auto save ที่ล้มเหลว, การตัดสินใจเมื่อไฟล์ภายนอกเปลี่ยน, UTF-8/BOM/รูปแบบขึ้นบรรทัด, การรักษาสิทธิ์ไฟล์, conflict, ไฟล์ที่ถูกลบหรืออ่านอย่างเดียว, ขนาดไฟล์ และการบันทึก metadata

Frontend controller tests ใช้ตัวแทนเฉพาะขอบเขตการเรียก native OS ส่วน Rust tests ใช้ไฟล์ชั่วคราวจริง และมีการตรวจ native UI ด้วยตนเองเพิ่มเติม

## Build และแจกจ่าย

```sh
# Build ตามสถาปัตยกรรมของ Mac ที่ใช้อยู่
pnpm tauri build --bundles app

# Bundle สำหรับพัฒนา โดยไม่ต้องรัน Vite ขณะเปิดแอป
pnpm tauri build --debug --bundles app

# Intel: ต้องติดตั้ง target และเครื่องมือที่เกี่ยวข้องก่อน
rustup target add x86_64-apple-darwin
pnpm tauri build --target x86_64-apple-darwin --bundles app

# Universal: ต้องติดตั้ง target ของ macOS ทั้งสองสถาปัตยกรรม
rustup target add aarch64-apple-darwin x86_64-apple-darwin
pnpm tauri build --target universal-apple-darwin --bundles app

# สร้าง DMG เพิ่มเติม
pnpm tauri build --bundles app,dmg
```

ผลลัพธ์ปกติอยู่ที่ `src-tauri/target/release/bundle/macos/RustPad.app` กำหนด macOS ขั้นต่ำเป็น 13.3 และ build target ของหน้าเว็บเป็น Safari 16.4 เพื่อให้ตรงกับ [ข้อกำหนดเบราว์เซอร์ของ Tailwind 4](https://tailwindcss.com/docs/compatibility)

ทดสอบกับเครื่อง Apple Silicon ที่มีอยู่ ส่วน Intel, Universal และการรันบน macOS 13.3 จริงยังต้องตรวจบน target เหล่านั้น หน้าแอปใช้ WebKit รุ่นใหม่ การรองรับ macOS เก่ากว่านี้อาจต้องอัปเดตหรือเพิ่ม CSS fallback

Bundle ID คือ `app.rustpad.editor` รุ่น `0.1.0` สร้างไอคอนจาก `src-tauri/icon.svg` ได้ด้วยคำสั่ง:

```sh
pnpm tauri icon src-tauri/icon.svg
```

Bundle ในเครื่องยังไม่ได้ลงลายเซ็น Developer ID หรือผ่าน notarization การแจกจ่ายสาธารณะต้องใช้ signing identity จาก Apple Developer ของผู้แจกจ่าย ตั้งค่า hardened runtime และ entitlements ให้เหมาะสม พร้อม credential สำหรับ notarization ของ Apple

ให้ทำตาม [คู่มือลงลายเซ็น macOS ของ Tauri](https://v2.tauri.app/distribute/sign/macos/) และตรวจลายเซ็นกับผล notarization ก่อนแจกจ่าย โครงการไม่มี signing credential รวมอยู่ การตั้งค่านี้เป็นการแจกจ่ายโดยตรง ไม่ใช่แอปสำหรับ Mac App Store sandbox และการเข้าถึงไฟล์อยู่ภายใต้สิทธิ์กับระบบ privacy ของ macOS ตามปกติ

## ข้อจำกัด

- กู้ไฟล์ที่บันทึกแล้วจากดิสก์ ข้อความที่ยังไม่บันทึกและประวัติ undo ไม่คงอยู่หลังแอป crash หรือถูกบังคับปิด การปิดตามปกติจะถามก่อนทิ้งข้อความ
- Windows ยังไม่ได้ build หรือทดสอบบนระบบจริงจากเครื่องนี้ และยังไม่ควรประกาศว่า Windows พร้อมใช้งานแบบ stable
- ยังไม่มีหน้าดู diff/compare, เส้นนำการเยื้อง, ตัวถอดรหัส legacy encoding, การแก้ไขหลายหน้าต่าง, การเฝ้าดูโฟลเดอร์แบบสด, auto updater หรือระบบส่วนขยาย
- แสดงสูงสุด 500 รายการต่อโฟลเดอร์และไม่รวม symlink เมื่อโฟลเดอร์เปลี่ยนต้อง refresh หรือเปิดใหม่ รองรับ 50 ไฟล์แรกต่อชุดการเปิด ลากไฟล์ หรือกู้ session
- การตรวจไฟล์ภายนอกจะอ่านและ hash ไฟล์ที่เปิดอยู่ทุก 3 วินาทีขณะมองเห็นหน้าต่าง ยังต้องวัดผลเพิ่มเติมสำหรับงานที่เปิดหลายไฟล์หรือใช้ดิสก์และ network volume ที่ช้า จำกัดขนาดไว้ที่ 10 MiB ไม่ได้อ้างว่ารองรับไฟล์ใหญ่ได้ไม่จำกัด
- ยังต้องตรวจเวลาเริ่มแอป หน่วยความจำ latency ของไฟล์ใหญ่ การใช้ VoiceOver ให้ครบ Thai IME composition จริง การลากไฟล์ และ Finder Open With ตามรายการใน `QA.md` ส่วนการวางและบันทึกข้อความ Unicode พร้อมธีมทั้งสองแบบได้ตรวจแล้ว
