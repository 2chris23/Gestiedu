import { ActionType } from '../utils/prisma-enums';
import { platformPrisma } from '../config/database';
import { PrismaClient } from '@prisma/client';

export class InstitutesService {
  /**
   * Obtener instituto por ID (desde platform DB)
   */
  async getInstitute(instituteId: string) {
    return platformPrisma.institute.findUnique({
      where: { id: instituteId }
    });
  }

  /**
   * Obtener configuración del instituto
   */
  async getInstituteConfig(instituteId: string) {
    return this.getInstitute(instituteId);
  }

  /**
   * Actualizar configuración del instituto
   * @param prisma - Tenant Prisma client para audit logs
   */
  async updateInstituteConfig(
    instituteId: string,
    updateData: any,
    userId: string,
    prisma: PrismaClient
  ) {
    // Actualizar en platform DB
    const updated = await platformPrisma.institute.update({
      where: { id: instituteId },
      data: {
        ...updateData
      }
    });

    // Audit log en tenant DB
    await prisma.auditLog.create({
      data: {
        action: ActionType.UPDATE,
        entity: 'INSTITUTE',
        entityType: 'INSTITUTE',
        entityId: updated.id,
        metadata: { updateData: updateData as any },
        userId
      }
    });

    return updated;
  }

  /**
   * Subir logo del instituto
   * @param prisma - Tenant Prisma client para audit logs
   */
  async uploadLogo(
    instituteId: string,
    logoUrl: string,
    userId: string,
    prisma: PrismaClient
  ) {
    // Actualizar en platform DB
    const updated = await platformPrisma.institute.update({
      where: { id: instituteId },
      data: { logo: logoUrl }
    });

    // Audit log en tenant DB
    await prisma.auditLog.create({
      data: {
        action: ActionType.UPDATE,
        entity: 'INSTITUTE',
        entityType: 'INSTITUTE',
        entityId: updated.id,
        metadata: { logoUrl },
        userId
      }
    });

    return updated.logo;
  }

  /**
   * Subir favicon del instituto
   * @param prisma - Tenant Prisma client para audit logs
   */
  async uploadFavicon(
    instituteId: string,
    faviconUrl: string,
    userId: string,
    prisma: PrismaClient
  ) {
    // Actualizar en platform DB
    const updated = await platformPrisma.institute.update({
      where: { id: instituteId },
      data: { favicon: faviconUrl }
    });

    // Audit log en tenant DB
    await prisma.auditLog.create({
      data: {
        action: ActionType.UPDATE,
        entity: 'INSTITUTE',
        entityType: 'INSTITUTE',
        entityId: updated.id,
        metadata: { faviconUrl },
        userId
      }
    });

    return updated.favicon;
  }

  /**
   * Actualizar colores del instituto
   * @param prisma - Tenant Prisma client para audit logs
   */
  async updateColors(
    instituteId: string,
    primaryColor: string,
    secondaryColor: string,
    userId: string,
    prisma: PrismaClient
  ) {
    // Actualizar en platform DB
    const updated = await platformPrisma.institute.update({
      where: { id: instituteId },
      data: {
        primaryColor,
        secondaryColor
      }
    });

    // Audit log en tenant DB
    await prisma.auditLog.create({
      data: {
        action: ActionType.UPDATE,
        entity: 'INSTITUTE',
        entityType: 'INSTITUTE',
        entityId: updated.id,
        metadata: { primaryColor, secondaryColor },
        userId
      }
    });

    return { primaryColor: updated.primaryColor, secondaryColor: updated.secondaryColor };
  }

  /**
   * Obtener paleta de colores de materias
   */
  async getSubjectPalette(instituteId: string) {
    const institute = await this.getInstitute(instituteId);
    if (!institute?.subjectPalette) {
      return [];
    }
    return JSON.parse(institute.subjectPalette);
  }

  /**
   * Agregar color a la paleta
   * @param prisma - Tenant Prisma client para audit logs
   */
  async addColorToPalette(
    instituteId: string,
    color: string,
    userId: string,
    prisma: PrismaClient
  ) {
    const currentPalette = await this.getSubjectPalette(instituteId);
    const newPalette = [...currentPalette, color];

    // Actualizar en platform DB
    const updated = await platformPrisma.institute.update({
      where: { id: instituteId },
      data: { subjectPalette: JSON.stringify(newPalette) }
    });

    // Audit log en tenant DB
    await prisma.auditLog.create({
      data: {
        action: ActionType.UPDATE,
        entity: 'INSTITUTE',
        entityType: 'INSTITUTE',
        entityId: updated.id,
        metadata: { action: 'add_color', color },
        userId
      }
    });

    return newPalette;
  }

  /**
   * Eliminar color de la paleta
   * @param prisma - Tenant Prisma client para audit logs
   */
  async removeColorFromPalette(
    instituteId: string,
    index: number,
    userId: string,
    prisma: PrismaClient
  ) {
    const currentPalette = await this.getSubjectPalette(instituteId);
    const newPalette = currentPalette.filter((_: any, i: number) => i !== index);

    // Actualizar en platform DB
    const updated = await platformPrisma.institute.update({
      where: { id: instituteId },
      data: { subjectPalette: JSON.stringify(newPalette) }
    });

    // Audit log en tenant DB
    await prisma.auditLog.create({
      data: {
        action: ActionType.UPDATE,
        entity: 'INSTITUTE',
        entityType: 'INSTITUTE',
        entityId: updated.id,
        metadata: { action: 'remove_color', index },
        userId
      }
    });

    return newPalette;
  }

  /**
   * Actualizar color en la paleta
   * @param prisma - Tenant Prisma client para audit logs
   */
  async updateColorInPalette(
    instituteId: string,
    index: number,
    color: string,
    userId: string,
    prisma: PrismaClient
  ) {
    const currentPalette = await this.getSubjectPalette(instituteId);
    const newPalette = [...currentPalette];
    newPalette[index] = color;

    // Actualizar en platform DB
    const updated = await platformPrisma.institute.update({
      where: { id: instituteId },
      data: { subjectPalette: JSON.stringify(newPalette) }
    });

    // Audit log en tenant DB
    await prisma.auditLog.create({
      data: {
        action: ActionType.UPDATE,
        entity: 'INSTITUTE',
        entityType: 'INSTITUTE',
        entityId: updated.id,
        metadata: { action: 'update_color', index, color },
        userId
      }
    });

    return newPalette;
  }
}
