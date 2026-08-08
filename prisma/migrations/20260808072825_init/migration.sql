-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "public"."Sentiment" AS ENUM ('POS', 'NEU', 'NEG');

-- CreateEnum
CREATE TYPE "public"."FeedbackStatus" AS ENUM ('NEW', 'REVIEWED', 'ACTIONED');

-- CreateTable
CREATE TABLE "public"."Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'VIEWER',
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Feedback" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "customerLabel" TEXT,
    "sourceRef" TEXT,
    "sentiment" "public"."Sentiment" NOT NULL DEFAULT 'NEU',
    "sentimentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "featureArea" TEXT,
    "rationale" TEXT,
    "status" "public"."FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Theme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeedbackTheme" (
    "feedbackId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "FeedbackTheme_pkey" PRIMARY KEY ("feedbackId","themeId")
);

-- CreateTable
CREATE TABLE "public"."Embedding" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "vector" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Report" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "contentJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_workspaceId_idx" ON "public"."User"("workspaceId");

-- CreateIndex
CREATE INDEX "Feedback_workspaceId_createdAt_idx" ON "public"."Feedback"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_workspaceId_sentiment_idx" ON "public"."Feedback"("workspaceId", "sentiment");

-- CreateIndex
CREATE INDEX "Feedback_workspaceId_status_idx" ON "public"."Feedback"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Theme_workspaceId_idx" ON "public"."Theme"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Theme_workspaceId_name_key" ON "public"."Theme"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Embedding_feedbackId_key" ON "public"."Embedding"("feedbackId");

-- CreateIndex
CREATE INDEX "Report_workspaceId_createdAt_idx" ON "public"."Report"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Feedback" ADD CONSTRAINT "Feedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Theme" ADD CONSTRAINT "Theme_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedbackTheme" ADD CONSTRAINT "FeedbackTheme_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "public"."Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedbackTheme" ADD CONSTRAINT "FeedbackTheme_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "public"."Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Embedding" ADD CONSTRAINT "Embedding_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "public"."Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
