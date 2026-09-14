import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/* ---------------- Kiểu dữ liệu ---------------- */

export type PlayerSlot = { name: string; rating: number | null };

/** Một "đội" đăng ký trong nội dung (đơn = 1 người, đôi = 2 người). */
export type Entry = {
  id: string;
  eventId: string;
  players: PlayerSlot[];
  paid: boolean;
};

export type Group = { name: string; entryIds: string[] };

export type MatchStatus = "pending" | "live" | "done";

export type LiveState = {
  scoring: "rally" | "sideout" | "manual";
  target: number;
  winBy2: boolean;
  timeoutSeconds: number;
  medicalSeconds: number;
  timeoutsPerTeam: number;
  serveTeam: 0 | 1;
  serverNum: 1 | 2;
  serverIdx: number;
  receiverIdx: number;
  a: number;
  b: number;
  toUsed: [number, number];
  medUsed: [number, number];
  history: Array<{ a: number; b: number; serveTeam: 0 | 1; serverNum: 1 | 2; serverIdx: number }>;
  note: string;
};

export type Match = {
  id: string;
  eventId: string;
  stage: "group" | "ko";
  groupName: string;
  round: number;
  /** Cột khung giờ trên bảng timeline (0 = khung đầu tiên). undefined nếu chưa xếp vào timeline. */
  timeSlot?: number;
  /** Thời lượng trận (phút), mặc định theo slotMinutes của giải */
  durationMinutes?: number;
  koRound?: string;
  slot?: number;
  aId: string | null;
  bId: string | null;
  customPlaceholderA?: string;
  customPlaceholderB?: string;
  scoreA: number | null;
  scoreB: number | null;
  court: string;
  referee: string;
  status: MatchStatus;
  note?: string;
  live?: LiveState;
};

export type EventMode = "don" | "doi";
export type BracketType = "rr" | "rr_ko";
export type PairMode = "random" | "fixed";

export type TEvent = {
  id: string;
  name: string;
  mode: EventMode;
  bracket: BracketType;
  thirdPlace: boolean;
  pairMode: PairMode;
  winPoints: number;
  lossPoints: number;
  drawPoints: number;
  groupCount: number;
  advancePerGroup: number;
  groups: Group[];
};

export type TournamentState = {
  name: string;
  date: string;
  venue: string;
  venueName: string;
  /** Giờ bắt đầu ngày thi đấu, dạng HH:mm — dùng cho bảng timeline. */
  startTime: string;
  /** Số phút mỗi khung giờ trên timeline. */
  slotMinutes: number;
  courts: string[];
  courtIcons?: Record<string, string>;
  referees?: string[];
  events: TEvent[];
  entries: Entry[];
  matches: Match[];
};

const STORAGE_KEY = "nay-court-tournament-v3";

export const uid = () => Math.random().toString(36).slice(2, 10);

export function makeEvent(name = "Nội dung mới"): TEvent {
  return {
    id: uid(),
    name,
    mode: "doi",
    bracket: "rr_ko",
    thirdPlace: false,
    pairMode: "random",
    winPoints: 2,
    lossPoints: 0,
    drawPoints: 1,
    groupCount: 2,
    advancePerGroup: 2,
    groups: [],
  };
}

const initialState: TournamentState = {
  name: "",
  date: "",
  venue: "",
  venueName: "",
  startTime: "08:00",
  slotMinutes: 30,
  courts: ["Sân 1", "Sân 2"],
  courtIcons: { "Sân 1": "🎾", "Sân 2": "🏓" },
  referees: ["Trọng tài chính", "Trọng tài 1", "Trọng tài 2"],
  events: [],
  entries: [],
  matches: [],
};

type Ctx = {
  state: TournamentState;
  update: (patch: Partial<TournamentState>) => void;
  updateEvent: (id: string, patch: Partial<TEvent>) => void;
  updateMatch: (id: string, patch: Partial<Match>) => void;
  reset: () => void;
};

const TournamentContext = createContext<Ctx | null>(null);

export function TournamentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TournamentState>(initialState);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...initialState, ...(JSON.parse(raw) as TournamentState) });
    } catch {
      /* ignore */
    }
  }, []);

  const commit = useCallback((next: TournamentState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    return next;
  }, []);

  const update = useCallback(
    (patch: Partial<TournamentState>) => setState((prev) => commit({ ...prev, ...patch })),
    [commit],
  );

  const updateEvent = useCallback(
    (id: string, patch: Partial<TEvent>) =>
      setState((prev) =>
        commit({ ...prev, events: prev.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) }),
      ),
    [commit],
  );

  const updateMatch = useCallback(
    (id: string, patch: Partial<Match>) =>
      setState((prev) =>
        commit({
          ...prev,
          matches: prev.matches.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        }),
      ),
    [commit],
  );

  const reset = useCallback(() => {
    setState(initialState);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ state, update, updateEvent, updateMatch, reset }),
    [state, update, updateEvent, updateMatch, reset],
  );

  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>;
}

export function useTournament() {
  const ctx = useContext(TournamentContext);
  if (!ctx) throw new Error("useTournament phải nằm trong TournamentProvider");
  return ctx;
}

/* ---------------- Tiện ích ---------------- */

export function entryName(e: Entry | undefined | null): string {
  if (!e) return "—";
  const names = e.players.map((p) => p.name.trim()).filter(Boolean);
  return names.length ? names.join(" & ") : "Chưa đặt tên";
}

export function entryRating(e: Entry): number {
  const rs = e.players.map((p) => p.rating).filter((r): r is number => typeof r === "number");
  return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
}

const GROUP_LETTERS = "ABCDEFGH".split("");

/** Bốc thăm ngẫu nhiên ghép đôi cân bằng theo điểm trình (mạnh ghép yếu). */
export function drawPairs(entries: Entry[], eventId: string): Entry[] {
  const players = entries.flatMap((e) => e.players.filter((p) => p.name.trim()));
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const sorted = shuffled.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const out: Entry[] = [];
  let i = 0;
  let j = sorted.length - 1;
  while (i < j) {
    out.push({ id: uid(), eventId, players: [sorted[i]!, sorted[j]!], paid: false });
    i++;
    j--;
  }
  if (i === j) out.push({ id: uid(), eventId, players: [sorted[i]!], paid: false });
  return out;
}

/** Chia bảng rải đều theo điểm trình. */
export function splitGroups(entries: Entry[], groupCount: number): Group[] {
  const sorted = [...entries].sort((a, b) => entryRating(b) - entryRating(a));
  const n = Math.max(1, Math.min(groupCount, GROUP_LETTERS.length));
  const groups: Group[] = Array.from({ length: n }, (_, i) => ({
    name: `Bảng ${GROUP_LETTERS[i]}`,
    entryIds: [],
  }));
  sorted.forEach((t, i) => {
    const round = Math.floor(i / n);
    const pos = i % n;
    const idx = round % 2 === 0 ? pos : n - 1 - pos;
    groups[idx]!.entryIds.push(t.id);
  });
  return groups;
}

/** Lịch vòng tròn theo vòng (circle method) để không đội nào đấu 2 trận cùng lúc. */
function roundRobinRounds(ids: string[]): Array<Array<[string, string]>> {
  const list = [...ids];
  if (list.length < 2) return [];
  if (list.length % 2 === 1) list.push("__bye__");
  const n = list.length;
  const rounds: Array<Array<[string, string]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i]!;
      const b = list[n - 1 - i]!;
      if (a !== "__bye__" && b !== "__bye__") pairs.push([a, b]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

/** Sinh lịch vòng bảng cho một nội dung, phân sân theo số sân của giải. */
export function generateGroupMatches(ev: TEvent, entries: Entry[], courts: string[]): Match[] {
  const groups: Group[] =
    ev.groups.length > 0
      ? ev.groups
      : [{ name: "Vòng tròn", entryIds: entries.map((e) => e.id) }];

  const matches: Match[] = [];
  let courtCursor = 0;
  const courtList = courts.length ? courts : ["Sân 1"];

  groups.forEach((g) => {
    // Quy tắc bảng 3 đội: V1 (Đội 1 vs Đội 2), V2 (Thua V1 vs Đội 3), V3 (Thắng V1 vs Đội 3)
    if (g.entryIds.length === 3) {
      const [t1, t2, t3] = g.entryIds as [string, string, string];
      // Vòng 1: Đội 1 vs Đội 2 (Đội 3 nghỉ)
      matches.push({
        id: uid(),
        eventId: ev.id,
        stage: "group",
        groupName: g.name,
        round: 1,
        aId: t1,
        bId: t2,
        scoreA: null,
        scoreB: null,
        court: courtList[courtCursor++ % courtList.length]!,
        referee: "",
        status: "pending",
      });
      // Vòng 2: Đội thua V1 gặp Đội 3 (đội thắng được nghỉ 1 lượt)
      matches.push({
        id: uid(),
        eventId: ev.id,
        stage: "group",
        groupName: g.name,
        round: 2,
        aId: null,
        bId: t3,
        customPlaceholderA: "Thua V1",
        scoreA: null,
        scoreB: null,
        court: courtList[courtCursor++ % courtList.length]!,
        referee: "",
        status: "pending",
      });
      // Vòng 3: Đội thắng V1 gặp Đội 3
      matches.push({
        id: uid(),
        eventId: ev.id,
        stage: "group",
        groupName: g.name,
        round: 3,
        aId: null,
        bId: t3,
        customPlaceholderA: "Thắng V1",
        scoreA: null,
        scoreB: null,
        court: courtList[courtCursor++ % courtList.length]!,
        referee: "",
        status: "pending",
      });
    } else {
      // Các trường hợp bảng 2 đội, 4 đội trở lên: chạy theo circle method
      const rounds = roundRobinRounds(g.entryIds);
      rounds.forEach((pairs, r) => {
        pairs.forEach(([a, b]) => {
          matches.push({
            id: uid(),
            eventId: ev.id,
            stage: "group",
            groupName: g.name,
            round: r + 1,
            aId: a,
            bId: b,
            scoreA: null,
            scoreB: null,
            court: courtList[courtCursor++ % courtList.length]!,
            referee: "",
            status: "pending",
          });
        });
      });
    }
  });

  return matches;
}

export type StandingRow = {
  entryId: string;
  played: number;
  win: number;
  draw: number;
  loss: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  points: number;
};

export function computeStandings(
  entryIds: string[],
  matches: Match[],
  ev: Pick<TEvent, "winPoints" | "lossPoints" | "drawPoints">,
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  entryIds.forEach((id) =>
    rows.set(id, {
      entryId: id,
      played: 0,
      win: 0,
      draw: 0,
      loss: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      diff: 0,
      points: 0,
    }),
  );
  matches.forEach((m) => {
    if (m.scoreA === null || m.scoreB === null) return;
    const a = m.aId ? rows.get(m.aId) : null;
    const b = m.bId ? rows.get(m.bId) : null;
    if (!a || !b) return;
    a.played++;
    b.played++;
    a.pointsFor += m.scoreA;
    a.pointsAgainst += m.scoreB;
    b.pointsFor += m.scoreB;
    b.pointsAgainst += m.scoreA;
    if (m.scoreA > m.scoreB) {
      a.win++;
      b.loss++;
      a.points += ev.winPoints;
      b.points += ev.lossPoints;
    } else if (m.scoreB > m.scoreA) {
      b.win++;
      a.loss++;
      b.points += ev.winPoints;
      a.points += ev.lossPoints;
    } else {
      a.draw++;
      b.draw++;
      a.points += ev.drawPoints;
      b.points += ev.drawPoints;
    }
  });
  return [...rows.values()]
    .map((r) => ({ ...r, diff: r.pointsFor - r.pointsAgainst }))
    .sort((x, y) => y.points - x.points || y.diff - x.diff || y.pointsFor - x.pointsFor);
}

export const KO_LABEL = (size: number) =>
  size === 2
    ? "Chung kết"
    : size === 4
      ? "Bán kết"
      : size === 8
        ? "Tứ kết"
        : size === 16
          ? "Vòng 1/8"
          : size === 32
            ? "Vòng 1/16"
            : `Vòng ${size} đội`;

/**
 * Sinh nhánh loại trực tiếp từ kết quả vòng bảng theo barem chuẩn:
 * - Nhất bảng A gặp Chót (đội đi tiếp cuối cùng) của bảng B/đối diện.
 * - Nhì bảng A gặp áp chót của bảng B/đối diện...
 * - Giữ các đội cùng bảng ở 2 nhánh đối diện (tránh gặp lại nhau trước trận chung kết).
 */
export function generateKnockout(
  ev: TEvent,
  entries: Entry[],
  groupMatches: Match[],
  courts: string[],
): Match[] {
  const groups =
    ev.groups.length > 0
      ? ev.groups
      : [{ name: "Vòng tròn", entryIds: entries.map((e) => e.id) }];

  const byGroup = groups.map((g) => ({
    name: g.name,
    rows: computeStandings(
      g.entryIds,
      groupMatches.filter((m) => m.groupName === g.name),
      ev,
    ),
  }));

  const K = ev.advancePerGroup;
  const numGroups = byGroup.length;
  const pairs: Array<[string | null, string | null]> = [];

  if (numGroups >= 2) {
    // Barem ghép chéo đối diện: Nhất (rank 0) gặp Chót (rank K - 1), Nhì (rank 1) gặp áp chót (rank K - 2)
    for (let gi = 0; gi < numGroups; gi++) {
      const oppGi = (gi + 1) % numGroups;
      for (let r = 0; r < Math.ceil(K / 2); r++) {
        const topTeam = byGroup[gi]?.rows[r]?.entryId ?? null;
        const bottomRank = K - 1 - r;
        const bottomTeam = byGroup[oppGi]?.rows[bottomRank]?.entryId ?? null;
        if (topTeam || bottomTeam) {
          pairs.push([topTeam, bottomTeam]);
        }
      }
    }
  } else {
    // Chỉ có 1 bảng: Nhất gặp Chót, Nhì gặp Ba...
    const rows = byGroup[0]?.rows ?? [];
    for (let r = 0; r < Math.floor(K / 2); r++) {
      pairs.push([rows[r]?.entryId ?? null, rows[K - 1 - r]?.entryId ?? null]);
    }
  }

  const teamCount = pairs.flat().filter(Boolean).length;
  if (teamCount < 2) return [];

  let firstRoundMatches = 1;
  while (firstRoundMatches < pairs.length) firstRoundMatches *= 2;
  const size = firstRoundMatches * 2;
  const slots: Array<string | null> = Array.from({ length: size }, () => null);
  pairs.forEach(([a, b], i) => {
    slots[i * 2] = a ?? null;
    slots[i * 2 + 1] = b ?? null;
  });

  const courtList = courts.length ? courts : ["Sân 1"];
  const matches: Match[] = [];
  let courtCursor = 0;
  let roundIdx = 1;
  let current = size;

  while (current >= 2) {
    const label = KO_LABEL(current);
    for (let i = 0; i < current / 2; i++) {
      const isFirst = current === size;
      matches.push({
        id: uid(),
        eventId: ev.id,
        stage: "ko",
        groupName: label,
        round: roundIdx,
        koRound: label,
        slot: i,
        aId: isFirst ? (slots[i * 2] ?? null) : null,
        bId: isFirst ? (slots[i * 2 + 1] ?? null) : null,
        scoreA: null,
        scoreB: null,
        court: courtList[courtCursor++ % courtList.length]!,
        referee: "",
        status: "pending",
      });
    }
    roundIdx++;
    current /= 2;
  }

  if (ev.thirdPlace && size >= 4) {
    matches.push({
      id: uid(),
      eventId: ev.id,
      stage: "ko",
      groupName: "Tranh hạng 3",
      round: roundIdx - 1,
      koRound: "Tranh hạng 3",
      slot: 99,
      aId: null,
      bId: null,
      scoreA: null,
      scoreB: null,
      court: courtList[courtCursor++ % courtList.length]!,
      referee: "",
      status: "pending",
    });
  }

  return matches;
}

/** Đẩy đội thắng/thua sang vòng kế tiếp trong nhánh loại trực tiếp & cập nhật bảng 3 đội. */
export function propagateKnockout(matches: Match[], eventId: string): Match[] {
  // 1. Cập nhật bảng 3 đội nếu có kết quả Vòng 1
  const updated = matches.map((m) => ({ ...m }));
  const group3Names = new Set(
    updated
      .filter((m) => m.eventId === eventId && m.stage === "group" && m.customPlaceholderA)
      .map((m) => m.groupName),
  );

  group3Names.forEach((gName) => {
    const r1 = updated.find((m) => m.eventId === eventId && m.groupName === gName && m.round === 1);
    const r2 = updated.find((m) => m.eventId === eventId && m.groupName === gName && m.round === 2);
    const r3 = updated.find((m) => m.eventId === eventId && m.groupName === gName && m.round === 3);
    if (r1 && r2 && r3) {
      if (r1.scoreA !== null && r1.scoreB !== null && r1.scoreA !== r1.scoreB) {
        const winner = r1.scoreA > r1.scoreB ? r1.aId : r1.bId;
        const loser = r1.scoreA > r1.scoreB ? r1.bId : r1.aId;
        r2.aId = loser;
        r3.aId = winner;
      } else {
        r2.aId = null;
        r3.aId = null;
      }
    }
  });

  // 2. Cập nhật nhánh KO
  const ko = updated.filter((m) => m.eventId === eventId && m.stage === "ko");
  const byRound = new Map<number, Match[]>();
  ko.forEach((m) => {
    if (m.slot === 99) return;
    const list = byRound.get(m.round) ?? [];
    list.push(m);
    byRound.set(m.round, list);
  });
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  const next = new Map<string, Partial<Match>>();

  rounds.forEach((r, ri) => {
    const cur = (byRound.get(r) ?? []).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
    const nxt = (byRound.get(rounds[ri + 1] ?? -1) ?? []).sort(
      (a, b) => (a.slot ?? 0) - (b.slot ?? 0),
    );
    cur.forEach((m, i) => {
      if (m.scoreA === null || m.scoreB === null) return;
      const winner = m.scoreA > m.scoreB ? m.aId : m.bId;
      const loser = m.scoreA > m.scoreB ? m.bId : m.aId;
      const target = nxt[Math.floor(i / 2)];
      if (target && winner) {
        const patch = next.get(target.id) ?? {};
        if (i % 2 === 0) patch.aId = winner;
        else patch.bId = winner;
        next.set(target.id, patch);
      }
      // Bán kết -> tranh hạng 3
      const semiRound = rounds[rounds.length - 2];
      if (r === semiRound && loser) {
        const third = ko.find((x) => x.slot === 99);
        if (third) {
          const patch = next.get(third.id) ?? {};
          if (i % 2 === 0) patch.aId = loser;
          else patch.bId = loser;
          next.set(third.id, patch);
        }
      }
    });
  });

  return updated.map((m) => (next.has(m.id) ? { ...m, ...next.get(m.id)! } : m));
}

export const MODE_LABEL: Record<EventMode, string> = { don: "Đơn", doi: "Đôi" };
export const BRACKET_LABEL: Record<BracketType, string> = {
  rr: "Vòng tròn",
  rr_ko: "Chia bảng + loại trực tiếp",
};

/* ---------------- Màu bảng & timeline ---------------- */

const GROUP_COLORS = [
  { bg: "oklch(0.955 0.03 25)", text: "oklch(0.5 0.19 25)", dot: "oklch(0.6 0.2 25)" },
  { bg: "oklch(0.95 0.035 250)", text: "oklch(0.48 0.16 255)", dot: "oklch(0.58 0.17 255)" },
  { bg: "oklch(0.95 0.05 155)", text: "oklch(0.45 0.13 155)", dot: "oklch(0.56 0.14 155)" },
  { bg: "oklch(0.955 0.055 70)", text: "oklch(0.52 0.15 60)", dot: "oklch(0.66 0.17 55)" },
  { bg: "oklch(0.95 0.04 300)", text: "oklch(0.48 0.15 300)", dot: "oklch(0.58 0.16 300)" },
  { bg: "oklch(0.95 0.05 195)", text: "oklch(0.45 0.12 200)", dot: "oklch(0.56 0.13 200)" },
  { bg: "oklch(0.95 0.05 110)", text: "oklch(0.46 0.13 115)", dot: "oklch(0.58 0.14 115)" },
  { bg: "oklch(0.95 0.04 340)", text: "oklch(0.5 0.16 345)", dot: "oklch(0.6 0.17 345)" },
];

/** Màu cố định cho từng bảng / vòng, để nhìn lịch dễ phân biệt. */
export function groupColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const letter = /Bảng ([A-H])/.exec(name)?.[1];
  const idx = letter ? GROUP_LETTERS.indexOf(letter) : h % GROUP_COLORS.length;
  return GROUP_COLORS[(idx + GROUP_COLORS.length) % GROUP_COLORS.length]!;
}

/** Nhãn ngắn rõ ràng, không bị cắt ngắn gây khó đọc. */
export function groupTag(name: string) {
  if (name.includes("Tứ kết")) return "Tứ kết";
  if (name.includes("Bán kết")) return "Bán kết";
  if (name.includes("Chung kết")) return "Chung kết";
  if (name.includes("Tranh hạng 3")) return "Hạng 3";
  if (name.includes("Vòng 1/8")) return "Vòng 1/8";
  if (name.includes("Vòng 1/16")) return "Vòng 1/16";
  const letter = /Bảng ([A-H])/.exec(name)?.[1];
  return letter ? `Bảng ${letter}` : name;
}

export function addMinutes(hhmm: string, mins: number): string {
  const [h = 8, m = 0] = hhmm.split(":").map(Number);
  const total = (h * 60 + m + mins + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export type Slotted = { match: Match; slot: number; span: number };

/** Lấy danh sách tên các VĐV đang trong trận đấu trực tiếp (status === 'live'). */
export function getActivePlayerNames(matches: Match[], entries: Entry[]): Set<string> {
  const liveMatches = matches.filter((m) => m.status === "live");
  const names = new Set<string>();
  liveMatches.forEach((m) => {
    const eA = entries.find((e) => e.id === m.aId);
    const eB = entries.find((e) => e.id === m.bId);
    eA?.players.forEach((p) => p.name.trim() && names.add(p.name.trim().toLowerCase()));
    eB?.players.forEach((p) => p.name.trim() && names.add(p.name.trim().toLowerCase()));
  });
  return names;
}

/**
 * Xếp các trận đã có timeSlot lên lưới thời gian.
 * Mỗi sân là một hàng, timeSlot là chỉ số cột.
 */
export function buildTimeline(matches: Match[], courts: string[]): Map<string, Slotted[]> {
  const grid = new Map<string, Slotted[]>();
  courts.forEach((c) => grid.set(c, []));

  // Chỉ lấy những trận đã được xếp timeSlot (timeSlot !== undefined)
  const scheduled = matches.filter((m) => typeof m.timeSlot === "number");
  scheduled.forEach((m) => {
    const court = grid.has(m.court) ? m.court : (courts[0] ?? m.court);
    if (!grid.has(court)) grid.set(court, []);
    grid.get(court)!.push({
      match: m,
      slot: m.timeSlot!,
      span: 1,
    });
  });

  return grid;
}

/** Tự động sắp xếp các trận đấu chưa có lịch vào timeline theo thứ tự vòng và sân trống. */
export function autoScheduleTimeline(
  matches: Match[],
  courts: string[],
  existingCourts?: string[],
): Match[] {
  const courtList = courts.length ? courts : (existingCourts?.length ? existingCourts : ["Sân 1"]);
  const courtUsage = new Map<string, Set<number>>();
  courtList.forEach((c) => courtUsage.set(c, new Set<number>()));

  // Ghi nhận các trận đã có slot từ trước
  matches.forEach((m) => {
    if (typeof m.timeSlot === "number" && courtUsage.has(m.court)) {
      courtUsage.get(m.court)!.add(m.timeSlot);
    }
  });

  // Với các trận vòng bảng 3 đội: chỉ xếp vòng 1 trước nếu chưa có kết quả
  const readyMatches = matches.map((m) => ({ ...m }));
  let courtIdx = 0;

  readyMatches.forEach((m) => {
    if (typeof m.timeSlot === "number") return; // đã xếp rồi
    // Bỏ qua trận vòng 2, 3 của bảng 3 đội nếu chưa xác định được đối thủ
    if (m.stage === "group" && (m.round === 2 || m.round === 3) && !m.aId && m.customPlaceholderA) {
      return;
    }

    const court = courtList[courtIdx % courtList.length]!;
    const usage = courtUsage.get(court) ?? new Set<number>();
    let slot = Math.max(0, m.round - 1);
    while (usage.has(slot)) {
      slot++;
    }
    usage.add(slot);
    courtUsage.set(court, usage);

    m.court = court;
    m.timeSlot = slot;
    courtIdx++;
  });

  return readyMatches;
}
