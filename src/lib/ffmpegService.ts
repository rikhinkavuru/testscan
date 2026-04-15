import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function initFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;

  const coreBaseUrls = [
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/umd',
    'https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/umd',
  ];
  let lastError: unknown = null;

  for (const baseURL of coreBaseUrls) {
    const candidate = new FFmpeg();
    candidate.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    try {
      const [coreURL, wasmURL, workerURL] = await withTimeout(
        Promise.all([
          toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
          toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
        ]),
        30000,
        `Timed out while downloading FFmpeg core from ${baseURL}`,
      );

      await withTimeout(
        candidate.load({ coreURL, wasmURL, workerURL }),
        60000,
        `Timed out while loading FFmpeg core from ${baseURL}`,
      );

      ffmpeg = candidate;
      return ffmpeg;
    } catch (error) {
      lastError = error;
      console.error(`[FFmpeg] Failed to initialize from ${baseURL}`, error);
    }
  }

  throw new Error(
    `Unable to initialize FFmpeg from configured sources.${lastError ? ` Last error: ${String(lastError)}` : ''}`,
  );
}

function getPixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const ctx = canvas.getContext('2d')!;
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

// Simple pixel-based diff
function isSimilar(data1: Uint8ClampedArray, data2: Uint8ClampedArray, threshold: number = 0.95): boolean {
  if (data1.length !== data2.length) return false;
  
  let matchCount = 0;
  
  // Sample every 4th pixel for speed (stride of 16 in raw byte array)
  let samples = 0;
  for (let i = 0; i < data1.length; i += 16) {
    samples++;
    const rDiff = Math.abs(data1[i] - data2[i]);
    const gDiff = Math.abs(data1[i+1] - data2[i+1]);
    const bDiff = Math.abs(data1[i+2] - data2[i+2]);
    // If the pixel is roughly the same color
    if (rDiff < 20 && gDiff < 20 && bDiff < 20) {
      matchCount++;
    }
  }
  
  return (matchCount / samples) >= threshold;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.readAsDataURL(blob);
  });
}

export async function extractAndDeduplicateFrames(file: File): Promise<{ base64: string, rawBase64Data: string }[]> {
  const ff = await initFFmpeg();
  
  const filename = 'input.mp4';
  await ff.writeFile(filename, await fetchFile(file));
  
  // Create a directory to output frames
  try {
    await ff.createDir('out');
  } catch (_error) {}
  
  // Extract 1 frame every 2 seconds (-r 0.5)
  // Scale down a bit to speed up processing and save memory, if needed. 
  // Let's use 1280x720 (720p) max.
  await ff.exec([
    '-i', filename,
    '-an',
    '-sn',
    '-r', '0.5',
    '-vf', 'scale=640:-1',
    '-q:v', '5',
    'out/frame_%d.jpg'
  ]);
  
  const files = await ff.listDir('out');
  const frames = files.filter(f => f.name.endsWith('.jpg')).sort((a, b) => {
    const matchA = a.name.match(/\d+/);
    const matchB = b.name.match(/\d+/);
    const numA = matchA ? parseInt(matchA[0], 10) : 0;
    const numB = matchB ? parseInt(matchB[0], 10) : 0;
    return numA - numB;
  });

  const validFrames: { base64: string, rawBase64Data: string }[] = [];
  let lastPixelData: Uint8ClampedArray | null = null;
  
  // Hidden canvas for analyzing image data
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  for (const frame of frames) {
    const frameData = await ff.readFile(`out/${frame.name}`);
    const blob = new Blob([frameData], { type: 'image/jpeg' });
    
    // Convert to Image to draw on canvas for pixel comparison
    const url = URL.createObjectURL(blob);
    const img = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`Failed to decode frame ${frame.name}`));
        img.src = url;
      });

      if (!lastPixelData) {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const currentPixels = getPixels(canvas);

      if (lastPixelData && isSimilar(lastPixelData, currentPixels, 0.90)) {
        // It's a duplicate frame, skip
        continue;
      }
      
      lastPixelData = currentPixels;
      const dataUrl = await blobToBase64(blob);
      const base64Data = dataUrl.split(',')[1];
      
      validFrames.push({
        base64: dataUrl,
         // raw base64 without data:image/jpeg;base64, prefix for API
        rawBase64Data: base64Data
      });
    } catch (error) {
      console.warn(`[FFmpeg] Skipping unreadable frame ${frame.name}`, error);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  
  // Cleanup
  await ff.deleteFile(filename);
  for (const frame of frames) {
    await ff.deleteFile(`out/${frame.name}`);
  }
  try {
    await ff.deleteDir('out');
  } catch (_error) {}
  
  return validFrames;
}
