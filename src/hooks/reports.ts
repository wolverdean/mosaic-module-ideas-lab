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
}
