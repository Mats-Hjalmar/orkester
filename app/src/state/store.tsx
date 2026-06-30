// Thin re-export of the engine-backed store lifted into @orkester/core/state.
// The implementation (reducer, provider, polling, optimistic+revert, Api
// adapters) now lives in core; the app keeps this path so existing import sites
// (`./state/store`) do not churn. The StoreProvider takes an injected `api`
// prop — the app injects the native in-process SonosApi; Electron injects its
// own IPC-backed SonosApi.
export { StoreProvider, useStore, fmt, type Store } from '@orkester/core/state';
