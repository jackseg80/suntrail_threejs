package com.suntrail.threejs.guidance;

import java.util.Collections;
import java.util.List;

public final class GuidanceUpdate {
    public final GuidanceSnapshot snapshot;
    public final List<String> events;
    public final boolean acceptedPosition;

    public GuidanceUpdate(GuidanceSnapshot snapshot, List<String> events, boolean acceptedPosition) {
        this.snapshot = snapshot;
        this.events = Collections.unmodifiableList(events);
        this.acceptedPosition = acceptedPosition;
    }
}
