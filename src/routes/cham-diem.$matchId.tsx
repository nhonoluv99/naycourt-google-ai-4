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
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-xl bg-emerald-50/90 px-4 py-3 text-sm font-bold text-emerald-900 ring-2 ring-emerald-500 border border-emerald-500 shadow-sm transition-all"
          : "rounded-xl bg-card px-4 py-3 text-sm font-semibold text-line/80 ring-1 ring-line/20 hover:bg-card/80 transition-all"
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
  const [selectedServerIdx, setSelectedServerIdx] = useState<number | null>(
    match?.status === "live" && match?.live ? match.live.serverIdx : null
  );
  const [selectedReceiverIdx, setSelectedReceiverIdx] = useState<number | null>(
    match?.status === "live" && match?.live ? match.live.receiverIdx : null
  );
  const [timer, setTimer] = useState<{ label: string; left: number } | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [changeover, setChangeover] = useState(false);
  const [coDone, setCoDone] = useState(false);
  const [endAsk, setEndAsk] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
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
  
  const rawLive = match.live ?? defaultLive();
  const live: LiveState = {
    ...defaultLive(),
    ...rawLive,
    toUsed: Array.isArray(rawLive.toUsed) ? [rawLive.toUsed[0] ?? 0, rawLive.toUsed[1] ?? 0] : [0, 0],
    medUsed: Array.isArray(rawLive.medUsed) ? [rawLive.medUsed[0] ?? 0, rawLive.medUsed[1] ?? 0] : [0, 0],
    history: Array.isArray(rawLive.history) ? rawLive.history : [],
    posA: Array.isArray(rawLive.posA) ? [rawLive.posA[0] ?? 0, rawLive.posA[1] ?? 1] : [0, 1],
    posB: Array.isArray(rawLive.posB) ? [rawLive.posB[0] ?? 0, rawLive.posB[1] ?? 1] : [0, 1],
    playerIcons: rawLive.playerIcons ?? {},
  };

  const doubles = namesA.length > 1;
  const isSideout = live.scoring === "sideout";

  const posA: [number, number] = live.posA ?? [0, 1];
  const posB: [number, number] = live.posB ?? [0, 1];

  const setLive = (patch: Partial<LiveState>) =>
    updateMatch(match.id, { live: { ...live, ...patch } });

  const setPlayerIcon = (playerName: string, icon: string) => {
    const nextIcons = { ...(live.playerIcons || {}), [playerName]: icon };
    setLive({ playerIcons: nextIcons });
  };

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
      <div className="mx-auto max-w-lg p-4">
        <div className="mb-4 flex items-center justify-between border-b border-line/10 pb-3">
          <button
            type="button"
            onClick={() => {
              if (match.status !== "live") {
                updateMatch(match.id, { status: "live" });
              }
              setStarted(true);
            }}
            className="rounded-lg bg-courtdeep text-paper px-3.5 py-2 text-xs font-bold shadow-xs hover:bg-courtdeep/90 transition flex items-center gap-1.5 cursor-pointer"
          >
            ▶ Vào chấm điểm trực tiếp {live.a > 0 || live.b > 0 ? `(${live.a} - ${live.b})` : ""}
          </button>
          <span className="text-xs font-semibold text-line/50">Cài đặt trận đấu</span>
        </div>
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
                  setSelectedServerIdx(null);
                  setSelectedReceiverIdx(null);
                  setTossed(true);
                }}
                className={
                  highlight
                    ? "rounded-xl bg-accent/20 p-4 text-center font-head text-base font-bold text-accent ring-2 ring-accent"
                    : "rounded-xl bg-card p-4 text-center font-head text-base font-bold text-line/70 ring-1 ring-line/20 hover:bg-card/80"
                }
              >
                <div className="truncate py-1 text-center font-bold text-base">{n}</div>
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
                  setSelectedServerIdx(null);
                  setSelectedReceiverIdx(null);
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
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(live.serveTeam === 0 ? namesA : namesB).map((n, i) => {
                const isSelected = selectedServerIdx === i;
                return (
                  <div
                    key={n + i}
                    onClick={() => {
                      setSelectedServerIdx(i);
                      setLive({ serverIdx: i });
                    }}
                    role="button"
                    tabIndex={0}
                    className={`cursor-pointer rounded-xl p-3 text-center transition-all select-none ${
                      isSelected
                        ? "bg-emerald-50/90 ring-2 ring-emerald-500 border border-emerald-500 shadow-sm"
                        : "bg-card ring-1 ring-line/20 hover:bg-card/80"
                    }`}
                  >
                    <div className={`truncate py-1 text-center font-bold text-sm ${isSelected ? "text-emerald-950 font-bold" : "text-line/80"}`}>
                      {n}
                    </div>
                    <input
                      type="text"
                      placeholder="Ghi chú..."
                      value={live.playerIcons?.[n] ?? ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setPlayerIcon(n, e.target.value)}
                      className="mt-1.5 w-full rounded-md border border-line/20 bg-paper px-2 py-1 text-center text-xs outline-none hover:border-accent focus:border-accent"
                    />
                  </div>
                );
              })}
            </div>

            <Lbl>Ai nhận giao trước?</Lbl>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(live.serveTeam === 0 ? namesB : namesA).map((n, i) => {
                const isSelected = selectedReceiverIdx === i;
                return (
                  <div
                    key={n + i}
                    onClick={() => {
                      setSelectedReceiverIdx(i);
                      setLive({ receiverIdx: i });
                    }}
                    role="button"
                    tabIndex={0}
                    className={`cursor-pointer rounded-xl p-3 text-center transition-all select-none ${
                      isSelected
                        ? "bg-emerald-50/90 ring-2 ring-emerald-500 border border-emerald-500 shadow-sm"
                        : "bg-card ring-1 ring-line/20 hover:bg-card/80"
                    }`}
                  >
                    <div className={`truncate py-1 text-center font-bold text-sm ${isSelected ? "text-emerald-950 font-bold" : "text-line/80"}`}>
                      {n}
                    </div>
                    <input
                      type="text"
                      placeholder="Ghi chú..."
                      value={live.playerIcons?.[n] ?? ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setPlayerIcon(n, e.target.value)}
                      className="mt-1.5 w-full rounded-md border border-line/20 bg-paper px-2 py-1 text-center text-xs outline-none hover:border-accent focus:border-accent"
                    />
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="mt-4 text-center text-xs text-line/50">
            Tung đồng xu hoặc bấm chọn đội giao bóng để tiếp tục.
          </p>
        )}

        <button
          className="mt-6 w-full cursor-pointer rounded-lg bg-courtdeep py-3.5 font-head text-base font-bold uppercase tracking-wide text-paper hover:bg-courtdeep/90 transition shadow-md"
          onClick={() => {
            const effServerIdx = selectedServerIdx ?? live.serverIdx ?? 0;
            const effReceiverIdx = selectedReceiverIdx ?? live.receiverIdx ?? 0;
            const nextPosA: [number, number] = live.posA ? [...live.posA] : [0, 1];
            const nextPosB: [number, number] = live.posB ? [...live.posB] : [0, 1];
            // If server is player 1, place player 1 in the Right court (pos[0])
            if (live.serveTeam === 0) {
              if (effServerIdx === 1) {
                nextPosA[0] = 1;
                nextPosA[1] = 0;
              }
              if (effReceiverIdx === 1) {
                nextPosB[0] = 1;
                nextPosB[1] = 0;
              }
            } else {
              if (effServerIdx === 1) {
                nextPosB[0] = 1;
                nextPosB[1] = 0;
              }
              if (effReceiverIdx === 1) {
                nextPosA[0] = 1;
                nextPosA[1] = 0;
              }
            }
            updateMatch(match.id, {
              status: "live",
              live: {
                ...defaultLive(),
                ...live,
                serverIdx: effServerIdx,
                receiverIdx: effReceiverIdx,
                toUsed: live.toUsed ?? [0, 0],
                medUsed: live.medUsed ?? [0, 0],
                history: live.history ?? [],
                posA: nextPosA,
                posB: nextPosB,
                serverNum: isSideout && doubles ? 2 : 1,
              },
            });
            setStarted(true);
          }}
        >
          {live.a > 0 || live.b > 0 ? "✓ Lưu cài đặt & Chấm điểm" : "▶ Bắt đầu chấm điểm"}
        </button>
        <Link to="/quan-ly-giai" className="btn-ghost mt-3 w-full">
          Quay lại Quản lý giải
        </Link>
      </div>
    );
  }

  /* ---------- Màn hình chấm điểm ---------- */
  const getPlayerDisplay = (name?: string | null) => {
    if (!name || typeof name !== "string") return name || "—";
    const icon = live.playerIcons?.[name]?.trim();
    return icon ? `${icon} ${name}` : name;
  };

  const currentServeNames = live.serveTeam === 0 ? namesA : namesB;
  const currentRecvNames = live.serveTeam === 0 ? namesB : namesA;
  const sIdx = Math.max(0, Math.min(currentServeNames.length - 1, live.serverIdx ?? 0));
  const rIdx = Math.max(0, Math.min(currentRecvNames.length - 1, live.receiverIdx ?? 0));
  const serverName = getPlayerDisplay(currentServeNames[sIdx] ?? "—");
  const receiverName = getPlayerDisplay(currentRecvNames[rIdx] ?? "—");
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
          receiverIdx: live.receiverIdx,
          posA: live.posA ?? [0, 1],
          posB: live.posB ?? [0, 1],
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

  /** Điểm cho đội đang giao bóng (chuẩn luật Pickleball) */
  const scoreForServing = () => {
    const sTeam = live.serveTeam;
    const na = sTeam === 0 ? live.a + 1 : live.a;
    const nb = sTeam === 1 ? live.b + 1 : live.b;

    let nextPosA: [number, number] = [...posA];
    let nextPosB: [number, number] = [...posB];

    // Đôi: đội giao bóng ĐỔI Ô ĐỨNG (Trái <-> Phải). Đội nhận bóng KHÔNG đổi ô!
    if (doubles) {
      if (sTeam === 0) {
        nextPosA = [posA[1], posA[0]];
      } else {
        nextPosB = [posB[1], posB[0]];
      }
    }

    // NGƯỜI GIAO BÓNG VẪN TIẾP TỤC GIAO BÓNG!
    const nextServerIdx = live.serverIdx;

    // Người nhận là đối thủ ở ô đường chéo đối diện:
    let nextReceiverIdx = live.receiverIdx;
    if (doubles) {
      if (sTeam === 0) {
        const serverInRight = nextPosA[0] === nextServerIdx;
        nextReceiverIdx = serverInRight ? nextPosB[0] : nextPosB[1];
      } else {
        const serverInRight = nextPosB[0] === nextServerIdx;
        nextReceiverIdx = serverInRight ? nextPosA[0] : nextPosA[1];
      }
    }

    push({
      ...(sTeam === 0 ? { a: na } : { b: nb }),
      posA: nextPosA,
      posB: nextPosB,
      serverIdx: nextServerIdx,
      receiverIdx: nextReceiverIdx,
    });
    afterScore(na, nb);
  };

  const startTimer = (label: string, secs: number) => setTimer({ label, left: secs });
  const mmss = (t: number) =>
    `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;

  /** Side-out (Mất giao bóng) chuẩn luật Pickleball */
  const sideOut = () => {
    if (doubles && isSideout && live.serverNum === 1) {
      // Chuyển sang Người giao thứ 2 của cùng đội!
      // Cả 2 đội giữ nguyên ô đứng!
      const partnerIdx = 1 - live.serverIdx;
      let nextReceiverIdx = live.receiverIdx;
      if (live.serveTeam === 0) {
        const serverInRight = posA[0] === partnerIdx;
        nextReceiverIdx = serverInRight ? posB[0] : posB[1];
      } else {
        const serverInRight = posB[0] === partnerIdx;
        nextReceiverIdx = serverInRight ? posA[0] : posA[1];
      }

      push({
        serverNum: 2,
        serverIdx: partnerIdx,
        receiverIdx: nextReceiverIdx,
      });
    } else {
      // Đổi lượt giao cho Đội đối phương (Side-out)
      const nextServeTeam: 0 | 1 = (1 - live.serveTeam) as 0 | 1;
      const nextScore = nextServeTeam === 0 ? live.a : live.b;
      const isEven = nextScore % 2 === 0;

      // Chuẩn luật: Đội mới giao bóng: nếu điểm chẵn thì người ở ô Phải giao, nếu lẻ thì người ở ô Trái giao!
      const servingTeamPos = nextServeTeam === 0 ? posA : posB;
      const opponentPos = nextServeTeam === 0 ? posB : posA;
      const nextServerIdx = doubles ? (isEven ? servingTeamPos[0] : servingTeamPos[1]) : 0;
      const nextReceiverIdx = doubles ? (isEven ? opponentPos[0] : opponentPos[1]) : 0;

      push({
        serveTeam: nextServeTeam,
        serverNum: 1,
        serverIdx: nextServerIdx,
        receiverIdx: nextReceiverIdx,
      });
    }
  };

  const undo = () => {
    const last = live.history[live.history.length - 1];
    if (!last) return;
    setLive({
      ...last,
      posA: last.posA ?? posA,
      posB: last.posB ?? posB,
      receiverIdx: last.receiverIdx ?? live.receiverIdx,
      history: live.history.slice(0, -1),
    });
  };

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
          <button
            className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold ring-1 ring-line/20 hover:bg-secondary/80 flex items-center gap-1"
            onClick={() => setStarted(false)}
            title="Mở cài đặt & Tung đồng xu lại"
          >
            ⚙️ Cài đặt & Tung xu
          </button>
          <span className="text-xs font-semibold text-line/60">
            {match.court} {match.referee ? `· TT: ${match.referee}` : ""}
          </span>
          <button
            className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold ring-1 ring-line/20 hover:bg-secondary/80"
            onClick={() => setShowHistory(true)}
          >
            📊 Lịch sử ({live.history.length})
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
                    <span className="truncate flex-1 font-medium">{getPlayerDisplay(pName)}</span>
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
                    <span className="truncate flex-1 font-medium">{getPlayerDisplay(pName)}</span>
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

        {/* Sân bóng Mini mô phỏng vị trí VĐV theo ô đứng */}
        <div className="mx-auto mt-3 max-w-md">
          {doubles && (
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px] text-line/60">
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded bg-secondary px-1.5 py-0.5 font-bold hover:bg-secondary/80 ring-1 ring-line/15"
                  onClick={() =>
                    push({
                      posA: [posA[1], posA[0]],
                    })
                  }
                  title="Đổi ô đứng của 2 VĐV Đội A"
                >
                  ↔️ Đổi ô Đội A
                </button>
                <button
                  type="button"
                  className="rounded bg-secondary px-1.5 py-0.5 font-bold hover:bg-secondary/80 ring-1 ring-line/15"
                  onClick={() =>
                    push({
                      posB: [posB[1], posB[0]],
                    })
                  }
                  title="Đổi ô đứng của 2 VĐV Đội B"
                >
                  ↔️ Đổi ô Đội B
                </button>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded bg-secondary px-1.5 py-0.5 font-bold hover:bg-secondary/80 ring-1 ring-line/15"
                  onClick={() =>
                    push({
                      serverIdx: 1 - live.serverIdx,
                    })
                  }
                  title="Đổi quyền giao bóng cho đồng đội"
                >
                  🔄 Đổi người giao
                </button>
                <button
                  type="button"
                  className="rounded bg-secondary px-1.5 py-0.5 font-bold hover:bg-secondary/80 ring-1 ring-line/15"
                  onClick={() =>
                    push({
                      receiverIdx: 1 - live.receiverIdx,
                    })
                  }
                  title="Đổi quyền nhận bóng cho đối thủ"
                >
                  🔄 Đổi người nhận
                </button>
              </div>
            </div>
          )}

          <div className="relative h-32 w-full overflow-hidden rounded-xl border-2 border-white/90 bg-emerald-800 shadow-inner select-none">
            {/* Vạch lưới chính giữa */}
            <div className="absolute inset-y-0 left-1/2 w-1.5 -translate-x-1/2 bg-white z-20 shadow-md flex items-center justify-center">
              <span className="rotate-90 text-[8px] font-extrabold uppercase tracking-widest text-emerald-950 bg-white/95 px-1 py-0.5 rounded shadow-xs">
                Lưới
              </span>
            </div>
            {/* Kitchen (NVZ) trái */}
            <div className="absolute inset-y-0 left-[34%] w-0.5 bg-white/60 z-10" />
            {/* Kitchen (NVZ) phải */}
            <div className="absolute inset-y-0 right-[34%] w-0.5 bg-white/60 z-10" />
            {/* Vạch giữa ô giao bóng bên trái */}
            <div className="absolute left-0 top-1/2 right-[66%] h-0.5 bg-white/60" />
            {/* Vạch giữa ô giao bóng bên phải */}
            <div className="absolute left-[66%] top-1/2 right-0 h-0.5 bg-white/60" />

            {/* Vị trí VĐV Đội A (Nửa trái): Ô trên là Trái (Lẻ), Ô dưới là Phải (Chẵn) */}
            <div className="absolute inset-y-0 left-0 w-[34%] grid grid-rows-2 p-1 gap-1">
              {/* Ô Trái (Lẻ) - index posA[1] */}
              {(() => {
                const idx = doubles ? (posA[1] ?? 1) : 0;
                const pName = (doubles ? namesA[idx] : namesA[0]) || namesA[0] || "VĐV A";
                const isServ = live.serveTeam === 0 && live.serverIdx === idx;
                const isRecv = live.serveTeam === 1 && live.receiverIdx === idx;
                return (
                  <div
                    className={`flex flex-col justify-center rounded px-1 text-[10px] truncate transition ${
                      isServ
                        ? "bg-amber-400 text-black font-extrabold shadow-md ring-2 ring-amber-300"
                        : isRecv
                          ? "bg-blue-400 text-black font-extrabold ring-2 ring-white"
                          : "bg-emerald-900/80 text-white/90 border border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[8px] opacity-75">
                      <span>{doubles ? "Trái (Lẻ)" : "A"}</span>
                      {isServ && <span>🎾</span>}
                      {isRecv && <span>🛡️</span>}
                    </div>
                    <span className="truncate font-bold">{pName}</span>
                  </div>
                );
              })()}

              {/* Ô Phải (Chẵn) - index posA[0] */}
              {(() => {
                const idx = doubles ? (posA[0] ?? 0) : 0;
                const pName = (doubles ? namesA[idx] : namesA[0]) || namesA[0] || "VĐV A";
                const isServ = live.serveTeam === 0 && live.serverIdx === idx;
                const isRecv = live.serveTeam === 1 && live.receiverIdx === idx;
                return (
                  <div
                    className={`flex flex-col justify-center rounded px-1 text-[10px] truncate transition ${
                      isServ
                        ? "bg-amber-400 text-black font-extrabold shadow-md ring-2 ring-amber-300"
                        : isRecv
                          ? "bg-blue-400 text-black font-extrabold ring-2 ring-white"
                          : "bg-emerald-900/80 text-white/90 border border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[8px] opacity-75">
                      <span>{doubles ? "Phải (Chẵn)" : "A"}</span>
                      {isServ && <span>🎾</span>}
                      {isRecv && <span>🛡️</span>}
                    </div>
                    <span className="truncate font-bold">{pName}</span>
                  </div>
                );
              })()}
            </div>

            {/* Vị trí VĐV Đội B (Nửa phải): Ô trên là Phải (Chẵn), Ô dưới là Trái (Lẻ) để chéo qua lưới! */}
            <div className="absolute inset-y-0 right-0 w-[34%] grid grid-rows-2 p-1 gap-1 text-right">
              {/* Ô Phải (Chẵn) - index posB[0] */}
              {(() => {
                const idx = doubles ? (posB[0] ?? 0) : 0;
                const pName = (doubles ? namesB[idx] : namesB[0]) || namesB[0] || "VĐV B";
                const isServ = live.serveTeam === 1 && live.serverIdx === idx;
                const isRecv = live.serveTeam === 0 && live.receiverIdx === idx;
                return (
                  <div
                    className={`flex flex-col justify-center rounded px-1 text-[10px] truncate transition ${
                      isServ
                        ? "bg-amber-400 text-black font-extrabold shadow-md ring-2 ring-amber-300"
                        : isRecv
                          ? "bg-blue-400 text-black font-extrabold ring-2 ring-white"
                          : "bg-emerald-900/80 text-white/90 border border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[8px] opacity-75">
                      {isServ && <span>🎾</span>}
                      {isRecv && <span>🛡️</span>}
                      <span className="ml-auto">{doubles ? "Phải (Chẵn)" : "B"}</span>
                    </div>
                    <span className="truncate font-bold">{pName}</span>
                  </div>
                );
              })()}

              {/* Ô Trái (Lẻ) - index posB[1] */}
              {(() => {
                const idx = doubles ? (posB[1] ?? 1) : 0;
                const pName = (doubles ? namesB[idx] : namesB[0]) || namesB[0] || "VĐV B";
                const isServ = live.serveTeam === 1 && live.serverIdx === idx;
                const isRecv = live.serveTeam === 0 && live.receiverIdx === idx;
                return (
                  <div
                    className={`flex flex-col justify-center rounded px-1 text-[10px] truncate transition ${
                      isServ
                        ? "bg-amber-400 text-black font-extrabold shadow-md ring-2 ring-amber-300"
                        : isRecv
                          ? "bg-blue-400 text-black font-extrabold ring-2 ring-white"
                          : "bg-emerald-900/80 text-white/90 border border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[8px] opacity-75">
                      {isServ && <span>🎾</span>}
                      {isRecv && <span>🛡️</span>}
                      <span className="ml-auto">{doubles ? "Trái (Lẻ)" : "B"}</span>
                    </div>
                    <span className="truncate font-bold">{pName}</span>
                  </div>
                );
              })()}
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
              const u0 = live.toUsed?.[0] ?? 0;
              const u1 = live.toUsed?.[1] ?? 0;
              setLive({ toUsed: [u0 + 1, u1] });
              startTimer(`Hội ý · ${entryName(teamA)}`, live.timeoutSeconds);
            }}
          >
            ⏱ Hội ý ({Math.max(0, (live.timeoutsPerTeam ?? 1) - (live.toUsed?.[0] ?? 0))})
          </button>
          <button
            className="rounded-md bg-destructive px-2 py-1 text-destructive-foreground hover:opacity-90"
            onClick={() => {
              const m0 = live.medUsed?.[0] ?? 0;
              const m1 = live.medUsed?.[1] ?? 0;
              setLive({ medUsed: [m0 + 1, m1] });
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
              const m0 = live.medUsed?.[0] ?? 0;
              const m1 = live.medUsed?.[1] ?? 0;
              setLive({ medUsed: [m0, m1 + 1] });
              startTimer(`Y tế · ${entryName(teamB)}`, live.medicalSeconds);
            }}
          >
            MED
          </button>
          <button
            className="rounded-md bg-paper px-2 py-1 ring-1 ring-line/20 hover:bg-paper/80"
            onClick={() => {
              const u0 = live.toUsed?.[0] ?? 0;
              const u1 = live.toUsed?.[1] ?? 0;
              setLive({ toUsed: [u0, u1 + 1] });
              startTimer(`Hội ý · ${entryName(teamB)}`, live.timeoutSeconds);
            }}
          >
            ⏱ Hội ý ({Math.max(0, (live.timeoutsPerTeam ?? 1) - (live.toUsed?.[1] ?? 0))})
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
