import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database                                  from 'better-sqlite3'
import type { ModuleDb }                         from '@mosaic/sdk'
import type Anthropic                            from '@anthropic-ai/sdk'
import { migrate }                               from '../../src/migrate.js'
import * as svc                                  from '../../src/services/ai.service.js'
import { createIdea } from '../../src/services/ideas.service.js'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE)')
  const moduleDb: ModuleDb = {
    prepare:     db.prepare.bind(db),
    exec:        (sql: string) => { db.exec(sql) },
    transaction: (fn) => db.transaction(fn),
    raw:         db,
  }
  migrate(moduleDb)
  db.prepare('INSERT INTO users (username) VALUES (?)').run('bob')
  return db
}

function makeAiClient(responseText: string): Anthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
      }),
      stream: vi.fn(),
    },
  } as unknown as Anthropic
}

let db: Database.Database
let userId: number

beforeEach(() => {
  db = makeDb()
  userId = (db.prepare('SELECT id FROM users WHERE username = ?').get('bob') as any).id
})

// ─── enrichIdea ───────────────────────────────────────────────────────────────

describe('enrichIdea', () => {
  it('returns null for unknown idea', async () => {
    const ai = makeAiClient('{}')
    const result = await svc.enrichIdea(db, ai, { quality: 'test-model' }, userId, 9999)
    expect(result).toBeNull()
  })

  it('parses JSON response and updates idea', async () => {
    const idea = createIdea(db, userId, { title: 'Improve delivery speed' }) as any
    const enrichedJson = JSON.stringify({ summary: 'A summary', tags: ['logistics'], category: 'Ops', priority: 'high' })
    const ai = makeAiClient(enrichedJson)

    const result = await svc.enrichIdea(db, ai, { quality: 'test-model' }, userId, idea.id) as any
    expect(result.summary).toBe('A summary')
    expect(result.tags).toEqual(['logistics'])
    expect(result.priority).toBe('high')

    const stored = db.prepare('SELECT ai_summary, ai_enriched FROM ideas_lab_ideas WHERE id = ?').get(idea.id) as any
    expect(stored.ai_summary).toBe('A summary')
    expect(stored.ai_enriched).toBe(1)
  })

  it('extracts JSON wrapped in markdown', async () => {
    const idea = createIdea(db, userId, { title: 'Markdown Test' }) as any
    const ai = makeAiClient('Here is the result:\n```json\n{"summary":"s","tags":[],"category":"","priority":"low"}\n```')
    const result = await svc.enrichIdea(db, ai, { quality: 'test-model' }, userId, idea.id) as any
    expect(result.summary).toBe('s')
  })
})

// ─── relatedIdeas ─────────────────────────────────────────────────────────────

describe('relatedIdeas', () => {
  it('returns null for unknown idea', async () => {
    const ai = makeAiClient('[]')
    const result = await svc.relatedIdeas(db, ai, { quality: 'test-model' }, userId, 9999)
    expect(result).toBeNull()
  })

  it('returns empty when no other ideas exist', async () => {
    const idea = createIdea(db, userId, { title: 'Lonely Idea' }) as any
    const ai = makeAiClient('[1]')
    const result = await svc.relatedIdeas(db, ai, { quality: 'test-model' }, userId, idea.id) as any
    expect(result.related).toEqual([])
  })

  it('maps AI-returned ids to idea objects', async () => {
    const a = createIdea(db, userId, { title: 'Idea A' }) as any
    const b = createIdea(db, userId, { title: 'Idea B' }) as any
    const ai = makeAiClient(JSON.stringify([b.id]))
    const result = await svc.relatedIdeas(db, ai, { quality: 'test-model' }, userId, a.id) as any
    expect(result.related).toHaveLength(1)
    expect(result.related[0].id).toBe(b.id)
  })
})

// ─── generateIdea ─────────────────────────────────────────────────────────────

describe('generateIdea', () => {
  it('parses the AI response', async () => {
    const resp = JSON.stringify({ title: 'T', notes: 'N', tags: ['a'], priority: 'medium' })
    const ai = makeAiClient(resp)
    const result = await svc.generateIdea(ai, { quality: 'test-model' }, 'a cool prompt') as any
    expect(result.title).toBe('T')
    expect(result.priority).toBe('medium')
  })
})

// ─── Status Summary ───────────────────────────────────────────────────────────

describe('status summary', () => {
  it('returns null when nothing stored', () => {
    expect(svc.getStatusSummary(db, userId)).toBeNull()
  })

  it('saves and retrieves summary', () => {
    const summaries = [{ category: 'Work', bullets: ['Did a thing'], color: null }]
    svc.saveStatusSummary(db, userId, summaries)
    const stored = svc.getStatusSummary(db, userId)!
    expect(stored.summaries).toEqual(summaries)
    expect(stored.generated_at).toBeTruthy()
  })

  it('overwrites on second save', () => {
    svc.saveStatusSummary(db, userId, [{ category: 'Old', bullets: [], color: null }])
    svc.saveStatusSummary(db, userId, [{ category: 'New', bullets: [], color: null }])
    const stored = svc.getStatusSummary(db, userId)!
    expect(stored.summaries[0].category).toBe('New')
  })

  it('returns empty array when no ideas', async () => {
    const ai = makeAiClient('[]')
    const result = await svc.generateStatusSummary(db, ai, { efficient: 'test-model' }, userId)
    expect(result).toEqual([])
  })
})

// ─── Chat helpers ─────────────────────────────────────────────────────────────

describe('chat helpers', () => {
  it('saves and retrieves today chat', () => {
    svc.saveChatMessages(db, userId, 'Hello', 'World')
    const today = svc.getTodayChat(db, userId) as any[]
    expect(today).toHaveLength(2)
    expect(today[0].role).toBe('user')
    expect(today[1].role).toBe('assistant')
  })

  it('getTodayChat includes context from buildChatContext', () => {
    createIdea(db, userId, { title: 'Some Idea' })
    const { ideas, ideaContext } = svc.buildChatContext(db, userId)
    expect(ideas).toHaveLength(1)
    expect(ideaContext).toContain('Some Idea')
  })
})

// ─── formatForTelegram ────────────────────────────────────────────────────────

describe('formatForTelegram', () => {
  it('formats summaries as bullet list', () => {
    const summaries = [
      { category: 'Work', bullets: ['Completed task A', 'Started task B'] },
      { category: 'Personal', bullets: ['Read a book'] },
    ]
    const text = svc.formatForTelegram(summaries)
    expect(text).toContain('Work:')
    expect(text).toContain('• Completed task A')
    expect(text).toContain('Personal:')
    expect(text).toContain('• Read a book')
  })
})
