import axios from "axios";
import { ENV } from "./env.js";

const VOLCENGINE_API_URL = "https://ark.cn-beijing.volces.com/api/v3";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 调用火山引擎豆包大模型进行对话
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  try {
    const response = await axios.post(
      `${VOLCENGINE_API_URL}/chat/completions`,
      {
        model: ENV.volcengineEndpointId,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 4096,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV.volcengineApiKey}`,
        },
        timeout: 60000,
      }
    );

    return response.data.choices[0]?.message?.content || "";
  } catch (error: any) {
    console.error("[Volcengine] Chat completion error:", error.response?.data || error.message);
    throw new Error(`AI对话失败: ${error.message}`);
  }
}

/**
 * 调用火山引擎获取文本嵌入向量
 */
export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await axios.post(
      `${VOLCENGINE_API_URL}/embeddings`,
      {
        model: "doubao-embedding",
        input: [text],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV.volcengineApiKey}`,
        },
        timeout: 30000,
      }
    );

    return response.data.data[0]?.embedding || [];
  } catch (error: any) {
    console.error("[Volcengine] Embedding error:", error.response?.data || error.message);
    return [];
  }
}

/**
 * 分析文本块（Map阶段）
 */
export async function analyzeChunk(content: string): Promise<{
  summary: string;
  keyEntities: string[];
  coreArguments: string[];
  sentiment: string;
  themes: string[];
  quotes: string[];
}> {
  const systemPrompt = `你是一个专业的文本分析助手。请分析给定的文本块，提取以下信息：
1. 摘要：用2-3句话概括主要内容
2. 关键实体：提取重要的人名、地名、组织名等（最多5个）
3. 核心论点：提取主要观点或论述（最多3个）
4. 情感倾向：positive/negative/neutral
5. 主题：提取文本涉及的主题（最多3个）
6. 重要引用：提取值得记住的句子（最多2个）

请以JSON格式返回，格式如下：
{
  "summary": "摘要内容",
  "keyEntities": ["实体1", "实体2"],
  "coreArguments": ["论点1", "论点2"],
  "sentiment": "positive/negative/neutral",
  "themes": ["主题1", "主题2"],
  "quotes": ["引用1", "引用2"]
}`;

  try {
    const response = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: `请分析以下文本：\n\n${content}` },
    ], { temperature: 0.3 });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {
      summary: response.slice(0, 200),
      keyEntities: [],
      coreArguments: [],
      sentiment: "neutral",
      themes: [],
      quotes: [],
    };
  } catch (error) {
    console.error("[Volcengine] Analyze chunk error:", error);
    return {
      summary: "分析失败",
      keyEntities: [],
      coreArguments: [],
      sentiment: "neutral",
      themes: [],
      quotes: [],
    };
  }
}

/**
 * 生成全书报告（Reduce阶段）
 */
export async function generateBookReport(
  bookTitle: string,
  chunkAnalyses: Array<{
    summary: string;
    keyEntities: string[];
    coreArguments: string[];
    themes: string[];
    quotes: string[];
  }>
): Promise<any> {
  const systemPrompt = `你是一个专业的书籍分析专家。根据提供的各章节分析结果，生成一份完整的书籍分析报告。

请以JSON格式返回，格式如下：
{
  "coreSummary": "全书核心摘要（300-500字）",
  "keyElements": {
    "mainCharacters": ["主要人物/概念"],
    "keyThemes": ["核心主题"],
    "coreArguments": ["核心论点"],
    "importantQuotes": ["重要引用"]
  },
  "styleAnalysis": {
    "writingStyle": "写作风格描述",
    "narrativeStructure": "叙事结构描述",
    "languageFeatures": ["语言特点"]
  },
  "valueAssessment": {
    "academicValue": "学术价值评估",
    "practicalValue": "实用价值评估",
    "targetAudience": "目标读者",
    "overallRating": 8.5
  }
}`;

  const analysisContent = chunkAnalyses.map((a, i) => 
    `第${i + 1}部分：\n摘要：${a.summary}\n主题：${a.themes.join(", ")}\n论点：${a.coreArguments.join("; ")}`
  ).join("\n\n");

  try {
    const response = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: `书名：${bookTitle}\n\n各部分分析：\n${analysisContent}` },
    ], { temperature: 0.5, maxTokens: 4096 });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {
      coreSummary: response,
      keyElements: {},
      styleAnalysis: {},
      valueAssessment: {},
    };
  } catch (error) {
    console.error("[Volcengine] Generate book report error:", error);
    throw error;
  }
}

/**
 * RAG问答
 */
export async function ragAnswer(
  question: string,
  context: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const systemPrompt = `你是一个智能读书助手。根据提供的书籍内容回答用户的问题。

要求：
1. 基于提供的上下文内容回答问题
2. 如果上下文中没有相关信息，请诚实说明
3. 回答要准确、简洁、有帮助
4. 可以适当引用原文内容

书籍相关内容：
${context}`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: question },
  ];

  return await chatCompletion(messages, { temperature: 0.7 });
}
