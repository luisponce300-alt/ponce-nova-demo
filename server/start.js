import { createApp } from "./app.js";
const port = Number(process.env.PORT || 3000);
const app = await createApp();
app.requestTimeout = 45000;
app.headersTimeout = 15000;
app.listen(port, "0.0.0.0", () =>
  console.log(`Ponce & Nova paper preview listening on port ${app.address().port}`),
);
