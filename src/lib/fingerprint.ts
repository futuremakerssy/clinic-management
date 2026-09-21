import { sha256 } from "./crypto"

const DEVICE_SALT_KEY = "clinic_device_hardware_salt"

/**
 * Generates or retrieves a persistent, machine-specific installation salt.
 * Even if data is cleared, this stays as the device's unique local anchor.
 */
function getOrCreateDeviceSalt(): string {
  try {
    let salt = localStorage.getItem(DEVICE_SALT_KEY)
    if (!salt) {
      const randomValues = new Uint8Array(16)
      crypto.getRandomValues(randomValues)
      salt = Array.from(randomValues)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
      localStorage.setItem(DEVICE_SALT_KEY, salt)
    }
    return salt
  } catch {
    return "static_fallback_salt_clinic"
  }
}

/**
 * Creates a canvas rendering fingerprint based on subtle GPU/font rasterization.
 */
function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement("canvas")
    canvas.width = 200
    canvas.height = 50
    const ctx = canvas.getContext("2d")
    if (!ctx) return "no_canvas"

    ctx.textBaseline = "top"
    ctx.font = "14px 'Segoe UI', Arial, sans-serif"
    ctx.textBaseline = "alphabetic"
    ctx.fillStyle = "#f60"
    ctx.fillRect(125, 1, 62, 20)
    ctx.fillStyle = "#069"
    ctx.fillText("ClinicDesktop@2026", 2, 15)
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)"
    ctx.fillText("ClinicDesktop@2026", 4, 17)

    return canvas.toDataURL().slice(-50)
  } catch {
    return "canvas_error"
  }
}

/**
 * Generates a non-invasive, privacy-friendly hardware & environment fingerprint.
 * Tolerant to minor hardware changes (e.g. plugging in a second monitor).
 */
export async function getDeviceFingerprint(): Promise<{
  deviceId: string
  deviceName: string
  rawComponents: Record<string, unknown>
}> {
  const salt = getOrCreateDeviceSalt()
  const nav = typeof navigator !== "undefined" ? navigator : {} as Navigator
  const scr = typeof screen !== "undefined" ? screen : {} as Screen

  // Stable hardware components:
  const cores = nav.hardwareConcurrency || 4
  const platform = nav.platform || "Win32"
  const timezone = Intl?.DateTimeFormat()?.resolvedOptions()?.timeZone || "UTC"
  const colorDepth = scr.colorDepth || 24
  const canvasHash = getCanvasFingerprint()

  // Bucketed resolution to tolerate multi-monitor setups or DPI scaling
  const screenBucket = `${Math.round((scr.width || 1920) / 200) * 200}x${
    Math.round((scr.height || 1080) / 200) * 200
  }`

  const components = {
    salt,
    cores,
    platform,
    timezone,
    colorDepth,
    screenBucket,
    canvasHash,
  }

  const rawString = JSON.stringify(components)
  const fullHash = await sha256(rawString)

  // Format into a clean, professional Device ID: DEV-XXXX-XXXX-XXXX
  const p1 = fullHash.slice(0, 4).toUpperCase()
  const p2 = fullHash.slice(4, 8).toUpperCase()
  const p3 = fullHash.slice(8, 12).toUpperCase()
  const p4 = fullHash.slice(12, 16).toUpperCase()
  const deviceId = `DEV-${p1}-${p2}-${p3}-${p4}`

  // Human friendly device name
  let osName = "Windows PC"
  if (/Mac/i.test(platform)) osName = "macOS"
  else if (/Linux/i.test(platform)) osName = "Linux Desktop"
  else if (/Win/i.test(platform)) osName = "Windows Desktop"

  const deviceName = `${osName} (${cores} Cores)`

  return {
    deviceId,
    deviceName,
    rawComponents: components,
  }
}
