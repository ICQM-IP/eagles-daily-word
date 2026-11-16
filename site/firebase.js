import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import {getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence,
  browserSessionPersistence, sendPasswordResetEmail, connectAuthEmulator, createUserWithEmailAndPassword, sendEmailVerification, reload, getIdToken} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import {getFirestore, doc, collection, collectionGroup, query, where, getDoc, getDocs, setDoc,
  addDoc, updateDoc, runTransaction, serverTimestamp, connectFirestoreEmulator} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';
import {firebaseConfig, emulators} from './config.js';

export async function makeFirebase() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (emulators && location.hostname === '127.0.0.1') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings:true});
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  await setPersistence(auth, browserSessionPersistence);
  const ref = (...parts) => doc(db, ...parts);
  const group = (...parts) => collection(db, ...parts);
  const account = () => auth.currentUser.uid;
  const record = (snapshot) => {
    const data = snapshot.data();
    for (const field of ['at', 'createdAt']) if (data[field]?.toMillis) data[field] = data[field].toMillis();
    return {...data, id:snapshot.id};
  };
  const all = async (target) => (await getDocs(target)).docs.map(record);
  const comments = (parent) => parent ? group('posts', parent, 'replies') : group('posts');
  const commentRef = (id, parent) => parent ? ref('posts', parent, 'replies', id) : ref('posts', id);
  async function visible(parent, admin) {
    const target = comments(parent);
    if (admin) return all(target);
    const [approved, own] = await Promise.all([
      all(query(target, where('status', '==', 'approved'))),
      all(query(target, where('uid', '==', account()))),
    ]);
    return [...new Map([...approved, ...own].map((post) => [post.id, post])).values()];
  }
  async function claimMember(uid) {
    const target = ref('members',uid);
    const existing = (await getDoc(target)).data();
    if (existing || !auth.currentUser?.emailVerified) return existing;
    const email = auth.currentUser.email.toLowerCase();
    const ticket = ref('invites',email);
    return runTransaction(db,async (tx) => {
      const member = (await tx.get(target)).data();
      if (member) return member;
      const item = (await tx.get(ticket)).data();
      if (!item || item.uid) return undefined;
      const profile = {nickname:item.nickname,role:'student',active:true,shareProgress:false};
      tx.set(target,profile);
      tx.update(ticket,{uid});
      return profile;
    });
  }
  return {
    now:Date.now,
    observe:(callback) => onAuthStateChanged(auth, callback),
    login:(email, password) => signInWithEmailAndPassword(auth, email, password),
    logout:() => signOut(auth),
    async register(email,password) {
      const {user} = await createUserWithEmailAndPassword(auth,email,password);
      await sendEmailVerification(user);
    },
    verify:() => sendEmailVerification(auth.currentUser),
    async refreshMember(uid) {
      await reload(auth.currentUser);
      await getIdToken(auth.currentUser,true);
      return claimMember(uid);
    },
    currentUser:() => auth.currentUser,
    claimMember,
    invites:() => all(group('invites')),
    async addInvites(rows) {
      return runTransaction(db,async (tx) => {
        const targets = rows.map(({email}) => ref('invites',email));
        const existing = await Promise.all(targets.map(target => tx.get(target)));
        let added = 0;
        rows.forEach(({nickname},index) => {
          if (existing[index].exists()) return;
          tx.set(targets[index],{nickname,uid:''});
          added++;
        });
        return added;
      });
    },
    async removeInvite(email) {
      const target = ref('invites',email);
      return runTransaction(db,async (tx) => {
        const current = (await tx.get(target)).data();
        if (!current) return;
        if (current.uid) throw Error('隊員已開通，請在在籍名單移除。');
        tx.delete(target);
      });
    },
    removeMember:(uid) => updateDoc(ref('members',uid),{active:false}),
    reset:(email) => sendPasswordResetEmail(auth, email),
    member:async (uid) => (await getDoc(ref('members', uid))).data(),
    members:(admin) => all(admin ? group('members') : query(group('members'), where('active', '==', true))),
    plans:() => all(group('plans')),
    checks:(plan, uid) => all(group('plans', plan, 'checks', uid, 'days')),
    progress:async (plan, members, admin) => {
      if (admin) return all(group('plans', plan, 'progress'));
      const results = [];
      for (let i = 0; i < members.length; i += 12) {
        const slice = await Promise.all(members.slice(i, i + 12).map(async ({id}) => {
          try {
            const snapshot = await getDoc(ref('plans', plan, 'nest', id));
            return snapshot.exists() ? record(snapshot) : null;
          } catch (error) {
            if (error.code === 'permission-denied') return null;
            throw error;
          }
        }));
        results.push(...slice.filter(Boolean));
      }
      return results;
    },
    check(plan, index) {
      const uid = account();
      const key = String(index);
      const summary = ref('plans', plan.id, 'progress', uid);
      const day = ref('plans', plan.id, 'checks', uid, 'days', key);
      return runTransaction(db, async (transaction) => {
        if ((await transaction.get(day)).exists()) return;
        const current = await transaction.get(summary);
        transaction.set(day, {index, at:serverTimestamp()});
        const count = (current.data()?.count ?? 0) + 1;
        transaction.set(summary, {count, at:serverTimestamp(), last:key});
        transaction.set(ref('plans', plan.id, 'nest', uid), {count});
      });
    },
    profile:(uid, fields) => updateDoc(ref('members', uid), fields),
    saveMember(uid, fields, isNew) {
      const target = ref('members', uid);
      if (!isNew) return updateDoc(target, fields);
      return runTransaction(db, async (transaction) => {
        if ((await transaction.get(target)).exists()) throw Error('此 UID 已開通，請修改原有隊員。');
        transaction.set(target, {...fields, shareProgress:false, role:'student'});
      });
    },
    savePlan(plan) {
      const {id, ...fields} = plan;
      return setDoc(ref('plans', id), fields);
    },
    posts:(admin) => visible(null, admin),
    replies:(parent, admin) => visible(parent, admin),
    replyQueue:async () => {
      const snapshot = await getDocs(query(collectionGroup(db, 'replies'), where('status', '==', 'pending')));
      return snapshot.docs.map((item) => ({...record(item), parent:item.ref.parent.parent.id}));
    },
    post:(body, parent, context) => addDoc(comments(parent), {uid:account(), body, status:'approved', createdAt:serverTimestamp(), ...(!parent && context ? context : {})}),
    moderate:(id, status, parent) => updateDoc(commentRef(id, parent), {status}),
  };
}
