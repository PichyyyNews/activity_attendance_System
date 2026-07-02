/**
 * cyrb53 hash function (fast, non-cryptographic, 53-bit hash)
 * Produces a stable, unique 16-character hexadecimal string.
 */
const cyrb53 = (str: string, seed = 0): string => {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
};

/**
 * Individual device signal components for composite identification.
 * Sent separately to the backend so it can calculate similarity scores
 * instead of relying on a single hash match.
 */
export interface DeviceSignals {
  hardwareFingerprint: string;    // hw_xxx (composite hash of all hardware traits)
  screenInfo: string;             // "WIDTHxHEIGHT|COLOR_DEPTH"
  cpuCores: number;
  deviceMemory: number | null;
  timezone: string;
  platform: string;
  os: string;
  gpuVendor: string;
  gpuRenderer: string;
  canvasHash: string;
  batteryLevel: number | null;    // 0.0 - 1.0 (percentage / 100)
  userAgent: string;              // Full User-Agent string
}

/**
 * Generates a hardware-based device fingerprint.
 * Designed to be stable across different browsers on the same device (e.g. Chrome, Safari, LINE webview).
 * Excludes browser-specific traits (like full User Agent or browser plugins) and hashes hardware/OS traits.
 */
export async function getHardwareFingerprint(): Promise<string> {
  const parts: string[] = [];

  // 1. Screen size & color depth (Hardware display info)
  parts.push(`${window.screen.width}x${window.screen.height}`);
  parts.push(String(window.screen.colorDepth || 24));

  // 2. CPU cores
  parts.push(String(navigator.hardwareConcurrency || 4));

  // 3. Device Memory (if supported by browser, e.g. 4, 8)
  if ('deviceMemory' in navigator) {
    parts.push(String((navigator as any).deviceMemory));
  }

  // 4. Timezone (Device locale settings)
  try {
    parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  } catch (e) {
    parts.push('UTC');
  }

  // 5. OS / Platform (Extracted stable OS name from UserAgent + navigator.platform)
  const platform = navigator.platform || '';
  parts.push(platform);

  const ua = navigator.userAgent.toLowerCase();
  let os = 'unknown';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    os = 'ios';
  } else if (ua.includes('android')) {
    os = 'android';
  } else if (ua.includes('win')) {
    os = 'windows';
  } else if (ua.includes('mac')) {
    os = 'macos';
  } else if (ua.includes('linux')) {
    os = 'linux';
  }
  parts.push(os);

  // 6. WebGL Renderer & Vendor (Direct GPU hardware info)
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const vendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
        const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
        parts.push(vendor);
        parts.push(renderer);
      }
    }
  } catch (e) {
    // Ignore WebGL exceptions
  }

  // 7. Canvas Rendering Signature
  // Renders a shape + multi-colored text to canvas. Different GPU/OS render engines rasterize fonts slightly differently.
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = "14px 'Arial', sans-serif";
      ctx.fillStyle = '#f60';
      ctx.fillRect(10, 10, 50, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('ActivityAttendanceFingerprint', 5, 5);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('ActivityAttendanceFingerprint', 7, 7);
      
      // Hash of the canvas data URI
      const dataUrl = canvas.toDataURL();
      parts.push(cyrb53(dataUrl));
    }
  } catch (e) {
    // Ignore Canvas exceptions
  }

  // Combine all parts and hash it
  const fingerPrintStr = parts.join('||');
  const finalHash = cyrb53(fingerPrintStr);
  
  return `hw_${finalHash}`;
}

/**
 * Collects individual device signals for composite identification.
 * Returns separate components so the backend can calculate similarity scores
 * rather than relying on a single hash match.
 * 
 * This function calls getHardwareFingerprint() internally and additionally
 * collects Battery API data and the full User-Agent string.
 */
export async function getDeviceSignals(): Promise<DeviceSignals> {
  // Get the composite hardware fingerprint hash
  const hardwareFingerprint = await getHardwareFingerprint();

  // Collect individual signal components
  const screenInfo = `${window.screen.width}x${window.screen.height}|${window.screen.colorDepth || 24}`;
  const cpuCores = navigator.hardwareConcurrency || 4;
  const deviceMemory = ('deviceMemory' in navigator) ? (navigator as any).deviceMemory : null;

  let timezone = 'UTC';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (e) {
    // fallback
  }

  const platform = navigator.platform || '';
  const ua = navigator.userAgent;
  const uaLower = ua.toLowerCase();
  let os = 'unknown';
  if (uaLower.includes('iphone') || uaLower.includes('ipad') || uaLower.includes('ipod')) {
    os = 'ios';
  } else if (uaLower.includes('android')) {
    os = 'android';
  } else if (uaLower.includes('win')) {
    os = 'windows';
  } else if (uaLower.includes('mac')) {
    os = 'macos';
  } else if (uaLower.includes('linux')) {
    os = 'linux';
  }

  // WebGL GPU info
  let gpuVendor = '';
  let gpuRenderer = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        gpuVendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
        gpuRenderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
      }
    }
  } catch (e) {
    // Ignore
  }

  // Canvas hash
  let canvasHash = '';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = "14px 'Arial', sans-serif";
      ctx.fillStyle = '#f60';
      ctx.fillRect(10, 10, 50, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('ActivityAttendanceFingerprint', 5, 5);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('ActivityAttendanceFingerprint', 7, 7);
      const dataUrl = canvas.toDataURL();
      canvasHash = cyrb53(dataUrl);
    }
  } catch (e) {
    // Ignore
  }

  // Battery API (may not be available on all browsers/devices)
  let batteryLevel: number | null = null;
  try {
    if ('getBattery' in navigator) {
      const battery = await (navigator as any).getBattery();
      batteryLevel = battery.level; // 0.0 to 1.0
    }
  } catch (e) {
    // Battery API not available or blocked
  }

  return {
    hardwareFingerprint,
    screenInfo,
    cpuCores,
    deviceMemory,
    timezone,
    platform,
    os,
    gpuVendor,
    gpuRenderer,
    canvasHash,
    batteryLevel,
    userAgent: ua,
  };
}
