import "dotenv/config";
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
async function migrate() {
  const raw = process.env["DATABASE_URL"];
  if (!raw)
    throw new Error(
      "Configure DATABASE_URL no .env (conexão PostgreSQL / Session pooler).",
    );
  const url = new URL(raw);
  const project = process.env["SUPABASE_ID"];
  if (
    project &&
    !url.hostname.includes(project) &&
    !decodeURIComponent(url.username).endsWith("." + project)
  )
    throw new Error(
      "DATABASE_URL não corresponde ao SUPABASE_ID. Aplicação recusada.",
    );
  url.searchParams.delete("sslmode");
  const client = new pg.Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    await client.query("select pg_advisory_lock(4581022)");
    await client.query("create schema if not exists supabase_migrations");
    await client.query(
      "create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text)",
    );
    const files = readdirSync("supabase/migrations")
      .filter((f) => /^\d+_.*\.sql$/.test(f))
      .sort();
    for (const file of files) {
      const [version] = file.split("_");
      const result = await client.query(
        "select version from supabase_migrations.schema_migrations where version=$1",
        [version],
      );
      if (result.rowCount) {
        console.log(file + ": já aplicada.");
        continue;
      }
      // Migration and migration history share the same transaction.
      const sql = readFileSync("supabase/migrations/" + file, "utf8")
        .replace(/^begin;\s*$/m, "")
        .replace(/^commit;\s*$/m, "");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into supabase_migrations.schema_migrations(version,statements,name) values($1,$2,$3)",
          [version, [sql], file.slice(version.length + 1, -4)],
        );
        await client.query("commit");
        console.log(file + ": aplicada.");
      } catch {
        await client.query("rollback");
        throw new Error(
          "Migration recusada. Transação desfeita; revise conflitos de schema e permissões.",
        );
      }
    }
    await client.query("notify pgrst, 'reload schema'");
    console.log("Migrations concluídas; schema cache solicitado.");
  } finally {
    await client.end();
  }
}
migrate().catch((e) => {
  console.error(
    (e instanceof Error && e.message.startsWith("Configure")) ||
      (e instanceof Error && e.message.startsWith("DATABASE_URL")) ||
      (e instanceof Error && e.message.startsWith("Migration"))
      ? e.message
      : "Falha ao conectar/aplicar migrations. Confira DATABASE_URL, senha e certificado TLS. Nenhuma credencial foi registrada.",
  );
  process.exitCode = 1;
});
