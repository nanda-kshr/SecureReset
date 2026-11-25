const ALLOWED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'host.docker.internal',
  'securereset-test',
])

/**
 * Hard safety guard: refuses to run attack or evaluation scripts against any remote host.
 */
export function assertLocalTarget(targetUrl) {
  let parsed
  try {
    parsed = new URL(targetUrl)
  } catch {
    throw new Error(`Refusing invalid target URL: ${targetUrl}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Refusing unsupported protocol: ${parsed.protocol}`)
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `SAFETY BLOCK: Refusing to target non-local host "${parsed.hostname}". Only localhost, 127.0.0.1, ::1, or local Docker test hosts are permitted.`
    )
  }

  return parsed.origin
}
