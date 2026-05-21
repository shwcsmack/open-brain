import { PrismaClient } from '@/lib/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? 'file:./dev.db'
  const dbPath = databaseUrl.replace(/^file:/, '')
  const db = new Database(dbPath)
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = new PrismaClient({ adapter } as any)
  try {

  // 1. User
  const hash = await bcrypt.hash('password123', 12)
  const user = await prisma.user.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: { id: '00000000-0000-0000-0000-000000000001', passwordHash: hash },
  })
  console.log('Created user:', user.id)

  // 2. Sample notes
  const note1 = await prisma.note.upsert({
    where: { slug: 'getting-started' },
    update: {},
    create: {
      title: 'Getting Started',
      slug: 'getting-started',
      body: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Welcome to open-brain! This is your knowledge base.' },
            ],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Check out ' },
              { type: 'wikilink', attrs: { title: 'My Projects', noteId: null, resolved: false } },
              { type: 'text', text: ' to organise your work.' },
            ],
          },
        ],
      }),
      tags: '["welcome","guide"]',
    },
  })

  const note2 = await prisma.note.upsert({
    where: { slug: 'my-projects' },
    update: {},
    create: {
      title: 'My Projects',
      slug: 'my-projects',
      body: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Here are my active projects. Back to ' },
              { type: 'wikilink', attrs: { title: 'Getting Started', noteId: null, resolved: false } },
              { type: 'text', text: '.' },
            ],
          },
        ],
      }),
      tags: '["projects"]',
    },
  })

  const note3 = await prisma.note.upsert({
    where: { slug: 'study-notes' },
    update: {},
    create: {
      title: 'Study Notes',
      slug: 'study-notes',
      body: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'The capital of France is ' },
              { type: 'cloze', attrs: { index: 1, answer: 'Paris' } },
              { type: 'text', text: '.' },
            ],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Water boils at ' },
              { type: 'cloze', attrs: { index: 1, answer: '100°C' } },
              { type: 'text', text: ' at sea level.' },
            ],
          },
        ],
      }),
      tags: '["study","flashcards"]',
    },
  })

  console.log('Created notes:', note1.id, note2.id, note3.id)

  // 3. NoteLinks
  await prisma.noteLink.upsert({
    where: { sourceNoteId_targetNoteId: { sourceNoteId: note1.id, targetNoteId: note2.id } },
    update: {},
    create: { sourceNoteId: note1.id, targetNoteId: note2.id },
  })
  await prisma.noteLink.upsert({
    where: { sourceNoteId_targetNoteId: { sourceNoteId: note2.id, targetNoteId: note1.id } },
    update: {},
    create: { sourceNoteId: note2.id, targetNoteId: note1.id },
  })
  console.log('Created notelinks')

  // 4. Tasks
  const task1 = await prisma.task.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      title: 'Set up open-brain',
      status: 'DONE',
      priority: 'HIGH',
      noteId: note1.id,
    },
  })
  const task2 = await prisma.task.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      title: 'Write first notes',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
    },
  })
  const task3 = await prisma.task.upsert({
    where: { id: '00000000-0000-0000-0000-000000000012' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000012',
      title: 'Review flashcards daily',
      status: 'TODO',
      priority: 'MEDIUM',
    },
  })
  console.log('Created tasks:', task1.id, task2.id, task3.id)

  // 5. Deck
  const deck = await prisma.deck.upsert({
    where: { id: '00000000-0000-0000-0000-000000000020' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000020',
      name: 'Default Deck',
    },
  })
  console.log('Created deck:', deck.id)

  // 6. Flashcards
  const card1 = await prisma.flashcard.upsert({
    where: { id: '00000000-0000-0000-0000-000000000030' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000030',
      type: 'BASIC',
      front: 'What is spaced repetition?',
      back: 'A learning technique that spaces out review sessions to improve long-term retention.',
      noteId: note3.id,
    },
  })
  const card2 = await prisma.flashcard.upsert({
    where: { id: '00000000-0000-0000-0000-000000000031' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000031',
      type: 'CLOZE',
      front: 'The capital of France is [...].',
      back: 'Paris',
      clozeIndex: 1,
      noteId: note3.id,
    },
  })

  // Add cards to deck
  await prisma.deckCard.upsert({
    where: { deckId_cardId: { deckId: deck.id, cardId: card1.id } },
    update: {},
    create: { deckId: deck.id, cardId: card1.id },
  })
  await prisma.deckCard.upsert({
    where: { deckId_cardId: { deckId: deck.id, cardId: card2.id } },
    update: {},
    create: { deckId: deck.id, cardId: card2.id },
  })
  console.log('Created flashcards:', card1.id, card2.id)

  // 7. Periodic note (today's daily note)
  const today = new Date().toISOString().slice(0, 10)
  const periodicNote = await prisma.note.upsert({
    where: { periodType_periodKey: { periodType: 'DAY', periodKey: today } },
    update: {},
    create: {
      title: `Daily Note — ${today}`,
      slug: `daily-${today}`,
      body: JSON.stringify({
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: `Daily Note — ${today}` }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Morning intentions:' }] },
          { type: 'bulletList', content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
          ]},
        ],
      }),
      tags: '["daily"]',
      periodType: 'DAY',
      periodKey: today,
    },
  })
  console.log('Created daily note:', periodicNote.id)

  console.log('\nSeed complete!')
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0))
