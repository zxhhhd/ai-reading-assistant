import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { storageGet } from "./storage.js";

const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;

export async function extractTextFromFile(
  fileKey: string,
  fileType: string
): Promise<string> {
  const fileBuffer = await storageGet(fileKey);
  
  if (!fileBuffer) {
    throw new Error("文件不存在");
  }

  let text = "";

  switch (fileType.toLowerCase()) {
    case "pdf":
    case "application/pdf":
      const pdfData = await pdfParse(fileBuffer);
      text = pdfData.text;
      break;

    case "docx":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      const docxResult = await mammoth.extractRawText({ buffer: fileBuffer });
      text = docxResult.value;
      break;

    case "txt":
    case "text/plain":
      text = fileBuffer.toString("utf-8");
      break;

    default:
      throw new Error(`不支持的文件类型: ${fileType}`);
  }

  return text.trim();
}

export function splitTextIntoChunks(text: string): Array<{
  content: string;
  startPosition: number;
  endPosition: number;
}> {
  const chunks: Array<{
    content: string;
    startPosition: number;
    endPosition: number;
  }> = [];

  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = "";
  let currentStart = 0;
  let position = 0;

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) {
      position += paragraph.length + 2;
      continue;
    }

    if (currentChunk.length + trimmedParagraph.length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        startPosition: currentStart,
        endPosition: position - 1,
      });

      const overlapStart = Math.max(0, currentChunk.length - CHUNK_OVERLAP);
      currentChunk = currentChunk.slice(overlapStart);
      currentStart = position - (currentChunk.length);
    }

    currentChunk += (currentChunk ? "\n\n" : "") + trimmedParagraph;
    position += paragraph.length + 2;
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      startPosition: currentStart,
      endPosition: text.length - 1,
    });
  }

  return chunks;
}

export async function processFile(
  fileKey: string,
  fileType: string
): Promise<{
  text: string;
  chunks: Array<{
    content: string;
    startPosition: number;
    endPosition: number;
    chunkIndex: number;
  }>;
}> {
  const text = await extractTextFromFile(fileKey, fileType);
  const rawChunks = splitTextIntoChunks(text);
  const chunks = rawChunks.map((chunk, index) => ({
    ...chunk,
    chunkIndex: index,
  }));

  return { text, chunks };
}
