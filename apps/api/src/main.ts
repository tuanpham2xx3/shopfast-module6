import { createApiApp } from "./bootstrap";
import { parseEnvironment } from "../../../libs/platform/src/config/environment";

async function main() {
  const app = await createApiApp();
  const environment = parseEnvironment(process.env);
  await app.listen(environment.PORT, environment.HOST);
}
void main();
