const DB_NAME = 'creator-autoedit-prompter-fonts'
const STORE = 'fonts'

function openFontDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'family' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Font storage is unavailable.'))
  })
}

/** Install a user supplied local font without sending the file anywhere. */
export async function installLocalFont(file: File): Promise<string> {
  if (typeof FontFace === 'undefined' || typeof indexedDB === 'undefined') throw new Error('Custom fonts are unavailable in this browser.')
  const family = `Creator Local · ${file.name.replace(/\.[^.]+$/, '').slice(0, 36)}`
  const bytes = await file.arrayBuffer()
  const face = new FontFace(family, bytes)
  await face.load()
  document.fonts.add(face)
  try {
    const db = await openFontDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ family, bytes, updatedAt: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // The loaded font remains usable for this session when private mode blocks
    // IndexedDB. The prompt setting still persists the family name.
  }
  return family
}

export async function restoreLocalFonts(): Promise<string[]> {
  if (typeof indexedDB === 'undefined' || typeof FontFace === 'undefined') return []
  try {
    const db = await openFontDb()
    const rows = await new Promise<Array<{ family: string; bytes: ArrayBuffer }>>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
      request.onsuccess = () => resolve(request.result as Array<{ family: string; bytes: ArrayBuffer }>)
      request.onerror = () => reject(request.error)
    })
    db.close()
    const families: string[] = []
    for (const row of rows) {
      try { const face = await new FontFace(row.family, row.bytes).load(); document.fonts.add(face); families.push(row.family) } catch { /* skip a corrupt local font */ }
    }
    return families
  } catch { return [] }
}

