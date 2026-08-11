import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/guidance-fixtures.json';
import { GuidanceEngine } from './GuidanceEngine';
import type { GuidancePosition } from './guidanceTypes';

const BASE_TIME = 1_800_000_000_000;

type Fixture = (typeof fixtures)[keyof typeof fixtures];

function runFixture(
    fixture: Fixture,
    thresholdOverrides: ConstructorParameters<typeof GuidanceEngine>[1] = {}
) {
    const engine = new GuidanceEngine(
        {
            routeId: 'fixture-route',
            geometry: fixture.geometry,
            plannedPaceKmh: 4,
        },
        thresholdOverrides
    );
    engine.start(BASE_TIME);
    return {
        engine,
        updates: fixture.samples.map((sample) => {
            const position: GuidancePosition = {
                lat: sample.lat,
                lon: sample.lon,
                accuracyMeters: sample.accuracyMeters,
                timestamp: BASE_TIME + sample.offsetMs,
            };
            return engine.update(position, position.timestamp);
        }),
    };
}

describe('GuidanceEngine deterministic fixtures', () => {
    it('projects a straight route and reduces remaining distance', () => {
        const { updates } = runFixture(fixtures.straight);
        expect(updates.at(-1)!.snapshot.progressMeters).toBeGreaterThan(
            updates[0].snapshot.progressMeters
        );
        expect(updates.at(-1)!.snapshot.remainingMeters).toBeLessThan(
            updates[0].snapshot.remainingMeters
        );
        expect(updates.at(-1)!.snapshot.bearing).toBeGreaterThan(80);
        expect(updates.at(-1)!.snapshot.bearing).toBeLessThan(100);
    });

    it('does not confuse the start of a loop with its arrival', () => {
        const { engine, updates } = runFixture(fixtures.loop);
        expect(updates[0].snapshot.progressMeters).toBeLessThan(30);
        expect(updates[0].snapshot.remainingMeters).toBeGreaterThan(
            engine.getTotalMeters() * 0.8
        );
        expect(updates.at(-1)!.snapshot.progressMeters).toBeGreaterThan(
            engine.getTotalMeters() * 0.5
        );
    });

    it('keeps the outbound and return legs ordered', () => {
        const { engine, updates } = runFixture(fixtures.outAndBack);
        expect(updates[1].snapshot.progressMeters).toBeGreaterThan(
            engine.getTotalMeters() * 0.35
        );
        expect(updates[2].snapshot.progressMeters).toBeGreaterThan(
            updates[1].snapshot.progressMeters
        );
    });

    it('does not jump across nearby hairpins', () => {
        const { engine, updates } = runFixture(fixtures.nearHairpins);
        expect(updates[1].snapshot.progressMeters).toBeLessThan(
            engine.getTotalMeters() * 0.35
        );
        expect(updates[3].snapshot.progressMeters).toBeGreaterThan(
            updates[1].snapshot.progressMeters
        );
    });

    it('keeps the first branch at a crossing', () => {
        const { engine, updates } = runFixture(fixtures.crossing);
        expect(updates.at(-1)!.snapshot.progressMeters).toBeLessThan(
            engine.getTotalMeters() * 0.45
        );
    });

    it('never rolls progress back under GPS noise', () => {
        const { updates } = runFixture(fixtures.noise);
        const progress = updates.map(
            (update) => update.snapshot.progressMeters
        );
        expect(progress).toEqual([...progress].sort((a, b) => a - b));
        expect(
            updates.every((update) => !update.events.includes('off-route'))
        ).toBe(true);
    });

    it('rejects an implausible GPS jump', () => {
        const { updates } = runFixture(fixtures.gpsJump);
        expect(updates[2].acceptedPosition).toBe(false);
        expect(updates[2].snapshot.progressMeters).toBe(
            updates[1].snapshot.progressMeters
        );
        expect(updates[2].events).toEqual([]);
    });

    it('applies off-route hold, recovery hysteresis and one alert', () => {
        const { updates } = runFixture(fixtures.recovery);
        expect(updates[3].snapshot.status).toBe('offRoute');
        expect(updates[3].events).toContain('off-route');
        expect(updates[3].snapshot.bearing).toBeGreaterThan(160);
        expect(updates[3].snapshot.bearing).toBeLessThan(200);
        expect(updates[5].snapshot.status).toBe('recovered');
        expect(updates[5].events).toContain('recovered');
    });

    it('requires a held final position before arrival', () => {
        const { updates } = runFixture(fixtures.arrival);
        expect(updates[1].snapshot.status).not.toBe('arrived');
        expect(updates[2].snapshot.status).toBe('arrived');
        expect(updates[2].events).toContain('arrived');
    });
});

describe('GuidanceEngine state and quality gates', () => {
    it('suppresses alerts for stale and inaccurate positions', () => {
        const engine = new GuidanceEngine({
            routeId: 'quality',
            geometry: fixtures.straight.geometry,
            plannedPaceKmh: 4,
        });
        engine.start(BASE_TIME);
        const inaccurate = engine.update(
            {
                lat: 46.01,
                lon: 7.001,
                accuracyMeters: 100,
                timestamp: BASE_TIME,
            },
            BASE_TIME
        );
        const stale = engine.update(
            {
                lat: 46.01,
                lon: 7.001,
                accuracyMeters: 5,
                timestamp: BASE_TIME,
            },
            BASE_TIME + 20_000
        );
        expect(inaccurate.snapshot.status).toBe('acquiring');
        expect(stale.snapshot.status).toBe('acquiring');
        expect(inaccurate.events).toEqual([]);
        expect(stale.events).toEqual([]);
    });

    it('pauses and resumes without losing progress', () => {
        const { engine, updates } = runFixture(fixtures.straight);
        const progress = updates.at(-1)!.snapshot.progressMeters;
        expect(engine.pause(BASE_TIME + 40_000).snapshot.status).toBe('paused');
        expect(engine.resume(BASE_TIME + 50_000).snapshot.progressMeters).toBe(
            progress
        );
        expect(engine.resume(BASE_TIME + 50_000).snapshot.status).toBe(
            'acquiring'
        );
        expect(engine.stop(BASE_TIME + 60_000).snapshot.status).toBe('idle');
    });

    it('enforces the off-route alert cooldown', () => {
        const engine = new GuidanceEngine(
            {
                routeId: 'cooldown',
                geometry: fixtures.straight.geometry,
                plannedPaceKmh: 4,
            },
            { offRouteHoldMs: 0, alertCooldownMs: 120_000 }
        );
        engine.start(BASE_TIME);
        const first = engine.update(
            {
                lat: 46.001,
                lon: 7.001,
                accuracyMeters: 5,
                timestamp: BASE_TIME,
            },
            BASE_TIME
        );
        const repeated = engine.update(
            {
                lat: 46.001,
                lon: 7.0011,
                accuracyMeters: 5,
                timestamp: BASE_TIME + 10_000,
            },
            BASE_TIME + 10_000
        );
        expect(first.events).toEqual(['off-route']);
        expect(repeated.events).toEqual([]);
    });
});
