/**
 * Light note <-> markdown-with-frontmatter mapping.
 *
 * Frontmatter mirrors the shape Prose's reMarkable sync writes (title,
 * source, timestamps) so these files drop straight into a Prose sync
 * directory later. Note bodies are plain UTF-8 text — lossless as markdown.
 */

import { createHash } from 'node:crypto'

import type { LightNote } from './notes.js'

/**
 * JSON string escaping is valid YAML double-quoted style, and it covers
 * newlines, quotes, backslashes, and control characters — so no server-fed
 * value can ever break out of its scalar and inject frontmatter keys.
 */
export function yamlDoubleQuote(s: string): string {
  return JSON.stringify(s)
}

export function noteToMarkdown(note: LightNote, content: string): string {
  const body = content.endsWith('\n') || content === '' ? content : content + '\n'
  return [
    '---',
    `title: ${yamlDoubleQuote(note.title)}`,
    'source: lightphone',
    `note_id: ${yamlDoubleQuote(note.id)}`,
    `note_type: ${yamlDoubleQuote(note.noteType)}`,
    `note_updated_at: ${yamlDoubleQuote(note.updatedAt)}`,
    '---',
    '',
    body,
  ].join('\n')
}

/** Strip a leading YAML frontmatter block, returning just the body. */
export function markdownBody(markdown: string): string {
  if (!markdown.startsWith('---\n')) return markdown
  const end = markdown.indexOf('\n---\n', 4)
  if (end === -1) return markdown
  return markdown.slice(end + 5).replace(/^\n/, '')
}

/**
 * First 8 chars of a well-formed (hex/dash UUID-ish) id; a hash of it
 * otherwise \u2014 a hostile or drifted server id can never shape the filename.
 */
function idFragment(id: string): string {
  if (/^[0-9a-f-]{8,}$/i.test(id)) return id.slice(0, 8).toLowerCase()
  return createHash('sha256').update(id).digest('hex').slice(0, 8)
}

/**
 * Stable, collision-proof filename: title slug + first 8 chars of the note
 * id. Titles are not unique on Light's side, so the id suffix is what
 * actually guarantees uniqueness.
 */
export function filenameFor(note: LightNote): string {
  const slug =
    note.title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled'
  return `${slug}-${idFragment(note.id)}.md`
}
