'use client'

const DB_NAME = 'securereset_keys'
const STORE_NAME = 'trusted_browser_keys'
const DB_VERSION = 1

export interface StoredBrowserKeyRecord {
  keyId: string
  label: string
  privateKey: CryptoKey
  publicKey: CryptoKey
  createdAt: string
}

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is unavailable in this browser.'))
      return
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'keyId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'))
  })
}

async function getAllLocalKeys(): Promise<StoredBrowserKeyRecord[]> {
  try {
    const db = await openKeyDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => resolve((req.result || []) as StoredBrowserKeyRecord[])
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

async function putLocalKey(record: StoredBrowserKeyRecord): Promise<void> {
  const db = await openKeyDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(record)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function deleteLocalBrowserKey(keyId: string): Promise<void> {
  try {
    const db = await openKeyDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(keyId)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {
    // Missing IndexedDB store is non-fatal
  }
}

/**
 * Generates a non-extractable WebCrypto ECDSA P-256 keypair, exports the public JWK,
 * registers it on the server, and persists the private CryptoKey handle in IndexedDB.
 *
 * Security note: `extractable: false` prevents key material exfiltration, but an XSS
 * vulnerability on the same origin could still invoke `crypto.subtle.sign()` as a signing
 * oracle. Strict CSP is therefore paired with this signal.
 */
export async function enrollTrustedBrowserKey(
  label: string,
  registerFn: (payload: { label: string; publicKeyJwk: JsonWebKey }) => Promise<{ keyId: string }>
): Promise<string> {
  if (!window.crypto?.subtle) {
    throw new Error('WebCrypto subtle API is required for trusted device keys.')
  }

  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, // Non-extractable private key
    ['sign', 'verify']
  )

  const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey)
  const { keyId } = await registerFn({ label, publicKeyJwk })

  await putLocalKey({
    keyId,
    label,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    createdAt: new Date().toISOString(),
  })

  return keyId
}

export async function signChallengeWithLocalKey(
  enrolledKeyIds: string[],
  challengeNonce: string
): Promise<{ keyId: string; signatureBase64: string } | null> {
  if (!enrolledKeyIds.length || typeof window === 'undefined' || !window.crypto?.subtle) {
    return null
  }

  const localKeys = await getAllLocalKeys()
  const match = localKeys.find((k) => enrolledKeyIds.includes(k.keyId))
  if (!match) {
    return null
  }

  try {
    const data = new TextEncoder().encode(challengeNonce)
    const sigBuf = await window.crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      match.privateKey,
      data
    )
    const bytes = new Uint8Array(sigBuf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return {
      keyId: match.keyId,
      signatureBase64: btoa(binary),
    }
  } catch {
    return null
  }
}

export async function getLocalBrowserKeyIds(): Promise<string[]> {
  const keys = await getAllLocalKeys()
  return keys.map((k) => k.keyId)
}
