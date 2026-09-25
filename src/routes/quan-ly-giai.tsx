import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import * as React from "react";
import html2canvas from "html2canvas";
import {
  addMinutes,
  autoScheduleTimeline,
  buildTimeline,
  computeStandings,
  entryName,
  generateEmptyKnockout,
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
  isWinning,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  isWinning?: boolean;
}) {
  const [raw, setRaw] = useState(value === null ? "" : String(value));
  useEffect(() => {
    setRaw(value === null ? "" : String(value));
  }, [value]);
  return (
    <input
      className={`w-11 rounded-md px-1 py-1 text-center text-sm font-bold ring-1 outline-none focus:ring-2 focus:ring-[#e44c11] transition-all ${
        isWinning
          ? "bg-[#e44c11]/15 text-[#e44c11] ring-2 ring-[#e44c11] font-bold shadow-xs"
          : "bg-card text-ink ring-line/20"
      }`}
      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
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

/* ---------------- Ô Trọng tài có ghi nhớ & Dropdown gợi ý ---------------- */

function RefereeSelector({
  value,
  referees,
  onSelect,
  onAddReferee,
  onClearReferees,
}: {
  value?: string;
  referees: string[];
  onSelect: (r: string) => void;
  onAddReferee?: (r: string) => void;
  onClearReferees?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value || "");

  useEffect(() => {
    setText(value || "");
  }, [value]);

  const commit = (name: string) => {
    const trimmed = name.trim();
    onSelect(trimmed);
    if (trimmed && onAddReferee && !referees.includes(trimmed)) {
      onAddReferee(trimmed);
    }
  };

  return (
    <div className="relative inline-block text-left">
      <div className="flex items-center rounded-md bg-card ring-1 ring-line/20 focus-within:ring-accent">
        <input
          type="text"
          className="w-24 px-1.5 py-0.5 text-[11px] outline-none bg-transparent"
          placeholder="Trọng tài..."
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onSelect(e.target.value);
          }}
          onBlur={() => commit(text)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit(text);
              setOpen(false);
            }
          }}
          onFocus={() => setOpen(true)}
        />
        <button
          type="button"
          tabIndex={-1}
          className="px-1 text-[10px] text-line/50 hover:text-ink cursor-pointer"
          onClick={() => setOpen((prev) => !prev)}
        >
          ▾
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 bottom-full mb-1 z-50 min-w-[180px] max-h-56 overflow-y-auto rounded-lg border border-line/20 bg-card p-1 shadow-2xl text-xs">
            <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold text-line/50 uppercase tracking-wider">
              <span>Danh sách trọng tài</span>
              {referees.length > 0 && onClearReferees && (
                <button
                  type="button"
                  className="text-red-500 hover:text-red-700 cursor-pointer font-normal text-[10px] lowercase"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearReferees();
                  }}
                  title="Xóa toàn bộ bộ nhớ trọng tài của giải này"
                >
                  Xóa bộ nhớ
                </button>
              )}
            </div>
            {referees.length === 0 ? (
              <div className="px-2 py-1.5 text-[11px] text-line/50 italic">
                Chưa có trọng tài. Nhập tên để ghi nhớ.
              </div>
            ) : (
              referees.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`w-full text-left px-2 py-1.5 rounded text-[11px] hover:bg-accent/10 transition truncate cursor-pointer ${
                    r === value ? "font-bold text-accent bg-accent/10" : "text-ink"
                  }`}
                  onClick={() => {
                    setText(r);
                    commit(r);
                    setOpen(false);
                  }}
                >
                  {r}
                </button>
              ))
            )}
            {text.trim() && !referees.includes(text.trim()) && (
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 rounded text-[11px] text-accent font-semibold hover:bg-accent/10 transition border-t border-line/10 mt-1 cursor-pointer"
                onClick={() => {
                  commit(text);
                  setOpen(false);
                }}
              >
                + Thêm "{text.trim()}"
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Chữ số La Mã cho xếp hạng hạt giống ---------------- */

const toRoman = (num: number) => {
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"];
  return romans[num - 1] ?? String(num);
};

/* ---------------- Đồng hồ bấm giờ trận đấu đang diễn ra trực tiếp (Ảnh 3) ---------------- */

function LiveStopwatch({ startedAt, onReset }: { startedAt?: number; onReset?: () => void }) {
  const getElapsed = (ts?: number) => {
    if (!ts) return 0;
    return Math.max(0, Math.floor((Date.now() - ts) / 1000));
  };

  const [elapsed, setElapsed] = useState(() => getElapsed(startedAt));

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    setElapsed(getElapsed(startedAt));
    const timer = setInterval(() => {
      setElapsed(getElapsed(startedAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <span
      className="text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded flex items-center gap-1 shadow-2xs shrink-0 select-none cursor-pointer"
      style={{ fontFamily: "'Courier New', Courier, monospace" }}
      title="Bấm để khởi động lại đồng hồ từ 00:00"
      onClick={onReset}
    >
      ⏱️ {mm}:{ss}
    </span>
  );
}

/* ---------------- Hiển thị Tên VĐV & Đỏ tên khi đang thi đấu (Ảnh 5: Bỏ chấm đỏ, giữ font gốc) ---------------- */

function PlayerNameDisplay({
  entry,
  fallback,
  activePlayerNames,
  isWinning,
  isMatchLive,
}: {
  entry?: Entry;
  fallback: string;
  activePlayerNames: Set<string>;
  isWinning?: boolean;
  isMatchLive?: boolean;
}) {
  if (!entry || entry.players.length === 0) {
    const isLive = Boolean(isMatchLive) || activePlayerNames.has((fallback || "").toLowerCase());
    return (
      <span
        className={`truncate ${
          isLive
            ? "text-red-600 dark:text-red-400 font-semibold"
            : isWinning
              ? "font-bold text-[#e44c11]"
              : "text-ink/85 font-medium"
        }`}
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {fallback || "Chưa xếp"}
      </span>
    );
  }
  return (
    <span className="truncate inline-flex items-center gap-1">
      {entry.players.map((p, idx) => {
        const pName = p.name.trim();
        if (!pName) return null;
        const isLive = Boolean(isMatchLive) || activePlayerNames.has(pName.toLowerCase());
        return (
          <span key={idx} className="inline-flex items-center shrink-0">
            {idx > 0 && <span className="text-line/40 mx-1">/</span>}
            <span
              className={`${
                isLive
                  ? "text-red-600 dark:text-red-400 font-semibold"
                  : isWinning
                    ? "font-bold text-[#e44c11]"
                    : "text-ink/85 font-medium"
              }`}
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              title={isLive ? `${pName} đang thi đấu!` : undefined}
            >
              {pName}
            </span>
          </span>
        );
      })}
    </span>
  );
}

type CardProps = {
  m: Match;
  nameA: string;
  nameB: string;
  entryA?: Entry;
  entryB?: Entry;
  activePlayerNames: Set<string>;
  isLiveA?: boolean;
  isLiveB?: boolean;
  onScore: (key: "scoreA" | "scoreB", v: number | null) => void;
  onStatus: (s: Match["status"]) => void;
  onReset: () => void;
  courts: string[];
  referees?: string[];
  onCourt: (c: string) => void;
  onReferee: (r: string) => void;
  onAddReferee?: (r: string) => void;
  onClearReferees?: () => void;
  onRemoveFromTimeline?: () => void;
  onViewNote?: (note: string) => void;
  onDurationChange?: (mins: number, recordHistory?: boolean) => void;
  onOffsetChange?: (offset: number, recordHistory?: boolean) => void;
  onMoveHorizontal?: (newSlot: number, newOffset: number, recordHistory?: boolean) => void;
  onDropOnMatch?: (targetMatchId: string) => void;
  hasConflict?: boolean;
  compact?: boolean | undefined;
  colWidth?: number;
  rowHeight?: number;
  slotMinutes?: number;
  key?: React.Key;
};

function MatchCard({
  m,
  nameA,
  nameB,
  entryA,
  entryB,
  activePlayerNames,
  isLiveA,
  isLiveB,
  onScore,
  onStatus,
  onReset,
  courts,
  referees = [],
  onCourt,
  onReferee,
  onAddReferee,
  onClearReferees,
  onRemoveFromTimeline,
  onViewNote,
  onDurationChange,
  onOffsetChange,
  onMoveHorizontal,
  onDropOnMatch,
  hasConflict,
  compact,
  colWidth = 210,
  rowHeight = 128,
  slotMinutes = 30,
}: CardProps) {
  const c = groupColor(m.groupName);
  const aWin = m.scoreA !== null && m.scoreB !== null && m.scoreA > m.scoreB;
  const bWin = m.scoreA !== null && m.scoreB !== null && m.scoreB > m.scoreA;
  const hasNote = Boolean(m.note || m.live?.note);

  const displayTag =
    m.stage === "ko"
      ? groupTag(m.groupName)
      : `${groupTag(m.groupName)} · V${m.round}`;

  const isUltraCompact = compact && rowHeight < 75;
  const isMidCompact = compact && rowHeight >= 75 && rowHeight < 100;

  return (
    <div
      className={`group relative rounded-xl ring-1 transition-all select-none flex flex-col justify-between overflow-hidden ${
        compact ? "cursor-grab active:cursor-grabbing" : ""
      } ${
        compact ? (isUltraCompact ? "p-1" : isMidCompact ? "p-1.5" : "p-2") : "p-2.5"
      } ${
        hasConflict
          ? "ring-1 ring-red-500 border border-red-500 shadow-sm"
          : m.status === "live"
            ? "ring-2 ring-red-500 shadow-md bg-red-50/70 dark:bg-red-950/20"
            : "ring-line/15"
      }`}
      style={{
        backgroundColor: m.status === "live" ? undefined : m.status === "done" ? "var(--muted)" : c.bg,
        height: compact ? "100%" : undefined,
        maxHeight: compact ? `${Math.max(40, rowHeight - 6)}px` : undefined,
      }}
      title={compact ? "Nắm giữ thẻ trận đấu để kéo thả sang sân khác hoặc đổi giờ thi đấu" : undefined}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shrink-0"
            style={{ backgroundColor: c.dot, color: "white", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {displayTag}
          </span>
          {hasConflict && (
            <span className="rounded bg-red-600 px-1 py-0.2 text-[9px] font-bold text-white shrink-0">
              Trùng giờ
            </span>
          )}
          {m.court && (
            <span className="text-[10px] font-medium text-line/60 truncate">
              {m.court}
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
              className="ml-1 rounded px-1 py-0.5 text-[11px] text-line/40 hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
              title="Xóa trận khỏi timeline (khi cấp nhầm)"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFromTimeline();
              }}
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <PlayerNameDisplay
              entry={entryA}
              fallback={nameA}
              activePlayerNames={activePlayerNames}
              isWinning={aWin}
              isMatchLive={m.status === "live"}
            />
          </div>
          <ScoreBox value={m.scoreA} onCommit={(v) => onScore("scoreA", v)} isWinning={aWin} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <PlayerNameDisplay
              entry={entryB}
              fallback={nameB}
              activePlayerNames={activePlayerNames}
              isWinning={bWin}
              isMatchLive={m.status === "live"}
            />
          </div>
          <ScoreBox value={m.scoreB} onCommit={(v) => onScore("scoreB", v)} isWinning={bWin} />
        </div>
      </div>

      {/* Hành động dưới thẻ */}
      {compact ? (
        /* Trên Timeline: thanh thao tác hiển thị rõ chữ bắt đầu và chấm điểm */
        rowHeight >= 65 ? (
          <div className="mt-1 flex items-center justify-between gap-1 border-t border-line/10 pt-1 text-[10px]">
            <div className="flex items-center gap-1">
              {m.status === "done" ? (
                <button
                  className="btn-ghost !px-1.5 !py-0.5 text-[9px] whitespace-nowrap cursor-pointer"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  onClick={onReset}
                >
                  ↺ Lại
                </button>
              ) : (
                <button
                  className={`btn-ghost !px-1.5 !py-0.5 text-[9px] whitespace-nowrap cursor-pointer ${
                    m.status === "live" ? "text-red-600 font-bold" : ""
                  }`}
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  onClick={() => onStatus(m.status === "live" ? "pending" : "live")}
                >
                  {m.status === "live" ? "⏸ Tạm dừng" : "▶ Bắt đầu"}
                </button>
              )}
            </div>
            <Link
              to="/cham-diem/$matchId"
              params={{ matchId: m.id } as any}
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              className="btn-ghost !px-1.5 !py-0.5 text-[9px] flex items-center gap-0.5 whitespace-nowrap font-medium cursor-pointer"
            >
              ⚡ Chấm điểm
            </Link>
          </div>
        ) : null
      ) : (
        /* Danh sách vòng bình thường ngoài Timeline */
        <div className="mt-2.5 space-y-2 border-t border-line/10 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              className="rounded-md bg-card px-1.5 py-1 text-[11px] font-semibold ring-1 ring-line/20 outline-none"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              value={m.court}
              onChange={(e) => onCourt(e.target.value)}
            >
              <option value="">Chọn sân...</option>
              {courts.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>

            <RefereeSelector
              value={m.referee}
              referees={referees}
              onSelect={onReferee}
              onAddReferee={onAddReferee}
              onClearReferees={onClearReferees}
            />

            {hasNote && onViewNote && (
              <button
                type="button"
                className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-300 dark:bg-amber-950/30 dark:text-amber-400 cursor-pointer"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                onClick={() => onViewNote(m.note || m.live?.note || "")}
              >
                📝 Ghi chú
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {m.status === "done" ? (
              <button
                className="btn-ghost !px-2 !py-1 text-[11px]"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                onClick={onReset}
              >
                ↺ Bắt đầu lại
              </button>
            ) : (
              <button
                className={`btn-ghost !px-2 !py-1 text-[11px] ${
                  m.status === "live" ? "text-red-600 font-bold" : ""
                }`}
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                onClick={() => onStatus(m.status === "live" ? "pending" : "live")}
              >
                {m.status === "live" ? "⏸ Tạm dừng" : "▶ Bắt đầu"}
              </button>
            )}
            <Link
              to="/cham-diem/$matchId"
              params={{ matchId: m.id } as any}
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              className="btn-ghost !px-2 !py-1 text-[11px] flex items-center gap-1"
            >
              ⚡ Chấm điểm
            </Link>
          </div>
        </div>
      )}

      {/* Cạnh phải nắm kéo trực tiếp để kéo dãn / thu gọn thời lượng (Direct Drag-to-Resize Handle) */}
      {compact && onDurationChange && (
        <div
          data-no-drag="true"
          className="absolute right-0 top-0 bottom-0 w-3.5 cursor-ew-resize hover:bg-accent/40 active:bg-accent/60 rounded-r transition-colors select-none z-30 flex items-center justify-center group/resize"
          title="Nắm kéo sang phải để kéo dài trận đấu, sang trái để thu ngắn lại (bước 5 phút, kéo thoải mái)"
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const startX = e.clientX;
            const slotMins = slotMinutes || 30;
            const startDur = m.durationMinutes ?? slotMins;
            const pxPerMin = (colWidth || 210) / slotMins;
            let currentDur = startDur;

            const wrapper = (e.currentTarget.closest(".timeline-card-wrapper") as HTMLElement) || e.currentTarget.parentElement?.parentElement;

            const prevCursor = document.body.style.cursor;
            const prevUserSelect = document.body.style.userSelect;
            document.body.style.cursor = "ew-resize";
            document.body.style.userSelect = "none";

            const onMouseMove = (moveEvent: MouseEvent) => {
              moveEvent.preventDefault();
              const deltaX = moveEvent.clientX - startX;
              const deltaMinutes = Math.round(deltaX / pxPerMin / 5) * 5;
              const newDur = Math.max(5, Math.min(360, startDur + deltaMinutes));
              if (newDur !== currentDur) {
                currentDur = newDur;
                if (wrapper) {
                  const newW = Math.max(36, Math.round((newDur / slotMins) * (colWidth || 210) - 6));
                  wrapper.style.width = `${newW}px`;
                }
              }
            };

            const onMouseUp = () => {
              document.body.style.cursor = prevCursor;
              document.body.style.userSelect = prevUserSelect;
              window.removeEventListener("mousemove", onMouseMove);
              window.removeEventListener("mouseup", onMouseUp);
              if (currentDur !== startDur) {
                onDurationChange(currentDur, true);
              }
            };

            window.addEventListener("mousemove", onMouseMove, { passive: false });
            window.addEventListener("mouseup", onMouseUp);
          }}
        />
      )}
    </div>
  );
}

function KoCard({
  m,
  nameA,
  nameB,
  entryA,
  entryB,
  seedBadgeA,
  seedBadgeB,
  activePlayerNames,
  isLiveA,
  isLiveB,
  isConflictA,
  isConflictB,
  hasRoundConflict,
  isKoLocked = false,
  onScore,
  onStatus,
  onReset,
  onDropTeam,
  onClearTeam,
  onStartDragTeam,
  onViewNote,
  referees = [],
  onReferee,
  onAddReferee,
}: {
  m: Match;
  nameA: string;
  nameB: string;
  entryA?: Entry;
  entryB?: Entry;
  seedBadgeA?: string | null;
  seedBadgeB?: string | null;
  activePlayerNames: Set<string>;
  isLiveA?: boolean;
  isLiveB?: boolean;
  isConflictA?: boolean;
  isConflictB?: boolean;
  hasRoundConflict?: boolean;
  isKoLocked?: boolean;
  onScore: (k: "scoreA" | "scoreB", v: number | null) => void;
  onStatus: (s: Match["status"]) => void;
  onReset: () => void;
  onDropTeam: (side: "aId" | "bId") => void;
  onClearTeam?: (side: "aId" | "bId") => void;
  onStartDragTeam?: (side: "aId" | "bId") => void;
  onViewNote?: (note: string) => void;
  referees?: string[];
  onReferee?: (r: string) => void;
  onAddReferee?: (r: string) => void;
  key?: React.Key;
}) {
  const aWin = m.scoreA !== null && m.scoreB !== null && m.scoreA > m.scoreB;
  const bWin = m.scoreA !== null && m.scoreB !== null && m.scoreB > m.scoreA;
  const hasNote = Boolean(m.note || m.live?.note);

  const formatSeed = (str?: string | null) => {
    if (!str) return null;
    const clean = str.trim();
    if (/^bye$/i.test(clean)) return "BYE";
    return clean
      .replace(/^Nhất\s+/i, "1")
      .replace(/^Nhì\s+/i, "2")
      .replace(/^Ba\s+/i, "3")
      .replace(/^Tư\s+/i, "4")
      .replace(/^I\s+/i, "1")
      .replace(/^II\s+/i, "2")
      .replace(/^III\s+/i, "3")
      .replace(/^IV\s+/i, "4")
      .replace(/\s*bảng\s*/gi, "")
      .replace(/\s+/g, "")
      .trim();
  };

  const seedA = seedBadgeA || formatSeed(m.customPlaceholderA);
  const seedB = seedBadgeB || formatSeed(m.customPlaceholderB);
  const isByeA = seedA === "BYE";
  const isByeB = seedB === "BYE";

  const getSeedBadgeClass = (seed?: string | null, isBye?: boolean) => {
    if (isBye) return "bg-line/15 text-line/60 border border-dashed border-line/30";
    if (!seed) return "bg-secondary text-line/70";
    const s = seed.trim().toLowerCase();
    // Đội Nhất bảng / Hạt giống 1: màu cam (Ảnh 5)
    if (
      s.startsWith("1") ||
      s.includes("nhất") ||
      s.includes("nhat") ||
      /^i\b/i.test(s) ||
      /seed\s*1\b/i.test(s) ||
      /hạt\s*giống\s*1\b/i.test(s)
    ) {
      return "bg-orange-500/15 text-[#e44c11] dark:bg-orange-500/25 dark:text-orange-300 font-bold border border-orange-500/30";
    }
    // Đội Nhì bảng / Hạt giống 2: màu xanh (Ảnh 5)
    if (
      s.startsWith("2") ||
      s.includes("nhì") ||
      s.includes("nhi") ||
      /^ii\b/i.test(s) ||
      /seed\s*2\b/i.test(s) ||
      /hạt\s*giống\s*2\b/i.test(s)
    ) {
      return "bg-[#0a3320]/15 text-[#0a3320] dark:bg-emerald-500/20 dark:text-emerald-300 font-bold border border-[#0a3320]/30";
    }
    return "bg-secondary text-line/70 border border-line/20";
  };
  const isByeMatch = Boolean(
    isByeA ||
    isByeB ||
    m.customPlaceholderA === "BYE" ||
    m.customPlaceholderB === "BYE" ||
    m.customPlaceholderA?.toLowerCase() === "bye" ||
    m.customPlaceholderB?.toLowerCase() === "bye" ||
    (m.round === 1 && !m.bId && !m.customPlaceholderB) ||
    (m.round === 1 && !m.aId && !m.customPlaceholderA)
  );

  const row = (win: boolean, live: boolean | undefined, isConflict?: boolean) =>
    `flex items-center justify-between gap-2 px-2.5 py-2 transition-all ${
      win ? "font-bold text-[#e44c11]" : "text-line/70"
    } ${live ? "bg-red-50/50 text-red-600 font-bold" : ""} ${
      isConflict ? "bg-red-100/90 dark:bg-red-950/50 text-red-900 dark:text-red-100 ring-1 ring-red-500 rounded-md my-0.5" : ""
    }`;

  // Kiểu viền frame trận vòng loại trực tiếp:
  // - Trận có suất BYE: viền màu cam (#e44c11), nét đứt 1.2px
  // - Trận đấu bình thường: viền màu cam (#e44c11), nét liền 1.2px
  const matchFrameBorder = hasRoundConflict
    ? "border-2 border-solid border-red-500 ring-2 ring-red-500 bg-red-50/60 dark:bg-red-950/30 shadow-md"
    : m.status === "live"
      ? "border-2 border-solid border-red-500 ring-2 ring-red-500 shadow-md bg-card"
      : isByeMatch
        ? "border-[1.2px] border-dashed border-[#e44c11]"
        : "border-[1.2px] border-solid border-[#e44c11]";

  return (
    <div
      className={`relative rounded-xl ${matchFrameBorder} bg-card shadow-xs overflow-hidden transition-all`}
      style={{ borderWidth: "1.2px" }}
    >
      <div
        className={`flex items-center justify-between border-b px-2 py-1 text-[10px] font-semibold rounded-t-xl ${
          hasRoundConflict
            ? "border-red-300 bg-red-100/90 text-red-900 dark:bg-red-900/40 dark:text-red-200"
            : "border-line/15 bg-secondary/40 text-line/70"
        }`}
      >
        <span className="font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {m.koRound || `Vòng ${m.round}`}
        </span>
        <div className="flex items-center gap-1">
          {hasRoundConflict && (
            <span className="flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-xs animate-pulse">
              ⚠️ Trùng đội trong vòng!
            </span>
          )}
          {m.status === "live" && (
            <span className="flex items-center gap-1 text-red-600 font-bold animate-pulse">
              <span className="size-1.5 rounded-full bg-red-600" />
              Đang đấu
            </span>
          )}
          {hasNote && onViewNote && (
            <button
              type="button"
              className="text-amber-600 font-bold hover:underline cursor-pointer"
              onClick={() => onViewNote(m.note || m.live?.note || "")}
            >
              📝 Ghi chú
            </button>
          )}
        </div>
      </div>

      {/* Đội A */}
      <div className="p-1 pb-0.5">
        <div
          className={`group/slot rounded-lg border ${
            aWin
              ? "border-[#e44c11]/50 bg-[#e44c11]/10 dark:bg-[#e44c11]/15 shadow-xs"
              : "border-line/25 dark:border-line/30 bg-muted/25 dark:bg-muted/15"
          } ${row(aWin, isLiveA, isConflictA)} ${
            m.aId ? "cursor-grab active:cursor-grabbing hover:bg-muted/40" : ""
          }`}
          draggable={!isKoLocked && Boolean(m.aId || (seedA && !isByeA))}
          onDragStart={(e) => {
            if (isKoLocked) return;
            e.stopPropagation();
            onStartDragTeam?.("aId");
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => !isKoLocked && onDropTeam("aId")}
          title={!isKoLocked && m.aId ? "Nắm kéo đội này để hoán đổi hoặc xếp sang trận khác" : undefined}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {seedA && (
              <span
                className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${getSeedBadgeClass(seedA, isByeA)}`}
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {seedA}
              </span>
            )}
            {isByeA ? (
              <span className="italic text-line/40 text-xs font-semibold">(Miễn đấu - BYE)</span>
            ) : (
              <PlayerNameDisplay
                entry={entryA}
                fallback={nameA}
                activePlayerNames={activePlayerNames}
                isWinning={aWin}
                isMatchLive={m.status === "live"}
              />
            )}
            {isConflictA && (
              <span className="shrink-0 text-[9px] font-extrabold text-red-600 bg-red-200/90 dark:bg-red-950 px-1 py-0.2 rounded border border-red-400 animate-pulse">
                ⚠️ Trùng đội
              </span>
            )}
            {!isKoLocked && m.aId && onClearTeam && (
              <button
                type="button"
                className="opacity-0 group-hover/slot:opacity-100 hover:text-red-600 p-0.5 rounded text-line/40 hover:bg-red-50 dark:hover:bg-red-950/40 transition-opacity cursor-pointer shrink-0"
                title="Xóa đội khỏi ô này (Ảnh 1)"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearTeam("aId");
                }}
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            )}
          </div>
          {isByeA ? (
            <span className="text-line/40 font-mono text-xs px-2 select-none">-</span>
          ) : (
            <ScoreBox value={m.scoreA} onCommit={(v) => onScore("scoreA", v)} isWinning={aWin} />
          )}
        </div>
      </div>

      {/* Đội B */}
      <div className="p-1 pt-0.5">
        <div
          className={`group/slot rounded-lg border ${
            bWin
              ? "border-[#e44c11]/50 bg-[#e44c11]/10 dark:bg-[#e44c11]/15 shadow-xs"
              : "border-line/25 dark:border-line/30 bg-muted/25 dark:bg-muted/15"
          } ${row(bWin, isLiveB, isConflictB)} ${
            !isKoLocked && m.bId ? "cursor-grab active:cursor-grabbing hover:bg-muted/40" : ""
          }`}
          draggable={!isKoLocked && Boolean(m.bId || (seedB && !isByeB))}
          onDragStart={(e) => {
            if (isKoLocked) return;
            e.stopPropagation();
            onStartDragTeam?.("bId");
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => !isKoLocked && onDropTeam("bId")}
          title={!isKoLocked && m.bId ? "Nắm kéo đội này để hoán đổi hoặc xếp sang trận khác" : undefined}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {seedB && (
              <span
                className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${getSeedBadgeClass(seedB, isByeB)}`}
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {seedB}
              </span>
            )}
            {isByeB ? (
              <span className="italic text-line/40 text-xs font-semibold">(Miễn đấu - BYE)</span>
            ) : (
              <PlayerNameDisplay
                entry={entryB}
                fallback={nameB}
                activePlayerNames={activePlayerNames}
                isWinning={bWin}
                isMatchLive={m.status === "live"}
              />
            )}
            {isConflictB && (
              <span className="shrink-0 text-[9px] font-extrabold text-red-600 bg-red-200/90 dark:bg-red-950 px-1 py-0.2 rounded border border-red-400 animate-pulse">
                ⚠️ Trùng đội
              </span>
            )}
            {!isKoLocked && m.bId && onClearTeam && (
              <button
                type="button"
                className="opacity-0 group-hover/slot:opacity-100 hover:text-red-600 p-0.5 rounded text-line/40 hover:bg-red-50 dark:hover:bg-red-950/40 transition-opacity cursor-pointer shrink-0"
                title="Xóa đội khỏi ô này (Ảnh 1)"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearTeam("bId");
                }}
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            )}
          </div>
          {isByeB ? (
            <span className="text-line/40 font-mono text-xs px-2 select-none">-</span>
          ) : (
            <ScoreBox value={m.scoreB} onCommit={(v) => onScore("scoreB", v)} isWinning={bWin} />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-1.5 bg-secondary/50 px-2 py-1.5 border-t border-line/10 rounded-b-xl">
        <div className="flex items-center gap-1">
          {m.status === "done" ? (
            <button
              className="btn-ghost !px-1.5 !py-0.5 text-[10px]"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              onClick={onReset}
            >
              ↺ Lại
            </button>
          ) : (
            <button
              disabled={isByeA || isByeB}
              className={`btn-ghost !px-1.5 !py-0.5 text-[10px] ${
                m.status === "live" ? "text-red-600 font-bold" : ""
              } ${isByeA || isByeB ? "opacity-40 cursor-not-allowed" : ""}`}
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              onClick={() => onStatus(m.status === "live" ? "pending" : "live")}
            >
              {m.status === "live" ? "⏸ Dừng" : "▶ Bắt đầu"}
            </button>
          )}
        </div>

        {/* Nút chọn trọng tài nằm giữa nút bắt đầu và nút chấm điểm */}
        {onReferee && (
          <div className="shrink-0 max-w-[110px]">
            <RefereeSelector
              value={m.referee}
              referees={referees}
              onSelect={onReferee}
              onAddReferee={onAddReferee}
            />
          </div>
        )}

        {isByeA || isByeB ? (
          <span
            className="text-[10px] font-bold text-accent px-1.5 py-0.5 rounded bg-accent/10"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Vào thẳng
          </span>
        ) : (
          <Link
            to="/cham-diem/$matchId"
            params={{ matchId: m.id } as any}
            className="btn-ghost !px-1.5 !py-0.5 text-[10px] flex items-center gap-1"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            ⚡ Chấm điểm
          </Link>
        )}
      </div>
    </div>
  );
}

/* ---------------- Helper nhận diện trận có suất BYE ---------------- */

const isMatchBye = (m?: Match) => {
  if (!m) return false;
  const isA = m.customPlaceholderA === "BYE" || m.customPlaceholderA?.toLowerCase() === "bye";
  const isB = m.customPlaceholderB === "BYE" || m.customPlaceholderB?.toLowerCase() === "bye";
  const noA = m.round === 1 && !m.aId && !m.customPlaceholderA;
  const noB = m.round === 1 && !m.bId && !m.customPlaceholderB;
  return Boolean(isA || isB || noA || noB);
};

/* ---------------- Đường nối thẳng các vòng Knockout (Đồng bộ 100% cùng định dạng CSS viền của thẻ trận) ---------------- */

function BracketConnectors({
  count,
  direction = "ltr",
  matches = [],
}: {
  count: number;
  direction?: "ltr" | "rtl";
  matches?: Match[];
}) {
  if (count <= 0) return null;
  return (
    <div className="w-10 shrink-0 flex flex-col self-stretch pointer-events-none select-none">
      {/* Khoảng trống trên cùng tương ứng với tiêu đề vòng đấu (py-2.5 text-sm) và mt-4 */}
      <div className="h-[56px] shrink-0" />
      {/* Vùng chứa các nhánh nối khớp chiều cao với danh sách trận đấu */}
      <div className="flex-1 flex flex-col">
        {Array.from({ length: count }).map((_, p) => {
          const topMatch = matches[2 * p];
          const bottomMatch = matches[2 * p + 1];
          const isTopBye = isMatchBye(topMatch);
          const isBottomBye = isMatchBye(bottomMatch);
          const isStemBye = isTopBye && isBottomBye;

          const topBorderStyle = isTopBye ? "1.2px dashed #e44c11" : "1.2px solid #e44c11";
          const bottomBorderStyle = isBottomBye ? "1.2px dashed #e44c11" : "1.2px solid #e44c11";
          const stemBorderStyle = isStemBye ? "1.2px dashed #e44c11" : "1.2px solid #e44c11";

          if (direction === "rtl") {
            return (
              <div key={p} className="flex-1 relative">
                {/* Nhánh ngang từ trận trên (từ mép phải vào giữa) */}
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "25%",
                    width: "50%",
                    borderTop: topBorderStyle,
                  }}
                />
                {/* Nhánh dọc từ trận trên xuống giao điểm giữa */}
                <div
                  style={{
                    position: "absolute",
                    left: "calc(50% - 0.6px)",
                    top: "25%",
                    height: "25%",
                    borderLeft: topBorderStyle,
                  }}
                />
                {/* Nhánh dọc từ giao điểm giữa xuống nhánh dưới */}
                <div
                  style={{
                    position: "absolute",
                    left: "calc(50% - 0.6px)",
                    top: "50%",
                    height: "25%",
                    borderLeft: bottomBorderStyle,
                  }}
                />
                {/* Nhánh ngang từ trận dưới (từ mép phải vào giữa) */}
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "75%",
                    width: "50%",
                    borderTop: bottomBorderStyle,
                  }}
                />
                {/* Đoạn thẳng ngang nối từ giữa sang trái vào trận vòng tiếp theo */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "50%",
                    width: "50%",
                    borderTop: stemBorderStyle,
                  }}
                />
                {/* Điểm nút tròn tại điểm giao nhánh tiếp theo */}
                <span
                  style={{
                    position: "absolute",
                    left: "-2px",
                    top: "calc(50% - 2px)",
                    width: "4px",
                    height: "4px",
                    borderRadius: "50%",
                    backgroundColor: "#e44c11",
                  }}
                />
              </div>
            );
          }

          return (
            <div key={p} className="flex-1 relative">
              {/* Nhánh ngang từ trận trên (từ mép trái vào giữa) */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "25%",
                  width: "50%",
                  borderTop: topBorderStyle,
                }}
              />
              {/* Nhánh dọc từ trận trên xuống giao điểm giữa */}
              <div
                style={{
                  position: "absolute",
                  left: "calc(50% - 0.6px)",
                  top: "25%",
                  height: "25%",
                  borderLeft: topBorderStyle,
                }}
              />
              {/* Nhánh dọc từ giao điểm giữa xuống nhánh dưới */}
              <div
                style={{
                  position: "absolute",
                  left: "calc(50% - 0.6px)",
                  top: "50%",
                  height: "25%",
                  borderLeft: bottomBorderStyle,
                }}
              />
              {/* Nhánh ngang từ trận dưới (từ mép trái vào giữa) */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "75%",
                  width: "50%",
                  borderTop: bottomBorderStyle,
                }}
              />
              {/* Đoạn thẳng ngang nối từ giữa sang phải vào trận vòng tiếp theo */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: "50%",
                  borderTop: stemBorderStyle,
                }}
              />
              {/* Điểm nút tròn tại điểm giao nhánh tiếp theo */}
              <span
                style={{
                  position: "absolute",
                  right: "-2px",
                  top: "calc(50% - 2px)",
                  width: "4px",
                  height: "4px",
                  borderRadius: "50%",
                  backgroundColor: "#e44c11",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SingleBridgeConnector({
  direction = "ltr",
  isBye = false,
}: {
  direction?: "ltr" | "rtl";
  isBye?: boolean;
}) {
  const borderStyle = isBye ? "1.2px dashed #e44c11" : "1.2px solid #e44c11";
  return (
    <div className="w-10 shrink-0 flex flex-col self-stretch pointer-events-none select-none">
      <div className="h-[56px] shrink-0" />
      <div className="flex-1 relative flex items-center">
        <div
          style={{
            width: "100%",
            borderTop: borderStyle,
          }}
        />
        <span
          style={{
            position: "absolute",
            [direction === "rtl" ? "left" : "right"]: "-2px",
            top: "calc(50% - 2px)",
            width: "4px",
            height: "4px",
            borderRadius: "50%",
            backgroundColor: "#e44c11",
          }}
        />
      </div>
    </div>
  );
}

/* ---------------- Trang chính Quản lý giải ---------------- */

function ManagePage() {
  const { state, update, updateEvent, updateMatch, setSelectedEventId, toggleKoLock } = useTournament();
  const activeId =
    state.selectedEventId && state.events.some((e) => e.id === state.selectedEventId)
      ? state.selectedEventId
      : state.events[0]?.id ?? "";
  const [tab, setTab] = useState<"group" | "timeline" | "ko">("group");
  const [note, setNote] = useState("");
  const [dragMatch, setDragMatch] = useState<string | null>(null);
  const [dragEntry, setDragEntry] = useState<string | null>(null);
  const [dragRankPlaceholder, setDragRankPlaceholder] = useState<string | null>(null);

  // Modal quản lý sân & trọng tài
  const [courtModalOpen, setCourtModalOpen] = useState(false);
  const [newCourtName, setNewCourtName] = useState("");
  const [newRefName, setNewRefName] = useState("");

  // Modal xem ghi chú
  const [viewNoteText, setViewNoteText] = useState<string | null>(null);

  // Zoom timeline (infinite range slider)
  const [colWidth, setColWidth] = useState(210);
  const [rowHeight, setRowHeight] = useState(128);

  // Toggles for flexible screen space
  const [showStandings, setShowStandings] = useState(true);
  const [maximizeStandings, setMaximizeStandings] = useState(false);
  const [showQueue, setShowQueue] = useState(true);
  const [showManualSeeding, setShowManualSeeding] = useState(false);
  const [dragKoSlot, setDragKoSlot] = useState<{
    matchId: string;
    side: "aId" | "bId";
    entryId: string | null;
    placeholder?: string;
  } | null>(null);

  // Real-time red line
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  const [nowString, setNowString] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });

  // Undo / Redo cho bảng timeline
  const [timelineHistory, setTimelineHistory] = useState<Match[][]>([]);
  const [timelineRedoStack, setTimelineRedoStack] = useState<Match[][]>([]);

  // Chế độ tạo nhánh KO: "total" (chọn tổng số đội, để bảng trống) hoặc "advance" (theo đội đi tiếp / bảng)
  const [koType, setKoType] = useState<"total" | "advance">("total");
  const [totalKoTeams, setTotalKoTeams] = useState<number>(8);
  // Dạng hiển thị nhánh KO (Ảnh 4): 2 nhánh 2 bên hoặc 1 nhánh thẳng
  const [koLayout, setKoLayout] = useState<"two_sided" | "single">("two_sided");
  // Chế độ xem toàn màn hình nhánh KO
  const [isFullscreenKo, setIsFullscreenKo] = useState(false);
  const [koZoom, setKoZoom] = useState(1);

  useEffect(() => {
    if (!isFullscreenKo) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreenKo(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreenKo]);

  const recordTimelineState = () => {
    setTimelineHistory((prev) => [...prev.slice(-30), state.matches]);
    setTimelineRedoStack([]);
  };

  const handleUndoTimeline = () => {
    if (timelineHistory.length === 0) return;
    const previous = timelineHistory[timelineHistory.length - 1];
    setTimelineRedoStack((prev) => [...prev, state.matches]);
    setTimelineHistory((prev) => prev.slice(0, -1));
    update({ matches: previous });
    setNote("Đã hoàn tác (Undo)");
  };

  const handleRedoTimeline = () => {
    if (timelineRedoStack.length === 0) return;
    const next = timelineRedoStack[timelineRedoStack.length - 1];
    setTimelineHistory((prev) => [...prev, state.matches]);
    setTimelineRedoStack((prev) => prev.slice(0, -1));
    update({ matches: next });
    setNote("Đã làm lại (Redo)");
  };

  useEffect(() => {
    if (tab !== "timeline") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedoTimeline();
        } else {
          e.preventDefault();
          handleUndoTimeline();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedoTimeline();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tab, timelineHistory, timelineRedoStack, state.matches]);

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

  // Danh sách các trận đang diễn ra trực tiếp thuộc nội dung hiện tại
  const allLiveMatches = useMemo(
    () => state.matches.filter((m) => m.status === "live" && ev && m.eventId === ev.id),
    [state.matches, ev],
  );

  const isKoLocked = Boolean(ev && state.koLocked?.[ev.id]);

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

  const hasKoProgress = useMemo(() => {
    return koMatches.some(
      (m) => m.aId !== null || m.scoreA !== null || m.status === "done" || m.status === "live",
    );
  }, [koMatches]);

  const buildGroups = () => {
    if (entries.length < 2) {
      setNote("Cần ít nhất 2 đội.");
      return;
    }
    if (hasKoProgress) {
      if (
        !window.confirm(
          "⚠️ CẢNH BÁO QUAN TRỌNG:\nVòng loại trực tiếp đã có nhánh xếp cặp hoặc kết quả thi đấu!\nViệc tạo lại lịch vòng bảng sẽ làm mới danh sách trận đấu và thứ hạng. Bạn có chắc chắn muốn tiếp tục?",
        )
      ) {
        return;
      }
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
    if (isKoLocked) {
      alert(
        "🔒 Nhánh KO của nội dung này đang được khóa! Vui lòng bấm nút mở khóa kế bên nếu bạn muốn tạo lại nhánh.",
      );
      return;
    }
    if (koMatches.some((m) => m.scoreA !== null || m.status === "done" || m.status === "live")) {
      if (
        !window.confirm(
          "⚠️ CẢNH BÁO:\nNhánh loại trực tiếp đã có trận đấu diễn ra hoặc có điểm số. Việc tạo lại nhánh KO sẽ xóa toàn bộ kết quả vòng loại trực tiếp này. Bạn có chắc chắn muốn tiếp tục?",
        )
      ) {
        return;
      }
    }
    let fresh: Match[] = [];
    if (koType === "total") {
      fresh = generateEmptyKnockout(ev, totalKoTeams, state.courts);
    } else {
      fresh = generateKnockout(ev, entries, groupMatches, state.courts);
    }
    if (!fresh.length) {
      setNote("Chưa đủ dữ liệu để tạo nhánh loại trực tiếp.");
      return;
    }
    update({
      matches: [...state.matches.filter((m) => !(m.eventId === ev.id && m.stage === "ko")), ...fresh],
    });
    setTab("ko");
    setNote(
      koType === "total"
        ? `Đã tạo nhánh KO gồm ${totalKoTeams} đội.`
        : `Đã tạo ${fresh.length} trận loại trực tiếp.`,
    );
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
      return { ...rest, scoreA: null, scoreB: null, status: "pending" as const, startedAt: undefined } as any;
    });
    update({ matches: propagateKnockout(patched, ev.id) });
  };

  const handleAddReferee = (newRef: string) => {
    const trimmed = newRef.trim();
    if (!trimmed) return;
    const current = state.referees || [];
    if (!current.includes(trimmed)) {
      update({ referees: [...current, trimmed] });
      setNote(`Đã ghi nhớ trọng tài "${trimmed}"`);
    }
  };

  const handleClearReferees = () => {
    update({ referees: [] });
    setNote("Đã đặt lại danh sách trọng tài về trống.");
  };

  /* Đổi chỗ 2 trận khi kéo đè lên nhau */
  const handleMatchDrop = (targetMatchId: string) => {
    if (!dragMatch || dragMatch === targetMatchId) return;
    const mA = state.matches.find((m) => m.id === dragMatch);
    const mB = state.matches.find((m) => m.id === targetMatchId);
    if (!mA || !mB) return;

    recordTimelineState();
    update({
      matches: state.matches.map((m) => {
        if (m.id === dragMatch) {
          return {
            ...m,
            court: mB.court,
            timeSlot: mB.timeSlot,
            durationMinutes: mB.durationMinutes,
            offsetMinutes: mB.offsetMinutes,
          };
        }
        if (m.id === targetMatchId) {
          return {
            ...m,
            court: mA.court,
            timeSlot: mA.timeSlot,
            durationMinutes: mA.durationMinutes,
            offsetMinutes: mA.offsetMinutes,
          };
        }
        return m;
      }),
    });
    setDragMatch(null);
    setNote(`Đã hoán đổi vị trí trận đấu trên lịch.`);
  };

  // Phát hiện các trận trùng giờ nhau trên cùng một sân để cảnh báo viền đỏ
  const conflictsSet = useMemo(() => {
    const set = new Set<string>();
    const slotMins = state.slotMinutes || 30;
    const scheduled = state.matches.filter(
      (m) => m.eventId === ev.id && m.court && m.timeSlot !== undefined,
    );
    for (let i = 0; i < scheduled.length; i++) {
      const mA = scheduled[i];
      const startA = (mA.timeSlot ?? 0) * slotMins + (mA.offsetMinutes ?? 0);
      const endA = startA + (mA.durationMinutes ?? slotMins);
      for (let j = i + 1; j < scheduled.length; j++) {
        const mB = scheduled[j];
        if (mA.court === mB.court) {
          const startB = (mB.timeSlot ?? 0) * slotMins + (mB.offsetMinutes ?? 0);
          const endB = startB + (mB.durationMinutes ?? slotMins);
          if (Math.max(startA, startB) < Math.min(endA, endB)) {
            set.add(mA.id);
            set.add(mB.id);
          }
        }
      }
    }
    return set;
  }, [state.matches, state.slotMinutes, ev.id]);

  const cardProps = (m: Match, compact?: boolean): CardProps => ({
    m,
    nameA: nameOf(m.aId),
    nameB: nameOf(m.bId),
    entryA: state.entries.find((e) => e.id === m.aId),
    entryB: state.entries.find((e) => e.id === m.bId),
    activePlayerNames,
    isLiveA: isEntryActive(m.aId),
    isLiveB: isEntryActive(m.bId),
    onScore: (k, v) => setScore(m, k, v),
    onStatus: (s) => {
      updateMatch(m.id, {
        status: s,
        startedAt: s === "live" ? Date.now() : undefined,
      } as any);
    },
    onReset: () => resetMatch(m),
    courts: state.courts,
    referees: state.referees,
    onCourt: (c) => updateMatch(m.id, { court: c }),
    onReferee: (r) => updateMatch(m.id, { referee: r }),
    onAddReferee: handleAddReferee,
    onClearReferees: handleClearReferees,
    onRemoveFromTimeline: () => {
      recordTimelineState();
      updateMatch(m.id, { timeSlot: undefined });
    },
    onViewNote: (n) => setViewNoteText(n),
    onDurationChange: (mins, recordHistory = true) => {
      if (recordHistory) recordTimelineState();
      updateMatch(m.id, { durationMinutes: mins });
    },
    onOffsetChange: (offset, recordHistory = true) => {
      if (recordHistory) recordTimelineState();
      updateMatch(m.id, { offsetMinutes: offset });
    },
    onMoveHorizontal: (newSlot, newOffset, recordHistory = true) => {
      if (recordHistory) recordTimelineState();
      updateMatch(m.id, { timeSlot: newSlot, offsetMinutes: newOffset });
    },
    onDropOnMatch: handleMatchDrop,
    hasConflict: compact && conflictsSet.has(m.id),
    compact,
  });

  /* -------- Vòng bảng theo cột vòng -------- */
  const rounds = [...new Set(groupMatches.map((m) => m.round))].sort((a, b) => (a ?? 0) - (b ?? 0));

  /* -------- Timeline -------- */
  const timelinePrintRef = useRef<HTMLDivElement>(null);
  const [exportingImage, setExportingImage] = useState(false);

  const timelineSource = tab === "timeline" ? matches : [];
  const grid = buildTimeline(timelineSource, state.courts);

  // Hiển thị toàn bộ ngày: từ giờ bắt đầu giải đấu đến 0h sáng ngày hôm sau (24:00)
  const [startH = 8, startM = 0] = (state.startTime || "08:00").split(":").map(Number);
  const startTotalMinutes = (startH % 24) * 60 + startM;
  const minutesUntilMidnight = Math.max(60, 24 * 60 - startTotalMinutes);
  const fullDaySlots = Math.ceil(minutesUntilMidnight / Math.max(5, state.slotMinutes || 30));

  const maxSlot = Math.max(
    fullDaySlots,
    3,
    ...[...grid.values()].flatMap((list) => list.map((s) => s.slot + 1)),
  );
  const slotIdxs = Array.from({ length: maxSlot + 1 }, (_, i) => i);

  // Trạng thái vòng bảng của nội dung hiện tại
  const currentGroupMatches = useMemo(
    () => matches.filter((m) => m.stage === "group"),
    [matches],
  );
  const hasGroupStage = currentGroupMatches.length > 0;
  const allGroupStageDone = useMemo(
    () => hasGroupStage && currentGroupMatches.every((m) => m.status === "done"),
    [hasGroupStage, currentGroupMatches],
  );

  // Trận chờ xếp lịch (chưa gán timeSlot)
  const unassignedMatches = useMemo(
    () => matches.filter((m) => m.timeSlot === undefined),
    [matches],
  );

  // Nhóm các trận chờ theo từng vòng: hiển thị các vòng ở vòng bảng trước, các vòng loại trực tiếp sau cùng
  const unassignedByRound = useMemo(() => {
    // Nếu có vòng bảng và chưa đấu xong hết -> ẩn KO khỏi hàng chờ xếp lịch
    const filterMatches = unassignedMatches.filter((m) => {
      if (m.stage === "ko" && hasGroupStage && !allGroupStageDone) {
        return false;
      }
      return true;
    });

    const map = new Map<string, { stage: "group" | "ko"; round: number; label: string; matches: Match[] }>();
    filterMatches.forEach((m) => {
      let key = "";
      let label = "";
      if (m.stage === "ko") {
        key = `ko-${m.round}`;
        label = m.koRound || `Loại trực tiếp · Vòng ${m.round}`;
      } else {
        key = `round-${m.round}`;
        label = `Vòng ${m.round}`;
      }
      if (!map.has(key)) {
        map.set(key, { stage: m.stage, round: m.round ?? 1, label, matches: [] });
      }
      map.get(key)!.matches.push(m);
    });

    return Array.from(map.entries())
      .map(([key, data]) => ({
        key,
        stage: data.stage,
        round: data.round,
        label: data.label,
        matches: data.matches,
      }))
      .sort((a, b) => {
        // Vòng bảng luôn hiển thị trước, loại trực tiếp sau cùng
        if (a.stage !== b.stage) {
          return a.stage === "group" ? -1 : 1;
        }
        return a.round - b.round;
      });
  }, [unassignedMatches, hasGroupStage, allGroupStageDone]);

  const dropOn = (court: string, slot: number, offsetMinutes = 0) => {
    if (!dragMatch) return;
    recordTimelineState();
    updateMatch(dragMatch, { court, timeSlot: slot, offsetMinutes });
    setDragMatch(null);
  };

  const clearTimeline = () => {
    recordTimelineState();
    const patched = state.matches.map((m) =>
      m.eventId === ev.id ? { ...m, timeSlot: undefined } : m,
    );
    update({ matches: patched });
    setNote("Đã xoá lịch timeline.");
  };

  const handleAutoSchedule = () => {
    recordTimelineState();
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

  /* Xếp riêng từng vòng tự động vào bảng timeline */
  const autoScheduleRound = (roundMatches: Match[]) => {
    if (roundMatches.length === 0) return;
    const assigned = state.matches.filter(
      (m) => m.eventId === ev.id && m.court && m.timeSlot !== undefined,
    );
    const usedSlots = new Set(assigned.map((m) => `${m.court}__${m.timeSlot}`));

    const updatedMatches = [...state.matches];
    let slotIdx = 0;

    roundMatches.forEach((m) => {
      let placed = false;
      while (!placed && slotIdx < 100) {
        for (const court of state.courts) {
          const key = `${court}__${slotIdx}`;
          if (!usedSlots.has(key)) {
            usedSlots.add(key);
            const matchIdx = updatedMatches.findIndex((x) => x.id === m.id);
            if (matchIdx !== -1) {
              updatedMatches[matchIdx] = {
                ...updatedMatches[matchIdx],
                court,
                timeSlot: slotIdx,
                durationMinutes: updatedMatches[matchIdx].durationMinutes || state.slotMinutes,
              };
            }
            placed = true;
            break;
          }
        }
        if (!placed) slotIdx++;
      }
    });

    update({ matches: updatedMatches });
    setNote(`Đã tự động xếp ${roundMatches.length} trận của vòng vào timeline.`);
  };

  /* Tải ảnh lịch thi đấu toàn bộ (Full HD không bị cắt theo khung nhìn) */
  const downloadScheduleImage = async () => {
    const el = timelinePrintRef.current;
    if (!el || exportingImage) return;
    setExportingImage(true);
    setNote("Đang chụp xuất toàn bộ bảng lịch thi đấu...");
    try {
      await new Promise((r) => setTimeout(r, 150));
      const fullWidth = el.scrollWidth;
      const fullHeight = el.scrollHeight;

      const canvas = await html2canvas(el, {
        width: fullWidth,
        height: fullHeight,
        windowWidth: fullWidth + 100,
        windowHeight: fullHeight + 100,
        scrollX: 0,
        scrollY: 0,
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const link = document.createElement("a");
      link.download = `Lich_Thi_Dau_${ev.name.replace(/\s+/g, "_")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setNote("Đã tải về trọn vẹn toàn bộ ảnh lịch thi đấu (Full HD)!");
    } catch (err) {
      console.error("Lỗi xuất ảnh:", err);
      setNote("Không thể xuất ảnh lịch thi đấu. Hãy thử lại!");
    } finally {
      setExportingImage(false);
    }
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
        return [
          time,
          `"${m.court}"`,
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

  // Đếm số lần mỗi đội xuất hiện trong cùng 1 vòng KO để cảnh báo trùng đội (Ảnh 3)
  const roundEntryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    koMatches.forEach((m) => {
      if (m.slot === 99) return;
      const keyPrefix = `${m.round}_`;
      if (m.aId) {
        const k = keyPrefix + m.aId;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      if (m.bId) {
        const k = keyPrefix + m.bId;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    });
    return counts;
  }, [koMatches]);

  const dropTeam = (targetMatch: Match, targetSide: "aId" | "bId") => {
    if (isKoLocked) {
      setNote("🔒 Nhánh KO đang được khóa. Hãy bấm mở khóa để chỉnh sửa vị trí.");
      return;
    }
    // TH 1: Kéo thả giữa các ô trong nhánh KO để đổi chỗ / hoán đổi (swap/move)
    if (dragKoSlot) {
      if (dragKoSlot.matchId === targetMatch.id && dragKoSlot.side === targetSide) {
        setDragKoSlot(null);
        return;
      }
      const sourceMatch = state.matches.find((x) => x.id === dragKoSlot.matchId);
      if (!sourceMatch) {
        setDragKoSlot(null);
        return;
      }
      const sourceVal = dragKoSlot.side === "aId" ? sourceMatch.aId : sourceMatch.bId;
      const sourceHolder =
        dragKoSlot.side === "aId" ? sourceMatch.customPlaceholderA : sourceMatch.customPlaceholderB;

      const targetVal = targetSide === "aId" ? targetMatch.aId : targetMatch.bId;
      const targetHolder =
        targetSide === "aId" ? targetMatch.customPlaceholderA : targetMatch.customPlaceholderB;

      const sourceHolderKey = dragKoSlot.side === "aId" ? "customPlaceholderA" : "customPlaceholderB";
      const targetHolderKey = targetSide === "aId" ? "customPlaceholderA" : "customPlaceholderB";

      updateMatch(sourceMatch.id, {
        [dragKoSlot.side]: targetVal,
        [sourceHolderKey]: targetHolder,
      });
      updateMatch(targetMatch.id, {
        [targetSide]: sourceVal,
        [targetHolderKey]: sourceHolder,
      });

      setDragKoSlot(null);
      setNote("Đã hoán đổi / di chuyển vị trí đội trong nhánh loại trực tiếp.");
      return;
    }

    // TH 2: Kéo ký hiệu thứ hạng từ bảng xếp thủ công (khi vòng bảng chưa xong)
    if (dragRankPlaceholder) {
      const placeholderKey = targetSide === "aId" ? "customPlaceholderA" : "customPlaceholderB";
      updateMatch(targetMatch.id, {
        [targetSide]: null,
        [placeholderKey]: dragRankPlaceholder,
      } as Partial<Match>);
      setDragRankPlaceholder(null);
      setNote(`Đã xếp vị trí (${dragRankPlaceholder}) vào nhánh.`);
      return;
    }

    // TH 3: Kéo từ bảng danh sách xếp thủ công sang
    if (!dragEntry) return;
    const targetGroup = ev.groups.find((g) => g.entryIds.includes(dragEntry));
    let seedBadge = "";
    if (targetGroup) {
      const gM = groupMatches.filter((x) => x.groupName === targetGroup.name);
      const standings = computeStandings(targetGroup.entryIds, gM, ev);
      const rankIdx = standings.findIndex((r) => r.entryId === dragEntry);
      const cleanGName = targetGroup.name.replace(/^Bảng\s+/i, "").trim().toUpperCase();
      seedBadge = `${rankIdx >= 0 ? rankIdx + 1 : 1}${cleanGName}`;
    }
    const placeholderKey = targetSide === "aId" ? "customPlaceholderA" : "customPlaceholderB";
    updateMatch(targetMatch.id, {
      [targetSide]: dragEntry,
      ...(seedBadge ? { [placeholderKey]: seedBadge } : {}),
    } as Partial<Match>);
    setDragEntry(null);
    setNote(seedBadge ? `Đã xếp đội (${seedBadge}) vào nhánh.` : "Đã xếp đội vào nhánh.");
  };

  const TabBtn = ({ id, label }: { id: typeof tab; label: string }) => (
    <button
      className={
        tab === id
          ? "rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground shadow-xs"
          : "rounded-lg bg-card px-3 py-2 text-sm font-semibold text-line/70 ring-1 ring-line/20 hover:bg-card/80"
      }
      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );

  const getEntrySeedBadge = (entryId?: string | null, customPlaceholder?: string | null): string => {
    if (customPlaceholder && customPlaceholder.trim()) {
      return customPlaceholder.trim();
    }
    if (!entryId || !ev) return "";
    const grp = ev.groups.find((g) => g.entryIds.includes(entryId));
    if (!grp) return "";
    const cleanGn = grp.name.replace(/^Bảng\s+/i, "").trim().toUpperCase();
    const gMatches = groupMatches.filter((x) => x.groupName === grp.name);
    const standings = computeStandings(grp.entryIds, gMatches, ev);
    const idx = standings.findIndex((s) => s.entryId === entryId);
    return idx >= 0 ? `${idx + 1}${cleanGn}` : "";
  };

  const renderKoCard = (m: Match) => {
    const isConflictA = Boolean(
      m.aId && (roundEntryCounts.get(`${m.round}_${m.aId}`) ?? 0) > 1,
    );
    const isConflictB = Boolean(
      m.bId && (roundEntryCounts.get(`${m.round}_${m.bId}`) ?? 0) > 1,
    );
    const hasRoundConflict = isConflictA || isConflictB;

    return (
      <KoCard
        key={m.id}
        m={m}
        nameA={nameOf(m.aId)}
        nameB={nameOf(m.bId)}
        entryA={state.entries.find((e) => e.id === m.aId)}
        entryB={state.entries.find((e) => e.id === m.bId)}
        seedBadgeA={getEntrySeedBadge(m.aId, m.customPlaceholderA)}
        seedBadgeB={getEntrySeedBadge(m.bId, m.customPlaceholderB)}
        activePlayerNames={activePlayerNames}
        isLiveA={isEntryActive(m.aId)}
        isLiveB={isEntryActive(m.bId)}
        isConflictA={isConflictA}
        isConflictB={isConflictB}
        hasRoundConflict={hasRoundConflict}
        isKoLocked={isKoLocked}
        onScore={(k, v) => setScore(m, k, v)}
        onStatus={(s) => updateMatch(m.id, { status: s, startedAt: s === "live" ? Date.now() : undefined } as any)}
        onReset={() => resetMatch(m)}
        onDropTeam={(side) => dropTeam(m, side)}
        onClearTeam={(side) => {
          if (isKoLocked) return;
          updateMatch(m.id, { [side]: null, scoreA: null, scoreB: null, status: "pending" });
          setNote("Đã xóa đội khỏi ô thi đấu.");
        }}
        onStartDragTeam={(side) => {
          if (isKoLocked) return;
          setDragKoSlot({
            matchId: m.id,
            side,
            entryId: side === "aId" ? m.aId : m.bId,
            placeholder:
              side === "aId"
                ? m.customPlaceholderA
                : m.customPlaceholderB,
          });
        }}
        onViewNote={(n) => setViewNoteText(n)}
        referees={state.referees}
        onReferee={(r) => updateMatch(m.id, { referee: r })}
        onAddReferee={handleAddReferee}
      />
    );
  };

  const renderKoBracketTree = () => {
    if (koRounds.length === 0) return null;
    const maxRound = Math.max(...koRounds);
    const isTwoSided = koLayout === "two_sided" && koRounds.length > 1;

    if (!isTwoSided) {
      // Sơ đồ dạng 1 nhánh thẳng từ trái sang phải
      return (
        <div className="flex min-w-max items-stretch pt-2">
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
              <React.Fragment key={r}>
                <div
                  className={`w-[275px] shrink-0 flex flex-col ${colIdx === 0 ? "pl-[2px]" : ""}`}
                  style={colIdx === 0 ? { paddingLeft: "2px" } : undefined}
                >
                  <div
                    className="rounded-xl bg-accent/15 py-2.5 text-center font-head text-sm font-bold uppercase tracking-wide text-accent ring-1 ring-accent/30 shadow-xs"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {roundTitle}
                  </div>

                  <div
                    className={`mt-4 flex flex-1 flex-col justify-around gap-6 ${colIdx === 0 ? "pl-0" : ""}`}
                    style={colIdx === 0 ? { paddingLeft: "0px", marginLeft: "0px" } : undefined}
                  >
                    {list.map((m) => renderKoCard(m))}
                  </div>
                </div>

                {/* Đường nối giữa các vòng kế tiếp nhau */}
                {colIdx < koRounds.length - 1 && (
                  <BracketConnectors
                    count={Math.max(1, Math.floor(list.length / 2))}
                    direction="ltr"
                    matches={list}
                  />
                )}
              </React.Fragment>
            );
          })}

          {/* Trận tranh hạng 3 */}
          {thirdMatch && (
            <div className="w-[275px] shrink-0 flex flex-col justify-end ml-6">
              <div
                className="rounded-xl bg-court/15 py-2.5 text-center font-head text-sm font-bold uppercase tracking-wide text-courtdeep ring-1 ring-court/30"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Tranh hạng 3
              </div>
              <div className="mt-4">
                {renderKoCard(thirdMatch)}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Sơ đồ dạng 2 nhánh 2 bên hội tụ về chung kết ở giữa
    const preRounds = koRounds.filter((r) => r < maxRound);
    const finalMatches = koMatches.filter((m) => m.round === maxRound && m.slot !== 99);

    return (
      <div className="flex min-w-max items-stretch justify-center pt-2">
        {/* Nhánh bên TRÁI: các vòng trước Chung kết đi từ ngoài vào trong */}
        {preRounds.map((r, colIdx) => {
          const list = koMatches
            .filter((m) => m.round === r && m.slot !== 99)
            .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
          const half = Math.ceil(list.length / 2);
          const leftMatches = list.slice(0, half);
          const title = list[0]?.koRound || (r === maxRound - 1 ? "Bán kết" : r === maxRound - 2 ? "Tứ kết" : `Vòng ${r}`);
          const isLastPreRound = colIdx === preRounds.length - 1;

          return (
            <React.Fragment key={`left_${r}`}>
              <div
                className={`w-[275px] shrink-0 flex flex-col ${colIdx === 0 ? "pl-[2px]" : ""}`}
                style={colIdx === 0 ? { paddingLeft: "2px" } : undefined}
              >
                <div
                  className="rounded-xl bg-accent/15 py-2.5 text-center font-head text-sm font-bold uppercase tracking-wide text-accent ring-1 ring-accent/30 shadow-xs"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {title} (Nhánh trái)
                </div>
                <div
                  className="mt-4 flex flex-1 flex-col justify-around gap-6"
                  style={colIdx === 0 ? { paddingLeft: "0px", marginLeft: "0px" } : undefined}
                >
                  {leftMatches.map((m) => renderKoCard(m))}
                </div>
              </div>

              {!isLastPreRound ? (
                <BracketConnectors
                  count={Math.max(1, Math.floor(leftMatches.length / 2))}
                  direction="ltr"
                  matches={leftMatches}
                />
              ) : (
                <SingleBridgeConnector direction="ltr" isBye={isMatchBye(leftMatches[0])} />
              )}
            </React.Fragment>
          );
        })}

        {/* CỘT TRUNG TÂM: Chung kết và Tranh hạng 3 */}
        <div className="w-[285px] shrink-0 flex flex-col items-stretch px-2">
          <div
            className="rounded-xl bg-amber-500/20 py-2.5 text-center font-head text-sm font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/40 shadow-sm"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            🏆 Chung kết
          </div>
          <div className="mt-4 flex flex-1 flex-col justify-around gap-6">
            {finalMatches.map((m) => renderKoCard(m))}
          </div>

          {thirdMatch && (
            <div className="mt-8 border-t border-line/15 pt-4">
              <div
                className="rounded-xl bg-court/15 py-2 text-center font-head text-xs font-bold uppercase tracking-wide text-courtdeep ring-1 ring-court/30"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                🥉 Tranh hạng 3
              </div>
              <div className="mt-3">
                {renderKoCard(thirdMatch)}
              </div>
            </div>
          )}
        </div>

        {/* Nhánh bên PHẢI: các vòng trước Chung kết đi từ giữa ra ngoài */}
        {preRounds.slice().reverse().map((r, revIdx) => {
          const colIdx = preRounds.length - 1 - revIdx;
          const list = koMatches
            .filter((m) => m.round === r && m.slot !== 99)
            .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
          const half = Math.ceil(list.length / 2);
          const rightMatches = list.slice(half);
          const title = list[0]?.koRound || (r === maxRound - 1 ? "Bán kết" : r === maxRound - 2 ? "Tứ kết" : `Vòng ${r}`);
          const isLastPreRound = colIdx === preRounds.length - 1;

          return (
            <React.Fragment key={`right_${r}`}>
              {isLastPreRound ? (
                <SingleBridgeConnector direction="rtl" isBye={isMatchBye(rightMatches[0])} />
              ) : (
                <BracketConnectors
                  count={Math.max(1, Math.floor(rightMatches.length / 2))}
                  direction="rtl"
                  matches={rightMatches}
                />
              )}

              <div className="w-[275px] shrink-0 flex flex-col">
                <div
                  className="rounded-xl bg-accent/15 py-2.5 text-center font-head text-sm font-bold uppercase tracking-wide text-accent ring-1 ring-accent/30 shadow-xs"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {title} (Nhánh phải)
                </div>
                <div className="mt-4 flex flex-1 flex-col justify-around gap-6">
                  {rightMatches.map((m) => renderKoCard(m))}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="space-y-6 pl-0"
      style={{
        paddingLeft: "0px",
        marginLeft: "0px",
        paddingTop: "0px",
      }}
    >
      {/* Tiêu đề & Chọn nội dung */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-head text-3xl font-extrabold uppercase tracking-tight text-[#0a3320] sm:text-4xl">
            Quản lý giải đấu
          </h1>
          <p className="mt-1 text-xs text-line/60" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Điều hành trực tiếp các trận đấu, sân thi đấu, trọng tài và sơ đồ bảng/nhánh KO.
          </p>
        </div>
      </div>

      {/* Thanh thông báo các trận ĐANG DIỄN RA (Active Matches Bar - Ảnh 4) */}
      {allLiveMatches.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
              </span>
              <span
                className="font-head text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Trận đang diễn ra trực tiếp ({allLiveMatches.length})
              </span>
            </div>
            <span className="text-[11px] text-red-600/80 font-medium">
              VĐV trong các trận này được đánh dấu đỏ nổi bật
            </span>
          </div>

          <div
            className="mt-3 flex gap-3 overflow-x-auto pb-1"
            style={{
              paddingBottom: "4px",
              paddingRight: "0px",
              paddingTop: "4px",
              paddingLeft: "3px",
            }}
          >
            {allLiveMatches.map((m) => {
              const evMatch = state.events.find((e) => e.id === m.eventId);
              const tA = state.entries.find((e) => e.id === m.aId);
              const tB = state.entries.find((e) => e.id === m.bId);
              const icon = state.courtIcons?.[m.court] || "🎾";
              return (
                <div
                  key={m.id}
                  className="w-80 shrink-0 rounded-xl bg-card p-2.5 ring-1 ring-red-500/40 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-accent truncate max-w-[140px]">
                        {evMatch?.name}
                      </span>
                      <span className="font-semibold text-line/60">
                        {icon} {m.court}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-xs font-bold">
                      <span
                        className="truncate text-red-600 font-extrabold"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {entryName(tA)}
                      </span>
                      <span className="rounded bg-red-600 px-2 py-0.5 text-white font-head text-xs tabular-nums shrink-0">
                        {m.scoreA ?? 0} - {m.scoreB ?? 0}
                      </span>
                      <span
                        className="truncate text-red-600 font-extrabold"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {entryName(tB)}
                      </span>
                    </div>
                  </div>

                  {/* Thanh nút bấm theo Ảnh 4: Tạm dừng bên trái, Đồng hồ bấm giờ ở giữa, Chấm điểm bên phải */}
                  <div className="mt-2.5 flex items-center justify-between gap-1.5 pt-2 border-t border-line/10">
                    <button
                      type="button"
                      onClick={() => updateMatch(m.id, { status: "pending", startedAt: undefined } as any)}
                      className="rounded px-2 py-1 text-[10px] font-bold text-red-600 bg-red-500/10 hover:bg-red-500/20 transition cursor-pointer flex items-center gap-1 shrink-0"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      title="Tạm dừng trận đấu"
                    >
                      ⏸ Tạm dừng
                    </button>

                    <LiveStopwatch
                      startedAt={(m as any).startedAt}
                      onReset={() => updateMatch(m.id, { startedAt: Date.now() } as any)}
                    />

                    <Link
                      to="/cham-diem/$matchId"
                      params={{ matchId: m.id } as any}
                      className="btn-accent !px-2.5 !py-1 text-[10px] font-bold shrink-0"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      ⚡ Chấm điểm
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
            onClick={() => setSelectedEventId(e.id)}
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
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
            <div
              className="flex flex-wrap items-center gap-2"
              style={{
                paddingLeft: "3px",
                paddingBottom: "4px",
                paddingRight: "0px",
                marginRight: "0px",
                marginBottom: "0px",
                marginTop: "12px",
                paddingTop: "4px",
              }}
            >
              {/* Chế độ chọn tổng số đội KO vs Theo đội đi tiếp / bảng */}
              <div
                className="flex items-center gap-1 rounded-lg bg-card p-0.5 ring-1 ring-line/20 text-xs"
                style={{ paddingLeft: "11px" }}
              >
                <button
                  type="button"
                  onClick={() => setKoType("total")}
                  style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: "bold" }}
                  className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                    koType === "total"
                      ? "bg-accent text-accent-foreground shadow-2xs"
                      : "text-line/60 hover:text-ink"
                  }`}
                  title="Tạo nhánh KO với tổng số đội và để bảng trống để tự do kéo thả"
                >
                  Tổng số đội KO
                </button>
                <button
                  type="button"
                  onClick={() => setKoType("advance")}
                  style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: "bold" }}
                  className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                    koType === "advance"
                      ? "bg-accent text-accent-foreground shadow-2xs"
                      : "text-line/60 hover:text-ink"
                  }`}
                  title="Tự động xếp hạt giống theo số lượng đội đi tiếp mỗi bảng"
                >
                  Theo đội đi tiếp / bảng
                </button>
              </div>

              {koType === "total" ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-line/70">
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Tổng đội KO:</span>
                  <div className="flex items-center gap-1">
                    {[4, 8, 16, 32, 64].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setTotalKoTeams(cnt)}
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        className={`px-2 py-0.5 rounded text-xs font-bold transition cursor-pointer ${
                          totalKoTeams === cnt
                            ? "bg-accent text-accent-foreground shadow-2xs"
                            : "bg-card text-line/60 ring-1 ring-line/15 hover:bg-card/80"
                        }`}
                      >
                        {cnt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-line/70">
                  Đi tiếp / bảng:
                  <input
                    type="number"
                    min={1}
                    max={64}
                    className="field w-14 text-center !py-1 text-xs"
                    value={ev.advancePerGroup}
                    onChange={(e) => {
                      const newAdvance = Math.max(1, Math.min(64, Number(e.target.value) || 1));
                      updateEvent(ev.id, { advancePerGroup: newAdvance });
                    }}
                    title="Số lượng đội được chọn đi tiếp từ mỗi bảng vào nhánh KO"
                  />
                </label>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  className={`btn-accent text-xs ${isKoLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                  onClick={buildKo}
                  title={isKoLocked ? "Nhánh KO đang khóa (bấm nút ổ khóa để mở khóa trước)" : undefined}
                >
                  Tạo nhánh KO
                </button>
                <button
                  type="button"
                  onClick={() => toggleKoLock(ev.id)}
                  className={`btn-ghost text-xs font-bold flex items-center gap-1 px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
                    isKoLocked
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40"
                      : "bg-card text-line/70 border-line/20 hover:text-ink"
                  }`}
                  title={
                    isKoLocked
                      ? "Nhánh KO đang khóa (bấm để mở khóa chỉnh sửa)"
                      : "Khóa nhánh KO (sau khi xếp xong bấm khóa lại để không bị chỉnh sửa ngoài ý muốn)"
                  }
                >
                  {isKoLocked ? "🔒 Đã khóa" : "🔓 Mở khóa"}
                </button>
              </div>

              {/* Lựa chọn dạng hiển thị 2 nhánh 2 bên hoặc 1 nhánh thẳng (Ảnh 4) */}
              <div className="flex items-center gap-1 rounded-lg bg-card p-0.5 ring-1 ring-line/20 text-xs">
                <button
                  type="button"
                  onClick={() => setKoLayout("two_sided")}
                  className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                    koLayout === "two_sided"
                      ? "bg-accent text-accent-foreground shadow-2xs"
                      : "text-line/60 hover:text-ink"
                  }`}
                  title="Hiển thị sơ đồ dạng 2 nhánh 2 bên hội tụ về chung kết ở giữa (Ảnh 4)"
                >
                  ↔️ 2 nhánh 2 bên
                </button>
                <button
                  type="button"
                  onClick={() => setKoLayout("single")}
                  className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                    koLayout === "single"
                      ? "bg-accent text-accent-foreground shadow-2xs"
                      : "text-line/60 hover:text-ink"
                  }`}
                  title="Hiển thị sơ đồ dạng 1 nhánh thẳng từ trái sang phải"
                >
                  ➡️ 1 nhánh thẳng
                </button>
              </div>

              <button
                type="button"
                className={`btn-ghost text-xs font-bold flex items-center gap-1 ${
                  showManualSeeding ? "bg-accent/15 text-accent ring-1 ring-accent/30" : ""
                }`}
                onClick={() => setShowManualSeeding((v) => !v)}
                title="Bật / Tắt danh sách kéo thả VĐV vào nhánh KO"
              >
                🎯 Xếp thủ công {showManualSeeding ? "▼ (Hiện)" : "▶ (Ẩn)"}
              </button>

              <button
                type="button"
                className="btn-ghost text-xs font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-lg ring-1 ring-line/20 hover:bg-card shadow-2xs cursor-pointer text-accent hover:text-accent font-semibold"
                onClick={() => setIsFullscreenKo(true)}
                title="Xem toàn bộ sơ đồ nhánh trực tiếp ở chế độ toàn màn hình"
              >
                ⛶ Toàn màn hình
              </button>
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`btn-ghost text-xs font-bold flex items-center gap-1 ${
                  showStandings ? "bg-accent/15 text-accent ring-1 ring-accent/30" : ""
                }`}
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                onClick={() => setShowStandings((s) => !s)}
                title="Ẩn / Hiện bảng xếp hạng các bảng đấu"
              >
                📊 Bảng xếp hạng {showStandings ? "▼ (Hiện)" : "▶ (Ẩn)"}
              </button>
              {showStandings && (
                <button
                  type="button"
                  className={`btn-ghost text-xs font-bold flex items-center gap-1 ${
                    maximizeStandings ? "bg-court/20 text-courtdeep ring-1 ring-court/30" : ""
                  }`}
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  onClick={() => setMaximizeStandings((m) => !m)}
                  title="Phóng to bảng xếp hạng toàn màn hình"
                >
                  {maximizeStandings ? "🗗 Thu nhỏ BXH" : "🗖 Phóng to BXH"}
                </button>
              )}
              <button
                className="btn-accent text-xs"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                onClick={buildGroups}
              >
                Tạo lịch vòng bảng
              </button>
            </div>
          )}
        </div>

        {tab === "timeline" && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Thanh trượt zoom ngang */}
            <div className="flex items-center gap-2 rounded-lg bg-card px-2.5 py-1 ring-1 ring-line/20 shadow-2xs">
              <span className="text-[11px] font-medium text-line/60">Zoom ngang:</span>
              <input
                type="range"
                min="110"
                max="450"
                step="5"
                value={colWidth}
                onChange={(e) => setColWidth(Number(e.target.value))}
                className="h-1.5 w-20 cursor-pointer accent-accent"
                title={`Độ rộng cột giờ: ${colWidth}px`}
              />
              <span className="w-9 text-[10px] font-mono text-line/50 text-right">{colWidth}px</span>
            </div>

            {/* Thanh trượt zoom dọc (yêu cầu người dùng) */}
            <div className="flex items-center gap-2 rounded-lg bg-card px-2.5 py-1 ring-1 ring-line/20 shadow-2xs">
              <span className="text-[11px] font-medium text-line/60">Zoom dọc:</span>
              <input
                type="range"
                min="50"
                max="250"
                step="5"
                value={rowHeight}
                onChange={(e) => setRowHeight(Number(e.target.value))}
                className="h-1.5 w-20 cursor-pointer accent-accent"
                title={`Chiều cao hàng sân: ${rowHeight}px`}
              />
              <span className="w-9 text-[10px] font-mono text-line/50 text-right">{rowHeight}px</span>
            </div>

            <button
              type="button"
              className={`btn-ghost text-xs !py-1.5 font-bold flex items-center gap-1.5 ${
                showQueue ? "bg-accent/15 text-accent ring-1 ring-accent/30" : ""
              }`}
              onClick={() => setShowQueue((v) => !v)}
              title="Ẩn / Hiện danh sách các trận chờ xếp lịch"
            >
              📋 Trận chờ xếp ({unassignedMatches.length}) {showQueue ? "▼" : "▶"}
            </button>

            {/* Nút Undo / Redo cho bảng timeline */}
            <div className="flex items-center gap-1 rounded-lg bg-card p-0.5 ring-1 ring-line/20 shadow-2xs">
              <button
                type="button"
                disabled={timelineHistory.length === 0}
                onClick={handleUndoTimeline}
                className="rounded px-2.5 py-1 text-xs font-bold text-ink hover:bg-line/10 disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center gap-1 transition"
                title="Hoàn tác thay đổi vừa thực hiện trên timeline (Ctrl+Z)"
              >
                ↶ Hoàn tác
              </button>
              <button
                type="button"
                disabled={timelineRedoStack.length === 0}
                onClick={handleRedoTimeline}
                className="rounded px-2.5 py-1 text-xs font-bold text-ink hover:bg-line/10 disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center gap-1 transition"
                title="Làm lại thao tác vừa hoàn tác trên timeline (Ctrl+Y)"
              >
                ↷ Làm lại
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
            <button
              className="btn-ghost text-xs !py-1.5 text-accent font-bold flex items-center gap-1.5"
              onClick={downloadScheduleImage}
              disabled={exportingImage}
              title="Tải toàn bộ bảng lịch thi đấu thành file ảnh PNG đầy đủ chất lượng cao"
            >
              🖼️ {exportingImage ? "Đang xuất ảnh..." : "Tải ảnh lịch thi đấu"}
            </button>
          </div>
        )}

        {note && <span className="text-xs font-medium text-courtdeep">{note}</span>}
      </div>

      {/* ---------- VÒNG BẢNG ---------- */}
      {tab === "group" && (
        <>
          {maximizeStandings ? (
            /* Chế độ phóng to toàn màn hình bảng xếp hạng */
            <div className="panel p-4 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-line/15 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-head text-base font-bold uppercase tracking-tight text-ink">
                    📊 Bảng xếp hạng toàn diện ({ev.groups.length || 1} bảng)
                  </span>
                  <span className="text-xs text-line/60">
                    (Xem chi tiết vị trí, số trận, hiệu số và điểm số)
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-ghost text-xs font-bold !py-1 flex items-center gap-1 cursor-pointer"
                  onClick={() => setMaximizeStandings(false)}
                >
                  🗗 Thu nhỏ / Hiển thị cùng lịch thi đấu
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
                    <div key={g.name} className="panel overflow-hidden rounded-xl border border-line/15">
                      <p
                        className="px-3 py-2 font-head text-sm font-bold uppercase tracking-wide border border-line/20 rounded-[14px]"
                        style={{ backgroundColor: c.bg, color: c.text }}
                      >
                        {g.name}
                      </p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-line/10 text-[10px] uppercase tracking-wide text-line/50">
                            <th className="px-3 py-2 text-left">Đội</th>
                            <th className="px-1.5 py-2 text-center">Tr</th>
                            <th className="px-1.5 py-2 text-center">T</th>
                            <th className="px-1.5 py-2 text-center">B</th>
                            <th className="px-1.5 py-2 text-center">HS</th>
                            <th className="px-3 py-2 text-center">Đ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => {
                            const rowEntry = state.entries.find((e) => e.id === r.entryId);
                            return (
                              <tr key={r.entryId} className="border-t border-line/10 hover:bg-card/50">
                                <td className="max-w-[170px] truncate px-3 py-2">
                                  <span className="mr-1.5 font-head font-bold text-line/40">{i + 1}</span>
                                  <PlayerNameDisplay
                                    entry={rowEntry}
                                    fallback={nameOf(r.entryId)}
                                    activePlayerNames={activePlayerNames}
                                  />
                                </td>
                                <td className="px-1.5 py-2 text-center">{r.played}</td>
                                <td className="px-1.5 py-2 text-center">{r.win}</td>
                                <td className="px-1.5 py-2 text-center">{r.loss}</td>
                                <td className="px-1.5 py-2 text-center">{r.diff}</td>
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
          ) : (
            <div className="grid gap-6 lg:grid-cols-12 !mt-0 pt-[2px]">
              {/* Cột lịch thi đấu theo vòng */}
              <div className={showStandings ? "lg:col-span-8" : "lg:col-span-12"}>
                {rounds.length === 0 ? (
                  <div className="panel p-6 text-center text-sm text-line/60">
                    Chưa có lịch thi đấu vòng bảng. Bấm nút <strong>“Tạo lịch vòng bảng”</strong> để bắt đầu.
                  </div>
                ) : (
                  <div className="flex gap-4 overflow-x-auto pb-4 pt-[2px]">
                    {rounds.map((r, idx) => (
                      <div
                        key={r}
                        className={`w-[280px] shrink-0 pt-[2px] ${idx === 0 ? "pl-[2px] pr-[3px]" : "px-[3px]"}`}
                      >
                        <div
                          className="rounded-xl bg-accent/15 h-[40px] flex items-center justify-center text-center font-head text-sm font-bold uppercase tracking-wide text-accent ring-1 ring-accent/30"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
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

              {/* Bảng xếp hạng bên phải (có thể ẩn/hiện) */}
              {showStandings && (
                <div className="lg:col-span-4">
                  <div className="flex items-center justify-between">
                    <p className="eyebrow">Bảng xếp hạng</p>
                    <button
                      type="button"
                      className="text-[11px] font-bold text-accent hover:underline cursor-pointer"
                      onClick={() => setMaximizeStandings(true)}
                      title="Phóng to toàn màn hình bảng xếp hạng"
                    >
                      🗖 Phóng to BXH
                    </button>
                  </div>
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
                          className="px-3 py-2 font-head text-sm font-bold uppercase tracking-wide border border-line/20 rounded-[14px]"
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
                              const rowEntry = state.entries.find((e) => e.id === r.entryId);
                              return (
                                <tr key={r.entryId} className="border-t border-line/10 hover:bg-card/50">
                                  <td className="max-w-[150px] truncate px-3 py-2">
                                    <span className="mr-1.5 font-head font-bold text-line/40">{i + 1}</span>
                                    <PlayerNameDisplay
                                      entry={rowEntry}
                                      fallback={nameOf(r.entryId)}
                                      activePlayerNames={activePlayerNames}
                                    />
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
              )}
            </div>
          )}
        </>
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
            <div className={`${showQueue ? "lg:col-span-9" : "lg:col-span-12"} panel overflow-hidden rounded-2xl flex flex-col`}>
              <div
                className="relative overflow-x-auto overflow-y-visible flex-1"
                ref={timelinePrintRef}
              >
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
                  className="border-l border-t border-line/20 bg-card"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `80px repeat(${slotIdxs.length}, ${colWidth}px)`,
                    gridTemplateRows: `34px repeat(${state.courts.length}, ${rowHeight}px)`,
                  }}
                >
                  {/* Ô góc trên bên trái: STICKY top-0 left-0 z-30 */}
                  <div
                    data-timeline-hours="true"
                    className="sticky top-0 left-0 z-30 border-b border-r border-line/20 bg-card p-1 text-[11px] font-bold uppercase tracking-wider text-line/70 shadow-xs flex items-center justify-center text-center h-[34px] w-[80px]"
                  >
                    Sân / Giờ
                  </div>

                  {/* Hàng giờ: STICKY top-0 z-20 */}
                  {slotIdxs.map((s) => (
                    <div
                      key={`h${s}`}
                      data-timeline-hours="true"
                      className="sticky top-0 z-20 border-b border-l border-line/15 bg-card/95 p-1 text-center text-[11px] font-bold uppercase tracking-wider text-line/70 backdrop-blur-xs shadow-xs flex items-center justify-center h-[34px]"
                    >
                      {addMinutes(state.startTime, s * state.slotMinutes)}
                    </div>
                  ))}

                  {/* Từng dòng Sân */}
                  {state.courts.map((court, courtIdx) => {
                    const rowNum = courtIdx + 2;
                    const courtMatches = grid.get(court) ?? [];
                    const slotMins = state.slotMinutes || 30;

                    return (
                      <React.Fragment key={court}>
                        {/* Cột Sân: STICKY left-0 z-20 (chỉ hiển thị tên sân, không icon) */}
                        <div
                          className="sticky left-0 z-20 border-b border-r border-line/20 bg-card/95 p-1 text-xs font-bold text-ink backdrop-blur-xs flex items-center justify-center text-center shadow-xs select-none truncate w-[80px]"
                          style={{
                            gridRow: rowNum,
                            gridColumn: 1,
                            minHeight: `${rowHeight}px`,
                            height: `${rowHeight}px`,
                            maxHeight: `${rowHeight}px`,
                          }}
                        >
                          <span className="truncate">{court}</span>
                        </div>

                        {/* Các ô giờ của Sân này: Nền nhận kéo thả (Drop Target) với vạch chia 5 phút */}
                        {slotIdxs.map((s) => (
                          <div
                            key={`${court}-${s}`}
                            className="relative border-b border-l border-line/10 p-0.5 transition hover:bg-accent/10 group overflow-hidden"
                            style={{
                              gridRow: rowNum,
                              gridColumn: s + 2,
                              minHeight: `${rowHeight}px`,
                              height: `${rowHeight}px`,
                              maxHeight: `${rowHeight}px`,
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const draggedId = e.dataTransfer.getData("text/plain") || dragMatch;
                              if (!draggedId) return;
                              const rect = e.currentTarget.getBoundingClientRect();
                              const offsetX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                              const ratio = offsetX / rect.width;
                              const numSteps = Math.max(1, Math.floor(slotMins / 5));
                              const stepIdx = Math.min(numSteps - 1, Math.floor(ratio * numSteps));
                              const offset = stepIdx * 5;
                              recordTimelineState();
                              updateMatch(draggedId, { court, timeSlot: s, offsetMinutes: offset });
                              setDragMatch(null);
                              setNote(`Đã chuyển trận sang ${court} (+${offset}p)`);
                            }}
                          >
                            {/* Vạch chia 5 phút khi hover để kéo thả chính xác (+5p, +10p, +15p...) */}
                            <div className="pointer-events-none absolute inset-0 hidden group-hover:flex">
                              {Array.from({ length: Math.max(1, Math.floor(slotMins / 5)) }).map((_, stepI) => (
                                <div
                                  key={stepI}
                                  className="flex-1 border-r border-accent/20 border-dashed last:border-r-0 flex items-end justify-center pb-0.5"
                                >
                                  <span className="text-[8px] font-mono text-accent font-semibold">+{(stepI + 1) * 5}p</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        {/* Lớp chứa tất cả các thẻ trận đấu trên sân này (Cards Layer) nằm trên nền drop targets */}
                        <div
                          key={`${court}-cards-layer`}
                          className="relative pointer-events-none w-full h-full overflow-visible z-10"
                          style={{
                            gridRow: rowNum,
                            gridColumn: `2 / span ${slotIdxs.length}`,
                            height: `${rowHeight}px`,
                          }}
                        >
                          {courtMatches.map(({ match: m }, cardIdx) => {
                            const minWidth = Math.max(36, Math.round((5 / slotMins) * colWidth));
                            const cardWidth = Math.max(
                              minWidth,
                              Math.round(((m.durationMinutes ?? slotMins) / slotMins) * colWidth - 6),
                            );
                            const leftOffset = (((m.timeSlot ?? 0) * slotMins + (m.offsetMinutes ?? 0)) / slotMins) * colWidth;

                            return (
                              <div
                                key={m.id}
                                draggable={true}
                                onDragStart={(e) => {
                                  if ((e.target as HTMLElement).closest("[data-no-drag]")) {
                                    e.preventDefault();
                                    return;
                                  }
                                  e.dataTransfer.setData("text/plain", m.id);
                                  e.dataTransfer.effectAllowed = "move";
                                  // Cho phép chuyển sang trạng thái drag ngay sau khi event dragstart được browser khởi tạo
                                  setTimeout(() => setDragMatch(m.id), 0);
                                }}
                                onDragEnd={() => setDragMatch(null)}
                                className={`timeline-card-wrapper pointer-events-auto cursor-grab active:cursor-grabbing absolute top-0.5 bottom-0.5 transition-[opacity] ${
                                  dragMatch === m.id ? "opacity-30 !pointer-events-none" : ""
                                } ${dragMatch && dragMatch !== m.id ? "pointer-events-none" : ""} hover:z-30`}
                                style={{
                                  width: `${cardWidth}px`,
                                  left: `${leftOffset}px`,
                                  zIndex: 10 + cardIdx * 2,
                                }}
                              >
                                <MatchCard
                                  {...cardProps(m, true)}
                                  colWidth={colWidth}
                                  rowHeight={rowHeight}
                                  slotMinutes={slotMins}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Cột trận chờ xếp lịch bên phải - ghim cố định chạy theo màn hình khi cuộn */}
            {showQueue && (
              <div
                className="lg:col-span-3 panel p-3 flex flex-col rounded-2xl sticky top-4 self-start max-h-[calc(100vh-2rem)] z-20 shadow-md"
              >
                <div className="flex items-center justify-between border-b border-line/10 pb-2">
                  <p className="eyebrow">Trận chờ xếp ({unassignedMatches.length})</p>
                  <button
                    type="button"
                    className="text-[11px] font-bold text-line/50 hover:text-ink cursor-pointer"
                    onClick={() => setShowQueue(false)}
                  >
                    ✕ Đóng
                  </button>
                </div>
                {hasGroupStage && !allGroupStageDone && (
                  <div className="mt-2 rounded-lg bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-300 ring-1 ring-amber-500/20 leading-relaxed">
                    ⏳ <strong>Ưu tiên Vòng bảng:</strong> Các trận vòng loại trực tiếp (KO) sẽ hiển thị vào hàng chờ sau khi kết thúc toàn bộ vòng bảng ({currentGroupMatches.filter((m) => m.status === "done").length}/{currentGroupMatches.length} trận).
                  </div>
                )}
                <p className="mt-2 text-[11px] text-line/60">
                  Kéo thả thẻ trận vào bất kỳ ô giờ nào trên bảng timeline bên trái (vị trí ngang trong ô tương ứng bước 5 phút).
                </p>

                <div className="mt-3 flex-1 overflow-y-auto space-y-3 pr-1">
                  {unassignedByRound.length === 0 ? (
                    <p className="py-8 text-center text-xs text-line/40">
                      Tất cả các trận đã được xếp lịch!
                    </p>
                  ) : (
                    unassignedByRound.map((grp) => (
                      <div
                        key={grp.key}
                        className="rounded-xl border border-line/20 bg-secondary/20 p-2 space-y-2 shadow-xs"
                      >
                        <div className="flex items-center justify-between gap-1 border-b border-line/15 pb-1.5">
                          <span className="text-xs font-bold text-ink">
                            {grp.label} ({grp.matches.length})
                          </span>
                          <button
                            type="button"
                            className="rounded px-2 py-0.5 text-[10px] font-bold bg-accent/15 text-accent hover:bg-accent/25 ring-1 ring-accent/30 transition cursor-pointer"
                            onClick={() => autoScheduleRound(grp.matches)}
                            title={`Tự động xếp ${grp.matches.length} trận của ${grp.label} vào timeline`}
                          >
                            ⚡ Xếp vòng này
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          {grp.matches.map((m) => (
                            <div
                              key={m.id}
                              draggable
                              onDragStart={() => setDragMatch(m.id)}
                              onDragEnd={() => setDragMatch(null)}
                              className="cursor-grab active:cursor-grabbing rounded-lg bg-card p-2 text-xs ring-1 ring-line/15 hover:ring-accent/50 shadow-xs transition"
                            >
                              <div className="flex items-center justify-between gap-1 text-[10px] text-line/60 pb-1 border-b border-line/10">
                                <span className="font-bold text-ink">{groupTag(m.groupName)}</span>
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-1 text-[11px]">
                                <div className="truncate flex-1">
                                  <PlayerNameDisplay
                                    entry={state.entries.find((e) => e.id === m.aId)}
                                    fallback={nameOf(m.aId)}
                                    activePlayerNames={activePlayerNames}
                                  />
                                </div>
                                <span className="shrink-0 text-line/40 font-mono text-[10px] font-bold px-1">vs</span>
                                <div className="truncate flex-1 text-right">
                                  <PlayerNameDisplay
                                    entry={state.entries.find((e) => e.id === m.bId)}
                                    fallback={nameOf(m.bId)}
                                    activePlayerNames={activePlayerNames}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- LOẠI TRỰC TIẾP (KNOCKOUT) ---------- */}
      {tab === "ko" && (
        <div className="grid gap-6 lg:grid-cols-12 items-start">
          <div className={`${showManualSeeding ? "lg:col-span-9" : "lg:col-span-12"} overflow-x-auto pb-4`}>
            {koRounds.length === 0 ? (
              <div className="panel p-6 text-center text-sm text-line/60 rounded-2xl">
                Chưa có nhánh loại trực tiếp. Bấm <strong>“Tạo nhánh KO”</strong> để sinh sơ đồ.
              </div>
            ) : (
              renderKoBracketTree()
            )}
          </div>

          {/* Cột kéo thả VĐV vào nhánh KO - GHIM CỐ ĐỊNH CHẠY THEO TRANG KHI CUỘN (Sticky Sidebar) */}
          {showManualSeeding && (
            <div className="lg:col-span-3 panel p-3.5 rounded-2xl sticky top-4 self-start max-h-[calc(100vh-2rem)] flex flex-col shadow-xl ring-1 ring-line/20 z-20">
              <div className="flex items-center justify-between border-b border-line/10 pb-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">📌</span>
                  <p className="eyebrow !text-ink">Xếp thủ công vào nhánh</p>
                </div>
                <button
                  type="button"
                  className="text-[11px] font-bold text-line/50 hover:text-ink cursor-pointer"
                  onClick={() => setShowManualSeeding(false)}
                >
                  ✕ Đóng
                </button>
              </div>
              <p className="mt-1 text-xs text-line/60 shrink-0">
                Kéo tên đội bên dưới thả trực tiếp vào ô trong nhánh. Danh sách luôn ghim cố định khi cuộn màn hình.
              </p>

              <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
                {(ev.groups.length
                  ? ev.groups
                  : [{ name: "Tất cả đội", entryIds: entries.map((e) => e.id) }]
                ).map((g) => {
                  const gM = groupMatches.filter((x) => x.groupName === g.name);
                  const standings = computeStandings(g.entryIds, gM, ev);
                  const cleanGName = g.name.replace(/^Bảng\s+/i, "").trim();
                  const c = groupColor(g.name);
                  return (
                    <div key={g.name} className="rounded-xl border border-line/15 bg-card/60 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span
                          className="font-head text-xs font-bold px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: c.bg, color: c.text }}
                        >
                          {g.name} ({g.entryIds.length} đội)
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {standings.map((st, idx) => {
                          const e = entries.find((x) => x.id === st.entryId);
                          if (!e) return null;
                          const rankLabel = `${idx + 1}${cleanGName.replace(/\s+/g, "").toUpperCase()}`;
                          return (
                            <div
                              key={e.id}
                              draggable
                              onDragStart={() => setDragEntry(e.id)}
                              className="cursor-grab truncate rounded-lg px-2 py-1.5 text-xs font-semibold shadow-xs ring-1 ring-line/10 active:cursor-grabbing bg-secondary text-line/80 hover:bg-secondary/80 flex items-center justify-between transition gap-2"
                              title={`Hạng ${idx + 1} bảng ${cleanGName} (${rankLabel}): Kéo thả vào ô trong nhánh KO`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-mono text-[10px] font-bold text-accent bg-accent/15 px-1.5 py-0.5 rounded shrink-0">
                                  {rankLabel}
                                </span>
                                <PlayerNameDisplay
                                  entry={e}
                                  fallback={entryName(e)}
                                  activePlayerNames={activePlayerNames}
                                />
                              </div>
                              <span className="text-[10px] text-line/40 shrink-0">Kéo ⇲</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL TOÀN MÀN HÌNH XEM SƠ ĐỒ NHÁNH LOẠI TRỰC TIẾP */}
      {isFullscreenKo && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col p-4 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/15 pb-3 px-2">
            <div className="flex items-center gap-3">
              <h2 className="font-head text-base md:text-lg font-bold tracking-tight text-ink flex items-center gap-2">
                🏆 Sơ đồ Nhánh trực tiếp ({ev.name})
              </h2>
              {/* Lựa chọn dạng hiển thị 2 nhánh 2 bên hoặc 1 nhánh thẳng */}
              <div className="flex items-center gap-1 rounded-lg bg-card p-0.5 ring-1 ring-line/20 text-xs">
                <button
                  type="button"
                  onClick={() => setKoLayout("two_sided")}
                  className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                    koLayout === "two_sided"
                      ? "bg-accent text-accent-foreground shadow-2xs"
                      : "text-line/60 hover:text-ink"
                  }`}
                  title="Hiển thị sơ đồ dạng 2 nhánh 2 bên hội tụ về chung kết ở giữa"
                >
                  ↔️ 2 nhánh 2 bên
                </button>
                <button
                  type="button"
                  onClick={() => setKoLayout("single")}
                  className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                    koLayout === "single"
                      ? "bg-accent text-accent-foreground shadow-2xs"
                      : "text-line/60 hover:text-ink"
                  }`}
                  title="Hiển thị sơ đồ dạng 1 nhánh thẳng từ trái sang phải"
                >
                  ➡️ 1 nhánh thẳng
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Thu phóng */}
              <div className="flex items-center gap-1 bg-card px-2.5 py-1 rounded-lg ring-1 ring-line/20 text-xs font-medium">
                <span className="text-line/60">Thu phóng:</span>
                <button
                  type="button"
                  onClick={() => setKoZoom((z) => Math.max(0.3, Number((z - 0.1).toFixed(1))))}
                  className="size-6 flex items-center justify-center rounded bg-line/10 hover:bg-line/20 font-bold cursor-pointer"
                  title="Thu nhỏ"
                >
                  -
                </button>
                <span className="w-12 text-center font-mono font-bold text-accent">{Math.round(koZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setKoZoom((z) => Math.min(2.0, Number((z + 0.1).toFixed(1))))}
                  className="size-6 flex items-center justify-center rounded bg-line/10 hover:bg-line/20 font-bold cursor-pointer"
                  title="Phóng to"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setKoZoom(1)}
                  className="ml-1 text-[11px] text-line/60 hover:text-ink underline cursor-pointer"
                >
                  100%
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen?.().catch(() => {});
                  } else {
                    document.exitFullscreen?.().catch(() => {});
                  }
                }}
                className="btn-ghost text-xs !py-1.5 flex items-center gap-1 cursor-pointer"
                title="Toàn màn hình trình duyệt (F11)"
              >
                🖥️ Màn hình rộng
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreenKo(false)}
                className="btn-accent text-xs font-bold flex items-center gap-1 px-3 py-1.5 cursor-pointer"
              >
                ✕ Đóng (Esc)
              </button>
            </div>
          </div>

          {/* Vùng hiển thị toàn màn hình */}
          <div className="flex-1 overflow-auto p-6 flex items-start justify-center">
            <div
              style={{
                transform: `scale(${koZoom})`,
                transformOrigin: "top center",
                transition: "transform 0.1s ease-out",
              }}
            >
              {renderKoBracketTree()}
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
              <div className="flex items-center justify-between">
                <p className="eyebrow">Danh sách trọng tài ({state.referees?.length ?? 0})</p>
                {(state.referees ?? []).length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-red-500 hover:underline cursor-pointer"
                    onClick={() => update({ referees: [] })}
                  >
                    Xóa tất cả trọng tài
                  </button>
                )}
              </div>
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
