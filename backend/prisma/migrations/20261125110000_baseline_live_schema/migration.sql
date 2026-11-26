-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "resetPasswordExpires" TIMESTAMP(3),
ADD COLUMN     "resetPasswordToken" TEXT,
ALTER COLUMN "password" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CallParticipant" ADD COLUMN     "aiInteractions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "speakingSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wordsSpoken" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MeetingSummary" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "overview" TEXT NOT NULL,
    "decisions" TEXT[],
    "actionItems" JSONB NOT NULL,
    "participantNotes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSummary_callId_key" ON "MeetingSummary"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "CallParticipant_callId_userId_idx" ON "CallParticipant"("callId", "userId");

-- CreateIndex
CREATE INDEX "TranscriptSegment_transcriptId_sequence_idx" ON "TranscriptSegment"("transcriptId", "sequence");

-- AddForeignKey
ALTER TABLE "MeetingSummary" ADD CONSTRAINT "MeetingSummary_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
