import { describe, it, expect, beforeEach } from 'vitest'
import Database                              from 'better-sqlite3'
import type { ModuleDb }                     from '@mosaic/sdk'
import { migrate }                           from '../../src/migrate.js'
import * as rpt                              from '../../src/services/report.service.js'
import { createIdea, updateIdea }            from '../../src/services/ideas.service.js'

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
  db.prepare('INSERT INTO users (username) VALUES (?)').run('charlie')
  return db
}

// Helper to set due_date on an idea bypassing service layer (to avoid COALESCE caveats)
function setDueDate(db: Database.Database, id: number, date: string) {
  db.prepare('UPDATE ideas_lab_ideas SET due_date = ? WHERE id = ?').run(date, id)
}

let db: Database.Database
let userId: number

beforeEach(() => {
  db = makeDb()
  userId = (db.prepare('SELECT id FROM users WHERE username = ?').get('charlie') as any).id
})

// ─── getOverdueIdeas ──────────────────────────────────────────────────────────

describe('getOverdueIdeas', () => {
  it('returns empty when no overdue ideas', () => {
    createIdea(db, userId, { title: 'Future' })
    expect(rpt.getOverdueIdeas(db, userId)).toHaveLength(0)
  })

  it('returns overdue ideas', () => {
    const idea = createIdea(db, userId, { title: 'Past Due' }) as any
    setDueDate(db, idea.id, '2020-01-01')
    const items = rpt.getOverdueIdeas(db, userId)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Past Due')
    expect(items[0].url).toBe(`/ideas/${idea.id}`)
  })

  it('excludes done and archived ideas', () => {
    const done = createIdea(db, userId, { title: 'Done', status: 'done' }) as any
    setDueDate(db, done.id, '2020-01-01')
    const archived = createIdea(db, userId, { title: 'Archived', status: 'archived' }) as any
    setDueDate(db, archived.id, '2020-01-01')
    expect(rpt.getOverdueIdeas(db, userId)).toHaveLength(0)
  })
})

// ─── getWeeklyIdeas ───────────────────────────────────────────────────────────

describe('getWeeklyIdeas', () => {
  it('returns ideas with due dates in range', () => {
    const idea = createIdea(db, userId, { title: 'In Range' }) as any
    setDueDate(db, idea.id, '2026-06-11')
    const items = rpt.getWeeklyIdeas(db, userId, '2026-06-09', '2026-06-15')
    expect(items.map(i => i.title)).toContain('In Range')
  })

  it('excludes ideas outside range with old updated_at', () => {
    const idea = createIdea(db, userId, { title: 'Outside' }) as any
    setDueDate(db, idea.id, '2025-01-01')
    // Reset updated_at so the "recently active" clause doesn't include it
    db.prepare("UPDATE ideas_lab_ideas SET updated_at = '2025-01-01' WHERE id = ?").run(idea.id)
    const items = rpt.getWeeklyIdeas(db, userId, '2026-06-09', '2026-06-15')
    expect(items.map(i => i.title)).not.toContain('Outside')
  })
})

// ─── getMonthlyIdeas ──────────────────────────────────────────────────────────

describe('getMonthlyIdeas', () => {
  it('returns ideas due in the month', () => {
    const idea = createIdea(db, userId, { title: 'June Task' }) as any
    setDueDate(db, idea.id, '2026-06-15')
    const items = rpt.getMonthlyIdeas(db, userId, 2026, 6)
    expect(items.map(i => i.title)).toContain('June Task')
  })

  it('excludes ideas outside the month', () => {
    const idea = createIdea(db, userId, { title: 'July Task' }) as any
    setDueDate(db, idea.id, '2026-07-01')
    const items = rpt.getMonthlyIdeas(db, userId, 2026, 6)
    expect(items.map(i => i.title)).not.toContain('July Task')
  })
})

// ─── getIdeaSummary ───────────────────────────────────────────────────────────

describe('getIdeaSummary', () => {
  it('counts ideas by status', () => {
    createIdea(db, userId, { title: 'A', status: 'new' })
    createIdea(db, userId, { title: 'B', status: 'new' })
    createIdea(db, userId, { title: 'C', status: 'in_progress' })
    const summary = rpt.getIdeaSummary(db, userId)
    expect(summary['new']).toBe(2)
    expect(summary['in progress']).toBe(1)
  })

  it('includes Overdue count when applicable', () => {
    const idea = createIdea(db, userId, { title: 'Old' }) as any
    setDueDate(db, idea.id, '2020-01-01')
    const summary = rpt.getIdeaSummary(db, userId)
    expect(summary['Overdue']).toBeGreaterThan(0)
  })

  it('returns empty object for user with no ideas', () => {
    expect(rpt.getIdeaSummary(db, userId)).toEqual({})
  })
})

// ─── getDueSoonIdeas ──────────────────────────────────────────────────────────

describe('getDueSoonIdeas', () => {
  it('returns ideas due within 2 days of given date', () => {
    const idea = createIdea(db, userId, { title: 'Due Tomorrow' }) as any
    setDueDate(db, idea.id, '2026-06-12')
    const items = rpt.getDueSoonIdeas(db, userId, '2026-06-11')
    expect(items.map(i => i.title)).toContain('Due Tomorrow')
  })

  it('excludes done ideas', () => {
    const idea = createIdea(db, userId, { title: 'Done Already', status: 'done' }) as any
    setDueDate(db, idea.id, '2026-06-12')
    expect(rpt.getDueSoonIdeas(db, userId, '2026-06-11')).toHaveLength(0)
  })
})

// ─── getOverdueNotifications ──────────────────────────────────────────────────

describe('getOverdueNotifications', () => {
  it('returns notification items for overdue ideas', () => {
    const idea = createIdea(db, userId, { title: 'Late', priority: 'high' }) as any
    setDueDate(db, idea.id, '2020-01-01')
    const items = rpt.getOverdueNotifications(db, userId, '2026-06-11')
    expect(items).toHaveLength(1)
    expect(items[0].body).toContain('Overdue since')
    expect(items[0].priority).toBe('high')
  })

  it('caps at 10 items', () => {
    for (let i = 0; i < 15; i++) {
      const idea = createIdea(db, userId, { title: `Late ${i}` }) as any
      setDueDate(db, idea.id, '2020-01-01')
    }
    const items = rpt.getOverdueNotifications(db, userId, '2026-06-11')
    expect(items).toHaveLength(10)
  })
})

// ─── getCalendarItems ─────────────────────────────────────────────────────────

describe('getCalendarItems', () => {
  it('returns empty array when nothing is due in the month', () => {
    expect(rpt.getCalendarItems(db, userId, 2026, 6)).toHaveLength(0)
  })

  it('returns ideas with due_date in the month as type "idea"', () => {
    const idea = createIdea(db, userId, { title: 'June plan' }) as any
    setDueDate(db, idea.id, '2026-06-15')
    const items = rpt.getCalendarItems(db, userId, 2026, 6)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id:   `idea:${idea.id}`,
      type: 'idea',
      date: '2026-06-15',
      url:  `/ideas/${idea.id}`,
    })
  })

  it('excludes done ideas', () => {
    const idea = createIdea(db, userId, { title: 'Done idea', status: 'done' }) as any
    setDueDate(db, idea.id, '2026-06-15')
    expect(rpt.getCalendarItems(db, userId, 2026, 6)).toHaveLength(0)
  })

  it('excludes archived ideas', () => {
    const idea = createIdea(db, userId, { title: 'Archived idea', status: 'archived' }) as any
    setDueDate(db, idea.id, '2026-06-15')
    expect(rpt.getCalendarItems(db, userId, 2026, 6)).toHaveLength(0)
  })

  it('excludes ideas due in a different month', () => {
    const idea = createIdea(db, userId, { title: 'July idea' }) as any
    setDueDate(db, idea.id, '2026-07-01')
    expect(rpt.getCalendarItems(db, userId, 2026, 6)).toHaveLength(0)
  })

  it('includes meta.priority on idea items', () => {
    const idea = createIdea(db, userId, { title: 'High priority', priority: 'high' }) as any
    setDueDate(db, idea.id, '2026-06-20')
    const items = rpt.getCalendarItems(db, userId, 2026, 6)
    expect(items[0].meta?.priority).toBe('high')
  })

  it('returns incomplete sub-items with due_date in month as type "task"', () => {
    const idea = createIdea(db, userId, { title: 'Parent idea' }) as any
    db.prepare(
      "INSERT INTO ideas_lab_sub_items (idea_id, title, due_date, position) VALUES (?, 'Sub task', '2026-06-10', 1)"
    ).run(idea.id)
    const items = rpt.getCalendarItems(db, userId, 2026, 6)
    const task = items.find((i: any) => i.type === 'task')
    expect(task).toBeDefined()
    expect(task?.id).toMatch(/^task:/)
    expect(task?.url).toBe(`/ideas/${idea.id}`)
    expect((task?.meta as any)?.idea_title).toBe('Parent idea')
  })

  it('excludes done sub-items', () => {
    const idea = createIdea(db, userId, { title: 'Parent' }) as any
    db.prepare(
      "INSERT INTO ideas_lab_sub_items (idea_id, title, due_date, done, position) VALUES (?, 'Done task', '2026-06-10', 1, 1)"
    ).run(idea.id)
    const items = rpt.getCalendarItems(db, userId, 2026, 6)
    expect(items.filter((i: any) => i.type === 'task')).toHaveLength(0)
  })

  it('returns both ideas and sub-items', () => {
    const idea = createIdea(db, userId, { title: 'Idea' }) as any
    setDueDate(db, idea.id, '2026-06-20')
    db.prepare(
      "INSERT INTO ideas_lab_sub_items (idea_id, title, due_date, position) VALUES (?, 'Task early', '2026-06-05', 1)"
    ).run(idea.id)
    const items = rpt.getCalendarItems(db, userId, 2026, 6)
    expect(items.filter((i: any) => i.type === 'idea')).toHaveLength(1)
    expect(items.filter((i: any) => i.type === 'task')).toHaveLength(1)
  })
})

// ─── Sub-items in getOverdueIdeas ─────────────────────────────────────────────

describe('getOverdueIdeas — sub-items', () => {
  it('includes overdue incomplete sub-items', () => {
    const idea = createIdea(db, userId, { title: 'Project' }) as any
    db.prepare(
      "INSERT INTO ideas_lab_sub_items (idea_id, title, due_date, done, position) VALUES (?, 'Overdue task', '2020-01-01', 0, 1)"
    ).run(idea.id)
    const items = rpt.getOverdueIdeas(db, userId)
    expect(items.some(i => i.title === 'Overdue task')).toBe(true)
  })

  it('excludes done sub-items from overdue', () => {
    const idea = createIdea(db, userId, { title: 'Project' }) as any
    db.prepare(
      "INSERT INTO ideas_lab_sub_items (idea_id, title, due_date, done, position) VALUES (?, 'Done task', '2020-01-01', 1, 1)"
    ).run(idea.id)
    const items = rpt.getOverdueIdeas(db, userId)
    expect(items.some(i => i.title === 'Done task')).toBe(false)
  })

  it('does not include sub-items without a due date', () => {
    const idea = createIdea(db, userId, { title: 'Project' }) as any
    db.prepare(
      "INSERT INTO ideas_lab_sub_items (idea_id, title, done, position) VALUES (?, 'No date task', 0, 1)"
    ).run(idea.id)
    const items = rpt.getOverdueIdeas(db, userId)
    expect(items.some(i => i.title === 'No date task')).toBe(false)
  })

  it('overdue sub-item has type "task" and url pointing to parent idea', () => {
    const idea = createIdea(db, userId, { title: 'Project' }) as any
    db.prepare(
      "INSERT INTO ideas_lab_sub_items (idea_id, title, due_date, done, position) VALUES (?, 'Fix thing', '2020-01-01', 0, 1)"
    ).run(idea.id)
    const items = rpt.getOverdueIdeas(db, userId)
    const task = items.find(i => i.title === 'Fix thing')
    expect(task).toBeDefined()
    expect(task!.url).toBe(`/ideas/${idea.id}`)
  })
})

// ─── Sub-items in getWeeklyIdeas ──────────────────────────────────────────────

describe('getWeeklyIdeas — sub-items', () => {
  it('includes incomplete sub-items with due date in range', () => {
    const idea = createIdea(db, userId, { title: 'Project' }) as any
    db.prepare(
      "INSERT INTO ideas_lab_sub_items (idea_id, title, due_date, done, position) VALUES (?, 'In-range task', '2026-06-11', 0, 1)"
    ).run(idea.id)
    const items = rpt.getWeeklyIdeas(db, userId, '2026-06-09', '2026-06-15')
    expect(items.some(i => i.title === 'In-range task')).toBe(true)
  })

  it('excludes done sub-items from weekly', () => {
    const idea = createIdea(db, userId, { title: 'Project' }) as any
    db.prepare(
      "INSERT INTO ideas_lab_sub_items (idea_id, title, due_date, done, position) VALUES (?, 'Done task', '2026-06-11', 1, 1)"
    ).run(idea.id)
    const items = rpt.getWeeklyIdeas(db, userId, '2026-06-09', '2026-06-15')
    expect(items.some(i => i.title === 'Done task')).toBe(false)
  })

  it('excludes sub-items outside the date range', () => {
    const idea = createIdea(db, userId, { title: 'Project' }) as any
    db.prepare(
      "INSERT INTO ideas_lab_sub_items (idea_id, title, due_date, done, position) VALUES (?, 'Future task', '2027-01-01', 0, 1)"
    ).run(idea.id)
    const items = rpt.getWeeklyIdeas(db, userId, '2026-06-09', '2026-06-15')
    expect(items.some(i => i.title === 'Future task')).toBe(false)
  })

  it('sub-item url points to parent idea', () => {
    const idea = createIdea(db, userId, { title: 'Project' }) as any
    db.prepare(
      "INSERT INTO ideas_lab_sub_items (idea_id, title, due_date, done, position) VALUES (?, 'Check thing', '2026-06-11', 0, 1)"
    ).run(idea.id)
    const items = rpt.getWeeklyIdeas(db, userId, '2026-06-09', '2026-06-15')
    const task = items.find(i => i.title === 'Check thing')
    expect(task!.url).toBe(`/ideas/${idea.id}`)
  })
})

// ─── Completed actions in getWeeklyIdeas ─────────────────────────────────────

describe('getWeeklyIdeas — completed actions', () => {
  it('includes completed next_action_log entries within date range', () => {
    const idea = createIdea(db, userId, { title: 'Project' }) as any
    db.prepare(
      "INSERT INTO ideas_lab_next_action_log (idea_id, user_id, action, completed_at) VALUES (?, ?, 'Reviewed docs', '2026-06-11 10:00:00')"
    ).run(idea.id, userId)
    const items = rpt.getWeeklyIdeas(db, userId, '2026-06-09', '2026-06-15')
    expect(items.some(i => i.title === 'Reviewed docs')).toBe(true)
  })

  it('excludes completed actions outside date range', () => {
    const idea = createIdea(db, userId, { title: 'Project' }) as any
    db.prepare(
      "INSERT INTO ideas_lab_next_action_log (idea_id, user_id, action, completed_at) VALUES (?, ?, 'Old action', '2025-01-01 10:00:00')"
    ).run(idea.id, userId)
    const items = rpt.getWeeklyIdeas(db, userId, '2026-06-09', '2026-06-15')
    expect(items.some(i => i.title === 'Old action')).toBe(false)
  })

  it('completed action has type "action" and url pointing to parent idea', () => {
    const idea = createIdea(db, userId, { title: 'Project' }) as any
    db.prepare(
      "INSERT INTO ideas_lab_next_action_log (idea_id, user_id, action, completed_at) VALUES (?, ?, 'Sent email', '2026-06-11 09:00:00')"
    ).run(idea.id, userId)
    const items = rpt.getWeeklyIdeas(db, userId, '2026-06-09', '2026-06-15')
    const action = items.find(i => i.title === 'Sent email')
    expect(action).toBeDefined()
    expect(action!.url).toBe(`/ideas/${idea.id}`)
  })
})
