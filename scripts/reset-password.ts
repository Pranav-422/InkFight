// Owner tool: give an account a fresh random password and print it.
// npx tsx --env-file=<env file with DATABASE_URL> scripts/reset-password.ts someone@example.com
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const db = new PrismaClient();
async function main() {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return console.log(`No account for ${email}. Sign up with it at /signup (it becomes admin if it's in ADMIN_EMAILS).`);
  const password = randomBytes(9).toString("base64url");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  console.log(`${user.name} (${email}) new password: ${password}`);
}
main().finally(() => db.$disconnect());
