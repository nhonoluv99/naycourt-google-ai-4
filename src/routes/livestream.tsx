import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  CameraOff,
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Layers,
  Mic,
  MicOff,
  Minus,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  Square,
  Tv,
  Video,
  X,
} from "lucide-react";
import {
  entryName,
  getLiveTournamentIdFromUrl,
  getMatchEntryA,
  getMatchEntryB,
  useTournament,
  type Match,
  type TournamentState,
} from "@/lib/tournament-store";

export const Route = createFileRoute("/livestream")({
  head: () => ({
    meta: [
      { title: "Livestream trận đấu — Nảy Court" },
      {
        name: "description",
        content:
          "Phát livestream trực tiếp từ Safari iPhone hoặc máy tính lên Facebook/YouTube qua Stream Key kèm bảng tỉ số thời gian thực.",
      },
      { property: "og:title", content: "Livestream trận đấu — Nảy Court" },
      {
        property: "og:description",
        content: "Quay và ghép bảng tỉ số trực tiếp lên Facebook Live không cần cài app.",
      },
    ],
  }),
  component: LivestreamPage,
});

const CONFIG_STORAGE_KEY = "naycourt_livestream_config_v1";

type PlatformPreset = "facebook" | "youtube" | "custom";
type VideoAspect = "16:9" | "9:16";
type VideoQuality = "480p" | "720p" | "1080p";
type HudPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "custom";
type HudCorner =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";
type StreamStatus = "idle" | "previewing" | "connecting" | "live" | "error";

interface HudThemeColors {
  hudHeaderBg: string;
  hudHeaderText: string;
  hudBg: string;
  hudRowAltBg: string;
  hudTextColor: string;
  hudBorderColor: string;
  hudScoreBg: string;
  hudScoreText: string;
  hudAccentColor: string;
  hudOpacity: number;
  hudScoreMatchRow: boolean;
}

interface LocalLivestreamConfig extends HudThemeColors {
  platform: PlatformPreset;
  serverUrl: string;
  streamKey: string;
  aspect: VideoAspect;
  quality: VideoQuality;
  showHud: boolean;
  hudPosition: HudPosition;
  hudX: number;
  hudY: number;
  hudScale: number;
  overlayBg: "transparent" | "green";
  selectedEventId: string;
  selectedRoundKey: string;
  selectedMatchId: string;
}

const DEFAULT_HUD_THEME: HudThemeColors = {
  hudHeaderBg: "#0a3320",
  hudHeaderText: "#f8f7f2",
  hudBg: "#ffffff",
  hudRowAltBg: "#f2f0e9",
  hudTextColor: "#0a3320",
  hudBorderColor: "#ffffff",
  hudScoreBg: "#0a3320",
  hudScoreText: "#ffffff",
  hudAccentColor: "#e44c11",
  hudOpacity: 96,
  hudScoreMatchRow: false,
};

const HUD_THEME_PRESETS: Array<{ id: string; label: string; colors: HudThemeColors }> = [
  {
    id: "naycourt",
    label: "Nảy Court",
    colors: DEFAULT_HUD_THEME,
  },
  {
    id: "monochrome",
    label: "Monochrome",
    colors: {
      hudHeaderBg: "#f2f0e9",
      hudHeaderText: "#0a3320",
      hudBg: "#ffffff",
      hudRowAltBg: "#f8f7f2",
      hudTextColor: "#0a3320",
      hudBorderColor: "#0a3320",
      hudScoreBg: "#ffffff",
      hudScoreText: "#0a3320",
      hudAccentColor: "#0a3320",
      hudOpacity: 98,
      hudScoreMatchRow: true,
    },
  },
  {
    id: "dark",
    label: "Tối sang trọng",
    colors: {
      hudHeaderBg: "#111827",
      hudHeaderText: "#e5e7eb",
      hudBg: "#1f2937",
      hudRowAltBg: "#17202e",
      hudTextColor: "#f9fafb",
      hudBorderColor: "#4b5563",
      hudScoreBg: "#0f172a",
      hudScoreText: "#ffffff",
      hudAccentColor: "#f97316",
      hudOpacity: 94,
      hudScoreMatchRow: false,
    },
  },
  {
    id: "glass",
    label: "Trong mờ",
    colors: {
      hudHeaderBg: "#062315",
      hudHeaderText: "#ffffff",
      hudBg: "#0a2e1d",
      hudRowAltBg: "#062315",
      hudTextColor: "#ffffff",
      hudBorderColor: "#34d399",
      hudScoreBg: "#04170e",
      hudScoreText: "#ffffff",
      hudAccentColor: "#fb923c",
      hudOpacity: 74,
      hudScoreMatchRow: false,
    },
  },
];

const DEFAULT_CONFIG: LocalLivestreamConfig = {
  platform: "facebook",
  serverUrl: "rtmps://live-api-s.facebook.com:443/rtmp/",
  streamKey: "",
  aspect: "16:9",
  quality: "720p",
  showHud: true,
  hudPosition: "top-left",
  hudX: 0,
  hudY: 0,
  hudScale: 1,
  overlayBg: "transparent",
  selectedEventId: "",
  selectedRoundKey: "all",
  selectedMatchId: "",
  ...DEFAULT_HUD_THEME,
};

function getCornerNormCoords(pos: HudPosition, curX = 0, curY = 0): { xNorm: number; yNorm: number } {
  switch (pos) {
    case "top-left":
      return { xNorm: 0, yNorm: 0 };
    case "top-center":
      return { xNorm: 0.5, yNorm: 0 };
    case "top-right":
      return { xNorm: 1, yNorm: 0 };
    case "bottom-left":
      return { xNorm: 0, yNorm: 1 };
    case "bottom-center":
      return { xNorm: 0.5, yNorm: 1 };
    case "bottom-right":
      return { xNorm: 1, yNorm: 1 };
    case "custom":
    default:
      return {
        xNorm: Math.min(1, Math.max(0, Number.isFinite(curX) ? curX : 0)),
        yNorm: Math.min(1, Math.max(0, Number.isFinite(curY) ? curY : 0)),
      };
  }
}

function getHudGeometry(
  w: number,
  h: number,
  hudPosition: HudPosition,
  hudX: number,
  hudY: number,
  hudScale = 1,
) {
  const isPortrait = h > w;
  const baseScale = isPortrait ? w / 720 : w / 1280;
  const clampedHudScale = Math.min(1.75, Math.max(0.55, Number.isFinite(hudScale) ? hudScale : 1));
  const pad = Math.round(24 * baseScale);
  const maxBoxScale = isPortrait ? (w - pad * 2) / 580 : (w - pad * 2) / 540;
  const scale = Math.min(baseScale * clampedHudScale, maxBoxScale);
  const boxW = isPortrait ? Math.round(580 * scale) : Math.round(540 * scale);
  const headerH = Math.round(30 * scale);
  const rowH = Math.round(44 * scale);
  const totalH = headerH + rowH * 2;
  const minX = pad;
  const maxX = Math.max(pad, w - pad - boxW);
  const minY = pad;
  const maxY = Math.max(pad, h - pad - totalH);
  const { xNorm, yNorm } = getCornerNormCoords(hudPosition, hudX, hudY);
  const x = Math.round(minX + xNorm * (maxX - minX));
  const y = Math.round(minY + yNorm * (maxY - minY));
  return {
    isPortrait,
    baseScale,
    hudScale: clampedHudScale,
    scale,
    pad,
    boxW,
    headerH,
    rowH,
    totalH,
    minX,
    maxX,
    minY,
    maxY,
    x,
    y,
  };
}

function sanitizeHexColor(val: string | null | undefined, fallback: string): string {
  if (!val) return fallback;
  const trimmed = val.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toLowerCase()}`;
  return fallback;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = sanitizeHexColor(hex, "#000000").slice(1);
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const clamped = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clamped.toFixed(3)})`;
}

function normalizeSearchText(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function getMatchRoundMeta(m: Match): { key: string; label: string; sortOrder: number } {
  if (m.stage === "ko") {
    if (m.slot === 99) {
      return {
        key: `ko-third-${m.round}`,
        label: m.koRound || "Tranh hạng 3",
        sortOrder: 10000 + ((m.round ?? 1) - 0.5),
      };
    }
    return {
      key: `ko-${m.round}`,
      label: m.koRound || `Loại trực tiếp · Vòng ${m.round}`,
      sortOrder: 10000 + (m.round ?? 1),
    };
  }
  return {
    key: `round-${m.round}`,
    label: `Vòng ${m.round}`,
    sortOrder: m.round ?? 1,
  };
}

const PLATFORM_URLS: Record<Exclude<PlatformPreset, "custom">, string> = {
  facebook: "rtmps://live-api-s.facebook.com:443/rtmp/",
  youtube: "rtmp://a.rtmp.youtube.com/live2/",
};

function loadSavedConfig(): LocalLivestreamConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    const merged: LocalLivestreamConfig = {
      ...DEFAULT_CONFIG,
      ...(parsed && typeof parsed === "object" ? parsed : {}),
    };
    merged.hudScale = Math.min(
      1.75,
      Math.max(0.55, Number.isFinite(Number(merged.hudScale)) ? Number(merged.hudScale) : 1),
    );
    merged.hudScoreMatchRow = Boolean(merged.hudScoreMatchRow);
    return merged;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function getProfileDimensions(aspect: VideoAspect, quality: VideoQuality) {
  const map: Record<VideoQuality, { w: number; h: number; fps: number; bitrateKbps: number }> = {
    "480p": { w: 854, h: 480, fps: 24, bitrateKbps: 1400 },
    "720p": { w: 1280, h: 720, fps: 30, bitrateKbps: 2500 },
    "1080p": { w: 1920, h: 1080, fps: 30, bitrateKbps: 4200 },
  };
  const base = map[quality] || map["720p"];
  if (aspect === "9:16") {
    return {
      width: base.h,
      height: base.w,
      fps: base.fps,
      bitrateKbps: base.bitrateKbps,
    };
  }
  return {
    width: base.w,
    height: base.h,
    fps: base.fps,
    bitrateKbps: base.bitrateKbps,
  };
}

function pickSupportedRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=h264,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {}
  }
  return "";
}

function formatDuration(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, "0")).join(":");
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncateTextToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

interface BroadcastSnapshot {
  tournamentName: string;
  eventName: string;
  stageLabel: string;
  courtName: string;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  isLive: boolean;
  serveTeam: 0 | 1 | null;
  serverNum: 1 | 2 | null;
  hasMatch: boolean;
}

function LivestreamPage() {
  const {
    state,
    isReadOnly,
    currentRole,
    user,
    activeTournamentId,
    loadTournament,
    saveCurrentToArchive,
  } = useTournament();
  const routerSearchStr = useRouterState({ select: (s) => s.location.searchStr });

  const urlParams = useMemo(() => {
    const merged = new URLSearchParams();
    if (typeof window === "undefined") return merged;
    const sources: string[] = [];
    if (window.location.search) sources.push(window.location.search);
    const hash = window.location.hash || "";
    const qIdx = hash.indexOf("?");
    if (qIdx !== -1) sources.push(hash.slice(qIdx));
    if (routerSearchStr) sources.push(routerSearchStr);
    for (const src of sources) {
      const sp = new URLSearchParams(src);
      sp.forEach((v, k) => merged.set(k, v));
    }
    return merged;
  }, [routerSearchStr]);

  const isOverlayMode = urlParams.get("overlay") === "1";
  const overlayCourtParam = urlParams.get("court") || "";
  const overlayMatchParam = urlParams.get("match") || "";
  const overlayBgParam = urlParams.get("bg") === "green" ? "green" : "transparent";
  const rawPosParam = urlParams.get("pos") || "top-left";
  const overlayPosParam: HudPosition =
    rawPosParam === "top-center" ||
    rawPosParam === "top-right" ||
    rawPosParam === "bottom-left" ||
    rawPosParam === "bottom-center" ||
    rawPosParam === "bottom-right" ||
    rawPosParam === "custom"
      ? rawPosParam
      : "top-left";
  const overlayXParam = (() => {
    const n = Number(urlParams.get("x"));
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  })();
  const overlayYParam = (() => {
    const n = Number(urlParams.get("y"));
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  })();
  const overlayScaleParam = (() => {
    const n = Number(urlParams.get("sc"));
    return Number.isFinite(n) ? Math.min(1.75, Math.max(0.55, n)) : 1;
  })();

  const overlayTheme = useMemo<HudThemeColors>(() => {
    const rawOp = Number(urlParams.get("op"));
    return {
      hudHeaderBg: sanitizeHexColor(urlParams.get("hBg"), DEFAULT_HUD_THEME.hudHeaderBg),
      hudHeaderText: sanitizeHexColor(urlParams.get("hTxt"), DEFAULT_HUD_THEME.hudHeaderText),
      hudBg: sanitizeHexColor(urlParams.get("r1Bg"), DEFAULT_HUD_THEME.hudBg),
      hudRowAltBg: sanitizeHexColor(urlParams.get("r2Bg"), DEFAULT_HUD_THEME.hudRowAltBg),
      hudTextColor: sanitizeHexColor(urlParams.get("txt"), DEFAULT_HUD_THEME.hudTextColor),
      hudBorderColor: sanitizeHexColor(urlParams.get("bdr"), DEFAULT_HUD_THEME.hudBorderColor),
      hudScoreBg: sanitizeHexColor(urlParams.get("sBg"), DEFAULT_HUD_THEME.hudScoreBg),
      hudScoreText: sanitizeHexColor(urlParams.get("sTxt"), DEFAULT_HUD_THEME.hudScoreText),
      hudAccentColor: sanitizeHexColor(urlParams.get("acc"), DEFAULT_HUD_THEME.hudAccentColor),
      hudOpacity:
        Number.isFinite(rawOp) && rawOp >= 20 && rawOp <= 100
          ? rawOp
          : DEFAULT_HUD_THEME.hudOpacity,
      hudScoreMatchRow: urlParams.get("sMatch") === "1",
    };
  }, [urlParams]);

  const [config, setConfig] = useState<LocalLivestreamConfig>(loadSavedConfig);
  const [showKey, setShowKey] = useState(false);

  // Nạp & lắng nghe cập nhật thời gian thực từ Firestore khi mở Link Overlay (?live=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const liveId = getLiveTournamentIdFromUrl() || urlParams.get("live");
    if (!liveId) return;

    let unsub: (() => void) | undefined;
    let mounted = true;
    void import("@/lib/firebase").then(({ fetchPublicTournament, subscribeToPublicTournament }) => {
      void fetchPublicTournament(liveId)
        .then((data) => {
          if (!mounted || !data?.stateJson) return;
          try {
            const parsed = JSON.parse(data.stateJson) as TournamentState;
            loadTournament(parsed, liveId);
          } catch (e) {
            console.error("Lỗi nạp dữ liệu Overlay trực tiếp:", e);
          }
        })
        .catch((e) => {
          console.error("Lỗi fetchPublicTournament cho Overlay:", e);
        });

      unsub = subscribeToPublicTournament(liveId, (data) => {
        if (!mounted || !data?.stateJson) return;
        try {
          const parsed = JSON.parse(data.stateJson) as TournamentState;
          loadTournament(parsed, liveId);
        } catch (e) {
          console.error("Lỗi đồng bộ Overlay trực tiếp:", e);
        }
      });
    });

    return () => {
      mounted = false;
      if (unsub) unsub();
    };
  }, [urlParams, loadTournament]);

  // Đảm bảo nền thực sự trong suốt khi dùng Link Overlay trong OBS / Prism Live
  useEffect(() => {
    if (!isOverlayMode || typeof document === "undefined") return;
    const prevHtmlBg = document.documentElement.style.background;
    const prevBodyBg = document.body.style.background;
    if (overlayBgParam === "transparent") {
      document.documentElement.style.background = "transparent";
      document.body.style.background = "transparent";
    } else {
      document.documentElement.style.background = "#00b14f";
      document.body.style.background = "#00b14f";
    }
    return () => {
      document.documentElement.style.background = prevHtmlBg;
      document.body.style.background = prevBodyBg;
    };
  }, [isOverlayMode, overlayBgParam]);

  const [matchDropdownOpen, setMatchDropdownOpen] = useState(false);
  const [matchSearchQuery, setMatchSearchQuery] = useState("");
  const matchDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!matchDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (matchDropdownRef.current && !matchDropdownRef.current.contains(e.target as Node)) {
        setMatchDropdownOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMatchDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [matchDropdownOpen]);

  // Keep config persisted locally only (never synced to public Firestore)
  useEffect(() => {
    if (isOverlayMode) return;
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {}
  }, [config, isOverlayMode]);

  const effectiveEventId = useMemo(() => {
    const events = state.events || [];
    if (config.selectedEventId === "all") return "all";
    if (config.selectedEventId && events.some((e) => e.id === config.selectedEventId)) {
      return config.selectedEventId;
    }
    if (config.selectedMatchId) {
      const savedMatch = (state.matches || []).find((m) => m.id === config.selectedMatchId);
      if (savedMatch?.eventId && events.some((e) => e.id === savedMatch.eventId)) {
        return savedMatch.eventId;
      }
    }
    return events[0]?.id || "all";
  }, [state.events, state.matches, config.selectedEventId, config.selectedMatchId]);

  const matchesInSelectedEvent = useMemo(() => {
    const matches = state.matches || [];
    if (effectiveEventId === "all") return matches;
    return matches.filter((m) => m.eventId === effectiveEventId);
  }, [state.matches, effectiveEventId]);

  const roundOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string; sortOrder: number }>();
    for (const m of matchesInSelectedEvent) {
      const meta = getMatchRoundMeta(m);
      if (!map.has(meta.key)) {
        map.set(meta.key, meta);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [matchesInSelectedEvent]);

  const effectiveRoundKey = useMemo(() => {
    if (config.selectedRoundKey === "all") return "all";
    if (config.selectedRoundKey && roundOptions.some((r) => r.key === config.selectedRoundKey)) {
      return config.selectedRoundKey;
    }
    if (config.selectedMatchId) {
      const savedMatch = matchesInSelectedEvent.find((m) => m.id === config.selectedMatchId);
      if (savedMatch) {
        const meta = getMatchRoundMeta(savedMatch);
        if (roundOptions.some((r) => r.key === meta.key)) return meta.key;
      }
    }
    return "all";
  }, [config.selectedRoundKey, config.selectedMatchId, roundOptions, matchesInSelectedEvent]);

  const matchesList = useMemo(() => {
    const filtered =
      effectiveRoundKey === "all"
        ? matchesInSelectedEvent
        : matchesInSelectedEvent.filter((m) => getMatchRoundMeta(m).key === effectiveRoundKey);
    return [...filtered].sort((a, b) => {
      const rank = (s: string) => (s === "live" ? 0 : s === "pending" ? 1 : 2);
      const rDiff = rank(a.status) - rank(b.status);
      if (rDiff !== 0) return rDiff;
      return getMatchRoundMeta(a).sortOrder - getMatchRoundMeta(b).sortOrder;
    });
  }, [matchesInSelectedEvent, effectiveRoundKey]);

  const activeMatch = useMemo<Match | undefined>(() => {
    const matches = state.matches || [];
    if (isOverlayMode) {
      if (overlayMatchParam) {
        return matches.find((m) => m.id === overlayMatchParam);
      }
      if (overlayCourtParam) {
        const onCourt = matches.filter((m) => m.court === overlayCourtParam);
        return (
          onCourt.find((m) => m.status === "live") ??
          onCourt.find((m) => m.status === "pending") ??
          onCourt[0]
        );
      }
      return matches.find((m) => m.status === "live") ?? matches[0];
    }

    if (config.selectedMatchId) {
      const exactInList = matchesList.find((m) => m.id === config.selectedMatchId);
      if (exactInList) return exactInList;
    }
    return matchesList[0] ?? matches.find((m) => m.status === "live") ?? matches[0];
  }, [state.matches, isOverlayMode, overlayMatchParam, overlayCourtParam, config.selectedMatchId, matchesList]);

  const snapshot = useMemo<BroadcastSnapshot>(() => {
    if (!activeMatch) {
      return {
        tournamentName: state.name?.trim() || "Giải đấu Pickleball",
        eventName: "",
        stageLabel: "Chờ chọn trận",
        courtName: "",
        teamAName: "Đội A",
        teamBName: "Đội B",
        scoreA: 0,
        scoreB: 0,
        isLive: false,
        serveTeam: null,
        serverNum: null,
        hasMatch: false,
      };
    }

    const ev = (state.events || []).find((e) => e.id === activeMatch.eventId);
    const entryA = getMatchEntryA(activeMatch, state.entries);
    const entryB = getMatchEntryB(activeMatch, state.entries);
    const teamAName = entryA
      ? entryName(entryA)
      : activeMatch.customPlaceholderA || "Đội A";
    const teamBName = entryB
      ? entryName(entryB)
      : activeMatch.customPlaceholderB || "Đội B";

    const useLiveScore =
      Boolean(activeMatch.live) &&
      (activeMatch.status === "live" ||
        (activeMatch.live?.a ?? 0) > 0 ||
        (activeMatch.live?.b ?? 0) > 0);
    const scoreA = useLiveScore
      ? (activeMatch.live?.a ?? 0)
      : (activeMatch.scoreA ?? 0);
    const scoreB = useLiveScore
      ? (activeMatch.live?.b ?? 0)
      : (activeMatch.scoreB ?? 0);

    const isDoublesSideout =
      Boolean(activeMatch.live) &&
      activeMatch.live?.scoring === "sideout" &&
      (ev ? ev.mode === "doi" : true);

    const stageLabel =
      activeMatch.stage === "ko"
        ? activeMatch.koRound?.trim() || "Loại trực tiếp"
        : activeMatch.groupName?.trim() || "Vòng bảng";

    return {
      tournamentName: state.name?.trim() || "Giải đấu Pickleball",
      eventName: ev?.name || "",
      stageLabel,
      courtName: activeMatch.court || "",
      teamAName,
      teamBName,
      scoreA,
      scoreB,
      isLive: activeMatch.status === "live",
      serveTeam:
        activeMatch.status === "live" && activeMatch.live
          ? activeMatch.live.serveTeam
          : null,
      serverNum:
        activeMatch.status === "live" && isDoublesSideout && activeMatch.live
          ? activeMatch.live.serverNum
          : null,
      hasMatch: true,
    };
  }, [activeMatch, state.name, state.events, state.entries]);

  // Refs for real-time Canvas draw loop & active media/socket management
  const snapshotRef = useRef<BroadcastSnapshot>(snapshot);
  snapshotRef.current = snapshot;
  const configRef = useRef<LocalLivestreamConfig>(config);
  configRef.current = config;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const hudDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startHudX: number;
    startHudY: number;
  } | null>(null);
  const hudResizeRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startScale: number;
  } | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [isDraggingHud, setIsDraggingHud] = useState(false);
  const [isResizingHud, setIsResizingHud] = useState(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [micEnabled, setMicEnabled] = useState(true);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [relayReady, setRelayReady] = useState<boolean | null>(null);
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);
  const [copiedOverlay, setCopiedOverlay] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const profile = useMemo(
    () => getProfileDimensions(config.aspect, config.quality),
    [config.aspect, config.quality],
  );

  const checkRelayStatus = useCallback(() => {
    if (isOverlayMode || isReadOnly) return;
    fetch("/api/livestream/status")
      .then((r) => r.json())
      .then((data) => setRelayReady(Boolean(data?.available)))
      .catch(() => setRelayReady(false));
  }, [isOverlayMode, isReadOnly]);

  // Check backend FFmpeg relay readiness once
  useEffect(() => {
    checkRelayStatus();
  }, [checkRelayStatus]);

  // Live duration timer
  useEffect(() => {
    if (streamStatus !== "live") {
      setElapsedSeconds(0);
      return;
    }
    const id = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [streamStatus]);

  // Acquire & re-acquire Wake Lock during broadcast
  const requestWakeLock = useCallback(async () => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      wakeLockRef.current = sentinel;
    } catch {}
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && streamStatus === "live") {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [streamStatus, requestWakeLock]);

  // Canvas compositor loop (runs smoothly whenever not in DOM-only overlay mode)
  useEffect(() => {
    if (isOverlayMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = profile.width;
    canvas.height = profile.height;

    const renderFrame = () => {
      const w = canvas.width;
      const h = canvas.height;
      const vid = videoRef.current;
      const cfg = configRef.current;
      const snap = snapshotRef.current;

      // 1. Background / Camera frame with cover crop
      ctx.fillStyle = "#08140e";
      ctx.fillRect(0, 0, w, h);

      if (vid && vid.readyState >= 2 && vid.videoWidth > 0 && vid.videoHeight > 0) {
        const vw = vid.videoWidth;
        const vh = vid.videoHeight;
        const videoRatio = vw / vh;
        const canvasRatio = w / h;
        let sx = 0;
        let sy = 0;
        let sw = vw;
        let sh = vh;
        if (videoRatio > canvasRatio) {
          sw = vh * canvasRatio;
          sx = (vw - sw) / 2;
        } else {
          sh = vw / canvasRatio;
          sy = (vh - sh) / 2;
        }
        ctx.drawImage(vid, sx, sy, sw, sh, 0, 0, w, h);
      } else {
        // Subtle court grid placeholder when camera is off (no overlapping centered text)
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 2;
        ctx.strokeRect(w * 0.08, h * 0.1, w * 0.84, h * 0.8);
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.1);
        ctx.lineTo(w * 0.5, h * 0.9);
        ctx.stroke();
      }

      // 2. Scoreboard Broadcast HUD overlay
      if (cfg.showHud) {
        const geom = getHudGeometry(w, h, cfg.hudPosition, cfg.hudX, cfg.hudY, cfg.hudScale);
        const { scale, boxW, headerH, rowH, totalH, x, y } = geom;
        const opacityAlpha = Math.min(1, Math.max(0.2, (cfg.hudOpacity ?? 96) / 100));

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
        ctx.shadowBlur = 18 * scale;
        ctx.shadowOffsetY = 6 * scale;
        drawRoundedRectPath(ctx, x, y, boxW, totalH, 12 * scale);
        ctx.fillStyle = hexToRgba(cfg.hudHeaderBg, Math.min(1, opacityAlpha));
        ctx.fill();
        ctx.restore();

        ctx.save();
        drawRoundedRectPath(ctx, x, y, boxW, totalH, 12 * scale);
        ctx.clip();

        // Top meta strip: Tên giải · Tên nội dung · Bảng / Vòng KO
        ctx.fillStyle = hexToRgba(cfg.hudHeaderBg, Math.min(1, opacityAlpha + 0.04));
        ctx.fillRect(x, y, boxW, headerH);

        const headerParts: string[] = [];
        if (snap.tournamentName) headerParts.push(snap.tournamentName);
        if (snap.eventName) headerParts.push(snap.eventName);
        if (snap.stageLabel) headerParts.push(snap.stageLabel);
        const headerText = headerParts.join(" · ") || "NẢY COURT LIVE";

        ctx.fillStyle = cfg.hudHeaderText;
        ctx.font = `700 ${Math.round(12.5 * scale)}px "Space Grotesk", "Be Vietnam Pro", sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(
          truncateTextToWidth(ctx, headerText.toUpperCase(), boxW - 120 * scale),
          x + 12 * scale,
          y + headerH / 2 + 0.5,
        );

        // Brand tag on top right — italicized like the header logo
        ctx.fillStyle = cfg.hudAccentColor;
        ctx.font = `italic 700 ${Math.round(12.5 * scale)}px "Verdana", "Space Grotesk", sans-serif`;
        ctx.textAlign = "right";
        ctx.fillText("NẢY COURT", x + boxW - 12 * scale, y + headerH / 2 + 0.5);

        // Left Brand Block (Orange P badge + naycourt.ai.studio) spanning both rows
        const brandColW = Math.round(106 * scale);
        const bodyY = y + headerH;
        const bodyH = rowH * 2;
        ctx.fillStyle = hexToRgba(cfg.hudRowAltBg, opacityAlpha);
        ctx.fillRect(x, bodyY, brandColW, bodyH);

        // Orange P badge centered vertically inside brand column
        const badgeSize = Math.round(36 * scale);
        const badgeX = x + Math.round((brandColW - badgeSize) / 2);
        const badgeY = bodyY + Math.round(14 * scale);
        drawRoundedRectPath(ctx, badgeX, badgeY, badgeSize, badgeSize, 9 * scale);
        ctx.fillStyle = "#e44c11";
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = `800 ${Math.round(20 * scale)}px "Space Grotesk", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("P", badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 1);

        // Site link below P badge
        ctx.fillStyle = cfg.hudTextColor;
        ctx.font = `600 ${Math.round(9.5 * scale)}px "Be Vietnam Pro", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("naycourt.ai.studio", x + brandColW / 2, badgeY + badgeSize + Math.round(14 * scale));

        // Vertical divider after brand block
        ctx.fillStyle = hexToRgba(cfg.hudBorderColor, 0.28);
        ctx.fillRect(x + brandColW, bodyY, Math.max(1, scale), bodyH);

        // Helper for team rows
        const scoreColW = Math.round(72 * scale);
        const teamAreaX = x + brandColW;
        const teamAreaW = boxW - brandColW - scoreColW;
        const drawTeamRow = (
          rowIdx: 0 | 1,
          name: string,
          score: number,
          isServing: boolean,
        ) => {
          const ry = bodyY + rowIdx * rowH;
          const rowHex = rowIdx === 0 ? cfg.hudBg : cfg.hudRowAltBg;
          ctx.fillStyle = hexToRgba(rowHex, opacityAlpha);
          ctx.fillRect(teamAreaX, ry, teamAreaW, rowH);

          // Divider between team rows
          if (rowIdx === 1) {
            ctx.fillStyle = hexToRgba(cfg.hudBorderColor, 0.28);
            ctx.fillRect(teamAreaX, ry, boxW - brandColW, Math.max(1, scale));
          }

          // Team name + serve indicator dot(s) after team name (1 circle = lượt 1, 2 circles = lượt 2)
          const nameOffsetX = teamAreaX + 14 * scale;
          const dotCount = isServing ? (snap.serverNum === 2 ? 2 : 1) : 0;
          const dotR = 4.8 * scale;
          const dotGap = 5 * scale;
          const dotsSpace =
            dotCount > 0 ? 10 * scale + dotCount * (dotR * 2) + (dotCount - 1) * dotGap : 0;

          ctx.fillStyle = cfg.hudTextColor;
          ctx.font = `700 ${Math.round(18.5 * scale)}px "Be Vietnam Pro", sans-serif`;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const availNameW = teamAreaX + teamAreaW - nameOffsetX - 10 * scale - dotsSpace;
          const drawnName = truncateTextToWidth(ctx, name, Math.max(24 * scale, availNameW));
          ctx.fillText(drawnName, nameOffsetX, ry + rowH / 2 + 0.5);

          if (dotCount > 0) {
            const nameW = ctx.measureText(drawnName).width;
            const firstDotCenterX = nameOffsetX + nameW + 10 * scale + dotR;
            ctx.fillStyle = cfg.hudAccentColor;
            for (let i = 0; i < dotCount; i++) {
              ctx.beginPath();
              ctx.arc(
                firstDotCenterX + i * (dotR * 2 + dotGap),
                ry + rowH / 2,
                dotR,
                0,
                Math.PI * 2,
              );
              ctx.fill();
            }
          }

          // Score box
          const scoreBoxBg = cfg.hudScoreMatchRow
            ? hexToRgba(rowHex, opacityAlpha)
            : hexToRgba(
                isServing ? cfg.hudAccentColor : cfg.hudScoreBg,
                Math.min(1, opacityAlpha + 0.04),
              );
          ctx.fillStyle = scoreBoxBg;
          ctx.fillRect(x + boxW - scoreColW, ry, scoreColW, rowH);

          if (cfg.hudScoreMatchRow) {
            ctx.fillStyle = hexToRgba(cfg.hudBorderColor, 0.28);
            ctx.fillRect(x + boxW - scoreColW, ry, Math.max(1, scale), rowH);
          }

          ctx.fillStyle = cfg.hudScoreText;
          ctx.font = `800 ${Math.round(25 * scale)}px "Space Grotesk", monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(score), x + boxW - scoreColW / 2, ry + rowH / 2 + 1);
        };

        drawTeamRow(0, snap.teamAName, snap.scoreA, snap.serveTeam === 0);
        drawTeamRow(1, snap.teamBName, snap.scoreB, snap.serveTeam === 1);

        // Thin inner dividers matching team-row separator:
        // 1. Horizontal line under top header strip
        // 2. Vertical line between Brand block and Team rows
        const innerStroke = hexToRgba(cfg.hudBorderColor, 0.28);
        const lineThick = Math.max(1, scale);
        ctx.fillStyle = innerStroke;
        ctx.fillRect(x, bodyY, boxW, lineThick);
        ctx.fillRect(x + brandColW, bodyY, lineThick, bodyH);
        ctx.restore();

        // Crisp border around HUD with user-selected border color
        ctx.save();
        drawRoundedRectPath(ctx, x, y, boxW, totalH, 12 * scale);
        ctx.strokeStyle = hexToRgba(cfg.hudBorderColor, 0.72);
        ctx.lineWidth = Math.max(1.5, 2 * scale);
        ctx.stroke();
        ctx.restore();
      }
    };

    renderFrame();
    const intervalId = setInterval(renderFrame, Math.round(1000 / profile.fps));
    return () => clearInterval(intervalId);
  }, [isOverlayMode, profile.width, profile.height, profile.fps]);

  const stopCameraTracks = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch {}
      micSourceRef.current = null;
    }
    setCameraActive(false);
    if (streamStatus === "previewing") {
      setStreamStatus("idle");
    }
  }, [streamStatus]);

  const ensureAudioPipeline = useCallback((micStream: MediaStream | null) => {
    if (typeof window === "undefined") return;
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const dest = ctx.createMediaStreamDestination();
      // Tiny silent carrier so MediaRecorder & FFmpeg always have valid continuous audio frames
      const osc = ctx.createOscillator();
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0.00001;
      osc.connect(silentGain);
      silentGain.connect(dest);
      osc.start();

      audioCtxRef.current = ctx;
      audioDestRef.current = dest;
    }

    const ctx = audioCtxRef.current;
    const dest = audioDestRef.current;
    if (!ctx || !dest) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }

    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch {}
      micSourceRef.current = null;
    }

    if (micStream && micStream.getAudioTracks().length > 0) {
      const source = ctx.createMediaStreamSource(micStream);
      const gain = ctx.createGain();
      gain.gain.value = micEnabled ? 1 : 0;
      source.connect(gain);
      gain.connect(dest);
      micSourceRef.current = source;
      micGainRef.current = gain;
    }
  }, [micEnabled]);

  const startCamera = useCallback(
    async (overrideFacing?: "environment" | "user"): Promise<boolean> => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setErrorDetail("Trình duyệt hiện tại không hỗ trợ truy cập Camera.");
        return false;
      }

      const targetFacing = overrideFacing ?? facingMode;
      setErrorDetail(null);
      // Unlock AudioContext synchronously during iOS Safari tap gesture before any await
      ensureAudioPipeline(null);

      // Stop old tracks smoothly before requesting new facingMode (required on iOS Safari)
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }

      try {
        let mediaStream: MediaStream;
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: targetFacing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 },
            },
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
            },
          });
        } catch {
          // Fallback to simpler constraints or video-only if mic blocked
          try {
            mediaStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: targetFacing },
              audio: true,
            });
          } catch {
            mediaStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: targetFacing },
              audio: false,
            });
            toast.warning("Không truy cập được micro — đang chạy chế độ chỉ có hình ảnh.");
          }
        }

        cameraStreamRef.current = mediaStream;

        // Attach video-only stream to <video> to avoid local audio echo
        const videoOnly = new MediaStream(mediaStream.getVideoTracks());
        if (videoRef.current) {
          videoRef.current.srcObject = videoOnly;
          await videoRef.current.play().catch(() => {});
        }

        ensureAudioPipeline(mediaStream);
        setCameraActive(true);
        if (streamStatus === "idle" || streamStatus === "error") {
          setStreamStatus("previewing");
        }
        return true;
      } catch (err: unknown) {
        const name = (err as { name?: string })?.name || "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setErrorDetail(
            "Bạn đã từ chối quyền Camera/Micro. Trên Safari iPhone, hãy bấm biểu tượng AA / Cài đặt trang web trên thanh địa chỉ → Cho phép Camera & Micro rồi thử lại.",
          );
        } else if (name === "NotFoundError") {
          setErrorDetail("Không tìm thấy Camera trên thiết bị này.");
        } else {
          setErrorDetail("Không thể mở Camera. Hãy đóng các ứng dụng khác đang dùng camera và thử lại.");
        }
        setCameraActive(false);
        return false;
      }
    },
    [facingMode, ensureAudioPipeline, streamStatus],
  );

  const handleFlipCamera = async () => {
    const nextFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextFacing);
    if (cameraActive) {
      await startCamera(nextFacing);
    }
  };

  const handleToggleMic = () => {
    const next = !micEnabled;
    setMicEnabled(next);
    if (micGainRef.current) {
      micGainRef.current.gain.value = next ? 1 : 0;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = next;
      });
    }
  };

  const stopBroadcast = useCallback(() => {
    setConfirmStopOpen(false);
    if (recorderRef.current) {
      try {
        if (recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      } catch {}
      recorderRef.current = null;
    }
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "stop" }));
        }
        wsRef.current.close(1000, "Stopped by user");
      } catch {}
      wsRef.current = null;
    }
    releaseWakeLock();
    setStreamStatus(cameraActive ? "previewing" : "idle");
  }, [cameraActive, releaseWakeLock]);

  const startBroadcast = async () => {
    setErrorDetail(null);
    // Unlock AudioContext synchronously during user tap gesture (critical on iPhone Safari)
    ensureAudioPipeline(null);

    const trimmedUrl = config.serverUrl.trim();
    const trimmedKey = config.streamKey.trim();

    if (!/^rtmps?:\/\/[^\s\r\n\0]+$/i.test(trimmedUrl)) {
      toast.error("URL máy chủ phải bắt đầu bằng rtmps:// hoặc rtmp://");
      return;
    }
    if (!trimmedKey || /[\s\r\n\0]/.test(trimmedKey)) {
      toast.error("Vui lòng dán Khóa luồng (Stream Key) hợp lệ trước khi phát!");
      return;
    }

    if (!cameraActive) {
      const ok = await startCamera();
      if (!ok) return;
    }

    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.captureStream !== "function") {
      setErrorDetail("Trình duyệt không hỗ trợ xuất luồng video từ khung hình.");
      return;
    }

    ensureAudioPipeline(cameraStreamRef.current);

    const preferredMime = pickSupportedRecorderMime();
    if (!preferredMime && typeof MediaRecorder === "undefined") {
      setErrorDetail("Trình duyệt không hỗ trợ MediaRecorder để phát livestream.");
      return;
    }

    const canvasStream = canvas.captureStream(profile.fps);
    const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    if (audioDestRef.current) {
      combinedTracks.push(...audioDestRef.current.stream.getAudioTracks());
    }
    const broadcastStream = new MediaStream(combinedTracks);

    setStreamStatus("connecting");
    void requestWakeLock();

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/livestream`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    let droppedChunksNotice = false;

    ws.onopen = () => {
      try {
        let recorder: MediaRecorder;
        if (preferredMime) {
          try {
            recorder = new MediaRecorder(broadcastStream, {
              mimeType: preferredMime,
              videoBitsPerSecond: profile.bitrateKbps * 1000,
              audioBitsPerSecond: 128_000,
            });
          } catch {
            try {
              recorder = new MediaRecorder(broadcastStream, { mimeType: preferredMime });
            } catch {
              recorder = new MediaRecorder(broadcastStream);
            }
          }
        } else {
          recorder = new MediaRecorder(broadcastStream);
        }

        const effectiveMime = recorder.mimeType || preferredMime || "";

        ws.send(
          JSON.stringify({
            type: "start",
            rtmpUrl: trimmedUrl,
            streamKey: trimmedKey,
            fps: profile.fps,
            bitrateKbps: profile.bitrateKbps,
            mimeType: effectiveMime,
          }),
        );

        recorder.ondataavailable = (ev) => {
          if (!ev.data || ev.data.size === 0) return;
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          // Guard against slow upload congestion blowing up Safari RAM
          if (wsRef.current.bufferedAmount > 4 * 1024 * 1024) {
            if (!droppedChunksNotice) {
              droppedChunksNotice = true;
              toast.warning("Mạng upload đang chậm — hệ thống tự bỏ bớt khung hình để tránh nghẽn.");
            }
            return;
          }
          void ev.data.arrayBuffer().then((buf) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(buf);
            }
          });
        };

        recorder.onerror = () => {
          setErrorDetail("Bộ mã hóa video trình duyệt gặp lỗi. Vui lòng thử tắt/bật lại Camera.");
          stopBroadcast();
        };

        recorderRef.current = recorder;
        recorder.start(1000);
      } catch {
        setErrorDetail("Không thể khởi tạo MediaRecorder trên trình duyệt này.");
        stopBroadcast();
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === "status") {
          if (msg.state === "connecting") {
            setStreamStatus("connecting");
          } else if (msg.state === "live") {
            setStreamStatus("live");
          } else if (msg.state === "stopped") {
            stopBroadcast();
          }
        } else if (msg.type === "error") {
          setErrorDetail(msg.message || "Lỗi kết nối máy chủ phát sóng.");
          setStreamStatus("error");
          if (recorderRef.current && recorderRef.current.state !== "inactive") {
            try {
              recorderRef.current.stop();
            } catch {}
          }
          recorderRef.current = null;
          releaseWakeLock();
        }
      } catch {}
    };

    ws.onerror = () => {
      setErrorDetail("Mất kết nối WebSocket tới máy chủ. Vui lòng kiểm tra mạng.");
      setStreamStatus("error");
      releaseWakeLock();
    };

    ws.onclose = () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {}
        recorderRef.current = null;
      }
      wsRef.current = null;
      releaseWakeLock();
      setStreamStatus((prev) => {
        if (prev === "error") return "error";
        return cameraActive ? "previewing" : "idle";
      });
    };
  };

  // Cleanup everything on route leave
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {}
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioCtxRef.current) {
        void audioCtxRef.current.close().catch(() => {});
      }
      if (wakeLockRef.current) {
        void wakeLockRef.current.release().catch(() => {});
      }
    };
  }, []);

  const buildOverlayUrl = useCallback(
    (tourIdOverride?: string) => {
      if (typeof window === "undefined") return "";
      const params = new URLSearchParams();
      params.set("overlay", "1");
      const tid = tourIdOverride || activeTournamentId || state.id;
      if (tid) params.set("live", tid);
      const targetMatchId = isOverlayMode
        ? overlayMatchParam
        : activeMatch?.id || config.selectedMatchId;
      if (targetMatchId) params.set("match", targetMatchId);
      params.set("bg", "transparent");
      params.set("pos", config.hudPosition);
      if (config.hudPosition === "custom") {
        params.set("x", config.hudX.toFixed(3));
        params.set("y", config.hudY.toFixed(3));
      }
      if (Math.abs((config.hudScale ?? 1) - 1) > 0.01) {
        params.set("sc", (config.hudScale ?? 1).toFixed(2));
      }
      params.set("hBg", config.hudHeaderBg);
      params.set("hTxt", config.hudHeaderText);
      params.set("r1Bg", config.hudBg);
      params.set("r2Bg", config.hudRowAltBg);
      params.set("txt", config.hudTextColor);
      params.set("bdr", config.hudBorderColor);
      params.set("sBg", config.hudScoreBg);
      params.set("sTxt", config.hudScoreText);
      params.set("acc", config.hudAccentColor);
      params.set("op", String(config.hudOpacity));
      if (config.hudScoreMatchRow) {
        params.set("sMatch", "1");
      }
      return `${window.location.origin}/#/livestream?${params.toString()}`;
    },
    [
      activeTournamentId,
      state.id,
      isOverlayMode,
      overlayMatchParam,
      activeMatch?.id,
      config.selectedMatchId,
      config.hudPosition,
      config.hudX,
      config.hudY,
      config.hudScale,
      config.hudHeaderBg,
      config.hudHeaderText,
      config.hudBg,
      config.hudRowAltBg,
      config.hudTextColor,
      config.hudBorderColor,
      config.hudScoreBg,
      config.hudScoreText,
      config.hudAccentColor,
      config.hudOpacity,
      config.hudScoreMatchRow,
    ],
  );

  const overlayUrl = useMemo(() => buildOverlayUrl(), [buildOverlayUrl]);

  const ensurePublishedOverlayUrl = async (): Promise<string> => {
    let tid = activeTournamentId || state.id;
    if (!tid && user && !isReadOnly) {
      try {
        const savedId = await saveCurrentToArchive();
        if (savedId) tid = savedId;
      } catch {}
    }
    return buildOverlayUrl(tid);
  };

  const handleCopyOverlay = async () => {
    const finalUrl = await ensurePublishedOverlayUrl();
    try {
      await navigator.clipboard.writeText(finalUrl);
      setCopiedOverlay(true);
      toast.success("Đã sao chép Link Overlay bảng tỉ số!");
      setTimeout(() => setCopiedOverlay(false), 2000);
    } catch {
      toast.error("Không sao chép được tự động, hãy chọn và copy thủ công.");
    }
  };

  // ---------------- 1. CHẾ ĐỘ OVERLAY CHROME-LESS CHO PRISM / OBS ----------------
  if (isOverlayMode) {
    const opAlpha = Math.min(1, Math.max(0.2, overlayTheme.hudOpacity / 100));
    const headerParts = [
      snapshot.tournamentName,
      snapshot.eventName,
      snapshot.stageLabel,
    ].filter(Boolean);

    const isCustomPos = overlayPosParam === "custom";
    const cornerFlexClass =
      overlayPosParam === "top-center"
        ? "justify-start items-center"
        : overlayPosParam === "top-right"
          ? "justify-start items-end"
          : overlayPosParam === "bottom-left"
            ? "justify-end items-start"
            : overlayPosParam === "bottom-center"
              ? "justify-end items-center"
              : overlayPosParam === "bottom-right"
                ? "justify-end items-end"
                : "justify-start items-start";

    const scaleOrigin = isCustomPos
      ? `${overlayXParam * 100}% ${overlayYParam * 100}%`
      : overlayPosParam === "top-center"
        ? "top center"
        : overlayPosParam === "top-right"
          ? "top right"
          : overlayPosParam === "bottom-left"
            ? "bottom left"
            : overlayPosParam === "bottom-center"
              ? "bottom center"
              : overlayPosParam === "bottom-right"
                ? "bottom right"
                : "top left";

    const overlayCard = (
      <div
        className="w-full max-w-[520px] overflow-hidden rounded-xl shadow-2xl"
        style={{
          border: `2px solid ${hexToRgba(overlayTheme.hudBorderColor, 0.72)}`,
          backgroundColor: hexToRgba(overlayTheme.hudHeaderBg, opAlpha),
          transformOrigin: scaleOrigin,
          ...(isCustomPos
            ? {
                position: "absolute",
                left: `${overlayXParam * 100}%`,
                top: `${overlayYParam * 100}%`,
                transform: `translate(-${overlayXParam * 100}%, -${overlayYParam * 100}%) scale(${overlayScaleParam})`,
              }
            : overlayScaleParam !== 1
              ? {
                  transform: `scale(${overlayScaleParam})`,
                }
              : {}),
        }}
      >
        <div
          className="flex items-center justify-between gap-3 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: hexToRgba(
              overlayTheme.hudHeaderBg,
              Math.min(1, opAlpha + 0.04),
            ),
            color: overlayTheme.hudHeaderText,
          }}
        >
          <span className="truncate">{headerParts.join(" · ") || "NẢY COURT LIVE"}</span>
          <span
            className="shrink-0 italic font-bold uppercase tracking-tight"
            style={{
              color: overlayTheme.hudAccentColor,
              fontFamily: "Verdana, sans-serif",
            }}
          >
            NẢY COURT
          </span>
        </div>

        <div
          className="flex items-stretch"
          style={{
            borderTop: `1px solid ${hexToRgba(overlayTheme.hudBorderColor, 0.28)}`,
          }}
        >
          {/* Left Brand Block: Orange P logo + naycourt.ai.studio */}
          <div
            className="flex w-[104px] shrink-0 flex-col items-center justify-center gap-1.5 px-2 py-2"
            style={{
              backgroundColor: hexToRgba(overlayTheme.hudRowAltBg, opAlpha),
              borderRight: `1px solid ${hexToRgba(overlayTheme.hudBorderColor, 0.28)}`,
            }}
          >
            <div className="grid size-9 place-items-center rounded-lg bg-[#e44c11]">
              <span className="font-head text-lg font-extrabold leading-none text-white">P</span>
            </div>
            <span
              className="text-[10px] font-semibold leading-none tracking-tight"
              style={{ color: overlayTheme.hudTextColor }}
            >
              naycourt.ai.studio
            </span>
          </div>

          {/* Right Team Rows & Scores */}
          <div className="flex-1 min-w-0">
            {[
              {
                name: snapshot.teamAName,
                score: snapshot.scoreA,
                serving: snapshot.serveTeam === 0,
                rowBg: overlayTheme.hudBg,
              },
              {
                name: snapshot.teamBName,
                score: snapshot.scoreB,
                serving: snapshot.serveTeam === 1,
                rowBg: overlayTheme.hudRowAltBg,
              },
            ].map((row, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_72px] items-stretch"
                style={{
                  borderTop:
                    idx === 1
                      ? `1px solid ${hexToRgba(overlayTheme.hudBorderColor, 0.28)}`
                      : undefined,
                }}
              >
                <div
                  className="flex items-center gap-2 px-3.5 py-2.5 min-w-0"
                  style={{
                    backgroundColor: hexToRgba(row.rowBg, opAlpha),
                    color: overlayTheme.hudTextColor,
                  }}
                >
                  <span className="truncate text-base font-bold">{row.name}</span>
                  {row.serving && (
                    <span
                      className="inline-flex items-center gap-1 shrink-0"
                      aria-label={
                        snapshot.serverNum === 2 ? "Lượt giao 2" : "Đang giao bóng"
                      }
                    >
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: overlayTheme.hudAccentColor }}
                      />
                      {snapshot.serverNum === 2 && (
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: overlayTheme.hudAccentColor }}
                        />
                      )}
                    </span>
                  )}
                </div>
                <div
                  className="flex items-center justify-center font-head text-2xl font-extrabold tabular-nums"
                  style={{
                    backgroundColor: overlayTheme.hudScoreMatchRow
                      ? hexToRgba(row.rowBg, opAlpha)
                      : hexToRgba(
                          row.serving ? overlayTheme.hudAccentColor : overlayTheme.hudScoreBg,
                          Math.min(1, opAlpha + 0.04),
                        ),
                    borderLeft: overlayTheme.hudScoreMatchRow
                      ? `1px solid ${hexToRgba(overlayTheme.hudBorderColor, 0.28)}`
                      : undefined,
                    color: overlayTheme.hudScoreText,
                  }}
                >
                  {row.score}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );

    return (
      <div
        className={`min-h-screen w-full flex flex-col p-6 ${isCustomPos ? "" : cornerFlexClass}`}
        style={{
          backgroundColor: overlayBgParam === "green" ? "#00b14f" : "transparent",
        }}
      >
        {isCustomPos ? (
          <div className="relative flex-1 w-full min-h-[calc(100vh-3rem)]">{overlayCard}</div>
        ) : (
          overlayCard
        )}
      </div>
    );
  }

  // ---------------- 2. CHẶN KHÁN GIẢ CÔNG KHAI KHÔNG PHẢI BTC / TRỌNG TÀI ----------------
  if (isReadOnly) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="panel p-6 text-center space-y-4">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-accent/15 text-accent">
            <ShieldAlert className="size-6" />
          </div>
          <h1 className="font-head text-2xl font-bold text-ink">
            Chỉ Ban tổ chức và Trọng tài được phát Livestream
          </h1>
          <p className="text-sm text-line/70">
            Bạn đang xem giải ở chế độ khán giả. Vui lòng quay lại trang Quản lý giải để theo dõi diễn biến và tỉ số trực tiếp.
          </p>
          <div className="pt-2">
            <Link to="/quan-ly-giai" className="btn-accent">
              Về Quản lý giải
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- 3. STUDIO LIVESTREAM CHÍNH ----------------
  return (
    <div className="space-y-5">
      {/* Backing video element (kept rendered 2x2px so iOS Safari decodes video frames onto Canvas) */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-hidden="true"
        style={{
          position: "fixed",
          width: 2,
          height: 2,
          opacity: 0.001,
          pointerEvents: "none",
          top: 0,
          left: 0,
        }}
      />

      {/* Header studio */}
      <div className="flex flex-col gap-3 border-b border-line/15 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1
            className="font-head text-3xl font-extrabold uppercase tracking-tight text-[#0a3320] sm:text-4xl"
            style={{ color: "#0a3320" }}
          >
            Livestream sân đấu
          </h1>
        </div>

        {/* Bộ chọn: Nội dung -> Vòng -> Chọn trận (lưu giữ khi chuyển tab) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Chọn Nội dung */}
          <select
            value={effectiveEventId}
            onChange={(e) => {
              const nextEvId = e.target.value;
              const nextEvMatches =
                nextEvId === "all"
                  ? state.matches || []
                  : (state.matches || []).filter((m) => m.eventId === nextEvId);
              const firstMatch =
                nextEvMatches.find((m) => m.status === "live") ??
                nextEvMatches.find((m) => m.status === "pending") ??
                nextEvMatches[0];
              setConfig((c) => ({
                ...c,
                selectedEventId: nextEvId,
                selectedRoundKey: "all",
                selectedMatchId: firstMatch?.id || "",
              }));
            }}
            className="field !w-auto max-w-[200px] min-h-[44px] !py-2 !px-3 text-sm font-semibold"
            aria-label="Chọn nội dung thi đấu"
          >
            <option value="all">Tất cả nội dung</option>
            {(state.events || []).map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>

          {/* 2. Chọn Vòng */}
          <select
            value={effectiveRoundKey}
            onChange={(e) => {
              const nextRound = e.target.value;
              const nextRoundMatches =
                nextRound === "all"
                  ? matchesInSelectedEvent
                  : matchesInSelectedEvent.filter(
                      (m) => getMatchRoundMeta(m).key === nextRound,
                    );
              const firstMatch =
                nextRoundMatches.find((m) => m.status === "live") ??
                nextRoundMatches.find((m) => m.status === "pending") ??
                nextRoundMatches[0];
              setConfig((c) => ({
                ...c,
                selectedEventId: effectiveEventId,
                selectedRoundKey: nextRound,
                selectedMatchId: firstMatch?.id || "",
              }));
            }}
            className="field !w-auto max-w-[190px] min-h-[44px] !py-2 !px-3 text-sm font-semibold"
            aria-label="Chọn vòng đấu"
          >
            <option value="all">Tất cả vòng</option>
            {roundOptions.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>

          {/* 3. Chọn Trận (có ô nhập tìm tên VĐV) */}
          <div className="relative" ref={matchDropdownRef}>
            <button
              type="button"
              onClick={() => {
                setMatchDropdownOpen((prev) => !prev);
                setMatchSearchQuery("");
              }}
              className="field !w-full sm:!w-[270px] min-h-[44px] !py-2 !px-3 text-sm font-semibold flex items-center justify-between gap-2 text-left cursor-pointer"
              aria-label="Chọn trận đấu phát livestream"
              aria-expanded={matchDropdownOpen}
            >
              <span className="truncate">
                {(() => {
                  const current = activeMatch;
                  if (!current) return "Chưa có trận nào";
                  const a = getMatchEntryA(current, state.entries);
                  const b = getMatchEntryB(current, state.entries);
                  const prefix =
                    current.status === "live"
                      ? "[Đang đấu] "
                      : current.status === "done"
                        ? "[Xong] "
                        : "";
                  return `${prefix}${a ? entryName(a) : current.customPlaceholderA || "Đội A"} vs ${
                    b ? entryName(b) : current.customPlaceholderB || "Đội B"
                  }`;
                })()}
              </span>
              <ChevronDown className="size-4 shrink-0 text-line/60" />
            </button>

            {matchDropdownOpen && (
              <div className="absolute right-0 top-full z-50 mt-1.5 w-[min(92vw,340px)] rounded-xl border border-line/20 bg-card p-2 shadow-2xl">
                <div className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-2.5 size-4 text-line/50" />
                  <input
                    type="text"
                    autoFocus
                    value={matchSearchQuery}
                    onChange={(e) => setMatchSearchQuery(e.target.value)}
                    placeholder="Nhập tên VĐV để tìm trận..."
                    className="field !py-2 !pl-8 !pr-8 text-xs font-medium"
                  />
                  {matchSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setMatchSearchQuery("")}
                      aria-label="Xóa từ khóa tìm trận"
                      className="absolute right-2 grid size-6 place-items-center rounded text-line/50 hover:text-ink cursor-pointer"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                <div className="mt-1.5 max-h-64 overflow-y-auto divide-y divide-line/10">
                  {(() => {
                    const normQ = normalizeSearchText(matchSearchQuery);
                    const filtered = matchesList.filter((m) => {
                      if (!normQ) return true;
                      const a = getMatchEntryA(m, state.entries);
                      const b = getMatchEntryB(m, state.entries);
                      const text = normalizeSearchText(
                        `${a ? entryName(a) : m.customPlaceholderA || ""} ${
                          b ? entryName(b) : m.customPlaceholderB || ""
                        }`,
                      );
                      return text.includes(normQ);
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="px-3 py-4 text-center text-xs text-line/60">
                          Không tìm thấy trận đấu phù hợp
                        </div>
                      );
                    }

                    return filtered.map((m) => {
                      const a = getMatchEntryA(m, state.entries);
                      const b = getMatchEntryB(m, state.entries);
                      const isSelected = activeMatch?.id === m.id;
                      const subTag =
                        m.stage === "ko"
                          ? m.koRound || `Vòng ${m.round}`
                          : m.groupName || `Vòng ${m.round}`;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setConfig((c) => ({
                              ...c,
                              selectedEventId: effectiveEventId,
                              selectedRoundKey: effectiveRoundKey,
                              selectedMatchId: m.id,
                            }));
                            setMatchDropdownOpen(false);
                            setMatchSearchQuery("");
                          }}
                          className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition flex items-center justify-between gap-2 cursor-pointer ${
                            isSelected
                              ? "bg-[#0a3320]/10 font-bold text-[#0a3320]"
                              : "text-ink hover:bg-secondary/60"
                          }`}
                        >
                          <span className="truncate">
                            {m.status === "live" && (
                              <span className="mr-1.5 font-extrabold text-accent">[Đang đấu]</span>
                            )}
                            {m.status === "done" && (
                              <span className="mr-1.5 font-semibold text-line/55">[Xong]</span>
                            )}
                            {a ? entryName(a) : m.customPlaceholderA || "Đội A"} vs{" "}
                            {b ? entryName(b) : m.customPlaceholderB || "Đội B"}
                            {subTag && (
                              <span className="ml-1.5 text-[10px] font-medium text-line/55">
                                · {subTag}
                              </span>
                            )}
                          </span>
                          {isSelected && <Check className="size-3.5 shrink-0 text-[#0a3320]" />}
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cảnh báo lỗi kết nối / quyền camera */}
      {errorDetail && (
        <div className="rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2.5">
          <ShieldAlert className="size-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Cảnh báo phát sóng</p>
            <p className="text-ink/85 text-xs sm:text-sm leading-relaxed">{errorDetail}</p>
          </div>
        </div>
      )}

      {/* MÀN HÌNH LIVESTREAM TOÀN CHIỀU RỘNG + DOCK ĐIỀU KHIỂN */}
      <div className="panel p-3 sm:p-4 space-y-3">
        {/* Khung Preview Canvas + Kéo thả Overlay */}
        <div className="flex w-full items-center justify-center overflow-hidden rounded-xl bg-[#08140e]">
          <div
            ref={stageContainerRef}
            className={`relative ${
              config.aspect === "9:16"
                ? "aspect-[9/16] h-[560px] max-w-full"
                : "aspect-video w-full"
            }`}
          >
            <canvas ref={canvasRef} className="block h-full w-full" />

            {/* Vùng nắm kéo di chuyển + phóng to thu nhỏ Overlay trực tiếp trên màn hình */}
            {config.showHud &&
              (() => {
                const geom = getHudGeometry(
                  profile.width,
                  profile.height,
                  config.hudPosition,
                  config.hudX,
                  config.hudY,
                  config.hudScale,
                );
                const updateHudScale = (next: number) => {
                  const clamped = Math.min(1.75, Math.max(0.55, Number(next.toFixed(2))));
                  configRef.current = { ...configRef.current, hudScale: clamped };
                  setConfig((c) => ({ ...c, hudScale: clamped }));
                };
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Kéo để di chuyển hoặc thay đổi kích thước bảng tỉ số"
                    title="Kéo để di chuyển · Kéo góc hoặc bấm +/- để thu phóng"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      hudDragRef.current = {
                        pointerId: e.pointerId,
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        startHudX: geom.x,
                        startHudY: geom.y,
                      };
                      setIsDraggingHud(true);
                    }}
                    onPointerMove={(e) => {
                      const drag = hudDragRef.current;
                      if (!drag || drag.pointerId !== e.pointerId) return;
                      const rect = stageContainerRef.current?.getBoundingClientRect();
                      if (!rect || rect.width <= 0 || rect.height <= 0) return;
                      const dxCanvas = (e.clientX - drag.startClientX) * (profile.width / rect.width);
                      const dyCanvas = (e.clientY - drag.startClientY) * (profile.height / rect.height);
                      const nextX = Math.min(geom.maxX, Math.max(geom.minX, drag.startHudX + dxCanvas));
                      const nextY = Math.min(geom.maxY, Math.max(geom.minY, drag.startHudY + dyCanvas));
                      const nextNormX =
                        geom.maxX > geom.minX ? (nextX - geom.minX) / (geom.maxX - geom.minX) : 0;
                      const nextNormY =
                        geom.maxY > geom.minY ? (nextY - geom.minY) / (geom.maxY - geom.minY) : 0;

                      configRef.current = {
                        ...configRef.current,
                        hudPosition: "custom",
                        hudX: nextNormX,
                        hudY: nextNormY,
                      };
                      setConfig((c) => ({
                        ...c,
                        hudPosition: "custom",
                        hudX: nextNormX,
                        hudY: nextNormY,
                      }));
                    }}
                    onPointerUp={(e) => {
                      if (hudDragRef.current?.pointerId === e.pointerId) {
                        hudDragRef.current = null;
                        setIsDraggingHud(false);
                      }
                    }}
                    onPointerCancel={() => {
                      hudDragRef.current = null;
                      setIsDraggingHud(false);
                    }}
                    style={{
                      left: `${(geom.x / profile.width) * 100}%`,
                      top: `${(geom.y / profile.height) * 100}%`,
                      width: `${(geom.boxW / profile.width) * 100}%`,
                      height: `${(geom.totalH / profile.height) * 100}%`,
                    }}
                    className={`group absolute z-20 touch-none select-none rounded-xl transition-shadow ${
                      isDraggingHud || isResizingHud
                        ? "cursor-grabbing ring-2 ring-[#e44c11] shadow-lg"
                        : "cursor-grab hover:ring-2 hover:ring-white/60"
                    }`}
                  >
                    {/* Thanh phóng to / thu nhỏ nhanh trực tiếp trên bảng tỉ số */}
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className={`absolute -bottom-3 left-2 z-30 flex items-center gap-0.5 rounded-full bg-[#0a3320]/90 px-1 py-0.5 text-white shadow-md ring-1 ring-white/25 transition-opacity ${
                        isDraggingHud || isResizingHud
                          ? "opacity-100"
                          : "opacity-85 sm:opacity-0 sm:group-hover:opacity-100"
                      }`}
                    >
                      <button
                        type="button"
                        aria-label="Thu nhỏ bảng tỉ số"
                        title="Thu nhỏ"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateHudScale((config.hudScale ?? 1) - 0.1);
                        }}
                        className="grid size-5 place-items-center rounded-full hover:bg-white/20 cursor-pointer"
                      >
                        <Minus className="size-3" />
                      </button>
                      <button
                        type="button"
                        title="Đặt lại kích thước 100%"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateHudScale(1);
                        }}
                        className="px-1 text-[10px] font-mono font-bold tabular-nums hover:text-[#fb923c] cursor-pointer"
                      >
                        {Math.round((config.hudScale ?? 1) * 100)}%
                      </button>
                      <button
                        type="button"
                        aria-label="Phóng to bảng tỉ số"
                        title="Phóng to"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateHudScale((config.hudScale ?? 1) + 0.1);
                        }}
                        className="grid size-5 place-items-center rounded-full hover:bg-white/20 cursor-pointer"
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>

                    {/* Tay nắm kéo góc dưới phải để phóng to / thu nhỏ tự do */}
                    <div
                      role="slider"
                      aria-label="Kéo góc để phóng to thu nhỏ bảng tỉ số"
                      aria-valuemin={55}
                      aria-valuemax={175}
                      aria-valuenow={Math.round((config.hudScale ?? 1) * 100)}
                      tabIndex={0}
                      title="Kéo góc để phóng to / thu nhỏ"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        hudResizeRef.current = {
                          pointerId: e.pointerId,
                          startClientX: e.clientX,
                          startClientY: e.clientY,
                          startScale: configRef.current.hudScale ?? 1,
                        };
                        setIsResizingHud(true);
                      }}
                      onPointerMove={(e) => {
                        const resize = hudResizeRef.current;
                        if (!resize || resize.pointerId !== e.pointerId) return;
                        const rect = stageContainerRef.current?.getBoundingClientRect();
                        if (!rect || rect.width <= 0) return;
                        const dxCanvas = (e.clientX - resize.startClientX) * (profile.width / rect.width);
                        const dyCanvas = (e.clientY - resize.startClientY) * (profile.height / rect.width);
                        const baseW = geom.isPortrait ? 580 * geom.baseScale : 540 * geom.baseScale;
                        const deltaScale = (dxCanvas + dyCanvas * 1.4) / Math.max(120, baseW);
                        updateHudScale(resize.startScale + deltaScale);
                      }}
                      onPointerUp={(e) => {
                        if (hudResizeRef.current?.pointerId === e.pointerId) {
                          hudResizeRef.current = null;
                          setIsResizingHud(false);
                        }
                      }}
                      onPointerCancel={() => {
                        hudResizeRef.current = null;
                        setIsResizingHud(false);
                      }}
                      className={`absolute -bottom-1.5 -right-1.5 z-30 grid size-5 place-items-center rounded-full bg-[#e44c11] text-white shadow ring-2 ring-white cursor-nwse-resize transition-opacity ${
                        isResizingHud
                          ? "opacity-100 scale-110"
                          : "opacity-85 sm:opacity-0 sm:group-hover:opacity-100"
                      }`}
                    >
                      <span className="size-1.5 rounded-full bg-white" />
                    </div>
                  </div>
                );
              })()}

            {!cameraActive && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4 text-center">
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="pointer-events-auto btn-accent min-h-[46px] px-5 py-2.5 text-sm sm:text-base font-bold cursor-pointer shadow-lg"
                >
                  <Camera className="size-5" />
                  Bật Camera & Micro
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Hàng nút điều khiển dễ chạm (Thumb Zone >= 44px) */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 pt-1">
          <button
            type="button"
            onClick={() => {
              if (cameraActive) {
                if (streamStatus === "live" || streamStatus === "connecting") {
                  toast.warning("Hãy dừng phát livestream trước khi tắt camera.");
                  return;
                }
                stopCameraTracks();
              } else {
                void startCamera();
              }
            }}
            className={`min-h-[46px] rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border transition cursor-pointer ${
              cameraActive
                ? "bg-[#0a3320]/10 text-[#0a3320] border-[#0a3320]/30 hover:bg-[#0a3320]/15"
                : "bg-card text-ink border-line/25 hover:bg-secondary/60"
            }`}
          >
            {cameraActive ? (
              <Camera className="size-4 shrink-0" />
            ) : (
              <CameraOff className="size-4 shrink-0" />
            )}
            <span className="whitespace-nowrap">Camera</span>
          </button>

          <button
            type="button"
            onClick={() => void handleFlipCamera()}
            className={`min-h-[46px] rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border transition cursor-pointer ${
              facingMode === "user"
                ? "bg-[#0a3320]/10 text-[#0a3320] border-[#0a3320]/30 hover:bg-[#0a3320]/15"
                : "bg-card text-ink border-line/25 hover:bg-secondary/60"
            }`}
            title="Đổi giữa camera sau và camera trước"
          >
            <RefreshCw className="size-4 shrink-0" />
            <span className="whitespace-nowrap">
              {facingMode === "environment" ? "Cam Sau" : "Cam Trước"}
            </span>
          </button>

          <button
            type="button"
            onClick={handleToggleMic}
            className={`min-h-[46px] rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border transition cursor-pointer ${
              micEnabled
                ? "bg-[#0a3320]/10 text-[#0a3320] border-[#0a3320]/30 hover:bg-[#0a3320]/15"
                : "bg-card text-ink border-line/25 hover:bg-secondary/60"
            }`}
          >
            {micEnabled ? <Mic className="size-4 shrink-0" /> : <MicOff className="size-4 shrink-0" />}
            <span className="whitespace-nowrap">Mic</span>
          </button>

          <button
            type="button"
            onClick={() => setConfig((c) => ({ ...c, showHud: !c.showHud }))}
            className={`min-h-[46px] rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border transition cursor-pointer ${
              config.showHud
                ? "bg-[#0a3320]/10 text-[#0a3320] border-[#0a3320]/30 hover:bg-[#0a3320]/15"
                : "bg-card text-ink border-line/25 hover:bg-secondary/60"
            }`}
          >
            <Tv className="size-4 shrink-0" />
            <span className="whitespace-nowrap">Bảng điểm</span>
          </button>
        </div>

        {/* Nút hành động chính: Bắt đầu phát / Dừng phát */}
        <div className="pt-1">
          {streamStatus === "live" || streamStatus === "connecting" ? (
            <button
              type="button"
              onClick={() => {
                if (streamStatus === "live") {
                  setConfirmStopOpen(true);
                } else {
                  stopBroadcast();
                }
              }}
              className="w-full min-h-[52px] rounded-xl bg-destructive px-5 py-3 text-base font-extrabold uppercase tracking-wide text-white shadow-md hover:opacity-95 transition flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <Square className="size-5 fill-current" />
              {streamStatus === "connecting" ? "Hủy kết nối phát" : `Dừng phát (${formatDuration(elapsedSeconds)})`}
            </button>
          ) : (
            <button
              type="button"
              disabled={relayReady === false}
              onClick={() => void startBroadcast()}
              className="w-full min-h-[52px] rounded-xl bg-[#e44c11] hover:brightness-105 disabled:opacity-50 px-5 py-3 font-head text-base font-extrabold uppercase tracking-wide text-white shadow-md transition flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <Radio className="size-5" />
              Bắt đầu phát Livestream
            </button>
          )}
          {relayReady === false && (
            <div className="mt-2 flex flex-col items-center gap-1.5 text-center">
              <p className="text-xs font-semibold text-destructive">
                Máy chủ hiện chưa kết nối được bộ chuyển tiếp FFmpeg để đẩy luồng RTMPS. Bạn có thể bấm kiểm tra lại hoặc dùng Link Overlay bên dưới cho app Prism Live / OBS.
              </p>
              <button
                type="button"
                onClick={checkRelayStatus}
                className="text-xs font-bold text-accent underline hover:opacity-80 cursor-pointer"
              >
                Kiểm tra lại kết nối máy chủ
              </button>
            </div>
          )}
        </div>
      </div>

      {/* HÀNG DƯỚI: CÀI ĐẶT BÊN TRÁI + STREAMKEY & LINK OVERLAY BÊN PHẢI */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
        {/* CỘT TRÁI: CÀI ĐẶT */}
        <div className="lg:col-span-7 xl:col-span-8">
          <div className="panel p-4 space-y-4">
            <div className="flex min-h-[28px] items-center justify-between gap-2 border-b border-line/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Settings className="size-4 text-[#0a3320]" />
                <h2 className="font-head text-base font-bold text-ink">Cài đặt</h2>
              </div>
              <button
                type="button"
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    ...DEFAULT_HUD_THEME,
                  }))
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-line/70 hover:text-ink cursor-pointer"
                title="Đặt lại toàn bộ màu bảng tỉ số về mặc định"
              >
                <RotateCcw className="size-3.5" />
                Khôi phục màu mặc định
              </button>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3 sm:grid-cols-[1fr_1fr_auto] items-start">
              <div className="col-span-2 sm:col-span-1 flex flex-col gap-1.5">
                <span className="block text-xs font-semibold leading-4 text-line/75">Khung hình</span>
                <div className="grid h-[44px] grid-cols-2 gap-1 rounded-lg bg-secondary/60 p-1 ring-1 ring-line/15 text-xs items-stretch">
                  {(["16:9", "9:16"] as const).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      disabled={streamStatus === "live" || streamStatus === "connecting"}
                      onClick={() => setConfig((c) => ({ ...c, aspect: ratio }))}
                      className={`h-full rounded-md font-bold transition cursor-pointer ${
                        config.aspect === ratio
                          ? "bg-card text-ink shadow-2xs ring-1 ring-line/10"
                          : "text-line/70 hover:text-ink"
                      }`}
                    >
                      {ratio === "16:9" ? "16:9 Ngang" : "9:16 Dọc"}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="block text-xs font-semibold leading-4 text-line/75">Chất lượng</span>
                <select
                  disabled={streamStatus === "live" || streamStatus === "connecting"}
                  value={config.quality}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, quality: e.target.value as VideoQuality }))
                  }
                  className="field !h-[44px] !py-0 px-3 text-xs font-semibold"
                >
                  <option value="720p">720p · 30fps (Khuyên dùng)</option>
                  <option value="1080p">1080p · 30fps</option>
                  <option value="480p">480p · 24fps (Mạng yếu)</option>
                </select>
              </label>

              <div className="flex flex-col gap-1.5">
                <span className="block text-xs font-semibold leading-4 text-line/75">Vị trí</span>
                <div
                  className="grid h-[44px] w-[66px] grid-cols-3 grid-rows-2 gap-1 rounded-lg bg-secondary/60 p-1 ring-1 ring-line/15"
                  role="group"
                  aria-label="Chọn vị trí đặt bảng tỉ số"
                >
                  {(
                    [
                      { id: "top-left", label: "Trên trái" },
                      { id: "top-center", label: "Trên giữa" },
                      { id: "top-right", label: "Trên phải" },
                      { id: "bottom-left", label: "Dưới trái" },
                      { id: "bottom-center", label: "Dưới giữa" },
                      { id: "bottom-right", label: "Dưới phải" },
                    ] as Array<{ id: HudCorner; label: string }>
                  ).map((pos) => {
                    const isActive = config.hudPosition === pos.id;
                    return (
                      <button
                        key={pos.id}
                        type="button"
                        aria-label={pos.label}
                        title={pos.label}
                        onClick={() => {
                          const { xNorm, yNorm } = getCornerNormCoords(pos.id);
                          setConfig((c) => ({
                            ...c,
                            hudPosition: pos.id,
                            hudX: xNorm,
                            hudY: yNorm,
                          }));
                        }}
                        className={`rounded-[4px] transition cursor-pointer ${
                          isActive
                            ? "bg-[#0a3320] shadow-2xs"
                            : "bg-card hover:bg-card/85 ring-1 ring-line/15"
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Tùy chỉnh toàn bộ màu sắc ô Overlay / bảng tỉ số */}
            <div className="space-y-3 border-t border-line/10 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="block text-xs font-semibold leading-4 text-line/75">Màu sắc</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {HUD_THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setConfig((c) => ({
                          ...c,
                          ...preset.colors,
                        }))
                      }
                      className="rounded-md border border-line/20 bg-card px-2.5 py-1 text-[11px] font-bold text-ink hover:bg-secondary/70 transition cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:grid-rows-3 sm:grid-flow-col">
                {(
                  [
                    { key: "hudHeaderBg", label: "Nền thanh trên" },
                    { key: "hudBg", label: "Nền ô đội 1" },
                    { key: "hudRowAltBg", label: "Nền ô đội 2" },
                    { key: "hudHeaderText", label: "Chữ thanh trên" },
                    { key: "hudTextColor", label: "Chữ tên đội" },
                    { key: "hudScoreText", label: "Chữ ô điểm" },
                    { key: "hudScoreBg", label: "Nền ô điểm" },
                    { key: "hudBorderColor", label: "Màu viền khung" },
                    { key: "hudAccentColor", label: "Màu nhấn / bóng" },
                  ] as const
                ).map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line/15 bg-secondary/35 px-2.5 py-2 cursor-pointer hover:bg-secondary/60 transition"
                  >
                    <div className="min-w-0">
                      <span className="block text-[11px] font-bold text-ink truncate">
                        {item.label}
                      </span>
                      <span className="block text-[10px] font-mono uppercase text-line/60">
                        {item.key === "hudScoreBg" && config.hudScoreMatchRow
                          ? "THEO Ô ĐỘI"
                          : config[item.key]}
                      </span>
                    </div>
                    <input
                      type="color"
                      value={config[item.key]}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          [item.key]: e.target.value,
                          ...(item.key === "hudScoreBg" ? { hudScoreMatchRow: false } : {}),
                        }))
                      }
                      aria-label={item.label}
                      className="size-8 shrink-0 cursor-pointer rounded-md border border-line/20 bg-transparent p-0.5"
                    />
                  </label>
                ))}
              </div>

              <label className="flex items-center gap-3 pt-1 text-xs font-semibold text-ink">
                <span className="shrink-0">Độ đậm nền ô Overlay:</span>
                <input
                  type="range"
                  min={30}
                  max={100}
                  step={2}
                  value={config.hudOpacity}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      hudOpacity: Number(e.target.value),
                    }))
                  }
                  className="flex-1 accent-[#0a3320] cursor-pointer"
                />
                <span className="w-10 text-right font-mono tabular-nums text-line/80">
                  {config.hudOpacity}%
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* CỘT PHẢI: STREAMKEY & LINK OVERLAY */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* Card 1: StreamKey */}
          <div className="panel p-4 space-y-4">
            <div className="flex min-h-[28px] items-center justify-between gap-2 border-b border-line/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Video className="size-4 text-accent" />
                <h2 className="font-head text-base font-bold text-ink">StreamKey</h2>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen((v) => !v)}
                className="text-xs font-bold text-accent hover:underline cursor-pointer"
              >
                {guideOpen ? "Ẩn hướng dẫn" : "Cách lấy Stream Key"}
              </button>
            </div>

            {guideOpen && (
              <div className="rounded-xl bg-secondary/60 p-3 text-xs text-ink/85 space-y-1.5 border border-line/15">
                <p className="font-bold text-[#0a3320]">3 bước lấy Stream Key trên Facebook:</p>
                <p>1. Mở Facebook → chọn <strong>Video trực tiếp (Live Video)</strong> → <strong>Phát trực tiếp</strong>.</p>
                <p>2. Ở phần nguồn phát, chọn <strong>Phần mềm phát trực tuyến (Streaming software)</strong>.</p>
                <p>3. Bấm Sao chép <strong>Khóa luồng (Stream Key)</strong> dán xuống dưới rồi bấm <strong>Bắt đầu phát</strong>.</p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <span className="block text-xs font-semibold leading-4 text-line/75">Nền tảng phát</span>
              <div className="grid h-[44px] grid-cols-3 gap-1.5 rounded-lg bg-secondary/60 p-1 ring-1 ring-line/15 text-xs items-stretch">
                {(
                  [
                    { id: "facebook", label: "Facebook" },
                    { id: "youtube", label: "YouTube" },
                    { id: "custom", label: "Tùy chỉnh" },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={streamStatus === "live" || streamStatus === "connecting"}
                    onClick={() =>
                      setConfig((c) => ({
                        ...c,
                        platform: p.id,
                        serverUrl:
                          p.id === "custom" ? c.serverUrl : PLATFORM_URLS[p.id],
                      }))
                    }
                    className={`h-full rounded-md font-bold transition cursor-pointer ${
                      config.platform === p.id
                        ? "bg-card text-ink shadow-2xs ring-1 ring-line/10"
                        : "text-line/70 hover:text-ink"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-line/75">Server URL (RTMP / RTMPS)</span>
              <input
                type="text"
                disabled={streamStatus === "live" || streamStatus === "connecting"}
                value={config.serverUrl}
                onChange={(e) => setConfig((c) => ({ ...c, serverUrl: e.target.value }))}
                placeholder="rtmps://live-api-s.facebook.com:443/rtmp/"
                className="field !py-2 text-xs font-mono"
              />
            </label>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label htmlFor="stream-key-input" className="text-xs font-semibold text-line/75">
                  Khóa luồng (Stream Key)
                </label>
                {config.streamKey && streamStatus !== "live" && (
                  <button
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, streamKey: "" }))}
                    className="text-[11px] font-semibold text-destructive hover:underline cursor-pointer"
                  >
                    Xóa khóa
                  </button>
                )}
              </div>
              <div className="relative flex items-center">
                <input
                  id="stream-key-input"
                  type={showKey ? "text" : "password"}
                  disabled={streamStatus === "live" || streamStatus === "connecting"}
                  value={config.streamKey}
                  onChange={(e) => setConfig((c) => ({ ...c, streamKey: e.target.value }))}
                  placeholder="Dán Stream Key từ Facebook..."
                  autoComplete="off"
                  className="field !py-2 !pr-11 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "Ẩn khóa luồng" : "Hiện khóa luồng"}
                  className="absolute right-1.5 grid size-8 place-items-center rounded-md text-line/60 hover:text-ink cursor-pointer"
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Link Overlay (mặc định nền trong suốt) */}
          <div className="panel p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-line/10 pb-2.5">
              <Layers className="size-4 text-[#0a3320]" />
              <h2 className="font-head text-base font-bold text-ink">Link Overlay</h2>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={overlayUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="field !py-2 text-[11px] font-mono text-line/80 flex-1 min-w-0"
                aria-label="Link Overlay bảng tỉ số"
              />
              <button
                type="button"
                onClick={() => void handleCopyOverlay()}
                className="min-h-[40px] shrink-0 rounded-lg bg-[#0a3320] px-3 py-2 text-xs font-bold text-white hover:opacity-90 transition flex items-center gap-1.5 cursor-pointer"
              >
                {copiedOverlay ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                <span>{copiedOverlay ? "Đã chép" : "Copy"}</span>
              </button>
            </div>

            <a
              href={overlayUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                if (!(activeTournamentId || state.id) && user && !isReadOnly) {
                  void saveCurrentToArchive();
                }
              }}
              className="btn-ghost w-full min-h-[42px] text-xs font-bold justify-center"
            >
              <ExternalLink className="size-3.5" />
              Mở xem thử bảng Overlay
            </a>
          </div>
        </div>
      </div>

      {/* Modal xác nhận dừng phát tránh bấm nhầm trên điện thoại */}
      {confirmStopOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-line/20 space-y-4">
            <h3 className="font-head text-lg font-bold text-ink">
              Xác nhận dừng Livestream?
            </h3>
            <p className="text-sm text-line/75">
              Phiên phát trực tiếp hiện tại ({formatDuration(elapsedSeconds)}) sẽ kết thúc trên Facebook.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmStopOpen(false)}
                className="btn-ghost min-h-[44px] justify-center cursor-pointer"
              >
                Tiếp tục phát
              </button>
              <button
                type="button"
                onClick={stopBroadcast}
                className="min-h-[44px] rounded-xl bg-destructive px-4 py-2 text-sm font-bold text-white hover:opacity-95 cursor-pointer"
              >
                Dừng phát ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {currentRole === "referee" && (
        <div className="text-xs text-line/60 text-center">
          Bạn đang phát với quyền Trọng tài {user?.displayName ? `(${user.displayName})` : ""}.
        </div>
      )}
    </div>
  );
}
