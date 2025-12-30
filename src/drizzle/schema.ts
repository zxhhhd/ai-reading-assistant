import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).default(false),
  loginMethod: text("loginMethod"),
  role: text("role").notNull().default("user"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const books = sqliteTable("books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  title: text("title").notNull(),
  author: text("author"),
  fileUrl: text("fileUrl").notNull(),
  fileKey: text("fileKey").notNull(),
  fileType: text("fileType").notNull(),
  fileSize: integer("fileSize").notNull(),
  totalChunks: integer("totalChunks").default(0),
  processedChunks: integer("processedChunks").default(0),
  status: text("status").notNull().default("uploading"),
  errorMessage: text("errorMessage"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const chunks = sqliteTable("chunks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("bookId").notNull(),
  chunkIndex: integer("chunkIndex").notNull(),
  content: text("content").notNull(),
  startPosition: integer("startPosition"),
  endPosition: integer("endPosition"),
  pageNumber: integer("pageNumber"),
  embedding: text("embedding", { mode: "json" }).$type<number[]>(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const chunkAnalyses = sqliteTable("chunk_analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chunkId: integer("chunkId").notNull(),
  bookId: integer("bookId").notNull(),
  summary: text("summary"),
  keyEntities: text("keyEntities", { mode: "json" }).$type<string[]>(),
  coreArguments: text("coreArguments", { mode: "json" }).$type<string[]>(),
  sentiment: text("sentiment"),
  sentimentScore: real("sentimentScore"),
  themes: text("themes", { mode: "json" }).$type<string[]>(),
  quotes: text("quotes", { mode: "json" }).$type<string[]>(),
  rawAnalysis: text("rawAnalysis"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const bookReports = sqliteTable("book_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("bookId").notNull(),
  coreSummary: text("coreSummary"),
  keyElements: text("keyElements", { mode: "json" }),
  styleAnalysis: text("styleAnalysis", { mode: "json" }),
  valueAssessment: text("valueAssessment", { mode: "json" }),
  overallSentiment: text("overallSentiment"),
  wordCount: integer("wordCount"),
  readingTime: integer("readingTime"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  bookId: integer("bookId").notNull(),
  title: text("title"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversationId").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  citations: text("citations", { mode: "json" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Book = typeof books.$inferSelect;
export type InsertBook = typeof books.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type InsertChunk = typeof chunks.$inferInsert;
export type ChunkAnalysis = typeof chunkAnalyses.$inferSelect;
export type InsertChunkAnalysis = typeof chunkAnalyses.$inferInsert;
export type BookReport = typeof bookReports.$inferSelect;
export type InsertBookReport = typeof bookReports.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
