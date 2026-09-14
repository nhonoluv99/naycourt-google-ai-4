import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as React from "react";
import {
  entryName,
  propagateKnockout,
  useTournament,
  type LiveState,
  type Match,
} from "@/lib/tournament-store";

export const Route = createFileRoute("/cham-diem/$matchId")({
  head: () => ({
    meta: [
      { title: "Chấm điểm trực tiếp — Nảy Court" },
      {
        name: "description",
        content:
          "Màn hình trọng tài chấm điểm trực tiếp trận Pickleball: chọn kiểu tính điểm, điểm thắng, hội ý, người giao bóng và ghi điểm bằng một chạm.",
      },
      { property: "og:title", content: "Chấm điểm trực tiếp — Nảy Court" },
      {
        property: "og:description",
        content: "Ghi điểm rally hoặc side-out, hoàn tác và kết thúc trận trong một màn hình.",
      },
    ],
  }),
  component: LiveScoringPage,
});

const defaultLive = (): LiveState => ({
  scoring: "sideout",
  target: 11,
  winBy2: true,
  timeoutSeconds: 60,
  medicalSeconds: 900,
  timeoutsPerTeam: 1,
  serveTeam: 0,
  serverNum: 2,
  serverIdx: 0,
  receiverIdx: 0,
  a: 0,
  b: 0,
  toUsed: [0, 0],
  medUsed: [0, 0],
  history: [],
  note: "",
});

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  key?: React.Key;
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "rounded-lg bg-court/15 px-4 py-3 text-sm font-semibold text-courtdeep ring-2 ring-court/60"
          : "rounded-lg bg-white/80 px-4 py-3 text-sm font-semibold text-line/70 ring-1 ring-black/10"
      }
    >
      {children}
    </button>
  );
}

const Lbl = ({ children }: { children: ReactNode }) => (
  <p className="mt-5 text-xs font-semibold uppercase tracking-[0.15em] text-line/60">{children}</p>
);

function LiveScoringPage() {
  const { matchId } = Route.useParams();
  const { state, update, updateMatch } = useTournament();
  const navigate = useNavigate();
  const match = state.matches.find((m) => m.id === matchId);
  const [started, setStarted] = useState(match?.status === "live" && !!match.live);
  const [tossing, setTossing] = useState(false);
  const [tossFlash, setTossFlash] = useState<0 | 1>(0);
  const [tossed, setTossed] = useState(match?.status === "live" && !!match.live);
  const [timer, setTimer] = useState<{ label: string; left: number } | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [changeover, setChangeover] = useState(false);
  const [coDone, setCoDone] = useState(false);
  const [endAsk, setEndAsk] = useState(false);
  const endDismissed = useRef(false);

  useEffect(() => {
    if (!timer) return;
    if (timer.left <= 0) return;
    const id = setTimeout(() => setTimer({ ...timer, left: timer.left - 1 }), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  if (!match) {
    return (
      <div className="p-8">
        <p className="text-sm text-line/60">Không tìm thấy trận đấu.</p>
        <Link to="/quan-ly-giai" className="btn-accent mt-4">
          Về quản lý giải
        </Link>
      </div>
    );
  }

  const teamA = state.entries.find((e) => e.id === match.aId);
  const teamB = state.entries.find((e) => e.id === match.bId);
  const namesA = teamA?.players.map((p) => p.name || "VĐV") ?? ["Đội A"];
  const namesB = teamB?.players.map((p) => p.name || "VĐV") ?? ["Đội B"];
  const live = match.live ?? defaultLive();

  const setLive = (patch: Partial<LiveState>) =>
    updateMatch(match.id, { live: { ...live, ...patch } });

  const finish = (m: Match, a: number, b: number) => {
    const patched = state.matches.map((x) =>
      x.id === m.id
        ? {
            ...x,
            scoreA: a,
            scoreB: b,
            status: "done" as const,
            note: live.note || x.note,
          }
        : x,
    );
    update({ matches: propagateKnockout(patched, m.eventId) });
    void navigate({ to: "/quan-ly-giai" });
  };

  /* ---------- Màn hình cài đặt ---------- */
  if (!started) {
    return (
      <div className="mx-auto max-w-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-line/60">
          Chấm điểm trực tiếp
        </p>
        <h1 className="mt-1 font-head text-2xl font-bold uppercase tracking-tight">
          {entryName(teamA)} <span className="text-line/40">vs</span> {entryName(teamB)}
        </h1>

        <Lbl>Kiểu tính điểm</Lbl>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["rally", "sideout", "manual"] as const).map((s) => (
            <Chip key={s} active={live.scoring === s} onClick={() => setLive({ scoring: s })}>
              {s === "rally" ? "Rally" : s === "sideout" ? "Side-out" : "Thủ công"}
            </Chip>
          ))}
        </div>

        <Lbl>Điểm thắng</Lbl>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[11, 15, 21].map((t) => (
            <Chip key={t} active={live.target === t} onClick={() => setLive({ target: t })}>
              {t}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm text-line/60">Hoặc nhập điểm khác</span>
          <input
            type="number"
            className="field w-24 text-center font-bold"
            value={live.target}
            onChange={(e) => setLive({ target: Math.max(1, Number(e.target.value) || 1) })}
          />
        </div>

        <Lbl>Hội ý / đội</Lbl>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[1, 2, 3].map((t) => (
            <Chip
              key={t}
              active={live.timeoutsPerTeam === t}
              onClick={() => setLive({ timeoutsPerTeam: t })}
            >
              {t}
            </Chip>
          ))}
        </div>

        <Lbl>Cách biệt 2 điểm?</Lbl>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Chip active={live.winBy2} onClick={() => setLive({ winBy2: true })}>
            Có — phải cách 2
          </Chip>
          <Chip active={!live.winBy2} onClick={() => setLive({ winBy2: false })}>
            Không — chạm là thắng
          </Chip>
        </div>

        <Lbl>Thời gian hội ý / y tế</Lbl>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-line/20">
            Hội ý (giây)
            <input
              type="number"
              className="w-20 rounded-md bg-secondary px-2 py-1 text-center font-bold outline-none"
              value={live.timeoutSeconds}
              onChange={(e) => setLive({ timeoutSeconds: Math.max(5, Number(e.target.value) || 60) })}
            />
          </label>
          <label className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-line/20">
            Y tế (phút)
            <input
              type="number"
              className="w-20 rounded-md bg-secondary px-2 py-1 text-center font-bold outline-none"
              value={Math.round(live.medicalSeconds / 60)}
              onChange={(e) =>
                setLive({ medicalSeconds: Math.max(1, Number(e.target.value) || 15) * 60 })
              }
            />
          </label>
        </div>

        <Lbl>Chọn đội giao bóng trước</Lbl>
        <p className="text-xs text-line/60">Bấm chọn trực tiếp hoặc tung đồng xu ngẫu nhiên:</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[entryName(teamA), entryName(teamB)].map((n, i) => {
            const highlight = tossing ? tossFlash === i : tossed && live.serveTeam === i;
            return (
              <button
                key={n + i}
                type="button"
                onClick={() => {
                  setLive({ serveTeam: i as 0 | 1 });
                  setTossed(true);
                }}
                className={
                  highlight
                    ? "rounded-xl bg-accent/20 p-4 text-center font-head text-base font-bold text-accent ring-2 ring-accent"
                    : "rounded-xl bg-card p-4 text-center font-head text-base font-bold text-line/70 ring-1 ring-line/20 hover:bg-card/80"
                }
              >
                <div className="text-xs font-normal text-line/50">Đội {i === 0 ? "A" : "B"}</div>
                <div className="mt-0.5 truncate">{n}</div>
                {tossed && live.serveTeam === i && (
                  <span className="mt-1 inline-block rounded bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">
                    ✓ Giao trước
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex justify-center">
          <button
            className="btn-ghost text-xs"
            disabled={tossing}
            onClick={() => {
              setTossing(true);
              setTossed(false);
              let n = 0;
              const tick = () => {
                setTossFlash((f) => (f === 0 ? 1 : 0));
                n += 1;
                if (n < 18) setTimeout(tick, 60 + n * 8);
                else {
                  const r: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
                  setTossFlash(r);
                  setLive({ serveTeam: r });
                  setTossing(false);
                  setTossed(true);
                }
              };
              tick();
            }}
          >
            🎲 {tossing ? "Đang tung đồng xu..." : "Tung đồng xu ngẫu nhiên"}
          </button>
        </div>

        {tossed ? (
        <>
        <Lbl>Ai giao bóng trước?</Lbl>
        <p className="text-center text-xs text-line/50">
          {live.serveTeam === 0 ? entryName(teamA) : entryName(teamB)}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(live.serveTeam === 0 ? namesA : namesB).map((n, i) => (
            <Chip key={n + i} active={live.serverIdx === i} onClick={() => setLive({ serverIdx: i })}>
              {n}
            </Chip>
          ))}
        </div>

        <Lbl>Ai nhận giao trước?</Lbl>
        <p className="text-center text-xs text-line/50">
          {live.serveTeam === 0 ? entryName(teamB) : entryName(teamA)}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(live.serveTeam === 0 ? namesB : namesA).map((n, i) => (
            <Chip
              key={n + i}
              active={live.receiverIdx === i}
              onClick={() => setLive({ receiverIdx: i })}
            >
              {n}
            </Chip>
          ))}
        </div>

        </>
        ) : (
          <p className="mt-4 text-center text-xs text-line/50">
            Tung đồng xu để chọn đội giao bóng, sau đó chọn người giao và người nhận.
          </p>
        )}

        <button
          disabled={!tossed}
          className="mt-6 w-full rounded-lg bg-courtdeep py-4 disabled:opacity-40 font-head text-lg font-bold uppercase tracking-wide text-paper"
          onClick={() => {
            updateMatch(match.id, {
              status: "live",
              live: { ...live, a: 0, b: 0, history: [] },
            });
            setStarted(true);
          }}
        >
          Bắt đầu
        </button>
        <Link to="/quan-ly-giai" className="btn-ghost mt-3 w-full">
          Quay lại
        </Link>
      </div>
    );
  }

  /* ---------- Màn hình chấm điểm ---------- */
  const serverName = (live.serveTeam === 0 ? namesA : namesB)[live.serverIdx] ?? "—";
  const receiverName = (live.serveTeam === 0 ? namesB : namesA)[live.receiverIdx] ?? "—";
  const doubles = namesA.length > 1;
  const isSideout = live.scoring === "sideout";
  const winner =
    Math.max(live.a, live.b) >= live.target &&
    (!live.winBy2 || Math.abs(live.a - live.b) >= 2)
      ? live.a > live.b
        ? entryName(teamA)
        : entryName(teamB)
      : null;

  const push = (patch: Partial<LiveState>) =>
    setLive({
      ...patch,
      history: [
        ...live.history,
        {
          a: live.a,
          b: live.b,
          serveTeam: live.serveTeam,
          serverNum: live.serverNum,
          serverIdx: live.serverIdx,
        },
      ],
    });

  const coPoint = live.target === 11 ? 6 : live.target === 15 ? 8 : Math.ceil(live.target / 2);

  const afterScore = (na: number, nb: number) => {
    if (!coDone && (na === coPoint || nb === coPoint)) {
      setCoDone(true);
      setChangeover(true);
    }
    const win =
      Math.max(na, nb) >= live.target && (!live.winBy2 || Math.abs(na - nb) >= 2);
    if (win && !endDismissed.current) setEndAsk(true);
  };

  const pointFor = (team: 0 | 1) => {
    const na = team === 0 ? live.a + 1 : live.a;
    const nb = team === 1 ? live.b + 1 : live.b;
    push(team === 0 ? { a: na } : { b: nb });
    afterScore(na, nb);
  };

  const scoreForServing = () => {
    const na = live.serveTeam === 0 ? live.a + 1 : live.a;
    const nb = live.serveTeam === 1 ? live.b + 1 : live.b;
    push({
      ...(live.serveTeam === 0 ? { a: na } : { b: nb }),
      serverIdx: doubles ? 1 - live.serverIdx : live.serverIdx,
    });
    afterScore(na, nb);
  };

  const startTimer = (label: string, secs: number) => setTimer({ label, left: secs });
  const mmss = (t: number) =>
    `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;

  const sideOut = () => {
    if (doubles && live.serverNum === 1) {
      push({ serverNum: 2, serverIdx: 1 - live.serverIdx });
    } else {
      push({
        serveTeam: (1 - live.serveTeam) as 0 | 1,
        serverNum: 1,
        serverIdx: 0,
      });
    }
  };

  const undo = () => {
    const last = live.history[live.history.length - 1];
    if (!last) return;
    setLive({ ...last, history: live.history.slice(0, -1) });
  };

  const [showHistory, setShowHistory] = useState(false);

  // Vị trí trên sân mini:
  // Đội A ở nửa sân bên trái, Đội B ở nửa sân bên phải.
  // Đội giao bóng: nếu điểm chẵn giao từ ô Phải (Dưới), điểm lẻ từ ô Trái (Trên).
  const isScoreEven = (live.serveTeam === 0 ? live.a : live.b) % 2 === 0;
  const serverBox = isScoreEven ? "right" : "left"; // Phải hoặc Trái

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper text-ink overflow-y-auto">
      <div className="flex items-center justify-between border-b border-line/10 px-4 py-2.5">
        <Link to="/quan-ly-giai" className="btn-ghost !px-2.5 !py-1.5 text-xs">
          ← Về Quản lý giải
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-line/60">
            {match.court} {match.referee ? `· TT: ${match.referee}` : ""}
          </span>
          <button
            className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold ring-1 ring-line/20 hover:bg-secondary/80"
            onClick={() => setShowHistory(true)}
          >
            📊 Lịch sử điểm ({live.history.length})
          </button>
          <button
            className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold ring-1 ring-line/20 hover:bg-secondary/80"
            onClick={() => setNoteOpen(true)}
          >
            📝 Ghi chú {live.note ? "✓" : ""}
          </button>
        </div>
      </div>

      {/* Header điểm số lớn */}
      <div className="bg-line/5 py-3 text-center border-b border-line/10">
        <div className="flex items-center justify-center gap-3">
          <p className="font-head text-5xl font-extrabold tracking-tight">
            {live.serveTeam === 0 ? live.a : live.b} - {live.serveTeam === 0 ? live.b : live.a}
            {isSideout && doubles ? ` - ${live.serverNum}` : ""}
          </p>
        </div>
        <p className="mt-1 text-xs font-bold uppercase tracking-wider text-courtdeep">
          Giao bóng: <span className="underline">{serverName}</span> · Nhận bóng: <span className="underline">{receiverName}</span>
        </p>
        <p className="mt-0.5 text-xs text-line/60">
          {entryName(teamA)} ({live.a}) · {entryName(teamB)} ({live.b})
        </p>
      </div>

      {/* Bảng hiển thị 4 VĐV với trạng thái Giao / Nhận */}
      <div className="bg-card px-4 py-2.5 border-b border-line/10">
        <div className="mx-auto max-w-2xl grid grid-cols-2 gap-4">
          {/* Đội A */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold uppercase tracking-tight text-accent truncate">
                Đội A: {entryName(teamA)}
              </span>
              <span className="font-head text-sm font-bold">{live.a} điểm</span>
            </div>
            <div className="space-y-1.5">
              {namesA.map((pName, idx) => {
                const isServ = live.serveTeam === 0 && live.serverIdx === idx;
                const isRecv = live.serveTeam === 1 && live.receiverIdx === idx;
                return (
                  <div
                    key={pName + idx}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-all ${
                      isServ
                        ? "bg-accent/20 border border-accent font-bold text-accent shadow-xs"
                        : isRecv
                          ? "bg-court/20 border border-courtdeep font-bold text-courtdeep"
                          : "bg-paper/70 border border-line/15 text-line/70"
                    }`}
                  >
                    <span className="truncate flex-1">{pName}</span>
                    {isServ && (
                      <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground animate-pulse">
                        🎾 Giao bóng {isSideout && doubles ? `(${live.serverNum})` : ""}
                      </span>
                    )}
                    {isRecv && (
                      <span className="shrink-0 rounded bg-courtdeep px-1.5 py-0.5 text-[10px] font-bold text-paper">
                        🛡️ Nhận bóng
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Đội B */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold uppercase tracking-tight text-blue-600 dark:text-blue-400 truncate">
                Đội B: {entryName(teamB)}
              </span>
              <span className="font-head text-sm font-bold">{live.b} điểm</span>
            </div>
            <div className="space-y-1.5">
              {namesB.map((pName, idx) => {
                const isServ = live.serveTeam === 1 && live.serverIdx === idx;
                const isRecv = live.serveTeam === 0 && live.receiverIdx === idx;
                return (
                  <div
                    key={pName + idx}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-all ${
                      isServ
                        ? "bg-accent/20 border border-accent font-bold text-accent shadow-xs"
                        : isRecv
                          ? "bg-court/20 border border-courtdeep font-bold text-courtdeep"
                          : "bg-paper/70 border border-line/15 text-line/70"
                    }`}
                  >
                    <span className="truncate flex-1">{pName}</span>
                    {isServ && (
                      <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground animate-pulse">
                        🎾 Giao bóng {isSideout && doubles ? `(${live.serverNum})` : ""}
                      </span>
                    )}
                    {isRecv && (
                      <span className="shrink-0 rounded bg-courtdeep px-1.5 py-0.5 text-[10px] font-bold text-paper">
                        🛡️ Nhận bóng
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sân bóng Mini mô phỏng vị trí 4 VĐV */}
        <div className="mx-auto mt-3 max-w-md">
          <div className="relative h-28 w-full overflow-hidden rounded-xl border-2 border-white/80 bg-emerald-800 shadow-inner">
            {/* Vạch lưới chính giữa */}
            <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-white/90 z-10 shadow-sm flex items-center justify-center">
              <span className="rotate-90 text-[8px] font-bold uppercase tracking-widest text-emerald-950 bg-white/80 px-1 rounded">
                Lưới
              </span>
            </div>
            {/* Kitchen (NVZ) trái */}
            <div className="absolute inset-y-0 left-[35%] w-0.5 bg-white/50" />
            {/* Kitchen (NVZ) phải */}
            <div className="absolute inset-y-0 right-[35%] w-0.5 bg-white/50" />
            {/* Vạch giữa ô giao bóng bên trái */}
            <div className="absolute left-0 top-1/2 right-[65%] h-0.5 bg-white/50" />
            {/* Vạch giữa ô giao bóng bên phải */}
            <div className="absolute left-[65%] top-1/2 right-0 h-0.5 bg-white/50" />

            {/* Vị trí VĐV Đội A (Nửa trái) */}
            <div className="absolute inset-y-0 left-0 w-1/2 p-2 flex flex-col justify-around">
              <div
                className={`flex items-center gap-1 text-[11px] font-bold max-w-[130px] truncate rounded px-1.5 py-0.5 ${
                  live.serveTeam === 0 && live.serverIdx === 0
                    ? "bg-amber-400 text-black shadow-md ring-2 ring-amber-300"
                    : live.serveTeam === 1 && live.receiverIdx === 0
                      ? "bg-blue-400 text-black ring-1 ring-white"
                      : "bg-emerald-900/80 text-white/90 border border-white/30"
                }`}
              >
                {live.serveTeam === 0 && live.serverIdx === 0 ? "🎾" : ""}
                <span className="truncate">{namesA[0]}</span>
              </div>
              {namesA[1] && (
                <div
                  className={`flex items-center gap-1 text-[11px] font-bold max-w-[130px] truncate rounded px-1.5 py-0.5 ${
                    live.serveTeam === 0 && live.serverIdx === 1
                      ? "bg-amber-400 text-black shadow-md ring-2 ring-amber-300"
                      : live.serveTeam === 1 && live.receiverIdx === 1
                        ? "bg-blue-400 text-black ring-1 ring-white"
                        : "bg-emerald-900/80 text-white/90 border border-white/30"
                  }`}
                >
                  {live.serveTeam === 0 && live.serverIdx === 1 ? "🎾" : ""}
                  <span className="truncate">{namesA[1]}</span>
                </div>
              )}
            </div>

            {/* Vị trí VĐV Đội B (Nửa phải) */}
            <div className="absolute inset-y-0 right-0 w-1/2 p-2 flex flex-col justify-around items-end">
              <div
                className={`flex items-center gap-1 text-[11px] font-bold max-w-[130px] truncate rounded px-1.5 py-0.5 ${
                  live.serveTeam === 1 && live.serverIdx === 0
                    ? "bg-amber-400 text-black shadow-md ring-2 ring-amber-300"
                    : live.serveTeam === 0 && live.receiverIdx === 0
                      ? "bg-blue-400 text-black ring-1 ring-white"
                      : "bg-emerald-900/80 text-white/90 border border-white/30"
                }`}
              >
                <span className="truncate">{namesB[0]}</span>
                {live.serveTeam === 1 && live.serverIdx === 0 ? "🎾" : ""}
              </div>
              {namesB[1] && (
                <div
                  className={`flex items-center gap-1 text-[11px] font-bold max-w-[130px] truncate rounded px-1.5 py-0.5 ${
                    live.serveTeam === 1 && live.serverIdx === 1
                      ? "bg-amber-400 text-black shadow-md ring-2 ring-amber-300"
                      : live.serveTeam === 0 && live.receiverIdx === 1
                        ? "bg-blue-400 text-black ring-1 ring-white"
                        : "bg-emerald-900/80 text-white/90 border border-white/30"
                  }`}
                >
                  <span className="truncate">{namesB[1]}</span>
                  {live.serveTeam === 1 && live.serverIdx === 1 ? "🎾" : ""}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hai nút ghi điểm khổng lồ */}
      <div className="grid flex-1 grid-cols-2 min-h-[160px]">
        <button
          className="flex flex-col items-center justify-center bg-court/15 transition hover:bg-court/25 active:scale-[0.99]"
          onClick={() => (isSideout ? scoreForServing() : pointFor(0))}
        >
          <span className="font-head text-5xl font-extrabold uppercase tracking-tight text-courtdeep">
            +1 Điểm
          </span>
          <span className="mt-2 text-xs font-semibold text-line/70">
            cho {isSideout ? (live.serveTeam === 0 ? entryName(teamA) : entryName(teamB)) : entryName(teamA)}
          </span>
        </button>
        <button
          className="flex flex-col items-center justify-center bg-card transition hover:bg-card/80 active:scale-[0.99] border-l border-line/10"
          onClick={() => (isSideout ? sideOut() : pointFor(1))}
        >
          <span className="font-head text-5xl font-extrabold uppercase tracking-tight text-line">
            {isSideout ? "Mất giao" : "+1 Điểm"}
          </span>
          <span className="mt-2 text-xs font-semibold text-line/70">
            {isSideout ? "Đổi lượt giao (Side-out)" : `cho ${entryName(teamB)}`}
          </span>
        </button>
      </div>

      {/* Thanh hội ý & Y tế */}
      <div className="flex items-center justify-between gap-2 border-t border-line/10 bg-card px-3 py-2 text-[11px] font-semibold">
        <div className="flex items-center gap-1.5">
          <span className="max-w-[90px] truncate text-line/70">{entryName(teamA)}</span>
          <button
            className="rounded-md bg-paper px-2 py-1 ring-1 ring-line/20 hover:bg-paper/80"
            onClick={() => {
              setLive({ toUsed: [live.toUsed[0] + 1, live.toUsed[1]] });
              startTimer(`Hội ý · ${entryName(teamA)}`, live.timeoutSeconds);
            }}
          >
            ⏱ Hội ý ({live.timeoutsPerTeam - live.toUsed[0]})
          </button>
          <button
            className="rounded-md bg-destructive px-2 py-1 text-destructive-foreground hover:opacity-90"
            onClick={() => {
              setLive({ medUsed: [live.medUsed[0] + 1, live.medUsed[1]] });
              startTimer(`Y tế · ${entryName(teamA)}`, live.medicalSeconds);
            }}
          >
            MED
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="rounded-md bg-destructive px-2 py-1 text-destructive-foreground hover:opacity-90"
            onClick={() => {
              setLive({ medUsed: [live.medUsed[0], live.medUsed[1] + 1] });
              startTimer(`Y tế · ${entryName(teamB)}`, live.medicalSeconds);
            }}
          >
            MED
          </button>
          <button
            className="rounded-md bg-paper px-2 py-1 ring-1 ring-line/20 hover:bg-paper/80"
            onClick={() => {
              setLive({ toUsed: [live.toUsed[0], live.toUsed[1] + 1] });
              startTimer(`Hội ý · ${entryName(teamB)}`, live.timeoutSeconds);
            }}
          >
            ⏱ Hội ý ({live.timeoutsPerTeam - live.toUsed[1]})
          </button>
          <span className="max-w-[90px] truncate text-line/70">{entryName(teamB)}</span>
        </div>
      </div>

      {/* Thanh footer nút Hoàn tác & Kết thúc */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 border-t border-line/10 bg-paper p-2.5">
        <button className="btn-ghost" onClick={undo}>
          ↺ Hoàn tác điểm
        </button>
        <span className="self-center text-xs font-semibold text-line/60">
          {winner ? `Thắng: ${winner}` : `Đích: ${live.target} điểm`}
        </span>
        <button
          className="rounded-lg bg-courtdeep py-2.5 font-head text-sm font-bold uppercase tracking-wide text-paper shadow hover:opacity-95"
          onClick={() => finish(match, live.a, live.b)}
        >
          Kết thúc trận
        </button>
      </div>

      {/* Modal Lịch sử điểm số */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-line/20 flex flex-col">
            <div className="flex items-center justify-between border-b border-line/15 pb-3">
              <p className="font-head text-lg font-bold uppercase tracking-tight">
                Lịch sử điểm số ({live.history.length} lượt)
              </p>
              <button
                className="btn-ghost text-xs"
                onClick={() => setShowHistory(false)}
              >
                Đóng
              </button>
            </div>
            <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1">
              {live.history.length === 0 ? (
                <p className="text-xs text-line/50 text-center py-6">Chưa có điểm nào được ghi.</p>
              ) : (
                live.history.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-paper p-2 text-xs ring-1 ring-line/10"
                  >
                    <span className="font-head font-bold text-line/40">#{i + 1}</span>
                    <span className="font-head font-bold text-accent">
                      {h.a} - {h.b}
                    </span>
                    <span className="text-[11px] text-line/60">
                      Giao: Đội {h.serveTeam === 0 ? "A" : "B"} (người {h.serverIdx + 1})
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Ghi chú sau trận */}
      {noteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-line/20">
            <p className="font-head text-lg font-bold uppercase tracking-tight">Ghi chú trận đấu</p>
            <p className="mt-1 text-xs text-line/60">
              Ghi chú sự cố, chấn thương, khiếu nại hoặc thông tin chuyên môn của trọng tài.
            </p>
            <textarea
              className="field mt-3 h-36 resize-none w-full"
              placeholder="Nhập ghi chú tại đây..."
              value={live.note}
              onChange={(e) => setLive({ note: e.target.value })}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="btn-accent text-xs"
                onClick={() => {
                  updateMatch(match.id, { note: live.note });
                  setNoteOpen(false);
                }}
              >
                Lưu ghi chú
              </button>
            </div>
          </div>
        </div>
      )}

      {timer ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-ink/85 text-paper">
          <p className="text-sm font-semibold uppercase tracking-[0.2em]">{timer.label}</p>
          <p className="mt-3 font-head text-7xl font-bold tabular-nums">{mmss(timer.left)}</p>
          <button className="btn-accent mt-6" onClick={() => setTimer(null)}>
            {timer.left <= 0 ? "Tiếp tục thi đấu" : "Kết thúc sớm"}
          </button>
        </div>
      ) : null}

      {changeover ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-ink/85 px-6 text-center text-paper">
          <p className="font-head text-3xl font-bold uppercase tracking-tight">Đổi sân</p>
          <p className="mt-2 text-sm opacity-80">
            Một đội đã đạt {coPoint} điểm — nhắc hai đội đổi sân.
          </p>
          <button className="btn-accent mt-6" onClick={() => setChangeover(false)}>
            Đã đổi sân
          </button>
        </div>
      ) : null}

      {endAsk ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-ink/90 px-6 text-center text-paper">
          <p className="font-head text-3xl font-bold uppercase tracking-tight">Kết thúc trận?</p>
          <p className="mt-2 text-sm opacity-80">
            {entryName(teamA)} {live.a} — {live.b} {entryName(teamB)}
          </p>
          <div className="mt-6 flex gap-2">
            <button
              className="btn-ghost"
              onClick={() => {
                endDismissed.current = true;
                setEndAsk(false);
              }}
            >
              Chơi tiếp
            </button>
            <button className="btn-accent" onClick={() => finish(match, live.a, live.b)}>
              Kết thúc trận
            </button>
          </div>
        </div>
      ) : null}

      {noteOpen ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/80 px-6">
          <div className="w-full max-w-md rounded-xl bg-card p-4">
            <p className="font-head text-lg font-bold uppercase tracking-tight">Ghi chú trọng tài</p>
            <textarea
              className="field mt-3 h-40 resize-none"
              placeholder="Ghi chú sự cố, chấn thương, khiếu nại..."
              value={live.note}
              onChange={(e) => setLive({ note: e.target.value })}
            />
            <button className="btn-accent mt-3 w-full" onClick={() => setNoteOpen(false)}>
              Xong
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
