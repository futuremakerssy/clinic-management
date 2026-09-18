import { useState, useEffect } from "react"
import {
  Calendar,
  Users,
  UserCheck,
  TrendingUp,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react"
import {
  appointmentStore,
  patientStore,
  doctorStore,
  visitStore,
  settingsStore,
} from "../lib/storage"
import {
  AR_DAYS,
  AR_MONTHS,
  STATUS_LABELS,
  STATUS_CLASSES,
  todayISO,
} from "../lib/utils"
import type { Appointment, Patient, Doctor, View } from "../types"

interface Props {
  onNavigate: (view: View, extra?: unknown) => void
  refresh: number
}

export default function Dashboard({ onNavigate, refresh }: Props) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const today = todayISO()

  useEffect(() => {
    setAppointments(appointmentStore.getAll())
    setPatients(patientStore.getAll())
    setDoctors(doctorStore.getAll())
  }, [refresh])

  const todayAppts = appointments
    .filter((a) => a.date === today)
    .sort((a, b) => a.time.localeCompare(b.time))
  const visits = visitStore.getAll()
  const todayVisits = visits.filter((v) => v.date === today)
  const todayRevenue = todayVisits
    .filter((v) => v.paid)
    .reduce((s, v) => s + v.amount, 0)
  const scheduledToday = todayAppts.filter(
    (a) => a.status === "scheduled",
  ).length

  const now = new Date()
  const dateLabel = `${AR_DAYS[now.getDay()]}، ${now.getDate()} ${AR_MONTHS[now.getMonth()]} ${now.getFullYear()}`

  const getPatient = (id: string) => patients.find((p) => p.id === id)
  const getDoctor = (id: string) => doctors.find((d) => d.id === id)

  const stats = [
    {
      label: "مرضى اليوم",
      value: todayAppts.length,
      icon: Users,
      color: "bg-blue-50 text-blue-600",
      border: "border-blue-200",
    },
    {
      label: "مواعيد منتظرة",
      value: scheduledToday,
      icon: Clock,
      color: "bg-amber-50 text-amber-600",
      border: "border-amber-200",
    },
    {
      label: "إجمالي المرضى",
      value: patients.length,
      icon: UserCheck,
      color: "bg-teal-50 text-teal-600",
      border: "border-teal-200",
    },
    {
      label: "إيرادات اليوم",
      value: `${todayRevenue} ${settingsStore.get().currency || "$"}`,
      icon: TrendingUp,
      color: "bg-green-50 text-green-600",
      border: "border-green-200",
    },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">لوحة التحكم</h1>
          <p className="text-slate-500 text-sm mt-0.5">{dateLabel}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => onNavigate("patients")}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors text-sm font-medium"
          >
            <Search size={16} />
            بحث عن مريض
          </button>
          <button
            onClick={() => onNavigate("appointments")}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-xl text-white hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
          >
            <Plus size={16} />
            حجز جديد
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`bg-white rounded-2xl p-5 border ${s.border} shadow-sm`}
          >
            <div className={`inline-flex p-2.5 rounded-xl ${s.color} mb-3`}>
              <s.icon size={20} />
            </div>
            <div className="text-2xl font-bold text-slate-800">{s.value}</div>
            <div className="text-sm text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Today appointments */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Calendar size={18} className="text-blue-600" />
            مواعيد اليوم
          </h2>
          <button
            onClick={() => onNavigate("appointments")}
            className="text-blue-600 text-sm hover:underline"
          >
            عرض الكل
          </button>
        </div>

        {todayAppts.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Calendar size={40} className="mx-auto mb-3 opacity-30" />
            <p>لا توجد مواعيد اليوم</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {todayAppts.map((appt) => {
              const patient = getPatient(appt.patientId)
              const doctor = getDoctor(appt.doctorId)
              return (
                <div
                  key={appt.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors"
                >
                  {/* Time */}
                  <div className="text-center min-w-[60px]">
                    <span className="text-lg font-bold text-slate-700">
                      {appt.time}
                    </span>
                  </div>

                  {/* Color dot from doctor */}
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: doctor?.color ?? "#94a3b8" }}
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 truncate">
                      {patient?.name ?? "—"}
                    </div>
                    <div className="text-sm text-slate-500">
                      {doctor?.name ?? "—"} · {doctor?.specialty}
                    </div>
                  </div>

                  {/* Notes */}
                  {appt.notes && (
                    <div className="text-xs text-slate-400 max-w-[140px] truncate hidden md:block">
                      {appt.notes}
                    </div>
                  )}

                  {/* Status */}
                  <span
                    className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_CLASSES[appt.status]}`}
                  >
                    {STATUS_LABELS[appt.status]}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick doctors overview */}
      {doctors.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {doctors.slice(0, 4).map((doc) => {
            const docAppts = todayAppts.filter((a) => a.doctorId === doc.id)
            const done = docAppts.filter((a) => a.status === "completed").length
            const pending = docAppts.filter(
              (a) => a.status === "scheduled",
            ).length
            return (
              <div
                key={doc.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: doc.color }}
                  >
                    {doc.name.split(" ").slice(1, 2).join("").charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800 text-sm">
                      {doc.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {doc.specialty}
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 text-sm">
                  <div className="flex items-center gap-1.5 text-green-600">
                    <CheckCircle2 size={14} /> <span>{done} مكتمل</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-blue-600">
                    <AlertCircle size={14} /> <span>{pending} منتظر</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <XCircle size={14} />{" "}
                    <span>
                      {docAppts.filter((a) => a.status === "cancelled").length}{" "}
                      ملغى
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
