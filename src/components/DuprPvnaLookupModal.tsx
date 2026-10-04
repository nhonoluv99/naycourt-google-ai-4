import { useState, useMemo, useEffect } from "react";
import { searchRatedPlayers, searchLivePvnaPlayers, normalizeVietnamese, type RatedPlayer } from "@/lib/rating-database";

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
  initialQuery = "",
}: DuprPvnaLookupModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<RatingSystemTab>("durp_doi");
  const [liveResults, setLiveResults] = useState<RatedPlayer[]>([]);
  const [isSearchingLive, setIsSearchingLive] = useState(false);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  // Tra cứu trực tiếp thời gian thực từ API PVNA khi người dùng gõ
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setLiveResults([]);
      setIsSearchingLive(false);
      return;
    }

    let active = true;
    setIsSearchingLive(true);

    const timer = setTimeout(async () => {
      try {
        const live = await searchLivePvnaPlayers(q);
        if (active) {
          setLiveResults(live);
        }
      } catch (e) {
        console.debug("Live search error:", e);
      } finally {
        if (active) setIsSearchingLive(false);
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  // Hợp nhất dữ liệu có sẵn và dữ liệu trực tiếp từ PVNA
  const results = useMemo(() => {
    const local = searchRatedPlayers(query, { limit: 50 });
    const map = new Map<string, RatedPlayer>();
    
    // Ưu tiên dữ liệu trực tiếp cập nhật từ PVNA
    for (const p of liveResults) {
      const key = `${normalizeVietnamese(p.name)}_${p.pvnaId || ""}`;
      map.set(key, p);
    }
    // Bổ sung dữ liệu lưu sẵn
    for (const p of local) {
      const key = `${normalizeVietnamese(p.name)}_${p.pvnaId || ""}`;
      if (!map.has(key)) {
        map.set(key, p);
      }
    }
    return Array.from(map.values());
  }, [query, liveResults]);

  const currentTabConfig = useMemo(() => {
    return TABS.find((t) => t.id === activeTab) || TABS[0];
  }, [activeTab]);

  const getPlayerRatingForTab = (player: RatedPlayer, tab: RatingSystemTab): number => {
    switch (tab) {
      case "durp_doi":
        return player.duprDoubles;
      case "durp_don":
        return player.duprSingles;
      case "pvna_doi":
        return player.pvnaDoubles;
      case "pvna_don":
        return player.pvnaSingles;
    }
  };

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
        {/* Header Modal - nền chuẩn #0a3320 */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#0a3320] px-5 py-3.5 text-white">
          <div className="flex items-center gap-2.5">
            <h3 className="font-head text-base font-bold tracking-tight text-white">
              DURP/PVNA
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

        {/* 4 Tabs lựa chọn theo đúng yêu cầu: DURP Đôi, DURP Đơn, PVNA Đôi, PVNA Đơn */}
        <div className="border-b border-line/15 bg-paper/80 p-2">
          <div className="grid grid-cols-4 gap-1.5">
            {TABS.map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
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

        {/* Ô tìm kiếm: chỉ ghi "Nhập tên" theo đúng yêu cầu */}
        <div className="p-3 border-b border-line/10 bg-card">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nhập tên"
              autoFocus
              className="w-full rounded-xl border border-line/25 bg-paper py-2.5 pl-3.5 pr-28 text-sm text-ink placeholder:text-line/45 focus:border-[#0a3320] focus:ring-1 focus:ring-[#0a3320] focus:outline-hidden"
            />
            {isSearchingLive && (
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

        {/* Danh sách kết quả: Tối giản, không rườm rà, hiển thị tương đương theo tab được chọn */}
        <div className="flex-1 overflow-y-auto divide-y divide-line/10 min-h-[220px]">
          {results.length === 0 ? (
            <div className="p-8 text-center text-xs text-line/60">
              <p className="text-xl mb-1 text-line/40">✕</p>
              <p className="font-bold text-ink text-sm">
                {query ? `Không tìm thấy VĐV "${query}"` : "Nhập tên VĐV để tìm kiếm"}
              </p>
              <p className="mt-1 text-line/50 text-[11px]">
                {query
                  ? "VĐV này không có trong hệ thống dữ liệu DURP & PVNA."
                  : "Chỉ hiển thị vận động viên có trong hệ thống điểm thực tế."}
              </p>
            </div>
          ) : (
            results.map((player) => {
              const score = getPlayerRatingForTab(player, activeTab);
              return (
                <div
                  key={player.id}
                  onClick={() => {
                    if (onSelectPlayer) {
                      onSelectPlayer(player, score, currentTabConfig.system);
                      onClose();
                    }
                  }}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/50 cursor-pointer transition group"
                >
                  {/* Tên VĐV & Mã định danh / Tỉnh thành */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-ink truncate group-hover:text-[#0a3320]">
                        {player.name}
                      </span>
                      {player.verified && (
                        <span
                          className="inline-flex size-3.5 items-center justify-center rounded-full bg-[#0a3320] text-[8px] text-white font-bold shrink-0"
                          title="Đã xác thực"
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
                      <span className="font-head text-base font-black text-[#0a3320] tabular-nums">
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
