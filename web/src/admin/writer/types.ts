// Bản sao của worker/src/writer/types.ts — đổi thì sửa cả hai.

export type Pov = "ngoi1" | "ngoi3";
export type Ending = "co-hau" | "twist";
export type EpisodeStatus = "draft" | "sent";

export interface WriterCharacter {
  name: string;
  gender: "nam" | "nữ";
  age: string;
  role: string; // vai trò / tính cách
  /** vai chuẩn để Xưởng gán giọng (docs/giong-doc-doi-thu.md 4.1): Mẹ chồng, Nàng dâu, Chồng, Bố chồng / ông, Trẻ con…; "" = khác */
  voice: string;
}

export interface OutlineEpisode {
  no: number;
  title: string;
  summary: string;
  cliffhanger: string;
}

export interface Outline {
  title: string;
  logline: string;
  seoTitle: string;
  seoDescription: string;
  episodes: OutlineEpisode[];
}

export interface WriterProject {
  id: string;
  title: string;
  genre: string;
  idea: string;
  characters: WriterCharacter[];
  episodeMinutes: number;
  episodeCount: number;
  pov: Pov;
  ending: Ending;
  notes: string;
  outline: Outline | null;
  createdAt: number;
  updatedAt: number;
}

export interface WriterEpisode {
  id: string;
  projectId: string;
  epNo: number;
  title: string;
  script: string;
  cliffhanger: string;
  teaser: string;
  seoTitle: string;
  seoDescription: string;
  hashtags: string;
  status: EpisodeStatus;
  sentAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Gói Xưởng audio đọc: GET /api/admin/writer/scripts/:id */
export interface StudioScript {
  id: string;
  projectId: string;
  projectTitle: string;
  epNo: number;
  episodeCount: number;
  title: string;
  script: string;
  teaser: string;
  characters: WriterCharacter[];
  roles: string[];
  estSeconds: number;
  sentAt: number | null;
  updatedAt: number;
}
