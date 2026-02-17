/**
 * Custom hook for keyboard-driven video controls.
 *
 * Returns a React keyboard event handler that provides YouTube-style shortcuts
 * when the video element has focus.
 *
 * Supported shortcuts:
 *   K / Space  — Play / Pause toggle
 *   F          — Fullscreen toggle
 *   M          — Mute toggle
 *   J          — Seek backward 10 s
 *   L          — Seek forward  10 s
 *   ArrowLeft  — Seek backward 5 s
 *   ArrowRight — Seek forward  5 s
 *   ArrowUp    — Volume up   (+10 %)
 *   ArrowDown  — Volume down  (−10 %)
 *   0–9        — Jump to 0 %–90 % of duration
 *   Home       — Jump to beginning
 *   End        — Jump to end
 *   , (paused) — Step back  1 frame  (~1/30 s)
 *   . (paused) — Step forward 1 frame (~1/30 s)
 *   < (Shift+,)— Decrease playback rate
 *   > (Shift+.)— Increase playback rate
 */
import { useCallback, type RefObject } from 'react';

const SEEK_SHORT = 5;
const SEEK_LONG = 10;
const VOLUME_STEP = 0.1;
const FRAME_STEP = 1 / 30;
const PLAYBACK_RATE_STEP = 0.25;
const PLAYBACK_RATE_MIN = 0.25;
const PLAYBACK_RATE_MAX = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function useVideoKeyboard(
  videoRef: RefObject<HTMLVideoElement | null>,
): (e: React.KeyboardEvent<HTMLVideoElement>) => void {
  return useCallback(
    (e: React.KeyboardEvent<HTMLVideoElement>): void => {
      const video = videoRef.current;
      if (video === null) return;

      // Ignore if modifier keys are held (except Shift which is used for < / >)
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      switch (e.key) {
        // ---- Play / Pause ----
        case 'k':
        case 'K':
        case ' ': {
          e.preventDefault();
          if (video.paused) {
            void video.play();
          } else {
            video.pause();
          }
          break;
        }

        // ---- Fullscreen ----
        case 'f':
        case 'F': {
          e.preventDefault();
          if (document.fullscreenElement === video) {
            void document.exitFullscreen();
          } else {
            void video.requestFullscreen();
          }
          break;
        }

        // ---- Mute ----
        case 'm':
        case 'M': {
          e.preventDefault();
          video.muted = !video.muted;
          break;
        }

        // ---- Seek backward 10 s ----
        case 'j':
        case 'J': {
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - SEEK_LONG);
          break;
        }

        // ---- Seek forward 10 s ----
        case 'l':
        case 'L': {
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + SEEK_LONG);
          break;
        }

        // ---- Seek backward 5 s ----
        case 'ArrowLeft': {
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - SEEK_SHORT);
          break;
        }

        // ---- Seek forward 5 s ----
        case 'ArrowRight': {
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + SEEK_SHORT);
          break;
        }

        // ---- Volume up ----
        case 'ArrowUp': {
          e.preventDefault();
          video.volume = clamp(video.volume + VOLUME_STEP, 0, 1);
          break;
        }

        // ---- Volume down ----
        case 'ArrowDown': {
          e.preventDefault();
          video.volume = clamp(video.volume - VOLUME_STEP, 0, 1);
          break;
        }

        // ---- Jump to beginning ----
        case 'Home': {
          e.preventDefault();
          video.currentTime = 0;
          break;
        }

        // ---- Jump to end ----
        case 'End': {
          e.preventDefault();
          video.currentTime = video.duration;
          break;
        }

        // ---- Frame step (when paused) ----
        case ',': {
          if (e.shiftKey) {
            // Shift+, = < : decrease playback rate
            e.preventDefault();
            video.playbackRate = clamp(
              video.playbackRate - PLAYBACK_RATE_STEP,
              PLAYBACK_RATE_MIN,
              PLAYBACK_RATE_MAX,
            );
          } else if (video.paused) {
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - FRAME_STEP);
          }
          break;
        }

        case '.': {
          if (e.shiftKey) {
            // Shift+. = > : increase playback rate
            e.preventDefault();
            video.playbackRate = clamp(
              video.playbackRate + PLAYBACK_RATE_STEP,
              PLAYBACK_RATE_MIN,
              PLAYBACK_RATE_MAX,
            );
          } else if (video.paused) {
            e.preventDefault();
            video.currentTime = Math.min(video.duration, video.currentTime + FRAME_STEP);
          }
          break;
        }

        // ---- Percentage seek (0–9) ----
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9': {
          if (!e.shiftKey && Number.isFinite(video.duration)) {
            e.preventDefault();
            const pct = Number(e.key) / 10;
            video.currentTime = video.duration * pct;
          }
          break;
        }

        default:
          break;
      }
    },
    [videoRef],
  );
}
