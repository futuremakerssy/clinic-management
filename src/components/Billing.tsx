import { useState, useEffect, useCallback } from "react"
import {
  Plus,
  Printer,
  CheckCircle,
  AlertCircle,
  Search,
  DollarSign,
  X,
} from "lucide-react"
import {
  visitStore,
  patientStore,
  doctorStore,
  settingsStore,
} from "../lib/storage"
import { formatDate, printContent, todayISO } from "../lib/utils"
import type { Visit, Patient, Doctor } from "../types"
import { Modal } from "./Patients"

interface Props {
  refresh: number
  onRefresh: () => void
}

export default function Billing({ refresh, onRefresh }: Props) {
  const [visits, setVisits] = useState<Visit[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "paid" | "unpaid">("all")
  const [addModal, setAddModal] = useState(false)
  const [form, setForm] = useState({
    patientId: "",
    doctorId: "",
    date: todayISO(),
    diagnosis: "",
    treatment: "",
    amount: "",
    paid: false,
  })

  const load = useCallback(() => {
    setVisits(visitStore.getAll())
    setPatients(patientStore.getAll())
    setDoctors(doctorStore.getAll())
  }, [])

  useEffect(() => {
    load()
  }, [load, refresh])

  const getPatient = (id: string) => patients.find((p) => p.id === id)
  const getDoctor = (id: string) => doctors.find((d) => d.id === id)

  const filtered = visits
    .filter((v) =>
      filter === "all" ? true : filter === "paid" ? v.paid : !v.paid,
    )
    .filter((v) => {
      if (!query) return true
      const p = getPatient(v.patientId)
      return (
        p?.name.toLowerCase().includes(query.toLowerCase()) ||
        p?.phone.includes(query)
      )
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const totalRevenue = visits
    .filter((v) => v.paid)
    .reduce((s, v) => s + v.amount, 0)
  const totalUnpaid = visits
    .filter((v) => !v.paid)
    .reduce((s, v) => s + v.amount, 0)
  const settings = settingsStore.get()

  function togglePaid(id: string, paid: boolean) {
    visitStore.update(id, { paid })
    load()
    onRefresh()
  }

  function handleAddVisit(e: React.FormEvent) {
    e.preventDefault()
    visitStore.add({
      patientId: form.patientId,
      doctorId: form.doctorId,
      date: form.date,
      diagnosis: form.diagnosis,
      treatment: form.treatment,
      amount: Number(form.amount),
      paid: form.paid,
    })
    setAddModal(false)
    load()
    onRefresh()
  }

  function printReceipt(v: Visit) {
    const patient = getPatient(v.patientId)
    const doctor = getDoctor(v.doctorId)
    const html = `
      <div style="max-width:400px;margin:auto;border:2px solid #333;padding:20px;font-family:'Cairo',sans-serif">
        <div style="text-align:center;border-bottom:1px solid #ccc;padding-bottom:10px;margin-bottom:10px">
          <h2 style="margin:0">${settings.clinicName}</h2>
          ${
            settings.phone
              ? `<p style="margin:4px 0;color:#666">${settings.phone}</p>`
              : ""
          }
          ${
            settings.address
              ? `<p style="margin:4px 0;color:#666">${settings.address}</p>`
              : ""
          }
        </div>
        <table style="width:100%">
          <tr><td><strong>المريض:</strong></td><td>${patient?.name ?? "—"}</td></tr>
          <tr><td><strong>الطبيب:</strong></td><td>${doctor?.name ?? "—"}</td></tr>
          <tr><td><strong>التاريخ:</strong></td><td>${formatDate(v.date)}</td></tr>
          ${
            v.diagnosis
              ? `<tr><td><strong>التشخيص:</strong></td><td>${v.diagnosis}</td></tr>`
              : ""
          }
          ${
            v.treatment
              ? `<tr><td><strong>العلاج:</strong></td><td>${v.treatment}</td></tr>`
              : ""
          }
        </table>
        <div style="border-top:2px solid #333;margin-top:15px;padding-top:10px;text-align:center">
          <h3 style="margin:0">المبلغ المستحق: ${v.amount} ${settings.currency}</h3>
          <p style="margin:5px 0;color:${v.paid ? "green" : "red"}">${
            v.paid ? "✓ مدفوع" : "✗ غير مدفوع"
          }</p>
        </div>
        <p style="text-align:center;color:#999;font-size:11px;margin-top:15px">شكراً لزيارتكم</p>
      </div>
    `
    printContent(html, "إيصال دفع")
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">
          الفواتير والمدفوعات
        </h1>
        <button
          onClick={() => {
            setForm({
              patientId: patients[0]?.id ?? "",
              doctorId: doctors[0]?.id ?? "",
              date: todayISO(),
              diagnosis: "",
              treatment: "",
              amount: "",
              paid: false,
            })
            setAddModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
        >
          <Plus size={16} /> إضافة زيارة
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
          <div className="text-emerald-600 text-sm font-medium mb-1">
            إجمالي الإيرادات
          </div>
          <div className="text-3xl font-bold text-emerald-700">
            {totalRevenue.toLocaleString()}
          </div>
          <div className="text-emerald-500 text-sm">{settings.currency}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <div className="text-red-600 text-sm font-medium mb-1">غير محصّل</div>
          <div className="text-3xl font-bold text-red-700">
            {totalUnpaid.toLocaleString()}
          </div>
          <div className="text-red-500 text-sm">{settings.currency}</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
          <div className="text-slate-600 text-sm font-medium mb-1">
            إجمالي الزيارات
          </div>
          <div className="text-3xl font-bold text-slate-700">
            {visits.length}
          </div>
          <div className="text-slate-500 text-sm">زيارة مسجلة</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={16}
            className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث بالمريض..."
            className="w-full pr-10 pl-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-white"
          />
        </div>
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
          {(["all", "paid", "unpaid"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-white shadow-sm text-slate-800"
                  : "text-slate-500"
              }`}
            >
              {f === "all" ? "الكل" : f === "paid" ? "مدفوع" : "غير مدفوع"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <DollarSign size={40} className="mx-auto mb-3 opacity-20" />
            <p>لا توجد فواتير</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 text-right font-semibold text-slate-600">
                  المريض
                </th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">
                  الطبيب
                </th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">
                  التاريخ
                </th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">
                  التشخيص
                </th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">
                  المبلغ
                </th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">
                  الحالة
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((v) => {
                const patient = getPatient(v.patientId)
                const doctor = getDoctor(v.doctorId)
                return (
                  <tr
                    key={v.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-5 py-3.5 font-medium text-slate-800">
                      {patient?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {doctor?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">
                      {formatDate(v.date)}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 max-w-[160px] truncate">
                      {v.diagnosis || "—"}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-800">
                      {v.amount} {settingsStore.get().currency}
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => togglePaid(v.id, !v.paid)}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          v.paid
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-red-100 text-red-600 hover:bg-red-200"
                        }`}
                      >
                        {v.paid ? (
                          <>
                            <CheckCircle size={12} /> مدفوع
                          </>
                        ) : (
                          <>
                            <AlertCircle size={12} /> غير مدفوع
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => printReceipt(v)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                        title="طباعة الإيصال"
                      >
                        <Printer size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add visit modal */}
      {addModal && (
        <Modal title="إضافة زيارة / فاتورة" onClose={() => setAddModal(false)}>
          <form onSubmit={handleAddVisit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">التاريخ</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, date: e.target.value }))
                  }
                  className="input"
                />
              </div>
              <div>
                <label className="label">المبلغ (ريال) *</label>
                <input
                  required
                  type="number"
                  min={0}
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  className="input"
                  placeholder="0"
                />
              </div>
              <div className="col-span-2">
                <label className="label">التشخيص</label>
                <input
                  value={form.diagnosis}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, diagnosis: e.target.value }))
                  }
                  className="input"
                  placeholder="التشخيص الطبي"
                />
              </div>
              <div className="col-span-2">
                <label className="label">العلاج</label>
                <textarea
                  rows={2}
                  value={form.treatment}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, treatment: e.target.value }))
                  }
                  className="input resize-none"
                  placeholder="الأدوية والتعليمات..."
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.paid}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, paid: e.target.checked }))
                  }
                  className="w-4 h-4 accent-blue-600"
                  id="paid-cb"
                />
                <label
                  htmlFor="paid-cb"
                  className="text-sm text-slate-700 cursor-pointer"
                >
                  تم الدفع
                </label>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium"
              >
                إضافة
              </button>
              <button
                type="button"
                onClick={() => setAddModal(false)}
                className="px-5 py-2.5 border border-slate-200 rounded-xl text-slate-700"
              >
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
