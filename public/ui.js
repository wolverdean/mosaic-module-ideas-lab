/* mosaic-module-ideas-lab — UI entry point */
/* global window, document, fetch */
;(function () {
  'use strict'

  // ─── CSS ──────────────────────────────────────────────────────────────────

  const CSS = `
.il-root { font-family: system-ui, sans-serif; height: 100%; display: flex; flex-direction: column; color: #1e293b; }
.il-toolbar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; background: #fff; flex-wrap: wrap; }
.il-toolbar h2 { margin: 0; font-size: 1rem; font-weight: 600; }
.il-tabs { display: flex; gap: 2px; overflow-x: auto; }
.il-tab { padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 500; border: none; background: none; color: #64748b; white-space: nowrap; }
.il-tab.active { background: #6366f1; color: #fff; }
.il-tab:hover:not(.active) { background: #f1f5f9; }
.il-search { padding: 6px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.85rem; min-width: 160px; }
.il-btn { padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 500; border: none; }
.il-btn-primary { background: #6366f1; color: #fff; }
.il-btn-primary:hover { background: #4f46e5; }
.il-btn-sm { padding: 4px 8px; font-size: 0.78rem; }
.il-btn-ghost { background: none; color: #64748b; }
.il-btn-ghost:hover { background: #f1f5f9; }
.il-btn-danger { background: #ef4444; color: #fff; }
.il-btn-danger:hover { background: #dc2626; }
.il-spacer { flex: 1; }
.il-main { flex: 1; overflow: hidden; display: flex; }
.il-sidebar { width: 200px; flex-shrink: 0; border-right: 1px solid #e2e8f0; overflow-y: auto; padding: 12px 8px; background: #fafafa; }
.il-sidebar h3 { font-size: 0.7rem; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; margin: 0 0 6px 8px; }
.il-cat-item { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; }
.il-cat-item:hover, .il-cat-item.active { background: #e0e7ff; color: #4338ca; }
.il-cat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.il-list { flex: 1; overflow-y: auto; padding: 12px; }
.il-empty { padding: 40px; text-align: center; color: #94a3b8; font-size: 0.9rem; }
.il-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 8px; cursor: pointer; transition: box-shadow .15s; }
.il-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.08); border-color: #c7d2fe; }
.il-card-header { display: flex; align-items: flex-start; gap: 8px; }
.il-card-title { font-size: 0.9rem; font-weight: 600; flex: 1; }
.il-badge { padding: 2px 7px; border-radius: 9999px; font-size: 0.7rem; font-weight: 600; }
.il-badge-high { background: #fee2e2; color: #b91c1c; }
.il-badge-medium { background: #fef3c7; color: #92400e; }
.il-badge-low { background: #dcfce7; color: #166534; }
.il-badge-new { background: #e0e7ff; color: #3730a3; }
.il-badge-in_progress { background: #fff3cd; color: #92400e; }
.il-badge-done { background: #dcfce7; color: #166534; }
.il-badge-archived { background: #f1f5f9; color: #64748b; }
.il-badge-pending { background: #fce7f3; color: #9d174d; }
.il-badge-cancelled { background: #f1f5f9; color: #64748b; }
.il-badge-on_hold { background: #f5f3ff; color: #5b21b6; }
.il-card-meta { display: flex; align-items: center; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.il-tag { background: #f1f5f9; border-radius: 4px; padding: 1px 6px; font-size: 0.7rem; color: #475569; }
.il-cat-label { font-size: 0.72rem; color: #6366f1; font-weight: 500; }
.il-due-date { font-size: 0.72rem; color: #64748b; }
.il-due-overdue { color: #ef4444; font-weight: 600; }
.il-progress { font-size: 0.72rem; color: #64748b; }
.il-next-action { font-size: 0.78rem; color: #6366f1; margin-top: 5px; font-style: italic; }

/* Detail pane */
.il-detail { width: 420px; flex-shrink: 0; border-left: 1px solid #e2e8f0; overflow-y: auto; background: #fff; display: flex; flex-direction: column; }
.il-detail-header { padding: 16px; border-bottom: 1px solid #e2e8f0; }
.il-detail-title { font-size: 1.05rem; font-weight: 700; margin: 0 0 8px; }
.il-detail-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.il-detail-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.il-detail-section { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
.il-detail-section h4 { font-size: 0.72rem; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; margin: 0 0 8px; }
.il-notes { font-size: 0.85rem; white-space: pre-wrap; color: #475569; }
.il-ai-summary { font-size: 0.82rem; color: #4338ca; background: #e0e7ff; border-radius: 6px; padding: 8px 10px; }
.il-subitem { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.il-subitem-check { width: 16px; height: 16px; cursor: pointer; accent-color: #6366f1; }
.il-subitem-title { font-size: 0.82rem; flex: 1; }
.il-subitem-title.done { text-decoration: line-through; color: #94a3b8; }
.il-add-row { display: flex; gap: 6px; margin-top: 8px; }
.il-add-input { flex: 1; padding: 5px 8px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.82rem; }
.il-milestone { background: #f8fafc; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; }
.il-milestone-header { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; font-weight: 600; }
.il-milestone-done { text-decoration: line-through; color: #94a3b8; }
.il-milestone-prog { font-size: 0.72rem; color: #64748b; }

/* Modal */
.il-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.il-modal { background: #fff; border-radius: 12px; padding: 24px; width: 480px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,.2); }
.il-modal h3 { margin: 0 0 16px; font-size: 1rem; font-weight: 700; }
.il-field { margin-bottom: 14px; }
.il-field label { display: block; font-size: 0.8rem; font-weight: 600; color: #374151; margin-bottom: 4px; }
.il-field input, .il-field textarea, .il-field select { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.85rem; box-sizing: border-box; font-family: inherit; }
.il-field textarea { height: 100px; resize: vertical; }
.il-modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }

/* Chat */
.il-chat { flex: 1; display: flex; flex-direction: column; }
.il-chat-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.il-chat-msg { max-width: 85%; padding: 8px 12px; border-radius: 10px; font-size: 0.85rem; line-height: 1.5; white-space: pre-wrap; }
.il-chat-msg.user { align-self: flex-end; background: #6366f1; color: #fff; border-bottom-right-radius: 2px; }
.il-chat-msg.assistant { align-self: flex-start; background: #f1f5f9; color: #1e293b; border-bottom-left-radius: 2px; }
.il-chat-input-row { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #e2e8f0; }
.il-chat-input { flex: 1; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.85rem; resize: none; font-family: inherit; height: 60px; }
`

  // ─── State ────────────────────────────────────────────────────────────────

  let shell = null
  let container = null
  let state = {
    tab:        'inbox',
    search:     '',
    categoryId: null,
    ideas:      [],
    categories: [],
    tags:       [],
    selected:   null,
    detail:     null,
    milestones: [],
    subitems:   [],
    chatHistory: [],
    chatLoading: false,
    loading:    false,
    view:       'ideas',  // 'ideas' | 'chat'
  }

  // ─── API helpers ──────────────────────────────────────────────────────────

  async function api(method, path, body) {
    return shell.api[method](path, body)
  }

  // ─── Render helpers ───────────────────────────────────────────────────────

  function badge(text, cls) {
    return `<span class="il-badge il-badge-${cls}">${esc(text)}</span>`
  }
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }
  function today() {
    return new Date().toISOString().slice(0, 10)
  }
  function fmtDate(d) {
    if (!d) return ''
    const isOverdue = d < today()
    return `<span class="il-due-date${isOverdue ? ' il-due-overdue' : ''}">${esc(d)}</span>`
  }

  // ─── Data loading ─────────────────────────────────────────────────────────

  async function loadCategories() {
    state.categories = await api('get', '/categories')
    renderSidebar()
  }

  async function loadIdeas() {
    state.loading = true
    renderList()
    const params = new URLSearchParams()
    if (state.tab)        params.set('para_type', state.tab)
    if (state.search)     params.set('q', state.search)
    if (state.categoryId) params.set('category', state.categoryId)
    state.ideas = await api('get', `/ideas?${params}`)
    state.loading = false
    renderList()
  }

  async function loadDetail(idea) {
    state.selected = idea
    renderDetail()
    const [detail, milestones, subitems] = await Promise.all([
      api('get', `/ideas/${idea.id}`),
      api('get', `/ideas/${idea.id}/milestones`),
      api('get', `/ideas/${idea.id}/subitems`),
    ])
    state.detail     = detail
    state.milestones = milestones
    state.subitems   = subitems
    renderDetail()
  }

  async function loadChatHistory() {
    const { messages } = await api('get', '/ai/chat/today')
    state.chatHistory = messages
    renderChat()
  }

  // ─── Toolbar ──────────────────────────────────────────────────────────────

  function renderToolbar() {
    const el = container.querySelector('.il-toolbar')
    const TABS = [
      { key: 'inbox',    label: 'Inbox' },
      { key: 'project',  label: 'Projects' },
      { key: 'area',     label: 'Areas' },
      { key: 'resource', label: 'Resources' },
      { key: 'archive',  label: 'Archive' },
    ]
    el.innerHTML = `
      <h2>Ideas Lab</h2>
      <div class="il-tabs">
        ${TABS.map(t => `<button class="il-tab${state.tab === t.key ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>
      <input class="il-search" placeholder="Search…" value="${esc(state.search)}" id="il-search">
      <div class="il-spacer"></div>
      <button class="il-btn il-btn-ghost il-btn-sm" id="il-btn-chat">💬 Chat</button>
      <button class="il-btn il-btn-primary il-btn-sm" id="il-btn-new">+ New Idea</button>
    `
    el.querySelectorAll('.il-tab').forEach(btn => {
      btn.onclick = () => { state.tab = btn.dataset.tab; state.selected = null; state.detail = null; loadIdeas(); renderToolbar(); renderDetail() }
    })
    el.querySelector('#il-search').oninput = debounce(e => { state.search = e.target.value; loadIdeas() }, 300)
    el.querySelector('#il-btn-new').onclick = () => openCreateModal()
    el.querySelector('#il-btn-chat').onclick = () => {
      state.view = state.view === 'chat' ? 'ideas' : 'chat'
      renderView()
    }
  }

  // ─── Sidebar ──────────────────────────────────────────────────────────────

  function renderSidebar() {
    const el = container.querySelector('.il-sidebar')
    el.innerHTML = `
      <h3>Categories</h3>
      <div class="il-cat-item${!state.categoryId ? ' active' : ''}" data-cat="">
        <span class="il-cat-dot" style="background:#94a3b8"></span> All
      </div>
      ${state.categories.map(c => `
        <div class="il-cat-item${state.categoryId === c.id ? ' active' : ''}" data-cat="${c.id}">
          <span class="il-cat-dot" style="background:${esc(c.color)}"></span>
          ${esc(c.name)}
        </div>
      `).join('')}
      <div style="margin-top:12px">
        <button class="il-btn il-btn-ghost il-btn-sm" id="il-btn-add-cat">+ Category</button>
      </div>
    `
    el.querySelectorAll('.il-cat-item').forEach(item => {
      item.onclick = () => {
        state.categoryId = item.dataset.cat ? Number(item.dataset.cat) : null
        renderSidebar()
        loadIdeas()
      }
    })
    el.querySelector('#il-btn-add-cat').onclick = () => openCategoryModal()
  }

  // ─── Ideas List ───────────────────────────────────────────────────────────

  function renderList() {
    const el = container.querySelector('.il-list')
    if (state.loading) { el.innerHTML = '<div class="il-empty">Loading…</div>'; return }
    if (!state.ideas.length) { el.innerHTML = '<div class="il-empty">No ideas here yet.</div>'; return }
    el.innerHTML = state.ideas.map(idea => {
      const prog = idea.subitem_count
        ? `<span class="il-progress">✓ ${idea.subitem_done}/${idea.subitem_count}</span>`
        : ''
      const msProg = idea.milestone_count
        ? `<span class="il-progress">◎ ${idea.milestone_done}/${idea.milestone_count}</span>`
        : ''
      const tags = (idea.tags || []).slice(0, 3).map(t => `<span class="il-tag">${esc(t)}</span>`).join('')
      const catLabel = idea.category_name ? `<span class="il-cat-label">${esc(idea.category_name)}</span>` : ''
      const na = idea.next_action ? `<div class="il-next-action">→ ${esc(idea.next_action)}</div>` : ''
      return `
        <div class="il-card${state.selected?.id === idea.id ? ' il-card-selected' : ''}" data-id="${idea.id}" style="${state.selected?.id === idea.id ? 'border-color:#6366f1;' : ''}">
          <div class="il-card-header">
            <span class="il-card-title">${esc(idea.title)}</span>
            ${badge(idea.priority, idea.priority)} ${badge(idea.status, idea.status)}
          </div>
          <div class="il-card-meta">
            ${catLabel} ${fmtDate(idea.due_date)} ${prog} ${msProg} ${tags}
          </div>
          ${na}
        </div>
      `
    }).join('')
    el.querySelectorAll('.il-card').forEach(card => {
      card.onclick = () => {
        const idea = state.ideas.find(i => i.id === Number(card.dataset.id))
        if (idea) loadDetail(idea)
      }
    })
  }

  // ─── Detail Pane ──────────────────────────────────────────────────────────

  function renderDetail() {
    const el = container.querySelector('.il-detail')
    if (!state.selected) { el.innerHTML = '<div class="il-empty" style="margin-top:40px">Select an idea to view details.</div>'; return }
    const idea  = state.detail || state.selected
    const msHtml = state.milestones.map(ms => {
      const done = ms.done ? 'il-milestone-done' : ''
      const prog = `${ms.task_done}/${ms.task_count} tasks`
      return `<div class="il-milestone">
        <div class="il-milestone-header">
          <span class="il-milestone-prog">${ms.done ? '✓' : '○'}</span>
          <span class="${done}">${esc(ms.title)}</span>
          ${ms.due_date ? fmtDate(ms.due_date) : ''}
        </div>
        ${ms.task_count ? `<div class="il-milestone-prog">${prog}</div>` : ''}
      </div>`
    }).join('')

    const subHtml = state.subitems.map(si => `
      <div class="il-subitem" data-si="${si.id}">
        <input type="checkbox" class="il-subitem-check" ${si.done ? 'checked' : ''} data-si="${si.id}">
        <span class="il-subitem-title${si.done ? ' done' : ''}">${esc(si.title)}</span>
      </div>
    `).join('')

    const aiBtn = idea.ai_enriched
      ? `<button class="il-btn il-btn-ghost il-btn-sm" id="il-btn-re-enrich">✦ Re-enrich</button>`
      : `<button class="il-btn il-btn-ghost il-btn-sm" id="il-btn-enrich">✦ AI Enrich</button>`

    el.innerHTML = `
      <div class="il-detail-header">
        <div class="il-detail-title">${esc(idea.title)}</div>
        <div class="il-detail-badges">
          ${badge(idea.priority, idea.priority)}
          ${badge(idea.status, idea.status)}
          ${idea.category_name ? `<span class="il-cat-label">${esc(idea.category_name)}</span>` : ''}
        </div>
        <div class="il-detail-actions">
          <button class="il-btn il-btn-primary il-btn-sm" id="il-btn-edit">Edit</button>
          ${aiBtn}
          <button class="il-btn il-btn-ghost il-btn-sm" id="il-btn-duplicate">⎘ Duplicate</button>
          <button class="il-btn il-btn-danger il-btn-sm" id="il-btn-delete">Delete</button>
        </div>
      </div>

      ${idea.ai_summary ? `<div class="il-detail-section"><div class="il-ai-summary">✦ ${esc(idea.ai_summary)}</div></div>` : ''}

      ${idea.notes ? `<div class="il-detail-section"><h4>Notes</h4><div class="il-notes">${esc(idea.notes)}</div></div>` : ''}

      ${idea.next_action ? `<div class="il-detail-section">
        <h4>Next Action</h4>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="il-next-action" style="font-style:normal">→ ${esc(idea.next_action)}</span>
          <button class="il-btn il-btn-ghost il-btn-sm" id="il-btn-complete-na">✓ Complete</button>
        </div>
      </div>` : ''}

      ${state.milestones.length ? `<div class="il-detail-section"><h4>Milestones</h4>${msHtml}</div>` : ''}

      <div class="il-detail-section">
        <h4>Tasks</h4>
        ${subHtml}
        <div class="il-add-row">
          <input class="il-add-input" placeholder="Add task…" id="il-add-task">
          <button class="il-btn il-btn-primary il-btn-sm" id="il-btn-add-task">Add</button>
        </div>
      </div>

      <div class="il-detail-section">
        <h4>Tags</h4>
        <div>${(idea.tags || []).map(t => `<span class="il-tag">${esc(t)}</span>`).join(' ')}</div>
      </div>

      ${idea.due_date ? `<div class="il-detail-section"><h4>Due Date</h4>${fmtDate(idea.due_date)}</div>` : ''}
    `

    el.querySelector('#il-btn-edit')?.addEventListener('click', () => openEditModal(idea))
    el.querySelector('#il-btn-delete')?.addEventListener('click', () => deleteIdea(idea))
    el.querySelector('#il-btn-enrich')?.addEventListener('click', () => enrichIdea(idea))
    el.querySelector('#il-btn-re-enrich')?.addEventListener('click', () => enrichIdea(idea))
    el.querySelector('#il-btn-duplicate')?.addEventListener('click', () => duplicateIdea(idea))
    el.querySelector('#il-btn-complete-na')?.addEventListener('click', () => completeNextAction(idea))

    el.querySelectorAll('.il-subitem-check').forEach(chk => {
      chk.onchange = () => toggleSubitem(Number(chk.dataset.si), chk.checked)
    })

    const addBtn = el.querySelector('#il-btn-add-task')
    const addInput = el.querySelector('#il-add-task')
    addBtn?.addEventListener('click', () => addSubitem(idea.id, addInput))
    addInput?.addEventListener('keydown', e => { if (e.key === 'Enter') addSubitem(idea.id, addInput) })
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────

  function renderChat() {
    const el = container.querySelector('.il-chat')
    if (!el) return
    const msgsEl = el.querySelector('.il-chat-messages')
    if (msgsEl) {
      msgsEl.innerHTML = state.chatHistory.map(m =>
        `<div class="il-chat-msg ${m.role}">${esc(m.content)}</div>`
      ).join('')
      msgsEl.scrollTop = msgsEl.scrollHeight
    }
  }

  function renderView() {
    const listArea = container.querySelector('.il-list-area')
    const chatArea = container.querySelector('.il-chat-area')
    if (!listArea || !chatArea) return

    if (state.view === 'chat') {
      listArea.style.display = 'none'
      chatArea.style.display = 'flex'
      loadChatHistory()
    } else {
      listArea.style.display = 'flex'
      chatArea.style.display = 'none'
    }
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function enrichIdea(idea) {
    const btn = container.querySelector('#il-btn-enrich, #il-btn-re-enrich')
    if (btn) btn.textContent = '✦ Enriching…'
    try {
      const result = await api('post', `/ai/enrich/${idea.id}`, {})
      state.detail = { ...state.detail, ai_summary: result.summary, ai_enriched: 1 }
      renderDetail()
    } catch (e) {
      alert(`AI error: ${e.message}`)
    }
  }

  async function deleteIdea(idea) {
    if (!confirm(`Delete "${idea.title}"?`)) return
    await api('delete', `/ideas/${idea.id}`)
    state.selected = null
    state.detail   = null
    renderDetail()
    loadIdeas()
  }

  async function duplicateIdea(idea) {
    const title = prompt('Title for duplicate:', `Copy of ${idea.title}`)
    if (!title) return
    const result = await api('post', `/ideas/${idea.id}/duplicate`, { title })
    await loadIdeas()
    const newIdea = state.ideas.find(i => i.id === Number(result.id))
    if (newIdea) loadDetail(newIdea)
  }

  async function completeNextAction(idea) {
    await api('post', `/ideas/${idea.id}/next-action/complete`, {})
    await loadDetail(state.selected)
    loadIdeas()
  }

  async function toggleSubitem(siId, done) {
    await api('put', `/subitems/${siId}`, { task_status: done ? 'done' : 'todo' })
    const subitems = await api('get', `/ideas/${state.selected.id}/subitems`)
    state.subitems = subitems
    renderDetail()
  }

  async function addSubitem(ideaId, input) {
    const title = input.value.trim()
    if (!title) return
    await api('post', `/ideas/${ideaId}/subitems`, { title })
    input.value = ''
    state.subitems = await api('get', `/ideas/${ideaId}/subitems`)
    renderDetail()
  }

  // ─── Chat send ────────────────────────────────────────────────────────────

  async function sendChat(input) {
    const message = input.value.trim()
    if (!message || state.chatLoading) return
    input.value = ''
    state.chatLoading = true
    state.chatHistory.push({ role: 'user', content: message })
    state.chatHistory.push({ role: 'assistant', content: '…' })
    renderChat()

    let full = ''
    try {
      const resp = await fetch('/api/ideas-lab/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message, history: state.chatHistory.slice(-20) }),
      })
      const reader = resp.body.getReader()
      const dec    = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of dec.decode(value).split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            if (parsed.text) {
              full += parsed.text
              state.chatHistory[state.chatHistory.length - 1] = { role: 'assistant', content: full }
              renderChat()
            }
          } catch { /* partial chunk */ }
        }
      }
    } finally {
      state.chatLoading = false
    }
  }

  // ─── Modals ───────────────────────────────────────────────────────────────

  function openModal(html) {
    const overlay = document.createElement('div')
    overlay.className = 'il-overlay'
    overlay.innerHTML = `<div class="il-modal">${html}</div>`
    overlay.onclick = e => { if (e.target === overlay) overlay.remove() }
    document.body.appendChild(overlay)
    return overlay
  }

  function openCreateModal() {
    const overlay = openModal(`
      <h3>New Idea</h3>
      <div class="il-field"><label>Title *</label><input id="m-title" placeholder="What's the idea?"></div>
      <div class="il-field"><label>Notes</label><textarea id="m-notes" placeholder="Details, context…"></textarea></div>
      <div class="il-field"><label>Priority</label>
        <select id="m-priority"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
      </div>
      <div class="il-field"><label>Status</label>
        <select id="m-status"><option value="new">New</option><option value="in_progress">In Progress</option><option value="pending">Pending</option><option value="on_hold">On Hold</option></select>
      </div>
      <div class="il-field"><label>Category</label>
        <select id="m-cat">
          <option value="">— None —</option>
          ${state.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="il-field"><label>Tags (comma-separated)</label><input id="m-tags" placeholder="tag1, tag2"></div>
      <div class="il-field"><label>Due Date</label><input type="date" id="m-due"></div>
      <div class="il-field"><label>Next Action</label><input id="m-na" placeholder="Immediate next step"></div>
      <div class="il-modal-actions">
        <button class="il-btn il-btn-ghost" id="m-cancel">Cancel</button>
        <button class="il-btn il-btn-primary" id="m-save">Create</button>
      </div>
    `)
    overlay.querySelector('#m-cancel').onclick = () => overlay.remove()
    overlay.querySelector('#m-save').onclick = async () => {
      const title = overlay.querySelector('#m-title').value.trim()
      if (!title) { alert('Title is required'); return }
      const tags = overlay.querySelector('#m-tags').value.split(',').map(t => t.trim()).filter(Boolean)
      await api('post', '/ideas', {
        title,
        notes:       overlay.querySelector('#m-notes').value,
        priority:    overlay.querySelector('#m-priority').value,
        status:      overlay.querySelector('#m-status').value,
        category_id: overlay.querySelector('#m-cat').value ? Number(overlay.querySelector('#m-cat').value) : undefined,
        due_date:    overlay.querySelector('#m-due').value || undefined,
        next_action: overlay.querySelector('#m-na').value.trim() || undefined,
        para_type:   state.tab === 'archive' ? 'inbox' : state.tab,
        tags,
      })
      overlay.remove()
      loadIdeas()
    }
  }

  function openEditModal(idea) {
    const overlay = openModal(`
      <h3>Edit Idea</h3>
      <div class="il-field"><label>Title *</label><input id="m-title" value="${esc(idea.title)}"></div>
      <div class="il-field"><label>Notes</label><textarea id="m-notes">${esc(idea.notes || '')}</textarea></div>
      <div class="il-field"><label>Priority</label>
        <select id="m-priority">
          ${['low','medium','high'].map(p => `<option value="${p}" ${idea.priority===p?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div class="il-field"><label>Status</label>
        <select id="m-status">
          ${['new','in_progress','done','archived','pending','cancelled','on_hold'].map(s => `<option value="${s}" ${idea.status===s?'selected':''}>${s.replace('_',' ')}</option>`).join('')}
        </select>
      </div>
      <div class="il-field"><label>Category</label>
        <select id="m-cat">
          <option value="">— None —</option>
          ${state.categories.map(c => `<option value="${c.id}" ${idea.category_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="il-field"><label>Tags (comma-separated)</label><input id="m-tags" value="${esc((idea.tags||[]).join(', '))}"></div>
      <div class="il-field"><label>Due Date</label><input type="date" id="m-due" value="${esc(idea.due_date||'')}"></div>
      <div class="il-field"><label>Goal</label><input id="m-goal" value="${esc(idea.goal||'')}"></div>
      <div class="il-field"><label>Next Action</label><input id="m-na" value="${esc(idea.next_action||'')}"></div>
      <div class="il-modal-actions">
        <button class="il-btn il-btn-ghost" id="m-cancel">Cancel</button>
        <button class="il-btn il-btn-primary" id="m-save">Save</button>
      </div>
    `)
    overlay.querySelector('#m-cancel').onclick = () => overlay.remove()
    overlay.querySelector('#m-save').onclick = async () => {
      const title = overlay.querySelector('#m-title').value.trim()
      if (!title) { alert('Title is required'); return }
      const tags = overlay.querySelector('#m-tags').value.split(',').map(t => t.trim()).filter(Boolean)
      const updated = await api('put', `/ideas/${idea.id}`, {
        title,
        notes:       overlay.querySelector('#m-notes').value,
        priority:    overlay.querySelector('#m-priority').value,
        status:      overlay.querySelector('#m-status').value,
        category_id: overlay.querySelector('#m-cat').value ? Number(overlay.querySelector('#m-cat').value) : undefined,
        due_date:    overlay.querySelector('#m-due').value || null,
        goal:        overlay.querySelector('#m-goal').value.trim() || null,
        next_action: overlay.querySelector('#m-na').value.trim() || null,
        tags,
      })
      overlay.remove()
      await loadIdeas()
      loadDetail(updated)
    }
  }

  function openCategoryModal() {
    const overlay = openModal(`
      <h3>New Category</h3>
      <div class="il-field"><label>Name *</label><input id="m-name" placeholder="e.g. Business"></div>
      <div class="il-field"><label>Color</label><input type="color" id="m-color" value="#6366f1"></div>
      <div class="il-modal-actions">
        <button class="il-btn il-btn-ghost" id="m-cancel">Cancel</button>
        <button class="il-btn il-btn-primary" id="m-save">Create</button>
      </div>
    `)
    overlay.querySelector('#m-cancel').onclick = () => overlay.remove()
    overlay.querySelector('#m-save').onclick = async () => {
      const name = overlay.querySelector('#m-name').value.trim()
      if (!name) { alert('Name is required'); return }
      await api('post', '/categories', { name, color: overlay.querySelector('#m-color').value })
      overlay.remove()
      loadCategories()
    }
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  function debounce(fn, ms) {
    let t
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
  }

  // ─── Full render ──────────────────────────────────────────────────────────

  function renderAll() {
    container.innerHTML = `
      <style>${CSS}</style>
      <div class="il-root">
        <div class="il-toolbar"></div>
        <div class="il-main">
          <div class="il-sidebar"></div>
          <div class="il-list-area" style="flex:1;display:flex">
            <div class="il-list" style="flex:1;overflow-y:auto;padding:12px"></div>
            <div class="il-detail"></div>
          </div>
          <div class="il-chat-area" style="flex:1;display:none;flex-direction:column">
            <div class="il-chat">
              <div class="il-chat-messages"></div>
              <div class="il-chat-input-row">
                <textarea class="il-chat-input" id="il-chat-input" placeholder="Ask about your ideas…"></textarea>
                <button class="il-btn il-btn-primary" id="il-btn-send">Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
    renderToolbar()
    renderSidebar()
    renderList()
    renderDetail()

    const chatInput = container.querySelector('#il-chat-input')
    container.querySelector('#il-btn-send')?.addEventListener('click', () => sendChat(chatInput))
    chatInput?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(chatInput) } })
  }

  // ─── Mosaic module registration ───────────────────────────────────────────

  window.Mosaic.registerModule({
    slug: 'ideas-lab',

    init(s) {
      shell = s
    },

    onActivate(el) {
      container = el
      renderAll()
      loadCategories()
      loadIdeas()
    },

    onDeactivate() {
      container = null
    },
  })
})()
