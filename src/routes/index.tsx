import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTournament } from "@/lib/tournament-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tạo giải đấu Pickleball — Nảy Court" },
      {
        name: "description",
        content:
          "Tạo giải Pickleball: tên giải, ngày thi đấu chọn bằng lịch, địa điểm và danh sách sân — tất cả chỉnh được bất cứ lúc nào.",
      },
      { property: "og:title", content: "Tạo giải đấu Pickleball — Nảy Court" },
      {
        property: "og:description",
        content: "Khởi tạo giải Pickleball với địa điểm, danh sách sân và ngày thi đấu.",
      },
    ],
  }),
  component: CreateTournamentPage,
});

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toDMY(d: Date) {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function fromDMY(s: string): Date | undefined {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return undefined;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function CreateTournamentPage() {
  const { state, update, reset } = useTournament();
  const [openCal, setOpenCal] = useState(false);

  const title = state.name || "CÚP NẢY";
  const len = (state.name || "CÚP NẢY").length;
  const titleFontSize = len > 25 ? "45px" : len > 15 ? "70px" : len > 10 ? "90px" : "110px";

  const setCourtCount = (n: number) => {
    const count = Math.max(1, Math.min(24, n));
    const courts = Array.from({ length: count }, (_, i) => state.courts[i] ?? `Sân ${i + 1}`);
    update({ courts });
  };

  const setCourtName = (i: number, name: string) => {
    const courts = [...state.courts];
    courts[i] = name;
    update({ courts });
  };

  const removeCourt = (i: number) => {
    const courts = state.courts.filter((_, idx) => idx !== i);
    update({ courts: courts.length ? courts : ["Sân 1"] });
  };

  return (
    <div className="max-w-3xl">
      {/* Khung chứa tiêu đề tự động co giãn theo ai_studio_code, không bị che mất dấu tiếng Việt */}
      <div className="title-container min-h-[140px] flex items-center mb-6 overflow-visible">
        <h1
          id="main-title"
          className="font-[system-ui] text-left no-underline border-[#093220] text-[#0a3320] tracking-[-0.05em] uppercase italic font-black transition-all duration-200"
          style={{
            fontSize: titleFontSize,
            lineHeight: 1.08,
            paddingTop: "12px",
            paddingBottom: "8px",
          }}
        >
          {title}
        </h1>
      </div>

      <div className="mt-6 space-y-5">
        <div>
          <label className="block text-xs font-bold font-['Verdana',sans-serif] uppercase tracking-wider text-line/80">
            Tên giải đấu
          </label>
          <input
            type="text"
            id="tour-name-input"
            className="field mt-1.5 font-['Verdana',sans-serif] not-italic font-normal text-base bg-white"
            placeholder="Cúp Nảy"
            maxLength={90}
            value={state.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-extrabold font-['Verdana',sans-serif] uppercase tracking-wider text-line/80">
              Ngày thi đấu <span className="font-normal normal-case text-line/50">(tuỳ chọn)</span>
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                type="text"
                className="field bg-white font-['Verdana',sans-serif]"
                placeholder="dd/mm/yyyy"
                value={state.date}
                onChange={(e) => update({ date: e.target.value })}
              />
              <Popover open={openCal} onOpenChange={setOpenCal}>
                <PopoverTrigger asChild>
                  <button
                    className="grid size-[46px] shrink-0 place-items-center rounded-lg bg-white text-lg border border-line/25 shadow-sm transition hover:border-[#FF5C00] focus:border-[#FF5C00] focus:shadow-[0_0_14px_rgba(255,92,0,0.35)]"
                    aria-label="Mở lịch chọn ngày"
                  >
                    📅
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={fromDMY(state.date)}
                    onSelect={(d) => {
                      if (d) update({ date: toDMY(d) });
                      setOpenCal(false);
                    }}
                    autoFocus
                    className="pointer-events-auto p-3"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div>
            <label className="block text-xs font-extrabold font-['Verdana',sans-serif] uppercase tracking-wider text-line/80">
              Địa điểm <span className="font-normal normal-case text-line/50">(tuỳ chọn)</span>
            </label>
            <input
              className="field mt-1.5 bg-white font-['Verdana',sans-serif] text-[16px]"
              placeholder="Quận 7, TP.HCM"
              value={state.venue}
              onChange={(e) => update({ venue: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-extrabold font-['Verdana',sans-serif] uppercase tracking-wider text-line/80">
            Tên cụm sân <span className="font-normal normal-case text-line/50">(tuỳ chọn)</span>
          </label>
          <input
            className="field mt-1.5 bg-white font-['Verdana',sans-serif]"
            placeholder="Nảy Pickleball Arena"
            value={state.venueName}
            onChange={(e) => update({ venueName: e.target.value })}
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-xs font-extrabold font-['Verdana',sans-serif] uppercase tracking-wider text-line/80">
              Danh sách sân
            </label>
            <div className="flex items-center gap-2">
              <button
                className="grid size-9 place-items-center rounded-xl bg-white font-head font-bold border border-line/25 transition hover:border-[#FF5C00] focus:shadow-[0_0_12px_rgba(255,92,0,0.35)]"
                onClick={() => setCourtCount(state.courts.length - 1)}
                aria-label="Giảm số sân"
              >
                −
              </button>
              <span className="w-9 text-center font-['Space_Grotesk',sans-serif] text-xl font-black">
                {state.courts.length}
              </span>
              <button
                className="grid size-9 place-items-center rounded-xl bg-[#FF5C00] font-head font-bold text-white shadow-md transition hover:scale-98 focus:shadow-[0_0_14px_rgba(255,92,0,0.5)]"
                onClick={() => setCourtCount(state.courts.length + 1)}
                aria-label="Tăng số sân"
              >
                +
              </button>
            </div>
          </div>

          <div className="mt-2 space-y-2">
            {state.courts.map((c, i) => (
              <div
                key={i}
                className="court-row group flex items-center gap-2.5 rounded-xl bg-white px-4 py-3 border border-line/20 shadow-sm transition-all focus-within:border-[#FF5C00] focus-within:shadow-[0_0_14px_rgba(255,92,0,0.35)]"
              >
                <span className="w-6 font-head font-black italic text-line/40">{i + 1}</span>
                <input
                  className="flex-1 bg-transparent text-base font-bold outline-none text-line"
                  value={c}
                  maxLength={40}
                  onChange={(e) => setCourtName(i, e.target.value)}
                />
                <button
                  className="text-line/40 hover:text-destructive p-1"
                  onClick={() => removeCourt(i)}
                  aria-label={`Xoá ${c}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            className="mt-3 w-full rounded-xl border-2 border-dashed border-[#148A4E] py-3.5 text-sm font-bold text-[#148A4E] hover:bg-[#E9F3EE] transition-all"
            onClick={() => setCourtCount(state.courts.length + 1)}
          >
            + Thêm sân
          </button>
        </div>

        <div className="flex gap-4 pt-4">
          <Link
            to="/noi-dung"
            className="flex-1 rounded-xl bg-[#FF5C00] text-white font-[system-ui] font-normal no-underline py-3.5 text-center shadow-lg shadow-orange-200 transition hover:opacity-95 focus:shadow-[0_0_16px_rgba(255,92,0,0.4)]"
          >
            Tiếp tục — Nội dung thi đấu
          </Link>
          <button
            className="rounded-xl bg-white border border-line/25 px-6 py-3.5 font-['Verdana',sans-serif] font-normal text-line/80 hover:bg-black/5"
            onClick={reset}
          >
            Xoá giải
          </button>
        </div>
      </div>
    </div>
  );
}
