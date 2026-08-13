const { getAuth } = require('firebase-admin/auth');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 12; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

/**
 * 呼び出し元がadminかどうかを判定。
 * usersコレクションが空（初回セットアップ）の場合は、認証済みユーザーなら誰でも許可（ブートストラップ）。
 */
async function assertIsAdmin(db, callerUid) {
  const usersSnap = await db.collection('users').limit(1).get();
  if (usersSnap.empty) {
    return; // ブートストラップ: 最初の管理者作成を許可
  }
  const callerDoc = await db.collection('users').doc(callerUid).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
    throw new HttpsError('permission-denied', '管理者のみ実行できます');
  }
}

/**
 * 新しいスタッフ/管理者アカウントを作成する（管理者専用）
 */
function makeCreateStaffAccount(db) {
  return onCall({ region: 'asia-northeast1' }, async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ログインが必要です');
    }
    await assertIsAdmin(db, request.auth.uid);

    const { email, displayName, role, vendorId } = request.data || {};
    if (!email || !role) {
      throw new HttpsError('invalid-argument', 'email と role は必須です');
    }
    if (role !== 'admin' && role !== 'staff' && role !== 'contractor') {
      throw new HttpsError('invalid-argument', 'role は admin, staff, contractor のいずれかを指定してください');
    }
    if (role === 'contractor' && !vendorId) {
      throw new HttpsError('invalid-argument', 'contractorロールにはvendorIdが必須です');
    }

    const tempPassword = generateTempPassword();

    let userRecord;
    try {
      userRecord = await getAuth().createUser({
        email,
        password: tempPassword,
        displayName: displayName || email,
      });
    } catch (err) {
      logger.error('createStaffAccount: createUser failed', err);
      throw new HttpsError('already-exists', err.message);
    }

    await db.collection('users').doc(userRecord.uid).set({
      email,
      displayName: displayName || email,
      role,
      vendorId: role === 'contractor' ? vendorId : null,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: request.auth.uid,
    });

    return { uid: userRecord.uid, email, tempPassword };
  });
}

/**
 * ユーザーのロールを変更する（管理者専用）
 */
function makeSetUserRole(db) {
  return onCall({ region: 'asia-northeast1' }, async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ログインが必要です');
    }
    await assertIsAdmin(db, request.auth.uid);

    const { uid, role, vendorId } = request.data || {};
    if (!uid || (role !== 'admin' && role !== 'staff' && role !== 'contractor')) {
      throw new HttpsError('invalid-argument', 'uid と role(admin|staff|contractor) は必須です');
    }
    if (role === 'contractor' && !vendorId) {
      throw new HttpsError('invalid-argument', 'contractorロールにはvendorIdが必須です');
    }

    await db.collection('users').doc(uid).update({
      role,
      vendorId: role === 'contractor' ? vendorId : null,
    });
    return { ok: true };
  });
}

/**
 * ユーザーの有効/無効を切り替える（管理者専用）。
 * Firestore上のフラグに加え、Firebase Authでもログイン自体をブロックする。
 */
function makeSetUserActive(db) {
  return onCall({ region: 'asia-northeast1' }, async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ログインが必要です');
    }
    await assertIsAdmin(db, request.auth.uid);

    const { uid, active } = request.data || {};
    if (!uid || typeof active !== 'boolean') {
      throw new HttpsError('invalid-argument', 'uid と active(boolean) は必須です');
    }

    if (uid === request.auth.uid && !active) {
      throw new HttpsError('failed-precondition', '自分自身を無効化することはできません');
    }

    await getAuth().updateUser(uid, { disabled: !active });
    await db.collection('users').doc(uid).update({ active });
    return { ok: true };
  });
}

/**
 * 既存ユーザーのパスワードを再発行する（管理者専用）。
 * 本人がパスワードを忘れた・初期パスワードを紛失した場合に使用。
 */
function makeResetUserPassword(db) {
  return onCall({ region: 'asia-northeast1' }, async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'ログインが必要です');
    }
    await assertIsAdmin(db, request.auth.uid);

    const { uid } = request.data || {};
    if (!uid) {
      throw new HttpsError('invalid-argument', 'uid は必須です');
    }

    const tempPassword = generateTempPassword();
    let userRecord;
    try {
      userRecord = await getAuth().updateUser(uid, { password: tempPassword });
    } catch (err) {
      logger.error('resetUserPassword: updateUser failed', err);
      throw new HttpsError('not-found', err.message);
    }

    return { uid, email: userRecord.email, tempPassword };
  });
}

module.exports = {
  makeCreateStaffAccount,
  makeSetUserRole,
  makeSetUserActive,
  makeResetUserPassword,
};
