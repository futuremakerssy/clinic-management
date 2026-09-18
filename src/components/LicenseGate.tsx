import { useState, useEffect } from "react"
import { AlertCircle, Clock, ShieldAlert, ArrowLeft, X } from "lucide-react"
import { licenseStore } from "../lib/licenseStore"
import type { LocalLicenseState, View } from "../types"

interface Props {
  onNavigate: (view: View) => void
  currentView: View
}

export default function LicenseGate({ onNavigate, currentView }: Props) {
  const [state, setState] = useState<LocalLicenseState>(licenseStore.get())
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setState(licenseStore.get())
  }, [currentView])

  // Don't show on the license page itself
  if (currentView === "license") return null

  // Check condition
  const isExpired = state.isExpired || state.status === "EXPIRED"
  const isSuspended = state.status === "SUSPENDED"
  const isRevoked = state.status === "REVOKED"
  const isTampered = state.clockTampered
  const isGraceExpired = !state.isOfflineGraceValid && state.token !== null

  const hasIssue =
    isExpired || isSuspended || isRevoked || isTampered || isGraceExpired

  if (!hasIssue || dismissed) return null

  let message = "يرجى التحقق من حالة الاشتراك"
  let submessage = "بيانات العيادة محفوظة بالكامل محلياً ولا تتأثر."

  if (isTampered) {
    message = "تنبيه أمني: تم رصد تغيير في وقت الجهاز"
    submessage =
      "يرجى تصحيح ساعة الجهاز والاتصال بالإنترنت لإعادة التحقق من الترخيص."
  } else if (isRevoked) {
    message = "تم إلغاء ترخيص هذا التطبيق"
    submessage =
      "يرجى مراجعة إدارة النظام أو إدخال مفتاح ترخيص جديد لمتابعة العمل."
  } else if (isSuspended) {
    message = "الترخيص معلق مؤقتاً"
    submessage = "يرجى الاتصال بالإنترنت لتحديث حالة الترخيص واستئناف الصلاحيات."
  } else if (isGraceExpired) {
    message = "انتهت فترة السماح للعمل بدون إنترنت (7 أيام)"
    submessage =
      "يرجى توصيل الجهاز بالإنترنت والضغط على 'تحديث الترخيص' لتجديد فترة السماح."
  } else if (isExpired) {
    message = "انتهت صلاحية اشتراك العيادة"
    submessage =
      "يرجى تجديد الاشتراك لمتابعة العمل بشكل طبيعي. جميع بيانات المرضى والحجوزات محفوظة محلياً بأمان."
  }

  return (
    <div
      className="bg-amber-500 text-white px-4 py-2.5 shadow-md flex items-center justify-between text-sm transition-all"
      dir="rtl"
    >
      <div className="flex items-center gap-3">
        {isTampered ? (
          <Clock size={18} className="flex-shrink-0" />
        ) : isRevoked || isSuspended ? (
          <ShieldAlert size={18} className="flex-shrink-0" />
        ) : (
          <AlertCircle size={18} className="flex-shrink-0" />
        )}
        <div>
          <span className="font-bold ml-2">{message}</span>
          <span className="opacity-90 text-xs hidden sm:inline">
            {submessage}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate("license")}
          className="px-3 py-1 bg-white text-amber-900 rounded-lg text-xs font-bold hover:bg-amber-50 transition-colors flex items-center gap-1 shadow-sm"
        >
          <span>إدارة الاشتراك</span>
          <ArrowLeft size={14} />
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-amber-600 rounded-lg text-white/80 hover:text-white transition-colors"
          title="إغلاق التنبيه مؤقتاً"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
