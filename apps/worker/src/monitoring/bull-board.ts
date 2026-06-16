import express from 'express'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { makeQueue, QUEUE } from '../queues/index.js'

export function startBullBoard(port = 3001): void {
  const serverAdapter = new ExpressAdapter()
  serverAdapter.setBasePath('/queues')

  const queues = Object.values(QUEUE).map((name) => new BullMQAdapter(makeQueue(name as typeof QUEUE[keyof typeof QUEUE])))

  createBullBoard({ queues, serverAdapter })

  const app = express()
  app.use('/queues', serverAdapter.getRouter())
  app.get('/', (_req, res) => res.redirect('/queues'))

  app.listen(port, () => {
    console.log(`[bull-board] http://localhost:${port}/queues`)
  })
}
