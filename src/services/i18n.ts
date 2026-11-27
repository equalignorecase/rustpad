export type Locale = "en" | "th";

export const translations = {
  en: {
    // Menus
    file: "File",
    edit: "Edit",
    search: "Search",
    view: "View",
    encoding: "Encoding",
    language: "Language",
    settings: "Settings",
    tools: "Tools",
    macro: "Macro",
    run: "Run",
    plugins: "Plugins",
    window: "Window",
    help: "?",

    // File menu items
    new: "New",
    open: "Open...",
    openFolder: "Open Containing Folder...",
    save: "Save",
    saveAs: "Save As...",
    saveAll: "Save All",
    close: "Close",
    closeAll: "Close All",
    exit: "Exit",

    // Edit menu
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    delete: "Delete",
    selectAll: "Select All",

    // Search menu
    find: "Find...",
    replace: "Replace...",
    goto: "Go to Line...",

    // View menu
    docMap: "Document Map (Minimap)",
    wordWrap: "Word Wrap",
    palette: "Command Palette...",

    // Settings menu
    preferences: "Preferences...",

    // Help menu
    checkUpdates: "Check for Updates",
    about: "About RustPad",

    // Toolbar tooltips
    print: "Print",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",

    // Status bar
    statusModified: "Modified",
    statusReady: "Ready",
    statusNew: "New file",
    statusChangedOnDisk: "Changed on disk",
    length: "length",
    lines: "lines",
    ln: "Ln",
    col: "Col",
    sel: "Sel",
    normalText: "Normal text file",
    ins: "INS",

    // Settings Dialog
    settingsTitle: "Preferences",
    appearance: "Appearance",
    theme: "Theme",
    themeSystem: "System",
    themeDark: "Dark",
    themeLight: "Light",
    uiLanguage: "UI Language",
    font: "Font",
    fontSize: "Font size",
    editorOptions: "Editor Options",
    tabSize: "Tab size",
    indentWithTabs: "Indent using tabs",
    lineNumbers: "Show line numbers",
    bracketMatching: "Bracket matching",
    autoIndent: "Auto-indent new lines",
    behavior: "Behavior",
    restoreSession: "Restore previous session on launch",
    crashRecovery: "Crash recovery & hot exit",
    autoSave: "Auto-save changes",
    lineEndings: "Default Line Endings",
    closeButton: "Close",
  },
  th: {
    // Menus
    file: "แฟ้ม",
    edit: "แก้ไข",
    search: "ค้นหา",
    view: "มุมมอง",
    encoding: "การเข้ารหัส",
    language: "ภาษาโค้ด",
    settings: "ตั้งค่า",
    tools: "เครื่องมือ",
    macro: "แมโคร",
    run: "รัน",
    plugins: "ปลั๊กอิน",
    window: "หน้าต่าง",
    help: "?",

    // File menu items
    new: "สร้างใหม่",
    open: "เปิด...",
    openFolder: "เปิดโฟลเดอร์ที่อยู่...",
    save: "บันทึก",
    saveAs: "บันทึกเป็น...",
    saveAll: "บันทึกทั้งหมด",
    close: "ปิด",
    closeAll: "ปิดทั้งหมด",
    exit: "ออกจากโปรแกรม",

    // Edit menu
    undo: "ยกเลิก (Undo)",
    redo: "ทำซ้ำ (Redo)",
    cut: "ตัด",
    copy: "คัดลอก",
    paste: "วาง",
    delete: "ลบ",
    selectAll: "เลือกทั้งหมด",

    // Search menu
    find: "ค้นหา...",
    replace: "แทนที่...",
    goto: "ไปยังบรรทัด...",

    // View menu
    docMap: "แผนที่เอกสาร (Minimap)",
    wordWrap: "ตัดบรรทัดอัตโนมัติ",
    palette: "แผงคำสั่งลัด...",

    // Settings menu
    preferences: "การตั้งค่าโปรแกรม...",

    // Help menu
    checkUpdates: "ตรวจสอบการอัปเดต",
    about: "เกี่ยวกับ RustPad",

    // Toolbar tooltips
    print: "พิมพ์เอกสาร",
    zoomIn: "ขยายตัวอักษร",
    zoomOut: "ย่อตัวอักษร",

    // Status bar
    statusModified: "แก้ไขแล้ว",
    statusReady: "พร้อมใช้งาน",
    statusNew: "แฟ้มใหม่",
    statusChangedOnDisk: "ไฟล์ถูกแก้ไขภายนอก",
    length: "ขนาด",
    lines: "บรรทัด",
    ln: "บรรทัด",
    col: "คอลัมน์",
    sel: "เลือก",
    normalText: "ข้อความธรรมดา",
    ins: "INS",

    // Settings Dialog
    settingsTitle: "การตั้งค่า (Preferences)",
    appearance: "รูปลักษณ์และหน้าตา",
    theme: "ธีมหน้าต่าง",
    themeSystem: "ตามระบบ",
    themeDark: "มืด (Dark)",
    themeLight: "สว่าง (Light)",
    uiLanguage: "ภาษาของโปรแกรม (UI Language)",
    font: "แบบอักษร",
    fontSize: "ขนาดตัวอักษร",
    editorOptions: "ตัวเลือกตัวแก้ไขข้อความ",
    tabSize: "ระยะแท็บ (Tab size)",
    indentWithTabs: "เยื้องด้วย Tab แทนการเว้นวรรค",
    lineNumbers: "แสดงเลขบรรทัด",
    bracketMatching: "จับคู่วงเล็บอัตโนมัติ",
    autoIndent: "จัดย่อหน้าอัตโนมัติเมื่อขึ้นบรรทัดใหม่",
    behavior: "พฤติกรรมการทำงาน",
    restoreSession: "เปิดแท็บเดิมที่ค้างไว้เมื่อเข้าโปรแกรม",
    crashRecovery: "สำรองไฟล์ที่ยังไม่เซฟอัตโนมัติ (กู้คืนเมื่อคอมดับ)",
    autoSave: "บันทึกไฟล์อัตโนมัติ",
    lineEndings: "รูปแบบการขึ้นบรรทัดใหม่เริ่มต้น",
    closeButton: "ปิดหน้าต่าง",
  },
} as const;

export function useI18n(lang: Locale = "en") {
  return translations[lang] || translations.en;
}
