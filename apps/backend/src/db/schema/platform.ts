import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  unique,
  bigint,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core';

// Empresas
export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 160 }).notNull(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  planId: varchar('plan_id', { length: 40 }).notNull().default('free'),
  status: varchar('status', { length: 40 }).notNull().default('active'),
  enabledModules: text('enabled_modules').array().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Usuarios de plataforma
export const platformUsers = pgTable('platform_users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 160 }).notNull().unique(),
  username: varchar('username', { length: 80 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 40 }).notNull(),
  status: varchar('status', { length: 40 }).notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Usuarios de empresa
export const companyUsers = pgTable(
  'company_users',
  {
    id: serial('id').primaryKey(),
    companyId: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 160 }).notNull(),
    username: varchar('username', { length: 80 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: varchar('role', { length: 40 }).notNull(),
    status: varchar('status', { length: 40 }).notNull().default('active'),
    profileData: jsonb('profile_data').notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('company_users_company_id_email').on(table.companyId, table.email),
    unique('company_users_company_id_username').on(table.companyId, table.username),
  ]
);