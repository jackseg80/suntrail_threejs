## ReactiveState Decisions
- Chose `WeakMap` to cache proxies and avoid infinite recursion or multiple proxies for the same object.
- Decided to only add the `subscribe` method to the root proxy to keep nested objects clean.
- Used `Reflect.get` and `Reflect.set` for proper proxy behavior.
## State Persistence Debouncing
- Decided to use a 300ms debounce for `saveSettings` to balance responsiveness and performance.
- Decided to update `src/modules/state.test.ts` to use fake timers to accommodate the new asynchronous behavior of `saveSettings`.
- The `subscribe` method is only available on the root proxy of the reactive state.
## TrackSheet Migration
- Migrated GPX import/export and recording logic from `ui.ts` directly into `TrackSheet.ts` to keep `ui.ts` thin and encapsulate track-related functionality.
- Removed global event listeners for GPX operations from `ui.ts` as they are now handled locally within `TrackSheet`.