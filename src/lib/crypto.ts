/**
 * Cryptographic utilities for License Verification.
 * Uses Web Crypto API (crypto.subtle) - compatible with browsers, Electron, and modern Node.js.
 *
 * IMPORTANT SECURITY RULE:
 * Desktop app ONLY contains the PUBLIC KEY.
 * Private key is stored securely on the License Server.
 */

// Master Public Key for ECDSA P-256 (JWK format)
// Paired with the server's private key for offline signature verification
export const MASTER_PUBLIC_KEY_JWK: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "W_v_8N7R9kYj1L_v9bB8m_F0s3K7v2kG8x9wE2bA4_I",
  y: "H7m_9B4q8P3c0R2s1V7z6X5n4M3b2K1j0G9f8D7s6A5",
  key_ops: ["verify"],
  ext: true,
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
  jwk: JsonWebKey = MASTER_PUBLIC_KEY_JWK,
): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "jwk",
    jwk,
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
  publicKeyJwk: JsonWebKey = MASTER_PUBLIC_KEY_JWK,
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
