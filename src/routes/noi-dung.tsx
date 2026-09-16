import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  BRACKET_LABEL,
  MODE_LABEL,
  makeEvent,
  useTournament,
  type BracketType,
  type EventMode,
  type PairMode,
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

  const addEvent = () =>
    update({ events: [...state.events, makeEvent(`Nội dung ${state.events.length + 1}`)] });

  const removeEvent = (id: string) =>
    update({
      events: state.events.filter((e) => e.id !== id),
      entries: state.entries.filter((e) => e.eventId !== id),
      matches: state.matches.filter((m) => m.eventId !== id),
    });

  return (
    <div className="max-w-4xl">
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
                className="shrink-0 p-2 text-line/40 hover:text-destructive rounded-lg hover:bg-black/5"
                onClick={() => removeEvent(ev.id)}
                aria-label={`Xoá ${ev.name}`}
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

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
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
                <Lbl>Điểm hoà</Lbl>
                <input
                  type="number"
                  className="field mt-1.5 bg-white border-2 border-line/30 font-bold text-center"
                  value={ev.drawPoints}
                  onChange={(e) => updateEvent(ev.id, { drawPoints: Number(e.target.value) || 0 })}
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
    </div>
  );
}
