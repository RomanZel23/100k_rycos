import type { FastifyReply } from 'fastify';

function now(): number {
  return Math.floor(Date.now() / 1000);
}

export function success(
  reply: FastifyReply,
  data: unknown = null,
  message = 'Success',
  statusCode = 200
) {
  return reply.code(statusCode).send({
    success: true,
    message,
    data,
    timestamp: now(),
  });
}

export function error(
  reply: FastifyReply,
  message: string,
  statusCode = 400,
  errors?: Record<string, unknown>
) {
  const body: Record<string, unknown> = {
    success: false,
    message,
    timestamp: now(),
  };
  if (errors) body.errors = errors;
  return reply.code(statusCode).send(body);
}

export function validationError(
  reply: FastifyReply,
  errors: Record<string, string>,
  message = 'Validation failed'
) {
  return error(reply, message, 422, errors);
}

export function notFound(reply: FastifyReply, message = 'Resource not found') {
  return error(reply, message, 404);
}

export function unauthorized(reply: FastifyReply, message = 'Unauthorized') {
  return error(reply, message, 401);
}

export function forbidden(reply: FastifyReply, message = 'Forbidden') {
  return error(reply, message, 403);
}

export class HttpError extends Error {
  statusCode: number;
  errors?: Record<string, unknown>;
  constructor(statusCode: number, message: string, errors?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }
}
