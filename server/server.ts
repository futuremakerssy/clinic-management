import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

const PORT = process.env.LICENSE_SERVER_PORT || 3001
const ADMIN_SECRET = process.env.LICENSE_ADMIN_SECRET || "Admin_Clinic_Master_2026!"
const DATA_DIR = path.resolve(process.cwd(), "server_data")
const DB_FILE = path.join(DATA_DIR, "licenses_db.json")
const KEYS_FILE = path.join(DATA_DIR, "keys.json")

// ── Types ─────────────────────────────────────────────────────────────────────
export type SubscriptionStatus = "ACTIVE" | "EXPIRED" | "SUSPENDED" | "REVOKED" | "TRIAL"
export type SubscriptionPlan = "monthly" | "yearly" | "trial"

export interface DeviceRecord {
  id: string
  licenseId: string
  deviceId: string
  deviceName: string
  activatedAt: string
  lastSeenAt: string
  isActive: boolean
}

export interface LicenseRecord {
  id: string
  licenseKey: string
  planType: SubscriptionPlan
  maxDevices: number
  status: SubscriptionStatus
  createdAt: string
  startsAt: string
  expiresAt: string
  notes?: string
  devices: DeviceRecord[]
}

export interface ActivationLog {
  id: string
  licenseId: string
  deviceId: string
  action: string
  timestamp: string
  ip: string
}

export interface DatabaseState {
  licenses: LicenseRecord[]
  logs: ActivationLog[]
}

// ── Key Pair Management (ECDSA P-256) ─────────────────────────────────────────
interface KeyPairData {
  publicKeyJwk: JsonWebKey
  privateKeyJwk: JsonWebKey
}

let keyPair: KeyPairData

function initKeys(): KeyPairData {
  if (fs.existsSync(KEYS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(KEYS_FILE, "utf-8"))
    } catch {
      // Regenerate if corrupt
    }
  }

  // Generate ECDSA P-256 key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1", // P-256
  })

  const pubJwk = publicKey.export({ format: "jwk" }) as JsonWebKey
  const privJwk = privateKey.export({ format: "jwk" }) as JsonWebKey

  const keys: KeyPairData = {
    publicKeyJwk: pubJwk,
    privateKeyJwk: privJwk,
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), "utf-8")
  return keys
}

// Canonical JSON for signing
function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJson).join(",") + "]"
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  const entries = keys.map(
    (k) =>
      JSON.stringify(k) +
      ":" +
      canonicalJson((obj as Record<string, unknown>)[k]),
  )
  return "{" + entries.join(",") + "}"
}

// Sign payload using ECDSA P-256 Private Key
function signPayload(payload: unknown, privateKeyJwk: JsonWebKey): string {
  const dataStr = canonicalJson(payload)
  const privateKey = crypto.createPrivateKey({
    key: privateKeyJwk as any,
    format: "jwk",
  })
  const sign = crypto.createSign("SHA256")
  sign.update(dataStr)
  sign.end()
  return sign.sign(privateKey).toString("base64")
}

// ── Database Operations ───────────────────────────────────────────────────────
function initDb(): DatabaseState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"))
    } catch {
      // Re-seed if corrupted
    }
  }

  const now = new Date()
  const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
  const oneMonthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const fourteenDaysLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
  const thirtyFiveDaysAgo = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000)

  const defaultDb: DatabaseState = {
    licenses: [
      {
        id: "lic_year_001",
        licenseKey: "CLIN-2026-YEAR-0001",
        planType: "yearly",
        maxDevices: 1,
        status: "ACTIVE",
        createdAt: now.toISOString(),
        startsAt: now.toISOString(),
        expiresAt: oneYearLater.toISOString(),
        notes: "ترخيص سنوي للعيادة الرئيسية (جهاز واحد)",
        devices: [],
      },
      {
        id: "lic_month_002",
        licenseKey: "CLIN-2026-MONT-0002",
        planType: "monthly",
        maxDevices: 2,
        status: "ACTIVE",
        createdAt: now.toISOString(),
        startsAt: now.toISOString(),
        expiresAt: oneMonthLater.toISOString(),
        notes: "ترخيص شهري لجهازين (الاستقبال + الطبيب)",
        devices: [],
      },
      {
        id: "lic_trial_003",
        licenseKey: "CLIN-2026-TRIA-0003",
        planType: "trial",
        maxDevices: 1,
        status: "TRIAL",
        createdAt: now.toISOString(),
        startsAt: now.toISOString(),
        expiresAt: fourteenDaysLater.toISOString(),
        notes: "فترة تجريبية 14 يوم",
        devices: [],
      },
      {
        id: "lic_exp_004",
        licenseKey: "CLIN-2026-EXPR-0004",
        planType: "monthly",
        maxDevices: 1,
        status: "EXPIRED",
        createdAt: thirtyFiveDaysAgo.toISOString(),
        startsAt: thirtyFiveDaysAgo.toISOString(),
        expiresAt: fiveDaysAgo.toISOString(),
        notes: "ترخيص منتهي الصلاحية لاختبار شاشات التنبيه",
        devices: [],
      },
    ],
    logs: [],
  }

  saveDb(defaultDb)
  return defaultDb
}

function saveDb(db: DatabaseState): void {
  const tmpFile = DB_FILE + ".tmp"
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), "utf-8")
  fs.renameSync(tmpFile, DB_FILE)
}

function generateLicenseKey(prefix = "CLIN"): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const randSegment = () => {
    let s = ""
    for (let i = 0; i < 4; i++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return s
  }
  return `${prefix}-${randSegment()}-${randSegment()}-${randSegment()}`
}

// ── HTTP Request Helpers ──────────────────────────────────────────────────────
function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", (chunk) => (body += chunk))
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on("error", reject)
  })
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  data: unknown,
): void {
  const json = JSON.stringify(data)
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  })
  res.end(json)
}

// ── Main Server ───────────────────────────────────────────────────────────────
keyPair = initKeys()
let db = initDb()

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
  const pathname = url.pathname
  const method = req.method?.toUpperCase() || "GET"

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    })
    return res.end()
  }

  const clientIp =
    (req.headers["x-forwarded-for"] as string) ||
    req.socket.remoteAddress ||
    "127.0.0.1"

  try {
    // ── GET /api/health ───────────────────────────────────────────────────────
    if (method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, { status: "ok", timestamp: new Date().toISOString() })
    }

    // ── GET /api/license/public-key ───────────────────────────────────────────
    if (method === "GET" && pathname === "/api/license/public-key") {
      return sendJson(res, 200, {
        publicKeyJwk: keyPair.publicKeyJwk,
      })
    }

    // ── POST /api/license/activate ────────────────────────────────────────────
    if (method === "POST" && pathname === "/api/license/activate") {
      const body = await readJsonBody(req)
      const { licenseKey, deviceId, deviceName } = body

      if (!licenseKey || !deviceId) {
        return sendJson(res, 400, {
          success: false,
          error: "يرجى توفير مفتاح الترخيص ومعرف الجهاز (licenseKey & deviceId)",
        })
      }

      db = initDb()
      const cleanKey = licenseKey.trim().toUpperCase()
      const lic = db.licenses.find((l) => l.licenseKey.toUpperCase() === cleanKey)

      if (!lic) {
        return sendJson(res, 404, {
          success: false,
          error: "مفتاح الترخيص غير صالح. يرجى التأكد من الرمز المدخل",
        })
      }

      if (lic.status === "REVOKED") {
        return sendJson(res, 403, {
          success: false,
          error: "تم إلغاء هذا الترخيص من قبل المسؤول (Revoked)",
        })
      }

      if (lic.status === "SUSPENDED") {
        return sendJson(res, 403, {
          success: false,
          error: "هذا الترخيص معلق حالياً (Suspended). يرجى مراجعة الدعم",
        })
      }

      const now = new Date()
      const expDate = new Date(lic.expiresAt)
      if (now > expDate) {
        lic.status = "EXPIRED"
        saveDb(db)
        return sendJson(res, 403, {
          success: false,
          error: "انتهت صلاحية هذا الاشتراك. يرجى تجديد الترخيص",
        })
      }

      // Check device activation
      const activeDevices = lic.devices.filter((d) => d.isActive)
      let existingDevice = lic.devices.find((d) => d.deviceId === deviceId)

      if (!existingDevice) {
        if (activeDevices.length >= lic.maxDevices) {
          return sendJson(res, 409, {
            success: false,
            error: `هذا الترخيص مستخدم بالفعل على جهاز آخر ولا يسمح بأجهزة إضافية (الحد الأقصى: ${lic.maxDevices} جهاز)`,
            activeDevicesCount: activeDevices.length,
            maxDevices: lic.maxDevices,
          })
        }

        existingDevice = {
          id: "dev_" + Math.random().toString(36).substring(2, 9),
          licenseId: lic.id,
          deviceId,
          deviceName: deviceName || "جهاز غير مسمى",
          activatedAt: now.toISOString(),
          lastSeenAt: now.toISOString(),
          isActive: true,
        }
        lic.devices.push(existingDevice)
      } else {
        existingDevice.isActive = true
        existingDevice.lastSeenAt = now.toISOString()
        if (deviceName) existingDevice.deviceName = deviceName
      }

      // Add audit log
      db.logs.push({
        id: "log_" + Date.now(),
        licenseId: lic.id,
        deviceId,
        action: "activate",
        timestamp: now.toISOString(),
        ip: clientIp,
      })

      saveDb(db)

      // Sign Activation Token
      const tokenPayload = {
        licenseId: lic.id,
        licenseKey: lic.licenseKey,
        deviceId: existingDevice.deviceId,
        plan: lic.planType,
        status: lic.status,
        startsAt: lic.startsAt,
        expiresAt: lic.expiresAt,
        issuedAt: now.getTime(),
        gracePeriodDays: 7,
      }

      const signature = signPayload(tokenPayload, keyPair.privateKeyJwk)

      return sendJson(res, 200, {
        success: true,
        token: {
          payload: tokenPayload,
          signature,
        },
        license: {
          licenseKey: lic.licenseKey,
          planType: lic.planType,
          status: lic.status,
          expiresAt: lic.expiresAt,
          maxDevices: lic.maxDevices,
          activatedDevices: lic.devices.filter((d) => d.isActive).length,
        },
      })
    }

    // ── POST /api/license/validate or refresh ─────────────────────────────────
    if (
      method === "POST" &&
      (pathname === "/api/license/validate" || pathname === "/api/license/refresh")
    ) {
      const body = await readJsonBody(req)
      const { licenseKey, deviceId } = body

      db = initDb()
      const cleanKey = (licenseKey || "").trim().toUpperCase()
      const lic = db.licenses.find((l) => l.licenseKey.toUpperCase() === cleanKey)

      if (!lic) {
        return sendJson(res, 404, {
          success: false,
          error: "الترخيص غير موجود",
        })
      }

      const dev = lic.devices.find((d) => d.deviceId === deviceId && d.isActive)
      if (!dev) {
        return sendJson(res, 403, {
          success: false,
          error: "هذا الجهاز غير مفعل ضمن هذا الترخيص أو تم إلغاؤه من قبل المشرف",
        })
      }

      const now = new Date()
      dev.lastSeenAt = now.toISOString()

      // Check status
      if (now > new Date(lic.expiresAt)) {
        lic.status = "EXPIRED"
      }

      db.logs.push({
        id: "log_" + Date.now(),
        licenseId: lic.id,
        deviceId,
        action: pathname.includes("refresh") ? "refresh" : "validate",
        timestamp: now.toISOString(),
        ip: clientIp,
      })

      saveDb(db)

      const tokenPayload = {
        licenseId: lic.id,
        licenseKey: lic.licenseKey,
        deviceId: dev.deviceId,
        plan: lic.planType,
        status: lic.status,
        startsAt: lic.startsAt,
        expiresAt: lic.expiresAt,
        issuedAt: now.getTime(),
        gracePeriodDays: 7,
      }

      const signature = signPayload(tokenPayload, keyPair.privateKeyJwk)

      return sendJson(res, 200, {
        success: true,
        token: {
          payload: tokenPayload,
          signature,
        },
        license: {
          licenseKey: lic.licenseKey,
          planType: lic.planType,
          status: lic.status,
          expiresAt: lic.expiresAt,
          maxDevices: lic.maxDevices,
          activatedDevices: lic.devices.filter((d) => d.isActive).length,
        },
      })
    }

    // ── POST /api/license/deactivate ──────────────────────────────────────────
    if (method === "POST" && pathname === "/api/license/deactivate") {
      const body = await readJsonBody(req)
      const { licenseKey, deviceId } = body

      db = initDb()
      const cleanKey = (licenseKey || "").trim().toUpperCase()
      const lic = db.licenses.find((l) => l.licenseKey.toUpperCase() === cleanKey)

      if (lic) {
        const dev = lic.devices.find((d) => d.deviceId === deviceId)
        if (dev) {
          dev.isActive = false
          db.logs.push({
            id: "log_" + Date.now(),
            licenseId: lic.id,
            deviceId,
            action: "deactivate",
            timestamp: new Date().toISOString(),
            ip: clientIp,
          })
          saveDb(db)
        }
      }

      return sendJson(res, 200, {
        success: true,
        message: "تم إلغاء تفعيل الجهاز بنجاح وتحرير مقعد الترخيص",
      })
    }

    // ── GET /admin (Dedicated Web Admin Portal) ───────────────────────────────
    if (method === "GET" && (pathname === "/admin" || pathname === "/admin/")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      return res.end(getAdminPortalHtml())
    }

    // ── ADMIN AUTHENTICATION MIDDLEWARE ───────────────────────────────────────
    if (pathname.startsWith("/api/admin")) {
      if (pathname === "/api/admin/login" && method === "POST") {
        const body = await readJsonBody(req)
        if (body.password === ADMIN_SECRET) {
          return sendJson(res, 200, { success: true, token: ADMIN_SECRET })
        }
        return sendJson(res, 401, { success: false, error: "كلمة مرور المشرف غير صحيحة" })
      }

      const authHeader = req.headers["authorization"] || ""
      const keyHeader = (req.headers["x-admin-key"] as string) || ""
      const providedSecret = keyHeader || authHeader.replace(/^Bearer\s+/i, "")

      if (providedSecret !== ADMIN_SECRET) {
        return sendJson(res, 401, {
          success: false,
          error: "غير مصرح لك بالوصول إلى لوحة المشرف. مفتاح الأدمن غير صالح أو مفقود",
        })
      }
    }

    // ── ADMIN: GET /api/admin/licenses ────────────────────────────────────────
    if (method === "GET" && pathname === "/api/admin/licenses") {
      db = initDb()
      return sendJson(res, 200, {
        success: true,
        licenses: db.licenses,
      })
    }

    // ── ADMIN: POST /api/admin/licenses ───────────────────────────────────────
    if (method === "POST" && pathname === "/api/admin/licenses") {
      const body = await readJsonBody(req)
      const { planType, maxDevices, durationMonths, notes, customKey } = body

      db = initDb()
      const now = new Date()
      const months = durationMonths || (planType === "yearly" ? 12 : 1)
      const expiresAt = new Date(
        now.getTime() + months * 30 * 24 * 60 * 60 * 1000,
      ).toISOString()

      const newLicense: LicenseRecord = {
        id: "lic_" + Date.now().toString(36),
        licenseKey: customKey ? customKey.trim().toUpperCase() : generateLicenseKey(),
        planType: planType || "monthly",
        maxDevices: Number(maxDevices) || 1,
        status: planType === "trial" ? "TRIAL" : "ACTIVE",
        createdAt: now.toISOString(),
        startsAt: now.toISOString(),
        expiresAt,
        notes: notes || "",
        devices: [],
      }

      db.licenses.unshift(newLicense)
      saveDb(db)

      return sendJson(res, 201, {
        success: true,
        license: newLicense,
      })
    }

    // ── ADMIN: PATCH /api/admin/licenses/:id ──────────────────────────────────
    if (method === "PATCH" && pathname.startsWith("/api/admin/licenses/")) {
      const licId = pathname.replace("/api/admin/licenses/", "")
      const body = await readJsonBody(req)
      const { status, expiresAt, maxDevices, planType, extendMonths, notes } = body

      db = initDb()
      const lic = db.licenses.find((l) => l.id === licId)

      if (!lic) {
        return sendJson(res, 404, { success: false, error: "الترخيص غير موجود" })
      }

      if (status) lic.status = status
      if (maxDevices) lic.maxDevices = Number(maxDevices)
      if (planType) lic.planType = planType
      if (notes !== undefined) lic.notes = notes
      if (expiresAt) lic.expiresAt = expiresAt

      if (extendMonths) {
        const currentExp = new Date(lic.expiresAt).getTime()
        const baseTime = Math.max(currentExp, Date.now())
        lic.expiresAt = new Date(
          baseTime + Number(extendMonths) * 30 * 24 * 60 * 60 * 1000,
        ).toISOString()
        if (lic.status === "EXPIRED") {
          lic.status = "ACTIVE"
        }
      }

      saveDb(db)
      return sendJson(res, 200, { success: true, license: lic })
    }

    // ── ADMIN: DELETE /api/admin/licenses/:id/devices/:deviceId ───────────────
    if (
      method === "DELETE" &&
      pathname.match(/^\/api\/admin\/licenses\/([^/]+)\/devices\/([^/]+)$/)
    ) {
      const match = pathname.match(
        /^\/api\/admin\/licenses\/([^/]+)\/devices\/([^/]+)$/,
      )
      if (match) {
        const [, licId, deviceId] = match
        db = initDb()
        const lic = db.licenses.find((l) => l.id === licId)
        if (lic) {
          lic.devices = lic.devices.filter((d) => d.deviceId !== deviceId)
          saveDb(db)
          return sendJson(res, 200, {
            success: true,
            message: "تم فصل الجهاز بنجاح من الترخيص",
          })
        }
      }
      return sendJson(res, 404, { success: false, error: "الترخيص غير موجود" })
    }

    // 404
    return sendJson(res, 404, { error: "Endpoint not found" })
  } catch (err: any) {
    console.error("Server Error:", err)
    return sendJson(res, 500, {
      success: false,
      error: "حدث خطأ غير متوقع في خادم التراخيص",
      details: err?.message,
    })
  }
})

server.listen(Number(PORT), () => {
  console.log(`====================================================`)
  console.log(`🔐 License & Subscription Server running on port ${PORT}`)
  console.log(`API Base URL: http://localhost:${PORT}`)
  console.log(`Admin Web Dashboard: http://localhost:${PORT}/admin`)
  console.log(`Admin Secret: ${ADMIN_SECRET}`)
  console.log(`====================================================`)
})

function getAdminPortalHtml(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>لوحة إدارة التراخيص والاشتراكات - Clinic License Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>body { font-family: 'Tajawal', sans-serif; }</style>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen">
  <div id="login-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
    <div class="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
      <div class="w-16 h-16 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
        🔒
      </div>
      <h2 class="text-xl font-bold text-white mb-2">تسجيل دخول المشرف</h2>
      <p class="text-xs text-slate-400 mb-6">أدخل الرمز السري للوحة تحكم التراخيص (Admin Secret Key)</p>
      <form id="login-form" onsubmit="handleLogin(event)" class="space-y-4">
        <input type="password" id="admin-key-input" placeholder="أدخل رمز المشرف السري..." class="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white text-center focus:outline-none focus:border-blue-500" required />
        <button type="submit" class="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors shadow-lg">دخول لوحة التحكم</button>
      </form>
      <div id="login-error" class="text-red-400 text-xs mt-3 hidden">الرمز السري غير صحيح</div>
    </div>
  </div>

  <div id="dashboard" class="hidden">
    <header class="border-b border-slate-800 bg-slate-800/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-30">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white">🔐</div>
        <div>
          <h1 class="text-lg font-bold text-white">لوحة تحكم تراخيص العيادة</h1>
          <p class="text-xs text-slate-400">Clinic License & Subscription Management</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <button onclick="loadLicenses()" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-semibold">🔄 تحديث</button>
        <button onclick="logout()" class="px-3 py-1.5 bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/30 rounded-lg text-xs font-semibold">خروج</button>
      </div>
    </header>

    <main class="max-w-6xl mx-auto p-6 space-y-6">
      <!-- Create License Card -->
      <div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl">
        <h2 class="text-base font-bold text-white mb-4 flex items-center gap-2">
          <span>➕</span> إنشاء ترخيص جديد لعيادة
        </h2>
        <form onsubmit="handleCreate(event)" class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-xs text-slate-400 mb-1">نوع الخطة</label>
            <select id="plan-type" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-sm text-white">
              <option value="yearly">اشتراك سنوي (12 شهر)</option>
              <option value="monthly">اشتراك شهري (شهر واحد)</option>
              <option value="trial">فترة تجريبية (14 يوم)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">الحد الأقصى للأجهزة</label>
            <input type="number" id="max-devices" value="1" min="1" max="10" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-sm text-white" />
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">المدة بالشهور</label>
            <input type="number" id="duration-months" value="12" min="1" max="60" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-sm text-white" />
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1">ملاحظة / اسم العميل</label>
            <input type="text" id="license-notes" placeholder="د. فلان - عيادة..." class="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-sm text-white" />
          </div>
          <div class="md:col-span-4 flex justify-end">
            <button type="submit" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition-colors shadow">توليد الترخيص الآن</button>
          </div>
        </form>
      </div>

      <!-- Licenses List -->
      <div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-4">
        <div class="flex items-center justify-between border-b border-slate-700 pb-3">
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <span>📋</span> التراخيص المسجلة (<span id="lic-count">0</span>)
          </h2>
          <input type="text" id="search-input" oninput="filterLicenses()" placeholder="بحث عن مفتاح أو عميل..." class="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white" />
        </div>
        <div id="licenses-container" class="space-y-4"></div>
      </div>
    </main>
  </div>

  <script>
    let adminToken = localStorage.getItem('clinic_admin_token') || '';
    let allLicenses = [];

    if (adminToken) {
      document.getElementById('login-modal').classList.add('hidden');
      document.getElementById('dashboard').classList.remove('hidden');
      loadLicenses();
    }

    async function handleLogin(e) {
      e.preventDefault();
      const pwd = document.getElementById('admin-key-input').value.trim();
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();
      if (data.success) {
        adminToken = pwd;
        localStorage.setItem('clinic_admin_token', pwd);
        document.getElementById('login-modal').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        loadLicenses();
      } else {
        document.getElementById('login-error').classList.remove('hidden');
      }
    }

    function logout() {
      localStorage.removeItem('clinic_admin_token');
      location.reload();
    }

    async function loadLicenses() {
      try {
        const res = await fetch('/api/admin/licenses', {
          headers: { 'x-admin-key': adminToken }
        });
        if (res.status === 401) return logout();
        const data = await res.json();
        allLicenses = data.licenses || [];
        renderLicenses(allLicenses);
      } catch (err) {
        console.error(err);
      }
    }

    function renderLicenses(list) {
      document.getElementById('lic-count').innerText = list.length;
      const c = document.getElementById('licenses-container');
      if (list.length === 0) {
        c.innerHTML = '<div class="text-center py-8 text-slate-500 text-sm">لا توجد تراخيص</div>';
        return;
      }
      c.innerHTML = list.map(l => {
        const activeDevs = (l.devices || []).filter(d => d.isActive);
        const statusColors = {
          ACTIVE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
          TRIAL: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
          EXPIRED: 'bg-red-500/20 text-red-400 border-red-500/30',
          SUSPENDED: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
          REVOKED: 'bg-rose-900/40 text-rose-400 border-rose-800'
        };
        return \`
          <div class="bg-slate-900 border border-slate-700/80 rounded-xl p-4 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div class="flex items-center gap-3">
                <span class="font-mono text-base font-bold text-blue-400 tracking-wider">\${l.licenseKey}</span>
                <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold border \${statusColors[l.status] || ''}">\${l.status}</span>
                <span class="text-xs text-slate-400">(\${l.planType})</span>
              </div>
              <div class="flex items-center gap-2 text-xs">
                <button onclick="extendLicense('\${l.id}', 1)" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 text-slate-300 font-semibold">+1 شهر</button>
                <button onclick="extendLicense('\${l.id}', 12)" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 text-slate-300 font-semibold">+1 سنة</button>
                <button onclick="toggleStatus('\${l.id}', '\${l.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'}')" class="px-2.5 py-1 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 rounded border border-amber-500/30 font-semibold">\${l.status === 'SUSPENDED' ? 'تنشيط' : 'تعليق'}</button>
              </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-400">
              <div>الانتهاء: <span class="text-slate-200 font-semibold">\${new Date(l.expiresAt).toLocaleDateString('ar-SA')}</span></div>
              <div>الأجهزة: <span class="text-slate-200 font-semibold">\${activeDevs.length} / \${l.maxDevices}</span></div>
              <div class="md:col-span-2 truncate">ملاحظة: <span class="text-slate-300">\${l.notes || '—'}</span></div>
            </div>
            \${activeDevs.length > 0 ? \`
              <div class="pt-2 border-t border-slate-800">
                <div class="text-xs font-semibold text-slate-400 mb-1.5">الأجهزة المفعلة حالياً:</div>
                <div class="space-y-1.5">
                  \${activeDevs.map(d => \`
                    <div class="flex items-center justify-between text-xs bg-slate-800/80 px-3 py-2 rounded-lg border border-slate-700">
                      <div class="flex items-center gap-2">
                        <span>💻</span>
                        <span class="text-slate-200 font-medium">\${d.deviceName}</span>
                        <span class="font-mono text-slate-500 text-[11px]">(\${d.deviceId})</span>
                      </div>
                      <button onclick="disconnectDevice('\${l.id}', '\${d.deviceId}')" class="text-red-400 hover:text-red-300 font-bold text-xs flex items-center gap-1">❌ فصل الجهاز</button>
                    </div>
                  \`).join('')}
                </div>
              </div>
            \` : ''}
          </div>
        \`;
      }).join('');
    }

    function filterLicenses() {
      const q = document.getElementById('search-input').value.toLowerCase();
      const filtered = allLicenses.filter(l => l.licenseKey.toLowerCase().includes(q) || (l.notes || '').toLowerCase().includes(q));
      renderLicenses(filtered);
    }

    async function handleCreate(e) {
      e.preventDefault();
      const plan = document.getElementById('plan-type').value;
      const maxDevs = document.getElementById('max-devices').value;
      const duration = document.getElementById('duration-months').value;
      const notes = document.getElementById('license-notes').value;

      const res = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminToken },
        body: JSON.stringify({ planType: plan, maxDevices: Number(maxDevs), durationMonths: Number(duration), notes })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('license-notes').value = '';
        loadLicenses();
        alert('تم إنشاء مفتاح الترخيص الجديد: ' + data.license.licenseKey);
      }
    }

    async function extendLicense(id, months) {
      const res = await fetch('/api/admin/licenses/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminToken },
        body: JSON.stringify({ extendMonths: months })
      });
      if (res.ok) loadLicenses();
    }

    async function toggleStatus(id, status) {
      const res = await fetch('/api/admin/licenses/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminToken },
        body: JSON.stringify({ status })
      });
      if (res.ok) loadLicenses();
    }

    async function disconnectDevice(licId, devId) {
      if (!confirm('هل أنت متأكد من فصل هذا الجهاز؟ سيتم تحرير المقعد لترخيص جهاز جديد.')) return;
      const res = await fetch('/api/admin/licenses/' + licId + '/devices/' + devId, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminToken }
      });
      if (res.ok) loadLicenses();
    }
  </script>
</body>
</html>`;
}

export default server
