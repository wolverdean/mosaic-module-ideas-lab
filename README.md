# mosaic-module-ideas-lab

PARA-method ideas workspace for the Mosaic framework. Captures, organises, and enriches ideas using the Projects / Areas / Resources / Archive methodology. Includes AI-powered enrichment, a conversational chat interface with your full idea list as context, weekly AI-generated status summaries, and full-text search.

---

## Features

### Ideas and PARA method

Ideas-Lab organises everything using the **PARA method**: Projects, Areas, Resources, and Archives. Every idea is assigned a PARA type and optionally a **Domain** (colour-coded category).

| Feature | Detail |
|---|---|
| Quick capture | Title-only or fully structured idea |
| PARA type | `project`, `area`, `resource`, `archive` |
| Domain | Colour-coded category bucket |
| Priority | `high`, `medium`, `low` |
| Status | `new`, `in_progress`, `done`, `archived`, `pending`, `cancelled`, `on_hold` |
| Sub-items | Checklist per idea, each with an optional due date |
| Tags | Free-form multi-tag |
| Search | Full-text search (SQLite FTS5) across title and notes |
| Filters | Category, priority, status, tag, PARA type |
| Attachments | Images, audio, PDFs up to 10 MB |
| Voice notes | Record directly in the browser via MediaRecorder |

### Projects

Ideas marked as **Projects** unlock a milestone-and-task workflow:

- **Milestones** — named phases within the project, each with a `done` flag and display order
- **Tasks** (sub-items) — checklist items inside each milestone, each with an optional due date
- **Next Action** — one task per project marked as the current focus
- **Focus Strip** — horizontal band at the top of the Projects view showing one next-action card per active project; click a card to jump to that project

### Knowledge Records (Areas and Resources)

Ideas in the **Areas** and **Resources** PARA types support a structured Knowledge Record view with dedicated fields: Key Insight, Evidence / Examples, Action / Application, Connected Ideas, Open Questions, and Source.

### AI (requires `ANTHROPIC_API_KEY`)

| Feature | Model | Detail |
|---|---|---|
| Enrich | `claude-opus-4-7` | Expands a rough idea with structure, sub-items, and related concepts |
| Related ideas | `claude-opus-4-7` | Finds semantically similar ideas in your list |
| Generate | `claude-opus-4-7` | Creates new ideas in a given domain from a prompt |
| Chat | `claude-opus-4-7` | Streaming conversational assistant with your full idea list as context; `cache_control: ephemeral` on the context block to reduce cost |
| Weekly status | `claude-sonnet-4-6` | Monday AI-generated status summary grouping active projects by domain |

### Scheduled jobs

| Job | Schedule | What it does |
|---|---|---|
| Auto-archive | Daily 02:00 | Archives ideas marked Done for more than 1 year |
| Clear chat | Daily 03:00 | Deletes yesterday's chat messages |
| Weekly status | Monday 08:00 | Generates AI-written status report across active projects |

---

## API

Base path: `/api/ideas-lab/`

### Categories

| Method | Path | Description |
|---|---|---|
| `GET` | `/categories` | List all categories |
| `POST` | `/categories` | Create category (`name`, `color`) |
| `DELETE` | `/categories/:id` | Delete category |

### Tags

| Method | Path | Description |
|---|---|---|
| `GET` | `/tags` | List all tags with usage counts |

### Ideas

| Method | Path | Description |
|---|---|---|
| `GET` | `/ideas` | List ideas (filters: `category`, `category_name`, `priority`, `status`, `para_type`, `tag`, `q`) |
| `POST` | `/ideas` | Create idea (`title`, `notes`, `priority`, `status`, `para_type`, `tags`, …) |
| `GET` | `/ideas/:id` | Get idea with sub-items, tags, and attachments |
| `PUT` | `/ideas/:id` | Update idea |
| `DELETE` | `/ideas/:id` | Delete idea |
| `POST` | `/ideas/:id/attachments` | Upload attachment (multipart/form-data) |
| `DELETE` | `/ideas/:id/attachments/:attachId` | Remove attachment |
| `POST` | `/ideas/:id/voice` | Upload voice note |

### Sub-items

| Method | Path | Description |
|---|---|---|
| `POST` | `/ideas/:id/subitems` | Add sub-item (`title`, `due_date`) |
| `PUT` | `/ideas/:id/subitems/:subId` | Update sub-item |
| `DELETE` | `/ideas/:id/subitems/:subId` | Delete sub-item |

### AI

| Method | Path | Description |
|---|---|---|
| `POST` | `/ai/enrich` | Enrich idea with AI (`ideaId`) |
| `POST` | `/ai/related` | Find related ideas (`ideaId`) |
| `POST` | `/ai/generate` | Generate new ideas (`categoryId`, `prompt`) |
| `GET` | `/ai/chat` | SSE streaming chat (`message` query param) |
| `GET` | `/ai/chat/history` | Today's chat message history |

### Reports and Calendar

| Method | Path | Description |
|---|---|---|
| `GET` | `/reports/summary` | Counts by status |
| `GET` | `/reports/weekly` | Ideas updated in a date range (`start`, `end`) |
| `GET` | `/reports/overdue` | Ideas with past due dates |
| `GET` | `/calendar` | Ideas with due dates for a given month (`year`, `month`) |

---

## iOS Shortcut — one-tap idea capture

Add an idea from anywhere on your iPhone without opening a browser.

### Step 1 — Get your API token

1. Open the Mosaic shell in Safari at `http://<server-ip>:3000`
2. Navigate to **Settings** in the sidebar
3. Click **Show Token** under the API Token section
4. Copy the token

### Step 2 — Create the Shortcut

1. Open the **Shortcuts** app on your iPhone
2. Tap **+** to create a new shortcut. Rename it to **💡 Save Idea**

**Action 1 — Ask for Input:**
- Tap **Add Action** → search `Ask for Input`
- Set prompt: `What's your idea?`

**Action 2 — Get Contents of URL:**
- Add action → search `Get Contents of URL`
- URL: `http://<server-ip>:3000/api/ideas-lab/ideas`
- Tap **Show More**
- Method: `POST`
- Headers:
  - `Authorization`: `Bearer <your-token>`
  - `Content-Type`: `application/json`
- Request Body: `JSON`
  - Key: `title` → Value: **Provided Input** (tap the variable icon above the keyboard)

**Action 3 — Show Notification (optional):**
- Add action → search `Show Notification`
- Body: `Idea saved! 💡`

Tap **Done**.

### Step 3 — Add to Home Screen

Long-press the shortcut → **Details** → **Add to Home Screen**. Tap **Add**.

**You're done.** Tap the icon → type your idea → tap Done → it's instantly saved.

---

## Android quick-add

Use the free **HTTP Shortcuts** app from the Play Store:

1. Create a shortcut:
   - Method: `POST`
   - URL: `http://<server-ip>:3000/api/ideas-lab/ideas`
   - Headers: `Authorization: Bearer <token>` and `Content-Type: application/json`
   - Request Body: `{"title": "{input}"}`
   - Enable **Show input dialog before execution**
2. Add the shortcut to your home screen from within the app

---

## API usage examples

```bash
# Quick-add an idea
curl -X POST http://<server-ip>:3000/api/ideas-lab/ideas \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"title": "My idea", "priority": "high"}'

# Query with filters
curl "http://<server-ip>:3000/api/ideas-lab/ideas?para_type=project&status=in_progress" \
  -H "Authorization: Bearer <your-token>"
```

**Query parameters for `GET /api/ideas-lab/ideas`:**

| Parameter | Example | Notes |
|---|---|---|
| `category_name` | `Business` | Filter by category name (case-insensitive) |
| `category` | `1` | Filter by category ID |
| `priority` | `high` | `high`, `medium`, or `low` |
| `status` | `in_progress` | Any valid status value |
| `para_type` | `project` | `project`, `area`, `resource`, or `archive` |
| `tag` | `ux` | Filter by tag name |
| `q` | `search term` | Full-text search across title and notes |

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `multer` | ^2.0.1 | File and voice note upload handling |
| `@anthropic-ai/sdk` | ^0.104.1 | Claude AI (dev — injected via framework context at runtime) |
| `better-sqlite3` | peer | SQLite driver (provided by framework) |
| `express` | peer | HTTP server (provided by framework) |
| `@opentelemetry/api` | peer | Observability (provided by framework) |

---

## Project structure

```
mosaic-module-ideas-lab/
├── index.ts            # Module manifest — slug, nav badge, jobs, report hooks, calendar hook
├── src/
│   ├── routes/
│   │   ├── index.ts    # Router factory — mounts ideas and AI sub-routers + /ui.js
│   │   ├── ideas.ts    # CRUD, categories, tags, attachments, voice, sub-items, FTS search
│   │   └── ai.ts       # Enrich, related, generate, SSE chat
│   └── services/       # Business logic separated from route handlers
├── public/
│   └── ui.js           # Frontend IIFE — served via GET /api/ideas-lab/ui.js
└── tests/
    └── unit/           # Vitest unit tests
```
