# KW-owners-scraper

Main goal of this project is to provide possibility to gather data about flats owners by providing block of flats KW signature.
All the data is publicly accessible, but gov site has no API and copying and pasting KWs of flats to search and copying data is something that can be automated.

Input: KW's signature (in format XXXX/XXXXXXX/X)
Output: Aggregated data of owners in block.

Run app
npx ts-node main.ts --kw=XXXX/XXXXXXX/X

or add KW signature in .env file as kw="XXXX/XXXXXXX/X"
and run
npx ts-node main.ts
