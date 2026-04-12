-- AlterTable
ALTER TABLE `User`
    ADD COLUMN `createdByAdminId` CHAR(36) NULL,
    MODIFY `role` ENUM('ADMIN', 'EMPLOYEE') NOT NULL DEFAULT 'ADMIN';

-- CreateIndex
CREATE INDEX `User_createdByAdminId_role_idx` ON `User`(`createdByAdminId`, `role`);

-- AddForeignKey
ALTER TABLE `User`
    ADD CONSTRAINT `User_createdByAdminId_fkey`
    FOREIGN KEY (`createdByAdminId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
