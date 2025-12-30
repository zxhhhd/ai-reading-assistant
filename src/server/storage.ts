import fs from "fs";
import path from "path";

const UPLOAD_DIR = path.resolve(process.cwd(), "data", "uploads");

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * 保存文件到本地存储
 */
export async function storagePut(
  key: string,
  data: Buffer,
  contentType: string
): Promise<{ url: string }> {
  const filePath = path.join(UPLOAD_DIR, key);
  const dir = path.dirname(filePath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(filePath, data);
  
  // 返回本地文件URL
  const url = `/uploads/${key}`;
  return { url };
}

/**
 * 从本地存储获取文件
 */
export async function storageGet(key: string): Promise<Buffer | null> {
  const filePath = path.join(UPLOAD_DIR, key);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  return fs.readFileSync(filePath);
}

/**
 * 删除本地存储的文件
 */
export async function storageDelete(key: string): Promise<void> {
  const filePath = path.join(UPLOAD_DIR, key);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
