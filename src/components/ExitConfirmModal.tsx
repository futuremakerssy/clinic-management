import { ShieldAlert, Download, LogOut, X } from "lucide-react"

interface Props {
  isOpen: boolean
  onClose: () => void
  onExitWithBackup: () => void
  onExitWithoutBackup: () => void
}

export default function ExitConfirmModal({
  isOpen,
  onClose,
  onExitWithBackup,
  onExitWithoutBackup,
}: Props) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center flex-shrink-0">
              <ShieldAlert size={26} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-slate-900 mb-1">
                تنبيه قبل إغلاق البرنامج
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                هل تريد الاحتفاظ بنسخة احتياطية من بيانات العيادة (المرضى،
                المواعيد، الفواتير) قبل الخروج؟
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onExitWithBackup}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors shadow-sm cursor-pointer"
            >
              <Download size={15} />
              <span>نعم، حفظ نسخة احتياطية والخروج</span>
            </button>

            <button
              type="button"
              onClick={onExitWithoutBackup}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 hover:border-red-200 transition-colors cursor-pointer"
            >
              <LogOut size={15} />
              <span>الخروج بدون حفظ نسخة</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              إلغاء والبقاء في التطبيق
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
