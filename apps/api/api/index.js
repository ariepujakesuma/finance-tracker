// Vercel function: forwards every request to the compiled NestJS app.
module.exports = require('../dist/vercel').default;
