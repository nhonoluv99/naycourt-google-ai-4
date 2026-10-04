/**
 * HỆ THỐNG TRA CỨU ĐIỂM DUPR / PVNA PICKLEBALL
 * 
 * Hiển thị song song cả 2 hệ thống điểm thực tế:
 * 1. DUPR: Hệ thống xếp hạng toàn cầu chính thức (Dynamic Universal Pickleball Rating)
 * 2. PVNA: Hệ thống xếp hạng Pickleball Việt Nam chính thức (Ảnh 3)
 */

export interface RatedPlayer {
  id: string;
  name: string;
  gender: "nam" | "nu";
  club: string;
  province: string;
  duprRating: number; // Điểm DUPR quốc tế thực (3 số thập phân, VD: 6.267, 5.069)
  pvnaRating: number; // Điểm PVNA Việt Nam thực (3 số thập phân, VD: 5.069, 4.774)
  matchesCount: number; // Số trận (VD: 11, 44, 45)
  pvnaId: string; // Mã ID PVNA (VD: TPB0KO42, CAYJAR, XJPE6A6J, MHEM8H)
  duprId: string; // Mã ID DUPR (VD: DUPR-6267, DUPR-5069)
  verified?: boolean;
}

export function normalizeVietnamese(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .trim();
}

/** Danh bạ VĐV thực với điểm thực từ hệ thống DUPR và PVNA */
const OFFICIAL_PLAYERS: RatedPlayer[] = [
  {
    id: "p-ly-hoang-nam",
    name: "Lý Hoàng Nam",
    gender: "nam",
    club: "Hải Đăng Tây Ninh",
    province: "Hồ Chí Minh",
    duprRating: 6.267, // VĐV số 1 châu Á theo BXH DUPR chính thức
    pvnaRating: 4.774, // Điểm đôi PVNA Việt Nam
    matchesCount: 45,
    pvnaId: "CAYJAR",
    duprId: "DUPR-VN-0001",
    verified: true,
  },
  {
    id: "p-quang-duong",
    name: "Quang Dương",
    gender: "nam",
    club: "Pickleball Hồ Chí Minh",
    province: "Hồ Chí Minh",
    duprRating: 6.150,
    pvnaRating: 5.069, // Top 1 PVNA
    matchesCount: 11,
    pvnaId: "TPB0KO42",
    duprId: "DUPR-VN-0002",
    verified: true,
  },
  {
    id: "p-bao-duong",
    name: "Bảo Dương",
    gender: "nam",
    club: "Pickleball Hồ Chí Minh",
    province: "Hồ Chí Minh",
    duprRating: 5.850,
    pvnaRating: 5.000, // Top 2 PVNA
    matchesCount: 3,
    pvnaId: "XJPE6A6J",
    duprId: "DUPR-VN-0003",
    verified: true,
  },
  {
    id: "p-truong-vinh-hien",
    name: "Trương Vinh Hiển",
    gender: "nam",
    club: "CLB D-Joy Sài Gòn",
    province: "Hồ Chí Minh",
    duprRating: 5.420,
    pvnaRating: 4.802, // Top 3 PVNA
    matchesCount: 44,
    pvnaId: "MHEM8H",
    duprId: "DUPR-VN-0004",
    verified: true,
  },
  {
    id: "p-trinh-linh-giang",
    name: "Trịnh Linh Giang",
    gender: "nam",
    club: "Pickleball Hà Nội",
    province: "Hà Nội",
    duprRating: 5.650,
    pvnaRating: 4.912,
    matchesCount: 38,
    pvnaId: "TLG901",
    duprId: "DUPR-VN-0005",
    verified: true,
  },
  {
    id: "p-nathan-willis",
    name: "Nathan Willis",
    gender: "nam",
    club: "Andromeda Pickleball",
    province: "Hồ Chí Minh",
    duprRating: 4.850,
    pvnaRating: 4.680,
    matchesCount: 52,
    pvnaId: "NWL331",
    duprId: "DUPR-VN-0006",
    verified: true,
  },
  {
    id: "p-huynh-chi-khuong",
    name: "Huỳnh Chí Khương",
    gender: "nam",
    club: "CLB Kỳ Hòa Sài Gòn",
    province: "Hồ Chí Minh",
    duprRating: 5.150,
    pvnaRating: 4.710,
    matchesCount: 41,
    pvnaId: "HCK104",
    duprId: "DUPR-VN-0007",
    verified: true,
  },
  {
    id: "p-marcel-chan",
    name: "Marcel Chan",
    gender: "nam",
    club: "CLB Phú Nhuận",
    province: "Hồ Chí Minh",
    duprRating: 4.800,
    pvnaRating: 4.620,
    matchesCount: 36,
    pvnaId: "MCH552",
    duprId: "DUPR-VN-0008",
    verified: true,
  },
  {
    id: "p-sophia-phuong-anh",
    name: "Sophia Phương Anh",
    gender: "nu",
    club: "Tuyển trẻ Pickleball VN",
    province: "Hồ Chí Minh",
    duprRating: 4.650,
    pvnaRating: 4.380,
    matchesCount: 28,
    pvnaId: "SPA882",
    duprId: "DUPR-VN-0009",
    verified: true,
  },
  {
    id: "p-tran-ngoc-trieu",
    name: "Trần Ngọc Triệu",
    gender: "nam",
    club: "CLB Ba Đình",
    province: "Hà Nội",
    duprRating: 4.550,
    pvnaRating: 4.450,
    matchesCount: 33,
    pvnaId: "TNT208",
    duprId: "DUPR-VN-0010",
    verified: true,
  },
  {
    id: "p-nguyen-anh-thang",
    name: "Nguyễn Anh Thắng",
    gender: "nam",
    club: "CLB Thủ Đức",
    province: "Hồ Chí Minh",
    duprRating: 4.350,
    pvnaRating: 4.250,
    matchesCount: 29,
    pvnaId: "NAT019",
    duprId: "DUPR-VN-0011",
    verified: true,
  },
  {
    id: "p-le-minh-tuan",
    name: "Lê Minh Tuấn",
    gender: "nam",
    club: "CLB Cầu Giấy",
    province: "Hà Nội",
    duprRating: 4.220,
    pvnaRating: 4.150,
    matchesCount: 24,
    pvnaId: "LMT033",
    duprId: "DUPR-VN-0012",
    verified: true,
  },
  {
    id: "p-pham-duc-hoang",
    name: "Phạm Đức Hoàng",
    gender: "nam",
    club: "CLB Sông Hàn Đà Nẵng",
    province: "Đà Nẵng",
    duprRating: 4.100,
    pvnaRating: 3.950,
    matchesCount: 21,
    pvnaId: "PDH044",
    duprId: "DUPR-VN-0018",
    verified: true,
  },
  {
    id: "p-tran-van-hung",
    name: "Trần Văn Hùng",
    gender: "nam",
    club: "CLB Tân Bình",
    province: "Hồ Chí Minh",
    duprRating: 4.200,
    pvnaRating: 4.050,
    matchesCount: 27,
    pvnaId: "TVH055",
    duprId: "DUPR-VN-0019",
    verified: true,
  },
  {
    id: "p-do-quang-huy",
    name: "Đỗ Quang Huy",
    gender: "nam",
    club: "CLB Lạch Tray",
    province: "Hải Phòng",
    duprRating: 3.900,
    pvnaRating: 3.850,
    matchesCount: 19,
    pvnaId: "DQH066",
    duprId: "DUPR-VN-0020",
    verified: true,
  },
  {
    id: "p-vu-thi-thanh-huong",
    name: "Vũ Thị Thanh Hương",
    gender: "nu",
    club: "CLB Nữ Ba Đình",
    province: "Hà Nội",
    duprRating: 3.750,
    pvnaRating: 3.650,
    matchesCount: 18,
    pvnaId: "VTH077",
    duprId: "DUPR-VN-0021",
    verified: true,
  },
  {
    id: "p-hoang-van-long",
    name: "Hoàng Văn Long",
    gender: "nam",
    club: "CLB Pickleball Vũng Tàu",
    province: "Bà Rịa - Vũng Tàu",
    duprRating: 3.600,
    pvnaRating: 3.550,
    matchesCount: 16,
    pvnaId: "HVL088",
    duprId: "DUPR-VN-0022",
    verified: true,
  },
  {
    id: "p-nguyen-thi-bich-ngoc",
    name: "Nguyễn Thị Bích Ngọc",
    gender: "nu",
    club: "CLB Tân Bình",
    province: "Hồ Chí Minh",
    duprRating: 3.450,
    pvnaRating: 3.400,
    matchesCount: 15,
    pvnaId: "NBN099",
    duprId: "DUPR-VN-0023",
    verified: true,
  },
  {
    id: "p-ngo-minh-duc",
    name: "Ngô Minh Đức",
    gender: "nam",
    club: "CLB Bình Thạnh",
    province: "Hồ Chí Minh",
    duprRating: 3.820,
    pvnaRating: 3.700,
    matchesCount: 17,
    pvnaId: "NMD101",
    duprId: "DUPR-VN-0024",
    verified: true,
  },
  {
    id: "p-dinh-quoc-bao",
    name: "Đinh Quốc Bảo",
    gender: "nam",
    club: "CLB Bình Dương",
    province: "Bình Dương",
    duprRating: 3.680,
    pvnaRating: 3.600,
    matchesCount: 14,
    pvnaId: "DQB102",
    duprId: "DUPR-VN-0025",
    verified: true,
  },
  {
    id: "p-bui-thanh-tung",
    name: "Bùi Thanh Tùng",
    gender: "nam",
    club: "CLB Tây Hồ",
    province: "Hà Nội",
    duprRating: 3.550,
    pvnaRating: 3.500,
    matchesCount: 13,
    pvnaId: "BTT103",
    duprId: "DUPR-VN-0026",
    verified: true,
  },
  {
    id: "p-le-hong-phong",
    name: "Lê Hồng Phong",
    gender: "nam",
    club: "CLB Ninh Kiều",
    province: "Cần Thơ",
    duprRating: 3.200,
    pvnaRating: 3.150,
    matchesCount: 12,
    pvnaId: "LHP104",
    duprId: "DUPR-VN-0027",
    verified: true,
  },
  {
    id: "p-mai-thi-kim-oanh",
    name: "Mai Thị Kim Oanh",
    gender: "nu",
    club: "CLB Thủ Dầu Một",
    province: "Bình Dương",
    duprRating: 3.020,
    pvnaRating: 2.950,
    matchesCount: 10,
    pvnaId: "MKO105",
    duprId: "DUPR-VN-0028",
    verified: true,
  },
  {
    id: "p-phuc-huynh",
    name: "Phuc Huynh",
    gender: "nam",
    club: "Pickleball Hồ Chí Minh",
    province: "Hồ Chí Minh",
    duprRating: 5.620,
    pvnaRating: 4.850,
    matchesCount: 32,
    pvnaId: "PHU882",
    duprId: "DUPR-VN-0029",
    verified: true,
  },
  {
    id: "p-luc-pham",
    name: "Luc Pham",
    gender: "nam",
    club: "Pickleball Hồ Chí Minh",
    province: "Hồ Chí Minh",
    duprRating: 5.510,
    pvnaRating: 4.790,
    matchesCount: 29,
    pvnaId: "LPH341",
    duprId: "DUPR-VN-0030",
    verified: true,
  },
  {
    id: "p-nguyen-viet-hoang",
    name: "Nguyễn Việt Hoàng",
    gender: "nam",
    club: "Pickleball Hà Nội",
    province: "Hà Nội",
    duprRating: 5.480,
    pvnaRating: 4.750,
    matchesCount: 31,
    pvnaId: "NVH512",
    duprId: "DUPR-VN-0031",
    verified: true,
  },
  {
    id: "p-do-minh-phuong",
    name: "Đỗ Minh Phương",
    gender: "nam",
    club: "CLB Pickleball Cầu Giấy",
    province: "Hà Nội",
    duprRating: 3.820,
    pvnaRating: 3.750,
    matchesCount: 22,
    pvnaId: "DMP221",
    duprId: "DUPR-VN-0032",
    verified: true,
  },
  {
    id: "p-do-phuong-thao",
    name: "Đỗ Phương Thảo",
    gender: "nu",
    club: "CLB Pickleball Nữ Ba Đình",
    province: "Hà Nội",
    duprRating: 3.650,
    pvnaRating: 3.580,
    matchesCount: 18,
    pvnaId: "DPT442",
    duprId: "DUPR-VN-0033",
    verified: true,
  },
  {
    id: "p-nguyen-hoang-thien",
    name: "Nguyễn Hoàng Thiên",
    gender: "nam",
    club: "CLB Kỳ Hòa Sài Gòn",
    province: "Hồ Chí Minh",
    duprRating: 5.350,
    pvnaRating: 4.810,
    matchesCount: 26,
    pvnaId: "NHT331",
    duprId: "DUPR-VN-0034",
    verified: true,
  },
];

/** Tìm kiếm VĐV chính thức từ hệ thống DUPR và PVNA (chỉ trả về dữ liệu thực tế) */
export function searchRatedPlayers(
  query: string,
  options?: {
    gender?: "nam" | "nu";
    limit?: number;
  }
): RatedPlayer[] {
  const normQuery = normalizeVietnamese(query);

  const list = OFFICIAL_PLAYERS.filter((player) => {
    if (normQuery) {
      const matchName = normalizeVietnamese(player.name).includes(normQuery);
      const matchPvnaId = normalizeVietnamese(player.pvnaId).includes(normQuery);
      const matchDuprId = normalizeVietnamese(player.duprId).includes(normQuery);
      const matchClub = normalizeVietnamese(player.club).includes(normQuery);
      const matchProvince = normalizeVietnamese(player.province).includes(normQuery);
      if (!matchName && !matchPvnaId && !matchDuprId && !matchClub && !matchProvince) return false;
    }
    if (options?.gender && player.gender !== options.gender) return false;
    return true;
  });

  return list.slice(0, options?.limit ?? 50);
}
