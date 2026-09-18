import { useState, useEffect } from "react"
import {
  TrendingUp,
  Users,
  Calendar,
  XCircle,
  DollarSign,
  Printer,
} from "lucide-react"
import {
  appointmentStore,
  patientStore,
  visitStore,
  doctorStore,
  settingsStore,
} from "../lib/storage"
import { AR_MONTHS, printContent } from "../lib/utils"

interface Props {
  refresh: number
}

export default function Reports({ refresh }: Props) {
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">(
    "month",
  )
  const [stats, setStats] = useState({
    patients: 0,
    appointments: 0,
    completed: 0,
    cancelled: 0,
    revenue: 0,
    unpaid: 0,
    byDoctor: [] as {
      name: string
      specialty: string
      count: number
      revenue: number
      color: string
    }[],
    daily: [] as { label: string count: number revenue: number }[],
  })

  useEffect(() => {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)

    function inPeriod(dateStr: string) {
      const d = new Date(dateStr)
      if (period === "today") return dateStr === todayStr
      if (period === "week") {
        const week = new Date(now)
        week.setDate(now.getDate() - 7)
        return d >= week
      }
      if (period === "month")
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth()
        )
      return d.getFullYear() === now.getFullYear()
    }

    const appts = appointmentStore.getAll().filter((a) => inPeriod(a.date))
    const visits = visitStore.getAll().filter((v) => inPeriod(v.date))
    const docs = doctorStore.getAll()
    const pts = new Set(appts.map((a) => a.patientId))

    const byDoctor = docs
      .map((doc) => ({
        name: doc.name,
        specialty: doc.specialty,
        color: doc.color,
        count: appts.filter((a) => a.doctorId === doc.id).length,
        revenue: visits
          .filter((v) => v.doctorId === doc.id && v.paid)
          .reduce((s, v) => s + v.amount, 0),
      }))
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count)

    // Daily breakdown for the current month
    const daily: typeof stats.daily = []
    if (period === "month" || period === "week") {
      const days =
        period === "month"
          ? new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
          : 7
      for (let i = days; i >= 1; i--) {
        const d = new Date(now)
        d.setDate(now.getDate() - (days - i))
        const ds = d.toISOString().slice(0, 10)
        const dayAppts = appts.filter((a) => a.date === ds)
        const dayVisits = visits.filter((v) => v.date === ds)
        if (dayAppts.length > 0 || dayVisits.length > 0) {
          daily.push({
            label: `${d.getDate()}/${d.getMonth() + 1}`,
            count: dayAppts.length,
            revenue: dayVisits
              .filter((v) => v.paid)
              .reduce((s, v) => s + v.amount, 0),
          })
        }
      }
    }

    setStats({
      patients: pts.size,
      appointments: appts.length,
      completed: appts.filter((a) => a.status === "completed").length,
      cancelled: appts.filter((a) => a.status === "cancelled").length,
      revenue: visits.filter((v) => v.paid).reduce((s, v) => s + v.amount, 0),
      unpaid: visits.filter((v) => !v.paid).reduce((s, v) => s + v.amount, 0),
      byDoctor,
      daily,
    })
  }, [period, refresh])

  const PERIODS = [
    { key: "today", label: "اليوم" },
    { key: "week", label: "الأسبوع" },
    { key: "month", label: "الشهر" },
    { key: "year", label: "السنة" },
  ] as const

  const currency = settingsStore.get().currency || "$"

  function handlePrint() {
    const html = `
      <h2 style="text-align:center">تقرير العيادة</h2>
      <table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tr><th>الإجمالي</th><th>الإيرادات</th><th>المكتملة</th><th>الملغاة</th><th>المواعيد</th><th>المرضى</th></tr>
        <tr>
          <td>${stats.revenue} ${currency}</td>
          <td>${stats.revenue} ${currency}</td>
          <td>${stats.completed}</td>
          <td>${stats.cancelled}</td>
          <td>${stats.appointments}</td>
          <td>${stats.patients}</td>
        </tr>
      </table>
      <br>
      <h3>أداء الأطباء</h3>
      <table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tr><th>الطبيب</th><th>التخصص</th><th>المواعيد</th><th>الإيرادات</th></tr>
        ${stats.byDoctor.map((d) => `<tr><td>${d.name}</td><td>${d.specialty}</td><td>${d.count}</td><td>${d.revenue} ${currency}</td></tr>`).join("")}
      </table>
    `
    printContent(html, "تقرير العيادة")
  }

  const maxCount = Math.max(...stats.daily.map((d) => d.count), 1)
  const maxRev = Math.max(...stats.daily.map((d) => d.revenue), 1)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">التقارير</h1>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p.key
                    ? "bg-white shadow-sm text-slate-800"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors text-sm"
          >
            <Printer size={15} /> طباعة
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={Users}
          label="المرضى"
          value={stats.patients}
          color="blue"
        />
        <StatCard
          icon={Calendar}
          label="المواعيد"
          value={stats.appointments}
          color="teal"
        />
        <StatCard
          icon={TrendingUp}
          label="مكتملة"
          value={stats.completed}
          color="green"
        />
        <StatCard
          icon={XCircle}
          label="ملغاة"
          value={stats.cancelled}
          color="red"
        />
        <StatCard
          icon={DollarSign}
          label="الإيرادات"
          value={`${stats.revenue} ${currency}`}
          color="emerald"
        />
        <StatCard
          icon={DollarSign}
          label="غير محصّل"
          value={`${stats.unpaid} ${currency}`}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Daily chart */}
        {stats.daily.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-4">
              المواعيد اليومية
            </h2>
            <div className="flex items-end gap-2 h-40">
              {stats.daily.map((d, i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <div
                    className="w-full bg-blue-100 rounded-t-md relative"
                    style={{ height: `${(d.count / maxCount) * 100}%` }}
                  >
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-slate-600 font-medium whitespace-nowrap">
                      {d.count}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 whitespace-nowrap">
                    {d.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Doctor performance */}
        {stats.byDoctor.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-4">أداء الأطباء</h2>
            <div className="space-y-3">
              {stats.byDoctor.map((doc, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: doc.color }}
                      />
                      <span className="font-medium text-slate-700">
                        {doc.name}
                      </span>
                    </div>
                    <div className="text-slate-500">
                      {doc.count} موعد · {doc.revenue} ${currency}
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        backgroundColor: doc.color,
                        width: `${(doc.count / (stats.byDoctor[0]?.count || 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Revenue chart */}
        {stats.daily.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 col-span-2">
            <h2 className="font-semibold text-slate-800 mb-4">
              الإيرادات اليومية
            </h2>
            <div className="flex items-end gap-2 h-32">
              {stats.daily.map((d, i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <div
                    className="w-full bg-emerald-100 rounded-t-md relative"
                    style={{ height: `${(d.revenue / maxRev) * 100}%` }}
                  >
                    {d.revenue > 0 && (
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-emerald-700 font-medium whitespace-nowrap">
                        {d.revenue}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 whitespace-nowrap">
                    {d.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {stats.appointments === 0 && (
        <div className="py-24 text-center text-slate-400">
          <TrendingUp size={48} className="mx-auto mb-4 opacity-20" />
          <p>لا توجد بيانات في هذه الفترة</p>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  color: string
}) {
  const classes: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    teal: "bg-teal-50 text-teal-600 border-teal-100",
    green: "bg-green-50 text-green-600 border-green-100",
    red: "bg-red-50 text-red-600 border-red-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
  }
  return (
    <div
      className={`rounded-2xl p-5 border ${classes[color]} bg-white shadow-sm`}
    >
      <div
        className={`inline-flex p-2.5 rounded-xl ${classes[color].split(" ").slice(0, 2).join(" ")} mb-3`}
      >
        <Icon size={20} />
      </div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-sm text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}
