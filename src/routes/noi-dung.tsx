import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  BRACKET_LABEL,
  MODE_LABEL,
  makeEvent,
  useTournament,
  type BracketType,
  type EventMode,
  type MlpRankingCriterion,
  type PairMode,
  type TeamSubMode,
  type TEvent,
  MLP_RANKING_CRITERIA_LABELS,
} from "@/lib/tournament-store";

export const Route = createFileRoute("/noi-dung")({
  head: () => ({
    meta: [
      { title: "Nội dung thi đấu — Nảy Court" },
      {
        name: "description",
        content:
          "Tạo nhiều nội dung trong một giải Pickleball: đơn hay đôi, vòng tròn hay chia bảng loại trực tiếp, tranh hạng ba, cơ chế ghép đội và điểm thắng thua vòng bảng.",
      },
      { property: "og:title", content: "Nội dung thi đấu — Nảy Court" },
      {
        property: "og:description",
        content: "Mỗi nội dung có thể thức, hình thức và cách tính điểm riêng.",
      },
    ],
  }),
  component: EventsPage,
});

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-2.5">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              if (!active) onChange(o.id);
            }}
            className={
              active
                ? "rounded-xl border-2 border-[#FF5C00] bg-orange-50/80 px-4 py-2.5 text-sm font-['Space_Grotesk',sans-serif] font-black text-[#FF5C00] shadow-[0_0_16px_rgba(255,92,0,0.35)] ring-2 ring-[#FF5C00]/30 transition-all cursor-pointer"
                : "rounded-xl border-2 border-line/35 bg-white px-4 py-2.5 text-sm font-['Space_Grotesk',sans-serif] font-bold text-line/85 hover:border-line/60 hover:bg-black/5 transition-all cursor-pointer"
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const Lbl = ({ children }: { children: ReactNode }) => (
  <span className="block text-xs font-['Space_Grotesk',sans-serif] font-extrabold uppercase tracking-wider text-line/80">
    {children}
  </span>
);

function EventsPage() {
  const { state, update, updateEvent } = useTournament();
  const [draggedCritKey, setDraggedCritKey] = useState<string | null>(null);
  const [dragOverCritKey, setDragOverCritKey] = useState<string | null>(null);
  const [confirmedParamEditIds, setConfirmedParamEditIds] = useState<Set<string>>(() => new Set());
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<{
    event: TEvent;
    details: string[];
  } | null>(null);
  const [confirmEditEvent, setConfirmEditEvent] = useState<{
    event: TEvent;
    title: string;
    actionDesc: string;
    impactDesc: string;
    details: string[];
    isDestructive: boolean;
    onConfirm: () => void;
  } | null>(null);

  const addEvent = () =>
    update({ events: [...state.events, makeEvent(`Nội dung ${state.events.length + 1}`)] });

  const getEventDownstreamDetails = (ev: TEvent) => {
    const evEntries = state.entries.filter((e) => e.eventId === ev.id);
    const evMatches = state.matches.filter((m) => m.eventId === ev.id);
    const scoredMatches = evMatches.filter(
      (m) => m.scoreA !== null || m.scoreB !== null || m.status === "done" || m.status === "live",
    );
    const assignedGroups = (ev.groups || []).filter((g) => g.entryIds.length > 0);

    const details: string[] = [];
    if (evEntries.length > 0) {
      details.push(
        `${evEntries.length} ${ev.mode === "don" ? "VĐV" : ev.mode === "dong_doi" ? "đội" : "cặp/VĐV"} đã tạo trong Danh sách VĐV`,
      );
    }
    if (assignedGroups.length > 0) {
      details.push(`${assignedGroups.length} bảng đấu đã được chia`);
    }
    if (evMatches.length > 0) {
      details.push(`${evMatches.length} trận đấu đã tạo lịch`);
    }
    if (scoredMatches.length > 0) {
      details.push(`${scoredMatches.length} trận đấu đã có điểm số / kết quả`);
    }
    return { evEntries, evMatches, scoredMatches, assignedGroups, details };
  };

  const resetEventDownstreamData = (
    ev: TEvent,
    patch: Partial<TEvent>,
    options: { clearEntries?: boolean; clearGroups?: boolean; clearMatches?: boolean },
  ) => {
    const nextBracket = patch.bracket ?? ev.bracket;
    const nextGroups = options.clearGroups
      ? nextBracket === "rr"
        ? [{ name: "Vòng tròn", entryIds: [] }]
        : []
      : patch.groups ?? ev.groups;

    const nextKoLocked =
      options.clearMatches && state.koLocked
        ? (() => {
            const copy = { ...state.koLocked };
            delete copy[ev.id];
            return copy;
          })()
        : state.koLocked;

    update({
      events: state.events.map((e) =>
        e.id === ev.id ? { ...e, ...patch, groups: nextGroups } : e,
      ),
      entries: options.clearEntries
        ? state.entries.filter((e) => e.eventId !== ev.id)
        : state.entries,
      matches: options.clearMatches
        ? state.matches.filter((m) => m.eventId !== ev.id)
        : state.matches,
      koLocked: nextKoLocked,
    });
  };

  const handleChangeMode = (ev: TEvent, newMode: EventMode) => {
    if (newMode === ev.mode) return;
    const { details } = getEventDownstreamDetails(ev);
    if (details.length === 0) {
      updateEvent(ev.id, { mode: newMode });
      return;
    }
    setConfirmEditEvent({
      event: ev,
      title: "Cảnh báo thay đổi thể thức thi đấu",
      actionDesc: `Chuyển thể thức từ “${MODE_LABEL[ev.mode]}” sang “${MODE_LABEL[newMode]}”`,
      impactDesc:
        "Thay đổi thể thức sẽ làm thay đổi hoàn toàn cấu trúc nhập VĐV/đội hình và XÓA toàn bộ danh sách VĐV, chia bảng, lịch thi đấu và kết quả đã tạo ở các trang sau.",
      details,
      isDestructive: true,
      onConfirm: () => {
        resetEventDownstreamData(
          ev,
          { mode: newMode },
          { clearEntries: true, clearGroups: true, clearMatches: true },
        );
        setConfirmEditEvent(null);
      },
    });
  };

  const handleChangeBracket = (ev: TEvent, newBracket: BracketType) => {
    if (newBracket === ev.bracket) return;
    const patch: Partial<TEvent> =
      newBracket === "rr"
        ? { bracket: newBracket, groupCount: 1, groups: [{ name: "Vòng tròn", entryIds: [] }] }
        : {
            bracket: newBracket,
            groupCount: ev.groupCount && ev.groupCount >= 2 ? ev.groupCount : 2,
            groups: [],
          };
    const { details } = getEventDownstreamDetails(ev);
    if (details.length === 0) {
      updateEvent(ev.id, patch);
      return;
    }
    setConfirmEditEvent({
      event: ev,
      title: "Cảnh báo thay đổi hình thức thi đấu",
      actionDesc: `Chuyển hình thức từ “${BRACKET_LABEL[ev.bracket]}” sang “${BRACKET_LABEL[newBracket]}”`,
      impactDesc:
        "Thay đổi hình thức thi đấu sẽ làm thay đổi sơ đồ giải và XÓA dữ liệu chia bảng, lịch thi đấu và kết quả đã tạo ở các trang sau (Danh sách VĐV vẫn được giữ lại).",
      details,
      isDestructive: true,
      onConfirm: () => {
        resetEventDownstreamData(ev, patch, {
          clearEntries: false,
          clearGroups: true,
          clearMatches: true,
        });
        setConfirmEditEvent(null);
      },
    });
  };

  const handleChangeTeamSubMode = (ev: TEvent, newSubMode: TeamSubMode) => {
    if (newSubMode === (ev.teamSubMode || "mlp")) return;
    const { details, evMatches } = getEventDownstreamDetails(ev);
    if (details.length === 0) {
      updateEvent(ev.id, { teamSubMode: newSubMode });
      return;
    }
    setConfirmEditEvent({
      event: ev,
      title: "Cảnh báo thay đổi tùy chọn đồng đội",
      actionDesc: `Chuyển sang chế độ “${newSubMode === "mlp" ? "Mặc Định (PPA Tour)" : "Thủ Công"}”`,
      impactDesc:
        "Thay đổi chế độ đồng đội sẽ làm thay đổi cấu trúc thành viên của các đội ở trang Danh sách VĐV và xóa lịch thi đấu/kết quả trận đồng đội (nếu đã tạo) ở trang sau.",
      details,
      isDestructive: evMatches.length > 0,
      onConfirm: () => {
        resetEventDownstreamData(
          ev,
          { teamSubMode: newSubMode },
          { clearEntries: false, clearGroups: false, clearMatches: evMatches.length > 0 },
        );
        setConfirmEditEvent(null);
      },
    });
  };

  const handleChangePairMode = (ev: TEvent, newPairMode: PairMode) => {
    if (newPairMode === ev.pairMode) return;
    const { details } = getEventDownstreamDetails(ev);
    if (details.length === 0) {
      updateEvent(ev.id, { pairMode: newPairMode });
      return;
    }
    const fixedLabel = ev.bracket === "rr" ? "Bắt cặp cố định" : "Tự bắt cặp từ đầu";
    const randomLabel = ev.bracket === "rr" ? "Bắt cặp ngẫu nhiên" : "Bốc thăm ngẫu nhiên";
    setConfirmEditEvent({
      event: ev,
      title: "Cảnh báo thay đổi cơ chế ghép đội",
      actionDesc: `Chuyển cơ chế ghép đội sang “${newPairMode === "fixed" ? fixedLabel : randomLabel}”`,
      impactDesc:
        "Thay đổi cơ chế ghép đội sẽ làm thay đổi cách nhập VĐV (cặp 2 người vs từng VĐV đơn) và XÓA toàn bộ danh sách VĐV, chia bảng, lịch thi đấu và kết quả đã tạo ở các trang sau.",
      details,
      isDestructive: true,
      onConfirm: () => {
        resetEventDownstreamData(
          ev,
          { pairMode: newPairMode },
          { clearEntries: true, clearGroups: true, clearMatches: true },
        );
        setConfirmEditEvent(null);
      },
    });
  };

  const requestParamEdit = (
    ev: TEvent,
    actionDesc: string,
    applyChange: () => void,
  ) => {
    const { details } = getEventDownstreamDetails(ev);
    if (details.length === 0 || confirmedParamEditIds.has(ev.id)) {
      applyChange();
      return;
    }
    setConfirmEditEvent({
      event: ev,
      title: "Cảnh báo chỉnh sửa thông số nội dung",
      actionDesc,
      impactDesc:
        "Nội dung này đã có dữ liệu ở các trang sau. Việc chỉnh sửa thông số sẽ làm thay đổi cách tính điểm, bảng xếp hạng hoặc cấu trúc trận đấu ở các trang sau.",
      details,
      isDestructive: false,
      onConfirm: () => {
        setConfirmedParamEditIds((prev) => {
          const next = new Set(prev);
          next.add(ev.id);
          return next;
        });
        applyChange();
        setConfirmEditEvent(null);
      },
    });
  };

  const executeRemoveEvent = (id: string) => {
    update({
      events: state.events.filter((e) => e.id !== id),
      entries: state.entries.filter((e) => e.eventId !== id),
      matches: state.matches.filter((m) => m.eventId !== id),
    });
    setConfirmDeleteEvent(null);
  };

  const handleRemoveEventClick = (ev: TEvent) => {
    const { details } = getEventDownstreamDetails(ev);

    if (details.length > 0) {
      setConfirmDeleteEvent({ event: ev, details });
      return;
    }

    executeRemoveEvent(ev.id);
  };

  return (
    <div className="w-full">
      <h1
        className="text-balance font-head text-4xl font-bold uppercase leading-none tracking-tighter text-[#0a3320]"
        style={{ color: "#0a3320" }}
      >
        Nội dung thi đấu
      </h1>

      <div className="mt-6 space-y-4">
        {state.events.map((ev) => (
          <div key={ev.id} className="panel p-5 sm:p-6 bg-white/95 border border-line/20 shadow-sm">
            <div className="flex items-center gap-3">
              <input
                className="field font-head text-lg font-black text-ink bg-white border-2 border-line/30"
                placeholder="Tên nội dung — VD: Đôi nữ 4.3"
                value={ev.name}
                maxLength={60}
                onChange={(e) => updateEvent(ev.id, { name: e.target.value })}
              />
              <button
                type="button"
                className="shrink-0 p-2 text-line/40 hover:text-destructive rounded-lg hover:bg-black/5 cursor-pointer"
                onClick={() => handleRemoveEventClick(ev)}
                aria-label={`Xoá ${ev.name}`}
                title={`Xoá nội dung ${ev.name}`}
              >
                ✕
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <Lbl>Thể thức</Lbl>
                <Seg<EventMode>
                  value={ev.mode}
                  options={[
                    { id: "don", label: MODE_LABEL.don },
                    { id: "doi", label: MODE_LABEL.doi },
                    { id: "dong_doi", label: MODE_LABEL.dong_doi },
                  ]}
                  onChange={(mode) => handleChangeMode(ev, mode)}
                />
              </div>
              <div>
                <Lbl>Hình thức thi đấu</Lbl>
                <Seg<BracketType>
                  value={ev.bracket}
                  options={[
                    { id: "rr", label: BRACKET_LABEL.rr },
                    { id: "rr_ko", label: BRACKET_LABEL.rr_ko },
                  ]}
                  onChange={(bracket) => handleChangeBracket(ev, bracket)}
                />
              </div>
              {ev.mode === "dong_doi" && (
                <div className="sm:col-span-2 space-y-3.5">
                  <div>
                    <Lbl>Tùy chọn thể thức đồng đội</Lbl>
                    <Seg<TeamSubMode>
                      value={ev.teamSubMode || "mlp"}
                      options={[
                        { id: "mlp", label: "Mặc Định (PPA Tour)" },
                        { id: "custom", label: "Thủ Công" },
                      ]}
                      onChange={(teamSubMode) => handleChangeTeamSubMode(ev, teamSubMode)}
                    />
                  </div>

                  {/* Thứ tự ưu tiên tính bảng xếp hạng riêng cho MLP */}
                  <div className="rounded-xl border border-line/20 bg-paper p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Lbl>Thứ tự ưu tiên tính bảng xếp hạng MLP</Lbl>
                      <button
                        type="button"
                        onClick={() =>
                          requestParamEdit(
                            ev,
                            "Đặt lại thứ tự ưu tiên tính bảng xếp hạng MLP về mặc định",
                            () =>
                              updateEvent(ev.id, {
                                mlpRankingCriteria: [
                                  "points",
                                  "h2h",
                                  "game_diff",
                                  "diff",
                                  "points_won_pct",
                                  "draw",
                                ],
                              }),
                          )
                        }
                        className="text-[11px] font-semibold text-accent hover:underline cursor-pointer"
                      >
                        ↺ Đặt lại mặc định
                      </button>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      {((ev.mlpRankingCriteria && ev.mlpRankingCriteria.length > 0
                        ? ev.mlpRankingCriteria
                        : ([
                            "points",
                            "h2h",
                            "game_diff",
                            "diff",
                            "points_won_pct",
                            "draw",
                          ] as MlpRankingCriterion[])
                      ) as MlpRankingCriterion[]).map((critKey: MlpRankingCriterion, idx: number, arr: MlpRankingCriterion[]) => {
                        const info = MLP_RANKING_CRITERIA_LABELS[critKey];
                        const isDragging = draggedCritKey === critKey;
                        const isDragOver = dragOverCritKey === critKey && draggedCritKey !== critKey;

                        return (
                          <div
                            key={critKey}
                            data-mlp-crit-idx={idx}
                            draggable
                            onDragStart={(e) => {
                              setDraggedCritKey(critKey);
                              e.dataTransfer.setData("text/plain", critKey);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              if (dragOverCritKey !== critKey) setDragOverCritKey(critKey);
                            }}
                            onDragLeave={() => {
                              if (dragOverCritKey === critKey) setDragOverCritKey(null);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggedCritKey !== null && draggedCritKey !== critKey) {
                                const fromIdx = arr.indexOf(draggedCritKey as MlpRankingCriterion);
                                if (fromIdx !== -1) {
                                  const next: MlpRankingCriterion[] = [...arr];
                                  const [moved] = next.splice(fromIdx, 1);
                                  next.splice(idx, 0, moved);
                                  requestParamEdit(
                                    ev,
                                    "Thay đổi thứ tự ưu tiên tính bảng xếp hạng MLP",
                                    () => updateEvent(ev.id, { mlpRankingCriteria: next }),
                                  );
                                }
                              }
                              setDraggedCritKey(null);
                              setDragOverCritKey(null);
                            }}
                            onDragEnd={() => {
                              setDraggedCritKey(null);
                              setDragOverCritKey(null);
                            }}
                            className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs shadow-2xs select-none transition-all ${
                              isDragging
                                ? "opacity-50 border-dashed border-[#FF5C00] bg-orange-50/50 scale-[0.98]"
                                : isDragOver
                                  ? "border-[#FF5C00] bg-orange-50/40 ring-2 ring-[#FF5C00]/30 scale-[1.01]"
                                  : "border-line/15 bg-card hover:border-[#FF5C00]/40 cursor-grab active:cursor-grabbing"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="size-5 rounded-full bg-orange-100 text-[#e44c11] font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <span className="font-bold text-[#0b1e14] truncate">
                                {info?.label || critKey}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* 6 chấm tròn kéo thả hỗ trợ cả máy tính và màn hình cảm ứng */}
                              <div
                                style={{ touchAction: "none" }}
                                onTouchStart={(e) => {
                                  setDraggedCritKey(critKey);
                                  setDragOverCritKey(critKey);
                                  try { navigator.vibrate?.(15); } catch {}
                                }}
                                onTouchMove={(e) => {
                                  const touch = e.touches[0];
                                  if (!touch) return;
                                  const target = document.elementFromPoint(touch.clientX, touch.clientY);
                                  const itemEl = target?.closest("[data-mlp-crit-idx]");
                                  if (itemEl) {
                                    const targetIdx = Number(itemEl.getAttribute("data-mlp-crit-idx"));
                                    if (!isNaN(targetIdx) && arr[targetIdx] && arr[targetIdx] !== dragOverCritKey) {
                                      setDragOverCritKey(arr[targetIdx]);
                                    }
                                  }
                                }}
                                onTouchEnd={() => {
                                  if (draggedCritKey && dragOverCritKey && draggedCritKey !== dragOverCritKey) {
                                    const fromIdx = arr.indexOf(draggedCritKey as MlpRankingCriterion);
                                    const toIdx = arr.indexOf(dragOverCritKey as MlpRankingCriterion);
                                    if (fromIdx !== -1 && toIdx !== -1) {
                                      const next: MlpRankingCriterion[] = [...arr];
                                      const [moved] = next.splice(fromIdx, 1);
                                      next.splice(toIdx, 0, moved);
                                      requestParamEdit(
                                        ev,
                                        "Thay đổi thứ tự ưu tiên tính bảng xếp hạng MLP",
                                        () => updateEvent(ev.id, { mlpRankingCriteria: next }),
                                      );
                                      try { navigator.vibrate?.(25); } catch {}
                                    }
                                  }
                                  setDraggedCritKey(null);
                                  setDragOverCritKey(null);
                                }}
                                className="flex items-center justify-center p-1.5 text-line/40 hover:text-[#FF5C00] active:text-[#FF5C00] cursor-grab active:cursor-grabbing transition select-none"
                                title="Kéo thả lên/xuống để đổi thứ tự ưu tiên"
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
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              {ev.mode === "doi" ? (
                <div className="sm:col-span-2">
                  <Lbl>Cơ chế ghép đội</Lbl>
                  <Seg<PairMode>
                    value={ev.pairMode}
                    options={
                      ev.bracket === "rr"
                        ? [
                            { id: "fixed", label: "Bắt cặp cố định" },
                            { id: "random", label: "Bắt cặp ngẫu nhiên" },
                          ]
                        : [
                            { id: "fixed", label: "Tự bắt cặp từ đầu" },
                            { id: "random", label: "Bốc thăm ngẫu nhiên" },
                          ]
                    }
                    onChange={(pairMode) => handleChangePairMode(ev, pairMode)}
                  />
                  {ev.bracket === "rr" && ev.pairMode === "random" && (
                    <div className="mt-2.5 rounded-xl border-2 border-[#0a3320]/20 bg-gradient-to-r from-emerald-50/70 to-teal-50/50 p-3 text-xs leading-relaxed text-[#0a3320] font-medium shadow-2xs">
                      Hệ thống đổi partner ngẫu nhiên sau mỗi vòng
                    </div>
                  )}

                  {ev.bracket === "rr" && ev.pairMode === "random" && (
                    <div className="mt-3.5 space-y-2 rounded-xl border border-line/20 bg-secondary/20 p-3.5">
                      <div>
                        <Lbl>Số lượng vòng đấu sẽ diễn ra</Lbl>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (ev.randomRoundsCount && ev.randomRoundsCount > 0) {
                              requestParamEdit(
                                ev,
                                "Đổi số lượng vòng đấu sang tất cả các vòng",
                                () => updateEvent(ev.id, { randomRoundsCount: 0 }),
                              );
                            }
                          }}
                          className={`rounded-lg px-3.5 py-1.5 text-xs font-['Space_Grotesk',sans-serif] font-bold transition-all cursor-pointer border ${
                            !ev.randomRoundsCount || ev.randomRoundsCount === 0
                              ? "border-[#FF5C00] bg-orange-50 text-[#FF5C00] ring-1 ring-[#FF5C00]/40 shadow-xs"
                              : "border-line/20 bg-white text-line/75 hover:border-line/50 hover:bg-black/5"
                          }`}
                        >
                          Tất cả các vòng (Đầy đủ)
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-line/70 font-medium">hoặc:</span>
                          <input
                            type="number"
                            min="1"
                            max="50"
                            placeholder="Số vòng"
                            className="field w-24 !py-1 !px-2.5 text-xs font-bold text-center bg-white"
                            value={ev.randomRoundsCount && ev.randomRoundsCount > 0 ? ev.randomRoundsCount : ""}
                            onChange={(e) => {
                              const v = e.target.value === "" ? 0 : Math.max(1, Math.min(50, Number(e.target.value)));
                              requestParamEdit(
                                ev,
                                `Thay đổi số lượng vòng đấu thành ${v || "tất cả"}`,
                                () => updateEvent(ev.id, { randomRoundsCount: v }),
                              );
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              {(ev.mode === "dong_doi" || ev.bracket === "rr_ko") && (
                <div className="sm:col-span-2">
                  <Lbl>Tuỳ chọn</Lbl>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                    {ev.mode === "dong_doi" && (
                      <label
                        className={`flex items-center gap-2.5 rounded-xl border-2 px-4 py-2.5 text-sm font-['Space_Grotesk',sans-serif] font-bold cursor-pointer transition-all select-none ${
                          ev.hasDreambreaker !== false
                            ? "border-[#FF5C00] bg-orange-50/80 text-[#FF5C00] shadow-[0_0_16px_rgba(255,92,0,0.35)] ring-2 ring-[#FF5C00]/30"
                            : "border-line/35 bg-white text-line/85 hover:border-line/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-[#FF5C00]"
                          checked={ev.hasDreambreaker !== false}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            requestParamEdit(
                              ev,
                              `${checked ? "Bật" : "Tắt"} trận Dreambreaker`,
                              () => updateEvent(ev.id, { hasDreambreaker: checked }),
                            );
                          }}
                        />
                        Dreambreaker
                      </label>
                    )}
                    {ev.bracket === "rr_ko" && (
                      <label
                        className={`flex items-center gap-2.5 rounded-xl border-2 px-4 py-2.5 text-sm font-['Space_Grotesk',sans-serif] font-bold cursor-pointer transition-all select-none ${
                          ev.thirdPlace
                            ? "border-[#FF5C00] bg-orange-50/80 text-[#FF5C00] shadow-[0_0_16px_rgba(255,92,0,0.35)] ring-2 ring-[#FF5C00]/30"
                            : "border-line/35 bg-white text-line/85 hover:border-line/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-[#FF5C00]"
                          checked={ev.thirdPlace}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            requestParamEdit(
                              ev,
                              `${checked ? "Bật" : "Tắt"} trận Tranh Hạng 3`,
                              () => updateEvent(ev.id, { thirdPlace: checked }),
                            );
                          }}
                        />
                        Tranh Hạng 3
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <Lbl>Điểm thắng (vòng bảng)</Lbl>
                <input
                  type="number"
                  className="field mt-1.5 bg-white border-2 border-line/30 font-bold text-center"
                  value={ev.winPoints}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    requestParamEdit(
                      ev,
                      `Thay đổi điểm thắng vòng bảng thành ${val}`,
                      () => updateEvent(ev.id, { winPoints: val }),
                    );
                  }}
                />
              </div>
              <div>
                <Lbl>Điểm thua</Lbl>
                <input
                  type="number"
                  className="field mt-1.5 bg-white border-2 border-line/30 font-bold text-center"
                  value={ev.lossPoints}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    requestParamEdit(
                      ev,
                      `Thay đổi điểm thua vòng bảng thành ${val}`,
                      () => updateEvent(ev.id, { lossPoints: val }),
                    );
                  }}
                />
              </div>
            </div>
          </div>
        ))}

        <button
          className="w-full rounded-xl border-2 border-dashed border-court/50 px-3 py-3 text-sm font-semibold text-court cursor-pointer"
          onClick={addEvent}
        >
          + Thêm nội dung
        </button>

        <div className="flex gap-3">
          <Link to="/van-dong-vien" className="btn-accent">
            Tiếp tục — Danh sách VĐV
          </Link>
          <Link to="/" className="btn-ghost">
            Quay lại
          </Link>
        </div>
      </div>

      {/* Pop-up cảnh báo xác nhận trước khi chỉnh sửa nội dung đã có dữ liệu ở các tab sau */}
      {confirmEditEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setConfirmEditEvent(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border-2 border-line/20 bg-paper p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                  confirmEditEvent.isDestructive
                    ? "bg-red-500/15 text-red-600"
                    : "bg-amber-500/15 text-amber-600"
                }`}
              >
                ⚠️
              </div>
              <div className="flex-1">
                <h3 className="font-head text-lg font-bold text-ink">
                  {confirmEditEvent.title}
                </h3>
                <p className="mt-1.5 text-xs font-semibold text-[#FF5C00]">
                  {confirmEditEvent.actionDesc}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-line/80">
                  Nội dung <strong className="text-ink">“{confirmEditEvent.event.name}”</strong> đã có dữ liệu ở các tab phía sau:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold text-red-600">
                  {confirmEditEvent.details.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-line/75">
                  {confirmEditEvent.impactDesc}
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                className="btn-ghost !py-2 !px-4 text-xs font-bold cursor-pointer"
                onClick={() => setConfirmEditEvent(null)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className={
                  confirmEditEvent.isDestructive
                    ? "rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition cursor-pointer"
                    : "btn-accent !py-2 !px-4 text-xs font-bold cursor-pointer"
                }
                onClick={confirmEditEvent.onConfirm}
              >
                Xác nhận thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up cảnh báo xác nhận trước khi xóa nội dung đã có dữ liệu ở các tab sau */}
      {confirmDeleteEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setConfirmDeleteEvent(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border-2 border-line/20 bg-paper p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-600 text-lg font-bold">
                ⚠️
              </div>
              <div className="flex-1">
                <h3 className="font-head text-lg font-bold text-ink">
                  Cảnh báo xóa nội dung thi đấu
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-line/80">
                  Nội dung <strong className="text-ink">“{confirmDeleteEvent.event.name}”</strong> đã có dữ liệu chỉnh sửa ở các tab phía sau:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold text-red-600">
                  {confirmDeleteEvent.details.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-line/75">
                  Nếu xóa nội dung này, toàn bộ danh sách VĐV, bảng đấu, lịch thi đấu và kết quả điểm số thuộc nội dung này sẽ bị xóa vĩnh viễn. Bạn có chắc chắn muốn xóa?
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                className="btn-ghost !py-2 !px-4 text-xs font-bold cursor-pointer"
                onClick={() => setConfirmDeleteEvent(null)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition cursor-pointer"
                onClick={() => executeRemoveEvent(confirmDeleteEvent.event.id)}
              >
                Xác nhận xóa nội dung
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
