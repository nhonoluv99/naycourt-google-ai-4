import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as React from "react";
import {
  addMinutes,
  autoScheduleTimeline,
  buildTimeline,
  computeStandings,
  entryName,
  generateGroupMatches,
  generateKnockout,
  getActivePlayerNames,
  groupColor,
  groupTag,
  propagateKnockout,
  useTournament,
  type Entry,
  type Match,
  type TEvent,
} from "@/lib/tournament-store";

export const Route = createFileRoute("/quan-ly-giai")({
  head: () => ({
    meta: [
      { title: "Quản lý giải đấu — Nảy Court" },
      {
        name: "description",
        content:
          "Điều hành giải Pickleball: lịch vòng bảng theo vòng và màu bảng, timeline theo sân và khung giờ, nhánh loại trực tiếp, phân sân, trọng tài và nhập điểm từng trận.",
      },
      { property: "og:title", content: "Quản lý giải đấu — Nảy Court" },
      {
        property: "og:description",
        content: "Vòng bảng, timeline theo sân và loại trực tiếp trong một màn hình điều hành.",
      },
    ],
  }),
  component: ManagePage,
});

/* ---------------- Ô nhập điểm ---------------- */

function ScoreBox({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
}) {
  const [raw, setRaw] = useState(value === null ? "" : String(value));
  useEffect(() => {
    setRaw(value === null ? "" : String(value));
  }, [value]);
  return (
    <input
      className="w-11 rounded-md bg-card px-1 py-1 text-center text-sm font-bold ring-1 ring-line/20 outline-none focus:ring-2 focus:ring-accent"
      inputMode="numeric"
      placeholder="—"
      value={raw}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9]/g, "");
        setRaw(t);
        onCommit(t === "" ? null : Number(t));
      }}
    />
  );
}

type CardProps = {
  m: Match;
  nameA: string;
  nameB: string;
  isLiveA?: boolean;
  isLiveB?: boolean;
  onScore: (key: "scoreA" | "scoreB", v: number | null) => void;
  onStatus: (s: Match["status"]) => void;
  onReset: () => void;
  courts: string[];
  courtIcons?: Record<string, string>;
  referees?: string[];
  onCourt: (c: string) => void;
  onReferee: (r: string) => void;
  onRemoveFromTimeline?: () => void;
  onViewNote?: (note: string) => void;
  compact?: boolean | undefined;
  key?: React.Key;
};

function MatchCard({
  m,
  nameA,
  nameB,
  isLiveA,
  isLiveB,
  onScore,
  onStatus,
  onReset,
  courts,
  courtIcons,
  referees = [],
  onCourt,
  onReferee,
  onRemoveFromTimeline,
  onViewNote,
  compact,
}: CardProps) {
  const c = groupColor(m.groupName);
  const aWin = m.scoreA !== null && m.scoreB !== null && m.scoreA > m.scoreB;
  const bWin = m.scoreA !== null && m.scoreB !== null && m.scoreB > m.scoreA;
  const hasNote = Boolean(m.note || m.live?.note);

  return (
    <div
      className={`rounded-xl p-2.5 ring-1 transition-all ${
        m.status === "live"
          ? "ring-2 ring-red-500 shadow-md bg-red-50/70 dark:bg-red-950/20"
          : "ring-line/15"
      }`}
      style={{ backgroundColor: m.status === "live" ? undefined : m.status === "done" ? "var(--muted)" : c.bg }}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shrink-0"
            style={{ backgroundColor: c.dot, color: "white" }}
          >
            {groupTag(m.groupName)} · V{m.round}
          </span>
          {m.court && (
            <span className="text-[10px] font-medium text-line/60 truncate">
              {courtIcons?.[m.court] || "🎾"} {m.court}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {m.status === "live" && (
            <span className="flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white animate-pulse">
              <span className="size-1.5 rounded-full bg-white animate-ping" />
              Đang đấu
            </span>
          )}
          {m.status === "done" && (
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              Đã xong
            </span>
          )}
          {m.status === "pending" && (
            <span className="text-[10px] font-medium text-line/50">Chờ</span>
          )}

          {compact && onRemoveFromTimeline && (
            <button
              type="button"
              className="ml-1 rounded p-0.5 text-line/40 hover:bg-line/10 hover:text-destructive"
              title="Gỡ khỏi timeline"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFromTimeline();
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {isLiveA && (
              <span className="size-2 rounded-full bg-red-600 animate-pulse shrink-0" title="VĐV đang thi đấu trực tiếp" />
            )}
            <span className={`truncate text-sm ${aWin ? "font-bold" : "text-line/80"} ${isLiveA ? "text-red-600 font-extrabold" : ""}`}>
              {nameA}
            </span>
          </div>
          <ScoreBox value={m.scoreA} onCommit={(v) => onScore("scoreA", v)} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {isLiveB && (
              <span className="size-2 rounded-full bg-red-600 animate-pulse shrink-0" title="VĐV đang thi đấu trực tiếp" />
            )}
            <span className={`truncate text-sm ${bWin ? "font-bold" : "text-line/80"} ${isLiveB ? "text-red-600 font-extrabold" : ""}`}>
              {nameB}
            </span>
          </div>
          <ScoreBox value={m.scoreB} onCommit={(v) => onScore("scoreB", v)} />
        </div>
      </div>

      {compact ? null : (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <select
            className="rounded-md bg-card px-1.5 py-1 text-[11px] font-semibold ring-1 ring-line/20 outline-none"
            value={m.court}
            onChange={(e) => onCourt(e.target.value)}
          >
            {courts.map((x) => (
              <option key={x} value={x}>
                {courtIcons?.[x] ? `${courtIcons[x]} ` : ""}{x}
              </option>
            ))}
          </select>

          {referees.length > 0 ? (
            <select
              className="rounded-md bg-card px-1.5 py-1 text-[11px] ring-1 ring-line/20 outline-none max-w-[130px]"
              value={m.referee || ""}
              onChange={(e) => onReferee(e.target.value)}
            >
              <option value="">Trọng tài...</option>
              {referees.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="w-24 rounded-md bg-card px-1.5 py-1 text-[11px] ring-1 ring-line/20 outline-none"
              placeholder="Trọng tài"
              value={m.referee}
              onChange={(e) => onReferee(e.target.value)}
            />
          )}

          {hasNote && onViewNote && (
            <button
              type="button"
              className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-300 dark:bg-amber-950/30 dark:text-amber-400"
              onClick={() => onViewNote(m.note || m.live?.note || "")}
            >
              📝 Ghi chú
            </button>
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {m.status === "done" ? (
          <button className="btn-ghost !px-2 !py-1 text-[11px]" onClick={onReset}>
            ↺ Bắt đầu lại
          </button>
        ) : (
          <button
            className={`btn-ghost !px-2 !py-1 text-[11px] ${
              m.status === "live" ? "text-red-600 font-bold" : ""
            }`}
            onClick={() => onStatus(m.status === "live" ? "pending" : "live")}
          >
            {m.status === "live" ? "⏸ Tạm dừng" : "▶ Bắt đầu"}
          </button>
        )}
        <Link
          to="/cham-diem/$matchId"
          params={{ matchId: m.id } as any}
          className="btn-accent !px-2.5 !py-1 text-[11px]"
        >
          ⚡ Chấm điểm
        </Link>
      </div>
    </div>
  );
}

function KoCard({
  m,
  nameA,
  nameB,
  isLiveA,
  isLiveB,
  onScore,
  onStatus,
  onReset,
  onDropTeam,
  onViewNote,
}: {
  m: Match;
  nameA: string;
  nameB: string;
  isLiveA?: boolean;
  isLiveB?: boolean;
  onScore: (k: "scoreA" | "scoreB", v: number | null) => void;
  onStatus: (s: Match["status"]) => void;
  onReset: () => void;
  onDropTeam: (side: "aId" | "bId") => void;
  onViewNote?: (note: string) => void;
  key?: React.Key;
}) {
  const aWin = m.scoreA !== null && m.scoreB !== null && m.scoreA > m.scoreB;
  const bWin = m.scoreA !== null && m.scoreB !== null && m.scoreB > m.scoreA;
  const hasNote = Boolean(m.note || m.live?.note);

  const row = (win: boolean, live: boolean | undefined) =>
    `flex items-center justify-between gap-2 px-2.5 py-2 transition-all ${
      win ? "font-bold text-ink" : "text-line/70"
    } ${live ? "bg-red-50/50 text-red-600 font-extrabold" : ""}`;

  return (
    <div
      className={`overflow-hidden rounded-xl bg-card ring-1 transition-all ${
        m.status === "live" ? "ring-2 ring-red-500 shadow-md" : "ring-line/20"
      }`}
    >
      <div className="flex items-center justify-between border-b border-line/10 bg-secondary/30 px-2 py-1 text-[10px] font-semibold text-line/60">
        <span>{m.koRound || `Vòng ${m.round}`}</span>
        <div className="flex items-center gap-1">
          {m.status === "live" && (
            <span className="flex items-center gap-1 text-red-600 font-bold animate-pulse">
              <span className="size-1.5 rounded-full bg-red-600" />
              Đang đấu
            </span>
          )}
          {hasNote && onViewNote && (
            <button
              type="button"
              className="text-amber-600 font-bold hover:underline"
              onClick={() => onViewNote(m.note || m.live?.note || "")}
            >
              📝 Ghi chú
            </button>
          )}
        </div>
      </div>

      <div
        className={row(aWin, isLiveA)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDropTeam("aId")}
      >
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {isLiveA && <span className="size-2 rounded-full bg-red-600 animate-pulse shrink-0" />}
          <span className="truncate text-sm">{nameA}</span>
        </div>
        <ScoreBox value={m.scoreA} onCommit={(v) => onScore("scoreA", v)} />
      </div>

      <div className="h-px bg-line/10" />

      <div
        className={row(bWin, isLiveB)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDropTeam("bId")}
      >
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {isLiveB && <span className="size-2 rounded-full bg-red-600 animate-pulse shrink-0" />}
          <span className="truncate text-sm">{nameB}</span>
        </div>
        <ScoreBox value={m.scoreB} onCommit={(v) => onScore("scoreB", v)} />
      </div>

      <div className="flex items-center justify-between gap-1.5 bg-secondary/50 px-2 py-1.5 border-t border-line/10">
        <div className="flex items-center gap-1">
          {m.status === "done" ? (
            <button className="btn-ghost !px-1.5 !py-0.5 text-[10px]" onClick={onReset}>
              ↺ Lại
            </button>
          ) : (
            <button
              className={`btn-ghost !px-1.5 !py-0.5 text-[10px] ${
                m.status === "live" ? "text-red-600 font-bold" : ""
              }`}
              onClick={() => onStatus(m.status === "live" ? "pending" : "live")}
            >
              {m.status === "live" ? "⏸ Dừng" : "▶ Bắt đầu"}
            </button>
          )}
        </div>
        <Link
          to="/cham-diem/$matchId"
          params={{ matchId: m.id } as any}
          className="btn-accent !px-2 !py-0.5 text-[11px]"
        >
          ⚡ Chấm điểm
        </Link>
      </div>
    </div>
  );
}

/* ---------------- Trang chính Quản lý giải ---------------- */

function ManagePage() {
  const { state, update, updateEvent, updateMatch } = useTournament();
  const [activeId, setActiveId] = useState(state.events[0]?.id ?? "");
  const [tab, setTab] = useState<"group" | "timeline" | "ko">("group");
  const [note, setNote] = useState("");
  const [dragMatch, setDragMatch] = useState<string | null>(null);
  const [dragEntry, setDragEntry] = useState<string | null>(null);

  // Modal quản lý sân & trọng tài
  const [courtModalOpen, setCourtModalOpen] = useState(false);
  const [newCourtName, setNewCourtName] = useState("");
  const [newRefName, setNewRefName] = useState("");

  // Modal xem ghi chú
  const [viewNoteText, setViewNoteText] = useState<string | null>(null);

  // Zoom timeline
  const [zoomIdx, setZoomIdx] = useState(1);
  const zoomWidths = [160, 210, 270, 340];
  const colWidth = zoomWidths[zoomIdx] ?? 210;

  // Real-time red line
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  const [nowString, setNowString] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
      setNowString(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
      );
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const ev: TEvent | undefined = state.events.find((e) => e.id === activeId) ?? state.events[0];
  const entries = useMemo(
    () => state.entries.filter((e) => ev && e.eventId === ev.id),
    [state.entries, ev],
  );
  const matches = useMemo(
    () => state.matches.filter((m) => ev && m.eventId === ev.id),
    [state.matches, ev],
  );

  // Danh sách VĐV đang thi đấu trên toàn giải
  const activePlayerNames = useMemo(
    () => getActivePlayerNames(state.matches, state.entries),
    [state.matches, state.entries],
  );

  // Danh sách các trận đang diễn ra trực tiếp
  const allLiveMatches = useMemo(
    () => state.matches.filter((m) => m.status === "live"),
    [state.matches],
  );

  if (!ev) {
    return (
      <div className="max-w-xl">
        <h1 className="font-head text-4xl font-bold uppercase tracking-tight">Quản lý giải đấu</h1>
        <p className="mt-3 text-sm text-line/60">Chưa có nội dung nào để điều hành.</p>
        <Link to="/noi-dung" className="btn-accent mt-4 inline-block">
          Tạo nội dung
        </Link>
      </div>
    );
  }

  const nameOf = (id: string | null) =>
    id ? entryName(entries.find((e) => e.id === id)) : "Chờ xác định";

  const isEntryActive = (id: string | null) => {
    if (!id) return false;
    const entry = state.entries.find((e) => e.id === id);
    return entry?.players.some((p) => p.name && activePlayerNames.has(p.name)) ?? false;
  };

  const groupMatches = matches.filter((m) => m.stage === "group");
  const koMatches = matches.filter((m) => m.stage === "ko");

  const buildGroups = () => {
    if (entries.length < 2) {
      setNote("Cần ít nhất 2 đội.");
      return;
    }
    const fresh = generateGroupMatches(ev, entries, state.courts);
    update({
      matches: [
        ...state.matches.filter((m) => !(m.eventId === ev.id && m.stage === "group")),
        ...fresh,
      ],
    });
    setNote(`Đã tạo ${fresh.length} trận vòng bảng.`);
  };

  const buildKo = () => {
    const fresh = generateKnockout(ev, entries, groupMatches, state.courts);
    if (!fresh.length) {
      setNote("Chưa đủ dữ liệu vòng bảng để tạo nhánh loại trực tiếp.");
      return;
    }
    update({
      matches: [...state.matches.filter((m) => !(m.eventId === ev.id && m.stage === "ko")), ...fresh],
    });
    setTab("ko");
    setNote(`Đã tạo ${fresh.length} trận loại trực tiếp.`);
  };

  const resetKo = () => {
    const fresh = generateKnockout(ev, entries, groupMatches, state.courts);
    update({
      matches: [...state.matches.filter((m) => !(m.eventId === ev.id && m.stage === "ko")), ...fresh],
    });
    setNote("Đã làm mới lại toàn bộ nhánh loại trực tiếp.");
  };

  const setScore = (m: Match, key: "scoreA" | "scoreB", v: number | null) => {
    const patched = state.matches.map((x) =>
      x.id === m.id
        ? {
            ...x,
            [key]: v,
            status: (v !== null && (key === "scoreA" ? x.scoreB : x.scoreA) !== null
              ? "done"
              : x.status) as Match["status"],
          }
        : x,
    );
    update({ matches: propagateKnockout(patched, ev.id) });
  };

  const resetMatch = (m: Match) => {
    const patched: Match[] = state.matches.map((x) => {
      if (x.id !== m.id) return x;
      const { live: _live, ...rest } = x;
      return { ...rest, scoreA: null, scoreB: null, status: "pending" as const };
    });
    update({ matches: propagateKnockout(patched, ev.id) });
  };

  const cardProps = (m: Match, compact?: boolean): CardProps => ({
    m,
    nameA: nameOf(m.aId),
    nameB: nameOf(m.bId),
    isLiveA: isEntryActive(m.aId),
    isLiveB: isEntryActive(m.bId),
    onScore: (k, v) => setScore(m, k, v),
    onStatus: (s) => updateMatch(m.id, { status: s }),
    onReset: () => resetMatch(m),
    courts: state.courts,
    courtIcons: state.courtIcons,
    referees: state.referees,
    onCourt: (c) => updateMatch(m.id, { court: c }),
    onReferee: (r) => updateMatch(m.id, { referee: r }),
    onRemoveFromTimeline: () => updateMatch(m.id, { timeSlot: undefined }),
    onViewNote: (n) => setViewNoteText(n),
    compact,
  });

  /* -------- Vòng bảng theo cột vòng -------- */
  const rounds = [...new Set(groupMatches.map((m) => m.round))].sort((a, b) => (a ?? 0) - (b ?? 0));

  /* -------- Timeline -------- */
  const timelineSource = tab === "timeline" ? matches : [];
  const grid = buildTimeline(timelineSource, state.courts);
  const maxSlot = Math.max(
    3,
    ...[...grid.values()].flatMap((list) => list.map((s) => s.slot + 1)),
  );
  const slotIdxs = Array.from({ length: maxSlot + 1 }, (_, i) => i);

  // Trận chờ xếp lịch (chưa gán timeSlot)
  const unassignedMatches = useMemo(
    () => matches.filter((m) => m.timeSlot === undefined),
    [matches],
  );

  const dropOn = (court: string, slot: number) => {
    if (!dragMatch) return;
    updateMatch(dragMatch, { court, timeSlot: slot });
    setDragMatch(null);
  };

  const clearTimeline = () => {
    const patched = state.matches.map((m) =>
      m.eventId === ev.id ? { ...m, timeSlot: undefined } : m,
    );
    update({ matches: patched });
    setNote("Đã xoá lịch timeline.");
  };

  const handleAutoSchedule = () => {
    const updated = autoScheduleTimeline(
      matches,
      state.courts,
    );
    const patched = state.matches.map((m) => {
      const found = updated.find((u) => u.id === m.id);
      return found ?? m;
    });
    update({ matches: patched });
    setNote("Đã tự động sắp xếp các trận vào timeline.");
  };

  const exportCsv = () => {
    const headers = [
      "Thời gian",
      "Sân",
      "Nội dung",
      "Giai đoạn / Bảng",
      "Đội 1",
      "Tỉ số 1",
      "Tỉ số 2",
      "Đội 2",
      "Trọng tài",
      "Trạng thái",
      "Ghi chú",
    ];
    const rows = matches
      .filter((m) => m.timeSlot !== undefined)
      .sort((a, b) => (a.timeSlot ?? 0) - (b.timeSlot ?? 0) || a.court.localeCompare(b.court))
      .map((m) => {
        const time = addMinutes(state.startTime, (m.timeSlot ?? 0) * state.slotMinutes);
        const nameA = nameOf(m.aId);
        const nameB = nameOf(m.bId);
        const stage =
          m.stage === "ko"
            ? m.koRound || `Vòng ${m.round}`
            : `${m.groupName} - Vòng ${m.round}`;
        const status =
          m.status === "done" ? "Đã xong" : m.status === "live" ? "Đang đấu" : "Chờ đấu";
        const icon = state.courtIcons?.[m.court] ? `${state.courtIcons[m.court]} ` : "";
        return [
          time,
          `"${icon}${m.court}"`,
          `"${ev.name}"`,
          `"${stage}"`,
          `"${nameA}"`,
          m.scoreA !== null ? m.scoreA : "",
          m.scoreB !== null ? m.scoreB : "",
          `"${nameB}"`,
          `"${m.referee || ""}"`,
          `"${status}"`,
          `"${m.note || m.live?.note || ""}"`,
        ].join(",");
      });

    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Lich_Thi_Dau_${ev.name.replace(/\s+/g, "_")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* Tính toán vị trí đường kẻ đỏ thời gian hiện tại */
  const [startH, startM] = state.startTime.split(":").map(Number);
  const startTotalMinutes = (startH ?? 8) * 60 + (startM ?? 0);
  const diffMinutes = nowMinutes - startTotalMinutes;
  const isNowInGrid =
    diffMinutes >= 0 && diffMinutes <= slotIdxs.length * state.slotMinutes;
  const redLineOffsetPx = isNowInGrid
    ? 130 + (diffMinutes / state.slotMinutes) * colWidth
    : null;

  /* -------- Nhánh loại trực tiếp -------- */
  const koRounds = [...new Set(koMatches.filter((m) => m.slot !== 99).map((m) => m.round))].sort(
    (a, b) => (a ?? 0) - (b ?? 0),
  );
  const thirdMatch = koMatches.find((m) => m.slot === 99);

  const dropTeam = (m: Match, side: "aId" | "bId") => {
    if (!dragEntry) return;
    updateMatch(m.id, { [side]: dragEntry } as Partial<Match>);
    setDragEntry(null);
  };

  const TabBtn = ({ id, label }: { id: typeof tab; label: string }) => (
    <button
      className={
        tab === id
          ? "rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground shadow-xs"
          : "rounded-lg bg-card px-3 py-2 text-sm font-semibold text-line/70 ring-1 ring-line/20 hover:bg-card/80"
      }
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Tiêu đề & Chọn nội dung */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-head text-3xl font-extrabold uppercase tracking-tight text-ink sm:text-4xl">
            Quản lý giải đấu
          </h1>
          <p className="mt-1 text-xs text-line/60">
            Điều hành trực tiếp các trận đấu, sân thi đấu, trọng tài và sơ đồ bảng/nhánh KO.
          </p>
        </div>

        <button
          className="btn-ghost flex items-center gap-1.5 self-start sm:self-auto text-xs"
          onClick={() => setCourtModalOpen(true)}
        >
          ⚙️ Quản lý Sân & Trọng tài ({state.courts.length} sân)
        </button>
      </div>

      {/* Thanh thông báo các trận ĐANG DIỄN RA (Active Matches Bar) */}
      {allLiveMatches.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
              </span>
              <span className="font-head text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                Trận đang diễn ra trực tiếp ({allLiveMatches.length})
              </span>
            </div>
            <span className="text-[11px] text-red-600/80 font-medium">
              VĐV trong các trận này được đánh dấu đỏ nổi bật
            </span>
          </div>

          <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
            {allLiveMatches.map((m) => {
              const evMatch = state.events.find((e) => e.id === m.eventId);
              const tA = state.entries.find((e) => e.id === m.aId);
              const tB = state.entries.find((e) => e.id === m.bId);
              const icon = state.courtIcons?.[m.court] || "🎾";
              return (
                <div
                  key={m.id}
                  className="w-72 shrink-0 rounded-xl bg-card p-2.5 ring-1 ring-red-500/40 shadow-xs"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-accent truncate max-w-[120px]">
                      {evMatch?.name}
                    </span>
                    <span className="font-semibold text-line/60">
                      {icon} {m.court}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-xs font-bold">
                    <span className="truncate text-red-600 font-extrabold">{entryName(tA)}</span>
                    <span className="rounded bg-red-600 px-2 py-0.5 text-white font-head text-xs tabular-nums">
                      {m.scoreA ?? 0} - {m.scoreB ?? 0}
                    </span>
                    <span className="truncate text-red-600 font-extrabold">{entryName(tB)}</span>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Link
                      to="/cham-diem/$matchId"
                      params={{ matchId: m.id } as any}
                      className="btn-accent !px-2.5 !py-0.5 text-[10px]"
                    >
                      ⚡ Vào chấm điểm
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs chọn nội dung thi đấu */}
      <div className="flex flex-wrap gap-2">
        {state.events.map((e) => (
          <button
            key={e.id}
            onClick={() => setActiveId(e.id)}
            className={
              e.id === ev.id
                ? "rounded-lg bg-line px-3.5 py-2 text-sm font-semibold text-paper shadow-xs"
                : "rounded-lg bg-card px-3.5 py-2 text-sm font-semibold text-line/70 ring-1 ring-line/20 hover:bg-card/80"
            }
          >
            {e.name}
          </button>
        ))}
      </div>

      {/* Thanh điều khiển & Sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line/10 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <TabBtn id="group" label="Vòng bảng" />
          <TabBtn id="timeline" label="Timeline sân" />
          <TabBtn id="ko" label="Loại trực tiếp" />
          <span className="mx-1 h-5 w-px bg-line/15" />

          {tab === "ko" ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-line/70">
                Đi tiếp / bảng:
                <input
                  type="number"
                  min={1}
                  max={4}
                  className="field w-14 text-center !py-1 text-xs"
                  value={ev.advancePerGroup}
                  onChange={(e) =>
                    updateEvent(ev.id, {
                      advancePerGroup: Math.max(1, Math.min(4, Number(e.target.value) || 1)),
                    })
                  }
                />
              </label>
              <button className="btn-accent text-xs" onClick={buildKo}>
                Tạo nhánh KO
              </button>
              {koMatches.length > 0 && (
                <button className="btn-ghost text-xs" onClick={resetKo}>
                  ↺ Làm lại nhánh KO
                </button>
              )}
            </div>
          ) : tab === "timeline" ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5 font-semibold text-line/70">
                Bắt đầu:
                <input
                  type="time"
                  className="field !w-24 !py-1 text-xs"
                  value={state.startTime}
                  onChange={(e) => update({ startTime: e.target.value })}
                />
              </label>

              <div className="flex items-center gap-1 font-semibold text-line/70">
                <span>Phút/trận:</span>
                <input
                  type="number"
                  min={5}
                  max={120}
                  step={5}
                  className="field !w-16 text-center !py-1 text-xs"
                  value={state.slotMinutes}
                  onChange={(e) =>
                    update({ slotMinutes: Math.max(5, Number(e.target.value) || 30) })
                  }
                />
                <div className="flex gap-0.5">
                  {[15, 20, 25, 30, 45].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        state.slotMinutes === m
                          ? "bg-accent text-accent-foreground"
                          : "bg-card text-line/60 ring-1 ring-line/15"
                      }`}
                      onClick={() => update({ slotMinutes: m })}
                    >
                      {m}p
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <button className="btn-accent text-xs" onClick={buildGroups}>
              Tạo lịch vòng bảng
            </button>
          )}
        </div>

        {tab === "timeline" && (
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center rounded-lg bg-card p-0.5 ring-1 ring-line/20">
              <button
                type="button"
                className="px-2 py-1 text-xs font-bold text-line/70 hover:text-ink disabled:opacity-30"
                disabled={zoomIdx <= 0}
                onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
              >
                🔍 Thu nhỏ
              </button>
              <span className="px-1 text-[10px] text-line/40">|</span>
              <button
                type="button"
                className="px-2 py-1 text-xs font-bold text-line/70 hover:text-ink disabled:opacity-30"
                disabled={zoomIdx >= zoomWidths.length - 1}
                onClick={() => setZoomIdx((i) => Math.min(zoomWidths.length - 1, i + 1))}
              >
                Phóng to 🔎
              </button>
            </div>

            <button
              className="btn-accent text-xs !py-1.5"
              onClick={handleAutoSchedule}
              title="Tự động xếp tất cả các trận chưa có giờ vào timeline"
            >
              ⚡ Tự động sắp vào timeline
            </button>
            <button
              className="btn-ghost text-xs !py-1.5"
              onClick={clearTimeline}
              title="Xoá toàn bộ giờ đã xếp trên timeline"
            >
              🧹 Xoá lịch
            </button>
            <button
              className="btn-ghost text-xs !py-1.5 text-courtdeep font-bold"
              onClick={exportCsv}
              title="Xuất bảng lịch thi đấu ra file Excel / CSV"
            >
              📊 Xuất Excel
            </button>
          </div>
        )}

        {note && <span className="text-xs font-medium text-courtdeep">{note}</span>}
      </div>

      {/* ---------- VÒNG BẢNG ---------- */}
      {tab === "group" && (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            {rounds.length === 0 ? (
              <div className="panel p-6 text-center text-sm text-line/60">
                Chưa có lịch thi đấu vòng bảng. Bấm nút <strong>“Tạo lịch vòng bảng”</strong> để bắt đầu.
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-4">
                {rounds.map((r) => (
                  <div key={r} className="w-[280px] shrink-0">
                    <div className="rounded-xl bg-accent/15 py-2.5 text-center font-head text-sm font-bold uppercase tracking-wide text-accent ring-1 ring-accent/30">
                      Vòng {r}
                    </div>
                    <div className="mt-3 space-y-3">
                      {groupMatches
                        .filter((m) => m.round === r)
                        .sort((a, b) => a.groupName.localeCompare(b.groupName))
                        .map((m) => (
                          <MatchCard key={m.id} {...cardProps(m)} />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bảng xếp hạng bên phải */}
          <div className="lg:col-span-4">
            <p className="eyebrow">Bảng xếp hạng</p>
            {(ev.groups.length
              ? ev.groups
              : [{ name: "Vòng tròn", entryIds: entries.map((e) => e.id) }]
            ).map((g) => {
              const rows = computeStandings(
                g.entryIds,
                groupMatches.filter((m) => m.groupName === g.name),
                ev,
              );
              const c = groupColor(g.name);
              return (
                <div key={g.name} className="panel mt-3 overflow-hidden rounded-xl">
                  <p
                    className="px-3 py-2 font-head text-sm font-bold uppercase tracking-wide"
                    style={{ backgroundColor: c.bg, color: c.text }}
                  >
                    {g.name}
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-line/10 text-[10px] uppercase tracking-wide text-line/50">
                        <th className="px-3 py-2 text-left">Đội</th>
                        <th className="px-1 py-2 text-center">Tr</th>
                        <th className="px-1 py-2 text-center">T</th>
                        <th className="px-1 py-2 text-center">B</th>
                        <th className="px-1 py-2 text-center">HS</th>
                        <th className="px-3 py-2 text-center">Đ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const isLive = isEntryActive(r.entryId);
                        return (
                          <tr key={r.entryId} className="border-t border-line/10 hover:bg-card/50">
                            <td className="max-w-[150px] truncate px-3 py-2">
                              <span className="mr-1.5 font-head font-bold text-line/40">{i + 1}</span>
                              <span className={isLive ? "text-red-600 font-extrabold" : "font-medium"}>
                                {nameOf(r.entryId)}
                              </span>
                            </td>
                            <td className="px-1 py-2 text-center">{r.played}</td>
                            <td className="px-1 py-2 text-center">{r.win}</td>
                            <td className="px-1 py-2 text-center">{r.loss}</td>
                            <td className="px-1 py-2 text-center">{r.diff}</td>
                            <td className="px-3 py-2 text-center font-bold text-accent">{r.points}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- TIMELINE SÂN VÀ KHUNG GIỜ ---------- */}
      {tab === "timeline" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-line/60">
            <p>
              Kéo thả các thẻ trận giữa các sân hoặc từ <strong>“Hàng chờ xếp lịch”</strong> vào ô giờ.
            </p>
            {unassignedMatches.length > 0 && (
              <span className="font-bold text-amber-600 dark:text-amber-400">
                Còn {unassignedMatches.length} trận chưa xếp giờ
              </span>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-12 items-start">
            {/* Bảng timeline với sticky headers */}
            <div className="lg:col-span-9 panel overflow-hidden rounded-2xl">
              <div className="relative max-h-[70vh] overflow-auto">
                {/* Đường chỉ đỏ thời gian thực */}
                {redLineOffsetPx !== null && (
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 z-25 w-0.5 bg-red-600 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                    style={{ left: `${redLineOffsetPx}px` }}
                  >
                    <div className="sticky top-1 -translate-x-1/2 whitespace-nowrap rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-md">
                      Bây giờ: {nowString}
                    </div>
                  </div>
                )}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `130px repeat(${slotIdxs.length}, ${colWidth}px)`,
                  }}
                >
                  {/* Ô góc trên bên trái: STICKY top-0 left-0 z-30 */}
                  <div className="sticky top-0 left-0 z-30 border-b border-r border-line/20 bg-card p-3 text-[11px] font-bold uppercase tracking-wider text-line/70 shadow-xs">
                    Sân / Giờ
                  </div>

                  {/* Hàng giờ: STICKY top-0 z-20 */}
                  {slotIdxs.map((s) => (
                    <div
                      key={`h${s}`}
                      className="sticky top-0 z-20 border-b border-l border-line/15 bg-card/95 p-3 text-center text-[11px] font-bold uppercase tracking-wider text-line/70 backdrop-blur-xs shadow-xs"
                    >
                      {addMinutes(state.startTime, s * state.slotMinutes)}
                    </div>
                  ))}

                  {/* Từng dòng Sân */}
                  {state.courts.map((court) => {
                    const icon = state.courtIcons?.[court] || "🎾";
                    return (
                      <React.Fragment key={court}>
                        {/* Cột Sân: STICKY left-0 z-10 */}
                        <div className="sticky left-0 z-10 border-b border-r border-line/20 bg-card/95 p-3 text-xs font-bold text-ink backdrop-blur-xs flex items-center gap-1.5 shadow-xs">
                          <span>{icon}</span>
                          <span className="truncate">{court}</span>
                        </div>

                        {/* Các ô giờ của Sân này */}
                        {slotIdxs.map((s) => {
                          const cell = (grid.get(court) ?? []).filter((x) => x.slot === s);
                          return (
                            <div
                              key={`${court}-${s}`}
                              className="min-h-[110px] border-b border-l border-line/10 p-1.5 transition hover:bg-line/5"
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => dropOn(court, s)}
                            >
                              {cell.map(({ match: m }) => (
                                <div
                                  key={m.id}
                                  draggable
                                  onDragStart={() => setDragMatch(m.id)}
                                  className="cursor-grab active:cursor-grabbing"
                                >
                                  <MatchCard {...cardProps(m, true)} />
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Cột trận chờ xếp lịch bên phải */}
            <div className="lg:col-span-3 panel p-3 max-h-[70vh] flex flex-col rounded-2xl">
              <div className="flex items-center justify-between border-b border-line/10 pb-2">
                <p className="eyebrow">Trận chờ xếp ({unassignedMatches.length})</p>
              </div>
              <p className="mt-2 text-[11px] text-line/60">
                Kéo thả thẻ trận vào bất kỳ ô giờ nào trên bảng timeline bên trái.
              </p>

              <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1">
                {unassignedMatches.length === 0 ? (
                  <p className="py-8 text-center text-xs text-line/40">
                    Tất cả các trận đã được xếp lịch!
                  </p>
                ) : (
                  unassignedMatches.map((m) => (
                    <div
                      key={m.id}
                      draggable
                      onDragStart={() => setDragMatch(m.id)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <MatchCard {...cardProps(m, true)} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- LOẠI TRỰC TIẾP (KNOCKOUT) ---------- */}
      {tab === "ko" && (
        <div className="grid gap-6 lg:grid-cols-12 items-start">
          <div className="lg:col-span-9 overflow-x-auto pb-4">
            {koRounds.length === 0 ? (
              <div className="panel p-6 text-center text-sm text-line/60 rounded-2xl">
                Chưa có nhánh loại trực tiếp. Bấm <strong>“Tạo nhánh KO”</strong> để sinh sơ đồ.
              </div>
            ) : (
              <div className="flex min-w-max gap-8 items-stretch">
                {koRounds.map((r, colIdx) => {
                  const list = koMatches
                    .filter((m) => m.round === r && m.slot !== 99)
                    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));

                  const roundTitle =
                    list[0]?.koRound ||
                    (r === koRounds.length
                      ? "Chung kết"
                      : r === koRounds.length - 1
                        ? "Bán kết"
                        : r === koRounds.length - 2
                          ? "Tứ kết"
                          : `Vòng ${r}`);

                  return (
                    <div key={r} className="w-[270px] shrink-0 flex flex-col">
                      <div className="rounded-xl bg-accent/15 py-2.5 text-center font-head text-sm font-bold uppercase tracking-wide text-accent ring-1 ring-accent/30 shadow-xs">
                        {roundTitle}
                      </div>

                      <div className="mt-4 flex flex-1 flex-col justify-around gap-6">
                        {list.map((m) => (
                          <KoCard
                            key={m.id}
                            m={m}
                            nameA={nameOf(m.aId)}
                            nameB={nameOf(m.bId)}
                            isLiveA={isEntryActive(m.aId)}
                            isLiveB={isEntryActive(m.bId)}
                            onScore={(k, v) => setScore(m, k, v)}
                            onStatus={(s) => updateMatch(m.id, { status: s })}
                            onReset={() => resetMatch(m)}
                            onDropTeam={(side) => dropTeam(m, side)}
                            onViewNote={(n) => setViewNoteText(n)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Trận tranh hạng 3 */}
                {thirdMatch && (
                  <div className="w-[270px] shrink-0 flex flex-col justify-end">
                    <div className="rounded-xl bg-court/15 py-2.5 text-center font-head text-sm font-bold uppercase tracking-wide text-courtdeep ring-1 ring-court/30">
                      Tranh hạng 3
                    </div>
                    <div className="mt-4">
                      <KoCard
                        m={thirdMatch}
                        nameA={nameOf(thirdMatch.aId)}
                        nameB={nameOf(thirdMatch.bId)}
                        isLiveA={isEntryActive(thirdMatch.aId)}
                        isLiveB={isEntryActive(thirdMatch.bId)}
                        onScore={(k, v) => setScore(thirdMatch, k, v)}
                        onStatus={(s) => updateMatch(thirdMatch.id, { status: s })}
                        onReset={() => resetMatch(thirdMatch)}
                        onDropTeam={(side) => dropTeam(thirdMatch, side)}
                        onViewNote={(n) => setViewNoteText(n)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cột kéo thả VĐV vào nhánh KO */}
          <div className="lg:col-span-3 panel p-3.5 rounded-2xl">
            <p className="eyebrow">Xếp thủ công vào nhánh</p>
            <p className="mt-1 text-xs text-line/60">
              Kéo tên đội bên dưới thả trực tiếp vào ô trong nhánh để tự chọn cặp đấu.
            </p>
            <div className="mt-3 max-h-[480px] space-y-1.5 overflow-y-auto pr-1">
              {entries.map((e: Entry) => {
                const isLive = isEntryActive(e.id);
                return (
                  <div
                    key={e.id}
                    draggable
                    onDragStart={() => setDragEntry(e.id)}
                    className={`cursor-grab truncate rounded-lg px-2.5 py-2 text-xs font-semibold shadow-xs ring-1 ring-line/10 active:cursor-grabbing ${
                      isLive
                        ? "bg-red-50 text-red-600 ring-red-300 dark:bg-red-950/40"
                        : "bg-secondary text-line/80 hover:bg-secondary/80"
                    }`}
                  >
                    {isLive && <span className="mr-1 text-red-600">🔴</span>}
                    {entryName(e)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL QUẢN LÝ SÂN & TRỌNG TÀI */}
      {courtModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-card p-6 shadow-2xl ring-1 ring-line/20 space-y-5">
            <div className="flex items-center justify-between border-b border-line/15 pb-3">
              <h2 className="font-head text-lg font-bold uppercase tracking-tight">
                Quản lý Sân đấu & Trọng tài
              </h2>
              <button className="btn-ghost text-xs" onClick={() => setCourtModalOpen(false)}>
                Đóng
              </button>
            </div>

            {/* Quản lý sân */}
            <div>
              <p className="eyebrow">Danh sách sân ({state.courts.length})</p>
              <div className="mt-2.5 max-h-44 space-y-2 overflow-y-auto pr-1">
                {state.courts.map((court) => {
                  const currentIcon = state.courtIcons?.[court] || "🎾";
                  return (
                    <div
                      key={court}
                      className="flex items-center gap-2 rounded-lg bg-paper p-2 ring-1 ring-line/10"
                    >
                      <select
                        className="rounded bg-card px-1.5 py-1 text-base outline-none ring-1 ring-line/20"
                        value={currentIcon}
                        onChange={(e) => {
                          update({
                            courtIcons: {
                              ...(state.courtIcons || {}),
                              [court]: e.target.value,
                            },
                          });
                        }}
                      >
                        {["🎾", "🏓", "🏟️", "⚡", "🥇", "🎯", "🎪", "🏆", "🌟"].map((ic) => (
                          <option key={ic} value={ic}>
                            {ic}
                          </option>
                        ))}
                      </select>

                      <input
                        className="field flex-1 !py-1 text-xs"
                        value={court}
                        onChange={(e) => {
                          const newName = e.target.value;
                          const patchedCourts = state.courts.map((c) => (c === court ? newName : c));
                          const patchedMatches = state.matches.map((m) =>
                            m.court === court ? { ...m, court: newName } : m,
                          );
                          update({ courts: patchedCourts, matches: patchedMatches });
                        }}
                      />

                      {state.courts.length > 1 && (
                        <button
                          type="button"
                          className="rounded p-1 text-line/40 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => {
                            const patched = state.courts.filter((c) => c !== court);
                            update({ courts: patched });
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  className="field flex-1 !py-1 text-xs"
                  placeholder="Tên sân mới (vd: Sân VIP, Sân 4...)"
                  value={newCourtName}
                  onChange={(e) => setNewCourtName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newCourtName.trim()) {
                      update({ courts: [...state.courts, newCourtName.trim()] });
                      setNewCourtName("");
                    }
                  }}
                />
                <button
                  className="btn-accent text-xs"
                  disabled={!newCourtName.trim()}
                  onClick={() => {
                    if (newCourtName.trim()) {
                      update({ courts: [...state.courts, newCourtName.trim()] });
                      setNewCourtName("");
                    }
                  }}
                >
                  + Thêm sân
                </button>
              </div>
            </div>

            {/* Quản lý trọng tài */}
            <div className="border-t border-line/10 pt-4">
              <p className="eyebrow">Danh sách trọng tài ({state.referees?.length ?? 0})</p>
              <div className="mt-2.5 max-h-36 space-y-1.5 overflow-y-auto pr-1">
                {(state.referees ?? []).length === 0 ? (
                  <p className="text-xs text-line/50">Chưa có trọng tài nào được thêm.</p>
                ) : (
                  (state.referees ?? []).map((ref) => (
                    <div
                      key={ref}
                      className="flex items-center justify-between rounded-lg bg-paper px-3 py-1.5 text-xs ring-1 ring-line/10"
                    >
                      <span className="font-medium">{ref}</span>
                      <button
                        type="button"
                        className="text-line/40 hover:text-destructive"
                        onClick={() => {
                          update({
                            referees: (state.referees ?? []).filter((r) => r !== ref),
                          });
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  className="field flex-1 !py-1 text-xs"
                  placeholder="Tên trọng tài mới..."
                  value={newRefName}
                  onChange={(e) => setNewRefName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newRefName.trim()) {
                      update({ referees: [...(state.referees ?? []), newRefName.trim()] });
                      setNewRefName("");
                    }
                  }}
                />
                <button
                  className="btn-accent text-xs"
                  disabled={!newRefName.trim()}
                  onClick={() => {
                    if (newRefName.trim()) {
                      update({ referees: [...(state.referees ?? []), newRefName.trim()] });
                      setNewRefName("");
                    }
                  }}
                >
                  + Thêm TT
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button className="btn-accent text-xs" onClick={() => setCourtModalOpen(false)}>
                Hoàn tất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XEM GHI CHÚ TRẬN ĐẤU */}
      {viewNoteText !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-line/20">
            <h3 className="font-head text-base font-bold uppercase tracking-tight">
              📝 Ghi chú trận đấu
            </h3>
            <div className="mt-3 max-h-60 overflow-y-auto rounded-lg bg-paper p-3 text-xs leading-relaxed text-line/80 ring-1 ring-line/10 whitespace-pre-wrap">
              {viewNoteText || "Chưa có ghi chú nào."}
            </div>
            <div className="mt-4 flex justify-end">
              <button className="btn-accent text-xs" onClick={() => setViewNoteText(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
