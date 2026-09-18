import { useState } from "react"
import { Lock, Unlock, AlertTriangle } from "lucide-react"
import { settingsStore } from "../lib/storage"
import { normalizeDigits } from "../lib/utils"

interface Props {
  title?: string
  subtitle?: string
  onUnlock: () => void
}

export default function PinLock({
  title = "القسم مقفل برمز سري",
  subtitle = "يرجى إدخال رمز الأمان السري للإدارة (PIN) للمتابعة",
  onUnlock,
}: Props) {
  const [pinInput, setPinInput] = useState("")
  const [pinError, setPinError] = useState("")

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    const storedSettings = settingsStore.get()
    const configuredPin = normalizeDigits(storedSettings.securityPin || "1234")
    const enteredPin = normalizeDigits(pinInput)

    if (enteredPin === configuredPin) {
      setPinError("")
      setPinInput("")
      onUnlock()
    } else {
      setPinError("الرمز السري غير صحيح. يرجى إعادة المحاولة.")
    }
  }

  return (
    <div className="p-6 max-w-md mx-auto my-12 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-8 text-center space-y-6">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-100 shadow-sm">
          <Lock size={32} />
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-800">{title}</h2>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            {subtitle}
          </p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <input
              type="password"
              maxLength={16}
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value)
                setPinError("")
              }}
              placeholder="••••"
              autoFocus
              className="w-full text-center text-3xl tracking-[0.8em] font-mono py-3.5 px-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
            />
            {pinError && (
              <p className="text-red-500 text-xs mt-2 font-medium flex items-center justify-center gap-1">
                <AlertTriangle size={14} />
                {pinError}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-sm shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Unlock size={18} />
            فتح القفل والدخول
          </button>
        </form>

        <p className="text-[11px] text-slate-400">
          هذا القسم محمي للمشرف المصرح له فقط.
        </p>
      </div>
    </div>
  )
}
