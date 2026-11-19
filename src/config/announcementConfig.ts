import type { AnnouncementConfig } from "../types/config";

export const announcementConfig: AnnouncementConfig = {
  title: "公告",
  // Personal content only. The original author's update history is not reused.
  items: [
    { tag: "建站", title: "新站测试中", content: "07xh Space 正在移植开源主题与博客内容，正式网站暂时保持不变。", time: "2026-11-19", sort: 1 },
  ],
  closable: true,
};
