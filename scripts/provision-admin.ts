import "dotenv/config";
import { adminClient } from "../server/auth";
import { driverSchema } from "../shared/validation";

async function provision() {
  const parsed = driverSchema.safeParse({
    name: process.env["ADMIN_NAME"],
    email: process.env["ADMIN_EMAIL"],
    password: process.env["ADMIN_PASSWORD"],
  });
  if (!parsed.success)
    throw new Error(
      "Configure ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres) no ambiente local.",
    );
  const admin = adminClient();
  const { data: existing, error: checkError } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1);
  if (checkError)
    throw new Error(
      "Aplique as migrations antes de provisionar o administrador.",
    );
  if (existing.length)
    throw new Error(
      "Já existe um administrador. O provisionamento inicial foi recusado.",
    );
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(
      "Não foi possível criar a conta. Nenhum usuário existente será alterado. Confira o e-mail e a configuração.",
    );
  const { error: profileError } = await admin
    .from("profiles")
    .insert({
      id: data.user.id,
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      role: "admin",
      active: true,
    });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(
      "Falha ao criar perfil; o usuário recém-criado foi removido.",
    );
  }
  console.log(
    "Primeiro administrador criado. Remova ADMIN_PASSWORD do ambiente após o provisionamento.",
  );
}
provision().catch((e) => {
  console.error(e instanceof Error ? e.message : "Falha de provisionamento.");
  process.exitCode = 1;
});
