# XIANDE

賢德志士 PWA。前端部署在 GitHub Pages，後端由 Google Apps Script 讀寫 Google Sheet 並串接 OneSignal / GitHub 圖片管理。

## 結構

- `index.html`：頁面骨架與 OneSignal 初始化。
- `styles.css`：APP 樣式。
- `app.js`：主要前端互動、API 呼叫、CRM、活動、果園、經典閱讀。
- `classics-reader.js`：經典注音 / 拼音、白話展開與語音朗讀控制。
- `manifest.json` / `sw.js`：PWA 設定與快取。
- `backend/Code.gs.patch.md`：Google Apps Script 後端整理建議，確認後再同步到 Apps Script。
- `backend/ClassicsUpgrade.gs`：新版經典雙語爬蟲與 V2 讀取 API。
- `data/`：靜態資料備份，目前線上資料以 Apps Script / Google Sheet 為準。
- `images/`：分享圖片與 logo。

## 部署

GitHub Pages：

`https://staney41011.github.io/XIANDE/`

前端 API 入口設定在 `app.js` 的 `API_URL`。

## 後端同步

`backend/Code.gs.patch.md` 目前先記錄後端可套用的整理區塊。因為此 repo 是公開的，請勿把含有 OneSignal / GitHub token 的完整 `Code.gs` 直接提交到 GitHub。

經典閱讀升級的同步方式：

1. 在 Apps Script 專案新增 `ClassicsUpgrade.gs`，貼入 repo 中的同名檔案。
2. 在 `handleRequest(e)` 的經典 action 區加入：

```javascript
else if (action === "getClassicContentV2") result = getClassicContentV2(params.targetSheet);
else if (action === "batchCrawlV2") result = batchProcessClassicsV2();
```

3. 重新部署 Web App。
4. 從主領班後台執行「經典更新」。新版爬蟲會把章節工作表整理成 A 欄更新時間、B 欄原文、C 欄現代漢語、D 欄翻譯來源；原文與翻譯筆數不一致時不覆寫該章。

現代漢語由 Apps Script 從[中國哲學書電子化計劃](https://ctext.org/analects/zh)逐章取得，repo 不保存譯文內容。

## 暫不調整

目前保留既有推播流程、忘記密碼流程，以及讀書計時 / 經典閱讀計時邏輯。經典章節工作表僅新增現代漢語與來源欄位。
