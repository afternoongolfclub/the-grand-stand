// Netlify Function: Proxy ESPN Golf API for tournament field & results
// GET /.netlify/functions/tournament?type=scoreboard
// GET /.netlify/functions/tournament?type=summary&eventId=ESPN_EVENT_ID

const MAJOR_KEYWORDS = ['masters', 'pga championship', 'u.s. open', 'us open', 'the open', 'open championship'];

function isMajor(name = '') {
  const lower = name.toLowerCase();
  return MAJOR_KEYWORDS.some((k) => lower.includes(k));
}

function parseScoreboard(data) {
  // ESPN scoreboard structure: sports[0].leagues[0].events[]
  const leagues = data?.sports?.[0]?.leagues?.[0];
  const events = leagues?.events || data?.events || [];

  return events.map((e) => ({
    id: e.id,
    name: e.name || e.shortName,
    status: e.status?.type?.name || 'unknown',
    isMajor: isMajor(e.name),
    startDate: e.date,
    competitors: (e.competitions?.[0]?.competitors || []).map((c) => ({
      espnId: c.athlete?.id || c.id,
      name: c.athlete?.displayName || c.displayName,
      position: c.status?.displayValue || c.statistics?.find(s => s.name === 'rank')?.displayValue,
      score: c.score || c.statistics?.find(s => s.name === 'score')?.displayValue,
      status: c.status?.type?.name,
    })),
  }));
}

function parseSummary(data) {
  const competitors = data?.competitors || [];
  return competitors.map((c) => ({
    espnId: c.athlete?.id || c.id,
    name: c.athlete?.displayName || c.displayName,
    position: c.status?.displayValue,
    score: c.score,
    status: c.status?.type?.name,
  }));
}

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const { type = 'scoreboard', eventId } = event.queryStringParameters || {};

  let url;
  if (type === 'summary' && eventId) {
    url = `https://site.api.espn.com/apis/site/v2/sports/golf/pga/summary?event=${eventId}`;
  } else {
    // Get current/recent PGA Tour scoreboard
    url = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';
  }

  try {
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; 4MajorsPicks/1.0)',
      },
    });

    if (!resp.ok) {
      throw new Error(`ESPN returned ${resp.status}`);
    }

    const data = await resp.json();

    if (type === 'summary' && eventId) {
      const competitors = parseSummary(data);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ competitors, raw_event_id: eventId }),
      };
    }

    const events = parseScoreboard(data);
    const majors = events.filter((e) => e.isMajor);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        events: majors.length ? majors : events,
        allEvents: events,
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch ESPN tournament data', detail: err.message }),
    };
  }
};
