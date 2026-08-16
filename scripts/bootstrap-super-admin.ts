import 'dotenv/config';
import { createUser } from '../src/modules/auth/auth.service.js';
import { prisma } from '../src/shared/db/prisma.js';

async function bootstrapSuperAdmin(): Promise<void> {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const phone = process.env.SUPER_ADMIN_PHONE;
  const fullName = process.env.SUPER_ADMIN_NAME ?? 'Super Admin';

  if (!email || !password || !phone) {
    console.error(
      'Missing bootstrap env vars. Set SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_PHONE.',
    );
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.log(`Super admin already exists (${email}). Skipping.`);
    return;
  }

  await createUser(
    {
      email,
      phone,
      password,
      fullName,
      role: 'SUPER_ADMIN',
    },
    'SUPER_ADMIN',
  );
  console.log(`Super admin created: ${email}`);
}

bootstrapSuperAdmin().finally(() => prisma.$disconnect());
