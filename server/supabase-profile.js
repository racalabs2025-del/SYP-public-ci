function readSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !anonKey) throw new Error('SUPABASE_SERVER_CONFIG_MISSING');
  return { url: url.replace(/\/$/, ''), anonKey };
}

export async function getSupabaseUserProfile(uid, firebaseToken, fetchImpl = fetch) {
  if (!uid || !firebaseToken) throw new Error('SUPABASE_PROFILE_IDENTITY_MISSING');
  const { url, anonKey } = readSupabaseConfig();
  const endpoint = new URL(`${url}/rest/v1/app_users`);
  endpoint.searchParams.set('select', 'id,role,active,unit_id,display_name,email');
  endpoint.searchParams.set('id', `eq.${uid}`);
  endpoint.searchParams.set('limit', '1');

  const response = await fetchImpl(endpoint, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${firebaseToken}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`SUPABASE_PROFILE_READ_FAILED_${response.status}`);
  const rows = await response.json();
  const profile = Array.isArray(rows) ? rows[0] : null;
  return profile?.id === uid ? profile : null;
}
