// Netlify Function: Proxy OWGR world rankings
// GET /.netlify/functions/rankings?count=200

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const count = Math.min(parseInt(event.queryStringParameters?.count || '200', 10), 500);

  try {
    const resp = await fetch(
      `https://www.owgr.com/api/Ranking/GetRankings?pageNo=1&pageSize=${count}&orderByField=ORWRank&isAscending=true`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; 4MajorsPicks/1.0)',
          'Referer': 'https://www.owgr.com/rankings',
        },
      }
    );

    if (!resp.ok) {
      throw new Error(`OWGR returned ${resp.status}`);
    }

    const data = await resp.json();
    const ranking = data.ranking || data.Ranking || [];

    const players = ranking.map((p) => ({
      name: `${(p.firstName || p.FirstName || '').trim()} ${(p.lastName || p.LastName || '').trim()}`.trim(),
      rank: p.rankThisWeek || p.RankThisWeek || p.rank || p.Rank,
      country: p.countryCode || p.CountryCode || '',
    })).filter((p) => p.name && p.rank);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ players, count: players.length }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch OWGR rankings', detail: err.message }),
    };
  }
};
