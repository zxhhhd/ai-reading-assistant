import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import multer from "multer";
import jwt from "jsonwebtoken";
import { ENV } from "./env.js";
import { initDatabase, upsertUser, getUserByEmail, getUserById, createBook, getBookById, getBooksByUserId, deleteBook, createChunks, getBookReportByBookId, createConversation, getConversationsByBookId, getConversationById, createMessage, getMessagesByConversationId, searchSimilarChunks } from "./db.js";
import { sendVerificationEmail, generateVerificationCode, storeVerificationCode, verifyCode } from "./emailService.js";
import { storagePut } from "./storage.js";
import { processFile } from "./fileProcessor.js";
import { processBookAnalysis } from "./analysisService.js";
import { ragAnswer, getEmbedding } from "./volcengine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(process.cwd(), "data", "uploads")));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function authMiddleware(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "未授权" });
  try {
    const decoded = jwt.verify(token, ENV.jwtSecret) as { userId: number };
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: "无效的token" });
  }
}

app.post("/api/auth/send-code", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "邮箱不能为空" });
    const code = generateVerificationCode();
    storeVerificationCode(email, code);
    const success = await sendVerificationEmail(email, code);
    if (success) res.json({ success: true, message: "验证码已发送" });
    else res.status(500).json({ error: "发送验证码失败" });
  } catch (error) {
    res.status(500).json({ error: "服务器错误" });
  }
});

app.post("/api/auth/verify-code", async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: "邮箱和验证码不能为空" });
    if (!verifyCode(email, code)) return res.status(400).json({ error: "验证码错误或已过期" });

    let user = await getUserByEmail(email);
    if (!user) {
      await upsertUser({ openId: `email_${nanoid()}`, email, emailVerified: true, loginMethod: "email" });
      user = await getUserByEmail(email);
    }
    if (!user) return res.status(500).json({ error: "创建用户失败" });

    const token = jwt.sign({ userId: user.id }, ENV.jwtSecret, { expiresIn: "7d" });
    res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    res.status(500).json({ error: "服务器错误" });
  }
});

app.get("/api/auth/me", authMiddleware, async (req: any, res) => {
  try {
    const user = await getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "用户不存在" });
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch { res.status(500).json({ error: "服务器错误" }); }
});

app.post("/api/books/upload", authMiddleware, upload.single("file"), async (req: any, res) => {
  try {
    const file = req.file;
    const { title, author } = req.body;
    if (!file) return res.status(400).json({ error: "请上传文件" });

    const fileKey = `${req.userId}/${nanoid()}_${file.originalname}`;
    const fileType = file.originalname.split(".").pop() || "txt";
    await storagePut(fileKey, file.buffer, file.mimetype);

    const bookId = await createBook({
      userId: req.userId,
      title: title || file.originalname,
      author: author || "未知",
      fileUrl: `/uploads/${fileKey}`,
      fileKey,
      fileType,
      fileSize: file.size,
      status: "processing",
    });

    (async () => {
      try {
        const { chunks } = await processFile(fileKey, fileType);
        await createChunks(chunks.map((c) => ({ ...c, bookId })));
        await processBookAnalysis(bookId);
      } catch (error) { console.error("[Upload] Process error:", error); }
    })();

    res.json({ success: true, bookId });
  } catch (error) { res.status(500).json({ error: "上传失败" }); }
});

app.get("/api/books", authMiddleware, async (req: any, res) => {
  try {
    const books = await getBooksByUserId(req.userId);
    res.json({ books });
  } catch { res.status(500).json({ error: "获取书籍列表失败" }); }
});

app.get("/api/books/:id", authMiddleware, async (req: any, res) => {
  try {
    const book = await getBookById(parseInt(req.params.id));
    if (!book) return res.status(404).json({ error: "书籍不存在" });
    if (book.userId !== req.userId) return res.status(403).json({ error: "无权访问" });
    const report = await getBookReportByBookId(book.id);
    res.json({ book, report });
  } catch { res.status(500).json({ error: "获取书籍详情失败" }); }
});

app.delete("/api/books/:id", authMiddleware, async (req: any, res) => {
  try {
    const book = await getBookById(parseInt(req.params.id));
    if (!book) return res.status(404).json({ error: "书籍不存在" });
    if (book.userId !== req.userId) return res.status(403).json({ error: "无权操作" });
    await deleteBook(book.id);
    res.json({ success: true });
  } catch { res.status(500).json({ error: "删除失败" }); }
});

app.post("/api/conversations", authMiddleware, async (req: any, res) => {
  try {
    const { bookId, title } = req.body;
    const book = await getBookById(bookId);
    if (!book || book.userId !== req.userId) return res.status(404).json({ error: "书籍不存在" });
    const conversationId = await createConversation({ userId: req.userId, bookId, title: title || "新对话" });
    res.json({ success: true, conversationId });
  } catch { res.status(500).json({ error: "创建对话失败" }); }
});

app.get("/api/books/:bookId/conversations", authMiddleware, async (req: any, res) => {
  try {
    const conversations = await getConversationsByBookId(req.userId, parseInt(req.params.bookId));
    res.json({ conversations });
  } catch { res.status(500).json({ error: "获取对话列表失败" }); }
});

app.post("/api/conversations/:id/messages", authMiddleware, async (req: any, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const { content } = req.body;
    const conversation = await getConversationById(conversationId);
    if (!conversation || conversation.userId !== req.userId) return res.status(404).json({ error: "对话不存在" });

    await createMessage({ conversationId, role: "user", content });
    const messages = await getMessagesByConversationId(conversationId);
    const history = messages.slice(-10).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const queryEmbedding = await getEmbedding(content);
    const relevantChunks = await searchSimilarChunks(conversation.bookId, queryEmbedding, 5);
    const context = relevantChunks.map((c) => c.content).join("\n\n---\n\n");
    const answer = await ragAnswer(content, context, history);
    await createMessage({ conversationId, role: "assistant", content: answer });

    res.json({ success: true, answer });
  } catch (error) { console.error("[Chat] Error:", error); res.status(500).json({ error: "发送消息失败" }); }
});

app.get("/api/conversations/:id/messages", authMiddleware, async (req: any, res) => {
  try {
    const conversationId = parseInt(req.params.id);
    const conversation = await getConversationById(conversationId);
    if (!conversation || conversation.userId !== req.userId) return res.status(404).json({ error: "对话不存在" });
    const messages = await getMessagesByConversationId(conversationId);
    res.json({ messages });
  } catch { res.status(500).json({ error: "获取消息失败" }); }
});

app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

const PORT = ENV.port;
initDatabase();
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Server] AI读书助手服务器运行在 http://0.0.0.0:${PORT}`);
});
