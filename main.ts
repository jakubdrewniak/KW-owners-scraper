import {config} from 'dotenv';
import {program} from 'commander';
import { webkit, Browser, Page } from 'playwright';
import {expect} from "@playwright/test";

(async () => {
    const {kwSignature, headless} = getOptions()
    const [departmentCode, KWNumber, controlNumber] = kwSignature.split('/')

    const browser: Browser = await webkit.launch({ headless });
    const page = await browser.newPage();
    await page.goto('https://przegladarka-ekw.ms.gov.pl/eukw_prz/KsiegiWieczyste/wyszukiwanieKW');
    await page.locator('#kodWydzialuInput').fill(departmentCode)
    await page.locator('#numerKsiegiWieczystej').fill(KWNumber)
    await page.locator('#cyfraKontrolna').fill(controlNumber)

    await page.locator('#wyszukaj').click();

    await page.locator('#przyciskWydrukZwykly').click();

    const table = await page.locator('table').filter({hasText: 'Budynki'});
    await expect(table).toBeVisible()

    const apartments: Record<string, string> = {}
    let apartmentRowAchieved = false;
    for (const row of await table.locator('tr').all()) {
        if (!apartmentRowAchieved) {
            const text = await row.allInnerTexts()
            if (text[0].includes('Informacja o wyodrębnionych lokalach')) {
                apartmentRowAchieved = true
            }
        }

        if (!apartmentRowAchieved) {
            continue
        }
        const columns = await row.locator('td')
        const columnsCount = await columns.count();
        const apartmentNumber = await columns.nth(columnsCount - 3).innerText();
        const KW = await columns.nth(columnsCount - 2).innerText();
        apartments[apartmentNumber] = KW
    }
    console.log(apartments)

    await browser.close();
})();

function getOptions() {
    config();
    program.option('--kw <signature>', 'KW Signature from command line')
    program.option('--h <headless>', 'Headless')
    program.parse(process.argv);
    const KWSignatureAsFlag = program.opts().kw;
    const KWSignatureAsEnvVariable = process.env.kw
    const kwSignature = KWSignatureAsFlag || KWSignatureAsEnvVariable;
    if (!kwSignature) {
        throw new Error('Provide KW signature.')
    }
    const headless = program.opts().h === 'true' || false
    return {kwSignature, headless}
}