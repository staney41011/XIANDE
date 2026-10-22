# 賢德志士｜Firebase 遷移計畫（獨立測試分支）

狀態：**準備中，尚未建立或連接 Firebase 正式專案，尚未匯入會員資料，尚未部署。**
來源：本 repo `main` 的 PWA + 私有 Google Sheets / Apps Script。
開發分支：`feature/firebase-migration-staging`。正式 `main`、現有 Google Sheet、Apps Script 保持原樣。

## 目標與保留項目

- **不換網址**：繼續從 GitHub Pages 開啟原有 PWA；只逐步替換資料存取層。
- **完整保留功能**：註冊、求道名登入、果園、個人統計、期別、LOG、CRM、活動、分享、經典閱讀、主領班與學長姐權限、OneSignal 推播。
- **完整保留歷史**：第31期個人/公堂結算、原始備份分頁；第32期會員統計及全部有效 LOG。
- **不重新註冊**：建立 UID 一對一映射。密碼採伺服器端安全遷移；無法滿足 Firebase 密碼政策者由管理員協助重設，不得降低政策。
- **嚴格先備份、對帳、影子驗證，再切換**；絕不從尚未驗證的 Firebase 回寫正式 Google Sheet。

## 目標架構

```text
既有 GitHub Pages PWA（網址不變）
  ├── Firebase Authentication（求道名登入 UX，底層 Auth UID）
  ├── Firestore（權限控管後直接讀取／本機快取）
  │   ├── 果園公堂摘要、當期期別、最近20筆LOG
  │   ├── 自己的會員與成果資料
  │   └── 權限篩選的 CRM、活動、經典
  ├── Cloud Functions callable（原子寫入、授權敏感操作）
  │   └── submitAchievement: 成果＋公堂＋總期別＋LOG 同交易
  └── OneSignal（既有推播流程另外驗證）
  
暫保留 Google Sheets + Apps Script 為來源與回退依據，
未通過驗收前不得作為雙向、同時可寫的兩套主資料庫。
```

## 資料模型 v1（欄位需以切換前即時快照校核）

| Google Sheets 來源 | Firebase 目的 | 備註 |
| --- | --- | --- |
| Users | Authentication / profiles / memberStats | UID 對應求道名；私密認證資料不寫入 Firestore |
| Logs | activityLogs | 保留日期、作者、行為、原始說明與來源追蹤 ID |
| 第31期個人／公堂結算及備份 | archivedSeasons / archivedMemberStats | 唯讀封存，與第32期分開 |
| Config | publicConfig / system | 系統設定與敏感設定分離 |
| CRM、CRMNotes、CRMReminders | crmRecords、crmNotes、crmReminders | 須重建 owner/sharedWith 權限 |
| Calendar | events | 區分全體、公堂、特定成員可見 |
| Share | shareItems | 圖片留在原 GitHub 直到驗證完畢 |
| ClassicsMenu、各經典工作表 | classics | 長文本按章節快取；搜尋需驗收 |
| 學員團隊、公堂角色 | profiles + Firebase Auth custom claims | 管理員角色不得由前端自行修改 |

### 目前先設計的文件欄位

- `system/activeSeason`: `{seasonId:"season32"}`。
- `profiles/{uid}`: `{displayName,active:true,hallId,teamMajor,teamMinor,role}`；**禁止**保存原始密碼。
- `memberStats/{uid}`: `{seasonId:"season32",hallId,spoke,convert,joinClass,...}`。
- `orchardSeasons/season32`: `{seasonId:"season32",name:"賢德班第32期",spoke,convert,joinClass}`。
- `orchardHalls/season32_{hallId}`: `{seasonId:"season32",hallId,name,members,spoke,convert,joinClass}`。
- `activityLogs/{uid}_{requestId}`: `{uid,seasonId,hallId,displayName,action,type,delta,createdAt,source,requestId}`。
- **公堂識別碼**由遷移程式統一產生穩定 ID，不直接依中文字串猜測。

## 已建好的 staging 元件

- `firebase.json`: 只設定 Firestore、Functions、模擬器，不接管 GitHub Pages 網站。
- `firestore.rules`: 用戶端只允許授權讀取，**一律禁止直接修改**會員統計與 LOG。
- `firestore.indexes.json`: 當期活動、個人活動的查詢索引。
- `functions/index.js`: `submitAchievement` 的授權、非負數檢驗、UUID 去重與交易；`getOrchardOverview` 的合併讀取。
- `functions/package.json`: Node.js 22。
- 所有內容均是**開發雛形**：尚未透過 Firebase Emulator 及身分權限測試，不可直接上線。

## 實作／上線必經關卡

1. **Firebase 連線與環境**：用專屬 Firebase 專案，建立 Web App、Authentication、Firestore；如使用 Cloud Functions，需評估 Blaze 計費並設定預算警示。台灣使用者優先考慮 `asia-east1`，部署前核對各服務可用區與成本。
2. **備份**：建立僅授權管理者可讀的 Google Sheets 完整私有快照，含全部分頁／第31期封存與當期，並將時間和校驗碼記錄在遷移紀錄。不得把資料或密碼提交到公開 GitHub、Issues、Actions artifacts。
3. **會員匯入**：在安全的管理者執行環境中，用 Admin SDK 建立 Firebase Auth 帳戶和 UID 對照。若需要沿用舊密碼，只能在受控、一次性的伺服器環境處理；不可將明碼複製到 Firestore 或客戶端。檢查重複求道名、無效或過短密碼、角色權限。
4. **資料匯入**：先導入期別／公堂，再導入會員、LOG、CRM、活動與經典。每筆帶可稽核的來源識別碼；支持重跑但不重複匯入。
5. **完整對帳**：先對比每位會員、每個公堂、整期「開口／渡眾／入班」與當期有效 LOG；檢查負數修正及第31期封存。不得以被刪除的歷史 LOG 推測不存在的資料。再驗證 CRM 分享範圍和活動可見性。
6. **安全及效能測試**：用 Emulator 測試未登入、跨公堂、一般志士、學長姐、主領班權限；同一成果 UUID 連按十次只入帳一次；失敗沒有部分成功；收集手機冷／暖啟動 P50/P95 延遲。
7. **影子驗證**：舊 Apps Script 繼續作唯一寫入來源，Firebase 只接收授權同步和測試讀取。正式切換前短暫凍結舊站寫入，補齊增量、再全量對帳。
8. **逐步切換**：先小範圍使用者，驗證登入、果園、LOG、CRM、經典、推播；再全員切換。保留原系統只讀回退方案；不要無限制雙寫避免衝突。
9. **營運**：監控讀寫用量、函式錯誤、成本警示、不可刪改校正 LOG、私有異地備份（Firestore PITR／託管備份可能需要付費）。

## 效能與驗收標準（目標值，非測量結果）

- 已登入的使用者再次開啟 APP：優先呈現經授權的本機快取。
- 果園初次讀取：只取得公堂彙總及最近20筆 LOG，不下載所有會員資料。
- 一般使用者 CRM：只拉本人建立／獲分享的文件，不全表掃描。
- 正確性：**每個會員、每個公堂、全期三項成果與有效 LOG 對帳為零差異**。
- 資安：Firebase Security Rules 和 Emulator 權限測試全部通過；任何公開 Repo 不含密碼、私有名單、憑證與 Token。
- 功能：所有既有頁面、管理員操作、OneSignal 完整回歸測試通過。

## 目前限制

Firebase 專案尚未由使用者連接並授權；目前 staging 只是**非正式開發分支**。
沒有 Firebase project ID、API 設定、伺服器憑證時，不可假裝已經建立資料庫、完成遷移或實測成功。
