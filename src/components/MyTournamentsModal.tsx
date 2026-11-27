import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  listUserTournaments,
  listSharedTournaments,
  deleteUserTournament,
  deduplicateTournamentArchives,
  type UserTournamentArchiveItem,
} from "@/lib/firebase";
import { useTournament, type TournamentState } from "@/lib/tournament-store";
import { UnsavedConfirmDialog } from "./UnsavedConfirmDialog";

interface MyTournamentsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MyTournamentsModal({ isOpen, onClose }: MyTournamentsModalProps) {
  const {
    user,
    loadTournament,
    hasUnsavedChanges,
    saveCurrentToArchive,
    discardChanges,
    clearActiveTournament,
    activeTournamentId,
  } = useTournament();
  const navigate = useNavigate();

  const [tournaments, setTournaments] = useState<UserTournamentArchiveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Trạng thái modal cảnh báo chưa lưu khi bấm "Chỉnh sửa"
  const [pendingTourToLoad, setPendingTourToLoad] = useState<UserTournamentArchiveItem | null>(null);

  // Trạng thái modal xác nhận xóa giải đấu (thay thế window.confirm để không bao giờ bị chặn)
  const [confirmDeleteTour, setConfirmDeleteTour] = useState<UserTournamentArchiveItem | null>(null);

  const fetchTournaments = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [ownedList, sharedList] = await Promise.all([
        listUserTournaments(user.uid),
        user.email ? listSharedTournaments(user.email) : Promise.resolve([]),
      ]);

      const map = new Map<string, UserTournamentArchiveItem>();
      ownedList.forEach((t) => map.set(t.id, t));
      sharedList.forEach((t) => {
        if (!map.has(t.id)) {
          map.set(t.id, t);
        }
      });

      const combined = deduplicateTournamentArchives(
        Array.from(map.values()),
        user.uid,
        user.email
      );
      setTournaments(combined);
    } catch (e) {
      console.error(e);
      toast.error("Không thể tải danh sách giải đấu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && user) {
      void fetchTournaments();
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const performLoad = (tour: UserTournamentArchiveItem) => {
    try {
      const parsed: TournamentState = JSON.parse(tour.stateJson);
      loadTournament(parsed, tour.id);
      toast.success(`Đã mở giải "${tour.name}"!`);
      setPendingTourToLoad(null);
      onClose();
      const cleanMyEmail = user.email?.toLowerCase().trim() || "";
      const isOwner =
        tour.userId === user.uid ||
        (tour.userEmail && tour.userEmail.toLowerCase().trim() === cleanMyEmail);
      const isEditor =
        isOwner ||
        Boolean(tour.editorEmails?.includes(cleanMyEmail)) ||
        Boolean(
          tour.collaborators?.some(
            (c) => (c.email || "").toLowerCase().trim() === cleanMyEmail && c.role === "editor",
          ),
        );
      if (!isEditor) {
        void navigate({ to: "/quan-ly-giai" });
      }
    } catch {
      toast.error("Không thể mở dữ liệu giải này.");
    }
  };

  const handleEditClick = (tour: UserTournamentArchiveItem) => {
    const cleanMyEmail = user.email?.toLowerCase().trim() || "";
    const isOwner =
      tour.userId === user.uid ||
      (tour.userEmail && tour.userEmail.toLowerCase().trim() === cleanMyEmail);
    const isEditor =
      isOwner ||
      Boolean(tour.editorEmails?.includes(cleanMyEmail)) ||
      Boolean(
        tour.collaborators?.some(
          (c) => (c.email || "").toLowerCase().trim() === cleanMyEmail && c.role === "editor",
        ),
      );

    // Nếu giải này chính là giải đang mở thì đóng modal (và đưa trọng tài/người xem vào trang điều hành nếu đang ở trang khác)
    if (activeTournamentId === tour.id && !hasUnsavedChanges()) {
      onClose();
      if (!isEditor) {
        void navigate({ to: "/quan-ly-giai" });
      }
      return;
    }

    if (hasUnsavedChanges()) {
      setPendingTourToLoad(tour);
    } else {
      performLoad(tour);
    }
  };

  const handleSaveAndLoad = async () => {
    if (!pendingTourToLoad) return;
    try {
      await saveCurrentToArchive();
      toast.success("Đã lưu giải hiện tại!");
      performLoad(pendingTourToLoad);
    } catch {
      toast.error("Lỗi khi lưu giải hiện tại.");
    }
  };

  const executeDelete = async (tour: UserTournamentArchiveItem) => {
    setDeletingId(tour.id);
    try {
      await deleteUserTournament(tour.id, user.uid, tour.name);
      if (activeTournamentId === tour.id) {
        clearActiveTournament();
      }
      toast.success(`Đã xóa giải "${tour.name}".`);
      setTournaments((prev) => prev.filter((t) => t.id !== tour.id));
      setConfirmDeleteTour(null);
    } catch (e) {
      console.error("Lỗi xóa giải:", e);
      toast.error("Không thể xóa giải.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
        onClick={onClose}
      >
        <div
          className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-line/15 bg-white dark:bg-card p-4 sm:p-5 shadow-2xl overflow-hidden space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Modal - Chữ xanh trên nền trắng */}
          <div className="flex items-center justify-between border-b border-line/10 pb-2.5">
            <h3
              className="text-sm font-bold uppercase tracking-wider text-[#0a3320]"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Giải đấu của tôi
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-line/50 hover:text-ink cursor-pointer transition px-1"
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>

          {/* Danh sách các giải - Từng giải trong ô viền xanh bo góc nền trắng */}
          <div className="flex-1 overflow-y-auto space-y-2.5 min-h-[180px] pr-0.5">
            {loading ? (
              <div className="py-12 text-center text-xs text-line/60">
                <div className="inline-block size-6 animate-spin rounded-full border-2 border-[#0a3320] border-t-transparent mb-2" />
                <p>Đang tải danh sách giải đấu...</p>
              </div>
            ) : tournaments.length === 0 ? (
              <div className="py-12 px-4 text-center text-xs text-line/60">
                <p
                  className="font-bold text-ink text-sm"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Chưa có giải đấu nào trong danh sách
                </p>
                <p className="mt-1 text-line/50 text-[11px]">
                  Khi bạn bấm &quot;Tạo giải&quot;, giải đấu sẽ được tự động lưu vào đây.
                </p>
              </div>
            ) : (
              tournaments.map((tour) => {
                const isCurrent = activeTournamentId === tour.id;
                const cleanMyEmail = user.email?.toLowerCase().trim() || "";
                const isOwner = tour.userId === user.uid || (tour.userEmail && tour.userEmail.toLowerCase().trim() === cleanMyEmail);
                const isEditor =
                  isOwner ||
                  Boolean(tour.editorEmails?.includes(cleanMyEmail)) ||
                  Boolean(
                    tour.collaborators?.some(
                      (c) => (c.email || "").toLowerCase().trim() === cleanMyEmail && c.role === "editor",
                    ),
                  );
                const isReferee =
                  !isOwner &&
                  !isEditor &&
                  (Boolean(tour.refereeEmails?.includes(cleanMyEmail)) ||
                    Boolean(
                      tour.collaborators?.some(
                        (c) => (c.email || "").toLowerCase().trim() === cleanMyEmail && c.role === "referee",
                      ),
                    ));
                const isViewer = !isOwner && !isEditor && !isReferee;

                const topMetaParts: string[] = [];
                if (tour.date) topMetaParts.push(tour.date);
                topMetaParts.push(`${tour.eventsCount} nội dung`);
                const updatedText = tour.updatedAt
                  ? new Date(tour.updatedAt).toLocaleDateString("vi-VN")
                  : "";

                return (
                  <div
                    key={tour.id}
                    className={`rounded-xl border px-3.5 py-2.5 transition ${
                      isCurrent
                        ? "border-[#0a3320] bg-[#0a3320]/[0.04]"
                        : "border-[#0a3320]/30 bg-white dark:bg-card hover:border-[#0a3320]/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p
                            className="font-bold text-sm text-ink truncate"
                            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                          >
                            {tour.name}
                          </p>
                          {isCurrent && (
                            <span className="text-[11px] font-bold text-[#0a3320]">
                              • Đang mở
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-line/65 truncate">
                          {topMetaParts.join(" • ")}
                        </p>
                        {tour.userEmail && (
                          <p className="mt-0.5 text-[11px] text-line/60 truncate">
                            Tạo bởi: {tour.userEmail}
                          </p>
                        )}
                        {updatedText && (
                          <p className="mt-0.5 text-[11px] text-line/50 truncate">
                            Ngày cập nhật: {updatedText}
                          </p>
                        )}
                      </div>

                      <span className="shrink-0 text-[11px] font-bold text-[#0a3320] pt-0.5">
                        {isOwner
                          ? "👑 Admin"
                          : isEditor
                            ? "✏️ Điều hành"
                            : isReferee
                              ? "⚖️ Trọng tài"
                              : "👁️ Xem"}
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-center justify-end gap-2">
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteTour(tour)}
                          disabled={deletingId === tour.id}
                          className="rounded-lg border border-red-500/25 bg-white px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 transition cursor-pointer"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                          title="Xóa giải này"
                        >
                          {deletingId === tour.id ? "..." : "Xóa"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleEditClick(tour)}
                        className="rounded-lg border border-[#0a3320]/35 bg-white px-3 py-1 text-[11px] font-bold text-[#0a3320] hover:bg-[#0a3320] hover:text-white transition cursor-pointer"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        title={
                          isReferee
                            ? "Vào màn hình trọng tài chấm điểm"
                            : isViewer
                              ? "Xem thông tin & diễn biến giải đấu"
                              : "Chỉnh sửa giải đấu này"
                        }
                      >
                        {isReferee ? "⚖️ Vào chấm điểm" : isViewer ? "👁️ Xem giải" : "Chỉnh sửa"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Pop-up cảnh báo lưu khi bấm Chỉnh sửa */}
      <UnsavedConfirmDialog
        isOpen={Boolean(pendingTourToLoad)}
        title="Lưu thay đổi trước khi chuyển giải?"
        message={`Giải đấu hiện tại có các thay đổi chưa được lưu. Bạn có muốn lưu lại trước khi chỉnh sửa giải "${pendingTourToLoad?.name || ""}" không?`}
        saveButtonText="Lưu & Mở giải"
        discardButtonText="Không lưu"
        onSaveAndProceed={handleSaveAndLoad}
        onDiscardAndProceed={() => {
          discardChanges();
          if (pendingTourToLoad) performLoad(pendingTourToLoad);
        }}
        onCancel={() => setPendingTourToLoad(null)}
      />

      {/* Modal xác nhận xóa vĩnh viễn giải đấu */}
      {confirmDeleteTour && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setConfirmDeleteTour(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line/20 bg-card p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-600">
              <span className="grid size-10 place-items-center rounded-xl bg-red-500/15 text-lg font-bold">
                ⚠️
              </span>
              <div>
                <h4
                  className="font-bold text-base text-ink"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Xác nhận xóa giải đấu
                </h4>
                <p className="text-xs text-line/60">Hành động này không thể hoàn tác</p>
              </div>
            </div>

            <p className="text-xs text-line/80 leading-relaxed">
              Bạn có chắc chắn muốn xóa vĩnh viễn giải đấu{" "}
              <strong className="text-ink">&quot;{confirmDeleteTour.name}&quot;</strong> khỏi danh sách lưu trữ? Toàn bộ dữ liệu của giải sẽ bị xóa.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line/10">
              <button
                type="button"
                onClick={() => setConfirmDeleteTour(null)}
                className="rounded-xl border border-line/20 bg-secondary/50 px-4 py-2 text-xs font-semibold text-line/80 hover:bg-secondary cursor-pointer transition"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => executeDelete(confirmDeleteTour)}
                disabled={Boolean(deletingId)}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 cursor-pointer transition shadow-sm"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {deletingId ? "Đang xóa..." : "Xóa vĩnh viễn"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
