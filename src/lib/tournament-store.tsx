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

export type PlayerSlot = { name: string; rating: number | null; paid?: boolean };

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
  /** Vị trí ô đứng (0: ô Phải/chẵn, 1: ô Trái/lẻ) của VĐV 0 mỗi đội */
  posA?: [number, number]; // [idxOfPlayerInRightBox, idxOfPlayerInLeftBox]
  posB?: [number, number]; // [idxOfPlayerInRightBox, idxOfPlayerInLeftBox]
  a: number;
  b: number;
  toUsed: [number, number];
  medUsed: [number, number];
  history: Array<{
    a: number;
    b: number;
    serveTeam: 0 | 1;
    serverNum: 1 | 2;
    serverIdx: number;
    receiverIdx?: number;
    posA?: [number, number];
    posB?: [number, number];
  }>;
  note: string;
  playerIcons?: Record<string, string>;
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
  /** Độ lệch giờ (phút) nhích tới/lui trong ô giờ (bước 5 phút) */
  offsetMinutes?: number;
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
  /** ID nội dung đang được chọn hiển thị, duy trì xuyên suốt khi chuyển tab */
  selectedEventId?: string;
  /** Trạng thái khóa nhánh KO theo từng nội dung */
  koLocked?: Record<string, boolean>;
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
    winPoints: 1,
    lossPoints: 0,
    drawPoints: 0,
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
  referees: [],
  events: [],
  entries: [],
  matches: [],
};

type Ctx = {
  state: TournamentState;
  update: (patch: Partial<TournamentState>) => void;
  updateEvent: (id: string, patch: Partial<TEvent>) => void;
  updateMatch: (id: string, patch: Partial<Match>) => void;
  setSelectedEventId: (id: string) => void;
  toggleKoLock: (eventId: string) => void;
  reset: () => void;
};

const TournamentContext = createContext<Ctx | null>(null);

export function TournamentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TournamentState>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) return { ...initialState, ...(JSON.parse(raw) as TournamentState) };
    } catch {
      /* ignore */
    }
    return initialState;
  });

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

  const setSelectedEventId = useCallback(
    (id: string) => update({ selectedEventId: id }),
    [update],
  );

  const toggleKoLock = useCallback(
    (eventId: string) => {
      setState((prev) => {
        const current = Boolean(prev.koLocked?.[eventId]);
        return commit({
          ...prev,
          koLocked: {
            ...(prev.koLocked || {}),
            [eventId]: !current,
          },
        });
      });
    },
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
    () => ({ state, update, updateEvent, updateMatch, setSelectedEventId, toggleKoLock, reset }),
    [state, update, updateEvent, updateMatch, setSelectedEventId, toggleKoLock, reset],
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
  const rs = e.players.map((p) => p.rating).filter((r): r is number => typeof r === "number" && !isNaN(r));
  return rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) * 10000) / 10000 : 0;
}

export const GROUP_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function getGroupName(idx: number): string {
  if (idx < 26) {
    return `Bảng ${String.fromCharCode(65 + idx)}`;
  }
  const first = String.fromCharCode(65 + Math.floor(idx / 26) - 1);
  const second = String.fromCharCode(65 + (idx % 26));
  return `Bảng ${first}${second}`;
}

export function groupLetterFromIndex(idx: number): string {
  if (idx < 26) return String.fromCharCode(65 + idx);
  const first = String.fromCharCode(65 + Math.floor(idx / 26) - 1);
  const second = String.fromCharCode(65 + (idx % 26));
  return `${first}${second}`;
}

/** Bốc thăm ghép đôi cân bằng: người điểm cao nhất ghép người điểm thấp nhất, nhì với nhì, trung bình với trung bình để tổng điểm đều nhau nhất có thể. */
export function drawPairs(entries: Entry[], eventId: string): Entry[] {
  const players = entries.flatMap((e) => e.players.filter((p) => p.name.trim()));
  if (players.length < 2) return entries;

  // Tính điểm trung bình của những VĐV đã có điểm để gán dự phòng cho VĐV chưa có điểm
  const knownRatings = players
    .map((p) => p.rating)
    .filter((r): r is number => typeof r === "number" && !isNaN(r));
  const avgRating = knownRatings.length
    ? knownRatings.reduce((a, b) => a + b, 0) / knownRatings.length
    : 2.0;

  // Gắn effective rating và ngẫu nhiên hoá các VĐV bằng điểm nhau để công bằng
  const prepared = [...players].map((p) => ({
    ...p,
    effectiveRating: typeof p.rating === "number" && !isNaN(p.rating) ? p.rating : avgRating,
    rand: Math.random(),
  }));

  // Sắp xếp giảm dần theo điểm trình
  prepared.sort((a, b) => {
    if (Math.abs(b.effectiveRating - a.effectiveRating) > 0.001) {
      return b.effectiveRating - a.effectiveRating;
    }
    return a.rand - b.rand;
  });

  const out: Entry[] = [];
  let i = 0;
  let j = prepared.length - 1;
  while (i < j) {
    const p1 = prepared[i]!;
    const p2 = prepared[j]!;
    const { effectiveRating: _e1, rand: _r1, ...clean1 } = p1;
    const { effectiveRating: _e2, rand: _r2, ...clean2 } = p2;
    const allPaid = Boolean(clean1.paid && clean2.paid);
    out.push({ id: uid(), eventId, players: [clean1, clean2], paid: allPaid });
    i++;
    j--;
  }
  if (i === j) {
    const p1 = prepared[i]!;
    const { effectiveRating: _e, rand: _r, ...clean1 } = p1;
    out.push({ id: uid(), eventId, players: [clean1], paid: Boolean(clean1.paid) });
  }
  return out;
}

/** Chia bảng rải đều theo điểm trình, hỗ trợ không giới hạn số lượng bảng đấu. */
export function splitGroups(entries: Entry[], groupCount: number): Group[] {
  const n = Math.max(1, groupCount || 1);
  const groups: Group[] = Array.from({ length: n }, (_, i) => ({
    name: getGroupName(i),
    entryIds: [],
  }));

  if (entries.length === 0) return groups;

  // Sắp xếp các đội theo điểm trình từ cao đến thấp
  const sorted = [...entries].sort((a, b) => entryRating(b) - entryRating(a));
  const targetPerGroup = Math.ceil(sorted.length / n);

  // Thuật toán gán thông minh (Greedy balance with size limit):
  // Duyệt qua từng đội (từ mạnh nhất đến yếu nhất), gán vào bảng nào đang có tổng điểm thấp nhất
  // mà chưa vượt quá chỉ tiêu số đội mỗi bảng.
  sorted.forEach((team) => {
    // Tìm các bảng còn chỗ chứa
    let eligibleGroups = groups.filter((g) => g.entryIds.length < targetPerGroup);
    if (eligibleGroups.length === 0) {
      eligibleGroups = groups;
    }

    // Chọn bảng có tổng điểm hiện tại thấp nhất
    let bestGroup = eligibleGroups[0]!;
    let minSum = Infinity;

    eligibleGroups.forEach((g) => {
      const currentSum = g.entryIds.reduce((sum, id) => {
        const en = entries.find((e) => e.id === id);
        return sum + (en ? entryRating(en) : 0);
      }, 0);

      if (currentSum < minSum) {
        minSum = currentSum;
        bestGroup = g;
      }
    });

    bestGroup.entryIds.push(team.id);
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
    .sort((x, y) => {
      // 1. Tổng điểm
      if (y.points !== x.points) return y.points - x.points;
      // 2. Hiệu số
      if (y.diff !== x.diff) return y.diff - x.diff;
      // 3. Đối đầu trực tiếp (Head-to-head)
      const h2h = matches.find(
        (m) =>
          m.scoreA !== null &&
          m.scoreB !== null &&
          ((m.aId === x.entryId && m.bId === y.entryId) ||
            (m.aId === y.entryId && m.bId === x.entryId)),
      );
      if (h2h && h2h.scoreA !== null && h2h.scoreB !== null && h2h.scoreA !== h2h.scoreB) {
        const xScore = h2h.aId === x.entryId ? h2h.scoreA : h2h.scoreB;
        const yScore = h2h.aId === y.entryId ? h2h.scoreA : h2h.scoreB;
        if (xScore !== yScore) {
          return yScore - xScore;
        }
      }
      // 4. Tổng điểm ghi được
      return y.pointsFor - x.pointsFor;
    });
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

/** Helper tạo thứ tự hạt giống chuẩn tournament binary tree (ví dụ size 8: 1 vs 8, 4 vs 5, 3 vs 6, 2 vs 7) */
export function getBracketSeedOrder(numSlots: number): number[] {
  if (numSlots <= 2) return [1, 2];
  if (numSlots === 4) return [1, 4, 3, 2];
  if (numSlots === 8) return [1, 8, 4, 5, 3, 6, 2, 7];
  if (numSlots === 16) return [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11];

  // Thuật toán chuẩn hoá binary tree theo nguyên tắc:
  // Hạt giống 1 & 4 chung nhánh bán kết 1, Hạt giống 2 & 3 chung nhánh bán kết 2,
  // Kẻ mạnh nhất gặp kẻ yếu nhất
  let matches: number[][] = [[1, 2]];
  while (matches.length * 2 < numSlots) {
    const nextMatches: number[][] = [];
    const sum = matches.length * 4 + 1;
    for (let i = 0; i < matches.length; i++) {
      const [top, bottom] = matches[i]!;
      if (i % 2 === 0) {
        nextMatches.push([top, sum - top]);
        nextMatches.push([sum - bottom, bottom]);
      } else {
        nextMatches.push([bottom, sum - bottom]);
        nextMatches.push([sum - top, top]);
      }
    }
    matches = nextMatches;
  }
  return matches.flat();
}

/**
 * Sinh nhánh loại trực tiếp từ kết quả vòng bảng:
 * - Sau khi xong vòng bảng, 2 bảng kế bên nhau trích ra Nhất và Nhì bảng đấu với nhau:
 *     Nhất A gặp Nhì B
 *     Nhất B gặp Nhì A
 *     Nhất C gặp Nhì D
 *     Nhất D gặp Nhì C...
 * - Tách các trận cùng bảng sang 2 nhánh đối diện (Top Half vs Bottom Half)
 *   để nếu cùng thắng thì chỉ gặp nhau ở chung kết.
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

  const numGroups = groups.length;
  const courtList = courts.length ? courts : ["Sân 1"];
  let courtCursor = 0;
  const advanceN = Math.max(1, ev.advancePerGroup || 2);

  interface InitialKoSlot {
    aId: string | null;
    bId: string | null;
    placeholderA: string;
    placeholderB: string;
  }

  // Helper sinh các trận cho toàn bộ các vòng KO
  const createBracketMatches = (
    size: number,
    firstRoundSlots: InitialKoSlot[],
  ): Match[] => {
    const matches: Match[] = [];
    let roundIdx = 1;
    let current = size;

    while (current >= 2) {
      const label = KO_LABEL(current);
      const matchCount = current / 2;
      for (let i = 0; i < matchCount; i++) {
        const isFirst = current === size;
        const slotData = isFirst ? firstRoundSlots[i] : null;
        matches.push({
          id: uid(),
          eventId: ev.id,
          stage: "ko",
          groupName: label,
          round: roundIdx,
          koRound: label,
          slot: i,
          aId: slotData?.aId ?? null,
          bId: slotData?.bId ?? null,
          customPlaceholderA: slotData?.placeholderA,
          customPlaceholderB: slotData?.placeholderB,
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

    return propagateKnockout(matches, ev.id, ev, groupMatches);
  };

  // Nếu có từ 2 bảng trở lên theo thể thức chia bảng + loại trực tiếp
  if (numGroups >= 2 && ev.bracket === "rr_ko") {
    const cleanGName = (name: string) => name.replace(/^Bảng\s+/i, "").trim().toUpperCase();
    const allGroupMatchesDone = groupMatches.length > 0 && groupMatches.every((m) => m.status === "done");

    if (advanceN === 1) {
      // 1 đội đi tiếp mỗi bảng (Nhất các bảng đấu với nhau)
      const numFirstRound = Math.ceil(numGroups / 2);
      let size = 2;
      while (size < numFirstRound * 2) {
        size *= 2;
      }
      const totalFirstRoundSlots = size / 2;

      const firstRoundSlots: InitialKoSlot[] = Array.from({ length: totalFirstRoundSlots }, () => ({
        aId: null,
        bId: null,
        placeholderA: "Chờ xác định",
        placeholderB: "Chờ xác định",
      }));

      for (let p = 0; p < numFirstRound; p++) {
        const g1 = groups[p * 2];
        const g2 = groups[p * 2 + 1];
        const seedA = `1${cleanGName(g1.name)}`;
        const seedB = g2 ? `1${cleanGName(g2.name)}` : "BYE";
        firstRoundSlots[p] = {
          aId: allGroupMatchesDone ? (byGroup[p * 2]?.rows[0]?.entryId ?? null) : null,
          bId: allGroupMatchesDone && g2 ? (byGroup[p * 2 + 1]?.rows[0]?.entryId ?? null) : null,
          placeholderA: seedA,
          placeholderB: seedB,
        };
      }

      return createBracketMatches(size, firstRoundSlots);
    } else {
      // advanceN >= 2: Phân hạt giống chuẩn giải đấu chuyên nghiệp (tham khảo Ảnh 4):
      // - Tiêu chí cốt lõi: 2 đội chung bảng (Nhất & Nhì) KHÔNG GẶP LẠI NHAU cho đến trận Chung kết (nằm ở 2 nửa nhánh đối diện).
      // - Số đội vào KO = numGroups * advanceN. Nếu số đội không phải lũy thừa của 2 (ví dụ 10 đội từ 5 bảng), sinh các vị trí BYE (miễn đấu).
      // - Các đội Nhất bảng (1A, 1B, 1C, 1D, 1E...) được ưu tiên nhận suất BYE vào thẳng vòng trong.
      // - Khi vòng bảng chưa xong: hiển thị ký hiệu hạt giống (1A, 2D, 2E, BYE...) không điền tên đội.
      //   Khi xong hết toàn bộ vòng bảng: tự động điền tên đội theo bảng xếp hạng.
      const totalAdvancing = numGroups * advanceN;
      let size = 4;
      while (size < totalAdvancing) {
        size *= 2;
      }
      const numMatchesR1 = size / 2;
      const halfMatches = numMatchesR1 / 2; // Số trận trong mỗi nửa nhánh (Nửa trên vs Nửa dưới)

      const firstRoundSlots: InitialKoSlot[] = Array.from({ length: numMatchesR1 }, () => ({
        aId: null,
        bId: null,
        placeholderA: "Chờ xác định",
        placeholderB: "Chờ xác định",
      }));

      // Phân hạt giống động dựa trên thứ hạng thực tế sau vòng bảng (hoặc thứ tự giả định nếu chưa đấu):
      // - Tiêu chí 1: 2 đội cùng bảng (Nhất & Nhì) KHÔNG GẶP LẠI NHAU cho đến trận Chung kết (ở 2 nửa nhánh đối diện).
      // - Tiêu chí 2: 4 hạt giống hàng đầu chia đều vào 4 nhánh tứ kết (Seed 1 & 4 ở nửa trên, Seed 2 & 3 ở nửa dưới).
      // - Tiêu chí 3: Đội có thứ hạng cao hơn được ưu tiên gặp đội hạng thấp hơn hoặc nhận suất BYE.
      // - Khi đã hoàn thành toàn bộ vòng bảng: tự động điền đúng tên đội thực tế theo kết quả bảng xếp hạng.

      // Xếp hạng các đội Nhất bảng:
      const ranked1st = groups.map((g, idx) => {
        const clean = cleanGName(g.name) || String.fromCharCode(65 + idx);
        const stRow = byGroup[idx]?.rows[0];
        return {
          groupName: g.name,
          groupKey: clean,
          groupIdx: idx,
          entryId: stRow?.entryId ?? null,
          points: stRow?.points ?? 0,
          diff: stRow?.diff ?? 0,
          pointsFor: stRow?.pointsFor ?? 0,
        };
      });

      if (allGroupMatchesDone) {
        ranked1st.sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.diff !== a.diff) return b.diff - a.diff;
          if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
          return a.groupIdx - b.groupIdx;
        });
      }

      // Xếp hạng các đội Nhì bảng:
      const ranked2nd = groups.map((g, idx) => {
        const clean = cleanGName(g.name) || String.fromCharCode(65 + idx);
        const stRow = byGroup[idx]?.rows[1];
        return {
          groupName: g.name,
          groupKey: clean,
          groupIdx: idx,
          entryId: stRow?.entryId ?? null,
          points: stRow?.points ?? 0,
          diff: stRow?.diff ?? 0,
          pointsFor: stRow?.pointsFor ?? 0,
        };
      });

      if (allGroupMatchesDone) {
        ranked2nd.sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.diff !== a.diff) return b.diff - a.diff;
          if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
          return a.groupIdx - b.groupIdx;
        });
      }

      const get1stByGroup = (gKey: string) => ranked1st.find((t) => t.groupKey === gKey) || ranked1st[0]!;
      const get2ndByGroup = (gKey: string) => ranked2nd.find((t) => t.groupKey === gKey) || ranked2nd[0]!;

      const bye = { label: "BYE", entryId: null };
      const team1 = (gKey: string) => ({
        label: `1${gKey}`,
        entryId: get1stByGroup(gKey)?.entryId ?? null,
      });
      const team2 = (gKey: string) => ({
        label: `2${gKey}`,
        entryId: get2ndByGroup(gKey)?.entryId ?? null,
      });

      const makeSlot = (
        pA: { label: string; entryId: string | null },
        pB: { label: string; entryId: string | null },
      ): InitialKoSlot => ({
        aId: allGroupMatchesDone ? pA.entryId : null,
        bId: allGroupMatchesDone ? pB.entryId : null,
        placeholderA: pA.label,
        placeholderB: pB.label,
      });

      // Lấy groupKey của các bảng theo thứ tự hạt giống Nhất bảng (Seed 1, Seed 2, Seed 3...)
      const gKeys = ranked1st.map((t) => t.groupKey);
      const [g1 = "A", g2 = "B", g3 = "C", g4 = "D", g5 = "E", g6 = "F", g7 = "G", g8 = "H"] = gKeys;

      let slots: InitialKoSlot[] = [];

      if (numGroups === 2 && advanceN === 2 && size === 4) {
        // 2 bảng (4 đội vào Bán kết):
        // BK1: 1G1 vs 2G2
        // BK2: 1G2 vs 2G1
        slots = [
          makeSlot(team1(g1), team2(g2)),
          makeSlot(team1(g2), team2(g1)),
        ];
      } else if (numGroups === 3 && advanceN === 2 && size === 8) {
        // 3 bảng (6 đội vào Tứ kết, 2 suất BYE cho 2 hạt giống dẫn đầu g1 và g2):
        // Top half:
        // TK1: 1G1 vs BYE (Hạt giống 1)
        // TK2: 2G2 vs 2G3
        // Bottom half:
        // TK3: 1G3 vs 2G1 (Hạt giống 3)
        // TK4: 1G2 vs BYE (Hạt giống 2)
        slots = [
          makeSlot(team1(g1), bye),
          makeSlot(team2(g2), team2(g3)),
          makeSlot(team1(g3), team2(g1)),
          makeSlot(team1(g2), bye),
        ];
      } else if (numGroups === 4 && advanceN === 2 && size === 8) {
        // 4 bảng (8 đội vào Tứ kết, 0 suất BYE):
        // TK1: 1G1 vs 2G3 (Seed 1)
        // TK2: 1G4 vs 2G2 (Seed 4)
        // TK3: 1G3 vs 2G1 (Seed 3)
        // TK4: 1G2 vs 2G4 (Seed 2)
        slots = [
          makeSlot(team1(g1), team2(g3)),
          makeSlot(team1(g4), team2(g2)),
          makeSlot(team1(g3), team2(g1)),
          makeSlot(team1(g2), team2(g4)),
        ];
      } else if (numGroups === 5 && advanceN === 2 && size === 16) {
        // 5 bảng (10 đội vào Vòng 1/8, 6 suất BYE cho 6 hạt giống cao nhất):
        // Phân bổ hạt giống chuẩn theo nguyên tắc người dùng:
        // Top Half (Nửa trên):
        // K1: 1G1 vs BYE  -> 1G1 (Seed 1) vào TK1
        // K2: 2G2 vs 2G5   -> Đội thắng vào TK1 gặp 1G1
        // K3: 1G4 vs BYE  -> 1G4 (Seed 4) vào TK2
        // K4: 2G3 vs BYE  -> 2G3 (Seed 5 thực tế sau đổi bảng) vào TK2 gặp 1G4
        // Bottom Half (Nửa dưới):
        // K5: 1G2 vs BYE  -> 1G2 (Seed 2) vào TK3
        // K6: 2G4 vs 2G1   -> Đội thắng vào TK3 gặp 1G2
        // K7: 1G3 vs BYE  -> 1G3 (Seed 3) vào TK4
        // K8: 1G5 vs BYE  -> 1G5 (Seed 6 thực tế sau đổi bảng) vào TK4 gặp 1G3
        slots = [
          makeSlot(team1(g1), bye),
          makeSlot(team2(g2), team2(g5)),
          makeSlot(team1(g4), bye),
          makeSlot(team2(g3), bye),
          makeSlot(team1(g2), bye),
          makeSlot(team2(g4), team2(g1)),
          makeSlot(team1(g3), bye),
          makeSlot(team1(g5), bye),
        ];
      } else if (numGroups === 6 && advanceN === 2 && size === 16) {
        // 6 bảng (12 đội vào Vòng 1/8, 4 suất BYE cho top 4 hạt giống):
        // Top Half:
        // K1: 1G1 vs BYE
        // K2: 2G2 vs 2G6
        // K3: 1G5 vs 2G3
        // K4: 1G4 vs BYE
        // Bottom Half:
        // K5: 1G2 vs BYE
        // K6: 2G1 vs 2G5
        // K7: 1G6 vs 2G4
        // K8: 1G3 vs BYE
        slots = [
          makeSlot(team1(g1), bye),
          makeSlot(team2(g2), team2(g6)),
          makeSlot(team1(g5), team2(g3)),
          makeSlot(team1(g4), bye),
          makeSlot(team1(g2), bye),
          makeSlot(team2(g1), team2(g5)),
          makeSlot(team1(g6), team2(g4)),
          makeSlot(team1(g3), bye),
        ];
      } else if (numGroups === 7 && advanceN === 2 && size === 16) {
        // 7 bảng (14 đội vào Vòng 1/8, 2 suất BYE cho Seed 1 & Seed 2):
        // Ưu tiên tối đa Nhất gặp Nhì, hạn chế Nhất gặp Nhất và Nhì gặp Nhì:
        // 1(g1) và 1(g2) nhận 2 suất BYE.
        // Chỉ duy nhất 1 trận Nhì gặp Nhì (2G2 vs 2G6) để đội thắng gặp 1G1 ở Tứ kết.
        // Toàn bộ 5 trận còn lại đều là Nhất gặp Nhì (tuyệt đối không có Nhất gặp Nhất):
        slots = [
          makeSlot(team1(g1), bye),
          makeSlot(team2(g2), team2(g6)),
          makeSlot(team1(g5), team2(g3)),
          makeSlot(team1(g4), team2(g7)),
          makeSlot(team1(g2), bye),
          makeSlot(team1(g6), team2(g4)),
          makeSlot(team1(g7), team2(g1)),
          makeSlot(team1(g3), team2(g5)),
        ];
      } else if (numGroups === 8 && advanceN === 2 && size === 16) {
        // 8 bảng (16 đội vào Vòng 1/8, 0 suất BYE):
        slots = [
          makeSlot(team1(g1), team2(g8)),
          makeSlot(team1(g8), team2(g2)),
          makeSlot(team1(g5), team2(g3)),
          makeSlot(team1(g4), team2(g6)),
          makeSlot(team1(g3), team2(g5)),
          makeSlot(team1(g6), team2(g4)),
          makeSlot(team1(g7), team2(g1)),
          makeSlot(team1(g2), team2(g7)),
        ];
      } else {
        // Thuật toán tổng quát cho mọi số bảng khác:
        // Luôn ghép 1st với 2nd từ bảng khác!
        const all1st = gKeys.map((k) => team1(k));
        const all2nd = [...gKeys.slice(1), gKeys[0]!].map((k) => team2(k)); // Lệch 1 bảng để không trùng bảng
        let byeCount = Math.max(0, size - (all1st.length + all2nd.length));
        const pairs: InitialKoSlot[] = [];

        let fIdx = 0;
        let sIdx = 0;
        for (let i = 0; i < halfMatches * 2; i++) {
          if (fIdx < all1st.length && byeCount > 0) {
            pairs.push(makeSlot(all1st[fIdx++]!, bye));
            byeCount--;
          } else if (fIdx < all1st.length && sIdx < all2nd.length) {
            pairs.push(makeSlot(all1st[fIdx++]!, all2nd[sIdx++]!));
          } else if (sIdx + 1 < all2nd.length) {
            pairs.push(makeSlot(all2nd[sIdx++]!, all2nd[sIdx++]!));
          } else if (fIdx + 1 < all1st.length) {
            pairs.push(makeSlot(all1st[fIdx++]!, all1st[fIdx++]!));
          } else {
            pairs.push(makeSlot(all1st[fIdx++] || all2nd[sIdx++] || bye, bye));
          }
        }
        slots = pairs;
      }

      slots.forEach((s, idx) => {
        if (idx < firstRoundSlots.length) {
          firstRoundSlots[idx] = s;
        }
      });

      return createBracketMatches(size, firstRoundSlots);
    }
  }

  // Fallback nếu 1 bảng hoặc bốc thăm đơn thuần
  const K = Math.max(1, ev.advancePerGroup);
  const advancing: string[] = [];
  for (let r = 0; r < K; r++) {
    for (let gi = 0; gi < numGroups; gi++) {
      const row = byGroup[gi]?.rows[r];
      if (row?.entryId && !advancing.includes(row.entryId)) {
        advancing.push(row.entryId);
      }
    }
  }
  if (advancing.length < 2) {
    entries.forEach((e) => {
      if (!advancing.includes(e.id)) advancing.push(e.id);
    });
  }
  if (advancing.length < 2) return [];

  let size = 2;
  while (size < advancing.length) size *= 2;
  const bracketOrder = getBracketSeedOrder(size);
  const slots: Array<string | null> = bracketOrder.map((seed) => advancing[seed - 1] ?? null);

  const matches: Match[] = [];
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

  return propagateKnockout(matches, ev.id, ev, groupMatches);
}

/** Tạo nhánh KO trống hoàn toàn theo tổng số đội để người dùng tự do kéo thả xếp cặp */
export function generateEmptyKnockout(
  ev: TEvent,
  totalTeams: number,
  courts: string[],
): Match[] {
  let size = 2;
  while (size < Math.max(2, totalTeams)) {
    size *= 2;
  }
  const courtList = courts.length ? courts : ["Sân 1"];
  let courtCursor = 0;
  const matches: Match[] = [];
  let roundIdx = 1;
  let current = size;
  const seedOrder = getBracketSeedOrder(size);

  while (current >= 2) {
    const label = KO_LABEL(current);
    const matchCount = current / 2;
    for (let i = 0; i < matchCount; i++) {
      const isFirst = current === size;
      const seedA = isFirst ? seedOrder[2 * i] : undefined;
      const seedB = isFirst ? seedOrder[2 * i + 1] : undefined;
      const pA = seedA ? (seedA <= totalTeams ? `Hạt giống ${seedA}` : "BYE") : "";
      const pB = seedB ? (seedB <= totalTeams ? `Hạt giống ${seedB}` : "BYE") : "";

      matches.push({
        id: uid(),
        eventId: ev.id,
        stage: "ko",
        groupName: label,
        round: roundIdx,
        koRound: label,
        slot: i,
        aId: null,
        bId: null,
        customPlaceholderA: pA,
        customPlaceholderB: pB,
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

/** Đẩy đội thắng/thua sang vòng kế tiếp trong nhánh loại trực tiếp & cập nhật bảng 3 đội / vòng bảng. */
export function propagateKnockout(
  matches: Match[],
  eventId: string,
  ev?: TEvent,
  groupMatchesOpt?: Match[],
): Match[] {
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

  // 2. Tự động tính kết quả vòng bảng cập nhật vào các ô chờ "Nhất Bảng X", "Nhì Bảng Y" của Vòng 1 KO
  const gMatches = groupMatchesOpt ?? updated.filter((m) => m.eventId === eventId && m.stage === "group");
  if (gMatches.length > 0) {
    const groupNames = Array.from(new Set(gMatches.map((m) => m.groupName)));
    const standingsByGroup = new Map<string, ReturnType<typeof computeStandings>>();

    groupNames.forEach((gn) => {
      const thisGroupMatches = gMatches.filter((m) => m.groupName === gn);
      const entryIds = Array.from(
        new Set(thisGroupMatches.flatMap((m) => [m.aId, m.bId]).filter((id): id is string => Boolean(id))),
      );
      if (entryIds.length > 0) {
        const eventConfig = ev ?? {
          id: eventId,
          name: "",
          mode: "doi" as const,
          bracket: "rr_ko" as const,
          thirdPlace: true,
          pairMode: "random" as const,
          winPoints: 3,
          lossPoints: 0,
          drawPoints: 1,
          groupCount: 4,
          advancePerGroup: 2,
          groups: [],
        };
        standingsByGroup.set(gn, computeStandings(entryIds, thisGroupMatches, eventConfig));
      }
    });

    const allGroupDone = gMatches.length > 0 && gMatches.every((m) => m.status === "done");

    const resolveTeam = (placeholder?: string) => {
      if (!placeholder) return null;
      const clean = placeholder.trim();
      if (/^bye$/i.test(clean)) return null;

      // Hỗ trợ cả 1A, 2A, 1B, 2E... lẫn Nhất A, Nhì B, I A, II B...
      const m1 = /^(?:Nhất|I|1)\s*(?:bảng\s*)?([A-Za-z0-9]+)$/i.exec(clean);
      const m2 = /^(?:Nhì|II|2)\s*(?:bảng\s*)?([A-Za-z0-9]+)$/i.exec(clean);
      const m3 = /^(?:Ba|III|3)\s*(?:bảng\s*)?([A-Za-z0-9]+)$/i.exec(clean);
      const m4 = /^(?:Tư|IV|4)\s*(?:bảng\s*)?([A-Za-z0-9]+)$/i.exec(clean);

      const findStandings = (token: string) => {
        const target = token.trim().toLowerCase();
        for (const [gn, st] of standingsByGroup.entries()) {
          const rawGn = gn.trim().toLowerCase();
          const cleanGn = gn.replace(/^Bảng\s+/i, "").trim().toLowerCase();
          if (rawGn === target || cleanGn === target) {
            return st;
          }
        }
        return undefined;
      };

      if (m1) return findStandings(m1[1])?.[0]?.entryId ?? null;
      if (m2) return findStandings(m2[1])?.[1]?.entryId ?? null;
      if (m3) return findStandings(m3[1])?.[2]?.entryId ?? null;
      if (m4) return findStandings(m4[1])?.[3]?.entryId ?? null;
      return null;
    };

    // User requirement: Chỉ khi kết thúc TOÀN BỘ các trận vòng bảng mới tự động điền tên đội!
    if (allGroupDone) {
      updated.forEach((m) => {
        if (m.eventId === eventId && m.stage === "ko" && m.round === 1) {
          const resolvedA = resolveTeam(m.customPlaceholderA);
          if (resolvedA) m.aId = resolvedA;
          const resolvedB = resolveTeam(m.customPlaceholderB);
          if (resolvedB) m.bId = resolvedB;
        }
      });
    }
  }

  // 3. Cập nhật nhánh KO (thắng lên vòng tiếp, thua vào tranh hạng 3)
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
      let winner: string | null = null;
      let loser: string | null = null;
      const isByeB = m.customPlaceholderB === "BYE" || m.customPlaceholderB === "Bye";
      const isByeA = m.customPlaceholderA === "BYE" || m.customPlaceholderA === "Bye";

      if (m.scoreA !== null && m.scoreB !== null) {
        winner = m.scoreA > m.scoreB ? m.aId : m.bId;
        loser = m.scoreA > m.scoreB ? m.bId : m.aId;
      } else if (m.round === 1 && (isByeB || (!m.bId && !m.customPlaceholderB))) {
        // Miễn đấu (Bye) cho đội nhánh A
        winner = m.aId;
        if (!winner && m.customPlaceholderA) {
          const target = nxt[Math.floor(i / 2)];
          if (target) {
            const patch = next.get(target.id) ?? {};
            if (i % 2 === 0) patch.customPlaceholderA = m.customPlaceholderA;
            else patch.customPlaceholderB = m.customPlaceholderA;
            next.set(target.id, patch);
          }
        }
      } else if (m.round === 1 && (isByeA || (!m.aId && !m.customPlaceholderA))) {
        // Miễn đấu (Bye) cho đội nhánh B
        winner = m.bId;
        if (!winner && m.customPlaceholderB) {
          const target = nxt[Math.floor(i / 2)];
          if (target) {
            const patch = next.get(target.id) ?? {};
            if (i % 2 === 0) patch.customPlaceholderA = m.customPlaceholderB;
            else patch.customPlaceholderB = m.customPlaceholderB;
            next.set(target.id, patch);
          }
        }
      }
      if (!winner) return;
      const target = nxt[Math.floor(i / 2)];
      if (target && winner) {
        const patch = next.get(target.id) ?? {};
        const winnerSeed = winner === m.aId ? m.customPlaceholderA : m.customPlaceholderB;
        if (i % 2 === 0) {
          patch.aId = winner;
          if (winnerSeed) patch.customPlaceholderA = winnerSeed;
        } else {
          patch.bId = winner;
          if (winnerSeed) patch.customPlaceholderB = winnerSeed;
        }
        next.set(target.id, patch);
      }
      // Bán kết -> tranh hạng 3
      const semiRound = rounds[rounds.length - 2];
      if (r === semiRound && loser) {
        const third = ko.find((x) => x.slot === 99);
        if (third) {
          const patch = next.get(third.id) ?? {};
          const loserSeed = loser === m.aId ? m.customPlaceholderA : m.customPlaceholderB;
          if (i % 2 === 0) {
            patch.aId = loser;
            if (loserSeed) patch.customPlaceholderA = loserSeed;
          } else {
            patch.bId = loser;
            if (loserSeed) patch.customPlaceholderB = loserSeed;
          }
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

/** Nhãn ngắn rõ ràng theo yêu cầu: Bảng A -> A, Tứ kết/Bán kết/Chung kết ghi rõ, Vòng 1/8 -> 1/8, Vòng 1/16 -> 1/16. */
export function groupTag(name: string) {
  if (name.includes("Tứ kết")) return "Tứ kết";
  if (name.includes("Bán kết")) return "Bán kết";
  if (name.includes("Chung kết")) return "Chung kết";
  if (name.includes("Tranh hạng 3")) return "Hạng 3";
  if (name.includes("1/8")) return "1/8";
  if (name.includes("1/16")) return "1/16";
  if (name.includes("1/32")) return "1/32";
  const letter = /Bảng\s+([A-H0-9]+)/i.exec(name)?.[1];
  return letter ? letter : name.replace(/^Bảng\s+/i, "");
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

/** Tự động sắp xếp các trận đấu chưa có lịch vào timeline: xếp Vòng Bảng trước (V1, V2, V3...), sau khi toàn bộ vòng bảng xong mới xếp Vòng Loại Trực Tiếp (KO). */
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

  const readyMatches = matches.map((m) => ({ ...m }));

  // Kiểm tra tình trạng vòng bảng:
  const groupMatches = readyMatches.filter((m) => m.stage === "group");
  const hasGroup = groupMatches.length > 0;
  const allGroupDone = hasGroup && groupMatches.every((m) => m.status === "done");

  // Các trận chưa xếp lịch:
  // Nếu có vòng bảng và chưa xong hết vòng bảng -> CHỈ xếp các trận vòng bảng!
  // Tuyệt đối không xếp vòng loại trực tiếp (KO) cho đến khi toàn bộ vòng bảng có kết quả!
  const unassigned = readyMatches.filter((m) => typeof m.timeSlot !== "number");

  let toSchedule: Match[] = [];
  if (hasGroup && !allGroupDone) {
    toSchedule = unassigned.filter((m) => m.stage === "group");
  } else {
    // Đã xong vòng bảng hoặc không có vòng bảng -> Xếp vòng bảng còn lại (nếu có) rồi mới đến KO
    toSchedule = unassigned;
  }

  // Tách thành các nhóm theo round và stage để xếp tuần tự
  // Nhóm 1: Vòng bảng theo từng Round 1, 2, 3...
  // Nhóm 2: Vòng KO theo từng Round 1, 2, 3...
  const groupRounds = [...new Set(toSchedule.filter((m) => m.stage === "group").map((m) => m.round ?? 1))].sort(
    (a, b) => a - b,
  );
  const koRounds = [...new Set(toSchedule.filter((m) => m.stage === "ko").map((m) => m.round ?? 1))].sort(
    (a, b) => a - b,
  );

  let currentMinSlot = 0;
  let courtIdx = 0;

  // 1. Xếp các trận vòng bảng theo từng round
  for (const r of groupRounds) {
    const roundMatches = toSchedule.filter((m) => m.stage === "group" && (m.round ?? 1) === r);
    let maxSlotUsedInRound = currentMinSlot;

    for (const m of roundMatches) {
      // Bỏ qua trận vòng 2, 3 của bảng 3 đội nếu chưa xác định được đối thủ
      if ((m.round === 2 || m.round === 3) && !m.aId && m.customPlaceholderA) {
        continue;
      }

      // Tìm court và slot khả dụng từ currentMinSlot trở đi
      let placed = false;
      let slotCheck = currentMinSlot;
      while (!placed && slotCheck < 200) {
        for (let cOffset = 0; cOffset < courtList.length; cOffset++) {
          const court = courtList[(courtIdx + cOffset) % courtList.length]!;
          const usage = courtUsage.get(court) ?? new Set<number>();
          if (!usage.has(slotCheck)) {
            usage.add(slotCheck);
            courtUsage.set(court, usage);
            m.court = court;
            m.timeSlot = slotCheck;
            courtIdx = (courtIdx + cOffset + 1) % courtList.length;
            if (slotCheck > maxSlotUsedInRound) {
              maxSlotUsedInRound = slotCheck;
            }
            placed = true;
            break;
          }
        }
        if (!placed) slotCheck++;
      }
    }
    // Round tiếp theo của vòng bảng bắt đầu sau khi các trận của round trước đã có chỗ
    currentMinSlot = maxSlotUsedInRound + 1;
  }

  // 2. Nếu đã hoàn thành vòng bảng (hoặc giải thuần loại trực tiếp), xếp các trận KO
  if (!hasGroup || allGroupDone) {
    // Đảm bảo KO bắt đầu sau tất cả các trận vòng bảng đã có trên timeline
    let maxOverallGroupSlot = currentMinSlot - 1;
    readyMatches
      .filter((m) => m.stage === "group" && typeof m.timeSlot === "number")
      .forEach((m) => {
        if (m.timeSlot! > maxOverallGroupSlot) {
          maxOverallGroupSlot = m.timeSlot!;
        }
      });
    currentMinSlot = Math.max(currentMinSlot, maxOverallGroupSlot + 1);

    for (const r of koRounds) {
      const roundMatches = toSchedule.filter((m) => m.stage === "ko" && (m.round ?? 1) === r);
      let maxSlotUsedInRound = currentMinSlot;

      for (const m of roundMatches) {
        let placed = false;
        let slotCheck = currentMinSlot;
        while (!placed && slotCheck < 200) {
          for (let cOffset = 0; cOffset < courtList.length; cOffset++) {
            const court = courtList[(courtIdx + cOffset) % courtList.length]!;
            const usage = courtUsage.get(court) ?? new Set<number>();
            if (!usage.has(slotCheck)) {
              usage.add(slotCheck);
              courtUsage.set(court, usage);
              m.court = court;
              m.timeSlot = slotCheck;
              courtIdx = (courtIdx + cOffset + 1) % courtList.length;
              if (slotCheck > maxSlotUsedInRound) {
                maxSlotUsedInRound = slotCheck;
              }
              placed = true;
              break;
            }
          }
          if (!placed) slotCheck++;
        }
      }
      currentMinSlot = maxSlotUsedInRound + 1;
    }
  }

  return readyMatches;
}
