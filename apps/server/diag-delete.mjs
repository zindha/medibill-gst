import { db } from "./src/db/index.ts";
import { sessions, medicines } from "./src/db/schema/index.ts";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const userId = "h-iq6qxC_tvgVeeN";
const token = "diag-del-" + nanoid(12);
const now = new Date();
const future = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
const [s] = await db.insert(sessions).values({ userId, token, expiresAt: future, createdAt: now }).returning();
console.log("created session", s.token, s.expiresAt.toISOString());

const medId = "6TVzW0krTXtnkv4s";
const med = (await db.select().from(medicines).where(eq(medicines.id, medId)))[0];
console.log("med before", med?.name, med?.isActive);

const base = "http://127.0.0.1:3000";
const r = await fetch(base + "/api/medicines/" + medId, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
const text = await r.text();
console.log("DELETE status", r.status, text);

const med2 = (await db.select().from(medicines).where(eq(medicines.id, medId)))[0];
console.log("med after", med2?.name, med2?.isActive);

if (med2?.isActive === false) {
  await db.update(medicines).set({ isActive: true }).where(eq(medicines.id, medId));
  console.log("reverted");
}
await db.delete(sessions).where(eq(sessions.id, s.id));
console.log("cleaned session");
