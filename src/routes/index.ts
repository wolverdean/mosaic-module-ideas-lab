import express                from 'express'
import path                   from 'node:path'
import { fileURLToPath }       from 'node:url'
import type { ModuleContext }  from '@mosaic/sdk'
import { createIdeasRouter }   from './ideas.js'
import { createAiRouter }      from './ai.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createRouter(ctxRef: { current: ModuleContext | null }): express.Router {
  const router = express.Router()

  // Serve the module's frontend entry point
  router.get('/ui.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript')
    res.sendFile(path.resolve(__dirname, '../../public/ui.js'))
  })

  router.use('/', createIdeasRouter(ctxRef))
  router.use('/ai', createAiRouter(ctxRef))

  return router
}
