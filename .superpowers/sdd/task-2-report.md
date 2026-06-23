# Task 2 Report: useAnchorAvoidance — 锚点避让纯函数

## Summary

Created the `calcAnchorPositions` pure function module with 6 passing unit tests.

## Files Created

- `src/behaviors/useAnchorAvoidance.ts` — pure function module with `AnchorInput`, `AnchorResult`, `calcAnchorPositions`
- `src/behaviors/__tests__/useAnchorAvoidance.test.ts` — 6 unit tests

## Test Results

```
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

All 6 tests pass:
1. returns three results for three inputs
2. places pill above planet by default
3. returns {0,0} for invisible planets
4. avoids overlapping pills by shifting outer ones
5. keeps pills within viewport bounds
6. expanded pill gets extra space

## Commit

```
e53bebb feat(behavior): add useAnchorAvoidance — collision-free pill positioning algorithm
```

## Interfaces Exported

- `AnchorInput`: `{ screenX, screenY, visible, trackIdx, expanded? }`
- `AnchorResult`: `{ x, y, expanded }`
- `calcAnchorPositions(inputs, viewport, collapsedW, expandedW) => [AnchorResult, AnchorResult, AnchorResult]`

## Fix (Task 2 Review, 2026-06-20)

Two review findings fixed:

**Fix 1:** Removed dead variable `_inner` from collision resolution loop (line 122, assigned but never read).

**Fix 2:** Exported `overlaps` function and added `pillRectsOverlap` convenience export. Tests 4 and 6 now use `pillRectsOverlap` instead of ad-hoc `Math.abs` overlap checks.

All 6 tests continue to pass.

## Algorithm Notes

- Inner-to-outer collision resolution (trackIdx 0 highest priority)
- AABB overlap detection with configurable tolerance
- 4 candidate slide directions (up, down, right, left), cycling per attempt
- Fallback: push to viewport bottom row if collision persists after 3 slides
- Viewport clamping with 12px margin
- Invisible planets return {x:0, y:0}
