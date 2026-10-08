import { expect, test } from "@playwright/test";

test("/llms.txt answers as plain text, opening with Adrian's name", async ({
  request,
}) => {
  const response = await request.get("/llms.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^text\/plain/);
  expect(await response.text()).toMatch(/^# Adrian Luk\n/);
});
