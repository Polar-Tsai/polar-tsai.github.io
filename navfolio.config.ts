import { pages } from '@navfolio/pages';
import { markdownPlugin } from '@navfolio/plugin-markdown';

import { defineNavfolioConfig } from './src/plugins/config';

export default defineNavfolioConfig({
  // 目前停用 projects / vibe / media 模組（尚無內容，避免空頁面進 sitemap）。
  // 要重新啟用時，從 '@navfolio/pages' 匯入 projectsModule / vibeModule / mediaModule 放回陣列即可，
  // site.toml 裡對應的 topNav 連結會自動重新出現。
  modules: [],
  plugins: [
    markdownPlugin({
      expressiveCode: true,
      layouts: true,
      math: {
        enabled: true,
      },
      mermaid: true,
      responsiveTables: true,
    }),
    pages(),
  ],
});
