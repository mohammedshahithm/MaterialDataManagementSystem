-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'worker');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('active', 'closed', 'backup_due', 'backup_overdue', 'backup_confirmed', 'deletion_approved', 'partially_deleted', 'deleted');

-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('microstructure', 'graph', 'source_pdf', 'whatsapp_image', 'generated_report');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('draft', 'in_progress', 'uploads_complete', 'report_generated', 'completed');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('pending', 'confirmed', 'verified');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'worker',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "batch_name" TEXT NOT NULL,
    "description" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "retention_started_at" TIMESTAMP(3),
    "backup_due_at" TIMESTAMP(3),
    "status" "BatchStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "date_folders" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "date_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "date_folder_id" UUID NOT NULL,
    "product_code" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "metadata" JSONB,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'draft',

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_files" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "category" "FileCategory" NOT NULL,
    "slot_index" INTEGER NOT NULL DEFAULT 0,
    "original_filename" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "checksum_sha256" TEXT,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "is_latest" BOOLEAN NOT NULL DEFAULT true,
    "upload_status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "product_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_records" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "confirmed_by" UUID NOT NULL,
    "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disk_identifier" TEXT,
    "destination_path" TEXT,
    "archive_filename" TEXT,
    "archive_checksum" TEXT,
    "notes" TEXT,
    "status" "BackupStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "backup_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "download_logs" (
    "id" UUID NOT NULL,
    "product_id" UUID,
    "batch_id" UUID,
    "downloaded_by" UUID NOT NULL,
    "download_type" TEXT NOT NULL,
    "downloaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filename" TEXT,

    CONSTRAINT "download_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "date_folders_batch_id_work_date_key" ON "date_folders"("batch_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "products_date_folder_id_product_code_key" ON "products"("date_folder_id", "product_code");

-- CreateIndex
CREATE INDEX "product_files_product_id_category_slot_index_idx" ON "product_files"("product_id", "category", "slot_index");

-- CreateIndex
CREATE INDEX "product_files_storage_key_idx" ON "product_files"("storage_key");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_key_key" ON "app_settings"("key");

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_folders" ADD CONSTRAINT "date_folders_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_folders" ADD CONSTRAINT "date_folders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_date_folder_id_fkey" FOREIGN KEY ("date_folder_id") REFERENCES "date_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_files" ADD CONSTRAINT "product_files_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_files" ADD CONSTRAINT "product_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_logs" ADD CONSTRAINT "download_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_logs" ADD CONSTRAINT "download_logs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "download_logs" ADD CONSTRAINT "download_logs_downloaded_by_fkey" FOREIGN KEY ("downloaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
