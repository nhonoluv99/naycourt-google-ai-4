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
      <h1 className="text-balance font-head text-4xl font-bold uppercase leading-none tracking-tighter text-[#0a3320]">
        Nội dung thi đấu
      </h1>
      <p className="mt-2 max-w-xl text-sm text-line/60">
        Một giải có thể gồm nhiều nội dung, ví dụ Đôi nữ 4.3, Đôi hỗn hợp 5.0, Đơn nam 6.5. Mỗi nội
        dung có cấu hình riêng và chỉnh lại được bất cứ lúc nào.
      </p>

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
                  onChange={(bracket) => updateEvent(ev.id, { bracket })}
                />
              </div>
              {ev.mode === "doi" ? (
                <div>
                  <Lbl>Cơ chế ghép đội</Lbl>
                  <Seg<PairMode>
                    value={ev.pairMode}
                    options={[
                      { id: "random", label: "Bốc thăm ngẫu nhiên" },
                      { id: "fixed", label: "Tự bắt cặp từ đầu" },
                    ]}
                    onChange={(pairMode) => updateEvent(ev.id, { pairMode })}
                  />
                </div>
              ) : null}
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
