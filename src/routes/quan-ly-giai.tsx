import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import * as React from "react";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
// @ts-ignore
import XLSX from "xlsx-js-style";
import {
  addMinutes,
  autoScheduleTimeline,
  buildTimeline,
  computeIndividualStandings,
  computeStandings,
  createDefaultMlpSubMatches,
  entryName,
  generateAlphabeticalKnockout,
  generateEmptyKnockout,
  generateGroupMatches,
  generateKnockout,
  generateNextRotatingDoublesRound,
  generateTotalKoKnockout,
  getActiveEntryIds,
  getActivePlayerNames,
  getActiveRefereeSession,
  getLiveTournamentIdFromUrl,
  getMatchEntryA,
  getMatchEntryB,
  getRefereeCollaboratorForUser,
  getRotatingMatchesPerPlayer,
  groupColor,
  groupTag,
  isMatchAssignedToRefereeUser,
  isRotatingDoubles,
  propagateKnockout,
  RANKING_CRITERIA_LABELS,
  MLP_RANKING_CRITERIA_LABELS,
  useTournament,
  type Entry,
  type IndividualStandingRow,
  type Match,
  type PlayerSlot,
  type TeamSubMatch,
  type TEvent,
} from "@/lib/tournament-store";
import { ShareCollaboratorsModal } from "@/components/ShareCollaboratorsModal";
import {
  listSharedTournaments,
  deduplicateTournamentArchives,
  type UserTournamentArchiveItem,
} from "@/lib/firebase";

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
  compact,
  large,
  readOnly,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  isWinning?: boolean;
  compact?: boolean;
  large?: boolean;
  readOnly?: boolean;
}) {
  const [raw, setRaw] = useState(value === null ? "" : String(value));
  useEffect(() => {
    setRaw(value === null ? "" : String(value));
  }, [value]);

  const boxClass = `${
    large
      ? "w-14 px-2 py-1.5 text-base sm:text-lg"
      : compact
        ? "w-9 px-1 py-0.5 text-xs"
        : "w-11 px-1 py-1 text-sm"
  } rounded-md text-center font-bold ring-1 shrink-0 ${
    isWinning
      ? "bg-[#e44c11]/15 text-[#e44c11] ring-2 ring-[#e44c11] font-bold shadow-xs"
      : "bg-card text-ink ring-line/20"
  }`;

  if (readOnly) {
    return (
      <div
        className={`${boxClass} select-none`}
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {value === null ? "—" : value}
      </div>
    );
  }

  return (
    <input
      className={`${boxClass} outline-none focus:ring-2 focus:ring-[#e44c11] transition-all`}
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
  compactWidth,
}: {
  value?: string;
  referees: string[];
  onSelect: (r: string) => void;
  onAddReferee?: (r: string) => void;
  onClearReferees?: () => void;
  compactWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value || "");
  const triggerRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    setText(value || "");
  }, [value]);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuWidth = Math.max(200, rect.width);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));

    if (spaceBelow < 230 && rect.top > 230) {
      setDropdownStyle({
        position: "fixed",
        left: `${left}px`,
        bottom: `${window.innerHeight - rect.top + 4}px`,
        width: `${menuWidth}px`,
        zIndex: 9999,
      });
    } else {
      setDropdownStyle({
        position: "fixed",
        left: `${left}px`,
        top: `${rect.bottom + 4}px`,
        width: `${menuWidth}px`,
        zIndex: 9999,
      });
    }
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open]);

  const commit = (name: string) => {
    const trimmed = name.trim();
    onSelect(trimmed);
    if (trimmed && onAddReferee && !referees.includes(trimmed)) {
      onAddReferee(trimmed);
    }
  };

  return (
    <div ref={triggerRef} className="relative inline-block text-left">
      <div className="flex items-center rounded-md bg-card ring-1 ring-line/20 focus-within:ring-accent">
        <input
          type="text"
          className={`${
            compactWidth ? "w-[68px]" : "w-24"
          } px-1.5 py-0.5 text-[11px] outline-none bg-transparent truncate`}
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
          className="px-1 text-[10px] text-line/50 hover:text-ink cursor-pointer shrink-0"
          onClick={() => setOpen((prev) => !prev)}
        >
          ▾
        </button>
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
            <div
              style={{ ...dropdownStyle, fontFamily: "'Be Vietnam Pro', 'Space Grotesk', sans-serif" }}
              className="max-h-60 overflow-y-auto rounded-xl border border-line/25 bg-card p-1.5 shadow-2xl ring-1 ring-black/10 text-xs"
            >
              <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold text-line/60 uppercase tracking-wider border-b border-line/10 mb-1">
                <span>Danh sách trọng tài</span>
                {referees.length > 0 && onClearReferees && (
                  <button
                    type="button"
                    className="text-red-500 hover:text-red-700 cursor-pointer font-semibold text-[10px] normal-case"
                    onMouseDown={(e) => {
                      e.preventDefault();
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
                <div
                  className="px-2 py-2 text-[11px] font-normal leading-relaxed text-line/60"
                  style={{ fontFamily: "'Be Vietnam Pro', 'Space Grotesk', sans-serif" }}
                >
                  Chưa có trọng tài. Nhập tên để ghi nhớ cho giải này.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {referees.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-accent/15 transition truncate cursor-pointer flex items-center justify-between ${
                        r === value ? "font-bold text-accent bg-accent/10" : "text-ink"
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setText(r);
                        commit(r);
                        setOpen(false);
                      }}
                    >
                      <span className="truncate">{r}</span>
                      {r === value && <span className="text-[10px] text-accent shrink-0 ml-1">✓</span>}
                    </button>
                  ))}
                </div>
              )}
              {text.trim() && !referees.includes(text.trim()) && (
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-accent font-bold hover:bg-accent/15 transition border-t border-line/10 mt-1 cursor-pointer"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(text);
                    setOpen(false);
                  }}
                >
                  + Thêm "{text.trim()}"
                </button>
              )}
            </div>
          </>,
          document.body,
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
      className={`text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded flex items-center gap-1 shadow-2xs shrink-0 select-none ${
        onReset ? "cursor-pointer" : ""
      }`}
      style={{ fontFamily: "'Courier New', Courier, monospace" }}
      title={onReset ? "Bấm để khởi động lại đồng hồ từ 00:00" : undefined}
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
  isMatchDone = false,
  truncate = true,
}: {
  entry?: Entry;
  fallback: string;
  activePlayerNames: Set<string>;
  isWinning?: boolean;
  isMatchLive?: boolean;
  isMatchDone?: boolean;
  truncate?: boolean;
}) {
  const isWithdrawn = Boolean(entry?.withdrawn);

  const isNameActive = (rawName: string) => {
    if (isMatchDone) return false;
    const clean = rawName.trim().toLowerCase();
    if (!clean) return false;
    if (activePlayerNames.has(clean)) return true;
    const base = clean.split(/\s*-\s*|\s*\/\s*/)[0]?.trim();
    if (base && activePlayerNames.has(base)) return true;
    return false;
  };

  if (entry && entry.teamName && entry.teamName.trim()) {
    const teamClean = entry.teamName.trim();
    const isTeamLive =
      !isMatchDone &&
      (Boolean(isMatchLive) ||
        isNameActive(teamClean) ||
        entry.players.some((p) => p.name.trim() && isNameActive(p.name)));
    return (
      <span
        className={`${truncate ? "truncate" : "break-words leading-tight"} ${
          isWithdrawn
            ? "line-through text-line/40 font-normal"
            : isTeamLive
              ? "font-medium text-red-600 dark:text-red-400"
              : isWinning
                ? "font-bold text-[#e44c11]"
                : "font-normal text-[#0a3320]"
        } inline-flex items-center gap-1`}
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        <span>{teamClean}</span>
        {isWithdrawn && (
          <span className="no-underline rounded bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300 text-[9px] font-bold px-1 py-0.2 border border-red-300 shrink-0">
            Bỏ cuộc
          </span>
        )}
      </span>
    );
  }

  if (!entry || entry.players.length === 0) {
    const parts = (fallback || "").split("/").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      return (
        <span
          className={
            truncate
              ? "truncate inline-flex items-center gap-1"
              : "inline-flex flex-wrap items-center gap-0.5 break-words leading-tight"
          }
        >
          {parts.map((pName, idx) => {
            const isLive = !isMatchDone && (Boolean(isMatchLive) || isNameActive(pName));
            return (
              <span key={idx} className={truncate ? "inline-flex items-center shrink-0" : "inline-flex items-center"}>
                {idx > 0 && (
                  <span className={truncate ? "text-line/40 mx-1" : "text-[#6b7280] font-bold mx-1"}>/</span>
                )}
                <span
                  className={`${
                    isLive
                      ? "text-red-600 dark:text-red-400 font-bold"
                      : isWinning
                        ? "font-bold text-[#e44c11]"
                        : truncate
                          ? "text-ink/85 font-medium"
                          : "text-[#111827] font-bold"
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

    const isLive = !isMatchDone && (Boolean(isMatchLive) || isNameActive(fallback || ""));
    return (
      <span
        className={`${truncate ? "truncate" : "break-words leading-tight"} ${
          isLive
            ? "text-red-600 dark:text-red-400 font-bold"
            : isWinning
              ? "font-bold text-[#e44c11]"
              : truncate
                ? "text-ink/85 font-medium"
                : "text-[#111827] font-bold"
        }`}
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {fallback || "Chưa xếp"}
      </span>
    );
  }

  return (
    <span
      className={
        truncate
          ? "truncate inline-flex items-center gap-1"
          : "inline-flex flex-wrap items-center gap-0.5 break-words leading-tight"
      }
    >
      {entry.players.map((p, idx) => {
        const pName = p.name.trim();
        if (!pName) return null;
        const isLive = !isMatchDone && (Boolean(isMatchLive) || isNameActive(pName));
        return (
          <span key={idx} className={truncate ? "inline-flex items-center shrink-0" : "inline-flex items-center"}>
            {idx > 0 && (
              <span className={truncate ? "text-line/40 mx-1" : "text-[#6b7280] font-bold mx-1"}>/</span>
            )}
            <span
              className={`${
                isWithdrawn
                  ? "line-through text-line/40 font-medium"
                  : isLive
                    ? "text-red-600 dark:text-red-400 font-bold"
                    : isWinning
                      ? "font-bold text-[#e44c11]"
                      : truncate
                        ? "text-ink/85 font-medium"
                        : "text-[#111827] font-bold"
              }`}
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              title={isLive ? `${pName} đang thi đấu!` : undefined}
            >
              {pName}
            </span>
          </span>
        );
      })}
      {isWithdrawn && (
        <span className="no-underline rounded bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300 text-[9px] font-bold px-1 py-0.2 border border-red-300 shrink-0 ml-1">
          Bỏ cuộc
        </span>
      )}
    </span>
  );
}

function PlayerSelectBox({
  value,
  onChange,
  placeholder,
  players,
  align = "left",
  dropdownAlign,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  players: PlayerSlot[];
  align?: "left" | "right";
  dropdownAlign?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const validPlayers = players.filter((p) => p.name && p.name.trim());
  const actualDropdownAlign = dropdownAlign || (align === "right" ? "right" : "left");

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <div className="flex items-center rounded-lg border border-line/20 bg-paper focus-within:ring-1 focus-within:ring-accent overflow-hidden shadow-2xs">
        <input
          type="text"
          className={`w-full bg-transparent text-xs !py-1.5 !px-2 font-semibold text-ink outline-none ${
            align === "right" ? "text-right" : "text-left"
          }`}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {validPlayers.length > 0 && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setOpen((v) => !v)}
            className="px-1.5 py-1.5 text-line/45 hover:text-ink hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer text-[10px] shrink-0 border-l border-line/10 transition"
            title="Chọn từ danh sách thành viên đội"
          >
            ▼
          </button>
        )}
      </div>

      {open && validPlayers.length > 0 && (
        <div
          className={`absolute z-30 mt-1 max-h-48 w-44 max-w-[calc(100vw-3rem)] overflow-y-auto rounded-lg border border-line/20 bg-card p-1 shadow-lg backdrop-blur-md ${
            actualDropdownAlign === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="text-[10px] font-bold text-line/50 px-2 py-0.5 uppercase">
            Chọn thành viên:
          </div>
          {validPlayers.map((p, idx) => {
            const role =
              idx === 0
                ? "Nam 1"
                : idx === 1
                  ? "Nam 2"
                  : idx === 2
                    ? "Nữ 1"
                    : "Nữ 2";
            return (
              <button
                key={idx}
                type="button"
                className="w-full rounded-md px-2 py-1 text-left text-xs font-semibold hover:bg-accent/15 hover:text-accent cursor-pointer flex items-center justify-between"
                onClick={() => {
                  onChange(p.name);
                  setOpen(false);
                }}
              >
                <span className="truncate">{p.name}</span>
                <span className="text-[10px] text-line/50 shrink-0 ml-1 font-normal">
                  ({role})
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeamMatchModal({
  match,
  entries,
  ev,
  onClose,
  onSave,
  isReadOnly = false,
}: {
  match: Match;
  entries: Entry[];
  ev?: TEvent | null;
  onClose: () => void;
  onSave: (
    updatedSubMatches: TeamSubMatch[],
    overallScoreA: number,
    overallScoreB: number,
    done: boolean,
  ) => void;
  isReadOnly?: boolean;
}) {
  const entryA = getMatchEntryA(match, entries);
  const entryB = getMatchEntryB(match, entries);
  const nameA = entryName(entryA) || "Đội A";
  const nameB = entryName(entryB) || "Đội B";

  const initialSubMatches = useMemo(() => {
    if (match.teamSubMatches && match.teamSubMatches.length > 0) {
      return match.teamSubMatches;
    }
    return createDefaultMlpSubMatches(entryA, entryB, ev?.hasDreambreaker !== false);
  }, [match, entryA, entryB, ev?.hasDreambreaker]);

  const [subMatches, setSubMatches] = useState<TeamSubMatch[]>(initialSubMatches);
  useEffect(() => {
    if (isReadOnly) {
      setSubMatches(initialSubMatches);
    }
  }, [isReadOnly, initialSubMatches]);
  const [draggedMatchIdx, setDraggedMatchIdx] = useState<number | null>(null);
  const [dragOverMatchIdx, setDragOverMatchIdx] = useState<number | null>(null);

  const getSubPlayerSlots = (raw?: string): [string, string] => {
    if (!raw) return ["", ""];
    const parts = raw.split(/\s*&\s*|\s*\/\s*/);
    return [parts[0]?.trim() || "", parts[1]?.trim() || ""];
  };

  const handleDragReorder = (fromIdx: number, toIdx: number) => {
    if (
      fromIdx === toIdx ||
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= subMatches.length ||
      toIdx >= subMatches.length
    )
      return;
    const next = [...subMatches];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setSubMatches(next);
    syncMatch(next);
  };

  const syncMatch = (nextSubMatches: TeamSubMatch[]) => {
    let a = 0;
    let b = 0;
    const first4 = nextSubMatches.slice(0, 4);
    first4.forEach((sm) => {
      if (sm.scoreA !== null && sm.scoreB !== null) {
        if (sm.scoreA > sm.scoreB) a++;
        else if (sm.scoreB > sm.scoreA) b++;
      }
    });

    const is22 = a === 2 && b === 2;
    const db = nextSubMatches[4];
    if (is22 && db && db.scoreA !== null && db.scoreB !== null) {
      if (db.scoreA > db.scoreB) a++;
      else if (db.scoreB > db.scoreA) b++;
    }

    const completed =
      (a >= 3 || b >= 3) ||
      (a === 2 && b === 2 && db && db.scoreA !== null && db.scoreB !== null && db.scoreA !== db.scoreB);

    onSave(nextSubMatches, a, b, completed);
  };

  const updateSubScore = (
    id: string,
    key: "scoreA" | "scoreB",
    val: number | null,
  ) => {
    setSubMatches((prev) => {
      const next = prev.map((sm) => (sm.id === id ? { ...sm, [key]: val } : sm));
      syncMatch(next);
      return next;
    });
  };

  const updateSubPlayers = (
    id: string,
    key: "teamAPlayers" | "teamBPlayers",
    val: string,
  ) => {
    setSubMatches((prev) => {
      const next = prev.map((sm) => (sm.id === id ? { ...sm, [key]: val } : sm));
      syncMatch(next);
      return next;
    });
  };

  const updateSubPlayerSlot = (
    matchId: string,
    team: "A" | "B",
    slotIdx: 0 | 1,
    newVal: string,
  ) => {
    setSubMatches((prev) => {
      const next = prev.map((sm) => {
        if (sm.id !== matchId) return sm;
        const key = team === "A" ? "teamAPlayers" : "teamBPlayers";
        const [p1, p2] = getSubPlayerSlots(sm[key]);
        const updated1 = slotIdx === 0 ? newVal : p1;
        const updated2 = slotIdx === 1 ? newVal : p2;
        const combined =
          updated1 && updated2
            ? `${updated1} & ${updated2}`
            : updated1 || updated2 || "";
        return { ...sm, [key]: combined };
      });
      syncMatch(next);
      return next;
    });
  };

  const moveSubMatch = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= subMatches.length) return;
    const next = [...subMatches];
    const [moved] = next.splice(idx, 1);
    next.splice(targetIdx, 0, moved);
    setSubMatches(next);
    syncMatch(next);
  };

  // Tính tổng số trận thắng
  const { winsA, winsB, isTied22 } = useMemo(() => {
    let a = 0;
    let b = 0;
    // Kiểm tra 4 trận đôi đầu tiên
    const first4 = subMatches.slice(0, 4);
    first4.forEach((sm) => {
      if (sm.scoreA !== null && sm.scoreB !== null) {
        if (sm.scoreA > sm.scoreB) a++;
        else if (sm.scoreB > sm.scoreA) b++;
      }
    });

    const is22 = a === 2 && b === 2;

    // Trận thứ 5: Dreambreaker (nếu có đấu và hòa 2-2)
    const db = subMatches[4];
    if (is22 && db && db.scoreA !== null && db.scoreB !== null) {
      if (db.scoreA > db.scoreB) a++;
      else if (db.scoreB > db.scoreA) b++;
    }

    return { winsA: a, winsB: b, isTied22: is22 };
  }, [subMatches]);

  const handleReset = () => {
    const defaultSubs = createDefaultMlpSubMatches(entryA, entryB, ev?.hasDreambreaker !== false);
    setSubMatches(defaultSubs);
    syncMatch(defaultSubs);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-3xl rounded-2xl border border-line/20 shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header trên nền beige với thông tin vòng/bảng/sân ở giữa */}
        <div className="bg-paper p-4 border-b border-line/15 shrink-0 relative">
          {/* Nút đóng ở góc trên bên phải */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3.5 top-3.5 size-7 rounded-full bg-line/10 hover:bg-line/20 text-line/70 hover:text-ink flex items-center justify-center font-bold text-sm cursor-pointer transition"
            title="Đóng"
          >
            ✕
          </button>

          {/* Dòng chữ Vòng, Bảng, Sân ở giữa, cùng màu chữ với tên đội */}
          <div
            className="text-center font-head text-xs sm:text-sm font-bold text-[#0a3320] tracking-wide mb-3"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Vòng {match.round} • {match.groupName ? (match.groupName.startsWith("Bảng") ? match.groupName : `Bảng ${match.groupName}`) : "Vòng bảng"} • Sân: {match.court || "Chưa chọn sân"}
          </div>

          {/* Bảng tổng tỉ số */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-right min-w-0">
              <div
                className="font-head text-sm sm:text-base font-extrabold text-[#0a3320] truncate"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {nameA}
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-card border border-line/20 shadow-xs shrink-0">
              <span
                className={`font-mono text-2xl sm:text-3xl font-black ${
                  winsA > winsB ? "text-[#ea580c]" : "text-ink"
                }`}
              >
                {winsA}
              </span>
              <span className="text-line/40 font-bold text-lg">—</span>
              <span
                className={`font-mono text-2xl sm:text-3xl font-black ${
                  winsB > winsA ? "text-[#ea580c]" : "text-ink"
                }`}
              >
                {winsB}
              </span>
            </div>

            <div className="flex-1 text-left min-w-0">
              <div
                className="font-head text-sm sm:text-base font-extrabold text-[#0a3320] truncate"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {nameB}
              </div>
            </div>
          </div>
        </div>

        {/* Trạng thái nhắc nhở khi hòa 2-2 */}
        {isTied22 && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs font-bold text-amber-800 animate-pulse shrink-0">
            ⚡ Hai đội đang hòa 2 — 2! Kích hoạt trận Dreambreaker™ để phân định thắng bại!
          </div>
        )}

        {/* Danh sách các trận con */}
        <div className="p-3 sm:p-5 space-y-3.5 overflow-y-auto overflow-x-hidden flex-1">
          {subMatches.map((sm, idx) => {
            const isDreambreaker = sm.type === "dreambreaker";
            const aWon = sm.scoreA !== null && sm.scoreB !== null && sm.scoreA > sm.scoreB;
            const bWon = sm.scoreA !== null && sm.scoreB !== null && sm.scoreB > sm.scoreA;

            const [pA1, pA2] = getSubPlayerSlots(sm.teamAPlayers);
            const [pB1, pB2] = getSubPlayerSlots(sm.teamBPlayers);
            const rawTitle = sm.title
              .replace(/^Trận\s*\d+\s*:\s*/i, "")
              .replace(/\s*\(ĐƠN LUÂN PHIÊN HÒA 2-2\)/gi, "")
              .replace(/\s*\(Đơn luân phiên hòa 2-2\)/gi, "")
              .trim();

            const isDragging = draggedMatchIdx === idx;
            const isDragOver = dragOverMatchIdx === idx && draggedMatchIdx !== idx;

            return (
              <div
                key={sm.id}
                data-submatch-idx={idx}
                draggable={!isReadOnly}
                onDragStart={(e) => {
                  if (isReadOnly) {
                    e.preventDefault();
                    return;
                  }
                  const target = e.target as HTMLElement;
                  if (target.closest("input, select, button")) {
                    e.preventDefault();
                    return;
                  }
                  setDraggedMatchIdx(idx);
                  e.dataTransfer.setData("text/plain", String(idx));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (isReadOnly) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverMatchIdx !== idx) setDragOverMatchIdx(idx);
                }}
                onDragLeave={() => {
                  if (isReadOnly) return;
                  if (dragOverMatchIdx === idx) setDragOverMatchIdx(null);
                }}
                onDrop={(e) => {
                  if (isReadOnly) return;
                  e.preventDefault();
                  if (draggedMatchIdx !== null && draggedMatchIdx !== idx) {
                    handleDragReorder(draggedMatchIdx, idx);
                  }
                  setDraggedMatchIdx(null);
                  setDragOverMatchIdx(null);
                }}
                onDragEnd={() => {
                  setDraggedMatchIdx(null);
                  setDragOverMatchIdx(null);
                }}
                className={`p-3.5 rounded-xl border transition-all ${
                  isDragging
                    ? "opacity-50 border-dashed border-[#ea580c] ring-2 ring-orange-300/40 scale-[0.98]"
                    : isDragOver
                      ? "border-[#ea580c] ring-2 ring-[#ea580c]/50 bg-orange-50/20 scale-[1.01]"
                      : isDreambreaker
                        ? isTied22
                          ? "bg-amber-50/70 border-amber-300 ring-2 ring-amber-400/30"
                          : "bg-paper/60 border-line/15 opacity-75"
                        : isReadOnly
                          ? "bg-card border-line/20 shadow-2xs"
                          : "bg-card border-line/20 shadow-2xs hover:border-[#ea580c]/30 cursor-grab active:cursor-grabbing"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {!isReadOnly && (
                      <div
                        style={{ touchAction: "none" }}
                        onTouchStart={() => {
                          setDraggedMatchIdx(idx);
                          setDragOverMatchIdx(idx);
                          try { navigator.vibrate?.(15); } catch {}
                        }}
                        onTouchMove={(e) => {
                          const touch = e.touches[0];
                          if (!touch) return;
                          const target = document.elementFromPoint(touch.clientX, touch.clientY);
                          const itemEl = target?.closest("[data-submatch-idx]");
                          if (itemEl) {
                            const targetIdx = Number(itemEl.getAttribute("data-submatch-idx"));
                            if (!isNaN(targetIdx) && targetIdx !== dragOverMatchIdx) {
                              setDragOverMatchIdx(targetIdx);
                            }
                          }
                        }}
                        onTouchEnd={() => {
                          if (draggedMatchIdx !== null && dragOverMatchIdx !== null && draggedMatchIdx !== dragOverMatchIdx) {
                            handleDragReorder(draggedMatchIdx, dragOverMatchIdx);
                            try { navigator.vibrate?.(25); } catch {}
                          }
                          setDraggedMatchIdx(null);
                          setDragOverMatchIdx(null);
                        }}
                        className="flex items-center justify-center p-1.5 text-line/40 hover:text-[#ea580c] active:text-[#ea580c] cursor-grab active:cursor-grabbing transition select-none"
                        title="Kéo thả lên/xuống để đổi thứ tự trận đấu"
                      >
                        <svg className="size-4 fill-current pointer-events-none" viewBox="0 0 24 24">
                          <circle cx="8.5" cy="6" r="1.5" />
                          <circle cx="15.5" cy="6" r="1.5" />
                          <circle cx="8.5" cy="12" r="1.5" />
                          <circle cx="15.5" cy="12" r="1.5" />
                          <circle cx="8.5" cy="18" r="1.5" />
                          <circle cx="15.5" cy="18" r="1.5" />
                        </svg>
                      </div>
                    )}

                    <span className="font-head text-xs font-bold uppercase tracking-wider text-ink">
                      Trận {idx + 1}: {rawTitle}
                    </span>
                    {isDreambreaker && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-orange-100 text-[#ea580c] border border-orange-200">
                        Tiebreaker 21 điểm
                      </span>
                    )}
                  </div>
                </div>

                {isReadOnly ? (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <div className="sm:col-span-5 text-xs font-semibold text-ink sm:text-right truncate">
                      {isDreambreaker
                        ? sm.teamAPlayers || nameA
                        : [pA1, pA2].filter(Boolean).join(" & ") || "—"}
                    </div>
                    <div className="sm:col-span-2 flex items-center justify-center gap-1.5">
                      <span
                        className={`w-11 text-center font-mono font-bold text-sm py-1 rounded-lg border ${
                          aWon
                            ? "bg-orange-50 border-orange-400 text-[#ea580c] font-black"
                            : "bg-paper border-line/30 text-ink"
                        }`}
                      >
                        {sm.scoreA ?? "—"}
                      </span>
                      <span className="text-line/40 font-bold text-xs">:</span>
                      <span
                        className={`w-11 text-center font-mono font-bold text-sm py-1 rounded-lg border ${
                          bWon
                            ? "bg-orange-50 border-orange-400 text-[#ea580c] font-black"
                            : "bg-paper border-line/30 text-ink"
                        }`}
                      >
                        {sm.scoreB ?? "—"}
                      </span>
                    </div>
                    <div className="sm:col-span-5 text-xs font-semibold text-ink sm:text-left truncate">
                      {isDreambreaker
                        ? sm.teamBPlayers || nameB
                        : [pB1, pB2].filter(Boolean).join(" & ") || "—"}
                    </div>
                  </div>
                ) : isDreambreaker ? (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <div className="sm:col-span-5">
                      <PlayerSelectBox
                        value={sm.teamAPlayers || nameA}
                        onChange={(val) => updateSubPlayers(sm.id, "teamAPlayers", val)}
                        placeholder="VĐV hoặc Tên đội"
                        players={entryA?.players || []}
                        align="right"
                        dropdownAlign="left"
                      />
                    </div>

                    <div className="sm:col-span-2 flex items-center justify-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={sm.scoreA ?? ""}
                        placeholder="0"
                        onChange={(e) =>
                          updateSubScore(
                            sm.id,
                            "scoreA",
                            e.target.value === "" ? null : Number(e.target.value),
                          )
                        }
                        className={`w-11 text-center font-mono font-bold text-sm !py-1 rounded-lg border outline-none ${
                          aWon
                            ? "bg-orange-50 border-orange-400 text-[#ea580c] font-black ring-1 ring-orange-300/40"
                            : "bg-paper border-line/30 text-ink"
                        }`}
                      />
                      <span className="text-line/40 font-bold text-xs">:</span>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={sm.scoreB ?? ""}
                        placeholder="0"
                        onChange={(e) =>
                          updateSubScore(
                            sm.id,
                            "scoreB",
                            e.target.value === "" ? null : Number(e.target.value),
                          )
                        }
                        className={`w-11 text-center font-mono font-bold text-sm !py-1 rounded-lg border outline-none ${
                          bWon
                            ? "bg-orange-50 border-orange-400 text-[#ea580c] font-black ring-1 ring-orange-300/40"
                            : "bg-paper border-line/30 text-ink"
                        }`}
                      />
                    </div>

                    <div className="sm:col-span-5">
                      <PlayerSelectBox
                        value={sm.teamBPlayers || nameB}
                        onChange={(val) => updateSubPlayers(sm.id, "teamBPlayers", val)}
                        placeholder="VĐV hoặc Tên đội"
                        players={entryB?.players || []}
                        align="left"
                        dropdownAlign="right"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    {/* Cặp Đội A: 2 ô VĐV */}
                    <div className="sm:col-span-5 flex items-center gap-1.5">
                      <PlayerSelectBox
                        value={pA1}
                        onChange={(val) => updateSubPlayerSlot(sm.id, "A", 0, val)}
                        placeholder="VĐV 1"
                        players={entryA?.players || []}
                        align="right"
                        dropdownAlign="left"
                      />
                      <span className="text-line/40 text-xs font-bold shrink-0">&</span>
                      <PlayerSelectBox
                        value={pA2}
                        onChange={(val) => updateSubPlayerSlot(sm.id, "A", 1, val)}
                        placeholder="VĐV 2"
                        players={entryA?.players || []}
                        align="right"
                        dropdownAlign="left"
                      />
                    </div>

                    {/* Ô nhập điểm */}
                    <div className="sm:col-span-2 flex items-center justify-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={sm.scoreA ?? ""}
                        placeholder="0"
                        onChange={(e) =>
                          updateSubScore(
                            sm.id,
                            "scoreA",
                            e.target.value === "" ? null : Number(e.target.value),
                          )
                        }
                        className={`w-11 text-center font-mono font-bold text-sm !py-1 rounded-lg border outline-none ${
                          aWon
                            ? "bg-orange-50 border-orange-400 text-[#ea580c] font-black ring-1 ring-orange-300/40"
                            : "bg-paper border-line/30 text-ink"
                        }`}
                      />
                      <span className="text-line/40 font-bold text-xs">:</span>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={sm.scoreB ?? ""}
                        placeholder="0"
                        onChange={(e) =>
                          updateSubScore(
                            sm.id,
                            "scoreB",
                            e.target.value === "" ? null : Number(e.target.value),
                          )
                        }
                        className={`w-11 text-center font-mono font-bold text-sm !py-1 rounded-lg border outline-none ${
                          bWon
                            ? "bg-orange-50 border-orange-400 text-[#ea580c] font-black ring-1 ring-orange-300/40"
                            : "bg-paper border-line/30 text-ink"
                        }`}
                      />
                    </div>

                    {/* Cặp Đội B: 2 ô VĐV */}
                    <div className="sm:col-span-5 flex items-center gap-1.5">
                      <PlayerSelectBox
                        value={pB1}
                        onChange={(val) => updateSubPlayerSlot(sm.id, "B", 0, val)}
                        placeholder="VĐV 1"
                        players={entryB?.players || []}
                        align="left"
                        dropdownAlign="right"
                      />
                      <span className="text-line/40 text-xs font-bold shrink-0">&</span>
                      <PlayerSelectBox
                        value={pB2}
                        onChange={(val) => updateSubPlayerSlot(sm.id, "B", 1, val)}
                        placeholder="VĐV 2"
                        players={entryB?.players || []}
                        align="left"
                        dropdownAlign="right"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer controls: tự động lưu liên tục khi thay đổi */}
        <div className="bg-paper p-3.5 border-t border-line/15 shrink-0 flex items-center justify-between gap-2">
          {!isReadOnly ? (
            <button
              type="button"
              onClick={handleReset}
              className="btn-ghost text-xs font-semibold !py-1.5 px-3 cursor-pointer"
            >
              ↺ Đặt lại tất cả trận con
            </button>
          ) : (
            <span className="text-xs text-line/60 font-medium">Chế độ xem trực tiếp</span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="btn-ghost text-xs font-bold !py-1.5 px-4 cursor-pointer border border-line/20 rounded-lg hover:bg-black/5"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

function KoSlotPickerModal({
  pickerSlot,
  matches,
  entries,
  ev,
  groupMatches,
  onClose,
  onAssignTeam,
  onClearSlot,
}: {
  pickerSlot: { matchId: string; side: "aId" | "bId" };
  matches: Match[];
  entries: Entry[];
  ev: TEvent;
  groupMatches: Match[];
  onClose: () => void;
  onAssignTeam: (entryId: string, seedBadge?: string) => void;
  onClearSlot: () => void;
}) {
  const [search, setSearch] = useState("");
  const targetMatch = matches.find((m) => m.id === pickerSlot.matchId);
  const targetSide = pickerSlot.side;
  const currentEntryId = targetSide === "aId" ? targetMatch?.aId : targetMatch?.bId;
  const currentPlaceholder =
    targetSide === "aId" ? targetMatch?.customPlaceholderA : targetMatch?.customPlaceholderB;
  const currentEntry = entries.find((e) => e.id === currentEntryId);

  // Nhóm các đội theo bảng và tính thứ hạng BXH hiện tại
  const cleanGName = (name: string, idx: number) =>
    name.replace(/^Bảng\s+/i, "").trim().toUpperCase() || String.fromCharCode(65 + idx);

  const groupsWithStandings = useMemo(() => {
    return ev.groups.map((g, idx) => {
      const gMatches = groupMatches.filter((m) => m.groupName === g.name);
      const standings = computeStandings(g.entryIds, gMatches, ev);
      const key = cleanGName(g.name, idx);
      return {
        group: g,
        key,
        standings,
      };
    });
  }, [ev, groupMatches]);

  // Kiểm tra đội đang nằm ở trận KO nào
  const getPlacedInfo = (entryId: string) => {
    const found = matches.find(
      (m) =>
        m.eventId === ev.id &&
        m.stage === "ko" &&
        (m.aId === entryId || m.bId === entryId),
    );
    if (!found) return null;
    const isThisSlot =
      found.id === targetMatch?.id &&
      ((targetSide === "aId" && found.aId === entryId) ||
        (targetSide === "bId" && found.bId === entryId));
    return {
      match: found,
      isThisSlot,
      label: found.koRound || `Vòng ${found.round}`,
    };
  };

  const filteredGroups = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return groupsWithStandings;
    return groupsWithStandings
      .map((gw) => ({
        ...gw,
        standings: gw.standings.filter((row) => {
          const ent = entries.find((e) => e.id === row.entryId);
          if (!ent) return false;
          const eName = entryName(ent).toLowerCase();
          const pNames = ent.players.map((p) => p.name.toLowerCase()).join(" ");
          return eName.includes(s) || pNames.includes(s) || gw.key.toLowerCase().includes(s);
        }),
      }))
      .filter((gw) => gw.standings.length > 0);
  }, [groupsWithStandings, entries, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full sm:max-w-lg max-h-[88vh] rounded-t-2xl sm:rounded-2xl bg-card p-4 sm:p-5 shadow-2xl ring-1 ring-line/20 flex flex-col border border-line/10 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-150">
        {/* Header */}
        <div className="relative flex items-center justify-center border-b border-line/10 pb-3">
          <h3 className="font-head text-lg font-extrabold uppercase tracking-tight text-[#e44c11] text-center">
            {targetMatch?.koRound || `Vòng ${targetMatch?.round}`}
          </h3>
          <button
            type="button"
            className="absolute right-0 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-line/50 hover:bg-muted hover:text-ink cursor-pointer"
            onClick={onClose}
            aria-label="Đóng"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Hiện trạng & Nút Xóa ô */}
        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-secondary/50 p-2.5 border border-line/10">
          <div className="min-w-0 flex-1 text-xs">
            <span className="text-line/60">Đang ở ô này: </span>
            {currentEntry ? (
              <span className="font-bold text-ink">{entryName(currentEntry)}</span>
            ) : currentPlaceholder ? (
              <span className="font-bold text-amber-600">
                Chờ ({currentPlaceholder.replace(/[*#]/g, "")})
              </span>
            ) : (
              <span className="italic text-line/50">Trống (chưa xếp)</span>
            )}
          </div>
          {(currentEntryId || currentPlaceholder) && (
            <button
              type="button"
              className="shrink-0 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer border border-red-500/20"
              onClick={onClearSlot}
            >
              🗑️ Xóa / Để trống
            </button>
          )}
        </div>

        {/* Tìm kiếm */}
        <div className="mt-3">
          <input
            type="text"
            className="field w-full text-xs !py-2"
            placeholder="🔍 Tìm tên VĐV hoặc tên đội..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Danh sách cuộn */}
        <div className="mt-3 flex-1 overflow-y-auto space-y-4 pr-1 max-h-[50vh]">
          {/* Danh sách các đội theo từng bảng */}
          {filteredGroups.map((gw) => {
            const rawGroupName = gw.group.name.trim();
            const cleanExpected = `Bảng ${gw.key}`.toLowerCase();
            const showRawName =
              rawGroupName &&
              rawGroupName.toLowerCase() !== cleanExpected &&
              rawGroupName.toLowerCase() !== gw.key.toLowerCase();
            return (
            <div key={gw.group.name} className="rounded-xl border border-line/15 bg-card overflow-hidden">
              <div className="bg-secondary/70 px-3 py-1.5 font-bold text-xs flex items-center justify-between border-b border-line/10">
                <span className="text-ink">
                  Bảng {gw.key}
                  {showRawName ? ` (${rawGroupName})` : ""}
                </span>
                <span className="text-[11px] text-line/60">{gw.standings.length} đội</span>
              </div>
              <div className="divide-y divide-line/10">
                {gw.standings.map((row, rIdx) => {
                  const entry = entries.find((e) => e.id === row.entryId);
                  if (!entry) return null;
                  const rankBadge = `${rIdx + 1}${gw.key}`;
                  const placed = getPlacedInfo(entry.id);

                  return (
                    <div
                      key={entry.id}
                      className={`flex items-center justify-between gap-2.5 p-2.5 transition-colors ${
                        placed?.isThisSlot ? "bg-accent/10" : "hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-bold border ${
                            rIdx === 0
                              ? "bg-orange-500/15 text-[#e44c11] border-orange-500/30"
                              : rIdx === 1
                                ? "bg-[#0a3320]/15 text-[#0a3320] border-[#0a3320]/30"
                                : "bg-[#cedbea] text-[#001592] border-[#001592]/30"
                          }`}
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          {rankBadge}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-ink break-words leading-tight">
                            {entryName(entry)}
                          </div>
                          {entry.players.length > 0 && entry.teamName && (
                            <div className="text-[11px] text-line/60 truncate">
                              {entry.players.map((p) => p.name).join(" / ")}
                            </div>
                          )}
                          {placed && !placed.isThisSlot && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                              📍 Đang ở: {placed.label}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {placed?.isThisSlot ? (
                          <span className="rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-1 text-[11px] font-bold border border-emerald-500/30">
                            ✓ Đang ở ô này
                          </span>
                        ) : placed ? (
                          <button
                            type="button"
                            className="rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-200 px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer border border-amber-500/30"
                            onClick={() => onAssignTeam(entry.id, rankBadge)}
                          >
                            ⇄ Đổi chỗ vào đây
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="px-2 py-1 text-2xl font-bold leading-none text-[#e44c11] hover:opacity-75 transition-opacity cursor-pointer"
                            onClick={() => onAssignTeam(entry.id, rankBadge)}
                            title="Chọn xếp vào"
                            aria-label="Chọn xếp vào"
                          >
                            +
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-end border-t border-line/10 pt-3">
          <button
            type="button"
            className="btn-ghost text-xs !py-1.5 !px-4 cursor-pointer"
            onClick={onClose}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
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
  onViewReview?: (match: Match) => void;
  onDurationChange?: (mins: number, recordHistory?: boolean) => void;
  onOffsetChange?: (offset: number, recordHistory?: boolean) => void;
  onMoveHorizontal?: (newSlot: number, newOffset: number, recordHistory?: boolean) => void;
  onDropOnMatch?: (targetMatchId: string) => void;
  hasConflict?: boolean;
  compact?: boolean | undefined;
  colWidth?: number;
  rowHeight?: number;
  slotMinutes?: number;
  isTeamMode?: boolean;
  onManageTeamMatch?: (m: Match) => void;
  isReadOnly?: boolean;
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
  onViewReview,
  onDurationChange,
  onOffsetChange,
  onMoveHorizontal,
  onDropOnMatch,
  hasConflict,
  compact,
  colWidth = 210,
  rowHeight = 128,
  slotMinutes = 30,
  isTeamMode,
  onManageTeamMatch,
  isReadOnly = false,
}: CardProps) {
  const c = groupColor(m.groupName);
  const aWin = m.scoreA !== null && m.scoreB !== null && m.scoreA > m.scoreB;
  const bWin = m.scoreA !== null && m.scoreB !== null && m.scoreB > m.scoreA;
  const hasNote = Boolean(m.note || m.live?.note);

  const isDone = m.status === "done" || (m.scoreA !== null && m.scoreB !== null);

  const isRoundRobin =
    !m.groupName ||
    m.groupName.toLowerCase().includes("vòng tròn") ||
    m.groupName === "rr" ||
    m.groupName.toLowerCase().includes("toàn thể");

  const displayTag =
    m.stage === "ko"
      ? groupTag(m.groupName)
      : isRoundRobin
        ? `V${m.round}`
        : `${groupTag(m.groupName)} · V${m.round}`;

  const isUltraCompact = compact && rowHeight < 75;
  const isMidCompact = compact && rowHeight >= 75 && rowHeight < 100;

  return (
    <div
      className={`group relative rounded-xl transition-all select-none flex flex-col justify-between box-border ${
        compact ? `${isReadOnly ? "" : "cursor-grab active:cursor-grabbing "}overflow-hidden` : "ring-1"
      } ${
        compact ? (isUltraCompact ? "p-1" : isMidCompact ? "p-1" : "p-1.5") : "p-2.5"
      } ${
        hasConflict
          ? compact
            ? "border-2 border-red-500 shadow-sm"
            : "ring-1 ring-red-500 border border-red-500 shadow-sm"
          : m.status === "live"
            ? compact
              ? "border-2 border-red-500 shadow-md bg-red-50/70 dark:bg-red-950/20"
              : "ring-2 ring-red-500 shadow-md bg-red-50/70 dark:bg-red-950/20"
            : compact
              ? "border border-line/15"
              : "ring-line/15"
      }`}
      style={{
        backgroundColor: m.status === "live" ? undefined : m.status === "done" ? "var(--muted)" : c.bg,
        height: compact ? "100%" : undefined,
        maxHeight: compact ? "100%" : undefined,
      }}
      title={compact && !isReadOnly ? "Nắm giữ thẻ trận đấu để kéo thả sang sân khác hoặc đổi giờ thi đấu" : undefined}
    >
      <div className="flex items-center justify-between gap-1 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shrink-0"
            style={{ backgroundColor: c.dot, color: "white", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {displayTag}
          </span>
          {(entryA?.withdrawn || entryB?.withdrawn) && (
            <span
              className="rounded bg-red-600 px-1 py-0.2 text-[9px] font-bold text-white shrink-0 shadow-2xs"
              title="Trận đấu bị hủy kết quả do có vận động viên bỏ cuộc"
            >
              🚫 Đã hủy (Bỏ cuộc)
            </span>
          )}
          {hasConflict && (
            <span className="rounded bg-red-600 px-1 py-0.2 text-[9px] font-bold text-white shrink-0">
              Trùng giờ
            </span>
          )}
          {compact ? (
            m.referee ? (
              <span
                className="text-[10px] font-medium text-line/60 truncate"
                title={`Trọng tài: ${m.referee}`}
              >
                {m.referee}
              </span>
            ) : null
          ) : (m.court || (isReadOnly && m.referee)) ? (
            <span className="text-[10px] font-medium text-line/60 truncate">
              {[m.court, isReadOnly ? m.referee : ""].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {m.status === "live" && (
            <span className="flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white animate-pulse">
              <span className="size-1.5 rounded-full bg-white animate-ping" />
              Đang đấu
            </span>
          )}
          {m.status === "done" && (
            <span className="text-[10px] font-bold text-[#0a3320]">
              Đã xong
            </span>
          )}
          {m.status === "pending" && (
            <span className="text-[10px] font-medium text-line/50">Chờ</span>
          )}

          {compact && !isReadOnly && onRemoveFromTimeline && (
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

      <div className={compact ? "mt-1 space-y-1 min-h-0" : "mt-2 space-y-1.5"}>
        <div className="flex items-center justify-between gap-2">
          <div className={`flex items-center gap-1 min-w-0 flex-1 ${compact ? "text-xs" : ""}`}>
            <PlayerNameDisplay
              entry={entryA}
              fallback={nameA}
              activePlayerNames={activePlayerNames}
              isWinning={aWin}
              isMatchLive={!isDone && m.status === "live"}
              isMatchDone={isDone}
            />
          </div>
          <ScoreBox
            value={m.status === "live" && m.live ? (m.live.a ?? 0) : m.scoreA}
            onCommit={(v) => onScore("scoreA", v)}
            isWinning={aWin}
            compact={compact}
            readOnly={isReadOnly}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className={`flex items-center gap-1 min-w-0 flex-1 ${compact ? "text-xs" : ""}`}>
            <PlayerNameDisplay
              entry={entryB}
              fallback={nameB}
              activePlayerNames={activePlayerNames}
              isWinning={bWin}
              isMatchLive={!isDone && m.status === "live"}
              isMatchDone={isDone}
            />
          </div>
          <ScoreBox
            value={m.status === "live" && m.live ? (m.live.b ?? 0) : m.scoreB}
            onCommit={(v) => onScore("scoreB", v)}
            isWinning={bWin}
            compact={compact}
            readOnly={isReadOnly}
          />
        </div>
      </div>

      {/* Hành động dưới thẻ */}
      {isReadOnly ? (
        isTeamMode || (!compact && hasNote) ? (
          <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 border-t border-line/10 pt-1.5 text-[10px]">
            {!compact && hasNote && onViewNote && (
              <button
                type="button"
                className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-300 dark:bg-amber-950/30 dark:text-amber-400 cursor-pointer"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                onClick={() => onViewNote(m.note || m.live?.note || "")}
              >
                📝 Ghi chú
              </button>
            )}
            {isTeamMode && (
              <button
                type="button"
                onClick={() => onManageTeamMatch?.(m)}
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                className="btn-accent !px-2.5 !py-0.5 text-[10px] flex items-center justify-center whitespace-nowrap font-bold cursor-pointer shrink-0 shadow-2xs"
              >
                Các Trận Con
              </button>
            )}
          </div>
        ) : null
      ) : compact ? (
        /* Trên Timeline: thanh thao tác hiển thị rõ chữ bắt đầu và chấm điểm */
        rowHeight >= 65 ? (
          <div className="mt-1 flex items-center justify-between gap-1 border-t border-line/10 pt-1 text-[10px] shrink-0">
            <div className="flex items-center gap-1 shrink-0">
              {m.status === "done" ? (
                <button
                  className="btn-ghost !px-1.5 !py-0.5 text-[10px] whitespace-nowrap cursor-pointer"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  onClick={onReset}
                >
                  ↺ Lại
                </button>
              ) : (
                <button
                  className={`btn-ghost !px-1.5 !py-0.5 text-[10px] whitespace-nowrap cursor-pointer ${
                    m.status === "live" ? "text-red-600 font-bold" : ""
                  }`}
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  onClick={() => onStatus(m.status === "live" ? "pending" : "live")}
                >
                  {m.status === "live" ? "⏸ Tạm dừng" : "▶ Bắt đầu"}
                </button>
              )}
            </div>
            {isTeamMode ? (
              <button
                type="button"
                onClick={() => onManageTeamMatch?.(m)}
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                className="btn-accent !px-2 !py-0.5 text-[10px] flex items-center justify-center whitespace-nowrap font-bold cursor-pointer shrink-0 shadow-2xs"
                title="Quản lý và chấm điểm các trận con"
              >
                Các Trận Con
              </button>
            ) : (
              <div className="flex items-center gap-1 shrink-0">
                <Link
                  to="/cham-diem/$matchId"
                  params={{ matchId: m.id } as any}
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  className="btn-ghost !px-1.5 !py-0.5 text-[10px] flex items-center gap-0.5 whitespace-nowrap font-medium cursor-pointer shrink-0"
                >
                  ⚡ Chấm điểm
                </Link>
                {m.status === "done" && onViewReview && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewReview(m);
                    }}
                    title="Xem lịch sử chấm điểm & chữ ký VĐV"
                    aria-label="Xem lịch sử chấm điểm và chữ ký VĐV"
                    className="btn-ghost !px-1.5 !py-0.5 text-[10px] flex items-center justify-center text-[#0a3320] cursor-pointer shrink-0"
                  >
                    <svg
                      className="size-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <path d="M8 13h8" />
                      <path d="M8 17h5" />
                    </svg>
                  </button>
                )}
              </div>
            )}
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
                className="btn-ghost !px-2 !py-1 text-[11px] min-w-[96px] justify-center text-center shrink-0 cursor-pointer"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                onClick={onReset}
              >
                ↺ Bắt đầu lại
              </button>
            ) : (
              <button
                className={`btn-ghost !px-2 !py-1 text-[11px] min-w-[96px] justify-center text-center shrink-0 cursor-pointer ${
                  m.status === "live" ? "text-red-600 font-bold" : ""
                }`}
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                onClick={() => onStatus(m.status === "live" ? "pending" : "live")}
              >
                {m.status === "live" ? "⏸ Tạm dừng" : "▶ Bắt đầu"}
              </button>
            )}
            {isTeamMode ? (
              <button
                type="button"
                onClick={() => onManageTeamMatch?.(m)}
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                className="btn-accent !px-3 !py-1 text-[11px] flex items-center justify-center font-bold shadow-2xs cursor-pointer shrink-0"
                title="Quản lý và chấm điểm các trận đấu con"
              >
                Các Trận Con
              </button>
            ) : (
              <div className="flex items-center gap-1 shrink-0">
                <Link
                  to="/cham-diem/$matchId"
                  params={{ matchId: m.id } as any}
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  className="btn-ghost !px-2 !py-1 text-[11px] flex items-center gap-1"
                >
                  ⚡ Chấm điểm
                </Link>
                {m.status === "done" && onViewReview && (
                  <button
                    type="button"
                    onClick={() => onViewReview(m)}
                    title="Xem lại lịch sử chấm điểm & chữ ký VĐV"
                    aria-label="Xem lại lịch sử chấm điểm và chữ ký VĐV"
                    className="btn-ghost !px-2 !py-1 text-[11px] flex items-center justify-center text-[#0a3320] cursor-pointer"
                  >
                    <svg
                      className="size-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <path d="M8 13h8" />
                      <path d="M8 17h5" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cạnh phải nắm kéo trực tiếp để kéo dãn / thu gọn thời lượng (Direct Drag-to-Resize Handle) */}
      {compact && !isReadOnly && onDurationChange && (
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
                  const newW = Math.max(36, Math.round((newDur / slotMins) * (colWidth || 210) - 9));
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
  isFinal = false,
  onScore,
  onStatus,
  onReset,
  onDropTeam,
  onClearTeam,
  onStartDragTeam,
  onViewNote,
  onViewReview,
  referees = [],
  onReferee,
  onAddReferee,
  onClearReferees,
  onSelectTeamSlot,
  isReadOnly = false,
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
  isFinal?: boolean;
  onScore: (k: "scoreA" | "scoreB", v: number | null) => void;
  onStatus: (s: Match["status"]) => void;
  onReset: () => void;
  onDropTeam: (side: "aId" | "bId") => void;
  onClearTeam?: (side: "aId" | "bId") => void;
  onStartDragTeam?: (side: "aId" | "bId") => void;
  onViewNote?: (note: string) => void;
  onViewReview?: (match: Match) => void;
  referees?: string[];
  onReferee?: (r: string) => void;
  onAddReferee?: (r: string) => void;
  onClearReferees?: () => void;
  onSelectTeamSlot?: (side: "aId" | "bId") => void;
  isReadOnly?: boolean;
  key?: React.Key;
}) {
  const effectiveLocked = isKoLocked || isReadOnly;
  const aWin = m.scoreA !== null && m.scoreB !== null && m.scoreA > m.scoreB;
  const bWin = m.scoreA !== null && m.scoreB !== null && m.scoreB > m.scoreA;
  const isDone = m.status === "done" || (m.scoreA !== null && m.scoreB !== null);
  const hasNote = Boolean(m.note || m.live?.note);

  const formatSeed = (str?: string | null) => {
    if (!str) return null;
    const clean = str.trim();
    if (!clean || /^Hạt\s*giống\s*\d+$/i.test(clean)) return null;
    if (/^bye$/i.test(clean)) return "BYE";
    return clean
      .replace(/[*#]/g, "")
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
    // Đội Hạng Ba bảng / Hạt giống 3 (ví dụ 3C, 3A, 3B): màu xanh navy trên nền xanh nhạt (#001592 trên #cedbea)
    if (
      s.startsWith("3") ||
      s.includes("ba") ||
      /^iii\b/i.test(s) ||
      /seed\s*3\b/i.test(s) ||
      /hạt\s*giống\s*3\b/i.test(s)
    ) {
      return "bg-[#cedbea] text-[#001592] dark:bg-[#cedbea]/30 dark:text-[#88a8ff] font-bold border border-[#001592]/30";
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
    } ${!isDone && live ? "bg-red-50/50 text-red-600 font-bold" : ""} ${
      isConflict ? "bg-red-100/90 dark:bg-red-950/50 text-red-900 dark:text-red-100 ring-1 ring-red-500 rounded-md my-0.5" : ""
    }`;

  // Kiểu viền frame trận vòng loại trực tiếp:
  // - Trận có suất BYE: viền màu cam (#e44c11), nét đứt 1.2px
  // - Trận đấu bình thường: viền màu cam (#e44c11), nét liền 1.2px
  const matchFrameBorder = hasRoundConflict
    ? "border-2 border-solid border-red-500 ring-2 ring-red-500 bg-red-50/60 dark:bg-red-950/30 shadow-md"
    : m.status === "live"
      ? "border-2 border-solid border-red-500 ring-2 ring-red-500 shadow-md bg-card"
      : isFinal
        ? "border-2 border-solid border-amber-500 ring-2 ring-amber-500/35 shadow-md bg-card"
        : isByeMatch
          ? "border-[1.2px] border-dashed border-[#e44c11]"
          : "border-[1.2px] border-solid border-[#e44c11]";

  return (
    <div
      className={`relative rounded-xl ${matchFrameBorder} bg-card shadow-xs transition-all ${
        isFinal ? "scale-[1.03] shadow-md my-1" : ""
      }`}
      style={{ borderWidth: isFinal ? "2px" : "1.2px" }}
    >
      <div
        className={`flex items-center justify-between border-b ${
          isFinal
            ? "px-3 py-1.5 text-xs font-black rounded-t-xl bg-amber-500/20 text-amber-900 dark:text-amber-100 border-amber-500/30"
            : "px-2 py-1 text-[10px] font-semibold rounded-t-xl"
        } ${
          hasRoundConflict
            ? "border-red-300 bg-red-100/90 text-red-900 dark:bg-red-900/40 dark:text-red-200"
            : !isFinal ? "border-line/15 bg-secondary/40 text-line/70" : ""
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-bold flex items-center gap-1.5 shrink-0" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {isFinal ? "🏆 CHUNG KẾT" : m.koRound || `Vòng ${m.round}`}
          </span>
          {isReadOnly && (m.court || m.referee) && (
            <span className="text-[10px] font-medium text-line/60 truncate">
              {[m.court, m.referee].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
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
            !effectiveLocked ? "cursor-pointer hover:border-accent/60 hover:bg-muted/40 transition-colors" : ""
          } ${
            !effectiveLocked && m.aId ? "active:cursor-grabbing" : ""
          }`}
          onClick={() => {
            if (effectiveLocked) return;
            onSelectTeamSlot?.("aId");
          }}
          draggable={!effectiveLocked && Boolean(m.aId || (seedA && !isByeA))}
          onDragStart={(e) => {
            if (effectiveLocked) return;
            e.stopPropagation();
            onStartDragTeam?.("aId");
          }}
          onDragOver={(e) => {
            if (!effectiveLocked) e.preventDefault();
          }}
          onDrop={(e) => {
            e.stopPropagation();
            if (!effectiveLocked) onDropTeam("aId");
          }}
          title={!effectiveLocked ? "Bấm vào để chọn đội xếp vào ô này (tiện lợi trên điện thoại), hoặc kéo thả để đổi chỗ" : undefined}
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
                isMatchLive={!isDone && m.status === "live"}
                isMatchDone={isDone}
                truncate={false}
              />
            )}
            {isConflictA && (
              <span className="shrink-0 text-[9px] font-extrabold text-red-600 bg-red-200/90 dark:bg-red-950 px-1 py-0.2 rounded border border-red-400 animate-pulse">
                ⚠️ Trùng đội
              </span>
            )}
            {!effectiveLocked && (m.aId || (seedA && !isByeA)) && onClearTeam && (
              <button
                type="button"
                className="opacity-0 group-hover/slot:opacity-100 hover:text-red-600 p-0.5 rounded text-line/40 hover:bg-red-50 dark:hover:bg-red-950/40 transition-opacity cursor-pointer shrink-0"
                title="Xóa đội / thứ hạng khỏi ô này"
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
          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
            {isByeA ? (
              <span className="text-line/40 font-mono text-xs px-2 select-none">-</span>
            ) : (
              <ScoreBox
                value={m.status === "live" && m.live ? (m.live.a ?? 0) : m.scoreA}
                onCommit={(v) => onScore("scoreA", v)}
                isWinning={aWin}
                large={isFinal}
                readOnly={isReadOnly}
              />
            )}
          </div>
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
            !effectiveLocked ? "cursor-pointer hover:border-accent/60 hover:bg-muted/40 transition-colors" : ""
          } ${
            !effectiveLocked && m.bId ? "active:cursor-grabbing" : ""
          }`}
          onClick={() => {
            if (effectiveLocked) return;
            onSelectTeamSlot?.("bId");
          }}
          draggable={!effectiveLocked && Boolean(m.bId || (seedB && !isByeB))}
          onDragStart={(e) => {
            if (effectiveLocked) return;
            e.stopPropagation();
            onStartDragTeam?.("bId");
          }}
          onDragOver={(e) => {
            if (!effectiveLocked) e.preventDefault();
          }}
          onDrop={(e) => {
            e.stopPropagation();
            if (!effectiveLocked) onDropTeam("bId");
          }}
          title={!effectiveLocked ? "Bấm vào để chọn đội xếp vào ô này (tiện lợi trên điện thoại), hoặc kéo thả để đổi chỗ" : undefined}
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
                isMatchLive={!isDone && m.status === "live"}
                isMatchDone={isDone}
                truncate={false}
              />
            )}
            {isConflictB && (
              <span className="shrink-0 text-[9px] font-extrabold text-red-600 bg-red-200/90 dark:bg-red-950 px-1 py-0.2 rounded border border-red-400 animate-pulse">
                ⚠️ Trùng đội
              </span>
            )}
            {!effectiveLocked && (m.bId || (seedB && !isByeB)) && onClearTeam && (
              <button
                type="button"
                className="opacity-0 group-hover/slot:opacity-100 hover:text-red-600 p-0.5 rounded text-line/40 hover:bg-red-50 dark:hover:bg-red-950/40 transition-opacity cursor-pointer shrink-0"
                title="Xóa đội / thứ hạng khỏi ô này"
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
          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
            {isByeB ? (
              <span className="text-line/40 font-mono text-xs px-2 select-none">-</span>
            ) : (
              <ScoreBox
                value={m.status === "live" && m.live ? (m.live.b ?? 0) : m.scoreB}
                onCommit={(v) => onScore("scoreB", v)}
                isWinning={bWin}
                large={isFinal}
                readOnly={isReadOnly}
              />
            )}
          </div>
        </div>
      </div>

      {isReadOnly ? (
        (isByeA || isByeB) ? (
          <div className="flex items-center justify-end gap-1 bg-secondary/50 px-2 py-1 border-t border-line/10 rounded-b-xl text-[10px]">
            <span
              className="text-[10px] font-bold text-accent px-1.5 py-0.5 rounded bg-accent/10 whitespace-nowrap shrink-0"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Vào thẳng
            </span>
          </div>
        ) : null
      ) : (
        <div className="flex items-center justify-between gap-1 bg-secondary/50 px-1.5 py-1.5 border-t border-line/10 rounded-b-xl whitespace-nowrap">
          <div className="flex items-center gap-1 shrink-0">
            {m.status === "done" ? (
              <button
                className="btn-ghost !px-1.5 !py-0.5 text-[10px] whitespace-nowrap shrink-0 cursor-pointer"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                onClick={onReset}
              >
                ↺ Lại
              </button>
            ) : (
              <button
                disabled={isByeA || isByeB}
                className={`btn-ghost !px-1.5 !py-0.5 text-[10px] whitespace-nowrap shrink-0 cursor-pointer ${
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
            <div className="shrink-0">
              <RefereeSelector
                value={m.referee}
                referees={referees}
                onSelect={onReferee}
                onAddReferee={onAddReferee}
                onClearReferees={onClearReferees}
                compactWidth
              />
            </div>
          )}

          {isByeA || isByeB ? (
            <span
              className="text-[10px] font-bold text-accent px-1.5 py-0.5 rounded bg-accent/10 whitespace-nowrap shrink-0"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Vào thẳng
            </span>
          ) : (
            <div className="flex items-center gap-1 shrink-0">
              <Link
                to="/cham-diem/$matchId"
                params={{ matchId: m.id } as any}
                className="btn-ghost !px-1.5 !py-0.5 text-[10px] flex items-center gap-0.5 whitespace-nowrap shrink-0"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                ⚡ Chấm điểm
              </Link>
              {m.status === "done" && onViewReview && (
                <button
                  type="button"
                  onClick={() => onViewReview(m)}
                  title="Xem lại lịch sử chấm điểm & chữ ký VĐV"
                  aria-label="Xem lại lịch sử chấm điểm và chữ ký VĐV"
                  className="btn-ghost !px-1.5 !py-0.5 text-[10px] flex items-center justify-center text-[#0a3320] cursor-pointer shrink-0"
                >
                  <svg
                    className="size-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <path d="M8 13h8" />
                    <path d="M8 17h5" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      )}
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
  const {
    state,
    update,
    updateEvent,
    updateMatch,
    setSelectedEventId,
    toggleKoLock,
    user,
    loadTournament,
    isReadOnly,
    currentRole,
    updateCollaborators,
  } = useTournament();
  const navigate = useNavigate();
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [isLoadingLive, setIsLoadingLive] = useState(() => Boolean(getLiveTournamentIdFromUrl()));
  const [sharedTournaments, setSharedTournaments] = useState<UserTournamentArchiveItem[]>([]);
  const [loadingShared, setLoadingShared] = useState(false);

  // Lắng nghe xem trực tiếp nếu URL có tham số ?live=
  useEffect(() => {
    if (typeof window === "undefined") return;
    const liveId = getLiveTournamentIdFromUrl();
    if (!liveId) {
      setIsLoadingLive(false);
      return;
    }

    let unsub: (() => void) | undefined;
    let mounted = true;
    import("@/lib/firebase").then(({ subscribeToPublicTournament, fetchPublicTournament }) => {
      // Nạp ngay tức thì bản mới nhất từ Firestore
      void fetchPublicTournament(liveId)
        .then((data) => {
          if (data?.stateJson) {
            try {
              const parsed = JSON.parse(data.stateJson);
              loadTournament(parsed, liveId);
            } catch (e) {
              console.error("Lỗi nạp giải đấu trực tiếp:", e);
            }
          }
        })
        .catch((e) => {
          console.error("Lỗi fetchPublicTournament:", e);
        })
        .finally(() => {
          if (mounted) setIsLoadingLive(false);
        });

      // Lắng nghe cập nhật thời gian thực
      unsub = subscribeToPublicTournament(liveId, (data) => {
        if (mounted) setIsLoadingLive(false);
        if (data?.stateJson) {
          try {
            const parsed = JSON.parse(data.stateJson);
            loadTournament(parsed, liveId);
          } catch (e) {
            console.error("Lỗi cập nhật giải đấu trực tiếp:", e);
          }
        }
      });
    });

    return () => {
      mounted = false;
      if (unsub) unsub();
    };
  }, [loadTournament]);

  // Tải danh sách giải đấu người dùng được mời tham gia (trọng tài / điều hành / chỉ xem)
  useEffect(() => {
    if (!user?.email || getLiveTournamentIdFromUrl()) {
      setSharedTournaments([]);
      return;
    }
    let active = true;
    setLoadingShared(true);
    listSharedTournaments(user.email)
      .then((list) => {
        if (active) {
          setSharedTournaments(deduplicateTournamentArchives(list, user.uid, user.email));
        }
      })
      .catch((err) => {
        console.error("Lỗi tải danh sách giải được mời:", err);
      })
      .finally(() => {
        if (active) setLoadingShared(false);
      });
    return () => {
      active = false;
    };
  }, [user?.email]);

  const mergedReferees = useMemo(() => {
    const base = Array.isArray(state.referees) ? state.referees : [];
    const fromCollabs = (state.collaborators || [])
      .filter((c) => c.role === "referee" && c.name?.trim())
      .map((c) => c.name!.trim());
    const seen = new Set<string>();
    const result: string[] = [];
    for (const r of [...base, ...fromCollabs]) {
      const clean = r.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(clean);
      }
    }
    return result;
  }, [state.referees, state.collaborators]);

  const activeRefSession = getActiveRefereeSession();

  const myRefereeCollab = useMemo(
    () => getRefereeCollaboratorForUser(state.collaborators, user?.email, activeRefSession?.token),
    [state.collaborators, user?.email, activeRefSession?.token],
  );

  const assignedMatches = useMemo(() => {
    if (currentRole !== "referee" || getLiveTournamentIdFromUrl()) return [];
    const matching = (state.matches || []).filter(
      (m) =>
        m.status !== "done" &&
        isMatchAssignedToRefereeUser(
          m,
          state.collaborators,
          user?.email,
          user?.displayName,
          activeRefSession?.token,
        ),
    );
    return matching.sort((a, b) => {
      if (a.status === "live" && b.status !== "live") return -1;
      if (b.status === "live" && a.status !== "live") return 1;
      return (a.round ?? 0) - (b.round ?? 0);
    });
  }, [currentRole, state.matches, state.collaborators, user?.email, user?.displayName, activeRefSession?.token]);

  const assignedMatch = useMemo(() => {
    return assignedMatches.find((m) => m.status === "live");
  }, [assignedMatches]);

  // Trọng tài chỉ tự động chuyển sang màn hình cài đặt chấm điểm khi người điều hành bấm Bắt đầu trận đấu (status === "live")
  useEffect(() => {
    if (currentRole !== "referee" || !assignedMatch || getLiveTournamentIdFromUrl()) return;
    void navigate({
      to: "/cham-diem/$matchId",
      params: { matchId: assignedMatch.id },
    });
  }, [currentRole, assignedMatch, navigate]);

  const handleSelectSharedTournament = (item: UserTournamentArchiveItem) => {
    try {
      const parsed = JSON.parse(item.stateJson);
      loadTournament(parsed, item.id);
      toast.success(`Đã mở giải "${item.name || "Chưa đặt tên"}"`);
    } catch (e) {
      console.error("Lỗi đọc dữ liệu giải đấu:", e);
      toast.error("Không thể mở giải đấu này.");
    }
  };

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

  // Modal xem ghi chú & lịch sử/chữ ký trận đấu
  const [viewNoteText, setViewNoteText] = useState<string | null>(null);
  const [reviewMatch, setReviewMatch] = useState<Match | null>(null);

  // Zoom timeline (infinite range slider + thu phóng toàn màn hình)
  const [colWidth, setColWidth] = useState(210);
  const [rowHeight, setRowHeight] = useState(145);
  const [timelineScale, setTimelineScale] = useState(1);
  const fullscreenPinchRef = useRef<{ dist: number; scale: number } | null>(null);

  // Xác nhận chỉnh sửa vòng bảng khi vòng KO đã bắt đầu
  const [confirmedGroupEdit, setConfirmedGroupEdit] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    setConfirmedGroupEdit(false);
  }, [activeId]);

  // Toggles for flexible screen space
  const [showStandings, setShowStandings] = useState(true);
  const [maximizeStandings, setMaximizeStandings] = useState(false);
  const [showQueue, setShowQueue] = useState(true);
  const [queueGroupBy, setQueueGroupBy] = useState<"round" | "group">("round");
  const [showManualSeeding, setShowManualSeeding] = useState(false);
  const [dragKoSlot, setDragKoSlot] = useState<{
    matchId: string;
    side: "aId" | "bId";
    entryId: string | null;
    placeholder?: string;
  } | null>(null);

  // Modal chọn đội xếp vào ô vòng loại trực tiếp (tiện dụng trên điện thoại / chạm để chọn)
  const [koSlotPicker, setKoSlotPicker] = useState<{
    matchId: string;
    side: "aId" | "bId";
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

  // Chế độ xem toàn màn hình Timeline
  const [isFullscreenTimeline, setIsFullscreenTimeline] = useState(false);

  // Modal xuất ảnh / PDF sơ đồ thi đấu vòng bảng
  const [isExportGroupModalOpen, setIsExportGroupModalOpen] = useState(false);
  const [includeScoresInExport, setIncludeScoresInExport] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const exportGroupScheduleRef = useRef<HTMLDivElement>(null);

  // Modal quản lý trận đấu Đồng đội (MLP Format)
  const [teamMatchToManage, setTeamMatchToManage] = useState<Match | null>(null);

  useEffect(() => {
    if (!isFullscreenTimeline && !isExportGroupModalOpen && !teamMatchToManage && !koSlotPicker && !reviewMatch) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreenTimeline(false);
        setIsExportGroupModalOpen(false);
        setTeamMatchToManage(null);
        setKoSlotPicker(null);
        setReviewMatch(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreenTimeline, isExportGroupModalOpen, teamMatchToManage, koSlotPicker, reviewMatch]);

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
    if (tab !== "timeline" || isReadOnly) return;
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
  const activeEntryIds = useMemo(
    () => getActiveEntryIds(state.matches),
    [state.matches],
  );
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

  const isTeamMode = ev?.mode === "dong_doi";

  // Thống kê phụ ưu tiên hàng đầu hiển thị ở bảng thu nhỏ (giữa diff, points_won_pct, game_diff)
  const primaryTeamStat = useMemo<"diff" | "points_won_pct" | "game_diff">(() => {
    const list = ev?.mlpRankingCriteria || ["points", "h2h", "game_diff", "diff", "points_won_pct", "draw"];
    for (const c of list) {
      if (c === "points_won_pct") return "points_won_pct";
      if (c === "diff") return "diff";
      if (c === "game_diff") return "game_diff";
    }
    return "diff";
  }, [ev?.mlpRankingCriteria]);

  // Thứ tự các cột thống kê khi phóng to bảng xếp hạng theo thiết lập của nội dung
  const mlpStatOrder = useMemo<Array<"game_diff" | "diff" | "points_won_pct">>(() => {
    const list = ev?.mlpRankingCriteria || ["points", "h2h", "game_diff", "diff", "points_won_pct", "draw"];
    return list.filter((c): c is "game_diff" | "diff" | "points_won_pct" =>
      c === "game_diff" || c === "diff" || c === "points_won_pct"
    );
  }, [ev?.mlpRankingCriteria]);

  const isActualByeMatch = (m?: Match) => {
    if (!m || m.stage !== "ko") return false;
    const pA = m.customPlaceholderA?.trim().toLowerCase();
    const pB = m.customPlaceholderB?.trim().toLowerCase();
    return pA === "bye" || pB === "bye";
  };

  const groupMatches = matches.filter((m) => m.stage === "group");
  const koMatches = matches.filter((m) => m.stage === "ko");

  const hasKoProgress = useMemo(() => {
    return koMatches.some(
      (m) => m.aId !== null || m.scoreA !== null || m.status === "done" || m.status === "live",
    );
  }, [koMatches]);

  // Kiểm tra vòng loại trực tiếp đã bắt đầu (có trận đang đấu, đã xong hoặc có điểm)
  const hasKoStarted = useMemo(() => {
    return koMatches.some(
      (m) => m.scoreA !== null || m.scoreB !== null || m.status === "done" || m.status === "live",
    );
  }, [koMatches]);

  const rankingCriteria = state.rankingCriteria || ["points", "diff", "h2h", "draw"];
  const withdrawnEntryIds = useMemo(() => {
    if (!ev) return new Set<string>();
    return new Set(state.entries.filter((e) => e.eventId === ev.id && e.withdrawn).map((e) => e.id));
  }, [state.entries, ev]);

  // Phát hiện các trận trùng giờ nhau trên cùng một sân để cảnh báo viền đỏ
  const conflictsSet = useMemo(() => {
    const set = new Set<string>();
    if (!ev) return set;
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
  }, [state.matches, state.slotMinutes, ev]);

  /* -------- Vòng bảng theo cột vòng -------- */
  const rounds = [...new Set(groupMatches.map((m) => m.round))].sort((a, b) => (a ?? 0) - (b ?? 0));

  const maxAllowedRotatingRounds = useMemo(() => {
    if (!ev) return 0;
    if (ev.randomRoundsCount && ev.randomRoundsCount > 0) {
      return ev.randomRoundsCount;
    }
    const activeCount = entries.filter((e) => !e.withdrawn).length;
    if (activeCount < 2) return 1;
    // N chẵn: N - 1 vòng; N lẻ: N vòng (do mỗi vòng có 1 người nghỉ bye)
    return activeCount % 2 === 0 ? activeCount - 1 : activeCount;
  }, [ev, entries]);

  const isRotatingRoundsCompleted = useMemo(() => {
    if (!isRotatingDoubles(ev)) return false;
    return rounds.length >= maxAllowedRotatingRounds;
  }, [ev, rounds.length, maxAllowedRotatingRounds]);

  const canDrawMoreRotatingRounds = useMemo(() => {
    if (!isRotatingDoubles(ev)) return false;
    return rounds.length > 0 && !isRotatingRoundsCompleted;
  }, [ev, rounds.length, isRotatingRoundsCompleted]);

  // Đếm số lượng vòng đã hoàn thành (tất cả các trận trong vòng đã nhập điểm xong)
  const completedRotatingRoundsCount = useMemo(() => {
    return rounds.filter((r) => {
      const rMatches = groupMatches.filter((m) => m.round === r);
      return (
        rMatches.length > 0 &&
        rMatches.every(
          (m) => m.status === "done" || (m.scoreA !== null && m.scoreB !== null),
        )
      );
    }).length;
  }, [rounds, groupMatches]);

  // Tự động phân chia các vòng thành nhiều hàng cân đối đẹp mắt (10 vòng -> 2 hàng x 5, 12 vòng -> 2 hàng x 6, 15 vòng -> 3 hàng x 5)
  const exportRoundRows = useMemo(() => {
    const n = rounds.length;
    if (n <= 6) return [rounds];
    let numRows = 2;
    if (n > 18) numRows = 4;
    else if (n > 12) numRows = 3;
    else numRows = 2;

    const rows: number[][] = [];
    let startIndex = 0;
    for (let r = 0; r < numRows; r++) {
      const remainingItems = n - startIndex;
      const remainingRows = numRows - r;
      const count = Math.ceil(remainingItems / remainingRows);
      rows.push(rounds.slice(startIndex, startIndex + count));
      startIndex += count;
    }
    return rows;
  }, [rounds]);

  /* -------- Timeline -------- */
  const timelinePrintRef = useRef<HTMLDivElement>(null);
  const dragGrabPxRef = useRef<number | null>(null);

  const safeCourts = state.courts || [];
  const timelineSource = tab === "timeline" ? matches : [];
  const grid = buildTimeline(timelineSource, safeCourts);

  // Hiển thị toàn bộ ngày hoặc khung giờ được người dùng chọn
  const [startH = 8, startM = 0] = (state.startTime || "08:00").split(":").map(Number);
  const startTotalMinutes = (startH % 24) * 60 + startM;
  const minutesUntilMidnight = Math.max(60, 24 * 60 - startTotalMinutes);
  const fullDaySlots = Math.ceil(minutesUntilMidnight / Math.max(5, state.slotMinutes || 30));

  const maxSlot = Math.max(
    1,
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

  // Khi toàn bộ vòng bảng hoàn thành, tự động điền tên đội vào các vị trí thứ hạng bảng (1A, 2B...) trong nhánh KO
  useEffect(() => {
    if (isReadOnly || !allGroupStageDone || !ev) return;
    const needsResolve = koMatches.some(
      (m) =>
        m.round === 1 &&
        ((m.customPlaceholderA && !m.aId && m.customPlaceholderA !== "BYE") ||
          (m.customPlaceholderB && !m.bId && m.customPlaceholderB !== "BYE")),
    );
    if (needsResolve) {
      const propagated = propagateKnockout(state.matches, ev.id, ev);
      const changed = propagated.some((m, idx) => {
        const orig = state.matches[idx];
        return orig && (m.aId !== orig.aId || m.bId !== orig.bId);
      });
      if (changed) {
        update({ matches: propagated });
      }
    }
  }, [isReadOnly, allGroupStageDone, ev, koMatches, state.matches, update]);

  // Trận chờ xếp lịch (chưa gán timeSlot, bỏ qua các trận miễn đấu BYE ở vòng KO)
  const unassignedMatches = useMemo(
    () => matches.filter((m) => m.timeSlot === undefined && !isActualByeMatch(m)),
    [matches],
  );

  // Nhóm các trận chờ theo vòng hoặc theo bảng tùy lựa chọn của người dùng
  const unassignedSections = useMemo(() => {
    const map = new Map<
      string,
      { stage: "group" | "ko"; round: number; sortOrder: number; label: string; matches: Match[] }
    >();

    if (queueGroupBy === "group") {
      const evGroupOrder = new Map<string, number>(
        (ev?.groups || []).map((g, idx) => [g.name, idx]),
      );

      unassignedMatches.forEach((m) => {
        let key = "";
        let label = "";
        let sortOrder = m.round ?? 1;

        if (m.stage === "ko") {
          if (m.slot === 99) {
            key = `ko-third-${m.round}`;
            label = m.koRound || "Tranh hạng 3";
            sortOrder = 10000 + ((m.round ?? 1) - 0.5);
          } else {
            key = `ko-${m.round}`;
            label = m.koRound || `Loại trực tiếp · Vòng ${m.round}`;
            sortOrder = 10000 + (m.round ?? 1);
          }
        } else {
          const rawGroup = m.groupName?.trim() || "";
          const isRoundRobin =
            !rawGroup || rawGroup.toLowerCase().includes("vòng tròn") || rawGroup === "rr";
          label = isRoundRobin ? "Vòng tròn" : rawGroup;
          key = `group-${label}`;
          const explicitIdx = evGroupOrder.get(rawGroup);
          sortOrder = explicitIdx !== undefined ? explicitIdx : 9000;
        }

        if (!map.has(key)) {
          map.set(key, {
            stage: m.stage,
            round: m.round ?? 1,
            sortOrder,
            label,
            matches: [],
          });
        }
        map.get(key)!.matches.push(m);
      });

      return Array.from(map.entries())
        .map(([key, data]) => ({
          key,
          stage: data.stage,
          round: data.round,
          sortOrder: data.sortOrder,
          label: data.label,
          matches: [...data.matches].sort((a, b) => (a.round ?? 0) - (b.round ?? 0)),
        }))
        .sort((a, b) => {
          if (a.stage !== b.stage) return a.stage === "group" ? -1 : 1;
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          return a.label.localeCompare(b.label, "vi", { numeric: true });
        });
    }

    unassignedMatches.forEach((m) => {
      let key = "";
      let label = "";
      let sortOrder = m.round ?? 1;
      if (m.stage === "ko") {
        if (m.slot === 99) {
          key = `ko-third-${m.round}`;
          label = m.koRound || "Tranh hạng 3";
          sortOrder = (m.round ?? 1) - 0.5;
        } else {
          key = `ko-${m.round}`;
          label = m.koRound || `Loại trực tiếp · Vòng ${m.round}`;
          sortOrder = m.round ?? 1;
        }
      } else {
        key = `round-${m.round}`;
        label = `Vòng ${m.round}`;
        sortOrder = m.round ?? 1;
      }
      if (!map.has(key)) {
        map.set(key, {
          stage: m.stage,
          round: m.round ?? 1,
          sortOrder,
          label,
          matches: [],
        });
      }
      map.get(key)!.matches.push(m);
    });

    return Array.from(map.entries())
      .map(([key, data]) => ({
        key,
        stage: data.stage,
        round: data.round,
        sortOrder: data.sortOrder,
        label: data.label,
        matches: data.matches,
      }))
      .sort((a, b) => {
        // Vòng bảng luôn hiển thị trước, loại trực tiếp tiếp theo
        if (a.stage !== b.stage) {
          return a.stage === "group" ? -1 : 1;
        }
        return a.sortOrder - b.sortOrder;
      });
  }, [unassignedMatches, queueGroupBy, ev?.groups]);

  /* Tính toán vị trí đường kẻ đỏ thời gian hiện tại */
  const diffMinutes = nowMinutes - startTotalMinutes;
  const isNowInGrid =
    diffMinutes >= 0 && diffMinutes <= slotIdxs.length * (state.slotMinutes || 30);
  const redLineOffsetPx = isNowInGrid
    ? 80 + (diffMinutes / (state.slotMinutes || 30)) * colWidth
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

  if (!ev) {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1
            className="font-head text-3xl font-extrabold uppercase tracking-tight text-[#0a3320] sm:text-4xl"
            style={{ color: "#0a3320" }}
          >
            Quản lý giải đấu
          </h1>
          <p className="mt-3 text-sm text-line/60">
            {isLoadingLive
              ? "Đang tải dữ liệu giải đấu trực tiếp..."
              : isReadOnly
                ? "Chưa có nội dung nào được công bố cho giải đấu này."
                : "Chưa có nội dung nào để điều hành."}
          </p>
          {!isReadOnly && currentRole !== "referee" && (
            <Link to="/noi-dung" className="btn-accent mt-4 inline-block">
              Tạo nội dung
            </Link>
          )}
        </div>

        {!isReadOnly && !getLiveTournamentIdFromUrl() && user?.email && (
          <div className="rounded-2xl border border-line/15 bg-card p-5 shadow-xs space-y-3">
            <h2 className="font-head text-sm font-bold uppercase tracking-wider text-[#0a3320]">
              Giải đấu bạn được mời tham gia
            </h2>
            {loadingShared ? (
              <p className="text-xs text-line/55">Đang kiểm tra các giải đấu được mời...</p>
            ) : sharedTournaments.length === 0 ? (
              <p className="text-xs text-line/55">
                Chưa có giải đấu nào mời email <strong>{user.email}</strong>.
              </p>
            ) : (
              <div className="space-y-2">
                {sharedTournaments.map((item) => {
                  const cleanEmail = user.email?.toLowerCase().trim();
                  const isRef = item.refereeEmails?.some((e) => e.toLowerCase().trim() === cleanEmail);
                  const isEd = item.editorEmails?.some((e) => e.toLowerCase().trim() === cleanEmail);
                  return (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/12 bg-paper/70 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-ink truncate">
                            {item.name || "Giải đấu chưa đặt tên"}
                          </span>
                          <span className="rounded bg-[#0a3320]/10 px-2 py-0.5 text-[10px] font-bold text-[#0a3320]">
                            {isRef ? "⚖️ Trọng tài" : isEd ? "✏️ Điều hành" : "👁️ Chỉ xem"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-line/60">
                          {item.date || "Chưa rõ ngày"} · {item.courtsCount} sân · {item.eventsCount} nội dung
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectSharedTournament(item)}
                        className="btn-accent text-xs !py-1.5"
                      >
                        {isRef ? "⚖️ Vào chấm điểm" : "Mở giải"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (currentRole === "referee" && !getLiveTournamentIdFromUrl()) {
    const refereeDisplayName =
      myRefereeCollab?.name?.trim() || user?.displayName?.trim() || user?.email || "Trọng tài";
    const assignedEvent = assignedMatch
      ? state.events.find((e) => e.id === assignedMatch.eventId)
      : undefined;
    const assignedTeamA = assignedMatch
      ? entryName(getMatchEntryA(assignedMatch, state.entries))
      : "";
    const assignedTeamB = assignedMatch
      ? entryName(getMatchEntryB(assignedMatch, state.entries))
      : "";

    return (
      <div className="mx-auto max-w-2xl py-4 sm:py-8 space-y-6">
        <div className="rounded-2xl border border-line/15 bg-card p-6 sm:p-8 shadow-sm">
          <div className="border-b border-line/10 pb-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
              ⚖️ Chế độ trọng tài
            </p>
            <h1
              className="mt-1 font-head text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-[#0a3320]"
              style={{ color: "#0a3320" }}
            >
              {assignedMatch ? "Đã có trận được phân công" : "Màn hình chờ phân công"}
            </h1>
          </div>

          {assignedMatch ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-accent">
                  {assignedEvent?.name || "Trận đấu"} · {assignedMatch.court || "Chưa gán sân"}
                </p>
                <p className="mt-1.5 font-head text-xl font-bold text-ink">
                  {assignedTeamA} <span className="text-line/40">vs</span> {assignedTeamB}
                </p>
                <p className="mt-1 text-xs text-line/65">
                  Đang tự động chuyển sang màn hình cài đặt chấm điểm...
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  void navigate({
                    to: "/cham-diem/$matchId",
                    params: { matchId: assignedMatch.id },
                  })
                }
                className="btn-accent w-full justify-center py-3 text-sm font-bold"
              >
                Vào cài đặt chấm điểm ngay
              </button>
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              <p className="text-sm leading-relaxed text-line/75">
                Xin chào <strong className="text-ink">{refereeDisplayName}</strong>. Khi chủ giải phân công tên trọng tài{" "}
                <strong className="text-[#0a3320]">
                  "{myRefereeCollab?.name?.trim() || refereeDisplayName}"
                </strong>{" "}
                vào một trận đấu trên sơ đồ quản lý giải, màn hình này sẽ tự động chuyển ngay sang phần cài đặt chấm điểm cho trận đó.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-line/10 pt-5">
                <div className="rounded-xl border border-line/12 bg-paper/70 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-line/50">
                    Tên trọng tài
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#0a3320]">
                    {myRefereeCollab?.name?.trim() || "Chưa đặt tên trọng tài"}
                  </p>
                </div>
                <div className="rounded-xl border border-line/12 bg-paper/70 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-line/50">
                    {user?.email ? "Email đăng nhập" : "Hình thức truy cập"}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink truncate">
                    {user?.email || "Link / Mã QR Trọng tài"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-line/15 bg-card p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-head text-sm font-bold uppercase tracking-wider text-[#0a3320]">
              Các trận đấu được phân công ({assignedMatches.length})
            </h2>
            <span className="text-[11px] text-line/55">
              Tự động mở khi người điều hành bấm Bắt đầu
            </span>
          </div>
          {assignedMatches.length === 0 ? (
            <div className="rounded-xl border border-line/12 bg-paper/60 px-4 py-4 text-center text-xs text-line/60">
              Chưa có trận đấu nào được phân công cho bạn.
            </div>
          ) : (
            <div className="space-y-2">
              {assignedMatches.map((m) => {
                const evItem = state.events.find((e) => e.id === m.eventId);
                const tA = entryName(getMatchEntryA(m, state.entries));
                const tB = entryName(getMatchEntryB(m, state.entries));
                const stageMeta =
                  m.stage === "ko"
                    ? m.koRound || `Loại trực tiếp V${m.round}`
                    : m.groupName
                      ? `${m.groupName} · V${m.round}`
                      : `Vòng ${m.round}`;
                const metaParts = [
                  evItem?.name || "Nội dung",
                  m.court || "Chưa gán sân",
                  stageMeta,
                ];
                const isLive = m.status === "live";
                return (
                  <div
                    key={m.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
                      isLive
                        ? "border-[#e44c11]/45 bg-[#e44c11]/[0.05]"
                        : "border-line/12 bg-paper/60"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink truncate">
                        {tA} <span className="text-line/40 font-normal">vs</span> {tB}
                      </p>
                      <p className="text-[11px] text-line/60 truncate">
                        {metaParts.join(" · ")}
                      </p>
                    </div>
                    {isLive ? (
                      <button
                        type="button"
                        onClick={() =>
                          void navigate({
                            to: "/cham-diem/$matchId",
                            params: { matchId: m.id },
                          })
                        }
                        className="shrink-0 rounded-lg bg-[#e44c11] px-3 py-1.5 text-xs font-bold text-white cursor-pointer hover:bg-[#e44c11]/90 transition"
                      >
                        Đang diễn ra
                      </button>
                    ) : (
                      <span className="shrink-0 rounded-lg border border-line/20 bg-card px-3 py-1.5 text-xs font-bold text-line/70">
                        Chờ bắt đầu
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const nameOf = (id: string | null) =>
    id ? entryName(entries.find((e) => e.id === id)) : "Chờ xác định";

  const resolveSideLabel = (m: Match, side: "aId" | "bId"): string => {
    if (side === "aId" && m.aEntryIds && m.aEntryIds.length === 2) {
      return entryName(getMatchEntryA(m, entries));
    }
    if (side === "bId" && m.bEntryIds && m.bEntryIds.length === 2) {
      return entryName(getMatchEntryB(m, entries));
    }
    const id = side === "aId" ? m.aId : m.bId;
    if (id) return entryName(entries.find((e) => e.id === id));
    const rawHolder = (side === "aId" ? m.customPlaceholderA : m.customPlaceholderB)?.trim() || "";
    if (rawHolder && !/^Hạt\s*giống\s*\d+$/i.test(rawHolder)) {
      return rawHolder;
    }
    if (m.stage === "ko" && m.round > 1) {
      const koList = matches.filter((x) => x.stage === "ko");
      if (m.slot === 99) {
        return side === "aId" ? "Thua BK 1" : "Thua BK 2";
      }
      const prevSlot = (m.slot ?? 0) * 2 + (side === "aId" ? 0 : 1);
      const prevMatch = koList.find(
        (x) => x.round === m.round - 1 && x.slot === prevSlot && x.slot !== 99,
      );
      if (prevMatch && isActualByeMatch(prevMatch)) {
        const advId = prevMatch.aId || prevMatch.bId;
        if (advId) return entryName(entries.find((e) => e.id === advId));
        const advHolder =
          prevMatch.customPlaceholderA?.trim().toLowerCase() !== "bye"
            ? prevMatch.customPlaceholderA?.trim()
            : prevMatch.customPlaceholderB?.trim();
        if (advHolder) return advHolder;
      }
      const prevTitle = prevMatch?.koRound || `V${m.round - 1}`;
      const shortPrev = prevTitle
        .replace(/^Tứ kết$/i, "TK")
        .replace(/^Bán kết$/i, "BK")
        .replace(/^Vòng\s+/i, "");
      return `Thắng ${shortPrev} ${prevSlot + 1}`;
    }
    return "Chờ xác định";
  };

  const isEntryActive = (id: string | null) => {
    if (!id) return false;
    if (activeEntryIds.has(id)) return true;
    const entry = state.entries.find((e) => e.id === id);
    return (
      entry?.players.some((p) => {
        const clean = p.name.trim().toLowerCase();
        return Boolean(clean && activePlayerNames.has(clean));
      }) ?? false
    );
  };

  const toggleWithdrawn = (entryId: string) => {
    const entry = state.entries.find((e) => e.id === entryId);
    if (!entry) return;
    const isW = Boolean(entry.withdrawn);
    if (!isW) {
      setConfirmModal({
        title: "⚠️ Xác nhận đánh dấu bỏ cuộc",
        message: `Bạn có chắc chắn muốn đánh dấu "${entryName(entry)}" bỏ cuộc?\n\nToàn bộ kết quả các trận thi đấu trước đó của VĐV/đội này sẽ bị HỦY BỎ (không tính điểm, hiệu số cho cả 2 bên trên bảng xếp hạng), và VĐV này sẽ không được xếp vào các vòng tiếp theo.`,
        confirmText: "Xác nhận bỏ cuộc",
        cancelText: "Hủy bỏ",
        isDestructive: true,
        onConfirm: () => {
          update({
            entries: state.entries.map((e) => (e.id === entryId ? { ...e, withdrawn: true } : e)),
          });
          setConfirmModal(null);
          toast.warning(`Đã đánh dấu ${entryName(entry)} bỏ cuộc. Kết quả trước đó đã bị hủy trên BXH.`);
        },
      });
    } else {
      update({
        entries: state.entries.map((e) => (e.id === entryId ? { ...e, withdrawn: false } : e)),
      });
      toast.success(`Đã khôi phục thi đấu cho ${entryName(entry)}.`);
    }
  };

  const handleNextRotatingRound = () => {
    const activeCount = entries.filter((e) => !e.withdrawn).length;
    const fullRounds = activeCount < 2 ? 1 : activeCount % 2 === 0 ? activeCount - 1 : activeCount;
    const maxAllowedRounds =
      ev.randomRoundsCount && ev.randomRoundsCount > 0
        ? ev.randomRoundsCount
        : fullRounds;
    const currentRoundsCount = new Set(groupMatches.map((m) => m.round)).size;
    if (currentRoundsCount >= maxAllowedRounds) {
      toast.warning(`Đã bốc thăm đủ ${maxAllowedRounds} vòng theo đúng cài đặt giải.`);
      return;
    }

    const nextMatches = generateNextRotatingDoublesRound(
      ev,
      entries,
      groupMatches,
      state.courts,
    );
    if (nextMatches.length === 0) {
      toast.warning("Không thể tạo thêm vòng đấu (Cần ít nhất 4 VĐV chưa bỏ cuộc).");
      return;
    }
    const nextRoundNum = nextMatches[0]!.round;
    update({ matches: [...state.matches, ...nextMatches] });
    toast.success(`🎲 Đã bốc thăm ngẫu nhiên thành công Vòng ${nextRoundNum}!`);
  };

  const requireGroupEditConfirmation = (action: () => void, actionDesc?: string) => {
    if (!hasKoStarted || confirmedGroupEdit) {
      action();
      return;
    }
    setConfirmModal({
      title: "⚠️ Cảnh báo: Vòng loại trực tiếp đã bắt đầu",
      message: `Vòng loại trực tiếp của nội dung "${ev.name}" đã có trận đấu diễn ra hoặc đã ghi điểm số.\n\n${
        actionDesc || "Việc chỉnh sửa kết quả hoặc lịch thi đấu ở vòng bảng"
      } sẽ làm thay đổi bảng xếp hạng và ảnh hưởng trực tiếp đến nhánh đấu loại trực tiếp.\n\nBạn có chắc chắn muốn tiếp tục chỉnh sửa không?`,
      confirmText: "Xác nhận chỉnh sửa",
      cancelText: "Hủy bỏ",
      isDestructive: false,
      onConfirm: () => {
        setConfirmedGroupEdit(true);
        action();
        setConfirmModal(null);
      },
    });
  };

  const buildGroups = () => {
    if (entries.length < 2) {
      setNote("Cần ít nhất 2 đội.");
      return;
    }
    const doBuildGroups = () => {
      const fresh = generateGroupMatches(ev, entries, state.courts);
      update({
        matches: [
          ...state.matches.filter((m) => !(m.eventId === ev.id && m.stage === "group")),
          ...fresh,
        ],
      });
      if (isRotatingDoubles(ev)) {
        const isAllRounds = !ev.randomRoundsCount || ev.randomRoundsCount === 0;
        const totalRoundsInMatches = new Set(fresh.map((m) => m.round)).size;
        if (isAllRounds) {
          setNote(
            `Đã tạo đầy đủ toàn bộ ${totalRoundsInMatches} vòng đấu cho nội dung đôi bắt cặp ngẫu nhiên (mỗi VĐV lần lượt cặp đủ với toàn bộ từng người).`,
          );
        } else {
          setNote(
            `Đã tạo ${totalRoundsInMatches} vòng đấu cho nội dung đôi bắt cặp ngẫu nhiên.`,
          );
        }
      } else {
        setNote(`Đã tạo ${fresh.length} trận ${ev.bracket === "rr" ? "vòng tròn" : "vòng bảng"}.`);
      }
    };

    const hasAnyGroupEdits =
      groupMatches.length > 0 &&
      (groupMatches.some(
        (m) =>
          m.scoreA !== null ||
          m.scoreB !== null ||
          m.status === "done" ||
          m.status === "live" ||
          m.court ||
          m.timeSlot !== undefined,
      ) ||
        groupMatches.length > 0);

    if (hasKoProgress || hasKoStarted || hasAnyGroupEdits) {
      setConfirmModal({
        title: "⚠️ Cảnh báo tạo lại lịch thi đấu",
        message:
          hasKoProgress || hasKoStarted
            ? "Vòng loại trực tiếp đã có nhánh xếp cặp hoặc kết quả thi đấu!\n\nViệc tạo lại lịch thi đấu sẽ làm mới danh sách trận đấu và thứ hạng. Bạn có chắc chắn muốn tiếp tục?"
            : `Lịch thi đấu hiện tại đã có ${groupMatches.length} trận${
                groupMatches.some((m) => m.scoreA !== null || m.status === "done")
                  ? " và đã có kết quả điểm số"
                  : ""
              }.\n\nViệc tạo lại lịch sẽ xóa toàn bộ các trận đấu và điểm số hiện tại của nội dung này để tạo lịch mới từ đầu. Bạn có chắc chắn muốn tiếp tục?`,
        confirmText: "Tạo lại lịch",
        cancelText: "Hủy bỏ",
        isDestructive: true,
        onConfirm: () => {
          setConfirmedGroupEdit(true);
          doBuildGroups();
          setConfirmModal(null);
        },
      });
      return;
    }
    doBuildGroups();
  };

  const handleRestoreSchedule = () => {
    const hasMatches = state.matches.some((m) => m.eventId === ev.id);
    if (!hasMatches) {
      toast.info("Chưa có lịch thi đấu nào để khôi phục.");
      return;
    }

    setConfirmModal({
      title: "⚠️ Khôi phục về trạng thái ban đầu",
      message:
        "Bạn có chắc chắn muốn khôi phục về trạng thái ban đầu trước khi tạo lịch thi đấu?\n\nToàn bộ lịch thi đấu và kết quả điểm số của nội dung này sẽ được xóa để bạn có thể tạo lịch lại từ đầu.",
      confirmText: "Khôi phục ban đầu",
      cancelText: "Hủy bỏ",
      isDestructive: true,
      onConfirm: () => {
        update({
          matches: state.matches.filter((m) => m.eventId !== ev.id),
        });
        setConfirmedGroupEdit(false);
        setNote("Đã khôi phục về trạng thái ban đầu (chưa tạo lịch thi đấu).");
        toast.success("Đã khôi phục về trạng thái ban đầu!");
        setConfirmModal(null);
      },
    });
  };

  const buildKo = () => {
    if (isKoLocked) {
      setNote(
        "🔒 Nhánh KO của nội dung này đang được khóa! Vui lòng bấm nút mở khóa kế bên nếu bạn muốn tạo lại nhánh.",
      );
      return;
    }
    const doBuildKo = () => {
      let fresh: Match[] = [];
      if (koType === "total") {
        fresh = generateTotalKoKnockout(ev, entries, groupMatches, totalKoTeams, state.courts);
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
          ? `Đã tạo nhánh KO gồm đúng ${totalKoTeams} đội (bổ sung đội hạng 3 có hiệu số TB cao nhất, không dùng BYE).`
          : `Đã tạo ${fresh.length} trận loại trực tiếp.`,
      );
    };

    if (koMatches.some((m) => m.scoreA !== null || m.status === "done" || m.status === "live")) {
      setConfirmModal({
        title: "⚠️ Cảnh báo tạo lại nhánh KO",
        message:
          "Nhánh loại trực tiếp đã có trận đấu diễn ra hoặc có điểm số.\n\nViệc tạo lại nhánh KO sẽ xóa toàn bộ kết quả vòng loại trực tiếp hiện tại. Bạn có chắc chắn muốn tiếp tục?",
        confirmText: "Tạo lại nhánh KO",
        cancelText: "Hủy bỏ",
        isDestructive: true,
        onConfirm: () => {
          doBuildKo();
          setConfirmModal(null);
        },
      });
      return;
    }
    doBuildKo();
  };

  const autoFillKoByAlphabet = () => {
    if (isKoLocked) {
      setNote(
        "🔒 Nhánh KO của nội dung này đang được khóa! Vui lòng bấm nút mở khóa kế bên trước khi xếp tự động.",
      );
      return;
    }
    const doAutoFill = () => {
      const fresh = koType === "total"
        ? generateTotalKoKnockout(ev, entries, groupMatches, totalKoTeams, state.courts)
        : generateAlphabeticalKnockout(ev, entries, groupMatches, totalKoTeams, state.courts);
      if (!fresh.length) {
        setNote("Chưa đủ dữ liệu bảng đấu để tự động xếp.");
        return;
      }
      update({
        matches: [...state.matches.filter((m) => !(m.eventId === ev.id && m.stage === "ko")), ...fresh],
      });
      setTab("ko");
      setNote(
        allGroupStageDone
          ? `Đã tự động xếp ${totalKoTeams} đội vào nhánh KO (gồm đội Nhất, Nhì và đội Hạng 3 có hiệu số TB cao nhất).`
          : `Đã tự động xếp ký hiệu thứ hạng vào nhánh KO ${totalKoTeams} đội. Tên đội sẽ tự động hiển thị khi xong vòng bảng.`,
      );
    };

    if (koMatches.some((m) => m.scoreA !== null || m.status === "done" || m.status === "live")) {
      setConfirmModal({
        title: "⚠️ Cảnh báo xếp lại nhánh KO",
        message:
          "Nhánh loại trực tiếp đã có trận đấu diễn ra hoặc có điểm số.\n\nViệc tự động xếp lại nhánh KO sẽ làm mới kết quả vòng loại trực tiếp hiện tại. Bạn có chắc chắn muốn tiếp tục?",
        confirmText: "Xác nhận xếp tự động",
        cancelText: "Hủy bỏ",
        isDestructive: true,
        onConfirm: () => {
          doAutoFill();
          setConfirmModal(null);
        },
      });
      return;
    }
    doAutoFill();
  };

  const setScore = (m: Match, key: "scoreA" | "scoreB", v: number | null) => {
    const applyScore = () => {
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
      if (m.stage === "group" && koMatches.length > 0 && !hasKoStarted && !isKoLocked) {
        const updatedGroupMatches = patched.filter((x) => x.eventId === ev.id && x.stage === "group");
        const reseededKo = koType === "total"
          ? generateTotalKoKnockout(ev, entries, updatedGroupMatches, totalKoTeams, state.courts)
          : generateKnockout(ev, entries, updatedGroupMatches, state.courts);
        const merged = [
          ...patched.filter((x) => !(x.eventId === ev.id && x.stage === "ko")),
          ...reseededKo,
        ];
        update({ matches: propagateKnockout(merged, ev.id, ev, updatedGroupMatches) });
        return;
      }
      update({ matches: propagateKnockout(patched, ev.id, ev) });
    };

    if (m.stage === "group") {
      requireGroupEditConfirmation(applyScore, "Thay đổi tỉ số trận đấu ở vòng bảng");
      return;
    }
    applyScore();
  };

  const resetMatch = (m: Match) => {
    const applyReset = () => {
      const patched: Match[] = state.matches.map((x) => {
        if (x.id !== m.id) return x;
        const { live: _live, ...rest } = x;
        return { ...rest, scoreA: null, scoreB: null, status: "pending" as const, startedAt: undefined } as any;
      });
      if (m.stage === "group" && koMatches.length > 0 && !hasKoStarted && !isKoLocked) {
        const updatedGroupMatches = patched.filter((x) => x.eventId === ev.id && x.stage === "group");
        const reseededKo = koType === "total"
          ? generateTotalKoKnockout(ev, entries, updatedGroupMatches, totalKoTeams, state.courts)
          : generateKnockout(ev, entries, updatedGroupMatches, state.courts);
        const merged = [
          ...patched.filter((x) => !(x.eventId === ev.id && x.stage === "ko")),
          ...reseededKo,
        ];
        update({ matches: propagateKnockout(merged, ev.id, ev, updatedGroupMatches) });
        return;
      }
      update({ matches: propagateKnockout(patched, ev.id, ev) });
    };

    if (m.stage === "group") {
      requireGroupEditConfirmation(applyReset, "Đặt lại (reset) trận đấu ở vòng bảng");
      return;
    }
    applyReset();
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

  const cardProps = (m: Match, compact?: boolean): CardProps => ({
    m,
    nameA: resolveSideLabel(m, "aId"),
    nameB: resolveSideLabel(m, "bId"),
    entryA: getMatchEntryA(m, state.entries),
    entryB: getMatchEntryB(m, state.entries),
    activePlayerNames,
    isLiveA:
      !(m.status === "done" || (m.scoreA !== null && m.scoreB !== null)) &&
      (m.aEntryIds ? m.aEntryIds.some((id) => isEntryActive(id)) : isEntryActive(m.aId)),
    isLiveB:
      !(m.status === "done" || (m.scoreA !== null && m.scoreB !== null)) &&
      (m.bEntryIds ? m.bEntryIds.some((id) => isEntryActive(id)) : isEntryActive(m.bId)),
    onScore: (k, v) => {
      if (isReadOnly) return;
      setScore(m, k, v);
    },
    onStatus: (s) => {
      if (isReadOnly) return;
      const doStatus = () => {
        updateMatch(m.id, {
          status: s,
          startedAt: s === "live" ? Date.now() : undefined,
        } as any);
      };
      if (m.stage === "group") {
        requireGroupEditConfirmation(doStatus, "Thay đổi trạng thái trận đấu ở vòng bảng");
        return;
      }
      doStatus();
    },
    onReset: () => {
      if (isReadOnly) return;
      resetMatch(m);
    },
    courts: state.courts,
    referees: mergedReferees,
    onCourt: (c) => {
      if (isReadOnly) return;
      updateMatch(m.id, { court: c });
    },
    onReferee: (r) => {
      if (isReadOnly) return;
      updateMatch(m.id, { referee: r });
    },
    onAddReferee: (r) => {
      if (isReadOnly) return;
      handleAddReferee(r);
    },
    onClearReferees: () => {
      if (isReadOnly) return;
      handleClearReferees();
    },
    onRemoveFromTimeline: isReadOnly
      ? undefined
      : () => {
          recordTimelineState();
          updateMatch(m.id, { timeSlot: undefined });
        },
    onViewNote: (n) => setViewNoteText(n),
    onViewReview: (target) => setReviewMatch(target),
    onDurationChange: isReadOnly
      ? undefined
      : (mins, recordHistory = true) => {
          if (recordHistory) recordTimelineState();
          updateMatch(m.id, { durationMinutes: mins });
        },
    onOffsetChange: isReadOnly
      ? undefined
      : (offset, recordHistory = true) => {
          if (recordHistory) recordTimelineState();
          updateMatch(m.id, { offsetMinutes: offset });
        },
    onMoveHorizontal: isReadOnly
      ? undefined
      : (newSlot, newOffset, recordHistory = true) => {
          if (recordHistory) recordTimelineState();
          updateMatch(m.id, { timeSlot: newSlot, offsetMinutes: newOffset });
        },
    onDropOnMatch: isReadOnly ? undefined : handleMatchDrop,
    hasConflict: compact && conflictsSet.has(m.id),
    compact,
    isTeamMode: ev?.mode === "dong_doi",
    onManageTeamMatch: (target) => setTeamMatchToManage(target),
    isReadOnly,
  });

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

  /* Xếp riêng từng vòng hoặc từng bảng tự động vào bảng timeline */
  const autoScheduleRound = (roundMatches: Match[]) => {
    if (roundMatches.length === 0 || state.courts.length === 0) return;
    recordTimelineState();
    const assigned = state.matches.filter(
      (m) => m.eventId === ev.id && m.court && m.timeSlot !== undefined,
    );
    const usedSlots = new Set(assigned.map((m) => `${m.court}__${m.timeSlot}`));
    const busyTeamsBySlot = new Map<number, Set<string>>();
    assigned.forEach((m) => {
      if (typeof m.timeSlot !== "number") return;
      if (!busyTeamsBySlot.has(m.timeSlot)) busyTeamsBySlot.set(m.timeSlot, new Set());
      const busy = busyTeamsBySlot.get(m.timeSlot)!;
      if (m.aId) busy.add(m.aId);
      if (m.bId) busy.add(m.bId);
    });

    // Tìm khung giờ bắt đầu hợp lý (ngay sau các vòng trước đã xếp trên timeline)
    const targetStage = roundMatches[0]!.stage;
    const minTargetRound = Math.min(...roundMatches.map((m) => m.round ?? 1));
    let minStartSlot = 0;
    assigned.forEach((m) => {
      const isEarlier =
        (targetStage === "ko" && m.stage === "group") ||
        (m.stage === targetStage && (m.round ?? 1) < minTargetRound);
      if (isEarlier && typeof m.timeSlot === "number") {
        minStartSlot = Math.max(minStartSlot, m.timeSlot + 1);
      }
    });

    const updatedMatches = [...state.matches];

    roundMatches.forEach((m) => {
      let slotIdx = minStartSlot;
      let placed = false;
      while (!placed && slotIdx < 200) {
        const busy = busyTeamsBySlot.get(slotIdx);
        const hasTeamConflict = Boolean(
          busy && ((m.aId && busy.has(m.aId)) || (m.bId && busy.has(m.bId))),
        );
        if (!hasTeamConflict) {
          for (const court of state.courts) {
            const key = `${court}__${slotIdx}`;
            if (!usedSlots.has(key)) {
              usedSlots.add(key);
              if (!busyTeamsBySlot.has(slotIdx)) busyTeamsBySlot.set(slotIdx, new Set());
              const slotTeams = busyTeamsBySlot.get(slotIdx)!;
              if (m.aId) slotTeams.add(m.aId);
              if (m.bId) slotTeams.add(m.bId);

              const matchIdx = updatedMatches.findIndex((x) => x.id === m.id);
              if (matchIdx !== -1) {
                updatedMatches[matchIdx] = {
                  ...updatedMatches[matchIdx],
                  court,
                  timeSlot: slotIdx,
                  offsetMinutes: 0,
                  durationMinutes: updatedMatches[matchIdx].durationMinutes || state.slotMinutes,
                };
              }
              placed = true;
              break;
            }
          }
        }
        if (!placed) slotIdx++;
      }
    });

    update({ matches: updatedMatches });
    setNote(`Đã tự động xếp ${roundMatches.length} trận vào timeline.`);
  };

  const exportCsv = () => {
    const slotMins = state.slotMinutes || 30;
    const courtOrder = (c: string) => {
      const idx = state.courts.indexOf(c);
      return idx >= 0 ? idx : 999;
    };

    const sortedMatches = matches
      .filter((m) => m.timeSlot !== undefined)
      .sort((a, b) => {
        const timeA = (a.timeSlot ?? 0) * slotMins + (a.offsetMinutes ?? 0);
        const timeB = (b.timeSlot ?? 0) * slotMins + (b.offsetMinutes ?? 0);
        if (timeA !== timeB) return timeA - timeB;
        const cA = courtOrder(a.court);
        const cB = courtOrder(b.court);
        if (cA !== cB) return cA - cB;
        return a.court.localeCompare(b.court, "vi", { numeric: true });
      });

    const matchNumberMap = new Map<string, number>();
    sortedMatches.forEach((m, idx) => {
      matchNumberMap.set(m.id, idx + 1);
    });

    const resolveExcelTeamName = (m: Match, side: "aId" | "bId"): string => {
      if (side === "aId" && m.aEntryIds && m.aEntryIds.length === 2) {
        return entryName(getMatchEntryA(m, entries));
      }
      if (side === "bId" && m.bEntryIds && m.bEntryIds.length === 2) {
        return entryName(getMatchEntryB(m, entries));
      }
      const entryId = side === "aId" ? m.aId : m.bId;
      if (entryId) {
        return entryName(entries.find((e) => e.id === entryId));
      }
      const placeholder =
        (side === "aId" ? m.customPlaceholderA : m.customPlaceholderB)?.trim() || "";

      if (m.stage === "group") {
        const v1Match =
          sortedMatches.find(
            (x) => x.stage === "group" && x.groupName === m.groupName && x.round === 1,
          ) ??
          groupMatches.find((x) => x.groupName === m.groupName && x.round === 1);
        const v1Num = v1Match ? matchNumberMap.get(v1Match.id) : undefined;
        if (m.round === 2 || /thua\s*v1/i.test(placeholder)) {
          return v1Num ? `Lose T${v1Num}` : "Lose V1";
        }
        if (m.round === 3 || /thắng\s*v1/i.test(placeholder)) {
          return v1Num ? `Win T${v1Num}` : "Win V1";
        }
      }

      if (m.stage === "ko") {
        if (placeholder && !/^Hạt\s*giống\s*\d+$/i.test(placeholder)) {
          return placeholder;
        }
        if (m.round > 1) {
          if (m.slot === 99) {
            const maxR = Math.max(
              ...koMatches.filter((x) => x.slot !== 99).map((x) => x.round),
            );
            const semiSlot = side === "aId" ? 0 : 1;
            const semiMatch = koMatches.find(
              (x) => x.round === maxR - 1 && x.slot === semiSlot,
            );
            const semiNum = semiMatch ? matchNumberMap.get(semiMatch.id) : undefined;
            if (semiNum) return `Lose T${semiNum}`;
            return `Lose BK${semiSlot + 1}`;
          } else {
            const prevSlot = (m.slot ?? 0) * 2 + (side === "aId" ? 0 : 1);
            const prevMatch = koMatches.find(
              (x) =>
                x.round === m.round - 1 && x.slot === prevSlot && x.slot !== 99,
            );
            if (prevMatch && isActualByeMatch(prevMatch)) {
              const advId = prevMatch.aId || prevMatch.bId;
              if (advId) return entryName(entries.find((e) => e.id === advId));
              const advHolder =
                prevMatch.customPlaceholderA?.trim().toLowerCase() !== "bye"
                  ? prevMatch.customPlaceholderA?.trim()
                  : prevMatch.customPlaceholderB?.trim();
              if (advHolder) return advHolder;
            }
            const prevNum = prevMatch ? matchNumberMap.get(prevMatch.id) : undefined;
            if (prevNum) return `Win T${prevNum}`;
            const prevTitle = prevMatch?.koRound || `V${m.round - 1}`;
            const shortPrev = prevTitle
              .replace(/^Tứ kết$/i, "TK")
              .replace(/^Bán kết$/i, "BK")
              .replace(/^Vòng\s+/i, "");
            return `Win ${shortPrev}${prevSlot + 1}`;
          }
        }
      }

      return placeholder || "Chờ xác định";
    };

    const titleRow = [ev.name, "", "", "", "", "", "", "", "", "", ""];
    const headerRow = [
      "Trận",
      "Thời gian",
      "Sân",
      "Bảng - Vòng",
      "Đội 1",
      "Tỉ số 1",
      "Tỉ số 2",
      "Đội 2",
      "Trọng tài",
      "Trạng thái",
      "Ghi chú",
    ];

    const timeStrings: string[] = [];
    const dataRows = sortedMatches.map((m, idx) => {
      const totalOffset = (m.timeSlot ?? 0) * slotMins + (m.offsetMinutes ?? 0);
      const rawTime = addMinutes(state.startTime, totalOffset);
      const timeStr = rawTime.replace(/^0(\d:)/, "$1");
      timeStrings.push(timeStr);

      const stageLabel =
        m.stage === "ko"
          ? m.koRound || groupTag(m.groupName) || `V${m.round}`
          : m.groupName.toLowerCase().includes("vòng tròn") || m.groupName === "rr"
            ? `V${m.round}`
            : `${groupTag(m.groupName)} - V${m.round}`;

      const statusLabel =
        m.status === "done"
          ? "Đã xong"
          : m.status === "live"
            ? "Đang đấu"
            : "Chờ đấu";

      return [
        idx + 1,
        timeStr,
        m.court || "",
        stageLabel,
        resolveExcelTeamName(m, "aId"),
        m.scoreA !== null ? m.scoreA : "",
        m.scoreB !== null ? m.scoreB : "",
        resolveExcelTeamName(m, "bId"),
        m.referee || "",
        statusLabel,
        m.note || m.live?.note || "",
      ];
    });

    const merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
    ];

    // Gộp dọc các ô Thời gian (cột B - index 1) có cùng khung giờ liên tiếp
    let runStart = 0;
    while (runStart < timeStrings.length) {
      let runEnd = runStart;
      while (
        runEnd + 1 < timeStrings.length &&
        timeStrings[runEnd + 1] === timeStrings[runStart]
      ) {
        runEnd++;
      }
      if (runEnd > runStart) {
        merges.push({
          s: { r: runStart + 2, c: 1 },
          e: { r: runEnd + 2, c: 1 },
        });
        for (let k = runStart + 1; k <= runEnd; k++) {
          dataRows[k]![1] = "";
        }
      }
      runStart = runEnd + 1;
    }

    const allRows = [titleRow, headerRow, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(allRows);
    ws["!merges"] = merges;

    const thinBorder = {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } },
    };

    const totalRowCount = allRows.length;
    const totalColCount = 11;

    for (let r = 0; r < totalRowCount; r++) {
      for (let c = 0; c < totalColCount; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r, c });
        if (!ws[cellAddress]) {
          ws[cellAddress] = { t: "s", v: "" };
        }
        const isTitleRow = r === 0;
        const isCourtCol = r >= 1 && c === 2;
        ws[cellAddress].s = {
          font: {
            name: "Calibri",
            sz: 11,
            bold: isTitleRow,
            color: { rgb: "000000" },
          },
          alignment: {
            horizontal: isCourtCol ? "left" : "center",
            vertical: "center",
          },
          border: thinBorder,
        };
      }
    }

    ws["!cols"] = [
      { wch: 8 },  // Trận
      { wch: 11 }, // Thời gian
      { wch: 10 }, // Sân
      { wch: 14 }, // Bảng - Vòng
      { wch: 20 }, // Đội 1
      { wch: 10 }, // Tỉ số 1
      { wch: 10 }, // Tỉ số 2
      { wch: 20 }, // Đội 2
      { wch: 12 }, // Trọng tài
      { wch: 12 }, // Trạng thái
      { wch: 12 }, // Ghi chú
    ];

    ws["!rows"] = Array.from({ length: totalRowCount }, () => ({ hpt: 20 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lịch thi đấu");
    XLSX.writeFile(wb, `Lich_Thi_Dau_${ev.name.replace(/\s+/g, "_")}.xlsx`);
    setNote("Đã xuất file Excel lịch thi đấu.");
  };

  const handleDownloadGroupScheduleImage = async () => {
    if (!exportGroupScheduleRef.current) return;
    setIsExportingImage(true);
    toast.info("Đang xử lý tạo ảnh chất lượng cao...");
    try {
      const canvas = await html2canvas(exportGroupScheduleRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#fbfaf6",
        logging: false,
        onclone: (clonedDoc) => {
          const exportEl = clonedDoc.querySelector('[data-export-schedule="true"]');
          if (exportEl) {
            const all = exportEl.querySelectorAll('*');
            const helperCanvas = clonedDoc.createElement('canvas');
            const ctx = helperCanvas.getContext('2d');
            all.forEach((el) => {
              const htmlEl = el as HTMLElement;
              const cs = clonedDoc.defaultView?.getComputedStyle(htmlEl);
              if (cs && ctx) {
                ['color', 'backgroundColor', 'borderColor'].forEach((prop) => {
                  const val = (cs as any)[prop];
                  if (typeof val === 'string' && val.includes('oklch')) {
                    try {
                      ctx.fillStyle = val;
                      (htmlEl.style as any)[prop] = ctx.fillStyle;
                    } catch {
                      // fallback
                    }
                  }
                });
              }
            });
          }
        },
      });
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      const safeTournament = (state.name || "Giai").trim().replace(/[\s/\\?%*:|"<>]+/g, "_");
      const safeEvent = (ev.name || "Noi_dung").trim().replace(/[\s/\\?%*:|"<>]+/g, "_");
      link.download = `Lich_thi_dau_${safeTournament}_${safeEvent}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Đã tải ảnh sơ đồ thi đấu thành công!");
    } catch (err) {
      console.error("Export image error:", err);
      toast.error("Không thể tạo ảnh sơ đồ. Vui lòng thử lại!");
    } finally {
      setIsExportingImage(false);
    }
  };

  const handleDownloadGroupSchedulePdf = async () => {
    if (!exportGroupScheduleRef.current) return;
    setIsExportingPdf(true);
    toast.info("Đang xử lý xuất file PDF...");
    try {
      const canvas = await html2canvas(exportGroupScheduleRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#fbfaf6",
        logging: false,
        onclone: (clonedDoc) => {
          const exportEl = clonedDoc.querySelector('[data-export-schedule="true"]');
          if (exportEl) {
            const all = exportEl.querySelectorAll('*');
            const helperCanvas = clonedDoc.createElement('canvas');
            const ctx = helperCanvas.getContext('2d');
            all.forEach((el) => {
              const htmlEl = el as HTMLElement;
              const cs = clonedDoc.defaultView?.getComputedStyle(htmlEl);
              if (cs && ctx) {
                ['color', 'backgroundColor', 'borderColor'].forEach((prop) => {
                  const val = (cs as any)[prop];
                  if (typeof val === 'string' && val.includes('oklch')) {
                    try {
                      ctx.fillStyle = val;
                      (htmlEl.style as any)[prop] = ctx.fillStyle;
                    } catch {
                      // fallback
                    }
                  }
                });
              }
            });
          }
        },
      });
      const imgW = canvas.width;
      const imgH = canvas.height;
      const orientation = imgW > imgH ? "landscape" : "portrait";
      const pdf = new jsPDF({
        orientation,
        unit: "px",
        format: [imgW, imgH],
      });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgW, imgH);
      const safeTournament = (state.name || "Giai").trim().replace(/[\s/\\?%*:|"<>]+/g, "_");
      const safeEvent = (ev.name || "Noi_dung").trim().replace(/[\s/\\?%*:|"<>]+/g, "_");
      pdf.save(`Lich_thi_dau_${safeTournament}_${safeEvent}.pdf`);
      toast.success("Đã xuất file PDF thành công!");
    } catch (err) {
      console.error("Export PDF error:", err);
      toast.error("Không thể xuất file PDF. Vui lòng thử lại!");
    } finally {
      setIsExportingPdf(false);
    }
  };

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

      const patched = state.matches.map((m) => {
        if (m.id === sourceMatch.id && m.id === targetMatch.id) {
          return {
            ...m,
            [dragKoSlot.side]: targetVal,
            [sourceHolderKey]: targetHolder,
            [targetSide]: sourceVal,
            [targetHolderKey]: sourceHolder,
          };
        }
        if (m.id === sourceMatch.id) {
          return {
            ...m,
            [dragKoSlot.side]: targetVal,
            [sourceHolderKey]: targetHolder,
          };
        }
        if (m.id === targetMatch.id) {
          return {
            ...m,
            [targetSide]: sourceVal,
            [targetHolderKey]: sourceHolder,
          };
        }
        return m;
      });

      update({ matches: propagateKnockout(patched, ev.id, ev) });
      setDragKoSlot(null);
      setNote("Đã hoán đổi / di chuyển vị trí trong nhánh loại trực tiếp.");
      return;
    }

    // TH 2: Kéo ký hiệu thứ hạng từ bảng xếp thủ công (khi vòng bảng chưa xong)
    if (dragRankPlaceholder) {
      const placeholderKey = targetSide === "aId" ? "customPlaceholderA" : "customPlaceholderB";
      const patched = state.matches.map((m) =>
        m.id === targetMatch.id
          ? {
              ...m,
              [targetSide]: null,
              [placeholderKey]: dragRankPlaceholder,
            }
          : m,
      );
      update({ matches: propagateKnockout(patched, ev.id, ev) });
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
    const patched = state.matches.map((m) =>
      m.id === targetMatch.id
        ? {
            ...m,
            [targetSide]: dragEntry,
            ...(seedBadge ? { [placeholderKey]: seedBadge } : {}),
          }
        : m,
    );
    update({ matches: propagateKnockout(patched, ev.id, ev) });
    setDragEntry(null);
    setNote(seedBadge ? `Đã xếp đội (${seedBadge}) vào nhánh.` : "Đã xếp đội vào nhánh.");
  };

  const handleAssignTeamFromPicker = (entryId: string, seedBadge?: string) => {
    if (!koSlotPicker) return;
    const targetMatch = state.matches.find((m) => m.id === koSlotPicker.matchId);
    if (!targetMatch) return;
    const targetSide = koSlotPicker.side;
    const placeholderKey = targetSide === "aId" ? "customPlaceholderA" : "customPlaceholderB";

    // Kiểm tra đội này đã nằm ở ô KO nào khác chưa để đổi chỗ (hoán đổi)
    const sourceMatch = state.matches.find(
      (m) =>
        m.eventId === ev.id &&
        m.stage === "ko" &&
        (m.aId === entryId || m.bId === entryId),
    );

    let patched: Match[] = [];
    if (sourceMatch) {
      const sourceSide: "aId" | "bId" = sourceMatch.aId === entryId ? "aId" : "bId";
      if (sourceMatch.id === targetMatch.id && sourceSide === targetSide) {
        setKoSlotPicker(null);
        return;
      }
      const sourceHolderKey = sourceSide === "aId" ? "customPlaceholderA" : "customPlaceholderB";
      const sourceVal = sourceMatch[sourceSide];
      const sourceHolder = sourceMatch[sourceHolderKey];

      const targetVal = targetMatch[targetSide];
      const targetHolder = targetMatch[placeholderKey];

      patched = state.matches.map((m) => {
        if (m.id === sourceMatch.id && m.id === targetMatch.id) {
          return {
            ...m,
            [sourceSide]: targetVal,
            [sourceHolderKey]: targetHolder,
            [targetSide]: sourceVal,
            [placeholderKey]: sourceHolder,
          };
        }
        if (m.id === sourceMatch.id) {
          return {
            ...m,
            [sourceSide]: targetVal,
            [sourceHolderKey]: targetHolder,
          };
        }
        if (m.id === targetMatch.id) {
          return {
            ...m,
            [targetSide]: sourceVal,
            [placeholderKey]: sourceHolder,
          };
        }
        return m;
      });
    } else {
      patched = state.matches.map((m) =>
        m.id === targetMatch.id
          ? {
              ...m,
              [targetSide]: entryId,
              ...(seedBadge ? { [placeholderKey]: seedBadge } : {}),
              scoreA: null,
              scoreB: null,
              status: "pending" as const,
            }
          : m,
      );
    }

    update({ matches: propagateKnockout(patched, ev.id, ev) });
    setKoSlotPicker(null);
    toast.success("Đã xếp đội vào ô thi đấu.");
  };

  const handleClearSlotFromPicker = () => {
    if (!koSlotPicker) return;
    const targetMatch = state.matches.find((m) => m.id === koSlotPicker.matchId);
    if (!targetMatch) return;
    const targetSide = koSlotPicker.side;
    const placeholderKey = targetSide === "aId" ? "customPlaceholderA" : "customPlaceholderB";

    const patched = state.matches.map((m) =>
      m.id === targetMatch.id
        ? {
            ...m,
            [targetSide]: null,
            [placeholderKey]: "",
            scoreA: null,
            scoreB: null,
            status: "pending" as const,
          }
        : m,
    );
    update({ matches: propagateKnockout(patched, ev.id, ev) });
    setKoSlotPicker(null);
    toast.success("Đã để trống ô thi đấu.");
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
      const clean = customPlaceholder.trim();
      if (/^Hạt\s*giống\s*\d+$/i.test(clean)) return "";
      return clean.replace(/[*#]/g, "");
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

  const renderKoCard = (m: Match, isFinal = false) => {
    const isConflictA = Boolean(
      m.aId && (roundEntryCounts.get(`${m.round}_${m.aId}`) ?? 0) > 1,
    );
    const isConflictB = Boolean(
      m.bId && (roundEntryCounts.get(`${m.round}_${m.bId}`) ?? 0) > 1,
    );
    const hasRoundConflict = isConflictA || isConflictB;
    const isDone = m.status === "done" || (m.scoreA !== null && m.scoreB !== null);

    return (
      <KoCard
        key={m.id}
        m={m}
        isFinal={isFinal}
        nameA={nameOf(m.aId)}
        nameB={nameOf(m.bId)}
        entryA={state.entries.find((e) => e.id === m.aId)}
        entryB={state.entries.find((e) => e.id === m.bId)}
        seedBadgeA={getEntrySeedBadge(m.aId, m.customPlaceholderA)}
        seedBadgeB={getEntrySeedBadge(m.bId, m.customPlaceholderB)}
        activePlayerNames={activePlayerNames}
        isLiveA={!isDone && isEntryActive(m.aId)}
        isLiveB={!isDone && isEntryActive(m.bId)}
        isConflictA={isConflictA}
        isConflictB={isConflictB}
        hasRoundConflict={hasRoundConflict}
        isKoLocked={isKoLocked}
        isReadOnly={isReadOnly}
        onScore={(k, v) => {
          if (isReadOnly) return;
          setScore(m, k, v);
        }}
        onStatus={(s) => {
          if (isReadOnly) return;
          updateMatch(m.id, { status: s, startedAt: s === "live" ? Date.now() : undefined } as any);
        }}
        onReset={() => {
          if (isReadOnly) return;
          resetMatch(m);
        }}
        onDropTeam={(side) => {
          if (isReadOnly) return;
          dropTeam(m, side);
        }}
        onSelectTeamSlot={(side) => {
          if (isReadOnly || isKoLocked) return;
          setKoSlotPicker({ matchId: m.id, side });
        }}
        onClearTeam={(side) => {
          if (isReadOnly || isKoLocked) return;
          const placeholderKey = side === "aId" ? "customPlaceholderA" : "customPlaceholderB";
          const patched = state.matches.map((x) =>
            x.id === m.id
              ? {
                  ...x,
                  [side]: null,
                  [placeholderKey]: "",
                  scoreA: null,
                  scoreB: null,
                  status: "pending" as const,
                }
              : x,
          );
          update({ matches: propagateKnockout(patched, ev.id, ev) });
          setNote("Đã xóa đội / vị trí khỏi ô thi đấu.");
        }}
        onStartDragTeam={(side) => {
          if (isReadOnly || isKoLocked) return;
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
        onViewReview={(target) => setReviewMatch(target)}
        referees={mergedReferees}
        onReferee={(r) => {
          if (isReadOnly) return;
          updateMatch(m.id, { referee: r });
        }}
        onAddReferee={(r) => {
          if (isReadOnly) return;
          handleAddReferee(r);
        }}
        onClearReferees={() => {
          if (isReadOnly) return;
          handleClearReferees();
        }}
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
        <div className="flex w-max min-w-full items-stretch justify-center pt-2">
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
                  className={`w-[325px] sm:w-[335px] shrink-0 flex flex-col ${colIdx === 0 ? "pl-[2px]" : ""}`}
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
            <div className="w-[325px] sm:w-[335px] shrink-0 flex flex-col justify-end ml-6">
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
      <div className="flex w-max min-w-full items-stretch justify-center pt-2">
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
                className={`w-[325px] sm:w-[335px] shrink-0 flex flex-col ${colIdx === 0 ? "pl-[2px]" : ""}`}
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
        <div className="w-[345px] sm:w-[365px] shrink-0 flex flex-col items-stretch px-2.5">
          <div
            className="rounded-xl bg-amber-500/25 py-3 text-center font-head text-base sm:text-lg font-black uppercase tracking-wider text-amber-800 dark:text-amber-200 ring-2 ring-amber-500/50 shadow-md"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            🏆 Chung kết
          </div>
          <div className="mt-4 flex flex-1 flex-col justify-around gap-6">
            {finalMatches.map((m) => renderKoCard(m, true))}
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

              <div className="w-[325px] sm:w-[335px] shrink-0 flex flex-col">
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

  const renderTimelineGrid = (isFullscreen = false) => (
    <div
      className={
        isFullscreen
          ? "relative w-max min-w-full flex-1"
          : "relative min-w-0 overflow-x-auto overflow-y-visible flex-1"
      }
      style={isFullscreen ? { zoom: timelineScale } : undefined}
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
            className="sticky top-0 z-20 border-b border-r border-line/15 bg-card/95 p-1 text-center text-[11px] font-bold uppercase tracking-wider text-line/70 backdrop-blur-xs shadow-xs flex items-center justify-center h-[34px]"
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
                  className={
                    isReadOnly
                      ? "relative border-b border-r border-line/10 p-0.5 overflow-hidden"
                      : "relative border-b border-r border-line/10 p-0.5 transition hover:bg-accent/10 group overflow-hidden"
                  }
                  style={{
                    gridRow: rowNum,
                    gridColumn: s + 2,
                    minHeight: `${rowHeight}px`,
                    height: `${rowHeight}px`,
                    maxHeight: `${rowHeight}px`,
                  }}
                  onDragOver={
                    isReadOnly
                      ? undefined
                      : (e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }
                  }
                  onDrop={
                    isReadOnly
                      ? undefined
                      : (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const draggedId = e.dataTransfer.getData("text/plain") || dragMatch;
                    if (!draggedId) return;
                    const draggedMatch = state.matches.find((x) => x.id === draggedId);
                    if (!draggedMatch) return;

                    const rect = e.currentTarget.getBoundingClientRect();
                    let targetSlot = s;
                    let targetOffset = 0;

                    if (dragGrabPxRef.current !== null) {
                      // Tính vị trí mép trái thực tế của thẻ đang kéo trên trục thời gian
                      const slot0Left = rect.left - s * colWidth;
                      const ghostLeftX = e.clientX - dragGrabPxRef.current;
                      const deltaPx = ghostLeftX - (slot0Left + 4);
                      const rawTotalMinutes = (deltaPx / colWidth) * slotMins;
                      const snappedTotalMinutes = Math.max(
                        0,
                        Math.round(rawTotalMinutes / 5) * 5,
                      );
                      targetSlot = Math.floor(snappedTotalMinutes / slotMins);
                      targetOffset = snappedTotalMinutes % slotMins;
                    } else {
                      // Kéo từ danh sách chờ bên phải sang
                      const offsetX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                      const ratio = offsetX / rect.width;
                      const numSteps = Math.max(1, Math.floor(slotMins / 5));
                      const stepIdx = Math.min(numSteps - 1, Math.floor(ratio * numSteps));
                      targetOffset = stepIdx * 5;
                    }

                    const droppedStartMins = targetSlot * slotMins + targetOffset;

                    // Kiểm tra nếu kéo thả chồng khít 100% lên một trận khác trên cùng sân -> Hoán đổi vị trí 2 trận
                    const exactTargetMatch = matches.find((other) => {
                      if (other.id === draggedId || other.timeSlot === undefined) return false;
                      const otherCourt = state.courts.includes(other.court)
                        ? other.court
                        : state.courts[0];
                      if (otherCourt !== court) return false;
                      const otherStartMins =
                        (other.timeSlot ?? 0) * slotMins + (other.offsetMinutes ?? 0);
                      return otherStartMins === droppedStartMins;
                    });

                    recordTimelineState();

                    if (exactTargetMatch) {
                      const srcCourt = draggedMatch.court;
                      const srcSlot = draggedMatch.timeSlot;
                      const srcOffset = draggedMatch.offsetMinutes ?? 0;

                      const dstCourt = exactTargetMatch.court;
                      const dstSlot = exactTargetMatch.timeSlot;
                      const dstOffset = exactTargetMatch.offsetMinutes ?? 0;

                      update({
                        matches: state.matches.map((item) => {
                          if (item.id === draggedId) {
                            return {
                              ...item,
                              court: dstCourt,
                              timeSlot: dstSlot,
                              offsetMinutes: dstOffset,
                            };
                          }
                          if (item.id === exactTargetMatch.id) {
                            return {
                              ...item,
                              court: srcCourt,
                              timeSlot: srcSlot,
                              offsetMinutes: srcSlot !== undefined ? srcOffset : 0,
                            };
                          }
                          return item;
                        }),
                      });
                      setDragMatch(null);
                      dragGrabPxRef.current = null;
                      setNote("Đã hoán đổi vị trí 2 trận đấu trên timeline.");
                      return;
                    }

                    updateMatch(draggedId, {
                      court,
                      timeSlot: targetSlot,
                      offsetMinutes: targetOffset,
                    });
                    setDragMatch(null);
                    dragGrabPxRef.current = null;
                    setNote(
                      `Đã chuyển trận sang ${court} (${addMinutes(
                        state.startTime,
                        droppedStartMins,
                      )})`,
                    );
                  }
                  }
                >
                  {/* Vạch chia 5 phút khi hover để kéo thả chính xác (+5p, +10p, +15p...) */}
                  {!isReadOnly && (
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
                  )}
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
                    Math.round(((m.durationMinutes ?? slotMins) / slotMins) * colWidth - 9),
                  );
                  const leftOffset =
                    Math.round((((m.timeSlot ?? 0) * slotMins + (m.offsetMinutes ?? 0)) / slotMins) * colWidth) + 4;

                  return (
                    <div
                      key={m.id}
                      draggable={!isReadOnly}
                      onDragStart={
                        isReadOnly
                          ? undefined
                          : (e) => {
                              if ((e.target as HTMLElement).closest("[data-no-drag]")) {
                                e.preventDefault();
                                return;
                              }
                              const rect = e.currentTarget.getBoundingClientRect();
                              dragGrabPxRef.current = e.clientX - rect.left;
                              e.dataTransfer.setData("text/plain", m.id);
                              e.dataTransfer.effectAllowed = "move";
                              // Cho phép chuyển sang trạng thái drag ngay sau khi event dragstart được browser khởi tạo
                              setTimeout(() => setDragMatch(m.id), 0);
                            }
                      }
                      onDragEnd={
                        isReadOnly
                          ? undefined
                          : () => {
                              setDragMatch(null);
                              dragGrabPxRef.current = null;
                            }
                      }
                      className={`timeline-card-wrapper pointer-events-auto ${
                        isReadOnly ? "" : "cursor-grab active:cursor-grabbing"
                      } absolute transition-[opacity] ${
                        dragMatch === m.id ? "opacity-30 !pointer-events-none" : ""
                      } ${dragMatch && dragMatch !== m.id ? "pointer-events-none" : ""} hover:z-30`}
                      style={{
                        top: "4px",
                        bottom: "5px",
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
  );

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
      <div className="sticky left-4 sm:left-6 lg:left-8 max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-3rem)] lg:max-w-[calc(100vw-4rem)] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className="font-head text-3xl font-extrabold uppercase tracking-tight text-[#0a3320] sm:text-4xl"
            style={{ color: "#0a3320" }}
          >
            Quản lý giải đấu
          </h1>
        </div>
        {!isReadOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShareModalOpen(true)}
              className="rounded-xl border border-line/20 bg-card hover:bg-secondary text-[#0a3320] px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
              title="Thêm email người cùng điều hành hoặc xem, chia sẻ mã QR theo dõi trực tiếp"
            >
              Chia sẻ
            </button>
          </div>
        )}
      </div>

      {/* Thanh thông báo các trận ĐANG DIỄN RA (Active Matches Bar - Ảnh 4) */}
      {allLiveMatches.length > 0 && (
        <div className="sticky left-4 sm:left-6 lg:left-8 max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-3rem)] lg:max-w-[calc(100vw-4rem)] rounded-2xl border border-red-500/30 bg-red-500/10 p-3.5 shadow-sm">
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
              const tA = getMatchEntryA(m, state.entries);
              const tB = getMatchEntryB(m, state.entries);
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
                        {m.court}
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
                        {m.status === "live" && m.live ? (m.live.a ?? 0) : (m.scoreA ?? 0)} -{" "}
                        {m.status === "live" && m.live ? (m.live.b ?? 0) : (m.scoreB ?? 0)}
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
                  <div
                    className={`mt-2.5 flex items-center ${
                      isReadOnly ? "justify-center" : "justify-between"
                    } gap-1.5 pt-2 border-t border-line/10`}
                  >
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => updateMatch(m.id, { status: "pending", startedAt: undefined } as any)}
                        className="rounded px-2 py-1 text-[10px] font-bold text-red-600 bg-red-500/10 hover:bg-red-500/20 transition cursor-pointer flex items-center gap-1 shrink-0"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        title="Tạm dừng trận đấu"
                      >
                        ⏸ Tạm dừng
                      </button>
                    )}

                    <LiveStopwatch
                      startedAt={(m as any).startedAt}
                      onReset={
                        isReadOnly
                          ? undefined
                          : () => updateMatch(m.id, { startedAt: Date.now() } as any)
                      }
                    />

                    {!isReadOnly && (
                      <Link
                        to="/cham-diem/$matchId"
                        params={{ matchId: m.id } as any}
                        className="btn-accent !px-2.5 !py-1 text-[10px] font-bold shrink-0"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        ⚡ Chấm điểm
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs chọn nội dung thi đấu */}
      <div className="sticky left-4 sm:left-6 lg:left-8 max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-3rem)] lg:max-w-[calc(100vw-4rem)] flex flex-wrap gap-2">
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
      <div className="sticky left-4 sm:left-6 lg:left-8 max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-3rem)] lg:max-w-[calc(100vw-4rem)] flex flex-wrap items-center justify-between gap-3 border-y border-line/10 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <TabBtn id="group" label={ev.bracket === "rr" ? "Vòng tròn" : "Vòng bảng"} />
          <TabBtn id="timeline" label="Timeline sân" />
          {ev.bracket !== "rr" && <TabBtn id="ko" label="Loại trực tiếp" />}
          {!(tab === "timeline" && isReadOnly) && <span className="mx-1 h-5 w-px bg-line/15" />}

          {tab === "ko" ? (
            <div className="flex flex-wrap items-center gap-2">
              {!isReadOnly && (
                <>
                  {/* Chế độ chọn tổng số đội KO vs Theo đội đi tiếp / bảng */}
                  <div className="flex items-center gap-1 rounded-lg bg-card p-0.5 ring-1 ring-line/20 text-xs">
                    <button
                      type="button"
                      onClick={() => setKoType("total")}
                      style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: "bold" }}
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        koType === "total"
                          ? "bg-accent text-accent-foreground shadow-2xs"
                          : "text-line/60 hover:text-ink"
                      }`}
                      title="Tạo nhánh KO lấy đúng số đội đã chọn (bổ sung các đội hạng ba có hiệu số trung bình mỗi trận cao nhất, không dùng BYE)"
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
                      title="Tự động xếp hạt giống theo số lượng đội đi tiếp mỗi bảng (có thể dùng suất BYE nếu số đội không tròn lũy thừa 2)"
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
                    {koType === "total" && (
                      <button
                        type="button"
                        onClick={autoFillKoByAlphabet}
                        className={`btn-ghost text-xs font-bold flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition cursor-pointer ${
                          isKoLocked ? "opacity-60 cursor-not-allowed" : ""
                        }`}
                        title="Tự động xếp các đội vào 2 nhánh KO theo quy luật thứ hạng chữ cái bảng (Nhánh trái: 1A-2B, 1C-2D... / Nhánh phải: 1B-2A, 1D-2C...)"
                      >
                        ⚡ Tự động xếp vào
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleKoLock(ev.id)}
                      aria-label={isKoLocked ? "Mở khóa nhánh KO" : "Khóa nhánh KO"}
                      className={`grid size-8 place-items-center rounded-lg border transition-all cursor-pointer shadow-2xs ${
                        isKoLocked
                          ? "bg-[#e44c11] text-white border-[#e44c11] hover:bg-[#e44c11]/90"
                          : "bg-card text-[#0a3320] dark:text-emerald-300 border-line/25 hover:border-[#0a3320]/60 hover:bg-[#0a3320]/5"
                      }`}
                      title={
                        isKoLocked
                          ? "Nhánh KO đang khóa (bấm để mở khóa chỉnh sửa)"
                          : "Nhánh KO đang mở khóa (bấm để khóa lại tránh chỉnh sửa ngoài ý muốn)"
                      }
                    >
                      {isKoLocked ? (
                        <svg
                          className="size-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="5" y="11" width="14" height="10" rx="2.5" />
                          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                          <circle cx="12" cy="15.5" r="1" fill="currentColor" />
                          <path d="M12 16.5v2" />
                        </svg>
                      ) : (
                        <svg
                          className="size-[18px]"
                          viewBox="0 0 26 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="2" y="11" width="13" height="10" rx="2.5" />
                          <path d="M12 11V6.5a4 4 0 0 1 8 0v3.5" />
                          <circle cx="8.5" cy="15.5" r="1" fill="currentColor" />
                          <path d="M8.5 16.5v2" />
                        </svg>
                      )}
                    </button>
                  </div>
                </>
              )}

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

              {!isReadOnly && (
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
              )}
            </div>
          ) : tab === "timeline" ? (
            !isReadOnly ? (
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
            ) : null
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
              {!isReadOnly && (
                <>
                  <button
                    type="button"
                    className="btn-ghost text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg ring-1 ring-line/20 hover:bg-card shadow-2xs cursor-pointer text-[#0a3320] dark:text-emerald-300 font-semibold"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    onClick={() => {
                      if (rounds.length === 0) {
                        toast.warning("Chưa có lịch thi đấu để xuất ảnh/PDF. Vui lòng bấm tạo lịch trước!");
                        return;
                      }
                      setIsExportGroupModalOpen(true);
                    }}
                    title="Xuất ảnh hoặc file PDF sơ đồ lịch thi đấu các vòng sạch đẹp"
                  >
                    📸 Xuất ảnh / PDF sơ đồ
                  </button>
                  <div className="inline-flex items-center gap-1">
                    <button
                      className="btn-accent text-xs"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      onClick={buildGroups}
                    >
                      {ev.bracket === "rr" ? "Tạo lịch vòng tròn" : "Tạo lịch vòng bảng"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs !px-2.5 !py-2 font-bold text-line/70 hover:text-ink hover:bg-line/10 transition cursor-pointer"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      onClick={handleRestoreSchedule}
                      title="Khôi phục trạng thái ban đầu (xóa toàn bộ lịch thi đấu và điểm số để tạo lại từ đầu)"
                      aria-label="Khôi phục trạng thái ban đầu"
                    >
                      ↺
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {tab === "timeline" && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Nút Toàn màn hình Timeline */}
            <button
              type="button"
              onClick={() => {
                setColWidth(168);
                setRowHeight(122);
                setTimelineScale(1);
                setIsFullscreenTimeline(true);
              }}
              className="btn-ghost text-xs !py-1.5 font-bold flex items-center gap-1.5 px-2.5 rounded-lg ring-1 ring-line/20 hover:bg-card shadow-2xs cursor-pointer text-accent hover:text-accent font-semibold"
              title="Xem toàn bộ timeline ở chế độ toàn màn hình"
            >
              ⛶ Toàn màn hình
            </button>

            {/* Thanh trượt zoom ngang (hỗ trợ zoom nhỏ xuống từ 20px) */}
            <div className="flex items-center gap-2 rounded-lg bg-card px-2.5 py-1 ring-1 ring-line/20 shadow-2xs">
              <span className="text-[11px] font-medium text-line/60">Zoom ngang:</span>
              <input
                type="range"
                min="20"
                max="400"
                step="1"
                value={colWidth}
                onChange={(e) => setColWidth(Number(e.target.value))}
                className="h-1.5 w-20 cursor-pointer accent-accent"
                title={`Độ rộng cột giờ: ${colWidth}px (kéo nhỏ để thu gọn màn hình)`}
              />
              <span className="w-9 text-[10px] font-mono text-line/50 text-right">{colWidth}px</span>
            </div>

            {/* Thanh trượt zoom dọc (cho phép zoom out từ 35px) */}
            <div className="flex items-center gap-2 rounded-lg bg-card px-2.5 py-1 ring-1 ring-line/20 shadow-2xs">
              <span className="text-[11px] font-medium text-line/60">Zoom dọc:</span>
              <input
                type="range"
                min="35"
                max="250"
                step="2"
                value={rowHeight}
                onChange={(e) => setRowHeight(Number(e.target.value))}
                className="h-1.5 w-20 cursor-pointer accent-accent"
                title={`Chiều cao hàng sân: ${rowHeight}px`}
              />
              <span className="w-9 text-[10px] font-mono text-line/50 text-right">{rowHeight}px</span>
            </div>

            {!isReadOnly && (
              <>
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
                  title="Xuất bảng lịch thi đấu Timeline ra file Excel (.xlsx)"
                >
                  📊 Xuất Excel
                </button>
              </>
            )}
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
                    {isRotatingDoubles(ev)
                      ? "📊 Bảng xếp hạng cá nhân tích lũy (Đổi partner ngẫu nhiên)"
                      : ev.bracket === "rr"
                        ? "📊 Bảng xếp hạng vòng tròn toàn thể (Không chia bảng)"
                        : `📊 Bảng xếp hạng toàn diện (${ev.groups.length || 1} bảng)`}
                  </span>
                  <span className="text-xs text-line/60">
                    {isRotatingDoubles(ev)
                      ? "(Điểm số cá nhân tích lũy qua từng trận • Ưu tiên: Tổng điểm → Hiệu số → Điểm ghi được)"
                      : ev.bracket === "rr"
                        ? "(Ưu tiên xếp hạng: Tổng điểm → Hiệu số → Đối đầu trực tiếp)"
                        : "(Xem chi tiết vị trí, số trận, hiệu số và điểm số)"}
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

              {isRotatingDoubles(ev) ? (
                <div className="panel overflow-hidden rounded-xl border border-line/15">
                  <div className="px-4 py-2.5 bg-accent/10 border-b border-line/15 flex items-center justify-between">
                    <span className="font-head text-xs font-bold uppercase tracking-wide text-accent">
                      Bảng xếp hạng cá nhân — Đổi partner ngẫu nhiên
                    </span>
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-bold text-accent">
                      {entries.length} VĐV
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-line/10 text-[10px] uppercase tracking-wide text-line/50">
                        <th className="w-8 sm:w-12 px-1.5 py-1.5 sm:px-3 sm:py-2 text-center">Hạng</th>
                        <th className="px-2 py-1.5 sm:px-3 sm:py-2 text-left">Vận động viên</th>
                        <th className="w-6 sm:w-12 py-1.5 sm:py-2 text-center px-0.5">Tr</th>
                        <th className="w-6 sm:w-12 py-1.5 sm:py-2 text-center px-0.5">T</th>
                        <th className="w-6 sm:w-12 py-1.5 sm:py-2 text-center px-0.5">B</th>
                        <th className="w-8 sm:w-16 py-1.5 sm:py-2 text-center px-0.5">HS</th>
                        <th className="w-10 sm:w-20 py-1.5 sm:py-2 text-center font-bold text-accent px-0.5">Tổng điểm</th>
                        {!isReadOnly && <th className="w-16 sm:w-24 py-1.5 sm:py-2 text-center px-0.5">Tác vụ</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {computeIndividualStandings(entries, groupMatches, ev, rankingCriteria, withdrawnEntryIds).map((r, i) => {
                        const rowEntry = state.entries.find((e) => e.id === r.entryId);
                        return (
                          <tr key={r.entryId} className="border-t border-line/10 hover:bg-card/50">
                            <td className="w-8 sm:w-12 px-1.5 py-1.5 sm:px-3 sm:py-2 text-center font-head font-bold text-line/50 tabular-nums">
                              {i + 1}
                            </td>
                            <td className="px-2 py-1.5 sm:px-3 sm:py-2 min-w-0">
                              <PlayerNameDisplay
                                entry={rowEntry}
                                fallback={r.playerName}
                                activePlayerNames={activePlayerNames}
                                truncate={false}
                              />
                            </td>
                            <td className="w-6 sm:w-12 py-1.5 sm:py-2 text-center tabular-nums px-0.5">{r.played}</td>
                            <td className="w-6 sm:w-12 py-1.5 sm:py-2 text-center font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums px-0.5">{r.win}</td>
                            <td className="w-6 sm:w-12 py-1.5 sm:py-2 text-center font-semibold text-destructive tabular-nums px-0.5">{r.loss}</td>
                            <td className="w-8 sm:w-16 py-1.5 sm:py-2 text-center tabular-nums px-0.5">{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                            <td className="w-10 sm:w-20 py-1.5 sm:py-2 text-center font-head text-sm font-bold text-accent tabular-nums px-0.5">{r.points}</td>
                            {!isReadOnly && (
                              <td className="w-16 sm:w-24 py-1.5 sm:py-2 text-center px-0.5">
                                <button
                                  type="button"
                                  onClick={() => toggleWithdrawn(r.entryId)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                    rowEntry?.withdrawn
                                      ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 ring-1 ring-emerald-500/30"
                                      : "bg-destructive/10 text-destructive hover:bg-destructive/20 ring-1 ring-destructive/20"
                                  }`}
                                  title={
                                    rowEntry?.withdrawn
                                      ? "Khôi phục thi đấu lại cho VĐV này"
                                      : "Đánh dấu VĐV bỏ cuộc (Hủy toàn bộ kết quả trận đấu trước đó trên BXH)"
                                  }
                                >
                                  {rowEntry?.withdrawn ? "Khôi phục" : "Bỏ cuộc"}
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : ev.bracket === "rr" ? (
                <div className="panel overflow-hidden rounded-xl border border-line/15">
                  <div className="px-4 py-2.5 bg-accent/10 border-b border-line/15 flex items-center justify-between">
                    <span className="font-head text-xs font-bold uppercase tracking-wide text-accent">
                      Bảng xếp hạng toàn thể — {entries.length} đội đấu vòng tròn
                    </span>
                    <span className="text-xs text-line/60">
                      Ưu tiên: {isTeamMode
                        ? (ev.mlpRankingCriteria || ["points", "h2h", "game_diff", "diff", "points_won_pct", "draw"]).map((c) => MLP_RANKING_CRITERIA_LABELS[c]?.label || c).join(" → ")
                        : rankingCriteria.map((c) => RANKING_CRITERIA_LABELS[c]).join(" → ")}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-line/10 text-[10px] uppercase tracking-wide text-line/50">
                          <th className="w-8 sm:w-12 px-1.5 py-1.5 sm:px-3 sm:py-2 text-center">Hạng</th>
                          <th className="px-2 py-1.5 sm:px-3 sm:py-2 text-left">Đội / VĐV</th>
                          <th className="w-6 sm:w-12 py-1.5 sm:py-2 text-center px-0.5">Tr</th>
                          <th className="w-6 sm:w-12 py-1.5 sm:py-2 text-center px-0.5">T</th>
                          <th className="w-6 sm:w-12 py-1.5 sm:py-2 text-center px-0.5">B</th>
                          {isTeamMode ? (
                            mlpStatOrder.map((crit) => {
                              if (crit === "game_diff") {
                                return (
                                  <th key={crit} className="w-8 sm:w-14 py-1.5 sm:py-2 text-center px-0.5" title="Hiệu số game thắng - thua">
                                    HS Game
                                  </th>
                                );
                              }
                              if (crit === "diff") {
                                return (
                                  <th key={crit} className="w-10 sm:w-16 py-1.5 sm:py-2 text-center px-0.5" title="Hiệu số điểm của tổng các trận con">
                                    HS Điểm
                                  </th>
                                );
                              }
                              if (crit === "points_won_pct") {
                                return (
                                  <th key={crit} className="w-10 sm:w-16 py-1.5 sm:py-2 text-center px-0.5 text-accent font-bold" title="Tỷ lệ điểm thắng (%)">
                                    %
                                  </th>
                                );
                              }
                              return null;
                            })
                          ) : (
                            <th className="w-8 sm:w-16 py-1.5 sm:py-2 text-center px-0.5">HS</th>
                          )}
                          <th className="w-10 sm:w-20 py-1.5 sm:py-2 text-center font-bold text-accent px-0.5">Điểm</th>
                          {!isReadOnly && <th className="w-16 sm:w-24 py-1.5 sm:py-2 text-center px-0.5">Tác vụ</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {computeStandings(
                          entries.map((e) => e.id),
                          groupMatches,
                          ev,
                          rankingCriteria,
                          withdrawnEntryIds,
                        ).map((r, i) => {
                          const rowEntry = state.entries.find((e) => e.id === r.entryId);
                          const subDiff = (r.subPointsFor || 0) - (r.subPointsAgainst || 0);
                          const gameDiff = (r.gamesWon || 0) - (r.gamesLost || 0);
                          return (
                            <tr key={r.entryId} className="border-t border-line/10 hover:bg-card/50">
                              <td className="w-8 sm:w-12 px-1.5 py-1.5 sm:px-3 sm:py-2 text-center font-head font-bold text-line/50 tabular-nums">
                                {i + 1}
                              </td>
                              <td className="px-2 py-1.5 sm:px-3 sm:py-2 min-w-0">
                                <PlayerNameDisplay
                                  entry={rowEntry}
                                  fallback={nameOf(r.entryId)}
                                  activePlayerNames={activePlayerNames}
                                  truncate={false}
                                />
                              </td>
                              <td className="w-6 sm:w-12 py-1.5 sm:py-2 text-center tabular-nums px-0.5">{r.played}</td>
                              <td className="w-6 sm:w-12 py-1.5 sm:py-2 text-center font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums px-0.5">{r.win}</td>
                              <td className="w-6 sm:w-12 py-1.5 sm:py-2 text-center font-semibold text-destructive tabular-nums px-0.5">{r.loss}</td>
                              {isTeamMode ? (
                                mlpStatOrder.map((crit) => {
                                  if (crit === "game_diff") {
                                    return (
                                      <td key={crit} className="w-8 sm:w-14 py-1.5 sm:py-2 text-center tabular-nums px-0.5 font-medium">
                                        {gameDiff > 0 ? `+${gameDiff}` : gameDiff}
                                      </td>
                                    );
                                  }
                                  if (crit === "diff") {
                                    return (
                                      <td key={crit} className="w-10 sm:w-16 py-1.5 sm:py-2 text-center tabular-nums px-0.5 font-semibold text-line/90">
                                        {subDiff > 0 ? `+${subDiff}` : subDiff}
                                      </td>
                                    );
                                  }
                                  if (crit === "points_won_pct") {
                                    return (
                                      <td key={crit} className="w-10 sm:w-16 py-1.5 sm:py-2 text-center tabular-nums px-0.5 font-bold text-accent">
                                        {r.pointsWonPct ? `${r.pointsWonPct.toFixed(1)}%` : "0.0%"}
                                      </td>
                                    );
                                  }
                                  return null;
                                })
                              ) : (
                                <td className="w-8 sm:w-16 py-1.5 sm:py-2 text-center tabular-nums px-0.5">{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                              )}
                              <td className="w-10 sm:w-20 py-1.5 sm:py-2 text-center font-head text-sm font-bold text-accent tabular-nums px-0.5">{r.points}</td>
                              {!isReadOnly && (
                                <td className="w-16 sm:w-24 py-1.5 sm:py-2 text-center px-0.5">
                                  <button
                                    type="button"
                                    onClick={() => toggleWithdrawn(r.entryId)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                      rowEntry?.withdrawn
                                        ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 ring-1 ring-emerald-500/30"
                                        : "bg-destructive/10 text-destructive hover:bg-destructive/20 ring-1 ring-destructive/20"
                                    }`}
                                    title={
                                      rowEntry?.withdrawn
                                        ? "Khôi phục thi đấu lại cho đội này"
                                        : "Đánh dấu đội bỏ cuộc (Hủy toàn bộ kết quả trận đấu trước đó trên BXH)"
                                    }
                                  >
                                    {rowEntry?.withdrawn ? "Khôi phục" : "Bỏ cuộc"}
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {(ev.groups.length
                    ? ev.groups
                    : [{ name: "Vòng tròn", entryIds: entries.map((e) => e.id) }]
                  ).map((g) => {
                    const rows = computeStandings(
                      g.entryIds,
                      groupMatches.filter((m) => m.groupName === g.name),
                      ev,
                      rankingCriteria,
                      withdrawnEntryIds,
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
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-line/10 text-[10px] uppercase tracking-wide text-line/50">
                                <th className="px-2 py-1.5 sm:px-3 sm:py-2 text-left">Đội</th>
                                <th className="w-6 sm:w-8 py-1.5 sm:py-2 text-center px-0.5">Tr</th>
                                <th className="w-6 sm:w-8 py-1.5 sm:py-2 text-center px-0.5">T</th>
                                <th className="w-6 sm:w-8 py-1.5 sm:py-2 text-center px-0.5">B</th>
                                {isTeamMode ? (
                                  mlpStatOrder.map((crit) => {
                                    if (crit === "game_diff") {
                                      return (
                                        <th key={crit} className="w-8 sm:w-10 py-1.5 sm:py-2 text-center px-0.5" title="Hiệu số game thắng - thua">
                                          HS G
                                        </th>
                                      );
                                    }
                                    if (crit === "diff") {
                                      return (
                                        <th key={crit} className="w-8 sm:w-12 py-1.5 sm:py-2 text-center px-0.5" title="Hiệu số điểm của tổng các trận con">
                                          HS Đ
                                        </th>
                                      );
                                    }
                                    if (crit === "points_won_pct") {
                                      return (
                                        <th key={crit} className="w-10 sm:w-14 py-1.5 sm:py-2 text-center px-0.5 text-accent font-bold" title="Tỷ lệ điểm thắng (%)">
                                          %
                                        </th>
                                      );
                                    }
                                    return null;
                                  })
                                ) : (
                                  <th className="w-8 sm:w-11 py-1.5 sm:py-2 text-center px-0.5">HS</th>
                                )}
                                <th className="w-8 sm:w-11 py-1.5 sm:py-2 text-center px-0.5 font-bold text-accent">Đ</th>
                                {!isReadOnly && <th className="w-8 py-1.5 sm:py-2 text-center px-0.5">T/vụ</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r, i) => {
                                const rowEntry = state.entries.find((e) => e.id === r.entryId);
                                const subDiff = (r.subPointsFor || 0) - (r.subPointsAgainst || 0);
                                const gameDiff = (r.gamesWon || 0) - (r.gamesLost || 0);
                                return (
                                  <tr key={r.entryId} className="border-t border-line/10 hover:bg-card/50">
                                    <td className="px-2 py-1.5 sm:px-3 sm:py-2 min-w-0">
                                      <span className="inline-block w-4 font-head font-bold text-line/40 tabular-nums mr-0.5">{i + 1}</span>
                                      <PlayerNameDisplay
                                        entry={rowEntry}
                                        fallback={nameOf(r.entryId)}
                                        activePlayerNames={activePlayerNames}
                                        truncate={false}
                                      />
                                    </td>
                                    <td className="w-6 sm:w-8 py-1.5 sm:py-2 text-center tabular-nums px-0.5">{r.played}</td>
                                    <td className="w-6 sm:w-8 py-1.5 sm:py-2 text-center tabular-nums px-0.5">{r.win}</td>
                                    <td className="w-6 sm:w-8 py-1.5 sm:py-2 text-center tabular-nums px-0.5">{r.loss}</td>
                                    {isTeamMode ? (
                                      mlpStatOrder.map((crit) => {
                                        if (crit === "game_diff") {
                                          return (
                                            <td key={crit} className="w-8 sm:w-10 py-1.5 sm:py-2 text-center tabular-nums px-0.5 font-medium">
                                              {gameDiff > 0 ? `+${gameDiff}` : gameDiff}
                                            </td>
                                          );
                                        }
                                        if (crit === "diff") {
                                          return (
                                            <td key={crit} className="w-8 sm:w-12 py-1.5 sm:py-2 text-center tabular-nums px-0.5 font-semibold text-line/90">
                                              {subDiff > 0 ? `+${subDiff}` : subDiff}
                                            </td>
                                          );
                                        }
                                        if (crit === "points_won_pct") {
                                          return (
                                            <td key={crit} className="w-10 sm:w-14 py-1.5 sm:py-2 text-center tabular-nums px-0.5 font-bold text-accent">
                                              {r.pointsWonPct ? `${r.pointsWonPct.toFixed(1)}%` : "0.0%"}
                                            </td>
                                          );
                                        }
                                        return null;
                                      })
                                    ) : (
                                      <td className="w-8 sm:w-11 py-1.5 sm:py-2 text-center tabular-nums px-0.5">{r.diff}</td>
                                    )}
                                    <td className="w-8 sm:w-11 py-1.5 sm:py-2 text-center font-bold text-accent tabular-nums px-0.5">{r.points}</td>
                                    {!isReadOnly && (
                                      <td className="w-8 py-1.5 sm:py-2 text-center px-0.5">
                                        <button
                                          type="button"
                                          onClick={() => toggleWithdrawn(r.entryId)}
                                          className={`text-[10px] font-bold p-1 rounded transition cursor-pointer ${
                                            rowEntry?.withdrawn
                                              ? "text-emerald-600 hover:bg-emerald-500/20"
                                              : "text-line/40 hover:text-destructive hover:bg-destructive/10"
                                          }`}
                                          title={rowEntry?.withdrawn ? "Khôi phục đội thi đấu" : "Đánh dấu đội bỏ cuộc"}
                                        >
                                          {rowEntry?.withdrawn ? "♻️" : "🚫"}
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-12 !mt-0 pt-[2px]">
              {/* Cột lịch thi đấu theo vòng */}
              <div className={showStandings ? "lg:col-span-8" : "lg:col-span-12"}>
                {rounds.length === 0 ? (
                  <div className="panel p-6 text-center text-sm text-line/60">
                    {isReadOnly ? (
                      "Chưa có lịch thi đấu vòng bảng."
                    ) : (
                      <>
                        Chưa có lịch thi đấu vòng bảng. Bấm nút <strong>“Tạo lịch vòng bảng”</strong> để bắt đầu.
                      </>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2.5 px-1">
                      <span className="font-head text-xs font-bold uppercase tracking-wide text-line/80">
                        {ev.bracket === "rr" ? "Lịch đấu vòng tròn" : "Lịch đấu vòng bảng"} ({rounds.length} vòng)
                      </span>
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-4 pt-[2px]">
                    {rounds.map((r, idx) => {
                      const thisRoundMatches = groupMatches.filter((m) => m.round === r);
                      const roundMatchesCount = thisRoundMatches.length;
                      const isRoundDone =
                        roundMatchesCount > 0 &&
                        thisRoundMatches.every(
                          (m) => m.status === "done" || (m.scoreA !== null && m.scoreB !== null),
                        );
                      return (
                        <div
                          key={r}
                          className={`w-[280px] shrink-0 pt-[2px] ${idx === 0 ? "pl-[3px] pr-[3px]" : "px-[3px]"}`}
                        >
                          <div
                            className={`rounded-xl h-[40px] flex items-center justify-center gap-1.5 text-center font-head text-sm font-bold uppercase tracking-wide ring-1 px-2 transition-all ${
                              isRoundDone
                                ? "text-ink ring-line/15"
                                : "bg-accent/15 text-accent ring-accent/30"
                            }`}
                            style={{
                              fontFamily: "'Space Grotesk', sans-serif",
                              ...(isRoundDone ? { backgroundColor: "var(--muted)" } : {}),
                            }}
                          >
                            <span>Vòng {r}</span>
                            <span className="text-xs font-normal opacity-70 lowercase tracking-normal">
                              ({roundMatchesCount} trận)
                            </span>
                          </div>
                        <div className="mt-3 space-y-3">
                          {thisRoundMatches
                            .sort((a, b) => a.groupName.localeCompare(b.groupName))
                            .map((m) => (
                              <MatchCard key={m.id} {...cardProps(m)} />
                            ))}
                        </div>
                      </div>
                    );
                  })}

                  {isRotatingDoubles(ev) && (
                    !isReadOnly && canDrawMoreRotatingRounds ? (
                      <div className="w-[260px] shrink-0 pt-[2px] px-[3px] flex flex-col">
                        <button
                          type="button"
                          onClick={handleNextRotatingRound}
                          className="w-full flex-1 min-h-[160px] rounded-xl border-2 border-dashed border-[#093220]/40 bg-[#093220]/5 hover:bg-[#093220]/10 hover:border-[#093220] flex flex-col items-center justify-center gap-2.5 p-4 text-center transition cursor-pointer group"
                        >
                          <div className="w-11 h-11 rounded-full bg-[#093220]/15 text-[#093220] flex items-center justify-center text-xl group-hover:scale-110 transition shadow-2xs">
                            🎲
                          </div>
                          <div>
                            <span className="font-head text-sm font-bold uppercase tracking-wide text-[#093220] block">
                              Bốc thăm tiếp Vòng {rounds.length + 1}
                            </span>
                            {completedRotatingRoundsCount > 0 && (
                              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold block mt-1">
                                ✓ Đã hoàn thành {completedRotatingRoundsCount}/${maxAllowedRotatingRounds} vòng
                              </span>
                            )}
                          </div>
                        </button>
                      </div>
                    ) : isRotatingRoundsCompleted &&
                      rounds.length > 0 &&
                      Boolean(ev.randomRoundsCount && ev.randomRoundsCount > 0) ? (
                      <div className="w-[260px] shrink-0 pt-[2px] px-[3px] flex flex-col">
                        <div className="w-full flex-1 min-h-[160px] rounded-xl border border-[#093220]/30 bg-[#093220]/5 flex flex-col items-center justify-center gap-2 p-4 text-center shadow-2xs">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold transition-all ${
                              completedRotatingRoundsCount === maxAllowedRotatingRounds
                                ? "bg-emerald-600 text-white shadow-xs"
                                : completedRotatingRoundsCount > 0
                                  ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                                  : "bg-[#093220]/15 text-[#093220]"
                            }`}
                          >
                            ✓
                          </div>
                          <div>
                            <span className="font-head text-xs font-bold uppercase tracking-wide text-[#093220] block">
                              {completedRotatingRoundsCount > 0
                                ? `Đã hoàn thành ${completedRotatingRoundsCount}/${maxAllowedRotatingRounds} vòng`
                                : `Đã tạo đủ ${rounds.length}/${maxAllowedRotatingRounds} vòng`}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : null
                  )}
                  </div>
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
                  {isRotatingDoubles(ev) ? (
                    <div className="panel mt-3 overflow-hidden rounded-xl border border-line/15">
                      <div className="px-3 py-2 bg-accent/10 border-b border-line/15 flex items-center justify-between">
                        <span className="font-head text-xs font-bold uppercase tracking-wide text-accent">
                          BXH cá nhân tích lũy
                        </span>
                        <span className="text-[10px] font-bold text-accent">
                          {entries.length} VĐV
                        </span>
                      </div>
                      <table className="w-full table-fixed text-xs">
                        <thead>
                          <tr className="border-b border-line/10 text-[10px] uppercase tracking-wide text-line/50">
                            <th className="w-7 py-2 text-center">#</th>
                            <th className="px-2 py-2 text-left">VĐV</th>
                            <th className="w-7 py-2 text-center">Tr</th>
                            <th className="w-7 py-2 text-center">T</th>
                            <th className="w-7 py-2 text-center">B</th>
                            <th className="w-9 py-2 text-center">HS</th>
                            <th className="w-9 py-2 text-center font-bold text-accent">Đ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {computeIndividualStandings(entries, groupMatches, ev, rankingCriteria, withdrawnEntryIds).map((r, i) => {
                            const rowEntry = state.entries.find((e) => e.id === r.entryId);
                            return (
                              <tr key={r.entryId} className="border-t border-line/10 hover:bg-card/50">
                                <td className="w-7 py-2 text-center font-head font-bold text-line/40 tabular-nums">
                                  {i + 1}
                                </td>
                                <td className="truncate px-2 py-2">
                                  <PlayerNameDisplay
                                    entry={rowEntry}
                                    fallback={r.playerName}
                                    activePlayerNames={activePlayerNames}
                                  />
                                </td>
                                <td className="w-7 py-2 text-center tabular-nums">{r.played}</td>
                                <td className="w-7 py-2 text-center font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{r.win}</td>
                                <td className="w-7 py-2 text-center font-semibold text-destructive tabular-nums">{r.loss}</td>
                                <td className="w-9 py-2 text-center tabular-nums">{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                                <td className="w-9 py-2 text-center font-head font-bold text-accent tabular-nums">{r.points}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : ev.bracket === "rr" ? (
                    <div className="panel mt-3 overflow-hidden rounded-xl border border-line/15">
                      <div className="px-3 py-2 bg-accent/10 border-b border-line/15 flex items-center justify-between">
                        <span className="font-head text-xs font-bold uppercase tracking-wide text-accent">
                          BXH vòng tròn toàn thể
                        </span>
                        <span className="text-[10px] font-bold text-accent">
                          {entries.length} đội
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-line/10 text-[10px] uppercase tracking-wide text-line/50">
                              <th className="w-7 py-2 text-center">#</th>
                              <th className="px-2 py-2 text-left">Đội</th>
                              <th className="w-7 py-2 text-center">Tr</th>
                              <th className="w-7 py-2 text-center">T</th>
                              <th className="w-7 py-2 text-center">B</th>
                              {isTeamMode ? (
                                primaryTeamStat === "points_won_pct" ? (
                                  <th className="w-12 py-2 text-center text-accent font-bold" title="Tỷ lệ điểm thắng (%)">%</th>
                                ) : primaryTeamStat === "game_diff" ? (
                                  <th className="w-9 py-2 text-center" title="Hiệu số game thắng - thua">HS G</th>
                                ) : (
                                  <th className="w-9 py-2 text-center" title="Hiệu số điểm các trận con">HS</th>
                                )
                              ) : (
                                <th className="w-9 py-2 text-center">HS</th>
                              )}
                              <th className="w-9 py-2 text-center font-bold text-accent">Đ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {computeStandings(
                              entries.map((e) => e.id),
                              groupMatches,
                              ev,
                              rankingCriteria,
                              withdrawnEntryIds,
                            ).map((r, i) => {
                              const rowEntry = state.entries.find((e) => e.id === r.entryId);
                              const subDiff = (r.subPointsFor || 0) - (r.subPointsAgainst || 0);
                              const gameDiff = (r.gamesWon || 0) - (r.gamesLost || 0);
                              return (
                                <tr key={r.entryId} className="border-t border-line/10 hover:bg-card/50">
                                  <td className="w-7 py-2 text-center font-head font-bold text-line/40 tabular-nums">
                                    {i + 1}
                                  </td>
                                  <td className="truncate px-2 py-2">
                                    <PlayerNameDisplay
                                      entry={rowEntry}
                                      fallback={nameOf(r.entryId)}
                                      activePlayerNames={activePlayerNames}
                                    />
                                  </td>
                                  <td className="w-7 py-2 text-center tabular-nums">{r.played}</td>
                                  <td className="w-7 py-2 text-center font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{r.win}</td>
                                  <td className="w-7 py-2 text-center font-semibold text-destructive tabular-nums">{r.loss}</td>
                                  {isTeamMode ? (
                                    primaryTeamStat === "points_won_pct" ? (
                                      <td className="w-12 py-2 text-center tabular-nums font-bold text-accent">{r.pointsWonPct ? `${r.pointsWonPct.toFixed(1)}%` : "0.0%"}</td>
                                    ) : primaryTeamStat === "game_diff" ? (
                                      <td className="w-9 py-2 text-center tabular-nums font-medium">{gameDiff > 0 ? `+${gameDiff}` : gameDiff}</td>
                                    ) : (
                                      <td className="w-9 py-2 text-center tabular-nums font-semibold text-line/90">{subDiff > 0 ? `+${subDiff}` : subDiff}</td>
                                    )
                                  ) : (
                                    <td className="w-9 py-2 text-center tabular-nums">{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                                  )}
                                  <td className="w-9 py-2 text-center font-head font-bold text-accent tabular-nums">{r.points}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    (ev.groups.length
                      ? ev.groups
                      : [{ name: "Vòng tròn", entryIds: entries.map((e) => e.id) }]
                    ).map((g) => {
                      const rows = computeStandings(
                        g.entryIds,
                        groupMatches.filter((m) => m.groupName === g.name),
                        ev,
                        rankingCriteria,
                        withdrawnEntryIds,
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
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-line/10 text-[10px] uppercase tracking-wide text-line/50">
                                  <th className="px-3 py-2 text-left">Đội</th>
                                  <th className="w-7 py-2 text-center">Tr</th>
                                  <th className="w-7 py-2 text-center">T</th>
                                  <th className="w-7 py-2 text-center">B</th>
                                  {isTeamMode ? (
                                    primaryTeamStat === "points_won_pct" ? (
                                      <th className="w-12 py-2 text-center text-accent font-bold" title="Tỷ lệ điểm thắng (%)">%</th>
                                    ) : primaryTeamStat === "game_diff" ? (
                                      <th className="w-8 py-2 text-center" title="Hiệu số game thắng - thua">HS G</th>
                                    ) : (
                                      <th className="w-8 py-2 text-center" title="Hiệu số điểm các trận con">HS</th>
                                    )
                                  ) : (
                                    <th className="w-10 py-2 text-center">HS</th>
                                  )}
                                  <th className="w-9 py-2 text-center font-bold text-accent">Đ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((r, i) => {
                                  const rowEntry = state.entries.find((e) => e.id === r.entryId);
                                  const subDiff = (r.subPointsFor || 0) - (r.subPointsAgainst || 0);
                                  const gameDiff = (r.gamesWon || 0) - (r.gamesLost || 0);
                                  return (
                                    <tr key={r.entryId} className="border-t border-line/10 hover:bg-card/50">
                                      <td className="truncate px-3 py-2">
                                        <span className="inline-block w-4 font-head font-bold text-line/40 tabular-nums">{i + 1}</span>
                                        <PlayerNameDisplay
                                          entry={rowEntry}
                                          fallback={nameOf(r.entryId)}
                                          activePlayerNames={activePlayerNames}
                                        />
                                      </td>
                                      <td className="w-7 py-2 text-center tabular-nums">{r.played}</td>
                                      <td className="w-7 py-2 text-center tabular-nums">{r.win}</td>
                                      <td className="w-7 py-2 text-center tabular-nums">{r.loss}</td>
                                      {isTeamMode ? (
                                        primaryTeamStat === "points_won_pct" ? (
                                          <td className="w-12 py-2 text-center tabular-nums font-bold text-accent">{r.pointsWonPct ? `${r.pointsWonPct.toFixed(1)}%` : "0.0%"}</td>
                                        ) : primaryTeamStat === "game_diff" ? (
                                          <td className="w-8 py-2 text-center tabular-nums font-medium">{gameDiff > 0 ? `+${gameDiff}` : gameDiff}</td>
                                        ) : (
                                          <td className="w-8 py-2 text-center tabular-nums font-semibold text-line/90">{subDiff > 0 ? `+${subDiff}` : subDiff}</td>
                                        )
                                      ) : (
                                        <td className="w-10 py-2 text-center tabular-nums">{r.diff}</td>
                                      )}
                                      <td className="w-9 py-2 text-center font-bold text-accent tabular-nums">{r.points}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ---------- TIMELINE SÂN VÀ KHUNG GIỜ ---------- */}
      {tab === "timeline" && (
        <div className="space-y-4">
          {!isReadOnly && unassignedMatches.length > 0 && (
            <div className="flex items-center justify-end text-xs text-line/60">
              <span className="font-bold text-amber-600 dark:text-amber-400">
                Còn {unassignedMatches.length} trận chưa xếp giờ
              </span>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-12 items-start min-w-0">
            {/* Bảng timeline với sticky headers */}
            <div className={`${!isReadOnly && showQueue ? "lg:col-span-9" : "lg:col-span-12"} panel overflow-hidden rounded-2xl flex flex-col min-w-0`}>
              {renderTimelineGrid()}
            </div>

            {/* Cột trận chờ xếp lịch bên phải - ghim cố định chạy theo màn hình khi cuộn */}
            {!isReadOnly && showQueue && (
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

                {/* Lựa chọn hiển thị theo vòng hoặc theo bảng */}
                <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-secondary/50 p-0.5 ring-1 ring-line/15 text-[11px] shrink-0">
                  <button
                    type="button"
                    onClick={() => setQueueGroupBy("round")}
                    className={`rounded-md py-1 font-bold transition cursor-pointer ${
                      queueGroupBy === "round"
                        ? "bg-card text-ink shadow-2xs ring-1 ring-line/10"
                        : "text-line/60 hover:text-ink"
                    }`}
                  >
                    Theo vòng
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueGroupBy("group")}
                    className={`rounded-md py-1 font-bold transition cursor-pointer ${
                      queueGroupBy === "group"
                        ? "bg-card text-ink shadow-2xs ring-1 ring-line/10"
                        : "text-line/60 hover:text-ink"
                    }`}
                  >
                    Theo bảng
                  </button>
                </div>

                <div className="mt-3 flex-1 overflow-y-auto space-y-3 pr-1">
                  {unassignedSections.length === 0 ? (
                    <p className="py-8 text-center text-xs text-line/40">
                      Tất cả các trận đã được xếp lịch!
                    </p>
                  ) : (
                    unassignedSections.map((grp) => (
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
                            {queueGroupBy === "group" && grp.stage === "group"
                              ? "⚡ Xếp bảng này"
                              : "⚡ Xếp vòng này"}
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          {grp.matches.map((m) => (
                            <div
                              key={m.id}
                              draggable
                              onDragStart={(e) => {
                                dragGrabPxRef.current = null;
                                e.dataTransfer.setData("text/plain", m.id);
                                e.dataTransfer.effectAllowed = "move";
                                setTimeout(() => setDragMatch(m.id), 0);
                              }}
                              onDragEnd={() => {
                                setDragMatch(null);
                                dragGrabPxRef.current = null;
                              }}
                              className="cursor-grab active:cursor-grabbing rounded-lg bg-card p-2 text-xs ring-1 ring-line/15 hover:ring-accent/50 shadow-xs transition"
                            >
                              <div className="flex items-center justify-between gap-1 text-[10px] text-line/60 pb-1 border-b border-line/10">
                                <span className="font-bold text-ink">
                                  {m.stage === "ko"
                                    ? m.koRound || groupTag(m.groupName)
                                    : queueGroupBy === "group"
                                      ? `Vòng ${m.round}`
                                      : !m.groupName || m.groupName.toLowerCase().includes("vòng tròn") || m.groupName === "rr"
                                        ? `V${m.round}`
                                        : groupTag(m.groupName)}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-1 text-[11px]">
                                <div className="truncate flex-1">
                                  <PlayerNameDisplay
                                    entry={getMatchEntryA(m, state.entries)}
                                    fallback={resolveSideLabel(m, "aId")}
                                    activePlayerNames={activePlayerNames}
                                  />
                                </div>
                                <span className="shrink-0 text-line/40 font-mono text-[10px] font-bold px-1">vs</span>
                                <div className="truncate flex-1 text-right">
                                  <PlayerNameDisplay
                                    entry={getMatchEntryB(m, state.entries)}
                                    fallback={resolveSideLabel(m, "bId")}
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
        <div className="flex flex-col lg:flex-row items-start gap-6">
          {/* Cột kéo thả VĐV vào nhánh KO - GHIM CỐ ĐỊNH CHẠY THEO TRANG KHI CUỘN */}
          {!isReadOnly && showManualSeeding && (
            <div className="w-full lg:w-[310px] shrink-0 panel p-3.5 rounded-2xl lg:sticky lg:top-4 lg:left-4 self-start max-h-[calc(100vh-2rem)] flex flex-col shadow-xl ring-1 ring-line/20 z-20">
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
                {hasGroupStage && !allGroupStageDone
                  ? "Vòng bảng chưa kết thúc: Kéo thả ký hiệu thứ hạng bảng (1A, 2A, 1B...) vào nhánh KO. Khi có kết quả toàn bộ vòng bảng, tên đội sẽ tự động cập nhật vào đúng thứ hạng!"
                  : "Kéo tên đội bên dưới thả trực tiếp vào ô trong nhánh. Danh sách luôn ghim cố định khi cuộn màn hình."}
              </p>

              <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
                {(ev.groups.length
                  ? ev.groups
                  : [{ name: "Tất cả đội", entryIds: entries.map((e) => e.id) }]
                ).map((g, gIdx) => {
                  const gM = groupMatches.filter((x) => x.groupName === g.name);
                  const standings = computeStandings(g.entryIds, gM, ev);
                  const cleanGName =
                    g.name.replace(/^Bảng\s+/i, "").trim() || String.fromCharCode(65 + gIdx);
                  const c = groupColor(g.name);
                  const showOnlyRankBadge = hasGroupStage && !allGroupStageDone;

                  return (
                    <div key={g.name} className="rounded-xl border border-line/15 bg-card/60 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span
                          className="font-head text-xs font-bold px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: c.bg, color: c.text }}
                        >
                          {g.name} ({g.entryIds.length} đội)
                        </span>
                        {showOnlyRankBadge && (
                          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            Chờ xong vòng bảng
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {standings.map((st, idx) => {
                          const e = entries.find((x) => x.id === st.entryId);
                          if (!e) return null;
                          const rankLabel = `${idx + 1}${cleanGName.replace(/\s+/g, "").toUpperCase()}`;

                          if (showOnlyRankBadge) {
                            return (
                              <div
                                key={rankLabel}
                                draggable={!isKoLocked}
                                onDragStart={() => {
                                  setDragRankPlaceholder(rankLabel);
                                  setDragEntry(null);
                                }}
                                onDragEnd={() => setDragRankPlaceholder(null)}
                                className="cursor-grab truncate rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow-xs ring-1 ring-line/15 active:cursor-grabbing bg-secondary text-line/80 hover:bg-secondary/80 flex items-center justify-between transition gap-2"
                                title={`Kéo thả vị trí hạng ${idx + 1} bảng ${cleanGName} (${rankLabel}) vào ô trong nhánh KO`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono text-xs font-bold text-accent bg-accent/15 px-2 py-0.5 rounded shrink-0 border border-accent/30">
                                    {rankLabel}
                                  </span>
                                  <span className="text-xs text-line/60 font-medium truncate">
                                    Hạng {idx + 1} {g.name}
                                  </span>
                                </div>
                                <span className="text-[10px] text-line/40 shrink-0">Kéo ⇲</span>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={e.id}
                              draggable={!isKoLocked}
                              onDragStart={() => {
                                setDragEntry(e.id);
                                setDragRankPlaceholder(null);
                              }}
                              onDragEnd={() => setDragEntry(null)}
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
          <div
            className={`w-max ${
              !isReadOnly && showManualSeeding ? "min-w-full lg:min-w-[calc(100%-334px)]" : "min-w-full"
            } flex-1 pb-6`}
          >
            {koRounds.length === 0 ? (
              <div className="panel p-6 text-center text-sm text-line/60 rounded-2xl w-full max-w-[calc(100vw-4rem)]">
                {isReadOnly ? (
                  "Chưa có nhánh loại trực tiếp."
                ) : (
                  <>
                    Chưa có nhánh loại trực tiếp. Bấm <strong>“Tạo nhánh KO”</strong> để sinh sơ đồ.
                  </>
                )}
              </div>
            ) : (
              renderKoBracketTree()
            )}
          </div>
        </div>
      )}

      {/* MODAL TOÀN MÀN HÌNH TIMELINE SÂN */}
      {isFullscreenTimeline && (
        <div className="fixed inset-0 z-50 bg-paper flex flex-col overflow-hidden">
          {/* Thanh công cụ gọn trên cùng */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5 px-2.5 sm:px-3 py-1.5 bg-card border-b border-line/15 z-30 shadow-xs shrink-0">
            {/* Thu phóng tỷ lệ tổng thể (zoom nhỏ xuống 20% để xem toàn bộ lịch) */}
            <div className="flex items-center gap-1 bg-paper px-1.5 sm:px-2 py-0.5 rounded-lg border border-line/20 text-xs">
              <span className="text-[10px] text-line/60 font-medium">Thu phóng:</span>
              <button
                type="button"
                onClick={() => setTimelineScale((s) => Math.max(0.2, Math.round((s - 0.1) * 100) / 100))}
                className="size-5 rounded bg-line/10 hover:bg-line/20 flex items-center justify-center font-bold text-xs cursor-pointer"
                title="Thu nhỏ toàn bộ bảng timeline"
              >
                -
              </button>
              <input
                type="range"
                min="0.2"
                max="1.5"
                step="0.05"
                value={timelineScale}
                onChange={(e) => setTimelineScale(Number(e.target.value))}
                className="h-1.5 w-14 sm:w-20 cursor-pointer accent-accent"
                title={`Tỷ lệ thu phóng: ${Math.round(timelineScale * 100)}%`}
              />
              <button
                type="button"
                onClick={() => setTimelineScale((s) => Math.min(1.5, Math.round((s + 0.1) * 100) / 100))}
                className="size-5 rounded bg-line/10 hover:bg-line/20 flex items-center justify-center font-bold text-xs cursor-pointer"
                title="Phóng to toàn bộ bảng timeline"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setTimelineScale(1)}
                className="text-[10px] font-mono font-bold text-accent hover:underline w-8 text-right cursor-pointer"
                title="Bấm để đặt lại tỷ lệ 100%"
              >
                {Math.round(timelineScale * 100)}%
              </button>
            </div>

            {/* Zoom ngang */}
            <div className="flex items-center gap-1 bg-paper px-1.5 sm:px-2 py-0.5 rounded-lg border border-line/20 text-xs">
              <span className="text-[10px] text-line/60 hidden sm:inline">Zoom ngang:</span>
              <span className="text-[10px] text-line/60 sm:hidden">Ngang:</span>
              <button
                type="button"
                onClick={() => setColWidth((w) => Math.max(20, w - 8))}
                className="size-5 rounded bg-line/10 hover:bg-line/20 flex items-center justify-center font-bold text-xs cursor-pointer"
                title="Thu nhỏ cột giờ"
              >
                -
              </button>
              <input
                type="range"
                min="20"
                max="350"
                step="1"
                value={colWidth}
                onChange={(e) => setColWidth(Number(e.target.value))}
                className="h-1.5 w-12 sm:w-20 cursor-pointer accent-accent"
              />
              <button
                type="button"
                onClick={() => setColWidth((w) => Math.min(350, w + 8))}
                className="size-5 rounded bg-line/10 hover:bg-line/20 flex items-center justify-center font-bold text-xs cursor-pointer"
                title="Phóng to cột giờ"
              >
                +
              </button>
              <span className="text-[10px] font-mono text-line/50 w-8 text-right">{colWidth}px</span>
            </div>

            {/* Zoom dọc */}
            <div className="flex items-center gap-1 bg-paper px-1.5 sm:px-2 py-0.5 rounded-lg border border-line/20 text-xs">
              <span className="text-[10px] text-line/60 hidden sm:inline">Zoom dọc:</span>
              <span className="text-[10px] text-line/60 sm:hidden">Dọc:</span>
              <button
                type="button"
                onClick={() => setRowHeight((h) => Math.max(35, h - 8))}
                className="size-5 rounded bg-line/10 hover:bg-line/20 flex items-center justify-center font-bold text-xs cursor-pointer"
                title="Thu nhỏ hàng sân"
              >
                -
              </button>
              <input
                type="range"
                min="35"
                max="250"
                step="2"
                value={rowHeight}
                onChange={(e) => setRowHeight(Number(e.target.value))}
                className="h-1.5 w-12 sm:w-20 cursor-pointer accent-accent"
              />
              <button
                type="button"
                onClick={() => setRowHeight((h) => Math.min(250, h + 8))}
                className="size-5 rounded bg-line/10 hover:bg-line/20 flex items-center justify-center font-bold text-xs cursor-pointer"
                title="Phóng to hàng sân"
              >
                +
              </button>
              <span className="text-[10px] font-mono text-line/50 w-8 text-right">{rowHeight}px</span>
            </div>

            {/* Nút Đóng */}
            <button
              type="button"
              onClick={() => setIsFullscreenTimeline(false)}
              className="rounded-lg bg-black/80 hover:bg-black text-white px-2.5 sm:px-3 py-1.5 text-xs font-bold cursor-pointer transition shadow-sm shrink-0"
            >
              ✕ Đóng<span className="hidden sm:inline"> (Esc)</span>
            </button>
          </div>

          {/* Vùng hiển thị toàn màn hình cuộn trực tiếp ngang/dọc & hỗ trợ chụm 2 ngón thu phóng */}
          <div
            className="flex-1 overflow-auto relative bg-card/30 flex flex-col"
            style={{ touchAction: "pan-x pan-y" }}
            onTouchStart={(e) => {
              if (e.touches.length === 2) {
                const dist = Math.hypot(
                  e.touches[0].clientX - e.touches[1].clientX,
                  e.touches[0].clientY - e.touches[1].clientY,
                );
                fullscreenPinchRef.current = { dist, scale: timelineScale };
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 2) {
                const dist = Math.hypot(
                  e.touches[0].clientX - e.touches[1].clientX,
                  e.touches[0].clientY - e.touches[1].clientY,
                );
                if (!fullscreenPinchRef.current) {
                  fullscreenPinchRef.current = { dist, scale: timelineScale };
                  return;
                }
                const ratio = dist / Math.max(1, fullscreenPinchRef.current.dist);
                const next = Math.min(1.5, Math.max(0.2, Math.round(fullscreenPinchRef.current.scale * ratio * 100) / 100));
                setTimelineScale(next);
              }
            }}
            onTouchEnd={(e) => {
              if (e.touches.length < 2) {
                fullscreenPinchRef.current = null;
              }
            }}
            onTouchCancel={() => {
              fullscreenPinchRef.current = null;
            }}
          >
            {renderTimelineGrid(true)}
          </div>
        </div>
      )}

      {/* MODAL XUẤT ẢNH / PDF SƠ ĐỒ THI ĐẤU VÒNG BẢNG */}
      {isExportGroupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col p-2 sm:p-4 overflow-hidden animate-in fade-in duration-200">
          {/* Header thanh công cụ của modal */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-3 rounded-2xl border border-line/20 shadow-xl z-20 shrink-0">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-accent">
                <span className="font-head text-base font-bold text-accent-foreground">📸</span>
              </div>
              <div>
                <h2 className="font-head text-sm sm:text-base font-bold text-ink tracking-tight">
                  Xuất ảnh / PDF Sơ đồ thi đấu
                </h2>
                <p className="text-[11px] text-line/60">
                  {state.name || "Giải đấu"} • {ev.name} ({ev.bracket === "rr" ? "Vòng tròn" : "Vòng bảng"}) • {rounds.length} vòng đấu
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Toggle điểm số */}
              <label className="flex items-center gap-1.5 text-xs font-semibold text-line/80 bg-paper px-2.5 py-1.5 rounded-lg border border-line/20 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeScoresInExport}
                  onChange={(e) => setIncludeScoresInExport(e.target.checked)}
                  className="rounded border-line/30 accent-accent"
                />
                <span>Kèm điểm số</span>
              </label>

              {/* Nút Tải Ảnh PNG */}
              <button
                type="button"
                disabled={isExportingImage || isExportingPdf}
                onClick={handleDownloadGroupScheduleImage}
                className="btn-accent text-xs font-bold !py-1.5 px-3 flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isExportingImage ? "⏳ Đang tạo ảnh..." : "🖼️ Tải file Ảnh (PNG)"}
              </button>

              {/* Nút Tải PDF */}
              <button
                type="button"
                disabled={isExportingImage || isExportingPdf}
                onClick={handleDownloadGroupSchedulePdf}
                className="rounded-lg bg-[#0a3320] text-white hover:bg-[#0a3320]/90 px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50 transition"
              >
                {isExportingPdf ? "⏳ Đang tạo PDF..." : "📄 Tải file PDF"}
              </button>

              {/* Nút In */}
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-ghost text-xs font-bold !py-1.5 px-2.5 flex items-center gap-1 cursor-pointer"
                title="In trực tiếp sơ đồ thi đấu"
              >
                🖨️ In
              </button>

              {/* Nút Đóng */}
              <button
                type="button"
                onClick={() => setIsExportGroupModalOpen(false)}
                className="rounded-lg bg-black/80 hover:bg-black text-white px-3 py-1.5 text-xs font-bold cursor-pointer transition shadow-sm ml-1"
              >
                ✕ Đóng
              </button>
            </div>
          </div>

          {/* Vùng xem trước sơ đồ (preview & xuất file) */}
          <div className="flex-1 overflow-auto p-2 sm:p-6 mt-2 flex items-start justify-center">
            <div
              ref={exportGroupScheduleRef}
              data-export-schedule="true"
              className="p-6 sm:p-8 rounded-2xl shadow-2xl min-w-max"
              style={{ backgroundColor: "#fbfaf6", color: "#111827", border: "1px solid #e5e7eb" }}
            >
              {/* Header của bản in/ảnh */}
              <div className="pb-4 mb-6" style={{ borderBottom: "2px solid #e5e7eb" }}>
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-3">
                    <div className="grid size-11 place-items-center rounded-xl bg-accent">
                      <span className="font-head text-xl font-bold leading-none text-accent-foreground">
                        P
                      </span>
                    </div>
                    <div>
                      <div className="font-['Verdana',sans-serif] italic text-base font-bold uppercase tracking-tight text-[#0a3320]">
                        NẢY COURT
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#6b7280" }}>
                        HỆ THỐNG ĐIỀU HÀNH GIẢI PICKLEBALL
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <h1 className="font-head text-xl sm:text-2xl font-black uppercase tracking-tight text-[#0a3320]">
                      {state.name || "LỊCH THI ĐẤU PICKLEBALL"}
                    </h1>
                    <p className="text-xs font-bold text-accent mt-0.5">
                      {ev.name} • {ev.bracket === "rr" ? "VÒNG TRÒN TÍNH ĐIỂM" : "VÒNG BẢNG THI ĐẤU"}
                    </p>
                    <div className="text-[11px] mt-1 flex items-center justify-end gap-3" style={{ color: "#6b7280" }}>
                      {state.date && <span>📅 Ngày: <strong style={{ color: "#111827" }}>{state.date}</strong></span>}
                      <span>Sân: <strong style={{ color: "#111827" }}>{state.courts.length} sân</strong></span>
                      <span>👥 Đội tham gia: <strong style={{ color: "#111827" }}>{entries.length}</strong></span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lưới các cột vòng thi đấu (hỗ trợ chia 2 hàng khi có nhiều vòng đấu) */}
              {rounds.length === 0 ? (
                <div className="p-12 text-center text-sm" style={{ color: "#6b7280" }}>
                  Chưa có lịch thi đấu để hiển thị.
                </div>
              ) : (
                <div className="space-y-6">
                  {exportRoundRows.map((rowRounds, rowIdx) => (
                    <div key={rowIdx}>
                      <div className="flex gap-4 items-start">
                        {rowRounds.map((r) => {
                          const roundMatchesList = groupMatches
                            .filter((m) => m.round === r)
                            .sort((a, b) => a.groupName.localeCompare(b.groupName));

                          return (
                            <div key={r} className="w-[280px] shrink-0">
                              {/* Tiêu đề vòng trong ô màu cam với chữ xám nhỏ số lượng trận */}
                              <div
                                className="rounded-xl h-[42px] flex items-center justify-center gap-1.5 text-center font-head text-sm font-bold uppercase tracking-wider shadow-xs px-2"
                                style={{
                                  fontFamily: "'Space Grotesk', sans-serif",
                                  backgroundColor: "#ffedd5",
                                  color: "#c2410c",
                                  border: "1px solid #fed7aa"
                                }}
                              >
                                <span>Vòng {r}</span>
                                <span
                                  className="text-xs font-normal lowercase tracking-normal"
                                  style={{ color: "#78716c" }}
                                >
                                  ({roundMatchesList.length} trận)
                                </span>
                              </div>

                              {/* Danh sách thẻ trận sạch sẽ đúng như yêu cầu */}
                              <div className="mt-3.5 space-y-3">
                                {roundMatchesList.map((m) => {
                                  const entryA = getMatchEntryA(m, state.entries);
                                  const entryB = getMatchEntryB(m, state.entries);
                                  const nameA = resolveSideLabel(m, "aId");
                                  const nameB = resolveSideLabel(m, "bId");
                                  const c = groupColor(m.groupName);
                                  const aWin = m.scoreA !== null && m.scoreB !== null && m.scoreA > m.scoreB;
                                  const bWin = m.scoreA !== null && m.scoreB !== null && m.scoreB > m.scoreA;

                                  return (
                                    <div
                                      key={m.id}
                                      className="rounded-xl p-3 flex flex-col justify-between text-left shadow-2xs"
                                      style={{
                                        backgroundColor: c.bg,
                                        border: "1px solid #d1d5db",
                                        color: "#111827"
                                      }}
                                    >
                                      {/* Tên các cặp thi đấu (và ô điểm nếu có chọn kèm điểm số) */}
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-1.5 min-w-0 flex-1 text-[15px] font-bold leading-snug" style={{ color: "#111827" }}>
                                            <PlayerNameDisplay
                                              entry={entryA}
                                              fallback={nameA}
                                              activePlayerNames={activePlayerNames}
                                              isWinning={includeScoresInExport && aWin}
                                              truncate={false}
                                            />
                                          </div>
                                          {includeScoresInExport && (
                                            <div
                                              className="w-9 px-1 py-0.5 text-xs rounded-md text-center font-bold shrink-0"
                                              style={{
                                                fontFamily: "'Space Grotesk', sans-serif",
                                                backgroundColor: aWin ? "#ffedd5" : "#ffffff",
                                                color: aWin ? "#c2410c" : "#111827",
                                                border: aWin ? "1.5px solid #ea580c" : "1px solid #d1d5db"
                                              }}
                                            >
                                              {m.scoreA !== null ? m.scoreA : "—"}
                                            </div>
                                          )}
                                        </div>

                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-1.5 min-w-0 flex-1 text-[15px] font-bold leading-snug" style={{ color: "#111827" }}>
                                            <PlayerNameDisplay
                                              entry={entryB}
                                              fallback={nameB}
                                              activePlayerNames={activePlayerNames}
                                              isWinning={includeScoresInExport && bWin}
                                              truncate={false}
                                            />
                                          </div>
                                          {includeScoresInExport && (
                                            <div
                                              className="w-9 px-1 py-0.5 text-xs rounded-md text-center font-bold shrink-0"
                                              style={{
                                                fontFamily: "'Space Grotesk', sans-serif",
                                                backgroundColor: bWin ? "#ffedd5" : "#ffffff",
                                                color: bWin ? "#c2410c" : "#111827",
                                                border: bWin ? "1.5px solid #ea580c" : "1px solid #d1d5db"
                                              }}
                                            >
                                              {m.scoreB !== null ? m.scoreB : "—"}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Chân trang ghi chú */}
              <div className="mt-8 pt-3 flex items-center justify-between text-[10px]" style={{ borderTop: "1px solid #e5e7eb", color: "#6b7280" }}>
                <span>Nảy Court • Quản lý & Vận hành giải Pickleball chuyên nghiệp</span>
                <span>https://naycourt.ai.studio</span>
              </div>
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
                  return (
                    <div
                      key={court}
                      className="flex items-center gap-2 rounded-lg bg-paper p-2 ring-1 ring-line/10"
                    >
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

      {/* MODAL XEM LẠI LỊCH SỬ CHẤM ĐIỂM & CHỮ KÝ VĐV */}
      {reviewMatch && (() => {
        const liveMatch = state.matches.find((x) => x.id === reviewMatch.id) || reviewMatch;
        const rTeamA = getMatchEntryA(liveMatch, state.entries);
        const rTeamB = getMatchEntryB(liveMatch, state.entries);
        const rNameA = entryName(rTeamA);
        const rNameB = entryName(rTeamB);
        const rEv = state.events.find((e) => e.id === liveMatch.eventId);
        const rFinalA = liveMatch.scoreA ?? liveMatch.live?.a ?? 0;
        const rFinalB = liveMatch.scoreB ?? liveMatch.live?.b ?? 0;
        const rawHist = liveMatch.live?.history || [];
        const steps = [
          ...rawHist,
          {
            a: rFinalA,
            b: rFinalB,
            serveTeam: liveMatch.live?.serveTeam ?? (0 as 0 | 1),
            serverNum: liveMatch.live?.serverNum ?? (1 as 1 | 2),
            serverIdx: liveMatch.live?.serverIdx ?? 0,
            at: undefined as number | undefined,
          },
        ];
        const eventsLog: Array<{
          seq: number;
          scoreText: string;
          label: string;
          timeText: string;
          type: "pointA" | "pointB" | "sideout";
        }> = [];
        for (let i = 0; i < steps.length - 1; i++) {
          const cur = steps[i];
          const nxt = steps[i + 1];
          const timeText = cur.at
            ? new Date(cur.at).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            : "";
          if (nxt.a > cur.a) {
            eventsLog.push({
              seq: eventsLog.length + 1,
              scoreText: `${nxt.a} - ${nxt.b}`,
              label: `+1 điểm cho ${rNameA}`,
              timeText,
              type: "pointA",
            });
          } else if (nxt.b > cur.b) {
            eventsLog.push({
              seq: eventsLog.length + 1,
              scoreText: `${nxt.a} - ${nxt.b}`,
              label: `+1 điểm cho ${rNameB}`,
              timeText,
              type: "pointB",
            });
          } else if (nxt.serveTeam !== cur.serveTeam) {
            eventsLog.push({
              seq: eventsLog.length + 1,
              scoreText: `${nxt.a} - ${nxt.b}`,
              label: `Đổi giao bóng → ${nxt.serveTeam === 0 ? rNameA : rNameB}`,
              timeText,
              type: "sideout",
            });
          } else if (nxt.serverNum !== cur.serverNum) {
            eventsLog.push({
              seq: eventsLog.length + 1,
              scoreText: `${nxt.a} - ${nxt.b}`,
              label: `Chuyển người giao ${nxt.serverNum} (${nxt.serveTeam === 0 ? rNameA : rNameB})`,
              timeText,
              type: "sideout",
            });
          }
        }
        const signedAtText = liveMatch.signatures?.signedAt
          ? new Date(liveMatch.signatures.signedAt).toLocaleString("vi-VN")
          : "";
        const matchNoteText = liveMatch.note || liveMatch.live?.note || "";

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            onClick={() => setReviewMatch(null)}
          >
            <div
              className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line/20 bg-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-line/10 bg-white dark:bg-card px-5 py-3.5">
                <div>
                  <h3
                    className="text-sm font-bold uppercase tracking-wider text-[#0a3320]"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    Lịch sử chấm điểm & Chữ ký VĐV
                  </h3>
                  <p className="text-[11px] text-line/60 mt-0.5">
                    {[
                      rEv?.name,
                      liveMatch.stage === "ko"
                        ? liveMatch.koRound || `KO V${liveMatch.round}`
                        : liveMatch.groupName
                          ? `${liveMatch.groupName} · V${liveMatch.round}`
                          : `Vòng ${liveMatch.round}`,
                      liveMatch.court,
                      liveMatch.referee ? `TT: ${liveMatch.referee}` : "",
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewMatch(null)}
                  className="text-sm text-line/50 hover:text-ink cursor-pointer px-1"
                  aria-label="Đóng"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Tỉ số chung cuộc */}
                <div className="rounded-xl border border-[#0a3320]/20 bg-paper/70 px-4 py-3 flex items-center justify-between gap-3">
                  <span
                    className={`flex-1 text-right text-sm font-bold truncate ${
                      rFinalA > rFinalB ? "text-[#0a3320]" : "text-ink/80"
                    }`}
                  >
                    {rNameA}
                  </span>
                  <span className="rounded-lg bg-[#0a3320] px-3 py-1 font-head text-lg font-extrabold text-white tabular-nums shrink-0">
                    {rFinalA} - {rFinalB}
                  </span>
                  <span
                    className={`flex-1 text-left text-sm font-bold truncate ${
                      rFinalB > rFinalA ? "text-[#0a3320]" : "text-ink/80"
                    }`}
                  >
                    {rNameB}
                  </span>
                </div>

                {matchNoteText && (
                  <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900">
                    <span className="font-bold">Ghi chú trọng tài: </span>
                    {matchNoteText}
                  </div>
                )}

                {/* Chữ ký của VĐV */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-line/70">
                    <span className="uppercase tracking-wider">Chữ ký xác nhận VĐV</span>
                    {signedAtText && (
                      <span className="text-[11px] font-normal text-line/55">
                        Ký lúc: {signedAtText}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-line/15 bg-white p-3">
                      <p className="text-[11px] font-bold text-[#0a3320] truncate mb-2">
                        Đội 1: {rNameA}
                      </p>
                      {liveMatch.signatures?.teamA ? (
                        <img
                          src={liveMatch.signatures.teamA}
                          alt={`Chữ ký ${rNameA}`}
                          className="h-24 w-full object-contain rounded border border-line/10 bg-[#fbfaf6]"
                        />
                      ) : (
                        <div className="h-24 flex items-center justify-center rounded border border-dashed border-line/15 bg-paper/40 text-xs text-line/45">
                          Chưa có chữ ký
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-line/15 bg-white p-3">
                      <p className="text-[11px] font-bold text-[#0a3320] truncate mb-2">
                        Đội 2: {rNameB}
                      </p>
                      {liveMatch.signatures?.teamB ? (
                        <img
                          src={liveMatch.signatures.teamB}
                          alt={`Chữ ký ${rNameB}`}
                          className="h-24 w-full object-contain rounded border border-line/10 bg-[#fbfaf6]"
                        />
                      ) : (
                        <div className="h-24 flex items-center justify-center rounded border border-dashed border-line/15 bg-paper/40 text-xs text-line/45">
                          Chưa có chữ ký
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lịch sử chấm điểm */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-line/70">
                    <span className="uppercase tracking-wider">
                      Diễn biến điểm số ({eventsLog.length} lượt)
                    </span>
                    {liveMatch.live?.scoring && (
                      <span className="text-[11px] font-normal text-line/55">
                        Kiểu:{" "}
                        {liveMatch.live.scoring === "rally"
                          ? "Rally"
                          : liveMatch.live.scoring === "sideout"
                            ? "Side-out"
                            : "Thủ công"}
                      </span>
                    )}
                  </div>
                  {eventsLog.length === 0 ? (
                    <div className="rounded-xl border border-line/15 bg-paper/50 p-4 text-center text-xs text-line/55">
                      Trận đấu được nhập tỉ số trực tiếp (chưa có lịch sử từng điểm).
                    </div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto rounded-xl border border-line/15 divide-y divide-line/10 bg-white dark:bg-card">
                      {eventsLog.map((evLog) => (
                        <div
                          key={evLog.seq}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-6 text-[10px] font-mono text-line/45 shrink-0">
                              #{evLog.seq}
                            </span>
                            <span
                              className={`truncate ${
                                evLog.type === "sideout"
                                  ? "text-line/65 italic"
                                  : "font-semibold text-ink"
                              }`}
                            >
                              {evLog.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {evLog.timeText && (
                              <span className="text-[10px] font-mono text-line/45">
                                {evLog.timeText}
                              </span>
                            )}
                            <span
                              className={`rounded px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                                evLog.type === "sideout"
                                  ? "bg-paper text-line/70 border border-line/15"
                                  : "bg-[#0a3320]/10 text-[#0a3320]"
                              }`}
                            >
                              {evLog.scoreText}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-line/10 bg-paper/60 px-5 py-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setReviewMatch(null)}
                  className="rounded-xl bg-[#0a3320] hover:bg-[#0a3320]/90 text-white text-xs font-bold px-4 py-2 cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL CẢNH BÁO / XÁC NHẬN CHỈNH SỬA */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-line/20 border border-line/10 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <span className={`text-2xl ${confirmModal.isDestructive ? "text-red-500" : "text-amber-500"}`}>
                {confirmModal.isDestructive ? "🗑️" : "⚠️"}
              </span>
              <h3 className="font-head text-lg font-bold text-ink">
                {confirmModal.title}
              </h3>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-line/80 whitespace-pre-line">
              {confirmModal.message}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                className="btn-ghost text-xs !py-2 !px-4 cursor-pointer"
                onClick={() => setConfirmModal(null)}
              >
                {confirmModal.cancelText || "Hủy bỏ"}
              </button>
              <button
                type="button"
                className={
                  confirmModal.isDestructive
                    ? "rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs py-2 px-4 shadow-sm transition-all cursor-pointer"
                    : "btn-accent text-xs !py-2 !px-4 cursor-pointer"
                }
                onClick={confirmModal.onConfirm}
              >
                {confirmModal.confirmText || "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL QUẢN LÝ TRẬN ĐỒNG ĐỘI (MLP FORMAT) */}
      {teamMatchToManage && (
        <TeamMatchModal
          match={state.matches.find((m) => m.id === teamMatchToManage.id) || teamMatchToManage}
          entries={state.entries}
          ev={state.events.find((e) => e.id === teamMatchToManage.eventId) || state.events.find((e) => e.id === activeId)}
          isReadOnly={isReadOnly}
          onClose={() => setTeamMatchToManage(null)}
          onSave={(updatedSubMatches, overallScoreA, overallScoreB, done) => {
            if (isReadOnly) return;
            const currentMatch =
              state.matches.find((m) => m.id === teamMatchToManage.id) || teamMatchToManage;
            const hasSubScore = updatedSubMatches.some(
              (sm) => sm.scoreA !== null || sm.scoreB !== null,
            );
            updateMatch(teamMatchToManage.id, {
              teamSubMatches: updatedSubMatches,
              scoreA: overallScoreA,
              scoreB: overallScoreB,
              status: done
                ? "done"
                : overallScoreA > 0 || overallScoreB > 0 || hasSubScore
                  ? "live"
                  : currentMatch.status === "done"
                    ? "pending"
                    : currentMatch.status,
            });
          }}
        />
      )}

      {/* MODAL CHỌN ĐỘI CHO Ô VÒNG LOẠI TRỰC TIẾP (TIỆN LỢI TRÊN ĐIỆN THOẠI) */}
      {!isReadOnly && koSlotPicker && (
        <KoSlotPickerModal
          pickerSlot={koSlotPicker}
          matches={state.matches}
          entries={state.entries}
          ev={ev}
          groupMatches={groupMatches}
          onClose={() => setKoSlotPicker(null)}
          onAssignTeam={handleAssignTeamFromPicker}
          onClearSlot={handleClearSlotFromPicker}
        />
      )}

      {/* MODAL CHIA SẺ & QR THEO DÕI GIẢI ĐẤU */}
      {!isReadOnly && shareModalOpen && (
        <ShareCollaboratorsModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
        />
      )}
    </div>
  );
}
