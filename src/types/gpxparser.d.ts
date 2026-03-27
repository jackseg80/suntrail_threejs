/**
 * Déclarations de types pour gpxparser@3.x
 * @see https://github.com/Luuka/GPXParser.js
 */
declare module 'gpxparser' {
    export interface GPXPoint {
        lat: number;
        lon: number;
        ele: number;
        time?: Date;
    }

    export interface GPXTrackSegment {
        points: GPXPoint[];
    }

    export interface GPXDistanceInfo {
        total: number;
        cumul?: number[];
    }

    export interface GPXElevationInfo {
        min: number;
        max: number;
        avg: number;
        pos: number;
        neg: number;
    }

    export interface GPXTrack {
        name: string;
        cmt?: string;
        desc?: string;
        src?: string;
        type?: string;
        segments: GPXTrackSegment[];
        /** Points agrégés de tous les segments (raccourci fourni par gpxparser) */
        points: GPXPoint[];
        distance: GPXDistanceInfo;
        elevation: GPXElevationInfo;
        slopes: number[];
    }

    export interface GPXWaypoint {
        lat: number;
        lon: number;
        name?: string;
        cmt?: string;
        desc?: string;
        ele?: number;
        time?: Date;
    }

    export interface GPXRoute {
        name: string;
        cmt?: string;
        desc?: string;
        src?: string;
        type?: string;
        points: GPXPoint[];
        distance: GPXDistanceInfo;
        elevation: GPXElevationInfo;
        slopes: number[];
    }

    export default class GPXParser {
        tracks: GPXTrack[];
        waypoints: GPXWaypoint[];
        routes: GPXRoute[];
        parse(gpxString: string): void;
        calculateTotalDistance(points: GPXPoint[]): number;
    }
}
