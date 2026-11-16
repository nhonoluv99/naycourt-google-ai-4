import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { DuprPvnaLookupModal } from "@/components/DuprPvnaLookupModal";
import type { RatedPlayer } from "@/lib/rating-database";
import {
  drawPairs,
  entryName,
  getGroupName,
  getRotatingMatchesPerPlayer,
  isRotatingDoubles,
  splitGroups,
  uid,
  useTournament,
  type Entry,
  type TEvent,
} from "@/lib/tournament-store";

export const Route = createFileRoute("/van-dong-vien")({
  head: () => ({
    meta: [
      { title: "Danh sách vận động viên — Nảy Court" },
      {
        name: "description",
        content:
          "Nhập tay hoặc import Excel/CSV danh sách VĐV cho từng nội dung, ghi điểm trình, đánh dấu đã đóng lệ phí và chia bảng tự động hoặc thủ công.",
      },
      { property: "og:title", content: "Danh sách vận động viên — Nảy Court" },
      {
        property: "og:description",
        content: "Nhập VĐV, điểm trình, lệ phí và chia bảng A B C D dễ nhìn.",
      },
    ],
  }),
  component: PlayersPage,
});

function parseCsv(text: string): Array<string[]> {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/[,;\t]/).map((c) => c.trim()));
}

function PlayersPage() {
  const { state, update, updateEvent, setSelectedEventId } = useTournament();
  const activeId =
    state.selectedEventId && state.events.some((e) => e.id === state.selectedEventId)
      ? state.selectedEventId
      : state.events[0]?.id ?? "";
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [confirmedMatchEdit, setConfirmedMatchEdit] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const [ratingLookupOpen, setRatingLookupOpen] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupTarget, setLookupTarget] = useState<{ entryId: string; playerIdx: number; name: string } | null>(null);
  const [lookupSelectedRating, setLookupSelectedRating] = useState<number | null>(null);

  const openLookup = (target?: { entryId: string; playerIdx: number; name: string }) => {
    if (target) {
      setLookupTarget(target);
      setLookupQuery(target.name || "");
    } else {
      setLookupTarget(null);
      setLookupQuery("");
    }
    setLookupSelectedRating(null);
    setRatingLookupOpen(true);
  };

  const applyRatingToTarget = (rating: number) => {
    if (lookupTarget) {
      patchPlayer(lookupTarget.entryId, lookupTarget.playerIdx, { rating });
      toast.success(`Đã cập nhật điểm trình ${rating} cho VĐV ${lookupTarget.name || "được chọn"}`);
      setRatingLookupOpen(false);
    }
  };

  const ev: TEvent | undefined = state.events.find((e) => e.id === activeId) ?? state.events[0];

  useEffect(() => {
    setConfirmedMatchEdit(false);
  }, [activeId]);

  const entries = useMemo(
    () => state.entries.filter((e) => ev && e.eventId === ev.id),
    [state.entries, ev],
  );

  // Kiểm tra xem nội dung này đã có trận nào diễn ra hoặc có điểm chưa
  const hasStartedMatches = useMemo(() => {
    return state.matches.some(
      (m) =>
        ev &&
        m.eventId === ev.id &&
        (m.scoreA !== null || m.scoreB !== null || m.status === "done" || m.status === "live"),
    );
  }, [state.matches, ev]);

  const requireEditConfirmation = (action: () => void, actionDesc?: string) => {
    if (!hasStartedMatches || confirmedMatchEdit) {
      action();
      return;
    }
    setConfirmModal({
      title: "⚠️ Cảnh báo: Trận đấu đã diễn ra",
      message: `Nội dung "${ev?.name}" đã có các trận đấu đang diễn ra hoặc đã ghi điểm số.\n\n${actionDesc || "Việc chỉnh sửa thông tin VĐV, danh sách hoặc chia lại bảng"}\nsẽ ảnh hưởng trực tiếp đến kết quả và sơ đồ thi đấu các vòng tiếp theo.\n\nBạn có chắc chắn muốn cho phép chỉnh sửa không?`,
      confirmText: "Xác nhận chỉnh sửa",
      cancelText: "Hủy bỏ",
      isDestructive: false,
      onConfirm: () => {
        setConfirmedMatchEdit(true);
        action();
        setConfirmModal(null);
      },
    });
  };

  if (!ev) {
    return (
      <div className="max-w-xl">
        <h1 className="font-head text-4xl font-bold uppercase tracking-tighter text-[#0a3320]">Danh sách VĐV</h1>
        <p className="mt-3 text-sm text-line/60">
          Chưa có nội dung nào. Hãy tạo nội dung thi đấu trước.
        </p>
        <Link to="/noi-dung" className="btn-accent mt-4">
          Tạo nội dung
        </Link>
      </div>
    );
  }

  const isTeamMode = ev.mode === "dong_doi";
  const isCustomTeam = isTeamMode && ev.teamSubMode === "custom";
  const customPlayerCount = ev.customTeamPlayerCount || 4;
  const slots = isTeamMode ? (isCustomTeam ? customPlayerCount : 4) : ev.mode === "don" ? 1 : ev.pairMode === "fixed" ? 2 : 1;

  // Số lượng VĐV cho mỗi đội khi thêm đội mới
  const [teamPlayerCount, setTeamPlayerCount] = useState<number>(() => ev.customTeamPlayerCount || 4);

  const handleTeamPlayerCountChange = (val: number) => {
    const clamped = Math.max(1, Math.min(30, val || 1));
    setTeamPlayerCount(clamped);
    updateEvent(ev.id, {
      customTeamPlayerCount: clamped,
    });
  };

  // State cho Tra cứu DUPR / PVNA
  const [lookupModalOpen, setLookupModalOpen] = useState(false);
  const [targetSlot, setTargetSlot] = useState<{
    entryId: string;
    playerIdx: number;
    initialQuery: string;
    slotLabel: string;
  } | null>(null);

  const handleSelectRatedPlayer = (
    player: RatedPlayer,
    chosenRating: number,
    type: "dupr" | "pvna",
  ) => {
    if (targetSlot) {
      // Điền vào ô VĐV cụ thể đang chọn
      patchPlayer(targetSlot.entryId, targetSlot.playerIdx, {
        name: player.name,
        rating: chosenRating,
      });
      toast.success(
        `Đã điền điểm ${type.toUpperCase()} (${chosenRating.toFixed(3)}) cho VĐV ${player.name}!`,
      );
      setTargetSlot(null);
    } else {
      // Thêm VĐV mới vào danh sách giải đấu
      const newSlot = { name: player.name, rating: chosenRating, paid: false };
      setEntries([
        ...entries,
        {
          id: uid(),
          eventId: ev.id,
          teamName: isTeamMode ? `Đội ${entries.length + 1}` : undefined,
          players:
            slots === 4
              ? [
                  newSlot,
                  { name: "", rating: null, paid: false },
                  { name: "", rating: null, paid: false },
                  { name: "", rating: null, paid: false },
                ]
              : slots === 2
              ? [newSlot, { name: "", rating: null, paid: false }]
              : [newSlot],
          paid: false,
        },
      ]);
      toast.success(
        `Đã thêm VĐV ${player.name} (${type.toUpperCase()}: ${chosenRating.toFixed(3)}) vào danh sách!`,
      );
    }
  };

  const setEntries = (next: Entry[]) =>
    update({ entries: [...state.entries.filter((e) => e.eventId !== ev.id), ...next] });

  const addEntry = () => {
    requireEditConfirmation(() => {
      const count = isTeamMode ? (teamPlayerCount || 4) : slots;
      setEntries([
        ...entries,
        {
          id: uid(),
          eventId: ev.id,
          teamName: isTeamMode ? `Đội ${entries.length + 1}` : undefined,
          players: Array.from({ length: count }, () => ({ name: "", rating: null })),
          paid: false,
        },
      ]);
    }, isTeamMode ? "Thêm Đội mới vào danh sách" : "Thêm VĐV mới vào danh sách");
  };

  const addPlayerToTeam = (entryId: string) => {
    requireEditConfirmation(() => {
      setEntries(
        entries.map((e) => {
          if (e.id !== entryId) return e;
          return {
            ...e,
            players: [...e.players, { name: "", rating: null, gender: undefined, paid: false }],
          };
        }),
      );
    }, "Thêm thành viên mới vào đội này");
  };

  const removePlayerFromTeam = (entryId: string, playerIdx: number) => {
    requireEditConfirmation(() => {
      setEntries(
        entries.map((e) => {
          if (e.id !== entryId) return e;
          const nextPlayers = e.players.filter((_, pi) => pi !== playerIdx);
          return { ...e, players: nextPlayers };
        }),
      );
    }, "Xóa thành viên khỏi đội này");
  };

  const patchEntry = (id: string, patch: Partial<Entry>) =>
    setEntries(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const toggleWithdrawn = (en: Entry) => {
    const isW = Boolean(en.withdrawn);
    if (!isW) {
      setConfirmModal({
        title: "⚠️ Xác nhận đánh dấu bỏ cuộc",
        message: `Bạn có chắc chắn muốn đánh dấu "${entryName(en)}" bỏ cuộc?\n\nToàn bộ kết quả các trận thi đấu trước đó của VĐV/đội này sẽ bị HỦY BỎ (không tính điểm, hiệu số cho cả 2 bên trên bảng xếp hạng), và VĐV này sẽ không được xếp vào các vòng tiếp theo.`,
        confirmText: "Xác nhận bỏ cuộc",
        cancelText: "Hủy bỏ",
        isDestructive: true,
        onConfirm: () => {
          patchEntry(en.id, { withdrawn: true });
          setConfirmModal(null);
          toast.warning(`Đã đánh dấu ${entryName(en)} bỏ cuộc. Kết quả trước đó đã bị hủy trên BXH.`);
        },
      });
    } else {
      patchEntry(en.id, { withdrawn: false });
      toast.success(`Đã khôi phục thi đấu cho ${entryName(en)}.`);
    }
  };

  const patchPlayer = (id: string, idx: number, patch: Partial<Entry["players"][number]>) => {
    if (hasStartedMatches && !confirmedMatchEdit && "name" in patch) {
      requireEditConfirmation(() => {
        setEntries(
          entries.map((e) => {
            if (e.id !== id) return e;
            const newPlayers = e.players.map((p, i) => (i === idx ? { ...p, ...patch } : p));
            const allPaid = newPlayers.length > 0 && newPlayers.every((p) => Boolean(p.paid));
            return {
              ...e,
              players: newPlayers,
              paid: allPaid,
            };
          }),
        );
      }, "Thay đổi thông tin VĐV");
      return;
    }

    setEntries(
      entries.map((e) => {
        if (e.id !== id) return e;
        const newPlayers = e.players.map((p, i) => (i === idx ? { ...p, ...patch } : p));
        const allPaid = newPlayers.length > 0 && newPlayers.every((p) => Boolean(p.paid));
        return {
          ...e,
          players: newPlayers,
          paid: allPaid,
        };
      }),
    );
  };

  const removeEntry = (id: string) => {
    setEntries(entries.filter((e) => e.id !== id));
    removeFromGroups(id);
  };

  const clearAllEntries = () => {
    if (entries.length === 0) return;
    setConfirmModal({
      title: "Xác nhận xóa toàn bộ danh sách VĐV",
      message: `Bạn có chắc chắn muốn xóa TOÀN BỘ ${entries.length} VĐV của nội dung "${ev.name}"?\n\nThao tác này sẽ làm trống danh sách VĐV và xóa họ khỏi các bảng đấu đã xếp.`,
      confirmText: `Xóa toàn bộ (${entries.length})`,
      cancelText: "Hủy bỏ",
      isDestructive: true,
      onConfirm: () => {
        setEntries([]);
        updateEvent(ev.id, {
          groups: ev.groups.map((g) => ({ ...g, entryIds: [] })),
        });
        setNote(`Đã xóa toàn bộ ${entries.length} VĐV.`);
        setConfirmModal(null);
      },
    });
  };

  const onImport = async (file: File) => {
    try {
      let rows: Array<string[]> = [];
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const firstSheetName = wb.SheetNames[0];
        if (firstSheetName) {
          const sheet = wb.Sheets[firstSheetName];
          const rawJson = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });
          rows = rawJson.map((row) =>
            Array.isArray(row) ? row.map((c) => String(c ?? "").trim()) : [],
          );
        }
      } else {
        const text = await file.text();
        rows = parseCsv(text);
      }

      if (!rows.length) {
        setNote("File không có dữ liệu để import.");
        return;
      }

      // Xác định hàng bắt đầu và thứ tự các cột
      let startRow = 0;
      let nameCol = 0;
      let ratingCol = 1;
      let name2Col = 2;
      let rating2Col = 3;

      const firstRowLower = (rows[0] || []).map((c) => c.toLowerCase());
      const hasHeader = firstRowLower.some((c) =>
        /stt|tên|ten|name|họ|ho|điểm|diem|rating/i.test(c),
      );

      if (hasHeader) {
        startRow = 1;
        const sttIdx = firstRowLower.findIndex((c) => /stt|no|#|^số$/i.test(c));
        const nameIdxs = firstRowLower
          .map((c, idx) => (/t[eê]n|name|v[đd]v|họ\s*t[eê]n/i.test(c) ? idx : -1))
          .filter((idx) => idx !== -1);
        const ratingIdxs = firstRowLower
          .map((c, idx) => (/điểm|diem|tr[iì]nh|rating|point/i.test(c) ? idx : -1))
          .filter((idx) => idx !== -1);

        if (nameIdxs.length > 0) {
          nameCol = nameIdxs[0]!;
          if (nameIdxs.length > 1) name2Col = nameIdxs[1]!;
        } else if (sttIdx === 0) {
          nameCol = 1;
          name2Col = 3;
        }

        if (ratingIdxs.length > 0) {
          ratingCol = ratingIdxs[0]!;
          if (ratingIdxs.length > 1) rating2Col = ratingIdxs[1]!;
        } else {
          ratingCol = nameCol + 1;
          rating2Col = name2Col + 1;
        }
      } else {
        const col0IsStt = rows.slice(0, 5).every((r) => !isNaN(Number(r[0])) && Number(r[0]) > 0);
        if (col0IsStt) {
          nameCol = 1;
          ratingCol = 2;
          name2Col = 3;
          rating2Col = 4;
        }
      }

      const imported: Entry[] = [];
      for (let i = startRow; i < rows.length; i++) {
        const cols = rows[i] || [];
        if (!cols.some((c) => c.trim())) continue;
        const players: Entry["players"] = [];
        const n1 = cols[nameCol]?.trim() || "";
        const r1 = num(cols[ratingCol]);

        if (slots === 2) {
          const n2 = cols[name2Col]?.trim() || "";
          const r2 = num(cols[rating2Col]);
          if (n1 || n2) {
            // Nếu người dùng để cả 2 tên trong 1 cột hoặc tên có dấu phân cách (ví dụ: Dung / Trường hoặc Ninh - Loan hoặc Tuấn + Hùng)
            if (!n2 && n1 && /[/+&–—-]/.test(n1)) {
              const parts = n1.split(/[/+&–—-]/).map((s) => s.trim()).filter(Boolean);
              if (parts.length >= 2) {
                players.push({ name: parts[0]!, rating: r1 });
                players.push({ name: parts.slice(1).join(" - "), rating: r2 ?? r1 });
              } else {
                players.push({ name: n1, rating: r1 });
                players.push({ name: "", rating: null });
              }
            } else {
              players.push({ name: n1, rating: r1 });
              players.push({ name: n2, rating: r2 });
            }
          }
        } else {
          if (n1) {
            players.push({ name: n1, rating: r1 });
          }
        }
        if (players.some((p) => p.name)) {
          imported.push({ id: uid(), eventId: ev.id, players, paid: false });
        }
      }

      setEntries([...entries, ...imported]);
      setNote(`Đã import thành công ${imported.length} VĐV.`);
    } catch (err) {
      console.error(err);
      setNote("Lỗi khi đọc file Excel/CSV. Vui lòng kiểm tra lại định dạng file.");
    }
  };

  const downloadSampleExcel = () => {
    try {
      const isDoubles = slots === 2;
      const wb = XLSX.utils.book_new();
      const headers = isDoubles
        ? ["STT", "Tên VĐV 1", "Điểm trình 1", "Tên VĐV 2", "Điểm trình 2"]
        : ["STT", "Họ và tên VĐV", "Điểm trình"];
      const sampleData = isDoubles
        ? [
            [1, "VĐV 1", 3.5, "VĐV 2", 3.5],
            [2, "VĐV 3", 4.0, "VĐV 4", 4.0],
            [3, "VĐV 5", 3.5, "VĐV 6", 3.5],
            [4, "VĐV 7", 4.0, "VĐV 8", 4.0],
          ]
        : [
            [1, "VĐV 1", 3.5],
            [2, "VĐV 2", 4.0],
            [3, "VĐV 3", 3.5],
            [4, "VĐV 4", 4.0],
          ];
      const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
      // Đặt độ rộng các cột
      ws["!cols"] = isDoubles
        ? [{ wch: 6 }, { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 14 }]
        : [{ wch: 6 }, { wch: 26 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws, "DanhSachVDV");
      XLSX.writeFile(wb, `mau_import_${ev.mode === "don" ? "don" : "doi"}.xlsx`);
      setNote("Đã tải file Excel mẫu (.xlsx) về máy của bạn.");
    } catch (e) {
      console.error(e);
      setNote("Không thể tải file mẫu. Bạn có thể tự tạo file Excel với cột: STT, Tên, Điểm trình.");
    }
  };

  const exportAthletesToExcel = () => {
    try {
      if (entries.length === 0) {
        const rows: (string | number)[][] = [];
        if (isTeamMode) {
          rows.push([
            "STT",
            "Tên đội",
            "VĐV 1",
            "Điểm 1",
            "VĐV 2",
            "Điểm 2",
            "VĐV 3",
            "Điểm 3",
            "VĐV 4",
            "Điểm 4",
            "Tổng điểm",
            "Lệ phí",
            "Bảng đấu",
          ]);
          for (let i = 1; i <= 10; i++) {
            rows.push([i, "", "", "", "", "", "", "", "", "", "", "Chưa nộp", ""]);
          }
        } else if (slots === 2) {
          rows.push([
            "STT",
            "Vận động viên 1",
            "Điểm trình 1",
            "Vận động viên 2",
            "Điểm trình 2",
            "Tổng điểm",
            "Lệ phí",
            "Bảng đấu",
          ]);
          for (let i = 1; i <= 10; i++) {
            rows.push([i, "", "", "", "", "", "Chưa nộp", ""]);
          }
        } else {
          rows.push(["STT", "Họ và tên", "Điểm trình", "Lệ phí", "Bảng đấu"]);
          for (let i = 1; i <= 10; i++) {
            rows.push([i, "", "", "Chưa nộp", ""]);
          }
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws["!cols"] = [
          { wch: 6 },
          { wch: 22 },
          { wch: 14 },
          { wch: 22 },
          { wch: 14 },
          { wch: 14 },
          { wch: 14 },
          { wch: 14 },
        ];
        const wb = XLSX.utils.book_new();
        const sheetName = (ev.name || "DanhSachVDV").replace(/[/\\?*[\]]/g, "_").slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        const sanitizedEvName = (ev.name || "VDV").replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, "_");
        XLSX.writeFile(wb, `Mau_Danh_Sach_${sanitizedEvName}_10_VDV.xlsx`);
        toast.success("Đã tải file Excel mẫu 10 dòng thành công!");
        setNote("Đã tải file Excel mẫu với 10 dòng trống để bạn nhập thông tin.");
        return;
      }

      const rows: (string | number)[][] = [];

      const getEntryGroupName = (entryId: string) => {
        const g = ev.groups?.find((grp) => grp.entryIds?.includes(entryId));
        return g ? `Bảng ${g.name}` : "";
      };

      if (isTeamMode) {
        rows.push([
          "STT",
          "Tên đội",
          "VĐV 1",
          "Điểm 1",
          "VĐV 2",
          "Điểm 2",
          "VĐV 3",
          "Điểm 3",
          "VĐV 4",
          "Điểm 4",
          "Tổng điểm",
          "Lệ phí",
          "Bảng đấu",
        ]);
        entries.forEach((en, idx) => {
          const p1 = en.players[0]?.name || "";
          const r1 = en.players[0]?.rating ?? "";
          const p2 = en.players[1]?.name || "";
          const r2 = en.players[1]?.rating ?? "";
          const p3 = en.players[2]?.name || "";
          const r3 = en.players[2]?.rating ?? "";
          const p4 = en.players[3]?.name || "";
          const r4 = en.players[3]?.rating ?? "";
          const totalRating =
            (typeof r1 === "number" ? r1 : 0) +
            (typeof r2 === "number" ? r2 : 0) +
            (typeof r3 === "number" ? r3 : 0) +
            (typeof r4 === "number" ? r4 : 0);
          rows.push([
            idx + 1,
            en.teamName || entryName(en) || `Đội ${idx + 1}`,
            p1,
            r1,
            p2,
            r2,
            p3,
            r3,
            p4,
            r4,
            totalRating ? Number(totalRating.toFixed(2)) : "",
            en.paid ? "Đã nộp" : "Chưa nộp",
            getEntryGroupName(en.id),
          ]);
        });
      } else if (slots === 2 || entries.some((en) => en.players.length > 1)) {
        rows.push([
          "STT",
          "Vận động viên 1",
          "Điểm trình 1",
          "Vận động viên 2",
          "Điểm trình 2",
          "Tổng điểm",
          "Lệ phí",
          "Bảng đấu",
        ]);
        entries.forEach((en, idx) => {
          const p1 = en.players[0]?.name || "";
          const r1 = en.players[0]?.rating ?? "";
          const p2 = en.players[1]?.name || "";
          const r2 = en.players[1]?.rating ?? "";
          const totalRating =
            (typeof r1 === "number" ? r1 : 0) + (typeof r2 === "number" ? r2 : 0);
          rows.push([
            idx + 1,
            p1,
            r1,
            p2,
            r2,
            totalRating ? Number(totalRating.toFixed(2)) : "",
            en.paid ? "Đã nộp" : "Chưa nộp",
            getEntryGroupName(en.id),
          ]);
        });
      } else {
        rows.push(["STT", "Họ và tên", "Điểm trình", "Lệ phí", "Bảng đấu"]);
        entries.forEach((en, idx) => {
          const p1 = en.players[0]?.name || "";
          const r1 = en.players[0]?.rating ?? "";
          rows.push([
            idx + 1,
            p1,
            r1,
            en.paid ? "Đã nộp" : "Chưa nộp",
            getEntryGroupName(en.id),
          ]);
        });
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [
        { wch: 6 },
        { wch: 22 },
        { wch: 14 },
        { wch: 22 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
      ];
      const wb = XLSX.utils.book_new();
      const sheetName = (ev.name || "DanhSachVDV").replace(/[/\\?*[\]]/g, "_").slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const sanitizedEvName = (ev.name || "VDV").replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, "_");
      XLSX.writeFile(wb, `Danh_Sach_${sanitizedEvName}.xlsx`);
      toast.success("Đã xuất danh sách VĐV ra file Excel!");
      setNote("Đã xuất danh sách VĐV ra file Excel.");
    } catch (err) {
      console.error(err);
      toast.error("Không thể xuất file Excel. Vui lòng thử lại.");
    }
  };

  const doDraw = () => {
    requireEditConfirmation(() => {
      const paired = drawPairs(entries, ev.id);
      setEntries(paired);
      setNote(`Đã bốc thăm ${paired.length} đội.`);
    }, "Bốc thăm ghép đôi mới sẽ thay đổi danh sách các cặp đấu.");
  };

  const handleRestoreDraw = () => {
    requireEditConfirmation(() => {
      const restoredEntries: Entry[] = [];
      entries.forEach((en) => {
        if (en.players.length > 1) {
          en.players.forEach((p) => {
            restoredEntries.push({
              id: uid(),
              eventId: ev.id,
              players: [p],
              paid: p.paid ?? en.paid ?? false,
            });
          });
        } else {
          restoredEntries.push(en);
        }
      });

      const resetGroups = (ev.groups || []).map((g) => ({ ...g, entryIds: [] }));
      setEntries(restoredEntries);
      updateEvent(ev.id, { groups: resetGroups });
      setNote(`Đã khôi phục ${restoredEntries.length} VĐV về trạng thái ban đầu (chưa ghép đôi).`);
      toast.success("Đã khôi phục danh sách VĐV về trạng thái ban đầu!");
    }, "Khôi phục danh sách VĐV về trạng thái ban đầu trước khi bốc thăm ghép đôi? Tất cả các cặp đấu sẽ được tách lại thành từng VĐV đơn lẻ và phân chia bảng sẽ được xóa.");
  };

  const autoGroups = () => {
    requireEditConfirmation(() => {
      // Gộp nút chia bảng tự động và chia lại bảng: vừa chia bảng vừa chia random tiếp được
      const shuffled = [...entries].sort(() => Math.random() - 0.5);
      const n = Math.max(1, ev.groupCount || 1);
      const groups = Array.from({ length: n }, (_, i) => ({
        name: getGroupName(i),
        entryIds: [] as string[],
      }));
      shuffled.forEach((en, i) => {
        groups[i % n]!.entryIds.push(en.id);
      });
      updateEvent(ev.id, { groups });
      setNote(`Đã chia tự động ngẫu nhiên ${entries.length} đội vào ${n} bảng.`);
    }, "Việc chia lại bảng tự động sẽ sắp xếp lại toàn bộ các đội vào các bảng.");
  };

  const moveEntry = (entryId: string, toGroup: number) => {
    const groups = ev.groups.map((g) => ({
      ...g,
      entryIds: g.entryIds.filter((id) => id !== entryId),
    }));
    if (groups[toGroup]) {
      groups[toGroup].entryIds.push(entryId);
    }
    updateEvent(ev.id, { groups });
  };

  const removeFromGroups = (entryId: string) => {
    const groups = ev.groups.map((g) => ({
      ...g,
      entryIds: g.entryIds.filter((id) => id !== entryId),
    }));
    updateEvent(ev.id, { groups });
  };

  const swapEntriesInGroups = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const groups = ev.groups.map((g) => {
      const hasSource = g.entryIds.includes(sourceId);
      const hasTarget = g.entryIds.includes(targetId);
      if (!hasSource && !hasTarget) return g;
      return {
        ...g,
        entryIds: g.entryIds.map((id) => {
          if (id === sourceId) return targetId;
          if (id === targetId) return sourceId;
          return id;
        }),
      };
    });
    updateEvent(ev.id, { groups });
  };

  const handleGroupCountChange = (newVal: number) => {
    const count = Math.max(1, newVal || 1);
    const existingGroups = ev.groups || [];
    const nextGroups = Array.from({ length: count }, (_, i) => {
      const name = getGroupName(i);
      const found = existingGroups.find((g) => g.name === name);
      return found ?? { name, entryIds: [] };
    });
    updateEvent(ev.id, {
      groupCount: count,
      groups: nextGroups,
    });
  };

  const [dragEntryId, setDragEntryId] = useState<string | null>(null);
  const [touchOverGroupIdx, setTouchOverGroupIdx] = useState<number | null>(null);
  const [touchOverEntryId, setTouchOverEntryId] = useState<string | null>(null);
  const [touchOverUnassigned, setTouchOverUnassigned] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showTeamMembersInPrint, setShowTeamMembersInPrint] = useState(false);
  const [showExcelGuide, setShowExcelGuide] = useState(false);

  // Chỉ hiển thị bảng bên phải khi cần chia bảng (rr_ko) hoặc chia cặp
  const showRightPanel = ev.bracket === "rr_ko";

  return (
    <div>
      <h1
        className="text-balance font-head text-4xl font-bold uppercase leading-none tracking-tighter text-[#0a3320]"
        style={{ color: "#0a3320" }}
      >
        Danh sách VĐV
      </h1>

      {/* Cảnh báo trùng tên VĐV */}
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
        <span className="text-base leading-none">⚠️</span>
        <div>
          <span className="font-bold">Lưu ý quan trọng khi nhập tên VĐV:</span> Nếu có cùng 1 tên VĐV tham gia ở các nội dung khác nhau, hoặc cùng 1 nội dung có 2 VĐV trùng tên, hệ thống nhận diện sẽ hiểu là vận động viên bị trùng trận. Vui lòng thêm các ký hiệu phân biệt khi nhập (ví dụ: <strong className="text-amber-600 dark:text-amber-300">Tuấn (A)</strong>, <strong className="text-amber-600 dark:text-amber-300">Tuấn (B)</strong> hoặc <strong className="text-amber-600 dark:text-amber-300">Hoàng (Q1)</strong>, <strong className="text-amber-600 dark:text-amber-300">Hoàng (Q7)</strong>).
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {state.events.map((e) => (
          <button
            key={e.id}
            onClick={() => setSelectedEventId(e.id)}
            className={
              e.id === ev.id
                ? "rounded-lg bg-line px-3 py-2 text-sm font-semibold text-paper"
                : "rounded-lg bg-white/70 px-3 py-2 text-sm font-semibold text-line/70 ring-1 ring-black/5"
            }
          >
            {e.name}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className={showRightPanel ? "lg:col-span-7" : "lg:col-span-12"}>
          <div className="flex flex-wrap items-center gap-2">
            {isTeamMode ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="btn-accent"
                  onClick={addEntry}
                  title={`Thêm đội mới với ${teamPlayerCount} VĐV`}
                >
                  + Thêm đội
                </button>
                <div className="flex items-center gap-1.5 rounded-lg border border-line/25 bg-white dark:bg-card px-2.5 py-1.5 shadow-2xs">
                  <span className="text-xs font-semibold text-line/70 whitespace-nowrap">
                    Số VĐV:
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    className="w-12 text-center text-xs font-bold text-accent bg-transparent outline-none ring-1 ring-line/25 rounded px-1 py-0.5"
                    value={teamPlayerCount}
                    onChange={(e) => handleTeamPlayerCountChange(Number(e.target.value))}
                    title="Nhập số lượng vận động viên cho mỗi đội mới thêm"
                  />
                </div>
              </div>
            ) : (
              <button className="btn-accent" onClick={addEntry}>
                + Thêm {ev.mode === "don" ? "VĐV" : slots === 2 ? "đội" : "VĐV"}
              </button>
            )}
            <button
              type="button"
              className="rounded-lg bg-[#0a3320] hover:bg-[#0a3320]/90 text-white px-3.5 py-2 text-sm font-semibold shadow-xs cursor-pointer transition"
              onClick={() => {
                setTargetSlot(null);
                setLookupModalOpen(true);
              }}
              title="Tra cứu điểm DURP / PVNA"
            >
              DURP/PVNA
            </button>
            <button
              className="btn-ghost"
              onClick={() => fileRef.current?.click()}
              title="Hỗ trợ file .xlsx, .xls, .csv, .tsv (cột STT, Tên, Điểm trình)"
            >
              📥 Import Excel
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={exportAthletesToExcel}
              title="Xuất danh sách VĐV hiện tại ra file Excel (.xlsx)"
            >
              📤 Export Excel
            </button>
            <button
              type="button"
              className="btn-ghost text-xs text-line/60 hover:text-ink"
              onClick={() => setShowExcelGuide((v) => !v)}
              title="Xem hướng dẫn các cột trong file Excel"
            >
              ℹ️ Định dạng file
            </button>
            {ev.mode === "doi" && ev.pairMode === "random" && !isRotatingDoubles(ev) ? (
              <div className="inline-flex items-center gap-1">
                <button className="btn-ghost" onClick={doDraw}>
                  🎲 Bốc thăm ghép đôi
                </button>
                <button
                  type="button"
                  className="btn-ghost !px-2.5 !py-2 text-sm font-bold text-line/70 hover:text-ink hover:bg-line/10 transition cursor-pointer"
                  onClick={handleRestoreDraw}
                  title="Khôi phục trạng thái ban đầu (tách cặp thành từng VĐV riêng lẻ)"
                  aria-label="Khôi phục trạng thái ban đầu"
                >
                  ↺
                </button>
              </div>
            ) : null}
            {entries.length > 0 && (
              <button
                type="button"
                className="btn-ghost text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/40"
                onClick={clearAllEntries}
                title="Xóa nhanh toàn bộ danh sách VĐV của nội dung này"
              >
                🗑️ Xóa toàn bộ ({entries.length})
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt,.tsv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  requireEditConfirmation(() => {
                    void onImport(f);
                  }, "Import danh sách mới sẽ thêm các VĐV vào nội dung này.");
                }
                e.target.value = "";
              }}
            />
          </div>
          {note ? <p className="mt-2 text-xs font-medium text-court">{note}</p> : null}

          {showExcelGuide && (
            <div className="mt-3 rounded-xl border border-line/20 bg-secondary/30 p-3.5 text-xs space-y-2">
              <div className="flex items-center justify-between font-bold text-ink">
                <span>📖 Hướng dẫn định dạng file Excel / CSV:</span>
                <button
                  type="button"
                  className="text-line/40 hover:text-ink cursor-pointer"
                  onClick={() => setShowExcelGuide(false)}
                >
                  ✕ Đóng
                </button>
              </div>
              <p className="text-line/70">
                Web hỗ trợ trực tiếp file Excel (<strong>.xlsx</strong>, <strong>.xls</strong>) và <strong>.csv</strong>. Bạn có thể bấm nút <strong>📋 Tải file mẫu</strong> ở trên để có sẵn cấu trúc chuẩn.
              </p>
              <div className="overflow-x-auto rounded-lg border border-line/15 bg-card p-2 text-[11px]">
                <p className="font-bold text-[#0a3320] mb-1">
                  {isTeamMode
                    ? "Format file nội dung Đồng đội (MLP 4 VĐV):"
                    : slots === 2
                    ? "Format file nội dung Đôi cố định (2 cách):"
                    : "Format file nội dung Đơn hoặc Đôi bốc thăm ngẫu nhiên:"}
                </p>
                {isTeamMode ? (
                  <p className="text-line/70">
                    Cột A: <code>STT</code>, Cột B: <code>Tên Đội</code>, Cột C: <code>Nam 1</code>, Cột D: <code>Nam 2</code>, Cột E: <code>Nữ 1</code>, Cột F: <code>Nữ 2</code>.
                  </p>
                ) : slots === 2 ? (
                  <ul className="list-disc pl-4 space-y-1 text-line/70">
                    <li>
                      <strong>Cách 1 (5 cột chuẩn):</strong> Cột A: <code>STT</code>, Cột B: <code>Tên VĐV 1</code>, Cột C: <code>Điểm trình 1</code>, Cột D: <code>Tên VĐV 2</code>, Cột E: <code>Điểm trình 2</code>.
                    </li>
                    <li>
                      <strong>Cách 2 (2 hoặc 3 cột nhanh):</strong> Cột A: <code>STT</code>, Cột B: <code>Tên cặp VĐV</code> (ghi dạng &quot;VĐV 1 / VĐV 2&quot; hoặc &quot;VĐV 1 - VĐV 2&quot;), Cột C: <code>Điểm trình</code> (tùy chọn, không bắt buộc — có thể tự nhập sau khi đưa lên web).
                    </li>
                  </ul>
                ) : (
                  <ul className="list-disc pl-4 space-y-1 text-line/70">
                    <li>
                      Cột A: <code>STT</code> (1, 2, 3...)
                    </li>
                    <li>
                      Cột B: <code>Họ và tên VĐV</code> (Ví dụ: VĐV 1, VĐV 2...)
                    </li>
                    <li>
                      Cột C: <code>Điểm trình</code> (Ví dụ: 3.5, 4.0 — tùy chọn, có thể nhập sau trên web)
                    </li>
                  </ul>
                )}
              </div>
            </div>
          )}

          <div className="panel mt-4 divide-y divide-line/10 overflow-hidden">
            {entries.length === 0 ? (
              <p className="px-3.5 py-4 text-sm text-line/50">
                {isTeamMode
                  ? "Chưa có Đội nào. Bấm nút '+ Thêm đội' ở trên để tạo đội."
                  : `Chưa có VĐV. Thêm tay hoặc import file CSV (cột: Tên, Điểm trình${slots === 2 ? ", Tên 2, Điểm trình 2" : ""}).`}
              </p>
            ) : (
              entries.map((en, i) => {
                const totalRating = en.players.reduce((sum, p) => sum + (p.rating ?? 0), 0);
                return isTeamMode ? (
                  /* Thể thức Đồng đội — Chuẩn MLP hoặc Tùy chỉnh thủ công */
                  <div key={en.id} className="p-3 sm:p-4 border border-line/20 rounded-[15px] bg-[#f8f7f4] mb-3 last:mb-0 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-line/10">
                      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <span className="font-head font-bold text-xs text-line/50 w-6">#{i + 1}</span>
                        <div className="flex items-center gap-1.5 flex-1 max-w-sm">
                          <input
                            className="field font-bold !text-[17px] !py-1 !px-2.5 flex-1 bg-paper border border-line/20"
                            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                            placeholder={`Tên Đội (VD: Đội ${i + 1}, Team Hà Nội...)`}
                            value={en.teamName ?? ""}
                            onChange={(e) => patchEntry(en.id, { teamName: e.target.value })}
                          />
                        </div>
                        {isCustomTeam && (
                          <span className="text-[11px] font-semibold text-line/60 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full border border-line/15">
                            {en.players.length} VĐV
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-7 px-2.5 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-xs font-bold text-accent tabular-nums"
                          title="Điểm tổng của cả đội"
                        >
                          Tổng trình: {totalRating > 0 ? formatRating(Number(totalRating.toFixed(4))) : "—"}
                        </div>
                        {en.withdrawn ? (
                          <button
                            type="button"
                            onClick={() => toggleWithdrawn(en)}
                            className="rounded-lg bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300 border border-red-300 px-2 py-0.5 text-xs font-bold cursor-pointer"
                            title="Bấm để khôi phục lại quyền thi đấu"
                          >
                            🚫 Bỏ cuộc (Khôi phục)
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleWithdrawn(en)}
                            className="text-line/40 hover:text-red-600 text-xs px-2 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                            title="Đánh dấu bỏ cuộc: Hủy bỏ toàn bộ kết quả trước đó của đội này"
                          >
                            ⚠️ Bỏ cuộc
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-line/40 hover:text-destructive p-1 cursor-pointer"
                          onClick={() => removeEntry(en.id)}
                          aria-label="Xoá đội"
                          title="Xóa đội này"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {!isCustomTeam && en.players.length === 4 ? (
                      /* Chuẩn MLP 4 VĐV: Cột trái (Nam 1 & Nam 2) | Cột phải (Nữ 1 & Nữ 2) */
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* Cột bên trái: Nam 1 và Nam 2 */}
                        <div className="space-y-2">
                          {[0, 1].map((pi) => {
                            const p = en.players[pi] || { name: "", rating: null };
                            const roleLabel = pi === 0 ? "Nam 1" : "Nam 2";
                            return (
                              <div key={pi} className="flex items-center gap-1.5 bg-[#efede5] p-1.5 rounded-[14px] border border-line/20">
                                <input
                                  type="checkbox"
                                  title={`Đóng phí: ${p.name || roleLabel}`}
                                  className="size-3.5 shrink-0 rounded accent-[oklch(0.615_0.145_154.2)] cursor-pointer"
                                  checked={Boolean(p.paid)}
                                  onChange={(e) => patchPlayer(en.id, pi, { paid: e.target.checked })}
                                />
                                <span className="text-[11px] font-semibold text-line/70 shrink-0">
                                  {roleLabel}:
                                </span>
                                <div className="group/slot relative flex-1 min-w-0">
                                  <input
                                    className="field w-full pr-6 !text-[16px] !h-[34px] !py-1 !px-2.5"
                                    placeholder="Nhập tên VĐV"
                                    value={p.name}
                                    onChange={(e) => patchPlayer(en.id, pi, { name: e.target.value })}
                                  />
                                  <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => {
                                      setTargetSlot({
                                        entryId: en.id,
                                        playerIdx: pi,
                                        initialQuery: p.name,
                                        slotLabel: `${p.name || roleLabel} (${en.teamName || `Đội ${i + 1}`})`,
                                      });
                                      setLookupModalOpen(true);
                                    }}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-line/40 hover:text-line cursor-pointer"
                                    title="DURP/PVNA"
                                  >
                                    <svg className="size-3 stroke-line/40 hover:stroke-line/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="11" cy="11" r="7" />
                                      <path d="m21 21-4.35-4.35" />
                                    </svg>
                                  </button>
                                </div>
                                <RatingInput
                                  value={p.rating}
                                  onChange={(rating) => patchPlayer(en.id, pi, { rating })}
                                  className="field !w-[50px] !h-[28px] shrink-0 text-center !px-1 text-[12.5px] font-bold text-ink bg-white border border-line/25 rounded-lg shadow-2xs focus:ring-1 focus:ring-accent tabular-nums"
                                />
                              </div>
                            );
                          })}
                        </div>

                        {/* Cột bên phải: Nữ 1 và Nữ 2 */}
                        <div className="space-y-2">
                          {[2, 3].map((pi) => {
                            const p = en.players[pi] || { name: "", rating: null };
                            const roleLabel = pi === 2 ? "Nữ 1" : "Nữ 2";
                            return (
                              <div key={pi} className="flex items-center gap-1.5 bg-[#efede5] p-1.5 rounded-[14px] border border-line/20">
                                <input
                                  type="checkbox"
                                  title={`Đóng phí: ${p.name || roleLabel}`}
                                  className="size-3.5 shrink-0 rounded accent-[oklch(0.615_0.145_154.2)] cursor-pointer"
                                  checked={Boolean(p.paid)}
                                  onChange={(e) => patchPlayer(en.id, pi, { paid: e.target.checked })}
                                />
                                <span className="text-[11px] font-semibold text-line/70 shrink-0">
                                  {roleLabel}:
                                </span>
                                <div className="group/slot relative flex-1 min-w-0">
                                  <input
                                    className="field w-full pr-6 !text-[16px] !h-[34px] !py-1 !px-2.5"
                                    placeholder="Nhập tên VĐV"
                                    value={p.name}
                                    onChange={(e) => patchPlayer(en.id, pi, { name: e.target.value })}
                                  />
                                  <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => {
                                      setTargetSlot({
                                        entryId: en.id,
                                        playerIdx: pi,
                                        initialQuery: p.name,
                                        slotLabel: `${p.name || roleLabel} (${en.teamName || `Đội ${i + 1}`})`,
                                      });
                                      setLookupModalOpen(true);
                                    }}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-line/40 hover:text-line cursor-pointer"
                                    title="DURP/PVNA"
                                  >
                                    <svg className="size-3 stroke-line/40 hover:stroke-line/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="11" cy="11" r="7" />
                                      <path d="m21 21-4.35-4.35" />
                                    </svg>
                                  </button>
                                </div>
                                <RatingInput
                                  value={p.rating}
                                  onChange={(rating) => patchPlayer(en.id, pi, { rating })}
                                  className="field !w-[50px] !h-[28px] shrink-0 text-center !px-1 text-[12.5px] font-bold text-ink bg-white border border-line/25 rounded-lg shadow-2xs focus:ring-1 focus:ring-accent tabular-nums"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      /* Thể thức Đồng đội Tùy chỉnh (Thủ công) */
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {en.players.map((p, pi) => (
                            <div key={pi} className="flex items-center gap-1.5 bg-[#efede5] p-1.5 rounded-[14px] border border-line/20">
                              <input
                                type="checkbox"
                                title={`Đóng phí: ${p.name || `VĐV ${pi + 1}`}`}
                                className="size-3.5 shrink-0 rounded accent-[oklch(0.615_0.145_154.2)] cursor-pointer"
                                checked={Boolean(p.paid)}
                                onChange={(e) => patchPlayer(en.id, pi, { paid: e.target.checked })}
                              />
                              <span className="text-[11px] font-bold text-line/60 w-5 shrink-0 text-center">
                                #{pi + 1}
                              </span>
                              {/* Ô chọn giới tính: Nam / Nữ / Không chọn */}
                              <select
                                value={p.gender || ""}
                                onChange={(e) =>
                                  patchPlayer(en.id, pi, {
                                    gender: (e.target.value as "nam" | "nu") || undefined,
                                  })
                                }
                                title="Chọn giới tính (hoặc để trống)"
                                className="text-[11px] font-semibold bg-white border border-line/25 rounded-md px-1 py-1 text-ink cursor-pointer outline-none shrink-0"
                              >
                                <option value="">—</option>
                                <option value="nam">Nam</option>
                                <option value="nu">Nữ</option>
                              </select>
                              <div className="group/slot relative flex-1 min-w-0">
                                <input
                                  className="field w-full pr-6 !text-[16px] !h-[34px] !py-1 !px-2.5"
                                  placeholder="Nhập tên VĐV"
                                  value={p.name}
                                  onChange={(e) => patchPlayer(en.id, pi, { name: e.target.value })}
                                />
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  onClick={() => {
                                    setTargetSlot({
                                      entryId: en.id,
                                      playerIdx: pi,
                                      initialQuery: p.name,
                                      slotLabel: `${p.name || `VĐV ${pi + 1}`} (${en.teamName || `Đội ${i + 1}`})`,
                                    });
                                    setLookupModalOpen(true);
                                  }}
                                  className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-line/40 hover:text-line cursor-pointer"
                                  title="DURP/PVNA"
                                >
                                  <svg className="size-3 stroke-line/40 hover:stroke-line/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="7" />
                                    <path d="m21 21-4.35-4.35" />
                                  </svg>
                                </button>
                              </div>
                              <RatingInput
                                value={p.rating}
                                onChange={(rating) => patchPlayer(en.id, pi, { rating })}
                                className="field !w-[50px] !h-[28px] shrink-0 text-center !px-1 text-[12.5px] font-bold text-ink bg-white border border-line/25 rounded-lg shadow-2xs focus:ring-1 focus:ring-accent tabular-nums"
                              />
                              {en.players.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removePlayerFromTeam(en.id, pi)}
                                  className="p-1 text-line/30 hover:text-destructive hover:bg-black/5 rounded cursor-pointer shrink-0"
                                  title="Bớt VĐV này khỏi đội"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="pt-1 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => addPlayerToTeam(en.id)}
                            className="text-xs font-semibold text-accent hover:text-accent-hover hover:underline cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded hover:bg-accent/10"
                          >
                            <span>+</span> Thêm VĐV vào đội này
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : slots === 2 ? (
                  <div key={en.id} className="border-b border-line/10 last:border-b-0">
                    {/* Giao diện điện thoại: mỗi cặp VĐV là 1 card gọn gàng, không bị chồng chéo */}
                    <div className="sm:hidden p-3 space-y-2.5 bg-card">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-head font-bold text-xs text-line/50">#{i + 1}</span>
                          <span className="text-xs font-bold text-ink">Cặp VĐV</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className="flex h-7 px-2.5 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-xs font-bold text-accent tabular-nums"
                            title="Điểm tổng của cả 2 VĐV"
                          >
                            Tổng: {totalRating > 0 ? formatRating(Number(totalRating.toFixed(4))) : "—"}
                          </div>
                          {en.withdrawn ? (
                            <button
                              type="button"
                              onClick={() => toggleWithdrawn(en)}
                              className="rounded-lg bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300 border border-red-300 px-2 py-0.5 text-xs font-bold cursor-pointer"
                              title="Bấm để khôi phục lại quyền thi đấu"
                            >
                              🚫 Bỏ cuộc
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleWithdrawn(en)}
                              className="text-line/40 hover:text-red-600 text-xs px-1.5 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                              title="Đánh dấu bỏ cuộc: Hủy bỏ toàn bộ kết quả trước đó của cặp này"
                            >
                              ⚠️ Bỏ cuộc
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-line/40 hover:text-destructive p-1"
                            onClick={() => removeEntry(en.id)}
                            aria-label="Xoá"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      {en.players.map((p, pi) => (
                        <div key={pi} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            title={`Tình trạng đóng phí: ${p.name || `VĐV ${pi + 1}`}`}
                            className="size-4 shrink-0 rounded accent-[oklch(0.615_0.145_154.2)] cursor-pointer"
                            checked={Boolean(p.paid)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              patchPlayer(en.id, pi, { paid: checked });
                            }}
                          />
                          <div className="group/slot relative flex-1 min-w-0">
                            <input
                              className="field w-full pr-7 !text-xs !py-2 !px-2.5"
                              placeholder={`Nhập tên VĐV ${pi + 1}`}
                              value={p.name}
                              onChange={(e) => patchPlayer(en.id, pi, { name: e.target.value })}
                            />
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => {
                                setTargetSlot({
                                  entryId: en.id,
                                  playerIdx: pi,
                                  initialQuery: p.name,
                                  slotLabel: `${p.name || `VĐV ${pi + 1}`} (Hàng #${i + 1})`,
                                });
                                setLookupModalOpen(true);
                              }}
                              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-line/40 hover:text-line cursor-pointer"
                              title="DURP/PVNA"
                            >
                              <svg className="size-3.5 stroke-line/40 hover:stroke-line/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m21 21-4.35-4.35" />
                              </svg>
                            </button>
                          </div>
                          <RatingInput
                            value={p.rating}
                            onChange={(rating) => patchPlayer(en.id, pi, { rating })}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Giao diện máy tính / tablet */}
                    <div className="hidden sm:flex items-center gap-2 px-3 py-2.5">
                      <span className="w-5 font-head font-bold text-line/40 shrink-0">{i + 1}</span>
                      <div className="flex min-w-[220px] flex-1 items-center gap-2">
                        {en.players.map((p, pi) => (
                          <div key={pi} className="flex min-w-[180px] flex-1 items-center gap-1.5">
                            <input
                              type="checkbox"
                              title={`Tình trạng đóng phí: ${p.name || `VĐV ${pi + 1}`}`}
                              className="size-4 shrink-0 rounded accent-[oklch(0.615_0.145_154.2)] cursor-pointer"
                              checked={Boolean(p.paid)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                patchPlayer(en.id, pi, { paid: checked });
                              }}
                            />
                            <div className="group/slot relative flex-1 min-w-[130px]">
                              <input
                                className="field w-full pr-7"
                                placeholder="Nhập tên"
                                value={p.name}
                                onChange={(e) => patchPlayer(en.id, pi, { name: e.target.value })}
                              />
                              <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => {
                                  setTargetSlot({
                                    entryId: en.id,
                                    playerIdx: pi,
                                    initialQuery: p.name,
                                    slotLabel: `${p.name || `VĐV ${pi + 1}`} (Hàng #${i + 1})`,
                                  });
                                  setLookupModalOpen(true);
                                }}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-line/40 hover:text-line cursor-pointer transition opacity-0 group-hover/slot:opacity-100 group-focus-within/slot:opacity-100"
                                title="DURP/PVNA"
                              >
                                <svg
                                  className="size-3.5 stroke-line/40 hover:stroke-line/70"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <circle cx="11" cy="11" r="7" />
                                  <path d="m21 21-4.35-4.35" />
                                </svg>
                              </button>
                            </div>
                            <RatingInput
                              value={p.rating}
                              onChange={(rating) => patchPlayer(en.id, pi, { rating })}
                            />
                          </div>
                        ))}
                        <div
                          className="flex h-9 w-16 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-xs font-bold text-accent shadow-2xs tabular-nums"
                          title="Điểm tổng của cả 2 VĐV"
                        >
                          <span>{totalRating > 0 ? formatRating(Number(totalRating.toFixed(4))) : "—"}</span>
                        </div>
                        {en.withdrawn ? (
                          <button
                            type="button"
                            onClick={() => toggleWithdrawn(en)}
                            className="rounded-lg bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300 border border-red-300 px-2 py-1 text-xs font-bold cursor-pointer shrink-0"
                            title="Bấm để khôi phục lại quyền thi đấu"
                          >
                            🚫 Bỏ cuộc
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleWithdrawn(en)}
                            className="text-line/40 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer shrink-0"
                            title="Đánh dấu bỏ cuộc: Hủy bỏ toàn bộ kết quả trước đó của cặp này"
                          >
                            ⚠️ Bỏ cuộc
                          </button>
                        )}
                      </div>
                      <button
                        className="text-line/40 hover:text-destructive shrink-0 p-1"
                        onClick={() => removeEntry(en.id)}
                        aria-label="Xoá"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Đơn (slots === 1) */
                  <div key={en.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-line/10 last:border-b-0">
                    <span className="w-5 font-head font-bold text-line/40 shrink-0">{i + 1}</span>
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                      {en.players.map((p, pi) => (
                        <div key={pi} className="flex flex-1 items-center gap-1.5 min-w-0">
                          <input
                            type="checkbox"
                            title={`Tình trạng đóng phí: ${p.name || `VĐV ${pi + 1}`}`}
                            className="size-4 shrink-0 rounded accent-[oklch(0.615_0.145_154.2)] cursor-pointer"
                            checked={Boolean(p.paid)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              patchPlayer(en.id, pi, { paid: checked });
                            }}
                          />
                          <div className="group/slot relative flex-1 min-w-0">
                            <input
                              className="field w-full pr-7 !text-xs sm:!text-sm"
                              placeholder="Nhập tên"
                              value={p.name}
                              onChange={(e) => patchPlayer(en.id, pi, { name: e.target.value })}
                            />
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => {
                                setTargetSlot({
                                  entryId: en.id,
                                  playerIdx: pi,
                                  initialQuery: p.name,
                                  slotLabel: `${p.name || `VĐV ${pi + 1}`} (Hàng #${i + 1})`,
                                });
                                setLookupModalOpen(true);
                              }}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-line/40 hover:text-line cursor-pointer"
                              title="DURP/PVNA"
                            >
                              <svg
                                className="size-3.5 stroke-line/40 hover:stroke-line/70"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <circle cx="11" cy="11" r="7" />
                                <path d="m21 21-4.35-4.35" />
                              </svg>
                            </button>
                          </div>
                          <RatingInput
                            value={p.rating}
                            onChange={(rating) => patchPlayer(en.id, pi, { rating })}
                          />
                        </div>
                      ))}
                    </div>
                    {en.withdrawn ? (
                      <button
                        type="button"
                        onClick={() => toggleWithdrawn(en)}
                        className="rounded-lg bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300 border border-red-300 px-2 py-0.5 text-xs font-bold cursor-pointer shrink-0"
                        title="Bấm để khôi phục lại quyền thi đấu"
                      >
                        🚫 Bỏ cuộc
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleWithdrawn(en)}
                        className="text-line/40 hover:text-red-600 text-xs px-2 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer shrink-0"
                        title="Đánh dấu bỏ cuộc: Hủy bỏ toàn bộ kết quả trước đó của VĐV này"
                      >
                        ⚠️ Bỏ cuộc
                      </button>
                    )}
                    <button
                      className="text-line/40 hover:text-destructive shrink-0 p-1"
                      onClick={() => removeEntry(en.id)}
                      aria-label="Xoá"
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 flex gap-3">
            <Link to="/quan-ly-giai" className="btn-accent">
              Tiếp tục — Quản lý giải đấu
            </Link>
          </div>
        </div>

        {showRightPanel && (
          <div className="lg:col-span-5 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <p className="eyebrow">Chia bảng</p>
                {ev.groups.length > 0 && (
                  <button
                    className="text-xs font-semibold text-accent hover:underline cursor-pointer"
                    onClick={() => setShowPrintModal(true)}
                  >
                    📄 Xuất bảng đấu (In / PDF)
                  </button>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-line/70">
                    Số bảng
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={64}
                    className="field mt-1.5 w-20 text-center"
                    value={ev.groupCount}
                    onChange={(e) => handleGroupCountChange(Number(e.target.value) || 1)}
                  />
                </div>
                <button
                  className="btn-accent"
                  onClick={autoGroups}
                  title="Tự động chia và xáo trộn ngẫu nhiên các đội vào các bảng"
                >
                  Chia bảng tự động
                </button>
                <button
                  className="btn-ghost"
                  onClick={() =>
                    updateEvent(ev.id, {
                      groups: Array.from({ length: ev.groupCount }, (_, i) => ({
                        name: getGroupName(i),
                        entryIds: [],
                      })),
                    })
                  }
                >
                  Làm trống
                </button>
              </div>

              <p className="mt-3 text-xs text-line/60">
                💡 Kéo thả thẻ đội vào các ô bảng bên dưới để chia thủ công theo ý bạn.
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {ev.groups.map((g, gi) => (
                  <div
                    key={g.name}
                    data-group-idx={gi}
                    className={`panel p-3 transition-colors ${
                      touchOverGroupIdx === gi
                        ? "border-2 border-accent bg-accent/15 ring-2 ring-accent/30"
                        : dragEntryId
                          ? "border-2 border-dashed border-accent/40 bg-accent/5"
                          : ""
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain") || dragEntryId;
                      if (id) moveEntry(id, gi);
                      setDragEntryId(null);
                      setTouchOverGroupIdx(null);
                    }}
                  >
                    <div className="flex items-center justify-between pointer-events-none">
                      <p className="font-head text-lg font-bold uppercase tracking-tight text-accent">
                        {g.name}
                      </p>
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">
                        {g.entryIds.length} đội
                      </span>
                    </div>
                    <div className="mt-2 min-h-[60px] space-y-1.5">
                      {g.entryIds.length === 0 ? (
                        <div className="flex h-[56px] items-center justify-center rounded-lg border border-dashed border-line/20 text-xs text-line/40 pointer-events-none">
                          Thả đội vào đây
                        </div>
                      ) : (
                        g.entryIds.map((id) => {
                          const entry = entries.find((e) => e.id === id);
                          const pts = entry ? entry.players.reduce((sum, p) => sum + (p.rating ?? 0), 0) : 0;
                          const isPair = entry && entry.players.length === 2 && entry.players[0]?.name && entry.players[1]?.name;
                          const isBeingDragged = dragEntryId === id;
                          const isOverThisEntry = touchOverEntryId === id && dragEntryId !== id;
                          return (
                            <div
                              key={id}
                              data-group-entry-id={id}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", id);
                                setDragEntryId(id);
                              }}
                              onDragEnd={() => {
                                setDragEntryId(null);
                                setTouchOverGroupIdx(null);
                                setTouchOverEntryId(null);
                                setTouchOverUnassigned(false);
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                e.dataTransfer.dropEffect = "move";
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const sourceId = e.dataTransfer.getData("text/plain") || dragEntryId;
                                if (sourceId && sourceId !== id) {
                                  swapEntriesInGroups(sourceId, id);
                                  setDragEntryId(null);
                                }
                              }}
                              className={`flex items-center justify-between gap-1.5 rounded-lg bg-paper p-2 text-xs font-semibold shadow-xs ring-1 transition-all ${
                                isBeingDragged
                                  ? "opacity-50 ring-2 ring-accent border-dashed"
                                  : isOverThisEntry
                                    ? "ring-2 ring-accent bg-accent/15 scale-[1.01]"
                                    : "ring-line/15 hover:ring-accent/60"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                {/* Nút kéo 6 chấm tròn hỗ trợ touch & mouse */}
                                <div
                                  style={{ touchAction: "none" }}
                                  className="flex items-center justify-center p-1 cursor-grab active:cursor-grabbing text-line/40 hover:text-accent shrink-0 rounded hover:bg-black/5 dark:hover:bg-white/5"
                                  title="Kéo thả để chuyển bảng hoặc đổi chỗ"
                                  onTouchStart={() => {
                                    setDragEntryId(id);
                                    try { navigator.vibrate?.(15); } catch {}
                                  }}
                                  onTouchMove={(e) => {
                                    const touch = e.touches[0];
                                    if (!touch) return;
                                    const target = document.elementFromPoint(touch.clientX, touch.clientY);
                                    
                                    const groupEl = target?.closest("[data-group-idx]");
                                    if (groupEl) {
                                      const gIdx = Number(groupEl.getAttribute("data-group-idx"));
                                      if (!isNaN(gIdx)) setTouchOverGroupIdx(gIdx);
                                    } else {
                                      setTouchOverGroupIdx(null);
                                    }

                                    const entryEl = target?.closest("[data-group-entry-id]");
                                    if (entryEl) {
                                      const targetEid = entryEl.getAttribute("data-group-entry-id");
                                      if (targetEid && targetEid !== id) {
                                        setTouchOverEntryId(targetEid);
                                      } else {
                                        setTouchOverEntryId(null);
                                      }
                                    } else {
                                      setTouchOverEntryId(null);
                                    }

                                    const unassignedEl = target?.closest("[data-unassigned-pool]");
                                    setTouchOverUnassigned(Boolean(unassignedEl));
                                  }}
                                  onTouchEnd={() => {
                                    if (dragEntryId) {
                                      if (touchOverEntryId && touchOverEntryId !== dragEntryId) {
                                        swapEntriesInGroups(dragEntryId, touchOverEntryId);
                                        try { navigator.vibrate?.(25); } catch {}
                                      } else if (touchOverGroupIdx !== null) {
                                        moveEntry(dragEntryId, touchOverGroupIdx);
                                        try { navigator.vibrate?.(25); } catch {}
                                      } else if (touchOverUnassigned) {
                                        removeFromGroups(dragEntryId);
                                        try { navigator.vibrate?.(25); } catch {}
                                      }
                                    }
                                    setDragEntryId(null);
                                    setTouchOverGroupIdx(null);
                                    setTouchOverEntryId(null);
                                    setTouchOverUnassigned(false);
                                  }}
                                >
                                  <svg className="size-3.5 shrink-0 pointer-events-none" viewBox="0 0 16 16" fill="currentColor">
                                    <circle cx="5" cy="4" r="1.5" />
                                    <circle cx="11" cy="4" r="1.5" />
                                    <circle cx="5" cy="8" r="1.5" />
                                    <circle cx="11" cy="8" r="1.5" />
                                    <circle cx="5" cy="12" r="1.5" />
                                    <circle cx="11" cy="12" r="1.5" />
                                  </svg>
                                </div>

                                {entry && (
                                  <div
                                    className="flex items-center gap-1 shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {entry.players.map((p, pIdx) => (
                                      <input
                                        key={pIdx}
                                        type="checkbox"
                                        checked={Boolean(p.paid)}
                                        title={`${p.name || `VĐV ${pIdx + 1}`}: ${Boolean(p.paid) ? "Đã đóng phí" : "Chưa đóng phí"}`}
                                        className="size-3.5 rounded accent-[oklch(0.615_0.145_154.2)] cursor-pointer"
                                        onChange={(e) => {
                                          const checked = e.target.checked;
                                          patchPlayer(entry.id, pIdx, { paid: checked });
                                        }}
                                      />
                                    ))}
                                  </div>
                                )}
                                {isPair ? (
                                  <div className="flex flex-col min-w-0 flex-1">
                                    <span className="truncate font-bold text-ink">
                                      {entry.players[0]?.name} / {entry.players[1]?.name}
                                    </span>
                                    <span className="text-[10px] text-line/60">
                                      Tổng điểm: <strong className="text-accent font-bold">{pts > 0 ? formatRating(Number(pts.toFixed(4))) : "0"}</strong>
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <span className="truncate flex-1">{entryName(entry)}</span>
                                    {pts > 0 && (
                                      <span className="shrink-0 rounded bg-accent/15 px-1 py-0.5 text-[10px] font-bold text-accent">
                                        {formatRating(Number(pts.toFixed(4)))}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <button
                                className="text-line/40 hover:text-destructive shrink-0 p-1 cursor-pointer"
                                onClick={() => removeFromGroups(id)}
                                title="Bỏ khỏi bảng"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Khu vực các đội chưa xếp bảng */}
              {ev.groups.length > 0 &&
              entries.some((e) => !ev.groups.some((g) => g.entryIds.includes(e.id))) ? (
                <div
                  data-unassigned-pool="true"
                  className={`panel mt-4 p-3.5 transition-colors ${
                    touchOverUnassigned
                      ? "border-2 border-accent bg-accent/15 ring-2 ring-accent/30"
                      : ""
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain") || dragEntryId;
                    if (id) removeFromGroups(id);
                    setDragEntryId(null);
                    setTouchOverUnassigned(false);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-line/70">
                      Chưa xếp bảng ({entries.filter((e) => !ev.groups.some((g) => g.entryIds.includes(e.id))).length} đội)
                    </p>
                    <span className="text-[11px] text-line/50">Kéo thả vào các bảng ở trên</span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {entries
                      .filter((e) => !ev.groups.some((g) => g.entryIds.includes(e.id)))
                      .map((e) => {
                        const pts = e.players.reduce((sum, p) => sum + (p.rating ?? 0), 0);
                        const isPair = e.players.length === 2 && e.players[0]?.name && e.players[1]?.name;
                        const isBeingDragged = dragEntryId === e.id;
                        return (
                          <div
                            key={e.id}
                            draggable
                            onDragStart={(evt) => {
                              evt.dataTransfer.setData("text/plain", e.id);
                              setDragEntryId(e.id);
                            }}
                            onDragEnd={() => {
                              setDragEntryId(null);
                              setTouchOverGroupIdx(null);
                              setTouchOverUnassigned(false);
                            }}
                            className={`flex items-center gap-1.5 rounded-lg bg-card px-2.5 py-1.5 text-xs font-semibold shadow-xs ring-1 transition-all ${
                              isBeingDragged
                                ? "opacity-50 ring-2 ring-accent"
                                : "ring-line/20 hover:border-accent hover:ring-accent"
                            }`}
                          >
                            {/* Nút kéo 6 chấm tròn hỗ trợ touch & mouse */}
                            <div
                              style={{ touchAction: "none" }}
                              className="flex items-center justify-center p-0.5 cursor-grab active:cursor-grabbing text-line/40 hover:text-accent shrink-0 rounded hover:bg-black/5 dark:hover:bg-white/5"
                              title="Kéo thả vào ô bảng ở trên"
                              onTouchStart={() => {
                                setDragEntryId(e.id);
                                try { navigator.vibrate?.(15); } catch {}
                              }}
                              onTouchMove={(evt) => {
                                const touch = evt.touches[0];
                                if (!touch) return;
                                const target = document.elementFromPoint(touch.clientX, touch.clientY);
                                const groupEl = target?.closest("[data-group-idx]");
                                if (groupEl) {
                                  const gIdx = Number(groupEl.getAttribute("data-group-idx"));
                                  if (!isNaN(gIdx)) {
                                    setTouchOverGroupIdx(gIdx);
                                  }
                                } else {
                                  setTouchOverGroupIdx(null);
                                }
                              }}
                              onTouchEnd={() => {
                                if (dragEntryId && touchOverGroupIdx !== null) {
                                  moveEntry(dragEntryId, touchOverGroupIdx);
                                  try { navigator.vibrate?.(25); } catch {}
                                }
                                setDragEntryId(null);
                                setTouchOverGroupIdx(null);
                              }}
                            >
                              <svg className="size-3.5 shrink-0 pointer-events-none" viewBox="0 0 16 16" fill="currentColor">
                                <circle cx="5" cy="4" r="1.5" />
                                <circle cx="11" cy="4" r="1.5" />
                                <circle cx="5" cy="8" r="1.5" />
                                <circle cx="11" cy="8" r="1.5" />
                                <circle cx="5" cy="12" r="1.5" />
                                <circle cx="11" cy="12" r="1.5" />
                              </svg>
                            </div>

                            <div
                              className="flex items-center gap-1 shrink-0"
                              onClick={(evt) => evt.stopPropagation()}
                            >
                              {e.players.map((p, pIdx) => (
                                <input
                                  key={pIdx}
                                  type="checkbox"
                                  checked={Boolean(p.paid)}
                                  title={`${p.name || `VĐV ${pIdx + 1}`}: ${Boolean(p.paid) ? "Đã đóng phí" : "Chưa đóng phí"}`}
                                  className="size-3.5 rounded accent-[oklch(0.615_0.145_154.2)] cursor-pointer"
                                  onChange={(evt) => {
                                    const checked = evt.target.checked;
                                    patchPlayer(e.id, pIdx, { paid: checked });
                                  }}
                                />
                              ))}
                            </div>
                            {isPair ? (
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="truncate max-w-[150px] font-bold text-ink">
                                  {e.players[0]?.name || "VĐV 1"} / {e.players[1]?.name || "VĐV 2"}
                                </span>
                                <span className="text-[10px] text-line/60">
                                  Tổng điểm: <strong className="text-accent font-bold">{pts > 0 ? formatRating(Number(pts.toFixed(4))) : "0"}</strong>
                                </span>
                              </div>
                            ) : (
                              <>
                                <span className="truncate max-w-[140px]">{entryName(e)}</span>
                                {pts > 0 && (
                                  <span className="rounded bg-accent/15 px-1 py-0.5 text-[10px] font-bold text-accent">
                                    {formatRating(Number(pts.toFixed(4)))}
                                  </span>
                                )}
                              </>
                            )}
                            <select
                              className="rounded bg-paper px-1 py-0.5 text-[10px] ring-1 ring-line/15"
                              value=""
                              onChange={(x) => moveEntry(e.id, Number(x.target.value))}
                            >
                              <option value="">Vào bảng</option>
                              {ev.groups.map((gg, i) => (
                                <option key={gg.name} value={i}>
                                  {gg.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : null}

              <Link to="/quan-ly-giai" className="btn-accent mt-4">
                Tiếp tục — Quản lý giải đấu
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Modal Xuất Bảng Đấu (PDF / In) */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-xs">
          <div className="max-h-[96vh] w-full max-w-[96vw] xl:max-w-7xl overflow-y-auto rounded-2xl bg-paper p-4 sm:p-5 shadow-2xl ring-1 ring-line/20">
            <div className="flex items-center justify-between border-b border-line/15 pb-3 print:hidden">
              <div>
                <h2 className="font-head text-xl font-bold uppercase tracking-tight">
                  Bảng thi đấu — {ev.name}
                </h2>
                <p className="text-xs text-line/60">
                  {state.name || "Giải đấu Pickleball"} {state.date ? `· ${state.date}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isTeamMode && (
                  <button
                    type="button"
                    onClick={() => setShowTeamMembersInPrint((v) => !v)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                      showTeamMembersInPrint
                        ? "bg-accent text-accent-foreground border-accent shadow-xs"
                        : "bg-card text-line/80 border-line/20 hover:bg-card/80"
                    }`}
                    title="Bật/Tắt hiển thị danh sách các VĐV trong từng đội trên bảng in"
                  >
                    <span>{showTeamMembersInPrint ? "✓ Đang hiện thành viên" : "👥 Hiện thành viên đội"}</span>
                  </button>
                )}
                <button
                  className="btn-accent text-xs !py-1.5"
                  onClick={() => window.print()}
                >
                  🖨️ In / Lưu PDF
                </button>
                <button
                  className="btn-ghost text-xs !py-1.5"
                  onClick={() => setShowPrintModal(false)}
                >
                  Đóng
                </button>
              </div>
            </div>

            {/* Vùng chỉ in bảng đấu - Dàn 4 bảng một hàng vừa vặn trọn trang */}
            <div className="mt-4 space-y-4 print:m-0 print:p-0">
              <div className="text-center">
                <h1 className="font-head text-2xl font-extrabold uppercase tracking-tight print:text-xl">
                  {state.name || "GIẢI ĐẤU PICKLEBALL"}
                </h1>
                <p className="mt-0.5 text-sm font-semibold uppercase tracking-wider text-accent print:text-xs">
                  DANH SÁCH CHIA BẢNG — {ev.name}
                </p>
                {state.venue && <p className="text-[11px] text-line/60">{state.venue}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:grid-cols-4 print:gap-2">
                {ev.groups.map((g) => (
                  <div
                    key={g.name}
                    className="rounded-xl border border-line/20 bg-card p-3 print:p-2 print:border-black shadow-xs"
                  >
                    <div className="flex items-center justify-between border-b border-line/15 pb-1.5">
                      <h3 className="font-head text-base font-bold uppercase tracking-tight text-accent print:text-sm">
                        {g.name}
                      </h3>
                      <span className="text-[11px] font-semibold text-line/60">
                        {g.entryIds.length} đội
                      </span>
                    </div>
                    <div className="mt-2 divide-y divide-line/10">
                      {g.entryIds.map((id, idx) => {
                        const entry = entries.find((e) => e.id === id);
                        return (
                          <div key={id} className="py-1.5 text-xs">
                            <div className="flex items-center">
                              <span className="font-head font-bold text-line/40 w-4 shrink-0">
                                {idx + 1}.
                              </span>
                              <span className="font-semibold text-line truncate">
                                {entryName(entry)}
                              </span>
                            </div>
                            {showTeamMembersInPrint && isTeamMode && entry && (
                              <div className="pl-4 mt-1 grid grid-cols-4 gap-1 text-[10px] text-line/80 font-medium">
                                {entry.players.slice(0, 4).map((p, pidx) => (
                                  <span
                                    key={pidx}
                                    className="truncate text-center bg-black/5 dark:bg-white/5 px-1 py-0.5 rounded border border-line/10 leading-tight"
                                    title={p.name || "—"}
                                  >
                                    {p.name || "—"}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal xác nhận thao tác / Cảnh báo chỉnh sửa */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl ring-1 ring-line/20 border border-line/10 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <span className={`text-2xl ${confirmModal.isDestructive ? "text-red-500" : "text-amber-500"}`}>
                {confirmModal.isDestructive ? "🗑️" : "⚠️"}
              </span>
              <h3 className="font-head text-lg font-bold text-ink">
                {confirmModal.title}
              </h3>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-line/80 whitespace-pre-line">
              {confirmModal.message}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                className="btn-ghost text-xs !py-2 !px-4 cursor-pointer"
                onClick={() => setConfirmModal(null)}
              >
                {confirmModal.cancelText || "Hủy bỏ"}
              </button>
              <button
                type="button"
                className={
                  confirmModal.isDestructive
                    ? "rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs py-2 px-4 shadow-sm transition-all cursor-pointer"
                    : "btn-accent text-xs !py-2 !px-4 cursor-pointer"
                }
                onClick={confirmModal.onConfirm}
              >
                {confirmModal.confirmText || "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal tra cứu điểm DUPR & PVNA */}
      <DuprPvnaLookupModal
        isOpen={lookupModalOpen}
        onClose={() => {
          setLookupModalOpen(false);
          setTargetSlot(null);
        }}
        targetSlotLabel={targetSlot?.slotLabel}
        initialQuery={targetSlot?.initialQuery || ""}
        onSelectPlayer={handleSelectRatedPlayer}
      />
    </div>
  );
}

function formatRating(v: number | null | undefined): string {
  if (v === null || v === undefined || isNaN(v)) return "";
  const rounded = Number(v.toFixed(4));
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
}

function RatingInput({
  value,
  onChange,
  className,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  className?: string;
}) {
  const [raw, setRaw] = useState(formatRating(value));
  useEffect(() => {
    if (num(raw) !== value) setRaw(formatRating(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleBlur = () => {
    const n = num(raw);
    if (n !== null) {
      setRaw(formatRating(n));
      onChange(n);
    } else {
      setRaw("");
      onChange(null);
    }
  };

  return (
    <input
      className={
        className ||
        "field !w-16 sm:!w-20 shrink-0 text-center !px-1 text-xs sm:text-sm font-semibold tabular-nums"
      }
      placeholder="—"
      inputMode="decimal"
      value={raw}
      onBlur={handleBlur}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.,]/g, "");
        setRaw(t);
        onChange(num(t));
      }}
    />
  );
}

function num(v: string | undefined): number | null {
  if (!v || !v.trim()) return null;
  const cleaned = v.replace(/[đd\s]+$/i, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
