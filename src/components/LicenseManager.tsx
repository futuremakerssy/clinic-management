import { useState, useEffect } from "react"
import {
  ShieldCheck,
  ShieldAlert,
  Key,
  Laptop,
  Calendar,
  Clock,
  RefreshCw,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Lock,
  WifiOff,
  Wifi,
} from "lucide-react"
import { licenseStore } from "../lib/licenseStore"
import { licenseApi } from "../lib/licenseApi"
import { getDeviceFingerprint } from "../lib/fingerprint"
import type {
  LocalLicenseState,
  SubscriptionPlan,
  SubscriptionStatus,
} from "../types"

interface Props {
  onRefresh?: () => void
  onLock?: () => void
}

export default function LicenseManager({ onRefresh, onLock }: Props) {
  const [licenseState, setLicenseState] = useState<LocalLicenseState>(
    licenseStore.get(),
  )
  const [keyInput, setKeyInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [refreshLoading, setRefreshLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error" | "info"
    text: string
  } | null>(null)

  useEffect(() => {
    loadLocalState()
  }, [])

  async function loadLocalState() {
    const s = licenseStore.get()
    const dev = await getDeviceFingerprint()
    if (!s.deviceId) {
      licenseStore.update({
        deviceId: dev.deviceId,
        deviceName: dev.deviceName,
      })
    }
    setLicenseState(licenseStore.get())
  }

  // Format License Key input: XXXX-XXXX-XXXX-XXXX
  function handleKeyChange(e: React.ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
    if (raw.length > 16) raw = raw.slice(0, 16)
    const parts = raw.match(/.{1,4}/g) || []
    setKeyInput(parts.join("-"))
  }

  // Activate license on this device
  async function handleActivate(e: React.FormEvent) {
    e.preventDefault()
    if (!keyInput.trim()) {
      setActionMessage({
        type: "error",
        text: "يرجى إدخال مفتاح الترخيص",
      })
      return
    }

    setLoading(true)
    setActionMessage(null)

    try {
      const dev = await getDeviceFingerprint()
      const res = await licenseApi.activate(
        keyInput.trim(),
        dev.deviceId,
        dev.deviceName,
      )

      if (res.success && res.token) {
        licenseStore.applyActivation(res.token, dev.deviceId, dev.deviceName)
        setLicenseState(licenseStore.get())
        setKeyInput("")
        setActionMessage({
          type: "success",
          text: "تم تفعيل الترخيص بنجاح وربطه بهذا الجهاز!",
        })
        if (onRefresh) onRefresh()
      } else {
        setActionMessage({
          type: "error",
          text:
            res.error || "فشل التفعيل. يرجى التحقق من المفتاح أو حالة الخادم",
        })
      }
    } catch {
      setActionMessage({
        type: "error",
        text: "حدث خطأ غير متوقع أثناء التفعيل",
      })
    } finally {
      setLoading(false)
    }
  }

  // Refresh current license from server
  async function handleRefresh() {
    if (!licenseState.licenseKey) return
    setRefreshLoading(true)
    setActionMessage(null)

    try {
      const dev = await getDeviceFingerprint()
      const res = await licenseApi.refresh(
        licenseState.licenseKey,
        dev.deviceId,
      )

      if (res.success && res.token) {
        licenseStore.applyActivation(res.token, dev.deviceId, dev.deviceName)
        setLicenseState(licenseStore.get())
        setActionMessage({
          type: "success",
          text: "تم تحديث وتمديد صلاحية الترخيص بنجاح!",
        })
        if (onRefresh) onRefresh()
      } else {
        setActionMessage({
          type: "error",
          text:
            res.error ||
            "تعذر تحديث الترخيص عبر الخادم. استمرار العمل بوضع الأوفلاين",
        })
      }
    } catch {
      setActionMessage({
        type: "error",
        text: "فشل الاتصال بالخادم. التطبيق يعمل في وضع الأوفلاين",
      })
    } finally {
      setRefreshLoading(false)
    }
  }

  // Deactivate this device
  async function handleDeactivate() {
    if (!licenseState.licenseKey) return
    if (
      !window.confirm(
        "هل أنت متأكد من رغبتك في إلغاء تفعيل هذا الجهاز؟ ستتمكن من تفعيل الترخيص على جهاز آخر.",
      )
    ) {
      return
    }

    setLoading(true)
    try {
      const dev = await getDeviceFingerprint()
      await licenseApi.deactivate(licenseState.licenseKey, dev.deviceId)
      licenseStore.clearActivation()
      setLicenseState(licenseStore.get())
      setActionMessage({
        type: "info",
        text: "تم إلغاء تفعيل هذا الجهاز بنجاح. الترخيص متاح الآن للاستخدام في كمبيوتر آخر",
      })
      if (onRefresh) onRefresh()
    } catch {
      setActionMessage({
        type: "error",
        text: "تعذر إبلاغ الخادم، تم مسح التفعيل محلياً",
      })
      licenseStore.clearActivation()
      setLicenseState(licenseStore.get())
    } finally {
      setLoading(false)
    }
  }

  // Helpers
  const isLicensed =
    licenseState.licenseKey &&
    licenseState.token &&
    licenseState.status === "ACTIVE" &&
    !licenseState.isExpired &&
    !licenseState.clockTampered

  const planNames: Record<SubscriptionPlan, string> = {
    monthly: "اشتراك شهري (Monthly)",
    yearly: "اشتراك سنوي (Yearly)",
    trial: "فترة تجريبية (Trial)",
  }

  const statusBadges: Record<SubscriptionStatus, {
    label: string
    bg: string
    text: string
  }> = {
    ACTIVE: {
      label: "نشط ومفعل",
      bg: "bg-emerald-50 border-emerald-200",
      text: "text-emerald-700",
    },
    TRIAL: {
      label: "فترة تجريبية",
      bg: "bg-blue-50 border-blue-200",
      text: "text-blue-700",
    },
    EXPIRED: {
      label: "منتهي الصلاحية",
      bg: "bg-rose-50 border-rose-200",
      text: "text-rose-700",
    },
    SUSPENDED: {
      label: "معلق مؤقتاً",
      bg: "bg-amber-50 border-amber-200",
      text: "text-amber-700",
    },
    REVOKED: {
      label: "ملغى نهائياً",
      bg: "bg-red-50 border-red-200",
      text: "text-red-700",
    },
  }

  // Days remaining calculation
  let daysRemaining = 0
  if (licenseState.expiresAt) {
    const expMs = new Date(licenseState.expiresAt).getTime()
    const diff = expMs - Date.now()
    daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  // Offline Grace remaining
  let graceHoursRemaining = 0
  if (licenseState.lastVerifiedTimestamp) {
    const graceMs =
      licenseState.offlineGraceDays * 24 * 60 * 60 * 1000 -
      (Date.now() - licenseState.lastVerifiedTimestamp)
    graceHoursRemaining = Math.max(0, Math.ceil(graceMs / (1000 * 60 * 60)))
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Page Title */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              الاشتراك والترخيص المكتبي
            </h1>
            <p className="text-sm text-slate-500">
              إدارة رخصة التطبيق، ربط الجهاز، وفترات العمل الأوفلاين
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Indicator */}
          <div
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold ${
              statusBadges[licenseState.status].bg
            } ${statusBadges[licenseState.status].text}`}
          >
            {isLicensed ? (
              <CheckCircle2 size={16} className="text-emerald-600" />
            ) : (
              <AlertTriangle size={16} className="text-rose-600" />
            )}
            <span>{statusBadges[licenseState.status].label}</span>
          </div>

          {onLock && (
            <button
              type="button"
              onClick={onLock}
              className="flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition-colors shadow-sm cursor-pointer"
              title="قفل قسم الاشتراك والترخيص الآن"
            >
              <Lock size={14} className="text-slate-500" />
              <span>قفل الآن</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Messages */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-start gap-3 transition-all ${
            actionMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : actionMessage.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : "bg-blue-50 border-blue-200 text-blue-800"
          }`}
        >
          {actionMessage.type === "success" && (
            <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" />
          )}
          {actionMessage.type === "error" && (
            <ShieldAlert size={18} className="mt-0.5 flex-shrink-0" />
          )}
          {actionMessage.type === "info" && (
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1 font-medium">{actionMessage.text}</div>
        </div>
      )}

      {/* Clock Tamper Alert */}
      {licenseState.clockTampered && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm flex items-start gap-3">
          <Clock size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-bold">
              تحذير أمني: تم اكتشاف تعديل في وقت الجهاز
            </div>
            <p className="mt-1 text-xs text-amber-700">
              تم إرجاع ساعة الجهاز للوراء بشكل غير منطقي. يرجى ضبط الساعة
              الصحيحة والاتصال بالسيرفر للتحقق من الترخيص. لم يتم حذف أي من
              بيانات العيادة.
            </p>
          </div>
        </div>
      )}

      {/* Current License Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <h2 className="font-semibold text-slate-800 pb-3 border-b border-slate-100 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Key size={18} className="text-blue-600" />
            بيانات الترخيص الحالي
          </span>
          {isLicensed && (
            <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-md font-semibold">
              ✓ تم التوثيق بالتوقيع الرقمي
            </span>
          )}
        </h2>

        {licenseState.licenseKey ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Key & Plan */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
              <div className="text-xs text-slate-500 font-medium">
                مفتاح الترخيص
              </div>
              <div className="font-mono text-base font-bold text-slate-800 tracking-wider">
                {licenseState.licenseKey}
              </div>
              <div className="pt-2 text-xs text-slate-500">
                نوع الخطة:{" "}
                <span className="font-bold text-slate-700">
                  {licenseState.plan
                    ? planNames[licenseState.plan]
                    : "غير محدد"}
                </span>
              </div>
            </div>

            {/* Expiration & Days */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
              <div className="text-xs text-slate-500 font-medium">
                تاريخ انتهاء الاشتراك
              </div>
              <div className="font-bold text-base text-slate-800 flex items-center gap-2">
                <Calendar size={18} className="text-blue-600" />
                {licenseState.expiresAt
                  ? new Date(licenseState.expiresAt).toLocaleDateString(
                      "ar-SA",
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      },
                    )
                  : "—"}
              </div>
              <div className="text-xs text-slate-500 pt-2">
                الأيام المتبقية:{" "}
                <span
                  className={`font-bold ${
                    daysRemaining <= 7 ? "text-rose-600" : "text-emerald-600"
                  }`}
                >
                  {daysRemaining} يوم
                </span>
              </div>
            </div>

            {/* Device Info */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
              <div className="text-xs text-slate-500 font-medium">
                الجهاز المربوط (Device Fingerprint)
              </div>
              <div className="font-mono text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <Laptop size={16} className="text-slate-500" />
                {licenseState.deviceId || "جاري قراءة المعرف..."}
              </div>
              <div className="text-xs text-slate-500 pt-1">
                {licenseState.deviceName}
              </div>
            </div>

            {/* Offline Grace Period */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
              <div className="text-xs text-slate-500 font-medium">
                صلاحية العمل أوفلاين (Offline Grace)
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                {licenseState.isOfflineGraceValid ? (
                  <>
                    <WifiOff size={16} className="text-teal-600" />
                    <span>
                      متاح أوفلاين ({Math.round(graceHoursRemaining / 24)} أيام
                      متبقية)
                    </span>
                  </>
                ) : (
                  <>
                    <Wifi size={16} className="text-rose-600" />
                    <span className="text-rose-600">
                      انتهت فترة الأوفلاين، يلزم الاتصال
                    </span>
                  </>
                )}
              </div>
              <div className="text-xs text-slate-400 pt-1">
                آخر تحقق من الخادم:{" "}
                {licenseState.lastVerifiedTimestamp
                  ? new Date(
                      licenseState.lastVerifiedTimestamp,
                    ).toLocaleTimeString("ar-SA")
                  : "غير متوفر"}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <Lock size={36} className="mx-auto mb-2 text-slate-400" />
            <div className="font-semibold text-slate-700">
              لا يوجد ترخيص نشط على هذا الجهاز
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              أدخل مفتاح الترخيص الخاص بعيادتك لتفعيل النظام وربطه بهذا الجهاز
              للعمل Offline.
            </p>
          </div>
        )}

        {/* Buttons for active license */}
        {licenseState.licenseKey && (
          <div className="flex flex-wrap gap-3 pt-3 border-t border-slate-100">
            <button
              onClick={handleRefresh}
              disabled={refreshLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={refreshLoading ? "animate-spin" : ""}
              />
              تحديث وتمديد الترخيص من الخادم
            </button>

            <button
              onClick={handleDeactivate}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium"
            >
              <LogOut size={16} className="text-slate-500" />
              إلغاء تفعيل هذا الجهاز (لنقل الترخيص)
            </button>
          </div>
        )}
      </div>

      {/* Activation Form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 pb-3 border-b border-slate-100 flex items-center gap-2">
          <Key size={18} className="text-teal-600" />
          تفعيل أو تبديل مفتاح الترخيص
        </h2>

        <form onSubmit={handleActivate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              أدخل مفتاح الترخيص (License Key)
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={keyInput}
                onChange={handleKeyChange}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-center tracking-widest text-lg uppercase"
                maxLength={19}
              />
              <button
                type="submit"
                disabled={loading || keyInput.length < 10}
                className="px-6 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors font-medium text-sm flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <ShieldCheck size={16} />
                )}
                تفعيل الترخيص
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              مثال: <span className="font-mono">CLIN-2026-YEAR-0001</span> أو{" "}
              <span className="font-mono">CLIN-2026-MONT-0002</span>
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
