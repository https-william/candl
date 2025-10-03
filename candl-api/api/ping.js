export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    ok: true,
    runtime: 'node',
    tip: 'Routing works. Try POST /api/sentiment or /api/consensus.'
  });
}
