/**
 * Notes CRUD against the Light cloud API.
 *
 * Note bodies are opaque bytes in S3, reached through short-lived presigned
 * URLs — always fetch a fresh URL per read/write, never reuse one from an
 * earlier list response. Titles are NOT unique; key everything on note id.
 */

import type { JsonApiDocument, JsonApiResource, LightClient } from './api.js'
import { FETCH_TIMEOUT_MS, LightApiError, assertBodyBounded } from './api.js'

/** A text note larger than this is not a note — refuse to buffer it. */
const MAX_NOTE_BYTES = 10 * 1024 * 1024

export interface LightNote {
  id: string
  fileId: string | null
  noteType: 'text' | 'audio'
  title: string
  updatedAt: string
}

function requireDeviceToolId(client: LightClient): string {
  if (!client.deviceToolId) {
    throw new LightApiError('No notes device_tool_id on session — run `login` first')
  }
  return client.deviceToolId
}

function toNote(r: JsonApiResource): LightNote {
  const attrs = r.attributes ?? {}
  return {
    id: r.id,
    fileId: typeof attrs.file_id === 'string' ? attrs.file_id : (r.relationships?.file?.data?.id ?? null),
    noteType: attrs.note_type === 'audio' ? 'audio' : 'text',
    title: typeof attrs.title === 'string' ? attrs.title : '(untitled)',
    updatedAt: typeof attrs.updated_at === 'string' ? attrs.updated_at : '',
  }
}

export async function listNotes(client: LightClient): Promise<LightNote[]> {
  const deviceToolId = requireDeviceToolId(client)
  const doc = (await client.request(
    'GET',
    `/api/notes?device_tool_id=${encodeURIComponent(deviceToolId)}`,
  )) as JsonApiDocument
  const data = doc.data
  const resources = !data ? [] : Array.isArray(data) ? data : [data]
  return resources.map(toNote)
}

/**
 * PUT raw bytes to a presigned S3 URL. The body must be a Uint8Array so
 * fetch does not inject a Content-Type header (it auto-adds text/plain for
 * string bodies, which breaks the S3 signature with a 403).
 */
async function putPresigned(url: string, content: Uint8Array): Promise<void> {
  const res = await fetch(url, { method: 'PUT', body: content, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) {
    throw new LightApiError(`Presigned PUT failed (HTTP ${res.status})`, res.status)
  }
}

export async function getNoteContent(client: LightClient, noteId: string): Promise<Buffer> {
  const doc = (await client.request(
    'GET',
    `/api/notes/${encodeURIComponent(noteId)}/generate_presigned_get_url`,
  )) as Record<string, unknown>
  const url = doc.presigned_get_url
  if (typeof url !== 'string') {
    throw new LightApiError(`No presigned_get_url in response for note ${noteId}`)
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) {
    throw new LightApiError(`Presigned GET failed for note ${noteId} (HTTP ${res.status})`, res.status)
  }
  assertBodyBounded(res, MAX_NOTE_BYTES)
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.byteLength > MAX_NOTE_BYTES) {
    throw new LightApiError(`Note ${noteId} body too large (${buffer.byteLength} bytes)`)
  }
  return buffer
}

/** Two-step create: POST the record, then PUT the body to the returned presigned URL. */
export async function createTextNote(client: LightClient, title: string, content: string): Promise<LightNote> {
  const deviceToolId = requireDeviceToolId(client)
  const doc = (await client.request('POST', '/api/notes', {
    data: {
      type: 'notes',
      attributes: {
        device_tool_id: deviceToolId,
        filename: 'note.txt',
        note_type: 'text',
        title,
      },
    },
  })) as JsonApiDocument
  const data = doc.data
  const record = Array.isArray(data) ? data[0] : data
  if (!record) throw new LightApiError('Create returned no note record')
  const presignedUrl = doc.included?.[0]?.attributes?.presigned_url
  if (typeof presignedUrl !== 'string') {
    throw new LightApiError('Create returned no presigned upload URL — note record exists but has no content')
  }
  await putPresigned(presignedUrl, new TextEncoder().encode(content))
  return toNote(record)
}

export async function updateNoteContent(client: LightClient, noteId: string, content: string): Promise<void> {
  const doc = (await client.request(
    'GET',
    `/api/notes/${encodeURIComponent(noteId)}/generate_presigned_put_url`,
  )) as Record<string, unknown>
  const url = doc.presigned_put_url
  if (typeof url !== 'string') {
    throw new LightApiError(`No presigned_put_url in response for note ${noteId}`)
  }
  await putPresigned(url, new TextEncoder().encode(content))
}

/** PATCH must echo the note's current updated_at and its file relationship. */
export async function renameNote(client: LightClient, note: LightNote, newTitle: string): Promise<void> {
  if (!note.fileId) throw new LightApiError(`Note ${note.id} has no file_id — cannot rename`)
  await client.request('PATCH', `/api/notes/${encodeURIComponent(note.id)}`, {
    data: {
      id: note.id,
      type: 'notes',
      attributes: {
        title: newTitle,
        updated_at: note.updatedAt,
        note_type: note.noteType,
      },
      relationships: {
        file: { data: { type: 'files', id: note.fileId } },
      },
    },
  })
}

export async function deleteNote(client: LightClient, noteId: string): Promise<void> {
  await client.request('DELETE', `/api/notes/${encodeURIComponent(noteId)}`)
}
