# LX-EVA pressure suit

The astronaut is an original, locally generated LYRION model in `src/render/AstronautModel.ts`. It replaces the former spherical head, box torso and straight cylindrical limbs. No downloaded model, NASA mark, third-party texture or runtime asset service is used.

## Structure and materials

The major soft volumes use closed tailored lofts with changing elliptical/superelliptical cross-sections. Separate shoulder, elbow, hip and knee pivots retain a human silhouette in free drift and during work. Sleeves and trouser legs taper into articulated cloth bellows; gloves have opposed thumbs and four shaped finger tips. The boot has a rounded last, toe reinforcement, heel and outsole. The helmet's custom shell surrounds a curved gold-coated visor rather than an oversized solid sphere.

The hard upper section carries a protected display/control module, switch sockets, service couplings and restrained cyan LYRION identity patches. Metal neck, shoulder and wrist bearings join the pressure garment to hard components. The rear life-support assembly has a shaped thermal cover, rails, venting and two service hoses. Small seams follow the garment instead of making the suit look like rigid robot armor.

Fabric uses a rough, lightly sheened PBR material, metal uses a rough metallic finish, and the visor uses a reflective metallic coating and clearcoat. Two deterministic 128 × 128 RGBA maps provide a low-amplitude fabric weave normal and roughness variation. One 128 × 64 RGBA orbital reflection map is generated once for the visor and metal. These maps require 160 KiB before mipmaps (roughly 214 KiB with mipmaps) and no per-frame image generation or reflection-camera render.

## Scale, animation and performance

The suit is approximately 2.06 u high including the protective helmet and boot, with a neutral width of 1.09 u and depth of .94 u. One u is treated as approximately one metre for the astronaut and LX-07. Its physics origin remains at the waist region so existing frame transforms and save data do not change. Collision and camera clearance must protect the full suit, not only a small sphere at its origin.

The final source contains 40,752 triangles and 38 material batches, including six individually toggled RCS plumes (32 solid batches). The actual neutral-pose dimensions and rendering identity are measured from the game in `docs/validation/astronaut-visuals.json`. The geometry regression test caps the complete model below 50,000 triangles and 42 batches. Static parts are merged by material within each independently animated limb. Fine seams, fasteners, helmet lamps and backpack vent details are hidden at the lower quality levels; silhouette, joints, life-support unit, visor, hands and boots remain present.

Vertex sweeps cover 180 launch, maximum-speed movement, work and return poses for both newly constructed and reused suits. Recorded local extents remain within X [-.69, .78], Y [-1.10, 1.04], Z [-.82, .64] u. The maximum three-dimensional distance from the hips is below 1.20 u, including the brief departure side-step and boots; maximum lateral distance is approximately .884 u. Reused-suit poses and idle phases slightly change the exact extrema; the actual rendered values remain in the validation report. The model regression checks every unique posed vertex against the exported collision-sphere union with at least .01 u clearance, and checks return-route padding against both the mesh and the complete physics envelope. This protects hands, backpack and helmet at arbitrary world orientations, as well as the feet.

The model reads existing `EvaSystem` position, rotation, local velocity, thrust and return state. Smooth, time-based poses cover airlock departure, free drift, movement, work and return. Small cold-gas plumes indicate maneuvering. They do not create lights or alter physics. Reboarding uses a short visual hatch transition; emergency recovery uses a shorter fade. Animation advances with simulation time, so pausing the game also pauses the pose.

`ExpeditionView.astronaut` remains the world-space suit group; `astronautModel` exposes the articulated rig and `resetPose()` for deterministic review. Floating-origin placement stays in `ExpeditionView`. The model owns all merged geometries, generated textures and materials, disposes each once and removes its group before the containing view disposes station hardware. Repeated `dispose()` calls are safe.

## Reference and licensing

NASA's [Spacewalk Spacesuit Basics](https://www.nasa.gov/centers-and-facilities/johnson/spacewalk-spacesuit-basics/) describes the pressure garment, helmet, gloves, display/control module and primary life-support system that informed this model's component arrangement. The [xEMU development overview](https://ntrs.nasa.gov/citations/20210023541) provided additional structural reference. Both are primary technical references; the LX-EVA is a fictional game suit rather than a certified representation of NASA hardware.

NASA also publishes an [EMU 3D resource](https://science.nasa.gov/3d-resources/extravehicular-mobility-unit/), but that model is **not incorporated**. The original tailored geometry allows predictable articulation and a small self-contained material budget. NASA's [media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) were consulted; NASA insignia and marks are not used. All geometry and generated map data in this implementation are original project code/assets under the repository's existing terms.

## Reproducible visual review

After building the integrated game, run `node tests/e2e/astronaut-visuals.mjs`. It captures the actual game's model, scene, lighting and renderer at a fixed EVA location. Only the camera and HUD visibility are changed for inspection:

- `docs/screenshots/90-astronaut-front.png`
- `docs/screenshots/90-astronaut-side.png`
- `docs/screenshots/90-astronaut-back.png`
- `docs/screenshots/90-astronaut-beside-lx07.png`
- `docs/screenshots/90-astronaut-station-eva.png`

The runner records the rendered build identity, console errors, graphics identity and complete animated bounds. It also reads a 120 × 120 pixel region of the opaque suit belly immediately after rendering with the two sun glow sprites visible and hidden. The maximum channel difference must be at most one, preventing the former glow-through-suit rendering bug. It does not claim display FPS or hardware performance from a screenshot. Hardware timing and repeated-EVA resource stability are covered separately by the integrated game audit.
