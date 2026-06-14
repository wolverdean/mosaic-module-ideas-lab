import type { Database }          from 'better-sqlite3'
import type { ReportItem, ReportSummary, NotificationItem, CalendarItem } from '@mosaic/sdk'

function pad(n: number) { return String(n).padStart(2, '0') }
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function getOverdueIdeas(db: Database, userId: number): ReportItem[] {
  const today = todayStr()
  const ideas = db.prepare(`
    SELECT i.id, i.title, i.due_date, i.status, i.priority
    FROM ideas_lab_ideas i
    WHERE i.user_id = ? AND i.due_date < ? AND i.status NOT IN ('done','archived','cancelled')
    ORDER BY i.due_date ASC
  `).all(userId, today) as any[]

  const subItems = db.prepare(`
    SELECT s.id, s.title, s.due_date, i.id AS idea_id
    FROM ideas_lab_sub_items s
    JOIN ideas_lab_ideas i ON i.id = s.idea_id
    WHERE i.user_id = ? AND s.due_date IS NOT NULL AND s.due_date < ? AND s.done = 0
    ORDER BY s.due_date ASC
  `).all(userId, today) as any[]

  return [
    ...ideas.map(r => ({
      id:       r.id,
      title:    r.title,
      dueDate:  r.due_date,
      status:   r.status,
      priority: r.priority,
      url:      `/ideas/${r.id}`,
    })),
    ...subItems.map(r => ({
      id:      `task:${r.id}`,
      title:   r.title,
      dueDate: r.due_date,
      url:     `/ideas/${r.idea_id}`,
    })),
  ]
}

export function getWeeklyIdeas(
  db: Database, userId: number, start: string, end: string
): ReportItem[] {
  const ideas = db.prepare(`
    SELECT i.id, i.title, i.due_date, i.status, i.priority, i.updated_at
    FROM ideas_lab_ideas i
    WHERE i.user_id = ?
      AND (
        (i.due_date >= ? AND i.due_date <= ?)
        OR i.updated_at >= datetime(?)
      )
    ORDER BY i.due_date ASC, i.updated_at DESC
  `).all(userId, start, end, start) as any[]

  const subItems = db.prepare(`
    SELECT s.id, s.title, s.due_date, i.id AS idea_id
    FROM ideas_lab_sub_items s
    JOIN ideas_lab_ideas i ON i.id = s.idea_id
    WHERE i.user_id = ? AND s.due_date >= ? AND s.due_date <= ? AND s.done = 0
    ORDER BY s.due_date ASC
  `).all(userId, start, end) as any[]

  const actions = db.prepare(`
    SELECT nal.id, nal.action, nal.completed_at, nal.idea_id
    FROM ideas_lab_next_action_log nal
    WHERE nal.user_id = ? AND nal.completed_at >= ? AND nal.completed_at <= ?
    ORDER BY nal.completed_at DESC
  `).all(userId, start, `${end} 23:59:59`) as any[]

  return [
    ...ideas.map(r => ({
      id:       r.id,
      title:    r.title,
      dueDate:  r.due_date,
      status:   r.status,
      priority: r.priority,
      url:      `/ideas/${r.id}`,
    })),
    ...subItems.map(r => ({
      id:      `task:${r.id}`,
      title:   r.title,
      dueDate: r.due_date,
      url:     `/ideas/${r.idea_id}`,
    })),
    ...actions.map(r => ({
      id:    `action:${r.id}`,
      title: r.action,
      url:   `/ideas/${r.idea_id}`,
    })),
  ]
}

export function getMonthlyIdeas(
  db: Database, userId: number, year: number, month: number
): ReportItem[] {
  const start = `${year}-${pad(month)}-01`
  const endDate = new Date(year, month, 0)
  const end   = `${year}-${pad(month)}-${pad(endDate.getDate())}`

  const rows = db.prepare(`
    SELECT i.id, i.title, i.due_date, i.status, i.priority
    FROM ideas_lab_ideas i
    WHERE i.user_id = ? AND i.due_date >= ? AND i.due_date <= ?
    ORDER BY i.due_date ASC
  `).all(userId, start, end) as any[]

  return rows.map(r => ({
    id:       r.id,
    title:    r.title,
    dueDate:  r.due_date,
    status:   r.status,
    priority: r.priority,
    url:      `/ideas/${r.id}`,
  }))
}

export function getIdeaSummary(db: Database, userId: number): ReportSummary {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS n
    FROM ideas_lab_ideas
    WHERE user_id = ?
    GROUP BY status
  `).all(userId) as { status: string; n: number }[]

  const summary: ReportSummary = {}
  for (const r of rows) {
    summary[r.status.replace('_', ' ')] = r.n
  }

  const overdue = (db.prepare(`
    SELECT COUNT(*) AS n FROM ideas_lab_ideas
    WHERE user_id = ? AND due_date < date('now') AND status NOT IN ('done','archived','cancelled')
  `).get(userId) as { n: number }).n
  if (overdue > 0) summary['Overdue'] = overdue

  return summary
}

export function getDueSoonIdeas(
  db: Database, userId: number, date: string
): NotificationItem[] {
  const d = new Date(date); d.setDate(d.getDate() + 2)
  const limit = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  const rows = db.prepare(`
    SELECT id, title, due_date, priority
    FROM ideas_lab_ideas
    WHERE user_id = ? AND due_date >= ? AND due_date <= ?
      AND status NOT IN ('done','archived','cancelled')
    ORDER BY due_date ASC
  `).all(userId, date, limit) as any[]

  return rows.map(r => ({
    id:       r.id,
    title:    r.title,
    body:     `Due ${r.due_date}`,
    dueDate:  r.due_date,
    priority: r.priority,
    url:      `/ideas/${r.id}`,
  }))
}

export function getCalendarItems(
  db: Database, userId: number, year: number, month: number
): CalendarItem[] {
  const start = `${year}-${pad(month)}-01`
  const end   = `${year}-${pad(month)}-31`

  const ideas = db.prepare(`
    SELECT id, title, due_date, priority
    FROM ideas_lab_ideas
    WHERE user_id = ?
      AND due_date >= ? AND due_date <= ?
      AND status NOT IN ('done','archived')
    ORDER BY due_date
  `).all(userId, start, end) as any[]

  const tasks = db.prepare(`
    SELECT s.id, s.title, s.due_date, s.idea_id, i.title AS idea_title
    FROM ideas_lab_sub_items s
    JOIN ideas_lab_ideas i ON i.id = s.idea_id
    WHERE i.user_id = ?
      AND s.done = 0
      AND s.due_date >= ? AND s.due_date <= ?
    ORDER BY s.due_date
  `).all(userId, start, end) as any[]

  return [
    ...ideas.map(r => ({
      id:   `idea:${r.id}`,
      title: r.title,
      date:  r.due_date,
      type:  'idea' as const,
      url:   `/ideas/${r.id}`,
      meta:  { priority: r.priority },
    })),
    ...tasks.map(r => ({
      id:   `task:${r.id}`,
      title: r.title,
      date:  r.due_date,
      type:  'task' as const,
      url:   `/ideas/${r.idea_id}`,
      meta:  { idea_title: r.idea_title },
    })),
  ]
}

export function getOverdueNotifications(
  db: Database, userId: number, date: string
): NotificationItem[] {
  const rows = db.prepare(`
    SELECT id, title, due_date, priority
    FROM ideas_lab_ideas
    WHERE user_id = ? AND due_date < ? AND status NOT IN ('done','archived','cancelled')
    ORDER BY due_date ASC
    LIMIT 10
  `).all(userId, date) as any[]

  return rows.map(r => ({
    id:       r.id,
    title:    r.title,
    body:     `Overdue since ${r.due_date}`,
    dueDate:  r.due_date,
    priority: r.priority,
    url:      `/ideas/${r.id}`,
  }))
}
