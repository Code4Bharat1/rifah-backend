process.on("uncaughtException", err => {
  console.error("UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});
process.on("unhandledRejection", err => {
  console.error("UNHANDLED REJECTION:", err);
  process.exit(1);
});

import("./src/server.js").catch(err => {
  console.error("IMPORT ERROR:", err);
});
