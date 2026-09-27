import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authGuard } from "../plugins/auth.js";
import { searchCatalog, getCatalogStats } from "../catalog/db.js";

/**
 * Medicine catalog search.
 *
 * Replaces the old client-side approach that shipped the full 37 MB dataset
 * (243,578 rows) to every browser. A search now returns only the matching rows.
 *
 * Deliberately NOT tenant-scoped: the catalog is a shared, read-only product
 * database (same reference rows for every store on the install). Tenant
 * isolation for catalog data applies to the per-tenant tables
 * `/api/catalog-overrides` and `/api/catalog-additions`, which are filtered by
 * createdBy — bare catalog reads stay global by design.
 */
export default async function catalogRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/search",
    { preHandler: [authGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { q = "", limit = "25" } = request.query as { q?: string; limit?: string };

      const trimmed = String(q).trim();
      if (!trimmed) {
        return reply.send({ success: true, data: { results: [], total: 0 } });
      }

      const parsedLimit = Math.min(Math.max(parseInt(String(limit), 10) || 25, 1), 200);

      try {
        const { rows, total, strategy } = await searchCatalog(trimmed, parsedLimit);
        return reply.send({
          success: true,
          data: {
            results: rows.map((r) => ({
              name: r.name,
              company: r.company,
              composition: r.composition,
              packSize: r.pack,
              category: r.form || "Other",
              unit: r.unit || "Nos",
              price: r.price > 0 ? r.price : undefined,
              gstRate: r.gst || 5,
              catalogKey: `${r.name}::${r.company}`,
            })),
            total,
            strategy,
          },
        });
      } catch (err: any) {
        fastify.log.error(err);
        return reply.status(500).send({
          success: false,
          error: `Catalog search failed: ${err.message}`,
        });
      }
    }
  );

  fastify.get(
    "/stats",
    { preHandler: [authGuard] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const stats = await getCatalogStats();
        return reply.send({ success: true, data: stats });
      } catch (err: any) {
        fastify.log.error(err);
        return reply.status(500).send({
          success: false,
          error: `Catalog unavailable: ${err.message}`,
        });
      }
    }
  );
}
