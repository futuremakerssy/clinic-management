import { useState, useEffect, useCallback } from "react"
import {
  Plus,
  Edit2,
  Trash2,
  Phone,
  X,
  AlertTriangle,
  Clock,
} from "lucide-react"
import { doctorStore } from "../lib/storage"
import { AR_DAYS, SPECIALTIES } from "../lib/utils"
import { DOCTOR_COLORS } from "../types"
import type { Doctor, DoctorSchedule } from "../types"
import { Modal } from "./Patients"

interface Props {
  refresh: number
  onRefresh: () => void
}

const EMPTY_FORM: Omit<Doctor, "id"> = {
  name: "",
  specialty: SPECIALTIES[0],
  phone: "",
  color: DOCTOR_COLORS[0],
  notes: "",
  schedule: [],
}

export default function Doctors({ refresh, onRefresh }: Props) {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Doctor | null>(null)
  const [form, setForm] = useState<Omit<Doctor, "id">>({ ...EMPTY_FORM })
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = useCallback(() => setDoctors(doctorStore.getAll()), [])
  useEffect(() => {
    load()
  }, [load, refresh])

  function openAdd() {
    setForm({
      ...EMPTY_FORM,
      schedule: [],
      color: DOCTOR_COLORS[doctors.length % DOCTOR_COLORS.length],
    })
    setEditTarget(null)
    setModalOpen(true)
  }

  function openEdit(d: Doctor) {
    setForm({
      name: d.name || "",
      specialty: d.specialty || SPECIALTIES[0],
      phone: d.phone || "",
      color: d.color || DOCTOR_COLORS[0],
      notes: d.notes ?? "",
      schedule: [...(d.schedule || [])],
    })
    setEditTarget(d)
    setModalOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editTarget) {
      doctorStore.update(editTarget.id, form)
    } else {
      doctorStore.add(form)
    }
    setModalOpen(false)
    load()
    onRefresh()
  }

  function handleDelete(id: string) {
    doctorStore.delete(id)
    setConfirmDelete(null)
    load()
    onRefresh()
  }

  function toggleDay(day: number) {
    const existing = form.schedule.find((s) => s.day === day)
    if (existing) {
      setForm((f) => ({
        ...f,
        schedule: f.schedule.filter((s) => s.day !== day),
      }))
    } else {
      setForm((f) => ({
        ...f,
        schedule: [
          ...f.schedule,
          { day, startTime: "09:00", endTime: "17:00" },
        ],
      }))
    }
  }

  function updateSchedule(
    day: number,
    field: keyof DoctorSchedule,
    value: string | number,
  ) {
    setForm((f) => ({
      ...f,
      schedule: f.schedule.map((s) =>
        s.day === day ? { ...s, [field]: value } : s,
      ),
    }))
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">الأطباء</h1>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
        >
          <Plus size={16} /> إضافة طبيب
        </button>
      </div>

      {doctors.length === 0 ? (
        <div className="py-24 text-center text-slate-400">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Plus size={24} className="text-slate-300" />
          </div>
          <p>لا يوجد أطباء بعد، أضف أول طبيب</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {doctors.map((doc) => (
            <div
              key={doc.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <div
                className="h-2"
                style={{ backgroundColor: doc.color || DOCTOR_COLORS[0] }}
              />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                      style={{ backgroundColor: doc.color || DOCTOR_COLORS[0] }}
                    >
                      {(doc.name || "طبيب")
                        .split(" ")
                        .find(
                          (w) => w !== "د." && w !== "دكتور" && w !== "دكتورة",
                        )
                        ?.charAt(0) ?? "د"}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800">
                        {doc.name || "طبيب بدون اسم"}
                      </div>
                      <div className="text-sm text-slate-500">
                        {doc.specialty || "طبيب عام"}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(doc)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(doc.id)}
                      className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {doc.phone && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
                    <Phone size={13} className="text-slate-400" />
                    {doc.phone}
                  </div>
                )}

                {/* Schedule */}
                {(doc.schedule?.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mb-2">
                      <Clock size={12} />
                      جدول الدوام
                    </div>
                    {(doc.schedule || [])
                      .sort((a, b) => a.day - b.day)
                      .map((s) => (
                        <div
                          key={s.day}
                          className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-1.5"
                        >
                          <span className="font-medium text-slate-700">
                            {AR_DAYS[s.day]}
                          </span>
                          <span className="text-slate-500">
                            {s.startTime} — {s.endTime}
                          </span>
                        </div>
                      ))}
                  </div>
                )}

                {doc.notes && (
                  <div className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-xl p-2.5">
                    {doc.notes}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <Modal
          title={editTarget ? "تعديل بيانات الطبيب" : "إضافة طبيب جديد"}
          onClose={() => setModalOpen(false)}
        >
          <form
            onSubmit={handleSubmit}
            className="space-y-4 max-h-[70vh] overflow-y-auto px-0.5"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">اسم الطبيب *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="input"
                  placeholder="د. الاسم الكامل"
                />
              </div>
              <div>
                <label className="label">التخصص *</label>
                <select
                  required
                  value={form.specialty}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, specialty: e.target.value }))
                  }
                  className="input"
                >
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">رقم الهاتف</label>
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  className="input"
                  placeholder="05xxxxxxxx"
                />
              </div>
            </div>

            {/* Color picker */}
            <div>
              <label className="label">اللون المميز</label>
              <div className="flex gap-2 flex-wrap">
                {DOCTOR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`w-8 h-8 rounded-full transition-transform ${
                      form.color === c
                        ? "ring-2 ring-offset-2 ring-slate-400 scale-110"
                        : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Schedule */}
            <div>
              <label className="label">جدول الدوام</label>
              <div className="space-y-2">
                {AR_DAYS.map((dayName, dayIdx) => {
                  const sched = form.schedule.find((s) => s.day === dayIdx)
                  return (
                    <div
                      key={dayIdx}
                      className={`rounded-xl border transition-colors overflow-hidden ${
                        sched
                          ? "border-blue-200 bg-blue-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-3 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={!!sched}
                          onChange={() => toggleDay(dayIdx)}
                          className="w-4 h-4 accent-blue-600"
                        />
                        <span className="text-sm font-medium text-slate-700 w-20">
                          {dayName}
                        </span>
                        {sched && (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="time"
                              value={sched.startTime}
                              onChange={(e) =>
                                updateSchedule(
                                  dayIdx,
                                  "startTime",
                                  e.target.value,
                                )
                              }
                              className="flex-1 text-xs border border-blue-200 rounded-lg px-2 py-1 bg-white focus:ring-1 focus:ring-blue-300"
                            />
                            <span className="text-xs text-slate-400">—</span>
                            <input
                              type="time"
                              value={sched.endTime}
                              onChange={(e) =>
                                updateSchedule(
                                  dayIdx,
                                  "endTime",
                                  e.target.value,
                                )
                              }
                              className="flex-1 text-xs border border-blue-200 rounded-lg px-2 py-1 bg-white focus:ring-1 focus:ring-blue-300"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
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
                placeholder="معلومات إضافية..."
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
              >
                {editTarget ? "حفظ التعديلات" : "إضافة الطبيب"}
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

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal title="تأكيد الحذف" onClose={() => setConfirmDelete(null)} small>
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle size={28} className="text-red-600" />
            </div>
            <p className="text-slate-700">هل تريد حذف هذا الطبيب؟</p>
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
