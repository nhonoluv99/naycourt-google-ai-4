import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  drawPairs,
  entryName,
  getGroupName,
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
  const { state, update, updateEvent } = useTournament();
  const [activeId, setActiveId] = useState<string>(state.events[0]?.id ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");

  const ev: TEvent | undefined = state.events.find((e) => e.id === activeId) ?? state.events[0];
  const entries = useMemo(
    () => state.entries.filter((e) => ev && e.eventId === ev.id),
    [state.entries, ev],
  );

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

  const slots = ev.mode === "don" ? 1 : ev.pairMode === "fixed" ? 2 : 1;

  const setEntries = (next: Entry[]) =>
    update({ entries: [...state.entries.filter((e) => e.eventId !== ev.id), ...next] });

  const addEntry = () =>
    setEntries([
      ...entries,
      {
        id: uid(),
        eventId: ev.id,
        players: Array.from({ length: slots }, () => ({ name: "", rating: null })),
        paid: false,
      },
    ]);

  const patchEntry = (id: string, patch: Partial<Entry>) =>
    setEntries(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const patchPlayer = (id: string, idx: number, patch: Partial<Entry["players"][number]>) =>
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

  const removeEntry = (id: string) => setEntries(entries.filter((e) => e.id !== id));

  const onImport = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    const imported: Entry[] = [];
    rows.forEach((cols, i) => {
      if (i === 0 && /t[eê]n|name/i.test(cols[0] ?? "")) return;
      const players: Entry["players"] = [];
      if (slots === 2) {
        players.push({ name: cols[0] ?? "", rating: num(cols[1]) });
        players.push({ name: cols[2] ?? "", rating: num(cols[3]) });
      } else {
        players.push({ name: cols[0] ?? "", rating: num(cols[1]) });
      }
      if (players.some((p) => p.name)) {
        imported.push({ id: uid(), eventId: ev.id, players, paid: false });
      }
    });
    setEntries([...entries, ...imported]);
    setNote(`Đã import ${imported.length} dòng.`);
  };

  const doDraw = () => {
    // Điểm trình là tuỳ chọn: ai chưa có điểm sẽ được xem như 0 khi cân bằng cặp.
    const paired = drawPairs(entries, ev.id);
    setEntries(paired);
    setNote(`Đã bốc thăm ${paired.length} đội.`);
  };

  const autoGroups = () => {
    updateEvent(ev.id, { groups: splitGroups(entries, ev.groupCount) });
    setNote(`Đã chia ${ev.groupCount} bảng tự động.`);
  };

  const reDrawGroups = () => {
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
    setNote(`Đã chia lại ngẫu nhiên ${n} bảng thành công.`);
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
  const [showPrintModal, setShowPrintModal] = useState(false);

  return (
    <div>
      <h1 className="text-balance font-head text-4xl font-bold uppercase leading-none tracking-tighter text-[#0a3320]">
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
            onClick={() => setActiveId(e.id)}
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
        <div className="lg:col-span-7">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-accent" onClick={addEntry}>
              + Thêm {ev.mode === "don" ? "VĐV" : slots === 2 ? "đội" : "VĐV"}
            </button>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
              Import Excel/CSV
            </button>
            {ev.mode === "doi" && ev.pairMode === "random" ? (
              <button className="btn-ghost" onClick={doDraw}>
                🎲 Bốc thăm ghép đôi
              </button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.tsv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImport(f);
                e.target.value = "";
              }}
            />
          </div>
          {note ? <p className="mt-2 text-xs font-medium text-court">{note}</p> : null}

          <div className="panel mt-4 divide-y divide-line/10 overflow-hidden">
            {entries.length === 0 ? (
              <p className="px-3.5 py-4 text-sm text-line/50">
                Chưa có VĐV. Thêm tay hoặc import file CSV (cột: Tên, Điểm trình
                {slots === 2 ? ", Tên 2, Điểm trình 2" : ""}).
              </p>
            ) : (
              entries.map((en, i) => {
                const totalRating = en.players.reduce((sum, p) => sum + (p.rating ?? 0), 0);
                return (
                  <div key={en.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                    <span className="w-5 font-head font-bold text-line/40">{i + 1}</span>
                    <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-2">
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
                          <input
                            className="field"
                            placeholder={en.players.length > 1 ? `VĐV ${pi + 1}` : "Tên VĐV"}
                            value={p.name}
                            onChange={(e) => patchPlayer(en.id, pi, { name: e.target.value })}
                          />
                          <RatingInput
                            value={p.rating}
                            onChange={(rating) => patchPlayer(en.id, pi, { rating })}
                          />
                        </div>
                      ))}
                      {en.players.length > 1 && (
                        <div
                          className="flex h-9 shrink-0 items-center justify-center rounded-md border border-accent/40 bg-accent/10 px-2.5 text-xs font-bold text-accent"
                          title="Tổng điểm trình của cả 2 VĐV cộng lại (đầy đủ số thập phân)"
                        >
                          <span className="text-[10px] uppercase text-accent/70 mr-1">Tổng:</span>
                          <span>{totalRating > 0 ? Number(totalRating.toFixed(4)) : "—"}</span>
                        </div>
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
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Chia bảng</p>
            {ev.groups.length > 0 && (
              <button
                className="text-xs font-semibold text-accent hover:underline"
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
            <button className="btn-accent" onClick={autoGroups}>
              Chia bảng tự động
            </button>
            <button className="btn-ghost" onClick={reDrawGroups} title="Chia ngẫu nhiên thêm lần nữa">
              🎲 Chia lại bảng
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
                className={`panel p-3 transition-colors ${
                  dragEntryId ? "border-2 border-dashed border-accent/40 bg-accent/5" : ""
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
                }}
              >
                <div className="flex items-center justify-between">
                  <p className="font-head text-lg font-bold uppercase tracking-tight text-accent">
                    {g.name}
                  </p>
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">
                    {g.entryIds.length} đội
                  </span>
                </div>
                <div className="mt-2 min-h-[60px] space-y-1.5">
                  {g.entryIds.length === 0 ? (
                    <div className="flex h-[56px] items-center justify-center rounded-lg border border-dashed border-line/20 text-xs text-line/40">
                      Thả đội vào đây
                    </div>
                  ) : (
                    g.entryIds.map((id) => {
                      const entry = entries.find((e) => e.id === id);
                      const pts = entry ? entry.players.reduce((sum, p) => sum + (p.rating ?? 0), 0) : 0;
                      return (
                        <div
                          key={id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", id);
                            setDragEntryId(id);
                          }}
                          onDragEnd={() => setDragEntryId(null)}
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
                          className="flex cursor-grab items-center justify-between gap-1.5 rounded-lg bg-paper p-2 text-xs font-semibold shadow-xs ring-1 ring-line/15 active:cursor-grabbing hover:ring-accent/60"
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {/* Ô tích đóng phí cho từng VĐV trong đội */}
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
                            <span className="truncate flex-1">{entryName(entry)}</span>
                          </div>
                          {pts > 0 && (
                            <span className="shrink-0 rounded bg-accent/15 px-1 py-0.5 text-[10px] font-bold text-accent">
                              {Number(pts.toFixed(4))}đ
                            </span>
                          )}
                          <button
                            className="text-line/40 hover:text-destructive shrink-0"
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
              className="panel mt-4 p-3.5"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragEntryId;
                if (id) removeFromGroups(id);
                setDragEntryId(null);
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
                    return (
                      <div
                        key={e.id}
                        draggable
                        onDragStart={(evt) => {
                          evt.dataTransfer.setData("text/plain", e.id);
                          setDragEntryId(e.id);
                        }}
                        onDragEnd={() => setDragEntryId(null)}
                        className="flex cursor-grab items-center gap-2 rounded-lg bg-card px-2.5 py-1.5 text-xs font-semibold shadow-xs ring-1 ring-line/20 active:cursor-grabbing hover:border-accent hover:ring-accent"
                      >
                        {/* Ô tích đóng phí cho từng VĐV */}
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
                        <span className="truncate max-w-[140px]">{entryName(e)}</span>
                        {pts > 0 && (
                          <span className="rounded bg-accent/15 px-1 py-0.5 text-[10px] font-bold text-accent">
                            {Number(pts.toFixed(4))}đ
                          </span>
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
                          <div key={id} className="flex items-center py-1.5 text-xs">
                            <span className="font-head font-bold text-line/40 w-4 shrink-0">
                              {idx + 1}.
                            </span>
                            <span className="font-medium text-line truncate">
                              {entryName(entry)}
                            </span>
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
    </div>
  );
}

function RatingInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [raw, setRaw] = useState(value === null ? "" : String(value));
  useEffect(() => {
    if (num(raw) !== value) setRaw(value === null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className="field w-20 shrink-0 text-center"
      placeholder="—"
      inputMode="decimal"
      value={raw}
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
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
