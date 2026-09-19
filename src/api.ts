/**
 * Minimal typed client for Light's cloud API (production.lightphonecloud.com).
 *
 * Written against the shapes documented by the community light-phone-api
 * project (github.com/garado/light — used strictly as documentation, no code
 * reused; its light_api/openapi-spec.json is the contract of record).
 *
 * JSON:API-ish: every request sends Accept: application/vnd.api+json and a
 * Bearer token. Tokens nominally last ~30 days (login returns max_age) but
 * 401s have been observed much earlier, so every request retries once
 * through a fresh login when credentials are available.
 */

export const API_BASE = 'https://production.lightphonecloud.com'

const API_HEADERS = { Accept: 'application/vnd.api+json' }
const CONTENT_TYPE = 'application/vnd.api+json'

/** Whole-call deadline for every API fetch. */
export const FETCH_TIMEOUT_MS = 30_000
/** Refuse to materialize API JSON bodies larger than this. */
const MAX_JSON_BYTES = 10 * 1024 * 1024

/** Throw before buffering a response whose declared size is implausible. */
export function assertBodyBounded(res: Response, max = MAX_JSON_BYTES): void {
  const declared = Number(res.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > max) {
    throw new LightApiError(`Response too large (${declared} bytes)`, res.status)
  }
}

/** Read at most `cap` characters of an error body, then drop the stream. */
async function boundedText(res: Response, cap = 300): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > 65536) return `(body ${declared} bytes, omitted)`
  const reader = res.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let out = ''
  try {
    while (out.length < cap) {
      const { done, value } = await reader.read()
      if (done) break
      out += decoder.decode(value, { stream: true })
    }
  } catch {
    // Body errors never mask the HTTP error we're reporting.
  } finally {
    await reader.cancel().catch(() => {})
  }
  return out.slice(0, cap)
}

export interface JsonApiResource {
  id: string
  type: string
  attributes?: Record<string, unknown>
  relationships?: Record<string, { data?: { id: string; type: string } | null }>
}

export interface JsonApiDocument {
  data?: JsonApiResource | JsonApiResource[]
  included?: JsonApiResource[]
}

export interface Credentials {
  email: string
  password: string
}

export interface Session {
  token: string
  maxAge: number | null
  obtainedAt: string
  email: string
  deviceId: string | null
  deviceToolId: string | null
}

export interface DeviceSummary {
  id: string
  deviceType: string | null
  osVersion: string | null
  phoneNumbers: string[]
  developerMode: boolean | null
}

export class LightApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message)
    this.name = 'LightApiError'
  }
}

function asArray(data: JsonApiDocument['data']): JsonApiResource[] {
  if (!data) return []
  return Array.isArray(data) ? data : [data]
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/** Last 10 digits, matching the community client's US-centric normalization. */
function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10)
}

export class LightClient {
  private token: string | null
  readonly email: string
  private readonly credentials: Credentials | null
  /** Called after a successful (re)login so the caller can persist the session. */
  onTokenRefresh: ((session: Session) => void) | null = null

  deviceId: string | null = null
  deviceToolId: string | null = null
  private maxAge: number | null = null
  private obtainedAt: string = new Date(0).toISOString()

  constructor(opts: { credentials?: Credentials; session?: Session }) {
    this.credentials = opts.credentials ?? null
    this.email = opts.credentials?.email ?? opts.session?.email ?? ''
    this.token = opts.session?.token ?? null
    this.maxAge = opts.session?.maxAge ?? null
    this.obtainedAt = opts.session?.obtainedAt ?? this.obtainedAt
    this.deviceId = opts.session?.deviceId ?? null
    this.deviceToolId = opts.session?.deviceToolId ?? null
  }

  get hasToken(): boolean {
    return this.token !== null
  }

  session(): Session {
    if (!this.token) throw new LightApiError('Not logged in')
    return {
      token: this.token,
      maxAge: this.maxAge,
      obtainedAt: this.obtainedAt,
      email: this.email,
      deviceId: this.deviceId,
      deviceToolId: this.deviceToolId,
    }
  }

  /** POST /api/authorizations — plain JSON body, not JSON:API-shaped. */
  async login(): Promise<void> {
    if (!this.credentials) {
      throw new LightApiError('Session expired and no credentials available — run `login` again')
    }
    const res = await fetch(`${API_BASE}/api/authorizations`, {
      method: 'POST',
      headers: { ...API_HEADERS, 'Content-Type': CONTENT_TYPE },
      body: JSON.stringify({ email: this.credentials.email, password: this.credentials.password }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      throw new LightApiError(`Login failed (HTTP ${res.status}) — check LIGHT_EMAIL / LIGHT_PASSWORD`, res.status)
    }
    assertBodyBounded(res)
    const doc = (await res.json()) as JsonApiDocument
    const authRecord = doc.included?.[0]
    const token = str(authRecord?.attributes?.token)
    if (!token) {
      throw new LightApiError('Login succeeded but no token found at included[0].attributes.token — API shape may have drifted')
    }
    this.token = token
    const maxAge = authRecord?.attributes?.max_age
    this.maxAge = typeof maxAge === 'number' ? maxAge : null
    this.obtainedAt = new Date().toISOString()
    this.onTokenRefresh?.(this.session())
  }

  /**
   * Authenticated request against API_BASE. Retries exactly once through a
   * fresh login on 401. Returns the parsed JSON document (or null for 204).
   */
  async request(method: string, path: string, body?: unknown): Promise<JsonApiDocument | Record<string, unknown> | null> {
    if (!this.token) await this.login()

    const doFetch = () =>
      fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          ...API_HEADERS,
          Authorization: `Bearer ${this.token}`,
          ...(body !== undefined ? { 'Content-Type': CONTENT_TYPE } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })

    let res = await doFetch()
    if (res.status === 401 && this.credentials) {
      await this.login()
      res = await doFetch()
    }
    if (!res.ok) {
      const text = await boundedText(res)
      throw new LightApiError(`${method} ${path} failed (HTTP ${res.status})${text ? `: ${text}` : ''}`, res.status)
    }
    if (res.status === 204) return null
    assertBodyBounded(res)
    return (await res.json()) as JsonApiDocument
  }

  /** GET /api/users/current — cheap token validity probe. */
  async probe(): Promise<boolean> {
    if (!this.token) return false
    const res = await fetch(`${API_BASE}/api/users/current`, {
      headers: { ...API_HEADERS, Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(() => null)
    return res?.ok ?? false
  }

  async listDevices(): Promise<{ devices: DeviceSummary[]; raw: JsonApiDocument }> {
    const doc = (await this.request('GET', '/api/devices')) as JsonApiDocument
    const included = doc.included ?? []
    const devices = asArray(doc.data).map((d): DeviceSummary => {
      const sims = included.filter(
        (r) => r.type === 'sims' && r.relationships?.device?.data?.id === d.id,
      )
      return {
        id: d.id,
        deviceType: str(d.attributes?.device_type),
        osVersion: str(d.attributes?.light_os_version_name),
        phoneNumbers: sims.map((s) => str(s.attributes?.phone_number)).filter((p): p is string => p !== null),
        developerMode: typeof d.attributes?.developer_mode === 'boolean' ? d.attributes.developer_mode : null,
      }
    })
    return { devices, raw: doc }
  }

  /**
   * PATCH /api/devices/{id}/developer_mode — the same toggle the dashboard
   * drives. Note the JSON:API type is singular "device" here, unlike the
   * plural resource types elsewhere. Returns the server-echoed new value.
   * Changes take a few moments to propagate to the phone.
   */
  async setDeveloperMode(deviceId: string, enabled: boolean): Promise<boolean | null> {
    const doc = (await this.request('PATCH', `/api/devices/${encodeURIComponent(deviceId)}/developer_mode`, {
      data: {
        id: deviceId,
        type: 'device',
        attributes: { developer_mode: enabled },
      },
    })) as JsonApiDocument | null
    const data = doc?.data
    const record = Array.isArray(data) ? data[0] : data
    const value = record?.attributes?.developer_mode
    return typeof value === 'boolean' ? value : null
  }

  /** GET /api/tools?device_id — the cloud catalog of installable tools. */
  async listTools(deviceId: string): Promise<Array<{ id: string; namespace: string | null; name: string | null }>> {
    const doc = (await this.request('GET', `/api/tools?device_id=${encodeURIComponent(deviceId)}`)) as JsonApiDocument
    return asArray(doc.data).map((t) => ({
      id: t.id,
      namespace: str(t.attributes?.namespace),
      name: str(t.attributes?.name) ?? str(t.attributes?.title),
    }))
  }

  /**
   * Resolve deviceId and the notes device_tool_id.
   *
   * Notes calls are scoped to a device_tool_id, not a device id. The mapping:
   * GET /api/tools?device_id gives {tool id -> namespace}; the device_tools in
   * GET /api/devices' included[] link a device to a tool; pick the device_tool
   * whose tool namespace contains "note" (e.g. com.light.notes).
   */
  async bootstrap(opts: { deviceId?: string; phoneNumber?: string } = {}): Promise<DeviceSummary> {
    const { devices, raw } = await this.listDevices()
    if (devices.length === 0) throw new LightApiError('No devices found on this Light account')

    let device: DeviceSummary | undefined
    if (opts.deviceId) {
      device = devices.find((d) => d.id === opts.deviceId)
      if (!device) throw new LightApiError(`Device id ${opts.deviceId} not found on this account`)
    } else if (opts.phoneNumber) {
      const wanted = phoneDigits(opts.phoneNumber)
      device = devices.find((d) => d.phoneNumbers.some((p) => phoneDigits(p) === wanted))
      if (!device) throw new LightApiError(`No device matches phone number ending in ${wanted.slice(-4)}`)
    } else if (devices.length === 1) {
      device = devices[0]
    } else {
      const listing = devices
        .map((d) => `  ${d.id}  ${d.deviceType ?? '?'}  ${d.phoneNumbers.join(', ') || 'no sim'}`)
        .join('\n')
      throw new LightApiError(`Multiple devices on account — set LIGHT_PHONE_NUMBER or LIGHT_DEVICE_ID:\n${listing}`)
    }
    if (!device) throw new LightApiError('Device selection failed')
    this.deviceId = device.id

    const toolsDoc = (await this.request('GET', `/api/tools?device_id=${encodeURIComponent(device.id)}`)) as JsonApiDocument
    const namespaceByToolId = new Map<string, string>()
    for (const tool of asArray(toolsDoc.data)) {
      const ns = str(tool.attributes?.namespace)
      if (ns) namespaceByToolId.set(tool.id, ns)
    }

    const deviceTools = (raw.included ?? []).filter(
      (r) => r.type === 'device_tools' && r.relationships?.device?.data?.id === device.id,
    )
    const notesDeviceTool = deviceTools.find((dt) => {
      const toolId = dt.relationships?.tool?.data?.id ?? str(dt.attributes?.tool_id)
      const ns = toolId ? namespaceByToolId.get(toolId) : undefined
      return ns !== undefined && ns.toLowerCase().includes('note')
    })
    if (!notesDeviceTool) {
      throw new LightApiError(
        `Could not find a notes tool on device ${device.id} — is the Notes tool installed on the phone?`,
      )
    }
    this.deviceToolId = notesDeviceTool.id
    this.onTokenRefresh?.(this.session())
    return device
  }
}
