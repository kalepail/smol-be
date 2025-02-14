import { Address, scValToNative, xdr } from "@stellar/stellar-sdk/minimal";
import { Server } from "@stellar/stellar-sdk/minimal/rpc";

export const CONTRACT_ID = 'CA3SPLLDBCOVZDDFAXNDNDBWH5E3ULRX5AL2MVQWOCGLJO7IGO5YHE7J'
export const rpc = new Server('https://soroban-testnet.stellar.org')

interface Glyph {
    author: string,
    colors: number[],
    legend: number[],
    width: number,
}

export async function getGlyph(glyph_index: number) {
    // NOTE `_getLedgerEntries` due to a weird "Unsupported address type" error
    let { entries } = await rpc._getLedgerEntries(xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
        contract: Address.fromString(CONTRACT_ID).toScAddress(),
        key: xdr.ScVal.scvVec([
            xdr.ScVal.scvSymbol('Glyph'),
            xdr.ScVal.scvU32(glyph_index)
        ]),
        durability: xdr.ContractDataDurability.persistent(),
    })));

    let entry = entries?.[0];

    if (!entry) {
        return;
    }

    let data = xdr.LedgerEntryData.fromXDR(entry.xdr, 'base64');
    let glyph: Glyph = scValToNative(data.contractData().val())

    glyph.colors = [...glyph.colors]

    return glyph;
}