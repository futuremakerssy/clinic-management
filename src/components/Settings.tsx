import { useState, useEffect } from "react"
import {
  Save,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  CheckCircle,
  ShieldCheck,
  ArrowLeft,
  Lock,
  Unlock,
  KeyRound,
  RefreshCcw,
} from "lucide-react"
import {
  settingsStore,
  exportBackup,
  importBackup,
  patientStore,
  doctorStore,
  appointmentStore,
  visitStore,
  wipeAllDemoData,
  resetSecurityPin,
} from "../lib/storage"
import { licenseStore } from "../lib/licenseStore"
import { normalizeDigits } from "../lib/utils"
import { POPULAR_CURRENCIES } from "../types"
import type { ClinicSettings, View } from "../types"
import { Modal } from "./Patients"

interface Props {
  onRefresh: () => void
  onNavigate?: (view: View) => void
  onLock?: () => void
}

export default function Settings({ onRefresh, onNavigate, onLock }: Props) {
  const [form, setForm] = useState<ClinicSettings>(settingsStore.get())
  const [saved, setSaved] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmWipeDemo, setConfirmWipeDemo] = useState(false)
  const [importError, setImportError] = useState("")
  const [customCurrency, setCustomCurrency] = useState("")
  const licenseState = licenseStore.get()

  // Import restore flow state
  const [pendingImport, setPendingImport] = useState<{
    json: string
    stats: { patients: number; doctors: number; appointments: number; visits: number }
    exportedAt: string
  } | null>(null)
  const [importSuccess, setImportSuccess] = useState<{
    patients: number; doctors: number; appointments: number; visits: number
  } | null>(null)

  useEffect(() => {
    const s = settingsStore.get()
    setForm(s)
    // If currency not in popular list, treat as custom
    const isStandard = POPULAR_CURRENCIES.some((c) => c.symbol === s.currency)
    if (!isStandard && s.currency) {
      setCustomCurrency(s.currency)
    }
  }, [])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const sanitized: ClinicSettings = {
      ...form,
      securityPin: normalizeDigits(form.securityPin) || "1234",
    }
    settingsStore.save(sanitized)
    setForm(sanitized)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    onRefresh()
  }

  function handleExport() {
    const data = exportBackup()
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `clinic-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const json = ev.target?.result as string
        const data = JSON.parse(json)
        // Validate it looks like a clinic backup
        if (!data.patients && !data.doctors && !data.appointments) {
          setImportError("الملف غير صالح: لا يبدو أنه نسخة احتياطية من هذا البرنامج")
          return
        }
        // Show confirmation modal with stats preview
        setPendingImport({
          json,
          stats: {
            patients: Array.isArray(data.patients) ? data.patients.length : 0,
            doctors: Array.isArray(data.doctors) ? data.doctors.length : 0,
            appointments: Array.isArray(data.appointments) ? data.appointments.length : 0,
            visits: Array.isArray(data.visits) ? data.visits.length : 0,
          },
          exportedAt: data.exportedAt ?? "",
        })
        setImportError("")
      } catch {
        setImportError("الملف غير صالح أو تالف — تأكد أنه ملف .json صحيح")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  function confirmImport() {
    if (!pendingImport) return
    try {
      importBackup(pendingImport.json)
      setForm(settingsStore.get())
      setImportSuccess(pendingImport.stats)
      setPendingImport(null)
      onRefresh()
    } catch {
      setImportError("حدث خطأ أثناء الاستيراد — يرجى المحاولة مجدداً")
      setPendingImport(null)
    }
  }

  function handleWipeDemo() {
    wipeAllDemoData()
    setConfirmWipeDemo(false)
    onRefresh()
    alert("تم مسح كافة البيانات الوهمية وتصفير قاعدة البيانات بنجاح!")
  }

  function handleClearData() {
    localStorage.clear()
    setConfirmClear(false)
    onRefresh()
    window.location.reload()
  }

  const stats = {
    patients: patientStore.getAll().length,
    doctors: doctorStore.getAll().length,
    appointments: appointmentStore.getAll().length,
    visits: visitStore.getAll().length,
  }

  const isStandardCurrency = POPULAR_CURRENCIES.some(
    (c) => c.symbol === form.currency,
  )

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">الإعدادات</h1>
        {onLock && (
          <button
            type="button"
            onClick={onLock}
            className="flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition-colors shadow-sm cursor-pointer"
            title="قفل شاشة الإعدادات فوراً"
          >
            <Lock size={14} className="text-slate-500" />
            <span>قفل الإعدادات الآن</span>
          </button>
        )}
      </div>

      {/* License Overview Card */}
      <div className="bg-gradient-to-l from-blue-900 to-slate-900 rounded-2xl text-white p-5 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/30 flex items-center justify-center text-blue-300">
            <ShieldCheck size={22} />
          </div>
          <div>
            <div className="text-xs text-blue-200">نظام الاشتراك والترخيص</div>
            <div className="font-bold text-sm">
              الحالة:{" "}
              <span className="text-emerald-400">
                {licenseState.status === "ACTIVE"
                  ? "نشط ومفعل"
                  : licenseState.status === "TRIAL"
                    ? "فترة تجريبية"
                    : "غير مفعل أو منتهي"}
              </span>
              {licenseState.expiresAt && (
                <span className="text-xs text-slate-300 mr-2 font-normal">
                  (ينتهي في:{" "}
                  {new Date(licenseState.expiresAt).toLocaleDateString("ar-SA")}
                  )
                </span>
              )}
            </div>
          </div>
        </div>

        {onNavigate && (
          <button
            onClick={() => onNavigate("license")}
            className="flex items-center gap-1 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-semibold text-white transition-colors shadow-sm"
          >
            <span>إدارة الترخيص</span>
            <ArrowLeft size={14} />
          </button>
        )}
      </div>

      {/* Clinic info */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-semibold text-slate-800 mb-4 pb-3 border-b border-slate-100">
          بيانات العيادة
        </h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">اسم العيادة</label>
              <input
                value={form.clinicName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clinicName: e.target.value }))
                }
                className="input"
                placeholder="اسم العيادة"
              />
            </div>
            <div>
              <label className="label">اسم الطبيب / المشرف</label>
              <input
                value={form.doctorName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, doctorName: e.target.value }))
                }
                className="input"
                placeholder="د. الاسم"
              />
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
            <div className="col-span-2">
              <label className="label">العنوان</label>
              <input
                value={form.address}
                onChange={(e) =>
                  setForm((f) => ({ ...f, address: e.target.value }))
                }
                className="input"
                placeholder="المدينة - الحي - الشارع"
              />
            </div>
            <div>
              <label className="label">مدة الموعد الافتراضية (دقيقة)</label>
              <input
                type="number"
                min={5}
                max={120}
                step={5}
                value={form.appointmentDuration}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    appointmentDuration: Number(e.target.value),
                  }))
                }
                className="input"
              />
            </div>

            {/* Currency Selector with popular currencies (dollar, Egyptian pound, Syrian pound, etc.) */}
            <div>
              <label className="label">عملة النظام</label>
              <select
                value={isStandardCurrency ? form.currency : "CUSTOM"}
                onChange={(e) => {
                  const val = e.target.value
                  if (val === "CUSTOM") {
                    setForm((f) => ({ ...f, currency: customCurrency || "$" }))
                  } else {
                    setForm((f) => ({ ...f, currency: val }))
                  }
                }}
                className="input bg-white"
              >
                {POPULAR_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.symbol}>
                    {c.name} ({c.symbol})
                  </option>
                ))}
                <option value="CUSTOM">عملة أخرى مخصصة...</option>
              </select>

              {!isStandardCurrency && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={form.currency}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, currency: e.target.value }))
                      setCustomCurrency(e.target.value)
                    }}
                    placeholder="رمز أو اسم العملة (مثال: د.أ / € / £)"
                    className="input text-xs"
                  />
                </div>
              )}
            </div>

            {/* Security PIN code */}
            <div className="col-span-2 pt-2 border-t border-slate-100">
              <label className="label flex items-center gap-1 text-slate-700 font-medium">
                <KeyRound size={14} className="text-blue-600" />
                الرمز السري لقفل الإعدادات (PIN)
              </label>
              <div className="flex flex-wrap gap-3 items-center">
                <input
                  type="text"
                  maxLength={8}
                  value={form.securityPin ?? "1234"}
                  onChange={(e) => {
                    const clean = normalizeDigits(e.target.value)
                    setForm((f) => ({ ...f, securityPin: clean }))
                  }}
                  className="input font-mono text-center tracking-widest max-w-[160px]"
                  placeholder="1234"
                />
                <button
                  type="button"
                  onClick={() => {
                    resetSecurityPin()
                    setForm((f) => ({ ...f, securityPin: "1234" }))
                    alert("تمت استعادة الرمز الافتراضي 1234 بنجاح")
                  }}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                >
                  استعادة 1234
                </button>
                <span className="text-xs text-slate-500">
                  تأكد من الضغط على زر "حفظ الإعدادات" بالأسفل لتثبيت الرمز
                  الجديد.
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium shadow-sm"
            >
              <Save size={16} /> حفظ الإعدادات
            </button>
            {saved && (
              <div className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                <CheckCircle size={16} /> تم الحفظ بنجاح
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Database stats */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-semibold text-slate-800 mb-4 pb-3 border-b border-slate-100">
          إحصائيات قاعدة البيانات
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "مريض", value: stats.patients },
            { label: "طبيب", value: stats.doctors },
            { label: "موعد", value: stats.appointments },
            { label: "زيارة", value: stats.visits },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-slate-50 rounded-xl p-3 text-center"
            >
              <div className="text-2xl font-bold text-blue-600">{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Backup & Restore */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div>
          <h2 className="font-semibold text-slate-800 mb-1">النسخ الاحتياطي والاستعادة</h2>
          <p className="text-sm text-slate-500">
            صدّر نسخة احتياطية من جميع بياناتك أو استردّها من ملف سابق عند حدوث أي مشكلة
          </p>
        </div>

        {/* Export */}
        <div className="flex items-center gap-4 p-4 bg-teal-50 border border-teal-100 rounded-xl">
          <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0">
            <Download size={18} className="text-teal-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-800 text-sm">تصدير نسخة احتياطية</div>
            <div className="text-xs text-slate-500 mt-0.5">
              ينزّل ملف .json يحتوي على جميع المرضى، المواعيد، الأطباء، والفواتير
            </div>
          </div>
          <button
            onClick={handleExport}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors text-sm font-medium shadow-sm cursor-pointer"
          >
            <Download size={15} /> تصدير
          </button>
        </div>

        {/* Import / Restore */}
        <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Upload size={18} className="text-blue-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-800 text-sm">استعادة من نسخة احتياطية</div>
            <div className="text-xs text-slate-500 mt-0.5">
              اختر ملف .json لاستعادة بياناتك — ستحل البيانات المستوردة محل البيانات الحالية
            </div>
          </div>
          <label className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm cursor-pointer">
            <Upload size={15} /> استعادة
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
        </div>

        {/* Import error */}
        {importError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertTriangle size={15} className="flex-shrink-0" />
            <span>{importError}</span>
            <button onClick={() => setImportError("")} className="mr-auto text-red-400 hover:text-red-600 cursor-pointer">
              ✕
            </button>
          </div>
        )}

        {/* Import success banner */}
        {importSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
              <CheckCircle size={18} className="text-emerald-600" />
              تمت استعادة النسخة الاحتياطية بنجاح!
              <button
                onClick={() => setImportSuccess(null)}
                className="mr-auto text-emerald-400 hover:text-emerald-600 cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "مريض", value: importSuccess.patients, color: "text-blue-600" },
                { label: "طبيب", value: importSuccess.doctors, color: "text-purple-600" },
                { label: "موعد", value: importSuccess.appointments, color: "text-amber-600" },
                { label: "زيارة", value: importSuccess.visits, color: "text-teal-600" },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-lg p-2 text-center border border-emerald-100">
                  <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-[11px] text-slate-500">{s.label}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-emerald-700">
              تم تحميل جميع البيانات من ملف النسخة الاحتياطية. أعد تشغيل البرنامج إذا لاحظت أي اختلاف.
            </p>
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-red-700 mb-1 flex items-center gap-2">
            <AlertTriangle size={16} /> منطقة الخطر وإدارة البيانات
          </h2>
          <p className="text-sm text-slate-500">
            تصفير البيانات التجريبية أو مسح جميع بيانات البرنامج.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-red-100">
          <button
            type="button"
            onClick={() => setConfirmWipeDemo(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors text-sm font-medium shadow-sm"
          >
            <RefreshCcw size={15} /> مسح البيانات التجريبية (تصفير نظيف)
          </button>

          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors text-sm font-medium shadow-sm"
          >
            <Trash2 size={15} /> مسح جميع البيانات نهائياً
          </button>
        </div>
      </div>

      {confirmWipeDemo && (
        <Modal
          title="تأكيد مسح البيانات الوهمية"
          onClose={() => setConfirmWipeDemo(false)}
          small
        >
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <RefreshCcw size={28} className="text-amber-600" />
            </div>
            <p className="text-slate-700 font-medium">
              سيتم مسح جميع المرضى والأطباء والمواعيد والزيارات الوهمية لتبدأ
              العيادة بسجل نظيف تماماً!
            </p>
            <p className="text-sm text-slate-500">
              لن تتأثر إعدادات العيادة، العملة المختارة، أو بيانات الترخيص.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleWipeDemo}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 font-medium"
              >
                تأكيد المسح والتصفير
              </button>
              <button
                onClick={() => setConfirmWipeDemo(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-700"
              >
                إلغاء
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmClear && (
        <Modal
          title="تأكيد مسح البيانات"
          onClose={() => setConfirmClear(false)}
          small
        >
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle size={28} className="text-red-600" />
            </div>
            <p className="text-slate-700 font-medium">
              ستُحذف جميع البيانات نهائياً ولا يمكن استرجاعها!
            </p>
            <p className="text-sm text-slate-500">
              يُنصح بتصدير نسخة احتياطية أولاً.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleClearData}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 font-medium"
              >
                نعم، احذف كل شيء
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-700"
              >
                إلغاء
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Restore Modal */}
      {pendingImport && (
        <Modal
          title="تأكيد استعادة النسخة الاحتياطية"
          onClose={() => setPendingImport(null)}
          small
        >
          <div className="space-y-4">
            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-blue-50 rounded-full">
              <Upload size={28} className="text-blue-600" />
            </div>

            <p className="text-center text-slate-700 font-medium">
              هل أنت متأكد من استعادة هذه النسخة الاحتياطية؟
            </p>

            {pendingImport.exportedAt && (
              <p className="text-center text-xs text-slate-500">
                تاريخ النسخة:{" "}
                {new Date(pendingImport.exportedAt).toLocaleString("ar-SA")}
              </p>
            )}

            <div className="grid grid-cols-4 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
              {[
                { label: "مريض", value: pendingImport.stats.patients, color: "text-blue-600" },
                { label: "طبيب", value: pendingImport.stats.doctors, color: "text-purple-600" },
                { label: "موعد", value: pendingImport.stats.appointments, color: "text-amber-600" },
                { label: "زيارة", value: pendingImport.stats.visits, color: "text-teal-600" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-[11px] text-slate-500">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-amber-600" />
              <span>
                ستُستبدل البيانات الحالية بالكامل ببيانات النسخة الاحتياطية. هذا الإجراء لا يمكن التراجع عنه.
              </span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={confirmImport}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium text-sm transition-colors cursor-pointer"
              >
                نعم، استعادة البيانات
              </button>
              <button
                onClick={() => setPendingImport(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-700 text-sm hover:bg-slate-50 transition-colors cursor-pointer"
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
