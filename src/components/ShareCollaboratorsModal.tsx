import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  type Collaborator,
  type CollaboratorRole,
  updateTournamentCollaborators,
} from "@/lib/firebase";
import { useTournament } from "@/lib/tournament-store";

interface ShareCollaboratorsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShareCollaboratorsModal({ isOpen, onClose }: ShareCollaboratorsModalProps) {
  const { state, update, user, activeTournamentId, saveCurrentToArchive } = useTournament();
  const [tab, setTab] = useState<"email" | "qr">("email");
  const [inputEmail, setInputEmail] = useState("");
  const [inputRole, setInputRole] = useState<CollaboratorRole>("editor");
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isPublicLive, setIsPublicLive] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const tournamentId = activeTournamentId || state.id || "tour_temp";
  const publicLiveUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/quan-ly-giai?live=${tournamentId}`
      : "";

  useEffect(() => {
    if (isOpen) {
      setCollaborators(state.collaborators || []);
      setIsPublicLive(state.isPublicLive !== undefined ? state.isPublicLive : true);
    }
  }, [isOpen, state.collaborators, state.isPublicLive]);

  // Sinh mã QR với tone màu đậm chuẩn thương hiệu #093220
  useEffect(() => {
    if (isOpen && publicLiveUrl) {
      QRCode.toDataURL(
        publicLiveUrl,
        {
          width: 320,
          margin: 2,
          color: {
            dark: "#093220",
            light: "#ffffff",
          },
        },
        (err, url) => {
          if (!err && url) {
            setQrDataUrl(url);
          }
        }
      );
    }
  }, [isOpen, publicLiveUrl]);

  if (!isOpen) return null;

  const persistCollaborators = async (
    updatedList: Collaborator[],
    updatedPublic: boolean = isPublicLive
  ) => {
    setIsSaving(true);
    try {
      update({ collaborators: updatedList, isPublicLive: updatedPublic });
      if (activeTournamentId) {
        await updateTournamentCollaborators(activeTournamentId, updatedList, updatedPublic);
      }
      if (user) {
        await saveCurrentToArchive();
      }
    } catch (e) {
      console.error("Lỗi cập nhật phân quyền:", e);
      toast.error("Không thể lưu phân quyền lên hệ thống.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputEmail.trim().toLowerCase();
    if (!clean) return;

    // Kiểm tra định dạng email cơ bản
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clean)) {
      toast.warning("Vui lòng nhập đúng định dạng email (ví dụ: trongtai@gmail.com).");
      return;
    }

    if (user?.email && clean === user.email.toLowerCase()) {
      toast.info("Email này là tài khoản chủ giải hiện tại.");
      return;
    }

    if (collaborators.some((c) => c.email.toLowerCase() === clean)) {
      toast.warning("Email này đã có trong danh sách phân quyền.");
      return;
    }

    const newCollab: Collaborator = {
      email: clean,
      role: inputRole,
      addedAt: new Date().toISOString(),
      addedBy: user?.email || "Chủ giải",
    };

    const updated = [...collaborators, newCollab];
    setCollaborators(updated);
    setInputEmail("");
    await persistCollaborators(updated);
    toast.success(`Đã thêm ${clean} với quyền ${inputRole === "editor" ? "Chỉnh sửa" : "Chỉ xem"}!`);
  };

  const handleChangeRole = async (email: string, newRole: CollaboratorRole) => {
    const updated = collaborators.map((c) => (c.email === email ? { ...c, role: newRole } : c));
    setCollaborators(updated);
    await persistCollaborators(updated);
    toast.success(`Đã đổi quyền của ${email} thành "${newRole === "editor" ? "Chỉnh sửa" : "Chỉ xem"}"`);
  };

  const handleRemoveCollaborator = async (email: string) => {
    const updated = collaborators.filter((c) => c.email !== email);
    setCollaborators(updated);
    await persistCollaborators(updated);
    toast.success(`Đã thu hồi quyền của ${email}.`);
  };

  const handleCopyLink = () => {
    if (!publicLiveUrl) return;
    navigator.clipboard.writeText(publicLiveUrl);
    toast.success("Đã sao chép link xem trực tiếp vào bộ nhớ tạm!");
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `QR_TheoDoi_${(state.name || "Giai_Dau").replace(/\s+/g, "_")}.png`;
    a.click();
    toast.success("Đã tải ảnh mã QR về máy!");
  };

  const handlePrintQr = () => {
    if (!qrDataUrl) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Vui lòng cho phép mở popup để in mã QR.");
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>Mã QR Theo Dõi Giải Đấu - ${state.name || "Pickleball"}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 40px; color: #093220; }
            h1 { font-size: 26px; margin-bottom: 8px; text-transform: uppercase; font-weight: 800; }
            p { font-size: 15px; color: #374151; margin-bottom: 24px; }
            .qr-box { display: inline-block; padding: 20px; border: 4px solid #093220; border-radius: 20px; background: #fff; margin-bottom: 20px; }
            .qr-img { width: 280px; height: 280px; }
            .tip { font-size: 13px; color: #6b7280; margin-top: 10px; }
          </style>
        </head>
        <body>
          <h1>${state.name || "GIẢI ĐẤU PICKLEBALL"}</h1>
          <p>Quét mã QR để xem trực tiếp lịch thi đấu, bảng xếp hạng và tỉ số theo thời gian thực</p>
          <div class="qr-box">
            <img class="qr-img" src="${qrDataUrl}" />
          </div>
          <div class="tip">Không cần cài ứng dụng • Không cần đăng nhập tài khoản</div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-line/20 bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal - tone chuẩn #093220 */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#093220] px-5 py-3.5 text-white">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🤝</span>
            <div>
              <h3 className="font-head text-base font-bold tracking-tight text-white">
                Chia sẻ & Phân quyền giải đấu
              </h3>
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
        <div className="border-b border-line/15 bg-paper/70 p-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab("email")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                tab === "email" ? "bg-[#093220] text-white shadow-xs" : "bg-card text-line/70 hover:bg-secondary"
              }`}
            >
              ✉️ Mời qua Email ({collaborators.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("qr")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                tab === "qr" ? "bg-[#093220] text-white shadow-xs" : "bg-card text-line/70 hover:bg-secondary"
              }`}
            >
              📱 Mã QR & Link xem trực tiếp
            </button>
          </div>
          {isSaving && <span className="text-[11px] text-[#093220] font-bold animate-pulse">Đang lưu...</span>}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === "email" ? (
            <div className="space-y-5">
              {/* Form thêm email */}
              <form onSubmit={handleAddCollaborator} className="rounded-xl border border-line/20 bg-paper/50 p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-head text-xs font-bold uppercase tracking-wider text-[#093220]">
                    Thêm người cùng điều hành hoặc xem
                  </span>
                  <span className="text-[11px] text-line/60">Hỗ trợ tài khoản Gmail</span>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="email"
                    required
                    placeholder="Nhập email người cần thêm (ví dụ: trongtai@gmail.com)"
                    className="field flex-1 !text-xs !py-2"
                    value={inputEmail}
                    onChange={(e) => setInputEmail(e.target.value)}
                  />
                  <select
                    className="field sm:w-44 !text-xs !py-2 font-bold bg-white text-ink"
                    value={inputRole}
                    onChange={(e) => setInputRole(e.target.value as CollaboratorRole)}
                  >
                    <option value="editor">✏️ Có thể chỉnh sửa</option>
                    <option value="viewer">👁️ Chỉ có thể xem</option>
                  </select>
                  <button
                    type="submit"
                    className="btn-accent shrink-0 text-xs !py-2 !px-4 whitespace-nowrap cursor-pointer shadow-xs"
                  >
                    + Thêm quyền
                  </button>
                </div>
                <div className="text-[11px] text-line/65 flex items-start gap-1.5">
                  <span className="text-amber-600 font-bold">💡</span>
                  <span>
                    <strong>Quyền chỉnh sửa:</strong> Được phép nhập điểm, xếp sân, bốc thăm vòng tiếp theo.<br />
                    <strong>Quyền chỉ xem:</strong> Chỉ được theo dõi kết quả, BXH và timeline (khóa các nút sửa).
                  </span>
                </div>
              </form>

              {/* Danh sách người có quyền */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-line/70 px-1">
                  <span>Danh sách người có quyền truy cập</span>
                  <span>{1 + collaborators.length} người</span>
                </div>

                <div className="rounded-xl border border-line/15 divide-y divide-line/10 bg-card overflow-hidden">
                  {/* Chủ giải */}
                  <div className="flex items-center justify-between p-3 text-xs bg-paper/40">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[#093220]/15 text-[#093220] flex items-center justify-center font-bold text-xs shrink-0">
                        👑
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-ink truncate flex items-center gap-1.5">
                          <span>{user?.email || "Chủ giải đấu hiện tại"}</span>
                          <span className="rounded bg-[#093220] text-white text-[9px] font-black px-1.5 py-0.2 uppercase">
                            Chủ giải
                          </span>
                        </div>
                        <span className="text-[10px] text-line/50">Toàn quyền quản trị và phân quyền</span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[#093220] px-2 py-1 rounded bg-[#093220]/10">
                      Chủ sở hữu
                    </span>
                  </div>

                  {/* Danh sách cộng tác viên */}
                  {collaborators.length === 0 ? (
                    <div className="p-6 text-center text-xs text-line/50">
                      Chưa có email nào được cấp quyền. Hãy nhập email ở trên để cùng điều hành giải.
                    </div>
                  ) : (
                    collaborators.map((c) => (
                      <div key={c.email} className="flex items-center justify-between p-3 text-xs hover:bg-paper/30 transition">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-secondary text-line/70 flex items-center justify-center font-bold text-xs shrink-0">
                            {c.email.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-ink truncate block">{c.email}</span>
                            <span className="text-[10px] text-line/50">
                              Được thêm bởi {c.addedBy || "Chủ giải"} • {new Date(c.addedAt).toLocaleDateString("vi-VN")}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            className={`rounded-lg px-2 py-1 text-xs font-bold border transition cursor-pointer ${
                              c.role === "editor"
                                ? "border-amber-500/40 bg-amber-50 text-amber-800"
                                : "border-line/25 bg-card text-line/80"
                            }`}
                            value={c.role}
                            onChange={(e) => handleChangeRole(c.email, e.target.value as CollaboratorRole)}
                          >
                            <option value="editor">✏️ Chỉnh sửa</option>
                            <option value="viewer">👁️ Chỉ xem</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveCollaborator(c.email)}
                            className="p-1 text-line/40 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer transition"
                            title="Xóa quyền truy cập"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Tab 2: Chia sẻ mã QR & Link xem trực tiếp */
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-xs text-[#093220] leading-relaxed">
                <strong>📲 Dành cho khán giả & VĐV:</strong> Người xem chỉ cần mở camera điện thoại quét mã QR bên dưới để xem trực tiếp tỉ số, lịch thi đấu và bảng xếp hạng thời gian thực mà <strong>không cần đăng nhập hay có email</strong>.
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-6 justify-center bg-paper/60 p-5 rounded-2xl border border-line/15">
                {/* Khung hiển thị mã QR */}
                <div className="bg-white p-3 rounded-2xl shadow-md border-2 border-[#093220]/20 flex flex-col items-center">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Mã QR xem trực tiếp giải đấu"
                      className="w-56 h-56 object-contain"
                    />
                  ) : (
                    <div className="w-56 h-56 flex items-center justify-center text-xs text-line/40">
                      Đang tạo mã QR...
                    </div>
                  )}
                  <span className="mt-2 text-[11px] font-head font-bold uppercase tracking-wide text-[#093220]">
                    Quét để xem trực tiếp
                  </span>
                </div>

                {/* Các nút hành động tải / in / copy */}
                <div className="space-y-3 w-full sm:w-64 text-center sm:text-left">
                  <div>
                    <span className="font-head text-xs font-bold uppercase tracking-wider text-line/70 block mb-1">
                      Link theo dõi giải đấu:
                    </span>
                    <div className="flex items-center gap-1.5 bg-card p-1.5 rounded-lg border border-line/20">
                      <input
                        type="text"
                        readOnly
                        value={publicLiveUrl}
                        className="w-full bg-transparent text-[11px] font-mono text-ink outline-hidden truncate"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="btn-accent text-xs !py-2 flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      📋 Sao chép Link
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadQr}
                      className="btn-ghost text-xs !py-2 flex items-center justify-center gap-1.5 rounded-lg border border-line/20 hover:bg-card cursor-pointer"
                    >
                      📥 Tải ảnh mã QR (.png)
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintQr}
                      className="btn-ghost text-xs !py-2 flex items-center justify-center gap-1.5 rounded-lg border border-[#093220]/30 text-[#093220] hover:bg-[#093220]/10 font-bold cursor-pointer"
                    >
                      🖨️ In mã QR dán sân / Standee
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-line/15 bg-paper/60 px-5 py-3 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#093220] hover:bg-[#093220]/90 text-white text-xs font-bold px-4 py-2 cursor-pointer shadow-xs transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
