-- CreateEnum
CREATE TYPE "RunMode" AS ENUM ('SIMULATION', 'REAL');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "RunStage" AS ENUM ('DISCOVERY', 'PRODUCTION', 'REPORT', 'DONE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'WAITING_CONFIG', 'WAITING_AUTH', 'SKIPPED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PresenceStatus" AS ENUM ('PENDING', 'FUNCTIONAL', 'PROBLEMS', 'NOT_FOUND', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "CrmStatus" AS ENUM ('NOVO_LEAD', 'ANALISADO', 'DEMO_GERADA', 'DEMO_PUBLICADA', 'CONTATO_PREPARADO', 'CONTATO_REALIZADO', 'RESPONDEU', 'INTERESSADO', 'NEGOCIACAO', 'CLIENTE', 'SEM_INTERESSE', 'NAO_CONTATAR');

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('GENERATING', 'GENERATED', 'VALIDATED', 'INVALID', 'PUBLISHING', 'PUBLISHED', 'PUBLISH_FAILED', 'SIMULATED', 'UNPUBLISHED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WHATSAPP', 'EMAIL', 'MANUAL');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('DRAFT', 'BLOCKED', 'WAITING_CONFIG', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'NEEDS_VERIFICATION', 'SIMULATED', 'CANCELED');

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "RunMode" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "stage" "RunStage" NOT NULL DEFAULT 'DISCOVERY',
    "config" JSONB NOT NULL,
    "estimate" JSONB,
    "report" JSONB,
    "notice" TEXT,
    "budgetExceeded" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "companyId" TEXT,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "attribution" TEXT,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "category" TEXT,
    "niche" TEXT,
    "address" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "phoneIsMobile" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "website" TEXT,
    "businessStatus" TEXT,
    "openingHours" JSONB,
    "ratingCount" INTEGER,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataExpiresAt" TIMESTAMP(3),
    "verificationStatus" TEXT NOT NULL DEFAULT 'NAO_VERIFICADO',
    "presenceStatus" "PresenceStatus" NOT NULL DEFAULT 'PENDING',
    "presenceDetails" JSONB,
    "score" INTEGER,
    "scoreReasons" JSONB,
    "crmStatus" "CrmStatus" NOT NULL DEFAULT 'NOVO_LEAD',
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "nextAction" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunCompany" (
    "runId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunCompany_pkey" PRIMARY KEY ("runId","companyId")
);

-- CreateTable
CREATE TABLE "DemoSite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "SiteStatus" NOT NULL DEFAULT 'GENERATING',
    "template" TEXT,
    "content" JSONB,
    "contentSource" TEXT,
    "html" TEXT,
    "validation" JSONB,
    "publisher" TEXT,
    "publicUrl" TEXT,
    "providerRef" TEXT,
    "error" TEXT,
    "publishedAt" TIMESTAMP(3),
    "unpublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "runId" TEXT,
    "channel" "Channel" NOT NULL,
    "recipient" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "bodySource" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'DRAFT',
    "blockReason" TEXT,
    "alternative" TEXT,
    "consentBasis" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "contact" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "valueHash" TEXT NOT NULL,
    "label" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEntry" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "units" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceKnown" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "details" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthThrottle" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Job_idempotencyKey_key" ON "Job"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_runId_status_idx" ON "Job"("runId", "status");

-- CreateIndex
CREATE INDEX "Company_phoneNormalized_idx" ON "Company"("phoneNormalized");

-- CreateIndex
CREATE INDEX "Company_normalizedName_city_idx" ON "Company"("normalizedName", "city");

-- CreateIndex
CREATE INDEX "Company_crmStatus_idx" ON "Company"("crmStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Company_source_sourceId_key" ON "Company"("source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoSite_companyId_key" ON "DemoSite"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoSite_slug_key" ON "DemoSite"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Message_idempotencyKey_key" ON "Message"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Message_providerMessageId_key" ON "Message"("providerMessageId");

-- CreateIndex
CREATE INDEX "Message_channel_status_sentAt_idx" ON "Message"("channel", "status", "sentAt");

-- CreateIndex
CREATE INDEX "ContactEvent_companyId_createdAt_idx" ON "ContactEvent"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Consent_channel_contact_key" ON "Consent"("channel", "contact");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_valueHash_key" ON "Suppression"("valueHash");

-- CreateIndex
CREATE INDEX "CostEntry_createdAt_idx" ON "CostEntry"("createdAt");

-- CreateIndex
CREATE INDEX "CostEntry_runId_idx" ON "CostEntry"("runId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunCompany" ADD CONSTRAINT "RunCompany_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunCompany" ADD CONSTRAINT "RunCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoSite" ADD CONSTRAINT "DemoSite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactEvent" ADD CONSTRAINT "ContactEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;
