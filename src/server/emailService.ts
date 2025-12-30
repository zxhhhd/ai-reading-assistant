import nodemailer from "nodemailer";
import { ENV } from "./env.js";

// 验证码存储 (内存存储，生产环境应使用Redis)
const verificationCodes = new Map<string, { code: string; expiresAt: number }>();

// 创建邮件传输器
const transporter = nodemailer.createTransport({
  host: ENV.smtpHost,
  port: ENV.smtpPort,
  secure: ENV.smtpSecure,
  auth: {
    user: ENV.smtpUser,
    pass: ENV.smtpPass,
  },
});

/**
 * 生成6位数字验证码
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 存储验证码
 */
export function storeVerificationCode(email: string, code: string): void {
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5分钟过期
  verificationCodes.set(email.toLowerCase(), { code, expiresAt });
}

/**
 * 验证验证码
 */
export function verifyCode(email: string, code: string): boolean {
  const stored = verificationCodes.get(email.toLowerCase());
  if (!stored) return false;
  
  if (Date.now() > stored.expiresAt) {
    verificationCodes.delete(email.toLowerCase());
    return false;
  }
  
  if (stored.code !== code) return false;
  
  // 验证成功后删除验证码
  verificationCodes.delete(email.toLowerCase());
  return true;
}

/**
 * 发送验证码邮件
 */
export async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: ENV.emailFrom || ENV.smtpUser,
      to: email,
      subject: "【AI读书助手】邮箱验证码",
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <h2 style="color: #333;">AI读书助手 - 邮箱验证</h2>
          <p style="color: #666; font-size: 16px;">您好！</p>
          <p style="color: #666; font-size: 16px;">您的验证码是：</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; color: #333; letter-spacing: 5px;">${code}</span>
          </div>
          <p style="color: #999; font-size: 14px;">验证码有效期为5分钟，请尽快使用。</p>
          <p style="color: #999; font-size: 14px;">如果这不是您的操作，请忽略此邮件。</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">此邮件由AI读书助手系统自动发送，请勿回复。</p>
        </div>
      `,
    });
    console.log(`[Email] Verification code sent to ${email}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send verification email:", error);
    return false;
  }
}
