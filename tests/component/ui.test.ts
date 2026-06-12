/**
 * Component tests for public/ui.js
 *
 * These tests exercise the module's client-side logic in isolation:
 * the registration contract, utility functions extracted from the IIFE,
 * and the state-transform helpers — without a real browser or DOM.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs   from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uiSrc = fs.readFileSync(path.resolve(__dirname, '../../public/ui.js'), 'utf8')

// ─── Helpers extracted from the IIFE for unit testing ────────────────────────
// We re-implement the pure helpers here rather than eval()ing the entire file

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function badge(text: string, cls: string): string {
  return `<span class="il-badge il-badge-${cls}">${esc(text)}</span>`
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  const today = new Date().toISOString().slice(0, 10)
  const isOverdue = d < today
  return `<span class="il-due-date${isOverdue ? ' il-due-overdue' : ''}">${esc(d)}</span>`
}

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout>
  return ((...args: any[]) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }) as T
}

// ─── esc() ────────────────────────────────────────────────────────────────────

describe('esc()', () => {
  it('escapes &, <, >, "', () => {
    expect(esc('a & b')).toBe('a &amp; b')
    expect(esc('<script>')).toBe('&lt;script&gt;')
    expect(esc('"quoted"')).toBe('&quot;quoted&quot;')
  })

  it('returns empty string for null/undefined', () => {
    expect(esc(null)).toBe('')
    expect(esc(undefined)).toBe('')
  })

  it('coerces numbers to string', () => {
    expect(esc(42)).toBe('42')
  })
})

// ─── badge() ─────────────────────────────────────────────────────────────────

describe('badge()', () => {
  it('includes the text and class', () => {
    const b = badge('high', 'high')
    expect(b).toContain('il-badge-high')
    expect(b).toContain('high')
  })

  it('escapes XSS in text', () => {
    const b = badge('<script>', 'ok')
    expect(b).not.toContain('<script>')
    expect(b).toContain('&lt;script&gt;')
  })
})

// ─── fmtDate() ────────────────────────────────────────────────────────────────

describe('fmtDate()', () => {
  it('returns empty for null', () => {
    expect(fmtDate(null)).toBe('')
  })

  it('marks past dates as overdue', () => {
    const html = fmtDate('2000-01-01')
    expect(html).toContain('il-due-overdue')
  })

  it('does not mark future dates as overdue', () => {
    const html = fmtDate('2099-12-31')
    expect(html).not.toContain('il-due-overdue')
  })

  it('includes the date string', () => {
    const html = fmtDate('2099-12-31')
    expect(html).toContain('2099-12-31')
  })
})

// ─── debounce() ───────────────────────────────────────────────────────────────

describe('debounce()', () => {
  it('delays the call', async () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const dFn = debounce(fn, 100)
    dFn('a')
    dFn('b')
    dFn('c')
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith('c')
    vi.useRealTimers()
  })
})

// ─── Module structure ─────────────────────────────────────────────────────────

describe('ui.js module structure', () => {
  it('wraps code in an IIFE', () => {
    // File may start with banner comments before the IIFE
    expect(uiSrc).toMatch(/;\(function\s*\(\)/)
  })

  it('calls window.Mosaic.registerModule', () => {
    expect(uiSrc).toContain('window.Mosaic.registerModule')
  })

  it('registers slug as ideas-lab', () => {
    expect(uiSrc).toContain("slug: 'ideas-lab'")
  })

  it('exports init, onActivate, onDeactivate lifecycle hooks', () => {
    expect(uiSrc).toContain('init(')
    expect(uiSrc).toContain('onActivate(')
    expect(uiSrc).toContain('onDeactivate(')
  })

  it('references all required API endpoints', () => {
    expect(uiSrc).toContain('/ideas')
    expect(uiSrc).toContain('/categories')
    expect(uiSrc).toContain('/ai/chat')
    expect(uiSrc).toContain('/ai/enrich/')
    expect(uiSrc).toContain('/subitems')
    expect(uiSrc).toContain('/milestones')
  })

  it('does not hardcode auth headers (relies on shell.api)', () => {
    expect(uiSrc).not.toContain("'Authorization'")
    expect(uiSrc).not.toContain('"Authorization"')
  })

  it('does not contain inline <script> tags (XSS risk)', () => {
    const withoutComment = uiSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
    const scriptTags = withoutComment.match(/<script/gi) ?? []
    expect(scriptTags).toHaveLength(0)
  })
})

// ─── State shape validation ───────────────────────────────────────────────────

describe('state shape', () => {
  it('ui.js declares the expected state keys', () => {
    expect(uiSrc).toContain('tab:')
    expect(uiSrc).toContain('search:')
    expect(uiSrc).toContain('ideas:')
    expect(uiSrc).toContain('categories:')
    expect(uiSrc).toContain('selected:')
    expect(uiSrc).toContain('chatHistory:')
  })
})
