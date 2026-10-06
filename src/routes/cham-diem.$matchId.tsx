import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as React from "react";
import { toast } from "sonner";
import {
  entryName,
  getMatchEntryA,
  getMatchEntryB,
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

const LIVE_SCORING_PREFS_KEY = "pickleball_live_scoring_prefs";

type LiveScoringPrefs = {
  scoring: "sideout" | "rally" | "manual";
  target: number;
  winBy2: boolean;
  timeoutSeconds: number;
  medicalSeconds: number;
  timeoutsPerTeam: number;
};

const getSavedLivePrefs = (): Partial<LiveScoringPrefs> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LIVE_SCORING_PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const saveLivePrefs = (prefs: Partial<LiveScoringPrefs>) => {
  if (typeof window === "undefined") return;
  try {
    const current = getSavedLivePrefs();
    localStorage.setItem(LIVE_SCORING_PREFS_KEY, JSON.stringify({ ...current, ...prefs }));
  } catch {}
};

const defaultLive = (): LiveState => {
  const prefs = getSavedLivePrefs();
  return {
    scoring: prefs.scoring ?? "sideout",
    target: typeof prefs.target === "number" ? prefs.target : 11,
    winBy2: typeof prefs.winBy2 === "boolean" ? prefs.winBy2 : true,
    timeoutSeconds: typeof prefs.timeoutSeconds === "number" ? prefs.timeoutSeconds : 60,
    medicalSeconds: typeof prefs.medicalSeconds === "number" ? prefs.medicalSeconds : 900,
    timeoutsPerTeam: typeof prefs.timeoutsPerTeam === "number" ? prefs.timeoutsPerTeam : 1,
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
  };
};

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
          ? "rounded-xl bg-[#0a3320]/10 px-4 py-3 text-sm font-bold text-[#0a3320] border border-[#0a3320] shadow-2xs transition-all"
          : "rounded-xl bg-card px-4 py-3 text-sm font-semibold text-line/80 border border-line/20 hover:bg-card/80 transition-all"
      }
    >
      {children}
    </button>
  );
}

const Lbl = ({
  children,
  center = true,
  className = "",
}: {
  children: ReactNode;
  center?: boolean;
  className?: string;
}) => (
  <p
    className={`mt-5 text-xs font-semibold uppercase tracking-[0.15em] text-line/60 ${
      center ? "text-center" : ""
    } ${className}`}
  >
    {children}
  </p>
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
  const [courtFlipped, setCourtFlipped] = useState(false);
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

  const ev = state.events.find((e) => e.id === match.eventId);
  const teamA = getMatchEntryA(match, state.entries);
  const teamB = getMatchEntryB(match, state.entries);
  const rawNamesA = teamA?.players.map((p) => p.name?.trim()).filter(Boolean) ?? [];
  const rawNamesB = teamB?.players.map((p) => p.name?.trim()).filter(Boolean) ?? [];
  const namesA = rawNamesA.length > 0 ? rawNamesA : [entryName(teamA)];
  const namesB = rawNamesB.length > 0 ? rawNamesB : [entryName(teamB)];
  
  const prefs = getSavedLivePrefs();
  const rawLive = match.live;

  // Trận đấu chưa ghi điểm nào: Luôn ưu tiên dùng các cài đặt đã lưu ghi nhớ từ lần gần nhất!
  const hasRecordedScore = Boolean(
    rawLive &&
      ((rawLive.history && rawLive.history.length > 0) ||
        rawLive.a > 0 ||
        rawLive.b > 0)
  );

  const initialScoring =
    !hasRecordedScore && prefs.scoring
      ? prefs.scoring
      : (rawLive?.scoring ?? prefs.scoring ?? "sideout");
  const initialTarget =
    !hasRecordedScore && typeof prefs.target === "number"
      ? prefs.target
      : (rawLive?.target ?? prefs.target ?? 11);
  const initialWinBy2 =
    !hasRecordedScore && typeof prefs.winBy2 === "boolean"
      ? prefs.winBy2
      : typeof rawLive?.winBy2 === "boolean"
      ? rawLive.winBy2
      : typeof prefs.winBy2 === "boolean"
      ? prefs.winBy2
      : true;
  const initialTimeoutSec =
    !hasRecordedScore && typeof prefs.timeoutSeconds === "number"
      ? prefs.timeoutSeconds
      : (rawLive?.timeoutSeconds ?? prefs.timeoutSeconds ?? 60);
  const initialMedicalSec =
    !hasRecordedScore && typeof prefs.medicalSeconds === "number"
      ? prefs.medicalSeconds
      : (rawLive?.medicalSeconds ?? prefs.medicalSeconds ?? 900);
  const initialTimeoutsPerTeam =
    !hasRecordedScore && typeof prefs.timeoutsPerTeam === "number"
      ? prefs.timeoutsPerTeam
      : (rawLive?.timeoutsPerTeam ?? prefs.timeoutsPerTeam ?? 1);

  const live: LiveState = {
    ...defaultLive(),
    ...(rawLive ?? {}),
    scoring: initialScoring,
    target: initialTarget,
    winBy2: initialWinBy2,
    timeoutSeconds: initialTimeoutSec,
    medicalSeconds: initialMedicalSec,
    timeoutsPerTeam: initialTimeoutsPerTeam,
    toUsed: Array.isArray(rawLive?.toUsed)
      ? [rawLive.toUsed[0] ?? 0, rawLive.toUsed[1] ?? 0]
      : [0, 0],
    medUsed: Array.isArray(rawLive?.medUsed)
      ? [rawLive.medUsed[0] ?? 0, rawLive.medUsed[1] ?? 0]
      : [0, 0],
    history: Array.isArray(rawLive?.history) ? rawLive.history : [],
    posA: Array.isArray(rawLive?.posA)
      ? [rawLive.posA[0] ?? 0, rawLive.posA[1] ?? 1]
      : [0, 1],
    posB: Array.isArray(rawLive?.posB)
      ? [rawLive.posB[0] ?? 0, rawLive.posB[1] ?? 1]
      : [0, 1],
    playerIcons: rawLive?.playerIcons ?? {},
  };

  const doubles = (ev ? ev.mode === "doi" : true) && (namesA.length > 1 || namesB.length > 1);
  const isSideout = live.scoring === "sideout";

  const posA: [number, number] = live.posA ?? [0, 1];
  const posB: [number, number] = live.posB ?? [0, 1];

  const setLive = (patch: Partial<LiveState>) => {
    const nextLive = { ...live, ...patch };
    const toSave: Partial<LiveScoringPrefs> = {
      scoring: nextLive.scoring,
      target: nextLive.target,
      winBy2: nextLive.winBy2,
      timeoutSeconds: nextLive.timeoutSeconds,
      medicalSeconds: nextLive.medicalSeconds,
      timeoutsPerTeam: nextLive.timeoutsPerTeam,
    };
    saveLivePrefs(toSave);
    updateMatch(match.id, { live: nextLive });
  };

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
        <div className="mb-4 flex items-center justify-center border-b border-line/10 pb-3">
          <span className="text-xs font-semibold text-line/50">Cài đặt trận đấu</span>
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-line/60 text-center">
          Chấm điểm trực tiếp
        </p>
        <h1 className="mt-1 font-head text-2xl font-bold uppercase tracking-tight text-center">
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
        <p className="text-xs text-line/60 text-center">Bấm chọn trực tiếp hoặc tung đồng xu ngẫu nhiên:</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[entryName(teamA), entryName(teamB)].map((n, i) => {
            const highlight = tossing ? tossFlash === i : tossed && live.serveTeam === i;
            return (
              <button
                key={n + i}
                type="button"
                onClick={() => {
                  setLive({ serveTeam: i as 0 | 1, ...(doubles ? {} : { serverIdx: 0, receiverIdx: 0 }) });
                  setSelectedServerIdx(doubles ? null : 0);
                  setSelectedReceiverIdx(doubles ? null : 0);
                  setTossed(true);
                }}
                className={
                  highlight
                    ? "rounded-xl bg-[#0a3320]/10 p-4 text-center font-head text-base font-bold text-[#0a3320] border border-[#0a3320]"
                    : "rounded-xl bg-card p-4 text-center font-head text-base font-bold text-line/70 border border-line/20 hover:bg-card/80"
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
                  setLive({ serveTeam: r, ...(doubles ? {} : { serverIdx: 0, receiverIdx: 0 }) });
                  setSelectedServerIdx(doubles ? null : 0);
                  setSelectedReceiverIdx(doubles ? null : 0);
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
          doubles ? (
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
                          ? "bg-[#0a3320]/10 border border-[#0a3320] shadow-2xs"
                          : "bg-card border border-line/20 hover:bg-card/80"
                      }`}
                    >
                      <div className={`truncate py-1 text-center font-bold text-sm ${isSelected ? "text-[#0a3320] font-bold" : "text-line/80"}`}>
                        {n}
                      </div>
                      <input
                        type="text"
                        placeholder="Ghi chú..."
                        value={live.playerIcons?.[n] ?? ""}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setPlayerIcon(n, e.target.value)}
                        className="mt-1.5 w-full rounded-md border border-line/20 bg-paper px-2 py-1 text-center text-xs outline-none hover:border-[#0a3320] focus:border-[#0a3320]"
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
                          ? "bg-[#0a3320]/10 border border-[#0a3320] shadow-2xs"
                          : "bg-card border border-line/20 hover:bg-card/80"
                      }`}
                    >
                      <div className={`truncate py-1 text-center font-bold text-sm ${isSelected ? "text-[#0a3320] font-bold" : "text-line/80"}`}>
                        {n}
                      </div>
                      <input
                        type="text"
                        placeholder="Ghi chú..."
                        value={live.playerIcons?.[n] ?? ""}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setPlayerIcon(n, e.target.value)}
                        className="mt-1.5 w-full rounded-md border border-line/20 bg-paper px-2 py-1 text-center text-xs outline-none hover:border-[#0a3320] focus:border-[#0a3320]"
                      />
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <Lbl>Ghi chú VĐV (đấu đơn)</Lbl>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  { name: namesA[0] || entryName(teamA), teamLabel: entryName(teamA) },
                  { name: namesB[0] || entryName(teamB), teamLabel: entryName(teamB) },
                ].map(({ name, teamLabel }) => (
                  <div
                    key={name}
                    className="rounded-xl bg-card border border-line/20 p-3 text-center transition-all select-none"
                  >
                    <div className="truncate py-1 text-center font-bold text-sm text-line/80">
                      {name}
                    </div>
                    <p className="text-[11px] text-line/50 mb-1">{teamLabel}</p>
                    <input
                      type="text"
                      placeholder="Ghi chú (màu áo, vợt...)..."
                      value={live.playerIcons?.[name] ?? ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setPlayerIcon(name, e.target.value)}
                      className="mt-1 w-full rounded-md border border-line/20 bg-paper px-2 py-1 text-center text-xs outline-none hover:border-[#0a3320] focus:border-[#0a3320]"
                    />
                  </div>
                ))}
              </div>
            </>
          )
        ) : (
          <p className="mt-4 text-center text-xs text-line/50">
            Tung đồng xu hoặc bấm chọn đội giao bóng để tiếp tục.
          </p>
        )}

        <button
          className="mt-6 w-full cursor-pointer rounded-lg bg-courtdeep py-3.5 font-head text-base font-bold uppercase tracking-wide text-paper hover:bg-courtdeep/90 transition shadow-md"
          onClick={() => {
            saveLivePrefs({
              scoring: live.scoring,
              target: live.target,
              winBy2: live.winBy2,
              timeoutSeconds: live.timeoutSeconds,
              medicalSeconds: live.medicalSeconds,
              timeoutsPerTeam: live.timeoutsPerTeam,
            });

            const effServerIdx = doubles
              ? (live.scoring === "rally"
                  ? (live.serveTeam === 0 ? (live.posA?.[0] ?? 0) : (live.posB?.[0] ?? 0))
                  : (selectedServerIdx ?? live.serverIdx ?? 0))
              : 0;
            const effReceiverIdx = doubles
              ? (live.scoring === "rally"
                  ? (live.serveTeam === 0 ? (live.posB?.[0] ?? 0) : (live.posA?.[0] ?? 0))
                  : (selectedReceiverIdx ?? live.receiverIdx ?? 0))
              : 0;
            const nextPosA: [number, number] = live.posA ? [...live.posA] : [0, 1];
            const nextPosB: [number, number] = live.posB ? [...live.posB] : [0, 1];
            // Đặt người giao đầu tiên và người nhận đầu tiên vào ô Phải (pos[0] - đối diện chéo nhau)
            if (doubles) {
              if (live.serveTeam === 0) {
                nextPosA[0] = effServerIdx;
                nextPosA[1] = 1 - effServerIdx;
                nextPosB[0] = effReceiverIdx;
                nextPosB[1] = 1 - effReceiverIdx;
              } else {
                nextPosB[0] = effServerIdx;
                nextPosB[1] = 1 - effServerIdx;
                nextPosA[0] = effReceiverIdx;
                nextPosA[1] = 1 - effReceiverIdx;
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
          courtFlipped: courtFlipped,
        } as any,
      ],
    });

  const coPoint = live.target === 11 ? 6 : live.target === 15 ? 8 : Math.ceil(live.target / 2);

  const afterScore = (na: number, nb: number) => {
    if (!coDone && (na === coPoint || nb === coPoint)) {
      setCoDone(true);
      setChangeover(true);
      // Tự động lật ngược đổi sân cho sân mini nhỏ trong bảng chấm điểm theo yêu cầu
      setCourtFlipped((prev) => !prev);
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

  /** Chấm điểm Rally Score chuẩn luật Pickleball */
  const scoreRally = (winningTeam: 0 | 1) => {
    const na = winningTeam === 0 ? live.a + 1 : live.a;
    const nb = winningTeam === 1 ? live.b + 1 : live.b;
    const winScore = winningTeam === 0 ? na : nb;

    // Chuẩn luật Rally Scoring Pickleball:
    // 1. Bên nào thắng rally thì bên đó được cộng 1 điểm, bất kể họ đang giao bóng hay đang nhận bóng.
    // 2. Bên thắng rally nhận/giữ quyền giao bóng tiếp theo (nextServeTeam = winningTeam).
    // 3. Hai người trong đội KHÔNG ĐỔI Ô ĐỨNG CHO NHAU (posA và posB giữ nguyên).
    // 4. Người giao bóng tiếp theo được xác định theo quy tắc:
    //    - Điểm đội giao là số chẵn: người đứng bên phải (pos[0]) giao bóng.
    //    - Điểm đội giao là số lẻ: người đứng bên trái (pos[1]) giao bóng.
    //    (Nếu đang cầm giao bóng mà ghi điểm, tiếp tục lượt giao đưa cho người còn lại giao vì điểm tăng 1 từ chẵn sang lẻ hoặc lẻ sang chẵn).
    const isEven = winScore % 2 === 0;
    const servingPos = winningTeam === 0 ? posA : posB;
    const opponentPos = winningTeam === 0 ? posB : posA;

    const nextServerIdx = doubles ? (isEven ? (servingPos[0] ?? 0) : (servingPos[1] ?? 1)) : 0;
    const nextReceiverIdx = doubles ? (isEven ? (opponentPos[0] ?? 0) : (opponentPos[1] ?? 1)) : 0;

    push({
      a: na,
      b: nb,
      serveTeam: winningTeam,
      serverIdx: nextServerIdx,
      receiverIdx: nextReceiverIdx,
      posA: [...posA],
      posB: [...posB],
      serverNum: 1,
    });
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
    if (typeof (last as any).courtFlipped === "boolean") {
      setCourtFlipped((last as any).courtFlipped);
    }
    if (last.a < coPoint && last.b < coPoint) {
      setCoDone(false);
    }
    setLive({
      ...last,
      posA: last.posA ?? posA,
      posB: last.posB ?? posB,
      receiverIdx: last.receiverIdx ?? live.receiverIdx,
      history: live.history.slice(0, -1),
    });
  };

  // Xác định đội hiển thị bên trái / bên phải sân mini tùy theo trạng thái lật ngang (courtFlipped)
  const leftTeamIdx: 0 | 1 = courtFlipped ? 1 : 0;
  const rightTeamIdx: 0 | 1 = courtFlipped ? 0 : 1;

  const getSideCourtPlayers = (teamIdx: 0 | 1, side: "left" | "right") => {
    const names = teamIdx === 0 ? namesA : namesB;
    const pos = teamIdx === 0 ? posA : posB;

    if (!doubles) {
      // Nội dung đơn: điểm chẵn của người giao bóng đứng ô Phải (Chẵn), điểm lẻ đứng ô Trái (Lẻ)
      // Người nhận đứng ở ô chéo đối diện
      const servingScore = live.serveTeam === 0 ? live.a : live.b;
      const isRightCourtActive = servingScore % 2 === 0;
      const pName = names[0] || (teamIdx === 0 ? "VĐV A" : "VĐV B");
      const pNote = live.playerIcons?.[pName]?.trim() || "";
      const isServ = live.serveTeam === teamIdx;
      // Nửa sân bên trái: ô Dưới là Phải (Chẵn), ô Trên là Trái (Lẻ)
      // Nửa sân bên phải: ô Trên là Phải (Chẵn), ô Dưới là Trái (Lẻ)
      const isPlayerInTop = side === "right" ? isRightCourtActive : !isRightCourtActive;
      return {
        top: isPlayerInTop ? { name: pName, note: pNote, isServ } : { name: "", note: "", isServ: false },
        bottom: !isPlayerInTop ? { name: pName, note: pNote, isServ } : { name: "", note: "", isServ: false },
      };
    }

    // Nội dung đôi:
    // Nửa sân bên trái: ô Trên là Trái (Lẻ - pos[1]), ô Dưới là Phải (Chẵn - pos[0])
    // Nửa sân bên phải: ô Trên là Phải (Chẵn - pos[0]), ô Dưới là Trái (Lẻ - pos[1])
    const topPlayerIdx = side === "left" ? (pos[1] ?? 1) : (pos[0] ?? 0);
    const bottomPlayerIdx = side === "left" ? (pos[0] ?? 0) : (pos[1] ?? 1);

    const topName = names[topPlayerIdx] || names[0] || "";
    const bottomName = names[bottomPlayerIdx] || names[1] || names[0] || "";

    const isServingTeam = live.serveTeam === teamIdx;
    const activeServerIdx =
      live.scoring === "rally"
        ? (teamIdx === 0 ? live.a : live.b) % 2 === 0
          ? (pos[0] ?? 0)
          : (pos[1] ?? 1)
        : live.serverIdx;

    return {
      top: {
        name: topName,
        note: live.playerIcons?.[topName]?.trim() || "",
        isServ: isServingTeam && activeServerIdx === topPlayerIdx,
      },
      bottom: {
        name: bottomName,
        note: live.playerIcons?.[bottomName]?.trim() || "",
        isServ: isServingTeam && activeServerIdx === bottomPlayerIdx,
      },
    };
  };

  const leftSideBoxes = getSideCourtPlayers(leftTeamIdx, "left");
  const rightSideBoxes = getSideCourtPlayers(rightTeamIdx, "right");

  const ballCount = doubles && isSideout && live.serverNum === 2 ? 2 : 1;

  const renderPickleballIcon = (key: number) => (
    <svg
      key={key}
      className="size-3.5 text-ink/75 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="9" cy="8.5" r="1.2" />
      <circle cx="15" cy="8.5" r="1.2" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="8.5" cy="14.8" r="1.2" />
      <circle cx="15.5" cy="14.8" r="1.2" />
      <circle cx="12" cy="17.5" r="1" />
      <circle cx="12" cy="6" r="1" />
    </svg>
  );

  const renderCourtCell = (
    cell: { name: string; note: string; isServ: boolean },
    extraClass = "",
  ) => {
    const cleanNote = cell.note.replace(/^\(+|\)+$/g, "").trim();
    return (
      <div
        className={`flex flex-col items-center justify-center px-2 py-1 text-center select-none ${extraClass}`}
      >
        {cell.name ? (
          <>
            <span className="truncate max-w-full text-sm font-semibold text-ink leading-tight">
              {cell.name}
            </span>
            {cleanNote && (
              <span className="mt-0.5 truncate max-w-full text-[11px] font-normal text-line/60 leading-tight">
                ({cleanNote})
              </span>
            )}
            <div className="mt-1 flex h-4 items-center justify-center gap-1.5">
              {cell.isServ
                ? Array.from({ length: ballCount }, (_, idx) => renderPickleballIcon(idx))
                : null}
            </div>
          </>
        ) : null}
      </div>
    );
  };

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
            onClick={() => setNoteOpen(true)}
          >
            📝 Ghi chú {live.note ? "✓" : ""}
          </button>
        </div>
      </div>

      {/* Header điểm số lớn */}
      <div className="bg-line/5 py-3 text-center border-b border-line/10 shrink-0">
        <div className="flex items-center justify-center gap-3">
          <p className="font-head text-5xl font-extrabold tracking-tight">
            {live.serveTeam === 0 ? live.a : live.b} - {live.serveTeam === 0 ? live.b : live.a}
            {isSideout && doubles ? ` - ${live.serverNum}` : ""}
          </p>
        </div>
        <p className="mt-1 text-xs text-line/60">
          {entryName(teamA)} ({live.a}) · {entryName(teamB)} ({live.b})
        </p>
      </div>

      {/* Vùng chính: 2 ô bấm điểm lớn chiếm trọn 2 nửa Trái / Phải + Sân Pickleball Mini thanh mảnh ở giữa */}
      <div className="relative grid flex-1 grid-cols-2 min-h-[340px]">
        {/* Ô bấm điểm lớn bên TRÁI: Trong Rally Score, bấm +1 điểm cho đội đang đứng bên TRÁI sân */}
        <button
          type="button"
          className="flex flex-col items-center justify-end pb-12 sm:pb-16 pt-48 bg-court/15 transition hover:bg-court/20 active:bg-court/25 cursor-pointer select-none"
          onClick={() => {
            if (isSideout) {
              scoreForServing();
            } else if (live.scoring === "rally") {
              scoreRally(leftTeamIdx);
            } else {
              pointFor(leftTeamIdx);
            }
          }}
        >
          <span className="font-head text-4xl sm:text-5xl font-extrabold uppercase tracking-tight text-courtdeep">
            +1 Điểm
          </span>
          <span className="mt-2 text-xs font-semibold text-line/70">
            cho {isSideout ? (live.serveTeam === 0 ? entryName(teamA) : entryName(teamB)) : entryName(leftTeamIdx === 0 ? teamA : teamB)}
          </span>
        </button>

        {/* Ô bấm điểm lớn bên PHẢI: Trong Rally Score, bấm +1 điểm cho đội đang đứng bên PHẢI sân */}
        <button
          type="button"
          className="flex flex-col items-center justify-end pb-12 sm:pb-16 pt-48 bg-card transition hover:bg-card/80 active:bg-line/10 border-l border-line/15 cursor-pointer select-none"
          onClick={() => {
            if (isSideout) {
              sideOut();
            } else if (live.scoring === "rally") {
              scoreRally(rightTeamIdx);
            } else {
              pointFor(rightTeamIdx);
            }
          }}
        >
          <span className={`font-head text-4xl sm:text-5xl font-extrabold uppercase tracking-tight ${isSideout ? "text-line" : "text-courtdeep"}`}>
            {isSideout ? "Mất giao" : "+1 Điểm"}
          </span>
          <span className="mt-2 text-xs font-semibold text-line/70">
            {isSideout ? "Đổi lượt giao (Side-out)" : `cho ${entryName(rightTeamIdx === 0 ? teamA : teamB)}`}
          </span>
        </button>

        {/* Sân Pickleball Mini đặt ở giữa phía trên + nút lật ngang sân */}
        <div
          className="pointer-events-none absolute inset-x-0 top-4 sm:top-6 z-10 flex flex-col items-center px-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto w-full max-w-[440px] overflow-hidden rounded-xl border border-line/35 bg-paper shadow-xs"
          >
            <div className="grid h-36 sm:h-40 grid-cols-[1fr_28px_28px_1fr]">
              {/* Nửa sân bên trái: 2 ô trên / dưới */}
              <div className="grid grid-rows-2 border-r border-line/30">
                {renderCourtCell(leftSideBoxes.top, "border-b border-line/30")}
                {renderCourtCell(leftSideBoxes.bottom)}
              </div>

              {/* Khu vực Kitchen (NVZ) bên trái lưới */}
              <div className="border-r border-line/45 bg-line/[0.03]" />

              {/* Khu vực Kitchen (NVZ) bên phải lưới */}
              <div className="border-r border-line/30 bg-line/[0.03]" />

              {/* Nửa sân bên phải: 2 ô trên / dưới */}
              <div className="grid grid-rows-2">
                {renderCourtCell(rightSideBoxes.top, "border-b border-line/30")}
                {renderCourtCell(rightSideBoxes.bottom)}
              </div>
            </div>
          </div>

          {/* Nút lật ngược sân theo chiều ngang ở giữa bên dưới sân mini */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCourtFlipped((f) => !f);
            }}
            title="Lật ngược sân Pickleball theo chiều ngang"
            aria-label="Lật ngược sân Pickleball theo chiều ngang"
            className="pointer-events-auto mt-1.5 flex items-center justify-center rounded-full border border-line/25 bg-paper px-2.5 py-1 text-xs font-semibold text-line/70 shadow-2xs transition hover:border-line/50 hover:text-ink active:scale-95 cursor-pointer"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 16l-4-4 4-4" />
              <path d="M17 8l4 4-4 4" />
              <line x1="3" y1="12" x2="21" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Thanh hội ý & Y tế theo phía sân hiển thị */}
      <div className="flex items-center justify-between gap-2 border-t border-line/10 bg-card px-3 py-2 text-[11px] font-semibold">
        <div className="flex items-center gap-1.5">
          <span className="max-w-[90px] truncate text-line/70">{entryName(leftTeamIdx === 0 ? teamA : teamB)}</span>
          {(() => {
            const leftName = entryName(leftTeamIdx === 0 ? teamA : teamB);
            const remainingTo = Math.max(0, (live.timeoutsPerTeam ?? 1) - (live.toUsed?.[leftTeamIdx] ?? 0));
            const isToExhausted = remainingTo <= 0;
            const remainingMed = Math.max(0, 1 - (live.medUsed?.[leftTeamIdx] ?? 0));
            const isMedExhausted = remainingMed <= 0;
            return (
              <>
                <button
                  className={`rounded-md px-2 py-1 ring-1 transition cursor-pointer ${
                    isToExhausted
                      ? "bg-line/10 text-line/40 ring-line/10"
                      : "bg-paper text-ink ring-line/20 hover:bg-paper/80"
                  }`}
                  onClick={() => {
                    if (isToExhausted) {
                      toast.error(`Đội ${leftName} đã hết lượt hội ý!`);
                      return;
                    }
                    const u0 = live.toUsed?.[0] ?? 0;
                    const u1 = live.toUsed?.[1] ?? 0;
                    const nextTo: [number, number] = leftTeamIdx === 0 ? [u0 + 1, u1] : [u0, u1 + 1];
                    setLive({ toUsed: nextTo });
                    startTimer(`Hội ý · ${leftName}`, live.timeoutSeconds);
                  }}
                  title={isToExhausted ? "Đã hết lượt hội ý" : "Bấm để bắt đầu hội ý"}
                >
                  ⏱ Hội ý ({remainingTo})
                </button>
                <button
                  className={`rounded-md px-2 py-1 transition cursor-pointer ${
                    isMedExhausted
                      ? "bg-line/10 text-line/40 ring-1 ring-line/10"
                      : "bg-destructive text-destructive-foreground hover:opacity-90"
                  }`}
                  onClick={() => {
                    if (isMedExhausted) {
                      toast.error(`Đội ${leftName} đã hết lượt hội ý y tế (MED)!`);
                      return;
                    }
                    const m0 = live.medUsed?.[0] ?? 0;
                    const m1 = live.medUsed?.[1] ?? 0;
                    const nextMed: [number, number] = leftTeamIdx === 0 ? [m0 + 1, m1] : [m0, m1 + 1];
                    setLive({ medUsed: nextMed });
                    startTimer(`Y tế · ${leftName}`, live.medicalSeconds);
                  }}
                  title={isMedExhausted ? "Đã hết lượt hội ý y tế" : "Hội ý y tế (MED)"}
                >
                  MED ({remainingMed})
                </button>
              </>
            );
          })()}
        </div>

        <div className="flex items-center gap-1.5">
          {(() => {
            const rightName = entryName(rightTeamIdx === 0 ? teamA : teamB);
            const remainingTo = Math.max(0, (live.timeoutsPerTeam ?? 1) - (live.toUsed?.[rightTeamIdx] ?? 0));
            const isToExhausted = remainingTo <= 0;
            const remainingMed = Math.max(0, 1 - (live.medUsed?.[rightTeamIdx] ?? 0));
            const isMedExhausted = remainingMed <= 0;
            return (
              <>
                <button
                  className={`rounded-md px-2 py-1 transition cursor-pointer ${
                    isMedExhausted
                      ? "bg-line/10 text-line/40 ring-1 ring-line/10"
                      : "bg-destructive text-destructive-foreground hover:opacity-90"
                  }`}
                  onClick={() => {
                    if (isMedExhausted) {
                      toast.error(`Đội ${rightName} đã hết lượt hội ý y tế (MED)!`);
                      return;
                    }
                    const m0 = live.medUsed?.[0] ?? 0;
                    const m1 = live.medUsed?.[1] ?? 0;
                    const nextMed: [number, number] = rightTeamIdx === 0 ? [m0 + 1, m1] : [m0, m1 + 1];
                    setLive({ medUsed: nextMed });
                    startTimer(`Y tế · ${rightName}`, live.medicalSeconds);
                  }}
                  title={isMedExhausted ? "Đã hết lượt hội ý y tế" : "Hội ý y tế (MED)"}
                >
                  MED ({remainingMed})
                </button>
                <button
                  className={`rounded-md px-2 py-1 ring-1 transition cursor-pointer ${
                    isToExhausted
                      ? "bg-line/10 text-line/40 ring-line/10"
                      : "bg-paper text-ink ring-line/20 hover:bg-paper/80"
                  }`}
                  onClick={() => {
                    if (isToExhausted) {
                      toast.error(`Đội ${rightName} đã hết lượt hội ý!`);
                      return;
                    }
                    const u0 = live.toUsed?.[0] ?? 0;
                    const u1 = live.toUsed?.[1] ?? 0;
                    const nextTo: [number, number] = rightTeamIdx === 0 ? [u0 + 1, u1] : [u0, u1 + 1];
                    setLive({ toUsed: nextTo });
                    startTimer(`Hội ý · ${rightName}`, live.timeoutSeconds);
                  }}
                  title={isToExhausted ? "Đã hết lượt hội ý" : "Bấm để bắt đầu hội ý"}
                >
                  ⏱ Hội ý ({remainingTo})
                </button>
              </>
            );
          })()}
          <span className="max-w-[90px] truncate text-line/70">{entryName(rightTeamIdx === 0 ? teamA : teamB)}</span>
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
          <p className="mt-2 text-sm opacity-90 max-w-sm">
            Một đội đã đạt {coPoint} điểm — nhắc hai đội đổi sân. Sân mini và các nút chấm điểm đã tự động lật ngược vị trí hai đội.
          </p>
          <button className="btn-accent mt-6" onClick={() => setChangeover(false)}>
            Đã đổi sân · Tiếp tục thi đấu
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
