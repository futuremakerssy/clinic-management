export const AR_DAYS = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
]
export const AR_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
]

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

export const STATUS_LABELS: Record<string, string> = {
  scheduled: "محجوز",
  completed: "مكتمل",
  cancelled: "ملغى",
  "no-show": "لم يحضر",
}

export const STATUS_CLASSES: Record<string, string> = {
  scheduled: "badge-scheduled",
  completed: "badge-completed",
  cancelled: "badge-cancelled",
  "no-show": "badge-no-show",
}

export const GENDER_LABELS: Record<string, string> = {
  male: "ذكر",
  female: "أنثى",
}

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]

export const SPECIALTIES = [
  "طب عام",
  "طب الأطفال",
  "طب الأسنان",
  "طب العيون",
  "جراحة عامة",
  "طب القلب",
  "طب العظام",
  "أمراض جلدية",
  "أمراض نساء وتوليد",
  "طب الأنف والأذن والحنجرة",
  "طب الجهاز الهضمي",
  "طب الأعصاب",
  "طب نفسي",
  "أخرى",
]

export function printContent(html: string, title: string) {
  const w = window.open("", "_blank")
  if (!w) return
  w.document.write(`
    <html dir="rtl">
    <head>
      <title>${title}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 20px; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>${html}</body>
    </html>
  `)
  w.document.close()
  setTimeout(() => {
    w.print()
    w.close()
  }, 500)
}

/**
 * Normalizes Eastern Arabic/Arabic-Indic numerals (٠-٩ and ۰-۹) to standard Western digits (0-9)
 * and trims whitespace.
 */
export function normalizeDigits(str?: string | null): string {
  if (!str) return ""
  return String(str)
    .trim()
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 1776))
}
