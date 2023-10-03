import { config } from "dotenv";
import { program } from "commander";
import { webkit, Browser, Page, chromium } from "playwright";
import { expect } from "@playwright/test";
import * as fs from "fs";
import cheerio, { CheerioAPI } from "cheerio";

const userAgentStrings = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.2227.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.3497.92 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
];

type Apartment = { apNumber: number; KW: string };
let page: Page;
const SEARCH_URL =
  "https://przegladarka-ekw.ms.gov.pl/eukw_prz/KsiegiWieczyste/wyszukiwanieKW";

(async () => {
  const { kwSignature, headless } = getOptions();
  const [departmentCode, KWNumber, controlNumber] = kwSignature.split("/");

  let browser: Browser = await chromium.launch({ headless });
  page = await browser.newPage();

  console.log("Creating apartments list...");
  const apartments: Apartment[] = await getApartments(
    departmentCode,
    KWNumber,
    controlNumber,
  );
  await browser.close();
  console.log(`Apartments list complete. Length: ${apartments.length}`);

  const templateHtml = fs.readFileSync("template.html", "utf-8");
  const $ = cheerio.load(templateHtml);

  for (const ap of apartments) {
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      userAgent:
        userAgentStrings[Math.floor(Math.random() * userAgentStrings.length)],
    });
    page = await context.newPage();
    await prepareApartmentView(ap, $);
    await browser.close();
  }
  console.log(`All apartments complete. Creating output file.`);
  const outputFileName = `output.html`;
  fs.writeFileSync(outputFileName, $.html());
  console.log(`Output file created.`);

  return;
})();

async function prepareApartmentView(ap: Apartment, $: CheerioAPI) {
  console.log(`Creating view for apartment ${ap.apNumber}...`);
  const [departmentCode, KWNumber, controlNumber] = ap.KW.split("/").map(
    (val) => val.trim(),
  );
  try {
    console.log(`Opening  apartment ${ap.apNumber} KW...`);
    await page.goto(SEARCH_URL);
    await page.locator("#kodWydzialuInput").fill(departmentCode);
    await page.locator("#numerKsiegiWieczystej").fill(KWNumber);
    await page.locator("#cyfraKontrolna").fill(controlNumber);

    await page.locator("#wyszukaj").click();

    await page.locator("#przyciskWydrukZwykly").click();

    await page.locator('input[value="Dział I-Sp"]').click();
  } catch (e) {
    console.log(`Apartment number ${ap.apNumber} error at opening.`);
    console.log(e);
  }

  console.log(`Adding apartment number ${ap.apNumber} data...`);
  $("body").append(`<h2>Mieszkanie ${ap.apNumber}, ${ap.KW}</h3>`);

  try {
    const share = await page
      .locator("tr")
      .filter({ hasText: "Wielkość udziału w nieruchomości wspólnej" });
    await expect(share).toBeVisible();
    const shareElement = await share.evaluate((element) => element.outerHTML);
    $("body").append(`<table><tbody>${shareElement}</tbody></table>`);
  } catch (e) {
    console.log(`Apartment number ${ap.apNumber} error at share table.`);
    console.log(e);
    $("body").append(
      `<div>ERROR: Apartment number ${ap.apNumber} error at share table.</div>`,
    );
  }

  try {
    await page.locator('input[value="Dział II"]').click();

    const shareHolders = await page
      .locator("table")
      .filter({ hasText: "Lista wskazań udziałów w prawie" });
    await expect(shareHolders).toBeVisible();
    const shareHoldersElement = await shareHolders.evaluate(
      (element) => element.outerHTML,
    );
    $("body").append(shareHoldersElement);
    console.log(`Apartment number ${ap.apNumber} data completed.`);
  } catch (e) {
    console.log(`Apartment number ${ap.apNumber} error at shareholders.`);
    console.log(e);
    $("body").append(
      `<div>ERROR: Apartment number ${ap.apNumber} error at shareholders.</div>`,
    );
  }
}

async function getApartments(
  departmentCode: string,
  KWNumber: string,
  controlNumber: string,
): Promise<Apartment[]> {
  await page.goto(SEARCH_URL);
  await page.locator("#kodWydzialuInput").fill(departmentCode);
  await page.locator("#numerKsiegiWieczystej").fill(KWNumber);
  await page.locator("#cyfraKontrolna").fill(controlNumber);

  await page.locator("#wyszukaj").click();

  await page.locator("#przyciskWydrukZwykly").click();

  const table = await page.locator("table").filter({ hasText: "Budynki" });
  await expect(table).toBeVisible();

  const apartments: Apartment[] = [];
  let apartmentRowAchieved = false;
  for (const row of await table.locator("tr").all()) {
    if (!apartmentRowAchieved) {
      const text = await row.allInnerTexts();
      if (text[0].includes("Informacja o wyodrębnionych lokalach")) {
        apartmentRowAchieved = true;
      }
    }

    if (!apartmentRowAchieved) {
      continue;
    }
    const columns = await row.locator("td");
    const columnsCount = await columns.count();
    const apNumber: number = parseInt(
      await columns.nth(columnsCount - 3).innerText(),
    );
    const KW: string = await columns.nth(columnsCount - 2).innerText();
    apartments.push({ apNumber, KW });
  }
  apartments.sort(function (a, b) {
    return a.apNumber - b.apNumber;
  });
  return apartments;
}

function getOptions() {
  config();
  program.option("--kw <signature>", "KW Signature from command line");
  program.option("--h <headless>", "Headless");
  program.parse(process.argv);
  const KWSignatureAsFlag = program.opts().kw;
  const KWSignatureAsEnvVariable = process.env.kw;
  const kwSignature = KWSignatureAsFlag || KWSignatureAsEnvVariable;
  if (!kwSignature) {
    throw new Error("Provide KW signature.");
  }
  const headless = program.opts().h !== "false";
  return { kwSignature, headless };
}
