import { config } from "dotenv";
import { program } from "commander";
import { webkit, Browser, Page } from "playwright";
import { expect } from "@playwright/test";
import * as fs from "fs";
import cheerio from "cheerio";

type Apartment = { apNumber: number; KW: string };
let page: Page;
const SEARCH_URL =
  "https://przegladarka-ekw.ms.gov.pl/eukw_prz/KsiegiWieczyste/wyszukiwanieKW";

(async () => {
  const { kwSignature, headless } = getOptions();
  const [departmentCode, KWNumber, controlNumber] = kwSignature.split("/");

  const browser: Browser = await webkit.launch({ headless, slowMo: 50 });
  page = await browser.newPage();

  const apartments: Apartment[] = await getApartments(
    departmentCode,
    KWNumber,
    controlNumber,
  );
  console.log(apartments);
  await prepareApartmentView(apartments[0]);

  await browser.close();
})();

async function prepareApartmentView(ap: Apartment) {
  const templateHtml = fs.readFileSync("template.html", "utf-8");
  const $ = cheerio.load(templateHtml);

  const [departmentCode, KWNumber, controlNumber] = ap.KW.split("/").map(
    (val) => val.trim(),
  );
  await page.goto(SEARCH_URL);
  await page.locator("#kodWydzialuInput").fill(departmentCode);
  await page.locator("#numerKsiegiWieczystej").fill(KWNumber);
  await page.locator("#cyfraKontrolna").fill(controlNumber);

  await page.locator("#wyszukaj").click();

  await page.locator("#przyciskWydrukZwykly").click();

  await page.locator('input[value="Dział I-Sp"]').click();

  $("body").append(`<h2>Mieszkanie ${ap.apNumber}</h3>`);

  const share = await page
    .locator("tr")
    .filter({ hasText: "Wielkość udziału w nieruchomości wspólnej" });
  await expect(share).toBeVisible();
  const shareElement = await share.evaluate((element) => element.outerHTML);
  console.log(shareElement);
  $("body").append(`<table><tbody>${shareElement}</tbody></table>`);

  await page.locator('input[value="Dział II"]').click();

  const shareHolders = await page
    .locator("table")
    .filter({ hasText: "Lista wskazań udziałów w prawie" });
  await expect(shareHolders).toBeVisible();
  const shareHoldersElement = await shareHolders.evaluate(
    (element) => element.outerHTML,
  );
  console.log(shareHoldersElement);
  $("body").append(shareHoldersElement);

  const outputFileName = `output.html`;
  fs.writeFileSync(outputFileName, $.html());
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
  const headless = program.opts().h === "true" || false;
  return { kwSignature, headless };
}
