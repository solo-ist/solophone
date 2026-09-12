/**
 * Light note <-> markdown-with-frontmatter mapping.
 *
 * Frontmatter mirrors the shape Prose's reMarkable sync writes (title,
 * source, timestamps) so these files drop straight into a Prose sync
 * directory later. Note bodies are plain UTF-8 text — lossless as markdown.
 */

import type { LightNote } from './notes.js'

export function yamlDoubleQuote(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"'
}

export function noteToMarkdown(note: LightNote, content: string): string {
  const body = content.endsWith('\n') || content === '' ? content : content + '\n'
  return [
    '---',
    `title: ${yamlDoubleQuote(note.title)}`,
    'source: lightphone',
    `note_id: ${note.id}`,
    `note_type: ${note.noteType}`,
    `note_updated_at: ${note.updatedAt}`,
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
  return `${slug}-${note.id.slice(0, 8)}.md`
}
