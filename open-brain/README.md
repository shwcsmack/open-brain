# Open Brain

Open Brain is a self-hostable, browser-based personal knowledge management (PKM) tool. It combines rich-text notes with wikilinks, a knowledge graph, spaced-repetition flashcards (FSRS), task tracking, and periodic notes (daily/weekly/monthly) — all stored locally in SQLite with no external services required.

---

## Quickstart with Docker Compose

```bash
# 1. Clone the repo
git clone https://github.com/your-org/open-brain.git
cd open-brain

# 2. Create a .env file
cat > .env <<'EOF'
SESSION_SECRET=change-me-to-a-random-32-char-string
INITIAL_PASSWORD=yourpassword
PORT=3000
EOF

# 3. Start the app
docker compose up -d

# 4. Open http://localhost:3000
# Log in with the password you set in INITIAL_PASSWORD
```

Data is persisted in a named Docker volume (`db_data`). To back up:

```bash
docker run --rm -v open-brain_db_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/open-brain-backup.tar.gz /data
```

To restore:

```bash
docker run --rm -v open-brain_db_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/open-brain-backup.tar.gz -C /
```

---

## Environment Variables

| Variable           | Required | Default        | Description                                                  |
|--------------------|----------|----------------|--------------------------------------------------------------|
| `SESSION_SECRET`   | Yes      | —              | Secret for signing iron-session cookies. Min 32 characters.  |
| `INITIAL_PASSWORD` | No       | —              | Password for the single user, created on first boot.         |
| `DATABASE_URL`     | No       | `file:./dev.db`| SQLite file path (`file:/data/open-brain.db`) or Postgres URL. |
| `PORT`             | No       | `3000`         | Port the container listens on.                               |

> **Security**: Change `SESSION_SECRET` before deploying. Never reuse the default value.

---

## Development Setup

### Prerequisites

- Node.js 20+
- npm 10+

### Steps

```bash
# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev

# (Optional) Seed sample data
npm run seed
# or: npx prisma db seed

# Start the dev server
npm run dev
# Open http://localhost:3000
```

### Running Tests

```bash
npm test
# Run only integration tests
npx jest tests/
```

### Project Structure

```
app/           Next.js App Router pages
components/    React components (editor, flashcard, ui, …)
lib/           Utilities: prisma client, search, FSRS, session
server/        tRPC routers
prisma/        Schema, migrations, seed script
tests/         Integration tests
```

---

## Docker Compose Smoke Test (13.8)

To verify persistence after a container restart:

```bash
# 1. Start the stack
docker compose up -d

# 2. Open http://localhost:3000 and:
#    - Create a note titled "Smoke Test"
#    - Add a flashcard: front "What is 2+2?", back "4"

# 3. Restart the container
docker compose restart

# 4. Reopen http://localhost:3000 — confirm:
#    - "Smoke Test" note still exists
#    - Flashcard is still present in the deck
```

If both objects persist, the volume mount is working correctly.

---

## Postgres Upgrade Path

Open Brain defaults to SQLite for zero-config self-hosting. To switch to Postgres:

1. **Set `DATABASE_URL`** to a Postgres connection string:
   ```
   DATABASE_URL=postgresql://user:password@host:5432/openbrain
   ```

2. **Re-run migrations**:
   ```bash
   npx prisma migrate deploy
   ```
   The schema uses standard types; all migrations are compatible with Postgres.

3. **Full-text search** is automatically enabled via `tsvector` when Postgres is detected (see `lib/search.ts`). The SQLite FTS5 path is skipped.

4. **Drop the SQLite volume** if migrating an existing installation — data must be exported manually (e.g. via JSON export or `pg_dump` equivalent).

---

## Periodic Note Templates

Open Brain supports five period types: **Day**, **Week**, **Month**, **Quarter**, and **Year**.

### Accessing Periodic Notes

- Navigate to **Settings > Periodic Templates** to edit the default content for each period type.
- Use wikilinks in any note to jump directly to a periodic note:
  - `[[daily/2025-05-20]]` — opens today's daily note
  - `[[weekly/2025-W21]]` — opens week 21's note
  - `[[monthly/2025-05]]` — opens May 2025
  - `[[quarterly/2025-Q2]]` — opens Q2 2025
  - `[[yearly/2025]]` — opens the 2025 yearly note
- Click the **calendar** in the sidebar to navigate to any date's daily note directly.

### Template Format

Templates use the same Tiptap JSON format as regular notes. Edit them in the Settings page UI. A typical daily template:

```json
{
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Daily Note" }] },
    { "type": "paragraph", "content": [{ "type": "text", "text": "Morning intentions:" }] },
    { "type": "paragraph", "content": [{ "type": "text", "text": "Evening reflection:" }] }
  ]
}
```

New periodic notes are created from the template the first time they are accessed. Existing notes are never overwritten.
