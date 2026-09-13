export function formatTrackDisplayName(value: string): string {
    const displayName = value.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
    return displayName || value;
}
