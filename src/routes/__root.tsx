import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";

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
  const { state } = useTournament();
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
        <div className="flex items-center gap-2">
          {state.date ? (
            <span className="hidden text-xs font-semibold text-line/70 sm:block">
              Ngày thi đấu · {state.date}
            </span>
          ) : null}
          <span className="rounded-md bg-court px-2.5 py-1 text-xs font-semibold text-paper">
            {state.courts.length} sân
          </span>
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
