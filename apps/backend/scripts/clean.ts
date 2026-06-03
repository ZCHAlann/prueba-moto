
import 'dotenv/config';
import postgres from 'postgres';

async function deleteAll() {
  try {
    console.log('🗑️  Eliminando todos los datos...\n');

    const client = postgres(process.env.DATABASE_URL || '');

    // Eliminar en orden inverso de dependencias
    await client`DELETE FROM oil_checks`;
    console.log('✓ oil_checks');

    await client`DELETE FROM company_ac_refrigerant_logs`;
    console.log('✓ company_ac_refrigerant_logs');

    await client`DELETE FROM company_ac_services`;
    console.log('✓ company_ac_services');

    await client`DELETE FROM company_ac_units`;
    console.log('✓ company_ac_units');

    await client`DELETE FROM company_checklists`;
    console.log('✓ company_checklists');

    await client`DELETE FROM company_checklist_categories`;
    console.log('✓ company_checklist_categories');

    await client`DELETE FROM company_inventory`;
    console.log('✓ company_inventory');

    await client`DELETE FROM company_garages`;
    console.log('✓ company_garages');

    await client`DELETE FROM company_alerts`;
    console.log('✓ company_alerts');

    await client`DELETE FROM company_fuel_entries`;
    console.log('✓ company_fuel_entries');

    await client`DELETE FROM company_maintenances`;
    console.log('✓ company_maintenances');

    await client`DELETE FROM company_assignments`;
    console.log('✓ company_assignments');

    await client`DELETE FROM company_drivers`;
    console.log('✓ company_drivers');

    await client`DELETE FROM company_assets`;
    console.log('✓ company_assets');

    await client`DELETE FROM company_sites`;
    console.log('✓ company_sites');

    await client`DELETE FROM company_settings`;
    console.log('✓ company_settings');

    await client`DELETE FROM company_audit_entries`;
    console.log('✓ company_audit_entries');

    await client`DELETE FROM company_users`;
    console.log('✓ company_users');

    await client`DELETE FROM companies`;
    console.log('✓ companies');

    await client`DELETE FROM platform_users`;
    console.log('✓ platform_users');

    console.log('\n✅ Todas las tablas vaciadas');
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteAll();