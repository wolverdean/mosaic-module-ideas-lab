import type { Database }          from 'better-sqlite3'
import type { ReportItem, ReportSummary, NotificationItem } from '@mosaic/sdk'

function pad(n: number) { return String(n).padStart(2, '0') }
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function getOverdueIdeas(db: Database, userId: number): ReportItem[] {
  const today = todayStr()
  const rows = db.prepare(`
    SELECT i.id, i.title, i.due_date, i.status, i.priority
    FROM ideas_lab_ideas i
    WHERE i.user_id = ? AND i.due_date < ? AND i.status NOT IN ('done','archived','cancelled')
    ORDER BY i.due_date ASC
  `).all(userId, today) as any[]

  return rows.map(r => ({
    id:       r.id,
    title:    r.title,
    dueDate:  r.due_date,
    status:   r.status,
    priority: r.priority,
    url:      `/ideas/${r.id}`,
  }))
}

export function getWeeklyIdeas(
  db: Database, userId: number, start: string, end: string
): ReportItem[] {
  const rows = db.prepare(`
    SELECT i.id, i.title, i.due_date, i.status, i.priority, i.updated_at
    FROM ideas_lab_ideas i
    WHERE i.user_id = ?
      AND (
        (i.due_date >= ? AND i.due_date <= ?)
        OR i.updated_at >= datetime(?)
      )
    ORDER BY i.due_date ASC, i.updated_at DESC
  `).all(userId, start, end, start) as any[]

  return rows.map(r => ({
    id:       r.id,
    title:    r.title,
    dueDate:  r.due_date,
    status:   r.status,
    priority: r.priority,
    url:      `/ideas/${r.id}`,
  }))
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
