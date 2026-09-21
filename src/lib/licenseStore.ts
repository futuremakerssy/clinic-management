import type {
  LocalLicenseState,
  ActivationToken,
  SubscriptionStatus,
} from "../types"
import { verifySignature } from "./crypto"
import { getDeviceFingerprint } from "./fingerprint"

const LICENSE_STORAGE_KEY = "clinic_license_state"
const DEFAULT_GRACE_PERIOD_DAYS = 7

const DEFAULT_STATE: LocalLicenseState = {
  licenseKey: null,
  token: null,
  status: "EXPIRED",
  plan: null,
  expiresAt: null,
  startsAt: null,
  lastVerifiedTimestamp: 0,
  lastKnownSystemTime: 0,
  deviceId: "",
  deviceName: "",
  offlineGraceDays: DEFAULT_GRACE_PERIOD_DAYS,
  isOfflineGraceValid: false,
  isExpired: true,
  clockTampered: false,
  publicKeyJwk: undefined,
}

function loadState(): LocalLicenseState {
  try {
    const raw = localStorage.getItem(LICENSE_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_STATE }
    return { ...DEFAULT_STATE, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

function saveState(state: LocalLicenseState): void {
  try {
    localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(state))
  } catch (err) {
    console.error("Failed to save license state:", err)
  }
}

export const licenseStore = {
  get: (): LocalLicenseState => {
    const state = loadState()
    const now = Date.now()

    // ── Clock Tamper Detection ──────────────────────────────────────────
    // If current system time has been turned backwards by more than 5 minutes
    // compared to the highest recorded system time, flag clock tampering!
    let clockTampered = state.clockTampered
    if (
      state.lastKnownSystemTime > 0 &&
      now < state.lastKnownSystemTime - 5 * 60 * 1000
    ) {
      clockTampered = true
    } else {
      state.lastKnownSystemTime = Math.max(state.lastKnownSystemTime || 0, now)
    }

    // ── Offline Grace Period Calculation (7 days) ───────────────────────
    const graceMs =
      (state.offlineGraceDays || DEFAULT_GRACE_PERIOD_DAYS) *
      24 *
      60 *
      60 *
      1000
    const timeSinceVerification = now - (state.lastVerifiedTimestamp || 0)
    const isOfflineGraceValid =
      state.lastVerifiedTimestamp > 0 && timeSinceVerification <= graceMs

    // ── Expiration Check ────────────────────────────────────────────────
    let isExpired = true
    if (state.expiresAt) {
      const expDate = new Date(state.expiresAt).getTime()
      isExpired = now > expDate
    }

    let effectiveStatus: SubscriptionStatus = state.status || "EXPIRED"
    if (!state.token || !state.licenseKey) {
      effectiveStatus = "EXPIRED"
    } else if (isExpired) {
      effectiveStatus = "EXPIRED"
    } else if (clockTampered) {
      effectiveStatus = "SUSPENDED"
    }

    const updatedState: LocalLicenseState = {
      ...state,
      clockTampered,
      isOfflineGraceValid,
      isExpired,
      status: effectiveStatus,
    }

    saveState(updatedState)
    return updatedState
  },

  update: (partial: Partial<LocalLicenseState>): LocalLicenseState => {
    const current = loadState()
    const updated = { ...current, ...partial }
    saveState(updated)
    return licenseStore.get()
  },

  applyActivation: (
    token: ActivationToken,
    deviceId: string,
    deviceName: string,
    publicKeyJwk?: JsonWebKey,
  ): LocalLicenseState => {
    const now = Date.now()
    const payload = token.payload
    const current = loadState()

    const newState: LocalLicenseState = {
      licenseKey: payload.licenseKey,
      token,
      status: payload.status,
      plan: payload.plan,
      startsAt: payload.startsAt,
      expiresAt: payload.expiresAt,
      lastVerifiedTimestamp: now,
      lastKnownSystemTime: Math.max(now, payload.issuedAt || now),
      deviceId,
      deviceName,
      offlineGraceDays: payload.gracePeriodDays || DEFAULT_GRACE_PERIOD_DAYS,
      isOfflineGraceValid: true,
      isExpired: new Date(payload.expiresAt).getTime() < now,
      clockTampered: false,
      publicKeyJwk: publicKeyJwk || current.publicKeyJwk,
      lastErrorMessage: undefined,
    }

    saveState(newState)
    return licenseStore.get()
  },

  clearActivation: (): void => {
    const current = loadState()
    saveState({
      ...DEFAULT_STATE,
      deviceId: current.deviceId,
      deviceName: current.deviceName,
    })
  },

  /**
   * Performs complete local cryptographic verification of the license.
   * Runs offline without contacting the server.
   */
  verifyOffline: async (): Promise<{
    isValid: boolean
    status: SubscriptionStatus
    reason?: string
  }> => {
    const state = licenseStore.get()

    if (!state.licenseKey || !state.token) {
      return {
        isValid: false,
        status: "EXPIRED",
        reason: "لم يتم تفعيل ترخيص على هذا الجهاز بعد",
      }
    }

    // 1. Clock tampering
    if (state.clockTampered) {
      return {
        isValid: false,
        status: "SUSPENDED",
        reason:
          "تم اكتشاف تعديل غير طبيعي في ساعة النظام. يرجى الاتصال بالإنترنت لإعادة التحقق",
      }
    }

    // 2. Hardware Device Binding check (anti-clone)
    const currentDevice = await getDeviceFingerprint()
    if (state.token.payload.deviceId !== currentDevice.deviceId) {
      return {
        isValid: false,
        status: "REVOKED",
        reason:
          "هذا الترخيص مخصص لجهاز آخر ولا يمكن تشغيله على هذا الجهاز المنسوخ إليه",
      }
    }

    // 3. Cryptographic Signature check (Public Key verification)
    const isSigValid = await verifySignature(
      state.token.payload,
      state.token.signature,
      state.publicKeyJwk,
    )
    if (!isSigValid) {
      return {
        isValid: false,
        status: "REVOKED",
        reason: "بيانات تفعيل الترخيص غير موثوقة أو تالفة محلياً",
      }
    }

    // 4. Expiration
    const now = Date.now()
    const expTime = new Date(state.token.payload.expiresAt).getTime()
    if (now > expTime) {
      return {
        isValid: false,
        status: "EXPIRED",
        reason: "انتهت صلاحية اشتراك الترخيص. يرجى تجديد الاشتراك",
      }
    }

    // 5. Offline Grace Period check
    if (!state.isOfflineGraceValid) {
      return {
        isValid: false,
        status: "SUSPENDED",
        reason:
          "انتهت فترة السماح للعمل بدون إنترنت (7 أيام). يرجى الاتصال بالإنترنت للتحقق",
      }
    }

    return {
      isValid: true,
      status: state.token.payload.status,
    }
  },
}
