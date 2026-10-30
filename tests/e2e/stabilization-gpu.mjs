// Keep the v0.7.1 timing evidence intact and compare the same six viewpoints,
// plus low-quality touch EVA, using the shared hardware measurement runner.
process.env.GPU_REPORT_PREFIX='stabilization';
process.env.GPU_BASELINE='stabilization-gpu-baseline.json';
await import('./homecoming-gpu.mjs');
