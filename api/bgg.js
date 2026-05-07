export default async function handler(req, res) {
  const { user, type } = req.query;
  const url = type === 'plays' 
    ? `https://boardgamegeek.com/xmlapi2/plays?username=${user}`
    : `https://boardgamegeek.com/xmlapi2/collection?username=${user}&stats=1`;

  const response = await fetch(url);
  const data = await response.text();

  res.setHeader('Content-Type', 'application/xml');
  res.status(response.status).send(data);
}