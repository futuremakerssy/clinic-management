import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

const PORT = process.env.LICENSE_SERVER_PORT || 3001
const ADMIN_SECRET =
  process.env.LICENSE_ADMIN_SECRET || "Admin_Clinic_Master_2026!"
const DATA_DIR = path.resolve(process.cwd(), "server_data")
const DB_FILE = path.join(DATA_DIR, "licenses_db.json")
const KEYS_FILE = path.join(DATA_DIR, "keys.json")

// ── Types ─────────────────────────────────────────────────────────────────────
export type SubscriptionStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "SUSPENDED"
  | "REVOKED"
  | "TRIAL"
export type SubscriptionPlanType = "monthly" | "yearly" | "trial" | "custom"

export interface DeviceRecord {
  id: string
  licenseId: string
  deviceId: string
  deviceName: string
  activatedAt: string
  lastSeenAt: string
  isActive: boolean
}

export interface Customer {
  id: string
  name: string
  phone: string
  email?: string
  notes?: string
  createdAt: string
  totalPaid: number
}

export interface SubscriptionPlan {
  id: string
  name: string
  description?: string
  durationDays: number
  price: number
  currency: string
  isActive: boolean
  createdAt: string
}

export interface Payment {
  id: string
  licenseId: string
  customerId?: string
  planId?: string
  amount: number
  currency: string
  paidAt: string
  note?: string
  adminId?: string
  type: "new" | "renewal"
}

export interface AuditLog {
  id: string
  action: string
  licenseId?: string
  customerId?: string
  details: string
  timestamp: string
  adminId?: string
}

export interface LicenseRecord {
  id: string
  licenseKey: string
  planType: SubscriptionPlanType
  planId?: string
  customerId?: string
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
  customers: Customer[]
  plans: SubscriptionPlan[]
  payments: Payment[]
  logs: ActivationLog[]
  auditLogs: AuditLog[]
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
      const existing = JSON.parse(fs.readFileSync(KEYS_FILE, "utf-8"))
      if (existing.publicKeyJwk && existing.privateKeyJwk) {
        return existing
      }
    } catch {
      // Regenerate if corrupt
    }
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
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

function signPayload(payload: unknown, privateKeyJwk: JsonWebKey): string {
  const dataStr = canonicalJson(payload)
  const privateKey = crypto.createPrivateKey({
    key: privateKeyJwk as any,
    format: "jwk",
  })
  const sign = crypto.createSign("SHA256")
  sign.update(dataStr)
  sign.end()
  return sign
    .sign({ key: privateKey, dsaEncoding: "ieee-p1363" })
    .toString("base64")
}

// ── Database Operations with Migration ────────────────────────────────────────
function initDb(): DatabaseState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  const now = new Date()
  const defaultPlans: SubscriptionPlan[] = [
    {
      id: "plan_trial_14d",
      name: "باقة تجريبية (14 يوم)",
      description: "فترة اختبار مجانية لكافة ميزات البرنامج",
      durationDays: 14,
      price: 0,
      currency: "USD",
      isActive: true,
      createdAt: now.toISOString(),
    },
    {
      id: "plan_monthly",
      name: "اشتراك شهري",
      description: "تجديد شهري مرن",
      durationDays: 30,
      price: 30,
      currency: "USD",
      isActive: true,
      createdAt: now.toISOString(),
    },
    {
      id: "plan_half_year",
      name: "اشتراك 6 أشهر",
      description: "باقة نصف سنوية بتوفير 15%",
      durationDays: 180,
      price: 150,
      currency: "USD",
      isActive: true,
      createdAt: now.toISOString(),
    },
    {
      id: "plan_yearly",
      name: "اشتراك سنوي (الأكثر طلباً)",
      description: "سنة كاملة مع دعم فني وتحديثات مستمرة",
      durationDays: 365,
      price: 250,
      currency: "USD",
      isActive: true,
      createdAt: now.toISOString(),
    },
  ]

  let loadedDb: Partial<DatabaseState> | null = null
  if (fs.existsSync(DB_FILE)) {
    try {
      loadedDb = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"))
    } catch {
      // Re-seed if corrupted
    }
  }

  const db: DatabaseState = {
    licenses: loadedDb?.licenses || [],
    customers: loadedDb?.customers || [],
    plans: loadedDb?.plans && loadedDb.plans.length > 0 ? loadedDb.plans : defaultPlans,
    payments: loadedDb?.payments || [],
    logs: loadedDb?.logs || [],
    auditLogs: loadedDb?.auditLogs || [],
  }

  // Seed default customer if empty and existing licenses exist
  if (db.customers.length === 0) {
    const defaultCust: Customer = {
      id: "cust_main_clinic",
      name: "العيادة الطبية الرئيسية",
      phone: "+963-999-000111",
      email: "clinic@example.com",
      notes: "العميل الافتراضي الأول للنظام",
      createdAt: now.toISOString(),
      totalPaid: 0,
    }
    db.customers.push(defaultCust)
    // Link unassigned licenses to this customer
    for (const lic of db.licenses) {
      if (!lic.customerId) {
        lic.customerId = defaultCust.id
      }
    }
  }

  // Calculate totalPaid for customers
  for (const c of db.customers) {
    const custPayments = db.payments.filter((p) => p.customerId === c.id)
    c.totalPaid = custPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
  }

  // Only save if the database file was just created
  if (!fs.existsSync(DB_FILE) || !loadedDb) {
    saveDb(db)
  }
  return db
}

function saveDb(db: DatabaseState): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8")
  } catch (err) {
    console.error("Failed to save licenses_db.json:", err)
  }
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

function addAuditLog(
  db: DatabaseState,
  action: string,
  details: string,
  licenseId?: string,
  customerId?: string,
  adminId = "admin",
): void {
  db.auditLogs.unshift({
    id: "aud_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 6),
    action,
    licenseId,
    customerId,
    details,
    timestamp: new Date().toISOString(),
    adminId,
  })
  // Keep last 1000 audit logs
  if (db.auditLogs.length > 1000) {
    db.auditLogs = db.auditLogs.slice(0, 1000)
  }
}

// ── HTTP Request Helpers ──────────────────────────────────────────────────────
function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = ""
    req.on("data", (chunk) => (body += chunk))
    req.on("end", () => {
      if (!body.trim()) return resolve({})
      try {
        resolve(JSON.parse(body))
      } catch {
        resolve({})
      }
    })
    req.on("error", () => resolve({}))
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-key",
  })
  res.end(json)
}

// ── Server Initialization ─────────────────────────────────────────────────────
keyPair = initKeys()
let db = initDb()

const server = http.createServer(async (req, res) => {
  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`,
  )
  const pathname = url.pathname
  const method = req.method?.toUpperCase() || "GET"

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-key",
    })
    return res.end()
  }

  const clientIp =
    (req.headers["x-forwarded-for"] as string) ||
    req.socket.remoteAddress ||
    "127.0.0.1"

  try {
    // ── Public API Endpoints ──────────────────────────────────────────────────
    if (method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, {
        status: "ok",
        timestamp: new Date().toISOString(),
        licensesCount: db.licenses.length,
      })
    }

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
      const lic = db.licenses.find(
        (l) => l.licenseKey.toUpperCase() === cleanKey,
      )

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

      // Add activation log
      db.logs.push({
        id: "log_" + Date.now(),
        licenseId: lic.id,
        deviceId,
        action: "activate",
        timestamp: now.toISOString(),
        ip: clientIp,
      })

      saveDb(db)

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
        publicKeyJwk: keyPair.publicKeyJwk,
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
      (pathname === "/api/license/validate" ||
        pathname === "/api/license/refresh")
    ) {
      const body = await readJsonBody(req)
      const { licenseKey, deviceId } = body

      db = initDb()
      const cleanKey = (licenseKey || "").trim().toUpperCase()
      const lic = db.licenses.find(
        (l) => l.licenseKey.toUpperCase() === cleanKey,
      )

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
        publicKeyJwk: keyPair.publicKeyJwk,
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
      const lic = db.licenses.find(
        (l) => l.licenseKey.toUpperCase() === cleanKey,
      )

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

    // ── Admin Web Portal View ─────────────────────────────────────────────────
    if (method === "GET" && (pathname === "/" || pathname === "")) {
      res.writeHead(302, { Location: "/admin" })
      return res.end()
    }

    if (method === "GET" && (pathname === "/admin" || pathname === "/admin/")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      return res.end(getAdminPortalHtml())
    }

    // ── ADMIN AUTHENTICATION ──────────────────────────────────────────────────
    if (pathname.startsWith("/api/admin")) {
      if (pathname === "/api/admin/login" && method === "POST") {
        const body = await readJsonBody(req)
        if (body.password === ADMIN_SECRET) {
          return sendJson(res, 200, { success: true, token: ADMIN_SECRET })
        }
        return sendJson(res, 401, {
          success: false,
          error: "كلمة مرور المشرف غير صحيحة",
        })
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

    // ── ADMIN: GET /api/admin/stats ───────────────────────────────────────────
    if (method === "GET" && pathname === "/api/admin/stats") {
      db = initDb()
      const now = new Date()
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

      const activeLicenses = db.licenses.filter((l) => l.status === "ACTIVE").length
      const expiredLicenses = db.licenses.filter(
        (l) => l.status === "EXPIRED" || new Date(l.expiresAt) < now,
      ).length
      const suspendedLicenses = db.licenses.filter((l) => l.status === "SUSPENDED").length
      const trialLicenses = db.licenses.filter((l) => l.status === "TRIAL").length

      const allDevices = db.licenses.flatMap((l) => l.devices || [])
      const activeDevices = allDevices.filter((d) => d.isActive).length

      // Expiring in next 30 days
      const expiringSoon = db.licenses.filter((l) => {
        const exp = new Date(l.expiresAt)
        return exp > now && exp <= thirtyDaysFromNow && l.status !== "REVOKED"
      })

      // Revenue by currency
      const revenueByCurrency: Record<string, number> = {}
      let totalRevenueUSD = 0
      for (const p of db.payments) {
        const curr = p.currency || "USD"
        revenueByCurrency[curr] = (revenueByCurrency[curr] || 0) + (p.amount || 0)
        if (curr === "USD") totalRevenueUSD += p.amount || 0
      }

      return sendJson(res, 200, {
        success: true,
        stats: {
          totalLicenses: db.licenses.length,
          activeLicenses,
          expiredLicenses,
          suspendedLicenses,
          trialLicenses,
          totalDevices: allDevices.length,
          activeDevices,
          totalCustomers: db.customers.length,
          totalPaymentsCount: db.payments.length,
          revenueByCurrency,
          totalRevenueUSD,
          expiringSoonCount: expiringSoon.length,
          expiringSoon: expiringSoon.map((l) => ({
            id: l.id,
            licenseKey: l.licenseKey,
            expiresAt: l.expiresAt,
            planType: l.planType,
            customerName:
              db.customers.find((c) => c.id === l.customerId)?.name || l.notes || "غير محدد",
            daysLeft: Math.ceil(
              (new Date(l.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
            ),
          })),
        },
      })
    }

    // ── ADMIN: CUSTOMERS API ──────────────────────────────────────────────────
    if (method === "GET" && pathname === "/api/admin/customers") {
      db = initDb()
      const enriched = db.customers.map((c) => {
        const lics = db.licenses.filter((l) => l.customerId === c.id)
        return {
          ...c,
          licensesCount: lics.length,
          activeLicensesCount: lics.filter((l) => l.status === "ACTIVE").length,
        }
      })
      return sendJson(res, 200, { success: true, customers: enriched })
    }

    if (method === "POST" && pathname === "/api/admin/customers") {
      const body = await readJsonBody(req)
      const { name, phone, email, notes } = body

      if (!name || !phone) {
        return sendJson(res, 400, {
          success: false,
          error: "اسم العميل/العيادة ورقم الهاتف حقول مطلوبة",
        })
      }

      db = initDb()
      const newCustomer: Customer = {
        id: "cust_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 6),
        name: name.trim(),
        phone: phone.trim(),
        email: email?.trim(),
        notes: notes?.trim(),
        createdAt: new Date().toISOString(),
        totalPaid: 0,
      }

      db.customers.unshift(newCustomer)
      addAuditLog(db, "customer_created", `تمت إضافة العميل الجديد: ${newCustomer.name}`, undefined, newCustomer.id)
      saveDb(db)

      return sendJson(res, 201, { success: true, customer: newCustomer })
    }

    if (method === "PATCH" && pathname.startsWith("/api/admin/customers/")) {
      const custId = pathname.replace("/api/admin/customers/", "")
      const body = await readJsonBody(req)
      db = initDb()
      const cust = db.customers.find((c) => c.id === custId)

      if (!cust) {
        return sendJson(res, 404, { success: false, error: "العميل غير موجود" })
      }

      if (body.name) cust.name = body.name.trim()
      if (body.phone) cust.phone = body.phone.trim()
      if (body.email !== undefined) cust.email = body.email.trim()
      if (body.notes !== undefined) cust.notes = body.notes.trim()

      addAuditLog(db, "customer_updated", `تم تحديث بيانات العميل: ${cust.name}`, undefined, cust.id)
      saveDb(db)

      return sendJson(res, 200, { success: true, customer: cust })
    }

    if (method === "DELETE" && pathname.startsWith("/api/admin/customers/")) {
      const custId = pathname.replace("/api/admin/customers/", "")
      db = initDb()
      const index = db.customers.findIndex((c) => c.id === custId)

      if (index === -1) {
        return sendJson(res, 404, { success: false, error: "العميل غير موجود" })
      }

      const deleted = db.customers.splice(index, 1)[0]
      // Unlink licenses
      for (const lic of db.licenses) {
        if (lic.customerId === custId) delete lic.customerId
      }

      addAuditLog(db, "customer_deleted", `تم حذف العميل: ${deleted.name}`, undefined, custId)
      saveDb(db)

      return sendJson(res, 200, { success: true, message: "تم حذف العميل بنجاح" })
    }

    // ── ADMIN: PLANS API ──────────────────────────────────────────────────────
    if (method === "GET" && pathname === "/api/admin/plans") {
      db = initDb()
      return sendJson(res, 200, { success: true, plans: db.plans })
    }

    if (method === "POST" && pathname === "/api/admin/plans") {
      const body = await readJsonBody(req)
      const { name, description, durationDays, price, currency, isActive } = body

      if (!name || durationDays === undefined || price === undefined) {
        return sendJson(res, 400, {
          success: false,
          error: "يرجى تعبئة اسم الخطة، عدد الأيام، والسعر",
        })
      }

      db = initDb()
      const newPlan: SubscriptionPlan = {
        id: "plan_" + Date.now().toString(36),
        name: name.trim(),
        description: description?.trim(),
        durationDays: Number(durationDays),
        price: Number(price),
        currency: currency?.trim().toUpperCase() || "USD",
        isActive: isActive !== false,
        createdAt: new Date().toISOString(),
      }

      db.plans.push(newPlan)
      addAuditLog(db, "plan_created", `تم إنشاء باقة اشتراك جديدة: ${newPlan.name}`)
      saveDb(db)

      return sendJson(res, 201, { success: true, plan: newPlan })
    }

    if (method === "PATCH" && pathname.startsWith("/api/admin/plans/")) {
      const planId = pathname.replace("/api/admin/plans/", "")
      const body = await readJsonBody(req)
      db = initDb()
      const plan = db.plans.find((p) => p.id === planId)

      if (!plan) {
        return sendJson(res, 404, { success: false, error: "الباقة غير موجودة" })
      }

      if (body.name) plan.name = body.name.trim()
      if (body.description !== undefined) plan.description = body.description.trim()
      if (body.durationDays !== undefined) plan.durationDays = Number(body.durationDays)
      if (body.price !== undefined) plan.price = Number(body.price)
      if (body.currency) plan.currency = body.currency.trim().toUpperCase()
      if (body.isActive !== undefined) plan.isActive = Boolean(body.isActive)

      addAuditLog(db, "plan_updated", `تم تحديث باقة: ${plan.name}`)
      saveDb(db)

      return sendJson(res, 200, { success: true, plan })
    }

    if (method === "DELETE" && pathname.startsWith("/api/admin/plans/")) {
      const planId = pathname.replace("/api/admin/plans/", "")
      db = initDb()
      const index = db.plans.findIndex((p) => p.id === planId)

      if (index === -1) {
        return sendJson(res, 404, { success: false, error: "الباقة غير موجودة" })
      }

      const deleted = db.plans.splice(index, 1)[0]
      addAuditLog(db, "plan_deleted", `تم حذف باقة: ${deleted.name}`)
      saveDb(db)

      return sendJson(res, 200, { success: true, message: "تم حذف الباقة بنجاح" })
    }

    // ── ADMIN: PAYMENTS API ───────────────────────────────────────────────────
    if (method === "GET" && pathname === "/api/admin/payments") {
      db = initDb()
      const enriched = db.payments.map((p) => {
        const lic = db.licenses.find((l) => l.id === p.licenseId)
        const cust = db.customers.find((c) => c.id === p.customerId)
        const plan = db.plans.find((pl) => pl.id === p.planId)
        return {
          ...p,
          licenseKey: lic?.licenseKey,
          customerName: cust?.name,
          planName: plan?.name,
        }
      })
      return sendJson(res, 200, { success: true, payments: enriched })
    }

    if (method === "POST" && pathname === "/api/admin/payments") {
      const body = await readJsonBody(req)
      const { licenseId, customerId, planId, amount, currency, note, type, extendDays } = body

      if (!licenseId || amount === undefined) {
        return sendJson(res, 400, {
          success: false,
          error: "يرجى تحديد الترخيص والمبلغ",
        })
      }

      db = initDb()
      const lic = db.licenses.find((l) => l.id === licenseId)
      if (!lic) {
        return sendJson(res, 404, { success: false, error: "الترخيص المحدد غير موجود" })
      }

      const now = new Date()
      const newPayment: Payment = {
        id: "PAY-" + now.getFullYear() + "-" + Math.random().toString(36).substring(2, 7).toUpperCase(),
        licenseId,
        customerId: customerId || lic.customerId,
        planId: planId || lic.planId,
        amount: Number(amount),
        currency: currency || "USD",
        paidAt: now.toISOString(),
        note: note || "",
        adminId: "admin",
        type: type || "renewal",
      }

      db.payments.unshift(newPayment)

      // Update customer total paid
      const cust = db.customers.find((c) => c.id === newPayment.customerId)
      if (cust) {
        cust.totalPaid = (cust.totalPaid || 0) + newPayment.amount
      }

      // Optionally extend license
      if (extendDays && Number(extendDays) > 0) {
        const curExp = new Date(lic.expiresAt).getTime()
        const baseTime = Math.max(curExp, now.getTime())
        lic.expiresAt = new Date(baseTime + Number(extendDays) * 24 * 60 * 60 * 1000).toISOString()
        if (lic.status === "EXPIRED") lic.status = "ACTIVE"
      }

      addAuditLog(
        db,
        "payment_added",
        `تم تسجيل دفعة بقيمة ${newPayment.amount} ${newPayment.currency} للترخيص ${lic.licenseKey}`,
        lic.id,
        newPayment.customerId,
      )
      saveDb(db)

      return sendJson(res, 201, { success: true, payment: newPayment, license: lic })
    }

    // ── ADMIN: REPORTS API (JSON & CSV) ───────────────────────────────────────
    if (method === "GET" && pathname === "/api/admin/reports") {
      db = initDb()
      const format = url.searchParams.get("format")

      // Aggregate revenue by month
      const monthlyRevenue: Record<string, { USD: number; count: number }> = {}
      for (const p of db.payments) {
        const month = p.paidAt.slice(0, 7) // YYYY-MM
        if (!monthlyRevenue[month]) monthlyRevenue[month] = { USD: 0, count: 0 }
        monthlyRevenue[month].USD += p.amount || 0
        monthlyRevenue[month].count += 1
      }

      // Aggregate revenue by plan
      const planRevenue: Record<string, { name: string; total: number; count: number }> = {}
      for (const p of db.payments) {
        const plan = db.plans.find((pl) => pl.id === p.planId)
        const pName = plan?.name || "باقة مخصصة"
        const pId = p.planId || "custom"
        if (!planRevenue[pId]) planRevenue[pId] = { name: pName, total: 0, count: 0 }
        planRevenue[pId].total += p.amount || 0
        planRevenue[pId].count += 1
      }

      // CSV Export
      if (format === "csv") {
        let csv = "\uFEFF" // UTF-8 BOM for Excel Arabic compatibility
        csv += "رقم الفاتورة,تاريخ الدفع,مفتاح الترخيص,العميل,الباقة,المبلغ,العملة,نوع العملية,ملاحظات\n"

        for (const p of db.payments) {
          const lic = db.licenses.find((l) => l.id === p.licenseId)
          const cust = db.customers.find((c) => c.id === p.customerId)
          const plan = db.plans.find((pl) => pl.id === p.planId)

          const row = [
            `"${p.id}"`,
            `"${p.paidAt.slice(0, 10)}"`,
            `"${lic?.licenseKey || ''}"`,
            `"${(cust?.name || '').replace(/"/g, '""')}"`,
            `"${(plan?.name || '').replace(/"/g, '""')}"`,
            p.amount,
            `"${p.currency}"`,
            `"${p.type === 'new' ? 'اشتراك جديد' : 'تجديد اشتراك'}"`,
            `"${(p.note || '').replace(/"/g, '""')}"`,
          ]
          csv += row.join(",") + "\n"
        }

        const buffer = Buffer.from(csv, "utf-8")
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="clinic-revenue-report.csv"',
          "Access-Control-Allow-Origin": "*",
          "Content-Length": buffer.length,
        })
        return res.end(buffer)
      }

      return sendJson(res, 200, {
        success: true,
        report: {
          monthlyRevenue,
          planRevenue,
          paymentsCount: db.payments.length,
          totalRevenueUSD: db.payments.reduce((sum, p) => sum + (p.amount || 0), 0),
        },
      })
    }

    // ── ADMIN: AUDIT LOGS API ─────────────────────────────────────────────────
    if (method === "GET" && pathname === "/api/admin/audit-logs") {
      db = initDb()
      return sendJson(res, 200, {
        success: true,
        auditLogs: db.auditLogs.slice(0, 100),
      })
    }

    // ── ADMIN: LICENSES API ───────────────────────────────────────────────────
    if (method === "GET" && pathname === "/api/admin/licenses") {
      db = initDb()
      const enriched = db.licenses.map((l) => {
        const cust = db.customers.find((c) => c.id === l.customerId)
        const plan = db.plans.find((p) => p.id === l.planId)
        return {
          ...l,
          customerName: cust?.name,
          customerPhone: cust?.phone,
          planName: plan?.name,
        }
      })
      return sendJson(res, 200, {
        success: true,
        licenses: enriched,
      })
    }

    if (method === "POST" && pathname === "/api/admin/licenses") {
      const body = await readJsonBody(req)
      const {
        planType,
        planId,
        customerId,
        maxDevices,
        durationMonths,
        durationDays,
        notes,
        customKey,
        paidAmount,
        currency,
      } = body

      db = initDb()
      const now = new Date()

      let days = 30
      if (durationDays) {
        days = Number(durationDays)
      } else if (durationMonths) {
        days = Number(durationMonths) * 30
      } else if (planId) {
        const matchedPlan = db.plans.find((p) => p.id === planId)
        if (matchedPlan) days = matchedPlan.durationDays
      } else if (planType === "yearly") {
        days = 365
      } else if (planType === "trial") {
        days = 14
      }

      const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()

      const newLicense: LicenseRecord = {
        id: "lic_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 6),
        licenseKey: customKey ? customKey.trim().toUpperCase() : generateLicenseKey(),
        planType: planType || "monthly",
        planId: planId || undefined,
        customerId: customerId || undefined,
        maxDevices: Number(maxDevices) || 1,
        status: planType === "trial" ? "TRIAL" : "ACTIVE",
        createdAt: now.toISOString(),
        startsAt: now.toISOString(),
        expiresAt,
        notes: notes || "",
        devices: [],
      }

      db.licenses.unshift(newLicense)

      // Automatic Payment Record if paidAmount is provided or > 0
      if (paidAmount !== undefined && Number(paidAmount) > 0) {
        const paymentRecord: Payment = {
          id: "PAY-" + now.getFullYear() + "-" + Math.random().toString(36).substring(2, 7).toUpperCase(),
          licenseId: newLicense.id,
          customerId: newLicense.customerId,
          planId: newLicense.planId,
          amount: Number(paidAmount),
          currency: currency || "USD",
          paidAt: now.toISOString(),
          note: `دفعة اشتراك عند إنشاء الترخيص (${newLicense.planType})`,
          adminId: "admin",
          type: "new",
        }
        db.payments.unshift(paymentRecord)

        if (newLicense.customerId) {
          const cust = db.customers.find((c) => c.id === newLicense.customerId)
          if (cust) cust.totalPaid = (cust.totalPaid || 0) + paymentRecord.amount
        }
      }

      addAuditLog(
        db,
        "license_created",
        `تم إصدار ترخيص جديد: ${newLicense.licenseKey} (الخطة: ${newLicense.planType})`,
        newLicense.id,
        newLicense.customerId,
      )
      saveDb(db)

      return sendJson(res, 201, {
        success: true,
        license: newLicense,
      })
    }

    if (method === "PATCH" && pathname.startsWith("/api/admin/licenses/")) {
      const licId = pathname.replace("/api/admin/licenses/", "")
      const body = await readJsonBody(req)
      const {
        status,
        expiresAt,
        maxDevices,
        planType,
        planId,
        customerId,
        extendMonths,
        extendDays,
        notes,
        renewalAmount,
        currency,
      } = body

      db = initDb()
      const lic = db.licenses.find((l) => l.id === licId)

      if (!lic) {
        return sendJson(res, 404, {
          success: false,
          error: "الترخيص غير موجود",
        })
      }

      if (status) {
        const oldStatus = lic.status
        lic.status = status
        addAuditLog(db, "status_change", `تغيير حالة الترخيص من ${oldStatus} إلى ${status}`, lic.id, lic.customerId)
      }
      if (maxDevices) lic.maxDevices = Number(maxDevices)
      if (planType) lic.planType = planType
      if (planId !== undefined) lic.planId = planId
      if (customerId !== undefined) lic.customerId = customerId
      if (notes !== undefined) lic.notes = notes
      if (expiresAt) lic.expiresAt = expiresAt

      const daysToAdd = extendDays ? Number(extendDays) : extendMonths ? Number(extendMonths) * 30 : 0
      if (daysToAdd > 0) {
        const currentExp = new Date(lic.expiresAt).getTime()
        const baseTime = Math.max(currentExp, Date.now())
        lic.expiresAt = new Date(baseTime + daysToAdd * 24 * 60 * 60 * 1000).toISOString()
        if (lic.status === "EXPIRED") {
          lic.status = "ACTIVE"
        }

        // Record payment for renewal if amount provided
        if (renewalAmount !== undefined && Number(renewalAmount) > 0) {
          const now = new Date()
          const paymentRecord: Payment = {
            id: "PAY-" + now.getFullYear() + "-" + Math.random().toString(36).substring(2, 7).toUpperCase(),
            licenseId: lic.id,
            customerId: lic.customerId,
            planId: lic.planId,
            amount: Number(renewalAmount),
            currency: currency || "USD",
            paidAt: now.toISOString(),
            note: `تجديد اشتراك الترخيص (${daysToAdd} يوم)`,
            adminId: "admin",
            type: "renewal",
          }
          db.payments.unshift(paymentRecord)

          if (lic.customerId) {
            const cust = db.customers.find((c) => c.id === lic.customerId)
            if (cust) cust.totalPaid = (cust.totalPaid || 0) + paymentRecord.amount
          }
        }

        addAuditLog(db, "license_extended", `تم تمديد الترخيص بمقدار ${daysToAdd} يوم`, lic.id, lic.customerId)
      }

      saveDb(db)
      return sendJson(res, 200, { success: true, license: lic })
    }

    if (
      method === "DELETE" &&
      pathname.match(/^\/api\/admin\/licenses\/([^/]+)\/devices\/([^/]+)$/)
    ) {
      const match = pathname.match(/^\/api\/admin\/licenses\/([^/]+)\/devices\/([^/]+)$/)
      if (match) {
        const [, licId, deviceId] = match
        db = initDb()
        const lic = db.licenses.find((l) => l.id === licId)
        if (lic) {
          const dev = lic.devices.find((d) => d.deviceId === deviceId)
          lic.devices = lic.devices.filter((d) => d.deviceId !== deviceId)
          addAuditLog(
            db,
            "device_disconnected",
            `تم فصل الجهاز (${dev?.deviceName || deviceId}) من الترخيص ${lic.licenseKey}`,
            lic.id,
            lic.customerId,
          )
          saveDb(db)
          return sendJson(res, 200, {
            success: true,
            message: "تم فصل الجهاز بنجاح من الترخيص وتحرير المقعد",
          })
        }
      }
      return sendJson(res, 404, { success: false, error: "الترخيص غير موجود" })
    }

    // 404 fallback
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

// ── HTML Web Admin Portal (Tailwind CSS, Tajawal Font, Multi-Tab) ─────────────
function getAdminPortalHtml(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>نظام إدارة التراخيص والاشتراكات - Clinic License Manager</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Tajawal', system-ui, -apple-system, sans-serif; background-color: #0b0f19; color: #f8fafc; }
    input, select, textarea, button { font-family: inherit; }
    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: #0f172a; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 9999px; }
  </style>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-blue-600 selection:text-white">

  <!-- Toast Notification Container -->
  <div id="toast-container" class="fixed top-5 left-5 z-[100] flex flex-col gap-2 pointer-events-none"></div>

  <!-- Login Modal -->
  <div id="login-modal" class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-6">
      <div class="w-16 h-16 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto text-3xl font-black">
        🛡️
      </div>
      <div>
        <h2 class="text-2xl font-black text-white">بوابة المشرف للترخيص</h2>
        <p class="text-xs text-slate-400 mt-1">إدارة الاشتراكات والعملاء والمدفوعات لتطبيق العيادات</p>
      </div>
      <form id="login-form" onsubmit="handleLogin(event)" class="space-y-4">
        <div>
          <input type="password" id="admin-key-input" placeholder="أدخل رمز المشرف السري (Admin Secret)..." class="w-full px-4 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-white text-center focus:outline-none focus:border-blue-500 transition-colors text-sm" required />
        </div>
        <button type="submit" class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-2xl transition shadow-lg shadow-blue-500/25 text-sm">تسجيل الدخول</button>
      </form>
      <div id="login-error" class="text-red-400 text-xs hidden bg-red-950/40 py-2 rounded-xl border border-red-900/50">رمز المشرف غير صحيح</div>
    </div>
  </div>

  <!-- Main App Layout -->
  <div id="app-layout" class="hidden min-h-screen flex flex-col">
    <!-- Top Header -->
    <header class="border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md px-6 py-3.5 flex items-center justify-between sticky top-0 z-40">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center font-black text-white shadow-md shadow-blue-500/20">
          🔐
        </div>
        <div>
          <h1 class="text-base font-black text-white flex items-center gap-2">
            منظومة إدارة التراخيص الطبية
            <span class="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold">PRO</span>
          </h1>
          <p class="text-[11px] text-slate-400">Clinic Licensing & Subscription Engine</p>
        </div>
      </div>
      
      <!-- Nav Tabs -->
      <nav class="hidden lg:flex items-center gap-1 bg-slate-950/60 p-1 rounded-2xl border border-slate-800">
        <button onclick="switchTab('dashboard')" id="tab-btn-dashboard" class="nav-tab active px-3.5 py-1.5 rounded-xl text-xs font-bold transition">📊 الرئيسية</button>
        <button onclick="switchTab('licenses')" id="tab-btn-licenses" class="nav-tab px-3.5 py-1.5 rounded-xl text-xs font-bold transition">🔑 التراخيص</button>
        <button onclick="switchTab('customers')" id="tab-btn-customers" class="nav-tab px-3.5 py-1.5 rounded-xl text-xs font-bold transition">👥 العملاء</button>
        <button onclick="switchTab('plans')" id="tab-btn-plans" class="nav-tab px-3.5 py-1.5 rounded-xl text-xs font-bold transition">📋 الباقات</button>
        <button onclick="switchTab('payments')" id="tab-btn-payments" class="nav-tab px-3.5 py-1.5 rounded-xl text-xs font-bold transition">💳 المدفوعات</button>
        <button onclick="switchTab('reports')" id="tab-btn-reports" class="nav-tab px-3.5 py-1.5 rounded-xl text-xs font-bold transition">📈 التقارير</button>
        <button onclick="switchTab('audit')" id="tab-btn-audit" class="nav-tab px-3.5 py-1.5 rounded-xl text-xs font-bold transition">📜 التدقيق</button>
      </nav>

      <div class="flex items-center gap-2.5">
        <button onclick="refreshCurrentTab()" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 text-slate-300">
          <span>🔄</span> تحديث
        </button>
        <button onclick="logout()" class="px-3 py-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl text-xs font-bold">
          خروج
        </button>
      </div>
    </header>

    <!-- Sub-header for Mobile Navigation -->
    <div class="lg:hidden flex overflow-x-auto gap-2 p-3 bg-slate-900 border-b border-slate-800 custom-scrollbar text-xs">
      <button onclick="switchTab('dashboard')" class="px-3 py-1.5 rounded-lg whitespace-nowrap bg-slate-800">📊 الرئيسية</button>
      <button onclick="switchTab('licenses')" class="px-3 py-1.5 rounded-lg whitespace-nowrap bg-slate-800">🔑 التراخيص</button>
      <button onclick="switchTab('customers')" class="px-3 py-1.5 rounded-lg whitespace-nowrap bg-slate-800">👥 العملاء</button>
      <button onclick="switchTab('plans')" class="px-3 py-1.5 rounded-lg whitespace-nowrap bg-slate-800">📋 الباقات</button>
      <button onclick="switchTab('payments')" class="px-3 py-1.5 rounded-lg whitespace-nowrap bg-slate-800">💳 المدفوعات</button>
      <button onclick="switchTab('reports')" class="px-3 py-1.5 rounded-lg whitespace-nowrap bg-slate-800">📈 التقارير</button>
      <button onclick="switchTab('audit')" class="px-3 py-1.5 rounded-lg whitespace-nowrap bg-slate-800">📜 التدقيق</button>
    </div>

    <!-- Main Content Area -->
    <main class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
      
      <!-- TAB 1: DASHBOARD -->
      <section id="tab-dashboard" class="tab-content space-y-6">
        <!-- KPI Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-slate-900 border border-slate-800/80 p-5 rounded-3xl relative overflow-hidden">
            <div class="text-xs text-slate-400 font-bold">التراخيص النشطة</div>
            <div id="stat-active-lic" class="text-3xl font-black text-emerald-400 mt-2">0</div>
            <div class="text-[11px] text-slate-500 mt-1">من إجمالي <span id="stat-total-lic">0</span> ترخيص</div>
            <div class="absolute top-4 left-4 text-2xl opacity-20">✅</div>
          </div>
          <div class="bg-slate-900 border border-slate-800/80 p-5 rounded-3xl relative overflow-hidden">
            <div class="text-xs text-slate-400 font-bold">إجمالي الإيرادات</div>
            <div id="stat-revenue" class="text-3xl font-black text-blue-400 mt-2">$0</div>
            <div class="text-[11px] text-slate-500 mt-1"><span id="stat-payments-count">0</span> عملية دفع مسجلة</div>
            <div class="absolute top-4 left-4 text-2xl opacity-20">💰</div>
          </div>
          <div class="bg-slate-900 border border-slate-800/80 p-5 rounded-3xl relative overflow-hidden">
            <div class="text-xs text-slate-400 font-bold">العملاء والعيادات</div>
            <div id="stat-customers" class="text-3xl font-black text-indigo-400 mt-2">0</div>
            <div class="text-[11px] text-slate-500 mt-1">عيادات مشتركة</div>
            <div class="absolute top-4 left-4 text-2xl opacity-20">🏥</div>
          </div>
          <div class="bg-slate-900 border border-slate-800/80 p-5 rounded-3xl relative overflow-hidden">
            <div class="text-xs text-slate-400 font-bold">الأجهزة المتصلة</div>
            <div id="stat-devices" class="text-3xl font-black text-amber-400 mt-2">0</div>
            <div class="text-[11px] text-slate-500 mt-1">حواسيب عيادة نشطة</div>
            <div class="absolute top-4 left-4 text-2xl opacity-20">💻</div>
          </div>
        </div>

        <!-- Expiring Soon Alert Banner -->
        <div id="expiring-soon-section" class="hidden bg-amber-950/30 border border-amber-800/40 rounded-3xl p-5 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <span>⚠️</span> اشتراكات تقترب من الانتهاء خلال 30 يوماً (<span id="expiring-count">0</span>)
            </div>
            <button onclick="switchTab('licenses')" class="text-xs text-amber-300 hover:underline">عرض الكل</button>
          </div>
          <div id="expiring-list" class="grid grid-cols-1 md:grid-cols-3 gap-3"></div>
        </div>

        <!-- Quick Actions & Recent Licenses -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="bg-slate-900 border border-slate-800/80 p-6 rounded-3xl space-y-4">
            <h3 class="font-bold text-sm text-white flex items-center gap-2">⚡ إجراءات سريعة</h3>
            <div class="space-y-2">
              <button onclick="openNewLicenseModal()" class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-xs flex items-center justify-between transition shadow">
                <span>➕ إنشاء ترخيص جديد</span>
                <span>←</span>
              </button>
              <button onclick="openCustomerModal()" class="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-2xl font-bold text-xs flex items-center justify-between transition">
                <span>👥 إضافة عميل أو عيادة</span>
                <span>←</span>
              </button>
              <button onclick="openPlanModal()" class="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-2xl font-bold text-xs flex items-center justify-between transition">
                <span>📋 إنشاء خطة اشتراك جديدة</span>
                <span>←</span>
              </button>
              <button onclick="downloadCsvReport()" class="w-full py-3 px-4 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 rounded-2xl font-bold text-xs flex items-center justify-between transition">
                <span>📥 تنزيل تقرير الإيرادات (CSV)</span>
                <span>Excel</span>
              </button>
            </div>
          </div>

          <div class="lg:col-span-2 bg-slate-900 border border-slate-800/80 p-6 rounded-3xl space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-sm text-white flex items-center gap-2">🔑 أحدث التراخيص المسجلة</h3>
              <button onclick="switchTab('licenses')" class="text-xs text-blue-400 hover:underline">عرض الكل</button>
            </div>
            <div id="recent-licenses-preview" class="space-y-2"></div>
          </div>
        </div>
      </section>

      <!-- TAB 2: LICENSES -->
      <section id="tab-licenses" class="tab-content hidden space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-4 rounded-3xl border border-slate-800">
          <div class="flex items-center gap-3 flex-1 min-w-[260px]">
            <input type="text" id="lic-search-input" oninput="filterLicenses()" placeholder="بحث عن مفتاح ترخيص أو عيادة..." class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white focus:outline-none focus:border-blue-500" />
            <select id="lic-status-filter" onchange="filterLicenses()" class="px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white">
              <option value="ALL">جميع الحالات</option>
              <option value="ACTIVE">نشط (ACTIVE)</option>
              <option value="EXPIRED">منتهٍ (EXPIRED)</option>
              <option value="SUSPENDED">معلق (SUSPENDED)</option>
              <option value="TRIAL">تجريبي (TRIAL)</option>
            </select>
          </div>
          <button onclick="openNewLicenseModal()" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-2xl shadow-lg transition flex items-center gap-2">
            <span>➕</span> إصدار ترخيص جديد
          </button>
        </div>
        <div id="licenses-list-container" class="space-y-3"></div>
      </section>

      <!-- TAB 3: CUSTOMERS -->
      <section id="tab-customers" class="tab-content hidden space-y-4">
        <div class="flex items-center justify-between bg-slate-900 p-4 rounded-3xl border border-slate-800">
          <div>
            <h2 class="text-base font-bold text-white">سجل العملاء والعيادات الطبية</h2>
            <p class="text-xs text-slate-400">إدارة حسابات المشتركين وتتبع تراخيصهم ومدفوعاتهم</p>
          </div>
          <button onclick="openCustomerModal()" class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-2xl shadow transition flex items-center gap-1.5">
            <span>➕</span> إضافة عميل جديد
          </button>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                <tr>
                  <th class="p-4 font-bold">اسم العيادة / العميل</th>
                  <th class="p-4 font-bold">رقم الهاتف</th>
                  <th class="p-4 font-bold">البريد الإلكتروني</th>
                  <th class="p-4 font-bold">عدد التراخيص</th>
                  <th class="p-4 font-bold">إجمالي المدفوعات</th>
                  <th class="p-4 font-bold text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody id="customers-table-body" class="divide-y divide-slate-800"></tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- TAB 4: PLANS -->
      <section id="tab-plans" class="tab-content hidden space-y-4">
        <div class="flex items-center justify-between bg-slate-900 p-4 rounded-3xl border border-slate-800">
          <div>
            <h2 class="text-base font-bold text-white">باقات وخطط الاشتراك</h2>
            <p class="text-xs text-slate-400">تحديد أسعار وفترات التراخيص التي تظهر عند التجديد أو الإصدار</p>
          </div>
          <button onclick="openPlanModal()" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-2xl shadow transition flex items-center gap-1.5">
            <span>➕</span> إنشاء باقة جديدة
          </button>
        </div>
        <div id="plans-grid" class="grid grid-cols-1 md:grid-cols-3 gap-4"></div>
      </section>

      <!-- TAB 5: PAYMENTS -->
      <section id="tab-payments" class="tab-content hidden space-y-4">
        <div class="flex items-center justify-between bg-slate-900 p-4 rounded-3xl border border-slate-800">
          <div>
            <h2 class="text-base font-bold text-white">سجل الفواتير والمدفوعات</h2>
            <p class="text-xs text-slate-400">تتبع المدفوعات الواردة وتجديدات الاشتراكات المالية</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="downloadCsvReport()" class="px-4 py-2 bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 rounded-2xl text-xs font-bold hover:bg-emerald-600/30 transition">
              📥 تصدير CSV
            </button>
            <button onclick="openPaymentModal()" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-bold transition">
              ➕ تسجيل دفعة
            </button>
          </div>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                <tr>
                  <th class="p-4 font-bold">رقم الفاتورة</th>
                  <th class="p-4 font-bold">تاريخ الدفع</th>
                  <th class="p-4 font-bold">العميل</th>
                  <th class="p-4 font-bold">مفتاح الترخيص</th>
                  <th class="p-4 font-bold">المبلغ</th>
                  <th class="p-4 font-bold">النوع</th>
                  <th class="p-4 font-bold">ملاحظات</th>
                </tr>
              </thead>
              <tbody id="payments-table-body" class="divide-y divide-slate-800"></tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- TAB 6: REPORTS -->
      <section id="tab-reports" class="tab-content hidden space-y-6">
        <div class="flex items-center justify-between bg-slate-900 p-5 rounded-3xl border border-slate-800">
          <div>
            <h2 class="text-base font-bold text-white">التقارير والإحصائيات المالية</h2>
            <p class="text-xs text-slate-400">تحليل المبيعات وتوزيع الإيرادات الشهرية والسنوية</p>
          </div>
          <button onclick="downloadCsvReport()" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-2xl shadow transition flex items-center gap-2">
            <span>📥</span> تحميل ملف الإكسل (CSV)
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4">
            <h3 class="font-bold text-sm text-white">الإيرادات حسب الشهر</h3>
            <div id="monthly-report-container" class="space-y-2"></div>
          </div>
          <div class="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4">
            <h3 class="font-bold text-sm text-white">الإيرادات حسب الباقات</h3>
            <div id="plan-report-container" class="space-y-2"></div>
          </div>
        </div>
      </section>

      <!-- TAB 7: AUDIT LOGS -->
      <section id="tab-audit" class="tab-content hidden space-y-4">
        <div class="bg-slate-900 p-4 rounded-3xl border border-slate-800">
          <h2 class="text-base font-bold text-white">سجل أمان العمليات والتدقيق (Audit Logs)</h2>
          <p class="text-xs text-slate-400">سجل زمني لجميع عمليات إنشاء التراخيص، تمديدها، إلغائها، وتعديل بيانات العملاء</p>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div class="overflow-x-auto">
            <table class="w-full text-right text-xs">
              <thead class="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                <tr>
                  <th class="p-4 font-bold">الوقت والتاريخ</th>
                  <th class="p-4 font-bold">نوع العملية</th>
                  <th class="p-4 font-bold">تفاصيل العملية</th>
                  <th class="p-4 font-bold">المنفذ</th>
                </tr>
              </thead>
              <tbody id="audit-table-body" class="divide-y divide-slate-800"></tbody>
            </table>
          </div>
        </div>
      </section>

    </main>
  </div>

  <!-- MODAL: CREATE / ISSUE NEW LICENSE -->
  <div id="new-license-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm hidden items-center justify-center p-4 z-50">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="font-black text-base text-white">➕ إصدار مفتاح ترخيص جديد</h3>
        <button onclick="closeModal('new-license-modal')" class="text-slate-400 hover:text-white">✕</button>
      </div>
      <form onsubmit="handleCreateLicense(event)" class="space-y-4 text-xs">
        <div>
          <label class="block text-slate-400 mb-1">اختيار العميل / العيادة</label>
          <select id="new-lic-customer" class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white focus:outline-none focus:border-blue-500"></select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-slate-400 mb-1">نوع الباقة</label>
            <select id="new-lic-plan" onchange="syncPlanSelection()" class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white focus:outline-none focus:border-blue-500"></select>
          </div>
          <div>
            <label class="block text-slate-400 mb-1">أقصى عدد أجهزة</label>
            <input type="number" id="new-lic-maxdevs" value="1" min="1" max="20" class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white focus:outline-none focus:border-blue-500" required />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-slate-400 mb-1">مدة الترخيص (أيام)</label>
            <input type="number" id="new-lic-days" value="365" min="1" max="3650" class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white focus:outline-none focus:border-blue-500" required />
          </div>
          <div>
            <label class="block text-slate-400 mb-1">المبلغ المدفوع ($)</label>
            <input type="number" id="new-lic-paid" value="0" min="0" step="any" class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white focus:outline-none focus:border-blue-500" />
          </div>
        </div>
        <div>
          <label class="block text-slate-400 mb-1">ملاحظات الترخيص</label>
          <input type="text" id="new-lic-notes" placeholder="ملاحظة خاصة بالعيادة..." class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white focus:outline-none focus:border-blue-500" />
        </div>
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button type="button" onclick="closeModal('new-license-modal')" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold">إلغاء</button>
          <button type="submit" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow">توليد وحفظ الترخيص</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: EXTEND LICENSE & RENEW -->
  <div id="extend-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm hidden items-center justify-center p-4 z-50">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="font-black text-base text-white">⏳ تمديد وتجديد الترخيص</h3>
        <button onclick="closeModal('extend-modal')" class="text-slate-400 hover:text-white">✕</button>
      </div>
      <form onsubmit="handleExtendSubmit(event)" class="space-y-4 text-xs">
        <input type="hidden" id="extend-lic-id" />
        <div>
          <label class="block text-slate-400 mb-1">مفتاح الترخيص</label>
          <input type="text" id="extend-lic-key" readonly class="w-full bg-slate-950/60 border border-slate-800 rounded-2xl p-3 text-blue-400 font-mono font-bold" />
        </div>
        <div>
          <label class="block text-slate-400 mb-1">فترة التمديد</label>
          <div class="grid grid-cols-4 gap-2 mb-2">
            <button type="button" onclick="setExtendDays(30)" class="py-2 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold">+1 شهر</button>
            <button type="button" onclick="setExtendDays(90)" class="py-2 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold">+3 أشهر</button>
            <button type="button" onclick="setExtendDays(180)" class="py-2 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold">+6 أشهر</button>
            <button type="button" onclick="setExtendDays(365)" class="py-2 bg-blue-600/30 text-blue-300 hover:bg-blue-600/50 rounded-xl font-bold">+1 سنة</button>
          </div>
          <input type="number" id="extend-days-input" value="30" min="1" class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white" />
        </div>
        <div>
          <label class="block text-slate-400 mb-1">تسجيل دفعة مالية للتجديد ($)</label>
          <input type="number" id="extend-amount-input" value="0" min="0" step="any" placeholder="0 إذا لم يتم الدفع الآن" class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white" />
        </div>
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button type="button" onclick="closeModal('extend-modal')" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold">إلغاء</button>
          <button type="submit" class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow">تأكيد التمديد</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: ADD / EDIT CUSTOMER -->
  <div id="customer-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm hidden items-center justify-center p-4 z-50">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 id="customer-modal-title" class="font-black text-base text-white">👥 إضافة عميل جديد</h3>
        <button onclick="closeModal('customer-modal')" class="text-slate-400 hover:text-white">✕</button>
      </div>
      <form onsubmit="handleCustomerSubmit(event)" class="space-y-4 text-xs">
        <input type="hidden" id="cust-edit-id" />
        <div>
          <label class="block text-slate-400 mb-1">اسم العيادة / الطبيب المسؤول *</label>
          <input type="text" id="cust-name-input" placeholder="عيادة د. أحمد الطبية..." required class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white" />
        </div>
        <div>
          <label class="block text-slate-400 mb-1">رقم الهاتف للتواصل *</label>
          <input type="text" id="cust-phone-input" placeholder="+963-999-000000" required class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white" />
        </div>
        <div>
          <label class="block text-slate-400 mb-1">البريد الإلكتروني (اختياري)</label>
          <input type="email" id="cust-email-input" placeholder="doctor@example.com" class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white" />
        </div>
        <div>
          <label class="block text-slate-400 mb-1">ملاحظات / المدينة</label>
          <input type="text" id="cust-notes-input" placeholder="دمشق - حي المزة..." class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white" />
        </div>
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button type="button" onclick="closeModal('customer-modal')" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold">إلغاء</button>
          <button type="submit" class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow">حفظ العميل</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: ADD / EDIT PLAN -->
  <div id="plan-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm hidden items-center justify-center p-4 z-50">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 id="plan-modal-title" class="font-black text-base text-white">📋 إضافة باقة اشتراك جديدة</h3>
        <button onclick="closeModal('plan-modal')" class="text-slate-400 hover:text-white">✕</button>
      </div>
      <form onsubmit="handlePlanSubmit(event)" class="space-y-4 text-xs">
        <input type="hidden" id="plan-edit-id" />
        <div>
          <label class="block text-slate-400 mb-1">اسم الباقة *</label>
          <input type="text" id="plan-name-input" placeholder="اشتراك سنوي VIP..." required class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-slate-400 mb-1">المدة بالأيام *</label>
            <input type="number" id="plan-days-input" value="365" min="1" required class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white" />
          </div>
          <div>
            <label class="block text-slate-400 mb-1">السعر *</label>
            <input type="number" id="plan-price-input" value="250" min="0" step="any" required class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white" />
          </div>
        </div>
        <div>
          <label class="block text-slate-400 mb-1">العملة</label>
          <select id="plan-currency-input" class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white">
            <option value="USD">دولار أمريكي (USD)</option>
            <option value="SYP">ليرة سورية (SYP)</option>
            <option value="SAR">ريال سعودي (SAR)</option>
            <option value="EUR">يورو (EUR)</option>
          </select>
        </div>
        <div>
          <label class="block text-slate-400 mb-1">وصف الباقة</label>
          <input type="text" id="plan-desc-input" placeholder="تفاصيل الميزات والدعم..." class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white" />
        </div>
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button type="button" onclick="closeModal('plan-modal')" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold">إلغاء</button>
          <button type="submit" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow">حفظ الباقة</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: ADD PAYMENT -->
  <div id="payment-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm hidden items-center justify-center p-4 z-50">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="font-black text-base text-white">💳 تسجيل دفعة مالية</h3>
        <button onclick="closeModal('payment-modal')" class="text-slate-400 hover:text-white">✕</button>
      </div>
      <form onsubmit="handlePaymentSubmit(event)" class="space-y-4 text-xs">
        <div>
          <label class="block text-slate-400 mb-1">الترخيص المعني *</label>
          <select id="pay-lic-select" required class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white"></select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-slate-400 mb-1">المبلغ *</label>
            <input type="number" id="pay-amount-input" value="50" min="0" step="any" required class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white" />
          </div>
          <div>
            <label class="block text-slate-400 mb-1">العملة</label>
            <select id="pay-currency-select" class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white">
              <option value="USD">USD</option>
              <option value="SYP">SYP</option>
              <option value="SAR">SAR</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-slate-400 mb-1">نوع العملية</label>
          <select id="pay-type-select" class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white">
            <option value="renewal">تجديد اشتراك (Renewal)</option>
            <option value="new">اشتراك جديد (New)</option>
          </select>
        </div>
        <div>
          <label class="block text-slate-400 mb-1">ملاحظة الفاتورة</label>
          <input type="text" id="pay-note-input" placeholder="تحويل بنكي / كاش..." class="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white" />
        </div>
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button type="button" onclick="closeModal('payment-modal')" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold">إلغاء</button>
          <button type="submit" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow">حفظ الفاتورة</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: CONNECTED DEVICES -->
  <div id="devices-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm hidden items-center justify-center p-4 z-50">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 class="font-black text-base text-white">💻 الأجهزة المربوطة بالترخيص</h3>
        <button onclick="closeModal('devices-modal')" class="text-slate-400 hover:text-white">✕</button>
      </div>
      <div id="devices-modal-content" class="space-y-2.5 text-xs max-h-96 overflow-y-auto custom-scrollbar"></div>
      <div class="flex justify-end pt-2 border-t border-slate-800">
        <button type="button" onclick="closeModal('devices-modal')" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold">إغلاق</button>
      </div>
    </div>
  </div>

  <!-- CLIENT SCRIPTS -->
  <script>
    let adminToken = localStorage.getItem('clinic_admin_token') || '';
    let currentTab = 'dashboard';
    let allLicenses = [];
    let allCustomers = [];
    let allPlans = [];
    let allPayments = [];

    // Toast Notification System (replaces alert popups)
    function showToast(message, type = 'info') {
      const c = document.getElementById('toast-container');
      const toast = document.createElement('div');
      const colors = {
        success: 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200',
        error: 'bg-rose-950/90 border-rose-500/50 text-rose-200',
        info: 'bg-blue-950/90 border-blue-500/50 text-blue-200'
      };
      const icons = { success: '✅', error: '❌', info: 'ℹ️' };
      toast.className = 'pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md text-xs font-bold transition-all duration-300 transform translate-y-0 ' + (colors[type] || colors.info);
      toast.innerHTML = '<span>' + (icons[type] || '•') + '</span><span>' + message + '</span>';
      c.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }

    if (adminToken) {
      document.getElementById('login-modal').classList.add('hidden');
      document.getElementById('app-layout').classList.remove('hidden');
      initApp();
    }

    async function handleLogin(e) {
      e.preventDefault();
      const pwd = document.getElementById('admin-key-input').value.trim();
      try {
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
          document.getElementById('app-layout').classList.remove('hidden');
          showToast('تم تسجيل الدخول بنجاح', 'success');
          initApp();
        } else {
          document.getElementById('login-error').classList.remove('hidden');
        }
      } catch {
        showToast('تعذر الاتصال بالخادم', 'error');
      }
    }

    function logout() {
      localStorage.removeItem('clinic_admin_token');
      location.reload();
    }

    async function adminFetch(endpoint, options = {}) {
      try {
        const res = await fetch(endpoint, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': adminToken,
            ...(options.headers || {})
          }
        });
        if (res.status === 401) {
          logout();
          return null;
        }
        return await res.json();
      } catch (err) {
        console.error('Fetch error:', err);
        return null;
      }
    }

    async function initApp() {
      await Promise.all([loadStats(), loadLicenses(), loadCustomers(), loadPlans(), loadPayments()]);
    }

    function refreshCurrentTab() {
      if (currentTab === 'dashboard') loadStats();
      else if (currentTab === 'licenses') loadLicenses();
      else if (currentTab === 'customers') loadCustomers();
      else if (currentTab === 'plans') loadPlans();
      else if (currentTab === 'payments') loadPayments();
      else if (currentTab === 'reports') loadReports();
      else if (currentTab === 'audit') loadAuditLogs();
      showToast('تم تحديث البيانات', 'info');
    }

    function switchTab(tabId) {
      currentTab = tabId;
      document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.nav-tab').forEach(el => {
        el.classList.remove('bg-blue-600', 'text-white');
        el.classList.add('text-slate-400');
      });
      const activeBtn = document.getElementById('tab-btn-' + tabId);
      if (activeBtn) {
        activeBtn.classList.add('bg-blue-600', 'text-white');
        activeBtn.classList.remove('text-slate-400');
      }
      const target = document.getElementById('tab-' + tabId);
      if (target) target.classList.remove('hidden');

      if (tabId === 'dashboard') loadStats();
      if (tabId === 'licenses') loadLicenses();
      if (tabId === 'customers') loadCustomers();
      if (tabId === 'plans') loadPlans();
      if (tabId === 'payments') loadPayments();
      if (tabId === 'reports') loadReports();
      if (tabId === 'audit') loadAuditLogs();
    }

    // Modal Helpers
    function openModal(id) { document.getElementById(id).classList.remove('hidden'); document.getElementById(id).classList.add('flex'); }
    function closeModal(id) { document.getElementById(id).classList.add('hidden'); document.getElementById(id).classList.remove('flex'); }

    // ── DASHBOARD ─────────────────────────────────────────────────────────────
    async function loadStats() {
      const data = await adminFetch('/api/admin/stats');
      if (!data || !data.success) return;
      const s = data.stats;
      document.getElementById('stat-active-lic').innerText = s.activeLicenses;
      document.getElementById('stat-total-lic').innerText = s.totalLicenses;
      document.getElementById('stat-revenue').innerText = '$' + s.totalRevenueUSD.toLocaleString();
      document.getElementById('stat-payments-count').innerText = s.totalPaymentsCount;
      document.getElementById('stat-customers').innerText = s.totalCustomers;
      document.getElementById('stat-devices').innerText = s.activeDevices;

      // Expiring soon section
      const expSec = document.getElementById('expiring-soon-section');
      const expList = document.getElementById('expiring-list');
      if (s.expiringSoonCount > 0) {
        expSec.classList.remove('hidden');
        document.getElementById('expiring-count').innerText = s.expiringSoonCount;
        expList.innerHTML = s.expiringSoon.slice(0, 6).map(item => \`
          <div class="bg-slate-900/90 border border-amber-800/40 p-3 rounded-2xl flex items-center justify-between text-xs">
            <div>
              <div class="font-mono font-bold text-amber-300">\${item.licenseKey}</div>
              <div class="text-[11px] text-slate-400">\${item.customerName}</div>
            </div>
            <span class="px-2 py-0.5 bg-amber-500/20 text-amber-300 font-bold rounded-lg text-[10px]">\${item.daysLeft} يوم متبقٍ</span>
          </div>
        \`).join('');
      } else {
        expSec.classList.add('hidden');
      }
    }

    // ── LICENSES ──────────────────────────────────────────────────────────────
    async function loadLicenses() {
      const data = await adminFetch('/api/admin/licenses');
      if (!data || !data.success) return;
      allLicenses = data.licenses || [];
      renderLicensesList(allLicenses);
      renderRecentLicenses(allLicenses);
    }

    function renderRecentLicenses(list) {
      const c = document.getElementById('recent-licenses-preview');
      if (!c) return;
      if (list.length === 0) {
        c.innerHTML = '<div class="text-slate-500 text-xs py-4 text-center">لا توجد تراخيص</div>';
        return;
      }
      c.innerHTML = list.slice(0, 4).map(l => {
        const badge = getStatusBadge(l.status);
        return \`
          <div class="flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs">
            <div class="flex items-center gap-2.5">
              <span class="font-mono font-bold text-blue-400">\${l.licenseKey}</span>
              <span class="text-slate-400 text-[11px]">(\${l.customerName || l.notes || 'غير مخصص'})</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border \${badge}">\${l.status}</span>
              <button onclick="copyToClipboard('\${l.licenseKey}')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px]">نسخ</button>
            </div>
          </div>
        \`;
      }).join('');
    }

    function renderLicensesList(list) {
      const c = document.getElementById('licenses-list-container');
      if (list.length === 0) {
        c.innerHTML = '<div class="text-slate-500 text-xs py-8 text-center bg-slate-900 rounded-3xl border border-slate-800">لا توجد تراخيص مطابقة للبحث</div>';
        return;
      }
      c.innerHTML = list.map(l => {
        const badge = getStatusBadge(l.status);
        const activeDevs = (l.devices || []).filter(d => d.isActive);
        const expDate = new Date(l.expiresAt).toLocaleDateString('ar-SA');
        return \`
          <div class="bg-slate-900 border border-slate-800/80 hover:border-slate-700 p-5 rounded-3xl space-y-3 transition">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 pb-3">
              <div class="flex items-center gap-3">
                <span class="font-mono text-sm sm:text-base font-black text-blue-400 tracking-wider select-all">\${l.licenseKey}</span>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black border \${badge}">\${l.status}</span>
                <span class="text-xs text-slate-400">\${l.planName || l.planType}</span>
              </div>
              <div class="flex items-center gap-1.5 text-xs">
                <button onclick="copyToClipboard('\${l.licenseKey}')" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-bold">📋 نسخ المفتاح</button>
                <button onclick="openExtendModal('\${l.id}', '\${l.licenseKey}')" class="px-2.5 py-1.5 bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 rounded-xl font-bold">⏳ تمديد</button>
                <button onclick="toggleLicenseStatus('\${l.id}', '\${l.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'}')" class="px-2.5 py-1.5 \${l.status === 'SUSPENDED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'} rounded-xl font-bold">
                  \${l.status === 'SUSPENDED' ? 'تنشيط' : 'تعليق'}
                </button>
                <button onclick="toggleLicenseStatus('\${l.id}', 'REVOKED')" class="px-2.5 py-1.5 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 rounded-xl font-bold">إلغاء نهائي</button>
              </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-400">
              <div>العيادة: <span class="text-slate-200 font-bold">\${l.customerName || l.notes || '—'}</span></div>
              <div>تاريخ الانتهاء: <span class="text-slate-200 font-bold">\${expDate}</span></div>
              <div>الأجهزة المستخدمة: <span class="text-slate-200 font-bold">\${activeDevs.length} / \${l.maxDevices}</span></div>
              <div class="flex justify-end">
                <button onclick="viewDevices('\${l.id}')" class="text-blue-400 hover:underline font-bold">عرض الأجهزة المربوطة (\${activeDevs.length}) ←</button>
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    function getStatusBadge(status) {
      if (status === 'ACTIVE') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      if (status === 'TRIAL') return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      if (status === 'EXPIRED') return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      if (status === 'SUSPENDED') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      return 'bg-slate-700/40 text-slate-400 border-slate-600';
    }

    function filterLicenses() {
      const q = (document.getElementById('lic-search-input')?.value || '').toLowerCase();
      const status = document.getElementById('lic-status-filter')?.value || 'ALL';
      const filtered = allLicenses.filter(l => {
        const matchesQ = l.licenseKey.toLowerCase().includes(q) || (l.customerName || '').toLowerCase().includes(q) || (l.notes || '').toLowerCase().includes(q);
        const matchesStatus = status === 'ALL' || l.status === status;
        return matchesQ && matchesStatus;
      });
      renderLicensesList(filtered);
    }

    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('تم نسخ المفتاح إلى الحافظة: ' + text, 'success');
      });
    }

    // ── CREATE LICENSE MODAL ──────────────────────────────────────────────────
    function openNewLicenseModal() {
      const custSel = document.getElementById('new-lic-customer');
      custSel.innerHTML = allCustomers.map(c => \`<option value="\${c.id}">\${c.name} (\${c.phone})</option>\`).join('');
      if (allCustomers.length === 0) {
        custSel.innerHTML = '<option value="">(لم يتم تسجيل عملاء بعد - سيتم ربطه لاحقاً)</option>';
      }
      const planSel = document.getElementById('new-lic-plan');
      planSel.innerHTML = allPlans.map(p => \`<option value="\${p.id}" data-days="\${p.durationDays}" data-price="\${p.price}">\${p.name} (\${p.price} \${p.currency})</option>\`).join('');
      syncPlanSelection();
      openModal('new-license-modal');
    }

    function syncPlanSelection() {
      const planSel = document.getElementById('new-lic-plan');
      const opt = planSel.options[planSel.selectedIndex];
      if (opt) {
        document.getElementById('new-lic-days').value = opt.getAttribute('data-days') || 30;
        document.getElementById('new-lic-paid').value = opt.getAttribute('data-price') || 0;
      }
    }

    async function handleCreateLicense(e) {
      e.preventDefault();
      const customerId = document.getElementById('new-lic-customer').value;
      const planId = document.getElementById('new-lic-plan').value;
      const maxDevices = document.getElementById('new-lic-maxdevs').value;
      const durationDays = document.getElementById('new-lic-days').value;
      const paidAmount = document.getElementById('new-lic-paid').value;
      const notes = document.getElementById('new-lic-notes').value;

      const res = await adminFetch('/api/admin/licenses', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          planId,
          maxDevices: Number(maxDevices),
          durationDays: Number(durationDays),
          paidAmount: Number(paidAmount),
          notes
        })
      });

      if (res && res.success) {
        closeModal('new-license-modal');
        showToast('تم إصدار الترخيص بنجاح: ' + res.license.licenseKey, 'success');
        await loadLicenses();
        await loadStats();
      } else {
        showToast(res?.error || 'فشل إصدار الترخيص', 'error');
      }
    }

    // ── EXTEND MODAL ──────────────────────────────────────────────────────────
    function openExtendModal(id, key) {
      document.getElementById('extend-lic-id').value = id;
      document.getElementById('extend-lic-key').value = key;
      document.getElementById('extend-days-input').value = 30;
      document.getElementById('extend-amount-input').value = 0;
      openModal('extend-modal');
    }

    function setExtendDays(d) {
      document.getElementById('extend-days-input').value = d;
    }

    async function handleExtendSubmit(e) {
      e.preventDefault();
      const id = document.getElementById('extend-lic-id').value;
      const days = document.getElementById('extend-days-input').value;
      const amount = document.getElementById('extend-amount-input').value;

      const res = await adminFetch('/api/admin/licenses/' + id, {
        method: 'PATCH',
        body: JSON.stringify({
          extendDays: Number(days),
          renewalAmount: Number(amount)
        })
      });

      if (res && res.success) {
        closeModal('extend-modal');
        showToast('تم تمديد صلاحية الترخيص بنجاح', 'success');
        loadLicenses();
        loadStats();
      } else {
        showToast('فشل تمديد الترخيص', 'error');
      }
    }

    async function toggleLicenseStatus(id, status) {
      if (status === 'REVOKED' && !confirm('هل أنت متأكد تماماً من إلغاء الترخيص؟ سيتم حجب التطبيق فوراً عند العميل.')) return;
      const res = await adminFetch('/api/admin/licenses/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      if (res && res.success) {
        showToast('تم تحديث حالة الترخيص إلى: ' + status, 'success');
        loadLicenses();
        loadStats();
      }
    }

    // ── DEVICES MODAL ─────────────────────────────────────────────────────────
    function viewDevices(licId) {
      const lic = allLicenses.find(l => l.id === licId);
      if (!lic) return;
      const c = document.getElementById('devices-modal-content');
      const activeDevs = (lic.devices || []).filter(d => d.isActive);
      if (activeDevs.length === 0) {
        c.innerHTML = '<div class="text-center py-6 text-slate-500">لا توجد أجهزة مفعلة حالياً ضمن هذا الترخيص</div>';
      } else {
        c.innerHTML = activeDevs.map(d => \`
          <div class="flex items-center justify-between bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <div>
              <div class="font-bold text-white flex items-center gap-1.5">
                <span>💻</span> \${d.deviceName}
              </div>
              <div class="text-[10px] font-mono text-slate-500 mt-0.5">\${d.deviceId}</div>
              <div class="text-[10px] text-slate-400 mt-1">آخر ظهور: \${new Date(d.lastSeenAt).toLocaleString('ar-SA')}</div>
            </div>
            <button onclick="disconnectDevice('\${lic.id}', '\${d.deviceId}')" class="px-3 py-1.5 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 rounded-xl font-bold">
              فصل الجهاز ✕
            </button>
          </div>
        \`).join('');
      }
      openModal('devices-modal');
    }

    async function disconnectDevice(licId, devId) {
      if (!confirm('هل تريد تحرير مقعد هذا الجهاز من الترخيص؟')) return;
      const res = await adminFetch('/api/admin/licenses/' + licId + '/devices/' + devId, {
        method: 'DELETE'
      });
      if (res && res.success) {
        showToast('تم فصل الجهاز بنجاح', 'success');
        closeModal('devices-modal');
        loadLicenses();
        loadStats();
      }
    }

    // ── CUSTOMERS ─────────────────────────────────────────────────────────────
    async function loadCustomers() {
      const data = await adminFetch('/api/admin/customers');
      if (!data || !data.success) return;
      allCustomers = data.customers || [];
      const tbody = document.getElementById('customers-table-body');
      if (!tbody) return;
      if (allCustomers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500">لم يتم تسجيل أي عميل بعد</td></tr>';
        return;
      }
      tbody.innerHTML = allCustomers.map(c => \`
        <tr class="hover:bg-slate-800/40 transition">
          <td class="p-4 font-bold text-white">\${c.name}</td>
          <td class="p-4 text-slate-300 font-mono">\${c.phone}</td>
          <td class="p-4 text-slate-400">\${c.email || '—'}</td>
          <td class="p-4"><span class="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-lg font-bold">\${c.licensesCount || 0} ترخيص</span></td>
          <td class="p-4 font-bold text-emerald-400">$\${(c.totalPaid || 0).toLocaleString()}</td>
          <td class="p-4 text-center">
            <button onclick="editCustomer('\${c.id}')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 font-bold ml-1">تعديل</button>
            <button onclick="deleteCustomer('\${c.id}')" class="px-2.5 py-1 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 rounded-lg font-bold">حذف</button>
          </td>
        </tr>
      \`).join('');
    }

    function openCustomerModal(id = null) {
      document.getElementById('cust-edit-id').value = id || '';
      document.getElementById('customer-modal-title').innerText = id ? 'تعديل بيانات العميل' : '👥 إضافة عميل جديد';
      if (id) {
        const c = allCustomers.find(item => item.id === id);
        if (c) {
          document.getElementById('cust-name-input').value = c.name;
          document.getElementById('cust-phone-input').value = c.phone;
          document.getElementById('cust-email-input').value = c.email || '';
          document.getElementById('cust-notes-input').value = c.notes || '';
        }
      } else {
        document.getElementById('cust-name-input').value = '';
        document.getElementById('cust-phone-input').value = '';
        document.getElementById('cust-email-input').value = '';
        document.getElementById('cust-notes-input').value = '';
      }
      openModal('customer-modal');
    }

    function editCustomer(id) { openCustomerModal(id); }

    async function handleCustomerSubmit(e) {
      e.preventDefault();
      const id = document.getElementById('cust-edit-id').value;
      const body = {
        name: document.getElementById('cust-name-input').value,
        phone: document.getElementById('cust-phone-input').value,
        email: document.getElementById('cust-email-input').value,
        notes: document.getElementById('cust-notes-input').value
      };

      const res = await adminFetch(id ? '/api/admin/customers/' + id : '/api/admin/customers', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(body)
      });

      if (res && res.success) {
        closeModal('customer-modal');
        showToast(id ? 'تم تعديل العميل بنجاح' : 'تمت إضافة العميل بنجاح', 'success');
        loadCustomers();
        loadStats();
      } else {
        showToast(res?.error || 'فشل حفظ بيانات العميل', 'error');
      }
    }

    async function deleteCustomer(id) {
      if (!confirm('هل تريد حذف هذا العميل؟ سيتم فك ربط تراخيصه.')) return;
      const res = await adminFetch('/api/admin/customers/' + id, { method: 'DELETE' });
      if (res && res.success) {
        showToast('تم حذف العميل بنجاح', 'success');
        loadCustomers();
        loadStats();
      }
    }

    // ── PLANS ─────────────────────────────────────────────────────────────────
    async function loadPlans() {
      const data = await adminFetch('/api/admin/plans');
      if (!data || !data.success) return;
      allPlans = data.plans || [];
      const g = document.getElementById('plans-grid');
      if (!g) return;
      g.innerHTML = allPlans.map(p => \`
        <div class="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4 relative overflow-hidden">
          <div class="flex items-center justify-between">
            <span class="font-black text-sm text-white">\${p.name}</span>
            <span class="text-xs px-2 py-0.5 rounded-full font-bold \${p.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}">
              \${p.isActive ? 'مفعلة' : 'معطلة'}
            </span>
          </div>
          <div class="text-2xl font-black text-blue-400">
            $\${p.price} <span class="text-xs font-bold text-slate-400">\${p.currency} / \${p.durationDays} يوم</span>
          </div>
          <p class="text-xs text-slate-400 min-h-[36px]">\${p.description || 'باقة قياسية للعيادات'}</p>
          <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button onclick="deletePlan('\${p.id}')" class="px-3 py-1.5 bg-rose-500/10 text-rose-400 rounded-xl text-xs font-bold hover:bg-rose-500/20">حذف</button>
          </div>
        </div>
      \`).join('');
    }

    function openPlanModal() {
      document.getElementById('plan-edit-id').value = '';
      document.getElementById('plan-name-input').value = '';
      document.getElementById('plan-days-input').value = 365;
      document.getElementById('plan-price-input').value = 250;
      document.getElementById('plan-desc-input').value = '';
      openModal('plan-modal');
    }

    async function handlePlanSubmit(e) {
      e.preventDefault();
      const body = {
        name: document.getElementById('plan-name-input').value,
        durationDays: Number(document.getElementById('plan-days-input').value),
        price: Number(document.getElementById('plan-price-input').value),
        currency: document.getElementById('plan-currency-input').value,
        description: document.getElementById('plan-desc-input').value
      };
      const res = await adminFetch('/api/admin/plans', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (res && res.success) {
        closeModal('plan-modal');
        showToast('تمت إضافة باقة الاشتراك بنجاح', 'success');
        loadPlans();
      } else {
        showToast(res?.error || 'فشل حفظ الباقة', 'error');
      }
    }

    async function deletePlan(id) {
      if (!confirm('هل تريد حذف هذه الباقة؟')) return;
      const res = await adminFetch('/api/admin/plans/' + id, { method: 'DELETE' });
      if (res && res.success) {
        showToast('تم حذف الباقة بنجاح', 'success');
        loadPlans();
      }
    }

    // ── PAYMENTS ──────────────────────────────────────────────────────────────
    async function loadPayments() {
      const data = await adminFetch('/api/admin/payments');
      if (!data || !data.success) return;
      allPayments = data.payments || [];
      const tbody = document.getElementById('payments-table-body');
      if (!tbody) return;
      if (allPayments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-500">لا توجد مدفوعات مسجلة بعد</td></tr>';
        return;
      }
      tbody.innerHTML = allPayments.map(p => \`
        <tr class="hover:bg-slate-800/40 transition">
          <td class="p-4 font-mono font-bold text-blue-400">\${p.id}</td>
          <td class="p-4 text-slate-300">\${new Date(p.paidAt).toLocaleDateString('ar-SA')}</td>
          <td class="p-4 font-bold text-white">\${p.customerName || '—'}</td>
          <td class="p-4 font-mono text-slate-400">\${p.licenseKey || '—'}</td>
          <td class="p-4 font-black text-emerald-400">$\${p.amount} \${p.currency}</td>
          <td class="p-4"><span class="px-2 py-0.5 rounded-lg text-[10px] font-bold \${p.type === 'new' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}">\${p.type === 'new' ? 'اشتراك جديد' : 'تجديد'}</span></td>
          <td class="p-4 text-slate-400">\${p.note || '—'}</td>
        </tr>
      \`).join('');
    }

    function openPaymentModal() {
      const sel = document.getElementById('pay-lic-select');
      sel.innerHTML = allLicenses.map(l => \`<option value="\${l.id}">\${l.licenseKey} - \${l.customerName || l.notes || 'غير مسمى'}</option>\`).join('');
      openModal('payment-modal');
    }

    async function handlePaymentSubmit(e) {
      e.preventDefault();
      const body = {
        licenseId: document.getElementById('pay-lic-select').value,
        amount: Number(document.getElementById('pay-amount-input').value),
        currency: document.getElementById('pay-currency-select').value,
        type: document.getElementById('pay-type-select').value,
        note: document.getElementById('pay-note-input').value
      };
      const res = await adminFetch('/api/admin/payments', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (res && res.success) {
        closeModal('payment-modal');
        showToast('تم تسجيل الفاتورة بنجاح', 'success');
        loadPayments();
        loadStats();
      } else {
        showToast(res?.error || 'فشل تسجيل الفاتورة', 'error');
      }
    }

    // ── REPORTS ───────────────────────────────────────────────────────────────
    async function loadReports() {
      const data = await adminFetch('/api/admin/reports');
      if (!data || !data.success) return;
      const r = data.report;

      const mContainer = document.getElementById('monthly-report-container');
      const months = Object.keys(r.monthlyRevenue);
      if (months.length === 0) {
        mContainer.innerHTML = '<div class="text-slate-500 text-xs text-center py-4">لا توجد بيانات شهرية</div>';
      } else {
        mContainer.innerHTML = months.map(m => {
          const item = r.monthlyRevenue[m];
          return \`
            <div class="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-800 text-xs">
              <span class="font-mono font-bold text-slate-300">\${m}</span>
              <div class="flex items-center gap-3">
                <span class="text-slate-500">\${item.count} عملية</span>
                <span class="font-black text-emerald-400">$\${item.USD.toLocaleString()}</span>
              </div>
            </div>
          \`;
        }).join('');
      }

      const pContainer = document.getElementById('plan-report-container');
      const plans = Object.keys(r.planRevenue);
      if (plans.length === 0) {
        pContainer.innerHTML = '<div class="text-slate-500 text-xs text-center py-4">لا توجد بيانات للباقات</div>';
      } else {
        pContainer.innerHTML = plans.map(pId => {
          const item = r.planRevenue[pId];
          return \`
            <div class="flex items-center justify-between p-3 bg-slate-950 rounded-2xl border border-slate-800 text-xs">
              <span class="font-bold text-slate-300">\${item.name}</span>
              <div class="flex items-center gap-3">
                <span class="text-slate-500">\${item.count} ترخيص</span>
                <span class="font-black text-blue-400">$\${item.total.toLocaleString()}</span>
              </div>
            </div>
          \`;
        }).join('');
      }
    }

    function downloadCsvReport() {
      window.open('/api/admin/reports?format=csv', '_blank');
      showToast('جاري تصدير ملف CSV...', 'info');
    }

    // ── AUDIT LOGS ────────────────────────────────────────────────────────────
    async function loadAuditLogs() {
      const data = await adminFetch('/api/admin/audit-logs');
      if (!data || !data.success) return;
      const tbody = document.getElementById('audit-table-body');
      if (!tbody) return;
      tbody.innerHTML = (data.auditLogs || []).map(a => \`
        <tr class="hover:bg-slate-800/40 transition">
          <td class="p-4 text-slate-400 font-mono text-[11px]">\${new Date(a.timestamp).toLocaleString('ar-SA')}</td>
          <td class="p-4 font-bold text-blue-400">\${a.action}</td>
          <td class="p-4 text-slate-200">\${a.details}</td>
          <td class="p-4 text-slate-500 text-[11px]">\${a.adminId || 'admin'}</td>
        </tr>
      \`).join('');
    }
  </script>
</body>
</html>`
}

export default server
