'use client';

import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import type { ListeningPart } from '@/types/test';

// Format seconds into MM:SS format
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

interface ListeningAudioContextType {
  activePartId: string;
  activePart: ListeningPart | undefined;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  isStickyVisible: boolean;
  isStickyDismissed: boolean;
  dismissSticky: () => void;
  playPart: (partId: string) => void;
  togglePlayPause: (partId?: string) => void;
  seek: (time: number) => void;
  skip: (delta: number) => void;
  setRate: (rate: number) => void;
  setVol: (vol: number) => void;
  toggleMute: () => void;
  scrollToPlayer: (partId: string) => void;
}

const ListeningAudioContext = createContext<ListeningAudioContextType | null>(null);

export function useListeningAudio(): ListeningAudioContextType {
  const context = useContext(ListeningAudioContext);
  if (!context) {
    throw new Error('useListeningAudio must be used within a ListeningAudioProvider');
  }
  return context;
}

interface ListeningAudioProviderProps {
  parts: ListeningPart[];
  isCurrentTab: boolean;
  children: ReactNode;
}

export const ListeningAudioProvider: React.FC<ListeningAudioProviderProps> = ({
  parts,
  isCurrentTab,
  children,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activePartId, setActivePartId] = useState<string>(() => parts[0]?.id || '');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isStickyVisible, setIsStickyVisible] = useState<boolean>(false);
  const [isStickyDismissed, setIsStickyDismissed] = useState<boolean>(false);
  const [announcement, setAnnouncement] = useState<string>('');

  const activePart = parts.find((p) => p.id === activePartId) || parts[0];

  const announce = useCallback((msg: string) => {
    setAnnouncement(msg);
  }, []);

  const dismissSticky = useCallback(() => {
    setIsStickyDismissed(true);
  }, []);

  // Proactively prefetch all listening parts into browser cache
  useEffect(() => {
    if (!parts || parts.length === 0) return;
    const prefetchElements: HTMLAudioElement[] = [];

    parts.forEach((p) => {
      if (p.audioUrl) {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = p.audioUrl;
        prefetchElements.push(audio);
      }
    });

    return () => {
      prefetchElements.forEach((el) => {
        el.src = '';
      });
    };
  }, [parts]);

  // Initialize or update audio element when activePart changes
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = 'auto';
      audioRef.current = audio;
    }

    const audio = audioRef.current;
    if (
      activePart?.audioUrl &&
      audio.src !== window.location.origin + activePart.audioUrl &&
      !audio.src.endsWith(activePart.audioUrl)
    ) {
      audio.src = activePart.audioUrl;
      audio.preload = 'auto';
      audio.playbackRate = playbackRate;
      audio.volume = isMuted ? 0 : volume;
      setCurrentTime(0);
      setDuration(0);
      setIsBuffering(false);
    }
  }, [activePart, playbackRate, volume, isMuted]);

  // Handle audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handleDurationChange = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      setIsBuffering(false);
    };
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => {
      setIsPlaying(true);
      setIsBuffering(false);
    };
    const handleCanPlay = () => setIsBuffering(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      audio.currentTime = 0;
      setCurrentTime(0);
      announce('Bài nghe đã kết thúc');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [announce]);

  // Pause audio automatically if user leaves the listening tab
  useEffect(() => {
    if (!isCurrentTab && isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [isCurrentTab, isPlaying]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  const playPart = useCallback(
    (partId: string) => {
      const target = parts.find((p) => p.id === partId);
      if (!target || !target.audioUrl) return;

      const audio = audioRef.current;
      if (!audio) return;

      if (partId !== activePartId) {
        setActivePartId(partId);
        setIsStickyDismissed(false);
        audio.src = target.audioUrl;
        audio.currentTime = 0;
        setCurrentTime(0);
      }

      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          announce(`Đang phát âm thanh ${target.title}`);
        })
        .catch((err) => {
          if (err.name !== 'AbortError') console.warn('Audio playback error:', err);
        });
    },
    [activePartId, parts, announce]
  );

  const togglePlayPause = useCallback(
    (partId?: string) => {
      const targetId = partId || activePartId;
      const target = parts.find((p) => p.id === targetId);
      if (!target || !target.audioUrl) return;

      const audio = audioRef.current;
      if (!audio) return;

      if (targetId !== activePartId) {
        playPart(targetId);
        return;
      }

      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
        announce(`Đã tạm dừng âm thanh ${target.title}`);
      } else {
        audio
          .play()
          .then(() => {
            setIsPlaying(true);
            announce(`Đang phát âm thanh ${target.title}`);
          })
          .catch((err) => {
            if (err.name !== 'AbortError') console.warn('Audio play error:', err);
          });
      }
    },
    [activePartId, isPlaying, parts, playPart, announce]
  );

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const validTime = Math.max(0, Math.min(time, duration || 0));
      audio.currentTime = validTime;
      setCurrentTime(validTime);
      announce(`Tua đến ${formatTime(validTime)}`);
    },
    [duration, announce]
  );

  const skip = useCallback(
    (delta: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const newTime = Math.max(0, Math.min(audio.currentTime + delta, duration || 0));
      audio.currentTime = newTime;
      setCurrentTime(newTime);
      announce(delta > 0 ? `Tua tới ${delta} giây` : `Tua lùi ${Math.abs(delta)} giây`);
    },
    [duration, announce]
  );

  const setRate = useCallback(
    (rate: number) => {
      const audio = audioRef.current;
      if (audio) {
        audio.playbackRate = rate;
      }
      setPlaybackRate(rate);
      announce(`Tốc độ phát ${rate}x`);
    },
    [announce]
  );

  const setVol = useCallback(
    (vol: number) => {
      const audio = audioRef.current;
      const clamped = Math.max(0, Math.min(1, vol));
      if (audio) {
        audio.volume = clamped;
        if (clamped > 0 && isMuted) {
          audio.muted = false;
          setIsMuted(false);
        }
      }
      setVolume(clamped);
      announce(`Âm lượng ${Math.round(clamped * 100)}%`);
    },
    [isMuted, announce]
  );

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const newMuted = !isMuted;
    audio.muted = newMuted;
    setIsMuted(newMuted);
    announce(newMuted ? 'Đã tắt tiếng' : 'Đã bật âm thanh');
  }, [isMuted, announce]);

  const scrollToPlayer = useCallback((partId: string) => {
    const el = document.getElementById(`audio-player-part-${partId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
    }
  }, []);

  // Global Keyboard Shortcuts when on Listening Tab
  useEffect(() => {
    if (!isCurrentTab) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        (activeEl && activeEl.getAttribute('contenteditable') === 'true');

      if (isInput) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        skip(-5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        skip(5);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCurrentTab, togglePlayPause, skip, toggleMute]);

  // Robust scroll tracking with hysteresis to completely prevent oscillation
  useEffect(() => {
    if (!isCurrentTab) {
      setIsStickyVisible(false);
      return;
    }

    const checkVisibility = () => {
      const targetEl = document.getElementById(`audio-player-part-${activePartId}`);
      if (!targetEl) {
        setIsStickyVisible(false);
        return;
      }
      const rect = targetEl.getBoundingClientRect();
      // Show sticky player when the in-place card is scrolled well above viewport
      if (rect.bottom < 60) {
        setIsStickyVisible(true);
      } else if (rect.top > 0) {
        // Hide sticky player when the in-place card is comfortably in view
        setIsStickyVisible(false);
        setIsStickyDismissed(false);
      }
    };

    window.addEventListener('scroll', checkVisibility, { passive: true });
    checkVisibility();
    return () => window.removeEventListener('scroll', checkVisibility);
  }, [isCurrentTab, activePartId]);

  return (
    <ListeningAudioContext.Provider
      value={{
        activePartId,
        activePart,
        isPlaying,
        isBuffering,
        currentTime,
        duration,
        playbackRate,
        volume,
        isMuted,
        isStickyVisible,
        isStickyDismissed,
        dismissSticky,
        playPart,
        togglePlayPause,
        seek,
        skip,
        setRate,
        setVol,
        toggleMute,
        scrollToPlayer,
      }}
    >
      {/* Live Region for Screen Reader Announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {children}
    </ListeningAudioContext.Provider>
  );
};

// ==========================================
// 1. IN-PLACE LISTENING AUDIO PLAYER
// ==========================================
interface ListeningAudioPlayerProps {
  part: ListeningPart;
  partIndex: number;
}

export const ListeningAudioPlayer: React.FC<ListeningAudioPlayerProps> = ({
  part,
  partIndex,
}) => {
  const {
    activePartId,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    playbackRate,
    volume,
    isMuted,
    togglePlayPause,
    seek,
    skip,
    setRate,
    setVol,
    toggleMute,
  } = useListeningAudio();

  const isCurrentActive = activePartId === part.id;
  const isPartPlaying = isCurrentActive && isPlaying;
  const isPartBuffering = isCurrentActive && isBuffering;
  const effectiveCurrentTime = isCurrentActive ? currentTime : 0;
  const effectiveDuration = isCurrentActive ? duration : 0;
  const progressPercent =
    effectiveDuration > 0 ? (effectiveCurrentTime / effectiveDuration) * 100 : 0;

  return (
    <div
      id={`audio-player-part-${part.id}`}
      tabIndex={-1}
      role="region"
      aria-label={`Trình phát âm thanh ${part.title}`}
      className={`rounded-xl border transition-all duration-200 outline-none p-4 sm:p-5 bg-[#fffdf5] ${isCurrentActive
          ? 'border-black/30 shadow-md ring-1 ring-black/20'
          : 'border-black/15 shadow-xs hover:border-black/25'
        }`}
    >
      {/* Top Header: Title & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-black/70 inline-block" aria-hidden="true" />
          <h4 className="text-sm font-bold tracking-tight text-black">
            Băng ghi âm {partIndex + 1}: {part.title}
          </h4>
        </div>

        {isCurrentActive && (
          <span
            className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${isPartPlaying
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-[#f4eed9] text-neutral-700 border border-neutral-300'
              }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${isPartPlaying ? 'bg-emerald-600 animate-pulse' : 'bg-neutral-500'
                }`}
              aria-hidden="true"
            />
            <span>{isPartPlaying ? 'Đang phát' : 'Tạm dừng'}</span>
          </span>
        )}
      </div>

      {/* Scrubber & Time */}
      <div className="pt-4 space-y-1.5">
        <div className="flex items-center gap-3">
          <span
            className="text-xs font-mono font-medium text-neutral-700 min-w-10 select-none"
            aria-hidden="true"
          >
            {formatTime(effectiveCurrentTime)}
          </span>

          <div className="relative flex-1 flex items-center">
            {/* Filled progress overlay for smooth visual feedback */}
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 bg-neutral-900 rounded-full pointer-events-none transition-all"
              style={{ width: `${progressPercent}%` }}
              aria-hidden="true"
            />
            <input
              type="range"
              min={0}
              max={effectiveDuration || 100}
              step={0.1}
              value={effectiveCurrentTime}
              disabled={!part.audioUrl}
              onChange={(e) => {
                if (!isCurrentActive) {
                  togglePlayPause(part.id);
                }
                seek(parseFloat(e.target.value));
              }}
              aria-label={`Thanh tua thời gian bài nghe ${part.title}`}
              aria-valuemin={0}
              aria-valuemax={Math.floor(effectiveDuration)}
              aria-valuenow={Math.floor(effectiveCurrentTime)}
              aria-valuetext={`${formatTime(effectiveCurrentTime)} trên ${formatTime(
                effectiveDuration
              )}`}
              className="clean-audio-slider relative z-10"
            />
          </div>

          <span
            className="text-xs font-mono font-medium text-neutral-500 min-w-10 text-right select-none"
            aria-hidden="true"
          >
            {effectiveDuration > 0 ? formatTime(effectiveDuration) : '--:--'}
          </span>
        </div>
      </div>

      {/* Main Controls Row */}
      <div className="pt-3 flex flex-wrap items-center justify-between gap-3">
        {/* Playback action buttons */}
        <div className="flex items-center gap-2">
          {/* Tua lùi 5s */}
          <button
            type="button"
            onClick={() => {
              if (isCurrentActive) skip(-5);
              else togglePlayPause(part.id);
            }}
            disabled={!part.audioUrl}
            className="rounded-full h-9 px-3 border border-neutral-300 bg-[#f4eed9] hover:bg-[#ece3c4] active:scale-95 text-black font-semibold text-xs transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40"
            title="Tua lùi 5 giây (phím mũi tên trái)"
            aria-label="Tua lùi 5 giây"
          >
            <span aria-hidden="true" className="font-mono text-sm leading-none">
              ↺
            </span>
            <span>-5s</span>
          </button>

          {/* Primary Play / Pause button */}
          <button
            type="button"
            onClick={() => togglePlayPause(part.id)}
            disabled={!part.audioUrl}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-sm disabled:opacity-40 ${isPartPlaying
                ? 'bg-neutral-900 text-[#fffdf5] hover:bg-neutral-800'
                : 'bg-black text-[#fffdf5] hover:bg-neutral-800'
              }`}
            title={isPartBuffering ? 'Đang tải âm thanh...' : isPartPlaying ? 'Tạm dừng (phím Space)' : 'Phát bài nghe (phím Space)'}
            aria-label={
              isPartBuffering
                ? `Đang tải âm thanh ${part.title}`
                : isPartPlaying
                ? `Tạm dừng âm thanh ${part.title}`
                : `Phát âm thanh ${part.title}`
            }
          >
            {isPartBuffering ? (
              <span className="inline-block animate-spin text-sm leading-none font-bold" aria-hidden="true">⟳</span>
            ) : isPartPlaying ? (
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg className="w-5 h-5 fill-current translate-x-0.5" viewBox="0 0 24 24" aria-hidden="true">
                <polygon points="6,4 20,12 6,20" />
              </svg>
            )}
          </button>

          {/* Tua tới 5s */}
          <button
            type="button"
            onClick={() => {
              if (isCurrentActive) skip(5);
              else togglePlayPause(part.id);
            }}
            disabled={!part.audioUrl}
            className="rounded-full h-9 px-3 border border-neutral-300 bg-[#f4eed9] hover:bg-[#ece3c4] active:scale-95 text-black font-semibold text-xs transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40"
            title="Tua tới 5 giây (phím mũi tên phải)"
            aria-label="Tua tới 5 giây"
          >
            <span>+5s</span>
            <span aria-hidden="true" className="font-mono text-sm leading-none">
              ↻
            </span>
          </button>
        </div>

        {/* Right side: Speed and Volume controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Speed selector */}
          <div
            className="flex items-center rounded-full border border-neutral-300 bg-[#f4eed9] p-0.5"
            role="group"
            aria-label="Tốc độ phát âm thanh"
          >
            {[0.75, 1.0, 1.25].map((rate) => {
              const isSelected = isCurrentActive && playbackRate === rate;
              return (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setRate(rate)}
                  aria-pressed={isSelected}
                  aria-label={`Tốc độ phát ${rate}x`}
                  className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-full transition-colors cursor-pointer ${isSelected
                      ? 'bg-black text-[#fffdf5]'
                      : 'text-neutral-700 hover:text-black hover:bg-[#ece3c4]'
                    }`}
                >
                  {rate}x
                </button>
              );
            })}
          </div>

          {/* Volume & Mute */}
          <div className="flex items-center gap-1.5 rounded-full border border-neutral-300 bg-[#f4eed9] px-2.5 py-1">
            <button
              type="button"
              onClick={toggleMute}
              className="text-black hover:opacity-70 cursor-pointer p-0.5 focus-visible:outline-2"
              title={isMuted ? 'Bật âm thanh (phím M)' : 'Tắt tiếng (phím M)'}
              aria-label={isMuted ? 'Bật âm thanh' : 'Tắt tiếng'}
            >
              {isMuted || volume === 0 ? (
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVol(parseFloat(e.target.value))}
              aria-label="Điều chỉnh âm lượng bài nghe"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round((isMuted ? 0 : volume) * 100)}
              className="w-14 sm:w-18 accent-black cursor-pointer h-1.5 bg-[#e7e1cf] rounded-full"
            />
          </div>
        </div>
      </div>

      {/* Keyboard Shortcut Hints Footer */}
      <div className="pt-3 border-t border-black/5 text-[11px] font-mono text-neutral-600 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-neutral-800">Phím tắt:</span>
        <span>Space: Phát/Dừng</span>
        <span>•</span>
        <span>← / →: Tua ±5s</span>
        <span>•</span>
        <span>M: Tắt tiếng</span>
      </div>
    </div>
  );
};

// ==========================================
// 2. STICKY FLOATING LISTENING MINI-PLAYER
// ==========================================
export const StickyListeningMiniPlayer: React.FC = () => {
  const {
    activePartId,
    activePart,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    playbackRate,
    isMuted,
    isStickyVisible,
    isStickyDismissed,
    dismissSticky,
    togglePlayPause,
    seek,
    skip,
    setRate,
    toggleMute,
    scrollToPlayer,
  } = useListeningAudio();

  if (!isStickyVisible || isStickyDismissed || !activePart) {
    return null;
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      role="region"
      aria-label="Thanh điều khiển âm thanh nổi khi cuộn bài thi"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-xl rounded-2xl border border-black/20 bg-[#fffdf5]/95 backdrop-blur-md px-3.5 py-2.5 shadow-xl transition-all duration-200"
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: Active Title & Quick Return */}
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${isPlaying ? 'bg-emerald-600 animate-pulse' : 'bg-neutral-400'
              }`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-xs font-bold truncate max-w-36 sm:max-w-48 text-black leading-tight">
              {activePart.title}
            </p>
            <span className="text-[10px] font-mono text-neutral-600">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Center: Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => skip(-5)}
            className="w-7 h-7 rounded-full bg-[#f4eed9] hover:bg-[#ece3c4] border border-neutral-300 text-[11px] font-bold text-black flex items-center justify-center cursor-pointer transition-colors"
            title="Tua lùi 5s"
            aria-label="Tua lùi 5 giây"
          >
            -5s
          </button>

          <button
            type="button"
            onClick={() => togglePlayPause(activePartId)}
            className="w-9 h-9 rounded-full bg-black text-white hover:bg-neutral-800 flex items-center justify-center cursor-pointer transition-colors shadow-xs"
            title={isBuffering ? 'Đang tải âm thanh...' : isPlaying ? 'Tạm dừng' : 'Phát'}
            aria-label={isBuffering ? 'Đang tải âm thanh' : isPlaying ? 'Tạm dừng âm thanh' : 'Phát âm thanh'}
          >
            {isBuffering ? (
              <span className="inline-block animate-spin text-xs leading-none font-bold" aria-hidden="true">⟳</span>
            ) : isPlaying ? (
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg className="w-4 h-4 fill-current translate-x-0.5" viewBox="0 0 24 24" aria-hidden="true">
                <polygon points="6,4 20,12 6,20" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={() => skip(5)}
            className="w-7 h-7 rounded-full bg-[#f4eed9] hover:bg-[#ece3c4] border border-neutral-300 text-[11px] font-bold text-black flex items-center justify-center cursor-pointer transition-colors"
            title="Tua tới 5s"
            aria-label="Tua tới 5 giây"
          >
            +5s
          </button>

          <button
            type="button"
            onClick={() => {
              const nextRate = playbackRate === 1.0 ? 1.25 : playbackRate === 1.25 ? 0.75 : 1.0;
              setRate(nextRate);
            }}
            className="px-2 py-1 rounded-full bg-[#f4eed9] hover:bg-[#ece3c4] border border-neutral-300 text-[11px] font-mono font-bold text-black cursor-pointer transition-colors"
            title="Đổi tốc độ phát"
            aria-label={`Tốc độ ${playbackRate}x`}
          >
            {playbackRate}x
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => scrollToPlayer(activePartId)}
            className="px-2 py-1 rounded-full bg-[#f4eed9] hover:bg-black hover:text-white border border-neutral-300 text-[10px] font-semibold text-black cursor-pointer transition-colors flex items-center gap-0.5"
            title="Cuộn tới bộ phát chính"
            aria-label="Cuộn màn hình tới bài nghe"
          >
            <span>↑</span>
            <span className="hidden sm:inline">Về audio</span>
          </button>

          <button
            type="button"
            onClick={dismissSticky}
            className="w-6 h-6 rounded-full hover:bg-neutral-200 text-neutral-500 hover:text-black text-xs flex items-center justify-center cursor-pointer transition-colors"
            title="Đóng thanh nổi"
            aria-label="Đóng thanh điều khiển nổi"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Mini Scrubber bar beneath */}
      <div className="pt-1.5 flex items-center">
        <div className="relative flex-1 flex items-center">
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-black rounded-full pointer-events-none"
            style={{ width: `${progressPercent}%` }}
            aria-hidden="true"
          />
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            aria-label="Tua bài nghe"
            className="clean-audio-slider h-1! relative z-10"
          />
        </div>
      </div>
    </div>
  );
};
