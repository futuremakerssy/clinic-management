import { useState, useEffect, useCallback } from "react"
import {
  LayoutDashboard,
  Calendar,
  Users,
  UserCheck,
  BarChart3,
  Receipt,
  Settings as SettingsIcon,
  Menu,
  Bell,
  ShieldCheck,
  Lock,
  Maximize,
  Minimize,
  Download,
  LogOut,
  Check,
  Moon,
  Sun,
} from "lucide-react"
import {
  seedDemoData,
  settingsStore,
  appointmentStore,
  exportBackup,
} from "./lib/storage"
import { todayISO } from "./lib/utils"
import type { View } from "./types"
import Dashboard from "./components/Dashboard"
import Patients from "./components/Patients"
import Appointments from "./components/Appointments"
import Doctors from "./components/Doctors"
import Reports from "./components/Reports"
import Billing from "./components/Billing"
import Settings from "./components/Settings"
import LicenseManager from "./components/LicenseManager"
import LicenseGate from "./components/LicenseGate"
import { licenseStore } from "./lib/licenseStore"
import { licenseApi } from "./lib/licenseApi"
import { getDeviceFingerprint } from "./lib/fingerprint"
import PinLock from "./components/PinLock"
import InitialSetupModal from "./components/InitialSetupModal"
import ExitConfirmModal from "./components/ExitConfirmModal"

const NAV: { view: View label: string Icon: React.ElementType }[] = [
  { view: "dashboard", label: "الرئيسية", Icon: LayoutDashboard },
  { view: "appointments", label: "المواعيد", Icon: Calendar },
  { view: "patients", label: "المرضى", Icon: Users },
  { view: "doctors", label: "الأطباء", Icon: UserCheck },
  { view: "reports", label: "التقارير", Icon: BarChart3 },
  { view: "billing", label: "الفواتير", Icon: Receipt },
  { view: "settings", label: "الإعدادات", Icon: SettingsIcon },
  { view: "license", label: "الاشتراك والترخيص", Icon: ShieldCheck },
]

const VIEW_LABELS: Record<View, string> = {
  dashboard: "لوحة التحكم",
  appointments: "إدارة المواعيد",
  patients: "إدارة المرضى",
  doctors: "الأطباء",
  reports: "التقارير والإحصائيات",
  billing: "الفواتير والمدفوعات",
  settings: "الإعدادات",
  license: "الاشتراك والترخيص المكتبي",
}

export default function App() {
  const [view, setView] = useState<View>("dashboard")
  const [refreshKey, setRefreshKey] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [clinicName, setClinicName] = useState("My clinic")
  const [todayCount, setTodayCount] = useState(0)
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false)

  // License validity check — re-evaluated on every refreshKey change
  const getLicenseValid = () => {
    const ls = licenseStore.get()
    return (
      (ls.status === "ACTIVE" || ls.status === "TRIAL") &&
      !ls.isExpired &&
      !ls.clockTampered
    )
  }
  const [isLicenseValid, setIsLicenseValid] = useState(getLicenseValid)

  // Dark mode
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem("clinic_dark_mode") === "true"
  })

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Backup notification & state
  const [backupToast, setBackupToast] = useState(false)
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(() => {
    return localStorage.getItem("clinic_last_backup_time")
  })

  // Modals state
  const [showExitModal, setShowExitModal] = useState(false)
  const [showSetupModal, setShowSetupModal] = useState(false)

  // Apply dark mode class on html element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
    localStorage.setItem("clinic_dark_mode", String(isDarkMode))
  }, [isDarkMode])

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev)

  // Set document title & seed demo check
  useEffect(() => {
    document.title = "My clinic"
    seedDemoData()
    const s = settingsStore.get()
    if (s.clinicName && s.clinicName.trim()) {
      setClinicName(s.clinicName)
    }

    // Check if initial setup was completed
    const setupCompleted = localStorage.getItem("clinic_setup_completed")
    if (
      !setupCompleted &&
      (!s.doctorName || s.clinicName === "عيادة الرعاية الطبية")
    ) {
      setShowSetupModal(true)
    }
  }, [])

  // Sync today's appointments count, clinic name & license state
  useEffect(() => {
    const s = settingsStore.get()
    if (s.clinicName && s.clinicName.trim()) {
      setClinicName(s.clinicName)
    }
    const scheduled = appointmentStore
      .getAll()
      .filter((a) => a.date === todayISO() && a.status === "scheduled").length
    setTodayCount(scheduled)
    setIsLicenseValid(getLicenseValid())
  }, [refreshKey])

  // Periodic online license check & offline grace enforcement
  useEffect(() => {
    let timer: NodeJS.Timeout

    const checkOnlineLicense = async () => {
      const ls = licenseStore.get()
      if (!ls.licenseKey || !ls.token || ls.status !== "ACTIVE") return

      try {
        const dev = await getDeviceFingerprint()
        const res = await licenseApi.validate(ls.licenseKey, dev.deviceId)
        if (res.success && res.token) {
          licenseStore.applyActivation(
            res.token,
            dev.deviceId,
            dev.deviceName,
            res.publicKeyJwk,
          )
          setIsLicenseValid(getLicenseValid())
        } else if (res.error && !res.isNetworkError) {
          // Explicit rejection from server (e.g. revoked, suspended, expired)
          licenseStore.update({
            status: (res.license?.status as any) || "EXPIRED",
            isExpired: true,
          })
          setIsLicenseValid(false)
        }
      } catch {
        // Offline - graceful fallback to local verifyOffline
        const localCheck = await licenseStore.verifyOffline()
        if (!localCheck.isValid) {
          setIsLicenseValid(false)
        }
      }
    }

    checkOnlineLicense()
    timer = setInterval(checkOnlineLicense, 45 * 60 * 1000)

    return () => clearInterval(timer)
  }, [])

  // Force redirect to license page when subscription is invalid
  useEffect(() => {
    if (!isLicenseValid && view !== "license") {
      setView("license")
    }
  }, [isLicenseValid, view])

  // Fullscreen listener for F11 & changes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault()
        toggleFullscreen()
      }
    }

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    window.addEventListener("keydown", handleKeyDown)
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
  }, [])

  // Warning before leaving app if backup not taken today
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const today = new Date().toISOString().slice(0, 10)
      const lastDate = localStorage.getItem("clinic_last_backup_date")
      if (lastDate !== today) {
        e.preventDefault()
        e.returnValue =
          "لم يتم حفظ نسخة احتياطية من بيانات العيادة اليوم. هل أنت متأكد من الخروج؟"
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  // Backup handler
  const handleBackup = () => {
    const data = exportBackup()
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `clinic-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)

    const now = new Date()
    const timeStr = now.toLocaleTimeString("ar-SA", {
      hour: "2-digit",
      minute: "2-digit",
    })
    const dateStr = now.toISOString().slice(0, 10)

    localStorage.setItem("clinic_last_backup_time", timeStr)
    localStorage.setItem("clinic_last_backup_date", dateStr)
    setLastBackupTime(timeStr)

    setBackupToast(true)
    setTimeout(() => setBackupToast(false), 3500)
  }

  // Exit handlers
  const handleExitWithBackup = () => {
    handleBackup()
    setShowExitModal(false)
    setTimeout(() => {
      window.close()
    }, 600)
  }

  const handleExitWithoutBackup = () => {
    setShowExitModal(false)
    window.close()
  }

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])
  const navigate = useCallback((v: View) => setView(v), [])

  const handleSetupComplete = (data: {
    clinicName: string
    doctorName: string
    phone: string
  }) => {
    setClinicName(data.clinicName)
    setShowSetupModal(false)
    refresh()
  }

  return (
    <div
      className={`flex h-screen overflow-hidden ${
        isDarkMode ? "bg-slate-950" : "bg-slate-100"
      } ${
        isFullscreen ? "border-0 p-0 m-0" : ""
      }`}
      dir="rtl"
    >
      {/* Sidebar */}
      <aside
        className={`flex-shrink-0 transition-all duration-300 ${
          sidebarOpen ? "w-60" : "w-16"
        } ${
          isDarkMode ? "bg-slate-900 border-r border-slate-800" : "bg-slate-900"
        } flex flex-col z-20`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700/50">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-600/30">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-5 h-5 text-white"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="4"
                strokeWidth="1.5"
              />
            </svg>
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <div
                className="text-white font-bold text-sm leading-tight truncate"
                title={clinicName}
              >
                {clinicName}
              </div>
              <div className="text-blue-400 text-[11px] font-medium">
                My clinic
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 overflow-y-auto px-2">
          {NAV.map(({ view: v, label, Icon }) => {
            const isDisabled = !isLicenseValid && v !== "license"
            return (
              <button
                key={v}
                onClick={() => !isDisabled && setView(v)}
                title={isDisabled ? "الاشتراك منتهٍ — يرجى التجديد أولاً" : (!sidebarOpen ? label : undefined)}
                disabled={isDisabled}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                  isDisabled
                    ? "opacity-35 cursor-not-allowed"
                    : "cursor-pointer"
                } ${
                  view === v
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                    : isDisabled
                    ? "text-slate-600"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon size={18} className="flex-shrink-0" />
                {sidebarOpen && <span className="truncate">{label}</span>}
                {/* Badge for appointments */}
                {v === "appointments" && todayCount > 0 && (
                  <span
                    className={`mr-auto text-xs px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                      view === v
                        ? "bg-white/20 text-white"
                        : "bg-blue-600 text-white"
                    }`}
                  >
                    {todayCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Bottom controls */}
        <div className="px-2 pb-4 space-y-1 border-t border-slate-800 pt-3">
          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs font-medium cursor-pointer"
            title={sidebarOpen ? "طي القائمة" : "توسيع القائمة"}
          >
            <Menu size={16} />
            {sidebarOpen && <span>طي القائمة</span>}
          </button>

          {/* Quick Exit with Backup prompt */}
          <button
            onClick={() => setShowExitModal(true)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-colors text-xs font-medium cursor-pointer"
            title="إغلاق البرنامج"
          >
            <LogOut size={16} />
            {sidebarOpen && <span>إغلاق البرنامج</span>}
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className={`flex-shrink-0 h-14 border-b flex items-center px-4 sm:px-6 gap-3 sm:gap-4 z-10 ${
          isDarkMode
            ? "bg-slate-900 border-slate-800"
            : "bg-white border-slate-200"
        }`}>
          <div className="flex items-center gap-2">
            <h2 className={`font-bold text-sm sm:text-base ${
              isDarkMode ? "text-slate-100" : "text-slate-800"
            }`}>
              {VIEW_LABELS[view]}
            </h2>
            <span className={`hidden lg:inline text-xs px-2 py-0.5 rounded font-semibold border ${
              isDarkMode
                ? "bg-blue-900/40 text-blue-300 border-blue-700/60"
                : "bg-blue-50 text-blue-700 border-blue-200/60"
            }`}>
              My clinic
            </span>
          </div>

          <div className="mr-auto flex items-center gap-2 sm:gap-3">
            {/* Today badge */}
            <div className={`hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border ${
              isDarkMode
                ? "text-slate-400 bg-slate-800 border-slate-700"
                : "text-slate-600 bg-slate-100 border-slate-200/80"
            }`}>
              <Calendar size={13} className={isDarkMode ? "text-slate-500" : "text-slate-500"} />
              <span>
                {new Date().toLocaleDateString("ar-SA", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>

            {/* Prominent Backup Button next to the date */}
            <button
              type="button"
              onClick={handleBackup}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300/80 rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer"
              title="تصدير وحفظ نسخة احتياطية من جميع بيانات العيادة"
            >
              <Download size={14} className="text-emerald-700" />
              <span>نسخ احتياطي</span>
              {lastBackupTime && (
                <span className="hidden md:inline text-[10px] text-emerald-700/80 font-normal">
                  ({lastBackupTime})
                </span>
              )}
            </button>

            {/* Dark Mode Toggle */}
            <button
              type="button"
              onClick={toggleDarkMode}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                isDarkMode
                  ? "bg-slate-800 text-yellow-400 hover:bg-slate-700 border border-slate-700"
                  : "hover:bg-slate-100 text-slate-500 hover:text-slate-700"
              }`}
              title={isDarkMode ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Notification bell */}
            <button
              onClick={() => setView("appointments")}
              className={`relative p-2 rounded-xl transition-colors cursor-pointer ${
                isDarkMode
                  ? "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  : "hover:bg-slate-100 text-slate-500 hover:text-slate-700"
              }`}
              title="المواعيد المجدولة لليوم"
            >
              <Bell size={18} />
              {todayCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                  {todayCount}
                </span>
              )}
            </button>

            {/* Full Screen Toggle (F11) */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                isFullscreen
                  ? "bg-blue-50 text-blue-600 border border-blue-200"
                  : isDarkMode
                  ? "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  : "hover:bg-slate-100 text-slate-500 hover:text-slate-700"
              }`}
              title={
                isFullscreen
                  ? "إنهاء ملء الشاشة (F11)"
                  : "ملء الشاشة وإخفاء الحواف (F11)"
              }
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>

            {/* Admin Lock Button when Unlocked */}
            {isAdminUnlocked && (view === "settings" || view === "license") && (
              <button
                type="button"
                onClick={() => setIsAdminUnlocked(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-semibold transition-colors shadow-sm cursor-pointer"
                title="قفل قسم الإدارة والترخيص الآن"
              >
                <Lock size={13} className="text-amber-700" />
                <span>قفل الإدارة (PIN)</span>
              </button>
            )}

            {/* Desktop Exit Button */}
            <button
              type="button"
              onClick={() => setShowExitModal(true)}
              className={`hidden sm:flex items-center gap-1 p-2 rounded-xl transition-colors cursor-pointer ${
                isDarkMode
                  ? "text-slate-500 hover:bg-red-950/60 hover:text-red-400"
                  : "hover:bg-red-50 text-slate-400 hover:text-red-600"
              }`}
              title="إغلاق والتأكد من النسخ الاحتياطي"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {/* License Alert Gate */}
        <LicenseGate onNavigate={navigate} currentView={view} />

        {/* Page content */}
        <main className={`flex-1 overflow-auto ${
          isDarkMode ? "bg-slate-950" : "bg-slate-50/50"
        }`}>
          {view === "dashboard" && (
            <Dashboard onNavigate={navigate} refresh={refreshKey} />
          )}
          {view === "appointments" && (
            <Appointments refresh={refreshKey} onRefresh={refresh} />
          )}
          {view === "patients" && (
            <Patients refresh={refreshKey} onRefresh={refresh} />
          )}
          {view === "doctors" && (
            <Doctors refresh={refreshKey} onRefresh={refresh} />
          )}
          {view === "reports" && <Reports refresh={refreshKey} />}
          {view === "billing" && (
            <Billing refresh={refreshKey} onRefresh={refresh} />
          )}
          {view === "settings" &&
            (!isAdminUnlocked ? (
              <PinLock
                title="الإعدادات مقفلة برمز سري"
                subtitle="لحماية إعدادات العيادة، الأسعار، وقاعدة البيانات، يرجى إدخال رمز الأمان السري (PIN)"
                onUnlock={() => setIsAdminUnlocked(true)}
              />
            ) : (
              <Settings
                onRefresh={refresh}
                onNavigate={navigate}
                onLock={() => setIsAdminUnlocked(false)}
              />
            ))}
          {view === "license" &&
            // Bypass PIN when license is invalid so user can always renew
            (!isLicenseValid ? (
              <LicenseManager
                onRefresh={refresh}
                onLock={() => setIsAdminUnlocked(false)}
              />
            ) : !isAdminUnlocked ? (
              <PinLock
                title="نظام الاشتراك والترخيص مقفل برمز سري"
                subtitle="لحماية رخصة التطبيق وإدارة ربط الأجهزة، يرجى إدخال رمز الأمان السري (PIN)"
                onUnlock={() => setIsAdminUnlocked(true)}
              />
            ) : (
              <LicenseManager
                onRefresh={refresh}
                onLock={() => setIsAdminUnlocked(false)}
              />
            ))}
        </main>
      </div>

      {/* Initial Setup Modal (First Launch) */}
      {showSetupModal && <InitialSetupModal onComplete={handleSetupComplete} />}

      {/* Exit Confirmation Modal */}
      <ExitConfirmModal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        onExitWithBackup={handleExitWithBackup}
        onExitWithoutBackup={handleExitWithoutBackup}
      />

      {/* Backup Success Toast Notification */}
      {backupToast && (
        <div className="fixed bottom-6 left-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-semibold border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Check size={14} />
          </div>
          <span>تم تنزيل النسخة الاحتياطية لبيانات العيادة بنجاح!</span>
        </div>
      )}
    </div>
  )
}
