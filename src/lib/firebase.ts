import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";
import youtubeFirebaseConfig from "../../firebase-youtube-config.json";

// Khởi tạo Firebase App & Services theo chuẩn Skill (cơ sở dữ liệu giải đấu chính)
const app = getApps().find((a) => a.name === "[DEFAULT]") || initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// App Firebase tách biệt cho kết nối kênh YouTube để không ghi đè tài khoản Admin quản lý giải đấu
const youtubeApp =
  getApps().find((a) => a.name === "youtube-oauth") ||
  initializeApp(youtubeFirebaseConfig, "youtube-oauth");
const youtubeAuth = getAuth(youtubeApp);

export const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"];
export const youtubeProvider = new GoogleAuthProvider();
for (const scope of YOUTUBE_SCOPES) {
  youtubeProvider.addScope(scope);
}

// Lưu YouTube access token chỉ trong bộ nhớ RAM (không lưu localStorage/sessionStorage)
let cachedYouTubeAccessToken: string | null = null;
let cachedYouTubeUser: {
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
} | null = null;

if (typeof window !== "undefined") {
  onAuthStateChanged(youtubeAuth, (user) => {
    if (!user) {
      cachedYouTubeAccessToken = null;
      cachedYouTubeUser = null;
    }
  });
}

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Kiểm tra kết nối Firestore khi khởi động (theo Skill constraint)
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Firebase client is currently offline.");
    }
  }
}
if (typeof window !== "undefined") {
  void testConnection();
}

/** Đăng nhập bằng Gmail (Google Sign-In popup) */
export async function signInWithGoogle(): Promise<User> {
  try {
    googleProvider.setCustomParameters({ prompt: "select_account" });
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err: unknown) {
    console.error("Lỗi đăng nhập Google:", err);
    throw err;
  }
}

/** Đăng xuất Google */
export async function logOutGoogle(): Promise<void> {
  await signOut(auth);
}

/** Kết nối tài khoản YouTube qua Google Auth (token giữ trong bộ nhớ RAM) */
export async function connectYouTubeAccount(): Promise<{
  accessToken: string;
  user: User;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}> {
  youtubeProvider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(youtubeAuth, youtubeProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error("Không lấy được quyền truy cập YouTube từ Google.");
  }
  cachedYouTubeAccessToken = credential.accessToken;
  cachedYouTubeUser = {
    email: result.user.email,
    displayName: result.user.displayName,
    photoURL: result.user.photoURL,
  };
  return {
    accessToken: credential.accessToken,
    user: result.user,
    ...cachedYouTubeUser,
  };
}

export function getYouTubeAccessToken(): string | null {
  return cachedYouTubeAccessToken;
}

export function getConnectedYouTubeUser() {
  return cachedYouTubeUser;
}

export function disconnectYouTubeAccount(): void {
  cachedYouTubeAccessToken = null;
  cachedYouTubeUser = null;
  void signOut(youtubeAuth).catch(() => {});
}

/** Lưu dữ liệu giải đấu lên Firestore */
export async function syncTournamentToCloud(
  userId: string,
  userEmail: string | null,
  state: any
): Promise<void> {
  const path = `tournaments/${userId}`;
  try {
    const docRef = doc(db, "tournaments", userId);
    await setDoc(
      docRef,
      {
        userId,
        userEmail: userEmail || "",
        stateJson: JSON.stringify(state),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/** Tải dữ liệu giải đấu từ Firestore */
export async function fetchTournamentFromCloud(userId: string): Promise<any | null> {
  const path = `tournaments/${userId}`;
  try {
    const docRef = doc(db, "tournaments", userId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    if (data?.stateJson) {
      return JSON.parse(data.stateJson);
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/** Lắng nghe dữ liệu giải đấu thời gian thực */
export function subscribeToTournamentCloud(
  userId: string,
  onData: (state: any) => void
): () => void {
  const path = `tournaments/${userId}`;
  const docRef = doc(db, "tournaments", userId);
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data?.stateJson) {
          try {
            onData(JSON.parse(data.stateJson));
          } catch (e) {
            console.error("Lỗi parse dữ liệu giải từ Firestore:", e);
          }
        }
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export type CollaboratorRole = "editor" | "viewer" | "referee";

export interface Collaborator {
  email?: string;
  role: CollaboratorRole;
  name?: string;
  refToken?: string;
  addedAt: string;
  addedBy?: string;
}

export interface UserTournamentArchiveItem {
  id: string;
  userId: string;
  userEmail: string;
  name: string;
  date: string;
  courtsCount: number;
  eventsCount: number;
  stateJson: string;
  createdAt: string;
  updatedAt: string;
  collaborators?: Collaborator[];
  collaboratorEmails?: string[];
  editorEmails?: string[];
  refereeEmails?: string[];
  isPublicLive?: boolean;
}

/** Lưu giải đấu vào danh sách lưu trữ vĩnh viễn "Giải đấu của tôi" */
export async function saveTournamentToArchive(
  userId: string,
  userEmail: string | null,
  state: any,
  explicitId?: string
): Promise<string> {
  const tourName = state.name?.trim() || "Giải Pickleball chưa đặt tên";
  const tournamentId = explicitId || state.id || `tour_${userId.slice(0, 5)}_${Date.now()}`;
  const path = `user_tournaments/${tournamentId}`;
  try {
    const docRef = doc(db, "user_tournaments", tournamentId);
    const nowIso = new Date().toISOString();

    const existingSnap = await getDoc(docRef).catch(() => null);
    const existingData = existingSnap?.exists() ? existingSnap.data() : null;

    const collaborators: Collaborator[] = state.collaborators || existingData?.collaborators || [];
    const isPublicLive: boolean =
      state.isPublicLive !== undefined ? state.isPublicLive : (existingData?.isPublicLive ?? true);
    const collaboratorEmails = collaborators
      .map((c: Collaborator) => (c.email || "").toLowerCase().trim())
      .filter(Boolean);
    const editorEmails = collaborators
      .filter((c: Collaborator) => c.role === "editor")
      .map((c: Collaborator) => (c.email || "").toLowerCase().trim())
      .filter(Boolean);
    const refereeEmails = collaborators
      .filter((c: Collaborator) => c.role === "referee")
      .map((c: Collaborator) => (c.email || "").toLowerCase().trim())
      .filter(Boolean);

    const payload: UserTournamentArchiveItem = {
      id: tournamentId,
      userId: existingData?.userId || userId,
      userEmail: existingData?.userEmail || userEmail || "",
      name: tourName,
      date: state.date || "",
      courtsCount: state.courts?.length || 1,
      eventsCount: state.events?.length || 1,
      stateJson: JSON.stringify({ ...state, id: tournamentId, collaborators, isPublicLive }),
      createdAt: state.createdAt || existingData?.createdAt || nowIso,
      updatedAt: nowIso,
      collaborators,
      collaboratorEmails,
      editorEmails,
      refereeEmails,
      isPublicLive,
    };
    await setDoc(docRef, payload, { merge: true });
    
    // Ghi log hoạt động
    void recordActivityLog(
      userId,
      userEmail,
      state.name,
      "Lưu giải đấu",
      `Đã lưu/cập nhật giải "${tourName}" (${payload.eventsCount} nội dung, ${payload.courtsCount} sân)`
    );

    return tournamentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return tournamentId;
  }
}

/** Cập nhật quyền cộng tác viên & trạng thái chia sẻ QR cho giải đấu */
export async function updateTournamentCollaborators(
  tournamentId: string,
  collaborators: Collaborator[],
  isPublicLive: boolean = true
): Promise<void> {
  const path = `user_tournaments/${tournamentId}`;
  try {
    const docRef = doc(db, "user_tournaments", tournamentId);
    const collaboratorEmails = collaborators
      .map((c) => (c.email || "").toLowerCase().trim())
      .filter(Boolean);
    const editorEmails = collaborators
      .filter((c) => c.role === "editor")
      .map((c) => (c.email || "").toLowerCase().trim())
      .filter(Boolean);
    const refereeEmails = collaborators
      .filter((c) => c.role === "referee")
      .map((c) => (c.email || "").toLowerCase().trim())
      .filter(Boolean);

    await setDoc(
      docRef,
      {
        collaborators,
        collaboratorEmails,
        editorEmails,
        refereeEmails,
        isPublicLive,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/** Tải danh sách tất cả các giải từng tạo của user ("Giải đấu của tôi") */
export async function listUserTournaments(userId: string): Promise<UserTournamentArchiveItem[]> {
  const path = "user_tournaments";
  try {
    const q = query(collection(db, "user_tournaments"), where("userId", "==", userId));
    const snap = await getDocs(q);
    const list: UserTournamentArchiveItem[] = [];
    snap.forEach((d) => {
      list.push(d.data() as UserTournamentArchiveItem);
    });
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

/** Tải danh sách các giải đấu mà user được mời làm cộng tác viên (chia sẻ) */
export async function listSharedTournaments(userEmail: string): Promise<UserTournamentArchiveItem[]> {
  if (!userEmail) return [];
  const path = "user_tournaments";
  try {
    const cleanEmail = userEmail.toLowerCase().trim();
    const q = query(
      collection(db, "user_tournaments"),
      where("collaboratorEmails", "array-contains", cleanEmail)
    );
    const snap = await getDocs(q);
    const list: UserTournamentArchiveItem[] = [];
    snap.forEach((d) => {
      list.push(d.data() as UserTournamentArchiveItem);
    });
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

/**
 * Loại bỏ các bản lưu trùng lặp của cùng một giải đấu (giữ lại bản cập nhật mới nhất).
 * So khớp theo cấu trúc event/entry ID (cùng chủ giải) và theo (chủ giải, tên giải, ngày) cho giải được chia sẻ.
 */
export function deduplicateTournamentArchives(
  items: UserTournamentArchiveItem[],
  currentUserUid?: string,
  currentUserEmail?: string | null
): UserTournamentArchiveItem[] {
  const sorted = [...items].sort(
    (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
  );
  const cleanMyEmail = (currentUserEmail || "").toLowerCase().trim();
  const kept: Array<{
    item: UserTournamentArchiveItem;
    ownerKey: string;
    nameKey: string;
    dateKey: string;
    structuralIds: Set<string>;
  }> = [];

  for (const item of sorted) {
    const ownerEmail = (item.userEmail || "").toLowerCase().trim();
    const ownerKey = ownerEmail || item.userId || "";
    const nameKey = (item.name || "").trim().toLowerCase();
    const dateKey = (item.date || "").trim();
    const isOwner =
      Boolean(currentUserUid && item.userId === currentUserUid) ||
      Boolean(cleanMyEmail && ownerEmail && ownerEmail === cleanMyEmail);

    const structuralIds = new Set<string>();
    try {
      if (item.stateJson) {
        const parsed = JSON.parse(item.stateJson) as {
          events?: Array<{ id?: string }>;
          entries?: Array<{ id?: string }>;
        };
        if (Array.isArray(parsed.events)) {
          for (const ev of parsed.events) {
            if (ev?.id) structuralIds.add(`ev:${ev.id}`);
          }
        }
        if (Array.isArray(parsed.entries)) {
          for (const en of parsed.entries) {
            if (en?.id) structuralIds.add(`en:${en.id}`);
          }
        }
      }
    } catch {
      /* ignore malformed stateJson */
    }

    const isDuplicate = kept.some((existing) => {
      if (existing.ownerKey !== ownerKey) return false;
      // 1. Trùng ID nội dung hoặc ID VĐV/cặp đấu => chắc chắn là bản sao của cùng 1 giải
      if (structuralIds.size > 0 && existing.structuralIds.size > 0) {
        for (const sid of structuralIds) {
          if (existing.structuralIds.has(sid)) return true;
        }
      }
      // 2. Với giải được mời / phân công (!isOwner): trùng cùng chủ giải + tên giải + ngày => chỉ giữ bản mới nhất
      if (!isOwner && existing.nameKey === nameKey && existing.dateKey === dateKey) {
        return true;
      }
      return false;
    });

    if (!isDuplicate) {
      kept.push({ item, ownerKey, nameKey, dateKey, structuralIds });
    }
  }

  return kept.map((k) => k.item);
}

/** Tải giải đấu công khai qua link/QR xem trực tiếp (không bắt buộc đăng nhập) */
export async function fetchPublicTournament(tournamentId: string): Promise<UserTournamentArchiveItem | null> {
  const path = `user_tournaments/${tournamentId}`;
  try {
    const docRef = doc(db, "user_tournaments", tournamentId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as UserTournamentArchiveItem;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

/** Lắng nghe giải đấu thời gian thực qua mã QR / Public Live */
export function subscribeToPublicTournament(
  tournamentId: string,
  onData: (item: UserTournamentArchiveItem) => void
): () => void {
  const docRef = doc(db, "user_tournaments", tournamentId);
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        onData(snap.data() as UserTournamentArchiveItem);
      }
    },
    (error) => {
      console.warn("Lỗi live stream giải đấu:", error);
    }
  );
}

/** Xóa một giải đấu khỏi "Giải đấu của tôi" */
export async function deleteUserTournament(tournamentId: string, userId: string, tourName?: string): Promise<void> {
  const path = `user_tournaments/${tournamentId}`;
  try {
    await deleteDoc(doc(db, "user_tournaments", tournamentId));
    void recordActivityLog(
      userId,
      null,
      null,
      "Xóa giải đấu",
      `Đã xóa giải "${tourName || tournamentId}" khỏi lưu trữ`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/** Ghi nhận phiên đăng nhập của người dùng */
export async function recordUserLogin(user: User): Promise<void> {
  if (!user || !user.uid) return;
  try {
    const userRef = doc(db, "users", user.uid);
    const nowIso = new Date().toISOString();
    await setDoc(
      userRef,
      {
        userId: user.uid,
        email: user.email || "",
        displayName: user.displayName || user.email?.split("@")[0] || "Người dùng",
        photoURL: user.photoURL || "",
        lastLoginAt: nowIso,
      },
      { merge: true }
    );

    void recordActivityLog(
      user.uid,
      user.email,
      user.displayName || user.email,
      "Đăng nhập",
      `Tài khoản ${user.email || user.uid} đăng nhập vào hệ thống`
    );
  } catch (e) {
    console.warn("Không thể ghi log đăng nhập:", e);
  }
}

/** Ghi log hoạt động hệ thống */
export async function recordActivityLog(
  userId: string,
  userEmail: string | null,
  userName: string | null,
  action: string,
  details: string
): Promise<void> {
  try {
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const logRef = doc(db, "activity_logs", logId);
    await setDoc(logRef, {
      id: logId,
      userId,
      userEmail: userEmail || "",
      userName: userName || "",
      action,
      details,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // Audit logging should not crash the app
    console.debug("Activity log write failed:", e);
  }
}

/** Lấy toàn bộ danh sách users & logs cho Admin máy chủ (nhonoluv99@gmail.com) */
export async function fetchAdminMonitoringData(): Promise<{
  users: any[];
  tournaments: UserTournamentArchiveItem[];
  logs: any[];
}> {
  try {
    const [usersSnap, toursSnap, logsSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "user_tournaments")),
      getDocs(collection(db, "activity_logs")),
    ]);

    const tournaments: UserTournamentArchiveItem[] = [];
    toursSnap.forEach((d) => tournaments.push(d.data() as UserTournamentArchiveItem));
    tournaments.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const logs: any[] = [];
    logsSnap.forEach((d) => logs.push(d.data()));
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const userMap = new Map<string, any>();
    usersSnap.forEach((d) => {
      const u = d.data();
      const key = u.userId || u.email;
      if (key) userMap.set(key, u);
    });

    // Bổ sung tài khoản từ các giải đấu đã lưu hoặc activity logs nếu chưa có trong collection users
    tournaments.forEach((t) => {
      const key = t.userId || t.userEmail;
      if (key && !userMap.has(key)) {
        userMap.set(key, {
          userId: t.userId,
          email: t.userEmail || "",
          displayName: t.userEmail ? t.userEmail.split("@")[0] : "Người dùng",
          photoURL: "",
          lastLoginAt: t.updatedAt || t.createdAt,
        });
      }
    });

    logs.forEach((l) => {
      const key = l.userId || l.userEmail;
      if (key && !userMap.has(key)) {
        userMap.set(key, {
          userId: l.userId,
          email: l.userEmail || "",
          displayName: l.userName || (l.userEmail ? l.userEmail.split("@")[0] : "Người dùng"),
          photoURL: "",
          lastLoginAt: l.timestamp,
        });
      }
    });

    const users = Array.from(userMap.values());
    users.sort((a, b) => new Date(b.lastLoginAt || 0).getTime() - new Date(a.lastLoginAt || 0).getTime());

    return { users, tournaments, logs };
  } catch (e) {
    console.error("fetchAdminMonitoringData error:", e);
    return { users: [], tournaments: [], logs: [] };
  }
}

export { onAuthStateChanged, type User };
