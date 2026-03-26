import { Request, Response, NextFunction, RequestHandler } from 'express'

/**
 * Wraps an async Express route handler so that any thrown error or
 * rejected promise is forwarded to next() — reaching the global
 * error handler instead of crashing the process (Express 4 limitation).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
