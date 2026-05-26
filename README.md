# XIANDE

賢德志士 PWA。前端部署在 GitHub Pages，後端由 Google Apps Script 讀寫 Google Sheet 並串接 OneSignal / GitHub 圖片管理。

## 結構

- `index.html`：頁面骨架與 OneSignal 初始化。
- `styles.css`：APP 樣式。
- `app.js`：主要前端互動、API 呼叫、CRM、活動、果園、經典閱讀。
- `manifest.json` / `sw.js`：PWA 設定與快取。
- `backend/Code.gs.patch.md`：Google Apps Script 後端整理建議，確認後再同步到 Apps Script。
- `data/`：靜態資料備份，目前線上資料以 Apps Script / Google Sheet 為準。
- `images/`：分享圖片與 logo。

## 部署

GitHub Pages：

`https://staney41011.github.io/XIANDE/`

前端 API 入口設定在 `app.js` 的 `API_URL`。

## 後端同步

`backend/Code.gs.patch.md` 目前先記錄後端可套用的整理區塊。因為此 repo 是公開的，請勿把含有 OneSignal / GitHub token 的完整 `Code.gs` 直接提交到 GitHub。若修改後端，請同步更新 Apps Script 專案中的 `Code.gs`，並重新部署 Web App。

## 暫不調整

目前保留既有推播流程、忘記密碼流程、讀書計時 / 經典閱讀計時邏輯，以及 Google Sheet 資料內容。
