/** Génère le golden partagé à partir du moteur TypeScript v5.84 non modifié. */
import fixtures from '../src/modules/guidance/fixtures/guidance-fixtures.json';
import { GuidanceEngine } from '../src/modules/guidance/GuidanceEngine';

const BASE_TIME = 1_800_000_000_000;
const rounded = (value: number | null) =>
    value === null ? null : Math.round(value * 1_000_000) / 1_000_000;

const parity = Object.fromEntries(
    Object.entries(fixtures).map(([name, fixture]) => {
        const engine = new GuidanceEngine({
            routeId: `fixture-${name}`,
            geometry: fixture.geometry,
            plannedPaceKmh: 4,
        });
        engine.start(BASE_TIME);
        return [
            name,
            fixture.samples.map((sample) => {
                const update = engine.update(
                    {
                        lat: sample.lat,
                        lon: sample.lon,
                        accuracyMeters: sample.accuracyMeters,
                        timestamp: BASE_TIME + sample.offsetMs,
                    },
                    BASE_TIME + sample.offsetMs
                );
                return {
                    status: update.snapshot.status,
                    progressMeters: rounded(update.snapshot.progressMeters),
                    remainingMeters: rounded(update.snapshot.remainingMeters),
                    crossTrackMeters: rounded(
                        update.snapshot.crossTrackMeters
                    ),
                    bearing: rounded(update.snapshot.bearing),
                    accuracyMeters: update.snapshot.accuracyMeters,
                    positionAgeMs: update.snapshot.positionAgeMs,
                    acceptedPosition: update.acceptedPosition,
                    events: update.events,
                };
            }),
        ];
    })
);

process.stdout.write(`${JSON.stringify(parity, null, 2)}\n`);
