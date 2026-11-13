// Only the Playwright build uses this fixture. Never used by production/development builds.
export const environment = {
  supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
  supabaseKey: "sb_publishable_isolated_test_key_not_real",
  geoapifyMapsKey: "public-map-fixture-only",
} as const;
