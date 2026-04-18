# Research: External Integrations (Strava, Suunto, Wikiloc)

This document summarizes the technical feasibility and requirements for integrating third-party trail/activity platforms into SunTrail.

## 1. Strava (Priority: High)
*   **Status**: Highly Feasible.
*   **Method**: Strava V3 API via OAuth2.
*   **Capabilities**:
    *   List user activities (history) and reconstruct GPX from data streams.
    *   List and direct export of "Routes" (planned itineraries) as GPX.
*   **Requirement**: Register SunTrail as a developer application at [strava.com/settings/api](https://www.strava.com/settings/api).

## 2. Suunto (Priority: Medium)
*   **Status**: Feasible.
*   **Method**: Suunto Cloud API.
*   **Capabilities**:
    *   Import workouts as `.FIT` files.
    *   Import/Export routes as `.GPX`.
*   **Technical Note**: Requires a `.FIT` to `.GPX` converter on the backend or using a library like `fit-parse`.
*   **Requirement**: Apply for partnership at [Suunto API Zone](https://apizone.suunto.com/).

## 3. Wikiloc (Priority: Medium)
*   **Status**: Feasible via Partnership.
*   **Method**: Wikiloc Partner API.
*   **Usage**: Access to millions of community-sourced hiking trails.
*   **Requirement**: Contact Wikiloc for partner access.

## 4. Other Platforms
*   **Garmin Connect**: Difficult for small developers (official API is enterprise-focused). Requires using unofficial scraper libraries or requesting manual GPX exports from users.
*   **Komoot**: Closed ecosystem. No public API for third-party apps. Manual GPX import remains the official route.
*   **AllTrails**: Closed ecosystem. No public API.
*   **Decathlon Outdoor**: Open developer portal available. Good candidate for European coverage.

## 5. Unified Aggregator Alternative
*   **Terra API**: Unified connector for Strava, Garmin, Suunto, etc.
*   **Cost**: High ($499/mo). Not recommended for initial phase.
