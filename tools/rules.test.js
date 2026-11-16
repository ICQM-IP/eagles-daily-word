import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {collection, collectionGroup, doc, getDoc, getDocs, query, serverTimestamp,
  setDoc, updateDoc, where, writeBatch} from 'firebase/firestore';
import {DAY, dateKey, midnight} from '../site/model.js';

const projectId = 'demo-eagles';
const member = (nickname, role = 'student', active = true, shareProgress = false) => ({nickname,role,active,shareProgress});
const schedule = {title:'Rule test',subtitle:'',mode:'countdown',start:midnight(dateKey(Date.now()))-DAY,days:['LUK 1','LUK 2','LUK 3']};
const account = (db, uid) => doc(db,'members',uid);
const plan = (db,id = 'luke') => doc(db,'plans',id);
const check = (db,uid,key) => doc(db,'plans','luke','checks',uid,'days',String(key));
const summary = (db,uid) => doc(db,'plans','luke','progress',uid);
const nest = (db,uid) => doc(db,'plans','luke','nest',uid);
const post = (db,id) => doc(db,'posts',id);
const reply = (db,parent,id) => doc(db,'posts',parent,'replies',id);
const pending = (uid,body = '測試') => ({uid,body,status:'pending',createdAt:serverTimestamp()});
let env, student, peer, teacher, outside, inactive, visitor;
before(async () => {
  env = await initializeTestEnvironment({projectId,firestore:{rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}});
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(account(db,'student'),member('晨星','student',true,true)),
      setDoc(account(db,'peer'),member('小羽')),
      setDoc(account(db,'teacher'),member('老師','teacher')),
      setDoc(account(db,'inactive'),member('已停用','student',false,true)),
      setDoc(plan(db),schedule),
    ]);
  });
  [student,peer,teacher,outside,inactive] = ['student','peer','teacher','outside','inactive']
    .map((uid) => env.authenticatedContext(uid).firestore());
  visitor = env.unauthenticatedContext().firestore();
});
after(async () => env?.cleanup());

test('membership gates team data and guards role, consent and activation', async () => {
  for (const db of [visitor,outside,inactive]) {
    await assertFails(getDoc(plan(db)));
    await assertFails(getDocs(collection(db,'posts')));
  }
  await assertSucceeds(getDoc(account(inactive,'inactive')));
  await assertSucceeds(getDoc(plan(student)));
  await assertSucceeds(getDocs(query(collection(student,'members'),where('active','==',true))));
  await assertFails(getDocs(collection(student,'members')));
  await assertFails(getDoc(account(student,'inactive')));
  await assertFails(updateDoc(account(student,'student'),{role:'teacher'}));
  await assertFails(setDoc(account(outside,'outside'),member('外人','student')));
  await assertFails(setDoc(account(teacher,'extra-teacher'),member('其他','teacher')));
  await assertFails(setDoc(account(teacher,'consent'),member('同意','student',true,true)));
  await assertSucceeds(setDoc(account(teacher,'new'),member('新隊員')));
  await assertFails(updateDoc(account(teacher,'new'),{shareProgress:true}));
  await assertSucceeds(updateDoc(account(teacher,'new'),{active:false,nickname:'改名'}));
});

function batchCheck(db,uid,index,count,key=String(index),nestCount=count) {
  const batch = writeBatch(db);
  batch.set(check(db,uid,key),{index,at:serverTimestamp()});
  batch.set(summary(db,uid),{count,last:key,at:serverTimestamp()});
  batch.set(nest(db,uid),{count:nestCount});
  return batch.commit();
}
test('atomic check-in validates dates, identity, key, increment and count-only privacy', async () => {
  await assertFails(setDoc(check(student,'student',0),{index:0,at:serverTimestamp()}));
  await assertFails(setDoc(nest(student,'student'),{count:2}));
  await assertFails(batchCheck(student,'peer',0,1));
  await assertFails(batchCheck(student,'student',2,1));
  await assertFails(batchCheck(student,'student',0,1,'00'));
  await assertFails(batchCheck(student,'student',0,1,'0',999));
  await assertSucceeds(batchCheck(student,'student',1,1));
  await assertFails(batchCheck(student,'student',1,2));
  await assertFails(batchCheck(student,'student',0,3));
  await assertSucceeds(batchCheck(student,'student',0,2));
  assert.deepEqual((await assertSucceeds(getDoc(nest(peer,'student')))).data(),{count:2});
  await assertFails(getDoc(check(peer,'student',0)));
  await assertFails(getDoc(summary(peer,'student')));
  await assertFails(getDocs(collection(peer,'plans','luke','nest')));
  await assertFails(getDoc(nest(visitor,'student')));
  await assertSucceeds(getDoc(check(teacher,'student',0)));
  await assertSucceeds(updateDoc(account(student,'student'),{shareProgress:false}));
  await assertFails(getDoc(nest(peer,'student')));
  await assertSucceeds(getDoc(nest(student,'student')));
  await assertSucceeds(getDoc(nest(teacher,'student')));
});
test('chapter comments publish immediately; only teachers remove and restore', async () => {
  const published = (uid) => ({uid,body:'Sharing',status:'approved',createdAt:serverTimestamp()});
  const chapter = (uid,index=0) => ({...published(uid),planId:'luke',dayIndex:index});
  for (const [db,uid] of [[visitor,'visitor'],[outside,'outside'],[inactive,'inactive']]) {
    await assertFails(setDoc(post(db,'blocked-'+uid),chapter(uid)));
  }
  await assertFails(setDoc(post(student,'impersonation'),chapter('peer')));
  await assertFails(setDoc(post(student,'future'),chapter('student',2)));
  await assertFails(setDoc(post(student,'negative'),chapter('student',-1)));
  await assertFails(setDoc(post(student,'fraction'),chapter('student',0.5)));
  await assertFails(setDoc(post(student,'missing-plan'),{...chapter('student'),planId:'missing'}));
  await assertFails(setDoc(post(student,'no-context'),published('student')));
  await assertFails(setDoc(post(student,'empty'),{...chapter('student'),body:''}));
  await assertFails(setDoc(post(student,'long'),{...chapter('student'),body:'x'.repeat(1801)}));
  await assertFails(setDoc(post(student,'extra'),{...chapter('student'),extra:true}));
  await assertFails(setDoc(post(student,'pending'),{...chapter('student'),status:'pending'}));
  await assertSucceeds(setDoc(post(student,'open'),chapter('student')));
  await assertSucceeds(getDoc(post(peer,'open')));
  await assertSucceeds(getDocs(query(collection(peer,'posts'),where('status','==','approved'))));
  await assertFails(updateDoc(post(student,'open'),{status:'hidden'}));
  await assertFails(updateDoc(post(peer,'open'),{body:'changed'}));
  await assertFails(updateDoc(post(teacher,'open'),{status:'hidden',body:'changed'}));
  await assertSucceeds(setDoc(reply(peer,'open','r1'),published('peer')));
  await assertSucceeds(getDoc(reply(student,'open','r1')));
  await assertFails(updateDoc(reply(peer,'open','r1'),{status:'hidden'}));
  await assertSucceeds(updateDoc(reply(teacher,'open','r1'),{status:'hidden'}));
  await assertFails(getDoc(reply(student,'open','r1')));
  await assertSucceeds(updateDoc(reply(teacher,'open','r1'),{status:'approved'}));
  await assertSucceeds(updateDoc(post(teacher,'open'),{status:'hidden'}));
  await assertFails(getDoc(post(peer,'open')));
  await assertFails(getDoc(reply(peer,'open','r1')));
  await assertFails(setDoc(reply(peer,'open','r2'),published('peer')));
  await assertSucceeds(getDoc(reply(teacher,'open','r1')));
  await assertSucceeds(updateDoc(post(teacher,'open'),{status:'approved'}));
  await assertSucceeds(getDoc(reply(student,'open','r1')));
  await assertSucceeds(setDoc(post(teacher,'teacher-post'),chapter('teacher')));
});

test('teachers can schedule plans but cannot rewrite historical dates or chapters', async () => {
  const future = {...schedule,start:schedule.start+5*DAY};
  await assertFails(setDoc(plan(teacher,'backdated'),schedule));
  await assertFails(setDoc(plan(student,'fake'),future));
  await assertSucceeds(setDoc(plan(teacher,'new'),future));
  await assertSucceeds(updateDoc(plan(teacher,'new'),{days:['MAT 1']}));
  await assertFails(updateDoc(plan(teacher,'new'),{start:schedule.start}));
  await assertFails(updateDoc(plan(teacher),{days:['LUK 5']}));
  await assertFails(updateDoc(plan(teacher),{start:future.start}));
  await assertSucceeds(updateDoc(plan(teacher),{title:'更正名稱'}));
});
