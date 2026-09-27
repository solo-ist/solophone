/**
 * Filesystem containment: every path derived from cloud metadata or
 * persisted sync state must resolve beneath its intended root before it
 * touches the filesystem.
 */

import { resolve, sep } from 'node:path'

export class PathEscapeError extends Error {
  constructor(relative: string) {
    super(`Path escapes its root: ${JSON.stringify(relative)}`)
    this.name = 'PathEscapeError'
  }
}

/** Resolve `relative` under `root`, refusing anything that escapes it. */
export function resolveUnder(root: string, relative: string): string {
  const canonicalRoot = resolve(root)
  const resolved = resolve(canonicalRoot, relative)
  if (resolved === canonicalRoot || !resolved.startsWith(canonicalRoot + sep)) {
    throw new PathEscapeError(relative)
  }
  return resolved
}

/** A stored note filename must be a plain markdown basename — nothing else. */
export function isSafeNoteFilename(root: string, name: string): boolean {
  if (!name.endsWith('.md') || name.startsWith('.')) return false
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) return false
  try {
    resolveUnder(root, name)
    return true
  } catch {
    return false
  }
}
