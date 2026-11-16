# Eagles Daily Word

供 Eagles 敬拜隊約 60 位中學生使用的讀經手帳。學生和老師各有獨立的首頁及導覽。首個計劃 **Christmas Countdown / 24 Days of Luke** 於香港時間 **2026 年 12 月 1 日至 24 日** 每日開放《路加福音》一章。

## 1. 先試用學生版和老師版

解壓後，在含有此檔案的資料夾執行以下指令，再用瀏覽器開啟 [http://127.0.0.1:8765/](http://127.0.0.1:8765/)。

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory site
```

- 預設以學生「晨星」進入，示範日為 12 月 12 日。可調整頂部日期，試用讀經、補讀和解鎖。
- 頂部可切換老師版及學生版。老師可在概覽查個人報到紀錄，在隊員管理新增虛構 UID，在留言管理刪除或還原分享和回覆，在計劃頁建立活動。
- 全部 60 位示範隊員都是虛構資料。示範更改保存在同一瀏覽器及同一網址下。清除該網站的本機資料即可重置。示範模式和 Firebase 使用獨立的資料來源。
- 請以本機伺服器開啟。瀏覽器直接開啟 HTML 檔案時可能會阻擋 JavaScript 模組和經文載入。

## 2. 發佈到 GitHub Pages

1. 建立空白 GitHub repository，將解壓後的**整個專案內容**放在根目錄，包含隱藏的 `.github/workflows/pages.yml`。分支使用 `main`。
2. 在 **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。
3. 推送至 `main`，或在 **Actions → Deploy Eagles Daily Word** 手動執行。工作流程會測試計劃及經文資料，然後發佈 `site/`。發佈網址可在 Pages 設定或工作流程找到，通常為 `https://帳戶.github.io/儲存庫/`。
4. 原樣發佈會開啟示範模式。要給真實隊員使用，先完成下一節的 Firebase 設定，再重新發佈。

網站以相對路徑載入資源，用 `#read`、`#admin` 等頁內網址導覽，支援 GitHub Pages 的 repository 子路徑。Pages 成品只包含 `site/`。將 repository 或 Pages 視為可公開讀取的前端，隊內資料的存取由 Firebase 控制。

如喜歡用 Git 推送，在專案根目錄執行下列指令，替換 repository 網址。

```sh
git init -b main
git add .
git commit -m "Add Eagles Daily Word"
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPO.git
git push -u origin main
```

[GitHub Pages 自訂工作流程](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## 3. 啟用正式 Firebase

### 建立專案、登入服務與資料庫

1. 在 Firebase Console 建立由學校或團隊管理的專案，註冊一個 **Web app**。
2. 在 **Authentication → Sign-in method** 啟用 **Email/Password**。在 **Authentication → Settings → Authorized domains** 加入實際網站主機名稱，例如 `YOUR_ACCOUNT.github.io`。主機名稱無須包含 repository 路徑。若使用自訂網域，也加入該網域。
3. 開設 Cloud Firestore 的 **(default)** 資料庫，從 **Production mode** 起步。按學校對儲存地區的要求選擇位置。
4. 安裝 Node.js 22 或以上，再從專案根目錄登入 Firebase CLI 並部署規則和索引。將 `YOUR_PROJECT_ID` 替換為 Firebase Project ID。讓回覆索引完成建置，再測試老師的審核頁。

```sh
npm ci
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
```

[Firebase 電郵密碼登入](https://firebase.google.com/docs/auth/web/password-auth) · [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/rules-conditions)

### 開通首位老師並匯入聖誕計劃

1. 在 **Authentication → Users → Add user** 用學校電郵建立首位老師的登入，記下 UID。密碼按學校做法交予本人，或讓本人從網站「忘記密碼」設定。
2. 使用具備 Firestore 寫入和 Firebase Auth 查閱權限的專案管理員執行下列指令。需安裝 Google Cloud CLI 並授權本機 Application Default Credentials（ADC）。用實際 Project ID 和老師 UID 替換指令中的值。

```sh
gcloud auth application-default login
node tools/bootstrap.js YOUR_PROJECT_ID YOUR_TEACHER_UID
```

此指令建立 `plans/christmas-2026` 與首位老師的會員資料。重複執行會保留原有計劃與帳戶設定。也可以只傳入 Project ID，單獨匯入計劃。如果不用這個腳本，可先在 Firestore Console 建立 `members/{老師UID}` 文件，欄位為字串 `nickname`、字串 `role` 值 `teacher`、布林 `active` 值 `true`、布林 `shareProgress` 值 `false`。活動開始前，老師可在後台手動排程 2026-12-01、`LUK 1` 至 `LUK 24` 的倒數計劃。

[Admin SDK 與 Application Default Credentials](https://firebase.google.com/docs/admin/setup)

### 將前端指向正式專案

把 **Project settings → Your apps → SDK setup and configuration** 所顯示的 Firebase Web 設定物件貼入 `site/config.js`，取代 `null`，並保留 `emulators = false`。

```js
export const firebaseConfig = {
  apiKey: 'PASTE_WEB_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  appId: 'PASTE_WEB_APP_ID',
};
export const emulators = false;
```

Firebase Web 設定可隨前端發佈。服務帳戶 JSON、私人金鑰、管理憑證、臨時密碼和真實名單請保存在學校核准的系統。後續可從 Firebase Console 設定登入密碼政策、電郵模板和管理員權限。若正式網站用了自訂的 Firebase Auth 網域，請把它加入 `site/index.html` 的內容安全政策中對應的連線或頁框來源，再實測登入。

### 開通約 60 位隊員

1. 用學校電郵在 Firebase **Authentication → Users** 建立每位帳戶，保管其 Auth UID。學生從網站使用已開通電郵和密碼登入，也可由「忘記密碼」設定自己的密碼。
2. 老師登入 Eagles Daily Word，在 **隊員 → 開通學生** 輸入 Auth UID 與學生暱稱。預設關閉隊內進度分享，學生可自行開啟。網站即使有人直接向 Firebase Auth 註冊，也須有已啟用的會員文件才可讀寫隊內資料。
3. 在老師後台關閉「帳戶啟用」可停止隊內存取並保留歷史報到。若也需阻止登入，在 Firebase Authentication 停用該登入。新增其他老師請由 Firebase 專案管理員在控制台處理。
4. 用老師、兩位測試學生和一個未開通帳戶驗收。分別試登入、查看隊員、切換進度分享、即時發佈及刪除分享、補讀和查看個人報到。透過既有學校流程交代學生資料用途、誰能看到，以及保留安排。

## 4. 日期、進度與私隱

- 首個計劃以香港時間午夜逐日解鎖。讀完按「今日報到」或「完成補讀」。同一計劃的同一天只記一次，語言切換不會再計。12 月 24 日之後仍可回到原計劃補讀。
- 聖誕計劃的七個階段在累計 **0、1、4、8、13、18、24** 章切換。其他長度以比例計算，首次報到會離開完整的蛋，完成全程才展翅。Eagles Nest 按暱稱排列，可按階段篩選，經本人同意的累計數字才對隊友可見。
- 老師可選「一般每日讀經」或「倒數日曆」，由同一書卷自動產生連續章節，也可編輯為跨書卷的一章一日清單，例如 `LUK 2`、`PSA 23`。新計劃按開始日切換為預設；下拉選單可查看過去和已排程計劃。已開始計劃的日期和章序鎖定，仍可更改標題、副標題和展示方式。
- 所有讀經報到、審核結果和計劃留在 Firestore。若要日後清理、匯出或保持備份，由專案管理員依學校約定處理。Firestore Console 或 Admin SDK 的高權限操作由專案 IAM 管理。
- 每次報到以同一交易寫入三份文件。個人報到明細與進度驗證文件限本人和老師讀取，隊內額外文件只含累計數字。Firestore 以伺服器時間驗證解鎖、章節範圍、唯一日期與累計遞增。停用與分享權限在每次資料請求時檢查。
- 分享放在每日經文後，按計劃及日次儲存；新分享和回覆即時向已啟用隊員公開。老師可刪除留言，主帖刪除時整條回覆亦收起；後台保留紀錄及還原功能。舊版待審內容保留原狀供老師處理。
- 經文是可公開讀取的靜態檔案。網站按讀經計劃鎖定介面及報到時間，公版經文本身可從來源網站查閱。

## 5. 經文來源

網站收錄兩個譯本共同的 66 卷書，以 eBible.org 的 VPL 檔案按原節號顯示。VPL 為純經文版，來源已移除腳註及小標。譯本的底本不同時，個別節號可能跳號。

| 顯示名稱 | 數碼來源 | 使用條款 |
|---|---|---|
| 繁體中文《新標點和合本》 | [eBible.org cmn-cu89t](https://ebible.org/bible/details.php?id=cmn-cu89t) · [VPL ZIP](https://ebible.org/Scriptures/cmn-cu89t_vpl.zip) | 來源標示 Public Domain |
| World English Bible Classic | [eBible.org eng-web](https://ebible.org/details.php?id=eng-web) · [VPL ZIP](https://ebible.org/Scriptures/eng-web_vpl.zip) | 譯文為 Public Domain，名稱為 eBible.org 的商標 |

`tools/import-bibles.py` 可重新匯入上述原始壓縮檔，依次傳入中文及英文 VPL ZIP。首頁捧書鷹仔為原創生成插畫，七階段成長貼紙及讀經、鳥巢和分享牆的插畫由網站繪製。Instrument Serif 字型以 SIL Open Font License 提供，授權檔隨字型附上。

## 6. 測試

```sh
npm test
npm run test:rules
```

第一組檢查 66 卷雙語經文、首日和尾日、中途解鎖、歷史計劃及七階段邊界。第二組須安裝 Java 21，用本機 Firestore Emulator 驗證未登入、外人、停用帳戶、學生及老師權限，包括未到日期與重複報到、冒充身份、竄改計數、即時留言及老師刪除權限。

在本機用 Firebase Authentication 和 Firestore 一起驗收時，可執行 `npx firebase emulators:start --only auth,firestore --project demo-eagles`，於測試副本填上 `projectId: 'demo-eagles'`、虛構的 `apiKey` 與 `appId`，將 `emulators` 改為 `true`，並以 `http://127.0.0.1` 開啟。測試資料及帳戶只在模擬器建立。模擬器會將身分驗證郵件連結寫到本機記錄，供開發驗收。

## 2026-11-16 功能更新

- 正式老師帳戶可切換學生版面及返回後台；保留老師身份，瀏覽模式不寫入學生報到。
- 每日經文後設獨立留言區，以 `planId` 和 `dayIndex` 關聯。分享牆保留全部分享。
- 分享及回覆直接以 `approved` 發佈，毋須審核；刪除使用 `hidden` 狀態，老師可還原。
- **部署前先更新 Firestore 規則**：`npx firebase deploy --only firestore:rules --project eagles-daily-word`。GitHub Pages 工作流程只發佈前端，不會更新 Firebase 規則。
