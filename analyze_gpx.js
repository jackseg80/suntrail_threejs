
const fs = require('fs');

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function parseGPX(content) {
    const points = [];
    const trkptMatches = content.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)">[\s\S]*?<ele>([^<]+)<\/ele>[\s\S]*?<\/trkpt>/g);
    for (const match of trkptMatches) {
        points.push({
            lat: parseFloat(match[1]),
            lon: parseFloat(match[2]),
            alt: parseFloat(match[3])
        });
    }
    return points;
}

function analyze(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const points = parseGPX(content);
    
    let dist = 0;
    let dPlus = 0;
    let dMinus = 0;
    
    // Smooth alts
    const smoothedAlts = points.map((p, i) => {
        if (i === 0 || i === points.length - 1) return p.alt;
        return (points[i - 1].alt + p.alt + points[i + 1].alt) / 3;
    });

    for (let i = 1; i < points.length; i++) {
        dist += haversineDistance(points[i-1].lat, points[i-1].lon, points[i].lat, points[i].lon);
        const diff = smoothedAlts[i] - smoothedAlts[i-1];
        if (diff > 0) dPlus += diff;
        else dMinus += Math.abs(diff);
    }

    console.log(`File: ${filePath}`);
    console.log(`Points: ${points.length}`);
    console.log(`Distance: ${dist.toFixed(3)} km`);
    console.log(`D+: ${dPlus.toFixed(1)} m`);
    console.log(`D-: ${dMinus.toFixed(1)} m`);
    console.log('---');
}

analyze('gpx/old/activity_22444603883.gpx');
analyze('gpx/old/suntrail-2026-04-07-1775591796326.gpx');
