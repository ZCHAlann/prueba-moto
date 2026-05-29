import 'dotenv/config';
import { db } from '../src/db/client';
import { platformUsers } from '../src/db/schema';
import { hashPassword } from '../src/services/auth.service';

async function seed() {
  try {
    console.log('🌱 Seeding database...');

    // Hash password
    const passwordHash = await hashPassword('AdminPrueba123!');

    // Crear superadmin
    const result = await db.insert(platformUsers).values({
      email: 'admin@gmail.com',
      username: 'admin',
      passwordHash,
      role: 'superadmin',
      status: 'active',
    });

    console.log('✓ Superadmin creado:');
    console.log('  Email: admin@gmail.com');
    console.log('  Password: AdminPrueba123!');
    console.log('  Role: superadmin');
    console.log('\n✓ Database seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seed();