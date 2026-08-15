import type { FastifyInstance, FastifyRequest } from 'fastify';
import { foodService } from './food.service.js';
import {
  categoryParamsSchema,
  createCategorySchema,
  createDishSchema,
  getDishParamsSchema,
  getVendorParamsSchema,
  listDishesSchema,
  listVendorsSchema,
  updateAvailabilitySchema,
  updateCategorySchema,
  updateDishSchema,
  updateVendorProfileSchema,
} from './food.schema.js';
import { authenticate, authorize } from '../../shared/middleware/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAuditLog } from '../../shared/audit/audit.js';
import { prisma } from '../../shared/db/prisma.js';

function requireUser(request: FastifyRequest): NonNullable<typeof request.user> {
  if (!request.user) {
    throw AppError.unauthorized();
  }
  return request.user;
}

async function requireVendorId(userId: string): Promise<string> {
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId } });
  if (!vendor) {
    throw AppError.notFound('Vendor profile not found — has the VENDOR role been assigned?');
  }
  return vendor.id;
}

export async function registerFoodRoutes(app: FastifyInstance): Promise<void> {
  // ---- Categories ----

  app.get(
    '/categories',
    {
      schema: {
        tags: ['food'],
        summary: 'List active food categories',
        response: {
          200: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    slug: { type: 'string' },
                    sortOrder: { type: 'integer' },
                    isActive: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const result = await foodService.listCategories();
      return reply.send(result);
    },
  );

  app.post(
    '/categories',
    {
      preHandler: [authenticate, authorize('SUPER_ADMIN', 'ADMIN')],
      schema: {
        tags: ['food'],
        summary: 'Create a food category (admin only)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            slug: { type: 'string' },
            sortOrder: { type: 'integer', default: 0 },
          },
          required: ['name', 'slug'],
        },
        response: { 201: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const data = createCategorySchema.parse({ body: request.body }).body;
      const category = await foodService.createCategory(data);
      await writeAuditLog({
        actorId: actor.id,
        action: 'category.create',
        entity: 'food_category',
        entityId: category.id,
        details: { name: data.name, slug: data.slug },
        ipAddress: request.ip,
      });
      return reply.code(201).send(category);
    },
  );

  app.patch(
    '/categories/:id',
    {
      preHandler: [authenticate, authorize('SUPER_ADMIN', 'ADMIN')],
      schema: {
        tags: ['food'],
        summary: 'Update a food category (admin only)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            slug: { type: 'string' },
            sortOrder: { type: 'integer' },
            isActive: { type: 'boolean' },
          },
        },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const parsed = updateCategorySchema.parse(request);
      const category = await foodService.updateCategory(parsed.params.id, parsed.body);
      await writeAuditLog({
        actorId: actor.id,
        action: 'category.update',
        entity: 'food_category',
        entityId: parsed.params.id,
        details: parsed.body,
        ipAddress: request.ip,
      });
      return reply.send(category);
    },
  );

  app.delete(
    '/categories/:id',
    {
      preHandler: [authenticate, authorize('SUPER_ADMIN')],
      schema: {
        tags: ['food'],
        summary: 'Delete a food category (super admin only)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 204: { type: 'null' } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = categoryParamsSchema.parse(request).params;
      await foodService.deleteCategory(id);
      await writeAuditLog({
        actorId: actor.id,
        action: 'category.delete',
        entity: 'food_category',
        entityId: id,
        ipAddress: request.ip,
      });
      return reply.code(204).send();
    },
  );

  // ---- Vendor profiles ----

  app.get(
    '/vendors',
    {
      schema: {
        tags: ['food'],
        summary: 'List active vendors',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    businessName: { type: 'string' },
                    description: { type: 'string' },
                    phone: { type: 'string' },
                    logoUrl: { type: 'string' },
                  },
                },
              },
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const q = listVendorsSchema.parse({ querystring: request.query }).querystring;
      const result = await foodService.listVendors(q.page, q.limit);
      return reply.send(result);
    },
  );

  app.get(
    '/vendors/:id',
    {
      schema: {
        tags: ['food'],
        summary: 'Get a vendor profile by id',
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              businessName: { type: 'string' },
              description: { type: 'string' },
              phone: { type: 'string' },
              logoUrl: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = getVendorParamsSchema.parse(request).params;
      const vendor = await foodService.getVendorById(id);
      return reply.send(vendor);
    },
  );

  app.get(
    '/vendors/me/profile',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['food'],
        summary: 'Get the authenticated vendor profile',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              businessName: { type: 'string' },
              description: { type: 'string' },
              phone: { type: 'string' },
              logoUrl: { type: 'string' },
              isActive: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const user = requireUser(request);
      const vendor = await foodService.getVendorByUserId(user.id);
      return reply.send(vendor);
    },
  );

  app.patch(
    '/vendors/me/profile',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['food'],
        summary: 'Update the authenticated vendor profile',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            businessName: { type: 'string' },
            description: { type: 'string' },
            phone: { type: 'string' },
            logoUrl: { type: 'string' },
          },
        },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const data = updateVendorProfileSchema.parse({ body: request.body }).body;
      const result = await foodService.updateVendorProfile(actor.id, data);
      await writeAuditLog({
        actorId: actor.id,
        action: 'vendor_profile.update',
        entity: 'vendor_profile',
        entityId: result.id,
        details: data,
        ipAddress: request.ip,
      });
      return reply.send(result);
    },
  );

  // ---- Dishes ----

  app.get(
    '/vendors/:vendorId/dishes',
    {
      schema: {
        tags: ['food'],
        summary: 'List a vendor dishes with pagination and filters',
        params: { type: 'object', properties: { vendorId: { type: 'string' } } },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            categoryId: { type: 'string' },
            isAvailable: { type: 'string', enum: ['true', 'false'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    price: { type: 'string' },
                    imageUrl: { type: 'string' },
                    isAvailable: { type: 'boolean' },
                  },
                },
              },
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = listDishesSchema.parse({
        params: request.params,
        querystring: request.query ?? {},
      });
      const q = parsed.querystring;
      const result = await foodService.listVendorDishes(parsed.params.vendorId, q.page, q.limit, {
        categoryId: q.categoryId,
        isAvailable: q.isAvailable === undefined ? undefined : q.isAvailable === 'true',
      });
      return reply.send(result);
    },
  );

  app.get(
    '/dishes/:id',
    {
      schema: {
        tags: ['food'],
        summary: 'Get a dish by id',
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              price: { type: 'string' },
              imageUrl: { type: 'string' },
              isAvailable: { type: 'boolean' },
              vendor: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  businessName: { type: 'string' },
                },
              },
              category: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  slug: { type: 'string' },
                },
              },
              rating: {
                type: 'object',
                properties: { average: { type: 'number' }, count: { type: 'integer' } },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = getDishParamsSchema.parse(request).params;
      const dish = await foodService.getDishById(id);
      return reply.send(dish);
    },
  );

  app.post(
    '/dishes',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['food'],
        summary: 'Create a dish on the authenticated vendor profile',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            categoryId: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            imageUrl: { type: 'string' },
            sortOrder: { type: 'integer', default: 0 },
          },
          required: ['categoryId', 'name', 'price'],
        },
        response: { 201: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const vendorId = await requireVendorId(actor.id);
      const data = createDishSchema.parse({ body: request.body }).body;
      const dish = await foodService.createDish(vendorId, data);
      await writeAuditLog({
        actorId: actor.id,
        action: 'dish.create',
        entity: 'dish',
        entityId: dish.id,
        details: { name: data.name, price: data.price, categoryId: data.categoryId },
        ipAddress: request.ip,
      });
      return reply.code(201).send(dish);
    },
  );

  app.patch(
    '/dishes/:id',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['food'],
        summary: 'Update an own dish (vendor only)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            categoryId: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            imageUrl: { type: 'string' },
            sortOrder: { type: 'integer' },
          },
        },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const vendorId = await requireVendorId(actor.id);
      const parsed = updateDishSchema.parse(request);
      const dish = await foodService.updateDish(parsed.params.id, vendorId, parsed.body);
      await writeAuditLog({
        actorId: actor.id,
        action: 'dish.update',
        entity: 'dish',
        entityId: parsed.params.id,
        details: parsed.body,
        ipAddress: request.ip,
      });
      return reply.send(dish);
    },
  );

  app.delete(
    '/dishes/:id',
    {
      preHandler: [authenticate, authorize('VENDOR', 'SUPER_ADMIN')],
      schema: {
        tags: ['food'],
        summary: 'Delete a dish (own vendor or super admin)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        response: { 204: { type: 'null' } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { id } = getDishParamsSchema.parse(request).params;

      if (actor.role === 'VENDOR') {
        const vendorId = await requireVendorId(actor.id);
        const dish = await prisma.dish.findUnique({ where: { id } });
        if (!dish) throw AppError.notFound('Dish not found');
        if (dish.vendorId !== vendorId) {
          throw AppError.forbidden('You can only delete your own dishes');
        }
        await foodService.deleteDish(id);
      } else {
        await foodService.deleteDish(id);
      }

      await writeAuditLog({
        actorId: actor.id,
        action: 'dish.delete',
        entity: 'dish',
        entityId: id,
        ipAddress: request.ip,
      });
      return reply.code(204).send();
    },
  );

  app.patch(
    '/dishes/:id/availability',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['food'],
        summary: 'Toggle availability or set an availability window (vendor only)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: {
          type: 'object',
          properties: {
            isAvailable: { type: 'boolean' },
            availableFrom: { type: 'string', format: 'date-time' },
            availableTo: { type: 'string', format: 'date-time' },
          },
          required: ['isAvailable'],
        },
        response: { 200: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const vendorId = await requireVendorId(actor.id);
      const parsed = updateAvailabilitySchema.parse(request);
      const dish = await foodService.updateAvailability(parsed.params.id, vendorId, parsed.body);
      await writeAuditLog({
        actorId: actor.id,
        action: 'dish.availability',
        entity: 'dish',
        entityId: parsed.params.id,
        details: parsed.body,
        ipAddress: request.ip,
      });
      return reply.send(dish);
    },
  );
}
