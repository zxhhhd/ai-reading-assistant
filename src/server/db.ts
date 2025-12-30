import { eq, and, desc, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import {
  InsertUser,
  users,
  books,
  chunks,
  chunkAnalyses,
  bookReports,
  conversations,
  messages,
  Book,
  InsertBook,
  Chunk,
  InsertChunk,
  ChunkAnalysis,
  InsertChunkAnalysis,
  BookReport,
  InsertBookReport,
  Conversation,
  InsertConversation,
  Message,
  InsertMessage,
} from "../drizzle/schema.js";
import { ENV } from "./env.js";
import path from "path";
import fs from "fs";

// 确保数据目录存在
const dataDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.resolve(dataDir, "app.db");
const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

// 初始化数据库表
export function initDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openId TEXT NOT NULL UNIQUE,
      name TEXT,
      email TEXT UNIQUE,
      emailVerified INTEGER DEFAULT 0,
      loginMethod TEXT,
      role TEXT DEFAULT 'user' NOT NULL,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      lastSignedIn INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      title TEXT NOT NULL,
      author TEXT,
      fileUrl TEXT NOT NULL,
      fileKey TEXT NOT NULL,
      fileType TEXT NOT NULL,
      fileSize INTEGER NOT NULL,
      totalChunks INTEGER DEFAULT 0,
      processedChunks INTEGER DEFAULT 0,
      status TEXT DEFAULT 'uploading' NOT NULL,
      errorMessage TEXT,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookId INTEGER NOT NULL,
      chunkIndex INTEGER NOT NULL,
      content TEXT NOT NULL,
      startPosition INTEGER,
      endPosition INTEGER,
      pageNumber INTEGER,
      embedding TEXT,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS chunk_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chunkId INTEGER NOT NULL,
      bookId INTEGER NOT NULL,
      summary TEXT,
      keyEntities TEXT,
      coreArguments TEXT,
      sentiment TEXT,
      sentimentScore REAL,
      themes TEXT,
      quotes TEXT,
      rawAnalysis TEXT,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS book_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookId INTEGER NOT NULL,
      coreSummary TEXT,
      keyElements TEXT,
      styleAnalysis TEXT,
      valueAssessment TEXT,
      overallSentiment TEXT,
      wordCount INTEGER,
      readingTime INTEGER,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      bookId INTEGER NOT NULL,
      title TEXT,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversationId INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      citations TEXT,
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
  `);
  console.log("[Database] SQLite database initialized at:", dbPath);
}

// ==================== User Operations ====================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  try {
    const existing = await getUserByOpenId(user.openId);
    if (existing) {
      await db.update(users)
        .set({
          name: user.name ?? existing.name,
          email: user.email ?? existing.email,
          emailVerified: user.emailVerified ?? existing.emailVerified,
          loginMethod: user.loginMethod ?? existing.loginMethod,
          lastSignedIn: user.lastSignedIn ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.openId, user.openId));
    } else {
      await db.insert(users).values({
        openId: user.openId,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified ?? false,
        loginMethod: user.loginMethod,
        role: user.openId === ENV.ownerOpenId ? "admin" : "user",
        lastSignedIn: user.lastSignedIn ?? new Date(),
      });
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ==================== Book Operations ====================

export async function createBook(book: InsertBook): Promise<number> {
  const result = await db.insert(books).values(book).returning({ id: books.id });
  return result[0].id;
}

export async function getBookById(bookId: number): Promise<Book | undefined> {
  const result = await db.select().from(books).where(eq(books.id, bookId)).limit(1);
  return result[0];
}

export async function getBooksByUserId(userId: number): Promise<Book[]> {
  return await db.select().from(books).where(eq(books.userId, userId)).orderBy(desc(books.createdAt));
}

export async function updateBookStatus(
  bookId: number,
  status: Book["status"],
  updates?: Partial<Pick<Book, "totalChunks" | "processedChunks" | "errorMessage">>
): Promise<void> {
  await db
    .update(books)
    .set({ status, ...updates, updatedAt: new Date() })
    .where(eq(books.id, bookId));
}

export async function incrementProcessedChunks(bookId: number): Promise<void> {
  const book = await getBookById(bookId);
  if (book) {
    await db
      .update(books)
      .set({ processedChunks: (book.processedChunks || 0) + 1, updatedAt: new Date() })
      .where(eq(books.id, bookId));
  }
}

export async function deleteBook(bookId: number): Promise<void> {
  const convs = await db.select().from(conversations).where(eq(conversations.bookId, bookId));
  for (const conv of convs) {
    await db.delete(messages).where(eq(messages.conversationId, conv.id));
  }
  await db.delete(conversations).where(eq(conversations.bookId, bookId));
  await db.delete(bookReports).where(eq(bookReports.bookId, bookId));
  await db.delete(chunkAnalyses).where(eq(chunkAnalyses.bookId, bookId));
  await db.delete(chunks).where(eq(chunks.bookId, bookId));
  await db.delete(books).where(eq(books.id, bookId));
}

// ==================== Chunk Operations ====================

export async function createChunks(chunkList: InsertChunk[]): Promise<void> {
  const batchSize = 100;
  for (let i = 0; i < chunkList.length; i += batchSize) {
    const batch = chunkList.slice(i, i + batchSize);
    await db.insert(chunks).values(batch);
  }
}

export async function getChunksByBookId(bookId: number): Promise<Chunk[]> {
  return await db.select().from(chunks).where(eq(chunks.bookId, bookId)).orderBy(asc(chunks.chunkIndex));
}

export async function getChunkById(chunkId: number): Promise<Chunk | undefined> {
  const result = await db.select().from(chunks).where(eq(chunks.id, chunkId)).limit(1);
  return result[0];
}

export async function updateChunkEmbedding(chunkId: number, embedding: number[]): Promise<void> {
  await db.update(chunks).set({ embedding }).where(eq(chunks.id, chunkId));
}

// ==================== Chunk Analysis Operations ====================

export async function createChunkAnalysis(analysis: InsertChunkAnalysis): Promise<number> {
  const result = await db.insert(chunkAnalyses).values(analysis).returning({ id: chunkAnalyses.id });
  return result[0].id;
}

export async function getChunkAnalysesByBookId(bookId: number): Promise<ChunkAnalysis[]> {
  return await db.select().from(chunkAnalyses).where(eq(chunkAnalyses.bookId, bookId));
}

// ==================== Book Report Operations ====================

export async function createBookReport(report: InsertBookReport): Promise<number> {
  const result = await db.insert(bookReports).values(report).returning({ id: bookReports.id });
  return result[0].id;
}

export async function getBookReportByBookId(bookId: number): Promise<BookReport | undefined> {
  const result = await db.select().from(bookReports).where(eq(bookReports.bookId, bookId)).limit(1);
  return result[0];
}

export async function updateBookReport(bookId: number, updates: Partial<InsertBookReport>): Promise<void> {
  await db.update(bookReports).set({ ...updates, updatedAt: new Date() }).where(eq(bookReports.bookId, bookId));
}

// ==================== Conversation Operations ====================

export async function createConversation(conversation: InsertConversation): Promise<number> {
  const result = await db.insert(conversations).values(conversation).returning({ id: conversations.id });
  return result[0].id;
}

export async function getConversationsByBookId(userId: number, bookId: number): Promise<Conversation[]> {
  return await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.bookId, bookId)))
    .orderBy(desc(conversations.updatedAt));
}

export async function getConversationById(conversationId: number): Promise<Conversation | undefined> {
  const result = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  return result[0];
}

export async function updateConversationTitle(conversationId: number, title: string): Promise<void> {
  await db.update(conversations).set({ title, updatedAt: new Date() }).where(eq(conversations.id, conversationId));
}

// ==================== Message Operations ====================

export async function createMessage(message: InsertMessage): Promise<number> {
  const result = await db.insert(messages).values(message).returning({ id: messages.id });
  
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, message.conversationId));

  return result[0].id;
}

export async function getMessagesByConversationId(conversationId: number): Promise<Message[]> {
  return await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}

// ==================== Vector Search ====================

export async function searchSimilarChunks(
  bookId: number,
  queryEmbedding: number[],
  limit: number = 5
): Promise<Chunk[]> {
  const allChunks = await db
    .select()
    .from(chunks)
    .where(eq(chunks.bookId, bookId));

  const chunksWithSimilarity = allChunks
    .filter((chunk) => chunk.embedding && chunk.embedding.length > 0)
    .map((chunk) => ({
      chunk,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding as number[]),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return chunksWithSimilarity.map((item) => item.chunk);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
