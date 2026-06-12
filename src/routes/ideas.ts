import express                   from 'express'
import path                       from 'node:path'
import fs                         from 'node:fs'
import { trace, metrics, SpanStatusCode } from '@opentelemetry/api'
import type { ModuleContext }      from '@mosaic/sdk'
import { buildUploadMiddleware }   from '../lib/upload.js'
import * as ideas                  from '../services/ideas.service.js'

const tracer  = trace.getTracer('ideas-lab')
const meter   = metrics.getMeter('ideas-lab')
const reqTotal = meter.createCounter('ideas_lab.ideas.requests_total')
const duration = meter.createHistogram('ideas_lab.ideas.duration_ms')

function track(op: string, fn: () => void | Promise<void>) {
  const span  = tracer.startSpan(`ideas_lab.ideas.${op}`)
  const start = Date.now()
  reqTotal.add(1, { op })
  try {
    const result = fn()
    if (result instanceof Promise) {
      return result
        .then(() => { span.setStatus({ code: SpanStatusCode.OK }); span.end(); duration.record(Date.now() - start, { op }) })
        .catch(err => { span.setStatus({ code: SpanStatusCode.ERROR }); span.recordException(err); span.end(); duration.record(Date.now() - start, { op }); throw err })
    }
    span.setStatus({ code: SpanStatusCode.OK })
    span.end()
    duration.record(Date.now() - start, { op })
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR })
    span.recordException(err as Error)
    span.end()
    duration.record(Date.now() - start, { op })
    throw err
  }
}

export function createIdeasRouter(ctxRef: { current: ModuleContext | null }): express.Router {
  const router = express.Router()

  function ctx() { return ctxRef.current! }
  function db() { return ctx().db.raw }
  function uploadDir() { return process.env.UPLOAD_DIR ?? './uploads' }
  function upload() { return buildUploadMiddleware(uploadDir()) }

  // ── Categories ──────────────────────────────────────────────────────────────

  router.get('/categories', (req, res) => {
    track('list_categories', () => res.json(ideas.listCategories(db(), (req as any).userId)))
  })

  router.post('/categories', (req, res) => {
    const { name, color = '#6366f1' } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
    try {
      const cat = ideas.createCategory(db(), (req as any).userId, name, color)
      res.status(201).json(cat)
    } catch (e: any) {
      if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Category already exists' })
      ctx().logger.error('create category error', e)
      res.status(500).json({ error: 'Internal error' })
    }
  })

  router.delete('/categories/:id', (req, res) => {
    const ok = ideas.deleteCategory(db(), (req as any).userId, Number(req.params.id))
    if (!ok) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  })

  // ── Tags ────────────────────────────────────────────────────────────────────

  router.get('/tags', (req, res) => {
    res.json(ideas.listTags(db(), (req as any).userId))
  })

  // ── Ideas ───────────────────────────────────────────────────────────────────

  router.get('/ideas', (req, res) => {
    track('list', () => {
      const list = ideas.listIdeas(db(), (req as any).userId, req.query as any)
      res.json(list)
    })
  })

  router.post('/ideas', (req, res) => {
    const { title } = req.body
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' })
    track('create', () => {
      const idea = ideas.createIdea(db(), (req as any).userId, req.body)
      res.status(201).json(idea)
    })
  })

  router.get('/ideas/:id', (req, res) => {
    const idea = ideas.getIdea(db(), (req as any).userId, Number(req.params.id))
    if (!idea) return res.status(404).json({ error: 'Not found' })
    res.json(idea)
  })

  router.put('/ideas/:id', (req, res) => {
    const { title } = req.body
    if (title !== undefined && !title.trim()) return res.status(400).json({ error: 'Title cannot be empty' })
    track('update', () => {
      const updated = ideas.updateIdea(db(), (req as any).userId, Number(req.params.id), req.body)
      if (!updated) return res.status(404).json({ error: 'Not found' })
      res.json(updated)
    })
  })

  router.delete('/ideas/:id', (req, res) => {
    const ok = ideas.deleteIdea(db(), (req as any).userId, Number(req.params.id), uploadDir())
    if (!ok) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  })

  router.post('/ideas/:id/duplicate', (req, res) => {
    const result = ideas.duplicateIdea(db(), (req as any).userId, Number(req.params.id), req.body.title)
    if (!result) return res.status(404).json({ error: 'Not found' })
    res.status(201).json(result)
  })

  // ── Sub-items ───────────────────────────────────────────────────────────────

  router.get('/ideas/:id/subitems', (req, res) => {
    const list = ideas.listSubitems(db(), (req as any).userId, Number(req.params.id))
    if (list === null) return res.status(404).json({ error: 'Not found' })
    res.json(list)
  })

  router.post('/ideas/:id/subitems', (req, res) => {
    const { title } = req.body
    if (!title?.trim()) return res.status(400).json({ error: 'Title required' })
    const result = ideas.createSubitem(db(), (req as any).userId, Number(req.params.id), req.body)
    if (result === null) return res.status(404).json({ error: 'Not found' })
    if ('error' in (result as any)) return res.status(400).json(result)
    res.status(201).json(result)
  })

  router.patch('/subitems/reorder', (req, res) => {
    const { idea_id, ids } = req.body
    const ok = ideas.reorderSubitems(db(), (req as any).userId, idea_id, ids)
    if (!ok) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  })

  router.put('/subitems/:id', (req, res) => {
    const result = ideas.updateSubitem(db(), (req as any).userId, Number(req.params.id), req.body)
    if (result === null) return res.status(404).json({ error: 'Not found' })
    if ('error' in (result as any)) return res.status(400).json(result)
    res.json(result)
  })

  router.delete('/subitems/:id', (req, res) => {
    const ok = ideas.deleteSubitem(db(), (req as any).userId, Number(req.params.id))
    if (!ok) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  })

  // ── Next Action ─────────────────────────────────────────────────────────────

  router.post('/ideas/:id/next-action/complete', (req, res) => {
    const result = ideas.completeNextAction(db(), (req as any).userId, Number(req.params.id))
    if (result === null) return res.status(404).json({ error: 'Not found' })
    if ('error' in (result as any)) return res.status(400).json(result)
    res.json(result)
  })

  router.get('/ideas/:id/next-action/log', (req, res) => {
    const log = ideas.getNextActionLog(db(), (req as any).userId, Number(req.params.id))
    if (log === null) return res.status(404).json({ error: 'Not found' })
    res.json(log)
  })

  // ── Milestones ──────────────────────────────────────────────────────────────

  router.get('/ideas/:id/milestones', (req, res) => {
    const list = ideas.listMilestones(db(), (req as any).userId, Number(req.params.id))
    if (list === null) return res.status(404).json({ error: 'Not found' })
    res.json(list)
  })

  router.post('/ideas/:id/milestones', (req, res) => {
    if (!req.body.title?.trim()) return res.status(400).json({ error: 'Title required' })
    const ms = ideas.createMilestone(db(), (req as any).userId, Number(req.params.id), req.body)
    if (!ms) return res.status(404).json({ error: 'Not found' })
    res.status(201).json(ms)
  })

  router.patch('/milestones/reorder', (req, res) => {
    const { idea_id, ids } = req.body
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' })
    const ok = ideas.reorderMilestones(db(), (req as any).userId, idea_id, ids)
    if (!ok) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  })

  router.put('/milestones/:id', (req, res) => {
    const ms = ideas.updateMilestone(db(), (req as any).userId, Number(req.params.id), req.body)
    if (!ms) return res.status(404).json({ error: 'Not found' })
    res.json(ms)
  })

  router.delete('/milestones/:id', (req, res) => {
    const ok = ideas.deleteMilestone(db(), (req as any).userId, Number(req.params.id))
    if (!ok) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  })

  // ── Attachments ─────────────────────────────────────────────────────────────

  router.post('/ideas/:id/attachments', (req, res) => {
    const ideaExists = (db().prepare as any)(
      'SELECT id FROM ideas_lab_ideas WHERE id = ? AND user_id = ?'
    ).get(Number(req.params.id), (req as any).userId)
    if (!ideaExists) return res.status(404).json({ error: 'Not found' })

    upload().single('file')(req, res, (err: any) => {
      if (err) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 25 MB)' : err.message
        return res.status(400).json({ error: msg })
      }
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
      const att = ideas.createAttachment(db(), Number(req.params.id), req.file)
      res.status(201).json(att)
    })
  })

  router.get('/attachments/:id', (req, res) => {
    const att = ideas.getAttachment(db(), (req as any).userId, Number(req.params.id))
    if (!att || att.user_id !== (req as any).userId) return res.status(404).json({ error: 'Not found' })

    const filePath = path.join(uploadDir(), String((req as any).userId), att.filename)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' })

    res.setHeader('Content-Type', att.mime_type)
    res.setHeader('Content-Disposition', `inline; filename="${att.original_name.replace(/"/g, '')}"`)
    res.sendFile(path.resolve(filePath))
  })

  router.delete('/attachments/:id', (req, res) => {
    const ok = ideas.deleteAttachment(db(), (req as any).userId, Number(req.params.id), uploadDir())
    if (!ok) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  })

  return router
}
