import "dotenv/config";

export const ENV = {
  // Database
  databaseUrl: process.env.DATABASE_URL || "file:./data/app.db",
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production",
  
  // Volcengine (火山引擎)
  volcengineApiKey: process.env.VOLCENGINE_API_KEY || "",
  volcengineEndpointId: process.env.VOLCENGINE_ENDPOINT_ID || "",
  
  // SMTP
  smtpHost: process.env.SMTP_HOST || "smtp.qq.com",
  smtpPort: parseInt(process.env.SMTP_PORT || "465"),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  emailFrom: process.env.EMAIL_FROM || "",
  
  // Server
  port: parseInt(process.env.PORT || "3000"),
  nodeEnv: process.env.NODE_ENV || "development",
  
  // Owner
  ownerOpenId: process.env.OWNER_OPEN_ID || "",
};
