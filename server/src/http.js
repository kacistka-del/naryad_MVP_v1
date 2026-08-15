export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
