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
  const rs = e.players.map((p) => p.rating).filter((r): r is number => typeof r === "number" && !isNaN(r));
  return rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) * 100) / 100 : 0;
}

const GROUP_LETTERS = "ABCDEFGH".split("");

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

/** Chia bảng rải đều theo điểm trình, tối ưu tổng điểm các bảng cân bằng nhất có thể. */
export function splitGroups(entries: Entry[], groupCount: number): Group[] {
  const n = Math.max(1, Math.min(groupCount, GROUP_LETTERS.length));
  const groups: Group[] = Array.from({ length: n }, (_, i) => ({
    name: `Bảng ${GROUP_LETTERS[i]}`,
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

/** Helper tạo thứ tự hạt giống chuẩn tournament binary tree (ví dụ size 8: 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6) */
export function getBracketSeedOrder(numSlots: number): number[] {
  let order = [1, 2];
  while (order.length < numSlots) {
    const next: number[] = [];
    const sum = order.length * 2 + 1;
    for (const seed of order) {
      next.push(seed);
      next.push(sum - seed);
    }
    order = next;
  }
  return order;
}

/**
 * Sinh nhánh loại trực tiếp từ kết quả vòng bảng theo barem chuẩn:
 * - Hỗ trợ không giới hạn số lượng đội đi tiếp mỗi bảng (K >= 1).
 * - Tự động tính kích thước nhánh luỹ thừa của 2 (2, 4, 8, 16, 32...).
 * - Tách các đội cùng bảng sang 2 nửa nhánh đối diện (tránh gặp lại nhau trước trận chung kết).
 * - Hỗ trợ Bye (miễn đấu) cho hạt giống cao nếu số đội chưa đủ luỹ thừa 2.
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

  const K = Math.max(1, ev.advancePerGroup);
  const numGroups = byGroup.length;

  // Thu thập danh sách các đội đi tiếp từ các bảng
  // Ưu tiên theo thứ hạng: tất cả đội Nhất (rank 0), rồi Nhì (rank 1), Ba (rank 2)...
  interface AdvancingTeam {
    entryId: string;
    groupIndex: number;
    rank: number;
  }

  const advancing: AdvancingTeam[] = [];
  for (let r = 0; r < K; r++) {
    for (let gi = 0; gi < numGroups; gi++) {
      const row = byGroup[gi]?.rows[r];
      const entryId = row?.entryId ?? byGroup[gi]?.rows.find((x) => !advancing.some((a) => a.entryId === x.entryId))?.entryId;
      if (entryId && !advancing.some((a) => a.entryId === entryId)) {
        advancing.push({ entryId, groupIndex: gi, rank: r });
      }
    }
  }

  // Nếu số đội chưa đủ hoặc chưa có vòng bảng, lấy từ danh sách entries
  if (advancing.length < 2) {
    const unselected = entries.filter((e) => !advancing.some((a) => a.entryId === e.id));
    unselected.forEach((e, idx) => {
      if (advancing.length < Math.max(2, entries.length)) {
        advancing.push({ entryId: e.id, groupIndex: idx % numGroups, rank: Math.floor(idx / numGroups) });
      }
    });
  }

  if (advancing.length < 2) return [];

  // Xác định kích thước nhánh luỹ thừa 2 gần nhất (2, 4, 8, 16, 32...)
  let size = 2;
  while (size < advancing.length) {
    size *= 2;
  }

  // Thứ tự hạt giống theo bracket
  const bracketOrder = getBracketSeedOrder(size);
  // Tạo mảng hạt giống: seedMap[seedNumber - 1] = entryId
  const seedAssignment = new Map<number, string | null>();

  // Phân bổ hạt giống sao cho:
  // - Hạt giống 1, 2, ... được ưu tiên cho đội Nhất
  // - Đội cùng bảng ở rank 1 được đẩy sang nửa đối diện với rank 0
  const topHalfSeeds = bracketOrder.slice(0, size / 2);
  const bottomHalfSeeds = bracketOrder.slice(size / 2);

  // Gán lần lượt các đội đi tiếp vào các vị trí hạt giống
  advancing.forEach((team, idx) => {
    const seedNum = idx + 1;
    if (seedNum <= size) {
      seedAssignment.set(seedNum, team.entryId);
    }
  });

  // Điền vào slots vòng 1 theo thứ tự bracketOrder
  const slots: Array<string | null> = bracketOrder.map((seedNum) => seedAssignment.get(seedNum) ?? null);

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

  // Tự động đẩy các đội có Bye ở vòng 1 lên vòng 2
  return propagateKnockout(matches, ev.id);
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
      let winner: string | null = null;
      let loser: string | null = null;
      if (m.scoreA !== null && m.scoreB !== null) {
        winner = m.scoreA > m.scoreB ? m.aId : m.bId;
        loser = m.scoreA > m.scoreB ? m.bId : m.aId;
      } else if (m.round === 1 && m.aId && !m.bId) {
        // Miễn đấu (Bye) cho đội nhánh A
        winner = m.aId;
      } else if (m.round === 1 && !m.aId && m.bId) {
        // Miễn đấu (Bye) cho đội nhánh B
        winner = m.bId;
      }
      if (!winner) return;
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
