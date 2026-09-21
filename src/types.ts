export interface Patient {
  id: string
  name: string
  phone: string
  age: number
  gender: "male" | "female"
  bloodType?: string
  address?: string
  notes?: string
  createdAt: string
}

export interface DoctorSchedule {
  day: number // 0=Sunday … 6=Saturday
  startTime: string
  endTime: string
}

export const DOCTOR_COLORS = [
  "#2563eb",
  "#0d9488",
  "#7c3aed",
  "#dc2626",
  "#d97706",
  "#059669",
  "#db2777",
  "#0891b2",
]

export interface Doctor {
  id: string
  name: string
  specialty: string
  phone: string
  schedule: DoctorSchedule[]
  color: string
  notes?: string
}

export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no-show"

export interface Appointment {
  id: string
  patientId: string
  doctorId: string
  date: string // "YYYY-MM-DD"
  time: string // "HH:MM"
  status: AppointmentStatus
  notes?: string
  createdAt: string
}

export interface Visit {
  id: string
  patientId: string
  doctorId: string
  appointmentId?: string
  date: string
  diagnosis?: string
  treatment?: string
  amount: number
  paid: boolean
  createdAt: string
}

export interface ClinicSettings {
  clinicName: string
  doctorName: string
  phone: string
  address: string
  appointmentDuration: number // minutes
  reminderMinutes: number
  currency: string
  securityPin?: string
}

export interface CurrencyOption {
  code: string
  name: string
  symbol: string
}

export const POPULAR_CURRENCIES: CurrencyOption[] = [
  { code: "USD", name: "دولار أمريكي", symbol: "$" },
  { code: "EGP", name: "جنيه مصري", symbol: "ج.م" },
  { code: "SYP", name: "ليرة سورية", symbol: "ل.س" },
  { code: "SAR", name: "ريال سعودي", symbol: "ر.س" },
  { code: "AED", name: "درهم إماراتي", symbol: "د.إ" },
  { code: "JOD", name: "دينار أردني", symbol: "د.أ" },
  { code: "KWD", name: "دينار كويتي", symbol: "د.ك" },
  { code: "IQD", name: "دينار عراقي", symbol: "د.ع" },
  { code: "EUR", name: "يورو", symbol: "€" },
  { code: "TRY", name: "ليرة تركية", symbol: "₺" },
]

export type View = "dashboard" | "appointments" | "patients" | "doctors" | "reports" | "billing" | "settings" | "license"

// ── License & Subscription Types ───────────────────────────────────────────────
export type SubscriptionStatus = "ACTIVE" | "EXPIRED" | "SUSPENDED" | "REVOKED" | "TRIAL"
export type SubscriptionPlan = "monthly" | "yearly" | "trial"

export interface LicenseDevice {
  id: string
  licenseId: string
  deviceId: string
  deviceName: string
  activatedAt: string
  lastSeenAt: string
  isActive: boolean
}

export interface LicenseRecord {
  id: string
  licenseKey: string
  planType: SubscriptionPlan
  maxDevices: number
  status: SubscriptionStatus
  createdAt: string
  startsAt: string
  expiresAt: string
  notes?: string
  devices?: LicenseDevice[]
}

export interface ActivationTokenPayload {
  licenseId: string
  licenseKey: string
  deviceId: string
  plan: SubscriptionPlan
  status: SubscriptionStatus
  startsAt: string
  expiresAt: string
  issuedAt: number // epoch ms
  gracePeriodDays: number
}

export interface ActivationToken {
  payload: ActivationTokenPayload
  signature: string // base64 ECDSA signature
}

export interface LocalLicenseState {
  licenseKey: string | null
  token: ActivationToken | null
  status: SubscriptionStatus
  plan: SubscriptionPlan | null
  expiresAt: string | null
  startsAt: string | null
  lastVerifiedTimestamp: number // epoch ms
  lastKnownSystemTime: number // epoch ms
  deviceId: string
  deviceName: string
  offlineGraceDays: number
  isOfflineGraceValid: boolean
  isExpired: boolean
  clockTampered: boolean
  publicKeyJwk?: JsonWebKey
  lastErrorMessage?: string
}
