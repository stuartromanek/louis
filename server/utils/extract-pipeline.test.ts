import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createExtractPipeline,
  createMutex,
  createPollGate,
  EXTRACT_PIPELINE_MAX_POLLS,
} from './extract-pipeline.ts'

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('createMutex', () => {
  it('runs callbacks one at a time', async () => {
    const mutex = createMutex()
    let active = 0
    let maxActive = 0

    await Promise.all([0, 1, 2].map(i => mutex.run(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await delay(10)
      active -= 1
      return i
    })))

    assert.equal(maxActive, 1)
  })
})

describe('createPollGate', () => {
  it('caps concurrent holders', async () => {
    const gate = createPollGate(2)
    let maxActive = 0
    const holders = [0, 1, 2].map(async () => {
      await gate.acquire()
      maxActive = Math.max(maxActive, gate.active)
      await delay(15)
      gate.release()
    })
    await Promise.all(holders)
    assert.equal(maxActive, 2)
    assert.equal(gate.active, 0)
  })
})

describe('createExtractPipeline', () => {
  it('starts prepare(n+1) before poll(n) resolves', async () => {
    const pipeline = createExtractPipeline()
    const prepareStarted: number[] = []
    const poll0 = deferred()
    const prepare1Started = deferred()

    const results = pipeline.run(2, {
      async prepare(index) {
        prepareStarted.push(index)
        if (index === 1) prepare1Started.resolve()
        return index
      },
      async put(_index, prepared) {
        return prepared
      },
      async poll(index, putResult) {
        if (index === 0) await poll0.promise
        return putResult
      },
    })

    await prepare1Started.promise
    assert.deepEqual(prepareStarted, [0, 1])
    poll0.resolve()
    assert.deepEqual(await results, [0, 1])
  })

  it('allows PUT(n+1) before poll(n) resolves', async () => {
    const pipeline = createExtractPipeline()
    const puts: number[] = []
    const poll0 = deferred()
    const put1Started = deferred()

    const results = pipeline.run(2, {
      async prepare(index) {
        return index
      },
      async put(index, prepared) {
        puts.push(index)
        if (index === 1) put1Started.resolve()
        return prepared
      },
      async poll(index, putResult) {
        if (index === 0) await poll0.promise
        return putResult
      },
    })

    await put1Started.promise
    assert.deepEqual(puts, [0, 1])
    poll0.resolve()
    assert.deepEqual(await results, [0, 1])
  })

  it('never overlaps two PUTs', async () => {
    const pipeline = createExtractPipeline()
    let activePuts = 0
    let maxPuts = 0

    await pipeline.run(3, {
      async prepare(index) {
        return index
      },
      async put(_index, prepared) {
        activePuts += 1
        maxPuts = Math.max(maxPuts, activePuts)
        await delay(15)
        activePuts -= 1
        return prepared
      },
      async poll(_index, putResult) {
        await delay(5)
        return putResult
      },
    })

    assert.equal(maxPuts, 1)
  })

  it('never overlaps two prepares', async () => {
    const pipeline = createExtractPipeline()
    let activePrepares = 0
    let maxPrepares = 0

    await pipeline.run(3, {
      async prepare(index) {
        activePrepares += 1
        maxPrepares = Math.max(maxPrepares, activePrepares)
        await delay(15)
        activePrepares -= 1
        return index
      },
      async put(_index, prepared) {
        return prepared
      },
      async poll(_index, putResult) {
        return putResult
      },
    })

    assert.equal(maxPrepares, 1)
  })

  it('never runs more than max polls at once', async () => {
    const pipeline = createExtractPipeline({ maxPolls: EXTRACT_PIPELINE_MAX_POLLS })
    let activePolls = 0
    let maxPolls = 0
    const putOrder: number[] = []

    await pipeline.run(4, {
      async prepare(index) {
        return index
      },
      async put(index, prepared) {
        putOrder.push(index)
        return prepared
      },
      async poll(_index, putResult) {
        activePolls += 1
        maxPolls = Math.max(maxPolls, activePolls)
        await delay(20)
        activePolls -= 1
        return putResult
      },
    })

    assert.equal(maxPolls, 2)
    assert.deepEqual(putOrder, [0, 1, 2, 3])
  })

  it('shares PUT and poll caps across concurrent run() calls', async () => {
    const pipeline = createExtractPipeline()
    let activePuts = 0
    let maxPuts = 0
    let activePolls = 0
    let maxPolls = 0

    const hooks = {
      async prepare(index: number) {
        return index
      },
      async put(_index: number, prepared: number) {
        activePuts += 1
        maxPuts = Math.max(maxPuts, activePuts)
        await delay(10)
        activePuts -= 1
        return prepared
      },
      async poll(_index: number, putResult: number) {
        activePolls += 1
        maxPolls = Math.max(maxPolls, activePolls)
        await delay(25)
        activePolls -= 1
        return putResult
      },
    }

    await Promise.all([
      pipeline.run(2, hooks),
      pipeline.run(2, hooks),
    ])

    assert.equal(maxPuts, 1)
    assert.equal(maxPolls, 2)
  })
})
