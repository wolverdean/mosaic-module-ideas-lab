import type { ReportHooks, ModuleContext } from '@mosaic/sdk'
import {
  getOverdueIdeas,
  getWeeklyIdeas,
  getMonthlyIdeas,
  getIdeaSummary,
} from '../services/report.service.js'

export const reportHooks: ReportHooks = {
  overdue(ctx: ModuleContext, userId: number) {
    return getOverdueIdeas(ctx.db.raw, userId)
  },
  weekly(ctx: ModuleContext, userId: number, start: string, end: string) {
    return getWeeklyIdeas(ctx.db.raw, userId, start, end)
  },
  monthly(ctx: ModuleContext, userId: number, year: number, month: number) {
    return getMonthlyIdeas(ctx.db.raw, userId, year, month)
  },
  summary(ctx: ModuleContext, userId: number) {
    return getIdeaSummary(ctx.db.raw, userId)
  },
  detailed(ctx: ModuleContext, userId: number, start: string, end: string) {
    const db = ctx.db.raw

    const byStatus = db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM ideas_lab_ideas
      WHERE user_id = ? AND status NOT IN ('archived','cancelled')
      GROUP BY status
    `).all(userId) as { status: string; count: number }[]

    const statusKv: Record<string, number> = {}
    for (const r of byStatus) statusKv[r.status] = r.count

    const active   = byStatus.filter(r => ['new','in_progress','pending','on_hold'].includes(r.status)).reduce((s, r) => s + r.count, 0)
    const done     = statusKv['done'] ?? 0
    const overdue  = getOverdueIdeas(db, userId).length
    const updated  = getWeeklyIdeas(db, userId, start, end)

    return {
      label: 'Ideas Lab',
      sections: [
        {
          type:  'kv',
          title: 'Summary',
          rows:  { Active: active, Done: done, Overdue: overdue },
        },
        {
          type:  'table',
          title: 'By Status',
          cols:  ['Status', 'Count'],
          rows:  byStatus.map(r => [r.status, r.count]),
        },
        {
          type:  'list',
          title: 'Active in Period',
          items: updated,
        },
      ],
    }
  },
}
