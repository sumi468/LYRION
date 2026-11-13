# Next-generation expedition — implementation record

Request: 2026-10-30. Preserve v0.8.0 and its saves; implement the supplied brief in its required order. The primary playable flow is orbital approach → atmosphere/clouds → terrain landing → astronaut walking/investigation → boarding → return to orbit. New development stays off production until validated and authorized.

## Audit

- Baseline local code: `0d8d9bc` (v0.8 code plus release README); GitHub release branch has the same tree. Local histories are preserved; no reset or deletion.
- Existing: eight exploration missions, six independent expeditions, orbital station docking/services, independent EVA, 103 unit tests, 210 E2E checks, PBR astronaut, quality ladder, FPS measurements and v4 saves.
- Not implemented: surface walking, sampled terrain, surface research, functional planetary home base, WebGPU, app manifest/raster icons.
- Blocking current rules: `canLand()` explicitly excludes `homeworld`; landing uses a smooth sphere and radial altitude; H is deliberately blocked while landed. These are existing design limitations to replace with a separate surface mode, not to remove without replacement.
- Existing scale: PRIME radius310u versus ~15u ship and 2.06u astronaut; orbit720u. A single interpretation as metres makes PRIME miniature. Raw model scaling alone would leave collisions, saves, cameras and objectives inconsistent.
- Renderer: Three.js0.170.0, synchronous WebGLRenderer and GLSL ShaderMaterial for baking, planets, clouds, atmosphere, rings, sun, sky/stars and dust. WebGPU cannot render these materials unchanged. Existing procedural and PBR effects must remain represented.
- Save key `lyrion.save.v1`, save schema4. Ship pose, landed radial normal, legacy progress, expedition data and upgrades must survive. Original v0.8 ZIP and baseline logs remain recoverable.
- Latest registry checked: three0.187.0 / @types/three0.186.0. Use staged engine upgrades with checks, then a matched r186 runtime/type pair for the first verified migration. The r187 changes are reviewed, not silently assumed compatible.

## Scale contract

- Local ship, station, crew, collision geometry and velocities use metres/seconds. Keep the ~2.06m suit and ~15m exploration ship.
- Scale celestial radii, orbits and orbital structures by10,000 consistently: PRIME radius3,100,000m. Keep orbital positions pure functions of time and Floating Origin. Small hardware retains physical dimensions.
- Store absolute positions in double precision; build terrain vertices relative to small chunk anchors; subtract the floating origin before GPU transforms. Use a compatible depth strategy on each renderer.
- Old saves migrate using the original time-dependent system. Preserve physical surface clearance and relative velocity near a body; preserve normalized orbital location farther away. Keep legacy IDs, rewards and ordered progress. Back up the original serialized save before migration.
- Contextual cruise handles astronomical transit; near terrain/stations controls return to local speeds. HUD distances use m/km. Scanning, approach/landing thresholds and camera clipping are explicit parts of the contract.

## Ordered work and acceptance gates

1. Audit baseline, protect pending v0.8 release/history, record executable regressions.
2. Implement/test scale conversions and save migration before activating the new world scale.
3. Isolate renderer lifecycle/capability selection. Migrate GLSL effects to TSL for actual WebGPU rendering, retaining the classic WebGL2 path and explicit safe fallback. Test adapter/device/render success, not API presence.
4. Deterministic spherical terrain, bounded chunk LOD, seams, ocean, atmospheric sky and cloud transition. Match physics samples and rendering; preserve horizon/curvature.
5. Continuous descent/landing/takeoff using sampled ground and a common rotating surface frame. Complete PRIME first.
6. Surface gravity, walking/idle poses, slope/step contact, boarding and research; keep free EVA unchanged.
7. Walkable PRIME base with functional service points and existing upgrade/log/mission APIs.
8. Preserve station frame synchronization/docking/EVA; recheck at the new celestial scale.
9. Independent FIRST STEPS surface progression/reward/save alongside existing8+6; state-specific HUD and PC/touch controls.
10. Original vector icon plus required PNG/ICO/maskable exports, manifest and home-screen launch checks.
11. Actual GPU timings and resource stability in space, orbit, entry, surface/base, station, EVA and combat; adjust quality ladder from measurements.
12. Full type/unit/build/E2E, old-save fixtures, actual visual inspection of all11 requested views. Record any unfinished or unverified item without claiming completion.

## Sources

- https://threejs.org/manual/pages/webgpurenderer
- https://github.com/mrdoob/three.js/wiki/Migration-Guide

Implementation and test results will be appended as each gate is completed.

### Gate0 / protected baseline

- v0.8 production release completed under the previous explicit publish request: GitHub main`4a298a05fdbc38dc5f731eaa0f268753dcab0384`, public version0.8.0. Public Chrome test loaded all6missions, docked and entered EVA with0consoleerrors (`work/v08-production.json`).
- New work is isolated on `codex/planetary-exploration`, with no main upstream configured and no production deployment of these changes.
- Fresh baseline103units and13stabilization browser regressions passed. Original v0.8ZIP/history and copied baseline measurements remain intact.

### Gate1 / scale contract foundation

- Added executable conversion utilities, exact horizon distance, shared tilted/spinning body orientation and save-pose migration math in `physics/worldScale.ts`.
- Five unit regressions and strict TypeScript passed. They cover coherent radius/orbit/ring scaling, fixed hardware dimensions, kilometre-scale horizon, deterministic orientation, near-surface clearance/relative speed and metre-sized station offsets.
- The new celestial data is deliberately not activated until the renderer/terrain and save migration are connected. Existing flight remains playable during this foundation step; scale redesign is not yet claimed complete.

### Current implemented gates / 2026-10-31

- Native rendering foundation: matched Three.js/types0.186, asynchronous adapter/device initialization, actual WebGPU draws on RTX4060, TSL equivalents for every registered custom shader, explicit WebGL2 fallback, lost-device save/restart and backend selection/status UI.
- Activated the metre-scale world: PRIME radius3,100,000m, all celestial distances and periods transformed together; hardware stays in local metres. v5 migration preserves progress, metre-scale hardware clearances/orientation and a raw backup before overwriting v1–4.
- Shared terrain/frame integration: deterministic spherical field, bounded best-first cube patches, skirts, local chunk anchors, curved ocean, common landing/walking/collision/return-route queries, matching PRIME orbital albedo, altitude-dependent sky/cloud transition and explicit disposal/eviction.
- Completed the primary vertical slice in both rendering APIs: land, exit, gravity/grounding/walk/jump, timed research, report, walk back, board, continuous takeoff and powered ascent to120km. A separate no-teleport test flew from the original orbital start through the cloud layer and landed without damage.
- Added permanent base exteriors and functioning control/research/service/comms terminals. The ISS-style station and all original8+6missions remain, with their browser regressions. FIRST STEPS has independent progress/reward/save and explicit switching back to existing missions.
- Original icon family, manifest and build-generated offline cache; offline boot/save recovery tested. Source artwork and export commands are local.
- This is a tested development milestone, not completion of every art/platform/performance gate. The Japanese results, screenshots, measured conditions and remaining work are in `NEXTGEN-VALIDATION.md` and the linked validation JSON files.
