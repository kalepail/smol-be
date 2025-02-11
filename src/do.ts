import { DurableObject } from "cloudflare:workers";
import { xdr, scValToNative, Address } from "@stellar/stellar-sdk/minimal";
import { Server } from "@stellar/stellar-sdk/minimal/rpc";
import { bigIntToUint8Array, paletteToBase64, uint8ArrayToBigInt } from "./utils";

const CONTRACT_ID = 'CDE37MDCRXLY5VJYRNYTSBBDBUIBIP5ZYO54T25P3UTFIOOGML4LZ7V4'
const rpc = new Server('https://soroban-testnet.stellar.org')

export interface ZephyrBody {
	topics: string[],
	data: string
}

export class SmolBeDo extends DurableObject<Env> {
	sql: SqlStorage

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql = ctx.storage.sql;
		this.zephyrCreate();
	}

	async zephyrCreate() {
		// TODO 
		// add primary indexes
		// add indexes

		// Colors
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS colors(
				color	INTEGER PRIMARY KEY,
				owner  	BLOB
			)
		`);

		// Glyphs
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS glyphs(
				glyph	INTEGER PRIMARY KEY,
				owner  	BLOB,
				title	STRING,
				story 	STRING
			)
		`);

		// Offers
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS offers(
				sell 	BLOB,
				buy 	BLOB,
				PRIMARY KEY (sell, buy)
			)
		`);
	}

	async zephyrDrop() {
		this.sql.exec('DROP TABLE IF EXISTS colors;');
		this.sql.exec('DROP TABLE IF EXISTS glyphs;');
		this.sql.exec('DROP TABLE IF EXISTS offers;');
		this.zephyrCreate();
	}

	async zephyrPost(body: ZephyrBody) {
		let topic_1_scval = body.topics[0] ? xdr.ScVal.fromXDR(body.topics[0], 'base64') : xdr.ScVal.scvVoid();
		let topic_1 = scValToNative(topic_1_scval);

		let topic_2_scval = body.topics[1] ? xdr.ScVal.fromXDR(body.topics[1], 'base64') : xdr.ScVal.scvVoid();
		let topic_2 = scValToNative(topic_2_scval);

		let topic_3_scval = body.topics[2] ? xdr.ScVal.fromXDR(body.topics[2], 'base64') : xdr.ScVal.scvVoid();
		let topic_3 = scValToNative(topic_3_scval);

		let topic_4_scval = body.topics[3] ? xdr.ScVal.fromXDR(body.topics[3], 'base64') : xdr.ScVal.scvVoid();
		let topic_4 = scValToNative(topic_4_scval);

		let data_scval = body.data ? xdr.ScVal.fromXDR(body.data, 'base64') : xdr.ScVal.scvVoid();
		let data = scValToNative(data_scval);

		console.log(topic_1);

		switch (topic_1) {
			// Colors
			case 'color_claim':
				this.sql.exec(`
					INSERT OR IGNORE INTO colors (color, owner) VALUES 
					(?1, ?2);
				`, data, topic_2);
				break;
			case 'color_owner_transfer':
				this.sql.exec(`
					UPDATE colors SET owner = ?1 WHERE color = ?2;
				`, topic_2, data);
				break;

			// Glyphs
			case 'glyph_mint':
				let [glyph_index, title, story] = data

				try {
					// NOTE `_getLedgerEntries` due to a weird "Unsupported address type" error
					let { entries } = await rpc._getLedgerEntries(xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
						contract: Address.fromString(CONTRACT_ID).toScAddress(),
						key: xdr.ScVal.scvVec([
							xdr.ScVal.scvSymbol('Glyph'),
							xdr.ScVal.scvU32(glyph_index)
						]),
						durability: xdr.ContractDataDurability.persistent(),
					})));

					for (let entry of entries || []) {
						let data = xdr.LedgerEntryData.fromXDR(entry.xdr, 'base64');
						let glyph = scValToNative(data.contractData().val())
					
						let palette = [...glyph.colors].map((legend_index: number) => glyph.legend[legend_index]);
						let base64 = await paletteToBase64(palette, glyph.width);

						await this.env.SMOL_BE_R2.put(glyph_index, base64);
					}
				} catch(err) {
					// don't block sql save on R2 save
					console.error(err);
				}

				this.sql.exec(`
					INSERT OR IGNORE INTO glyphs (glyph, owner, title, story) VALUES 
					(?1, ?2, ?3, ?4);
				`, glyph_index, topic_2, title, story);
				break;
			case 'glyph_owner_transfer':
				this.sql.exec(`
					UPDATE glyphs SET owner = ?1 WHERE glyph = ?2;
				`, topic_2, data);
				break;

			// Offers
			case 'offer_sell_glyph':
				// topic_2 = sell glyph

				// offer was automatically matched
				if (data) {
					// sell glyph, buy asset match
					if (typeof topic_4 === 'bigint') {
						// topic_3 = buy sac
						// topic_4 = amount

						// remove all sell glyph sales
						this.sql.exec(`
							DELETE FROM offers WHERE sell = ?1;
						`, topic_2);

						// remove asset sell offer
						let sell = new Uint8Array([
							...Address.fromString(data).toScAddress().toXDR(),
							...Address.fromString(topic_3).toBuffer(),
							...bigIntToUint8Array(topic_4)
						]);
						this.sql.exec(`
							DELETE FROM offers WHERE sell = ?1 AND buy = ?2;
						`, sell, topic_2);

						// change sell glyph ownership to buyer
						this.sql.exec(`
							UPDATE glyphs SET owner = ?1 WHERE glyph = ?2;
						`, data, topic_2);
					}

					// sell glyph, buy glyph match
					else {
						// topic_3 = buy glyph
						// topic_4 = sell glyph owner

						// remove all sell glyph sales
						this.sql.exec(`
							DELETE FROM offers WHERE sell = ?1;
						`, topic_2);

						// remove all buy glyph sales
						this.sql.exec(`
							DELETE FROM offers WHERE sell = ?1;
						`, topic_3);

						// change sell glyph ownership to buyer
						this.sql.exec(`
							UPDATE glyphs SET owner = ?1 WHERE glyph = ?2;
						`, data, topic_2);

						// change buy glyph ownership to seller
						this.sql.exec(`
							UPDATE glyphs SET owner = ?1 WHERE glyph = ?2;
						`, topic_4, topic_3);
					}
				}

				// offer was posted
				else {
					let [type, glyph_or_sac, amount] = topic_3;

					switch (type) {
						// sell glyph, buy glyph post
						case 'Glyph':
							this.sql.exec(`
								INSERT OR IGNORE INTO offers (sell, buy) VALUES
								(?1, ?2);
							`, topic_2, glyph_or_sac); // glyph_or_sac = buy glyph
							break;

						// sell glyph, buy asset post
						case 'Asset':
							let buy = new Uint8Array([
								...Address.fromString(glyph_or_sac).toBuffer(), // glyph_or_sac = buy sac
								...bigIntToUint8Array(amount)
							]);

							this.sql.exec(`
								INSERT OR IGNORE INTO offers (sell, buy) VALUES
								(?1, ?2);
							`, topic_2, buy);
							break;
						default:
							throw new Error('Invalid type');
					}
				}
				break;
			case 'offer_sell_asset':
				// sell asset, buy glyph match
				if (data) {
					this.sql.exec(`
						DELETE FROM offers WHERE sell = ?1;
					`, topic_3);

					this.sql.exec(`
						UPDATE glyphs SET owner = ?1 WHERE glyph = ?2;
					`, data, topic_3);
				}

				// sell asset, buy glyph post
				else {
					let [owner, sac, amount] = topic_2; // topic_2 = sell asset
					let sell = new Uint8Array([
						...Address.fromString(owner).toScAddress().toXDR(),
						...Address.fromString(sac).toBuffer(),
						...bigIntToUint8Array(amount)
					]);

					this.sql.exec(`
						INSERT OR IGNORE INTO offers (sell, buy) VALUES
						(?1, ?2);
					`, sell, topic_3);
				}
				break;
			case 'offer_sell_glyph_remove':
				// remove specific sale
				if (topic_3) {
					let [type, glyph_or_sac, amount] = topic_3;

					switch (type) {
						case 'Glyph':
							this.sql.exec(`
								DELETE FROM offers WHERE sell = ?1 AND buy = ?2;
							`, topic_2, glyph_or_sac); // glyph_or_sac = buy glyph
							break;
						case 'Asset':
							let buy = new Uint8Array([
								...Address.fromString(glyph_or_sac).toBuffer(), // glyph_or_sac = buy sac
								...bigIntToUint8Array(amount)
							]);

							this.sql.exec(`
								DELETE FROM offers WHERE sell = ?1 AND buy = ?2;
							`, topic_2, buy);
							break;
					}
				}

				// remove all glyph sales
				else {
					this.sql.exec(`
						DELETE FROM offers WHERE sell = ?1;
					`, topic_2);
				}
				break;
			case 'offer_sell_asset_remove':
				let [owner, sac, amount] = topic_2; // topic_2 = sell asset

				let sell = new Uint8Array([
					...Address.fromString(owner).toScAddress().toXDR(),
					...Address.fromString(sac).toBuffer(),
					...bigIntToUint8Array(amount)
				]);

				this.sql.exec(`
					DELETE FROM offers WHERE sell = ?1 AND buy = ?2;
				`, sell, topic_3);
				break;

			default:
				throw new Error('Invalid topic');
		}
	}

	async zephyrColors() {
		let colors: Record<string, SqlStorageValue>[] = []
		let colors_cursor = this.sql.exec("SELECT * FROM colors;");

		for (let row of colors_cursor) {
			colors.push(row);
		}

		return colors;
	}
	async zephyrGlyphs() {
		let glyphs: Record<string, SqlStorageValue>[] = []
		let glyphs_cursor = this.sql.exec("SELECT * FROM glyphs;");

		for (let row of glyphs_cursor) {
			glyphs.push(row);
		}

		return glyphs;
	}
	async zephyrOffers() {
		let offers: Record<string, SqlStorageValue>[] = []
		let offers_cursor = this.sql.exec("SELECT * FROM offers;");

		for (let row of offers_cursor) {
			let sell = row.sell instanceof ArrayBuffer ? (() => {
				let asset = new Uint8Array(row.sell);
				let owner = asset.slice(0, asset.length - 32 - 16);
				let sac = asset.slice(asset.length - 32 - 16, asset.length - 16);

				let balance = asset.slice(asset.length - 16);
				let balanceBigInt = uint8ArrayToBigInt(balance);

				return [
					Address.fromScAddress(xdr.ScAddress.fromXDR(owner as Buffer)).toString(),
					Address.contract(sac as Buffer).toString(),
					balanceBigInt.toString()
				]
			})() : row.sell;
			let buy = row.buy instanceof ArrayBuffer ? (() => {
				let asset = new Uint8Array(row.buy);
				let sac = asset.slice(asset.length - 32 - 16, asset.length - 16);

				let balance = asset.slice(asset.length - 16);
				let balanceBigInt = uint8ArrayToBigInt(balance);

				return [
					Address.contract(sac as Buffer).toString(),
					balanceBigInt.toString()
				]
			})() : row.buy;

			row.sell = sell as SqlStorageValue;
			row.buy = buy as SqlStorageValue;

			offers.push(row);
		}

		return offers;
	}
	async zephyrGet() {
		let colors = await this.zephyrColors();
		let glyphs = await this.zephyrGlyphs();
		let offers = await this.zephyrOffers();

		return {
			colors,
			glyphs,
			offers,
		};
	}
}