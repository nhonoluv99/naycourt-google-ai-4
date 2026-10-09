import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { reportLovableError } from "../lib/lovable-error-reporting";
import { TournamentProvider, useTournament } from "../lib/tournament-store";
import { MyTournamentsModal } from "../components/MyTournamentsModal";
import { HostAdminMonitorModal } from "../components/HostAdminMonitorModal";
import { UnsavedConfirmDialog } from "../components/UnsavedConfirmDialog";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="max-w-md text-center">
        <h1 className="font-head text-7xl font-bold uppercase tracking-tighter text-ink">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-ink">Không tìm thấy trang</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Trang bạn tìm không tồn tại hoặc đã được chuyển đi.
        </p>
        <div className="mt-6">
          <Link to="/" className="btn-accent">
            Về trang tạo giải
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="max-w-md text-center">
        <h1 className="font-head text-xl font-bold uppercase tracking-tight text-ink">
          Trang không tải được
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Bạn có thể thử lại hoặc quay về đầu.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="btn-accent"
          >
            Thử lại
          </button>
          <a href="/" className="btn-ghost">
            Về trang chủ
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const NAV = [
  { to: "/", label: "Tạo giải" },
  { to: "/noi-dung", label: "Nội dung" },
  { to: "/van-dong-vien", label: "Danh sách VĐV" },
  { to: "/quan-ly-giai", label: "Quản lý giải" },
] as const;

function Header({ isWide }: { isWide: boolean }) {
  const {
    state,
    user,
    authLoading,
    isSyncing,
    loginWithGoogle,
    logout,
    syncNow,
    createNewTournament,
    saveCurrentToArchive,
    discardChanges,
    hasUnsavedChanges,
  } = useTournament();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [myTournamentsOpen, setMyTournamentsOpen] = useState(false);
  const [hostAdminOpen, setHostAdminOpen] = useState(false);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isServerHost = Boolean(user && user.email === "nhonoluv99@gmail.com");

  // Bảo vệ cảnh báo khi tắt trang/reload nếu có thay đổi chưa lưu
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [profileOpen]);

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
      toast.success("Đăng nhập thành công! Giải đấu đã được đồng bộ đám mây.");
    } catch {
      toast.error("Không thể đăng nhập tài khoản Google. Vui lòng thử lại.");
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setProfileOpen(false);
      toast.info("Đã đăng xuất tài khoản.");
    } catch {
      toast.error("Lỗi khi đăng xuất.");
    }
  };

  const executeCreateNew = async () => {
    try {
      await createNewTournament();
      void navigate({ to: "/" });
      toast.success("Đã tạo giải mới và tự động lưu vào Giải đấu của tôi!");
    } catch {
      toast.error("Lỗi khi tạo giải mới.");
    }
  };

  const handleCreateTournamentClick = () => {
    setProfileOpen(false);
    if (hasUnsavedChanges()) {
      setUnsavedDialogOpen(true);
    } else {
      void executeCreateNew();
    }
  };

  const handleSaveAndCreate = async () => {
    setUnsavedDialogOpen(false);
    try {
      await saveCurrentToArchive();
      toast.success("Đã lưu giải hiện tại!");
    } catch {
      console.error("Lỗi lưu giải trước khi tạo mới");
    }
    await executeCreateNew();
  };

  const handleDiscardAndCreate = async () => {
    setUnsavedDialogOpen(false);
    discardChanges();
    await executeCreateNew();
  };

  return (
    <div className="border-b-4 border-line">
      <div
        className={`mx-auto flex w-full ${
          isWide ? "max-w-[1920px]" : "max-w-5xl"
        } flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8`}
      >
        <Link to="/" className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-accent">
            <span className="font-head text-lg font-bold leading-none text-accent-foreground pl-[3px] h-[17px] flex items-center justify-center">
              P
            </span>
          </div>
          <div className="leading-none">
            <p className="font-['Verdana',sans-serif] italic no-underline text-left leading-[28px] text-[18px] h-[25px] pr-0 ml-0 w-[156.594px] text-[#0a3320] font-bold uppercase tracking-tight">
              Nảy Court
            </p>
            <p className="h-[13px] text-[10px] font-medium uppercase tracking-[0.18em] text-line/60">
              Quản lý giải pickleball
            </p>
          </div>
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              className="rounded-lg px-3 py-2 text-line/70 hover:text-line"
              activeOptions={{ exact: n.to === "/" }}
              activeProps={{ className: "rounded-lg px-3 py-2 bg-line text-paper" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 mr-1">
            {state.date ? (
              <span className="text-xs font-semibold text-line/80">
                {state.date}
              </span>
            ) : null}
            <span className="rounded-md bg-[#0a3320] px-2.5 py-1 text-xs font-semibold text-paper">
              {state.courts.length} sân
            </span>
          </div>

          {/* Nút Logo Gmail bên phải gọn gàng chuẩn Ảnh 1 */}
          {authLoading ? (
            <div className="size-8 animate-pulse rounded-full bg-line/10" />
          ) : user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((prev) => !prev)}
                className="grid size-8 place-items-center rounded-full border border-line/25 bg-card hover:border-line/50 transition cursor-pointer shadow-2xs"
                title={`Đã đăng nhập: ${user.email} (Đang tự động đồng bộ)`}
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="size-7 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="grid size-7 place-items-center rounded-full bg-[#0a3320] text-xs font-bold text-white">
                    {(user.displayName || user.email || "G")[0]?.toUpperCase()}
                  </div>
                )}
              </button>

              {profileOpen && (
                <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-52 max-w-[calc(100vw-24px)] rounded-2xl border border-line/15 bg-card p-2 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={handleCreateTournamentClick}
                      className="w-full rounded-xl px-3 py-2 text-xs font-bold text-ink hover:bg-secondary transition cursor-pointer text-left"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      Tạo giải
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        setMyTournamentsOpen(true);
                      }}
                      className="w-full rounded-xl px-3 py-2 text-xs font-bold text-ink hover:bg-secondary transition cursor-pointer text-left border-t border-line/10"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      Giải đấu của tôi
                    </button>

                    {isServerHost && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          setHostAdminOpen(true);
                        }}
                        className="w-full rounded-xl px-3 py-2 text-xs font-bold text-[#0a3320] hover:bg-[#0a3320]/10 transition cursor-pointer text-left border-t border-line/10"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        Quản trị máy chủ
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full rounded-xl px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-500/10 transition cursor-pointer text-left border-t border-line/10"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      Đăng xuất
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLogin}
              className="grid size-8 place-items-center rounded-full border border-line/25 bg-card hover:border-line/50 hover:bg-secondary transition cursor-pointer shadow-2xs group"
              title="Đăng nhập Gmail để tự động đồng bộ giải đấu giữa các thiết bị"
            >
              <svg className="size-5 transition-transform group-hover:scale-110" viewBox="0 0 48 48">
                <path fill="#4caf50" d="M45,16.2l-5,2.75l-5,4.75L35,40h7c1.657,0,3-1.343,3-3V16.2z"/>
                <path fill="#1e88e5" d="M3,16.2l3.614,1.71L13,23.7V40H6c-1.657,0-3-1.343-3-3V16.2z"/>
                <polygon fill="#e53935" points="35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17"/>
                <path fill="#c62828" d="M3,12.298V16.2l10,7.5V11.2L8.685,7.964C7.039,6.729,4.685,7.915,4.685,9.974L3,12.298z"/>
                <path fill="#fbc02d" d="M45,12.298V16.2l-10,7.5V11.2l4.315-3.236c1.646-1.235,4-0.049,4,2.01L45,12.298z"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Modal Giải đấu của tôi */}
      <MyTournamentsModal
        isOpen={myTournamentsOpen}
        onClose={() => setMyTournamentsOpen(false)}
      />

      {/* Modal Quản trị máy chủ dành cho host */}
      <HostAdminMonitorModal
        isOpen={hostAdminOpen}
        onClose={() => setHostAdminOpen(false)}
      />

      {/* Pop-up cảnh báo lưu khi bấm Tạo giải */}
      <UnsavedConfirmDialog
        isOpen={unsavedDialogOpen}
        title="Lưu giải đấu trước khi tạo mới?"
        message="Giải đấu hiện tại có các chỉnh sửa chưa được lưu. Bạn có muốn lưu lại trước khi tạo giải mới không?"
        saveButtonText="Lưu & Tạo mới"
        discardButtonText="Không lưu"
        onSaveAndProceed={handleSaveAndCreate}
        onDiscardAndProceed={handleDiscardAndCreate}
        onCancel={() => setUnsavedDialogOpen(false)}
      />
    </div>
  );
}

function RootContent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isWide = pathname.startsWith("/van-dong-vien") || pathname.startsWith("/quan-ly-giai");
  const containerClass = isWide
    ? "mx-auto w-full max-w-[1920px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
    : "mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10";

  return (
    <div className="min-h-screen bg-paper font-body text-ink">
      <Header isWide={isWide} />
      <div className="courtlines">
        <div className={containerClass}>
          {/* Required: nested routes render here. */}
          <Outlet />
        </div>
        <div
          className={`mx-auto flex w-full items-center gap-2 px-4 pb-8 text-xs font-medium text-line/50 sm:px-6 lg:px-8 ${
            isWide ? "max-w-[1920px]" : "max-w-5xl"
          }`}
        >
          <span className="size-2 shrink-0 rounded-full bg-accent" />
          <span>
            Nảy Court . Hệ thống quản lý điều hành giải chuyên nghiệp, hiện đại, đầy khả ái và
            ngây ngất lòng người...
          </span>
        </div>
      </div>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <TournamentProvider>
        <RootContent />
      </TournamentProvider>
    </QueryClientProvider>
  );
}
