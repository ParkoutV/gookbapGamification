const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const IMAGE_TIMEOUT_MS = 15_000
const ASSET_PREFIX = '/storage/v1/object/public/game_assets/'

/** Only this project's public image bucket may be fetched by the compositor. */
export function validateGameAssetUrl(value: string): URL {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!configured) throw new Error('Supabase URL is not configured')
  const origin = new URL(configured)
  const url = new URL(value)
  if (
    origin.protocol !== 'https:' || url.protocol !== 'https:' ||
    url.origin !== origin.origin || url.username || url.password ||
    url.hash || url.search || !url.pathname.startsWith(ASSET_PREFIX)
  ) {
    throw new Error('Only configured Supabase game_assets images are allowed')
  }

  // Reject encoded separators/double encoding before a proxy can normalize them.
  const path = url.pathname.slice(ASSET_PREFIX.length)
  const decoded = decodeURIComponent(path)
  if (
    !path || /%(?:2f|5c|25)/i.test(path) ||
    /[\\\u0000-\u001f\u007f]/.test(decoded) ||
    decoded.split('/').some(segment => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('Invalid game asset path')
  }
  return url
}

export async function fetchGameAsset(value: string): Promise<Buffer> {
  const url = validateGameAssetUrl(value)
  // Never forward cookies/API keys, and never follow a redirect off the allowlist.
  const response = await fetch(url.href, {
    redirect: 'error',
    credentials: 'omit',
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Failed to fetch game image (${response.status})`)
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (!contentType || !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(contentType)) {
    await response.body?.cancel()
    throw new Error('Unsupported game image type')
  }
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
    await response.body?.cancel()
    throw new Error('Game image exceeds the size limit')
  }
  if (!response.body) throw new Error('Game image is empty')

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value: chunk } = await reader.read()
      if (done) break
      size += chunk.byteLength
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel()
        throw new Error('Game image exceeds the size limit')
      }
      chunks.push(chunk)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, size)
}
