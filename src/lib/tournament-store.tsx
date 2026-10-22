import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  auth,
  signInWithGoogle,
  logOutGoogle,
  syncTournamentToCloud,
  fetchTournamentFromCloud,
  saveTournamentToArchive,
  onAuthStateChanged,
  type User,
} from "./firebase";

/* ---------------- Kiểu dữ liệu ---------------- */

export type PlayerSlot = {
  name: string;
  rating: number | null;
  paid?: boolean;
  gender?: "nam" | "nu";
};

/** Một "đội" đăng ký trong nội dung (đơn = 1 người, đôi = 2 người, đồng đội = 4 người). */
export type Entry = {
  id: string;
  eventId: string;
  players: PlayerSlot[];
  paid: boolean;
  teamName?: string;
  /** Đánh dấu vận động viên / đội bỏ cuộc giữa chừng (hủy bỏ toàn bộ kết quả trước đó) */
  withdrawn?: boolean;
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

export type TeamSubMatchType =
  | "women_doubles"
  | "men_doubles"
  | "mixed_doubles_1"
  | "mixed_doubles_2"
  | "dreambreaker"
  | "custom";

export type TeamSubMatch = {
  id: string;
  type: TeamSubMatchType;
  title: string;
  teamAPlayers?: string;
  teamBPlayers?: string;
  scoreA: number | null;
  scoreB: number | null;
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
  /** Danh sách 2 ID VĐV cá nhân cho đội A trong nội dung đôi đổi partner ngẫu nhiên */
  aEntryIds?: [string, string];
  /** Danh sách 2 ID VĐV cá nhân cho đội B trong nội dung đôi đổi partner ngẫu nhiên */
  bEntryIds?: [string, string];
  customPlaceholderA?: string;
  customPlaceholderB?: string;
  scoreA: number | null;
  scoreB: number | null;
  court: string;
  referee: string;
  status: MatchStatus;
  note?: string;
  live?: LiveState;
  /** Danh sách các trận đấu con khi thi đấu thể thức Đồng đội (MLP Format) */
  teamSubMatches?: TeamSubMatch[];
};

export type EventMode = "don" | "doi" | "dong_doi";
export type BracketType = "rr" | "rr_ko";
export type PairMode = "random" | "fixed";

export type RankingCriterion = "points" | "diff" | "h2h" | "draw";

export const RANKING_CRITERIA_LABELS: Record<
  RankingCriterion,
  { label: string; desc: string; icon: string }
> = {
  points: { label: "Tổng số điểm", desc: "Điểm trận thắng / hòa / thua", icon: "🏆" },
  diff: { label: "Hiệu số điểm", desc: "Điểm thắng trừ điểm thua", icon: "⚖️" },
  h2h: { label: "Đối đầu trực tiếp", desc: "Thành tích khi 2 đội gặp nhau", icon: "⚔️" },
  draw: { label: "Bốc thăm / Chỉ số phụ", desc: "Bốc thăm phân định nếu hòa các chỉ số", icon: "🎲" },
};

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
  /** Số lượng vòng đấu dự kiến trong nội dung đôi đổi partner ngẫu nhiên (undefined hoặc 0 = tối đa theo số VĐV) */
  randomRoundsCount?: number;
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
  /** Thứ tự ưu tiên tính bảng xếp hạng của giải: Mặc định: Điểm -> Hiệu số -> Đối đầu -> Bốc thăm */
  rankingCriteria?: RankingCriterion[];
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
    randomRoundsCount: 3,
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
  courtIcons: {},
  referees: [],
  events: [],
  entries: [],
  matches: [],
  rankingCriteria: ["points", "diff", "h2h", "draw"],
};

type Ctx = {
  state: TournamentState;
  update: (patch: Partial<TournamentState>) => void;
  updateEvent: (id: string, patch: Partial<TEvent>) => void;
  updateMatch: (id: string, patch: Partial<Match>) => void;
  setSelectedEventId: (id: string) => void;
  toggleKoLock: (eventId: string) => void;
  reset: () => void;
  user: User | null;
  authLoading: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  syncNow: () => Promise<void>;
  loadTournament: (newState: TournamentState, archiveId?: string) => void;
  createNewTournament: () => Promise<string | null>;
  saveCurrentToArchive: () => Promise<string | null>;
  activeTournamentId: string | null;
  hasUnsavedChanges: () => boolean;
  isDirty: boolean;
  markSaved: () => void;
  discardChanges: () => void;
  clearActiveTournament: () => void;
};

const TournamentContext = createContext<Ctx | null>(null);

const DEFAULT_OLD_REFEREES = new Set(["Trọng tài chính", "Trọng tài 1", "Trọng tài 2"]);

function sanitizeLoadedState(rawState: TournamentState): TournamentState {
  const merged = { ...initialState, ...rawState };
  const matches = (merged.matches || []).map((m) => ({
    ...m,
    customPlaceholderA:
      m.customPlaceholderA && /^Hạt\s*giống\s*\d+$/i.test(m.customPlaceholderA.trim())
        ? ""
        : m.customPlaceholderA,
    customPlaceholderB:
      m.customPlaceholderB && /^Hạt\s*giống\s*\d+$/i.test(m.customPlaceholderB.trim())
        ? ""
        : m.customPlaceholderB,
  }));

  const hasAnyMatchReferee = matches.some((m) => Boolean(m.referee && m.referee.trim()));
  const cleanedRefs = (merged.referees || []).filter(
    (r) => r && r.trim() && !DEFAULT_OLD_REFEREES.has(r.trim()),
  );

  return {
    ...merged,
    matches,
    referees: hasAnyMatchReferee ? cleanedRefs : [],
    rankingCriteria:
      rawState.rankingCriteria && rawState.rankingCriteria.length > 0
        ? rawState.rankingCriteria
        : ["points", "diff", "h2h", "draw"],
  };
}

export function TournamentProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastCommitTimeRef = useRef<number>(0);

  const [state, setState] = useState<TournamentState>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) return sanitizeLoadedState(JSON.parse(raw) as TournamentState);
    } catch {
      /* ignore */
    }
    return initialState;
  });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = sanitizeLoadedState(JSON.parse(raw) as TournamentState);
        setState(parsed);
        savedSnapshotRef.current = JSON.stringify(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Lắng nghe trạng thái đăng nhập Firebase Auth và tải giải đấu từ đám mây khi đổi máy
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        setIsSyncing(true);
        try {
          const cloudData = await fetchTournamentFromCloud(currentUser.uid);
          if (
            cloudData &&
            typeof cloudData === "object" &&
            (cloudData.name !== undefined || (cloudData.events && cloudData.events.length > 0))
          ) {
            // Máy mới hoặc tải lại: nạp giải đấu từ đám mây vào ứng dụng
            const sanitized = sanitizeLoadedState(cloudData);
            setState(sanitized);
            savedSnapshotRef.current = JSON.stringify(sanitized);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
            } catch {}
            setLastSyncedAt(new Date());
          } else {
            // Chỉ đồng bộ lên nếu máy hiện tại đang có dữ liệu giải đấu thực sự
            if (stateRef.current.events.length > 0 || stateRef.current.name.trim() !== "") {
              await syncTournamentToCloud(currentUser.uid, currentUser.email, stateRef.current);
              setLastSyncedAt(new Date());
            }
          }
        } catch (e) {
          console.error("Lỗi đồng bộ đám mây:", e);
        } finally {
          setIsSyncing(false);
        }
      }
    });
    return () => unsub();
  }, []);

  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(() => {
    try {
      return typeof window !== "undefined" ? localStorage.getItem("naycourt_active_tour_id") : null;
    } catch {
      return null;
    }
  });
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => JSON.stringify(state));
  const savedSnapshotRef = useRef<string>(savedSnapshot);

  const markSaved = useCallback(() => {
    const snap = JSON.stringify(stateRef.current);
    savedSnapshotRef.current = snap;
    setSavedSnapshot(snap);
  }, []);

  const discardChanges = useCallback(() => {
    try {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      const original: TournamentState = JSON.parse(savedSnapshotRef.current);
      setState(original);
      setSavedSnapshot(savedSnapshotRef.current);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(original));
      } catch {}
      if (auth.currentUser) {
        void syncTournamentToCloud(auth.currentUser.uid, auth.currentUser.email, original);
      }
    } catch (e) {
      console.error("Lỗi hoàn tác thay đổi:", e);
    }
  }, []);

  const clearActiveTournament = useCallback(() => {
    setActiveTournamentId(null);
    try {
      localStorage.removeItem("naycourt_active_tour_id");
    } catch {}
  }, []);

  const isDirty = useMemo(() => {
    try {
      const current = JSON.stringify(state);
      if (current === savedSnapshot) return false;
      if (!state.name.trim() && state.events.length === 0 && state.entries.length === 0) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, [state, savedSnapshot]);

  const hasUnsavedChanges = useCallback(() => {
    try {
      const current = JSON.stringify(stateRef.current);
      if (current === savedSnapshotRef.current) return false;
      if (!stateRef.current.name.trim() && stateRef.current.events.length === 0 && stateRef.current.entries.length === 0) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const commit = useCallback(
    (next: TournamentState) => {
      lastCommitTimeRef.current = Date.now();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      // Tự động đồng bộ lên bản nháp tạm thời Firestore khi tài khoản đã đăng nhập
      // (Không tự động lưu đè danh sách vĩnh viễn user_tournaments để người dùng có thể "Không lưu")
      if (auth.currentUser) {
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(async () => {
          if (!auth.currentUser) return;
          setIsSyncing(true);
          try {
            await syncTournamentToCloud(auth.currentUser.uid, auth.currentUser.email, next);
            setLastSyncedAt(new Date());
          } catch (err) {
            console.error("Lỗi tự động đồng bộ bản nháp:", err);
          } finally {
            setIsSyncing(false);
          }
        }, 1200);
      }
      return next;
    },
    [],
  );

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
    if (auth.currentUser) {
      void syncTournamentToCloud(auth.currentUser.uid, auth.currentUser.email, initialState);
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setIsSyncing(true);
    try {
      const loggedUser = await signInWithGoogle();
      setUser(loggedUser);
      // Khi đăng nhập trên máy mới: ưu tiên lấy giải đấu đã lưu trên đám mây về máy này
      const cloudData = await fetchTournamentFromCloud(loggedUser.uid);
      if (
        cloudData &&
        typeof cloudData === "object" &&
        (cloudData.name !== undefined || (cloudData.events && cloudData.events.length > 0))
      ) {
        const sanitized = sanitizeLoadedState(cloudData);
        setState(sanitized);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
        } catch {}
      } else if (stateRef.current.events.length > 0 || stateRef.current.name.trim() !== "") {
        // Chỉ đẩy lên đám mây nếu giải hiện tại ở máy này có dữ liệu thật
        await syncTournamentToCloud(loggedUser.uid, loggedUser.email, stateRef.current);
      }
      setLastSyncedAt(new Date());
    } catch (e) {
      console.error("Lỗi khi đăng nhập Google:", e);
      throw e;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await logOutGoogle();
    setUser(null);
  }, []);

  const syncNow = useCallback(async () => {
    if (!auth.currentUser) return;
    setIsSyncing(true);
    try {
      await syncTournamentToCloud(auth.currentUser.uid, auth.currentUser.email, state);
      setLastSyncedAt(new Date());
    } catch (e) {
      console.error("Lỗi đồng bộ đám mây:", e);
    } finally {
      setIsSyncing(false);
    }
  }, [state]);

  const loadTournament = useCallback((newState: TournamentState, archiveId?: string) => {
    const sanitized = sanitizeLoadedState(newState);
    setState(sanitized);
    const snap = JSON.stringify(sanitized);
    savedSnapshotRef.current = snap;
    setSavedSnapshot(snap);
    const tourId = archiveId || (sanitized as unknown as { id?: string }).id || null;
    setActiveTournamentId(tourId);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
      if (tourId) {
        localStorage.setItem("naycourt_active_tour_id", tourId);
      } else {
        localStorage.removeItem("naycourt_active_tour_id");
      }
    } catch {}
    if (auth.currentUser) {
      void syncTournamentToCloud(auth.currentUser.uid, auth.currentUser.email, sanitized);
    }
  }, []);

  const saveCurrentToArchive = useCallback(async () => {
    if (!auth.currentUser) return null;
    try {
      const tourId = activeTournamentId || undefined;
      const savedId = await saveTournamentToArchive(
        auth.currentUser.uid,
        auth.currentUser.email,
        stateRef.current,
        tourId
      );
      if (savedId) {
        setActiveTournamentId(savedId);
        try {
          localStorage.setItem("naycourt_active_tour_id", savedId);
        } catch {}
      }
      const snap = JSON.stringify(stateRef.current);
      savedSnapshotRef.current = snap;
      setSavedSnapshot(snap);
      if (auth.currentUser) {
        void syncTournamentToCloud(auth.currentUser.uid, auth.currentUser.email, stateRef.current);
      }
      return savedId;
    } catch (e) {
      console.error("Lỗi khi lưu giải:", e);
      return null;
    }
  }, [activeTournamentId]);

  const createNewTournament = useCallback(async () => {
    setState(initialState);
    const snap = JSON.stringify(initialState);
    savedSnapshotRef.current = snap;
    setSavedSnapshot(snap);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState));
      localStorage.removeItem("naycourt_active_tour_id");
    } catch {}
    if (auth.currentUser) {
      try {
        const newId = await saveTournamentToArchive(
          auth.currentUser.uid,
          auth.currentUser.email,
          initialState
        );
        setActiveTournamentId(newId);
        try {
          localStorage.setItem("naycourt_active_tour_id", newId);
        } catch {}
        void syncTournamentToCloud(auth.currentUser.uid, auth.currentUser.email, initialState);
        return newId;
      } catch (e) {
        console.error("Lỗi khi tạo giải mới:", e);
        setActiveTournamentId(null);
        return null;
      }
    } else {
      setActiveTournamentId(null);
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({
      state,
      update,
      updateEvent,
      updateMatch,
      setSelectedEventId,
      toggleKoLock,
      reset,
      user,
      authLoading,
      isSyncing,
      lastSyncedAt,
      loginWithGoogle,
      logout,
      syncNow,
      loadTournament,
      createNewTournament,
      saveCurrentToArchive,
      activeTournamentId,
      hasUnsavedChanges,
      isDirty,
      markSaved,
      discardChanges,
      clearActiveTournament,
    }),
    [
      state,
      update,
      updateEvent,
      updateMatch,
      setSelectedEventId,
      toggleKoLock,
      reset,
      user,
      authLoading,
      isSyncing,
      lastSyncedAt,
      loginWithGoogle,
      logout,
      syncNow,
      loadTournament,
      createNewTournament,
      saveCurrentToArchive,
      activeTournamentId,
      hasUnsavedChanges,
      isDirty,
      markSaved,
      discardChanges,
      clearActiveTournament,
    ],
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
  if (e.teamName && e.teamName.trim()) {
    return e.teamName.trim();
  }
  const names = e.players.map((p) => p.name.trim()).filter(Boolean);
  return names.length ? names.join(" & ") : "Chưa đặt tên";
}

/** Tạo 5 trận đấu con tiêu chuẩn MLP (Đôi nữ, Đôi nam, Mixed 1, Mixed 2, Dreambreaker) */
export function createDefaultMlpSubMatches(
  entryA?: Entry | null,
  entryB?: Entry | null,
): TeamSubMatch[] {
  const pA = entryA?.players || [];
  const pB = entryB?.players || [];

  const getNamePair = (players: PlayerSlot[], idx1: number, idx2: number, fallback: string) => {
    const n1 = players[idx1]?.name?.trim();
    const n2 = players[idx2]?.name?.trim();
    if (n1 && n2) return `${n1} & ${n2}`;
    if (n1) return n1;
    if (n2) return n2;
    return fallback;
  };

  return [
    {
      id: "sub-wd",
      type: "women_doubles",
      title: "Trận 1: Đôi Nữ (Women's Doubles)",
      teamAPlayers: getNamePair(pA, 2, 3, "Nữ 1 & Nữ 2"),
      teamBPlayers: getNamePair(pB, 2, 3, "Nữ 1 & Nữ 2"),
      scoreA: null,
      scoreB: null,
    },
    {
      id: "sub-md",
      type: "men_doubles",
      title: "Trận 2: Đôi Nam (Men's Doubles)",
      teamAPlayers: getNamePair(pA, 0, 1, "Nam 1 & Nam 2"),
      teamBPlayers: getNamePair(pB, 0, 1, "Nam 1 & Nam 2"),
      scoreA: null,
      scoreB: null,
    },
    {
      id: "sub-xd1",
      type: "mixed_doubles_1",
      title: "Trận 3: Đôi Nam Nữ 1 (Mixed 1)",
      teamAPlayers: getNamePair(pA, 0, 2, "Nam 1 & Nữ 1"),
      teamBPlayers: getNamePair(pB, 0, 2, "Nam 1 & Nữ 1"),
      scoreA: null,
      scoreB: null,
    },
    {
      id: "sub-xd2",
      type: "mixed_doubles_2",
      title: "Trận 4: Đôi Nam Nữ 2 (Mixed 2)",
      teamAPlayers: getNamePair(pA, 1, 3, "Nam 2 & Nữ 2"),
      teamBPlayers: getNamePair(pB, 1, 3, "Nam 2 & Nữ 2"),
      scoreA: null,
      scoreB: null,
    },
    {
      id: "sub-db",
      type: "dreambreaker",
      title: "Trận 5: Dreambreaker™ (Đơn luân phiên hòa 2-2)",
      teamAPlayers: entryA?.teamName || "Đội A (4 VĐV luân phiên)",
      teamBPlayers: entryB?.teamName || "Đội B (4 VĐV luân phiên)",
      scoreA: null,
      scoreB: null,
    },
  ];
}

/** Kiểm tra xem nội dung có phải là Đôi đấu vòng tròn đổi partner ngẫu nhiên không */
export function isRotatingDoubles(ev: TEvent | undefined | null): boolean {
  if (!ev) return false;
  return ev.bracket === "rr" && ev.mode === "doi" && ev.pairMode === "random";
}

/** Lấy thông tin đội A của trận đấu (hỗ trợ cả cặp cố định lẫn cặp ghép ngẫu nhiên theo trận) */
export function getMatchEntryA(m: Match | undefined | null, entries: Entry[]): Entry | undefined {
  if (!m) return undefined;
  if (m.aEntryIds && m.aEntryIds.length === 2) {
    const e1 = entries.find((e) => e.id === m.aEntryIds![0]);
    const e2 = entries.find((e) => e.id === m.aEntryIds![1]);
    const p1 = e1?.players[0];
    const p2 = e2?.players[0];
    if (p1 || p2) {
      return {
        id: `${m.aEntryIds[0]}_${m.aEntryIds[1]}`,
        eventId: m.eventId,
        players: [p1 || { name: "VĐV 1", rating: null }, p2 || { name: "VĐV 2", rating: null }],
        paid: Boolean(p1?.paid && p2?.paid),
      };
    }
  }
  return entries.find((e) => e.id === m.aId);
}

/** Lấy thông tin đội B của trận đấu (hỗ trợ cả cặp cố định lẫn cặp ghép ngẫu nhiên theo trận) */
export function getMatchEntryB(m: Match | undefined | null, entries: Entry[]): Entry | undefined {
  if (!m) return undefined;
  if (m.bEntryIds && m.bEntryIds.length === 2) {
    const e1 = entries.find((e) => e.id === m.bEntryIds![0]);
    const e2 = entries.find((e) => e.id === m.bEntryIds![1]);
    const p1 = e1?.players[0];
    const p2 = e2?.players[0];
    if (p1 || p2) {
      return {
        id: `${m.bEntryIds[0]}_${m.bEntryIds[1]}`,
        eventId: m.eventId,
        players: [p1 || { name: "VĐV 1", rating: null }, p2 || { name: "VĐV 2", rating: null }],
        paid: Boolean(p1?.paid && p2?.paid),
      };
    }
  }
  return entries.find((e) => e.id === m.bId);
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

/**
 * Tính số trận mỗi VĐV thi đấu trong nội dung đôi đổi partner ngẫu nhiên sao cho:
 * 1. Số trận của tất cả VĐV bằng nhau tuyệt đối.
 * 2. Không bao giờ bị trùng lặp partner.
 */
export function getRotatingMatchesPerPlayer(n: number): number {
  if (n < 4) return 0;
  for (let k = n - 1; k >= 2; k--) {
    if ((n * k) % 4 === 0) return k;
  }
  return 0;
}

/**
 * Sinh danh sách chỉ số cặp [ [pA1, pA2], [pB1, pB2] ] cho n người chơi:
 * Đảm bảo:
 * 1. Mọi VĐV đều đánh số trận bằng nhau tuyệt đối (playCounts[i] === targetK).
 * 2. Không một cặp partner nào bị trùng lặp lại (mỗi cặp [p1, p2] xuất hiện tối đa 1 lần).
 */
export function getRotatingScheduleIndices(n: number): [[number, number], [number, number]][] {
  if (n < 4) return [];

  // Mẫu kiểm định chuẩn tối ưu cho các số lượng phổ biến:
  if (n === 4) {
    return [
      [[0, 1], [2, 3]],
      [[0, 2], [1, 3]],
      [[0, 3], [1, 2]],
    ];
  }

  if (n === 5) {
    return [
      [[0, 1], [2, 3]],
      [[0, 2], [1, 4]],
      [[0, 3], [2, 4]],
      [[0, 4], [1, 3]],
      [[1, 2], [3, 4]],
    ];
  }

  // 6 người: Mỗi người đánh đúng 4 trận (tổng 6 trận), 12 cặp partner đều phân biệt, không ai trùng partner!
  if (n === 6) {
    return [
      [[0, 1], [2, 3]],
      [[0, 2], [4, 5]],
      [[0, 3], [1, 2]],
      [[1, 4], [3, 5]],
      [[0, 4], [2, 5]],
      [[1, 5], [3, 4]],
    ];
  }

  // 7 người: Mỗi người đánh đúng 4 trận (tổng 7 trận), 14 cặp partner đều phân biệt, không ai trùng partner!
  if (n === 7) {
    return [
      [[0, 1], [2, 3]],
      [[0, 2], [1, 3]],
      [[0, 3], [1, 4]],
      [[0, 4], [5, 6]],
      [[1, 5], [2, 6]],
      [[2, 5], [4, 6]],
      [[3, 6], [4, 5]],
    ];
  }

  // Thuật toán vòng tròn (Circle method) cho n chia hết cho 4 (8, 12, 16...):
  // n - 1 vòng, mỗi vòng n/4 trận. Mọi VĐV đánh đúng n - 1 trận, gặp đủ tất cả partner khác nhau!
  if (n % 4 === 0) {
    const k = n / 4;
    const numRounds = n - 1;
    const numPairs = n / 2;
    const fixed = 0;
    let rotating = Array.from({ length: n - 1 }, (_, i) => i + 1);
    const matches: [[number, number], [number, number]][] = [];
    for (let r = 0; r < numRounds; r++) {
      const list = [fixed, ...rotating];
      const pairs: [number, number][] = [];
      for (let i = 0; i < numPairs; i++) {
        pairs.push([list[i]!, list[n - 1 - i]!]);
      }
      for (let m = 0; m < k; m++) {
        matches.push([pairs[m * 2]!, pairs[m * 2 + 1]!]);
      }
      rotating = [rotating[rotating.length - 1]!, ...rotating.slice(0, rotating.length - 1)];
    }
    return matches;
  }

  // Thuật toán vành cyclic cho n = 4k + 1 (9, 13, 17...):
  // n vòng, mỗi vòng k trận. Mọi VĐV đánh đúng n - 1 trận, không trùng partner!
  if (n % 4 === 1) {
    const k = (n - 1) / 4;
    const matches: [[number, number], [number, number]][] = [];
    for (let r = 0; r < n; r++) {
      const pairs: [number, number][] = [];
      for (let d = 1; d <= 2 * k; d++) {
        const p1 = (r + d) % n;
        const p2 = (r - d + n) % n;
        pairs.push([p1, p2]);
      }
      for (let m = 0; m < k; m++) {
        matches.push([pairs[m * 2]!, pairs[m * 2 + 1]!]);
      }
    }
    return matches;
  }

  // Thuật toán tìm kiếm ràng buộc chính xác cho các giá trị n khác (ví dụ: 10, 11, 14, 15...):
  const targetK = getRotatingMatchesPerPlayer(n);
  if (targetK === 0) return [];
  const totalMatches = (n * targetK) / 4;

  const allPairs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      allPairs.push([i, j]);
    }
  }

  const possibleMatches: [[number, number], [number, number]][] = [];
  for (let i = 0; i < allPairs.length; i++) {
    for (let j = i + 1; j < allPairs.length; j++) {
      const pA = allPairs[i]!;
      const pB = allPairs[j]!;
      if (pA[0] !== pB[0] && pA[0] !== pB[1] && pA[1] !== pB[0] && pA[1] !== pB[1]) {
        possibleMatches.push([pA, pB]);
      }
    }
  }

  for (let attempt = 0; attempt < 1000; attempt++) {
    const partnerUsed = new Set<string>();
    const playCounts = new Array(n).fill(0);
    const selected: [[number, number], [number, number]][] = [];
    const shuffled = [...possibleMatches].sort(() => Math.random() - 0.5);

    for (const [pA, pB] of shuffled) {
      const kA = `${pA[0]}_${pA[1]}`;
      const kB = `${pB[0]}_${pB[1]}`;
      if (partnerUsed.has(kA) || partnerUsed.has(kB)) continue;
      if (
        playCounts[pA[0]] >= targetK ||
        playCounts[pA[1]] >= targetK ||
        playCounts[pB[0]] >= targetK ||
        playCounts[pB[1]] >= targetK
      ) {
        continue;
      }

      partnerUsed.add(kA);
      partnerUsed.add(kB);
      playCounts[pA[0]]++;
      playCounts[pA[1]]++;
      playCounts[pB[0]]++;
      playCounts[pB[1]]++;
      selected.push([pA, pB]);
      if (selected.length === totalMatches) break;
    }

    if (selected.length === totalMatches && playCounts.every((c) => c === targetK)) {
      return selected;
    }
  }

  return [];
}

/**
 * Sinh lịch đấu vòng tròn đổi partner ngẫu nhiên cho nội dung đôi:
/**
 * Bốc thăm và sinh lịch thi đấu 1 vòng tiếp theo cho nội dung Đôi đổi partner ngẫu nhiên (Rotating Doubles):
 * - Nếu có nhập điểm trình (DUPR/PVNA): thuật toán cân bằng tổng điểm trình giữa 2 bên trong mỗi trận đấu:
 *   Trong 4 VĐV [p1, p2, p3, p4] (sắp xếp r1 >= r2 >= r3 >= r4), ghép cặp (p1 + p4) vs (p2 + p3) để tổng điểm 2 bên gần bằng nhau nhất.
 * - Tránh tối đa việc gặp lại partner đã từng bắt cặp ở các vòng trước.
 * - Nếu không nhập điểm trình: bốc thăm ngẫu nhiên công bằng, đảm bảo không trùng partner và số trận đều nhau.
 * - Bỏ qua các VĐV đã đánh dấu bỏ cuộc (withdrawn).
 */
export function generateNextRotatingDoublesRound(
  ev: TEvent,
  entries: Entry[],
  existingMatches: Match[],
  courts: string[],
): Match[] {
  // Chỉ lấy VĐV hợp lệ và CHƯA BỎ CUỘC
  const activeEntries = entries.filter(
    (e) => !e.withdrawn && e.players.some((p) => p.name.trim()),
  );
  const n = activeEntries.length;
  if (n < 4) return [];

  const courtList = courts.length ? courts : ["Sân 1"];
  const evMatches = existingMatches.filter((m) => m.eventId === ev.id && m.stage === "group");
  const existingRounds = evMatches.map((m) => m.round);
  const nextRound = existingRounds.length > 0 ? Math.max(...existingRounds) + 1 : 1;

  // Lịch sử partner và đối đầu từ các trận trước
  const partnerCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  const playCounts = new Map<string, number>();

  activeEntries.forEach((e) => playCounts.set(e.id, 0));

  const makeKey = (id1: string, id2: string) => (id1 < id2 ? `${id1}_${id2}` : `${id2}_${id1}`);

  evMatches.forEach((m) => {
    const teamA = m.aEntryIds || (m.aId ? [m.aId] : []);
    const teamB = m.bEntryIds || (m.bId ? [m.bId] : []);

    if (teamA.length === 2) {
      const k = makeKey(teamA[0]!, teamA[1]!);
      partnerCounts.set(k, (partnerCounts.get(k) || 0) + 1);
    }
    if (teamB.length === 2) {
      const k = makeKey(teamB[0]!, teamB[1]!);
      partnerCounts.set(k, (partnerCounts.get(k) || 0) + 1);
    }

    teamA.forEach((a) => {
      teamB.forEach((b) => {
        const k = makeKey(a, b);
        opponentCounts.set(k, (opponentCounts.get(k) || 0) + 1);
      });
    });

    [...teamA, ...teamB].forEach((id) => {
      if (playCounts.has(id)) {
        playCounts.set(id, playCounts.get(id)! + 1);
      }
    });
  });

  const numMatches = Math.floor(n / 4);
  const neededPlayersCount = numMatches * 4;
  const numPairs = numMatches * 2;

  // Sắp xếp các VĐV theo số trận đã chơi tăng dần (người ít trận nhất được ưu tiên đánh)
  // Kèm chút ngẫu nhiên để các VĐV bằng số trận được xáo trộn công bằng
  const candidates = [...activeEntries].sort((a, b) => {
    const diff = (playCounts.get(a.id) || 0) - (playCounts.get(b.id) || 0);
    if (diff !== 0) return diff;
    return Math.random() - 0.5;
  });

  const selectedEntries = candidates.slice(0, neededPlayersCount);

  // Kiểm tra xem có ai có điểm trình không
  const hasRatings = selectedEntries.some((e) => {
    const r = e.players[0]?.rating;
    return typeof r === "number" && !isNaN(r) && r > 0;
  });

  const getRating = (e: Entry) => {
    const r = e.players[0]?.rating;
    return typeof r === "number" && !isNaN(r) && r > 0 ? r : 2.5;
  };

  let bestMatches: Array<{ a: [Entry, Entry]; b: [Entry, Entry] }> = [];

  if (hasRatings) {
    // Sắp xếp VĐV theo điểm trình giảm dần
    const sorted = [...selectedEntries].sort((a, b) => getRating(b) - getRating(a));
    // Chia làm 2 nhóm bằng nhau: Nhóm trình cao (High) và Nhóm trình thấp (Low)
    const highPool = sorted.slice(0, numPairs);
    const lowPool = sorted.slice(numPairs);

    const totalRatings = selectedEntries.reduce((sum, e) => sum + getRating(e), 0);
    const targetPairRating = totalRatings / numPairs;

    let bestPairingScore = Infinity;
    let bestPairs: Array<[Entry, Entry]> = [];

    // Tìm cách ghép 1 người trình cao với 1 người trình thấp sao cho:
    // 1. Tuyệt đối không trùng partner cũ (penalty cực lớn nếu trùng)
    // 2. Tổng điểm trình mỗi cặp đều nhau nhất có thể
    for (let iter = 0; iter < 1200; iter++) {
      const shuffledLow = [...lowPool].sort(() => Math.random() - 0.5);
      const currentPairs: Array<[Entry, Entry]> = [];
      let penalty = 0;

      for (let i = 0; i < numPairs; i++) {
        const h = highPool[i]!;
        const l = shuffledLow[i]!;
        currentPairs.push([h, l]);

        const key = makeKey(h.id, l.id);
        const repeatCount = partnerCounts.get(key) || 0;
        penalty += repeatCount * 1_000_000;

        const pairRating = getRating(h) + getRating(l);
        penalty += Math.abs(pairRating - targetPairRating) * 150;
      }

      if (penalty < bestPairingScore) {
        bestPairingScore = penalty;
        bestPairs = currentPairs;
        if (bestPairingScore === 0) break;
      }
    }

    // Sau khi đã có các cặp cân đều (1 cao + 1 thấp), xếp các cặp đấu đối kháng ngẫu nhiên (random)
    let bestMatchScore = Infinity;
    for (let iter = 0; iter < 500; iter++) {
      const shuffledPairs = [...bestPairs].sort(() => Math.random() - 0.5);
      const roundMatches: Array<{ a: [Entry, Entry]; b: [Entry, Entry] }> = [];
      let mPenalty = 0;

      for (let m = 0; m < numMatches; m++) {
        const pairA = shuffledPairs[m * 2]!;
        const pairB = shuffledPairs[m * 2 + 1]!;
        roundMatches.push({ a: pairA, b: pairB });

        // Hạn chế gặp lại đối thủ cũ
        const oppKeys = [
          makeKey(pairA[0].id, pairB[0].id),
          makeKey(pairA[0].id, pairB[1].id),
          makeKey(pairA[1].id, pairB[0].id),
          makeKey(pairA[1].id, pairB[1].id),
        ];
        oppKeys.forEach((k) => {
          mPenalty += (opponentCounts.get(k) || 0) * 20;
        });

        // Điểm trình 2 cặp trong 1 trận cân bằng nhau
        const rateA = getRating(pairA[0]) + getRating(pairA[1]);
        const rateB = getRating(pairB[0]) + getRating(pairB[1]);
        mPenalty += Math.abs(rateA - rateB) * 50;
      }

      if (mPenalty < bestMatchScore) {
        bestMatchScore = mPenalty;
        bestMatches = roundMatches;
        if (bestMatchScore === 0) break;
      }
    }
  } else {
    // Trường hợp không nhập điểm trình: Bốc thăm ngẫu nhiên công bằng, không trùng partner
    let bestScore = Infinity;

    for (let iter = 0; iter < 1200; iter++) {
      const shuffled = [...selectedEntries].sort(() => Math.random() - 0.5);
      const roundMatches: Array<{ a: [Entry, Entry]; b: [Entry, Entry] }> = [];
      let currentScore = 0;

      for (let m = 0; m < numMatches; m++) {
        const p4 = shuffled.slice(m * 4, m * 4 + 4);
        const splits: Array<{ a: [Entry, Entry]; b: [Entry, Entry] }> = [
          { a: [p4[0]!, p4[1]!], b: [p4[2]!, p4[3]!] },
          { a: [p4[0]!, p4[2]!], b: [p4[1]!, p4[3]!] },
          { a: [p4[0]!, p4[3]!], b: [p4[1]!, p4[2]!] },
        ];

        let bestSplit = splits[0]!;
        let minSplitPenalty = Infinity;

        for (const sp of splits) {
          let pen = 0;
          const kA = makeKey(sp.a[0].id, sp.a[1].id);
          const kB = makeKey(sp.b[0].id, sp.b[1].id);
          const repeatA = partnerCounts.get(kA) || 0;
          const repeatB = partnerCounts.get(kB) || 0;

          pen += repeatA * 1_000_000;
          pen += repeatB * 1_000_000;

          const oppKeys = [
            makeKey(sp.a[0].id, sp.b[0].id),
            makeKey(sp.a[0].id, sp.b[1].id),
            makeKey(sp.a[1].id, sp.b[0].id),
            makeKey(sp.a[1].id, sp.b[1].id),
          ];
          oppKeys.forEach((k) => {
            pen += (opponentCounts.get(k) || 0) * 15;
          });

          if (pen < minSplitPenalty) {
            minSplitPenalty = pen;
            bestSplit = sp;
          }
        }

        roundMatches.push(bestSplit);
        currentScore += minSplitPenalty;
      }

      if (currentScore < bestScore) {
        bestScore = currentScore;
        bestMatches = roundMatches;
        if (bestScore === 0) break;
      }
    }
  }

  const newMatches: Match[] = [];
  bestMatches.forEach((bm, idx) => {
    newMatches.push({
      id: uid(),
      eventId: ev.id,
      stage: "group",
      groupName: "Vòng tròn",
      round: nextRound,
      aId: bm.a[0].id,
      bId: bm.b[0].id,
      aEntryIds: [bm.a[0].id, bm.a[1].id],
      bEntryIds: [bm.b[0].id, bm.b[1].id],
      scoreA: null,
      scoreB: null,
      court: courtList[idx % courtList.length] || "Sân 1",
      referee: "",
      status: "pending",
    });
  });

  return newMatches;
}

/**
 * Sinh lịch đấu vòng tròn đổi partner ngẫu nhiên cho nội dung đôi:
 * - Khi bấm tạo lịch ban đầu: CHỈ TẠO 1 VÒNG ĐẦU TIÊN (Vòng 1).
 * - Các vòng sau sẽ được người dùng bấm "Bốc thăm tiếp Vòng X" theo số lượng vòng cài đặt.
 * - Ghép 1 người điểm thấp với 1 người điểm cao để cân bằng điểm trình, xếp trận đấu random.
 */
export function generateRotatingDoublesMatches(
  ev: TEvent,
  entries: Entry[],
  courts: string[],
): Match[] {
  const activeEntries = entries.filter(
    (e) => !e.withdrawn && e.players.some((p) => p.name.trim()),
  );
  if (activeEntries.length < 4) return [];

  // Khi bấm tạo lịch ban đầu: chỉ tạo đúng 1 vòng đầu tiên (Vòng 1)
  return generateNextRotatingDoublesRound(ev, activeEntries, [], courts);
}

/**
 * Sinh lịch đấu vòng tròn cố định: Toàn bộ các đội đấu với nhau (không chia bảng).
 * Ví dụ 8 đội -> mỗi đội đấu 7 trận, mỗi vòng 4 trận.
 */
export function generateFixedRoundRobinMatches(
  ev: TEvent,
  entries: Entry[],
  courts: string[],
): Match[] {
  if (entries.length < 2) return [];
  const courtList = courts.length ? courts : ["Sân 1"];
  let courtCursor = 0;
  const matches: Match[] = [];

  const rounds = roundRobinRounds(entries.map((e) => e.id));
  rounds.forEach((pairs, r) => {
    pairs.forEach(([a, b]) => {
      matches.push({
        id: uid(),
        eventId: ev.id,
        stage: "group",
        groupName: "Vòng tròn",
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

  return matches;
}

/** Sinh lịch vòng bảng cho một nội dung, phân sân theo số sân của giải. */
export function generateGroupMatches(ev: TEvent, entries: Entry[], courts: string[]): Match[] {
  // 1. Trường hợp Đấu vòng tròn thuần túy (ev.bracket === "rr"):
  // Không chia bảng, toàn bộ các đội đấu với nhau
  if (ev.bracket === "rr") {
    if (isRotatingDoubles(ev)) {
      return generateRotatingDoublesMatches(ev, entries, courts);
    }
    return generateFixedRoundRobinMatches(ev, entries, courts);
  }

  // 2. Trường hợp Chia bảng loại trực tiếp (ev.bracket === "rr_ko"):
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

export type IndividualStandingRow = {
  entryId: string;
  playerName: string;
  rating: number | null;
  paid: boolean;
  played: number;
  win: number;
  draw: number;
  loss: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  points: number;
};

/**
 * Tính điểm xếp hạng cá nhân tích lũy cho nội dung đôi đổi partner ngẫu nhiên qua từng trận.
 * Ưu tiên: 1. Tổng điểm tích lũy -> 2. Hiệu số điểm -> 3. Tổng điểm ghi được -> 4. Số trận thắng
 */
export function computeIndividualStandings(
  entries: Entry[],
  matches: Match[],
  ev: Pick<TEvent, "winPoints" | "lossPoints" | "drawPoints">,
  criteria: RankingCriterion[] = ["points", "diff", "h2h", "draw"],
  withdrawnEntryIds: Set<string> = new Set(),
): IndividualStandingRow[] {
  const rows = new Map<string, IndividualStandingRow>();
  entries.forEach((e) => {
    const p = e.players[0];
    const isWithdrawn = Boolean(e.withdrawn || withdrawnEntryIds.has(e.id));
    if (isWithdrawn) {
      withdrawnEntryIds.add(e.id);
    }
    rows.set(e.id, {
      entryId: e.id,
      playerName: p?.name?.trim() || "VĐV",
      rating: p?.rating ?? null,
      paid: Boolean(p?.paid ?? e.paid),
      played: 0,
      win: 0,
      draw: 0,
      loss: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      diff: 0,
      points: 0,
    });
  });

  matches.forEach((m) => {
    if (m.scoreA === null || m.scoreB === null) return;
    const teamAIds = m.aEntryIds ? m.aEntryIds : m.aId ? [m.aId] : [];
    const teamBIds = m.bEntryIds ? m.bEntryIds : m.bId ? [m.bId] : [];

    // Nếu trận đấu có bất kỳ VĐV nào đã bỏ cuộc, hủy bỏ toàn bộ kết quả trận đấu này
    const hasWithdrawn = [...teamAIds, ...teamBIds].some((id) => withdrawnEntryIds.has(id));
    if (hasWithdrawn) return;

    teamAIds.forEach((id) => {
      const row = rows.get(id);
      if (!row) return;
      row.played++;
      row.pointsFor += m.scoreA!;
      row.pointsAgainst += m.scoreB!;
      if (m.scoreA! > m.scoreB!) {
        row.win++;
        row.points += ev.winPoints;
      } else if (m.scoreB! > m.scoreA!) {
        row.loss++;
        row.points += ev.lossPoints;
      } else {
        row.draw++;
        row.points += ev.drawPoints;
      }
    });

    teamBIds.forEach((id) => {
      const row = rows.get(id);
      if (!row) return;
      row.played++;
      row.pointsFor += m.scoreB!;
      row.pointsAgainst += m.scoreA!;
      if (m.scoreB! > m.scoreA!) {
        row.win++;
        row.points += ev.winPoints;
      } else if (m.scoreA! > m.scoreB!) {
        row.loss++;
        row.points += ev.lossPoints;
      } else {
        row.draw++;
        row.points += ev.drawPoints;
      }
    });
  });

  return [...rows.values()]
    .map((r) => ({ ...r, diff: r.pointsFor - r.pointsAgainst }))
    .sort((x, y) => {
      const xWithdrawn = withdrawnEntryIds.has(x.entryId);
      const yWithdrawn = withdrawnEntryIds.has(y.entryId);
      if (xWithdrawn && !yWithdrawn) return 1;
      if (!xWithdrawn && yWithdrawn) return -1;
      if (xWithdrawn && yWithdrawn) return 0;

      for (const crit of criteria) {
        if (crit === "points") {
          if (y.points !== x.points) return y.points - x.points;
        } else if (crit === "diff") {
          if (y.diff !== x.diff) return y.diff - x.diff;
        } else if (crit === "h2h") {
          const h2h = matches.find((m) => {
            if (m.scoreA === null || m.scoreB === null) return false;
            const aIds: string[] = m.aEntryIds || (m.aId ? [m.aId] : []);
            const bIds: string[] = m.bEntryIds || (m.bId ? [m.bId] : []);
            return (
              (aIds.includes(x.entryId) && bIds.includes(y.entryId)) ||
              (aIds.includes(y.entryId) && bIds.includes(x.entryId))
            );
          });
          if (h2h && h2h.scoreA !== null && h2h.scoreB !== null && h2h.scoreA !== h2h.scoreB) {
            const aIds: string[] = h2h.aEntryIds || (h2h.aId ? [h2h.aId] : []);
            const xWon =
              (aIds.includes(x.entryId) && h2h.scoreA > h2h.scoreB) ||
              (!aIds.includes(x.entryId) && h2h.scoreB > h2h.scoreA);
            const yWon =
              (aIds.includes(y.entryId) && h2h.scoreA > h2h.scoreB) ||
              (!aIds.includes(y.entryId) && h2h.scoreB > h2h.scoreA);
            if (xWon && !yWon) return -1;
            if (yWon && !xWon) return 1;
          }
        } else if (crit === "draw") {
          if (y.pointsFor !== x.pointsFor) return y.pointsFor - x.pointsFor;
        }
      }

      if (y.pointsFor !== x.pointsFor) return y.pointsFor - x.pointsFor;
      return y.win - x.win;
    });
}

export function computeStandings(
  entryIds: string[],
  matches: Match[],
  ev: Pick<TEvent, "winPoints" | "lossPoints" | "drawPoints">,
  criteria: RankingCriterion[] = ["points", "diff", "h2h", "draw"],
  withdrawnEntryIds: Set<string> = new Set(),
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
    // Nếu có đội bỏ cuộc, hủy bỏ toàn bộ kết quả trận đấu này (không tính cho cả 2 bên)
    if (
      (m.aId && withdrawnEntryIds.has(m.aId)) ||
      (m.bId && withdrawnEntryIds.has(m.bId))
    ) {
      return;
    }

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
      // Đội bỏ cuộc luôn xếp ở cuối bảng
      const xWithdrawn = withdrawnEntryIds.has(x.entryId);
      const yWithdrawn = withdrawnEntryIds.has(y.entryId);
      if (xWithdrawn && !yWithdrawn) return 1;
      if (!xWithdrawn && yWithdrawn) return -1;
      if (xWithdrawn && yWithdrawn) return 0;

      for (const crit of criteria) {
        if (crit === "points") {
          if (y.points !== x.points) return y.points - x.points;
        } else if (crit === "diff") {
          if (y.diff !== x.diff) return y.diff - x.diff;
        } else if (crit === "h2h") {
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
        } else if (crit === "draw") {
          if (y.pointsFor !== x.pointsFor) return y.pointsFor - x.pointsFor;
        }
      }

      // Fallback cuối cùng: tổng điểm ghi được
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
      const hasAnyGroupScore = groupMatches.some((m) => m.scoreA !== null && m.scoreB !== null);
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

      if (allGroupMatchesDone || hasAnyGroupScore) {
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

      if (allGroupMatchesDone || hasAnyGroupScore) {
        ranked2nd.sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.diff !== a.diff) return b.diff - a.diff;
          if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
          return a.groupIdx - b.groupIdx;
        });
      }

      const get1stByGroup = (gKey: string) => ranked1st.find((t) => t.groupKey === gKey) || ranked1st[0]!;
      const get2ndByGroup = (gKey: string) => ranked2nd.find((t) => t.groupKey === gKey) || ranked2nd[0]!;

      // Thứ hạng thực tế của đội Nhì bảng (0 là Nhì xuất sắc nhất, numGroups - 1 là Nhì thấp nhất)
      const getRank2Order = (gKey: string) => {
        const idx = ranked2nd.findIndex((t) => t.groupKey === gKey);
        return idx >= 0 ? idx : 999;
      };
      // Sắp xếp danh sách mã bảng theo thứ hạng thực tế của đội Nhì bảng (từ cao xuống thấp)
      const sortGroupKeysBy2ndRank = (keys: string[]) =>
        [...keys].sort((kA, kB) => getRank2Order(kA) - getRank2Order(kB));

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
        const [r2Best, r2Worst] = sortGroupKeysBy2ndRank([g2, g3]);
        slots = [
          makeSlot(team1(g1), bye),
          makeSlot(team2(r2Best!), team2(r2Worst!)),
          makeSlot(team1(g3), team2(g1)),
          makeSlot(team1(g2), bye),
        ];
      } else if (numGroups === 4 && advanceN === 2 && size === 8) {
        // 4 bảng (8 đội vào Tứ kết, 0 suất BYE):
        // Nhánh trái có Nhất bảng g1 (cao hơn) và g4 (thấp hơn) -> gặp 2 đội Nhì từ bảng [g2, g3]
        // Đội Nhì có thứ hạng cao hơn được ưu tiên gặp đội Nhất thấp hơn (g4), tránh đội Nhất cao nhất (g1)!
        const [leftBest2nd, leftWorst2nd] = sortGroupKeysBy2ndRank([g2, g3]);
        // Nhánh phải có Nhất bảng g2 (cao hơn) và g3 (thấp hơn) -> gặp 2 đội Nhì từ bảng [g1, g4]
        // Đội Nhì có thứ hạng cao hơn được ưu tiên gặp đội Nhất thấp hơn (g3), tránh đội Nhất cao hơn (g2)!
        const [rightBest2nd, rightWorst2nd] = sortGroupKeysBy2ndRank([g1, g4]);
        slots = [
          makeSlot(team1(g1), team2(leftWorst2nd!)),
          makeSlot(team1(g4), team2(leftBest2nd!)),
          makeSlot(team1(g3), team2(rightBest2nd!)),
          makeSlot(team1(g2), team2(rightWorst2nd!)),
        ];
      } else if (numGroups === 5 && advanceN === 2 && size === 16) {
        // 5 bảng (10 đội vào Vòng 1/8, 6 suất BYE cho 5 đội Nhất bảng + 1 đội Nhì bảng có thứ hạng cao nhất):
        // BƯỚC 1 (Cố định 4 hạt giống dẫn đầu vào 4 nhánh Tứ kết khác nhau):
        // - Nhánh lớn bên Trái (Bán kết 1): Hạt giống 1 (1[g1] ở TK1/K1) và Hạt giống 4 (1[g4] ở TK2/K3)
        // - Nhánh lớn bên Phải (Bán kết 2): Hạt giống 2 (1[g2] ở TK3/K5) và Hạt giống 3 (1[g3] ở TK4/K7)
        // BƯỚC 2 (Phân 2 suất BYE còn lại là 1[g5] và 2[best2ndKey] vào K4 thuộc TK2 và K8 thuộc TK4):
        // - Đảm bảo 2[best2ndKey] luôn nằm khác nhánh lớn với đội Nhất cùng bảng 1[best2ndKey]:
        const best2ndKey = ranked2nd[0]?.groupKey ?? g3;

        let k4Slot: { label: string; entryId: string | null }; // Gặp 1(g4) ở TK2 (Nhánh trái)
        let k8Slot: { label: string; entryId: string | null }; // Gặp 1(g3) ở TK4 (Nhánh phải)
        let left1stGroups: string[];
        let right1stGroups: string[];

        if (best2ndKey === g1 || best2ndKey === g4) {
          // 1(best2ndKey) đang ở Nhánh trái -> 2(best2ndKey) bắt buộc sang Nhánh phải (K8 gặp 1[g3]), còn 1(g5) vào Nhánh trái (K4 gặp 1[g4])
          k4Slot = team1(g5);
          k8Slot = team2(best2ndKey);
          left1stGroups = [g1, g4, g5];
          right1stGroups = [g2, g3];
        } else if (best2ndKey === g2 || best2ndKey === g3) {
          // 1(best2ndKey) đang ở Nhánh phải -> 2(best2ndKey) bắt buộc sang Nhánh trái (K4 gặp 1[g4]), còn 1(g5) vào Nhánh phải (K8 gặp 1[g3])
          k4Slot = team2(best2ndKey);
          k8Slot = team1(g5);
          left1stGroups = [g1, g4];
          right1stGroups = [g2, g3, g5];
        } else {
          // best2ndKey === g5: Đặt 1(g5) ở Nhánh trái (K4 gặp 1[g4]) và 2(g5) ở Nhánh phải (K8 gặp 1[g3]) để 1(g5) và 2(g5) khác nhánh
          k4Slot = team1(g5);
          k8Slot = team2(best2ndKey);
          left1stGroups = [g1, g4, g5];
          right1stGroups = [g2, g3];
        }

        // BƯỚC 3 (Phân 4 đội Nhì còn lại vào trận K2 ở Nhánh trái và trận K6 ở Nhánh phải):
        // - Các đội Nhì thuộc các bảng có đội Nhất nằm ở Nhánh phải (right1stGroups) sẽ sang Nhánh trái (K2)
        // - Các đội Nhì thuộc các bảng có đội Nhất nằm ở Nhánh trái (left1stGroups) sẽ sang Nhánh phải (K6)
        // Nhờ vậy mỗi nhánh lớn (Trái / Phải) có đúng 5 đội từ 5 bảng khác nhau, tuyệt đối không trùng bảng!
        const rem2ndKeys = ranked2nd
          .slice(1)
          .map((r) => r.groupKey);

        const forLeftK2 = sortGroupKeysBy2ndRank(
          rem2ndKeys.filter((k) => right1stGroups.includes(k)),
        );
        const forRightK6 = sortGroupKeysBy2ndRank(
          rem2ndKeys.filter((k) => left1stGroups.includes(k)),
        );

        const [leftP1 = rem2ndKeys[0]!, leftP2 = rem2ndKeys[1]!] = forLeftK2;
        const [rightP1 = rem2ndKeys[2]!, rightP2 = rem2ndKeys[3]!] = forRightK6;

        slots = [
          makeSlot(team1(g1), bye),
          makeSlot(team2(leftP1), team2(leftP2)),
          makeSlot(team1(g4), bye),
          makeSlot(k4Slot, bye),
          makeSlot(team1(g2), bye),
          makeSlot(team2(rightP1), team2(rightP2)),
          makeSlot(team1(g3), bye),
          makeSlot(k8Slot, bye),
        ];
      } else if (numGroups === 6 && advanceN === 2 && size === 16) {
        // 6 bảng (12 đội vào Vòng 1/8, 4 suất BYE cho top 4 hạt giống Nhất bảng):
        // Nhánh trái có Nhất: g1, g4, g5 -> nhận 3 đội Nhì từ bảng [g2, g3, g6]
        const [l2_1, l2_2, l2_3] = sortGroupKeysBy2ndRank([g2, g3, g6]);
        // Nhánh phải có Nhất: g2, g3, g6 -> nhận 3 đội Nhì từ bảng [g1, g4, g5]
        const [r2_1, r2_2, r2_3] = sortGroupKeysBy2ndRank([g1, g4, g5]);
        // Đội Nhì cao nhất mỗi nhánh (l2_1, r2_1) gặp đội Nhất thấp nhất nhánh đó (g5, g6); 2 đội Nhì thấp hơn đấu nhau
        slots = [
          makeSlot(team1(g1), bye),
          makeSlot(team2(l2_2!), team2(l2_3!)),
          makeSlot(team1(g5), team2(l2_1!)),
          makeSlot(team1(g4), bye),
          makeSlot(team1(g2), bye),
          makeSlot(team2(r2_2!), team2(r2_3!)),
          makeSlot(team1(g6), team2(r2_1!)),
          makeSlot(team1(g3), bye),
        ];
      } else if (numGroups === 7 && advanceN === 2 && size === 16) {
        // 7 bảng (14 đội vào Vòng 1/8, 2 suất BYE cho Seed 1 & Seed 2):
        // Nhánh trái có Nhất: g1 (BYE ở TK1), g4 & g5 (ở TK2) -> nhận 4 đội Nhì từ [g2, g3, g6, g7]
        const [l2_1, l2_2, l2_3, l2_4] = sortGroupKeysBy2ndRank([g2, g3, g6, g7]);
        // Nhánh phải có Nhất: g2 (BYE ở TK3) & g7 (TK3), g3 & g6 (ở TK4) -> nhận 3 đội Nhì từ [g1, g4, g5]
        const [r2_1, r2_2, r2_3] = sortGroupKeysBy2ndRank([g1, g4, g5]);
        slots = [
          makeSlot(team1(g1), bye),
          makeSlot(team2(l2_3!), team2(l2_4!)),
          makeSlot(team1(g5), team2(l2_1!)),
          makeSlot(team1(g4), team2(l2_2!)),
          makeSlot(team1(g2), bye),
          makeSlot(team1(g7), team2(r2_1!)),
          makeSlot(team1(g6), team2(r2_2!)),
          makeSlot(team1(g3), team2(r2_3!)),
        ];
      } else if (numGroups === 8 && advanceN === 2 && size === 16) {
        // 8 bảng (16 đội vào Vòng 1/8, 0 suất BYE):
        // Nhánh trái có Nhất: g1 & g8 (TK1), g4 & g5 (TK2) -> gặp 4 đội Nhì từ [g2, g3, g6, g7]
        const [l2_1, l2_2, l2_3, l2_4] = sortGroupKeysBy2ndRank([g2, g3, g6, g7]);
        // Nhánh phải có Nhất: g2 & g7 (TK3), g3 & g6 (TK4) -> gặp 4 đội Nhì từ [g1, g4, g5, g8]
        const [r2_1, r2_2, r2_3, r2_4] = sortGroupKeysBy2ndRank([g1, g4, g5, g8]);
        // Đội Nhì hạng cao hơn luôn ưu tiên gặp đội Nhất hạng thấp hơn trong nhánh:
        slots = [
          makeSlot(team1(g1), team2(l2_4!)),
          makeSlot(team1(g8), team2(l2_1!)),
          makeSlot(team1(g5), team2(l2_2!)),
          makeSlot(team1(g4), team2(l2_3!)),
          makeSlot(team1(g2), team2(r2_4!)),
          makeSlot(team1(g7), team2(r2_1!)),
          makeSlot(team1(g6), team2(r2_2!)),
          makeSlot(team1(g3), team2(r2_3!)),
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
      const pA = seedA ? (seedA <= totalTeams ? "" : "BYE") : "";
      const pB = seedB ? (seedB <= totalTeams ? "" : "BYE") : "";

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

  return propagateKnockout(matches, ev.id, ev);
}

/**
 * Tạo nhánh KO theo Tổng số đội KO đã chọn (chuẩn thi đấu không sử dụng suất BYE):
 * - Lấy đủ chính xác số đội KO đã chọn (ví dụ: 8 đội từ 3 bảng gồm: 3 đội Nhất, 3 đội Nhì, và bổ sung 2 đội Ba có hiệu số trung bình cao nhất).
 * - Công thức xếp hạng đội hạng Ba: hiệu số chia cho số trận đã đánh ở vòng bảng (diff / matchesPlayed), nếu bằng nhau xét điểm trung bình mỗi trận.
 * - Các cặp đấu Vòng 1 xếp không bị trùng bảng, phân đều sang 2 nhánh.
 * - Khi toàn bộ vòng bảng kết thúc: tự động điền tên các đội vào nhánh.
 */
export function generateTotalKoKnockout(
  ev: TEvent,
  entries: Entry[],
  groupMatches: Match[],
  totalTeams: number,
  courts: string[],
): Match[] {
  let size = 2;
  while (size < Math.max(2, totalTeams)) {
    size *= 2;
  }

  const courtList = courts.length ? courts : ["Sân 1"];
  let courtCursor = 0;
  const numMatchesR1 = size / 2;

  // Nếu không có chia bảng (ít hơn 2 bảng)
  if (!ev.groups || ev.groups.length < 2) {
    const seedOrder = getBracketSeedOrder(size);
    const matches: Match[] = [];
    let roundIdx = 1;
    let current = size;

    while (current >= 2) {
      const label = KO_LABEL(current);
      const matchCount = current / 2;
      for (let i = 0; i < matchCount; i++) {
        const isFirst = current === size;
        const seedA = isFirst ? seedOrder[2 * i] : undefined;
        const seedB = isFirst ? seedOrder[2 * i + 1] : undefined;
        const entryA = seedA && seedA <= entries.length ? entries[seedA - 1]?.id ?? null : null;
        const entryB = seedB && seedB <= entries.length ? entries[seedB - 1]?.id ?? null : null;
        const pA = seedA ? `Hạt giống ${seedA}` : "";
        const pB = seedB ? `Hạt giống ${seedB}` : "";

        matches.push({
          id: uid(),
          eventId: ev.id,
          stage: "ko",
          groupName: label,
          round: roundIdx,
          koRound: label,
          slot: i,
          aId: entryA,
          bId: entryB,
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

    return propagateKnockout(matches, ev.id, ev, groupMatches);
  }

  // Trường hợp chia từ 2 bảng trở lên
  const groups = ev.groups;
  const cleanGName = (name: string, idx: number) =>
    name.replace(/^Bảng\s+/i, "").trim().toUpperCase() || String.fromCharCode(65 + idx);

  const byGroup = groups.map((g, idx) => ({
    group: g,
    key: cleanGName(g.name, idx),
    rows: computeStandings(
      g.entryIds,
      groupMatches.filter((m) => m.groupName === g.name),
      ev,
    ),
  }));

  const allGroupMatchesDone =
    groupMatches.length > 0 && groupMatches.every((m) => m.status === "done");
  const hasAnyGroupScore = groupMatches.some((m) => m.scoreA !== null && m.scoreB !== null);

  // 1. Thu thập danh sách đội theo từng thứ hạng trong bảng
  interface TeamCandidate {
    entryId: string | null;
    groupKey: string;
    rankInGroup: number;
    played: number;
    points: number;
    diff: number;
    pointsFor: number;
    avgDiff: number; // Hiệu số trung bình mỗi trận = diff / played
    avgPoints: number;
    avgPointsFor: number;
  }

  const getRankList = (rankIdx: number): TeamCandidate[] => {
    const list: TeamCandidate[] = byGroup.map((bg) => {
      const row = bg.rows[rankIdx];
      const played = row ? (row.played || (row.win + row.loss + (row.draw || 0))) : 0;
      const diff = row?.diff ?? 0;
      const points = row?.points ?? 0;
      const pointsFor = row?.pointsFor ?? 0;
      return {
        entryId: row?.entryId ?? null,
        groupKey: bg.key,
        rankInGroup: rankIdx + 1,
        played,
        points,
        diff,
        pointsFor,
        avgDiff: played > 0 ? diff / played : 0,
        avgPoints: played > 0 ? points / played : 0,
        avgPointsFor: played > 0 ? pointsFor / played : 0,
      };
    });

    // Sắp xếp các đội cùng thứ hạng theo tiêu chuẩn:
    // Với Nhất bảng: điểm số, hiệu số, điểm ghi
    // Với Nhì & Ba bảng: công thức hiệu số chia cho số trận đã đánh (avgDiff), điểm trung bình (avgPoints)
    list.sort((a, b) => {
      if (rankIdx === 0) {
        if (b.points !== a.points) return b.points - a.points;
        if (b.diff !== a.diff) return b.diff - a.diff;
        if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
        return a.groupKey.localeCompare(b.groupKey);
      }
      // Đội hạng 2, 3, 4: So sánh theo hiệu số trung bình mỗi trận (diff / played)
      if (Math.abs(b.avgDiff - a.avgDiff) > 0.0001) {
        return b.avgDiff - a.avgDiff;
      }
      if (Math.abs(b.avgPoints - a.avgPoints) > 0.0001) {
        return b.avgPoints - a.avgPoints;
      }
      if (Math.abs(b.avgPointsFor - a.avgPointsFor) > 0.0001) {
        return b.avgPointsFor - a.avgPointsFor;
      }
      if (b.pointsFor !== a.pointsFor) {
        return b.pointsFor - a.pointsFor;
      }
      return a.groupKey.localeCompare(b.groupKey);
    });

    return list;
  };

  const rank1Teams = getRankList(0); // Đội Nhất các bảng
  const rank2Teams = getRankList(1); // Đội Nhì các bảng
  const rank3Teams = getRankList(2); // Đội Ba các bảng (đã sort theo diff / played)
  const rank4Teams = getRankList(3); // Đội Tư các bảng nếu cần

  // 2. Tuyển chọn đủ chính xác `size` đội vào vòng KO (không để BYE)
  interface QualifiedTeam {
    entryId: string | null;
    placeholder: string;
    groupKey: string;
    rankInGroup: number;
    isWildcard?: boolean;
  }

  const qualified: QualifiedTeam[] = [];
  let remainingNeeded = size;

  // Lấy đội Nhất bảng
  const take1Count = Math.min(remainingNeeded, rank1Teams.length);
  for (let i = 0; i < take1Count; i++) {
    const t = rank1Teams[i]!;
    qualified.push({
      entryId: t.entryId,
      placeholder: `1${t.groupKey}`,
      groupKey: t.groupKey,
      rankInGroup: 1,
    });
  }
  remainingNeeded -= take1Count;

  // Lấy đội Nhì bảng
  if (remainingNeeded > 0) {
    const take2Count = Math.min(remainingNeeded, rank2Teams.length);
    for (let i = 0; i < take2Count; i++) {
      const t = rank2Teams[i]!;
      qualified.push({
        entryId: t.entryId,
        placeholder: `2${t.groupKey}`,
        groupKey: t.groupKey,
        rankInGroup: 2,
      });
    }
    remainingNeeded -= take2Count;
  }

  // Lấy đội Hạng Ba xuất sắc nhất theo hiệu số trung bình mỗi trận (Wildcards)
  if (remainingNeeded > 0) {
    const take3Count = Math.min(remainingNeeded, rank3Teams.length);
    for (let i = 0; i < take3Count; i++) {
      const t = rank3Teams[i]!;
      qualified.push({
        entryId: t.entryId,
        placeholder: `3${t.groupKey}`,
        groupKey: t.groupKey,
        rankInGroup: 3,
        isWildcard: true,
      });
    }
    remainingNeeded -= take3Count;
  }

  // Nếu vẫn còn thiếu (ví dụ 2 bảng chọn 8 đội), tiếp tục lấy đội Hạng Tư
  if (remainingNeeded > 0) {
    const take4Count = Math.min(remainingNeeded, rank4Teams.length);
    for (let i = 0; i < take4Count; i++) {
      const t = rank4Teams[i]!;
      qualified.push({
        entryId: t.entryId,
        placeholder: `4${t.groupKey}`,
        groupKey: t.groupKey,
        rankInGroup: 4,
        isWildcard: true,
      });
    }
    remainingNeeded -= take4Count;
  }

  // 3. Phân cặp Vòng 1 theo thứ tự hạt giống tournament binary tree
  // và giải quyết triệt để xung đột cùng bảng
  const seedOrder = getBracketSeedOrder(size);
  interface InitialKoSlot {
    aId: string | null;
    bId: string | null;
    placeholderA: string;
    placeholderB: string;
    teamA: QualifiedTeam;
    teamB: QualifiedTeam;
  }

  const firstRoundSlots: InitialKoSlot[] = [];
  for (let i = 0; i < numMatchesR1; i++) {
    const seedA = seedOrder[2 * i]!;
    const seedB = seedOrder[2 * i + 1]!;
    const tA = qualified[seedA - 1] || qualified[0]!;
    const tB = qualified[seedB - 1] || qualified[qualified.length - 1]!;

    firstRoundSlots.push({
      aId: allGroupMatchesDone ? tA.entryId : null,
      bId: allGroupMatchesDone ? tB.entryId : null,
      placeholderA: tA.placeholder,
      placeholderB: tB.placeholder,
      teamA: tA,
      teamB: tB,
    });
  }

  // Tránh việc 2 đội cùng bảng gặp nhau ở Vòng 1 (hoán đổi đối thủ)
  for (let i = 0; i < firstRoundSlots.length; i++) {
    const slot = firstRoundSlots[i]!;
    if (slot.teamA.groupKey === slot.teamB.groupKey) {
      for (let j = 0; j < firstRoundSlots.length; j++) {
        if (j === i) continue;
        const otherSlot = firstRoundSlots[j]!;
        if (
          otherSlot.teamA.groupKey !== slot.teamB.groupKey &&
          slot.teamA.groupKey !== otherSlot.teamB.groupKey
        ) {
          const tempTeam = slot.teamB;
          slot.teamB = otherSlot.teamB;
          otherSlot.teamB = tempTeam;

          slot.placeholderB = slot.teamB.placeholder;
          otherSlot.placeholderB = otherSlot.teamB.placeholder;
          if (allGroupMatchesDone) {
            slot.bId = slot.teamB.entryId;
            otherSlot.bId = otherSlot.teamB.entryId;
          }
          break;
        }
      }
    }
  }

  // 4. Sinh tất cả các trận đấu cho toàn bộ các vòng KO
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
}

/**
 * Tự động xếp nhánh loại trực tiếp theo quy luật thứ hạng chữ cái bảng (A, B, C, D...):
 * - Không xét điểm số hay hiệu số giữa các bảng trên BXH, mà cố định theo vị trí chữ cái bảng:
 *   + Nhánh trái (nửa đầu vòng 1): 1A vs 2B, 1C vs 2D, 1E vs 2F, 1G vs 2H...
 *   + Nhánh phải (nửa sau vòng 1): 1B vs 2A, 1D vs 2C, 1F vs 2E, 1H vs 2G...
 * - Nếu vòng bảng chưa kết thúc hoàn toàn: chỉ hiển thị ký hiệu thứ hạng bảng (1A, 2B...), để trống tên đội.
 * - Khi toàn bộ vòng bảng kết thúc: tự động điền tên đội tương ứng vào vị trí thứ hạng bảng.
 */
export function generateAlphabeticalKnockout(
  ev: TEvent,
  entries: Entry[],
  groupMatches: Match[],
  totalTeams: number,
  courts: string[],
): Match[] {
  const groups =
    ev.groups.length > 0
      ? ev.groups
      : [{ name: "Bảng A", entryIds: entries.map((e) => e.id) }];

  const cleanGName = (name: string, idx: number) =>
    name.replace(/^Bảng\s+/i, "").trim().toUpperCase() || String.fromCharCode(65 + idx);

  const byGroup = groups.map((g, idx) => ({
    key: cleanGName(g.name, idx),
    rows: computeStandings(
      g.entryIds,
      groupMatches.filter((m) => m.groupName === g.name),
      ev,
    ),
  }));

  const allGroupMatchesDone =
    groupMatches.length > 0 && groupMatches.every((m) => m.status === "done");

  const numGroups = byGroup.length;
  const targetTeams = Math.max(2, numGroups >= 2 ? numGroups * 2 : totalTeams);
  let size = 2;
  while (size < targetTeams) {
    size *= 2;
  }

  const numMatchesR1 = size / 2;
  const halfMatches = Math.max(1, Math.floor(numMatchesR1 / 2));

  interface SlotPair {
    aId: string | null;
    bId: string | null;
    placeholderA: string;
    placeholderB: string;
  }

  const firstRoundSlots: SlotPair[] = Array.from({ length: numMatchesR1 }, () => ({
    aId: null,
    bId: null,
    placeholderA: "",
    placeholderB: "",
  }));

  const numGroupPairs = Math.floor(numGroups / 2);
  for (let p = 0; p < numGroupPairs; p++) {
    const gOdd = byGroup[2 * p]!; // A, C, E, G...
    const gEven = byGroup[2 * p + 1]!; // B, D, F, H...

    // Nhánh trái: 1A vs 2B, 1C vs 2D, 1E vs 2F, 1G vs 2H...
    if (p < halfMatches) {
      firstRoundSlots[p] = {
        aId: allGroupMatchesDone ? (gOdd.rows[0]?.entryId ?? null) : null,
        bId: allGroupMatchesDone ? (gEven.rows[1]?.entryId ?? null) : null,
        placeholderA: `1${gOdd.key}`,
        placeholderB: `2${gEven.key}`,
      };
    }

    // Nhánh phải: 1B vs 2A, 1D vs 2C, 1F vs 2E, 1H vs 2G...
    const rightIdx = halfMatches + p;
    if (rightIdx < numMatchesR1) {
      firstRoundSlots[rightIdx] = {
        aId: allGroupMatchesDone ? (gEven.rows[0]?.entryId ?? null) : null,
        bId: allGroupMatchesDone ? (gOdd.rows[1]?.entryId ?? null) : null,
        placeholderA: `1${gEven.key}`,
        placeholderB: `2${gOdd.key}`,
      };
    }
  }

  // Nếu có bảng lẻ dư ra (trường hợp số bảng lẻ)
  if (numGroups % 2 === 1) {
    const gLast = byGroup[numGroups - 1]!;
    const leftExtraIdx = numGroupPairs;
    const rightExtraIdx = halfMatches + numGroupPairs;
    if (leftExtraIdx < halfMatches) {
      firstRoundSlots[leftExtraIdx] = {
        aId: allGroupMatchesDone ? (gLast.rows[0]?.entryId ?? null) : null,
        bId: null,
        placeholderA: `1${gLast.key}`,
        placeholderB: "BYE",
      };
    }
    if (rightExtraIdx < numMatchesR1) {
      firstRoundSlots[rightExtraIdx] = {
        aId: allGroupMatchesDone ? (gLast.rows[1]?.entryId ?? null) : null,
        bId: null,
        placeholderA: `2${gLast.key}`,
        placeholderB: "BYE",
      };
    }
  }

  const courtList = courts.length ? courts : ["Sân 1"];
  let courtCursor = 0;
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
        customPlaceholderA: slotData?.placeholderA ?? "",
        customPlaceholderB: slotData?.placeholderB ?? "",
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
      const govGroup = ev?.groups.find((g) => g.name === gn);
      const entryIds =
        govGroup && govGroup.entryIds.length > 0
          ? govGroup.entryIds
          : Array.from(
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

    const isRankToken = (placeholder?: string) => {
      if (!placeholder) return false;
      const clean = placeholder.replace(/[*#()]/g, "").trim();
      return (
        /^(?:Nhất|Nhì|Ba|Tư|I|II|III|IV|[1-4])\s*(?:bảng\s*)?([A-Za-z0-9]+)$/i.test(clean) ||
        /^(?:Ba|3)\s*(?:tốt|xuất sắc)?\s*\d*$/i.test(clean)
      );
    };

    const resolveTeam = (placeholder?: string) => {
      if (!placeholder) return null;
      const clean = placeholder.trim();
      if (/^bye$/i.test(clean)) return null;

      // Hỗ trợ cả 1A, 2A, 1B, 2E, 3B*, 3C* lẫn Nhất A, Nhì B, I A, II B, Ba C*...
      const cleanWithoutDecor = clean.replace(/[*#]/g, "").trim();
      const m1 = /^(?:Nhất|I|1)\s*(?:bảng\s*)?([A-Za-z0-9]+)$/i.exec(cleanWithoutDecor);
      const m2 = /^(?:Nhì|II|2)\s*(?:bảng\s*)?([A-Za-z0-9]+)$/i.exec(cleanWithoutDecor);
      const m3 = /^(?:Ba|III|3)\s*(?:bảng\s*)?([A-Za-z0-9]+)$/i.exec(cleanWithoutDecor);
      const m4 = /^(?:Tư|IV|4)\s*(?:bảng\s*)?([A-Za-z0-9]+)$/i.exec(cleanWithoutDecor);

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

      // Xử lý token 3*(1), 3*(2), Ba tốt 1, Ba tốt 2... (Wildcard đội hạng ba có hiệu số trung bình cao nhất)
      const mWildcard3 = /^(?:Ba\s*(?:tốt|xuất sắc)?|3\*?)\s*(?:\(?(\d+)\)?)?$/i.exec(cleanWithoutDecor);
      if (mWildcard3) {
        const wildcardIdx = Math.max(0, parseInt(mWildcard3[1] || "1", 10) - 1);
        const all3rd: Array<{ entryId: string; avgDiff: number; avgPoints: number; pointsFor: number }> = [];
        for (const st of standingsByGroup.values()) {
          if (st && st.length >= 3 && st[2]?.entryId) {
            const row = st[2];
            const played = row.played || (row.win + row.loss + (row.draw || 0));
            all3rd.push({
              entryId: row.entryId,
              avgDiff: played > 0 ? row.diff / played : 0,
              avgPoints: played > 0 ? row.points / played : 0,
              pointsFor: row.pointsFor || 0,
            });
          }
        }
        all3rd.sort((a, b) => {
          if (Math.abs(b.avgDiff - a.avgDiff) > 0.0001) return b.avgDiff - a.avgDiff;
          if (Math.abs(b.avgPoints - a.avgPoints) > 0.0001) return b.avgPoints - a.avgPoints;
          return b.pointsFor - a.pointsFor;
        });
        return all3rd[wildcardIdx]?.entryId ?? null;
      }

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
    } else {
      updated.forEach((m) => {
        if (m.eventId === eventId && m.stage === "ko" && m.round === 1 && m.scoreA === null && m.scoreB === null) {
          if (isRankToken(m.customPlaceholderA)) m.aId = null;
          if (isRankToken(m.customPlaceholderB)) m.bId = null;
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

export const MODE_LABEL: Record<EventMode, string> = {
  don: "Đơn",
  doi: "Đôi",
  dong_doi: "Đồng đội (MLP)",
};
export const BRACKET_LABEL: Record<BracketType, string> = {
  rr: "Vòng tròn",
  rr_ko: "Chia bảng + loại trực tiếp",
};

/* ---------------- Màu bảng & timeline ---------------- */

const GROUP_COLORS = [
  { bg: "#fee2e2", text: "#991b1b", dot: "#dc2626" },
  { bg: "#eff6ff", text: "#1e40af", dot: "#2563eb" },
  { bg: "#f0fdf4", text: "#166534", dot: "#16a34a" },
  { bg: "#fffbeb", text: "#92400e", dot: "#d97706" },
  { bg: "#faf5ff", text: "#6b21a8", dot: "#9333ea" },
  { bg: "#ecfeff", text: "#155e75", dot: "#0891b2" },
  { bg: "#f7fee7", text: "#3f6212", dot: "#65a30d" },
  { bg: "#fdf2f8", text: "#9d174d", dot: "#db2777" },
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

  // Các trận chưa xếp lịch (bỏ qua các trận KO được miễn đấu BYE ở vòng 1)
  const isByeKo = (m: Match) =>
    m.stage === "ko" &&
    (m.customPlaceholderA?.trim().toLowerCase() === "bye" ||
      m.customPlaceholderB?.trim().toLowerCase() === "bye");

  const toSchedule = readyMatches.filter(
    (m) => typeof m.timeSlot !== "number" && !isByeKo(m),
  );

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

  // 1. Xếp các trận vòng bảng theo từng round
  for (const r of groupRounds) {
    const roundMatches = toSchedule.filter((m) => m.stage === "group" && (m.round ?? 1) === r);
    let maxSlotUsedInRound = currentMinSlot;
    let courtIdx = 0;

    for (const m of roundMatches) {
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

  // 2. Xếp tiếp các trận vòng loại trực tiếp (KO) ngay sau vòng bảng
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
    // Trong cùng 1 round KO, xếp trận tranh hạng 3 trước hoặc cùng đợt với chung kết
    const roundMatches = toSchedule
      .filter((m) => m.stage === "ko" && (m.round ?? 1) === r)
      .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
    let maxSlotUsedInRound = currentMinSlot;
    let courtIdx = 0;

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

  return readyMatches;
}
