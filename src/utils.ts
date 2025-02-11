import { encodePng } from '@lunapaint/png-codec'

export function bigIntToUint8Array(num: bigint) {
    return new Uint8Array(num.toString(16).padStart(32, "0").match(/../g)!.map(b => parseInt(b, 16)));
}

export function uint8ArrayToBigInt(arr: Uint8Array) {
    return BigInt(`0x${Array.from(arr).map(b => b.toString(16).padStart(32, '0')).join('')}`);
}

export async function paletteToBase64(palette: number[], width: number) {
    const rgb_palette: number[] = []

    for (const color of palette) {
        rgb_palette.push(...[
            color >> 16,
            color >> 8 & 0xff,
            color & 0xff,
            255
        ])
    }

    const { data } = await encodePng({
        data: new Uint8Array(rgb_palette),
        width,
        height: Math.ceil(palette.length / width), 
    })
    
    return data
}