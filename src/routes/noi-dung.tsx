import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  BRACKET_LABEL,
  MODE_LABEL,
  makeEvent,
  useTournament,
  type BracketType,
  type EventMode,
  type PairMode,
  type TEvent,
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
            onClick={() => onChange(o.id)}
            className={
              active
                ? "rounded-xl border-2 border-[#FF5C00] bg-orange-50/80 px-4 py-2.5 text-sm font-['Space_Grotesk',sans-serif] font-black text-[#FF5C00] shadow-[0_0_16px_rgba(255,92,0,0.35)] ring-2 ring-[#FF5C00]/30 transition-all"
                : "rounded-xl border-2 border-line/35 bg-white px-4 py-2.5 text-sm font-['Space_Grotesk',sans-serif] font-bold text-line/85 hover:border-line/60 hover:bg-black/5 transition-all"
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
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<{
    event: TEvent;
    details: string[];
  } | null>(null);

  const addEvent = () =>
    update({ events: [...state.events, makeEvent(`Nội dung ${state.events.length + 1}`)] });

  const executeRemoveEvent = (id: string) => {
    update({
      events: state.events.filter((e) => e.id !== id),
      entries: state.entries.filter((e) => e.eventId !== id),
      matches: state.matches.filter((m) => m.eventId !== id),
    });
    setConfirmDeleteEvent(null);
  };

  const handleRemoveEventClick = (ev: TEvent) => {
    const evEntries = state.entries.filter((e) => e.eventId === ev.id);
    const evMatches = state.matches.filter((m) => m.eventId === ev.id);
    const scoredMatches = evMatches.filter(
      (m) => m.scoreA !== null || m.scoreB !== null || m.status === "done" || m.status === "live",
    );
    const assignedGroups = (ev.groups || []).filter((g) => g.entryIds.length > 0);

    const details: string[] = [];
    if (evEntries.length > 0) {
      details.push(`${evEntries.length} ${ev.mode === "don" ? "VĐV" : "cặp/VĐV"} đã tạo trong Danh sách VĐV`);
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
                  onChange={(mode) => updateEvent(ev.id, { mode })}
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
                  onChange={(bracket) =>
                    updateEvent(ev.id, {
                      bracket,
                      ...(bracket === "rr"
                        ? { groupCount: 1, groups: [{ name: "Vòng tròn", entryIds: [] }] }
                        : {}),
                    })
                  }
                />
              </div>
              {ev.mode === "dong_doi" && (
                <div className="sm:col-span-2 rounded-xl border-2 border-[#0a3320]/20 bg-gradient-to-r from-emerald-50/70 to-teal-50/50 p-4 text-xs leading-relaxed text-line/90 shadow-2xs">
                  <div className="flex items-center gap-2 font-head font-bold text-sm text-[#0a3320] mb-2">
                    <span className="text-base">🏆</span>
                    <span>Thể thức Đồng đội Pickleball (Chuẩn MLP / PPA Tour):</span>
                  </div>
                  <ul className="space-y-1.5 list-disc list-inside text-[12px] text-ink/80">
                    <li><strong>Quy mô đội:</strong> Mỗi đội gồm <strong>4 VĐV</strong> (tiêu chuẩn 2 Nam và 2 Nữ).</li>
                    <li>
                      <strong>Cấu trúc 1 lượt đấu (Tie) giữa 2 Đội:</strong> Gồm 4 trận đôi chính:
                      <span className="block pl-4 mt-0.5 text-ink/70">
                        • Trận 1: <strong>Đôi Nữ</strong> (Women's Doubles)<br />
                        • Trận 2: <strong>Đôi Nam</strong> (Men's Doubles)<br />
                        • Trận 3: <strong>Đôi Nam Nữ 1</strong> (Mixed Doubles 1)<br />
                        • Trận 4: <strong>Đôi Nam Nữ 2</strong> (Mixed Doubles 2)
                      </span>
                    </li>
                    <li>
                      <strong>Loạt Tiebreaker — Dreambreaker™:</strong> Nếu hai đội hòa <strong>2 — 2</strong> sau 4 trận đôi, trận <strong>Dreambreaker™</strong> (Đơn luân phiên 21 điểm, mỗi VĐV đánh 4 điểm rồi xoay tua) sẽ được kích hoạt để phân định thắng bại chung cuộc (3 - 2)!
                    </li>
                  </ul>
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
                    onChange={(pairMode) => updateEvent(ev.id, { pairMode })}
                  />
                  {ev.bracket === "rr" && ev.pairMode === "random" && (
                    <div className="mt-2.5 rounded-xl border-2 border-[#0a3320]/20 bg-gradient-to-r from-emerald-50/70 to-teal-50/50 p-3 text-xs leading-relaxed text-[#0a3320] font-medium shadow-2xs">
                      Hệ thống đổi partner ngẫu nhiên sau mỗi vòng
                    </div>
                  )}

                  {ev.bracket === "rr" && ev.pairMode === "random" && (
                    <div className="mt-3.5 space-y-2 rounded-xl border border-line/20 bg-secondary/20 p-3.5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <Lbl>Số lượng vòng đấu sẽ diễn ra</Lbl>
                        <span className="text-[11px] text-line/60">
                          (Tùy chọn số vòng, sau mỗi vòng có nút bốc thăm ngẫu nhiên tiếp)
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => updateEvent(ev.id, { randomRoundsCount: 0 })}
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
                              updateEvent(ev.id, { randomRoundsCount: v });
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              {ev.bracket === "rr_ko" ? (
                <div>
                  <Lbl>Tuỳ chọn</Lbl>
                  <label
                    className={`mt-1.5 flex w-fit items-center gap-2.5 rounded-xl border-2 px-4 py-2.5 text-sm font-['Space_Grotesk',sans-serif] font-bold cursor-pointer transition-all ${
                      ev.thirdPlace
                        ? "border-[#FF5C00] bg-orange-50/80 text-[#FF5C00] shadow-[0_0_16px_rgba(255,92,0,0.35)] ring-2 ring-[#FF5C00]/30"
                        : "border-line/35 bg-white text-line/85 hover:border-line/60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-[#FF5C00]"
                      checked={ev.thirdPlace}
                      onChange={(e) => updateEvent(ev.id, { thirdPlace: e.target.checked })}
                    />
                    Có trận tranh hạng 3
                  </label>
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <Lbl>Điểm thắng (vòng bảng)</Lbl>
                <input
                  type="number"
                  className="field mt-1.5 bg-white border-2 border-line/30 font-bold text-center"
                  value={ev.winPoints}
                  onChange={(e) => updateEvent(ev.id, { winPoints: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Lbl>Điểm thua</Lbl>
                <input
                  type="number"
                  className="field mt-1.5 bg-white border-2 border-line/30 font-bold text-center"
                  value={ev.lossPoints}
                  onChange={(e) => updateEvent(ev.id, { lossPoints: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
        ))}

        <button
          className="w-full rounded-xl border-2 border-dashed border-court/50 px-3 py-3 text-sm font-semibold text-court"
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
