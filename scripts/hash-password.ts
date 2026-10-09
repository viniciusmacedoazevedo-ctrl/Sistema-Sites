import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Uso: npm run hash-password -- "senha-com-pelo-menos-10-caracteres"');
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 12);
console.log("Cole no .env (formato base64, evita problemas com o caractere $):\n");
console.log(`ADMIN_PASSWORD_HASH="${Buffer.from(hash).toString("base64")}"`);
