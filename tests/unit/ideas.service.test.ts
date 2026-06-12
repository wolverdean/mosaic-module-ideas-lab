import { describe, it, expect, beforeEach } from 'vitest'
import Database                              from 'better-sqlite3'
import type { ModuleDb }                     from '@mosaic/sdk'
import { migrate }                           from '../../src/migrate.js'
import * as svc                              from '../../src/services/ideas.service.js'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE)')
  const moduleDb: ModuleDb = {
    prepare:     db.prepare.bind(db),
    exec:        (sql: string) => { db.exec(sql) },
    transaction: (fn) => db.transaction(fn),
    raw:         db,
  }
  migrate(moduleDb)
  db.prepare('INSERT INTO users (username) VALUES (?)').run('alice')
  return db
}

let db: Database.Database
let userId: number

beforeEach(() => {
  db = makeDb()
  userId = (db.prepare('SELECT id FROM users WHERE username = ?').get('alice') as any).id
})

// ─── Categories ───────────────────────────────────────────────────────────────

describe('categories', () => {
  it('creates and lists a category', () => {
    const cat = svc.createCategory(db, userId, 'Business', '#ff0000') as any
    expect(cat.name).toBe('Business')
    expect(cat.color).toBe('#ff0000')

    const list = svc.listCategories(db, userId) as any[]
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Business')
  })

  it('rejects duplicate category names', () => {
    svc.createCategory(db, userId, 'Dupes', '#000')
    expect(() => svc.createCategory(db, userId, 'Dupes', '#fff')).toThrow(/UNIQUE/)
  })

  it('deletes a category', () => {
    const cat = svc.createCategory(db, userId, 'ToDelete', '#000') as any
    const ok = svc.deleteCategory(db, userId, cat.id)
    expect(ok).toBe(true)
    expect(svc.listCategories(db, userId)).toHaveLength(0)
  })

  it('returns false when deleting non-existent category', () => {
    expect(svc.deleteCategory(db, userId, 9999)).toBe(false)
  })
})

// ─── Tags ─────────────────────────────────────────────────────────────────────

describe('tags', () => {
  it('returns empty list initially', () => {
    expect(svc.listTags(db, userId)).toHaveLength(0)
  })

  it('creates tags via createIdea', () => {
    svc.createIdea(db, userId, { title: 'Tagged', tags: ['alpha', 'beta'] })
    const tags = svc.listTags(db, userId) as any[]
    expect(tags.map((t: any) => t.name).sort()).toEqual(['alpha', 'beta'])
  })
})

// ─── Ideas CRUD ───────────────────────────────────────────────────────────────

describe('ideas', () => {
  it('creates an idea with defaults', () => {
    const idea = svc.createIdea(db, userId, { title: 'My Idea' }) as any
    expect(idea.title).toBe('My Idea')
    expect(idea.status).toBe('new')
    expect(idea.priority).toBe('low')
    expect(idea.para_type).toBe('inbox')
    expect(idea.tags).toEqual([])
  })

  it('creates an idea with tags', () => {
    const idea = svc.createIdea(db, userId, { title: 'Tagged', tags: ['x', 'y'] }) as any
    expect(idea.tags.sort()).toEqual(['x', 'y'])
  })

  it('lists ideas filtering archived/done/cancelled by default', () => {
    svc.createIdea(db, userId, { title: 'Active' })
    svc.createIdea(db, userId, { title: 'Archived', status: 'archived' })
    const list = svc.listIdeas(db, userId) as any[]
    expect(list.map((i: any) => i.title)).toContain('Active')
    expect(list.map((i: any) => i.title)).not.toContain('Archived')
  })

  it('lists ideas for para_type=archive shows archived and done', () => {
    svc.createIdea(db, userId, { title: 'Done', status: 'done' })
    svc.createIdea(db, userId, { title: 'Active' })
    const list = svc.listIdeas(db, userId, { para_type: 'archive' }) as any[]
    expect(list.map((i: any) => i.title)).toContain('Done')
    expect(list.map((i: any) => i.title)).not.toContain('Active')
  })

  it('gets a single idea with attachments and tags', () => {
    const created = svc.createIdea(db, userId, { title: 'Single', tags: ['t1'] }) as any
    const idea = svc.getIdea(db, userId, created.id) as any
    expect(idea.title).toBe('Single')
    expect(idea.tags).toEqual(['t1'])
    expect(Array.isArray(idea.attachments)).toBe(true)
  })

  it('returns null for non-existent idea', () => {
    expect(svc.getIdea(db, userId, 9999)).toBeNull()
  })

  it('updates an idea', () => {
    const idea = svc.createIdea(db, userId, { title: 'Old Title' }) as any
    const updated = svc.updateIdea(db, userId, idea.id, { title: 'New Title', priority: 'high' }) as any
    expect(updated.title).toBe('New Title')
    expect(updated.priority).toBe('high')
  })

  it('updates idea tags via replacement', () => {
    const idea = svc.createIdea(db, userId, { title: 'Tags Test', tags: ['a', 'b'] }) as any
    svc.updateIdea(db, userId, idea.id, { tags: ['c'] })
    const fetched = svc.getIdea(db, userId, idea.id) as any
    expect(fetched.tags).toEqual(['c'])
  })

  it('sets done_at when status becomes done', () => {
    const idea = svc.createIdea(db, userId, { title: 'Will Finish' }) as any
    svc.updateIdea(db, userId, idea.id, { status: 'done' })
    const updated = svc.getIdea(db, userId, idea.id) as any
    expect(updated.done_at).toBeTruthy()
  })

  it('returns null when updating non-existent idea', () => {
    expect(svc.updateIdea(db, userId, 9999, { title: 'X' })).toBeNull()
  })

  it('deletes an idea', () => {
    const idea = svc.createIdea(db, userId, { title: 'Delete Me' }) as any
    const ok = svc.deleteIdea(db, userId, idea.id, '/tmp')
    expect(ok).toBe(true)
    expect(svc.getIdea(db, userId, idea.id)).toBeNull()
  })
})

// ─── FTS Search ───────────────────────────────────────────────────────────────

describe('fulltext search', () => {
  it('finds ideas by title prefix', () => {
    svc.createIdea(db, userId, { title: 'Quantum Computing Project' })
    svc.createIdea(db, userId, { title: 'Classical Music Playlist' })
    const results = svc.listIdeas(db, userId, { q: 'Quantum' }) as any[]
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Quantum Computing Project')
  })

  it('returns empty for no match', () => {
    svc.createIdea(db, userId, { title: 'Something' })
    expect(svc.listIdeas(db, userId, { q: 'zzz_no_match' })).toHaveLength(0)
  })
})

// ─── Sub-items ────────────────────────────────────────────────────────────────

describe('sub-items', () => {
  let ideaId: number

  beforeEach(() => {
    const idea = svc.createIdea(db, userId, { title: 'Parent Idea' }) as any
    ideaId = idea.id
  })

  it('creates and lists a sub-item', () => {
    const sub = svc.createSubitem(db, userId, ideaId, { title: 'Task 1' }) as any
    expect(sub.title).toBe('Task 1')
    expect(sub.done).toBe(0)

    const list = svc.listSubitems(db, userId, ideaId) as any[]
    expect(list).toHaveLength(1)
  })

  it('returns null for unknown idea', () => {
    expect(svc.createSubitem(db, userId, 9999, { title: 'X' })).toBeNull()
  })

  it('updates a sub-item done flag via done field', () => {
    const sub = svc.createSubitem(db, userId, ideaId, { title: 'T' }) as any
    const updated = svc.updateSubitem(db, userId, sub.id, { done: true }) as any
    expect(updated.done).toBe(1)
  })

  it('syncs done flag when task_status is set to done', () => {
    const sub = svc.createSubitem(db, userId, ideaId, { title: 'T' }) as any
    const updated = svc.updateSubitem(db, userId, sub.id, { task_status: 'done' }) as any
    expect(updated.done).toBe(1)
    expect(updated.task_status).toBe('done')
  })

  it('deletes a sub-item', () => {
    const sub = svc.createSubitem(db, userId, ideaId, { title: 'T' }) as any
    expect(svc.deleteSubitem(db, userId, sub.id)).toBe(true)
    expect(svc.listSubitems(db, userId, ideaId)).toHaveLength(0)
  })

  it('auto-completes milestone when all tasks are done', () => {
    // Create milestone
    const ms = svc.createMilestone(db, userId, ideaId, { title: 'Phase 1' }) as any
    // Create task under milestone
    const sub = svc.createSubitem(db, userId, ideaId, { title: 'T', milestone_id: ms.id }) as any
    // Complete the task
    svc.updateSubitem(db, userId, sub.id, { done: true })
    // Milestone should be auto-completed
    const updated = db.prepare('SELECT done FROM ideas_lab_project_milestones WHERE id = ?').get(ms.id) as any
    expect(updated.done).toBe(1)
  })
})

// ─── Milestones ───────────────────────────────────────────────────────────────

describe('milestones', () => {
  let ideaId: number

  beforeEach(() => {
    const idea = svc.createIdea(db, userId, { title: 'Project' }) as any
    ideaId = idea.id
  })

  it('creates and lists milestones', () => {
    svc.createMilestone(db, userId, ideaId, { title: 'Phase 1' })
    svc.createMilestone(db, userId, ideaId, { title: 'Phase 2' })
    const list = svc.listMilestones(db, userId, ideaId) as any[]
    expect(list).toHaveLength(2)
    expect(list[0].title).toBe('Phase 1')
  })

  it('updates a milestone', () => {
    const ms = svc.createMilestone(db, userId, ideaId, { title: 'M' }) as any
    const updated = svc.updateMilestone(db, userId, ms.id, { title: 'M Updated', done: true }) as any
    expect(updated.title).toBe('M Updated')
    expect(updated.done).toBe(1)
    expect(updated.done_at).toBeTruthy()
  })

  it('deletes a milestone', () => {
    const ms = svc.createMilestone(db, userId, ideaId, { title: 'Del' }) as any
    expect(svc.deleteMilestone(db, userId, ms.id)).toBe(true)
    expect(svc.listMilestones(db, userId, ideaId)).toHaveLength(0)
  })
})

// ─── Next Action Log ──────────────────────────────────────────────────────────

describe('next action log', () => {
  it('logs completion and clears next_action', () => {
    const idea = svc.createIdea(db, userId, { title: 'Project', next_action: 'Write tests' }) as any
    const result = svc.completeNextAction(db, userId, idea.id) as any
    expect(result.ok).toBe(true)
    expect(result.logged).toBe('Write tests')

    const updated = svc.getIdea(db, userId, idea.id) as any
    expect(updated.next_action).toBeNull()
  })

  it('returns error when no next action set', () => {
    const idea = svc.createIdea(db, userId, { title: 'Bare Idea' }) as any
    const result = svc.completeNextAction(db, userId, idea.id) as any
    expect(result.error).toBeDefined()
  })

  it('returns the log for an idea', () => {
    const idea = svc.createIdea(db, userId, { title: 'Project', next_action: 'Do A' }) as any
    svc.completeNextAction(db, userId, idea.id)
    const log = svc.getNextActionLog(db, userId, idea.id) as any[]
    expect(log).toHaveLength(1)
    expect(log[0].action).toBe('Do A')
  })
})

// ─── Duplicate ────────────────────────────────────────────────────────────────

describe('duplicateIdea', () => {
  it('copies idea with milestones and tasks reset to undone', () => {
    const idea = svc.createIdea(db, userId, { title: 'Template' }) as any
    const ms = svc.createMilestone(db, userId, idea.id, { title: 'Phase' }) as any
    svc.createSubitem(db, userId, idea.id, { title: 'Task', milestone_id: ms.id })

    const dup = svc.duplicateIdea(db, userId, idea.id, 'Copy') as any
    expect(dup.id).toBeDefined()

    const newMilestones = svc.listMilestones(db, userId, dup.id) as any[]
    expect(newMilestones).toHaveLength(1)
    expect(newMilestones[0].done).toBe(0)

    const newTasks = svc.listSubitems(db, userId, dup.id) as any[]
    expect(newTasks).toHaveLength(1)
    expect(newTasks[0].done).toBe(0)
    expect(newTasks[0].task_status).toBe('todo')
  })
})
