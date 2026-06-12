import express                from 'express'
import type { ModuleContext } from '@mosaic/sdk'
import { createIdeasRouter }  from './ideas.js'
import { createAiRouter }     from './ai.js'

export function createRouter(ctxRef: { current: ModuleContext | null }): express.Router {
  const router = express.Router()

  router.use('/', createIdeasRouter(ctxRef))
  router.use('/ai', createAiRouter(ctxRef))

  return router
}
