import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  imageProblem,
  mediaKind,
  resolveMediaUrl,
  videoProblem,
} from './media.js';

// Only `type` and `size` are read, so a plain object stands in for a File.
const file = (type, size = 1024) => ({ type, size });
const MB = 1024 * 1024;

describe('mediaKind', () => {
  it('sorts files into image, video or neither', () => {
    expect(mediaKind(file('image/png'))).toBe('image');
    expect(mediaKind(file('video/mp4'))).toBe('video');
    expect(mediaKind(file('application/pdf'))).toBeNull();
  });
});

describe('videoProblem', () => {
  it('accepts MP4, MOV and WebM under the size limit', () => {
    expect(videoProblem(file('video/mp4', 50 * MB))).toBeNull();
    expect(videoProblem(file('video/quicktime'))).toBeNull();
    expect(videoProblem(file('video/webm'))).toBeNull();
  });

  it('rejects other video formats', () => {
    expect(videoProblem(file('video/x-msvideo'))).toMatch(/MP4, MOV and WebM/);
  });

  it('rejects a video over 100MB, naming its size', () => {
    expect(videoProblem(file('video/mp4', 150 * MB))).toMatch(/150\.0MB.*100MB/);
  });
});

describe('imageProblem', () => {
  it('rejects images over 2MB', () => {
    expect(imageProblem(file('image/png', MB))).toBeNull();
    expect(imageProblem(file('image/png', 3 * MB))).toMatch(/under 2MB/);
  });
});

describe('formatBytes', () => {
  it('uses KB below a megabyte and MB above', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(200)).toBe('1 KB');
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(12.5 * MB)).toBe('12.5 MB');
  });
});

describe('resolveMediaUrl', () => {
  const api = 'https://api.example.com/api';

  it('puts a stored path on the API origin, not under /api', () => {
    expect(resolveMediaUrl('/uploads/videos/u/v.mp4', api)).toBe(
      'https://api.example.com/uploads/videos/u/v.mp4'
    );
  });

  it('leaves an absolute CDN URL alone', () => {
    const cdn = 'https://cdn.example.com/v.mp4';
    expect(resolveMediaUrl(cdn, api)).toBe(cdn);
  });

  it('returns an empty string for no media', () => {
    expect(resolveMediaUrl('', api)).toBe('');
    expect(resolveMediaUrl(undefined, api)).toBe('');
  });
});
