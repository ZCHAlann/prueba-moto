CREATE TYPE "public"."asset_availability_enum" AS ENUM('Disponible', 'En ruta', 'No disponible');--> statement-breakpoint
CREATE TYPE "public"."asset_category_enum" AS ENUM('Camion', 'Camioneta', 'SUV', 'Furgon', 'Furgoneta', 'Bus', 'Volqueta');--> statement-breakpoint
CREATE TYPE "public"."asset_fuel_type_enum" AS ENUM('Diesel', 'Gasolina', 'Electrico', 'Hibrido');--> statement-breakpoint
CREATE TYPE "public"."asset_status_enum" AS ENUM('Operativo', 'En mantenimiento', 'Fuera de servicio');--> statement-breakpoint
CREATE TYPE "public"."asset_type_enum" AS ENUM('Vehiculo', 'Motor', 'Maquinaria', 'Planta electrica');--> statement-breakpoint
ALTER TABLE "company_assets" ALTER COLUMN "asset_type" SET DATA TYPE "public"."asset_type_enum" USING "asset_type"::"public"."asset_type_enum";--> statement-breakpoint
ALTER TABLE "company_assets" ALTER COLUMN "category" SET DATA TYPE "public"."asset_category_enum" USING "category"::"public"."asset_category_enum";--> statement-breakpoint
ALTER TABLE "company_assets" ALTER COLUMN "status" SET DEFAULT 'Operativo'::"public"."asset_status_enum";--> statement-breakpoint
ALTER TABLE "company_assets" ALTER COLUMN "status" SET DATA TYPE "public"."asset_status_enum" USING "status"::"public"."asset_status_enum";--> statement-breakpoint
ALTER TABLE "company_assets" ALTER COLUMN "fuel_type" SET DATA TYPE "public"."asset_fuel_type_enum" USING "fuel_type"::"public"."asset_fuel_type_enum";--> statement-breakpoint
ALTER TABLE "company_assets" ALTER COLUMN "availability" SET DATA TYPE "public"."asset_availability_enum" USING "availability"::"public"."asset_availability_enum";