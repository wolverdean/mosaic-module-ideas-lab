import express                         from 'express'
import { trace, metrics, SpanStatusCode } from '@opentelemetry/api'
import type { ModuleContext }             from '@mosaic/sdk'
import * as aiSvc                         from '../services/ai.service.js'

const tracer   = trace.getTracer('ideas-lab')
const meter    = metrics.getMeter('ideas-lab')
const aiTotal  = meter.createCounter('ideas_lab.ai.requests_total')
const aiDuration = meter.createHistogram('ideas_lab.ai.duration_ms')

function withSpan<T>(op: string, fn: () => Promise<T>): Promise<T> {
  const span  = tracer.startSpan(`ideas_lab.ai.${op}`)
  const start = Date.now()
  aiTotal.add(1, { op })
  return fn()
    .then(r  => { span.setStatus({ code: SpanStatusCode.OK });    span.end(); aiDuration.record(Date.now() - start, { op }); return r })
    .catch(e => { span.setStatus({ code: SpanStatusCode.ERROR }); span.recordException(e); span.end(); aiDuration.record(Date.now() - start, { op }); throw e })
}

export function createAiRouter(ctxRef: { current: ModuleContext | null }): express.Router {
  const router = express.Router()

  function ctx() { return ctxRef.current! }
  function db()  { return ctx().db.raw }

  // POST /enrich/:id
  router.post('/enrich/:id', async (req, res) => {
    try {
      const result = await withSpan('enrich', () =>
        aiSvc.enrichIdea(db(), ctx().ai.client, ctx().ai.models, (req as any).userId, Number(req.params.id))
      )
      if (!result) return res.status(404).json({ error: 'Not found' })
      res.json(result)
    } catch (e: any) {
      ctx().logger.error('AI enrich error', e)
      res.status(500).json({ error: e.message })
    }
  })

  // POST /related/:id
  router.post('/related/:id', async (req, res) => {
    try {
      const result = await withSpan('related', () =>
        aiSvc.relatedIdeas(db(), ctx().ai.client, ctx().ai.models, (req as any).userId, Number(req.params.id))
      )
      if (!result) return res.status(404).json({ error: 'Not found' })
      res.json(result)
    } catch (e: any) {
      ctx().logger.error('AI related error', e)
      res.status(500).json({ error: e.message })
    }
  })

  // POST /generate
  router.post('/generate', async (req, res) => {
    const { prompt } = req.body
    if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt required' })
    try {
      const result = await withSpan('generate', () =>
        aiSvc.generateIdea(ctx().ai.client, ctx().ai.models, prompt)
      )
      res.json(result)
    } catch (e: any) {
      ctx().logger.error('AI generate error', e)
      res.status(500).json({ error: e.message })
    }
  })

  // GET /chat/today — before POST /chat to avoid route conflict
  router.get('/chat/today', (req, res) => {
    const messages = aiSvc.getTodayChat(db(), (req as any).userId)
    res.json({ messages })
  })

  // POST /chat — SSE streaming
  router.post('/chat', async (req, res) => {
    const { message, history = [] } = req.body
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' })

    const { ideas, ideaContext } = aiSvc.buildChatContext(db(), (req as any).userId)

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    try {
      const msgs = (history as any[]).slice(-20).map((h: any) => ({ role: h.role, content: h.content }))
      msgs.push({ role: 'user', content: message.trim() })

      const stream = ctx().ai.client.messages.stream({
        model:      ctx().ai.models.quality,
        max_tokens: 2048,
        system: [{
          type:          'text',
          text:          `You are a helpful AI assistant for Ideas-Lab, an idea management app. The user has ${ideas.length} ideas.\n\nHere are their ideas:\n${ideaContext}\n\nHelp the user explore, analyze, connect, or act on their ideas. Be concise and practical. Reference specific ideas by title when relevant.`,
          cache_control: { type: 'ephemeral' },
        }] as any,
        messages: msgs,
      })

      let fullResponse = ''
      for await (const event of stream as any) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          fullResponse += event.delta.text
          res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
        }
      }

      res.write('data: [DONE]\n\n')
      res.end()

      aiSvc.saveChatMessages(db(), (req as any).userId, message.trim(), fullResponse)
    } catch (e: any) {
      ctx().logger.error('AI chat error', e)
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`)
      res.end()
    }
  })

  // GET /status-summary
  router.get('/status-summary', (req, res) => {
    const stored = aiSvc.getStatusSummary(db(), (req as any).userId)
    res.json(stored ?? { summaries: null, generated_at: null })
  })

  // POST /status-summary/generate
  router.post('/status-summary/generate', async (req, res) => {
    try {
      const summaries = await withSpan('status_summary', () =>
        aiSvc.generateStatusSummary(db(), ctx().ai.client, ctx().ai.models, (req as any).userId)
      )
      if (summaries.length) aiSvc.saveStatusSummary(db(), (req as any).userId, summaries)
      res.json({ summaries, generated_at: new Date().toISOString() })
    } catch (e: any) {
      ctx().logger.error('Status summary error', e)
      res.status(500).json({ error: e.message })
    }
  })

  // POST /status-summary/send
  router.post('/status-summary/send', async (req, res) => {
    const stored = aiSvc.getStatusSummary(db(), (req as any).userId)
    if (!stored?.summaries?.length) return res.json({ sent: false, reason: 'no report generated yet' })

    const text = aiSvc.formatForTelegram(stored.summaries)
    try {
      await ctx().notify.telegram((req as any).userId, text)
      res.json({ sent: true })
    } catch (e: any) {
      ctx().logger.error('Status summary send error', e)
      res.status(500).json({ error: e.message })
    }
  })

  return router
}
