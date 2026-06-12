import { defineModule }       from '@mosaic/sdk'
import type { ModuleContext }  from '@mosaic/sdk'
import { migrate }             from './src/migrate.js'
import { createRouter }        from './src/routes/index.js'
import { reportHooks }         from './src/hooks/reports.js'
import { notificationHooks }   from './src/hooks/notifications.js'
import { metrics, trace, SpanStatusCode } from '@opentelemetry/api'
import { generateStatusSummary, saveStatusSummary } from './src/services/ai.service.js'

const meter    = metrics.getMeter('ideas-lab')
const jobRuns  = meter.createCounter('ideas_lab.jobs.runs_total')
const jobDur   = meter.createHistogram('ideas_lab.jobs.duration_ms')
const _tracer  = trace.getTracer('ideas-lab')

// ctxRef is set by onInit; the router is created before onInit is called.
const ctxRef: { current: ModuleContext | null } = { current: null }
const router = createRouter(ctxRef)

export default defineModule({
  name:    'Ideas Lab',
  slug:    'ideas-lab',
  version: '1.0.0',
  sdk:     '>=1.0.0',

  migrate,
  router,

  nav: {
    label: 'Ideas',
    icon:  'lightbulb',
    order: 10,
    badge(ctx: ModuleContext, userId: number) {
      const row = ctx.db.raw.prepare(
        "SELECT COUNT(*) AS n FROM ideas_lab_ideas WHERE user_id = ? AND status IN ('new','in_progress') AND para_type != 'archive'"
      ).get(userId) as { n: number }
      return row.n
    },
  },

  frontend: {
    entry: '/api/ideas-lab/ui.js',
  },

  jobs: [
    {
      name:     'ideas-lab:auto-archive',
      schedule: '0 2 * * *',
      async fn(ctx: ModuleContext) {
        const span  = trace.getTracer('ideas-lab').startSpan('ideas_lab.jobs.auto_archive')
        const start = Date.now()
        jobRuns.add(1, { job: 'auto-archive' })
        try {
          const result = ctx.db.raw.prepare(`
            UPDATE ideas_lab_ideas
            SET status = 'archived', updated_at = datetime('now')
            WHERE status = 'done'
              AND done_at <= datetime('now', '-1 year')
              AND para_type != 'archive'
          `).run()
          ctx.logger.info('auto-archive complete', { archived: result.changes })
          span.setStatus({ code: SpanStatusCode.OK })
        } catch (e) {
          span.setStatus({ code: SpanStatusCode.ERROR })
          span.recordException(e as Error)
          ctx.logger.error('auto-archive failed', e as Error)
        } finally {
          span.end()
          jobDur.record(Date.now() - start, { job: 'auto-archive' })
        }
      },
    },
    {
      name:     'ideas-lab:clear-chat',
      schedule: '0 3 * * *',
      fn(ctx: ModuleContext) {
        const span  = trace.getTracer('ideas-lab').startSpan('ideas_lab.jobs.clear_chat')
        const start = Date.now()
        jobRuns.add(1, { job: 'clear-chat' })
        try {
          const result = ctx.db.raw.prepare(
            "DELETE FROM ideas_lab_chat_messages WHERE date(created_at) < date('now')"
          ).run()
          ctx.logger.info('clear-chat complete', { deleted: result.changes })
          span.setStatus({ code: SpanStatusCode.OK })
        } catch (e) {
          span.setStatus({ code: SpanStatusCode.ERROR })
          span.recordException(e as Error)
          ctx.logger.error('clear-chat failed', e as Error)
        } finally {
          span.end()
          jobDur.record(Date.now() - start, { job: 'clear-chat' })
        }
      },
    },
    {
      name:     'ideas-lab:weekly-status',
      schedule: '0 8 * * 1',
      async fn(ctx: ModuleContext) {
        const span  = trace.getTracer('ideas-lab').startSpan('ideas_lab.jobs.weekly_status')
        const start = Date.now()
        jobRuns.add(1, { job: 'weekly-status' })
        try {
          const users = ctx.db.raw.prepare('SELECT DISTINCT user_id FROM ideas_lab_ideas').all() as { user_id: number }[]
          for (const { user_id } of users) {
            const summaries = await generateStatusSummary(ctx.db.raw, ctx.ai.client, ctx.ai.models, user_id)
            if (summaries.length) {
              saveStatusSummary(ctx.db.raw, user_id, summaries)
              await ctx.notify.all(user_id, {
                title: '📋 Weekly Status',
                body:  summaries.map((s: any) => s.category).join(', '),
              })
            }
          }
          span.setStatus({ code: SpanStatusCode.OK })
        } catch (e) {
          span.setStatus({ code: SpanStatusCode.ERROR })
          span.recordException(e as Error)
          ctx.logger.error('weekly-status job failed', e as Error)
        } finally {
          span.end()
          jobDur.record(Date.now() - start, { job: 'weekly-status' })
        }
      },
    },
  ],

  reports:       reportHooks,
  notifications: notificationHooks,

  onInit(ctx: ModuleContext) {
    ctxRef.current = ctx
    ctx.logger.info('ideas-lab module initialized')
  },

  onShutdown() {
    ctxRef.current = null
  },

  health(ctx: ModuleContext) {
    try {
      ctx.db.raw.prepare('SELECT 1 FROM ideas_lab_ideas LIMIT 1').get()
      return { status: 'ok' }
    } catch (e) {
      return { status: 'down', message: (e as Error).message, checks: { sqlite: 'fail' } }
    }
  },
  healthInterval: 60,
})
