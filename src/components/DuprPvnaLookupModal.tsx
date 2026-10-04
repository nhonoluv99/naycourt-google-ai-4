import { useState, useMemo } from "react";
import { searchRatedPlayers, type RatedPlayer } from "@/lib/rating-database";

interface DuprPvnaLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPlayer?: (player: RatedPlayer, rating: number, type: "dupr" | "pvna") => void;
  targetSlotLabel?: string;
  initialQuery?: string;
}

export function DuprPvnaLookupModal({
  isOpen,
  onClose,
  onSelectPlayer,
  targetSlotLabel,
  initialQuery = "",
}: DuprPvnaLookupModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [genderFilter, setGenderFilter] = useState<"all" | "nam" | "nu">("all");

  const results = useMemo(() => {
    return searchRatedPlayers(query, {
      gender: genderFilter === "all" ? undefined : genderFilter,
      limit: 60,
    });
  }, [query, genderFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-line/20 bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal - tone màu #0a3320 */}
        <div className="flex items-center justify-between border-b border-line/10 bg-paper/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[#0a3320] text-white shadow-xs font-bold text-xs">
              LIVE
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-head text-base sm:text-lg font-bold text-[#0a3320] tracking-tight">
                  Tra cứu điểm DURP / PVNA
                </h3>
                <span className="rounded-full bg-[#0a3320]/10 px-2 py-0.5 text-[10px] font-bold text-[#0a3320] flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Đồng bộ DUPR & PVNA
                </span>
              </div>
              <p className="text-xs text-line/60">
                {targetSlotLabel
                  ? `Đang chọn điểm cho: ${targetSlotLabel}`
                  : "Hiển thị song song cả 2 điểm DUPR quốc tế và PVNA Việt Nam của VĐV"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-line/50 hover:bg-line/10 hover:text-ink cursor-pointer transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Search bar & Filter */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-line/40">
                🔍
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nhập tên VĐV (VD: Lý Hoàng Nam, Quang Dương, Tân...), mã ID..."
                autoFocus
                className="w-full rounded-xl border border-line/20 bg-paper py-2.5 pl-9 pr-8 text-sm text-ink placeholder:text-line/40 focus:border-[#0a3320] focus:outline-hidden"
              />
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

            <div className="flex items-center gap-1 bg-paper p-1 rounded-xl border border-line/15 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setGenderFilter("all")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium cursor-pointer transition ${
                  genderFilter === "all"
                    ? "bg-[#0a3320] text-white font-bold"
                    : "text-line/60 hover:text-ink"
                }`}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() => setGenderFilter("nam")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium cursor-pointer transition ${
                  genderFilter === "nam"
                    ? "bg-[#0a3320] text-white font-bold"
                    : "text-line/60 hover:text-ink"
                }`}
              >
                Nam
              </button>
              <button
                type="button"
                onClick={() => setGenderFilter("nu")}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium cursor-pointer transition ${
                  genderFilter === "nu"
                    ? "bg-[#0a3320] text-white font-bold"
                    : "text-line/60 hover:text-ink"
                }`}
              >
                Nữ
              </button>
            </div>
          </div>

          {/* Gợi ý tìm nhanh */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-line/60">
            <span className="font-semibold text-line/70">Tìm nhanh:</span>
            {["Lý Hoàng Nam", "Quang Dương", "Bảo Dương", "Trương Vinh Hiển", "Trịnh Linh Giang", "Sophia Phương Anh", "Nathan Willis", "Huỳnh Chí Khương"].map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setQuery(tag)}
                className="rounded-md bg-secondary/80 px-2 py-0.5 hover:bg-[#0a3320]/10 hover:text-[#0a3320] cursor-pointer transition"
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Results List hiển thị song song CẢ 2 ĐIỂM DUPR VÀ PVNA */}
          <div className="divide-y divide-line/10 rounded-xl border border-line/15 bg-paper/50 overflow-hidden">
            {results.length === 0 ? (
              <div className="p-8 text-center text-xs text-line/60">
                <p className="text-2xl mb-1.5">🔍</p>
                <p className="font-semibold text-ink text-sm">
                  {query ? `Không tìm thấy VĐV "${query}"` : "Nhập tên hoặc mã ID để tra cứu"}
                </p>
                <p className="mt-1 text-line/50">
                  {query
                    ? "VĐV này không có trong hệ thống dữ liệu xếp hạng thực tế của DUPR & PVNA."
                    : "Hệ thống chỉ hiển thị VĐV có thực và điểm thực tế từ DUPR & PVNA."}
                </p>
              </div>
            ) : (
              results.map((player, idx) => (
                <div
                  key={player.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 hover:bg-secondary/40 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 text-center font-head text-xs font-bold text-line/40">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-ink truncate">{player.name}</span>
                        {player.verified && (
                          <span
                            className="inline-flex size-3.5 items-center justify-center rounded-full bg-[#0a3320] text-[9px] text-white font-bold"
                            title="Đã xác thực chính thức"
                          >
                            ✓
                          </span>
                        )}
                        <span className="text-[10px] text-line/50 font-mono">
                          {player.pvnaId}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-line/60">
                        <span>{player.province}</span>
                        <span>•</span>
                        <span>{player.club}</span>
                        <span>•</span>
                        <span>{player.matchesCount} trận</span>
                      </div>
                    </div>
                  </div>

                  {/* Hiển thị song song cả 2 điểm: DUPR và PVNA */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {/* Hộp điểm DUPR */}
                    <div className="text-center rounded-lg border border-blue-500/25 bg-blue-500/5 px-2.5 py-1">
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                        DUPR
                      </span>
                      <span className="font-head text-sm font-black text-blue-900 dark:text-blue-200">
                        {player.duprRating.toFixed(3)}
                      </span>
                    </div>

                    {/* Hộp điểm PVNA */}
                    <div className="text-center rounded-lg border border-amber-500/25 bg-amber-500/5 px-2.5 py-1">
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                        PVNA
                      </span>
                      <span className="font-head text-sm font-black text-amber-900 dark:text-amber-200">
                        {player.pvnaRating.toFixed(3)}
                      </span>
                    </div>

                    {/* Nút chọn điểm áp dụng vào giải đấu */}
                    {onSelectPlayer && (
                      <div className="flex items-center gap-1.5 ml-1">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectPlayer(player, player.duprRating, "dupr");
                            onClose();
                          }}
                          className="rounded-lg bg-[#0a3320] hover:bg-[#0a3320]/90 text-white px-2.5 py-1.5 text-xs font-bold cursor-pointer shadow-2xs transition"
                          title="Lấy điểm DUPR điền vào giải"
                        >
                          Lấy DUPR
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectPlayer(player, player.pvnaRating, "pvna");
                            onClose();
                          }}
                          className="rounded-lg border border-[#0a3320] text-[#0a3320] hover:bg-[#0a3320]/10 px-2.5 py-1.5 text-xs font-bold cursor-pointer transition"
                          title="Lấy điểm PVNA điền vào giải"
                        >
                          Lấy PVNA
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
