import { useState, useMemo, useEffect } from "react";
import {
  getDuprLeaderboard,
  getPvnaLeaderboard,
  searchLivePvnaPlayers,
  normalizeVietnamese,
  type RatedPlayer,
} from "@/lib/rating-database";

export type RatingSystemTab = "durp_doi" | "durp_don" | "pvna_doi" | "pvna_don";

interface DuprPvnaLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPlayer?: (player: RatedPlayer, rating: number, type: "dupr" | "pvna") => void;
  targetSlotLabel?: string;
  initialQuery?: string;
}

const TABS: { id: RatingSystemTab; label: string; system: "dupr" | "pvna"; mode: "doi" | "don" }[] = [
  { id: "durp_doi", label: "DURP Đôi", system: "dupr", mode: "doi" },
  { id: "durp_don", label: "DURP Đơn", system: "dupr", mode: "don" },
  { id: "pvna_doi", label: "PVNA Đôi", system: "pvna", mode: "doi" },
  { id: "pvna_don", label: "PVNA Đơn", system: "pvna", mode: "don" },
];

export function DuprPvnaLookupModal({
  isOpen,
  onClose,
  onSelectPlayer,
  targetSlotLabel,
}: DuprPvnaLookupModalProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<RatingSystemTab>("durp_doi");
  const [livePvnaPlayers, setLivePvnaPlayers] = useState<RatedPlayer[]>([]);
  const [isLoadingLive, setIsLoadingLive] = useState(false);

  // Khi modal mở, luôn reset ô tìm kiếm về trống để hiển thị bảng xếp hạng
  useEffect(() => {
    if (isOpen) {
      setQuery("");
    }
  }, [isOpen]);

  const currentTabConfig = useMemo(() => {
    return TABS.find((t) => t.id === activeTab) || TABS[0];
  }, [activeTab]);

  // Tải dữ liệu trực tiếp từ API cho các tab PVNA hoặc khi người dùng nhập tìm kiếm ở bất kỳ tab nào
  useEffect(() => {
    if (!isOpen) {
      setLivePvnaPlayers([]);
      setIsLoadingLive(false);
      return;
    }

    const shouldFetch = currentTabConfig.system === "pvna" || query.trim().length > 0;
    if (!shouldFetch) {
      setLivePvnaPlayers([]);
      setIsLoadingLive(false);
      return;
    }

    let active = true;
    setIsLoadingLive(true);

    const sortBy = currentTabConfig.mode === "doi" ? "doubleScore" : "singleScore";
    const timer = setTimeout(async () => {
      try {
        const live = await searchLivePvnaPlayers(query, sortBy);
        if (active) {
          setLivePvnaPlayers(live);
        }
      } catch (e) {
        console.debug("Lỗi tra cứu trực tiếp:", e);
      } finally {
        if (active) setIsLoadingLive(false);
      }
    }, query.trim() ? 250 : 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, activeTab, query, currentTabConfig.system, currentTabConfig.mode]);

  const getPlayerRatingForTab = (player: RatedPlayer, tab: RatingSystemTab): number => {
    switch (tab) {
      case "durp_doi":
        return player.duprDoubles || player.pvnaDoubles || player.duprSingles || player.pvnaSingles || 3.5;
      case "durp_don":
        return player.duprSingles || player.duprDoubles || player.pvnaSingles || player.pvnaDoubles || 3.5;
      case "pvna_doi":
        return player.pvnaDoubles || player.pvnaSingles || 0;
      case "pvna_don":
        return player.pvnaSingles || player.pvnaDoubles || 0;
    }
  };

  // Danh sách kết quả hiển thị cho Tab hiện tại
  const results = useMemo(() => {
    if (currentTabConfig.system === "dupr") {
      // Hệ thống DURP: Bảng xếp hạng DUPR toàn cầu & Việt Nam (điểm chính xác, không tích)
      const local = getDuprLeaderboard(currentTabConfig.mode, query);
      if (!query.trim()) {
        return local;
      }

      // Khi người dùng tìm kiếm: kết hợp cả danh sách DUPR và kết quả tìm kiếm thời gian thực
      const map = new Map<string, RatedPlayer>();
      for (const p of local) {
        const key = normalizeVietnamese(p.name);
        map.set(key, p);
      }
      for (const p of livePvnaPlayers) {
        const key = normalizeVietnamese(p.name);
        if (!map.has(key)) {
          const dDouble = p.duprDoubles > 0 ? p.duprDoubles : (p.pvnaDoubles > 0 ? p.pvnaDoubles : 3.5);
          const dSingle = p.duprSingles > 0 ? p.duprSingles : (p.pvnaSingles > 0 ? p.pvnaSingles : 3.5);
          map.set(key, {
            ...p,
            duprDoubles: dDouble,
            duprSingles: dSingle,
            isDuprPlayer: true,
          });
        }
      }

      const list = Array.from(map.values());
      list.sort((a, b) => {
        const scoreA = getPlayerRatingForTab(a, activeTab);
        const scoreB = getPlayerRatingForTab(b, activeTab);
        return scoreB - scoreA;
      });
      return list;
    }

    // Hệ thống PVNA: Bảng xếp hạng PVNA Việt Nam chính thức
    // Hợp nhất dữ liệu trực tiếp từ API PVNA và dữ liệu lưu sẵn
    const local = getPvnaLeaderboard(currentTabConfig.mode, query);
    const map = new Map<string, RatedPlayer>();

    // 1. Dữ liệu trực tiếp cập nhật từ PVNA API
    for (const p of livePvnaPlayers) {
      const key = `${normalizeVietnamese(p.name)}_${p.pvnaId || ""}`;
      map.set(key, p);
    }
    // 2. Dữ liệu lưu sẵn nếu chưa có
    for (const p of local) {
      const key = `${normalizeVietnamese(p.name)}_${p.pvnaId || ""}`;
      if (!map.has(key)) {
        map.set(key, p);
      }
    }

    const list = Array.from(map.values());
    // Sắp xếp điểm PVNA giảm dần
    list.sort((a, b) => {
      const scoreA = getPlayerRatingForTab(a, activeTab);
      const scoreB = getPlayerRatingForTab(b, activeTab);
      return scoreB - scoreA;
    });

    return list;
  }, [activeTab, currentTabConfig.system, currentTabConfig.mode, query, livePvnaPlayers]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-line/20 bg-card shadow-2xl overflow-hidden"
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

        {/* 4 Tabs lựa chọn: DURP Đôi, DURP Đơn, PVNA Đôi, PVNA Đơn */}
        <div className="border-b border-line/15 bg-paper/80 p-2">
          <div className="grid grid-cols-4 gap-1.5">
            {TABS.map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(t.id);
                  }}
                  className={`rounded-xl py-2 px-1 text-center text-xs font-bold transition cursor-pointer ${
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
              placeholder="Nhập tên VĐV để tìm kiếm..."
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
        {currentTabConfig.system === "pvna" && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-1.5 bg-secondary/35 border-b border-line/10 text-[10.5px]">
            <span className="font-bold text-ink/80 text-[10.5px]">Chú thích màu tích:</span>
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
        {currentTabConfig.system === "dupr" && (
          <div className="flex items-center justify-between px-3.5 py-1.5 bg-secondary/20 border-b border-line/10 text-[10.5px] text-line/70">
            <span>Đồng bộ từ hệ thống DUPR quốc tế (dashboard.dupr.com)</span>
            <span className="font-semibold text-[#0a3320]">{results.length} VĐV</span>
          </div>
        )}

        {/* Danh sách kết quả / Bảng xếp hạng */}
        <div className="flex-1 overflow-y-auto divide-y divide-line/10 min-h-[260px]">
          {results.length === 0 ? (
            <div className="p-8 text-center text-xs text-line/60">
              <p className="text-xl mb-1 text-line/40">✕</p>
              <p className="font-bold text-ink text-sm">
                {query ? `Không tìm thấy VĐV "${query}"` : "Không có dữ liệu VĐV"}
              </p>
              <p className="mt-1 text-line/50 text-[11px]">
                {query
                  ? "VĐV này không có trong hệ thống dữ liệu."
                  : "Chưa có vận động viên nào trong danh mục này."}
              </p>
            </div>
          ) : (
            results.map((player, idx) => {
              const score = getPlayerRatingForTab(player, activeTab);
              const rank = idx + 1;

              // Xác định màu tích cho PVNA: Vàng, Xanh, hoặc Xám
              const tick =
                activeTab === "pvna_don"
                  ? player.tickColorSingle || player.tickColor || "gray"
                  : player.tickColor || "gray";

              return (
                <div
                  key={player.id || `${player.name}_${idx}`}
                  onClick={() => {
                    if (onSelectPlayer) {
                      onSelectPlayer(player, score, currentTabConfig.system);
                      onClose();
                    }
                  }}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-secondary/50 cursor-pointer transition group"
                >
                  {/* Thứ hạng */}
                  <div className="w-7 text-center shrink-0">
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

                  {/* Tên VĐV & Tích PVNA (DUPR không hiển thị tích theo yêu cầu) */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-ink truncate group-hover:text-[#0a3320]">
                        {player.name}
                      </span>

                      {/* Ở bảng PVNA: hiển thị tích vàng, xanh, hoặc xám theo dữ liệu pvna. Còn DURP không cần tích */}
                      {currentTabConfig.system === "pvna" && (
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
                    {(player.pvnaId || player.province) && (
                      <span className="text-[11px] text-line/55 mt-0.5 truncate">
                        {player.pvnaId && <strong className="font-mono text-line/75 mr-1.5">{player.pvnaId}</strong>}
                        {player.province && <span>{player.province}</span>}
                      </span>
                    )}
                  </div>

                  {/* Điểm tương đương theo Tab đã chọn & Nút chọn */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span
                        className="text-base font-black text-[#0a3320] tabular-nums"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {score.toFixed(3)}
                      </span>
                    </div>

                    {onSelectPlayer && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPlayer(player, score, currentTabConfig.system);
                          onClose();
                        }}
                        className="rounded-lg bg-[#0a3320] group-hover:bg-[#0a3320]/90 text-white px-3 py-1.5 text-xs font-bold shadow-2xs transition cursor-pointer"
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
