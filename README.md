# polar-tsai.github.io

<!-- 一句話介紹這個網站是什麼、給誰看的 -->

線上網址:https://polar-tsai.github.io/

## 關於我

<!-- 簡短自我介紹，或直接連到 /about 頁面 -->

## 技術框架

- [Astro](https://astro.build/) — 靜態網站框架
- [astro-navfolio](https://github.com/navfolio/astro-navfolio) — 本站使用的主題
- TailwindCSS — 樣式
- Bun — 套件管理 / 執行環境
- TypeScript

## 本機開發

```bash
bun install
bun run dev      # 啟動開發伺服器
bun run build    # 建置正式版本
bun run preview  # 本機預覽建置結果
```

## 內容結構

- `src/content/blog/` — 部落格文章
- `src/content/about.mdx` — 關於我頁面
- `src/content/projects/` — 專案介紹（如有啟用）

新增文章:

```bash
bun run post:new <slug>
```

## 部署

推送到 `main` 分支會由 GitHub Actions（`.github/workflows/deploy-pages.yml`）自動建置並部署到 GitHub Pages。

## 授權

<!-- 依照 astro-navfolio 主題授權條款填寫，或說明你自己內容的授權方式 -->
