import type { InstallerLocale, InstallProgress } from "./types";

export interface InstallerCopy {
  titlebarInstall: string;
  titlebarUninstall: string;
  minimizeLabel: string;
  closeLabel: string;
  switchLangLabel: string;
  installHeroTitle: string;
  uninstallHeroTitle: string;
  updatingBadge: (ver: string) => string;
  installSubtitle: string;
  uninstallSubtitle: string;
  installDestination: string;
  customize: string;
  spaceNote: (mb: number) => string;
  perUserTag: string;
  shortcutsNote: string;
  folderPath: string;
  browse: string;
  startMenuShortcut: string;
  desktopShortcut: string;
  contextMenuOption: string;
  fileAssocOption: string;
  uninstallDirLabel: string;
  uninstallBullets: readonly [string, string, string];
  stepLabels: Record<InstallProgress["stage"], string>;
  preparingMessage: string;
  closingMessage: string;
  doneInstallTitle: string;
  doneInstallDesc: string;
  doneUninstallTitle: string;
  doneUninstallDesc: string;
  errorInstallTitle: string;
  errorUninstallTitle: string;
  footerLicense: string;
  installButton: string;
  updateButton: string;
  cancelButton: string;
  uninstallButton: string;
  keepWindowOpen: string;
  installingStatus: string;
  removingStatus: string;
  closeButton: string;
  launchButton: string;
  finishButton: string;
  backButton: string;
  retryButton: string;
  installSteps: readonly { id: InstallProgress["stage"]; label: string }[];
  uninstallSteps: readonly { id: InstallProgress["stage"]; label: string }[];
}

export function detectInstallerLocale(): InstallerLocale {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("th") ? "th" : "en";
}

export const INSTALLER_COPY: Record<InstallerLocale, InstallerCopy> = {
  en: {
    titlebarInstall: "RustPad Setup",
    titlebarUninstall: "RustPad Uninstaller",
    minimizeLabel: "Minimize",
    closeLabel: "Close",
    switchLangLabel: "Switch language",
    installHeroTitle: "RustPad",
    uninstallHeroTitle: "Uninstall RustPad",
    updatingBadge: (ver) => `Updating v${ver}`,
    installSubtitle: "Fast, native dark-mode text & code editor built with Rust.",
    uninstallSubtitle:
      "Remove RustPad, shortcuts, and Windows integration from your account.",
    installDestination: "Install destination",
    customize: "Customize",
    spaceNote: (mb) => `~${mb} MB space`,
    perUserTag: "Current user (no UAC)",
    shortcutsNote: "Shortcuts & Explorer menu",
    folderPath: "Folder path",
    browse: "Browse",
    startMenuShortcut: "Start Menu shortcut",
    desktopShortcut: "Desktop shortcut",
    contextMenuOption: "Open with RustPad menu",
    fileAssocOption: "Associate 18 file types",
    uninstallDirLabel: "Installation directory",
    uninstallBullets: [
      "Remove RustPad application files",
      "Delete Start Menu & Desktop shortcuts",
      "Remove Explorer context menu & file associations",
    ],
    stepLabels: {
      prepare: "Preparing install folder...",
      extract: "Extracting RustPad...",
      shortcuts: "Updating Windows shortcuts...",
      registry: "Configuring Windows integration...",
      cleanup: "Removing shortcuts and application files...",
      done: "Completed.",
    },
    preparingMessage: "Preparing install folder...",
    closingMessage: "Closing RustPad if open...",
    doneInstallTitle: "RustPad is ready",
    doneInstallDesc: "Installed and registered for your Windows account.",
    doneUninstallTitle: "RustPad has been removed",
    doneUninstallDesc:
      "Shortcuts, registry keys, and application files were cleaned up.",
    errorInstallTitle: "Installation failed",
    errorUninstallTitle: "Uninstall failed",
    footerLicense: "Per-user install · MIT License",
    installButton: "Install RustPad",
    updateButton: "Update RustPad",
    cancelButton: "Cancel",
    uninstallButton: "Uninstall RustPad",
    keepWindowOpen: "Please keep this window open...",
    installingStatus: "Installing...",
    removingStatus: "Removing...",
    closeButton: "Close",
    launchButton: "Launch RustPad",
    finishButton: "Finish",
    backButton: "Back",
    retryButton: "Try Again",
    installSteps: [
      { id: "prepare", label: "Prepare install folder" },
      { id: "extract", label: "Extract RustPad executable" },
      { id: "shortcuts", label: "Create Start Menu & Desktop shortcuts" },
      { id: "registry", label: "Register Explorer & file associations" },
    ],
    uninstallSteps: [
      { id: "prepare", label: "Close running RustPad instances" },
      { id: "cleanup", label: "Remove shortcuts & program files" },
      { id: "registry", label: "Clean Windows registry & associations" },
    ],
  },
  th: {
    titlebarInstall: "ติดตั้ง RustPad",
    titlebarUninstall: "ถอนการติดตั้ง RustPad",
    minimizeLabel: "ย่อหน้าต่าง",
    closeLabel: "ปิด",
    switchLangLabel: "สลับภาษา",
    installHeroTitle: "RustPad",
    uninstallHeroTitle: "ถอนการติดตั้ง RustPad",
    updatingBadge: (ver) => `อัปเดตจาก v${ver}`,
    installSubtitle: "โปรแกรมแก้ไขข้อความและโค้ดโหมดมืดที่เร็วและเบา สร้างด้วย Rust",
    uninstallSubtitle: "ลบ RustPad, ชอร์ตคัต และการเชื่อมต่อกับ Windows ออกจากบัญชีของคุณ",
    installDestination: "โฟลเดอร์สำหรับติดตั้ง",
    customize: "กำหนดเอง",
    spaceNote: (mb) => `ใช้พื้นที่ ~${mb} MB`,
    perUserTag: "ผู้ใช้ปัจจุบัน (ไม่ต้องขอสิทธิ์ Admin)",
    shortcutsNote: "ชอร์ตคัตและเมนูคลิกขวา",
    folderPath: "ตำแหน่งโฟลเดอร์",
    browse: "เลือก...",
    startMenuShortcut: "ชอร์ตคัต Start Menu",
    desktopShortcut: "ชอร์ตคัตหน้าจอ Desktop",
    contextMenuOption: "เมนูคลิกขวา Open with RustPad",
    fileAssocOption: "ผูกนามสกุลไฟล์โค้ด 18 ชนิด",
    uninstallDirLabel: "โฟลเดอร์ที่ติดตั้งอยู่",
    uninstallBullets: [
      "ลบไฟล์โปรแกรม RustPad ออกจากเครื่อง",
      "ลบชอร์ตคัตใน Start Menu และ Desktop",
      "ล้างเมนูคลิกขวา Explorer และการผูกนามสกุลไฟล์",
    ],
    stepLabels: {
      prepare: "กำลังเตรียมโฟลเดอร์ติดตั้ง...",
      extract: "กำลังแตกไฟล์ RustPad...",
      shortcuts: "กำลังสร้างชอร์ตคัต Windows...",
      registry: "กำลังตั้งค่า Registry และเมนูคลิกขวา...",
      cleanup: "กำลังลบชอร์ตคัตและไฟล์โปรแกรม...",
      done: "เสร็จสมบูรณ์",
    },
    preparingMessage: "กำลังเตรียมโฟลเดอร์ติดตั้ง...",
    closingMessage: "กำลังปิด RustPad ที่เปิดค้างไว้...",
    doneInstallTitle: "ติดตั้ง RustPad เรียบร้อยแล้ว",
    doneInstallDesc: "พร้อมใช้งานสำหรับบัญชี Windows ของคุณแล้ว",
    doneUninstallTitle: "ถอนการติดตั้ง RustPad แล้ว",
    doneUninstallDesc: "ลบชอร์ตคัต, Registry และไฟล์โปรแกรมทั้งหมดเรียบร้อย",
    errorInstallTitle: "การติดตั้งล้มเหลว",
    errorUninstallTitle: "การถอนการติดตั้งล้มเหลว",
    footerLicense: "ติดตั้งเฉพาะผู้ใช้ · MIT License",
    installButton: "ติดตั้ง RustPad",
    updateButton: "อัปเดต RustPad",
    cancelButton: "ยกเลิก",
    uninstallButton: "ถอนการติดตั้ง",
    keepWindowOpen: "กรุณาเปิดหน้าต่างนี้ไว้สักครู่...",
    installingStatus: "กำลังติดตั้ง...",
    removingStatus: "กำลังถอนการติดตั้ง...",
    closeButton: "ปิด",
    launchButton: "เปิด RustPad เลย",
    finishButton: "เสร็จสิ้น",
    backButton: "ย้อนกลับ",
    retryButton: "ลองใหม่อีกครั้ง",
    installSteps: [
      { id: "prepare", label: "เตรียมโฟลเดอร์ติดตั้ง" },
      { id: "extract", label: "แตกไฟล์โปรแกรม RustPad" },
      { id: "shortcuts", label: "สร้างชอร์ตคัต Start Menu และ Desktop" },
      { id: "registry", label: "ลงทะเบียน Explorer และการผูกไฟล์" },
    ],
    uninstallSteps: [
      { id: "prepare", label: "ปิดหน้าต่าง RustPad ที่กำลังเปิดอยู่" },
      { id: "cleanup", label: "ลบชอร์ตคัตและไฟล์โปรแกรม" },
      { id: "registry", label: "ล้างค่า Registry และการผูกไฟล์" },
    ],
  },
};
