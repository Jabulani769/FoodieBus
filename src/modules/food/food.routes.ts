import type { FastifyInstance, FastifyRequest } from 'fastify';
import { foodService } from './food.service.js';
import {
  categoryParamsSchema,
  createCategorySchema,
  createDishSchema,
  createOptionGroupSchema,
  createOptionSchema,
  findOrCreateCategorySchema,
  getDishParamsSchema,
  getVendorParamsSchema,
  listCategoriesSchema,
  listDishesSchema,
  listVendorsSchema,
  optionGroupParamsSchema,
  optionParamsSchema,
  pauseVendorSchema,
  reorderCategoriesSchema,
  updateAvailabilitySchema,
  updateCategorySchema,
  updateDishSchema,
  updateOptionGroupSchema,
  updateOptionSchema,
  updateVendorProfileSchema,
  upsertHoursSchema,
} from './food.schema.js';
import { authenticate, authenticateOptional, authorize } from '../../shared/middleware/index.js';
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
  const canViewInactive = (req: FastifyRequest): boolean =>
    ['ADMIN', 'SUPER_ADMIN', 'FINANCIAL'].includes(req.user?.role ?? '');

  // ---- Categories ----

  app.get(
    '/categories',
    {
      schema: {
        tags: ['food'],
        summary: 'List food categories (searchable, active filter)',
        querystring: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            includeInactive: { type: 'string', enum: ['true', 'false'] },
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
      preHandler: [authenticateOptional],
    },
    async (request, reply) => {
      const parsed = listCategoriesSchema.parse({ querystring: request.query ?? {} }).querystring;
      const result = await foodService.listCategories({
        search: parsed.search,
        includeInactive:
          parsed.includeInactive === 'true' ? true : canViewInactive(request as FastifyRequest),
      });
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
          required: ['name'],
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

  app.post(
    '/categories/find-or-create',
    {
      preHandler: [authenticate, authorize('VENDOR', 'ADMIN', 'SUPER_ADMIN')],
      schema: {
        tags: ['food'],
        summary: 'Find or create a category by name (vendor custom creation)',
        security: [{ bearerAuth: [] }],
        body: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { name } = findOrCreateCategorySchema.parse({ body: request.body }).body;
      const result = await foodService.findOrCreateCategory(name);
      await writeAuditLog({
        actorId: actor.id,
        action: 'category.find_or_create',
        entity: 'food_category',
        entityId: result.id,
        details: { name, created: result.created },
        ipAddress: request.ip,
      });
      return reply.code(result.created ? 201 : 200).send(result);
    },
  );

  app.patch(
    '/categories/reorder',
    {
      preHandler: [authenticate, authorize('SUPER_ADMIN', 'ADMIN')],
      schema: {
        tags: ['food'],
        summary: 'Bulk reorder categories (drag-and-drop)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: { id: { type: 'string' }, sortOrder: { type: 'integer' } },
                required: ['id', 'sortOrder'],
              },
            },
          },
          required: ['items'],
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { items } = reorderCategoriesSchema.parse({ body: request.body }).body;
      const result = await foodService.reorderCategories(items);
      await writeAuditLog({
        actorId: actor.id,
        action: 'category.reorder',
        entity: 'food_category',
        details: { count: items.length },
        ipAddress: request.ip,
      });
      return reply.send(result);
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
        summary: 'List vendors (category + geo + open filters)',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            categoryId: { type: 'string' },
            categorySlug: { type: 'string' },
            lat: { type: 'number' },
            lng: { type: 'number' },
            radiusKm: { type: 'number' },
            onlyOpen: { type: 'string', enum: ['true', 'false'] },
          },
        },
      },
      preHandler: [authenticateOptional],
    },
    async (request, reply) => {
      const q = listVendorsSchema.parse({ querystring: request.query }).querystring;
      const result = await foodService.listVendors(q.page, q.limit, {
        includeInactive: canViewInactive(request),
        categoryId: q.categoryId,
        categorySlug: q.categorySlug,
        lat: q.lat,
        lng: q.lng,
        radiusKm: q.radiusKm,
        onlyOpen: q.onlyOpen === 'true',
      });
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
      },
      preHandler: [authenticateOptional],
    },
    async (request, reply) => {
      const { id } = getVendorParamsSchema.parse(request).params;
      const vendor = await foodService.getVendorById(id, {
        includeInactive: canViewInactive(request),
      });
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
        summary: 'Update the authenticated vendor profile (pin + radius)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            businessName: { type: 'string' },
            description: { type: 'string' },
            phone: { type: 'string' },
            logoUrl: { type: 'string' },
            bannerUrl: { type: 'string' },
            cuisineType: { type: 'string' },
            deliveryTime: { type: 'integer' },
            deliveryRadiusKm: { type: 'number' },
            address: { type: 'string' },
            city: { type: 'string' },
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
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

  app.patch(
    '/vendors/me/pause',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['food'],
        summary: 'Emergency pause switch (Busy - Not Accepting Orders)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: { isPaused: { type: 'boolean' } },
          required: ['isPaused'],
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { isPaused } = pauseVendorSchema.parse({ body: request.body }).body;
      const result = await foodService.setVendorPaused(actor.id, isPaused);
      await writeAuditLog({
        actorId: actor.id,
        action: 'vendor.pause',
        entity: 'vendor_profile',
        entityId: result.id,
        details: { isPaused },
        ipAddress: request.ip,
      });
      return reply.send(result);
    },
  );

  app.put(
    '/vendors/me/hours',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['food'],
        summary: 'Upsert weekly operating schedule',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            hours: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  dayOfWeek: { type: 'integer', minimum: 0, maximum: 6 },
                  openTime: { type: 'string' },
                  closeTime: { type: 'string' },
                  isClosed: { type: 'boolean' },
                },
                required: ['dayOfWeek', 'openTime', 'closeTime'],
              },
            },
          },
          required: ['hours'],
        },
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const { hours } = upsertHoursSchema.parse({ body: request.body }).body;
      const result = await foodService.upsertHours(actor.id, hours);
      await writeAuditLog({
        actorId: actor.id,
        action: 'vendor.hours',
        entity: 'vendor_profile',
        entityId: result.id,
        details: { count: hours.length },
        ipAddress: request.ip,
      });
      return reply.send(result);
    },
  );

  app.get(
    '/vendors/me/hours',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['food'],
        summary: 'Get own operating hours',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply) => {
      const user = requireUser(request);
      const vendorId = await requireVendorId(user.id);
      return reply.send({ items: await foodService.getHours(vendorId) });
    },
  );

  app.get(
    '/vendors/:id/hours',
    {
      schema: {
        tags: ['food'],
        summary: 'Get vendor operating hours',
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const { id } = getVendorParamsSchema.parse(request).params;
      return reply.send({ items: await foodService.getHours(id) });
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
    '/vendors/:vendorId/menu-grouped',
    {
      schema: {
        tags: ['food'],
        summary: 'In-store grouped menu view (category headers in sort order)',
        params: { type: 'object', properties: { vendorId: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const params = request.params as { vendorId: string };
      return reply.send(await foodService.getVendorMenuGrouped(params.vendorId));
    },
  );

  app.get(
    '/dishes/:id',
    {
      schema: {
        tags: ['food'],
        summary: 'Get a dish by id (with customizations + badge)',
        params: { type: 'object', properties: { id: { type: 'string' } } },
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

  // ---- Dish customizations (option groups / options) ----

  app.post(
    '/dishes/:id/option-groups',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['food'],
        summary: 'Create required/optional customization group (radio/checkbox)',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const vendorId = await requireVendorId(actor.id);
      const parsed = createOptionGroupSchema.parse(request);
      // Fastify merges :id into params; zod expects {id}
      const dishId = (request.params as { id: string }).id;
      const group = await foodService.createOptionGroup(dishId, vendorId, parsed.body);
      await writeAuditLog({
        actorId: actor.id,
        action: 'dish.option_group.create',
        entity: 'dish_option_group',
        entityId: group.id,
        details: { dishId, ...parsed.body },
        ipAddress: request.ip,
      });
      return reply.code(201).send(group);
    },
  );

  app.patch(
    '/dishes/:dishId/option-groups/:groupId',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: { tags: ['food'], summary: 'Update option group', security: [{ bearerAuth: [] }] },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const vendorId = await requireVendorId(actor.id);
      const parsed = updateOptionGroupSchema.parse(request);
      return reply.send(
        await foodService.updateOptionGroup(
          parsed.params.dishId,
          parsed.params.groupId,
          vendorId,
          parsed.body,
        ),
      );
    },
  );

  app.delete(
    '/dishes/:dishId/option-groups/:groupId',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: { tags: ['food'], summary: 'Delete option group', security: [{ bearerAuth: [] }] },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const vendorId = await requireVendorId(actor.id);
      const parsed = optionGroupParamsSchema.parse(request);
      await foodService.deleteOptionGroup(parsed.params.dishId, parsed.params.groupId, vendorId);
      return reply.code(204).send();
    },
  );

  app.post(
    '/dishes/:dishId/option-groups/:groupId/options',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: {
        tags: ['food'],
        summary: 'Add option (label + priceDelta)',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const vendorId = await requireVendorId(actor.id);
      const parsed = createOptionSchema.parse(request);
      const option = await foodService.createOption(
        parsed.params.dishId,
        parsed.params.groupId,
        vendorId,
        parsed.body,
      );
      await writeAuditLog({
        actorId: actor.id,
        action: 'dish.option.create',
        entity: 'dish_option',
        entityId: option.id,
        details: { dishId: parsed.params.dishId, ...parsed.body },
        ipAddress: request.ip,
      });
      return reply.code(201).send(option);
    },
  );

  app.patch(
    '/dishes/:dishId/option-groups/:groupId/options/:optionId',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: { tags: ['food'], summary: 'Update option', security: [{ bearerAuth: [] }] },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const vendorId = await requireVendorId(actor.id);
      const parsed = updateOptionSchema.parse(request);
      return reply.send(
        await foodService.updateOption(
          parsed.params.dishId,
          parsed.params.groupId,
          parsed.params.optionId,
          vendorId,
          parsed.body,
        ),
      );
    },
  );

  app.delete(
    '/dishes/:dishId/option-groups/:groupId/options/:optionId',
    {
      preHandler: [authenticate, authorize('VENDOR')],
      schema: { tags: ['food'], summary: 'Delete option', security: [{ bearerAuth: [] }] },
    },
    async (request: FastifyRequest, reply) => {
      const actor = requireUser(request);
      const vendorId = await requireVendorId(actor.id);
      const parsed = optionParamsSchema.parse(request);
      await foodService.deleteOption(
        parsed.params.dishId,
        parsed.params.groupId,
        parsed.params.optionId,
        vendorId,
      );
      return reply.code(204).send();
    },
  );
}
