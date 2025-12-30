import {
  getBookById,
  getChunksByBookId,
  updateBookStatus,
  incrementProcessedChunks,
  createChunkAnalysis,
  getChunkAnalysesByBookId,
  createBookReport,
  updateChunkEmbedding,
} from "./db.js";
import { analyzeChunk, generateBookReport, getEmbedding } from "./volcengine.js";

export async function analyzeBookChunks(bookId: number): Promise<void> {
  const book = await getBookById(bookId);
  if (!book) throw new Error("书籍不存在");

  const chunks = await getChunksByBookId(bookId);
  if (chunks.length === 0) throw new Error("书籍没有分片");

  console.log(`[Analysis] Starting analysis for book ${bookId}, ${chunks.length} chunks`);
  await updateBookStatus(bookId, "analyzing");

  for (const chunk of chunks) {
    try {
      const analysis = await analyzeChunk(chunk.content);
      await createChunkAnalysis({
        chunkId: chunk.id,
        bookId: bookId,
        summary: analysis.summary,
        keyEntities: analysis.keyEntities,
        coreArguments: analysis.coreArguments,
        sentiment: analysis.sentiment,
        themes: analysis.themes,
        quotes: analysis.quotes,
        rawAnalysis: JSON.stringify(analysis),
      });

      const embedding = await getEmbedding(chunk.content);
      if (embedding.length > 0) {
        await updateChunkEmbedding(chunk.id, embedding);
      }

      await incrementProcessedChunks(bookId);
      console.log(`[Analysis] Chunk ${chunk.chunkIndex + 1}/${chunks.length} completed`);
    } catch (error) {
      console.error(`[Analysis] Failed to analyze chunk ${chunk.id}:`, error);
    }
  }
}

export async function generateFullBookReport(bookId: number): Promise<void> {
  const book = await getBookById(bookId);
  if (!book) throw new Error("书籍不存在");

  const chunkAnalyses = await getChunkAnalysesByBookId(bookId);
  if (chunkAnalyses.length === 0) throw new Error("没有分片分析结果");

  console.log(`[Report] Generating report for book ${bookId}`);
  await updateBookStatus(bookId, "generating_report");

  try {
    const analysesData = chunkAnalyses.map((a) => ({
      summary: a.summary || "",
      keyEntities: a.keyEntities || [],
      coreArguments: a.coreArguments || [],
      themes: a.themes || [],
      quotes: a.quotes || [],
    }));

    const report = await generateBookReport(book.title, analysesData);

    await createBookReport({
      bookId: bookId,
      coreSummary: report.coreSummary,
      keyElements: report.keyElements,
      styleAnalysis: report.styleAnalysis,
      valueAssessment: report.valueAssessment,
    });

    await updateBookStatus(bookId, "completed");
    console.log(`[Report] Report generated for book ${bookId}`);
  } catch (error) {
    console.error(`[Report] Failed:`, error);
    await updateBookStatus(bookId, "error", { errorMessage: String(error) });
    throw error;
  }
}

export async function processBookAnalysis(bookId: number): Promise<void> {
  try {
    await analyzeBookChunks(bookId);
    await generateFullBookReport(bookId);
  } catch (error) {
    console.error(`[ProcessBook] Failed:`, error);
    await updateBookStatus(bookId, "error", { errorMessage: String(error) });
  }
}
