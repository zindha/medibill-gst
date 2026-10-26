/**
 * One-off: create (or reuse) an audit user + session for the screenshot audit.
 * Prints JSON { id, token }. Delete after use.
 */
import { eq } from "drizzle-orm";
import { db } from "./src/db/index.js";
import { users } from "./src/db/schema/index.js";
import { createUser, createSession } from "./src/lib/auth.js";

const EMAIL = "audit-bot@medibill.test";
const PHONE = "9999999999";

async function main() {
  let user = await db.query.users.findFirst({ where: eq(users.email, EMAIL) });
  if (!user) {
    user = await createUser({
      name: "Audit Bot",
      email: EMAIL,
      phone: PHONE,
      password: "audit-pass-123",
      role: "admin",
    });
    console.error("created new audit user");
  } else {
    console.error("reusing existing audit user");
  }
  const session = await createSession(user.id, "127.0.0.1", "audit-script");
  console.log(JSON.stringify({ id: user.id, token: session.token }));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
