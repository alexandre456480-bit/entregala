import "dotenv/config";
import { publicConfig } from "../shared/public-config.mjs";
export function config() {
  const { url, key } = publicConfig(process.env, {
    allowLocalTest: process.env["NODE_ENV"] === "test",
  });
  const secret =
    process.env["SUPABASE_SECRET_KEY"] ||
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    "";
  const origin = process.env["APP_ORIGIN"] || "http://localhost:4200";
  return { url, key, secret, origin };
}
