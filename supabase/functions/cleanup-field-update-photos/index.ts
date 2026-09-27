import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = { 'Content-Type': 'application/json' };

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'POST required' }), { status: 405, headers });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Europe/Istanbul is UTC+03 year-round. At 08:30, everything before the
  // previous local calendar day is eligible; the job is safe to rerun.
  const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
  const boundary = new Date(`${localToday}T00:00:00+03:00`);
  let removed = 0;
  let failed = 0;
  let batches = 0;
  let orphanedRemoved = 0;
  // First drain the durable saga queue. Staged uploads stay here until a record
  // trigger claims them; replaced/removed paths are queued by the same DB write.
  for (let queueBatch = 0; queueBatch < 20; queueBatch += 1) {
    const { data: queued, error: queueError } = await supabase.from('record_photo_gc')
      .select('path').lte('delete_after', new Date().toISOString()).order('delete_after').limit(100);
    if (queueError) return new Response(JSON.stringify({ error: queueError.message, orphanedRemoved, failed }), { status: 500, headers });
    if (!queued?.length) break;
    const paths = queued.map((item) => item.path);
    const { error: storageError } = await supabase.storage.from('syp-records').remove(paths);
    if (storageError) { failed += paths.length; break; }
    const { error: deleteError } = await supabase.from('record_photo_gc').delete().in('path', paths);
    if (deleteError) { failed += paths.length; break; }
    orphanedRemoved += paths.length;
  }
  // Drain bounded batches so outages or a long pause do not strand rows behind
  // PostgREST's response cap. Re-query from the oldest remaining photo each pass.
  while (batches < 20) {
    const { data: rows, error: readError } = await supabase.from('field_updates')
      .select('id,photo_path').lt('occurred_at', boundary.toISOString()).not('photo_path', 'is', null)
      .order('occurred_at', { ascending: true }).limit(100);
    if (readError) return new Response(JSON.stringify({ error: readError.message, removed, failed }), { status: 500, headers });
    if (!rows?.length) break;
    batches += 1;
    let batchFailed = false;
    for (const row of rows) {
      if (!row.photo_path) continue;
      const { error: storageError } = await supabase.storage.from('syp-records').remove([row.photo_path]);
      if (storageError) {
        failed += 1;
        batchFailed = true;
        continue;
      }
      // Match the path too, so a concurrent edit with a fresh image is preserved.
      const { error: updateError } = await supabase.from('field_updates').update({ photo_path: null, photo_removed: true })
        .eq('id', row.id).eq('photo_path', row.photo_path);
      if (updateError) {
        failed += 1;
        batchFailed = true;
      } else removed += 1;
    }
    // Leave failed rows for the next scheduled run instead of spinning on them.
    if (batchFailed) break;
  }
  return new Response(JSON.stringify({ removed, orphanedRemoved, failed, boundary: boundary.toISOString(), moreMayRemain: batches === 20 }), { status: failed ? 500 : 200, headers });
});
