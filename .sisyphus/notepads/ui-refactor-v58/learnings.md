## ReactiveState Implementation
- Used a recursive Proxy to handle nested objects.
- Implemented microtask-based debouncing using  to avoid redundant notifications.
- Used  to avoid proxying Three.js instances and arrays.
- Implemented parent path notification (e.g., changing  notifies  subscribers).
## ReactiveState Implementation
- Used a recursive Proxy to handle nested objects.
- Implemented microtask-based debouncing using `queueMicrotask` to avoid redundant notifications.
- Used `isPlainObject` to avoid proxying Three.js instances and arrays.
- Implemented parent path notification (e.g., changing `weather.temp` notifies `weather` subscribers).
## Reactive State Implementation
- Wrapping the global state with  Proxy allows for fine-grained reactivity and subscription to state changes.
- Debouncing  (300ms) is crucial to prevent excessive disk I/O when multiple UI controls are adjusted rapidly.
- When testing debounced functions with Vitest,  and  are necessary to ensure the debounced logic executes within the test context.
## Reactive State Implementation
- Wrapping the global state with `createReactiveState` Proxy allows for fine-grained reactivity and subscription to state changes.
- Debouncing `saveSettings` (300ms) is crucial to prevent excessive disk I/O when multiple UI controls are adjusted rapidly.
- When testing debounced functions with Vitest, `vi.useFakeTimers()` and `vi.advanceTimersByTime()` are necessary to ensure the debounced logic executes within the test context.
- Created BaseComponent abstract class to handle template hydration, rendering, and subscription cleanup.
- Moved UI panels (Search, Settings, Weather, SOS, Solar Probe) into <template> tags in index.html to prepare for BaseComponent hydration.
- Added shell containers (<nav id="nav-bar">, <div id="sheet-overlay">, <div id="sheet-container">) to index.html.
- Cleaned up index.html to strictly follow the template structure. Removed duplicate #expert-weather-panel and moved #elevation-profile inside template-widgets to maintain a clean DOM.
- Created SheetManager singleton to handle exclusive bottom sheet visibility and overlay toggling via CSS classes.
- NavigationBar component created, extending BaseComponent and integrating with SheetManager. Overlay clicks are observed to reset the active tab to 'map'.
- Created TopStatusBar component extending BaseComponent. It subscribes to state changes (ZOOM, weatherData, IS_OFFLINE) and updates the DOM directly using textContent to avoid innerHTML.
- Note: `state.subscribe` currently returns `void`, so we cannot pass its return value to `BaseComponent.addSubscription()`. We just call it directly.- Modified `ReactiveState.ts` to return an `unsubscribe` function from `subscribe()`. This is essential for preventing memory leaks in components that subscribe to state.
- Updated TopStatusBar.ts to wrap state.subscribe calls with this.addSubscription() to ensure proper cleanup on component disposal. NavigationBar.ts did not have any state.subscribe calls.
- Created SearchSheet.ts extending BaseComponent, migrating search logic from ui.ts. Added strict isNaN validation for coordinates and replaced innerHTML with textContent/createElement.
- Migrated settings logic to SettingsSheet.ts, extending BaseComponent.
- Used state.subscribe to bind UI elements directly to the reactive state.
- Handled GPX upload via a custom event 'gpx-uploaded' to keep handleGPX in ui.ts for now.
