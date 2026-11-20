import { useState, useMemo, useEffect } from "react";
import {
  getDuprLeaderboard,
  getPvnaLeaderboard,
  searchLivePvnaPlayers,
  searchLiveDuprPlayers,
  normalizeVietnamese,
  type RatedPlayer,
} from "@/lib/rating-database";

export type RatingSystemTab = "dupr" | "pvna";

interface DuprPvnaLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPlayer?: (player: RatedPlayer, rating: number, type: "dupr" | "pvna") => void;
  targetSlotLabel?: string;
  initialQuery?: string;
  eventMode?: "don" | "doi" | "dong_doi";
}

const TABS: { id: RatingSystemTab; label: string }[] = [
  { id: "dupr", label: "DURP" },
  { id: "pvna", label: "PVNA" },
];

function DoublesPeopleIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="7.5" r="3" />
      <path d="M3 18.5c0-3.1 2.7-5 6-5s6 1.9 6 5v.5H3v-.5Z" />
      <circle cx="16.5" cy="8.2" r="2.35" />
      <path d="M15.8 14.1c2.8.35 5.2 1.9 5.2 4.4v.5h-4.3v-.5c0-1.6-.35-3.1-.9-4.4Z" />
    </svg>
  );
}

function SinglesPersonIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="7.5" r="3.4" />
      <path d="M5.5 18.5c0-3.3 2.9-5.3 6.5-5.3s6.5 2 6.5 5.3v.5h-13v-.5Z" />
    </svg>
  );
}

export function DuprPvnaLookupModal({
  isOpen,
  onClose,
  onSelectPlayer,
  targetSlotLabel,
  initialQuery = "",
  eventMode = "doi",
}: DuprPvnaLookupModalProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<RatingSystemTab>("dupr");
  const [livePvnaPlayers, setLivePvnaPlayers] = useState<RatedPlayer[]>([]);
  const [liveDuprPlayers, setLiveDuprPlayers] = useState<RatedPlayer[]>([]);
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [pvnaLiveOk, setPvnaLiveOk] = useState<boolean | null>(null);
  const [duprRequiresAuth, setDuprRequiresAuth] = useState(false);

  // Đồng bộ initialQuery khi mở modal từ ô VĐV cụ thể hoặc reset trống khi mở từ thanh công cụ
  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery || "");
    }
  }, [isOpen, initialQuery]);

  // Tải dữ liệu trực tiếp tách biệt 100% giữa PVNA và DUPR
  useEffect(() => {
    if (!isOpen) {
      setLivePvnaPlayers([]);
      setLiveDuprPlayers([]);
      setIsLoadingLive(false);
      setPvnaLiveOk(null);
      return;
    }

    let active = true;

    if (activeTab === "pvna") {
      setLiveDuprPlayers([]);
      setIsLoadingLive(true);
      const sortBy = eventMode === "don" ? "singleScore" : "doubleScore";
      const timer = setTimeout(async () => {
        try {
          const res = await searchLivePvnaPlayers(query, sortBy);
          if (active) {
            setLivePvnaPlayers(res.players);
            setPvnaLiveOk(res.ok);
          }
        } catch (e) {
          console.debug("Lỗi tra cứu PVNA trực tiếp:", e);
          if (active) setPvnaLiveOk(false);
        } finally {
          if (active) setIsLoadingLive(false);
        }
      }, query.trim() ? 250 : 0);

      return () => {
        active = false;
        clearTimeout(timer);
      };
    }

    // Hệ thống DUPR (tách riêng hoàn toàn khỏi PVNA)
    setLivePvnaPlayers([]);
    setPvnaLiveOk(null);
    if (!query.trim()) {
      setLiveDuprPlayers([]);
      setIsLoadingLive(false);
      return;
    }

    setIsLoadingLive(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchLiveDuprPlayers(query);
        if (active) {
          setLiveDuprPlayers(res.players);
          setDuprRequiresAuth(Boolean(res.requiresAuth));
        }
      } catch (e) {
        console.debug("Lỗi tra cứu DUPR trực tiếp:", e);
      } finally {
        if (active) setIsLoadingLive(false);
      }
    }, 280);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, activeTab, query, eventMode]);

  const getPlayerScores = (player: RatedPlayer, tab: RatingSystemTab) => {
    const doubles = tab === "dupr" ? player.duprDoubles : player.pvnaDoubles;
    const singles = tab === "dupr" ? player.duprSingles : player.pvnaSingles;
    return {
      doubles: doubles > 0 ? doubles : 0,
      singles: singles > 0 ? singles : 0,
    };
  };

  const getPrimaryScoreForEvent = (player: RatedPlayer, tab: RatingSystemTab): number => {
    const { doubles, singles } = getPlayerScores(player, tab);
    if (eventMode === "don") {
      return singles > 0 ? singles : doubles > 0 ? doubles : 3.5;
    }
    return doubles > 0 ? doubles : singles > 0 ? singles : 3.5;
  };

  // Danh sách kết quả hiển thị cho Tab hiện tại (không bao giờ trộn lẫn DUPR & PVNA)
  const results = useMemo(() => {
    if (activeTab === "dupr") {
      const local = getDuprLeaderboard("all", query);
      if (!query.trim() || liveDuprPlayers.length === 0) {
        return local;
      }

      const map = new Map<string, RatedPlayer>();
      for (const p of liveDuprPlayers) {
        const key = (p.duprId || `${normalizeVietnamese(p.name)}_${p.id}`).toLowerCase();
        map.set(key, p);
      }
      for (const p of local) {
        const key = (p.duprId || `${normalizeVietnamese(p.name)}_${p.id}`).toLowerCase();
        if (!map.has(key)) {
          map.set(key, p);
        }
      }

      const list = Array.from(map.values());
      list.sort(
        (a, b) =>
          Math.max(b.duprDoubles, b.duprSingles) - Math.max(a.duprDoubles, a.duprSingles)
      );
      return list;
    }

    // Hệ thống PVNA: Hợp nhất dữ liệu trực tiếp từ API PVNA (ưu tiên) và dữ liệu lưu sẵn
    const local = getPvnaLeaderboard("all", query);
    const map = new Map<string, RatedPlayer>();

    for (const p of livePvnaPlayers) {
      const key = p.pvnaId
        ? `code_${p.pvnaId.toUpperCase()}`
        : `name_${normalizeVietnamese(p.name)}_${normalizeVietnamese(p.nickName || "")}`;
      map.set(key, p);
    }
    for (const p of local) {
      const key = p.pvnaId
        ? `code_${p.pvnaId.toUpperCase()}`
        : `name_${normalizeVietnamese(p.name)}_${normalizeVietnamese(p.nickName || "")}`;
      if (!map.has(key)) {
        map.set(key, p);
      }
    }

    const list = Array.from(map.values());
    list.sort(
      (a, b) =>
        Math.max(b.pvnaDoubles, b.pvnaSingles) - Math.max(a.pvnaDoubles, a.pvnaSingles)
    );
    return list;
  }, [activeTab, query, livePvnaPlayers, liveDuprPlayers]);

  const handleChoosePlayer = (player: RatedPlayer, chosenScore: number) => {
    if (!onSelectPlayer) return;
    const preferredName =
      activeTab === "pvna" && player.nickName?.trim()
        ? player.nickName.trim()
        : player.name;
    onSelectPlayer({ ...player, name: preferredName }, chosenScore, activeTab);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-line/20 bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#0a3320] px-5 py-3.5 text-white">
          <div className="flex items-center gap-2.5">
            <h3
              className="text-base font-bold tracking-tight text-white"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              DURP / PVNA
            </h3>
            {targetSlotLabel && (
              <span className="rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white/90">
                {targetSlotLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-lg text-white/70 hover:bg-white/15 hover:text-white cursor-pointer transition text-sm"
          >
            ✕
          </button>
        </div>

        {/* 2 Tabs lựa chọn: DURP và PVNA */}
        <div className="border-b border-line/15 bg-paper/80 p-2">
          <div className="grid grid-cols-2 gap-2">
            {TABS.map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(t.id);
                  }}
                  className={`rounded-xl py-2.5 px-3 text-center text-xs font-bold tracking-wide transition cursor-pointer ${
                    isActive
                      ? "bg-[#0a3320] text-white shadow-xs"
                      : "bg-card text-line/70 hover:bg-secondary hover:text-ink border border-line/15"
                  }`}
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ô tìm kiếm */}
        <div className="p-3 border-b border-line/10 bg-card">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nhập tên, nickname hoặc mã VĐV..."
              autoFocus
              className="w-full rounded-xl border border-line/25 bg-paper py-2.5 pl-3.5 pr-28 text-sm text-ink placeholder:text-line/45 focus:border-[#0a3320] focus:ring-1 focus:ring-[#0a3320] focus:outline-hidden"
            />
            {isLoadingLive && (
              <span className="absolute right-9 top-1/2 -translate-y-1/2 text-[10px] text-[#0a3320] font-semibold animate-pulse">
                Đang tìm...
              </span>
            )}
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-line/40 hover:text-ink cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Chú thích màu tích PVNA chuẩn theo hệ thống PVNA */}
        {activeTab === "pvna" && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-1.5 bg-secondary/35 border-b border-line/10 text-[10.5px]">
            <span className="font-bold text-ink/80 text-[10.5px]">
              Chú thích màu tích:
              {pvnaLiveOk === false && (
                <span className="ml-1.5 font-medium text-amber-700">(Đang dùng bản nội bộ)</span>
              )}
            </span>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1" title="Tick Xanh – Đã xác thực điểm trình">
                <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] text-white font-black">✓</span>
                <span className="text-[10px] text-line/80 font-medium">Đã xác thực</span>
              </span>
              <span className="inline-flex items-center gap-1" title="Tick Vàng – Đang trong hành trình xác thực">
                <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-amber-400 text-[8px] text-amber-950 font-black">✓</span>
                <span className="text-[10px] text-line/80 font-medium">Đang xác thực</span>
              </span>
              <span className="inline-flex items-center gap-1" title="Tick Đen/Xám – Tài khoản mới">
                <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-slate-500 text-[8px] text-white font-black">✓</span>
                <span className="text-[10px] text-line/80 font-medium">Tài khoản mới</span>
              </span>
            </div>
          </div>
        )}

        {/* Thanh ghi chú DUPR quốc tế */}
        {activeTab === "dupr" && (
          <div className="flex items-center justify-between gap-2 px-3.5 py-1.5 bg-secondary/20 border-b border-line/10 text-[10.5px] text-line/70">
            <span className="truncate">
              {duprRequiresAuth && liveDuprPlayers.length === 0
                ? "Kho DUPR nội bộ (Cổng DUPR quốc tế yêu cầu cấp quyền đối tác để tìm trực tuyến)"
                : "Đồng bộ từ hệ thống DUPR quốc tế (dashboard.dupr.com)"}
            </span>
            <span className="font-semibold text-[#0a3320] shrink-0">{results.length} VĐV</span>
          </div>
        )}

        {/* Danh sách kết quả / Bảng xếp hạng */}
        <div className="flex-1 overflow-y-auto divide-y divide-line/10 min-h-[260px]">
          {results.length === 0 ? (
            <div className="p-8 text-center text-xs text-line/60">
              {isLoadingLive ? (
                <p className="font-semibold text-[#0a3320] text-sm animate-pulse">
                  Đang đồng bộ dữ liệu {activeTab.toUpperCase()}...
                </p>
              ) : (
                <>
                  <p className="text-xl mb-1 text-line/40">✕</p>
                  <p className="font-bold text-ink text-sm">
                    {query ? `Không tìm thấy VĐV "${query}"` : "Không có dữ liệu VĐV"}
                  </p>
                  <p className="mt-1 text-line/50 text-[11px]">
                    {query
                      ? activeTab === "dupr" && duprRequiresAuth
                        ? "Không tìm thấy trong danh sách DUPR nội bộ. Hệ thống DUPR (dupr.com) hiện khóa tìm kiếm công khai cho ứng dụng bên thứ 3 nếu chưa cấp quyền đối tác."
                        : "VĐV này chưa có trong cơ sở dữ liệu hệ thống."
                      : "Chưa có vận động viên nào trong danh mục này."}
                  </p>
                </>
              )}
            </div>
          ) : (
            results.map((player, idx) => {
              const { doubles, singles } = getPlayerScores(player, activeTab);
              const primaryScore = getPrimaryScoreForEvent(player, activeTab);
              const rank = idx + 1;

              const tick =
                player.tickColor && player.tickColor !== "gray"
                  ? player.tickColor
                  : player.tickColorSingle || "gray";

              const hasDistinctNick =
                Boolean(player.nickName?.trim()) &&
                normalizeVietnamese(player.nickName!) !== normalizeVietnamese(player.name);
              const primaryLabel = hasDistinctNick ? player.nickName!.trim() : player.name;
              const secondaryFullName = hasDistinctNick ? player.name : "";
              const codeId = activeTab === "pvna" ? player.pvnaId : player.duprId;

              return (
                <div
                  key={player.id || `${player.name}_${idx}`}
                  onClick={() => handleChoosePlayer(player, primaryScore)}
                  className="flex items-center justify-between gap-2.5 px-3.5 sm:px-4 py-2.5 hover:bg-secondary/50 cursor-pointer transition group"
                >
                  {/* Thứ hạng */}
                  <div className="w-6 sm:w-7 text-center shrink-0">
                    {rank === 1 ? (
                      <span className="inline-grid size-5.5 place-items-center rounded-full bg-amber-500/20 text-amber-700 font-black text-xs">
                        1
                      </span>
                    ) : rank === 2 ? (
                      <span className="inline-grid size-5.5 place-items-center rounded-full bg-slate-300 text-slate-800 font-black text-xs">
                        2
                      </span>
                    ) : rank === 3 ? (
                      <span className="inline-grid size-5.5 place-items-center rounded-full bg-amber-700/20 text-amber-900 font-black text-xs">
                        3
                      </span>
                    ) : (
                      <span className="font-mono text-xs font-bold text-line/40 tabular-nums">
                        {rank}
                      </span>
                    )}
                  </div>

                  {/* Tên VĐV / Nickname & Tích PVNA */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-bold text-sm text-ink truncate group-hover:text-[#0a3320]">
                        {primaryLabel}
                      </span>

                      {secondaryFullName && (
                        <span className="hidden sm:inline text-[11px] text-line/55 truncate">
                          ({secondaryFullName})
                        </span>
                      )}

                      {activeTab === "pvna" && (
                        <span
                          className={`inline-flex size-3.5 items-center justify-center rounded-full text-[8px] font-black shrink-0 shadow-2xs ${
                            tick === "yellow"
                              ? "bg-amber-400 text-amber-950"
                              : tick === "green" || tick === "blue"
                              ? "bg-emerald-500 text-white"
                              : "bg-slate-500 text-white"
                          }`}
                          title={
                            tick === "yellow"
                              ? "Tick Vàng – Đang trong hành trình xác thực"
                              : tick === "green" || tick === "blue"
                              ? "Tick Xanh – Đã xác thực điểm trình"
                              : "Tick Đen (hoặc Tick Xám) – Tài khoản mới"
                          }
                        >
                          ✓
                        </span>
                      )}
                    </div>
                    {secondaryFullName && (
                      <span className="sm:hidden text-[10.5px] text-line/60 truncate">
                        {secondaryFullName}
                      </span>
                    )}
                    {(codeId || player.province) && (
                      <span className="text-[11px] text-line/55 mt-0.5 truncate">
                        {codeId && <strong className="font-mono text-line/75 mr-1.5">{codeId}</strong>}
                        {player.province && <span>{player.province}</span>}
                      </span>
                    )}
                  </div>

                  {/* Điểm Đôi (2 người) và Điểm Đơn (1 người) cạnh nhau */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Ô điểm Đôi */}
                    <button
                      type="button"
                      disabled={!onSelectPlayer || doubles <= 0}
                      onClick={(e) => {
                        if (!onSelectPlayer || doubles <= 0) return;
                        e.stopPropagation();
                        handleChoosePlayer(player, doubles);
                      }}
                      title={doubles > 0 ? `Chọn điểm Đôi: ${doubles.toFixed(3)}` : "Chưa có điểm Đôi (NR)"}
                      className={`min-w-[54px] sm:min-w-[58px] rounded-xl px-2 py-1.5 flex flex-col items-center justify-center gap-0.5 transition ${
                        onSelectPlayer && doubles > 0
                          ? "bg-[#eaecf3] hover:bg-[#dce1ee] text-[#0f1f4b] cursor-pointer"
                          : "bg-[#eaecf3]/85 text-[#0f1f4b]/75 cursor-default"
                      }`}
                    >
                      <DoublesPeopleIcon className="size-4 shrink-0" />
                      <span
                        className="text-[12.5px] font-bold tabular-nums leading-tight"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {doubles > 0 ? doubles.toFixed(3) : "NR"}
                      </span>
                    </button>

                    {/* Ô điểm Đơn */}
                    <button
                      type="button"
                      disabled={!onSelectPlayer || singles <= 0}
                      onClick={(e) => {
                        if (!onSelectPlayer || singles <= 0) return;
                        e.stopPropagation();
                        handleChoosePlayer(player, singles);
                      }}
                      title={singles > 0 ? `Chọn điểm Đơn: ${singles.toFixed(3)}` : "Chưa có điểm Đơn (NR)"}
                      className={`min-w-[54px] sm:min-w-[58px] rounded-xl px-2 py-1.5 flex flex-col items-center justify-center gap-0.5 transition ${
                        onSelectPlayer && singles > 0
                          ? "bg-[#eaecf3] hover:bg-[#dce1ee] text-[#0f1f4b] cursor-pointer"
                          : "bg-[#eaecf3]/85 text-[#0f1f4b]/75 cursor-default"
                      }`}
                    >
                      <SinglesPersonIcon className="size-4 shrink-0" />
                      <span
                        className="text-[12.5px] font-bold tabular-nums leading-tight"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {singles > 0 ? singles.toFixed(3) : "NR"}
                      </span>
                    </button>

                    {onSelectPlayer && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleChoosePlayer(player, primaryScore);
                        }}
                        className="hidden sm:inline-flex rounded-lg bg-[#0a3320] group-hover:bg-[#0a3320]/90 text-white px-2.5 py-1.5 text-xs font-bold shadow-2xs transition cursor-pointer ml-0.5"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        Chọn
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
