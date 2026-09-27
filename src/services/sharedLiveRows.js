/** Share an identical live query between mounted consumers. */
export function subscribeSharedRows(registry, key, subscribeChanges, loadRows, onData, onError, delay = 180) {
  let slice = registry.get(key);
  if (!slice) {
    slice = { consumers: new Set(), channel: null, timer: null, pending: false, dirty: false, hasLoaded: false };
    slice.load = async () => {
      if (slice.pending) { slice.dirty = true; return; }
      slice.pending = true;
      try {
        const rows = await loadRows();
        slice.lastRows = rows;
        slice.lastError = null;
        slice.hasLoaded = true;
        for (const consumer of slice.consumers) consumer.onData(rows);
      } catch (error) {
        slice.lastError = error;
        slice.hasLoaded = true;
        for (const consumer of slice.consumers) consumer.onError(error);
      } finally {
        slice.pending = false;
        if (slice.dirty && slice.consumers.size) {
          slice.dirty = false;
          slice.schedule();
        }
      }
    };
    slice.schedule = () => {
      if (slice.timer) clearTimeout(slice.timer);
      slice.timer = setTimeout(() => { slice.timer = null; slice.load(); }, delay);
    };
    slice.channel = subscribeChanges(slice.schedule);
    registry.set(key, slice);
  }
  const consumer = { onData, onError };
  slice.consumers.add(consumer);
  if (slice.hasLoaded && !slice.pending) {
    if (slice.lastError) consumer.onError(slice.lastError);
    else consumer.onData(slice.lastRows);
  } else if (!slice.pending && slice.consumers.size === 1) slice.load();
  return () => {
    slice.consumers.delete(consumer);
    if (slice.consumers.size) return;
    if (slice.timer) clearTimeout(slice.timer);
    registry.delete(key);
    slice.channel?.unsubscribe?.();
  };
}
