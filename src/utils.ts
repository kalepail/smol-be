export function bigIntToUint8Array(num: bigint) {
    return new Uint8Array(num.toString(16).padStart(32, "0").match(/../g)!.map(b => parseInt(b, 16)));
}

export function uint8ArrayToBigInt(arr: Uint8Array) {
    return BigInt(`0x${Array.from(arr).map(b => b.toString(16).padStart(32, '0')).join('')}`);
}