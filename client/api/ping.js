export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    runtime: 'node',
    tip: 'Routing to /api is working. Next, we verify Python.'
  });
}
