import { getSaveJob } from '../../../utils/save-jobs'

export default defineEventHandler((event) => {
  const jobId = getRouterParam(event, 'jobId')
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: 'jobId is required' })
  }

  const job = getSaveJob(jobId)
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: 'Save job not found' })
  }

  return job
})
