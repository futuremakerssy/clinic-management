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
  X,
  Bell,
  Search,
  ShieldCheck,
  Lock,
} from "lucide-react"
import { seedDemoData, settingsStore, appointmentStore } from "./lib/storage"
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
import PinLock from "./components/PinLock"

const NAV: { view: View; label: string; Icon: React.ElementType }[] = [
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
  const [clinicName, setClinicName] = useState("عيادة الرعاية الطبية")
  const [todayCount, setTodayCount] = useState(0)
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false)

  useEffect(() => {
    seedDemoData()
    const s = settingsStore.get()
    setClinicName(s.clinicName)
  }, [])

  useEffect(() => {
    const s = settingsStore.get()
    setClinicName(s.clinicName)
    const scheduled = appointmentStore
      .getAll()
      .filter((a) => a.date === todayISO() && a.status === "scheduled").length
    setTodayCount(scheduled)
  }, [refreshKey])

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const navigate = useCallback((v: View) => setView(v), [])

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden" dir="rtl">
      {/* Sidebar */}
      <aside
        className={`flex-shrink-0 transition-all duration-300 ${
          sidebarOpen ? "w-60" : "w-16"
        } bg-slate-900 flex flex-col`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700/50">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
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
              <div className="text-white font-bold text-sm leading-tight truncate">
                {clinicName}
              </div>
              <div className="text-slate-400 text-xs">نظام إدارة العيادة</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 overflow-y-auto px-2">
          {NAV.map(({ view: v, label, Icon }) => (
            <button
              key={v}
              onClick={() => setView(v)}
              title={!sidebarOpen ? label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                view === v
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
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
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="px-2 pb-4">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors text-sm"
          >
            <Menu size={18} />
            {sidebarOpen && <span>طي القائمة</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex-shrink-0 h-14 bg-white border-b border-slate-200 flex items-center px-6 gap-4">
          <h2 className="font-semibold text-slate-800 text-sm">
            {VIEW_LABELS[view]}
          </h2>
          <div className="mr-auto flex items-center gap-3">
            {/* Today badge */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
              <Calendar size={12} />
              {new Date().toLocaleDateString("ar-SA", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
            {/* Notification bell */}
            <button className="relative p-2 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-700 transition-colors">
              <Bell size={18} />
              {todayCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                  {todayCount}
                </span>
              )}
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
          </div>
        </header>

        {/* License Alert Gate */}
        <LicenseGate onNavigate={navigate} currentView={view} />

        {/* Page content */}
        <main className="flex-1 overflow-auto">
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
          {view === "settings" && (
            !isAdminUnlocked ? (
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
            )
          )}
          {view === "license" && (
            !isAdminUnlocked ? (
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
            )
          )}
        </main>
      </div>
    </div>
  )
}
