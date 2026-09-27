import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

// Generic OPTIONS handler for CORS preflight — attach with addHook before registering routes
export async function genericCorsHook(fastify: FastifyInstance) {
  fastify.options("*", async (req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send();
  });
}
