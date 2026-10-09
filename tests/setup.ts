process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://sitehunter:sitehunter@localhost:5432/sitehunter_test";
process.env.AUTH_SECRET = "test-secret-0123456789abcdef";
process.env.PUBLIC_BASE_URL = "https://sitehunter.test";
if (!process.env.CHROMIUM_EXECUTABLE_PATH && require("node:fs").existsSync("/opt/pw-browsers/chromium")) process.env.CHROMIUM_EXECUTABLE_PATH = "/opt/pw-browsers/chromium";
// Nenhuma credencial real é usada nos testes.
for (const k of ["GOOGLE_PLACES_API_KEY", "ANTHROPIC_API_KEY", "VERCEL_TOKEN", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "SMTP_HOST", "SMTP_FROM"]) {
  delete process.env[k];
}
