import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { publicConfig } from "../shared/public-config.mjs";
config({ quiet: true });
if (
  process.env.GEOAPIFY_MAPS_KEY &&
  [process.env.GEOAPIFY_SERVER_KEY,process.env.SUPABASE_SECRET_KEY,process.env.SUPABASE_SERVICE_ROLE_KEY].includes(process.env.GEOAPIFY_MAPS_KEY)
)
  throw new Error(
    "Use chaves Geoapify distintas: a chave privada do servidor não pode ser publicada no mapa.",
  );
const { url, key } = publicConfig(process.env);
mkdirSync("src/environments", { recursive: true });
writeFileSync(
  "src/environments/generated.ts",
  `// Gerado: somente configuração pública.\nexport const environment = ${JSON.stringify({ supabaseUrl: url, supabaseKey: key, geoapifyMapsKey: process.env.GEOAPIFY_MAPS_KEY || "" })} as const;\n`,
);
console.log("Configuração pública gerada. Nenhum segredo incluído.");
