/**
 * Regression tests for the 2026-09-15 security review, finding 11:
 * cloud/state metadata must never escape notes/ or inject frontmatter.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sep } from 'node:path'

import { filenameFor, markdownBody, noteToMarkdown, yamlDoubleQuote } from '../src/markdown.js'
import { PathEscapeError, isSafeNoteFilename, resolveUnder } from '../src/paths.js'
import type { LightNote } from '../src/notes.js'

const ROOT = sep === '/' ? '/tmp/notes-root' : 'C:\\notes-root'

function note(overrides: Partial<LightNote>): LightNote {
  return {
    id: '2ca30370-0000-4000-8000-000000000000',
    fileId: null,
    noteType: 'text',
    title: 'Untitled',
    updatedAt: '2026-09-15T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------- containment

test('resolveUnder accepts plain basenames', () => {
  assert.equal(resolveUnder(ROOT, 'todo-f3853e8e.md'), `${ROOT}${sep}todo-f3853e8e.md`)
})

test('resolveUnder rejects traversal, absolutes, and the root itself', () => {
  // The review's proof: note id "a/../../b" resolved outside notes/.
  for (const evil of ['../outside.md', 'x-a/../../.md', 'a/../../b', '..', '.', '', '/etc/passwd', ROOT]) {
    assert.throws(() => resolveUnder(ROOT, evil), PathEscapeError, `should reject ${JSON.stringify(evil)}`)
  }
})

test('isSafeNoteFilename only passes plain .md basenames', () => {
  assert.equal(isSafeNoteFilename(ROOT, 'untitled-2ca30370.md'), true)
  for (const bad of ['../a.md', 'a/b.md', 'a\\b.md', '.hidden.md', 'a.txt', 'a\0.md', 'x-a/../../.md']) {
    assert.equal(isSafeNoteFilename(ROOT, bad), false, `should reject ${JSON.stringify(bad)}`)
  }
})

// ---------------------------------------------------------------- filenames

test('filenameFor never lets a hostile id shape the filename', () => {
  const name = filenameFor(note({ title: 'x', id: 'a/../../b' }))
  assert.doesNotMatch(name, /[/\\]/)
  assert.match(name, /^x-[0-9a-f]{8}\.md$/)
})

test('filenameFor keeps its historical shape for real UUIDs', () => {
  assert.equal(filenameFor(note({ title: 'Todo', id: 'f3853e8e-1111-4222-8333-444455556666' })), 'todo-f3853e8e.md')
})

test('filenameFor slugs hostile titles to safe characters', () => {
  const name = filenameFor(note({ title: '../../etc/passwd\n#!' }))
  assert.doesNotMatch(name, /[/\\.]{2}/)
  assert.match(name, /^[a-z0-9-]+-[0-9a-f]{8}\.md$/)
})

// ---------------------------------------------------------------- frontmatter

test('yamlDoubleQuote escapes newlines, quotes, and control characters', () => {
  const quoted = yamlDoubleQuote('a\nb: injected\r"quoted"\\\u0000')
  assert.equal(quoted.split('\n').length, 1, 'must stay on one line')
  assert.ok(quoted.startsWith('"') && quoted.endsWith('"'))
})

test('a newline in updatedAt cannot inject a frontmatter key', () => {
  // The review's proof: a newline in updatedAt injected another YAML key.
  const md = noteToMarkdown(note({ updatedAt: '2026-09-15\nevil_key: true' }), 'body\n')
  const frontmatter = md.slice(0, md.indexOf('\n---\n', 4))
  assert.doesNotMatch(frontmatter, /^evil_key:/m)
})

test('a newline in the id cannot inject a frontmatter key', () => {
  const md = noteToMarkdown(note({ id: 'abc\ninjected: yes' }), 'body\n')
  const frontmatter = md.slice(0, md.indexOf('\n---\n', 4))
  assert.doesNotMatch(frontmatter, /^injected:/m)
})

test('markdownBody round-trips a quoted frontmatter block', () => {
  const n = note({ title: 'Has "quotes" and\nnewlines' })
  const md = noteToMarkdown(n, 'the body\n')
  assert.equal(markdownBody(md), 'the body\n')
})
