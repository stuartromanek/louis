export const EXTRACT_PIPELINE_MAX_POLLS = 2

export function createMutex() {
  let tail = Promise.resolve()

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      const previous = tail
      let release: () => void = () => {}
      tail = new Promise<void>((resolve) => {
        release = resolve
      })
      await previous
      try {
        return await fn()
      }
      finally {
        release()
      }
    },
  }
}

export function createPollGate(max: number) {
  let active = 0
  const waiters: Array<() => void> = []

  return {
    get active() {
      return active
    },
    async acquire() {
      while (active >= max) {
        await new Promise<void>(resolve => waiters.push(resolve))
      }
      active += 1
    },
    release() {
      active = Math.max(0, active - 1)
      waiters.shift()?.()
    },
  }
}

export interface ExtractPipelineHooks<TPrepared, TPut, TResult> {
  prepare: (index: number) => Promise<TPrepared>
  put: (index: number, prepared: TPrepared) => Promise<TPut>
  poll: (index: number, putResult: TPut) => Promise<TResult>
}

export interface ExtractPipeline {
  readonly putMutex: ReturnType<typeof createMutex>
  readonly pollGate: ReturnType<typeof createPollGate>
  withPutSlot<T>(fn: () => Promise<T>): Promise<T>
  run<TPrepared, TPut, TResult>(
    count: number,
    hooks: ExtractPipelineHooks<TPrepared, TPut, TResult>,
  ): Promise<TResult[]>
}

/**
 * Shared 1-prepare / 1-PUT / cap-N-polls pipeline.
 * Multiple `run` calls on the same instance share the PUT slot and poll gate
 * so split groups from different videos cannot exceed the caps.
 */
export function createExtractPipeline(options?: {
  maxPolls?: number
}): ExtractPipeline {
  const prepareMutex = createMutex()
  const putMutex = createMutex()
  const pollGate = createPollGate(options?.maxPolls ?? EXTRACT_PIPELINE_MAX_POLLS)

  return {
    putMutex,
    pollGate,
    withPutSlot<T>(fn: () => Promise<T>) {
      return putMutex.run(fn)
    },
    async run<TPrepared, TPut, TResult>(
      count: number,
      hooks: ExtractPipelineHooks<TPrepared, TPut, TResult>,
    ): Promise<TResult[]> {
      if (count <= 0) return []

      const prepared: Promise<TPrepared>[] = []
      let prepareChain = Promise.resolve()

      function enqueuePrepare(index: number) {
        if (prepared[index]) return
        const next = prepareChain.then(() => prepareMutex.run(() => hooks.prepare(index)))
        prepareChain = next.then(() => undefined, () => undefined)
        prepared[index] = next
      }

      enqueuePrepare(0)
      const polls: Promise<TResult>[] = []

      for (let index = 0; index < count; index++) {
        if (index + 1 < count) enqueuePrepare(index + 1)

        let ready: TPrepared
        try {
          ready = await prepared[index]!
        }
        catch (err) {
          await Promise.allSettled(polls)
          throw err
        }

        await pollGate.acquire()
        let putResult: TPut
        try {
          putResult = await putMutex.run(() => hooks.put(index, ready))
        }
        catch (err) {
          pollGate.release()
          await Promise.allSettled(polls)
          throw err
        }

        polls.push(
          hooks.poll(index, putResult).finally(() => pollGate.release()),
        )
      }

      return Promise.all(polls)
    },
  }
}
