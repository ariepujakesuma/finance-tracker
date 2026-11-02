import { createServer } from './bootstrap';

async function main() {
  const server = await createServer();
  const port = Number(process.env.PORT) || 4000;
  server.listen(port, () => console.log(`API berjalan di http://localhost:${port}`));
}
main();
