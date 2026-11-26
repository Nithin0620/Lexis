-- CreateTable
CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "speakerId" TEXT,
    "model" TEXT,
    "latencyMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentEvent_callId_eventType_createdAt_idx" ON "AgentEvent"("callId", "eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
