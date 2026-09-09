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
Logo remains disabled. Ordinary page clicks no longer start a two-second tween
to 100%. Continuous visual acceptance remains manual.
