import type {
  ActivationToken,
  LicenseRecord,
  SubscriptionPlan,
  SubscriptionStatus,
} from "../types"

// Configurable via Vite environment variable or defaults to local server
export const LICENSE_SERVER_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_LICENSE_SERVER_URL) ||
  "http://localhost:3001"

export interface ApiResponse<T = any> {
  success: boolean
  error?: string
  message?: string
  isNetworkError?: boolean
  token?: ActivationToken
  license?: Partial<LicenseRecord>
  licenses?: LicenseRecord[]
  [key: string]: any
}

async function request<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const url = `${LICENSE_SERVER_URL}${endpoint}`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const data = await res.json()
    return data
  } catch (err: any) {
    const isAbort = err?.name === "AbortError"
    return {
      success: false,
      isNetworkError: true,
      error: isAbort
        ? "انتهت مهلة الاتصال بخادم التراخيص (Timeout)"
        : "تعذر الاتصال بخادم التراخيص. التطبيق يعمل في وضع الأوفلاين",
    }
  }
}

export const licenseApi = {
  // Activate on a new device
  activate: async (
    licenseKey: string,
    deviceId: string,
    deviceName: string,
  ): Promise<ApiResponse> => {
    return await request("/api/license/activate", {
      method: "POST",
      body: JSON.stringify({ licenseKey, deviceId, deviceName }),
    })
  },

  // Validate active license status
  validate: async (
    licenseKey: string,
    deviceId: string,
  ): Promise<ApiResponse> => {
    return await request("/api/license/validate", {
      method: "POST",
      body: JSON.stringify({ licenseKey, deviceId }),
    })
  },

  // Refresh token & extend offline grace
  refresh: async (
    licenseKey: string,
    deviceId: string,
  ): Promise<ApiResponse> => {
    return await request("/api/license/refresh", {
      method: "POST",
      body: JSON.stringify({ licenseKey, deviceId }),
    })
  },

  // Deactivate current device
  deactivate: async (
    licenseKey: string,
    deviceId: string,
  ): Promise<ApiResponse> => {
    return await request("/api/license/deactivate", {
      method: "POST",
      body: JSON.stringify({ licenseKey, deviceId }),
    })
  },

  // Fetch Public Key JWK from server
  fetchPublicKey: async (): Promise<JsonWebKey | null> => {
    const res = await request("/api/license/public-key", { method: "GET" })
    return res.publicKeyJwk || null
  },

  // ── Admin operations ──────────────────────────────────────────────────
  getAdminLicenses: async (): Promise<ApiResponse<{ licenses: LicenseRecord[] }>> => {
    return await request("/api/admin/licenses", { method: "GET" })
  },

  createLicense: async (data: {
    planType: SubscriptionPlan
    maxDevices: number
    durationMonths?: number
    notes?: string
    customKey?: string
  }): Promise<ApiResponse<{ license: LicenseRecord }>> => {
    return await request("/api/admin/licenses", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  updateLicense: async (
    id: string,
    data: {
      status?: SubscriptionStatus
      extendMonths?: number
      maxDevices?: number
      planType?: SubscriptionPlan
      notes?: string
    },
  ): Promise<ApiResponse<{ license: LicenseRecord }>> => {
    return await request(`/api/admin/licenses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    })
  },

  deactivateDeviceFromAdmin: async (
    licenseId: string,
    deviceId: string,
  ): Promise<ApiResponse> => {
    return await request(`/api/admin/licenses/${licenseId}/devices/${deviceId}`, {
      method: "DELETE",
    })
  },
}
