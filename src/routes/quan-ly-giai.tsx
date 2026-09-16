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

/* ---------------- Ô Trọng tài có ghi nhớ & Dropdown gợi ý ---------------- */

function RefereeSelector({
  value,
  referees,
  onSelect,
  onAddReferee,
}: {
  value?: string;
  referees: string[];
  onSelect: (r: string) => void;
  onAddReferee?: (r: string) => void;
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
          <div className="absolute left-0 top-full mt-1 z-50 min-w-[150px] max-h-48 overflow-y-auto rounded-lg border border-line/20 bg-card p-1 shadow-lg text-xs">
            <div className="px-2 py-1 text-[10px] font-bold text-line/50 uppercase tracking-wider">
              Trọng tài đã lưu
            </div>
            {referees.length === 0 ? (
              <div className="px-2 py-1.5 text-[11px] text-line/50 italic">
                Nhập tên để tự động ghi nhớ
              </div>
            ) : (
              referees.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`w-full text-left px-2 py-1 rounded text-[11px] hover:bg-line/10 transition truncate ${
                    r === value ? "font-bold text-accent bg-accent/10" : "text-line/80"
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
                className="w-full text-left px-2 py-1 rounded text-[11px] text-accent font-semibold hover:bg-accent/10 transition border-t border-line/10 mt-1"
                onClick={() => {
                  commit(text);
                  setOpen(false);
                }}
              >
                + Lưu trọng tài "{text.trim()}"
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Hiển thị Tên VĐV & Đổi đỏ khi đang đấu ---------------- */

function PlayerNameDisplay({
  entry,
  fallback,
  activePlayerNames,
  isWinning,
}: {
  entry?: Entry;
  fallback: string;
  activePlayerNames: Set<string>;
  isWinning?: boolean;
}) {
  if (!entry || entry.players.length === 0) {
    return <span className="truncate">{fallback || "Chưa xếp"}</span>;
  }
  return (
    <span className="truncate inline-flex items-center gap-1">
      {entry.players.map((p, idx) => {
        const pName = p.name.trim();
        if (!pName) return null;
        const isLive = activePlayerNames.has(pName.toLowerCase());
        return (
          <span key={idx} className="inline-flex items-center gap-0.5">
            {idx > 0 && <span className="text-line/40 mx-0.5">/</span>}
            <span
              className={`${
                isLive
                  ? "text-red-600 font-extrabold dark:text-red-400 underline decoration-red-500"
                  : isWinning
                    ? "font-bold text-ink"
                    : "text-ink/85 font-medium"
              }`}
              title={isLive ? `${pName} đang thi đấu trong một trận khác!` : undefined}
            >
              {pName}
            </span>
            {isLive && (
              <span className="size-1.5 rounded-full bg-red-600 animate-pulse shrink-0 inline-block" />
            )}
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
  onRemoveFromTimeline?: () => void;
  onViewNote?: (note: string) => void;
  onDurationChange?: (mins: number) => void;
  onOffsetChange?: (offset: number) => void;
  onDropOnMatch?: (targetMatchId: string) => void;
  compact?: boolean | undefined;
  colWidth?: number;
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
  onRemoveFromTimeline,
  onViewNote,
  onDurationChange,
  onOffsetChange,
  onDropOnMatch,
  compact,
  colWidth = 210,
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

  return (
    <div
      className={`relative rounded-xl p-2.5 ring-1 transition-all select-none ${
        m.status === "live"
          ? "ring-2 ring-red-500 shadow-md bg-red-50/70 dark:bg-red-950/20"
          : "ring-line/15"
      }`}
      style={{ backgroundColor: m.status === "live" ? undefined : m.status === "done" ? "var(--muted)" : c.bg }}
      onDragOver={(e) => {
        if (onDropOnMatch) e.preventDefault();
      }}
      onDrop={(e) => {
        if (onDropOnMatch) {
          e.stopPropagation();
          onDropOnMatch(m.id);
        }
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shrink-0"
            style={{ backgroundColor: c.dot, color: "white" }}
          >
            {displayTag}
          </span>
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
            <PlayerNameDisplay
              entry={entryA}
              fallback={nameA}
              activePlayerNames={activePlayerNames}
              isWinning={aWin}
            />
          </div>
          <ScoreBox value={m.scoreA} onCommit={(v) => onScore("scoreA", v)} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {isLiveB && (
              <span className="size-2 rounded-full bg-red-600 animate-pulse shrink-0" title="VĐV đang thi đấu trực tiếp" />
            )}
            <PlayerNameDisplay
              entry={entryB}
              fallback={nameB}
              activePlayerNames={activePlayerNames}
              isWinning={bWin}
            />
          </div>
          <ScoreBox value={m.scoreB} onCommit={(v) => onScore("scoreB", v)} />
        </div>
      </div>

      {compact ? (
        /* Thẻ gọn gàng trong ô Timeline kèm nút tăng giảm thời gian & kéo dài/thu gọn */
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 pt-1.5 border-t border-line/10 text-[10px]">
          {/* Thời lượng trận đấu & nút tăng giảm 5 phút */}
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-ink text-[10px]">⏱️ {m.durationMinutes ?? 30}p</span>
            <button
              type="button"
              className="rounded bg-card/90 px-1 py-0.5 text-[9px] font-bold ring-1 ring-line/20 hover:bg-accent/20 hover:text-accent cursor-pointer transition-colors"
              title="Giảm thời gian trận đấu 5 phút"
              onClick={(e) => {
                e.stopPropagation();
                onDurationChange?.(Math.max(10, (m.durationMinutes ?? 30) - 5));
              }}
            >
              -5p
            </button>
            <button
              type="button"
              className="rounded bg-card/90 px-1 py-0.5 text-[9px] font-bold ring-1 ring-line/20 hover:bg-accent/20 hover:text-accent cursor-pointer transition-colors"
              title="Tăng thời gian trận đấu 5 phút"
              onClick={(e) => {
                e.stopPropagation();
                onDurationChange?.(Math.min(180, (m.durationMinutes ?? 30) + 5));
              }}
            >
              +5p
            </button>
          </div>

          {/* Dời giờ bắt đầu (nấc 5 phút) */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className="rounded bg-card/90 px-1 py-0.5 text-[9px] font-bold ring-1 ring-line/20 hover:bg-amber-500/20 hover:text-amber-600 cursor-pointer transition-colors"
              title="Lùi giờ bắt đầu 5 phút"
              onClick={(e) => {
                e.stopPropagation();
                onOffsetChange?.(Math.max(-25, (m.offsetMinutes ?? 0) - 5));
              }}
            >
              ◀ 5p
            </button>
            <span
              className={`font-mono text-[9px] px-1 py-0.5 rounded font-bold ${
                (m.offsetMinutes ?? 0) !== 0
                  ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                  : "text-line/40"
              }`}
            >
              {(m.offsetMinutes ?? 0) === 0 ? "0p" : (m.offsetMinutes ?? 0) > 0 ? `+${m.offsetMinutes}p` : `${m.offsetMinutes}p`}
            </span>
            <button
              type="button"
              className="rounded bg-card/90 px-1 py-0.5 text-[9px] font-bold ring-1 ring-line/20 hover:bg-amber-500/20 hover:text-amber-600 cursor-pointer transition-colors"
              title="Tiến giờ bắt đầu 5 phút"
              onClick={(e) => {
                e.stopPropagation();
                onOffsetChange?.(Math.min(25, (m.offsetMinutes ?? 0) + 5));
              }}
            >
              5p ▶
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <select
            className="rounded-md bg-card px-1.5 py-1 text-[11px] font-semibold ring-1 ring-line/20 outline-none"
            value={m.court}
            onChange={(e) => onCourt(e.target.value)}
          >
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
          />

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
          className="btn-ghost !px-2 !py-1 text-[11px] flex items-center gap-1"
        >
          ⚡ Chấm điểm
        </Link>
      </div>

      {/* Cạnh kéo giãn / thu gọn thời lượng (Resize Handle) */}
      {compact && onDurationChange && (
        <div
          className="absolute right-0 top-0 bottom-0 w-3.5 cursor-ew-resize flex items-center justify-center group/resize hover:bg-accent/30 rounded-r transition-colors select-none z-30"
          title="Nắm kéo sang phải để kéo dài trận đấu, sang trái để thu gọn (bước 5 phút)"
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const startX = e.clientX;
            const startDur = m.durationMinutes ?? 30;
            const pxPerMin = (colWidth || 210) / (slotMinutes || 30);

            const onMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.clientX - startX;
              const deltaMinutes = Math.round((deltaX / pxPerMin) / 5) * 5;
              const newDur = Math.max(10, Math.min(180, startDur + deltaMinutes));
              onDurationChange(newDur);
            };

            const onMouseUp = () => {
              window.removeEventListener("mousemove", onMouseMove);
              window.removeEventListener("mouseup", onMouseUp);
            };

            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
          }}
        >
          <div className="w-1 h-8 rounded-full bg-line/30 group-hover/resize:bg-accent group-hover/resize:h-12 transition-all" />
        </div>
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
  activePlayerNames,
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
  entryA?: Entry;
  entryB?: Entry;
  activePlayerNames: Set<string>;
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
          <PlayerNameDisplay
            entry={entryA}
            fallback={nameA}
            activePlayerNames={activePlayerNames}
            isWinning={aWin}
          />
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
          <PlayerNameDisplay
            entry={entryB}
            fallback={nameB}
            activePlayerNames={activePlayerNames}
            isWinning={bWin}
          />
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
          className="btn-ghost !px-1.5 !py-0.5 text-[10px] flex items-center gap-1"
        >
          ⚡ Chấm điểm
        </Link>
      </div>
    </div>
  );
}

/* ---------------- Đường nối thẳng, bo cong nhẹ ở góc, nét mỏng nối các vòng Knockout ---------------- */

function BracketConnectors({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="w-10 shrink-0 flex flex-col pt-12 pb-4 self-stretch">
      <svg
        className="w-full h-full overflow-visible text-line/40 dark:text-line/40"
        viewBox="0 0 40 1000"
        preserveAspectRatio="none"
      >
        {Array.from({ length: count }).map((_, p) => {
          const yTop = ((2 * p + 0.5) / (2 * count)) * 1000;
          const yBottom = ((2 * p + 1.5) / (2 * count)) * 1000;
          const yMid = ((p + 0.5) / count) * 1000;
          // Bán kính bo cong nhẹ ở góc (sang trọng, tinh tế)
          const r = Math.min(12, Math.max(4, (yBottom - yTop) * 0.08));
          return (
            <g key={p}>
              {/* Nhánh từ trận trên ra, bo cong nhẹ 90 độ xuống thân dọc */}
              <path
                d={`M 0 ${yTop} L ${20 - r} ${yTop} Q 20 ${yTop} 20 ${yTop + r} L 20 ${yMid}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Nhánh từ trận dưới ra, bo cong nhẹ 90 độ lên thân dọc */}
              <path
                d={`M 0 ${yBottom} L ${20 - r} ${yBottom} Q 20 ${yBottom} 20 ${yBottom - r} L 20 ${yMid}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Đoạn thẳng ngang nối sang trận vòng tiếp theo */}
              <path
                d={`M 20 ${yMid} L 40 ${yMid}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              {/* Điểm nút bo tròn tinh tế tại điểm nối */}
              <circle
                cx="40"
                cy={yMid}
                r="2.5"
                className="fill-accent stroke-card stroke-1"
              />
            </g>
          );
        })}
      </svg>
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

  // Zoom timeline (infinite range slider)
  const [colWidth, setColWidth] = useState(210);
  const [rowHeight, setRowHeight] = useState(115);

  // Toggles for flexible screen space
  const [showStandings, setShowStandings] = useState(true);
  const [maximizeStandings, setMaximizeStandings] = useState(false);
  const [showQueue, setShowQueue] = useState(true);
  const [showManualSeeding, setShowManualSeeding] = useState(false);

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

  const handleAddReferee = (newRef: string) => {
    const trimmed = newRef.trim();
    if (!trimmed) return;
    const current = state.referees || [];
    if (!current.includes(trimmed)) {
      update({ referees: [...current, trimmed] });
      setNote(`Đã ghi nhớ trọng tài "${trimmed}"`);
    }
  };

  /* Đổi chỗ 2 trận khi kéo đè lên nhau */
  const handleMatchDrop = (targetMatchId: string) => {
    if (!dragMatch || dragMatch === targetMatchId) return;
    const mA = state.matches.find((m) => m.id === dragMatch);
    const mB = state.matches.find((m) => m.id === targetMatchId);
    if (!mA || !mB) return;

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
    onStatus: (s) => updateMatch(m.id, { status: s }),
    onReset: () => resetMatch(m),
    courts: state.courts,
    referees: state.referees,
    onCourt: (c) => updateMatch(m.id, { court: c }),
    onReferee: (r) => updateMatch(m.id, { referee: r }),
    onAddReferee: handleAddReferee,
    onRemoveFromTimeline: () => updateMatch(m.id, { timeSlot: undefined }),
    onViewNote: (n) => setViewNoteText(n),
    onDurationChange: (mins) => updateMatch(m.id, { durationMinutes: mins }),
    onOffsetChange: (offset) => updateMatch(m.id, { offsetMinutes: offset }),
    onDropOnMatch: handleMatchDrop,
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
    updateMatch(dragMatch, { court, timeSlot: slot, offsetMinutes });
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
    <div className="space-y-6 pl-0">
      {/* Tiêu đề & Chọn nội dung */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-head text-3xl font-extrabold uppercase tracking-tight text-[#0a3320] sm:text-4xl">
            Quản lý giải đấu
          </h1>
          <p className="mt-1 text-xs text-line/60">
            Điều hành trực tiếp các trận đấu, sân thi đấu, trọng tài và sơ đồ bảng/nhánh KO.
          </p>
        </div>
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
                Đi tiếp / bảng (N):
                <input
                  type="number"
                  min={1}
                  max={64}
                  className="field w-14 text-center !py-1 text-xs"
                  value={ev.advancePerGroup}
                  onChange={(e) =>
                    updateEvent(ev.id, {
                      advancePerGroup: Math.max(1, Math.min(64, Number(e.target.value) || 1)),
                    })
                  }
                  title="Số lượng đội được chọn đi tiếp từ mỗi bảng vào nhánh KO (không giới hạn)"
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
              <button
                type="button"
                className={`btn-ghost text-xs font-bold flex items-center gap-1 ${
                  showManualSeeding ? "bg-accent/15 text-accent ring-1 ring-accent/30" : ""
                }`}
                onClick={() => setShowManualSeeding((v) => !v)}
                title="Bật / Tắt bảng xếp thủ công phân theo bảng"
              >
                🎯 Xếp thủ công {showManualSeeding ? "▼ (Hiện)" : "▶ (Ẩn)"}
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
                  onClick={() => setMaximizeStandings((m) => !m)}
                  title="Phóng to bảng xếp hạng toàn màn hình"
                >
                  {maximizeStandings ? "🗗 Thu nhỏ BXH" : "🗖 Phóng to BXH"}
                </button>
              )}
              <button className="btn-accent text-xs" onClick={buildGroups}>
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
                min="80"
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
                        <div className="rounded-xl bg-accent/15 h-[40px] flex items-center justify-center text-center font-head text-sm font-bold uppercase tracking-wide text-accent ring-1 ring-accent/30">
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
            <div className={`${showQueue ? "lg:col-span-9" : "lg:col-span-12"} panel overflow-hidden rounded-2xl`}>
              <div className="relative max-h-[72vh] overflow-x-auto overflow-y-auto" ref={timelinePrintRef}>
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
                    return (
                      <React.Fragment key={court}>
                        {/* Cột Sân: STICKY left-0 z-10 (chỉ hiển thị tên sân, không icon) */}
                        <div
                          className="sticky left-0 z-10 border-b border-r border-line/20 bg-card/95 p-3 text-xs font-bold text-ink backdrop-blur-xs flex items-center shadow-xs"
                          style={{ minHeight: `${rowHeight}px`, height: `${rowHeight}px` }}
                        >
                          <span className="truncate">{court}</span>
                        </div>

                        {/* Các ô giờ của Sân này với vạch 5 phút & kéo thả nấc 5 phút */}
                        {slotIdxs.map((s) => {
                          const cell = (grid.get(court) ?? []).filter((x) => x.slot === s);
                          return (
                            <div
                              key={`${court}-${s}`}
                              className="relative border-b border-l border-line/10 p-1.5 transition hover:bg-accent/5 group"
                              style={{ minHeight: `${rowHeight}px` }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const offsetX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                                const ratio = offsetX / rect.width;
                                const slotMins = state.slotMinutes || 30;
                                const numSteps = Math.max(1, Math.floor(slotMins / 5));
                                const stepIdx = Math.min(numSteps - 1, Math.floor(ratio * numSteps));
                                const offset = stepIdx * 5;
                                dropOn(court, s, offset);
                              }}
                            >
                              {/* Vạch chia 5 phút khi hover để kéo thả chính xác */}
                              <div className="pointer-events-none absolute inset-0 hidden group-hover:flex">
                                {Array.from({ length: Math.max(1, Math.floor((state.slotMinutes || 30) / 5)) }).map((_, stepI) => (
                                  <div
                                    key={stepI}
                                    className="flex-1 border-r border-accent/15 border-dashed last:border-r-0 flex items-end justify-center pb-0.5"
                                  >
                                    <span className="text-[8px] font-mono text-accent/50">+{stepI * 5}p</span>
                                  </div>
                                ))}
                              </div>

                              <div className="relative z-1 space-y-1.5">
                                {cell.map(({ match: m }) => {
                                  const slotMins = state.slotMinutes || 30;
                                  const cardWidth = Math.max(
                                    colWidth - 12,
                                    ((m.durationMinutes ?? slotMins) / slotMins) * colWidth - 8,
                                  );
                                  const leftOffset = ((m.offsetMinutes ?? 0) / slotMins) * colWidth;
                                  return (
                                    <div
                                      key={m.id}
                                      draggable
                                      onDragStart={() => setDragMatch(m.id)}
                                      className="cursor-grab active:cursor-grabbing transition-all"
                                      style={{
                                        width: `${cardWidth}px`,
                                        marginLeft: `${leftOffset}px`,
                                        position: "relative",
                                        zIndex: 10,
                                      }}
                                    >
                                      <MatchCard
                                        {...cardProps(m, true)}
                                        colWidth={colWidth}
                                        slotMinutes={slotMins}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Cột trận chờ xếp lịch bên phải - bật/tắt linh hoạt */}
            {showQueue && (
              <div className="lg:col-span-3 panel p-3 max-h-[72vh] flex flex-col rounded-2xl">
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
                              className="cursor-grab active:cursor-grabbing rounded-lg bg-card p-2 text-xs ring-1 ring-line/15 hover:ring-accent/50 shadow-xs transition"
                            >
                              <div className="flex items-center justify-between gap-1 text-[10px] text-line/60 pb-1 border-b border-line/10">
                                <span className="font-bold text-ink">{groupTag(m.groupName)}</span>
                                <span className="font-mono text-line/50">{m.durationMinutes ?? 30}p</span>
                              </div>
                              <div className="mt-1 space-y-0.5 text-[11px]">
                                <div className="truncate">
                                  <PlayerNameDisplay
                                    entry={state.entries.find((e) => e.id === m.aId)}
                                    fallback={nameOf(m.aId)}
                                    activePlayerNames={activePlayerNames}
                                  />
                                </div>
                                <div className="truncate">
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
                      <div className="w-[275px] shrink-0 flex flex-col">
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
                              entryA={state.entries.find((e) => e.id === m.aId)}
                              entryB={state.entries.find((e) => e.id === m.bId)}
                              activePlayerNames={activePlayerNames}
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

                      {/* Đường cong Sigma kết nối các vòng kế tiếp nhau */}
                      {colIdx < koRounds.length - 1 && (
                        <BracketConnectors count={Math.max(1, Math.floor(list.length / 2))} />
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Trận tranh hạng 3 */}
                {thirdMatch && (
                  <div className="w-[275px] shrink-0 flex flex-col justify-end ml-6">
                    <div className="rounded-xl bg-court/15 py-2.5 text-center font-head text-sm font-bold uppercase tracking-wide text-courtdeep ring-1 ring-court/30">
                      Tranh hạng 3
                    </div>
                    <div className="mt-4">
                      <KoCard
                        m={thirdMatch}
                        nameA={nameOf(thirdMatch.aId)}
                        nameB={nameOf(thirdMatch.bId)}
                        entryA={state.entries.find((e) => e.id === thirdMatch.aId)}
                        entryB={state.entries.find((e) => e.id === thirdMatch.bId)}
                        activePlayerNames={activePlayerNames}
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

          {/* Cột kéo thả VĐV vào nhánh KO - Bật/tắt linh hoạt & Phân chia theo từng bảng */}
          {showManualSeeding && (
            <div className="lg:col-span-3 panel p-3.5 rounded-2xl">
              <div className="flex items-center justify-between border-b border-line/10 pb-2">
                <p className="eyebrow">Xếp thủ công vào nhánh</p>
                <button
                  type="button"
                  className="text-[11px] font-bold text-line/50 hover:text-ink cursor-pointer"
                  onClick={() => setShowManualSeeding(false)}
                >
                  ✕ Đóng
                </button>
              </div>
              <p className="mt-1 text-xs text-line/60">
                Kéo tên đội bên dưới thả trực tiếp vào ô trong nhánh để tự chọn cặp đấu (phân chia theo từng bảng).
              </p>

              <div className="mt-3 max-h-[560px] space-y-3 overflow-y-auto pr-1">
                {(ev.groups.length
                  ? ev.groups
                  : [{ name: "Tất cả đội", entryIds: entries.map((e) => e.id) }]
                ).map((g) => {
                  const groupEntries = entries.filter((e) => g.entryIds.includes(e.id));
                  const c = groupColor(g.name);
                  return (
                    <div key={g.name} className="rounded-xl border border-line/15 bg-card/60 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span
                          className="font-head text-xs font-bold px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: c.bg, color: c.text }}
                        >
                          {g.name} ({groupEntries.length} đội)
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {groupEntries.map((e: Entry) => (
                          <div
                            key={e.id}
                            draggable
                            onDragStart={() => setDragEntry(e.id)}
                            className="cursor-grab truncate rounded-lg px-2.5 py-2 text-xs font-semibold shadow-xs ring-1 ring-line/10 active:cursor-grabbing bg-secondary text-line/80 hover:bg-secondary/80 flex items-center justify-between transition"
                          >
                            <PlayerNameDisplay
                              entry={e}
                              fallback={entryName(e)}
                              activePlayerNames={activePlayerNames}
                            />
                            <span className="text-[10px] text-line/40 shrink-0 ml-1">Kéo vào nhánh</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
