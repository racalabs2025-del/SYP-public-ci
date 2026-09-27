const LIVE_OPERATION_DATASETS = new Set(['plans', 'activities', 'tasks']);

export function isLiveOperationDataset(kind) {
  return LIVE_OPERATION_DATASETS.has(kind);
}
