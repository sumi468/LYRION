import { preview } from 'vite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

export const { chromium, firefox } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
export const SHOTS = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function serve(port) {
  const server = await preview({ preview: { host: '127.0.0.1', port, strictPort: true } });
  return { url: `http://127.0.0.1:${port}/?debug`, close: () => server.httpServer.close() };
}
export const launchOptions = () => ({
  headless: process.env.HEADED !== '1',
  ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } :
    process.platform === 'win32' && existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? { channel: 'chrome' } : {}),
  args: process.env.SOFTWARE_GL === '1'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : (process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
});
export async function graphicsInfo(page) {
  return page.evaluate(() => {
    const gl = document.getElementById('game-canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      hardware: ext ? !/swiftshader|llvmpipe|software|basic render/i.test(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null,
    };
  });
}
