import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { syncNoteToFts } from '@/lib/search'
import {
  addNoteToQueue,
  addUrlToQueue,
  addWikipediaToQueue,
  extractPassage,
  fetchWikipediaForReading,
  listAllItems,
  listDueItems,
  previewUrlFromFetch,
  resolveWikipediaFetchTarget,
  reviewReadingItem,
  terminateAsNote,
} from '@/lib/readingQueue'

const wikipediaSectionInput = z.object({
  title: z.string().min(1),
  content: z.string(),
  articleUrl: z.string().url(),
  sectionTitle: z.string().min(1),
})

/** Wikipedia URL or article title; `url` is canonical, `input` is legacy. */
const wikipediaFetchInput = z
  .object({
    url: z.string().min(1).optional(),
    input: z.string().min(1).optional(),
  })
  .refine(v => Boolean(v.url ?? v.input), {
    message: 'Provide url (Wikipedia article URL or title)',
  })

const ratingSchema = z.enum(['Again', 'Hard', 'Good', 'Easy'])
const sourceTypeSchema = z.enum(['NOTE', 'URL', 'WIKIPEDIA_SECTION', 'EXTRACT'])
const fsrsStateSchema = z.enum(['NEW', 'LEARNING', 'REVIEW', 'RELEARNING'])

export const readingRouter = router({
  listDue: protectedProcedure.query(() => listDueItems(prisma)),

  listAll: protectedProcedure
    .input(
      z
        .object({
          sourceType: sourceTypeSchema.optional(),
          state: fsrsStateSchema.optional(),
          sourceNoteId: z.string().optional(),
          parentItemId: z.string().optional(),
        })
        .optional()
    )
    .query(({ input }) => listAllItems(prisma, input)),

  addNote: protectedProcedure
    .input(z.object({ noteId: z.string() }))
    .mutation(({ input }) => addNoteToQueue(prisma, input.noteId)),

  fetchWikipedia: protectedProcedure
    .input(wikipediaFetchInput)
    .query(({ input }) => fetchWikipediaForReading(resolveWikipediaFetchTarget(input))),

  addWikipedia: protectedProcedure
    .input(z.array(wikipediaSectionInput).min(1))
    .mutation(({ input }) => addWikipediaToQueue(prisma, input)),

  previewUrl: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .query(({ input }) => previewUrlFromFetch(input.url)),

  addUrl: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
        title: z.string().optional(),
        content: z.string().optional(),
      })
    )
    .mutation(({ input }) => addUrlToQueue(prisma, input)),

  review: protectedProcedure
    .input(z.object({ readingItemId: z.string(), rating: ratingSchema }))
    .mutation(({ input }) => reviewReadingItem(prisma, input.readingItemId, input.rating)),

  extract: protectedProcedure
    .input(z.object({ parentItemId: z.string(), selectedText: z.string().min(1) }))
    .mutation(({ input }) => extractPassage(prisma, input.parentItemId, input.selectedText)),

  terminateNote: protectedProcedure
    .input(
      z.object({
        readingItemId: z.string(),
        title: z.string().optional(),
        body: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const note = await terminateAsNote(
        prisma,
        input.readingItemId,
        input.title,
        input.body
      )
      void syncNoteToFts(note.id, note.title, note.body ?? '')
      return note
    }),
})
