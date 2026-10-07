/** Thrown anywhere in a route; the error handler turns it into { error: { code, message, details? } }. */
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
