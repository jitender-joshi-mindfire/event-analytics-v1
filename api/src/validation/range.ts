import { badRequest } from "../errors/problem.js";

export function assertValidRange(from: string, to: string): void {
  if (Date.parse(to) <= Date.parse(from)) {
    throw badRequest("'from' must be earlier than 'to'.", [{ field: "to", message: "must be greater than 'from'" }]);
  }
}
