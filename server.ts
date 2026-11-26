import express from "express";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import ffmpegStatic from "ffmpeg-static";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === "production";
const PORT = process.env.NGINX_PORT
  ? Number(process.env.DEFAULT_APP_PORT || 3000)
  : Number(process.env.PORT || 3000);

interface PvnaCacheEntry {
  expiresAt: number;
  payload: any;
}

const pvnaCache = new Map<string, PvnaCacheEntry>();
const PVNA_CACHE_TTL_MS = 2 * 60 * 1000;

interface DuprTokenCache {
  token: string;
  expiresAt: number;
}

let cachedDuprToken: DuprTokenCache | null = null;

function normalizeVietnameseText(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

const VIET_VOWEL_VARIANTS: Record<string, string[]> = {
  a: ["á", "à", "ả", "ã", "ạ", "ă", "ắ", "ằ", "ẳ", "ẵ", "ặ", "â", "ấ", "ầ", "ẩ", "ẫ", "ậ"],
  e: ["é", "è", "ẻ", "ẽ", "ẹ", "ê", "ế", "ề", "ể", "ễ", "ệ"],
  i: ["í", "ì", "ỉ", "ĩ", "ị"],
  o: ["ó", "ò", "ỏ", "õ", "ọ", "ô", "ố", "ồ", "ổ", "ỗ", "ộ", "ơ", "ớ", "ờ", "ở", "ỡ", "ợ"],
  u: ["ú", "ù", "ủ", "ũ", "ụ", "ư", "ứ", "ừ", "ử", "ữ", "ự"],
  y: ["ý", "ỳ", "ỷ", "ỹ", "ỵ"],
  d: ["đ"],
};

function buildUnaccentedFallbackCandidates(rawSearch: string): string[] {
  const nfc = rawSearch.normalize("NFC").trim();
  const norm = normalizeVietnameseText(nfc);
  if (!norm) return [];

  const candidates = new Set<string>();
  const words = norm.split(/\s+/).filter((w) => w.length >= 2 && w.length <= 16);

  // Neu co nhieu tu: uu tien thu cac tu rieng le (vi du 'nguyen huyen' -> 'huyên', 'nguyễn')
  const targetTokens =
    words.length > 1
      ? [words[words.length - 1], words[0]]
      : [words[0] || norm];

  for (const tok of targetTokens) {
    if (!tok || tok.length < 2) continue;
    if (words.length > 1) {
      candidates.add(tok);
    }

    const chars = [...tok];
    const vowelIndices: number[] = [];
    for (let i = 0; i < chars.length; i++) {
      if ("aeiouy".includes(chars[i])) vowelIndices.push(i);
    }

    // Thu 2 nguyen am cuoi cung trong am tiet (noi thuong mang thanh dieu tieng Viet)
    const targetIndices = vowelIndices.slice(-2).reverse();
    for (const idx of targetIndices) {
      const variants = VIET_VOWEL_VARIANTS[chars[idx]] || [];
      for (const v of variants.slice(0, 7)) {
        candidates.add(tok.slice(0, idx) + v + tok.slice(idx + 1));
      }
    }

    if (tok.startsWith("d")) {
      const rest = tok.slice(1);
      candidates.add("đ" + rest);
      const restVowels = [...rest].findIndex((c) => "aeiouy".includes(c));
      if (restVowels >= 0) {
        const variants = VIET_VOWEL_VARIANTS[rest[restVowels]] || [];
        for (const v of variants.slice(0, 5)) {
          candidates.add("đ" + rest.slice(0, restVowels) + v + rest.slice(restVowels + 1));
        }
      }
    }
  }

  candidates.delete(nfc);
  candidates.delete(norm);
  return Array.from(candidates).slice(0, 16);
}

async function fetchPvnaRaw(params: URLSearchParams): Promise<any> {
  const cacheKey = params.toString();
  const cached = pvnaCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const targetUrl = `https://pvna.vn/api/webPlayers?${cacheKey}`;
  const response = await fetch(targetUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "NayCourt-Tournament-App/1.0",
    },
    signal: AbortSignal.timeout(9000),
  });

  if (!response.ok) {
    throw new Error(`PVNA API HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (pvnaCache.size > 300) {
    const firstKey = pvnaCache.keys().next().value;
    if (firstKey) pvnaCache.delete(firstKey);
  }
  pvnaCache.set(cacheKey, {
    expiresAt: Date.now() + PVNA_CACHE_TTL_MS,
    payload,
  });

  return payload;
}

function matchesPvnaPlayer(player: any, normQuery: string): boolean {
  if (!normQuery) return true;
  const tokens = normQuery.split(/\s+/).filter(Boolean);
  const haystack = [
    normalizeVietnameseText(player?.name || ""),
    normalizeVietnameseText(player?.nickName || ""),
    normalizeVietnameseText(player?.playerCode || ""),
  ].join(" ");
  return tokens.every((tok) => haystack.includes(tok));
}

async function getDuprBearerToken(): Promise<string | null> {
  const staticToken = process.env.DUPR_BEARER_TOKEN?.trim();
  if (staticToken) return staticToken;

  if (cachedDuprToken && cachedDuprToken.expiresAt > Date.now()) {
    return cachedDuprToken.token;
  }

  const clientKey = process.env.DUPR_CLIENT_KEY?.trim();
  const clientSecret = process.env.DUPR_CLIENT_SECRET?.trim();
  if (!clientKey || !clientSecret) return null;

  try {
    const encoded = Buffer.from(`${clientKey}:${clientSecret}`).toString("base64");
    const authRes = await fetch("https://api.dupr.com/auth/v1.0/token", {
      method: "POST",
      headers: {
        "x-authorization": encoded,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!authRes.ok) return null;
    const authJson: any = await authRes.json();
    const token = authJson?.result?.token || authJson?.token;
    if (!token) return null;

    cachedDuprToken = {
      token,
      expiresAt: Date.now() + 20 * 60 * 1000,
    };
    return token;
  } catch {
    return null;
  }
}

function mapDuprHitToPlayer(hit: any): any {
  const fullName =
    hit?.fullName ||
    [hit?.firstName, hit?.lastName].filter(Boolean).join(" ").trim() ||
    "VĐV DUPR";
  const ratings = hit?.ratings || {};
  const doubles = Number(ratings.doubles ?? hit?.doubles ?? 0) || 0;
  const singles = Number(ratings.singles ?? hit?.singles ?? 0) || 0;
  const genderRaw = String(hit?.gender || "").toLowerCase();

  return {
    id: `dupr_live_${hit?.duprId || hit?.id || fullName}`,
    name: fullName,
    gender: genderRaw === "female" || genderRaw === "f" ? "nu" : "nam",
    club: hit?.club || "DUPR Global",
    province: hit?.shortAddress || hit?.address || hit?.country || "",
    duprDoubles: doubles,
    duprSingles: singles,
    pvnaDoubles: 0,
    pvnaSingles: 0,
    duprId: hit?.duprId || "",
    avatarUrl: hit?.imageUrl || "",
    isDuprPlayer: true,
    isPvnaPlayer: false,
  };
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function normalizeExtractedGroupName(raw: string): string {
  const cleaned = (raw || "").trim();
  if (!cleaned) return "";
  const m = cleaned.match(/^(?:b[ảa]ng|group|grp)\s*[:\-]?\s*([a-z0-9]+)$/i);
  if (m && m[1]) {
    return `Bảng ${m[1].toUpperCase()}`;
  }
  if (/^[a-z]$/i.test(cleaned)) {
    return `Bảng ${cleaned.toUpperCase()}`;
  }
  return cleaned;
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));

  // AI Vision: Doc hieu anh danh sach VDV / anh chia bang va tra ve JSON co cau truc
  app.post("/api/ai/parse-athletes-image", async (req, res) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        return res.status(500).json({
          success: false,
          message:
            "Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng kiểm tra mục Settings > Secrets.",
        });
      }

      const body = req.body || {};
      const rawImages: Array<{ data: string; mimeType: string }> = Array.isArray(body.images)
        ? body.images
        : body.imageBase64
          ? [{ data: String(body.imageBase64), mimeType: String(body.mimeType || "image/png") }]
          : [];

      if (rawImages.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Không có dữ liệu ảnh được gửi lên.",
        });
      }

      const mode = body.mode === "don" || body.mode === "dong_doi" ? body.mode : "doi";
      const pairMode = body.pairMode === "random" ? "random" : "fixed";
      const eventName = typeof body.eventName === "string" ? body.eventName.trim() : "";

      const imageParts = rawImages.slice(0, 8).map((img) => {
        const rawData = String(img.data || "");
        const base64Clean = rawData.includes(",") ? rawData.split(",").pop() || "" : rawData;
        const mimeType =
          typeof img.mimeType === "string" && img.mimeType.startsWith("image/")
            ? img.mimeType
            : "image/png";
        return {
          inlineData: {
            mimeType,
            data: base64Clean,
          },
        };
      });

      const modeInstruction =
        mode === "dong_doi"
          ? "Thể thức hiện tại là ĐỒNG ĐỘI. Nếu có tên đội và các thành viên trong đội, điền teamName và danh sách players của đội đó."
          : mode === "doi" && pairMode === "fixed"
            ? "Thể thức hiện tại là ĐÁNH ĐÔI CỐ ĐỊNH (2 VĐV / 1 cặp). Các chuỗi dạng 'Thạch - Tuấn Anh', 'Dương - Dũng', 'Dũng - Bảo Mist', 'An / Bình', 'Huy + Lợi' là 1 cặp gồm ĐÚNG 2 VĐV trong mảng players (ví dụ: [{name:'Thạch'}, {name:'Tuấn Anh'}]). Tuyệt đối KHÔNG tách tên ghép có khoảng trắng như 'Tuấn Anh', 'Bảo Mist', 'Ngọc Anh', 'Kim Lợi', 'Hồng Hoa' thành 2 người — chỉ tách theo dấu nối cặp (-, /, +, &, –, —)."
            : "Thể thức hiện tại là ĐÁNH ĐƠN hoặc ĐÔI BỐC THĂM (mỗi VĐV 1 dòng riêng trong mảng players gồm 1 phần tử).";

      const promptText = [
        "Hãy đọc chính xác toàn bộ danh sách vận động viên và bảng đấu từ các ảnh được cung cấp.",
        eventName ? `Nội dung giải hiện tại: ${eventName}.` : "",
        modeInstruction,
        "Quy tắc trích xuất:",
        "1. Nếu ảnh có chia bảng (ví dụ: BẢNG A, BẢNG B, BẢNG C, BẢNG D, BẢNG E, BẢNG F, BẢNG G, BẢNG H...), hãy gom đúng từng đội/VĐV vào groupName tương ứng chuẩn dạng 'Bảng A', 'Bảng B', ... giữ nguyên thứ tự các bảng.",
        "2. Nếu ảnh là bảng tính nhiều cột hoặc nhiều hàng các bảng xếp cạnh/chồng lên nhau (như 4 bảng hàng trên A-D và 4 bảng hàng dưới E-H), phải đọc đủ tất cả các cột và các hàng, không được bỏ sót bảng nào.",
        "3. Nếu ảnh chỉ là danh sách phẳng không chia bảng, đặt groupName là chuỗi rỗng ''.",
        "4. Giữ nguyên chính xác chính tả và dấu tiếng Việt của tên VĐV. Bỏ qua chữ tiêu đề giải, ngày giờ, tên sân, nhà tài trợ hoặc chữ trang trí.",
        "5. Chỉ điền rating nếu trong ảnh có ghi số điểm trình bên cạnh tên VĐV; nếu không có thì bỏ qua trường rating.",
      ]
        .filter(Boolean)
        .join("\n");

      let response: any = null;
      let lastErr: any = null;
      const modelsToTry = [
        "gemini-4-hydrogen",
        "gemini-3.1-flash-lite",
        "gemini-4-hydrogen",
        "gemini-3.1-flash-lite",
      ];
      for (let i = 0; i < modelsToTry.length; i++) {
        const modelName = modelsToTry[i]!;
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: { parts: [...imageParts, { text: promptText }] },
            config: {
              ...(modelName === "gemini-4-hydrogen"
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
              systemInstruction:
                "Bạn là trợ lý OCR và phân tích bảng đấu thể thao Pickleball chuyên nghiệp. Luôn trả về JSON chính xác 100% theo schema, không bịa thêm tên VĐV không có trong ảnh.",
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  detectedEventTitle: {
                    type: Type.STRING,
                    description: "Tên giải đấu hoặc nội dung đọc được trên ảnh nếu có.",
                  },
                  groups: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        groupName: {
                          type: Type.STRING,
                          description:
                            "Tên bảng đấu chuẩn hóa như 'Bảng A', 'Bảng B'... hoặc chuỗi rỗng '' nếu ảnh không chia bảng.",
                        },
                        entries: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              teamName: {
                                type: Type.STRING,
                                description: "Tên đội (nếu là thể thức đồng đội), ngược lại để ''.",
                              },
                              players: {
                                type: Type.ARRAY,
                                items: {
                                  type: Type.OBJECT,
                                  properties: {
                                    name: {
                                      type: Type.STRING,
                                      description: "Tên VĐV giữ nguyên dấu tiếng Việt.",
                                    },
                                    rating: {
                                      type: Type.NUMBER,
                                      description: "Điểm trình của VĐV nếu có ghi trong ảnh.",
                                    },
                                  },
                                  required: ["name"],
                                },
                              },
                            },
                            required: ["players"],
                          },
                        },
                      },
                      required: ["groupName", "entries"],
                    },
                  },
                },
                required: ["groups"],
              },
            },
          });
          lastErr = null;
          break;
        } catch (err: any) {
          lastErr = err;
          const errStr = String(err?.message || err || "");
          console.warn(`[AI Parse] model=${modelName} attempt=${i + 1} failed:`, errStr);
          const isTransient =
            err?.status === 503 ||
            err?.status === 500 ||
            err?.status === 502 ||
            err?.status === 504 ||
            /503|UNAVAILABLE|500|INTERNAL|ECONNRESET|ETIMEDOUT|fetch failed/i.test(errStr);
          if (!isTransient || i === modelsToTry.length - 1) {
            throw err;
          }
          await new Promise((r) => setTimeout(r, 900 * (i + 1)));
        }
      }
      if (!response && lastErr) throw lastErr;

      const rawText = (response.text ?? "{}").trim();
      let parsed: any = {};
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return res.status(502).json({
          success: false,
          message: "AI trả về dữ liệu chưa hợp lệ. Vui lòng thử lại với ảnh rõ nét hơn.",
        });
      }

      const rawGroups: any[] = Array.isArray(parsed?.groups) ? parsed.groups : [];
      const groupMap = new Map<
        string,
        Array<{ teamName?: string; players: Array<{ name: string; rating: number | null }> }>
      >();

      for (const grp of rawGroups) {
        const gName = normalizeExtractedGroupName(String(grp?.groupName || ""));
        const entriesRaw: any[] = Array.isArray(grp?.entries) ? grp.entries : [];
        const cleanEntries = entriesRaw
          .map((en) => {
            const playersRaw: any[] = Array.isArray(en?.players) ? en.players : [];
            const players = playersRaw
              .map((p) => ({
                name: String(p?.name || "").trim(),
                rating:
                  typeof p?.rating === "number" && Number.isFinite(p.rating)
                    ? p.rating
                    : null,
              }))
              .filter((p) => p.name.length > 0);
            const teamName = typeof en?.teamName === "string" ? en.teamName.trim() : "";
            return {
              ...(teamName ? { teamName } : {}),
              players,
            };
          })
          .filter((en) => en.players.length > 0);

        if (cleanEntries.length === 0) continue;
        const existing = groupMap.get(gName) || [];
        groupMap.set(gName, [...existing, ...cleanEntries]);
      }

      const groups = Array.from(groupMap.entries()).map(([groupName, entries]) => ({
        groupName,
        entries,
      }));

      return res.json({
        success: true,
        detectedEventTitle:
          typeof parsed?.detectedEventTitle === "string"
            ? parsed.detectedEventTitle.trim()
            : "",
        groups,
      });
    } catch (err: any) {
      const msg = String(err?.message || err || "Lỗi không xác định");
      console.error("[AI Parse Image Error]:", msg);
      const status =
        typeof err?.status === "number"
          ? err.status
          : msg.includes("403") || msg.includes("PERMISSION_DENIED")
            ? 403
            : msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")
              ? 429
              : msg.includes("503") || msg.includes("UNAVAILABLE")
                ? 503
                : msg.includes("400") || msg.includes("API_KEY_INVALID")
                  ? 400
                  : 502;

      const userMsg =
        status === 400 || status === 403
          ? "Khóa GEMINI_API_KEY không hợp lệ hoặc không có quyền truy cập. Vui lòng kiểm tra ở Settings > Secrets."
          : status === 429
            ? "Đã vượt giới hạn lượt gọi AI tạm thời. Vui lòng thử lại sau ít phút hoặc kiểm tra gói API key."
            : status === 503
              ? "Hệ thống AI đang quá tải tạm thời. Vui lòng bấm import lại sau vài giây."
              : `Không thể phân tích ảnh bằng AI: ${msg}`;

      return res.status(status).json({
        success: false,
        message: userMsg,
      });
    }
  });

  // Proxy PVNA (pvna.vn/api/webPlayers) voi NFC + fallback tim kiem khong dau
  app.get("/api/pvna-proxy", async (req, res) => {
    try {
      const rawSearch = typeof req.query.search === "string" ? req.query.search.normalize("NFC").trim() : "";
      const page = typeof req.query.page === "string" ? req.query.page : "0";
      const limit = typeof req.query.limit === "string" ? req.query.limit : "50";
      const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : "";
      const order = typeof req.query.order === "string" ? req.query.order : "";

      const baseParams = new URLSearchParams();
      baseParams.set("page", page);
      baseParams.set("limit", limit);
      if (rawSearch) baseParams.set("search", rawSearch);
      if (sortBy) baseParams.set("sortBy", sortBy);
      if (order) baseParams.set("order", order);

      const primary = await fetchPvnaRaw(baseParams);
      const primaryPlayers: any[] = Array.isArray(primary?.data?.players)
        ? primary.data.players
        : [];

      if (!rawSearch || primaryPlayers.length >= 5) {
        return res.json(primary);
      }

      // Neu tim co dau hoac khong dau it ket qua / rong -> chay fallback thong minh
      const normQuery = normalizeVietnameseText(rawSearch);
      const mergedMap = new Map<string, any>();
      for (const p of primaryPlayers) {
        mergedMap.set(String(p.playerCode || p.id), p);
      }

      // Thu truy van bien the (khong dau -> co dau, tach tu dai nhat) song song theo lo nho
      const candidates = buildUnaccentedFallbackCandidates(rawSearch);
      if (candidates.length > 0 && primaryPlayers.length === 0) {
        const batchResults = await Promise.allSettled(
          candidates.map((cand) => {
            const candParams = new URLSearchParams();
            candParams.set("page", "0");
            candParams.set("limit", "40");
            candParams.set("search", cand);
            return fetchPvnaRaw(candParams);
          })
        );

        for (const r of batchResults) {
          if (r.status !== "fulfilled") continue;
          const players: any[] = Array.isArray(r.value?.data?.players)
            ? r.value.data.players
            : [];
          for (const p of players) {
            if (matchesPvnaPlayer(p, normQuery)) {
              mergedMap.set(String(p.playerCode || p.id), p);
            }
          }
        }
      }

      return res.json({
        success: true,
        data: {
          players: Array.from(mergedMap.values()),
          pagination: primary?.data?.pagination || {
            page: Number(page) || 0,
            limit: Number(limit) || 50,
            total: mergedMap.size,
          },
        },
      });
    } catch (err: any) {
      console.error("[PVNA Proxy Error]:", err?.message || err);
      return res.status(502).json({
        success: false,
        message: "Không thể kết nối máy chủ PVNA",
        data: { players: [] },
      });
    }
  });

  // Proxy DUPR chính thức (yêu cầu DUPR Partner Bearer Token hoặc Client Key/Secret trong env)
  app.post("/api/dupr-proxy/search", async (req, res) => {
    try {
      const rawQuery = typeof req.body?.query === "string" ? req.body.query.trim() : "";
      if (!rawQuery) {
        return res.json({ success: true, requiresAuth: false, players: [] });
      }

      const token = await getDuprBearerToken();
      if (!token) {
        return res.json({
          success: false,
          requiresAuth: true,
          players: [],
        });
      }

      const players: any[] = [];
      const seenIds = new Set<string>();

      const addHit = (hit: any) => {
        const mapped = mapDuprHitToPlayer(hit);
        const key = String(mapped.duprId || mapped.id);
        if (!seenIds.has(key)) {
          seenIds.add(key);
          players.push(mapped);
        }
      };

      // Nếu người dùng nhập mã DUPR ID (5-8 ký tự chữ số viết liền), thử tìm theo ID trước
      if (/^[a-zA-Z0-9]{5,8}$/.test(rawQuery)) {
        try {
          const idRes = await fetch("https://api.dupr.com/player/v1.0/search/byDuprId", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ duprId: rawQuery.toUpperCase() }),
            signal: AbortSignal.timeout(7000),
          });
          if (idRes.ok) {
            const idJson: any = await idRes.json();
            if (idJson?.result) addHit(idJson.result);
          }
        } catch {
          // Bỏ qua nếu không khớp ID
        }
      }

      const searchRes = await fetch("https://api.dupr.com/player/v1.0/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: { fullName: rawQuery },
          limit: 30,
          offset: 0,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (searchRes.status === 401 || searchRes.status === 403) {
        cachedDuprToken = null;
        return res.json({
          success: false,
          requiresAuth: true,
          players: [],
        });
      }

      if (!searchRes.ok) {
        return res.json({ success: false, requiresAuth: false, players });
      }

      const searchJson: any = await searchRes.json();
      const hits: any[] = Array.isArray(searchJson?.result?.hits)
        ? searchJson.result.hits
        : Array.isArray(searchJson?.results)
        ? searchJson.results
        : [];
      for (const hit of hits) {
        addHit(hit);
      }

      return res.json({
        success: true,
        requiresAuth: false,
        players,
      });
    } catch (err: any) {
      console.error("[DUPR Proxy Error]:", err?.message || err);
      return res.json({
        success: false,
        requiresAuth: false,
        players: [],
      });
    }
  });

  const resolveFfmpegBinary = (): {
    path: string | null;
    source: "ffmpeg-static" | "system" | "none";
  } => {
    const staticBin = typeof ffmpegStatic === "string" ? ffmpegStatic.trim() : "";
    if (staticBin && fs.existsSync(staticBin)) {
      try {
        fs.chmodSync(staticBin, 0o755);
      } catch {}
      const probe = spawnSync(staticBin, ["-version"], { timeout: 3000 });
      if (probe.status === 0) {
        return { path: staticBin, source: "ffmpeg-static" };
      }
    }
    try {
      const sysProbe = spawnSync("ffmpeg", ["-version"], { timeout: 3000 });
      if (sysProbe.status === 0) {
        return { path: "ffmpeg", source: "system" };
      }
    } catch {}
    return { path: null, source: "none" };
  };

  // Kiem tra kha nang ho tro relay Livestream (FFmpeg + RTMPS)
  app.get("/api/livestream/status", (_req, res) => {
    try {
      const bin = resolveFfmpegBinary();
      const available = Boolean(bin.path);
      return res.json({ available, ffmpeg: available, source: bin.source });
    } catch {
      return res.json({ available: false, ffmpeg: false, source: "none" });
    }
  });

  const distDir = path.resolve(__dirname, "dist");
  const hasDistBuild = fs.existsSync(path.join(distDir, "index.html"));

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (hasDistBuild) {
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    try {
      const reqUrl = new URL(req.url || "/", "http://localhost");
      if (reqUrl.pathname !== "/ws/livestream") {
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    let ffmpegProc: ChildProcessWithoutNullStreams | null = null;
    let isStopping = false;
    let hasStartedFfmpeg = false;
    let isLiveEmitted = false;
    let lastTelemetryAt = 0;
    let recentStderrTail = "";
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    const safeSend = (payload: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(payload));
        } catch {}
      }
    };

    const cleanupFfmpeg = () => {
      if (isStopping) return;
      isStopping = true;
      if (ffmpegProc) {
        const proc = ffmpegProc;
        try {
          if (proc.stdin && !proc.stdin.destroyed) {
            proc.stdin.end();
          }
        } catch {}
        killTimer = setTimeout(() => {
          try {
            if (!proc.killed) proc.kill("SIGTERM");
          } catch {}
          setTimeout(() => {
            try {
              if (!proc.killed) proc.kill("SIGKILL");
            } catch {}
          }, 1200);
        }, 1800);
      }
    };

    const translateFfmpegError = (raw: string): string => {
      const lower = raw.toLowerCase();
      if (
        lower.includes("403") ||
        lower.includes("401") ||
        lower.includes("rejected") ||
        lower.includes("publish") && lower.includes("error")
      ) {
        return "Facebook / máy chủ phát từ chối Khóa luồng (Stream Key). Hãy kiểm tra lại Stream Key hoặc tạo buổi phát mới.";
      }
      if (lower.includes("404") || lower.includes("stream not found")) {
        return "Không tìm thấy địa chỉ luồng phát. Vui lòng kiểm tra lại Server URL và Stream Key.";
      }
      if (
        lower.includes("connection refused") ||
        lower.includes("timed out") ||
        lower.includes("could not resolve") ||
        lower.includes("name or service not known") ||
        lower.includes("tls") ||
        lower.includes("broken pipe")
      ) {
        return "Không kết nối được tới máy chủ RTMPS của Facebook/YouTube. Vui lòng kiểm tra lại URL máy chủ và mạng.";
      }
      if (lower.includes("invalid data found")) {
        return "Định dạng luồng video từ trình duyệt chưa khớp. Hãy thử tắt/bật lại Camera hoặc đổi trình duyệt.";
      }
      return "Luồng phát sóng bị gián đoạn bất ngờ. Vui lòng kiểm tra Stream Key và kết nối mạng rồi thử phát lại.";
    };

    ws.on("message", (data, isBinary) => {
      if (!isBinary) {
        try {
          const msg = JSON.parse(data.toString("utf8"));
          if (msg?.type === "start") {
            if (hasStartedFfmpeg) return;
            const rawRtmpUrl = typeof msg.rtmpUrl === "string" ? msg.rtmpUrl.trim() : "";
            const rawStreamKey = typeof msg.streamKey === "string" ? msg.streamKey.trim() : "";
            const fps = Math.min(60, Math.max(15, Number(msg.fps) || 30));
            const bitrateKbps = Math.min(6000, Math.max(600, Number(msg.bitrateKbps) || 2500));

            if (!/^rtmps?:\/\/[^\s\r\n\0]+$/i.test(rawRtmpUrl)) {
              safeSend({
                type: "error",
                message: "Địa chỉ Server URL phải bắt đầu bằng rtmps:// hoặc rtmp:// hợp lệ.",
              });
              ws.close(1008, "Invalid RTMP URL");
              return;
            }
            if (!rawStreamKey || /[\s\r\n\0]/.test(rawStreamKey)) {
              safeSend({
                type: "error",
                message: "Vui lòng nhập Khóa luồng (Stream Key) hợp lệ, không chứa khoảng trắng.",
              });
              ws.close(1008, "Invalid Stream Key");
              return;
            }

            const targetUrl = rawRtmpUrl.endsWith("/")
              ? `${rawRtmpUrl}${rawStreamKey}`
              : `${rawRtmpUrl}/${rawStreamKey}`;

            const bin = resolveFfmpegBinary();
            if (!bin.path) {
              safeSend({
                type: "error",
                message: "Máy chủ chưa sẵn sàng bộ mã hóa FFmpeg để phát RTMPS.",
              });
              ws.close(1011, "FFmpeg missing");
              return;
            }

            const rawMime = typeof msg.mimeType === "string" ? msg.mimeType.toLowerCase() : "";
            const inputFormatArgs: string[] = rawMime.includes("mp4")
              ? ["-f", "mp4"]
              : rawMime.includes("webm")
                ? ["-f", "webm"]
                : [];

            hasStartedFfmpeg = true;
            safeSend({
              type: "status",
              state: "connecting",
              message: "Đang khởi tạo bộ mã hóa và kết nối Facebook/RTMP...",
            });

            const args = [
              "-hide_banner",
              "-loglevel",
              "info",
              "-probesize",
              "150000",
              "-analyzeduration",
              "500000",
              "-fflags",
              "+genpts+discardcorrupt",
              ...inputFormatArgs,
              "-i",
              "pipe:0",
              "-c:v",
              "libx264",
              "-preset",
              "veryfast",
              "-tune",
              "zerolatency",
              "-pix_fmt",
              "yuv420p",
              "-b:v",
              `${bitrateKbps}k`,
              "-maxrate",
              `${bitrateKbps}k`,
              "-bufsize",
              `${bitrateKbps * 2}k`,
              "-g",
              String(fps * 2),
              "-keyint_min",
              String(fps * 2),
              "-sc_threshold",
              "0",
              "-r",
              String(fps),
              "-c:a",
              "aac",
              "-b:a",
              "128k",
              "-ar",
              "44100",
              "-ac",
              "2",
              "-f",
              "flv",
              targetUrl,
            ];

            try {
              ffmpegProc = spawn(bin.path, args, { stdio: ["pipe", "pipe", "pipe"] });
            } catch {
              safeSend({
                type: "error",
                message: "Không thể khởi chạy FFmpeg trên máy chủ.",
              });
              ws.close(1011, "FFmpeg spawn failed");
              return;
            }

            ffmpegProc.stdin.on("error", () => {
              // Bo qua EPIPE khi dong luong
            });

            ffmpegProc.stderr.on("data", (chunk: Buffer) => {
              const text = chunk.toString("utf8");
              recentStderrTail = (recentStderrTail + text).slice(-2500);

              if (text.includes("frame=")) {
                const now = Date.now();
                if (!isLiveEmitted || now - lastTelemetryAt >= 1000) {
                  isLiveEmitted = true;
                  lastTelemetryAt = now;
                  const fpsMatch = text.match(/fps=\s*([\d.]+)/);
                  const brMatch = text.match(/bitrate=\s*([^\s]+)/);
                  const timeMatch = text.match(/time=\s*([^\s]+)/);
                  safeSend({
                    type: "status",
                    state: "live",
                    fps: fpsMatch ? Number(fpsMatch[1]) : undefined,
                    bitrate: brMatch && brMatch[1] !== "N/A" ? brMatch[1] : undefined,
                    time: timeMatch ? timeMatch[1] : undefined,
                    message: "Đang phát trực tiếp ổn định",
                  });
                }
              }
            });

            ffmpegProc.on("close", (code) => {
              if (killTimer) {
                clearTimeout(killTimer);
                killTimer = null;
              }
              if (!isStopping && code !== 0) {
                safeSend({
                  type: "error",
                  message: translateFfmpegError(recentStderrTail),
                });
              } else {
                safeSend({
                  type: "status",
                  state: "stopped",
                  message: "Đã kết thúc phiên phát trực tiếp.",
                });
              }
              ffmpegProc = null;
              if (ws.readyState === WebSocket.OPEN) {
                ws.close(1000, "Stream ended");
              }
            });
          } else if (msg?.type === "stop") {
            cleanupFfmpeg();
          }
        } catch {
          // Bo qua JSON loi
        }
        return;
      }

      if (ffmpegProc && ffmpegProc.stdin && !ffmpegProc.stdin.destroyed && !isStopping) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        try {
          ffmpegProc.stdin.write(buf);
        } catch {}
      }
    });

    ws.on("close", () => {
      cleanupFfmpeg();
    });

    ws.on("error", () => {
      cleanupFfmpeg();
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
