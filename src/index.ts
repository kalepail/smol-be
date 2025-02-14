import { IttyRouter, RequestLike, cors, error, json, status, withParams } from 'itty-router'
import { SmolBeDo } from './do'
import { getStub } from './utils'

const { preflight, corsify } = cors()
const router = IttyRouter()

let cache = caches.default;

async function cacheMeOutside(req: Request, env: Env, ctx: ExecutionContext) {
	let url = new URL(req.url)
	let match = await cache.match(url.href);

	if (match && match.status >= 200 && match.status <= 299) {
		// await cache.delete(url.href);

		return new Response(match.body, {
			headers: match.headers
		});
	}
}

router
	.options('*', preflight)
	// .get('*', cacheMeOutside)
	.all('*', withParams)
	.get('/drop', async (req: RequestLike, env: Env, ctx: ExecutionContext) => {
		// TODO authenticate this endpoint
		
		await getStub(env).zephyrDrop();
		return status(204)
	})
	.post('/zephyr', async (req: RequestLike, env: Env, ctx: ExecutionContext) => {
		// TODO ensure we're only accepting acceptable (authenticated?) webhooks
		// Likely need this on the zephyr side as well as here
		
		let body = await req.json()

		await getStub(env).zephyrPost(body);
		return status(204)
	})
	.get('/glyph/:index.png', async (req: RequestLike, env: Env, ctx: ExecutionContext) => {
		let glyph = await env.SMOL_BE_R2.get(req.params.index);

		if (!glyph) {
			return status(404)
		}

		return new Response(glyph.body, { 
			headers: { 
				'Content-Type': 'image/png',
				'Cache-Control': 'public, max-age=31536000, immutable'
			} 
		});
	})
	.get('/glyph/:index', async (req: RequestLike, env: Env, ctx: ExecutionContext) => {
			let glyph = await getStub(env).zephyrGlyph(Number(req.params.index));
	
			if (!glyph) {
				return status(404)
			}
	
			return json(glyph, {
				headers: {
					'Cache-Control': 'public, max-age=31536000, immutable'
				}
			});
		})
	.get('/colors', async (req: RequestLike, env: Env, ctx: ExecutionContext) => {
		let colors = await getStub(env).zephyrColors();
		return json(colors);
	})
	.get('/glyphs', async (req: RequestLike, env: Env, ctx: ExecutionContext) => {
		let glyphs = await getStub(env).zephyrGlyphs();

		return json(glyphs, {
			headers: {
				'Cache-Control': 'public, max-age=300'
			}
		});
	})
	.get('/offers', async (req: RequestLike, env: Env, ctx: ExecutionContext) => {
		let offers = await getStub(env).zephyrOffers();
		return json(offers);
	})
	.get('/', async (req: RequestLike, env: Env, ctx: ExecutionContext) => {
		let results = await getStub(env).zephyrGet();
		return json(results);
	})
	// ---
	.all('*', () => error(404))

const handler = {
	fetch: (req: Request, env: Env, ctx: ExecutionContext) => router
		.fetch(req, env, ctx)
		.catch((err) => {
			if (err?.type !== 'simulate')
				console.error(err);

			if (err?.rpc)
				delete err.rpc;

			return error(
				typeof err?.status === 'number' ? err.status : 400,
				err instanceof Error
					? err?.message || err
					: err
			)
		})
		.then(async (res: Response) => {
			const url = new URL(req.url);

			if (
				req.method === 'GET'
				&& res.status >= 200 
				&& res.status <= 299 
				&& res.headers.get('Cache-Control')?.includes('public')
			) {
				// ctx.waitUntil(cache.put(url.href, res.clone()));
			}

			return corsify(res, req)
		}),
} satisfies ExportedHandler<Env>

export {
	SmolBeDo,
	handler as default
}
