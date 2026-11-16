import {firebaseConfig} from './config.js';
import {dateKey, midnight, endDate, dayDate, readable, todayIndex, stages,
  stageIndex, currentPlan, parseDays, sequence} from './model.js';
import {drawBirds} from './birds.js';
import {makeDemo} from './demo.js';

const header = document.querySelector('#header');
const main = document.querySelector('#main');
const notice = document.querySelector('#notice');
const local = window.localStorage;
const names = new Intl.Collator('zh-Hant', {numeric:true});
const zhDate = new Intl.DateTimeFormat('zh-HK', {month:'long',day:'numeric',timeZone:'Asia/Hong_Kong'});
const fullDate = new Intl.DateTimeFormat('zh-HK', {dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Hong_Kong'});
const stamp = (ms) => ms ? fullDate.format(ms) : '—';
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[char]);
const glyphs = {home:'⌂', read:'▤', nest:'♧', wall:'☷', account:'○', admin:'⚙'};
const navigation = [['home','首頁'],['read','讀經'],['nest','Eagles Nest'],['wall','分享牆'],['account','我的帳戶']];
const adminNav = [['admin','概覽'],['admin-members','隊員'],['admin-moderation','留言管理'],['admin-plans','計劃']];
const labels = {pending:'待審核',approved:'已公開',rejected:'未通過',hidden:'已刪除'};
const statusBadge = (status) => '<span class="badge">' + labels[status] + '</span>';
const button = (contents, classes = 'button') => '<button class="' + classes + '">' + contents + '</button>';
const link = (route, label, classes = 'button') => '<a class="' + classes + '" href="#' + route + '">' + label + '</a>';
const title = (heading, detail = '') => `<div class="page-title"><h1>${heading}</h1>${detail ? '<p>' + detail + '</p>' : ''}</div>`;
const canvas = (stage, scene = '') => `<canvas class="bird" width="320" height="190" data-bird="${stage}" data-scene="${scene}" aria-hidden="true"></canvas>`;
const bookSticker = (className) => `<img class="${className}" src="./assets/eagle-book.png" width="620" height="620" alt="">`;
const illustratedTitle = (heading, detail, scene) => `<div class="illustrated-title">${title(heading, detail)}${canvas(3, scene)}</div>`;
const meter = (count, total, label = '閱讀進度') => `<progress value="${count}" max="${total}" aria-label="${label}">${count}/${total}</progress>`;
let api, user, profile, books;
let lang = local.getItem('eagles-lang') === 'en' ? 'en' : 'zh';
let font = ['small','normal','large'].includes(local.getItem('eagles-font')) ? local.getItem('eagles-font') : 'normal';
let selectedPlan, selectedChapter, openThread, editPlan, selectedStudent;
let studentView = sessionStorage.getItem('eagles-teacher-view') === 'student';
let rosterPreview;
let recentlyFinished = false;
let nestStage = 'all';
let epoch = 0;
let authEpoch = 0;
let renderedDate;
let busy = false;
const bibleCache = new Map();
const route = () => location.hash.slice(1).split('/')[0] || 'home';
const heading = () => main.querySelector('h1') ?? main;
const planOptions = (plans, plan) => `<label class="plan-picker">讀經計劃<select id="plan-select">${[...plans].sort((a,b) => b.start-a.start).map((item) =>
  `<option value="${escape(item.id)}" ${item.id === plan?.id ? 'selected' : ''}>${escape(item.title)} · ${dateKey(item.start)}</option>`).join('')}</select></label>`;
const planLabel = (plan) => `${zhDate.format(plan.start)} — ${zhDate.format(endDate(plan))} · ${dateKey(plan.start).slice(0,4)}`;
const sortedMembers = (members) => members.sort((a,b) => names.compare(a.nickname,b.nickname) || a.id.localeCompare(b.id));
function chapterName(ref) {
  const [book, chapter] = ref.split(' ');
  return (books[book]?.[0] ?? book) + ' ' + chapter + ' 章';
}
function notify(message, error = false) {
  notice.textContent = message;
  notice.className = message ? (error ? 'alert error' : 'alert') : '';
}
function navLinks(items, current) {
  return items.map(([href,label]) => `<a href="#${href}" ${href === current ? 'aria-current="page"' : ''}><i aria-hidden="true">${glyphs[href] ?? '·'}</i>${label}</a>`).join('');
}
function shell(current) {
  const teacher = profile?.role === 'teacher';
  const adminView = teacher && !studentView;
  const canEnter = user && profile?.active;
  header.innerHTML = `<div class="masthead">
    <a class="brand" href="#${adminView ? 'admin' : 'home'}"><span class="brand-mark" aria-hidden="true">✦</span><span>Eagles <strong>Daily Word</strong><small>READ TOGETHER · GROW IN FAITH</small></span></a>
    ${canEnter ? '<nav aria-label="主選單">' + navLinks(adminView ? adminNav : navigation, current) + '</nav>' : ''}
    ${canEnter ? `<div class="identity">${teacher ? `<button class="text-button" data-action="teacher-view">${studentView ? '返回老師後台' : '切換學生版'}</button>` : ''}<span>${escape(profile.nickname)}</span><a href="#account" aria-label="我的帳戶">${escape([...profile.nickname][0])}</a></div>` : ''}
  </div>${api.demo ? `<div class="demo-bar"><div><span><strong>示範模式</strong> · 虛構隊員資料</span>
    <div class="demo-controls"><label>示範日期 <input type="date" id="demo-date" value="${dateKey(api.now())}"></label>
    <button data-action="demo-role" data-id="${teacher ? 'student' : 'teacher'}">${teacher ? '切換學生版' : '切換老師版'} ↗</button></div></div></div>` : ''}`;
}
function loginView() {
  if (api.demo) return title('Eagles Daily Word') + `<section class="panel login"><button class="button" data-action="demo-role" data-id="student">進入學生示範</button> <button class="button secondary" data-action="demo-role" data-id="teacher">進入老師示範</button></section>`;
  return `<section class="login-layout"><div class="login-art"><h1>Eagles<br>Daily Word</h1>${bookSticker('login-sticker')}</div>
  <form class="panel login stack" id="login-form"><h2>隊員登入</h2><p class="muted">使用老師登記的學校電郵。首次加入請輸入學校電郵，設定密碼後按「首次加入」。</p>
  <label>電郵<input name="email" type="email" autocomplete="username" required></label>
  <label>密碼<input name="password" type="password" autocomplete="current-password" required></label>
  ${button('登入')}<button type="submit" class="button secondary" name="register" value="yes">首次加入</button><button type="button" class="text-button" data-action="reset">忘記密碼</button></form></section>`;
}
function privacyView() {
  return title('私隱與經文來源') + `<section class="panel prose"><h2>隊內可見資料</h2>
  <p>Eagles Nest 會向已啟用的隊員顯示所有在籍學生的暱稱、已讀章數及成長階段。個人報到明細只供本人及老師查看。</p>
  <p>老師可查看個別報到日期、暱稱、帳戶狀態及待審核內容。分享和回覆會即時向已登入隊員公開，老師可刪除不合適的留言。請在分享中避免提供真名、聯絡方法或其他人的私事。需要更正暱稱或處理個人資料時，請聯絡帶隊老師。</p>
  <h2>聖經譯本</h2><p>本網站所載經文由 eBible.org 的 VPL 文本匯入，並依章節顯示。兩個所採用的數碼文本均由來源標示為公有領域。個別節號或會因譯本的底本而跳號。</p>
  <ul><li><a href="https://ebible.org/bible/details.php?id=cmn-cu89t" target="_blank" rel="noreferrer">繁體中文《新標點和合本》</a></li>
  <li><a href="https://ebible.org/details.php?id=eng-web" target="_blank" rel="noreferrer">World English Bible Classic</a>（名稱為 eBible.org 的商標）</li></ul></section>`;
}
function schedule(plan, done, now) {
  return `<div class="schedule ${plan.mode === 'daily' ? 'daily' : ''}">${plan.days.map((ref,index) => {
    const allowed = readable(plan,index,now);
    const completed = done.has(index);
    const current = allowed && dateKey(now) === dateKey(dayDate(plan,index));
    return `<button class="day ${completed ? 'done' : ''} ${current ? 'today' : ''}" data-action="chapter" data-id="${index}" ${allowed ? '' : 'disabled'} aria-label="第 ${index+1} 日，${escape(chapterName(ref))}，${completed ? '已報到' : allowed ? '已開放' : '尚未開放'}">
      <span class="day-number">${String(index+1).padStart(2,'0')}</span><span class="day-name">${plan.mode === 'daily' ? escape(chapterName(ref)) : escape(ref)}</span>
      <span class="day-state ${current && !completed ? 'gift' : ''}" aria-hidden="true">${completed ? '✓' : current ? '' : allowed ? '·' : '–'}</span></button>`;
  }).join('')}</div>`;
}
function home(plan, checks, now) {
  const done = new Set(checks.map((record) => record.index));
  const count = done.size, total = plan.days.length;
  const stage = stageIndex(count,total);
  const index = todayIndex(plan,now);
  const started = now >= plan.start;
  const finished = now >= endDate(plan) + 86400000;
  const latest = started ? `<button class="button gold" data-action="chapter" data-id="${index}">${finished ? '閱讀最後一章' : '開始閱讀'} <span aria-hidden="true">→</span></button>` : '<span class="opens">於 ' + zhDate.format(plan.start) + ' 開始</span>';
  const milestone = stage === 6 ? '展翅時刻' : '我的成長旅程';
  const [, month, day] = dateKey(dayDate(plan,index)).split('-');
  const dayLabel = finished ? '第 ' + (index+1) + ' 日 · 計劃已結束'
    : started ? (plan.mode === 'countdown' ? '倒數' : '') + '第 ' + (index+1) + ' 日' : '計劃開始日';
  return `<section class="hero"><div class="hero-content">
  <div class="hero-date"><time datetime="${dateKey(dayDate(plan,index))}">${month} · ${day}</time><span>${dayLabel}</span></div>
  <h1>${escape(plan.title)}</h1><p class="hero-subtitle">${escape(plan.subtitle)}</p>
  <div class="hero-action">${started ? '<strong>' + escape(chapterName(plan.days[index])) + '</strong>' : ''}${latest}</div>
  </div><div class="hero-art">${bookSticker('hero-sticker')}</div></section>
  <div class="dashboard"><section class="panel calendar"><div class="section-head"><div><h2>${plan.mode === 'countdown' ? '倒數日曆' : '每日讀經'}</h2></div><span class="badge">${count} / ${total} 已讀</span></div>
  ${schedule(plan,done,now)}
  <p class="calendar-note">✓ 已報到 <span>· 可補讀</span><span>– 尚未開放</span></p></section>
  <section class="panel growth ${recentlyFinished ? 'takeoff' : ''}"><div class="section-head"><div><h2>${milestone}</h2></div><span class="badge">階段 ${stage+1} / 7</span></div>
  <div class="growth-art"><picture class="growth-picture">
  <source media="(prefers-reduced-motion: reduce)" srcset="./assets/growth-${stage}.png">
  <img class="bird" src="./assets/growth-${stage}.gif" width="340" height="226" alt="">
  </picture></div>
  <div class="growth-caption"><div><strong>${stages[stage][0]}</strong><span>${stages[stage][1]}</span></div><b>${count}<small> / ${total}</small></b></div>
  ${meter(count,total)}<div class="milestones" aria-label="七個成長階段">${stages.map(([label],i) =>
    `<span class="${i === stage ? 'current' : i < stage ? 'past' : ''}" title="${label}" aria-label="${label}"><img class="bird growth-thumb" src="./assets/growth-${i}.png" width="340" height="226" alt=""></span>`).join('')}</div>
  <div class="growth-link">${link('nest','看看 Eagles Nest →','text-button')}</div></section></div>`;
}
async function reading(plan, checks, now) {
  const done = new Set(checks.map((record) => record.index));
  if (selectedChapter == null) selectedChapter = todayIndex(plan,now);
  const index = selectedChapter;
  if (!readable(plan,index,now)) return title('讀經日曆') + `<section class="panel calendar">${schedule(plan,done,now)}<p>經文於香港時間每日午夜解鎖。</p></section>`;
  const ref = plan.days[index];
  const [book, chapter] = ref.split(' ');
  const asset = lang + '/' + book;
  if (!bibleCache.has(asset)) {
    const response = await fetch('./assets/bible/' + asset + '.json');
    if (!response.ok) throw Error('載入經文失敗，請再試一次。');
    bibleCache.set(asset, await response.json());
  }
  const verses = bibleCache.get(asset)[chapter].filter(([, wording]) => wording.trim());
  const sameDay = dateKey(now) === dateKey(dayDate(plan,index));
  return `<section class="reader"><div class="reader-head">${link('home','← 返回讀經計劃','text-button')}<span>DAY ${String(index+1).padStart(2,'0')} / ${plan.days.length} · ${zhDate.format(dayDate(plan,index))}</span></div>
    <div class="panel paper">
    <div class="reader-title"><div><p class="eyebrow">${escape(plan.title)}</p><h1>${escape(chapterName(ref))}</h1></div>${canvas(3, 'peek')}</div>
    <div class="reader-tools"><div class="segments" aria-label="經文語言"><button data-action="language" data-id="zh" aria-pressed="${lang==='zh'}">繁體中文</button><button data-action="language" data-id="en" aria-pressed="${lang==='en'}">English</button></div>
    <div class="segments"><button aria-label="縮小字體" data-action="font" data-id="down">A−</button><button aria-label="放大字體" data-action="font" data-id="up">A+</button></div></div>
    <div lang="${lang === 'en' ? 'en' : 'zh-Hant'}" class="verses font-${font}">${verses.map(([number,text]) => `<p data-verse="${escape(number)}"><sup>${escape(number)}</sup> ${escape(text)}</p>`).join('')}</div>
    <p class="muted"><small>${lang === 'zh' ? '新標點和合本' : 'World English Bible Classic'} · 公有領域 · <a href="#privacy">經文來源</a></small></p>
    </div><div class="reading-actions">
      <button class="button secondary" data-action="chapter" data-id="${index-1}" ${index === 0 ? 'disabled' : ''}>← 上一章</button>
      ${profile.role === 'teacher' ? '<span class="badge">老師瀏覽模式 · 不記錄學生報到</span>' : done.has(index) ? '<span class="badge complete">✓ 已報到</span>' : `<button class="button" data-action="check" data-id="${index}">${sameDay ? '今日報到' : '完成補讀'} ✓</button>`}
      <button class="button secondary" data-action="chapter" data-id="${index+1}" ${readable(plan,index+1,now) ? '' : 'disabled'}>下一章 →</button>
    </div>${await wall(plan,index)}</section>`;
}
async function nest(plan) {
  const members = sortedMembers((await api.members(false)).filter((member) => member.role === 'student'));
  const stats = new Map((await api.progress(plan.id,members,false)).map((record) => [record.id,record.count]));
  const total = plan.days.length;
  const sharedTotal = members.reduce((sum,member) => sum + (stats.get(member.id) ?? 0),0);
  const stageOf = (member) => stageIndex(stats.get(member.id) ?? 0,total);
  const filtered = members.filter((member) => nestStage === 'all' || String(stageOf(member)) === nestStage);
  return illustratedTitle('Eagles Nest','敬拜隊的共同閱讀旅程','nest') + `<section class="panel team"><div><p class="eyebrow">隊內共享進度</p><h2>${sharedTotal} <small>章次</small></h2><p class="muted">${members.length} 位在籍隊員</p></div>${meter(sharedTotal,Math.max(1,members.length*total))}</section>
  <div class="section-head nest-head"><h2>隊員 <small>${members.length}</small></h2><label>成長階段 <select id="nest-filter"><option value="all">全部</option>${stages.map(([label],i) => `<option value="${i}" ${String(i)===nestStage ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
  <div class="nest-grid">${filtered.map((member) => {
    const count = stats.get(member.id) ?? 0;
    const stage = stageOf(member);
    return `<article class="panel nest-card">${canvas(stage)}<h3>${escape(member.nickname)}</h3>
    ${'<p>' + stages[stage][0] + ' · ' + count + ' / ' + total + '</p>'}${meter(count,total,escape(member.nickname) + '的閱讀進度')}</article>`;
  }).join('') || '<p class="muted">此階段暫未有隊員。</p>'}</div>`;
}
function writer(parent = '', plan, index) {
  return `<form id="${parent ? 'reply-form' : 'post-form'}" class="stack writer" data-parent="${escape(parent)}" data-plan="${escape(plan?.id)}" data-day="${index ?? ''}">
  <label>${parent ? '回覆' : '寫下分享'}<textarea name="body" maxlength="1800" rows="${parent ? 2 : 3}" required></textarea></label>
  <div class="form-end"><small class="muted">即時發佈給隊員 · 老師可刪除留言</small>${button(parent ? '送出回覆' : '送出分享')}</div></form>`;
}
function note(post, members, admin = false) {
  return `<div class="note-meta"><strong>${escape(members.get(post.uid) ?? '隊員')}</strong><time>${stamp(post.createdAt)}</time>${admin || post.status !== 'approved' ? statusBadge(post.status) : ''}</div><p class="post-body">${escape(post.body)}</p>`;
}
function deleteButton(post, parent = '') {
  return profile.role === 'teacher' && post.status !== 'hidden' ? '<button class="text-button" data-action="moderate" data-status="hidden" data-id="' + escape(post.id) + '" data-parent="' + escape(parent) + '">刪除留言</button>' : '';
}
async function wall(plan, index) {
  const [allPosts,membership] = await Promise.all([api.posts(false),api.members(false)]);
  const posts = allPosts.filter(post => post.status !== 'hidden' && (!plan || (post.planId === plan.id && post.dayIndex === index)));
  const members = new Map(membership.map(member => [member.id,member.nickname]));
  const expanded = posts.find(post => post.id === openThread && post.status === 'approved');
  const replies = expanded ? (await api.replies(openThread,false)).filter(reply => reply.status !== 'hidden') : [];
  const heading = plan ? '<h2>本章留言</h2><p class="muted">Day ' + (index+1) + ' · ' + escape(chapterName(plan.days[index])) + '</p>' : illustratedTitle('Eagles 分享牆','每日經文下面可發表留言，這裡集中顯示所有分享。','letter');
  return '<section class="chapter-discussion" aria-label="留言版">' + heading + '<div class="wall"><section class="panel">' + (plan ? writer('',plan,index) : link('read','前往每日經文留言')) + '</section>' +
    posts.sort((a,b) => b.createdAt-a.createdAt).map(post => '<article class="panel post">' + (!plan && post.planId ? '<p class="eyebrow">Day ' + (post.dayIndex+1) + ' · ' + escape(post.planId) + '</p>' : '') + note(post,members) + deleteButton(post) +
      (post.status === 'approved' ? '<button class="text-button" data-action="thread" data-id="' + escape(post.id) + '" aria-expanded="' + (expanded?.id === post.id) + '">' + (expanded?.id === post.id ? '收起回覆' : '查看與回覆') + ' ↗</button>' : '') +
      (expanded?.id === post.id ? '<div class="replies">' + replies.sort((a,b) => a.createdAt-b.createdAt).map(reply => '<div class="reply">' + note(reply,members) + deleteButton(reply,post.id) + '</div>').join('') + writer(post.id) + '</div>' : '') + '</article>').join('') +
    (posts.length ? '' : '<p class="muted">暫時未有分享，歡迎留下你的讀經感想。</p>') + '</div></section>';
}
function account() {
  const teacher = profile.role === 'teacher';
  return title('我的帳戶') + `<section class="panel settings stack"><h2>${escape(profile.nickname)}</h2>
  ${user.email ? '<p class="muted">' + escape(user.email) + '</p>' : ''}
  ${!teacher ? '<p class="muted">在籍學生的已讀章數及成長階段會在 Eagles Nest 顯示。</p>' : ''}
  ${!api.demo ? '<button class="button secondary" data-action="reset">寄出密碼重設電郵</button>' : ''}
  <a class="text-button" href="#privacy">私隱與經文來源 ↗</a><button class="button secondary" data-action="logout">登出</button></section>`;
}
function table(headers, rows) {
  return '<div class="table-scroll"><table><thead><tr>' + headers.map((text) => '<th scope="col">' + text + '</th>').join('') +
    '</tr></thead><tbody>' + rows.map((row) => '<tr>' + row.map((cell) => '<td>' + cell + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}
async function adminOverview(plan, now) {
  const [members,stats,posts,replies] = await Promise.all([api.members(true),api.progress(plan.id,[],true),api.posts(true),api.replyQueue()]);
  const students = sortedMembers(members.filter((member) => member.role === 'student'));
  const count = new Map(stats.map((record) => [record.id,record.count]));
  const active = students.filter((student) => student.active);
  const chapters = active.reduce((sum,student) => sum + (count.get(student.id) ?? 0),0);
  const opened = plan.days.filter((_,i) => readable(plan,i,now)).length;
  const learner = students.find((student) => student.id === selectedStudent);
  const checks = learner ? await api.checks(plan.id,learner.id) : [];
  const attendance = new Map(checks.map((record) => [record.index,record.at]));
  return title('老師管理後台',escape(plan.title) + ' · ' + planLabel(plan)) + `<div class="stats">
  ${[[active.length,'在籍隊員'],[chapters,'在籍隊員累計章次'],[opened ? Math.round(100*chapters/Math.max(1,opened*active.length))+'%' : '—','已開放章節報到率'],[posts.filter((post) => post.status === 'pending').length+replies.length,'舊版待審內容']].map(
    ([value,label]) => `<div class="panel stat"><strong>${value}</strong><span>${label}</span></div>`).join('')}</div>
  ${learner ? `<section class="panel admin-card" id="student-record"><div class="section-head"><h2>${escape(learner.nickname)} · 個人報到</h2><button class="text-button" data-action="close-record">收起</button></div>
  ${table(['日次','章節','狀態','報到時間（香港）'],plan.days.map((ref,index) => [
    dateKey(dayDate(plan,index)),escape(chapterName(ref)),attendance.has(index)
      ? (dateKey(attendance.get(index)) === dateKey(dayDate(plan,index)) ? '當日報到' : '補讀')
      : readable(plan,index,now) ? '未報到' : '尚未開放',stamp(attendance.get(index)),
  ]))}</section>` : ''}
  <section class="panel admin-card"><div class="section-head"><h2>隊員報到紀錄</h2></div>
  ${table(['暱稱','帳戶狀態','已讀章數','紀錄'],students.map((student) => [
    escape(student.nickname),student.active ? '在籍' : '已停用',(count.get(student.id) ?? 0) + ' / ' + plan.days.length,
    `<button class="text-button" data-action="record" data-id="${escape(student.id)}">查看報到 ↗</button>`,
  ]))}</section>`;
}
function parseRoster(raw) {
  const rows = [];
  const errors = [];
  const seen = new Set();
  raw.split(/\r?\n/).forEach((line,index) => {
    if (!line.trim()) return;
    const fields = line.split(line.includes('\t') ? '\t' : ',').map(x => x.trim());
    const [address,nickname] = fields;
    if (/^(電郵|學校電郵|email)$/i.test(address) && /^(暱稱|nickname)$/i.test(nickname)) return;
    const email = address.toLowerCase();
    if (fields.length !== 2 || !/^[^\s@/,]+@[^\s@/,]+\.[^\s@/,]+$/.test(email) || email.length > 254 || !nickname || Array.from(nickname).length > 32) {
      errors.push('第 ' + (index+1) + ' 行：請輸入有效電郵及 1–32 字暱稱。');
    } else if (seen.has(email)) {
      errors.push('第 ' + (index+1) + ' 行：電郵重複。');
    } else {
      seen.add(email);
      rows.push({email,nickname});
    }
  });
  if (rows.length > 100) errors.push('每次最多加入 100 位隊員。');
  return {rows,errors};
}
async function adminMembers() {
  const [allMembers,invites] = await Promise.all([api.members(true),api.invites()]);
  const members = sortedMembers(allMembers.filter(member => member.role === 'student'));
  const linked = new Map(invites.filter(item => item.uid).map(item => [item.uid,item.id]));
  const registered = new Set(invites.map(item => item.id));
  const pending = invites.filter(item => !item.uid).sort((a,b) => names.compare(a.nickname,b.nickname));
  const memberRow = member => '<form class="member-form" data-uid="' + escape(member.id) + '"><label>暱稱<input name="nickname" maxlength="32" required value="' + escape(member.nickname) + '"></label><input name="active" type="hidden" value="' + (member.active ? 'yes' : 'no') + '"><span class="muted">' + escape(linked.get(member.id) ?? '') + '</span>' +
    (member.active ? button('儲存','button secondary') : '') + '<button type="button" class="text-button" data-action="' + (member.active ? 'remove-member' : 'restore-member') + '" data-id="' + escape(member.id) + '">' + (member.active ? '移除隊員' : '重新啟用') + '</button></form>';
  const preview = rosterPreview ? '<div class="stack"><h3>匯入預覽</h3>' +
    rosterPreview.errors.map(error => '<p>' + escape(error) + '</p>').join('') +
    rosterPreview.rows.map(item => '<p>' + escape(item.nickname) + ' · ' + escape(item.email) + ' · ' + (registered.has(item.email) ? '已有名單紀錄' : '待加入') + '</p>').join('') +
    (rosterPreview.errors.length || !rosterPreview.rows.some(item => !registered.has(item.email)) ? '' : '<button class="button" data-action="apply-roster">確認批量加入</button>') + '</div>' : '';
  return title('隊員管理','用學校電郵加入隊員。學生以名單上的電郵首次加入後即可使用。') +
    '<section class="panel admin-card"><details><summary><strong>＋加入隊員</strong></summary><form id="invite-one" class="member-form"><label>學校電郵<input name="email" type="email" maxlength="254" required></label><label>暱稱<input name="nickname" maxlength="32" required></label>' + button('加入隊員') + '</form></details></section>' +
    '<section class="panel admin-card"><details ' + (rosterPreview ? 'open' : '') + '><summary><strong>批量加入</strong></summary><form id="invite-batch" class="stack"><label>從 Excel 貼上學校電郵和暱稱兩欄<textarea name="rows" rows="6" maxlength="40000" required>' + escape(rosterPreview?.raw) + '</textarea></label>' + button('預覽名單') + '</form>' + preview + '</details></section>' +
    '<section class="panel admin-card"><h2>等待學生啟用 · ' + pending.length + '</h2>' + (pending.map(item => '<div class="row"><span>' + escape(item.nickname) + ' · ' + escape(item.id) + '</span><button class="text-button" data-action="remove-invite" data-id="' + escape(item.id) + '">取消加入</button></div>').join('') || '<p class="muted">暫無紀錄。</p>') + '</section>' +
    '<section class="panel admin-card"><h2>在籍隊員</h2>' + (members.filter(item => item.active).map(memberRow).join('') || '<p class="muted">暫無在籍隊員。</p>') + '</section>' +
    '<section class="panel admin-card"><details><summary>已停用或移除的隊員</summary>' + members.filter(item => !item.active).map(memberRow).join('') + '</details></section>' +
    '<section class="panel admin-card"><details><summary>進階：連結已建立的 Firebase 帳戶</summary><form id="member-add" class="member-form"><label>Firebase UID<input name="uid" maxlength="128" required></label><label>暱稱<input name="nickname" maxlength="32" required></label>' + button('連結帳戶') + '</form></details></section>';
}
async function moderation() {
  const [posts,replies,membership] = await Promise.all([api.posts(true),api.replyQueue(),api.members(true)]);
  const members = new Map(membership.map((member) => [member.id,member.nickname]));
  const threadById = new Map(posts.map((post) => [post.id,post]));
  const pending = [...posts.filter((post) => post.status === 'pending'),...replies].sort((a,b) => a.createdAt-b.createdAt);
  const action = (post,status,label,classes = 'button secondary') => `<button class="${classes}" data-action="moderate" data-id="${escape(post.id)}" data-parent="${escape(post.parent)}" data-status="${status}">${label}</button>`;
  return title('留言管理','新留言及回覆即時發佈；可刪除或還原。' + (pending.length ? '另有 ' + pending.length + ' 則舊版待審內容。' : '')) + `<div class="wall">
  ${pending.map((post) => `<article class="panel post">${post.parent ? '<p class="quote">回覆 · ' + escape(threadById.get(post.parent)?.body?.slice(0,100) ?? '') + '</p>' : '<p class="eyebrow">分享</p>'}
  ${note(post,members,true)}<div class="row">${(!post.parent || threadById.get(post.parent)?.status === 'approved') ? action(post,'approved','批准','button') : ''}${action(post,'rejected','拒絕')}</div></article>`).join('') || '<div class="panel blank">目前沒有待審核內容。</div>'}
  <section class="panel admin-card"><h2>已處理的分享</h2>${posts.filter((post) => post.status !== 'pending').sort((a,b) => b.createdAt-a.createdAt).map((post) => `<article class="post archive-post">${note(post,members,true)}
  <div class="row">${post.status === 'approved' ? action(post,'hidden','刪除留言') : post.status === 'hidden' ? action(post,'approved','還原留言') : ''}<button class="text-button" data-action="admin-replies" data-id="${escape(post.id)}">查看回覆 ↗</button></div>
  ${openThread === post.id ? '<div id="admin-thread"></div>' : ''}</article>`).join('') || '<p class="muted">暫無紀錄。</p>'}</section></div>`;
}
async function moderationThread() {
  const region = main.querySelector('#admin-thread');
  if (!region || !openThread) return;
  const parent = openThread;
  const [replies,membership] = await Promise.all([api.replies(parent,true),api.members(true)]);
  const members = new Map(membership.map((member) => [member.id,member.nickname]));
  region.innerHTML = '<div class="replies">' + (replies.sort((a,b) => a.createdAt-b.createdAt).map((post) => `<article class="reply">${note(post,members,true)}
    ${['approved','hidden'].includes(post.status) ? `<button class="button secondary" data-action="moderate" data-status="${post.status === 'hidden' ? 'approved' : 'hidden'}" data-id="${escape(post.id)}" data-parent="${escape(parent)}">${post.status === 'hidden' ? '還原回覆' : '刪除回覆'}</button>` : ''}</article>`).join('') || '<p class="muted">暫無回覆。</p>') + '</div>';
}
function planManager(plans,now,archived) {
  const plan = plans.find((item) => item.id === editPlan);
  const locked = plan && plan.start <= now;
  return title('讀經計劃','建立及排程每日讀經與倒數計劃。') + `<div class="admin-plan-layout">
  <section class="panel admin-card"><div class="section-head"><h2>計劃紀錄</h2><button class="text-button" data-action="new-plan">＋ 新計劃</button></div>
  ${[...plans].sort((a,b) => b.start-a.start).map((item) => `<div class="plan-item"><div><strong>${escape(item.title)}</strong><small>${planLabel(item)} · ${item.days.length} 日</small></div><button class="text-button" data-action="edit-plan" data-id="${escape(item.id)}">編輯 ↗</button><button class="text-button" data-action="delete-plan" data-id="${escape(item.id)}">刪除計劃</button></div>`).join('') || '<p class="muted">暫無已排程計劃。</p>'}
  ${archived.length ? `<details><summary>已刪除的計劃</summary>${archived.map(item => `<div class="plan-item"><strong>${escape(item.title)}</strong><button class="text-button" data-action="restore-plan" data-id="${escape(item.id)}">還原計劃</button></div>`).join('')}</details>` : ''}</section>
  <section class="panel admin-card"><form id="plan-form" class="stack" data-id="${escape(plan?.id)}"><h2>${plan ? '編輯計劃' : '建立計劃'}</h2>
  <label>計劃名稱<input name="title" maxlength="90" required value="${escape(plan?.title)}"></label><label>副標題<input name="subtitle" maxlength="120" value="${escape(plan?.subtitle)}"></label>
  <label>展示方式<select name="mode"><option value="daily">一般每日讀經</option><option value="countdown" ${plan?.mode === 'countdown' ? 'selected' : ''}>倒數日曆</option></select></label>
  <label>開始日期（香港時間）<input type="date" name="start" value="${plan ? dateKey(plan.start) : ''}" ${locked ? 'disabled' : 'required min="' + dateKey(now+86400000) + '"'}></label>
  <fieldset class="stack" ${locked ? 'disabled' : ''}><legend>每日章節</legend>
  <div class="sequence-fields"><label>書卷<select name="book">${Object.entries(books).map(([code,[name]]) => `<option value="${code}" ${code==='LUK' ? 'selected' : ''}>${name} · ${code}</option>`).join('')}</select></label>
  <label>由<input name="first" type="number" min="1" value="1"></label><label>至<input name="last" type="number" min="1" value="24"></label></div>
  <button type="button" class="button secondary" data-action="sequence">產生逐章清單</button>
  <label>自訂或調整章節（每行一章）<textarea name="chapters" rows="6" placeholder="LUK 1&#10;LUK 2" required>${escape(plan?.days.join('\n'))}</textarea></label></fieldset>
  <p class="muted"><small>${locked ? '已開始的計劃保留日期與章節，以對應既有報到。' : '每天安排一章，最後一日之後仍可補讀。'}</small></p>
  ${button(plan ? '儲存變更' : '排程計劃')}</form></section></div>`;
}
let latestPlans = [];
async function render({focus=false} = {}) {
  const version = ++epoch;
  const actual = route();
  const teacher = profile?.role === 'teacher';
  if (teacher && actual.startsWith('admin')) studentView = false;
  const current = actual === 'home' && teacher && !studentView ? 'admin' : actual;
  main.setAttribute('aria-busy','true');
  shell(current);
  try {
    let html, picker = '';
    if (current === 'privacy') html = privacyView();
    else if (!user) html = loginView();
    else if (!profile?.active) html = title('帳戶尚未開通','請聯絡帶隊老師開通或恢復帳戶。') +
      '<button class="button" data-action="logout">登出</button>';
    else if (current === 'account') html = account();
    else if (!teacher && current.startsWith('admin')) {
      html = title('此頁需要相應的帳戶權限') + link(teacher ? 'admin' : 'home','返回首頁');
    } else if (current === 'wall') html = await wall();
    else if (current === 'admin-members') html = await adminMembers();
    else if (current === 'admin-moderation') html = await moderation();
    else {
      const allPlans = await api.plans();
      const plans = allPlans.filter(plan => !plan.archived);
      if (version !== epoch) return;
      latestPlans = plans;
      const now = api.now();
      renderedDate = dateKey(now);
      const plan = plans.find((item) => item.id === selectedPlan) ?? currentPlan(plans,now);
      if (current === 'admin-plans') html = planManager(plans,now,allPlans.filter(plan => plan.archived));
      else if (!plan) html = title('暫無讀經計劃') + (teacher ? link('admin-plans','建立計劃') : '');
      else if (current === 'admin') html = await adminOverview(plan,now);
      else if (current === 'nest') html = await nest(plan);
      else if (current === 'home' || current === 'read') {
        const checks = teacher ? [] : await api.checks(plan.id,user.uid);
        if (version !== epoch) return;
        html = current === 'read' ? await reading(plan,checks,now) : home(plan,checks,now);
      } else html = title('找不到頁面') + link(teacher ? 'admin' : 'home','返回首頁');
      if (plan && ['home','read','nest','admin'].includes(current)) {
        picker = `<div class="subhead"><div class="breadcrumb"><span>EAGLES DAILY WORD</span><b>／</b>${teacher && !studentView ? '老師後台' : teacher ? '學生版面 · 老師瀏覽' : '我的讀經手帳'}</div>
        <div class="plan-controls">${selectedPlan ? '<button class="text-button" data-action="current-plan">返回目前計劃</button>' : ''}${planOptions(plans,plan)}</div></div>`;
      }
    }
    if (version !== epoch) return;
    main.innerHTML = picker + html;
    drawBirds(main);
    if (focus) {
      heading().setAttribute('tabindex','-1');
      heading().focus({preventScroll:true});
    }
    if (current === 'admin-moderation') await moderationThread();
    if (current === 'home' && recentlyFinished) recentlyFinished = false;
  } catch (error) {
    if (version !== epoch) return;
    console.error(error);
    main.innerHTML = title('暫時無法載入',escape(errorMessage(error))) + '<button class="button" data-action="refresh">重新載入</button>';
  } finally {
    if (version === epoch) main.setAttribute('aria-busy','false');
  }
}
function errorMessage(error) {
  if (error.code === 'permission-denied') return '目前帳戶沒有執行此操作的權限，或章節尚未開放。';
  if (error.code === 'failed-precondition') return '服務設定尚未完成，請聯絡帶隊老師。';
  if (error.code?.startsWith('auth/')) return '無法完成帳戶操作，請檢查電郵、密碼及帳戶狀態。';
  if (error.code || error instanceof TypeError) return '連線未能完成，請稍後再試。';
  return error.message;
}
const activePlan = () => latestPlans.find((item) => item.id === selectedPlan) ?? currentPlan(latestPlans,api.now());
function goto(href) {
  if (location.hash === '#' + href) {
    window.scrollTo(0,0);
    return render({focus:true});
  }
  location.hash = href;
}
async function mutate(control, action) {
  if (busy) return;
  busy = true;
  if (control) control.disabled = true;
  notify('');
  try { await action(); }
  catch (error) { console.error(error); notify(errorMessage(error),true); }
  finally { busy = false; if (control) control.disabled = false; }
}
async function clickAction(control) {
  const {action,id,parent,status} = control.dataset;
  switch (action) {
    case 'teacher-view':
      if (profile?.role !== 'teacher') return;
      studentView = !studentView;
      sessionStorage.setItem('eagles-teacher-view',studentView ? 'student' : 'teacher');
      openThread = undefined;
      await goto(studentView ? 'home' : 'admin');
      break;
    case 'demo-role':
      api.login(id);
      break;
    case 'chapter':
      selectedChapter = Number(id);
      await goto('read');
      break;
    case 'current-plan':
      selectedPlan = selectedChapter = selectedStudent = undefined;
      await render();
      break;
    case 'language': {
      const verse = [...main.querySelectorAll('[data-verse]')].find((node) => node.getBoundingClientRect().bottom > 165)?.dataset.verse;
      lang = id;
      local.setItem('eagles-lang',id);
      await render();
      if (verse && window.scrollY > 250) main.querySelector(`[data-verse="${CSS.escape(verse)}"]`)?.scrollIntoView({block:'center'});
      else main.querySelector('[data-action="language"][aria-pressed="true"]')?.focus({preventScroll:true});
      break;
    }
    case 'font': {
      const sizes = ['small','normal','large'];
      font = sizes[Math.min(2,Math.max(0,sizes.indexOf(font)+(id==='up' ? 1 : -1)))];
      local.setItem('eagles-font',font);
      main.querySelector('.verses').className = 'verses font-' + font;
      break;
    }
    case 'check': {
      if (profile.role === 'teacher') throw Error('老師瀏覽模式不記錄學生報到。');
      const plan = activePlan();
      if (!readable(plan,+id,api.now())) throw Error('此章尚未開放。');
      await api.check(plan,+id);
      const checks = await api.checks(plan.id,user.uid);
      if (checks.length === plan.days.length) {
        recentlyFinished = true;
        await goto('home');
        notify('你已完成整個讀經計劃。展翅時刻到了！');
      } else {
        await render();
        notify('報到已儲存。');
      }
      break;
    }
    case 'thread':
    case 'admin-replies':
      openThread = openThread === id ? undefined : id;
      await render();
      break;
    case 'moderate':
      await api.moderate(id,status,parent || undefined);
      await render();
      notify(status === 'hidden' ? '留言已刪除，可在留言管理還原。' : '留言狀態已更新。');
      break;
    case 'record':
      selectedStudent = id;
      await render();
      main.querySelector('#student-record')?.scrollIntoView({block:'start'});
      break;
    case 'close-record':
      selectedStudent = undefined;
      await render();
      break;
    case 'delete-plan':
    case 'restore-plan': {
      if (profile?.role !== 'teacher') return;
      const removing = action === 'delete-plan';
      if (removing) {
        const plan = latestPlans.find(item => item.id === id);
        if (!plan || !window.confirm('刪除「' + plan.title + '」？計劃會從清單移除，之後可還原。')) return;
      }
      await api.archivePlan(id,removing);
      if (editPlan === id) editPlan = undefined;
      if (selectedPlan === id) selectedPlan = selectedChapter = undefined;
      await render();
      notify(removing ? '計劃已刪除。' : '計劃已還原。');
      break;
    }
    case 'edit-plan':
    case 'new-plan':
      editPlan = id;
      await render();
      document.querySelector('#plan-form input')?.focus();
      break;
    case 'sequence': {
      const form = control.form;
      form.elements.chapters.value = sequence(form.elements.book.value,Number(form.elements.first.value),Number(form.elements.last.value),books).join('\n');
      break;
    }
    case 'apply-roster': {
      if (profile?.role !== 'teacher' || !rosterPreview || rosterPreview.errors.length) return;
      const added = await api.addInvites(rosterPreview.rows);
      rosterPreview = undefined;
      await render();
      notify('已加入 ' + added + ' 位隊員。');
      break;
    }
    case 'remove-member':
    case 'restore-member':
    case 'remove-invite': {
      if (profile?.role !== 'teacher') return;
      if (action === 'remove-invite') {
        if (!window.confirm('取消這位學生的加入資格？')) return;
        await api.removeInvite(id);
      } else if (action === 'remove-member') {
        if (!window.confirm('移除這位隊員？隊員將無法進入隊內頁面。')) return;
        await api.removeMember(id);
      } else {
        await api.saveMember(id,{active:true},false);
      }
      await render();
      notify(action === 'restore-member' ? '隊員已重新啟用。' : '已更新隊員名單。');
      break;
    }
    case 'reset': {
      const input = document.querySelector('#login-form input[name="email"]');
      if (input && (!input.value || !input.reportValidity())) {input.focus(); throw Error('請先輸入帳戶電郵。');}
      await api.reset(user?.email ?? input?.value.trim());
      notify('如電郵已登記，你會收到密碼重設電郵。');
      break;
    }
    case 'logout':
      history.replaceState(null,'','#home');
      await api.logout();
      break;
    case 'refresh':
      if (user) profile = await (api.claimMember ?? api.member)(user.uid);
      await render();
  }
}
document.addEventListener('click',(event) => {
  const control = event.target.closest('button[data-action]');
  if (control) void mutate(control,() => clickAction(control));
  const skip = event.target.closest('.skip');
  if (skip) {event.preventDefault(); main.focus();}
  const readLink = event.target.closest('nav a[href="#read"]');
  if (readLink) selectedChapter = undefined;
});
document.addEventListener('change',(event) => {
  const {id,value} = event.target;
  if (id === 'demo-date' && value && Number.isFinite(midnight(value))) {
    api.setDate(value);
    selectedChapter = undefined;
    void render();
  }
  if (id === 'plan-select') {
    selectedPlan = value;
    selectedChapter = selectedStudent = undefined;
    void render();
  }
  if (id === 'nest-filter') {nestStage = value; void render();}
});
document.addEventListener('submit',(event) => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const get = (name) => String(data.get(name) ?? '').trim();
  void mutate(event.submitter,async () => {
    if (form.id === 'login-form') {
      if (event.submitter?.name === 'register') await api.register(get('email'),data.get('password'));
      else await api.login(get('email'),data.get('password'));
      return;
    }
    let confirmation = '已儲存。';
    if (form.id === 'invite-one' || form.id === 'invite-batch') {
      if (profile?.role !== 'teacher') return;
      if (form.id === 'invite-batch') {
        const raw = get('rows');
        rosterPreview = {...parseRoster(raw),raw};
        await render();
        return;
      }
      const entry = parseRoster(get('email') + '\t' + get('nickname'));
      if (entry.errors.length || entry.rows.length !== 1) throw Error(entry.errors[0] ?? '請輸入電郵及暱稱。');
      const added = await api.addInvites(entry.rows);
      confirmation = added ? '已加入名單，等候學生首次登入。' : '此電郵已在名單。';
    } else if (form.id === 'post-form' || form.id === 'reply-form') {
      if (!get('body')) throw Error('請輸入分享內容。');
      const context = form.dataset.plan ? {planId:form.dataset.plan,dayIndex:Number(form.dataset.day)} : undefined;
      await api.post(get('body'),form.dataset.parent || undefined,context);
      confirmation = '已發佈。';
    } else if (form.id === 'member-add' || form.dataset.uid) {
      const uid = form.dataset.uid ?? get('uid');
      const nickname = get('nickname');
      if (!uid || uid.includes('/') || ['.','..','__proto__','constructor','prototype'].includes(uid) || !nickname) throw Error('請輸入有效的 UID 與暱稱。');
      const isNew = form.id === 'member-add';
      await api.saveMember(uid,{nickname,active:isNew || get('active') === 'yes'},isNew);
    } else if (form.id === 'plan-form') {
      const old = latestPlans.find((plan) => plan.id === form.dataset.id);
      const now = api.now();
      const locked = old && old.start <= now;
      const start = locked ? old.start : midnight(get('start'));
      if (!Number.isFinite(start) || (!locked && start <= now) || !get('title')) throw Error('請填寫計劃名稱及未來的開始日期。');
      const plan = {id:old?.id ?? crypto.randomUUID(),title:get('title'),subtitle:get('subtitle'),mode:get('mode'),start,
        days:locked ? old.days : parseDays(get('chapters'),books)};
      await api.savePlan(plan);
      editPlan = plan.id;
      confirmation = old ? '計劃已更新。' : '讀經計劃已排程。';
    }
    await render();
    notify(confirmation);
  });
});
window.addEventListener('hashchange',() => {
  window.scrollTo(0,0);
  void render({focus:true});
});
function refreshDay() {
  if (!api || api.demo || !profile?.active || busy || document.hidden) return;
  if (['home','read','nest','admin'].includes(route()) && renderedDate !== dateKey(api.now())) void render();
}
document.addEventListener('visibilitychange',refreshDay);
window.setInterval(refreshDay,30_000);
async function boot() {
  const response = await fetch('./assets/bible/books.json');
  if (!response.ok) throw Error('無法載入書卷資料。');
  books = await response.json();
  api = firebaseConfig ? await (await import('./firebase.js?v=20261116-growth')).makeFirebase() : makeDemo();
  api.observe(async (identity) => {
    const version = ++authEpoch;
    ++epoch;
    user = identity;
    profile = undefined;
    selectedPlan = selectedChapter = openThread = editPlan = selectedStudent = undefined;
    latestPlans = [];
    rosterPreview = undefined;
    nestStage = 'all';
    main.innerHTML = '<p class="loading">載入 Eagles Daily Word…</p>';
    header.innerHTML = '';
    try {
      const member = identity ? await (api.claimMember ?? api.member)(identity.uid) : null;
      if (version !== authEpoch) return;
      profile = member;
      if (api.demo && route() !== 'privacy') {
        history.replaceState(null,'',profile?.role === 'teacher' ? '#admin' : '#home');
      } else if (profile?.role === 'teacher' && !studentView && !['account','privacy'].includes(route())) {
        history.replaceState(null,'','#admin');
      }
      await render();
    } catch (error) {
      if (version === authEpoch) {
        shell(route());
        main.innerHTML = title('帳戶資料未能讀取',escape(errorMessage(error))) + '<button class="button" data-action="refresh">重新載入</button> <button class="button secondary" data-action="logout">登出</button>';
        main.setAttribute('aria-busy','false');
      }
    }
  });
}
boot().catch((error) => {
  console.error(error);
  main.innerHTML = title('初始化失敗','請確認網絡及網站設定後重新載入。');
  main.setAttribute('aria-busy','false');
});
