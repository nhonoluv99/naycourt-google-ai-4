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
  const { state, update, user, activeTournamentId, saveCurrentToArchive, loginWithGoogle } = useTournament();
  const [tab, setTab] = useState<"email" | "qr">("email");
  const [inputEmail, setInputEmail] = useState("");
  const [inputName, setInputName] = useState("");
  const [inputRole, setInputRole] = useState<CollaboratorRole>("editor");
  const [editingNameEmail, setEditingNameEmail] = useState<string | null>(null);
  const [editingNameVal, setEditingNameVal] = useState("");
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isPublicLive, setIsPublicLive] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  // Chuyển đổi URL nội bộ ais-dev- sang URL công khai ais-pre- để người xem quét mã không bị lỗi Google 403
  const getPublicBaseUrl = () => {
    if (typeof window === "undefined") return "";
    let origin = window.location.origin;
    if (origin.includes("ais-dev-")) {
      origin = origin.replace("ais-dev-", "ais-pre-");
    }
    return origin;
  };

  const tournamentId = activeTournamentId || state.id || "tour_temp";
  const publicBase = getPublicBaseUrl();
  const publicLiveUrl = publicBase
    ? `${publicBase}/#/quan-ly-giai?live=${encodeURIComponent(tournamentId)}`
    : "";

  useEffect(() => {
    if (isOpen) {
      setCollaborators(state.collaborators || []);
      setIsPublicLive(state.isPublicLive !== undefined ? state.isPublicLive : true);
      // Tự động đồng bộ giải đấu lên đám mây khi mở modal để link xem trực tiếp có dữ liệu ngay lập tức
      void saveCurrentToArchive();
    }
  }, [isOpen, state.collaborators, state.isPublicLive, saveCurrentToArchive]);

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
    updatedPublic: boolean = isPublicLive,
    extraPatch?: Partial<typeof state>
  ) => {
    setIsSaving(true);
    try {
      update({ collaborators: updatedList, isPublicLive: updatedPublic, ...(extraPatch || {}) });
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

  const getRoleLabel = (role: CollaboratorRole) => {
    if (role === "editor") return "Chỉnh sửa";
    if (role === "referee") return "Trọng tài";
    return "Chỉ xem";
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

    const cleanRefName =
      inputRole === "referee"
        ? (inputName.trim() || clean.split("@")[0] || clean)
        : undefined;

    const newCollab: Collaborator = {
      email: clean,
      role: inputRole,
      ...(cleanRefName ? { name: cleanRefName } : {}),
      addedAt: new Date().toISOString(),
      addedBy: user?.email || "Chủ giải",
    };

    const updated = [...collaborators, newCollab];
    setCollaborators(updated);
    setInputEmail("");
    setInputName("");

    let extraPatch: Partial<typeof state> | undefined;
    if (cleanRefName) {
      const existingRefs = state.referees || [];
      if (!existingRefs.includes(cleanRefName)) {
        extraPatch = { referees: [...existingRefs, cleanRefName] };
      }
    }

    await persistCollaborators(updated, isPublicLive, extraPatch);
    toast.success(
      cleanRefName
        ? `Đã thêm trọng tài "${cleanRefName}" (${clean})!`
        : `Đã thêm ${clean} với quyền ${getRoleLabel(inputRole)}!`,
    );
  };

  const handleChangeRole = async (email: string, newRole: CollaboratorRole) => {
    let addedRefName: string | undefined;
    const updated = collaborators.map((c) => {
      if (c.email !== email) return c;
      if (newRole === "referee") {
        const refName = c.name?.trim() || c.email.split("@")[0] || c.email;
        addedRefName = refName;
        return { ...c, role: newRole, name: refName };
      }
      return { ...c, role: newRole };
    });
    setCollaborators(updated);

    let extraPatch: Partial<typeof state> | undefined;
    if (addedRefName) {
      const existingRefs = state.referees || [];
      if (!existingRefs.includes(addedRefName)) {
        extraPatch = { referees: [...existingRefs, addedRefName] };
      }
    }

    await persistCollaborators(updated, isPublicLive, extraPatch);
    toast.success(`Đã đổi quyền của ${email} thành "${getRoleLabel(newRole)}"`);
  };

  const handleSaveRefereeName = async (email: string) => {
    const trimmed = editingNameVal.trim();
    if (!trimmed) {
      setEditingNameEmail(null);
      return;
    }
    const target = collaborators.find((c) => c.email === email);
    const oldName = target?.name?.trim() || "";
    const updated = collaborators.map((c) =>
      c.email === email ? { ...c, name: trimmed } : c,
    );
    setCollaborators(updated);
    setEditingNameEmail(null);

    const existingRefs = (state.referees || []).filter((r) => r !== oldName);
    const nextRefs = existingRefs.includes(trimmed) ? existingRefs : [...existingRefs, trimmed];
    const nextMatches = oldName
      ? state.matches.map((m) =>
          (m.referee || "").trim() === oldName ? { ...m, referee: trimmed } : m,
        )
      : state.matches;

    await persistCollaborators(updated, isPublicLive, {
      referees: nextRefs,
      matches: nextMatches,
    });
    toast.success(`Đã cập nhật tên trọng tài thành "${trimmed}".`);
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

  const handleDownloadQr = async () => {
    if (!qrDataUrl) return;
    try {
      const qrImg = new Image();
      qrImg.src = qrDataUrl;
      await new Promise<void>((resolve, reject) => {
        qrImg.onload = () => resolve();
        qrImg.onerror = () => reject(new Error("Failed to load QR image"));
      });

      const W = 1000;
      const padX = 72;
      const maxTextW = W - padX * 2;
      const fontFamily = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

      const measureCanvas = document.createElement("canvas");
      const mCtx = measureCanvas.getContext("2d");
      if (!mCtx) return;

      const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
        const words = text.split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let current = "";
        for (const word of words) {
          const test = current ? `${current} ${word}` : word;
          if (ctx.measureText(test).width <= maxW) {
            current = test;
          } else {
            if (current) lines.push(current);
            current = word;
          }
        }
        if (current) lines.push(current);
        return lines.length > 0 ? lines : [""];
      };

      const titleText = (state.name || "GIẢI ĐẤU PICKLEBALL").trim().toUpperCase();
      const subtitleText =
        "Quét mã QR để xem trực tiếp lịch thi đấu, bảng xếp hạng và tỉ số theo thời gian thực";
      const tipText = "Không cần cài ứng dụng • Không cần đăng nhập tài khoản";
      const brandLine =
        "Nảy Court . Hệ thống quản lý điều hành giải chuyên nghiệp, hiện đại, đầy khả ái và ngây ngất lòng người...";
      const websiteLine = "naycourt.ai.studio";
      const phoneLine = "0929700148";

      mCtx.font = `800 44px ${fontFamily}`;
      const titleLines = wrapText(mCtx, titleText, maxTextW);

      mCtx.font = `400 23px ${fontFamily}`;
      const subtitleLines = wrapText(mCtx, subtitleText, maxTextW);

      mCtx.font = `400 15.5px ${fontFamily}`;
      const brandLines = wrapText(mCtx, brandLine, 760);

      const topPad = 68;
      const titleLineH = 54;
      const subLineH = 32;
      const boxSize = 480;
      const qrSize = 416;
      const boxRadius = 32;
      const bottomPad = 64;

      const totalH =
        topPad +
        titleLines.length * titleLineH +
        14 +
        subtitleLines.length * subLineH +
        38 +
        boxSize +
        34 +
        26 +
        24 +
        brandLines.length * 22 +
        48 +
        bottomPad;

      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = totalH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Nền trắng sạch
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, totalH);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      let y = topPad;

      // Tên giải đấu
      ctx.fillStyle = "#093220";
      ctx.font = `800 44px ${fontFamily}`;
      for (const line of titleLines) {
        ctx.fillText(line, W / 2, y);
        y += titleLineH;
      }

      y += 14;

      // Dòng mô tả quét QR
      ctx.fillStyle = "#374151";
      ctx.font = `400 23px ${fontFamily}`;
      for (const line of subtitleLines) {
        ctx.fillText(line, W / 2, y);
        y += subLineH;
      }

      y += 38;

      // Khung viền bo góc chứa QR
      const boxX = (W - boxSize) / 2;
      const boxY = y;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(boxX + boxRadius, boxY);
      ctx.lineTo(boxX + boxSize - boxRadius, boxY);
      ctx.quadraticCurveTo(boxX + boxSize, boxY, boxX + boxSize, boxY + boxRadius);
      ctx.lineTo(boxX + boxSize, boxY + boxSize - boxRadius);
      ctx.quadraticCurveTo(boxX + boxSize, boxY + boxSize, boxX + boxSize - boxRadius, boxY + boxSize);
      ctx.lineTo(boxX + boxRadius, boxY + boxSize);
      ctx.quadraticCurveTo(boxX, boxY + boxSize, boxX, boxY + boxSize - boxRadius);
      ctx.lineTo(boxX, boxY + boxRadius);
      ctx.quadraticCurveTo(boxX, boxY, boxX + boxRadius, boxY);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#093220";
      ctx.stroke();
      ctx.restore();

      // Ảnh mã QR
      ctx.drawImage(qrImg, boxX + (boxSize - qrSize) / 2, boxY + (boxSize - qrSize) / 2, qrSize, qrSize);
      y += boxSize + 34;

      // Dòng tip chính
      ctx.fillStyle = "#6b7280";
      ctx.font = `400 20px ${fontFamily}`;
      ctx.fillText(tipText, W / 2, y);
      y += 26 + 24;

      // Dòng chữ nhỏ Nảy Court bên dưới
      ctx.fillStyle = "#6b7280";
      ctx.font = `400 15.5px ${fontFamily}`;
      for (const line of brandLines) {
        ctx.fillText(line, W / 2, y);
        y += 22;
      }

      ctx.fillStyle = "#093220";
      ctx.font = `600 15.5px ${fontFamily}`;
      ctx.fillText(websiteLine, W / 2, y + 2);
      ctx.fillText(phoneLine, W / 2, y + 24);

      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `QR_TheoDoi_${(state.name || "Giai_Dau").replace(/\s+/g, "_")}.png`;
      a.click();
      toast.success("Đã tải ảnh mã QR đầy đủ thông tin về máy!");
    } catch (e) {
      console.error("Lỗi tạo ảnh QR:", e);
      const a = document.createElement("a");
      a.href = qrDataUrl;
      a.download = `QR_TheoDoi_${(state.name || "Giai_Dau").replace(/\s+/g, "_")}.png`;
      a.click();
      toast.success("Đã tải ảnh mã QR về máy!");
    }
  };

  const handlePrintQr = () => {
    if (!qrDataUrl) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Vui lòng cho phép mở popup để in mã QR.");
      return;
    }
    const safeTitle = (state.name || "GIẢI ĐẤU PICKLEBALL")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    printWindow.document.write(`
      <html>
        <head>
          <title>Mã QR Theo Dõi Giải Đấu - ${safeTitle}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 40px; color: #093220; }
            h1 { font-size: 26px; margin-bottom: 8px; text-transform: uppercase; font-weight: 800; }
            p { font-size: 15px; color: #374151; margin-bottom: 24px; }
            .qr-box { display: inline-block; padding: 20px; border: 4px solid #093220; border-radius: 20px; background: #fff; margin-bottom: 20px; }
            .qr-img { width: 280px; height: 280px; }
            .tip { font-size: 13px; color: #6b7280; margin-top: 10px; }
            .brand-footer { font-size: 10.5px; color: #6b7280; margin-top: 14px; line-height: 1.55; max-width: 480px; margin-left: auto; margin-right: auto; }
            .brand-contact { font-weight: 600; color: #093220; }
          </style>
        </head>
        <body>
          <h1>${safeTitle}</h1>
          <p>Quét mã QR để xem trực tiếp lịch thi đấu, bảng xếp hạng và tỉ số theo thời gian thực</p>
          <div class="qr-box">
            <img class="qr-img" src="${qrDataUrl}" />
          </div>
          <div class="tip">Không cần cài ứng dụng • Không cần đăng nhập tài khoản</div>
          <div class="brand-footer">
            <div>Nảy Court . Hệ thống quản lý điều hành giải chuyên nghiệp, hiện đại, đầy khả ái và ngây ngất lòng người...</div>
            <div class="brand-contact">naycourt.ai.studio</div>
            <div class="brand-contact">0929700148</div>
          </div>
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
        {/* Header Modal - tone chuẩn #072819 */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#072819] px-5 py-3.5 text-white">
          <h3 className="font-head text-base font-bold tracking-tight text-white">
            Chia sẻ & Phân quyền giải đấu
          </h3>
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
              <form onSubmit={handleAddCollaborator} className="rounded-xl border border-line/20 bg-paper/50 p-4 shadow-2xs space-y-2.5">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="email"
                    required
                    placeholder="Nhập email"
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
                    <option value="referee">⚖️ Trọng tài</option>
                    <option value="viewer">👁️ Chỉ có thể xem</option>
                  </select>
                  <button
                    type="submit"
                    className="btn-accent shrink-0 text-xs !py-2 !px-4 whitespace-nowrap cursor-pointer shadow-xs"
                  >
                    + Thêm quyền
                  </button>
                </div>
                {inputRole === "referee" && (
                  <div className="pt-1">
                    <input
                      type="text"
                      required
                      placeholder="Nhập tên"
                      className="field w-full !text-xs !py-2 bg-white"
                      value={inputName}
                      onChange={(e) => setInputName(e.target.value)}
                    />
                  </div>
                )}
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
                        <div className="font-bold text-ink truncate">
                          <span>{user?.email || "Chủ giải đấu hiện tại"}</span>
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
                    collaborators.map((c) => {
                      const isRef = c.role === "referee";
                      const isEditingThisName = editingNameEmail === c.email;
                      const displayLabel = isRef
                        ? c.name?.trim() || c.email.split("@")[0]
                        : c.email;

                      return (
                        <div key={c.email} className="flex items-center justify-between gap-2 p-3 text-xs hover:bg-paper/30 transition">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                isRef
                                  ? "bg-[#093220]/15 text-[#093220]"
                                  : "bg-secondary text-line/70"
                              }`}
                            >
                              {isRef ? "⚖️" : c.email.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              {isRef && isEditingThisName ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingNameVal}
                                    onChange={(e) => setEditingNameVal(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        void handleSaveRefereeName(c.email);
                                      } else if (e.key === "Escape") {
                                        setEditingNameEmail(null);
                                      }
                                    }}
                                    className="rounded-md border border-[#093220]/40 bg-white px-2 py-1 text-xs font-bold text-ink outline-none w-44"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveRefereeName(c.email)}
                                    className="rounded-md bg-[#093220] px-2 py-1 text-[11px] font-bold text-white cursor-pointer"
                                  >
                                    Lưu
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingNameEmail(null)}
                                    className="rounded-md px-1.5 py-1 text-[11px] text-line/60 hover:text-ink cursor-pointer"
                                  >
                                    Hủy
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="font-bold text-ink truncate">{displayLabel}</span>
                                  {isRef && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingNameEmail(c.email);
                                        setEditingNameVal(c.name?.trim() || c.email.split("@")[0] || "");
                                      }}
                                      className="inline-flex items-center justify-center rounded p-1 text-line/55 hover:bg-[#093220]/10 hover:text-[#093220] shrink-0 cursor-pointer transition"
                                      title="Đổi tên trọng tài"
                                      aria-label="Đổi tên trọng tài"
                                    >
                                      <svg
                                        className="size-3.5"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="M12 20h9" />
                                        <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              )}
                              <span className="text-[10px] text-line/55 truncate block">
                                {isRef ? `${c.email} • ` : ""}
                                Được thêm bởi {c.addedBy || "Chủ giải"} • {new Date(c.addedAt).toLocaleDateString("vi-VN")}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <select
                              className={`rounded-lg px-2 py-1 text-xs font-bold border transition cursor-pointer ${
                                c.role === "editor"
                                  ? "border-amber-500/40 bg-amber-50 text-amber-800"
                                  : c.role === "referee"
                                    ? "border-[#093220]/30 bg-[#093220]/10 text-[#093220]"
                                    : "border-line/25 bg-card text-line/80"
                              }`}
                              value={c.role}
                              onChange={(e) => handleChangeRole(c.email, e.target.value as CollaboratorRole)}
                            >
                              <option value="editor">✏️ Chỉnh sửa</option>
                              <option value="referee">⚖️ Trọng tài</option>
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
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Tab 2: Chia sẻ mã QR & Link xem trực tiếp */
            <div className="space-y-5">
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
