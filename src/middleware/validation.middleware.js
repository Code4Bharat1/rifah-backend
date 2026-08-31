import { ValidationError } from "../shared/errors/errors.js";

/**
 * Validates request payload (body, query, params) against a validator function or schema
 * @param {Function} validatorFn - Function receiving data and returning { valid: boolean, errors: Array }
 * @param {'body'|'query'|'params'} [target='body']
 */
export const validateRequest = (validatorFn, target = "body") => {
  return (req, res, next) => {
    const data = req[target] || {};
    const result = validatorFn(data);

    if (result && !result.valid) {
      return next(new ValidationError("Validation error", result.errors));
    }

    next();
  };
};
