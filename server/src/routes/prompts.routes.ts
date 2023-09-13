import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'

export async function promptsRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    const prompts = await prisma.prompt.findMany()

    reply.status(200).send({ prompts })
  })
}
