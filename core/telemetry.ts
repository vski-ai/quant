import { Model, Query } from "mongoose";
import { Redis } from "ioredis";
import { metrics, trace } from "@opentelemetry/api";

export const tracer = trace.getTracer("quant-core", "1.0.0");
export const meter = metrics.getMeter("quant-core", "1.0.0");

/**
 * A helper function to wrap class methods with OpenTelemetry spans.
 * This manually applies tracing to all instances of a class.
 * @param prototype The class prototype (e.g., Redis.prototype).
 * @param method The name of the method to wrap.
 * @param name The name for the span (e.g., 'redis.command').
 */
function wrap(
  prototype: any,
  method: string,
  name: string,
) {
  const original = prototype[method];
  if (typeof original !== "function") return;

  prototype[method] = function (...args: any[]) {
    const spanName = `${name}.${method}`;
    return tracer.startActiveSpan(spanName, (span) => {
      // Optionally add arguments to the span for more context
      // span.setAttribute('args', JSON.stringify(args));
      const result = original.apply(this, args);
      if (result instanceof Promise) {
        return result.finally(() => span.end());
      }
      span.end();
      return result;
    });
  };
}

// --- Manual Instrumentation ---

// Mongoose
wrap(Query.prototype, "exec", "mongoose");
wrap(Model, "bulkWrite", "mongoose");
wrap(Model, "save", "mongoose");

// IORedis
const redisCommands = [
  "zadd",
  "sadd",
  "smembers",
  "set",
  "zpopmin",
  "eval",
  "zrange",
  "flushdb",
];
redisCommands.forEach((command) => {
  // @ts-ignore: Wrapping dynamic command names
  wrap(Redis.prototype, command, "redis");
});
