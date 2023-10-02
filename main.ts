import {config} from 'dotenv';
import {program} from 'commander';
import {webkit, Browser, Page} from 'playwright';
import {expect} from "@playwright/test";

type Apartment = { apNumber: number, KW: string }
let page: Page

(async () => {
    const {kwSignature, headless} = getOptions()
    const [departmentCode, KWNumber, controlNumber] = kwSignature.split('/')

    const browser: Browser = await webkit.launch({headless});
    page = await browser.newPage();

    const apartments: Apartment[] = await getApartments(departmentCode, KWNumber, controlNumber)
    console.log(apartments)

    await browser.close();
})();

async function getApartments(
    departmentCode: string,
    KWNumber: string,
    controlNumber: string
): Promise<Apartment[]> {
    await page.goto('https://przegladarka-ekw.ms.gov.pl/eukw_prz/KsiegiWieczyste/wyszukiwanieKW');
    await page.locator('#kodWydzialuInput').fill(departmentCode)
    await page.locator('#numerKsiegiWieczystej').fill(KWNumber)
    await page.locator('#cyfraKontrolna').fill(controlNumber)

    await page.locator('#wyszukaj').click();

    await page.locator('#przyciskWydrukZwykly').click();

    const table = await page.locator('table').filter({hasText: 'Budynki'});
    await expect(table).toBeVisible()

    const apartments: Apartment[] = []
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
        const apNumber: number = parseInt(await columns.nth(columnsCount - 3).innerText());
        const KW: string = await columns.nth(columnsCount - 2).innerText();
        apartments.push({apNumber, KW})
    }
    apartments.sort(function (a, b) {
        return a.apNumber - b.apNumber;
    })
    return apartments
}

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