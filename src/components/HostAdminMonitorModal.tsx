import { useState, useEffect } from "react";
import { toast } from "sonner";
import { fetchAdminMonitoringData, type UserTournamentArchiveItem } from "@/lib/firebase";
import { useTournament, type TournamentState } from "@/lib/tournament-store";

interface HostAdminMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HostAdminMonitorModal({ isOpen, onClose }: HostAdminMonitorModalProps) {
  const { user, loadTournament } = useTournament();
  const [data, setData] = useState<{
    users: any[];
    tournaments: UserTournamentArchiveItem[];
    logs: any[];
  }>({ users: [], tournaments: [], logs: [] });
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"overview" | "users" | "tournaments" | "logs">("overview");

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchAdminMonitoringData();
      setData(res);
    } catch {
      toast.error("Không thể tải dữ liệu theo dõi máy chủ.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-line/20 bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal - chuẩn tone máy chủ #0a3320 */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#0a3320] px-5 py-3.5 text-white">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">🛡️</span>
            <div>
              <h3 className="font-head text-base font-bold tracking-tight text-white flex items-center gap-2">
                Trung tâm Quản trị Máy chủ (Host Admin)
                <span className="text-[10px] bg-amber-500 text-black px-1.5 py-0.5 rounded font-black uppercase">
                  Chủ web
                </span>
              </h3>
              <p className="text-[11px] text-white/75">
                Theo dõi toàn bộ lượt truy cập, tài khoản đã đăng nhập, giải đấu đã tạo & nhật ký hoạt động
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-lg text-white/70 hover:bg-white/15 hover:text-white cursor-pointer transition text-sm"
          >
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div className="border-b border-line/15 bg-paper/70 p-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab("overview")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                tab === "overview" ? "bg-[#0a3320] text-white" : "bg-card text-line/70 hover:bg-secondary"
              }`}
            >
              📊 Tổng quan
            </button>
            <button
              type="button"
              onClick={() => setTab("users")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                tab === "users" ? "bg-[#0a3320] text-white" : "bg-card text-line/70 hover:bg-secondary"
              }`}
            >
              👤 Tài khoản ({data.users.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("tournaments")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                tab === "tournaments" ? "bg-[#0a3320] text-white" : "bg-card text-line/70 hover:bg-secondary"
              }`}
            >
              🏆 Các giải được tạo ({data.tournaments.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("logs")}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                tab === "logs" ? "bg-[#0a3320] text-white" : "bg-card text-line/70 hover:bg-secondary"
              }`}
            >
              📝 Nhật ký hoạt động ({data.logs.length})
            </button>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="rounded-lg border border-line/20 bg-card px-2.5 py-1 text-xs font-semibold text-ink hover:bg-secondary transition cursor-pointer"
          >
            {loading ? "Đang tải..." : "🔄 Làm mới"}
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[360px]">
          {loading ? (
            <div className="py-20 text-center text-xs text-line/60">
              <div className="inline-block size-6 animate-spin rounded-full border-2 border-[#0a3320] border-t-transparent mb-2" />
              <p>Đang đồng bộ dữ liệu thời gian thực từ máy chủ...</p>
            </div>
          ) : tab === "overview" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-line/20 bg-card p-4">
                  <p className="text-xs text-line/60 font-semibold">Tài khoản đăng nhập</p>
                  <p className="font-head text-3xl font-black text-[#0a3320] mt-1">
                    {data.users.length}
                  </p>
                  <p className="text-[11px] text-line/50 mt-1">Các user đã dùng Gmail truy cập</p>
                </div>
                <div className="rounded-xl border border-line/20 bg-card p-4">
                  <p className="text-xs text-line/60 font-semibold">Tổng giải đấu lưu trữ</p>
                  <p className="font-head text-3xl font-black text-amber-600 mt-1">
                    {data.tournaments.length}
                  </p>
                  <p className="text-[11px] text-line/50 mt-1">Các giải đang lưu trên hệ thống</p>
                </div>
                <div className="rounded-xl border border-line/20 bg-card p-4">
                  <p className="text-xs text-line/60 font-semibold">Lượt hoạt động ghi nhận</p>
                  <p className="font-head text-3xl font-black text-blue-600 mt-1">
                    {data.logs.length}
                  </p>
                  <p className="text-[11px] text-line/50 mt-1">Đăng nhập, lưu giải, chỉnh sửa...</p>
                </div>
              </div>

              <div className="rounded-xl border border-line/20 bg-card p-4 space-y-2">
                <h4 className="font-bold text-sm text-ink flex items-center gap-1.5">
                  <span>ℹ️</span> Hướng dẫn theo dõi máy chủ & cơ sở dữ liệu
                </h4>
                <p className="text-xs text-line/70 leading-relaxed">
                  Trang theo dõi này được kết nối trực tiếp với <strong>Firebase Firestore</strong> của bạn.
                  Bất cứ khi nào có người đăng nhập Gmail vào web hoặc tạo giải đấu, thông tin sẽ được tự động ghi nhận tại đây theo thời gian thực.
                </p>
                <div className="rounded-lg bg-secondary/50 p-3 text-xs space-y-1">
                  <p className="font-semibold text-ink">Bạn cũng có thể xem trực tiếp trên Google Cloud / Firebase Console:</p>
                  <p className="text-line/75">
                    • Truy cập: <code className="font-mono bg-paper px-1 rounded">https://console.firebase.google.com</code>
                  </p>
                  <p className="text-line/75">
                    • Chọn dự án: <strong className="font-mono">eco-light-qlxdt</strong>
                  </p>
                  <p className="text-line/75">
                    • Vào mục <strong>Firestore Database</strong>: xem các bảng <code className="font-mono">users</code>, <code className="font-mono">user_tournaments</code>, <code className="font-mono">activity_logs</code>.
                  </p>
                </div>
              </div>
            </div>
          ) : tab === "users" ? (
            <div className="space-y-2">
              {data.users.length === 0 ? (
                <p className="py-12 text-center text-xs text-line/60">Chưa có người dùng nào ghi nhận.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-line/15 bg-card">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-paper border-b border-line/15 font-bold text-line/70">
                      <tr>
                        <th className="p-3">Người dùng</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">User ID</th>
                        <th className="p-3">Lần đăng nhập gần nhất</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/10">
                      {data.users.map((u, i) => (
                        <tr key={u.userId || i} className="hover:bg-secondary/30">
                          <td className="p-3 flex items-center gap-2">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="" className="size-6 rounded-full object-cover" />
                            ) : (
                              <div className="size-6 rounded-full bg-[#0a3320] text-white grid place-items-center text-[10px] font-bold">
                                {(u.displayName || u.email || "U")[0]?.toUpperCase()}
                              </div>
                            )}
                            <span className="font-bold text-ink">{u.displayName || "Chưa đặt tên"}</span>
                          </td>
                          <td className="p-3 font-mono text-line/80">{u.email}</td>
                          <td className="p-3 font-mono text-[11px] text-line/50">{u.userId}</td>
                          <td className="p-3 text-line/70">
                            {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("vi-VN") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : tab === "tournaments" ? (
            <div className="space-y-2">
              {data.tournaments.length === 0 ? (
                <p className="py-12 text-center text-xs text-line/60">Chưa có giải đấu nào trong hệ thống.</p>
              ) : (
                data.tournaments.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line/15 bg-card hover:bg-secondary/40 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-ink truncate">{t.name}</p>
                      <p className="text-[11px] text-line/60 mt-0.5">
                        Tạo bởi: <strong>{t.userEmail || "Ẩn danh"}</strong> ({t.userId}) · {t.courtsCount} sân · {t.eventsCount} nội dung
                      </p>
                      <p className="text-[10px] text-line/45 mt-0.5">
                        Cập nhật: {new Date(t.updatedAt).toLocaleString("vi-VN")}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const parsed: TournamentState = JSON.parse(t.stateJson);
                          loadTournament(parsed);
                          toast.success(`Đã tải giải "${t.name}" vào giao diện!`);
                          onClose();
                        } catch {
                          toast.error("Không thể mở giải.");
                        }
                      }}
                      className="rounded-lg bg-[#0a3320] text-white px-3 py-1.5 text-xs font-bold hover:bg-[#0a3320]/90 transition cursor-pointer shrink-0"
                    >
                      Mở xem giải này
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {data.logs.length === 0 ? (
                <p className="py-12 text-center text-xs text-line/60">Chưa có log hoạt động nào.</p>
              ) : (
                <div className="divide-y divide-line/10 rounded-xl border border-line/15 bg-card overflow-hidden">
                  {data.logs.map((log) => (
                    <div key={log.id} className="p-3 text-xs hover:bg-secondary/30 transition">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#0a3320]">{log.action}</span>
                        <span className="text-[11px] text-line/50 font-mono">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString("vi-VN") : ""}
                        </span>
                      </div>
                      <p className="text-ink mt-0.5">{log.details}</p>
                      <p className="text-[10px] text-line/50 mt-0.5">
                        User: {log.userEmail || log.userId}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
