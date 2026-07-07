import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { HttpProblemError, type Problem, type ProblemFieldError } from "../errors/problem.js";

function fieldErrorsFromValidation(validation: NonNullable<FastifyError["validation"]>): ProblemFieldError[] {
  return validation.map((issue) => {
    const field = issue.instancePath.replace(/^\//, "").replace(/\//g, ".") || (issue.params as { additionalProperty?: string }).additionalProperty || issue.schemaPath;
    return { field: field || "request", message: issue.message ?? "is invalid" };
  });
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError>((error, request: FastifyRequest, reply: FastifyReply) => {
    const instance = request.url;

    if (error instanceof HttpProblemError) {
      reply.code(error.status).type("application/problem+json").send(error.toProblem(instance));
      return;
    }

    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      const problem: Problem = {
        type: "https://errors.event-analytics.local/413",
        title: "Batch too large",
        status: 413,
        detail: error.message,
        instance,
      };
      reply.code(413).type("application/problem+json").send(problem);
      return;
    }

    if (error.validation) {
      const problem: Problem = {
        type: "https://errors.event-analytics.local/400",
        title: "Invalid request parameters",
        status: 400,
        detail: error.message,
        instance,
        errors: fieldErrorsFromValidation(error.validation),
      };
      reply.code(400).type("application/problem+json").send(problem);
      return;
    }

    request.log.error(error);
    const problem: Problem = {
      type: "https://errors.event-analytics.local/500",
      title: "Internal server error",
      status: 500,
      instance,
    };
    reply.code(500).type("application/problem+json").send(problem);
  });
}
