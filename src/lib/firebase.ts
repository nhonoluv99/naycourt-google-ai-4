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

export { onAuthStateChanged, type User };
