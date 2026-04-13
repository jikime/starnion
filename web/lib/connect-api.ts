/**
 * Connect API client (Phase 1).
 *
 * Calls Next.js route proxies under /api/connect/* which forward to the
 * gateway with the user's bearer token (see web/app/api/connect/*).
 *
 * The gateway returns snake_case JSON; this module translates to camelCase
 * `Connection` as defined in connect-data.ts.
 */

import type {
  Category,
  Connection,
  SocialProfiles,
  SocialPlatform,
} from '@/lib/connect-data'

// ── Wire types (snake_case, match api-extension.md) ──────────────────────────

interface WireBusinessCard {
  image_url: string
  company_name_en?: string | null
  dept?: string | null
  address?: string | null
  website?: string | null
  fax?: string | null
  scanned_at?: string | null
  ocr_raw_text?: string | null
}

interface WireConnection {
  id: string
  user_id: string
  name: string
  role: string | null
  company: string | null
  category: Category
  email: string | null
  phone: string | null
  birthday: string | null
  meeting_location: string | null
  group_key: string | null
  tags: string[]
  context_notes: string
  last_contact_at: string | null
  contact_frequency_target: number
  connection_score: number
  business_card: WireBusinessCard | null
  social_profiles: SocialProfiles
  created_at: string
  updated_at: string
}

interface WireListResponse {
  items: WireConnection[]
  total: number
  limit: number
  offset: number
}

// ── Errors ───────────────────────────────────────────────────────────────────

/**
 * Gateway envelope: `{"error": {"code": "...", "field": "...", "message": "..."}}`
 * `field` is present only for validation failures.
 */
export interface ConnectApiErrorPayload {
  error?:
    | string
    | {
        code?: string
        field?: string
        message?: string
      }
  code?: string
  field?: string
  message?: string
}

export class ConnectApiError extends Error {
  status: number
  code?: string
  field?: string

  constructor(status: number, payload: ConnectApiErrorPayload) {
    const nested = typeof payload.error === 'object' ? payload.error : undefined
    const topMessage = typeof payload.error === 'string' ? payload.error : undefined
    super(
      nested?.message ??
        payload.message ??
        topMessage ??
        `Connect API error ${status}`
    )
    this.status = status
    this.code = nested?.code ?? payload.code
    this.field = nested?.field ?? payload.field
  }
}

// ── Adapters ─────────────────────────────────────────────────────────────────

function fromWire(w: WireConnection): Connection {
  return {
    id: w.id,
    name: w.name,
    role: w.role ?? '',
    company: w.company ?? '',
    category: w.category,
    connectionScore: w.connection_score,
    lastContactDate: w.last_contact_at,
    contactFrequencyTarget: w.contact_frequency_target,
    tags: w.tags ?? [],
    contextNotes: w.context_notes ?? '',
    email: w.email ?? '',
    phone: w.phone ?? undefined,
    birthday: w.birthday ?? undefined,
    meetingLocation: w.meeting_location ?? undefined,
    group: w.group_key ?? undefined,
    businessCard: w.business_card
      ? {
          imageUrl: w.business_card.image_url,
          companyNameEn: w.business_card.company_name_en ?? undefined,
          department: w.business_card.dept ?? undefined,
          address: w.business_card.address ?? undefined,
          website: w.business_card.website ?? undefined,
          fax: w.business_card.fax ?? undefined,
          scannedAt: w.business_card.scanned_at ?? undefined,
          ocrRawText: w.business_card.ocr_raw_text ?? undefined,
        }
      : null,
    socialProfiles: w.social_profiles ?? {},
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  }
}

// ── Request helper ───────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`/api/connect${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (res.status === 204) {
    return undefined as T
  }

  const text = await res.text()
  const data = text ? (JSON.parse(text) as unknown) : {}

  if (!res.ok) {
    throw new ConnectApiError(res.status, (data as ConnectApiErrorPayload) ?? {})
  }

  return data as T
}

// ── Public shapes ────────────────────────────────────────────────────────────

export interface CreateConnectionInput {
  name: string
  role?: string
  company?: string
  category?: Category
  email?: string
  phone?: string
  birthday?: string
  meeting_location?: string
  tags?: string[]
  context_notes?: string
  contact_frequency_target?: number
  social_profiles?: SocialProfiles
}

export type UpdateConnectionPatch = Partial<CreateConnectionInput>

export interface ListConnectionsQuery {
  category?: Category | Category[] | 'all'
  sort?:
    | 'score_desc'
    | 'name_asc'
    | 'last_contact_desc'
    | 'last_contact_asc'
    | 'created_desc'
  q?: string
  limit?: number
  offset?: number
}

export interface ListConnectionsResult {
  items: Connection[]
  total: number
  limit: number
  offset: number
}

export interface ParsedBusinessCard {
  name: string
  role?: string
  company?: string
  email?: string
  phone?: string
  meeting_location?: string
  tags?: string[]
  business_card?: {
    image_url: string
    company_name_en?: string
    dept?: string
    address?: string
    website?: string
    fax?: string
    ocr_raw_text?: string
  }
}

export interface AttachBusinessCardInput {
  image_url: string
  company_name_en?: string
  dept?: string
  address?: string
  website?: string
  fax?: string
  ocr_raw_text?: string
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export async function createConnection(
  input: CreateConnectionInput
): Promise<Connection> {
  const wire = await request<WireConnection>('/connections', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return fromWire(wire)
}

export async function listConnections(
  query: ListConnectionsQuery = {}
): Promise<ListConnectionsResult> {
  const qs = new URLSearchParams()
  if (query.category && query.category !== 'all') {
    const v = Array.isArray(query.category) ? query.category.join(',') : query.category
    qs.set('category', v)
  }
  if (query.sort) qs.set('sort', query.sort)
  if (query.q) qs.set('q', query.q)
  if (query.limit !== undefined) qs.set('limit', String(query.limit))
  if (query.offset !== undefined) qs.set('offset', String(query.offset))

  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  const wire = await request<WireListResponse>(`/connections${suffix}`)
  return {
    items: wire.items.map(fromWire),
    total: wire.total,
    limit: wire.limit,
    offset: wire.offset,
  }
}

export async function getConnection(id: string): Promise<Connection> {
  const wire = await request<WireConnection>(`/connections/${encodeURIComponent(id)}`)
  return fromWire(wire)
}

export async function updateConnection(
  id: string,
  patch: UpdateConnectionPatch
): Promise<Connection> {
  const wire = await request<WireConnection>(
    `/connections/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }
  )
  return fromWire(wire)
}

/**
 * Merge-patch social profiles. Keys present in `patch` with a string value
 * replace the stored URL; keys present with `null` remove that platform; keys
 * not present are preserved. An empty object is accepted as a no-op.
 */
export async function updateSocialProfiles(
  id: string,
  patch: Partial<Record<SocialPlatform, string | null>>
): Promise<Connection> {
  const wire = await request<WireConnection>(
    `/connections/${encodeURIComponent(id)}/social-profiles`,
    {
      method: 'PUT',
      body: JSON.stringify(patch),
    }
  )
  return fromWire(wire)
}

export async function updateContextNotes(
  id: string,
  notes: string
): Promise<Connection> {
  const wire = await request<WireConnection>(
    `/connections/${encodeURIComponent(id)}/context-notes`,
    {
      method: 'PUT',
      body: JSON.stringify({ context_notes: notes }),
    }
  )
  return fromWire(wire)
}

export async function touchConnection(
  id: string,
  occurredAt?: string
): Promise<Connection> {
  const body = occurredAt ? { occurred_at: occurredAt } : {}
  const wire = await request<WireConnection>(
    `/connections/${encodeURIComponent(id)}/touch`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  )
  return fromWire(wire)
}

export async function deleteConnection(id: string): Promise<void> {
  await request<void>(`/connections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/**
 * Submit a parsed business card to create a new Connection.
 * BR-SOCIAL-3: social_profiles is never populated by this path.
 */
export async function submitBusinessCardScan(
  parsed: ParsedBusinessCard
): Promise<Connection> {
  const wire = await request<WireConnection>('/connections/scan-business-card', {
    method: 'POST',
    body: JSON.stringify(parsed),
  })
  return fromWire(wire)
}

export async function attachBusinessCard(
  id: string,
  input: AttachBusinessCardInput
): Promise<Connection> {
  const wire = await request<WireConnection>(
    `/connections/${encodeURIComponent(id)}/business-card`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  )
  return fromWire(wire)
}
