const { google } = require('googleapis');

/**
 * OAuth2（デスクトップアプリ / ループバックフロー）で取得したリフレッシュトークンから
 * Gmail APIクライアントを組み立てる。
 */
function buildGmailClient({ clientId, clientSecret, refreshToken }) {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * メッセージのpayloadからtext/plain本文を再帰的に抜き出す。
 * 見つからなければtext/htmlをそのまま返す（タグ除去はしない、呼び出し側の正規表現は
 * 改行・空白に寛容なため概ね動く）。
 */
function extractBody(payload) {
  if (!payload) return '';
  if (payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain') {
        const r = extractBody(part);
        if (r) return r;
      }
    }
    for (const part of payload.parts) {
      const r = extractBody(part);
      if (r) return r;
    }
  }
  return '';
}

/**
 * 受信箱の直近メール（新しい順）を取得する。
 * 「処理済みかどうか」はGmail側のラベルではなく、呼び出し側（emailSync.js）が
 * Firestoreの processedEmailMessages コレクションで管理する
 * （gmail.readonlyスコープのみで完結させるため。ラベル付与にはgmail.modify権限が
 * 別途必要になり、その場合ユーザーに再度OAuth同意を取ってもらう必要があるため避けた）。
 */
async function fetchRecentMessages(gmail, { maxResults = 20 } = {}) {
  const list = await gmail.users.messages.list({
    userId: 'me',
    q: 'in:inbox',
    maxResults,
  });
  const messages = list.data.messages || [];
  const results = [];
  for (const m of messages) {
    const full = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' });
    const headers = full.data.payload.headers || [];
    const subject = headers.find((h) => h.name === 'Subject')?.value || '';
    const from = headers.find((h) => h.name === 'From')?.value || '';
    const body = extractBody(full.data.payload);
    results.push({ id: m.id, subject, from, body });
  }
  return results;
}

module.exports = { buildGmailClient, extractBody, fetchRecentMessages };
