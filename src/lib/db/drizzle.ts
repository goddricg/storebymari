import { drizzle } from "drizzle-orm/mysql2";
import pool from "@/lib/mysql";
import * as schema from "./schema";

export const db = drizzle(pool, { schema, mode: "default" });

export type Database = typeof db;
export * from "./schema";
