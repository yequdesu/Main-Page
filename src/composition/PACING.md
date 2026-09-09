# Presentation pacing

Page distance and the linear scrollbar/status progress are unchanged. Do not
write eased progress into the scroll store. `act1AnimationProgress` is a pure,
reversible animation clock applied to the miniature's draw/tumble and white-fill
phases. Both retain their page endpoints and original pose curves. The clock
slows each phase's start and finish, with the main movement in its middle.

Scale/containment use that clock before legacy trajectory mapping; edge drawing,
rotation and whitening use it through timeline progress. Particle motion and scan
events use the same clock. Historical scan projection inverts the clock before
requesting a miniature transform, avoiding double easing. Lighthouse intensity
and ocean-volume reveal also follow it. Ambient wind/waves retain real time.

Later milestones (rounded **page** percentages, not legacy source milestones):

| Event | Start | End |
| --- | ---: | ---: |
| Title writing (unchanged) | 41.05% | 49.47% |
| Complete title hold | 49.47% | 52.97% |
| Title fade | 52.97% | 64.20% |
| Geometric satellite retraction | 60.47% | 70.00% |
| Planet flights / system zoom (unchanged) | 57.89% | 71.93% |
| Six staggered orbit traces | 67.02% | 77.54% |
| Complete white-system hold | 77.54% | 79.65% |
| Act3 crossfade | 79.65% | 86.67% |
| Orbit motion resume | 86.67% | 93.68% |

Geometric satellites retain expansion timing, angular speed, retraction duration
and easing. Their extra duration is entirely in the orbit hold, not slower
retraction. They intentionally overlap the planet flights before disappearing
at 70%. Orbit tracers retain their previous flight duration and stagger; only
their launch window moves. All reverse playback is scroll-analytic.

The completed white system must hold before the shared Canvas/WebGL crossfade.
Act3 interaction gates use the same new entry milestone as the end of that fade.
The Act3 completion logo remains disabled. Ordinary page clicks no longer start
a two-second tween to 100%. Continuous visual acceptance remains manual.

## Input-energy gates

Two gates clamp scene and scrollbar progress: before whitening (26.32%) and at
the end of square-to-vector replacement (52.98%). The latter is also the title
fade's exact start, so the complete Act2 logo remains fully visible while held.
These are real input gates, not extra scroll-distance plateaus. Public Lusion
work (<https://lusion.co/>) is an interaction reference, not a copied runtime.

Only new wheel/touch/keyboard input adds energy. A capped contribution prevents
one large delta from filling the capsule. Application inertia never contributes;
decaying trackpad wheel tails use a heuristic because WheelEvent supplies no
portable momentum flag. Energy leaks at .3/s after a 160ms input grace period.
Re-entry after a completed charge doubles the gain; abandoned attempts do not.
Completion history is separate per gate and memory-only. Reverse input exits
immediately and rearms gates crossed on the way back. Native scrollbar jumps
are clamped too; subsequent deliberate gutter dragging can charge the gate.

Displayed progress and the scrollbar settle together with a .18s exponential
response, including after a gate clamps the input target. All scene actors see
the same eased progress. The cube introduces gentle three-axis motion before
the first gate, using a .45s velocity response, while scanning loops slowly.
Full charge unlocks immediately; face alignment belongs to the normal whitening
interval, with no additional wait. Rewinding clears the hold pose and returns
to the authored transform with a short visual blend, not a persistent offset.
Face projection chooses the visible side face, not a hard-coded -Z face.
Whitening still matches the current camera exactly at the handoff.
The second hold adds real-time orbit phase; its accumulated offset is preserved
after release and eased away through the preceding phase on reverse playback.
Neither hold regenerates the scene's particles or geometric satellites.

The energy overlay is a pointer-transparent SVG capsule, top centered with a
safe-area offset. Only changed energy values update its DOM. The vector orbit
Canvas redraws during its hold without raster sampling or image reads. Pause
rotation and input energy live separately from the linear scroll store.
