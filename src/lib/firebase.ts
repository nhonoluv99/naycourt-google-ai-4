import { initializeApp } from "firebase/app";
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

// Khởi tạo Firebase App & Services theo chuẩn Skill
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

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
}

/** Lưu giải đấu vào danh sách lưu trữ vĩnh viễn "Giải đấu của tôi" */
export async function saveTournamentToArchive(
  userId: string,
  userEmail: string | null,
  state: any,
  explicitId?: string
): Promise<string> {
  const tourName = state.name?.trim() || "Giải Pickleball chưa đặt tên";
  // Tạo hoặc dùng lại ID giải đấu
  const tournamentId = explicitId || state.id || `tour_${userId.slice(0, 5)}_${Date.now()}`;
  const path = `user_tournaments/${tournamentId}`;
  try {
    const docRef = doc(db, "user_tournaments", tournamentId);
    const nowIso = new Date().toISOString();
    const payload: UserTournamentArchiveItem = {
      id: tournamentId,
      userId,
      userEmail: userEmail || "",
      name: tourName,
      date: state.date || "",
      courtsCount: state.courts?.length || 1,
      eventsCount: state.events?.length || 1,
      stateJson: JSON.stringify({ ...state, id: tournamentId }),
      createdAt: state.createdAt || nowIso,
      updatedAt: nowIso,
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
    // Sắp xếp giải mới nhất lên đầu
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
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
  try {
    const userRef = doc(db, "users", user.uid);
    await setDoc(
      userRef,
      {
        userId: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        lastLoginAt: new Date().toISOString(),
      },
      { merge: true }
    );

    void recordActivityLog(
      user.uid,
      user.email,
      user.displayName,
      "Đăng nhập",
      `Tài khoản ${user.email} đăng nhập vào web`
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

    const users: any[] = [];
    usersSnap.forEach((d) => users.push(d.data()));

    const tournaments: UserTournamentArchiveItem[] = [];
    toursSnap.forEach((d) => tournaments.push(d.data() as UserTournamentArchiveItem));
    tournaments.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const logs: any[] = [];
    logsSnap.forEach((d) => logs.push(d.data()));
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return { users, tournaments, logs };
  } catch (e) {
    console.error("fetchAdminMonitoringData error:", e);
    return { users: [], tournaments: [], logs: [] };
  }
}

export { onAuthStateChanged, type User };
