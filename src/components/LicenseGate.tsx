import { useState, useEffect } from "react"
import { ShieldOff, Clock, ShieldAlert, RefreshCw, WifiOff } from "lucide-react"
import { licenseStore } from "../lib/licenseStore"
import type { LocalLicenseState, View } from "../types"

interface Props {
  onNavigate: (view: View) => void
  currentView: View
}

export default function LicenseGate({ onNavigate, currentView }: Props) {
  const [state, setState] = useState<LocalLicenseState>(licenseStore.get())

  useEffect(() => {
    setState(licenseStore.get())
  }, [currentView])

  const isExpired = state.isExpired || state.status === "EXPIRED"
  const isSuspended = state.status === "SUSPENDED"
  const isRevoked = state.status === "REVOKED"
  const isTampered = state.clockTampered
  const isGraceExpired = !state.isOfflineGraceValid && state.token !== null && !isExpired

  const hasIssue = isExpired || isSuspended || isRevoked || isTampered || isGraceExpired

  if (!hasIssue) return null

  // Determine display content
  let Icon = ShieldOff
  let color: "red" | "amber" = "red"
  let title = "الاشتراك منتهٍ"
  let description = "يرجى تجديد الاشتراك لمتابعة استخدام البرنامج."

  if (isTampered) {
    Icon = Clock; color = "amber"
    title = "تنبيه أمني: تم رصد تغيير في وقت الجهاز"
    description = "يرجى تصحيح ساعة الجهاز والاتصال بالإنترنت لإعادة التحقق من الترخيص."
  } else if (isRevoked) {
    Icon = ShieldAlert; color = "red"
    title = "تم إلغاء ترخيص هذا التطبيق"
    description = "يرجى مراجعة إدارة النظام أو إدخال مفتاح ترخيص جديد لمتابعة العمل."
  } else if (isSuspended) {
    Icon = ShieldAlert; color = "amber"
    title = "الترخيص معلق مؤقتاً"
    description = "يرجى الاتصال بالإنترنت لتحديث حالة الترخيص واستئناف الصلاحيات."
  } else if (isGraceExpired) {
    Icon = WifiOff; color = "amber"
    title = "انتهت فترة السماح للعمل بدون إنترنت"
    description = "مرت 7 أيام دون اتصال بالإنترنت. يرجى توصيل الجهاز بالإنترنت والضغط على «تحديث الترخيص»."
  } else if (isExpired) {
    Icon = ShieldOff; color = "red"
    title = "انتهت صلاحية اشتراك العيادة"
    description = "لا يمكن استخدام البرنامج حتى يتم تجديد الاشتراك. جميع بياناتك محفوظة بأمان."
  }

  // On license page: compact banner only
  if (currentView === "license") {
    const bannerCls = color === "red"
      ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300"
      : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300"
    return (
      <div className={`mx-6 mt-4 flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${bannerCls}`} dir="rtl">
        <Icon size={18} className="flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">{title}</p>
          <p className="text-xs opacity-80 mt-0.5">{description}</p>
        </div>
      </div>
    )
  }

  // Full-screen blocking overlay for all other views
  const gradientBg = color === "red"
    ? "from-red-950 via-slate-950 to-slate-900"
    : "from-amber-950 via-slate-950 to-slate-900"
  const iconBg = color === "red"
    ? "bg-red-500/15 text-red-400 ring-red-500/30"
    : "bg-amber-500/15 text-amber-400 ring-amber-500/30"
  const btnCls = color === "red"
    ? "bg-red-600 hover:bg-red-500 shadow-red-900/40"
    : "bg-amber-600 hover:bg-amber-500 shadow-amber-900/40"

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br ${gradientBg} p-6`}
      dir="rtl"
    >
      {/* Grid pattern */}
      <div className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      {/* Card */}
      <div className="relative z-10 max-w-md w-full bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-700/60 shadow-2xl p-8 flex flex-col items-center text-center gap-6">
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center ring-4 ring-offset-0 ${iconBg}`}>
          <Icon size={36} />
        </div>
        <div className="space-y-2">
          <h1 className="text-white text-xl font-bold leading-tight">{title}</h1>
          <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
        </div>
        <div className="w-full border-t border-slate-700/60" />
        <p className="text-slate-500 text-xs leading-relaxed">
          بياناتك (المرضى، المواعيد، الفواتير) محفوظة بأمان على جهازك ولن تُفقد.
          <br />
          بعد التجديد يعود البرنامج للعمل بشكل طبيعي فوراً.
        </p>
        <button
          onClick={() => onNavigate("license")}
          className={`w-full flex items-center justify-center gap-2 py-3 px-6 rounded-2xl text-white font-bold text-sm transition-all shadow-lg ${btnCls} active:scale-95`}
        >
          <RefreshCw size={16} />
          <span>الانتقال إلى صفحة تجديد الاشتراك</span>
        </button>
      </div>
    </div>
  )
}
