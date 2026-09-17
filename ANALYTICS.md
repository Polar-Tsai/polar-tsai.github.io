# 網站分析工具設定

四個工具都已經接好，**程式不用再動**。你只要去各平台申請，把拿到的 ID 貼進 `src/config/site.toml` 的 `[config.analytics]`，然後 commit、push 即可。

留空的欄位 = 該工具不啟用，所以可以一個一個慢慢弄。

```toml
[config.analytics]
ga4 = ""                      # GA4 評估 ID
clarity = ""                  # Clarity 專案 ID
googleSiteVerification = ""   # Google Search Console 驗證碼
bingSiteVerification = ""     # Bing Webmaster Tools 驗證碼
```

> **本機測試不會被記錄**：GA4 和 Clarity 只在正式網站載入，`bun run dev` 不會送出任何數據，所以你自己改稿、預覽不會污染報表。

---

## 建議順序

先做 Google Search Console，因為 Bing 可以直接從它匯入，省一次驗證。

1. Google Search Console（最重要，看搜尋表現）
2. Bing Webmaster Tools（可從 GSC 匯入）
3. GA4（看流量來源與停留時間）
4. Microsoft Clarity（看讀者怎麼滑、卡在哪）

---

## 1. Google Search Console

**功能**：你的文章在 Google 被哪些關鍵字搜到、排第幾名、多少人點進來，以及有沒有收錄失敗的頁面。對部落格來說這是最重要的一個。

1. 進入 <https://search.google.com/search-console>，用 Google 帳號登入
2. 左上角「新增資源」→ 選右邊的 **「網址前置字元」**（不是左邊的「網域」，那個要改 DNS 設定）
3. 輸入 `https://polar-tsai.github.io/`
4. 驗證方式選 **「HTML 標記」**，會給你一段像這樣的東西：
   ```html
   <meta name="google-site-verification" content="abc123def456..." />
   ```
5. **只複製 `content="..."` 裡面那串**，貼進 `site.toml`：
   ```toml
   googleSiteVerification = "abc123def456..."
   ```
6. commit、push，等部署完成（約 1 分鐘）
7. 回到 Search Console 按「驗證」

驗證成功後，到左邊選單「Sitemap」，輸入 `sitemap-index.xml` 送出。這樣 Google 就會定期來抓你的新文章。

> 數據不會馬上出現，通常要 2–3 天才看得到第一批資料。

---

## 2. Bing Webmaster Tools

**功能**：同上，但看的是 Bing。另外 ChatGPT 的網頁搜尋也是走 Bing 的索引，所以想被 AI 引用的話這個值得做。

1. 進入 <https://www.bing.com/webmasters>
2. **最快的做法**：選「匯入自 Google Search Console」，授權後會自動把網站和 sitemap 帶過來，不用再驗證一次
3. 如果選手動新增，驗證方式選 **「HTML 中繼標記」**，一樣只取 `content` 那串：
   ```toml
   bingSiteVerification = "ABC123..."
   ```
   然後 commit、push、按驗證

---

## 3. GA4（Google Analytics 4）

**功能**：讀者從哪裡來（搜尋、LinkedIn、直接輸入網址）、看了哪些頁面、待多久。

1. 進入 <https://analytics.google.com>，建立帳戶（名稱隨意，例如 PolarVista）
2. 建立**資源**：名稱填 PolarVista、時區選「台灣」、幣別「新台幣」
3. 平台選 **「網站」**，網址填 `https://polar-tsai.github.io`，串流名稱隨意
4. 建立後會看到 **「評估 ID」**，格式是 `G-XXXXXXXXXX`
5. 貼進 `site.toml`：
   ```toml
   ga4 = "G-XXXXXXXXXX"
   ```
6. commit、push

**確認有沒有成功**：部署完後打開你的網站，回到 GA4 左邊選單的「報表」→「即時」，應該會看到 1 位使用者（就是你自己）。

> 用 Chrome 無痕視窗測試比較準，一般視窗可能被廣告阻擋器擋掉。

---

## 4. Microsoft Clarity

**功能**：錄下讀者的實際操作（匿名），可以看熱圖（哪裡被點最多）、捲動深度（多少人讀到文章結尾）、以及個別工作階段的重播。文章寫得長時，這個最能看出讀者從哪裡開始流失。**完全免費，沒有流量上限。**

1. 進入 <https://clarity.microsoft.com>，用 Microsoft 或 Google 帳號登入
2. 新增專案：名稱填 PolarVista、網址填 `https://polar-tsai.github.io`
3. 安裝方式選 **「手動安裝」**，會給你一段程式碼，裡面有一行像 `"https://www.clarity.ms/tag/abcd1234"`
4. **只取最後那串 ID**（`abcd1234`），貼進 `site.toml`：
   ```toml
   clarity = "abcd1234"
   ```
5. commit、push

資料通常要等 30 分鐘到 2 小時才會出現第一筆。

---

## 隱私與 Cookie 提醒

GA4 和 Clarity 都會在讀者瀏覽器放 cookie。如果之後讀者主要來自歐盟，法規要求要有 cookie 同意橫幅；台灣目前沒有這個硬性要求，但在 About 頁加一段說明「本站使用 GA4 與 Clarity 分析流量」是常見做法，也比較誠實。

需要的話我可以幫你加上同意橫幅，或在 About 補一段隱私說明。

---

## 之後怎麼看

| 想知道什麼                   | 去哪裡看                          |
| ---------------------------- | --------------------------------- |
| 有沒有人從 Google 搜尋找到我 | Search Console →「成效」          |
| 哪篇文章最多人看             | GA4 →「報表」→「網頁和畫面」      |
| 讀者讀到文章的哪裡就離開     | Clarity →「熱圖」→ 捲動深度       |
| 我的文章在哪些關鍵字有排名   | Search Console →「成效」→「查詢」 |
| 新文章有沒有被 Google 收錄   | Search Console →「網頁索引狀態」  |
