import {defaultPlan, DAY, midnight, readable} from './model.js';
const key = 'eagles-demo-v1';
const uidKey = 'eagles-demo-user';
const reads = [8, 11, 0, 5, 3, 7, 11, 9, 2, 0, 10, 4];
const names = ['晨星', 'Mika', '小羽', 'Kite', '竹風', 'Jade', 'Mocha', '阿晴', 'Pine', 'Clara', '杏仁', 'Violet'];
function initial() {
  const members = Object.fromEntries(Array.from({length:60}, (_, i) => [
    'eagle-' + (i + 1), {nickname: names[i] ?? 'Eagle ' + (i + 1), role:'student', active:true, shareProgress:true},
  ]));
  members.teacher = {nickname:'示範老師', role:'teacher', active:true, shareProgress:false};
  const posts = {
    first: {uid:'eagle-4', body:'這星期讀到耶穌平靜風浪。謝謝大家陪我一起讀，也想為正在準備考試的隊友禱告。', status:'approved', createdAt:midnight('2026-12-10')},
    second: {uid:'eagle-2', body:'今天放學後在車上讀經。留一點安靜的時間，感覺很好。', status:'pending', createdAt:midnight('2026-12-11')},
  };
  const checks = Object.fromEntries(Object.keys(members).map((uid, i) => [
    uid, Object.fromEntries(Array.from({length: reads[i % reads.length]}, (_, day) => [
      day, {index:day, at:defaultPlan.start + day * DAY + 36_000_000},
    ])),
  ]));
  return {members, plans:{[defaultPlan.id]:defaultPlan}, checks:{[defaultPlan.id]:checks}, posts, replies:{}, date:'2026-12-12'};
}
function read() {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : initial();
}
function change(fn) {
  const state = read();
  fn(state);
  localStorage.setItem(key, JSON.stringify(state));
}
const list = (map = {}) => Object.entries(map).map(([id, record]) => ({...record, id}));
export function makeDemo() {
  let callback;
  const actor = () => sessionStorage.getItem(uidKey);
  const publish = () => callback(actor() ? {uid:actor()} : null);
  const threads = (parent, admin) => {
    const state = read();
    return list(parent ? state.replies[parent] : state.posts).filter(
      (post) => admin || post.status === 'approved' || post.uid === actor(),
    );
  };
  return {
    demo:true,
    now:() => midnight(read().date) + 43_200_000,
    setDate:(date) => change((state) => {state.date = date;}),
    observe(fn) {
      callback = fn;
      if (!actor()) sessionStorage.setItem(uidKey, 'eagle-1');
      publish();
    },
    login(role) {
      sessionStorage.setItem(uidKey, role === 'teacher' ? 'teacher' : 'eagle-1');
      publish();
    },
    logout() {sessionStorage.removeItem(uidKey); publish();},
    member:async (uid) => read().members[uid],
    members:async (all) => list(read().members).filter((member) => all || member.active),
    plans:async () => list(read().plans),
    checks:async (plan, uid) => list(read().checks[plan]?.[uid]),
    progress:async (plan) => {
      const state = read();
      return Object.keys(state.members).filter((uid) => state.members[uid].shareProgress)
        .map((uid) => ({id:uid, count:Object.keys(state.checks[plan]?.[uid] ?? {}).length}));
    },
    check(plan, index) {
      if (!readable(plan, index, this.now())) throw Error('此章尚未開放。');
      change((state) => {
        const records = ((state.checks[plan.id] ??= {})[actor()] ??= {});
        records[index] ??= {index, at:this.now()};
      });
    },
    profile(uid, fields) {change((state) => Object.assign(state.members[uid], fields));},
    saveMember(uid, fields, isNew) {
      change((state) => {
        if (isNew && state.members[uid]) throw Error('此 UID 已開通，請修改原有隊員。');
        state.members[uid] = {shareProgress:false, ...state.members[uid], ...fields, role:'student'};
      });
    },
    savePlan(plan) {change((state) => {state.plans[plan.id] = plan;});},
    posts:async (admin) => threads(null, admin),
    replies:async (parent, admin) => threads(parent, admin),
    replyQueue:async () => Object.keys(read().replies).flatMap((parent) =>
      threads(parent, true).filter((post) => post.status === 'pending').map((post) => ({...post, parent}))),
    post(body, parent) {
      change((state) => {
        const collection = parent ? (state.replies[parent] ??= {}) : state.posts;
        collection[crypto.randomUUID()] = {body, uid:actor(), status:'pending', createdAt:this.now()};
      });
    },
    moderate(id, status, parent) {
      change((state) => { (parent ? state.replies[parent] : state.posts)[id].status = status; });
    },
  };
}
