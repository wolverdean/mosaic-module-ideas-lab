/**
 * Acceptance tests — verified against the approved user story.
 *
 * Story: "As a user I want to capture, organise, and act on ideas using the
 * PARA method so that no idea is lost and every project has a clear next action."
 *
 * Acceptance criteria checked here:
 * AC1  — Ideas can be created with title, notes, priority, status, tags, category, due date
 * AC2  — Ideas are surfaced by PARA type (Inbox, Projects, Areas, Resources, Archive)
 * AC3  — Full-text search across title and notes
 * AC4  — AI enrich returns summary, tags, category suggestion, priority
 * AC5  — AI generate returns a structured idea from a prompt
 * AC6  — AI related finds semantically similar ideas
 * AC7  — Status summary can be generated and stored
 * AC8  — Sub-items can be added and completed; milestone auto-completes when all tasks done
 * AC9  — Next action can be set, completed, and logged
 * AC10 — Overdue and due-soon hooks return correct NotificationItems
 * AC11 — Report hooks (overdue, weekly, monthly, summary) return correct ReportItems
 * AC12 — Duplicate copies milestones and tasks reset to undone
 * AC13 — Module manifest satisfies the ModuleManifest contract (slug, version, migrate, router, nav)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database                                  from 'better-sqlite3'
import type { ModuleDb, ModuleManifest }         from '@mosaic/sdk'
import type Anthropic                            from '@anthropic-ai/sdk'
import { migrate }                               from '../../src/migrate.js'
import * as ideas                                from '../../src/services/ideas.service.js'
import * as ai                                   from '../../src/services/ai.service.js'
import * as report                               from '../../src/services/report.service.js'
import manifest                                  from '../../index.js'

// ─── Test DB factory ──────────────────────────────────────────────────────────

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE)')
  const mdb: ModuleDb = {
    prepare:     db.prepare.bind(db),
    exec:        sql => { db.exec(sql) },
    transaction: fn => db.transaction(fn),
    raw:         db,
  }
  migrate(mdb)
  db.prepare('INSERT INTO users (username) VALUES (?)').run('acceptance-user')
  return db
}

function mockAi(text: string): Anthropic {
  return {
    messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text }] }) },
  } as unknown as Anthropic
}

let db: Database.Database
let userId: number

beforeEach(() => {
  db = createDb()
  userId = (db.prepare('SELECT id FROM users WHERE username = ?').get('acceptance-user') as any).id
})

// ─── AC1: Create idea ─────────────────────────────────────────────────────────

describe('AC1 — create idea', () => {
  it('stores all fields and returns a tagged idea', () => {
    const idea = ideas.createIdea(db, userId, {
      title:      'Launch marketing campaign',
      notes:      'Need a landing page and email sequence',
      priority:   'high',
      status:     'in_progress',
      tags:       ['marketing', 'Q3'],
      para_type:  'project',
      next_action:'Draft landing page copy',
    }) as any
    expect(idea.title).toBe('Launch marketing campaign')
    expect(idea.priority).toBe('high')
    expect(idea.status).toBe('in_progress')
    expect(idea.tags.sort()).toEqual(['Q3', 'marketing'])
    expect(idea.next_action).toBe('Draft landing page copy')
  })
})

// ─── AC2: PARA filtering ──────────────────────────────────────────────────────

describe('AC2 — PARA type filtering', () => {
  it('returns only inbox ideas by default tab', () => {
    ideas.createIdea(db, userId, { title: 'Inbox Item', para_type: 'inbox' })
    ideas.createIdea(db, userId, { title: 'Project Item', para_type: 'project' })
    const list = ideas.listIdeas(db, userId, { para_type: 'inbox' }) as any[]
    expect(list.map(i => i.title)).toContain('Inbox Item')
    expect(list.map(i => i.title)).not.toContain('Project Item')
  })

  it('archive tab shows done and archived status', () => {
    ideas.createIdea(db, userId, { title: 'Done Idea', status: 'done' })
    ideas.createIdea(db, userId, { title: 'Active Idea', status: 'new' })
    const list = ideas.listIdeas(db, userId, { para_type: 'archive' }) as any[]
    expect(list.map(i => i.title)).toContain('Done Idea')
    expect(list.map(i => i.title)).not.toContain('Active Idea')
  })
})

// ─── AC3: Full-text search ────────────────────────────────────────────────────

describe('AC3 — full-text search', () => {
  it('finds ideas matching title prefix', () => {
    ideas.createIdea(db, userId, { title: 'Refactor authentication module' })
    ideas.createIdea(db, userId, { title: 'Deploy new server' })
    const results = ideas.listIdeas(db, userId, { q: 'Refactor' }) as any[]
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Refactor authentication module')
  })

  it('finds ideas matching notes content', () => {
    ideas.createIdea(db, userId, { title: 'Side project', notes: 'Involves machine learning pipeline' })
    ideas.createIdea(db, userId, { title: 'Other idea', notes: 'Nothing special' })
    const results = ideas.listIdeas(db, userId, { q: 'machine' }) as any[]
    expect(results.map((i: any) => i.title)).toContain('Side project')
  })
})

// ─── AC4: AI enrich ───────────────────────────────────────────────────────────

describe('AC4 — AI enrich', () => {
  it('returns structured enrichment and persists to DB', async () => {
    const idea = ideas.createIdea(db, userId, { title: 'Automate invoicing' }) as any
    const enrichResp = JSON.stringify({ summary: 'Automate invoice creation', tags: ['finance', 'automation'], category: 'Operations', priority: 'high' })
    const result = await ai.enrichIdea(db, mockAi(enrichResp), { quality: 'm' }, userId, idea.id) as any
    expect(result.summary).toBe('Automate invoice creation')
    expect(result.tags).toContain('finance')
    expect(result.priority).toBe('high')
    const row = db.prepare('SELECT ai_enriched, ai_summary FROM ideas_lab_ideas WHERE id = ?').get(idea.id) as any
    expect(row.ai_enriched).toBe(1)
    expect(row.ai_summary).toBe('Automate invoice creation')
  })
})

// ─── AC5: AI generate ────────────────────────────────────────────────────────

describe('AC5 — AI generate', () => {
  it('parses structured idea from prompt', async () => {
    const resp = JSON.stringify({ title: 'Build a CLI tool', notes: 'For automating deploys', tags: ['devops'], priority: 'medium' })
    const result = await ai.generateIdea(mockAi(resp), { quality: 'm' }, 'automation tool') as any
    expect(result.title).toBe('Build a CLI tool')
    expect(result.priority).toBe('medium')
  })
})

// ─── AC6: AI related ─────────────────────────────────────────────────────────

describe('AC6 — AI related', () => {
  it('maps returned IDs to idea objects', async () => {
    const a = ideas.createIdea(db, userId, { title: 'Machine Learning research' }) as any
    const b = ideas.createIdea(db, userId, { title: 'Deep Learning book' }) as any
    const result = await ai.relatedIdeas(db, mockAi(JSON.stringify([b.id])), { quality: 'm' }, userId, a.id) as any
    expect(result.related).toHaveLength(1)
    expect(result.related[0].title).toBe('Deep Learning book')
  })
})

// ─── AC7: Status summary ──────────────────────────────────────────────────────

describe('AC7 — status summary', () => {
  it('returns null before any summary exists', () => {
    expect(ai.getStatusSummary(db, userId)).toBeNull()
  })

  it('saves and retrieves a summary', () => {
    const summaries = [{ category: 'Work', bullets: ['Completed sprint'], color: null }]
    ai.saveStatusSummary(db, userId, summaries)
    const stored = ai.getStatusSummary(db, userId)!
    expect(stored.summaries).toEqual(summaries)
  })
})

// ─── AC8: Sub-items and milestone auto-complete ───────────────────────────────

describe('AC8 — sub-items and milestone auto-complete', () => {
  it('completes a task and auto-completes its milestone', () => {
    const idea = ideas.createIdea(db, userId, { title: 'Project' }) as any
    const ms   = ideas.createMilestone(db, userId, idea.id, { title: 'Phase 1' }) as any
    const task = ideas.createSubitem(db, userId, idea.id, { title: 'Task A', milestone_id: ms.id }) as any
    expect(task.done).toBe(0)

    ideas.updateSubitem(db, userId, task.id, { task_status: 'done' })
    const updatedMs = db.prepare('SELECT done FROM ideas_lab_project_milestones WHERE id = ?').get(ms.id) as any
    expect(updatedMs.done).toBe(1)
  })
})

// ─── AC9: Next action log ─────────────────────────────────────────────────────

describe('AC9 — next action', () => {
  it('completes the action, clears it, and creates a log entry', () => {
    const idea = ideas.createIdea(db, userId, { title: 'Project', next_action: 'Send proposal' }) as any
    const result = ideas.completeNextAction(db, userId, idea.id) as any
    expect(result.ok).toBe(true)
    expect(result.logged).toBe('Send proposal')

    const updated = ideas.getIdea(db, userId, idea.id) as any
    expect(updated.next_action).toBeNull()

    const log = ideas.getNextActionLog(db, userId, idea.id) as any[]
    expect(log).toHaveLength(1)
    expect(log[0].action).toBe('Send proposal')
  })
})

// ─── AC10: Notification hooks ─────────────────────────────────────────────────

describe('AC10 — notification hooks', () => {
  function setDue(id: number, date: string) {
    db.prepare('UPDATE ideas_lab_ideas SET due_date = ? WHERE id = ?').run(date, id)
  }

  it('overdue hook returns overdue ideas as NotificationItems', () => {
    const idea = ideas.createIdea(db, userId, { title: 'Overdue Task' }) as any
    setDue(idea.id, '2020-01-01')
    const items = report.getOverdueNotifications(db, userId, '2026-06-11')
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Overdue Task')
    expect(items[0].id).toBe(idea.id)
    expect(typeof items[0].body).toBe('string')
    expect(items[0].url).toBe(`/ideas/${idea.id}`)
  })

  it('dueSoon hook returns ideas due within 2 days', () => {
    const idea = ideas.createIdea(db, userId, { title: 'Due Tomorrow' }) as any
    setDue(idea.id, '2026-06-12')
    const items = report.getDueSoonIdeas(db, userId, '2026-06-11')
    expect(items.map(i => i.title)).toContain('Due Tomorrow')
  })
})

// ─── AC11: Report hooks ───────────────────────────────────────────────────────

describe('AC11 — report hooks', () => {
  function setDue(id: number, date: string) {
    db.prepare('UPDATE ideas_lab_ideas SET due_date = ? WHERE id = ?').run(date, id)
  }

  it('overdue report returns ideas with past due dates', () => {
    const idea = ideas.createIdea(db, userId, { title: 'Missed Deadline' }) as any
    setDue(idea.id, '2020-01-01')
    const items = report.getOverdueIdeas(db, userId)
    expect(items.map(i => i.title)).toContain('Missed Deadline')
    expect(items[0]).toMatchObject({ id: expect.any(Number), title: expect.any(String), url: expect.stringContaining('/ideas/') })
  })

  it('summary returns count by status', () => {
    ideas.createIdea(db, userId, { title: 'A', status: 'new' })
    ideas.createIdea(db, userId, { title: 'B', status: 'new' })
    ideas.createIdea(db, userId, { title: 'C', status: 'in_progress' })
    const s = report.getIdeaSummary(db, userId)
    expect(s['new']).toBe(2)
    expect(s['in progress']).toBe(1)
  })

  it('weekly report finds ideas due in range', () => {
    const idea = ideas.createIdea(db, userId, { title: 'This Week' }) as any
    setDue(idea.id, '2026-06-11')
    const items = report.getWeeklyIdeas(db, userId, '2026-06-09', '2026-06-15')
    expect(items.map(i => i.title)).toContain('This Week')
  })

  it('monthly report finds ideas due in month', () => {
    const idea = ideas.createIdea(db, userId, { title: 'June Goal' }) as any
    setDue(idea.id, '2026-06-20')
    const items = report.getMonthlyIdeas(db, userId, 2026, 6)
    expect(items.map(i => i.title)).toContain('June Goal')
  })
})

// ─── AC12: Duplicate ──────────────────────────────────────────────────────────

describe('AC12 — duplicate idea', () => {
  it('creates a copy with milestones and tasks reset to undone', () => {
    const idea = ideas.createIdea(db, userId, { title: 'Original Project' }) as any
    const ms   = ideas.createMilestone(db, userId, idea.id, { title: 'Discovery' }) as any
    ideas.updateMilestone(db, userId, ms.id, { done: true })
    ideas.createSubitem(db, userId, idea.id, { title: 'Research competitors', milestone_id: ms.id })

    const dup = ideas.duplicateIdea(db, userId, idea.id, 'Copy of Original') as any
    expect(dup.id).not.toBe(idea.id)

    const newMs = ideas.listMilestones(db, userId, dup.id) as any[]
    expect(newMs).toHaveLength(1)
    expect(newMs[0].done).toBe(0)

    const newTasks = ideas.listSubitems(db, userId, dup.id) as any[]
    expect(newTasks).toHaveLength(1)
    expect(newTasks[0].done).toBe(0)
    expect(newTasks[0].task_status).toBe('todo')
  })
})

// ─── AC13: Module manifest contract ──────────────────────────────────────────

describe('AC13 — ModuleManifest contract', () => {
  it('exports a valid manifest with required fields', () => {
    expect(manifest.name).toBe('Ideas Lab')
    expect(manifest.slug).toBe('ideas-lab')
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(typeof manifest.migrate).toBe('function')
    expect(manifest.router).toBeDefined()
    expect(manifest.nav).toBeDefined()
    expect(manifest.nav.label).toBe('Ideas')
    expect(manifest.nav.order).toBeTypeOf('number')
  })

  it('has report hooks for overdue, weekly, monthly, summary', () => {
    expect(typeof manifest.reports?.overdue).toBe('function')
    expect(typeof manifest.reports?.weekly).toBe('function')
    expect(typeof manifest.reports?.monthly).toBe('function')
    expect(typeof manifest.reports?.summary).toBe('function')
  })

  it('has notification hooks for dueSoon and overdue', () => {
    expect(typeof manifest.notifications?.dueSoon).toBe('function')
    expect(typeof manifest.notifications?.overdue).toBe('function')
  })

  it('declares scheduled jobs with valid cron expressions', () => {
    expect(manifest.jobs?.length).toBeGreaterThanOrEqual(2)
    for (const job of manifest.jobs ?? []) {
      expect(job.name).toMatch(/^ideas-lab:/)
      expect(job.schedule).toMatch(/^[\d*\/,\- ]+$/)
      expect(typeof job.fn).toBe('function')
    }
  })

  it('frontend entry points to /api/ideas-lab/ui.js', () => {
    expect(manifest.frontend?.entry).toBe('/api/ideas-lab/ui.js')
  })

  it('migrate is idempotent — runs twice without error', () => {
    const db2 = new Database(':memory:')
    db2.pragma('foreign_keys = ON')
    db2.exec('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE)')
    const mdb: ModuleDb = { prepare: db2.prepare.bind(db2), exec: sql => { db2.exec(sql) }, transaction: fn => db2.transaction(fn), raw: db2 }
    expect(() => { migrate(mdb); migrate(mdb) }).not.toThrow()
  })
})
