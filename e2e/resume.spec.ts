import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PDFParse } from "pdf-parse";
import {
  hrefFor,
  nav,
  resume,
  roles,
  sideProjects,
} from "../src/content/site";

test("the Resume page has no axe violations", async ({ page }) => {
  await page.goto("/resume");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("every Role is listed newest first, each at its anchor", async ({
  page,
}) => {
  await page.goto("/resume");
  const timeline = page.getByRole("region", { name: resume.rolesHeading });
  const items = timeline.locator("ol > li");
  await expect(items).toHaveCount(roles.length);

  for (const [i, role] of roles.entries()) {
    const item = items.nth(i);
    await expect(item).toHaveAttribute("id", role.id);
    await expect(
      item.getByRole("heading", { name: `${role.title}, ${role.company}` }),
    ).toBeVisible();
    await expect(item).toContainText(`${role.start} to ${role.end}`);
    await expect(item.locator("ul > li")).toHaveText([...role.bullets]);
  }
});

test("Juice Bros sits under Side projects, outside the Role timeline", async ({
  page,
}) => {
  await page.goto("/resume");
  const timeline = page.getByRole("region", { name: resume.rolesHeading });
  const side = page.getByRole("region", { name: resume.sideProjectsHeading });
  await expect(timeline.getByText("Juice Bros")).toHaveCount(0);
  for (const project of sideProjects) {
    await expect(
      side.getByRole("heading", { name: project.name }),
    ).toBeVisible();
    await expect(side.getByRole("link", { name: /juicebrospickleball\.com/ })).toHaveAttribute(
      "href",
      project.url,
    );
  }
});

test("a Highlight's link lands on its Role", async ({ page }) => {
  const href = hrefFor({ kind: "role", roleId: "life-house" });
  await page.goto(href);
  await expect(page.locator("#life-house")).toBeInViewport();
  await expect(
    page.locator("#life-house").getByRole("heading", { name: /Life House/ }),
  ).toBeVisible();
});

test("the download links point at the Resume PDF and the Word version", async ({
  page,
}) => {
  await page.goto("/resume");
  await expect(
    page.getByRole("link", { name: resume.download.pdf }),
  ).toHaveAttribute("href", resume.pdfHref);
  await expect(
    page.getByRole("link", { name: resume.download.docx }),
  ).toHaveAttribute("href", resume.docxHref);
});

test("the Resume PDF is served as a PDF with no phone number in it", async ({
  request,
}) => {
  const response = await request.get(resume.pdfHref);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");

  const parser = new PDFParse({ data: await response.body() });
  const { text } = await parser.getText();
  await parser.destroy();

  expect(text).toContain("adrianluk618@gmail.com");
  expect(text).not.toMatch(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
});

test("the Resume DOCX is served as a Word document", async ({ request }) => {
  const response = await request.get(resume.docxHref);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain(
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  // The phone-number checks on its contents live in src/content/resume-files.test.ts.
  expect((await response.body()).subarray(0, 2).toString("latin1")).toBe("PK");
});

type Stop = { href: string | null; focusVisible: boolean };

async function tabTo(page: Page): Promise<Stop> {
  await page.keyboard.press("Tab");
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { href: null, focusVisible: false };
    const style = getComputedStyle(el);
    const outline =
      style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
    const shadow = style.boxShadow !== "none";
    return { href: el.getAttribute("href"), focusVisible: outline || shadow };
  });
}

test("a keyboard walk reaches the nav, the download and the project link with visible focus", async ({
  page,
}) => {
  await page.goto("/resume");
  const expected = [
    "/",
    ...nav.map((n) => n.href),
    resume.pdfHref,
    resume.docxHref,
    sideProjects[0].url,
  ];
  const stops: Stop[] = [];
  for (let i = 0; i < expected.length; i++) stops.push(await tabTo(page));

  expect(stops.map((s) => s.href)).toEqual(expected);
  for (const stop of stops) {
    expect(stop, `focus visible on ${stop.href}`).toMatchObject({
      focusVisible: true,
    });
  }
});
