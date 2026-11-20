import { useState, useEffect, useRef } from "react";
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
  const wasOpenRef = useRef(false);
  const [tab, setTab] = useState<"email" | "qr">("email");
  const [inputEmail, setInputEmail] = useState("");
  const [inputName, setInputName] = useState("");
  const [inputRole, setInputRole] = useState<CollaboratorRole>("editor");
  const [editingNameKey, setEditingNameKey] = useState<string | null>(null);
  const [editingNameVal, setEditingNameVal] = useState("");
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isPublicLive, setIsPublicLive] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [refQrPreview, setRefQrPreview] = useState<{
    name: string;
    url: string;
    qrDataUrl: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const makeRefToken = () =>
    `ref_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;

  const getCollabKey = (c: Collaborator) =>
    c.refToken?.trim() ||
    (c.email || "").toLowerCase().trim() ||
    `${c.role}_${(c.name || "").trim()}_${c.addedAt}`;

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

  const buildRefereeDirectUrl = (token: string, tourIdOverride?: string) => {
    const tid = tourIdOverride || tournamentId;
    if (!publicBase) return "";
    return `${publicBase}/#/quan-ly-giai?refTour=${encodeURIComponent(tid)}&refToken=${encodeURIComponent(token)}`;
  };

  useEffect(() => {
    if (isOpen) {
      setCollaborators(state.collaborators || []);
      setIsPublicLive(state.isPublicLive !== undefined ? state.isPublicLive : true);
      if (!wasOpenRef.current) {
        wasOpenRef.current = true;
        // Chỉ đồng bộ 1 lần khi mở modal nếu cần link xem trực tiếp / link trọng tài
        void saveCurrentToArchive();
      }
    } else {
      wasOpenRef.current = false;
      setRefQrPreview(null);
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
  ): Promise<string | null> => {
    setIsSaving(true);
    try {
      update({ collaborators: updatedList, isPublicLive: updatedPublic, ...(extraPatch || {}) });
      const savedTourId = (await saveCurrentToArchive()) || activeTournamentId || tournamentId;
      if (savedTourId) {
        await updateTournamentCollaborators(savedTourId, updatedList, updatedPublic);
      }
      return savedTourId;
    } catch (e) {
      console.error("Lỗi cập nhật phân quyền:", e);
      toast.error("Không thể lưu phân quyền lên hệ thống.");
      return null;
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
    const cleanName = inputName.trim();

    if (inputRole !== "referee" && !clean) {
      toast.warning("Vui lòng nhập email.");
      return;
    }

    if (inputRole === "referee" && !clean && !cleanName) {
      toast.warning("Vui lòng nhập tên trọng tài hoặc email.");
      return;
    }

    if (clean) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(clean)) {
        toast.warning("Vui lòng nhập đúng định dạng email (ví dụ: trongtai@gmail.com).");
        return;
      }

      if (user?.email && clean === user.email.toLowerCase()) {
        toast.info("Email này là tài khoản chủ giải hiện tại.");
        return;
      }

      if (collaborators.some((c) => (c.email || "").toLowerCase().trim() === clean)) {
        toast.warning("Email này đã có trong danh sách phân quyền.");
        return;
      }
    }

    const cleanRefName =
      inputRole === "referee"
        ? (cleanName || (clean ? clean.split("@")[0] : "") || "Trọng tài")
        : undefined;

    if (
      inputRole === "referee" &&
      !clean &&
      cleanRefName &&
      collaborators.some(
        (c) =>
          c.role === "referee" &&
          !(c.email || "").trim() &&
          (c.name || "").trim().toLowerCase() === cleanRefName.toLowerCase(),
      )
    ) {
      toast.warning(`Trọng tài "${cleanRefName}" đã có trong danh sách.`);
      return;
    }

    const newCollab: Collaborator = {
      email: clean,
      role: inputRole,
      ...(cleanRefName ? { name: cleanRefName, refToken: makeRefToken() } : {}),
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
        ? clean
          ? `Đã thêm trọng tài "${cleanRefName}" (${clean})!`
          : `Đã thêm trọng tài "${cleanRefName}"!`
        : `Đã thêm ${clean} với quyền ${getRoleLabel(inputRole)}!`,
    );
  };

  const ensureInputRefereeReady = async (): Promise<{
    collab: Collaborator;
    tourId: string;
  } | null> => {
    const cleanEmail = inputEmail.trim().toLowerCase();
    const cleanName = inputName.trim();

    if (!cleanName && !cleanEmail) {
      toast.warning("Vui lòng nhập tên trọng tài trước.");
      return null;
    }

    if (cleanEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        toast.warning("Vui lòng nhập đúng định dạng email hoặc để trống email.");
        return null;
      }
    }

    const finalName = cleanName || cleanEmail.split("@")[0] || "Trọng tài";

    const existing = collaborators.find((c) => {
      if (cleanEmail && (c.email || "").toLowerCase().trim() === cleanEmail) return true;
      if (!cleanEmail && c.role === "referee" && (c.name || "").trim().toLowerCase() === finalName.toLowerCase()) {
        return true;
      }
      return false;
    });

    if (existing) {
      const token = existing.refToken?.trim() || makeRefToken();
      let updatedList = collaborators;
      if (!existing.refToken || existing.role !== "referee" || (cleanName && existing.name !== cleanName)) {
        updatedList = collaborators.map((c) =>
          getCollabKey(c) === getCollabKey(existing)
            ? {
                ...c,
                role: "referee" as const,
                name: cleanName || c.name || finalName,
                refToken: token,
              }
            : c,
        );
        setCollaborators(updatedList);
      }
      const existingRefs = state.referees || [];
      const targetName = cleanName || existing.name || finalName;
      const extraPatch = !existingRefs.includes(targetName)
        ? { referees: [...existingRefs, targetName] }
        : undefined;
      const savedTourId =
        (await persistCollaborators(updatedList, isPublicLive, extraPatch)) || tournamentId;
      return {
        collab: { ...existing, role: "referee", name: targetName, refToken: token },
        tourId: savedTourId,
      };
    }

    const newCollab: Collaborator = {
      email: cleanEmail,
      role: "referee",
      name: finalName,
      refToken: makeRefToken(),
      addedAt: new Date().toISOString(),
      addedBy: user?.email || "Chủ giải",
    };

    const updated = [...collaborators, newCollab];
    setCollaborators(updated);
    setInputEmail("");
    setInputName("");

    const existingRefs = state.referees || [];
    const extraPatch = !existingRefs.includes(finalName)
      ? { referees: [...existingRefs, finalName] }
      : undefined;

    const savedTourId =
      (await persistCollaborators(updated, isPublicLive, extraPatch)) || tournamentId;
    return { collab: newCollab, tourId: savedTourId };
  };

  const ensureRowRefereeToken = async (
    c: Collaborator,
  ): Promise<{ collab: Collaborator; tourId: string }> => {
    if (c.refToken?.trim()) {
      const savedTourId = (await saveCurrentToArchive()) || tournamentId;
      return { collab: c, tourId: savedTourId };
    }
    const token = makeRefToken();
    const targetKey = getCollabKey(c);
    const updated = collaborators.map((item) =>
      getCollabKey(item) === targetKey ? { ...item, refToken: token } : item,
    );
    setCollaborators(updated);
    const savedTourId = (await persistCollaborators(updated)) || tournamentId;
    return { collab: { ...c, refToken: token }, tourId: savedTourId };
  };

  const openRefereeQr = async (c: Collaborator, tourIdOverride?: string) => {
    const token = c.refToken?.trim() || makeRefToken();
    const url = buildRefereeDirectUrl(token, tourIdOverride);
    if (!url) return;
    try {
      const qrImgUrl = await QRCode.toDataURL(url, {
        width: 320,
        margin: 2,
        color: { dark: "#093220", light: "#ffffff" },
      });
      setRefQrPreview({
        name: c.name?.trim() || c.email || "Trọng tài",
        url,
        qrDataUrl: qrImgUrl,
      });
    } catch (err) {
      console.error("Lỗi tạo QR trọng tài:", err);
      toast.error("Không thể tạo mã QR trọng tài.");
    }
  };

  const handleCopyRefereeLink = async (c: Collaborator, tourIdOverride?: string) => {
    const token = c.refToken?.trim();
    if (!token) return;
    const url = buildRefereeDirectUrl(token, tourIdOverride);
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success(`Đã sao chép link trọng tài "${c.name?.trim() || c.email || "Trọng tài"}"!`);
  };

  const handleChangeRole = async (targetKey: string, newRole: CollaboratorRole) => {
    let addedRefName: string | undefined;
    let targetLabel = "";
    const updated = collaborators.map((c) => {
      if (getCollabKey(c) !== targetKey) return c;
      targetLabel = c.name?.trim() || c.email || "thành viên";
      if (newRole === "referee") {
        const refName = c.name?.trim() || (c.email ? c.email.split("@")[0] : "") || "Trọng tài";
        addedRefName = refName;
        return { ...c, role: newRole, name: refName, refToken: c.refToken || makeRefToken() };
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
    toast.success(`Đã đổi quyền của ${targetLabel} thành "${getRoleLabel(newRole)}"`);
  };

  const handleSaveRefereeName = async (targetKey: string) => {
    const trimmed = editingNameVal.trim();
    if (!trimmed) {
      setEditingNameKey(null);
      return;
    }
    const target = collaborators.find((c) => getCollabKey(c) === targetKey);
    const oldName = target?.name?.trim() || "";
    const updated = collaborators.map((c) =>
      getCollabKey(c) === targetKey ? { ...c, name: trimmed } : c,
    );
    setCollaborators(updated);
    setEditingNameKey(null);

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

  const handleRemoveCollaborator = async (targetKey: string) => {
    const target = collaborators.find((c) => getCollabKey(c) === targetKey);
    const label = target?.name?.trim() || target?.email || "người dùng";
    const updated = collaborators.filter((c) => getCollabKey(c) !== targetKey);
    setCollaborators(updated);
    await persistCollaborators(updated);
    toast.success(`Đã thu hồi quyền của ${label}.`);
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
      const padX = 56;
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

      const fitSingleLineFontSize = (
        ctx: CanvasRenderingContext2D,
        text: string,
        weight: string,
        startSize: number,
        minSize: number,
        maxW: number,
      ): number => {
        let size = startSize;
        while (size > minSize) {
          ctx.font = `${weight} ${size}px ${fontFamily}`;
          if (ctx.measureText(text).width <= maxW) break;
          size -= 0.5;
        }
        return size;
      };

      const titleText = (state.name || "GIẢI ĐẤU PICKLEBALL").trim().toUpperCase();
      const subtitleText =
        "Quét mã QR để xem trực tiếp lịch thi đấu, bảng xếp hạng và tỉ số theo thời gian thực";
      const tipText = "Không cần cài ứng dụng • Không cần đăng nhập tài khoản";
      const websiteLine = "naycourt.ai.studio";
      const phoneLine = "0929700148";
      const brandLine =
        "Nảy Court . Hệ thống quản lý điều hành giải chuyên nghiệp, hiện đại, đầy khả ái và ngây ngất lòng người...";

      mCtx.font = `800 44px ${fontFamily}`;
      const titleLines = wrapText(mCtx, titleText, maxTextW);

      const subtitleFontSize = fitSingleLineFontSize(mCtx, subtitleText, "400", 21.5, 14, maxTextW);
      const brandFontSize = fitSingleLineFontSize(mCtx, brandLine, "400", 14.5, 10, maxTextW);

      const topPad = 68;
      const titleLineH = 54;
      const subLineH = Math.ceil(subtitleFontSize * 1.35);
      const boxSize = 480;
      const qrSize = 416;
      const boxRadius = 32;
      const bottomPad = 60;

      const totalH =
        topPad +
        titleLines.length * titleLineH +
        14 +
        subLineH +
        38 +
        boxSize +
        34 +
        26 +
        18 +
        46 +
        14 +
        22 +
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

      // Dòng mô tả quét QR - luôn giữ trên 1 dòng
      ctx.fillStyle = "#374151";
      ctx.font = `400 ${subtitleFontSize}px ${fontFamily}`;
      ctx.fillText(subtitleText, W / 2, y);
      y += subLineH + 38;

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
      y += 26 + 18;

      // Website & SĐT
      ctx.fillStyle = "#093220";
      ctx.font = `600 16px ${fontFamily}`;
      ctx.fillText(websiteLine, W / 2, y);
      ctx.fillText(phoneLine, W / 2, y + 23);
      y += 46 + 14;

      // Dòng chữ nhỏ Nảy Court ở cuối cùng trên 1 dòng
      ctx.fillStyle = "#6b7280";
      ctx.font = `400 ${brandFontSize}px ${fontFamily}`;
      ctx.fillText(brandLine, W / 2, y);

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
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 40px 24px; color: #093220; }
            h1 { font-size: 26px; margin-bottom: 8px; text-transform: uppercase; font-weight: 800; }
            p { font-size: 14.5px; color: #374151; margin-bottom: 24px; }
            .qr-box { display: inline-block; padding: 20px; border: 4px solid #093220; border-radius: 20px; background: #fff; margin-bottom: 20px; }
            .qr-img { width: 280px; height: 280px; }
            .tip { font-size: 13px; color: #6b7280; margin-top: 10px; }
            .brand-contacts { font-size: 11px; margin-top: 12px; line-height: 1.5; font-weight: 600; color: #093220; }
            .brand-tagline { font-size: 10px; color: #6b7280; margin-top: 10px; white-space: nowrap; }
          </style>
        </head>
        <body>
          <h1>${safeTitle}</h1>
          <p>Quét mã QR để xem trực tiếp lịch thi đấu, bảng xếp hạng và tỉ số theo thời gian thực</p>
          <div class="qr-box">
            <img class="qr-img" src="${qrDataUrl}" />
          </div>
          <div class="tip">Không cần cài ứng dụng • Không cần đăng nhập tài khoản</div>
          <div class="brand-contacts">
            <div>naycourt.ai.studio</div>
            <div>0929700148</div>
          </div>
          <div class="brand-tagline">Nảy Court . Hệ thống quản lý điều hành giải chuyên nghiệp, hiện đại, đầy khả ái và ngây ngất lòng người...</div>
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
        {/* Header Modal - nền sáng chữ xanh chuẩn bảng quản lý giải */}
        <div className="flex items-center justify-between border-b border-line/10 bg-white dark:bg-card px-5 py-3.5">
          <h3
            className="text-sm font-bold uppercase tracking-wider text-[#0a3320]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Chia sẻ & Phân quyền giải đấu
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

        {/* Tab switcher - thẳng hàng px-5 và chuẩn format tab Quản lý giải */}
        <div className="border-b border-line/10 bg-white dark:bg-card px-5 py-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("email")}
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              className={`rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                tab === "email"
                  ? "bg-accent text-accent-foreground shadow-xs"
                  : "bg-card text-line/70 ring-1 ring-line/20 hover:bg-card/80"
              }`}
            >
              ✉️ Mời qua Email ({collaborators.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("qr")}
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              className={`rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                tab === "qr"
                  ? "bg-accent text-accent-foreground shadow-xs"
                  : "bg-card text-line/70 ring-1 ring-line/20 hover:bg-card/80"
              }`}
            >
              📱 Mã QR & Link xem trực tiếp
            </button>
          </div>
          {isSaving && <span className="text-[11px] text-[#0a3320] font-bold animate-pulse">Đang lưu...</span>}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === "email" ? (
            <div className="space-y-5">
              {/* Form thêm email / trọng tài */}
              <form onSubmit={handleAddCollaborator} className="rounded-xl border border-line/20 bg-paper/50 p-4 shadow-2xs space-y-2.5">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="email"
                    required={inputRole !== "referee"}
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
                  <div className="pt-1 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nhập tên"
                      className="field flex-1 !text-xs !py-2 bg-white"
                      value={inputName}
                      onChange={(e) => setInputName(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const ready = await ensureInputRefereeReady();
                        if (!ready) return;
                        await openRefereeQr(ready.collab, ready.tourId);
                      }}
                      title="Tạo & quét mã QR đăng nhập nhanh cho trọng tài này (không cần email)"
                      className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg border border-line/25 bg-white hover:bg-[#0a3320]/5 hover:border-[#0a3320]/50 px-3 py-2 text-xs font-bold text-[#0a3320] cursor-pointer transition"
                    >
                      <svg
                        className="size-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <path d="M14 14h3v3h-3z" />
                        <path d="M20 14v3h-1" />
                        <path d="M14 20h3" />
                        <path d="M20 20h1v-1" />
                      </svg>
                      <span>Mã QR</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ready = await ensureInputRefereeReady();
                        if (!ready) return;
                        await handleCopyRefereeLink(ready.collab, ready.tourId);
                      }}
                      title="Sao chép link trọng tài (mở link trực tiếp không cần đăng nhập email)"
                      className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg border border-line/25 bg-white hover:bg-[#0a3320]/5 hover:border-[#0a3320]/50 px-3 py-2 text-xs font-bold text-[#0a3320] cursor-pointer transition"
                    >
                      <svg
                        className="size-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      <span>Copy link</span>
                    </button>
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
                      Chưa có người nào được cấp quyền. Hãy thêm email hoặc trọng tài ở trên để cùng điều hành giải.
                    </div>
                  ) : (
                    collaborators.map((c) => {
                      const collabKey = getCollabKey(c);
                      const isRef = c.role === "referee";
                      const isEditingThisName = editingNameKey === collabKey;
                      const cleanEmail = (c.email || "").trim();
                      const displayLabel = isRef
                        ? c.name?.trim() || (cleanEmail ? cleanEmail.split("@")[0] : "Trọng tài")
                        : cleanEmail || c.name?.trim() || "Thành viên";

                      return (
                        <div key={collabKey} className="flex items-center justify-between gap-2 p-3 text-xs hover:bg-paper/30 transition">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                isRef
                                  ? "bg-[#093220]/15 text-[#093220]"
                                  : "bg-secondary text-line/70"
                              }`}
                            >
                              {isRef ? "⚖️" : (cleanEmail || displayLabel).charAt(0).toUpperCase()}
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
                                        void handleSaveRefereeName(collabKey);
                                      } else if (e.key === "Escape") {
                                        setEditingNameKey(null);
                                      }
                                    }}
                                    className="rounded-md border border-[#093220]/40 bg-white px-2 py-1 text-xs font-bold text-ink outline-none w-44"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveRefereeName(collabKey)}
                                    className="rounded-md bg-[#093220] px-2 py-1 text-[11px] font-bold text-white cursor-pointer"
                                  >
                                    Lưu
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingNameKey(null)}
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
                                        setEditingNameKey(collabKey);
                                        setEditingNameVal(
                                          c.name?.trim() || (cleanEmail ? cleanEmail.split("@")[0] : "") || "",
                                        );
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
                                {isRef ? `${cleanEmail || "Truy cập qua Link / QR"} • ` : ""}
                                Được thêm bởi {c.addedBy || "Chủ giải"} • {new Date(c.addedAt).toLocaleDateString("vi-VN")}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isRef && (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const ready = await ensureRowRefereeToken(c);
                                    await openRefereeQr(ready.collab, ready.tourId);
                                  }}
                                  className="inline-flex items-center justify-center rounded-md border border-line/20 bg-white hover:bg-[#0a3320]/10 hover:border-[#0a3320]/40 p-1.5 text-[#0a3320] cursor-pointer transition"
                                  title="Xem mã QR của trọng tài này"
                                  aria-label="Xem mã QR của trọng tài"
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
                                    <rect x="3" y="3" width="7" height="7" rx="1" />
                                    <rect x="14" y="3" width="7" height="7" rx="1" />
                                    <rect x="3" y="14" width="7" height="7" rx="1" />
                                    <path d="M14 14h3v3h-3z" />
                                    <path d="M20 14v3h-1" />
                                    <path d="M14 20h3" />
                                    <path d="M20 20h1v-1" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const ready = await ensureRowRefereeToken(c);
                                    await handleCopyRefereeLink(ready.collab, ready.tourId);
                                  }}
                                  className="inline-flex items-center justify-center rounded-md border border-line/20 bg-white hover:bg-[#0a3320]/10 hover:border-[#0a3320]/40 p-1.5 text-[#0a3320] cursor-pointer transition"
                                  title="Sao chép link trọng tài (không cần email)"
                                  aria-label="Sao chép link trọng tài"
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
                                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                  </svg>
                                </button>
                              </>
                            )}
                            <select
                              className={`rounded-lg px-2 py-1 text-xs font-bold border transition cursor-pointer ${
                                c.role === "editor"
                                  ? "border-amber-500/40 bg-amber-50 text-amber-800"
                                  : c.role === "referee"
                                    ? "border-[#093220]/30 bg-[#093220]/10 text-[#093220]"
                                    : "border-line/25 bg-card text-line/80"
                              }`}
                              value={c.role}
                              onChange={(e) => handleChangeRole(collabKey, e.target.value as CollaboratorRole)}
                            >
                              {cleanEmail && <option value="editor">✏️ Chỉnh sửa</option>}
                              <option value="referee">⚖️ Trọng tài</option>
                              {cleanEmail && <option value="viewer">👁️ Chỉ xem</option>}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleRemoveCollaborator(collabKey)}
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

        {/* Sub-modal hiển thị mã QR dành riêng cho trọng tài */}
        {refQrPreview && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
            onClick={() => setRefQrPreview(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-line/20 bg-white dark:bg-card p-5 shadow-2xl space-y-4 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-line/10 pb-2.5">
                <h4
                  className="text-xs font-bold uppercase tracking-wider text-[#0a3320]"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  QR Trọng tài: {refQrPreview.name}
                </h4>
                <button
                  type="button"
                  onClick={() => setRefQrPreview(null)}
                  className="text-sm text-line/50 hover:text-ink cursor-pointer px-1"
                >
                  ✕
                </button>
              </div>
              <div className="inline-block rounded-2xl border-2 border-[#093220]/25 bg-white p-3">
                <img
                  src={refQrPreview.qrDataUrl}
                  alt={`QR trọng tài ${refQrPreview.name}`}
                  className="w-52 h-52 object-contain mx-auto"
                />
              </div>
              <p className="text-[11px] text-line/65 leading-relaxed">
                Trọng tài <strong>{refQrPreview.name}</strong> chỉ cần quét mã QR hoặc mở link bên dưới để vào chấm điểm ngay, không cần đăng nhập Gmail.
              </p>
              <div className="flex items-center gap-1.5 rounded-lg border border-line/20 bg-paper/60 px-2.5 py-1.5">
                <input
                  type="text"
                  readOnly
                  value={refQrPreview.url}
                  className="w-full bg-transparent text-[10px] font-mono text-ink outline-none truncate"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(refQrPreview.url);
                    toast.success(`Đã sao chép link trọng tài "${refQrPreview.name}"!`);
                  }}
                  className="btn-accent flex-1 text-xs !py-2 cursor-pointer"
                >
                  Sao chép link
                </button>
                <a
                  href={refQrPreview.qrDataUrl}
                  download={`QR_TrongTai_${refQrPreview.name.replace(/\s+/g, "_")}.png`}
                  className="btn-ghost text-xs !py-2 px-3 rounded-lg border border-line/20 hover:bg-paper"
                >
                  Tải QR
                </a>
                <button
                  type="button"
                  onClick={() => setRefQrPreview(null)}
                  className="btn-ghost text-xs !py-2 px-3 rounded-lg border border-line/20 cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
