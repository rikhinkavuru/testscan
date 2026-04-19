import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // 150MB
const MAX_VIDEO_DURATION_SEC = 30 * 60; // 30 minutes
const MAX_EXTRACTED_FRAMES = 45;
const BASE_FPS = 0.5;
const MIN_FPS = 0.1;
const TARGET_WIDTH = 480;

export async function initFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  
  ffmpeg = new FFmpeg();
  
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  
  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });
  
  return ffmpeg;
}

function getPixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const ctx = canvas.getContext('2d')!;
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function isOutOfBoundsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('memory access out of bounds');
}

function ensureBlobUrl(url: string): string {
  if (!url.startsWith('blob:')) {
    throw new Error('Invalid local media URL.');
  }
  return url;
}

function computeFrameFilter(durationSeconds: number): string {
  const targetFps =
    durationSeconds > 0
      ? Math.max(MIN_FPS, Math.min(BASE_FPS, MAX_EXTRACTED_FRAMES / durationSeconds))
      : BASE_FPS;
  // `-2` keeps aspect ratio while forcing an even height for JPEG/video codec compatibility.
  return `fps=${targetFps.toFixed(4)},scale=${TARGET_WIDTH}:-2`;
}

async function readVideoDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');

  try {
    const duration = await new Promise<number>((resolve, reject) => {
      video.preload = 'metadata';
      video.onloadedmetadata = () => resolve(video.duration || 0);
      video.onerror = () => reject(new Error('Unable to read video metadata.'));
      video.src = ensureBlobUrl(url);
    });

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Uploaded video has invalid metadata.');
    }

    return duration;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
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
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Video is too large for local processing. Please upload a file under 150MB.');
  }

  const durationSeconds = await readVideoDuration(file);
  if (durationSeconds > MAX_VIDEO_DURATION_SEC) {
    throw new Error('Video is too long for local processing. Please keep uploads under 30 minutes.');
  }

  const frameFilter = computeFrameFilter(durationSeconds);
  const ff = await initFFmpeg();
  
  const filename = 'input.mp4';
  try {
    await ff.writeFile(filename, await fetchFile(file));

    try {
      await ff.createDir('out');
    } catch {
      // Folder can already exist from a previous run.
    }

    await ff.exec([
      '-i', filename,
      '-an',
      '-sn',
      '-vf', frameFilter,
      '-q:v', '6',
      '-frames:v', `${MAX_EXTRACTED_FRAMES}`,
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

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    for (const frame of frames) {
      const frameData = await ff.readFile(`out/${frame.name}`);
      if (!(frameData instanceof Uint8Array)) {
        throw new Error(`Unexpected FFmpeg frame data for ${frame.name}.`);
      }
      const frameBytes = Uint8Array.from(frameData);
      const blob = new Blob([frameBytes], { type: 'image/jpeg' });

      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error(`Failed to decode extracted frame ${frame.name}.`));
          img.src = ensureBlobUrl(url);
        });

        if (!lastPixelData) {
          canvas.width = img.width;
          canvas.height = img.height;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const currentPixels = getPixels(canvas);

        if (lastPixelData && isSimilar(lastPixelData, currentPixels, 0.90)) {
          continue;
        }

        lastPixelData = currentPixels;
        const dataUrl = await blobToBase64(blob);
        const base64Data = dataUrl.split(',')[1];

        validFrames.push({
          base64: dataUrl,
          rawBase64Data: base64Data
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    for (const frame of frames) {
      await ff.deleteFile(`out/${frame.name}`);
    }

    return validFrames;
  } catch (error) {
    if (isOutOfBoundsError(error)) {
      throw new Error('Video is too large or too detailed for local processing. Try a shorter clip or lower resolution.');
    }
    throw error;
  } finally {
    try {
      await ff.deleteFile(filename);
    } catch {
      // File may already be removed.
    }
    try {
      await ff.deleteDir('out');
    } catch {
      // Directory may not exist.
    }
  }
}
