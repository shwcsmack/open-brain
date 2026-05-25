-- Hard-delete legacy per-section Wikipedia rows before schema changes
DELETE FROM "ReadingItem" WHERE "sourceType" = 'WIKIPEDIA_SECTION';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReadingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT NOT NULL,
    "url" TEXT,
    "articleUrl" TEXT,
    "sectionTitle" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "extractedText" TEXT,
    "sourceNoteId" TEXT,
    "parentItemId" TEXT,
    "stability" REAL NOT NULL DEFAULT 0,
    "difficulty" REAL NOT NULL DEFAULT 0,
    "due" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'NEW',
    "lastReview" DATETIME,
    "deletedAt" DATETIME,
    "archivedAt" DATETIME,
    "hiddenPassages" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReadingItem_sourceNoteId_fkey" FOREIGN KEY ("sourceNoteId") REFERENCES "Note" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReadingItem_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "ReadingItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ReadingItem" ("articleUrl", "content", "createdAt", "deletedAt", "difficulty", "due", "extractedText", "id", "lapses", "lastReview", "parentItemId", "priority", "reps", "sectionTitle", "sourceNoteId", "sourceType", "stability", "state", "title", "updatedAt", "url") SELECT "articleUrl", "content", "createdAt", "deletedAt", "difficulty", "due", "extractedText", "id", "lapses", "lastReview", "parentItemId", "priority", "reps", "sectionTitle", "sourceNoteId", "sourceType", "stability", "state", "title", "updatedAt", "url" FROM "ReadingItem";
DROP TABLE "ReadingItem";
ALTER TABLE "new_ReadingItem" RENAME TO "ReadingItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
