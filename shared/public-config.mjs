// Public configuration only. Never returns a server key or copies the environment.
export function publicConfig(env, { allowLocalTest = false } = {}) {
  const id = env.SUPABASE_ID;
  let url = (env.SUPABASE_URL || "").replace(/\/+$/, "");
  const dashboard =
    /^https:\/\/supabase\.com\/dashboard\/project\/([a-z0-9]{20})$/.exec(url);
  if (dashboard) {
    if (id && id !== dashboard[1]) throw new Error("CONFIG_PROJECT_MISMATCH");
    url = `https://${dashboard[1]}.supabase.co`;
  }
  if (!url && id && /^[a-z0-9]{20}$/.test(id))
    url = `https://${id}.supabase.co`;
  const local = allowLocalTest && /^http:\/\/127\.0\.0\.1:\d+$/.test(url);
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && !local)
    throw new Error("CONFIG_URL");
  if (id && !local && url !== `https://${id}.supabase.co`)
    throw new Error("CONFIG_PROJECT_MISMATCH");
  const key = [env.SUPABASE_PUBLISHABLE_KEY, env.SUPABASE_PUBLISHABE_KEY].find(
    (value) => /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value || ""),
  );
  if (!key) throw new Error("CONFIG_PUBLIC_KEY");
  return { url, key };
}
