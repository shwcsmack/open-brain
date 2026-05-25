import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { prisma } from '@/lib/prisma'
import { syncNoteToFts } from '@/lib/search'
import {
  addNoteToQueue,
  addUrlToQueue,
  addWikipediaToQueue,
  archiveItem,
  bulkArchive,
  bulkDelete,
  deleteItem,
  extractPassage,
  fetchWikipediaForReading,
  getImportedWikipediaUrls,
  getItemById,
  hidePassage,
  listAllItems,
  listArchivedItems,
  listDueItems,
  previewUrlFromFetch,
  resolveWikipediaFetchTarget,
  restorePassage,
  reviewReadingItem,
  terminateAsNote,
  unarchiveItem,
} from '@/lib/readingQueue'

const wikipediaArticleInput = z.object({
  title: z.string().min(1),
  content: z.string(),
  articleUrl: z.string().url(),
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
const sourceTypeSchema = z.enum(['NOTE', 'URL', 'WIKIPEDIA', 'EXTRACT'])
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
    .input(wikipediaArticleInput)
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

  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => archiveItem(prisma, input.id)),

  unarchive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => unarchiveItem(prisma, input.id)),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => deleteItem(prisma, input.id)),

  bulkArchive: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(({ input }) => bulkArchive(prisma, input.ids)),

  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(({ input }) => bulkDelete(prisma, input.ids)),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const item = await getItemById(prisma, input.id)
      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Reading item not found' })
      }
      return item
    }),

  listArchived: protectedProcedure
    .input(z.object({ sourceType: sourceTypeSchema.optional() }).optional())
    .query(({ input }) => listArchivedItems(prisma, input)),

  getImportedWikipediaUrls: protectedProcedure.query(() =>
    getImportedWikipediaUrls(prisma)
  ),

  hidePassage: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        start: z.number().int().nonnegative(),
        end: z.number().int().positive(),
      })
    )
    .mutation(({ input }) => hidePassage(prisma, input.id, input.start, input.end)),

  restorePassage: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        start: z.number().int().nonnegative(),
        end: z.number().int().positive(),
      })
    )
    .mutation(({ input }) =>
      restorePassage(prisma, input.id, input.start, input.end)
    ),
})
