import type {
  Patient,
  Doctor,
  Appointment,
  Visit,
  ClinicSettings,
} from "../types"

// ── Keys ──────────────────────────────────────────────────────────────────────
const KEYS = {
  patients: "clinic_patients",
  doctors: "clinic_doctors",
  appointments: "clinic_appointments",
  visits: "clinic_visits",
  settings: "clinic_settings",
} as const

// ── Generic helpers ───────────────────────────────────────────────────────────
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function save<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ── Patients ──────────────────────────────────────────────────────────────────
export const patientStore = {
  getAll: () => load<Patient[]>(KEYS.patients, []),
  get: (id: string) => patientStore.getAll().find((p) => p.id === id),
  add: (data: Omit<Patient, "id" | "createdAt">) => {
    const patient: Patient = {
      ...data,
      id: uid(),
      createdAt: new Date().toISOString(),
    }
    save(KEYS.patients, [...patientStore.getAll(), patient])
    return patient
  },
  update: (id: string, data: Partial<Patient>) => {
    save(
      KEYS.patients,
      patientStore.getAll().map((p) => (p.id === id ? { ...p, ...data } : p)),
    )
  },
  delete: (id: string) => {
    save(
      KEYS.patients,
      patientStore.getAll().filter((p) => p.id !== id),
    )
  },
  search: (q: string) => {
    const lower = q.toLowerCase()
    return patientStore
      .getAll()
      .filter(
        (p) =>
          p.name.toLowerCase().includes(lower) ||
          p.phone.includes(q) ||
          p.id.includes(q),
      )
  },
}

// ── Doctors ───────────────────────────────────────────────────────────────────
export const doctorStore = {
  getAll: () => {
    const list = load<Doctor[]>(KEYS.doctors, [])
    return list.map((d) => ({
      ...d,
      schedule: Array.isArray(d.schedule) ? d.schedule : [],
      color: d.color || "#2563eb",
      specialty: d.specialty || "طبيب عام",
      phone: d.phone || "",
    }))
  },
  get: (id: string) => doctorStore.getAll().find((d) => d.id === id),
  add: (data: Omit<Doctor, "id">) => {
    const doctor: Doctor = {
      ...data,
      id: uid(),
      schedule: Array.isArray(data.schedule) ? data.schedule : [],
      color: data.color || "#2563eb",
      specialty: data.specialty || "طبيب عام",
      phone: data.phone || "",
    }
    save(KEYS.doctors, [...doctorStore.getAll(), doctor])
    return doctor
  },
  update: (id: string, data: Partial<Doctor>) => {
    save(
      KEYS.doctors,
      doctorStore.getAll().map((d) => (d.id === id ? { ...d, ...data } : d)),
    )
  },
  delete: (id: string) => {
    save(
      KEYS.doctors,
      doctorStore.getAll().filter((d) => d.id !== id),
    )
  },
}

// ── Appointments ──────────────────────────────────────────────────────────────
export const appointmentStore = {
  getAll: () => load<Appointment[]>(KEYS.appointments, []),
  get: (id: string) => appointmentStore.getAll().find((a) => a.id === id),
  getByDate: (date: string) =>
    appointmentStore.getAll().filter((a) => a.date === date),
  getByPatient: (pid: string) =>
    appointmentStore.getAll().filter((a) => a.patientId === pid),
  add: (data: Omit<Appointment, "id" | "createdAt">) => {
    const appt: Appointment = {
      ...data,
      id: uid(),
      createdAt: new Date().toISOString(),
    }
    save(KEYS.appointments, [...appointmentStore.getAll(), appt])
    return appt
  },
  update: (id: string, data: Partial<Appointment>) => {
    save(
      KEYS.appointments,
      appointmentStore
        .getAll()
        .map((a) => (a.id === id ? { ...a, ...data } : a)),
    )
  },
  delete: (id: string) => {
    save(
      KEYS.appointments,
      appointmentStore.getAll().filter((a) => a.id !== id),
    )
  },
}

// ── Visits ────────────────────────────────────────────────────────────────────
export const visitStore = {
  getAll: () => load<Visit[]>(KEYS.visits, []),
  getByPatient: (pid: string) =>
    visitStore.getAll().filter((v) => v.patientId === pid),
  add: (data: Omit<Visit, "id" | "createdAt">) => {
    const visit: Visit = {
      ...data,
      id: uid(),
      createdAt: new Date().toISOString(),
    }
    save(KEYS.visits, [...visitStore.getAll(), visit])
    return visit
  },
  update: (id: string, data: Partial<Visit>) => {
    save(
      KEYS.visits,
      visitStore.getAll().map((v) => (v.id === id ? { ...v, ...data } : v)),
    )
  },
  delete: (id: string) => {
    save(
      KEYS.visits,
      visitStore.getAll().filter((v) => v.id !== id),
    )
  },
}

// ── Settings ──────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: ClinicSettings = {
  clinicName: "عيادة الرعاية الطبية",
  doctorName: "",
  phone: "",
  address: "",
  appointmentDuration: 30,
  reminderMinutes: 30,
  currency: "$",
  securityPin: "1234",
}

export const settingsStore = {
  get: () => {
    const s = load<ClinicSettings>(KEYS.settings, DEFAULT_SETTINGS)
    if (!s.securityPin || !s.securityPin.trim()) {
      s.securityPin = "1234"
    }
    return s
  },
  save: (s: ClinicSettings) => save(KEYS.settings, s),
}

export function resetSecurityPin(): void {
  const current = settingsStore.get()
  current.securityPin = "1234"
  settingsStore.save(current)
}

// ── Backup / Restore ──────────────────────────────────────────────────────────
export function exportBackup(): string {
  return JSON.stringify(
    {
      patients: patientStore.getAll(),
      doctors: doctorStore.getAll(),
      appointments: appointmentStore.getAll(),
      visits: visitStore.getAll(),
      settings: settingsStore.get(),
      exportedAt: new Date().toISOString(),
      version: "1.0",
    },
    null,
    2,
  )
}

export function importBackup(json: string): void {
  const data = JSON.parse(json)
  if (data.patients) save(KEYS.patients, data.patients)
  if (data.doctors) save(KEYS.doctors, data.doctors)
  if (data.appointments) save(KEYS.appointments, data.appointments)
  if (data.visits) save(KEYS.visits, data.visits)
  if (data.settings) save(KEYS.settings, data.settings)
}

// ── Wipe all demo data & start fresh ──────────────────────────────────────────
export function wipeAllDemoData(): void {
  save(KEYS.patients, [])
  save(KEYS.doctors, [])
  save(KEYS.appointments, [])
  save(KEYS.visits, [])
  localStorage.setItem("clinic_demo_cleaned_v2", "true")
}

export function seedDemoData(): void {
  // Ensure all initial demo mock data is cleaned out cleanly for production use
  const cleanKey = "clinic_demo_cleaned_v2"
  if (!localStorage.getItem(cleanKey)) {
    wipeAllDemoData()
  }

  // Auto-reset security PIN to 1234 so user is never locked out
  const pinResetKey = "clinic_pin_reset_v3"
  if (!localStorage.getItem(pinResetKey)) {
    resetSecurityPin()
    localStorage.setItem(pinResetKey, "true")
  }
}
