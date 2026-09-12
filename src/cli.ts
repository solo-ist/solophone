/**
 * SoloPhone spike CLI — round-trip notes between a Light Phone 3 and local
 * markdown files.
 *
 *   npm run light -- login                     authenticate + discover device/notes tool
 *   npm run light -- list                      list notes (read-only)
 *   npm run light -- pull                      pull all text notes to ./notes/*.md
 *   npm run light -- push-test                 create a test note on the phone
 *   npm run light -- update-test <id> [file]   replace a note's content
 *   npm run light -- delete-test <id>          delete a note created by push-test
 */

import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LightApiError, LightClient, type Credentials, type Session } from './api.js'
import {
  createTextNote,
  deleteNote,
  getNoteContent,
  listNotes,
  updateNoteContent,
  type LightNote,
} from './notes.js'
import { filenameFor, markdownBody, noteToMarkdown } from './markdown.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SESSION_PATH = join(ROOT, '.token.json')
const NOTES_DIR = join(ROOT, 'notes')
const STATE_PATH = join(NOTES_DIR, '.lightphone', 'sync-state.json')
const CONTENT_FETCH_SPACING_MS = 250
const TEST_TITLE_PREFIX = 'Prose sync test'

interface SyncState {
  [noteId: string]: { path: string; updatedAt: string; title: string }
}

// ---------------------------------------------------------------- env & session

function loadDotEnv(): void {
  const envPath = join(ROOT, '.env')
  if (!existsSync(envPath)) return
  let raw: string
  try {
    raw = readFileSync(envPath, 'utf8')
  } catch {
    return
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

async function loadSession(): Promise<Session | null> {
  try {
    return JSON.parse(await readFile(SESSION_PATH, 'utf8')) as Session
  } catch {
    return null
  }
}

async function saveSession(session: Session): Promise<void> {
  await writeFile(SESSION_PATH, JSON.stringify(session, null, 2) + '\n', { mode: 0o600 })
  await chmod(SESSION_PATH, 0o600)
}

// ---------------------------------------------------------------- prompts

async function promptVisible(query: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(query)).trim()
  } finally {
    rl.close()
  }
}

async function promptHidden(query: string): Promise<string> {
  process.stdout.write(query)
  const muted = new Writable({
    write(_chunk, _enc, cb) {
      cb()
    },
  })
  const rl = createInterface({ input: process.stdin, output: muted, terminal: true })
  try {
    const answer = await rl.question('')
    process.stdout.write('\n')
    return answer.trim()
  } finally {
    rl.close()
  }
}

async function resolveCredentials(): Promise<Credentials> {
  let email = process.env.LIGHT_EMAIL?.trim() ?? ''
  let password = process.env.LIGHT_PASSWORD?.trim() ?? ''
  if (!email) email = await promptVisible('Light account email: ')
  if (!password) password = await promptHidden(`Light password for ${email}: `)
  if (!email || !password) {
    throw new LightApiError('Email and password are required (set LIGHT_EMAIL / LIGHT_PASSWORD in .env)')
  }
  return { email, password }
}

// ---------------------------------------------------------------- client helpers

function attachPersistence(client: LightClient): void {
  client.onTokenRefresh = (session) => {
    void saveSession(session).catch((err: unknown) => {
      console.error(`warning: could not save session: ${(err as Error).message}`)
    })
  }
}

/** Session + credentials (if present in env) — used by every command but login. */
async function getClient(): Promise<LightClient> {
  loadDotEnv()
  const session = await loadSession()
  if (!session?.deviceToolId) {
    throw new LightApiError('No session — run `npm run light -- login` first')
  }
  const email = process.env.LIGHT_EMAIL?.trim()
  const password = process.env.LIGHT_PASSWORD?.trim()
  const credentials = email && password ? { email, password } : undefined
  const client = new LightClient({ session, credentials })
  attachPersistence(client)
  return client
}

// ---------------------------------------------------------------- sync state

async function loadState(): Promise<SyncState> {
  try {
    return JSON.parse(await readFile(STATE_PATH, 'utf8')) as SyncState
  } catch {
    return {}
  }
}

async function saveState(state: SyncState): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true })
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + '\n')
}

// ---------------------------------------------------------------- commands

async function cmdLogin(): Promise<void> {
  loadDotEnv()

  const existing = await loadSession()
  if (existing?.deviceToolId) {
    const probeClient = new LightClient({ session: existing })
    if (await probeClient.probe()) {
      console.log(`Already logged in as ${existing.email}`)
      console.log(`  device:            ${existing.deviceId}`)
      console.log(`  notes device_tool: ${existing.deviceToolId}`)
      console.log('  (delete .token.json to force a fresh login)')
      return
    }
    console.log('Cached session is no longer valid — logging in fresh.')
  }

  const credentials = await resolveCredentials()
  const client = new LightClient({ credentials })
  attachPersistence(client)

  await client.login()
  const session = client.session()
  const expiry =
    session.maxAge !== null
      ? new Date(Date.now() + session.maxAge * 1000).toISOString()
      : 'unknown (no max_age in response)'
  console.log(`Logged in as ${credentials.email} (token: ${session.token.length} chars, nominal expiry ${expiry})`)

  const device = await client.bootstrap({
    deviceId: process.env.LIGHT_DEVICE_ID?.trim() || undefined,
    phoneNumber: process.env.LIGHT_PHONE_NUMBER?.trim() || undefined,
  })
  console.log(`Device: ${device.id}`)
  console.log(`  type:       ${device.deviceType ?? 'unknown'}`)
  console.log(`  LightOS:    ${device.osVersion ?? 'unknown'}`)
  console.log(`  phone:      ${device.phoneNumbers.join(', ') || 'no sim found'}`)
  console.log(`  notes tool: ${client.deviceToolId}`)
  console.log(`Session saved to .token.json (mode 600).`)
}

async function cmdList(): Promise<void> {
  const client = await getClient()
  const notes = await listNotes(client)
  if (notes.length === 0) {
    console.log('No notes on this device.')
    return
  }
  console.log(`${notes.length} note(s):`)
  for (const n of notes) {
    console.log(`  ${n.id}  [${n.noteType}]  ${n.updatedAt}  ${n.title}`)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function cmdPull(): Promise<void> {
  const client = await getClient()
  const notes = await listNotes(client)
  const state = await loadState()
  await mkdir(NOTES_DIR, { recursive: true })

  const liveIds = new Set(notes.map((n) => n.id))
  let pulled = 0
  let skipped = 0
  let first = true

  for (const note of notes) {
    if (note.noteType === 'audio') {
      console.log(`  audio (skipped): ${note.title} (${note.id})`)
      continue
    }
    const prior = state[note.id]
    const filename = filenameFor(note)
    const path = join(NOTES_DIR, filename)

    if (prior && prior.updatedAt === note.updatedAt && existsSync(join(NOTES_DIR, prior.path))) {
      skipped++
      continue
    }

    if (!first) await sleep(CONTENT_FETCH_SPACING_MS)
    first = false

    const content = (await getNoteContent(client, note.id)).toString('utf8')
    await writeFile(path, noteToMarkdown(note, content))

    // Title changed -> filename changed; drop the stale file.
    if (prior && prior.path !== filename && existsSync(join(NOTES_DIR, prior.path))) {
      await unlink(join(NOTES_DIR, prior.path))
    }
    state[note.id] = { path: filename, updatedAt: note.updatedAt, title: note.title }
    console.log(`  pulled: ${filename}`)
    pulled++
  }

  // Notes deleted on the phone: keep the local file but note it.
  for (const id of Object.keys(state)) {
    if (!liveIds.has(id)) {
      console.log(`  gone on phone (local file kept): ${state[id]?.path}`)
      delete state[id]
    }
  }

  await saveState(state)
  console.log(`Done: ${pulled} pulled, ${skipped} unchanged, ${notes.filter((n) => n.noteType === 'audio').length} audio skipped.`)
}

async function cmdPushTest(): Promise<void> {
  const client = await getClient()
  const title = `${TEST_TITLE_PREFIX} ${new Date().toISOString()}`
  const body = [
    'Hello from the SoloPhone spike.',
    '',
    'This note was created via the Light cloud API from a desktop machine,',
    'as a proof-of-concept for syncing Prose documents to the Light Phone 3.',
  ].join('\n')
  const note = await createTextNote(client, title, body)
  console.log(`Created note ${note.id}: "${title}"`)
  console.log('Check the Notes tool on the phone — propagation can take a few minutes.')
  console.log(`Clean up later with: npm run light -- delete-test ${note.id}`)
}

async function cmdUpdateTest(noteId: string | undefined, file: string | undefined): Promise<void> {
  if (!noteId) throw new LightApiError('Usage: update-test <note_id> [file]')
  const client = await getClient()
  const notes = await listNotes(client)
  const note = notes.find((n) => n.id === noteId)
  if (!note) throw new LightApiError(`Note ${noteId} not found`)
  if (note.noteType !== 'text') throw new LightApiError('Only text notes can be updated')

  let content: string
  if (file) {
    content = markdownBody(await readFile(resolve(file), 'utf8'))
  } else {
    content = `Updated by the SoloPhone spike at ${new Date().toISOString()}\n\nRound-trip confirmed.\n`
  }
  await updateNoteContent(client, noteId, content)
  console.log(`Updated content of ${noteId} ("${note.title}") — ${content.length} chars.`)
  console.log('Check the phone; then `pull` to round-trip it back to disk.')
}

async function cmdDeleteTest(noteId: string | undefined, force: boolean): Promise<void> {
  if (!noteId) throw new LightApiError('Usage: delete-test <note_id>')
  const client = await getClient()
  const notes = await listNotes(client)
  const note = notes.find((n) => n.id === noteId)
  if (!note) throw new LightApiError(`Note ${noteId} not found`)
  if (!note.title.startsWith(TEST_TITLE_PREFIX) && !force) {
    throw new LightApiError(
      `Refusing to delete "${note.title}" — not a "${TEST_TITLE_PREFIX}" note. Pass --force to override.`,
    )
  }
  await deleteNote(client, noteId)
  console.log(`Deleted note ${noteId} ("${note.title}").`)

  const state = await loadState()
  const prior = state[noteId]
  if (prior) {
    delete state[noteId]
    await saveState(state)
    if (existsSync(join(NOTES_DIR, prior.path))) {
      const trashed = prior.path.replace(/\.md$/, '.deleted.md')
      await rename(join(NOTES_DIR, prior.path), join(NOTES_DIR, trashed))
      console.log(`Local copy kept as notes/${trashed}`)
    }
  }
}

// ---------------------------------------------------------------- main

function usage(): void {
  console.log(`SoloPhone — Light Phone 3 notes sync spike

Usage: npm run light -- <command>

  login                      Authenticate and discover the device + notes tool
  list                       List notes on the phone (read-only)
  pull                       Pull all text notes to ./notes/*.md (incremental)
  push-test                  Create a "${TEST_TITLE_PREFIX}" note on the phone
  update-test <id> [file]    Replace a note's content (default: timestamp text;
                             a .md file has its frontmatter stripped)
  delete-test <id> [--force] Delete a note (only "${TEST_TITLE_PREFIX}" notes
                             unless --force)

Credentials: LIGHT_EMAIL / LIGHT_PASSWORD via .env (see .env.example), or
interactive prompt. Session cached in .token.json (gitignored, mode 600).`)
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2)
  const positional = args.filter((a) => !a.startsWith('--'))
  const force = args.includes('--force')

  switch (cmd) {
    case 'login':
      return cmdLogin()
    case 'list':
      return cmdList()
    case 'pull':
      return cmdPull()
    case 'push-test':
      return cmdPushTest()
    case 'update-test':
      return cmdUpdateTest(positional[0], positional[1])
    case 'delete-test':
      return cmdDeleteTest(positional[0], force)
    default:
      usage()
      if (cmd !== undefined && cmd !== 'help' && cmd !== '--help') process.exitCode = 1
  }
}

main().catch((err: unknown) => {
  if (err instanceof LightApiError) {
    console.error(`error: ${err.message}`)
  } else {
    console.error(err)
  }
  process.exitCode = 1
})
