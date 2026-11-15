import {applicationDefault, deleteApp, initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {defaultPlan} from '../site/model.js';

const [, , projectId, teacherUid] = process.argv;
if (!projectId || process.argv.length > 4 || (teacherUid && teacherUid.includes('/'))) {
  console.error('用法：node tools/bootstrap.js FIREBASE_PROJECT_ID [FIREBASE_TEACHER_UID]');
  process.exit(1);
}
const local = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (local && (!projectId.startsWith('demo-') || (teacherUid && !process.env.FIREBASE_AUTH_EMULATOR_HOST))) {
  throw Error('本機初始化請使用 demo-* 專案，以及本機 Authentication 和 Firestore 模擬器。');
}
if (!local && process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw Error('正式初始化前請移除 FIREBASE_AUTH_EMULATOR_HOST。');
}

const app = initializeApp(local ? {projectId} : {projectId, credential:applicationDefault()});
try {
  const db = getFirestore(app);
  const {id, ...fields} = defaultPlan;
  const planRef = db.collection('plans').doc(id);
  const teacherRef = teacherUid ? db.collection('members').doc(teacherUid) : null;
  if (teacherRef && (await getAuth(app).getUser(teacherUid)).disabled) throw Error('此老師登入帳戶已停用。');
  const result = await db.runTransaction(async (transaction) => {
    const [plan, teacher] = await Promise.all([
      transaction.get(planRef), teacherRef ? transaction.get(teacherRef) : null,
    ]);
    if (teacher?.exists && (teacher.data().role !== 'teacher' || !teacher.data().active)) {
      throw Error('此 UID 已有其他隊員設定；請在 Firebase 控制台核對並處理。');
    }
    if (!plan.exists) transaction.create(planRef, fields);
    if (teacherRef && !teacher.exists) {
      transaction.create(teacherRef,{nickname:'帶隊老師',role:'teacher',active:true,shareProgress:false});
    }
    return {planCreated:!plan.exists,teacherCreated:Boolean(teacherRef && !teacher.exists)};
  });
  console.log(projectId, result);
} finally {
  await deleteApp(app);
}
