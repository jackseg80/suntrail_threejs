/**
 * Keeps names shown in SunTrail human-readable across import, REC and export.
 * NFC is important on Android: the document picker can supply decomposed
 * characters (for example `e` + accent) even when the user entered `é`.
 */
export function normalizeTrackName(
    value: string,
    fallback = 'SunTrail'
): string {
    const normalized = value.normalize('NFC');
    const printable = [...normalized]
        .map((char) => {
            const code = char.charCodeAt(0);
            return code < 32 || code === 127 ? ' ' : char;
        })
        .join('');
    const cleaned = printable.replace(/\s+/g, ' ').trim();
    return cleaned || fallback;
}

/** Preserves accents in user-facing export names while removing invalid paths. */
export function toGPXFilename(name: string, timestamp = Date.now()): string {
    const safeName = normalizeTrackName(name)
        .replace(/[/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
    return `${safeName || 'SunTrail'}-${timestamp}.gpx`;
}
