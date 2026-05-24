-- CreateTable
CREATE TABLE "ReadingItem" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReadingItem_sourceNoteId_fkey" FOREIGN KEY ("sourceNoteId") REFERENCES "Note" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReadingItem_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "ReadingItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Flashcard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT,
    "clozeIndex" INTEGER,
    "noteId" TEXT,
    "stability" REAL NOT NULL DEFAULT 0,
    "difficulty" REAL NOT NULL DEFAULT 0,
    "due" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'NEW',
    "lastReview" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceReadingItemId" TEXT,
    CONSTRAINT "Flashcard_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Flashcard_sourceReadingItemId_fkey" FOREIGN KEY ("sourceReadingItemId") REFERENCES "ReadingItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Flashcard" ("back", "clozeIndex", "createdAt", "deletedAt", "difficulty", "due", "front", "id", "lapses", "lastReview", "noteId", "reps", "stability", "state", "type") SELECT "back", "clozeIndex", "createdAt", "deletedAt", "difficulty", "due", "front", "id", "lapses", "lastReview", "noteId", "reps", "stability", "state", "type" FROM "Flashcard";
DROP TABLE "Flashcard";
ALTER TABLE "new_Flashcard" RENAME TO "Flashcard";
CREATE TABLE "new_Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "periodType" TEXT,
    "periodKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sourceReadingItemId" TEXT,
    CONSTRAINT "Note_sourceReadingItemId_fkey" FOREIGN KEY ("sourceReadingItemId") REFERENCES "ReadingItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Note" ("body", "createdAt", "id", "periodKey", "periodType", "slug", "tags", "title", "updatedAt") SELECT "body", "createdAt", "id", "periodKey", "periodType", "slug", "tags", "title", "updatedAt" FROM "Note";
DROP TABLE "Note";
ALTER TABLE "new_Note" RENAME TO "Note";
CREATE UNIQUE INDEX "Note_slug_key" ON "Note"("slug");
CREATE UNIQUE INDEX "Note_periodType_periodKey_key" ON "Note"("periodType", "periodKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
