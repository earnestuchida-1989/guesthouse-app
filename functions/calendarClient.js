const { google } = require('googleapis');

/**
 * サービスアカウントの認証情報からGoogle Calendar APIクライアントを作成
 */
function getCalendarClient(serviceAccountKeyJson) {
  const credentials = JSON.parse(serviceAccountKeyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
  return google.calendar({ version: 'v3', auth });
}

/**
 * 指定カレンダーのイベント一覧を取得（timeMin〜timeMaxの範囲）
 */
async function fetchCalendarEvents(calendar, calendarId, timeMin, timeMax) {
  const events = [];
  let pageToken;
  do {
    const res = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
      pageToken,
    });
    events.push(...(res.data.items || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return events;
}

module.exports = { getCalendarClient, fetchCalendarEvents };
