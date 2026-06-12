import path         from 'node:path'
import fs           from 'node:fs'
import { randomUUID } from 'node:crypto'
import multer        from 'multer'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
  'image/svg+xml', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav',
  'audio/mp4', 'application/pdf', 'text/plain',
])
const MAX_FILE_SIZE = 25 * 1024 * 1024

export function buildUploadMiddleware(uploadDir: string): multer.Multer {
  const storage = multer.diskStorage({
    destination(req, _file, cb) {
      const userDir = path.join(uploadDir, String((req as any).userId))
      fs.mkdirSync(userDir, { recursive: true })
      cb(null, userDir)
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '')
      cb(null, `${randomUUID()}${ext}`)
    },
  })

  return multer({
    storage,
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(null, true)
      } else {
        cb(new Error(`File type not allowed: ${file.mimetype}`))
      }
    },
    limits: { fileSize: MAX_FILE_SIZE },
  })
}
