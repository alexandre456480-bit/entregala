import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { config } from "../server/config";
import {routeSelect} from '../shared/queries';
async function verify() {
  const env = config();
  const anon = createClient(env.url, env.key, {
    auth: { persistSession: false },
  });
  const service = env.secret
    ? createClient(env.url, env.secret, { auth: { persistSession: false } })
    : null;
  let failures = 0;
  for (const table of [
    "profiles",
    "establishments",
    "products",
    "orders",
    "order_items",
    "routes",
    "route_stops",
    "audit_events",
    "operation_base",
    'operation_items',
    'operation_issues',
    'route_signals',
  ]) {
    const key=table==='route_signals'?'route_id':'id';
    const structure = service
      ? await service.from(table).select(key).limit(0)
      : null;
    const read = await anon.from(table).select(key).limit(1);
    const exists = structure
      ? !structure.error
      : read.error?.code !== "PGRST205";
    const denied =
      read.error?.code === "42501" || (!read.error && read.data?.length === 0);
    if (!exists || !denied) failures++;
    console.log(
      `${table}: schema ${exists ? "OK" : "PENDENTE"}; leitura anônima ${denied ? "NEGADA" : "NÃO VALIDADA"}`,
    );
  }
  if(service){const geographic=await service.from('establishments').select('location_status,location_confirmed_at,location_confirmed_by').limit(0);if(geographic.error)failures++;console.log(`Metadados geográficos: ${geographic.error?'PENDENTES':'OK'}`);}
  if(service){const operational=await service.from('routes').select('operation_version,loading_started_at,started_at,finished_at,started_by,finished_by').limit(0);if(operational.error)failures++;console.log(`Metadados da jornada: ${operational.error?'PENDENTES':'OK'}`);}
  if(service){const joined=await service.from('routes').select(routeSelect).limit(0);if(joined.error)failures++;console.log(`Consulta completa de rotas e motorista: ${joined.error?'FALHOU ('+joined.error.code+')':'OK'}`);}
  console.log(`Geoapify: chave pública ${process.env['GEOAPIFY_MAPS_KEY']?'CONFIGURADA':'PENDENTE'}; chave privada ${process.env['GEOAPIFY_SERVER_KEY']?'CONFIGURADA':'PENDENTE'}`);
  console.log(
    "Esta verificação não cria dados e não substitui a homologação com administrador e dois motoristas.",
  );
  process.exitCode = failures ? 1 : 0;
}
verify().catch(() => {
  console.error(
    "Não foi possível verificar o projeto remoto. Confira as variáveis e a conexão.",
  );
  process.exitCode = 1;
});
