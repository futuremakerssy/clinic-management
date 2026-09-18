import { useState, useEffect, useCallback } from "react"
import {
  ChevronRight,
  ChevronLeft,
  Plus,
  X,
  Clock,
  AlertTriangle,
  Edit2,
  Trash2,
} from "lucide-react"
import {
  appointmentStore,
  patientStore,
  doctorStore,
  visitStore,
} from "../lib/storage"
import {
  AR_DAYS,
  AR_MONTHS,
  STATUS_LABELS,
  STATUS_CLASSES,
  getDaysInMonth,
  getFirstDayOfMonth,
  todayISO,
} from "../lib/utils"
import type { Appointment, Patient, Doctor, AppointmentStatus } from "../types"
import { Modal } from "./Patients"

interface Props {
  refresh: number
  onRefresh: () => void
  initialDate?: string
}

const STATUSES: AppointmentStatus[] = [
  "scheduled",
  "completed",
  "cancelled",
  "no-show",
]

const EMPTY_FORM = {
  patientId: "",
  doctorId: "",
  date: todayISO(),
  time: "09:00",
  status: "scheduled" as AppointmentStatus,
  notes: "",
}

export default function Appointments({
  refresh,
  onRefresh,
  initialDate,
}: Props) {
  const today = todayISO()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(initialDate ?? today)
  const [view, setView] = useState<"month" | "day">("month")
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Appointment | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [visitModal, setVisitModal] = useState<Appointment | null>(null)
  const [visitForm, setVisitForm] = useState({
    diagnosis: "",
    treatment: "",
    amount: "",
    paid: false,
  })

  const load = useCallback(() => {
    setAppointments(appointmentStore.getAll())
    setPatients(patientStore.getAll())
    setDoctors(doctorStore.getAll())
  }, [])

  useEffect(() => {
    load()
  }, [load, refresh])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  const getApptsByDate = (d: string) => appointments.filter((a) => a.date === d)
  const dayAppts = getApptsByDate(selectedDate).sort((a, b) =>
    a.time.localeCompare(b.time),
  )

  function prevMonth() {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1))
  }
  function nextMonth() {
    setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1))
  }

  function openAdd(date?: string) {
    setForm({
      ...EMPTY_FORM,
      date: date ?? selectedDate,
      patientId: patients[0]?.id ?? "",
      doctorId: doctors[0]?.id ?? "",
    })
    setEditTarget(null)
    setModalOpen(true)
  }

  function openEdit(appt: Appointment) {
    setForm({
      patientId: appt.patientId,
      doctorId: appt.doctorId,
      date: appt.date,
      time: appt.time,
      status: appt.status,
      notes: appt.notes ?? "",
    })
    setEditTarget(appt)
    setModalOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editTarget) {
      appointmentStore.update(editTarget.id, form)
    } else {
      appointmentStore.add(form)
    }
    setModalOpen(false)
    load()
    onRefresh()
  }

  function handleDelete(id: string) {
    appointmentStore.delete(id)
    setConfirmDelete(null)
    load()
    onRefresh()
  }

  function handleAddVisit(e: React.FormEvent) {
    e.preventDefault()
    if (!visitModal) return
    visitStore.add({
      patientId: visitModal.patientId,
      doctorId: visitModal.doctorId,
      appointmentId: visitModal.id,
      date: visitModal.date,
      diagnosis: visitForm.diagnosis,
      treatment: visitForm.treatment,
      amount: Number(visitForm.amount),
      paid: visitForm.paid,
    })
    appointmentStore.update(visitModal.id, { status: "completed" })
    setVisitModal(null)
    load()
    onRefresh()
  }

  const getPatient = (id: string) => patients.find((p) => p.id === id)
  const getDoctor = (id: string) => doctors.find((d) => d.id === id)

  const calendarDays: Array<{ date: string | null day: number }> = []
  for (let i = 0; i < firstDay; i++) calendarDays.push({ date: null, day: 0 })
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push({
      date: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      day: d,
    })
  }

  return (
    <div className="flex h-full">
      {/* Calendar section */}
      <div className="flex-1 flex flex-col border-l border-slate-200">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-800">المواعيد</h1>
            <div className="flex gap-3">
              <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                {(["month", "day"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      view === v
                        ? "bg-white shadow-sm text-slate-800"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {v === "month" ? "شهري" : "يومي"}
                  </button>
                ))}
              </div>
              <button
                onClick={() => openAdd()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
              >
                <Plus size={16} /> موعد جديد
              </button>
            </div>
          </div>

          {/* Month nav */}
          <div className="flex items-center gap-4 mt-4">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <ChevronRight size={18} />
            </button>
            <h2 className="text-lg font-bold text-slate-800 min-w-[180px] text-center">
              {AR_MONTHS[month]} {year}
            </h2>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
          </div>
        </div>

        {view === "month" ? (
          <div className="flex-1 overflow-auto p-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {AR_DAYS.map((d) => (
                <div
                  key={d}
                  className="text-center text-xs font-semibold text-slate-500 py-2"
                >
                  {d}
                </div>
              ))}
            </div>
            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((cell, i) => {
                if (!cell.date) return <div key={i} />
                const appts = getApptsByDate(cell.date)
                const isToday = cell.date === today
                const isSelected = cell.date === selectedDate
                return (
                  <div
                    key={cell.date}
                    onClick={() => {
                      setSelectedDate(cell.date!)
                      setView("day")
                    }}
                    className={`min-h-[80px] rounded-xl p-2 cursor-pointer transition-colors border ${
                      isSelected
                        ? "bg-blue-50 border-blue-300"
                        : isToday
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-slate-100 hover:border-slate-300"
                    }`}
                  >
                    <div
                      className={`text-sm font-semibold mb-1 ${
                        isToday && !isSelected
                          ? "text-white"
                          : isToday
                            ? "text-blue-700"
                            : "text-slate-700"
                      }`}
                    >
                      {cell.day}
                    </div>
                    <div className="space-y-0.5">
                      {appts.slice(0, 3).map((a) => {
                        const doc = getDoctor(a.doctorId)
                        return (
                          <div
                            key={a.id}
                            className="text-xs px-1.5 py-0.5 rounded-md text-white truncate"
                            style={{ backgroundColor: doc?.color ?? "#94a3b8" }}
                          >
                            {a.time}{" "}
                            {getPatient(a.patientId)?.name.split(" ")[0]}
                          </div>
                        )
                      })}
                      {appts.length > 3 && (
                        <div className="text-xs text-slate-400 pr-1">
                          +{appts.length - 3} أخرى
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Day detail pane */}
      <div className="w-96 flex flex-col bg-white border-r border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="font-bold text-slate-800">
              {selectedDate === today ? "اليوم" : selectedDate}
            </div>
            <div className="text-xs text-slate-500">{dayAppts.length} موعد</div>
          </div>
          <button
            onClick={() => openAdd(selectedDate)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs hover:bg-blue-700 transition-colors"
          >
            <Plus size={13} /> إضافة
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {dayAppts.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Clock size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">لا توجد مواعيد في هذا اليوم</p>
            </div>
          ) : (
            dayAppts.map((appt) => {
              const patient = getPatient(appt.patientId)
              const doctor = getDoctor(appt.doctorId)
              return (
                <div
                  key={appt.id}
                  className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden"
                >
                  <div
                    className="h-1.5 w-full"
                    style={{ backgroundColor: doctor?.color ?? "#94a3b8" }}
                  />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-800 text-sm">
                          {patient?.name}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {doctor?.name}
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_CLASSES[appt.status]}`}
                      >
                        {STATUS_LABELS[appt.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                      <Clock size={12} /> {appt.time}
                    </div>
                    {appt.notes && (
                      <div className="text-xs text-slate-500 mt-1 italic">
                        {appt.notes}
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      {appt.status === "scheduled" && (
                        <button
                          onClick={() => {
                            setVisitModal(appt)
                            setVisitForm({
                              diagnosis: "",
                              treatment: "",
                              amount: "",
                              paid: false,
                            })
                          }}
                          className="flex-1 text-xs py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                        >
                          تسجيل زيارة
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(appt)}
                        className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(appt.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Add/Edit modal */}
      {modalOpen && (
        <Modal
          title={editTarget ? "تعديل الموعد" : "إضافة موعد جديد"}
          onClose={() => setModalOpen(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">المريض *</label>
              <select
                required
                value={form.patientId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, patientId: e.target.value }))
                }
                className="input"
              >
                <option value="">— اختر مريضاً</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">الطبيب *</label>
              <select
                required
                value={form.doctorId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, doctorId: e.target.value }))
                }
                className="input"
              >
                <option value="">— اختر طبيباً</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.specialty}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">التاريخ *</label>
                <input
                  required
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, date: e.target.value }))
                  }
                  className="input"
                />
              </div>
              <div>
                <label className="label">الوقت *</label>
                <input
                  required
                  type="time"
                  value={form.time}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, time: e.target.value }))
                  }
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="label">الحالة</label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as AppointmentStatus,
                  }))
                }
                className="input"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">ملاحظات</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                className="input resize-none"
                placeholder="ملاحظات عن الموعد..."
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
              >
                {editTarget ? "حفظ التعديلات" : "حجز الموعد"}
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors"
              >
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Visit modal */}
      {visitModal && (
        <Modal title="تسجيل زيارة" onClose={() => setVisitModal(null)}>
          <form onSubmit={handleAddVisit} className="space-y-4">
            <div>
              <label className="label">التشخيص</label>
              <input
                value={visitForm.diagnosis}
                onChange={(e) =>
                  setVisitForm((f) => ({ ...f, diagnosis: e.target.value }))
                }
                className="input"
                placeholder="التشخيص الطبي"
              />
            </div>
            <div>
              <label className="label">العلاج / الوصفة</label>
              <textarea
                rows={3}
                value={visitForm.treatment}
                onChange={(e) =>
                  setVisitForm((f) => ({ ...f, treatment: e.target.value }))
                }
                className="input resize-none"
                placeholder="الأدوية والتعليمات..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">المبلغ (ريال)</label>
                <input
                  type="number"
                  min={0}
                  value={visitForm.amount}
                  onChange={(e) =>
                    setVisitForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  className="input"
                  placeholder="0"
                />
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visitForm.paid}
                    onChange={(e) =>
                      setVisitForm((f) => ({ ...f, paid: e.target.checked }))
                    }
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm text-slate-700">تم الدفع</span>
                </label>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors font-medium"
              >
                تسجيل الزيارة
              </button>
              <button
                type="button"
                onClick={() => setVisitModal(null)}
                className="px-5 py-2.5 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors"
              >
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal title="تأكيد الحذف" onClose={() => setConfirmDelete(null)} small>
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle size={28} className="text-red-600" />
            </div>
            <p className="text-slate-700">هل تريد حذف هذا الموعد؟</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium"
              >
                حذف
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-700"
              >
                إلغاء
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
