import { useState } from "react"
import {
  Building2,
  UserCheck,
  Phone,
  Stethoscope,
  ArrowLeft,
  Sparkles,
} from "lucide-react"
import { settingsStore, doctorStore } from "../lib/storage"

interface Props {
  onComplete: (data: {
    clinicName: string
    doctorName: string
    phone: string
  }) => void
}

export default function InitialSetupModal({ onComplete }: Props) {
  const currentSettings = settingsStore.get()
  const [clinicName, setClinicName] = useState(
    currentSettings.clinicName &&
      currentSettings.clinicName !== "عيادة الرعاية الطبية"
      ? currentSettings.clinicName
      : "",
  )
  const [doctorName, setDoctorName] = useState(currentSettings.doctorName || "")
  const [phone, setPhone] = useState(currentSettings.phone || "")
  const [error, setError] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!clinicName.trim()) {
      setError("يرجى إدخال اسم العيادة للمتابعة")
      return
    }
    if (!doctorName.trim()) {
      setError("يرجى إدخال اسم الطبيب المشرف")
      return
    }
    if (!phone.trim()) {
      setError("يرجى إدخال رقم هاتف العيادة للتواصل")
      return
    }

    // 1. Save to settings
    const updatedSettings = {
      ...currentSettings,
      clinicName: clinicName.trim(),
      doctorName: doctorName.trim(),
      phone: phone.trim(),
    }
    settingsStore.save(updatedSettings)

    // 2. Add as first doctor if doctors list is empty
    const doctors = doctorStore.getAll()
    if (doctors.length === 0) {
      doctorStore.add({
        name: doctorName.trim(),
        specialty: "طبيب عام / مشرف العيادة",
        phone: phone.trim(),
        color: "#2563eb",
        schedule: [],
        notes: "",
      })
    }

    // 3. Mark setup as completed in localStorage
    localStorage.setItem("clinic_setup_completed", "true")

    onComplete({
      clinicName: clinicName.trim(),
      doctorName: doctorName.trim(),
      phone: phone.trim(),
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header decoration */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-8 pt-8 pb-7 text-white text-center relative">
          <div className="w-16 h-16 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner border border-white/20">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-semibold mb-2">
            <Sparkles size={13} className="text-yellow-300" />
            <span>مرحباً بك في نظام My clinic</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            إعداد بيانات العيادة الأساسية
          </h1>
          <p className="text-blue-100 text-xs mt-1 max-w-sm mx-auto">
            يرجى إدخال معلومات العيادة الأولية لتهيئة النظام وتخصيص الفواتير
            والمواعيد باسم عيادتك.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Building2 size={14} className="text-blue-600" />
              <span>
                اسم العيادة أو المركز الطبي{" "}
                <span className="text-red-500">*</span>
              </span>
            </label>
            <input
              type="text"
              autoFocus
              value={clinicName}
              onChange={(e) => {
                setClinicName(e.target.value)
                setError("")
              }}
              placeholder="مثال: عيادة النور التخصصية"
              className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 rounded-xl text-sm text-slate-800 transition-all outline-none font-medium"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <UserCheck size={14} className="text-blue-600" />
              <span>
                اسم الطبيب المشرف / المسؤول{" "}
                <span className="text-red-500">*</span>
              </span>
            </label>
            <input
              type="text"
              value={doctorName}
              onChange={(e) => {
                setDoctorName(e.target.value)
                setError("")
              }}
              placeholder="مثال: د. محمد أحمد"
              className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 rounded-xl text-sm text-slate-800 transition-all outline-none font-medium"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Phone size={14} className="text-blue-600" />
              <span>
                رقم هاتف العيادة للتواصل <span className="text-red-500">*</span>
              </span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                setError("")
              }}
              placeholder="مثال: 0912345678"
              className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 rounded-xl text-sm text-slate-800 transition-all outline-none font-medium"
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 hover:shadow-lg cursor-pointer"
            >
              <span>حفظ البيانات والبدء في استخدام النظام</span>
              <ArrowLeft size={16} />
            </button>
          </div>

          <p className="text-[11px] text-slate-400 text-center">
            يمكنك تعديل هذه البيانات في أي وقت لاحقاً من تبويب الإعدادات.
          </p>
        </form>
      </div>
    </div>
  )
}
