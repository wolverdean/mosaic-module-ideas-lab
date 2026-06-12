import path from 'node:path'
import fs   from 'node:fs'
import type { Database } from 'better-sqlite3'

// ─── Categories ───────────────────────────────────────────────────────────────

export function listCategories(db: Database, userId: number) {
  return db.prepare(
    'SELECT * FROM ideas_lab_categories WHERE user_id = ? ORDER BY name'
  ).all(userId)
}

export function createCategory(db: Database, userId: number, name: string, color: string) {
  const result = db.prepare(
    'INSERT INTO ideas_lab_categories (user_id, name, color) VALUES (?, ?, ?)'
  ).run(userId, name.trim(), color)
  return { id: result.lastInsertRowid, name: name.trim(), color }
}

export function deleteCategory(db: Database, userId: number, id: number) {
  const cat = db.prepare(
    'SELECT id FROM ideas_lab_categories WHERE id = ? AND user_id = ?'
  ).get(id, userId)
  if (!cat) return false
  db.prepare('DELETE FROM ideas_lab_categories WHERE id = ?').run(id)
  return true
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export function listTags(db: Database, userId: number) {
  return db.prepare(
    'SELECT * FROM ideas_lab_tags WHERE user_id = ? ORDER BY name'
  ).all(userId)
}

function upsertTag(db: Database, userId: number, name: string): number {
  let tag = db.prepare(
    'SELECT id FROM ideas_lab_tags WHERE user_id = ? AND name = ?'
  ).get(userId, name) as { id: number } | undefined
  if (!tag) {
    const r = db.prepare(
      'INSERT INTO ideas_lab_tags (user_id, name) VALUES (?, ?)'
    ).run(userId, name)
    tag = { id: Number(r.lastInsertRowid) }
  }
  return (tag as { id: number }).id
}

function attachTags(db: Database, ideaId: number | bigint, userId: number, tags: string[]) {
  for (const name of tags) {
    if (!name.trim()) continue
    const tagId = upsertTag(db, userId, name.trim())
    db.prepare(
      'INSERT OR IGNORE INTO ideas_lab_idea_tags (idea_id, tag_id) VALUES (?, ?)'
    ).run(ideaId, tagId)
  }
}

function getIdeaTags(db: Database, ideaId: number | bigint): string[] {
  return (db.prepare(
    'SELECT t.name FROM ideas_lab_tags t JOIN ideas_lab_idea_tags it ON it.tag_id = t.id WHERE it.idea_id = ?'
  ).all(ideaId) as { name: string }[]).map(r => r.name)
}

// ─── Ideas ────────────────────────────────────────────────────────────────────

const IDEA_SELECT = `
  SELECT i.*, c.name AS category_name, c.color AS category_color,
    COUNT(DISTINCT si.id) AS subitem_count,
    COALESCE(SUM(si.done), 0) AS subitem_done,
    COUNT(DISTINCT pm.id) AS milestone_count,
    COUNT(DISTINCT CASE WHEN pm.done=1 THEN pm.id END) AS milestone_done,
    (SELECT title FROM ideas_lab_project_milestones
     WHERE idea_id = i.id AND done = 0 ORDER BY position, id LIMIT 1) AS current_milestone_title
  FROM ideas_lab_ideas i
  LEFT JOIN ideas_lab_categories c ON c.id = i.category_id
  LEFT JOIN ideas_lab_sub_items si ON si.idea_id = i.id
  LEFT JOIN ideas_lab_project_milestones pm ON pm.idea_id = i.id
`

interface ListFilters {
  q?:             string
  category?:      string | number
  category_name?: string
  priority?:      string
  status?:        string
  tag?:           string
  para_type?:     string
}

export function listIdeas(db: Database, userId: number, filters: ListFilters = {}) {
  const { q, category, category_name, priority, status, tag, para_type } = filters

  let categoryId: string | number | null = category ?? null
  if (category_name) {
    const cat = db.prepare(
      'SELECT id FROM ideas_lab_categories WHERE user_id = ? AND lower(name) = lower(?)'
    ).get(userId, category_name.trim()) as { id: number } | undefined
    if (!cat) return []
    categoryId = cat.id
  }

  let rows: any[]
  if (q?.trim()) {
    let ftsResults: { rowid: number }[]
    try {
      ftsResults = db.prepare(
        'SELECT rowid FROM ideas_lab_ideas_fts WHERE ideas_lab_ideas_fts MATCH ? ORDER BY rank'
      ).all(q.trim() + '*') as { rowid: number }[]
    } catch {
      return []
    }
    if (!ftsResults.length) return []
    const ids = ftsResults.map(r => r.rowid)
    const placeholders = ids.map(() => '?').join(',')
    rows = db.prepare(
      `${IDEA_SELECT} WHERE i.user_id = ? AND i.id IN (${placeholders}) GROUP BY i.id ORDER BY i.updated_at DESC`
    ).all(userId, ...ids) as any[]
  } else {
    let sql = `${IDEA_SELECT} WHERE i.user_id = ?`
    const params: (string | number)[] = [userId]
    if (categoryId) { sql += ' AND i.category_id = ?'; params.push(categoryId) }
    if (priority)   { sql += ' AND i.priority = ?';    params.push(priority) }
    if (para_type === 'archive') {
      sql += " AND i.status IN ('archived', 'done')"
    } else if (para_type) {
      sql += " AND i.para_type = ? AND i.status NOT IN ('archived', 'done')"
      params.push(para_type)
      if (status) { sql += ' AND i.status = ?'; params.push(status) }
    } else {
      if (status) { sql += ' AND i.status = ?'; params.push(status) }
      else        { sql += " AND i.status NOT IN ('archived','done','cancelled')" }
    }
    sql += ' GROUP BY i.id ORDER BY i.updated_at DESC'
    rows = db.prepare(sql).all(...params) as any[]
  }

  // Filter by tag
  let filtered = rows
  if (tag) {
    const taggedIds = new Set(
      (db.prepare(
        'SELECT it.idea_id FROM ideas_lab_idea_tags it JOIN ideas_lab_tags t ON t.id = it.tag_id WHERE t.user_id = ? AND t.name = ?'
      ).all(userId, tag) as { idea_id: number }[]).map(r => r.idea_id)
    )
    filtered = rows.filter((r: any) => taggedIds.has(r.id))
  }

  const ideaIds = filtered.map((r: any) => r.id)
  const allTags = ideaIds.length
    ? (db.prepare(
        `SELECT it.idea_id, t.name FROM ideas_lab_idea_tags it JOIN ideas_lab_tags t ON t.id = it.tag_id WHERE it.idea_id IN (${ideaIds.map(() => '?').join(',')})`
      ).all(...ideaIds) as { idea_id: number; name: string }[])
    : []

  const tagMap: Record<number, string[]> = {}
  allTags.forEach(r => { (tagMap[r.idea_id] ??= []).push(r.name) })

  return filtered.map((idea: any) => ({ ...idea, tags: tagMap[idea.id] ?? [] }))
}

export function getIdea(db: Database, userId: number, id: number) {
  const idea = db.prepare(
    `SELECT i.*, c.name AS category_name, c.color AS category_color
     FROM ideas_lab_ideas i LEFT JOIN ideas_lab_categories c ON c.id = i.category_id
     WHERE i.id = ? AND i.user_id = ?`
  ).get(id, userId) as any
  if (!idea) return null

  idea.tags = getIdeaTags(db, idea.id)
  idea.attachments = db.prepare(
    'SELECT id, original_name, mime_type, size, created_at FROM ideas_lab_attachments WHERE idea_id = ?'
  ).all(idea.id)
  return idea
}

export function createIdea(
  db: Database,
  userId: number,
  body: {
    title: string; notes?: string; priority?: string; status?: string;
    category_id?: number; due_date?: string; tags?: string[];
    para_type?: string; goal?: string; next_action?: string;
  }
) {
  const {
    title, notes = '', priority = 'low', status = 'new',
    category_id, due_date, tags = [],
    para_type = 'inbox', goal, next_action,
  } = body

  const result = db.prepare(
    `INSERT INTO ideas_lab_ideas
     (user_id, title, notes, priority, status, category_id, due_date, para_type, goal, next_action)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, title.trim(), notes, priority, status, category_id ?? null, due_date ?? null, para_type, goal ?? null, next_action ?? null)

  const ideaId = result.lastInsertRowid
  attachTags(db, ideaId, userId, tags)

  const idea = db.prepare(
    `SELECT i.*, c.name AS category_name, c.color AS category_color
     FROM ideas_lab_ideas i LEFT JOIN ideas_lab_categories c ON c.id = i.category_id WHERE i.id = ?`
  ).get(ideaId) as any
  idea.tags = getIdeaTags(db, ideaId)
  return idea
}

export function updateIdea(
  db: Database,
  userId: number,
  id: number,
  body: {
    title?: string; notes?: string; priority?: string; status?: string;
    category_id?: unknown; due_date?: unknown; tags?: string[];
    para_type?: string; goal?: unknown; next_action?: unknown;
  }
) {
  const existing = db.prepare(
    'SELECT id FROM ideas_lab_ideas WHERE id = ? AND user_id = ?'
  ).get(id, userId)
  if (!existing) return null

  const { title, notes, priority, status, category_id, due_date, tags, para_type, goal, next_action } = body

  db.prepare(`
    UPDATE ideas_lab_ideas SET
      title       = COALESCE(?, title),
      notes       = COALESCE(?, notes),
      priority    = COALESCE(?, priority),
      status      = COALESCE(?, status),
      done_at     = CASE
                      WHEN ? = 'done' THEN COALESCE(done_at, datetime('now'))
                      WHEN ? IS NOT NULL THEN NULL
                      ELSE done_at
                    END,
      due_date    = CASE WHEN ? IS NOT NULL THEN ? ELSE due_date END,
      category_id = CASE WHEN ? IS NOT NULL THEN ? ELSE category_id END,
      para_type   = COALESCE(?, para_type),
      goal        = CASE WHEN ? IS NOT NULL THEN ? ELSE goal END,
      next_action = CASE WHEN ? IS NOT NULL THEN ? ELSE next_action END,
      updated_at  = datetime('now')
    WHERE id = ?
  `).run(
    title ? title.trim() : null,
    notes ?? null,
    priority ?? null,
    status ?? null,
    status ?? null,
    status ?? null,
    due_date !== undefined ? 1 : null,
    due_date ?? null,
    category_id !== undefined ? 1 : null,
    category_id ?? null,
    para_type ?? null,
    goal !== undefined ? 1 : null, goal ?? null,
    next_action !== undefined ? 1 : null, next_action ?? null,
    id,
  )

  if (Array.isArray(tags)) {
    db.prepare('DELETE FROM ideas_lab_idea_tags WHERE idea_id = ?').run(id)
    attachTags(db, id, userId, tags)
  }

  const updated = db.prepare(
    `SELECT i.*, c.name AS category_name, c.color AS category_color
     FROM ideas_lab_ideas i LEFT JOIN ideas_lab_categories c ON c.id = i.category_id WHERE i.id = ?`
  ).get(id) as any
  updated.tags = getIdeaTags(db, id)
  return updated
}

export function deleteIdea(db: Database, userId: number, id: number, uploadDir: string) {
  const idea = db.prepare(
    'SELECT id FROM ideas_lab_ideas WHERE id = ? AND user_id = ?'
  ).get(id, userId)
  if (!idea) return false

  const attachments = db.prepare(
    'SELECT filename FROM ideas_lab_attachments WHERE idea_id = ?'
  ).all(id) as { filename: string }[]
  for (const att of attachments) {
    const filePath = path.join(uploadDir, String(userId), att.filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }
  db.prepare('DELETE FROM ideas_lab_ideas WHERE id = ?').run(id)
  return true
}

export function duplicateIdea(db: Database, userId: number, id: number, newTitle?: string) {
  const idea = db.prepare(
    'SELECT * FROM ideas_lab_ideas WHERE id = ? AND user_id = ?'
  ).get(id, userId) as any
  if (!idea) return null

  const title = (newTitle || idea.title).trim()
  const { lastInsertRowid: newId } = db.prepare(
    `INSERT INTO ideas_lab_ideas
     (user_id, title, notes, priority, status, category_id, due_date, para_type, goal, next_action)
     VALUES (?, ?, ?, ?, 'new', ?, ?, ?, ?, NULL)`
  ).run(userId, title, idea.notes, idea.priority, idea.category_id, null, idea.para_type, idea.goal)

  const milestones = db.prepare(
    'SELECT * FROM ideas_lab_project_milestones WHERE idea_id = ? ORDER BY position'
  ).all(id) as any[]
  const msMap: Record<number, bigint> = {}
  for (const ms of milestones) {
    const { lastInsertRowid: newMsId } = db.prepare(
      'INSERT INTO ideas_lab_project_milestones (idea_id, title, due_date, position, done) VALUES (?, ?, ?, ?, 0)'
    ).run(newId, ms.title, ms.due_date, ms.position)
    msMap[ms.id] = newMsId
  }

  const tasks = db.prepare(
    'SELECT * FROM ideas_lab_sub_items WHERE idea_id = ? ORDER BY position'
  ).all(id) as any[]
  for (const t of tasks) {
    db.prepare(
      `INSERT INTO ideas_lab_sub_items
       (idea_id, title, due_date, done, task_status, task_priority, position, milestone_id)
       VALUES (?, ?, ?, 0, 'todo', ?, ?, ?)`
    ).run(newId, t.title, t.due_date, t.task_priority, t.position, t.milestone_id ? (msMap[t.milestone_id] ?? null) : null)
  }

  return { id: newId }
}

// ─── Sub-items ────────────────────────────────────────────────────────────────

function ownIdea(db: Database, ideaId: number, userId: number) {
  return db.prepare(
    'SELECT id, due_date FROM ideas_lab_ideas WHERE id = ? AND user_id = ?'
  ).get(ideaId, userId) as { id: number; due_date: string | null } | undefined
}

export function listSubitems(db: Database, userId: number, ideaId: number) {
  if (!ownIdea(db, ideaId, userId)) return null
  return db.prepare(
    'SELECT * FROM ideas_lab_sub_items WHERE idea_id = ? ORDER BY position, id'
  ).all(ideaId)
}

export function createSubitem(
  db: Database,
  userId: number,
  ideaId: number,
  body: { title: string; due_date?: string; milestone_id?: number }
) {
  const idea = ownIdea(db, ideaId, userId)
  if (!idea) return null

  const { title, due_date, milestone_id } = body
  if (due_date && idea.due_date && due_date > idea.due_date) {
    return { error: `Sub-item due date cannot be after the idea's due date (${idea.due_date})` }
  }

  let assignedMilestone = milestone_id ?? null
  if (!assignedMilestone) {
    const current = db.prepare(
      'SELECT id FROM ideas_lab_project_milestones WHERE idea_id = ? AND done = 0 ORDER BY position, id LIMIT 1'
    ).get(ideaId) as { id: number } | undefined
    if (current) assignedMilestone = current.id
  }

  const maxPos = (db.prepare(
    'SELECT COALESCE(MAX(position), -1) AS m FROM ideas_lab_sub_items WHERE idea_id = ?'
  ).get(ideaId) as { m: number }).m

  const r = db.prepare(
    'INSERT INTO ideas_lab_sub_items (idea_id, title, due_date, position, milestone_id) VALUES (?, ?, ?, ?, ?)'
  ).run(ideaId, title.trim(), due_date ?? null, maxPos + 1, assignedMilestone)

  return db.prepare('SELECT * FROM ideas_lab_sub_items WHERE id = ?').get(r.lastInsertRowid)
}

export function reorderSubitems(
  db: Database, userId: number, ideaId: number, ids: number[]
): boolean {
  if (!ownIdea(db, ideaId, userId)) return false
  const update = db.prepare(
    'UPDATE ideas_lab_sub_items SET position = ? WHERE id = ? AND idea_id = ?'
  )
  db.transaction(() => ids.forEach((id, i) => update.run(i, id, ideaId)))()
  return true
}

export function updateSubitem(
  db: Database,
  userId: number,
  id: number,
  body: { title?: string; done?: boolean; due_date?: unknown; task_priority?: string; task_status?: string }
) {
  const sub = db.prepare(
    'SELECT si.* FROM ideas_lab_sub_items si JOIN ideas_lab_ideas i ON i.id = si.idea_id WHERE si.id = ? AND i.user_id = ?'
  ).get(id, userId) as any
  if (!sub) return null

  const { title, done, due_date, task_priority, task_status } = body

  if (due_date !== undefined) {
    const idea = db.prepare(
      'SELECT due_date FROM ideas_lab_ideas WHERE id = ?'
    ).get(sub.idea_id) as { due_date: string | null }
    if (due_date && idea.due_date && (due_date as string) > idea.due_date) {
      return { error: `Sub-item due date cannot be after the idea's due date (${idea.due_date})` }
    }
  }

  let resolvedDone: number | null
  if (task_status !== undefined)   resolvedDone = task_status === 'done' ? 1 : 0
  else if (done !== undefined)     resolvedDone = done ? 1 : 0
  else                             resolvedDone = null

  db.prepare(`
    UPDATE ideas_lab_sub_items SET
      title         = COALESCE(?, title),
      done          = COALESCE(?, done),
      task_status   = COALESCE(?, task_status),
      task_priority = COALESCE(?, task_priority),
      due_date      = CASE WHEN ? IS NOT NULL THEN ? ELSE due_date END
    WHERE id = ?
  `).run(
    title ? title.trim() : null,
    resolvedDone,
    task_status ?? null,
    task_priority ?? null,
    due_date !== undefined ? 1 : null,
    due_date ?? null,
    id,
  )

  if (resolvedDone === 1 && sub.milestone_id) {
    const remaining = (db.prepare(
      'SELECT COUNT(*) AS c FROM ideas_lab_sub_items WHERE milestone_id = ? AND done = 0'
    ).get(sub.milestone_id) as { c: number }).c
    if (remaining === 0) {
      db.prepare(
        "UPDATE ideas_lab_project_milestones SET done=1, done_at=datetime('now') WHERE id=?"
      ).run(sub.milestone_id)
    }
  }

  return db.prepare('SELECT * FROM ideas_lab_sub_items WHERE id = ?').get(id)
}

export function deleteSubitem(db: Database, userId: number, id: number) {
  const sub = db.prepare(
    'SELECT si.id FROM ideas_lab_sub_items si JOIN ideas_lab_ideas i ON i.id = si.idea_id WHERE si.id = ? AND i.user_id = ?'
  ).get(id, userId)
  if (!sub) return false
  db.prepare('DELETE FROM ideas_lab_sub_items WHERE id = ?').run(id)
  return true
}

// ─── Next Action Log ──────────────────────────────────────────────────────────

export function completeNextAction(db: Database, userId: number, ideaId: number) {
  const idea = db.prepare(
    'SELECT id, next_action FROM ideas_lab_ideas WHERE id = ? AND user_id = ?'
  ).get(ideaId, userId) as { id: number; next_action: string | null } | undefined
  if (!idea) return null
  if (!idea.next_action) return { error: 'No next action set' }

  const currentMs = db.prepare(
    'SELECT id FROM ideas_lab_project_milestones WHERE idea_id = ? AND done = 0 ORDER BY position, id LIMIT 1'
  ).get(ideaId) as { id: number } | undefined

  if (currentMs) {
    const match = db.prepare(
      'SELECT id FROM ideas_lab_sub_items WHERE idea_id = ? AND milestone_id = ? AND title = ? AND done = 0 LIMIT 1'
    ).get(ideaId, currentMs.id, idea.next_action) as { id: number } | undefined
    if (match) {
      db.prepare("UPDATE ideas_lab_sub_items SET done=1, task_status='done' WHERE id=?").run(match.id)
      const remaining = (db.prepare(
        'SELECT COUNT(*) AS c FROM ideas_lab_sub_items WHERE milestone_id = ? AND done = 0'
      ).get(currentMs.id) as { c: number }).c
      if (remaining === 0) {
        db.prepare(
          "UPDATE ideas_lab_project_milestones SET done=1, done_at=datetime('now') WHERE id=?"
        ).run(currentMs.id)
      }
    }
  }

  db.prepare(
    'INSERT INTO ideas_lab_next_action_log (idea_id, user_id, action) VALUES (?, ?, ?)'
  ).run(ideaId, userId, idea.next_action)
  db.prepare(
    "UPDATE ideas_lab_ideas SET next_action = NULL, updated_at = datetime('now') WHERE id = ?"
  ).run(ideaId)

  const nextMs = db.prepare(
    'SELECT id FROM ideas_lab_project_milestones WHERE idea_id = ? AND done = 0 ORDER BY position, id LIMIT 1'
  ).get(ideaId) as { id: number } | undefined
  const suggestion = nextMs
    ? db.prepare(
        'SELECT id, title FROM ideas_lab_sub_items WHERE idea_id = ? AND milestone_id = ? AND done = 0 ORDER BY position, id LIMIT 1'
      ).get(ideaId, nextMs.id)
    : null

  return { ok: true, logged: idea.next_action, suggestion: suggestion ?? null }
}

export function getNextActionLog(db: Database, userId: number, ideaId: number) {
  if (!ownIdea(db, ideaId, userId)) return null
  return db.prepare(
    'SELECT id, action, completed_at FROM ideas_lab_next_action_log WHERE idea_id = ? ORDER BY completed_at DESC LIMIT 50'
  ).all(ideaId)
}

// ─── Milestones ───────────────────────────────────────────────────────────────

export function listMilestones(db: Database, userId: number, ideaId: number) {
  if (!ownIdea(db, ideaId, userId)) return null
  return db.prepare(`
    SELECT pm.*,
      COUNT(si.id) AS task_count,
      COALESCE(SUM(si.done), 0) AS task_done
    FROM ideas_lab_project_milestones pm
    LEFT JOIN ideas_lab_sub_items si ON si.milestone_id = pm.id
    WHERE pm.idea_id = ?
    GROUP BY pm.id
    ORDER BY pm.position, pm.id
  `).all(ideaId)
}

export function createMilestone(
  db: Database, userId: number, ideaId: number, body: { title: string; due_date?: string }
) {
  if (!ownIdea(db, ideaId, userId)) return null
  const { title, due_date } = body
  const maxPos = (db.prepare(
    'SELECT COALESCE(MAX(position), 0) AS m FROM ideas_lab_project_milestones WHERE idea_id = ?'
  ).get(ideaId) as { m: number }).m
  const r = db.prepare(
    'INSERT INTO ideas_lab_project_milestones (idea_id, title, due_date, position) VALUES (?, ?, ?, ?)'
  ).run(ideaId, title.trim(), due_date ?? null, maxPos + 1)
  return db.prepare('SELECT * FROM ideas_lab_project_milestones WHERE id = ?').get(r.lastInsertRowid)
}

export function reorderMilestones(
  db: Database, userId: number, ideaId: number, ids: number[]
): boolean {
  if (!ownIdea(db, ideaId, userId)) return false
  const update = db.prepare(
    'UPDATE ideas_lab_project_milestones SET position = ? WHERE id = ? AND idea_id = ?'
  )
  db.transaction(() => ids.forEach((id, i) => update.run(i, id, ideaId)))()
  return true
}

export function updateMilestone(
  db: Database, userId: number, id: number,
  body: { title?: string; due_date?: unknown; done?: boolean; position?: number }
) {
  const ms = db.prepare(
    `SELECT pm.* FROM ideas_lab_project_milestones pm
     JOIN ideas_lab_ideas i ON i.id = pm.idea_id
     WHERE pm.id = ? AND i.user_id = ?`
  ).get(id, userId)
  if (!ms) return null

  const { title, due_date, done, position } = body
  const resolvedDone = done !== undefined ? (done ? 1 : 0) : null

  db.prepare(`
    UPDATE ideas_lab_project_milestones SET
      title    = COALESCE(?, title),
      due_date = CASE WHEN ? IS NOT NULL THEN ? ELSE due_date END,
      done     = COALESCE(?, done),
      done_at  = CASE
                   WHEN ? = 1 THEN COALESCE(done_at, datetime('now'))
                   WHEN ? = 0 THEN NULL
                   ELSE done_at
                 END,
      position = COALESCE(?, position)
    WHERE id = ?
  `).run(
    title ? title.trim() : null,
    due_date !== undefined ? 1 : null, due_date ?? null,
    resolvedDone,
    resolvedDone, resolvedDone,
    position ?? null,
    id,
  )
  return db.prepare('SELECT * FROM ideas_lab_project_milestones WHERE id = ?').get(id)
}

export function deleteMilestone(db: Database, userId: number, id: number) {
  const ms = db.prepare(
    `SELECT pm.id FROM ideas_lab_project_milestones pm
     JOIN ideas_lab_ideas i ON i.id = pm.idea_id
     WHERE pm.id = ? AND i.user_id = ?`
  ).get(id, userId)
  if (!ms) return false
  db.prepare('DELETE FROM ideas_lab_project_milestones WHERE id = ?').run(id)
  return true
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export function createAttachment(
  db: Database,
  ideaId: number,
  file: Express.Multer.File
) {
  const result = db.prepare(
    'INSERT INTO ideas_lab_attachments (idea_id, filename, original_name, mime_type, size) VALUES (?, ?, ?, ?, ?)'
  ).run(ideaId, file.filename, file.originalname, file.mimetype, file.size)
  return {
    id:            result.lastInsertRowid,
    original_name: file.originalname,
    mime_type:     file.mimetype,
    size:          file.size,
  }
}

export function getAttachment(db: Database, userId: number, id: number) {
  return db.prepare(
    'SELECT a.*, i.user_id FROM ideas_lab_attachments a JOIN ideas_lab_ideas i ON i.id = a.idea_id WHERE a.id = ?'
  ).get(id) as any
}

export function deleteAttachment(db: Database, userId: number, id: number, uploadDir: string) {
  const att = db.prepare(
    'SELECT a.*, i.user_id FROM ideas_lab_attachments a JOIN ideas_lab_ideas i ON i.id = a.idea_id WHERE a.id = ?'
  ).get(id) as any
  if (!att || att.user_id !== userId) return false
  const filePath = path.join(uploadDir, String(userId), att.filename)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  db.prepare('DELETE FROM ideas_lab_attachments WHERE id = ?').run(id)
  return true
}
