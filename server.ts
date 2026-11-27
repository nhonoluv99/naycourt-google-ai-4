import express from "express";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import ffmpegStatic from "ffmpeg-static";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";

dotenv.config();

const SERVER_SIGNING_SECRET =
  process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString("hex");
const SESSION_AES_KEY = crypto.createHash("sha256").update(SERVER_SIGNING_SECRET).digest();

function signOAuthState(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", SESSION_AES_KEY)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

function verifyOAuthState(rawState: string): Record<string, any> | null {
  if (!rawState || typeof rawState !== "string") return null;
  const parts = rawState.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", SESSION_AES_KEY)
    .update(encoded)
    .digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof parsed?.exp === "number" && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface FacebookSessionData {
  accessToken: string;
  userId: string;
  userName: string;
  avatarUrl?: string;
  expiresAt: number;
}

function encryptFacebookSession(data: FacebookSessionData): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", SESSION_AES_KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decryptFacebookSession(token: string): FacebookSessionData | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], "base64url");
    const tag = Buffer.from(parts[1], "base64url");
    const ciphertext = Buffer.from(parts[2], "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", SESSION_AES_KEY, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plain) as FacebookSessionData;
    if (!parsed?.accessToken || (parsed.expiresAt && Date.now() > parsed.expiresAt)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function getAppBaseUrl(req: express.Request): string {
  const envUrl = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (envUrl && envUrl !== "MY_APP_URL" && /^https?:\/\//i.test(envUrl)) {
    return envUrl;
  }
  const forwardedProto = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || req.get("host") || "localhost:3000")
    .split(",")[0]
    .trim();
  return `${forwardedProto}://${forwardedHost}`;
}

function splitRtmpStreamUrl(rawUrl: string): { serverUrl: string; streamKey: string } {
  const clean = (rawUrl || "").trim();
  if (!clean) return { serverUrl: "", streamKey: "" };
  const rtmpMarker = clean.indexOf("/rtmp/");
  if (rtmpMarker !== -1) {
    const cut = rtmpMarker + "/rtmp/".length;
    return {
      serverUrl: clean.slice(0, cut),
      streamKey: clean.slice(cut),
    };
  }
  const lastSlash = clean.lastIndexOf("/");
  if (lastSlash > 8) {
    return {
      serverUrl: clean.slice(0, lastSlash + 1),
      streamKey: clean.slice(lastSlash + 1),
    };
  }
  return { serverUrl: clean, streamKey: "" };
}

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
    source: "system" | "ffmpeg-static" | "none";
  } => {
    const checkCandidate = (binPath: string): boolean => {
      try {
        const probe = spawnSync(binPath, ["-version"], { timeout: 3000 });
        if (probe.status !== 0) return false;
        const protoProbe = spawnSync(binPath, ["-protocols"], { timeout: 3000 });
        const protoOut = protoProbe.stdout ? protoProbe.stdout.toString("utf8").toLowerCase() : "";
        return protoOut.includes("rtmps") || protoOut.includes("rtmp");
      } catch {
        return false;
      }
    };

    // Uu tien FFmpeg he thong (dynamically linked glibc/gnutls, tranh loi SIGSEGV DNS cua binary tinh)
    for (const sysCandidate of ["ffmpeg", "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"]) {
      if (checkCandidate(sysCandidate)) {
        return { path: sysCandidate, source: "system" };
      }
    }

    const staticBin = typeof ffmpegStatic === "string" ? ffmpegStatic.trim() : "";
    if (staticBin && fs.existsSync(staticBin)) {
      try {
        fs.chmodSync(staticBin, 0o755);
      } catch {}
      if (checkCandidate(staticBin)) {
        return { path: staticBin, source: "ffmpeg-static" };
      }
    }

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

  // ---------------- ĐĂNG NHẬP FACEBOOK (3P OAuth) & TỰ LẤY STREAM KEY ----------------
  app.get("/api/auth/facebook/url", (req, res) => {
    const appId = process.env.FACEBOOK_APP_ID?.trim();
    const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
    const redirectUri = `${getAppBaseUrl(req)}/auth/facebook/callback`;

    if (!appId || !appSecret) {
      return res.json({
        configured: false,
        redirectUri,
        message:
          "Chưa cấu hình FACEBOOK_APP_ID và FACEBOOK_APP_SECRET trên máy chủ (Settings > Secrets).",
      });
    }

    const state = signOAuthState({
      nonce: crypto.randomBytes(12).toString("hex"),
      exp: Date.now() + 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "public_profile,pages_show_list,pages_read_engagement,publish_video",
      state,
    });

    return res.json({
      configured: true,
      url: `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`,
      redirectUri,
    });
  });

  const handleFacebookCallback = async (req: express.Request, res: express.Response) => {
    const sendPopupMessage = (payload: Record<string, unknown>, fallbackText: string) => {
      const safeJson = JSON.stringify(payload).replace(/</g, "\\u003c");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(`<!DOCTYPE html>
<html lang="vi">
<head><meta charset="utf-8"><title>Đăng nhập Facebook — Nảy Court</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f7f5ef;color:#0a3320;">
  <div style="text-align:center;padding:24px;">
    <p style="font-weight:700;font-size:16px;">${fallbackText}</p>
    <p style="font-size:13px;opacity:.7;">Cửa sổ này sẽ tự đóng...</p>
  </div>
  <script>
    (function () {
      var data = ${safeJson};
      try {
        if (window.opener) {
          window.opener.postMessage(data, window.location.origin);
          window.close();
          return;
        }
      } catch (e) {}
      setTimeout(function () { window.location.href = "/livestream"; }, 1200);
    })();
  </script>
</body>
</html>`);
    };

    try {
      if (req.query.error) {
        return sendPopupMessage(
          {
            type: "FACEBOOK_OAUTH_ERROR",
            message: "Bạn đã hủy đăng nhập Facebook hoặc chưa cấp quyền phát trực tiếp.",
          },
          "Đã hủy kết nối Facebook",
        );
      }

      const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
      const stateRaw = typeof req.query.state === "string" ? req.query.state.trim() : "";
      if (!code || !verifyOAuthState(stateRaw)) {
        return sendPopupMessage(
          {
            type: "FACEBOOK_OAUTH_ERROR",
            message: "Phiên đăng nhập Facebook không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.",
          },
          "Phiên xác thực không hợp lệ",
        );
      }

      const appId = process.env.FACEBOOK_APP_ID?.trim();
      const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
      if (!appId || !appSecret) {
        return sendPopupMessage(
          {
            type: "FACEBOOK_OAUTH_ERROR",
            message: "Máy chủ chưa cấu hình FACEBOOK_APP_ID hoặc FACEBOOK_APP_SECRET.",
          },
          "Thiếu cấu hình Facebook App",
        );
      }

      const redirectUri = `${getAppBaseUrl(req)}/auth/facebook/callback`;
      const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
      tokenUrl.searchParams.set("client_id", appId);
      tokenUrl.searchParams.set("client_secret", appSecret);
      tokenUrl.searchParams.set("redirect_uri", redirectUri);
      tokenUrl.searchParams.set("code", code);

      const tokenRes = await fetch(tokenUrl.toString(), { signal: AbortSignal.timeout(10000) });
      const tokenJson: any = await tokenRes.json();
      if (!tokenRes.ok || !tokenJson?.access_token) {
        return sendPopupMessage(
          {
            type: "FACEBOOK_OAUTH_ERROR",
            message: tokenJson?.error?.message || "Không đổi được mã xác thực từ Facebook.",
          },
          "Không lấy được quyền truy cập Facebook",
        );
      }

      const accessToken = String(tokenJson.access_token);
      const expiresInSec = Number(tokenJson.expires_in) || 3600;

      const meUrl = new URL("https://graph.facebook.com/v21.0/me");
      meUrl.searchParams.set("fields", "id,name,picture{url}");
      meUrl.searchParams.set("access_token", accessToken);
      const meRes = await fetch(meUrl.toString(), { signal: AbortSignal.timeout(8000) });
      const meJson: any = meRes.ok ? await meRes.json() : {};

      const profile = {
        id: String(meJson?.id || ""),
        name: String(meJson?.name || "Tài khoản Facebook"),
        avatarUrl: meJson?.picture?.data?.url ? String(meJson.picture.data.url) : undefined,
      };

      const sessionToken = encryptFacebookSession({
        accessToken,
        userId: profile.id,
        userName: profile.name,
        avatarUrl: profile.avatarUrl,
        expiresAt: Date.now() + expiresInSec * 1000,
      });

      return sendPopupMessage(
        {
          type: "FACEBOOK_OAUTH_SUCCESS",
          sessionToken,
          profile,
        },
        "Kết nối Facebook thành công!",
      );
    } catch (err: any) {
      console.error("[Facebook OAuth Callback Error]:", err?.message || err);
      return sendPopupMessage(
        {
          type: "FACEBOOK_OAUTH_ERROR",
          message: "Lỗi kết nối khi xác thực với Facebook.",
        },
        "Lỗi xác thực Facebook",
      );
    }
  };

  app.get(["/auth/facebook/callback", "/auth/facebook/callback/"], handleFacebookCallback);

  const getBearerFromReq = (req: express.Request): string => {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      return authHeader.slice(7).trim();
    }
    return "";
  };

  app.get("/api/facebook/streams", async (req, res) => {
    try {
      const fbSession = decryptFacebookSession(getBearerFromReq(req));
      if (!fbSession) {
        return res.status(401).json({
          success: false,
          message: "Phiên đăng nhập Facebook đã hết hạn. Vui lòng đăng nhập lại.",
        });
      }

      const targets: Array<{ id: string; name: string; type: "user" | "page"; avatarUrl?: string }> = [
        {
          id: "me",
          name: `${fbSession.userName} (Trang cá nhân)`,
          type: "user",
          avatarUrl: fbSession.avatarUrl,
        },
      ];

      const streams: Array<{
        id: string;
        targetId: string;
        targetName: string;
        targetType: "user" | "page";
        title: string;
        status: string;
        serverUrl: string;
        streamKey: string;
        permalinkUrl?: string;
      }> = [];

      const collectLiveVideos = async (
        nodeId: string,
        targetName: string,
        targetType: "user" | "page",
        token: string,
      ) => {
        try {
          const lvUrl = new URL(`https://graph.facebook.com/v21.0/${nodeId}/live_videos`);
          lvUrl.searchParams.set(
            "fields",
            "id,title,description,status,stream_url,secure_stream_url,permalink_url,creation_time",
          );
          lvUrl.searchParams.set("limit", "10");
          lvUrl.searchParams.set("access_token", token);
          const lvRes = await fetch(lvUrl.toString(), { signal: AbortSignal.timeout(8000) });
          if (!lvRes.ok) return;
          const lvJson: any = await lvRes.json();
          const rows: any[] = Array.isArray(lvJson?.data) ? lvJson.data : [];
          for (const row of rows) {
            const rawRtmp = String(row?.secure_stream_url || row?.stream_url || "").trim();
            const split = splitRtmpStreamUrl(rawRtmp);
            const status = String(row?.status || "").toUpperCase();
            if (!split.streamKey && status === "VOD") continue;
            streams.push({
              id: String(row.id),
              targetId: nodeId,
              targetName,
              targetType,
              title: String(row?.title || row?.description || `Phiên live #${row.id}`),
              status,
              serverUrl: split.serverUrl || "rtmps://live-api-s.facebook.com:443/rtmp/",
              streamKey: split.streamKey,
              permalinkUrl: row?.permalink_url ? String(row.permalink_url) : undefined,
            });
          }
        } catch {}
      };

      await collectLiveVideos("me", fbSession.userName, "user", fbSession.accessToken);

      try {
        const pagesUrl = new URL("https://graph.facebook.com/v21.0/me/accounts");
        pagesUrl.searchParams.set("fields", "id,name,access_token,picture{url}");
        pagesUrl.searchParams.set("limit", "25");
        pagesUrl.searchParams.set("access_token", fbSession.accessToken);
        const pagesRes = await fetch(pagesUrl.toString(), { signal: AbortSignal.timeout(8000) });
        if (pagesRes.ok) {
          const pagesJson: any = await pagesRes.json();
          const pages: any[] = Array.isArray(pagesJson?.data) ? pagesJson.data : [];
          for (const p of pages) {
            if (!p?.id) continue;
            const pageId = String(p.id);
            const pageName = String(p.name || `Fanpage #${pageId}`);
            targets.push({
              id: pageId,
              name: `${pageName} (Fanpage)`,
              type: "page",
              avatarUrl: p?.picture?.data?.url ? String(p.picture.data.url) : undefined,
            });
            const pageToken = String(p.access_token || fbSession.accessToken);
            await collectLiveVideos(pageId, pageName, "page", pageToken);
          }
        }
      } catch {}

      return res.json({
        success: true,
        profile: {
          id: fbSession.userId,
          name: fbSession.userName,
          avatarUrl: fbSession.avatarUrl,
        },
        targets,
        streams,
      });
    } catch (err: any) {
      console.error("[Facebook Streams Error]:", err?.message || err);
      return res.status(502).json({
        success: false,
        message: "Không tải được danh sách khóa luồng từ Facebook.",
      });
    }
  });

  app.post("/api/facebook/create-live", async (req, res) => {
    try {
      const fbSession = decryptFacebookSession(getBearerFromReq(req));
      if (!fbSession) {
        return res.status(401).json({
          success: false,
          message: "Phiên đăng nhập Facebook đã hết hạn. Vui lòng đăng nhập lại.",
        });
      }

      const rawTargetId = typeof req.body?.targetId === "string" ? req.body.targetId.trim() : "me";
      if (rawTargetId !== "me" && !/^\d{4,32}$/.test(rawTargetId)) {
        return res.status(400).json({ success: false, message: "Mã Fanpage/tài khoản không hợp lệ." });
      }
      const title =
        typeof req.body?.title === "string" && req.body.title.trim()
          ? req.body.title.trim().slice(0, 120)
          : "Livestream Pickleball — Nảy Court";

      let targetToken = fbSession.accessToken;
      let targetName = fbSession.userName;
      let targetType: "user" | "page" = "user";

      if (rawTargetId !== "me") {
        const pagesUrl = new URL("https://graph.facebook.com/v21.0/me/accounts");
        pagesUrl.searchParams.set("fields", "id,name,access_token");
        pagesUrl.searchParams.set("limit", "25");
        pagesUrl.searchParams.set("access_token", fbSession.accessToken);
        const pagesRes = await fetch(pagesUrl.toString(), { signal: AbortSignal.timeout(8000) });
        if (pagesRes.ok) {
          const pagesJson: any = await pagesRes.json();
          const foundPage = (Array.isArray(pagesJson?.data) ? pagesJson.data : []).find(
            (p: any) => String(p?.id) === rawTargetId,
          );
          if (!foundPage?.access_token) {
            return res.status(403).json({
              success: false,
              message: "Không có quyền tạo livestream trên Fanpage đã chọn.",
            });
          }
          targetToken = String(foundPage.access_token);
          targetName = String(foundPage.name || rawTargetId);
          targetType = "page";
        }
      }

      const createUrl = new URL(`https://graph.facebook.com/v21.0/${rawTargetId}/live_videos`);
      const bodyParams = new URLSearchParams({
        status: "LIVE_NOW",
        title,
        access_token: targetToken,
      });

      const createRes = await fetch(createUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: bodyParams.toString(),
        signal: AbortSignal.timeout(10000),
      });
      const createJson: any = await createRes.json();
      if (!createRes.ok || createJson?.error || !createJson?.id) {
        return res.status(400).json({
          success: false,
          message:
            createJson?.error?.message ||
            "Facebook từ chối tạo phiên livestream mới (kiểm tra quyền publish_video / điều kiện tài khoản).",
        });
      }

      const rawRtmp = String(createJson?.secure_stream_url || createJson?.stream_url || "");
      const split = splitRtmpStreamUrl(rawRtmp);

      return res.json({
        success: true,
        stream: {
          id: String(createJson.id),
          targetId: rawTargetId,
          targetName,
          targetType,
          title,
          status: "LIVE_NOW",
          serverUrl: split.serverUrl || "rtmps://live-api-s.facebook.com:443/rtmp/",
          streamKey: split.streamKey,
          permalinkUrl: createJson?.permalink_url ? String(createJson.permalink_url) : undefined,
        },
      });
    } catch (err: any) {
      console.error("[Facebook Create Live Error]:", err?.message || err);
      return res.status(502).json({
        success: false,
        message: "Không tạo được phiên livestream mới trên Facebook.",
      });
    }
  });

  // ---------------- YOUTUBE: TỰ ĐỘNG LẤY KHÓA LUỒNG & DANH SÁCH BUỔI PHÁT ----------------
  app.get("/api/youtube/streams", async (req, res) => {
    try {
      const ytBearer = getBearerFromReq(req);
      if (!ytBearer) {
        return res.status(401).json({
          success: false,
          message: "Chưa đăng nhập tài khoản YouTube.",
        });
      }

      const authHeaders = { Authorization: `Bearer ${ytBearer}` };

      // 1. Thông tin kênh YouTube đang đăng nhập
      let channel: { id?: string; title?: string; avatarUrl?: string } | null = null;
      try {
        const chUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
        chUrl.searchParams.set("part", "snippet");
        chUrl.searchParams.set("mine", "true");
        const chRes = await fetch(chUrl.toString(), {
          headers: authHeaders,
          signal: AbortSignal.timeout(8000),
        });
        if (chRes.status === 401) {
          return res.status(401).json({
            success: false,
            message: "Phiên đăng nhập YouTube đã hết hạn. Vui lòng đăng nhập lại.",
          });
        }
        if (chRes.ok) {
          const chJson: any = await chRes.json();
          const first = Array.isArray(chJson?.items) ? chJson.items[0] : null;
          if (first) {
            channel = {
              id: String(first.id || ""),
              title: String(first?.snippet?.title || "Kênh YouTube"),
              avatarUrl: first?.snippet?.thumbnails?.default?.url || undefined,
            };
          }
        }
      } catch {}

      // 2. Lấy danh sách liveBroadcasts + liveStreams (bao gồm cả stream dùng 1 lần qua id)
      const bcUrl = new URL("https://www.googleapis.com/youtube/v3/liveBroadcasts");
      bcUrl.searchParams.set("part", "id,snippet,contentDetails,status");
      bcUrl.searchParams.set("mine", "true");
      bcUrl.searchParams.set("maxResults", "25");
      const bcRes = await fetch(bcUrl.toString(), {
        headers: authHeaders,
        signal: AbortSignal.timeout(8000),
      });
      if (bcRes.status === 401) {
        return res.status(401).json({
          success: false,
          message: "Phiên đăng nhập YouTube đã hết hạn. Vui lòng đăng nhập lại.",
        });
      }
      const bcJson: any = bcRes.ok ? await bcRes.json() : {};
      const broadcasts: any[] = Array.isArray(bcJson?.items) ? bcJson.items : [];

      const streamsMineUrl = new URL("https://www.googleapis.com/youtube/v3/liveStreams");
      streamsMineUrl.searchParams.set("part", "id,snippet,cdn,status");
      streamsMineUrl.searchParams.set("mine", "true");
      streamsMineUrl.searchParams.set("maxResults", "25");
      const streamsMineRes = await fetch(streamsMineUrl.toString(), {
        headers: authHeaders,
        signal: AbortSignal.timeout(8000),
      });
      const streamsMineJson: any = streamsMineRes.ok ? await streamsMineRes.json() : {};
      const streamById = new Map<string, any>();
      for (const s of Array.isArray(streamsMineJson?.items) ? streamsMineJson.items : []) {
        if (s?.id) streamById.set(String(s.id), s);
      }

      const missingBoundIds = broadcasts
        .map((b) => String(b?.contentDetails?.boundStreamId || "").trim())
        .filter((id) => id && !streamById.has(id));

      if (missingBoundIds.length > 0) {
        const boundUrl = new URL("https://www.googleapis.com/youtube/v3/liveStreams");
        boundUrl.searchParams.set("part", "id,snippet,cdn,status");
        boundUrl.searchParams.set("id", missingBoundIds.slice(0, 25).join(","));
        const boundRes = await fetch(boundUrl.toString(), {
          headers: authHeaders,
          signal: AbortSignal.timeout(8000),
        });
        if (boundRes.ok) {
          const boundJson: any = await boundRes.json();
          for (const s of Array.isArray(boundJson?.items) ? boundJson.items : []) {
            if (s?.id) streamById.set(String(s.id), s);
          }
        }
      }

      const normalizeIngestUrl = (addr: string) => {
        const clean = (addr || "").trim();
        if (!clean) return "rtmp://a.rtmp.youtube.com/live2/";
        return clean.endsWith("/") ? clean : `${clean}/`;
      };

      const options: Array<{
        id: string;
        broadcastId?: string;
        title: string;
        status: string;
        serverUrl: string;
        streamKey: string;
        liveChatId?: string;
      }> = [];
      const seenKeySet = new Set<string>();

      const statusPriority: Record<string, number> = {
        live: 0,
        testing: 1,
        ready: 2,
        created: 3,
        complete: 9,
      };
      const sortedBroadcasts = [...broadcasts].sort((a, b) => {
        const pa = statusPriority[String(a?.status?.lifeCycleStatus || "")] ?? 5;
        const pb = statusPriority[String(b?.status?.lifeCycleStatus || "")] ?? 5;
        return pa - pb;
      });

      for (const b of sortedBroadcasts) {
        const st = String(b?.status?.lifeCycleStatus || "");
        if (st === "complete" || st === "revoked") continue;
        const boundId = String(b?.contentDetails?.boundStreamId || "").trim();
        const streamObj = boundId ? streamById.get(boundId) : null;
        const streamKey = String(streamObj?.cdn?.ingestionInfo?.streamName || "").trim();
        const serverUrl = normalizeIngestUrl(
          String(streamObj?.cdn?.ingestionInfo?.ingestionAddress || ""),
        );
        if (!streamKey) continue;
        seenKeySet.add(`${b.id}:${streamKey}`);
        options.push({
          id: `bc_${String(b.id)}`,
          broadcastId: String(b.id),
          title: String(b?.snippet?.title || "Buổi phát YouTube"),
          status: st || "ready",
          serverUrl,
          streamKey,
          liveChatId: b?.snippet?.liveChatId ? String(b.snippet.liveChatId) : undefined,
        });
      }

      for (const s of streamById.values()) {
        const streamKey = String(s?.cdn?.ingestionInfo?.streamName || "").trim();
        if (!streamKey) continue;
        if (options.some((o) => o.streamKey === streamKey)) continue;
        options.push({
          id: `st_${String(s.id)}`,
          title: String(s?.snippet?.title || "Khóa luồng mặc định YouTube"),
          status: String(s?.status?.streamStatus || "ready"),
          serverUrl: normalizeIngestUrl(String(s?.cdn?.ingestionInfo?.ingestionAddress || "")),
          streamKey,
        });
      }

      return res.json({
        success: true,
        channel,
        streams: options,
      });
    } catch (err: any) {
      console.error("[YouTube Streams Error]:", err?.message || err);
      return res.status(502).json({
        success: false,
        message: "Không tải được khóa luồng từ tài khoản YouTube.",
      });
    }
  });

  // Đồng bộ bình luận trực tiếp từ nền tảng phát (Facebook / YouTube) dựa trên Khóa luồng & phiên đăng nhập
  interface ExternalLiveCommentItem {
    id: string;
    author: string;
    text: string;
    createdAt: string;
    platform: "youtube" | "facebook";
    avatarUrl?: string;
    badge?: string;
    highlightAmount?: string;
  }

  const extractFacebookVideoIdFromStreamKey = (rawKey: string): string | null => {
    const trimmed = rawKey.trim();
    if (!trimmed) return null;
    // Key một lần của Facebook thường có dạng: 1234567890123456?s_bl=1&s_oil=2...
    const directMatch = trimmed.match(/^(\d{8,24})(?:[?&]|$)/);
    if (directMatch?.[1]) return directMatch[1];
    // Key dạng FB-1234567890123456-0-...
    const fbPrefixed = trimmed.match(/^FB-(\d{8,24})(?:-|$)/i);
    if (fbPrefixed?.[1]) return fbPrefixed[1];
    return null;
  };

  const resolveFacebookLiveVideoWithToken = async (
    streamKey: string,
    userOrAppToken: string,
    explicitVideoId?: string,
  ): Promise<{ videoId: string; readToken: string } | null> => {
    const keyPart = streamKey.split("?")[0]?.trim() || streamKey.trim();
    const matchStream = (v: any): boolean => {
      if (explicitVideoId && String(v?.id) === explicitVideoId) return true;
      const s1 = String(v?.secure_stream_url || "");
      const s2 = String(v?.stream_url || "");
      return (
        (Boolean(s1) && (s1.includes(streamKey) || (keyPart.length >= 8 && s1.includes(keyPart)))) ||
        (Boolean(s2) && (s2.includes(streamKey) || (keyPart.length >= 8 && s2.includes(keyPart))))
      );
    };

    try {
      const meUrl = new URL("https://graph.facebook.com/v21.0/me/live_videos");
      meUrl.searchParams.set("fields", "id,status,stream_url,secure_stream_url");
      meUrl.searchParams.set("limit", "15");
      meUrl.searchParams.set("access_token", userOrAppToken);
      const meRes = await fetch(meUrl.toString(), { signal: AbortSignal.timeout(7000) });
      if (meRes.ok) {
        const meJson: any = await meRes.json();
        const found = (Array.isArray(meJson?.data) ? meJson.data : []).find(matchStream);
        if (found?.id) return { videoId: String(found.id), readToken: userOrAppToken };
      }

      const pagesUrl = new URL("https://graph.facebook.com/v21.0/me/accounts");
      pagesUrl.searchParams.set("fields", "id,access_token");
      pagesUrl.searchParams.set("limit", "25");
      pagesUrl.searchParams.set("access_token", userOrAppToken);
      const pagesRes = await fetch(pagesUrl.toString(), { signal: AbortSignal.timeout(7000) });
      if (pagesRes.ok) {
        const pagesJson: any = await pagesRes.json();
        const pages: any[] = Array.isArray(pagesJson?.data) ? pagesJson.data : [];
        for (const p of pages) {
          if (!p?.id) continue;
          const pageToken = String(p.access_token || userOrAppToken);
          const pvUrl = new URL(`https://graph.facebook.com/v21.0/${p.id}/live_videos`);
          pvUrl.searchParams.set("fields", "id,status,stream_url,secure_stream_url");
          pvUrl.searchParams.set("limit", "15");
          pvUrl.searchParams.set("access_token", pageToken);
          const pvRes = await fetch(pvUrl.toString(), { signal: AbortSignal.timeout(6000) });
          if (pvRes.ok) {
            const pvJson: any = await pvRes.json();
            const found = (Array.isArray(pvJson?.data) ? pvJson.data : []).find(matchStream);
            if (found?.id) return { videoId: String(found.id), readToken: pageToken };
          }
        }
      }
    } catch {}
    return null;
  };

  app.post("/api/livestream/comments", async (req, res) => {
    try {
      const rawPlatform = typeof req.body?.platform === "string" ? req.body.platform.trim() : "";
      const rawServerUrl = typeof req.body?.serverUrl === "string" ? req.body.serverUrl.trim() : "";
      const rawStreamKey = typeof req.body?.streamKey === "string" ? req.body.streamKey.trim() : "";
      const explicitVideoId =
        typeof req.body?.videoId === "string" && /^\d{4,32}$/.test(req.body.videoId.trim())
          ? req.body.videoId.trim()
          : undefined;
      const explicitBroadcastId =
        typeof req.body?.broadcastId === "string" ? req.body.broadcastId.trim() : undefined;

      const bearer = getBearerFromReq(req);

      if (!rawStreamKey && !explicitVideoId && !explicitBroadcastId) {
        return res.json({
          success: true,
          platform: rawPlatform || "none",
          comments: [],
          status: "waiting_key",
          unavailableReason:
            "Đăng nhập YouTube / Facebook hoặc nhập Khóa luồng ở mục StreamKey để tự đồng bộ bình luận trực tiếp.",
        });
      }

      const lowerServer = rawServerUrl.toLowerCase();
      const detectedPlatform: "facebook" | "youtube" | "custom" =
        rawPlatform === "facebook" ||
        lowerServer.includes("facebook") ||
        rawStreamKey.startsWith("FB-") ||
        rawStreamKey.includes("s_vt=api-s")
          ? "facebook"
          : rawPlatform === "youtube" || lowerServer.includes("youtube")
            ? "youtube"
            : "custom";

      // 1. Nền tảng Facebook Live (ưu tiên token người dùng đã đăng nhập, fallback FB_GRAPH_TOKEN nếu có)
      if (detectedPlatform === "facebook") {
        const fbSession = bearer ? decryptFacebookSession(bearer) : null;
        const fbToken = fbSession?.accessToken || process.env.FB_GRAPH_TOKEN?.trim() || "";
        const guessedId = explicitVideoId || extractFacebookVideoIdFromStreamKey(rawStreamKey);

        if (!fbToken) {
          return res.json({
            success: true,
            platform: "facebook",
            detectedVideoId: guessedId,
            comments: [],
            status: "token_required",
            unavailableReason:
              "Hãy bấm Đăng nhập Facebook ở mục StreamKey để tự lấy khóa luồng và đồng bộ bình luận trực tiếp.",
          });
        }

        const resolved = await resolveFacebookLiveVideoWithToken(rawStreamKey, fbToken, guessedId || undefined);
        const videoId = resolved?.videoId || guessedId;
        const readToken = resolved?.readToken || fbToken;

        if (!videoId) {
          return res.json({
            success: true,
            platform: "facebook",
            comments: [],
            status: "not_found",
            unavailableReason:
              "Chưa tìm thấy phiên Facebook Live khớp với Khóa luồng hiện tại trên tài khoản/Fanpage đang kết nối.",
          });
        }

        const graphUrl = new URL(`https://graph.facebook.com/v21.0/${videoId}/comments`);
        graphUrl.searchParams.set("live_filter", "toplevel");
        graphUrl.searchParams.set("filter", "stream");
        graphUrl.searchParams.set("order", "reverse_chronological");
        graphUrl.searchParams.set("limit", "50");
        graphUrl.searchParams.set("fields", "id,from{id,name,picture{url}},message,created_time");
        graphUrl.searchParams.set("access_token", readToken);

        const fbRes = await fetch(graphUrl.toString(), { signal: AbortSignal.timeout(8000) });
        const fbJson: any = await fbRes.json();
        if (!fbRes.ok || fbJson?.error) {
          return res.json({
            success: true,
            platform: "facebook",
            detectedVideoId: videoId,
            comments: [],
            status: fbRes.status === 401 ? "token_expired" : "api_error",
            unavailableReason:
              fbJson?.error?.message ||
              `Không đọc được bình luận cho phiên Facebook #${videoId}.`,
          });
        }

        const rawRows: any[] = Array.isArray(fbJson?.data) ? fbJson.data : [];
        const comments: ExternalLiveCommentItem[] = rawRows
          .filter((row) => typeof row?.message === "string" && row.message.trim().length > 0)
          .reverse()
          .map((row) => ({
            id: `fb_${String(row.id)}`,
            author: String(row.from?.name || "Người xem Facebook"),
            text: String(row.message).trim(),
            createdAt: row.created_time || new Date().toISOString(),
            platform: "facebook",
            avatarUrl: row.from?.picture?.data?.url || undefined,
          }));

        return res.json({
          success: true,
          platform: "facebook",
          detectedVideoId: videoId,
          comments,
          pollIntervalMs: 4000,
        });
      }

      // 2. Nền tảng YouTube Live dựa trên Bearer token của kênh đã đăng nhập + Khóa luồng
      if (detectedPlatform === "youtube") {
        const ytBearer = bearer;

        if (!ytBearer) {
          return res.json({
            success: true,
            platform: "youtube",
            comments: [],
            status: "token_required",
            unavailableReason:
              "Hãy bấm Đăng nhập YouTube ở mục StreamKey để tự lấy khóa luồng và đồng bộ bình luận Live Chat.",
          });
        }

        const authHeaders = { Authorization: `Bearer ${ytBearer}` };

        const broadcastsUrl = new URL("https://www.googleapis.com/youtube/v3/liveBroadcasts");
        broadcastsUrl.searchParams.set("part", "id,snippet,contentDetails,status");
        broadcastsUrl.searchParams.set("mine", "true");
        broadcastsUrl.searchParams.set("maxResults", "25");
        const bcRes = await fetch(broadcastsUrl.toString(), {
          headers: authHeaders,
          signal: AbortSignal.timeout(8000),
        });
        if (bcRes.status === 401) {
          return res.json({
            success: true,
            platform: "youtube",
            comments: [],
            status: "token_expired",
            unavailableReason: "Phiên đăng nhập YouTube đã hết hạn. Bấm kết nối lại để tiếp tục đồng bộ.",
          });
        }
        if (!bcRes.ok) {
          return res.json({
            success: true,
            platform: "youtube",
            comments: [],
            status: "api_error",
            unavailableReason: "Không tra cứu được buổi phát YouTube Live tương ứng.",
          });
        }
        const bcJson: any = await bcRes.json();
        const broadcasts: any[] = Array.isArray(bcJson?.items) ? bcJson.items : [];

        // Truy vấn thêm liveStreams (cả mine=true và id cụ thể của boundStreamId)
        const streamById = new Map<string, any>();
        const streamsMineUrl = new URL("https://www.googleapis.com/youtube/v3/liveStreams");
        streamsMineUrl.searchParams.set("part", "id,cdn,snippet,status");
        streamsMineUrl.searchParams.set("mine", "true");
        streamsMineUrl.searchParams.set("maxResults", "25");
        const streamsMineRes = await fetch(streamsMineUrl.toString(), {
          headers: authHeaders,
          signal: AbortSignal.timeout(8000),
        });
        if (streamsMineRes.ok) {
          const sj: any = await streamsMineRes.json();
          for (const s of Array.isArray(sj?.items) ? sj.items : []) {
            if (s?.id) streamById.set(String(s.id), s);
          }
        }

        const missingBoundIds = broadcasts
          .map((b) => String(b?.contentDetails?.boundStreamId || "").trim())
          .filter((id) => id && !streamById.has(id));
        if (missingBoundIds.length > 0) {
          const boundUrl = new URL("https://www.googleapis.com/youtube/v3/liveStreams");
          boundUrl.searchParams.set("part", "id,cdn,snippet,status");
          boundUrl.searchParams.set("id", missingBoundIds.slice(0, 25).join(","));
          const boundRes = await fetch(boundUrl.toString(), {
            headers: authHeaders,
            signal: AbortSignal.timeout(8000),
          });
          if (boundRes.ok) {
            const bj: any = await boundRes.json();
            for (const s of Array.isArray(bj?.items) ? bj.items : []) {
              if (s?.id) streamById.set(String(s.id), s);
            }
          }
        }

        const matchedStream = Array.from(streamById.values()).find(
          (s) => String(s?.cdn?.ingestionInfo?.streamName || "").trim() === rawStreamKey,
        );

        const targetBroadcast =
          (explicitBroadcastId ? broadcasts.find((b) => String(b?.id) === explicitBroadcastId) : null) ||
          (matchedStream
            ? broadcasts.find(
                (b) =>
                  b?.contentDetails?.boundStreamId === matchedStream.id &&
                  b?.status?.lifeCycleStatus !== "complete",
              ) || broadcasts.find((b) => b?.contentDetails?.boundStreamId === matchedStream.id)
            : null) ||
          broadcasts.find((b) => b?.status?.lifeCycleStatus === "live") ||
          broadcasts.find((b) => b?.status?.lifeCycleStatus === "testing") ||
          broadcasts.find((b) => b?.status?.lifeCycleStatus === "ready");

        const liveChatId = targetBroadcast?.snippet?.liveChatId;
        if (!liveChatId) {
          return res.json({
            success: true,
            platform: "youtube",
            comments: [],
            status: "not_found",
            unavailableReason:
              "Chưa tìm thấy buổi phát YouTube Live đang bật Live Chat khớp với Khóa luồng này.",
          });
        }

        const msgUrl = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
        msgUrl.searchParams.set("liveChatId", liveChatId);
        msgUrl.searchParams.set("part", "id,snippet,authorDetails");
        msgUrl.searchParams.set("maxResults", "100");
        const msgRes = await fetch(msgUrl.toString(), {
          headers: authHeaders,
          signal: AbortSignal.timeout(8000),
        });
        if (!msgRes.ok) {
          return res.json({
            success: true,
            platform: "youtube",
            comments: [],
            status: msgRes.status === 401 ? "token_expired" : "api_error",
            unavailableReason: "Không tải được tin nhắn Live Chat từ YouTube.",
          });
        }
        const msgJson: any = await msgRes.json();
        const rawItems: any[] = Array.isArray(msgJson?.items) ? msgJson.items : [];
        const comments: ExternalLiveCommentItem[] = rawItems
          .filter((item) => item?.snippet?.displayMessage)
          .map((item) => ({
            id: `yt_${String(item.id)}`,
            author: String(item?.authorDetails?.displayName || "Người xem YouTube"),
            text: String(item.snippet.displayMessage),
            createdAt: item?.snippet?.publishedAt || new Date().toISOString(),
            platform: "youtube",
            avatarUrl: item?.authorDetails?.profileImageUrl || undefined,
            badge: item?.authorDetails?.isChatOwner
              ? "Chủ kênh"
              : item?.authorDetails?.isChatModerator
                ? "Quản trị"
                : undefined,
            highlightAmount: item?.snippet?.superChatDetails?.amountDisplayString
              ? String(item.snippet.superChatDetails.amountDisplayString)
              : undefined,
          }));

        return res.json({
          success: true,
          platform: "youtube",
          comments,
          pollIntervalMs: Math.min(10000, Math.max(3500, Number(msgJson?.pollingIntervalMillis) || 4500)),
        });
      }

      return res.json({
        success: true,
        platform: "custom",
        comments: [],
        status: "unsupported",
        unavailableReason:
          "Máy chủ RTMP tùy chỉnh hiện chưa có API đồng bộ bình luận tự động.",
      });
    } catch (err: any) {
      console.error("[Livestream Comments Error]:", err?.message || err);
      return res.status(502).json({
        success: false,
        platform: "error",
        comments: [],
        message: "Lỗi kết nối khi đồng bộ bình luận theo Khóa luồng.",
      });
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
    let activeStreamKey = "";
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingChunks: Buffer[] = [];

    const safeSend = (payload: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(payload));
        } catch {}
      }
    };

    const sanitizeStderr = (raw: string): string => {
      let cleaned = raw;
      if (activeStreamKey) {
        cleaned = cleaned.split(activeStreamKey).join("***");
      }
      return cleaned;
    };

    const cleanupFfmpeg = () => {
      if (isStopping) return;
      isStopping = true;
      pendingChunks.length = 0;
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

    const translateFfmpegError = (
      raw: string,
      code: number | null,
      signal: NodeJS.Signals | null,
    ): string => {
      if (signal === "SIGSEGV" || signal === "SIGABRT") {
        return "Bộ mã hóa máy chủ gặp lỗi hệ thống khi mở kết nối RTMPS. Vui lòng thử phát lại.";
      }

      const lower = sanitizeStderr(raw).toLowerCase();
      const sentPublish =
        lower.includes("sending publish command") || lower.includes("fcpublish stream");

      if (
        lower.includes("403") ||
        lower.includes("401") ||
        lower.includes("rejected") ||
        lower.includes("netstream.publish") ||
        (lower.includes("publish") && lower.includes("error")) ||
        (sentPublish &&
          (lower.includes("tls fatal alert") ||
            lower.includes("input/output error") ||
            lower.includes("end of file")))
      ) {
        return "Facebook / máy chủ phát từ chối Khóa luồng (Stream Key). Hãy kiểm tra lại Stream Key còn hiệu lực hoặc tạo buổi phát mới.";
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
      if (
        lower.includes("invalid data found") ||
        lower.includes("moov atom not found") ||
        lower.includes("could not find codec parameters")
      ) {
        return "Định dạng luồng video từ trình duyệt chưa khớp. Hãy thử tắt/bật lại Camera hoặc đổi chất lượng video.";
      }
      const codeHint = signal ? ` (${signal})` : code !== null ? ` (mã ${code})` : "";
      return `Luồng phát sóng bị gián đoạn bất ngờ${codeHint}. Vui lòng kiểm tra Stream Key và kết nối mạng rồi thử phát lại.`;
    };

    ws.on("message", async (data, isBinary) => {
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

            hasStartedFfmpeg = true;
            activeStreamKey = rawStreamKey;

            const bin = resolveFfmpegBinary();
            if (!bin.path) {
              safeSend({
                type: "error",
                message: "Máy chủ chưa sẵn sàng bộ mã hóa FFmpeg để phát RTMPS.",
              });
              ws.close(1011, "FFmpeg missing");
              return;
            }

            let resolvedRtmpBase = rawRtmpUrl;
            // Neu phai dung ffmpeg-static, phan giai DNS truoc bang Node de tranh loi SIGSEGV trong glibc tinh
            if (bin.source === "ffmpeg-static") {
              try {
                const parsed = new URL(rawRtmpUrl.replace(/^rtmps?:\/\//i, "https://"));
                if (parsed.hostname && !net.isIP(parsed.hostname)) {
                  const looked = await dns.lookup(parsed.hostname, { family: 4 });
                  if (looked?.address) {
                    resolvedRtmpBase = rawRtmpUrl.replace(parsed.hostname, looked.address);
                  }
                }
              } catch {}
            }

            if (isStopping || ws.readyState !== WebSocket.OPEN) return;

            const targetUrl = resolvedRtmpBase.endsWith("/")
              ? `${resolvedRtmpBase}${rawStreamKey}`
              : `${resolvedRtmpBase}/${rawStreamKey}`;

            const rawMime = typeof msg.mimeType === "string" ? msg.mimeType.toLowerCase() : "";
            const inputFormatArgs: string[] = rawMime.includes("mp4")
              ? ["-f", "mp4"]
              : rawMime.includes("webm")
                ? ["-f", "webm"]
                : [];

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
              "2000000",
              "-analyzeduration",
              "2000000",
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
              "-max_muxing_queue_size",
              "1024",
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

            if (pendingChunks.length > 0 && ffmpegProc.stdin && !ffmpegProc.stdin.destroyed) {
              for (const queued of pendingChunks.splice(0, pendingChunks.length)) {
                try {
                  ffmpegProc.stdin.write(queued);
                } catch {}
              }
            }

            ffmpegProc.stderr.on("data", (chunk: Buffer) => {
              const text = chunk.toString("utf8");
              recentStderrTail = (recentStderrTail + text).slice(-3500);

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

            ffmpegProc.on("close", (code, signal) => {
              if (killTimer) {
                clearTimeout(killTimer);
                killTimer = null;
              }
              if (!isStopping && (code !== 0 || signal !== null)) {
                console.error("[Livestream FFmpeg Exit]", {
                  source: bin.source,
                  code,
                  signal,
                  mime: rawMime,
                  tail: sanitizeStderr(recentStderrTail).slice(-1200),
                });
                safeSend({
                  type: "error",
                  message: translateFfmpegError(recentStderrTail, code, signal),
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

      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      if (isStopping) return;
      if (ffmpegProc && ffmpegProc.stdin && !ffmpegProc.stdin.destroyed && !ffmpegProc.stdin.writableEnded) {
        try {
          ffmpegProc.stdin.write(buf);
        } catch {}
      } else if (hasStartedFfmpeg && !ffmpegProc) {
        if (pendingChunks.length < 32) {
          pendingChunks.push(buf);
        }
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
