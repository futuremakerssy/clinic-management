/**
 * Cryptographic utilities for License Verification.
 * Uses Web Crypto API (crypto.subtle) - compatible with browsers, Electron, and modern Node.js.
 *
 * IMPORTANT SECURITY RULE:
 * Desktop app ONLY contains the PUBLIC KEY.
 * Private key is stored securely on the License Server.
 */

// Fallback ECDSA P-256 Public Key (matches server_data/keys.json default)
export const FALLBACK_PUBLIC_KEY_JWK: JsonWebKey = {
  kty: "EC",
  x: "HvUsOTLtKTF_6n5ClbKprSj49-YRvZeybjLPI8RGrto",
  y: "gmgalv0cCd_lqeqJ4s4kzLNUpLXMy6zhHHE_91eBihU",
  crv: "P-256",
  ext: true,
}

// Read public key stored from activation response in localStorage
export function getStoredPublicKey(): JsonWebKey | null {
  try {
    const raw = localStorage.getItem("clinic_license_state")
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.publicKeyJwk && parsed.publicKeyJwk.kty === "EC") {
        return parsed.publicKeyJwk
      }
    }
  } catch {
    // Ignore parse error
  }
  return null
}

// Canonicalize an object to deterministic JSON string
export function canonicalJson(obj: unknown): string {
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

// Convert Base64 string to Uint8Array
export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64.replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

// Convert Uint8Array to Base64
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// Import ECDSA P-256 Public Key from JWK
export async function importPublicKey(
  jwk?: JsonWebKey,
): Promise<CryptoKey> {
  const resolvedJwk = jwk || getStoredPublicKey() || FALLBACK_PUBLIC_KEY_JWK
  return await crypto.subtle.importKey(
    "jwk",
    resolvedJwk,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["verify"],
  )
}

// Verify signature of payload using public key
export async function verifySignature(
  payload: unknown,
  signatureBase64: string,
  publicKeyJwk?: JsonWebKey,
): Promise<boolean> {
  try {
    const pubKey = await importPublicKey(publicKeyJwk)
    const dataStr = canonicalJson(payload)
    const encoder = new TextEncoder()
    const dataBytes = encoder.encode(dataStr)
    const sigBytes = base64ToBytes(signatureBase64)

    return await crypto.subtle.verify(
      {
        name: "ECDSA",
        hash: { name: "SHA-256" },
      },
      pubKey,
      sigBytes,
      dataBytes,
    )
  } catch (err) {
    console.error("Signature verification failed with error:", err)
    return false
  }
}

// SHA-256 hash helper
export async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}
