-- AlterTable
ALTER TABLE `Alert`
    ADD COLUMN `alertType` VARCHAR(50) NOT NULL DEFAULT 'low_score';

-- AlterTable
ALTER TABLE `Event`
    MODIFY `type` ENUM(
        'FACE_DETECTED',
        'FACE_LOST',
        'TAB_BLUR',
        'TAB_FOCUS',
        'IDLE_START',
        'IDLE_END',
        'EMOTION_SAMPLE',
        'HEAD_POSE_SAMPLE',
        'MOUSE_BEHAVIOR',
        'KEYBOARD_BEHAVIOR'
    ) NOT NULL;

-- CreateTable
CREATE TABLE `EmotionSample` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `sessionId` CHAR(36) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dominant` VARCHAR(20) NOT NULL,
    `happyScore` DECIMAL(4, 3) NOT NULL,
    `sadScore` DECIMAL(4, 3) NOT NULL,
    `angryScore` DECIMAL(4, 3) NOT NULL,
    `fearfulScore` DECIMAL(4, 3) NOT NULL,
    `disgustedScore` DECIMAL(4, 3) NOT NULL,
    `surprisedScore` DECIMAL(4, 3) NOT NULL,
    `neutralScore` DECIMAL(4, 3) NOT NULL,
    `stressScore` INTEGER NOT NULL,
    `engagementScore` INTEGER NOT NULL,
    `boredomScore` INTEGER NOT NULL,

    INDEX `EmotionSample_sessionId_timestamp_idx`(`sessionId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HeadPoseSample` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `sessionId` CHAR(36) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `yaw` DECIMAL(5, 3) NOT NULL,
    `pitch` DECIMAL(5, 3) NOT NULL,
    `roll` DECIMAL(5, 3) NOT NULL,
    `lookingAway` BOOLEAN NOT NULL DEFAULT false,

    INDEX `HeadPoseSample_sessionId_timestamp_idx`(`sessionId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BehaviorSample` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `sessionId` CHAR(36) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `avgVelocityPx` INTEGER NOT NULL,
    `clicksPerMin` INTEGER NOT NULL,
    `erraticScore` DECIMAL(5, 3) NOT NULL,
    `kpm` INTEGER NOT NULL,
    `rhythmScore` DECIMAL(4, 3) NOT NULL,
    `backspaceRate` DECIMAL(4, 3) NOT NULL,
    `burstDetected` BOOLEAN NOT NULL DEFAULT false,
    `idleSeconds` INTEGER NOT NULL DEFAULT 0,

    INDEX `BehaviorSample_sessionId_timestamp_idx`(`sessionId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyEmotionStat` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `avgStress` DECIMAL(5, 2) NOT NULL,
    `avgEngagement` DECIMAL(5, 2) NOT NULL,
    `avgBoredom` DECIMAL(5, 2) NOT NULL,
    `dominantEmotion` VARCHAR(20) NOT NULL,
    `avgHeadAwayPct` DECIMAL(5, 2) NOT NULL,
    `avgTypingRhythm` DECIMAL(4, 3) NOT NULL,
    `avgErratic` DECIMAL(5, 3) NOT NULL,

    INDEX `DailyEmotionStat_date_idx`(`date`),
    UNIQUE INDEX `DailyEmotionStat_userId_date_key`(`userId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Alert_userId_resolved_alertType_idx` ON `Alert`(`userId`, `resolved`, `alertType`);

-- AddForeignKey
ALTER TABLE `EmotionSample`
    ADD CONSTRAINT `EmotionSample_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HeadPoseSample`
    ADD CONSTRAINT `HeadPoseSample_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BehaviorSample`
    ADD CONSTRAINT `BehaviorSample_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyEmotionStat`
    ADD CONSTRAINT `DailyEmotionStat_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
