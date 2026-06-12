import type { ModuleDb } from '@mosaic/sdk'

export function migrate(db: ModuleDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ideas_lab_categories (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name    TEXT NOT NULL,
      color   TEXT NOT NULL DEFAULT '#6366f1',
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS ideas_lab_ideas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      notes       TEXT DEFAULT '',
      priority    TEXT NOT NULL DEFAULT 'low'
                    CHECK(priority IN ('high','medium','low')),
      status      TEXT NOT NULL DEFAULT 'new'
                    CHECK(status IN ('new','in_progress','done','archived','pending','cancelled','on_hold')),
      category_id INTEGER REFERENCES ideas_lab_categories(id) ON DELETE SET NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      due_date    TEXT,
      ai_summary  TEXT,
      ai_enriched INTEGER NOT NULL DEFAULT 0,
      ai_tags     TEXT,
      source      TEXT NOT NULL DEFAULT 'manual',
      done_at     TEXT,
      para_type   TEXT NOT NULL DEFAULT 'inbox',
      goal        TEXT,
      next_action TEXT
    );

    CREATE TABLE IF NOT EXISTS ideas_lab_tags (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name    TEXT NOT NULL COLLATE NOCASE,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS ideas_lab_idea_tags (
      idea_id INTEGER NOT NULL REFERENCES ideas_lab_ideas(id) ON DELETE CASCADE,
      tag_id  INTEGER NOT NULL REFERENCES ideas_lab_tags(id) ON DELETE CASCADE,
      PRIMARY KEY(idea_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS ideas_lab_attachments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      idea_id       INTEGER NOT NULL REFERENCES ideas_lab_ideas(id) ON DELETE CASCADE,
      filename      TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type     TEXT NOT NULL,
      size          INTEGER NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ideas_lab_project_milestones (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      idea_id    INTEGER NOT NULL REFERENCES ideas_lab_ideas(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      due_date   TEXT,
      position   INTEGER NOT NULL DEFAULT 0,
      done       INTEGER NOT NULL DEFAULT 0,
      done_at    TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ideas_lab_sub_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      idea_id       INTEGER NOT NULL REFERENCES ideas_lab_ideas(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      done          INTEGER NOT NULL DEFAULT 0,
      due_date      TEXT,
      task_priority TEXT NOT NULL DEFAULT 'medium',
      task_status   TEXT NOT NULL DEFAULT 'todo',
      position      INTEGER NOT NULL DEFAULT 0,
      milestone_id  INTEGER REFERENCES ideas_lab_project_milestones(id) ON DELETE SET NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ideas_lab_next_action_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      idea_id      INTEGER NOT NULL REFERENCES ideas_lab_ideas(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id),
      action       TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ideas_lab_chat_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role       TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ideas_lab_status_summaries (
      user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      summaries    TEXT NOT NULL,
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // FTS5 virtual table — separate exec (some SQLite builds require it)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS ideas_lab_ideas_fts USING fts5(
      title, notes,
      content=ideas_lab_ideas,
      content_rowid=id
    )
  `)

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS ideas_lab_ideas_ai AFTER INSERT ON ideas_lab_ideas BEGIN
      INSERT INTO ideas_lab_ideas_fts(rowid, title, notes)
      VALUES (new.id, new.title, new.notes);
    END;

    CREATE TRIGGER IF NOT EXISTS ideas_lab_ideas_ad AFTER DELETE ON ideas_lab_ideas BEGIN
      INSERT INTO ideas_lab_ideas_fts(ideas_lab_ideas_fts, rowid, title, notes)
      VALUES ('delete', old.id, old.title, old.notes);
    END;

    CREATE TRIGGER IF NOT EXISTS ideas_lab_ideas_au AFTER UPDATE ON ideas_lab_ideas BEGIN
      INSERT INTO ideas_lab_ideas_fts(ideas_lab_ideas_fts, rowid, title, notes)
      VALUES ('delete', old.id, old.title, old.notes);
      INSERT INTO ideas_lab_ideas_fts(rowid, title, notes)
      VALUES (new.id, new.title, new.notes);
    END;
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_il_ideas_user_status ON ideas_lab_ideas(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_il_ideas_user_due    ON ideas_lab_ideas(user_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_il_ideas_para_type   ON ideas_lab_ideas(user_id, para_type);
    CREATE INDEX IF NOT EXISTS idx_il_ideas_user_cat    ON ideas_lab_ideas(user_id, category_id);
    CREATE INDEX IF NOT EXISTS idx_il_sub_items_idea    ON ideas_lab_sub_items(idea_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_il_ms_idea           ON ideas_lab_project_milestones(idea_id, position);
    CREATE INDEX IF NOT EXISTS idx_il_nal_idea          ON ideas_lab_next_action_log(idea_id, completed_at);
    CREATE INDEX IF NOT EXISTS idx_il_nal_user          ON ideas_lab_next_action_log(user_id, completed_at);
    CREATE INDEX IF NOT EXISTS idx_il_chat_user_date    ON ideas_lab_chat_messages(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_il_ms_idea_done      ON ideas_lab_project_milestones(idea_id, done, position)
  `)
}
