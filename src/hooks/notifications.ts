import type { NotificationHooks, ModuleContext } from '@mosaic/sdk'
import {
  getDueSoonIdeas,
  getOverdueNotifications,
} from '../services/report.service.js'

export const notificationHooks: NotificationHooks = {
  dueSoon(ctx: ModuleContext, userId: number, date: string) {
    return getDueSoonIdeas(ctx.db.raw, userId, date)
  },
  overdue(ctx: ModuleContext, userId: number, date: string) {
    return getOverdueNotifications(ctx.db.raw, userId, date)
  },
}
