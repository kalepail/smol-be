import { IttyRouter, RequestLike, cors, error, json, status, withParams } from 'itty-router'
import { SmolBeDo } from './do'
import { getStub } from './utils'

const { preflight, corsify } = cors()
const router = IttyRouter()

router
	.options('*', preflight)
	.all('*', withParams)
	.get('/drop', async (req: RequestLike, env: Env, ctx: ExecutionContext) => {
		// TODO authenticate this endpoint
		
		await getStub(env).zephyrDrop();
		return status(204)
	})
	.post('/zephyr', async (req: RequestLike, env: Env, ctx: ExecutionContext) => {
		// TODO ensure we're only accepting acceptable (authenticated?) webhooks
		// Likely need this on the zephyr size as well as here
		
		let body = await req.json()

		await getStub(env).zephyrPost(body);
		return status(204)
	})
	.get('/glyph/:index', async (req: RequestLike, env: Env, ctx: ExecutionContext) => {
		let glyph = await env.SMOL_BE_R2.get(req.params.index);

		if (!glyph) {
			return status(404)
		}

		return new Response(glyph.body, { headers: { 'Content-Type': 'image/png' } });
	})
	.get('/colors', async (req: RequestLike, env: Env, ctx: ExecutionContext) => {
		let colors = await getStub(env).zephyrColors();
		return json(colors);
	})
	.get('/glyphs', async (req: RequestLike, env: Env, ctx: ExecutionContext) => {
		let glyphs = await getStub(env).zephyrGlyphs();
		return json(glyphs);
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
		.then((r) => corsify(r, req)),
} satisfies ExportedHandler<Env>

export {
	SmolBeDo,
	handler as default
}
