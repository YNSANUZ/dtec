// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  name: text("name").notNull(),
  avatar: text("avatar").notNull().default("r"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const presence = sqliteTable("presence", {
  userId: text("user_id").primaryKey(),
  x: real("x").notNull().default(0),
  z: real("z").notNull().default(5),
  action: text("action").notNull().default("idle"),
  message: text("message").notNull().default(""),
  lastSeen: integer("last_seen").notNull(),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  text: text("text").notNull(),
  createdAt: integer("created_at").notNull(),
});
