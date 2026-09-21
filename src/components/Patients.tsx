import { useState, useEffect, useCallback } from "react"
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Eye,
  Phone,
  Calendar,
  ChevronLeft,
  X,
  AlertTriangle,
} from "lucide-react"
import {
  patientStore,
  appointmentStore,
  visitStore,
  settingsStore,
} from "../lib/storage"
import {
  BLOOD_TYPES,
  GENDER_LABELS,
  STATUS_LABELS,
  STATUS_CLASSES,
  formatDate,
  todayISO,
} from "../lib/utils"
import type { Patient, View } from "../types"

interface Props {
  onNavigate?: (v: View, extra?: unknown) => void
  refresh: number
  onRefresh: () => void
}

const EMPTY: Omit<Patient, "id" | "createdAt"> = {
  name: "",
  phone: "",
  age: 0,
  gender: "male",
  bloodType: "",
  address: "",
  notes: "",
}

export default function Patients({ refresh, onRefresh }: Props) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [query, setQuery] = useState("")
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Patient | null>(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [detailId, setDetailId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = useCallback(() => setPatients(patientStore.getAll()), [])

  useEffect(() => {
    load()
  }, [load, refresh])

  const filtered = query ? patientStore.search(query) : patients

  function openAdd() {
    setForm({ ...EMPTY })
    setEditTarget(null)
    setModalOpen(true)
  }
  function openEdit(p: Patient) {
    setForm({
      name: p.name,
      phone: p.phone,
      age: p.age,
      gender: p.gender,
      bloodType: p.bloodType ?? "",
      address: p.address ?? "",
      notes: p.notes ?? "",
    })
    setEditTarget(p)
    setModalOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editTarget) {
      patientStore.update(editTarget.id, form)
    } else {
      patientStore.add(form)
    }
    setModalOpen(false)
    load()
    onRefresh()
  }

  function handleDelete(id: string) {
    patientStore.delete(id)
    setConfirmDelete(null)
    setDetailId(null)
    load()
    onRefresh()
  }

  const detail = detailId ? patients.find((p) => p.id === detailId) : null
  const detailAppts = detail ? appointmentStore.getByPatient(detail.id) : []
  const detailVisits = detail ? visitStore.getByPatient(detail.id) : []

  return (
    <div className="flex h-full">
      {/* List pane */}
      <div
        className={`flex flex-col flex-1 ${
          detail ? "border-l border-slate-200" : ""
        }`}
      >
        {/* Toolbar */}
        <div className="p-6 pb-4 border-b border-slate-100 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-800">المرضى</h1>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
            >
              <Plus size={16} /> إضافة مريض
            </button>
          </div>
          <div className="relative">
            <Search
              size={16}
              className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف..."
              className="w-full pr-10 pl-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-white"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-24 text-center text-slate-400">
              <Search size={40} className="mx-auto mb-3 opacity-30" />
              <p>{query ? "لا نتائج للبحث" : "لا يوجد مرضى بعد"}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-right font-semibold text-slate-600">
                    الاسم
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">
                    الهاتف
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">
                    العمر
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">
                    الجنس
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">
                    فصيلة الدم
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">
                    تاريخ التسجيل
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                      detailId === p.id ? "bg-blue-50" : ""
                    }`}
                    onClick={() => setDetailId(p.id === detailId ? null : p.id)}
                  >
                    <td className="px-6 py-3.5 font-medium text-slate-800">
                      {p.name}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 ltr">
                      {p.phone}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{p.age} سنة</td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {GENDER_LABELS[p.gender]}
                    </td>
                    <td className="px-4 py-3.5">
                      {p.bloodType && (
                        <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-xs font-medium">
                          {p.bloodType}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">
                      {formatDate(p.createdAt)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div
                        className="flex items-center gap-1 justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() =>
                            setDetailId(p.id === detailId ? null : p.id)
                          }
                          className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(p.id)}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail pane */}
      {detail && (
        <div className="w-96 flex flex-col border-r border-slate-200 bg-white overflow-y-auto">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">ملف المريض</h2>
            <button
              onClick={() => setDetailId(null)}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
            >
              <X size={16} />
            </button>
          </div>

          {/* Patient info */}
          <div className="p-5 space-y-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
                {detail.name.charAt(0)}
              </div>
              <div>
                <div className="font-bold text-slate-800">{detail.name}</div>
                <div className="text-sm text-slate-500 flex items-center gap-1">
                  <Phone size={12} />
                  {detail.phone}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <Kv label="العمر" value={`${detail.age} سنة`} />
              <Kv label="الجنس" value={GENDER_LABELS[detail.gender]} />
              <Kv label="الدم" value={detail.bloodType || "—"} />
            </div>
            {detail.address && <Kv label="العنوان" value={detail.address} />}
            {detail.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                <strong>ملاحظات: </strong>
                {detail.notes}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => openEdit(detail)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Edit2 size={13} /> تعديل
              </button>
              <button
                onClick={() => setConfirmDelete(detail.id)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 border border-red-200 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Visits */}
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
              <Calendar size={14} /> سجل الزيارات ({detailVisits.length})
            </h3>
            {detailVisits.length === 0 ? (
              <p className="text-xs text-slate-400">لا توجد زيارات</p>
            ) : (
              <div className="space-y-2">
                {detailVisits
                  .slice()
                  .reverse()
                  .map((v) => (
                    <div
                      key={v.id}
                      className="bg-slate-50 rounded-xl p-3 text-xs space-y-1"
                    >
                      <div className="flex justify-between">
                        <span className="font-medium text-slate-700">
                          {formatDate(v.date)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full ${
                            v.paid
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {v.paid ? "مدفوع" : "غير مدفوع"} · {v.amount}{" "}
                          {settingsStore.get().currency || "$"}
                        </span>
                      </div>
                      {v.diagnosis && (
                        <div>
                          <span className="text-slate-500">التشخيص: </span>
                          {v.diagnosis}
                        </div>
                      )}
                      {v.treatment && (
                        <div>
                          <span className="text-slate-500">العلاج: </span>
                          {v.treatment}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Appointments */}
          <div className="p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              المواعيد ({detailAppts.length})
            </h3>
            {detailAppts.length === 0 ? (
              <p className="text-xs text-slate-400">لا توجد مواعيد</p>
            ) : (
              <div className="space-y-2">
                {detailAppts
                  .slice()
                  .reverse()
                  .map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 text-xs"
                    >
                      <span className="text-slate-700">
                        {a.date} · {a.time}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full ${STATUS_CLASSES[a.status]}`}
                      >
                        {STATUS_LABELS[a.status]}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {modalOpen && (
        <Modal
          title={editTarget ? "تعديل بيانات المريض" : "إضافة مريض جديد"}
          onClose={() => setModalOpen(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">الاسم الكامل *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="input"
                  placeholder="اسم المريض"
                />
              </div>
              <div>
                <label className="label">رقم الهاتف *</label>
                <input
                  required
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  className="input"
                  placeholder="05xxxxxxxx"
                />
              </div>
              <div>
                <label className="label">العمر *</label>
                <input
                  required
                  type="number"
                  min={0}
                  max={150}
                  value={form.age || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, age: Number(e.target.value) }))
                  }
                  className="input"
                  placeholder="السنة"
                />
              </div>
              <div>
                <label className="label">الجنس</label>
                <select
                  value={form.gender}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      gender: e.target.value as "male" | "female",
                    }))
                  }
                  className="input"
                >
                  <option value="male">ذكر</option>
                  <option value="female">أنثى</option>
                </select>
              </div>
              <div>
                <label className="label">فصيلة الدم</label>
                <select
                  value={form.bloodType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, bloodType: e.target.value }))
                  }
                  className="input"
                >
                  <option value="">— غير محدد</option>
                  {BLOOD_TYPES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">العنوان</label>
                <input
                  value={form.address}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, address: e.target.value }))
                  }
                  className="input"
                  placeholder="المدينة - الحي"
                />
              </div>
              <div className="col-span-2">
                <label className="label">ملاحظات طبية</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  className="input resize-none"
                  placeholder="أمراض مزمنة، حساسية دواء، ملاحظات أخرى..."
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
              >
                {editTarget ? "حفظ التعديلات" : "إضافة المريض"}
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
            <p className="text-slate-700">
              هل أنت متأكد من حذف هذا المريض؟ لن يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium"
              >
                نعم، احذف
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors"
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

function Kv({ label, value }: { label: string value: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-2.5 text-xs">
      <div className="text-slate-400 mb-0.5">{label}</div>
      <div className="font-medium text-slate-700">{value}</div>
    </div>
  )
}

export function Modal({
  title,
  onClose,
  children,
  small,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  small?: boolean
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-xl w-full ${
          small ? "max-w-sm" : "max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
