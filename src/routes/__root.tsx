import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { reportLovableError } from "../lib/lovable-error-reporting";
import { TournamentProvider, useTournament } from "../lib/tournament-store";

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
  const { state, user, authLoading, isSyncing, loginWithGoogle, logout, syncNow } = useTournament();
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handleManualSync = async () => {
    try {
      await syncNow();
      toast.success("Đã đồng bộ dữ liệu giải đấu lên đám mây!");
    } catch {
      toast.error("Lỗi khi đồng bộ lên đám mây.");
    }
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
          {state.date ? (
            <span className="text-xs font-semibold text-line/80">
              {state.date}
            </span>
          ) : null}
          <span className="rounded-md bg-[#0a3320] px-2.5 py-1 text-xs font-semibold text-paper">
            {state.courts.length} sân
          </span>

          {/* Nút Logo Gmail / Google tròn gọn gàng chuẩn Ảnh 1 */}
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
                <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-line/15 bg-card p-4 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center gap-3 border-b border-line/10 pb-3">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt=""
                        className="size-10 rounded-full object-cover ring-2 ring-[#0a3320]/30"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="grid size-10 place-items-center rounded-full bg-[#0a3320]/10 text-base font-bold text-[#0a3320]">
                        {(user.displayName || user.email || "U")[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{user.displayName || "Chủ giải đấu"}</p>
                      <p className="truncate text-xs text-line/60">{user.email}</p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between rounded-lg bg-[#0a3320]/10 px-2.5 py-2 text-[#0a3320]">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className="size-2 rounded-full bg-[#0a3320]" />
                        Đồng bộ tự động
                      </span>
                      <span className="text-[11px] font-bold">
                        {isSyncing ? "Đang lưu..." : "Thời gian thực"}
                      </span>
                    </div>

                    <p className="text-[11px] text-line/60 leading-normal">
                      ☁️ Dữ liệu giải đấu được tự động đồng bộ theo thời gian thực. Khi đổi máy tính/điện thoại, bạn chỉ cần đăng nhập cùng tài khoản Gmail này là toàn bộ giải đấu sẽ hiển thị đầy đủ!
                    </p>

                    <div className="pt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleManualSync}
                        disabled={isSyncing}
                        className="flex-1 rounded-lg border border-line/20 bg-paper py-2 text-xs font-semibold text-ink hover:bg-secondary transition cursor-pointer"
                      >
                        {isSyncing ? "Đang lưu..." : "🔄 Đồng bộ ngay"}
                      </button>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-500/20 transition cursor-pointer"
                      >
                        Đăng xuất
                      </button>
                    </div>
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
              <svg className="size-5 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.41 7.33 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.59 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
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
