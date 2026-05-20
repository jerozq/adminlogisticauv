export function sanitizeRequerimientoFileName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 140)
}

export function buildRequerimientoStoragePath(fileName: string, id: string): string {
  const safeName = sanitizeRequerimientoFileName(fileName)
  const finalName = safeName || 'requerimiento.bin'
  return `requerimientos/${id}-${finalName}`
}
