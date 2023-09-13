import { fastify } from 'fastify'
import { fastifyCors } from '@fastify/cors'
import { promptsRoutes } from './routes/prompts.routes'
import { videosRoutes } from './routes/videos.routes'

const app = fastify()

app.register(fastifyCors, {
  origin: '*',
})

app.register(promptsRoutes, {
  prefix: '/prompts',
})

app.register(videosRoutes, {
  prefix: '/videos',
})

app
  .listen({
    port: 3333,
  })
  .then(() => {
    console.log('HTTP Server Running! 🚀')
  })
