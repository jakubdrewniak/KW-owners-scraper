import {config} from 'dotenv';
import {program} from 'commander';

(async () => {
    const kwSignature = getKWSignature()
    console.log(kwSignature)
})();

function getKWSignature(): string {
    config();
    program.option('--kw <signature>', 'KW Signature from command line')
    program.parse(process.argv);
    const KWSignatureAsFlag = program.opts().kw;
    const KWSignatureAsEnvVariable = process.env.kw
    const KWSignature = KWSignatureAsFlag || KWSignatureAsEnvVariable;
    if (!KWSignature) {
        throw new Error('Provide KW signature.')
    }
    return KWSignature
}