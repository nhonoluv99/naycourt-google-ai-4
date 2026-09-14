import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  drawPairs,
  entryName,
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
        <h1 className="font-head text-4xl font-bold uppercase tracking-tighter">Danh sách VĐV</h1>
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
      entries.map((e) =>
        e.id === id
          ? {
              ...e,
              players: e.players.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
            }
          : e,
      ),
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
    const n = Math.max(1, Math.min(ev.groupCount, 8));
    const groups = Array.from({ length: n }, (_, i) => ({
      name: `Bảng ${"ABCDEFGH"[i]}`,
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

  const [dragEntryId, setDragEntryId] = useState<string | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  return (
    <div>
      <h1 className="text-balance font-head text-4xl font-bold uppercase leading-none tracking-tighter">
        Danh sách VĐV
      </h1>

      {/* Cảnh báo trùng tên VĐV */}
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
        <span className="text-base leading-none">⚠️</span>
        <div>
          <span className="font-bold">Lưu ý quan trọng khi nhập tên VĐV:</span> Nếu có cùng 1 tên VĐV tham gia ở các nội dung khác nhau, hoặc cùng 1 nội dung có 2 VĐV trùng tên, timeline và hệ thống nhận diện trận đấu sẽ bị lỗi nhầm lẫn. Vui lòng thêm ký hiệu phân biệt khi nhập (ví dụ: <strong className="text-amber-600 dark:text-amber-300">Tuấn (A)</strong>, <strong className="text-amber-600 dark:text-amber-300">Tuấn (B)</strong> hoặc <strong className="text-amber-600 dark:text-amber-300">Hoàng (Q1)</strong>, <strong className="text-amber-600 dark:text-amber-300">Hoàng (Q7)</strong>).
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
                const totalRating =
                  slots === 2
                    ? (en.players[0]?.rating ?? 0) + (en.players[1]?.rating ?? 0)
                    : en.players[0]?.rating ?? 0;
                return (
                  <div key={en.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                    <span className="w-5 font-head font-bold text-line/40">{i + 1}</span>
                    <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-2">
                      {en.players.map((p, pi) => (
                        <div key={pi} className="flex min-w-[170px] flex-1 gap-1.5">
                          <input
                            className="field"
                            placeholder={slots === 2 ? `VĐV ${pi + 1}` : "Tên VĐV"}
                            value={p.name}
                            onChange={(e) => patchPlayer(en.id, pi, { name: e.target.value })}
                          />
                          <RatingInput
                            value={p.rating}
                            onChange={(rating) => patchPlayer(en.id, pi, { rating })}
                          />
                        </div>
                      ))}
                      {slots === 2 && (
                        <div
                          className="flex h-9 shrink-0 items-center justify-center rounded-md border border-accent/40 bg-accent/10 px-2.5 text-xs font-bold text-accent"
                          title="Tổng điểm trình của cặp đôi"
                        >
                          <span className="text-[10px] uppercase text-accent/70 mr-1">Tổng:</span>
                          <span>{totalRating > 0 ? totalRating.toFixed(1).replace(/\.0$/, "") : "—"}</span>
                        </div>
                      )}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-line/70">
                      <input
                        type="checkbox"
                        className="size-4 accent-[oklch(0.615_0.145_154.2)]"
                        checked={en.paid}
                        onChange={(e) => patchEntry(en.id, { paid: e.target.checked })}
                      />
                      Đã đóng phí
                    </label>
                    <button
                      className="text-line/40 hover:text-destructive"
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
                max={8}
                className="field mt-1.5 w-20 text-center"
                value={ev.groupCount}
                onChange={(e) =>
                  updateEvent(ev.id, {
                    groupCount: Math.max(1, Math.min(8, Number(e.target.value) || 1)),
                  })
                }
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
                    name: `Bảng ${"ABCDEFGH"[i]}`,
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
                      const pts =
                        entry && slots === 2
                          ? (entry.players[0]?.rating ?? 0) + (entry.players[1]?.rating ?? 0)
                          : entry?.players[0]?.rating ?? 0;
                      return (
                        <div
                          key={id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", id);
                            setDragEntryId(id);
                          }}
                          onDragEnd={() => setDragEntryId(null)}
                          className="flex cursor-grab items-center justify-between gap-1.5 rounded-lg bg-paper p-2 text-xs font-semibold shadow-xs ring-1 ring-line/15 active:cursor-grabbing hover:ring-accent/40"
                        >
                          <span className="truncate flex-1">{entryName(entry)}</span>
                          {pts > 0 && (
                            <span className="shrink-0 rounded bg-accent/15 px-1 py-0.5 text-[10px] font-bold text-accent">
                              {pts.toFixed(1).replace(/\.0$/, "")}đ
                            </span>
                          )}
                          <button
                            className="text-line/40 hover:text-destructive"
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
                    const pts =
                      slots === 2
                        ? (e.players[0]?.rating ?? 0) + (e.players[1]?.rating ?? 0)
                        : e.players[0]?.rating ?? 0;
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
                        <span className="truncate max-w-[140px]">{entryName(e)}</span>
                        {pts > 0 && (
                          <span className="rounded bg-accent/15 px-1 py-0.5 text-[10px] font-bold text-accent">
                            {pts.toFixed(1).replace(/\.0$/, "")}đ
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-paper p-6 shadow-2xl ring-1 ring-line/20">
            <div className="flex items-center justify-between border-b border-line/15 pb-4 print:hidden">
              <div>
                <h2 className="font-head text-2xl font-bold uppercase tracking-tight">
                  Bảng thi đấu — {ev.name}
                </h2>
                <p className="text-xs text-line/60">
                  {state.name || "Giải đấu Pickleball"} {state.date ? `· ${state.date}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn-accent text-xs"
                  onClick={() => window.print()}
                >
                  🖨️ In / Lưu PDF
                </button>
                <button
                  className="btn-ghost text-xs"
                  onClick={() => setShowPrintModal(false)}
                >
                  Đóng
                </button>
              </div>
            </div>

            {/* Vùng chỉ in bảng đấu */}
            <div className="mt-6 space-y-6 print:m-0 print:p-0">
              <div className="text-center">
                <h1 className="font-head text-3xl font-extrabold uppercase tracking-tight">
                  {state.name || "GIẢI ĐẤU PICKLEBALL"}
                </h1>
                <p className="mt-1 text-base font-semibold uppercase tracking-wider text-accent">
                  DANH SÁCH CHIA BẢNG — {ev.name}
                </p>
                {state.venue && <p className="text-xs text-line/60 mt-0.5">{state.venue}</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {ev.groups.map((g) => (
                  <div
                    key={g.name}
                    className="rounded-xl border border-line/20 bg-card p-4 print:border-black"
                  >
                    <div className="flex items-center justify-between border-b border-line/15 pb-2">
                      <h3 className="font-head text-lg font-bold uppercase tracking-tight text-accent">
                        {g.name}
                      </h3>
                      <span className="text-xs font-semibold text-line/60">
                        {g.entryIds.length} đội
                      </span>
                    </div>
                    <div className="mt-3 divide-y divide-line/10">
                      {g.entryIds.map((id, idx) => {
                        const entry = entries.find((e) => e.id === id);
                        return (
                          <div key={id} className="flex items-center justify-between py-2 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-head font-bold text-line/40 w-4">
                                {idx + 1}.
                              </span>
                              <span className="font-medium text-line">
                                {entryName(entry)}
                              </span>
                            </div>
                            {slots === 2 && entry && (
                              <span className="text-xs text-line/60">
                                {entry.players.map((p) => p.name).filter(Boolean).join(" - ")}
                              </span>
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
