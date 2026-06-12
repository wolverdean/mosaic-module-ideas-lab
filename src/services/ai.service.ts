import type { Database } from 'better-sqlite3'
import type Anthropic    from '@anthropic-ai/sdk'

// ─── Enrich ───────────────────────────────────────────────────────────────────

export async function enrichIdea(
  db: Database,
  ai: Anthropic,
  models: { quality: string },
  userId: number,
  ideaId: number
) {
  const idea = db.prepare(
    'SELECT * FROM ideas_lab_ideas WHERE id = ? AND user_id = ?'
  ).get(ideaId, userId) as any
  if (!idea) return null

  const categories = db.prepare(
    'SELECT name FROM ideas_lab_categories WHERE user_id = ?'
  ).all(userId) as { name: string }[]
  const catNames = categories.map(c => c.name)

  const content = [`Title: ${idea.title}`, idea.notes ? `Notes: ${idea.notes}` : null]
    .filter(Boolean).join('\n')

  const response = await ai.messages.create({
    model:      models.quality,
    max_tokens: 1024,
    thinking:   { type: 'adaptive' } as any,
    messages:   [{
      role:    'user',
      content: `Analyze this idea and respond ONLY with valid JSON (no markdown):
{
  "summary": "1-2 sentence summary",
  "tags": ["tag1", "tag2", "tag3"],
  "category": "suggested category name",
  "priority": "high|medium|low"
}

${catNames.length ? `Existing categories (prefer one): ${catNames.join(', ')}` : ''}

Idea:
${content}`,
    }],
  })

  const textBlock = response.content.find((b: any) => b.type === 'text') as any
  if (!textBlock) throw new Error('No text in AI response')

  let enriched: any
  try { enriched = JSON.parse(textBlock.text) }
  catch {
    const m = textBlock.text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('Could not parse AI response')
    enriched = JSON.parse(m[0])
  }

  db.prepare(
    "UPDATE ideas_lab_ideas SET ai_summary = ?, ai_enriched = 1, ai_tags = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(enriched.summary ?? null, JSON.stringify(enriched.tags ?? []), ideaId)

  return enriched
}

// ─── Related ──────────────────────────────────────────────────────────────────

export async function relatedIdeas(
  db: Database,
  ai: Anthropic,
  models: { quality: string },
  userId: number,
  ideaId: number
) {
  const idea = db.prepare(
    'SELECT * FROM ideas_lab_ideas WHERE id = ? AND user_id = ?'
  ).get(ideaId, userId) as any
  if (!idea) return null

  const allIdeas = db.prepare(
    'SELECT id, title, notes FROM ideas_lab_ideas WHERE user_id = ? AND id != ? ORDER BY updated_at DESC LIMIT 60'
  ).all(userId, ideaId) as { id: number; title: string; notes: string }[]

  if (!allIdeas.length) return { related: [] }

  const ideaList = allIdeas
    .map(i => `[${i.id}] ${i.title}${i.notes ? ': ' + i.notes.slice(0, 80) : ''}`)
    .join('\n')

  const response = await ai.messages.create({
    model:      models.quality,
    max_tokens: 256,
    thinking:   { type: 'adaptive' } as any,
    messages:   [{
      role:    'user',
      content: `Given this idea:
"${idea.title}${idea.notes ? '\n' + idea.notes.slice(0, 200) : ''}"

Return ONLY a JSON array of IDs (integers) of the top 5 most related ideas from this list:
${ideaList}

Example: [3, 17, 42]`,
    }],
  })

  const textBlock = response.content.find((b: any) => b.type === 'text') as any
  let ids: number[] = []
  try { ids = JSON.parse(textBlock.text) }
  catch {
    const m = textBlock.text.match(/\[[\d,\s]*\]/)
    if (m) ids = JSON.parse(m[0])
  }

  const related = ids
    .filter((id: any) => typeof id === 'number')
    .map(id => allIdeas.find(i => i.id === id))
    .filter(Boolean)
    .slice(0, 5)

  return { related }
}

// ─── Generate ─────────────────────────────────────────────────────────────────

export async function generateIdea(
  ai: Anthropic,
  models: { quality: string },
  prompt: string
) {
  const response = await ai.messages.create({
    model:      models.quality,
    max_tokens: 1024,
    thinking:   { type: 'adaptive' } as any,
    messages:   [{
      role:    'user',
      content: `Generate a well-structured idea based on: "${prompt.trim()}"

Respond ONLY with valid JSON (no markdown):
{
  "title": "Concise action-oriented title",
  "notes": "2-3 sentences of context or next steps",
  "tags": ["tag1", "tag2"],
  "priority": "high|medium|low"
}`,
    }],
  })

  const textBlock = response.content.find((b: any) => b.type === 'text') as any
  try { return JSON.parse(textBlock.text) }
  catch {
    const m = textBlock.text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('Could not parse AI response')
    return JSON.parse(m[0])
  }
}

// ─── Status Summary ───────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0') }

export function getStatusSummary(db: Database, userId: number) {
  const row = db.prepare(
    'SELECT summaries, generated_at FROM ideas_lab_status_summaries WHERE user_id = ?'
  ).get(userId) as { summaries: string; generated_at: string } | undefined
  if (!row) return null
  return { summaries: JSON.parse(row.summaries) as any[], generated_at: row.generated_at }
}

export function saveStatusSummary(db: Database, userId: number, summaries: any[]) {
  db.prepare(`
    INSERT INTO ideas_lab_status_summaries (user_id, summaries, generated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      summaries    = excluded.summaries,
      generated_at = excluded.generated_at
  `).run(userId, JSON.stringify(summaries))
}

export async function generateStatusSummary(
  db: Database,
  ai: Anthropic,
  models: { efficient: string },
  userId: number
) {
  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })()
  const nextWeek = (() => {
    const d = new Date(); d.setDate(d.getDate() + 7)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })()

  const dueThisWeek = db.prepare(`
    SELECT i.id, i.title, i.due_date, i.priority, i.status,
           c.name AS category_name, c.color AS category_color
    FROM ideas_lab_ideas i LEFT JOIN ideas_lab_categories c ON c.id = i.category_id
    WHERE i.user_id = ? AND i.due_date >= ? AND i.due_date <= ?
    ORDER BY i.due_date, i.priority DESC
  `).all(userId, today, nextWeek) as any[]

  const dueIds = new Set(dueThisWeek.map(x => x.id))
  const recentlyActive = (db.prepare(`
    SELECT i.id, i.title, i.due_date, i.priority, i.status,
           c.name AS category_name, c.color AS category_color
    FROM ideas_lab_ideas i LEFT JOIN ideas_lab_categories c ON c.id = i.category_id
    WHERE i.user_id = ? AND i.updated_at >= datetime('now', '-7 days')
    ORDER BY i.updated_at DESC
  `).all(userId) as any[]).filter(x => !dueIds.has(x.id))

  if (!dueThisWeek.length && !recentlyActive.length) return []

  const byCategory = new Map<string, { name: string; color: string; due: any[]; active: any[] }>()
  const merge = (item: any, key: 'due' | 'active') => {
    const k = item.category_name ?? ''
    if (!byCategory.has(k)) byCategory.set(k, { name: item.category_name, color: item.category_color, due: [], active: [] })
    byCategory.get(k)![key].push(item)
  }
  dueThisWeek.forEach(i => merge(i, 'due'))
  recentlyActive.forEach(i => merge(i, 'active'))

  const activeProjects = db.prepare(`
    SELECT i.title, i.next_action, c.name AS area_name
    FROM ideas_lab_ideas i LEFT JOIN ideas_lab_categories c ON c.id = i.category_id
    WHERE i.user_id = ? AND i.para_type = 'project'
      AND i.status NOT IN ('done','archived','cancelled') AND i.next_action IS NOT NULL
  `).all(userId) as any[]

  const completedActions = db.prepare(`
    SELECT nal.action, nal.completed_at, i.title AS project_title
    FROM ideas_lab_next_action_log nal
    JOIN ideas_lab_ideas i ON i.id = nal.idea_id
    WHERE nal.user_id = ? AND nal.completed_at >= datetime('now', '-7 days')
    ORDER BY nal.completed_at DESC
  `).all(userId) as any[]

  let context = ''
  if (activeProjects.length) {
    context += '\nActive Projects (next actions):\n'
    for (const p of activeProjects) {
      context += `  - ${p.title}: "${p.next_action}"${p.area_name ? ' [' + p.area_name + ']' : ''}\n`
    }
  }
  if (completedActions.length) {
    context += '\nCompleted actions this week:\n'
    for (const a of completedActions) {
      context += `  - [${a.project_title}] ${a.action} (${a.completed_at.slice(0, 10)})\n`
    }
  }
  for (const [, group] of byCategory) {
    context += `\nArea: ${group.name ?? 'Uncategorized'}\n`
    if (group.due.length) {
      context += 'Due this week:\n'
      for (const x of group.due) context += `  - ${x.title} (status: ${x.status}, priority: ${x.priority}, due: ${x.due_date})\n`
    }
    if (group.active.length) {
      context += 'Recently worked on:\n'
      for (const x of group.active) context += `  - ${x.title} (status: ${x.status}, priority: ${x.priority}${x.due_date ? `, due: ${x.due_date}` : ''})\n`
    }
  }

  const response = await ai.messages.create({
    model:      models.efficient,
    max_tokens: 1024,
    messages:   [{
      role:    'user',
      content: `You are helping prepare a status update for a meeting. Below are active projects with their next actions and work items grouped by area. For each area, write 2-4 concise bullet points that a person could speak aloud in a meeting. Synthesize and summarize — do not just list item titles. Cover what has been worked on recently and what is coming up this week. Respond ONLY with valid JSON: an array of objects with "category" (string) and "bullets" (array of strings). No markdown, no explanation.\n\n${context}`,
    }],
  })

  const summaries = JSON.parse(response.content[0].text) as any[]
  const colorMap = Object.fromEntries([...byCategory.entries()].map(([, g]) => [g.name ?? '', g.color]))
  for (const s of summaries) s.color = colorMap[s.category] ?? null
  return summaries
}

export function formatForTelegram(summaries: any[]) {
  const lines = ['📋 Weekly Status Summary\n']
  for (const s of summaries) {
    lines.push(`${s.category ?? 'Uncategorized'}:`)
    for (const b of s.bullets) lines.push(`• ${b}`)
    lines.push('')
  }
  return lines.join('\n').trim()
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export function buildChatContext(db: Database, userId: number) {
  const ideas = db.prepare(`
    SELECT i.id, i.title, i.notes, i.priority, i.status, i.due_date,
           c.name AS category_name,
           GROUP_CONCAT(t.name, ', ') AS tags
    FROM ideas_lab_ideas i
    LEFT JOIN ideas_lab_categories c ON c.id = i.category_id
    LEFT JOIN ideas_lab_idea_tags it2 ON it2.idea_id = i.id
    LEFT JOIN ideas_lab_tags t ON t.id = it2.tag_id
    WHERE i.user_id = ?
    GROUP BY i.id
    ORDER BY i.updated_at DESC
    LIMIT 100
  `).all(userId) as any[]

  const ideaContext = ideas.length
    ? ideas.map(i =>
        `[${i.id}] ${i.title} (${i.priority}/${i.status}${i.category_name ? '/' + i.category_name : ''}${i.tags ? ', #' + i.tags.replace(/, /g, ' #') : ''})`
        + (i.notes ? `\n  ${i.notes.slice(0, 120)}` : '')
      ).join('\n\n')
    : '(No ideas yet)'

  return { ideas, ideaContext }
}

export function saveChatMessages(db: Database, userId: number, userMsg: string, assistantMsg: string) {
  const stmt = db.prepare(
    'INSERT INTO ideas_lab_chat_messages (user_id, role, content) VALUES (?, ?, ?)'
  )
  stmt.run(userId, 'user', userMsg)
  if (assistantMsg) stmt.run(userId, 'assistant', assistantMsg)
}

export function getTodayChat(db: Database, userId: number) {
  const today = new Date().toISOString().slice(0, 10)
  return db.prepare(
    "SELECT role, content, created_at FROM ideas_lab_chat_messages WHERE user_id = ? AND date(created_at) = ? ORDER BY created_at"
  ).all(userId, today)
}
