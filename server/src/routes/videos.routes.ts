import { FastifyInstance } from 'fastify'
import { fastifyMultipart } from '@fastify/multipart'
import fs, { createReadStream } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { pipeline } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { prisma } from '../lib/prisma'
import { openai } from '../lib/openai'

const pump = promisify(pipeline)

export async function videosRoutes(app: FastifyInstance) {
  app.register(fastifyMultipart, {
    limits: {
      fileSize: 1_048_576 * 25, // 25mb
    },
  })

  app.post('/', async (request, reply) => {
    const fileData = await request.file()

    if (!fileData) {
      return reply.status(400).send({ error: 'Missing file input.' })
    }

    const extension = path.extname(fileData.filename)

    if (extension !== '.mp3') {
      return reply
        .status(400)
        .send({ error: 'Invalid input type, please upload a MP3.' })
    }

    const fileBaseName = path.basename(fileData.filename, extension)

    const fileUploadName = `${fileBaseName}-${randomUUID()}${extension}`

    const uploadDestination = path.resolve(
      __dirname,
      '../../tmp',
      fileUploadName,
    )

    await pump(fileData.file, fs.createWriteStream(uploadDestination))

    const video = await prisma.video.create({
      data: {
        name: fileData.filename,
        path: uploadDestination,
      },
    })

    return {
      video,
    }
  })

  app.post('/:videoId/transcription', async (request, reply) => {
    const paramsSchema = z.object({
      videoId: z.string().uuid(),
    })

    const { videoId } = paramsSchema.parse(request.params)

    const bodySchema = z.object({
      prompt: z.string(),
    })

    const { prompt } = bodySchema.parse(request.body)

    const video = await prisma.video.findUniqueOrThrow({
      where: {
        id: videoId,
      },
    })

    const videoPath = video.path
    const audioReadStream = createReadStream(videoPath)

    const response = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: 'whisper-1',
      language: 'pt',
      response_format: 'json',
      temperature: 0,
      prompt,
    })

    const transcription = response.text

    await prisma.video.update({
      where: {
        id: videoId,
      },
      data: {
        transcription,
      },
    })

    return { transcription }
  })

  app.post('/ai/complete', async (request, reply) => {
    const bodySchema = z.object({
      videoId: z.string().uuid(),
      template: z.string(),
      temperature: z.number().min(0).max(1).default(0.5),
    })

    const { videoId, temperature, template } = bodySchema.parse(request.body)

    const video = await prisma.video.findUniqueOrThrow({
      where: {
        id: videoId,
      },
    })

    if (!video.transcription) {
      return reply
        .status(400)
        .send({ error: 'Video transcription was not generated yet.' })
    }

    const promptMessage = template.replace(
      '{transcription}',
      video.transcription,
    )

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo-16k',
      temperature,
      messages: [{ role: 'user', content: promptMessage }],
    })

    return response
  })
}
