import { UserRole, Gender } from '../utils/prisma-enums';
import { hashPassword } from '../utils/bcrypt';
import { PAGINATION } from '../utils/constants';
import { PrismaClient, Prisma } from '@prisma/client';
import { invalidateUserCache } from '../utils/cache-invalidation';

export interface CreateUserData {
  id: string; // Cédula
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  birthDate?: Date;
  address?: string;
  gender?: Gender;
  role: UserRole;
  avatar?: string;
}

export interface UpdateUserData {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  birthDate?: Date;
  address?: string;
  gender?: Gender;
  avatar?: string;
  isActive?: boolean;
}

export interface GetUsersQuery {
  page?: number;
  limit?: number;
  role?: UserRole;
  search?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export class UsersService {

  /**
   * Crear nuevo usuario - simplificado para un solo instituto
   */
  async createUser(userData: CreateUserData, prisma: PrismaClient | Prisma.TransactionClient) {
    const hashedPassword = await hashPassword(userData.password);

    return prisma.user.create({
      data: {
        ...userData as any,
        password: hashedPassword,
        email: userData.email.toLowerCase()
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        address: true,
        birthDate: true,
        gender: true,
        avatar: true,
        isActive: true,
        createdAt: true
      }
    });
  }

  /**
   * Obtener usuario por ID
   */
  async getUserById(id: string, prisma: PrismaClient | Prisma.TransactionClient) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        address: true,
        birthDate: true,
        gender: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        teacherClassrooms: {
          select: {
            isMainTeacher: true,
            classroom: {
              select: {
                id: true,
                name: true,
                slug: true,
                grade: true,
                section: true,
                academicYear: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        },
        studentClassrooms: {
          select: {
            isActive: true,
            classroomId: true,
            academicYearId: true,
            classroom: {
              select: {
                id: true,
                name: true,
                slug: true,
                grade: true,
                section: true,
                academicYear: {
                  select: {
                    id: true,
                    name: true,
                    status: true,
                    periods: {
                      select: {
                        id: true,
                        name: true
                      },
                      orderBy: { startDate: 'asc' }
                    }
                  }
                }
              }
            },
            academicYear: {
              select: {
                id: true,
                name: true,
                status: true,
                periods: {
                  select: {
                    id: true,
                    name: true
                  },
                  orderBy: { startDate: 'asc' }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
  }

  /**
   * Obtener usuario por email
   */
  async getUserByEmail(email: string, prisma: PrismaClient | Prisma.TransactionClient) {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        password: true,
        isActive: true
      }
    });
  }

  /**
   * Obtener lista de usuarios con filtros
   */
  async getUsers(query: GetUsersQuery, prisma: PrismaClient | Prisma.TransactionClient) {
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT,
      role,
      search,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = query;

    const offset = (page - 1) * limit;

    // Construir filtros
    const where: any = {};

    if (role && (role as string) !== 'ALL') {
      where.role = role;
    }

    if (typeof isActive === 'boolean') {
      where.isActive = isActive;
    }

    if (search && search.trim()) {
      const terms = search.trim().split(/\s+/).filter(Boolean);
      if (terms.length === 1) {
        where.OR = [
          { firstName: { contains: terms[0], mode: 'insensitive' } },
          { lastName: { contains: terms[0], mode: 'insensitive' } },
          { email: { contains: terms[0], mode: 'insensitive' } },
          { studentCode: { contains: terms[0], mode: 'insensitive' } },
          { id: { contains: terms[0], mode: 'insensitive' } }
        ];
      } else if (terms.length > 1) {
        where.AND = terms.map((term: string) => ({
          OR: [
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { studentCode: { contains: term, mode: 'insensitive' } },
            { id: { contains: term, mode: 'insensitive' } }
          ]
        }));
      }
    }

    // Contar total
    const total = await prisma.user.count({ where });

    // Obtener usuarios
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        studentCode: true,
        phone: true,
        address: true,
        birthDate: true,
        gender: true,
        avatar: true,
        isActive: true,
        createdAt: true
      },
      orderBy: {
        [sortBy]: sortOrder
      },
      skip: offset,
      take: limit
    });

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Actualizar usuario
   * @param instituteId - Si se provee, invalida el cache HTTP del usuario
   */
  async updateUser(
    id: string,
    updateData: UpdateUserData,
    prisma: PrismaClient | Prisma.TransactionClient,
    instituteId?: string
  ) {
    const dataToUpdate = { ...updateData };

    if (updateData.email) {
      dataToUpdate.email = updateData.email.toLowerCase();
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        address: true,
        birthDate: true,
        gender: true,
        avatar: true,
        isActive: true,
        updatedAt: true
      }
    });

    // Invalidar cache HTTP si se provee instituteId
    if (instituteId) {
      await invalidateUserCache(instituteId, id);
    }

    return updatedUser;
  }

  /**
   * Eliminar usuario (soft delete)
   * @param instituteId - Si se provee, invalida el cache HTTP del usuario
   */
  async deleteUser(
    id: string,
    prisma: PrismaClient | Prisma.TransactionClient,
    instituteId?: string
  ) {
    const result = await prisma.user.update({
      where: { id },
      data: { isActive: false }
    });

    // Invalidar cache HTTP si se provee instituteId
    if (instituteId) {
      await invalidateUserCache(instituteId, id);
    }

    return result;
  }

  /**
   * Obtener usuarios por rol
   */
  async getUsersByRole(role: UserRole, prisma: PrismaClient | Prisma.TransactionClient) {
    return prisma.user.findMany({
      where: {
        role,
        isActive: true
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true
      },
      orderBy: {
        firstName: 'asc'
      }
    });
  }

  /**
   * Obtener estadísticas de usuarios
   */
  async getUserStats(prisma: PrismaClient | Prisma.TransactionClient) {
    const [total, active, byRole] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.groupBy({
        by: ['role'],
        _count: { role: true }
      })
    ]);

    const roleStats = byRole.reduce((acc: any, item: any) => {
      acc[item.role] = item._count.role;
      return acc;
    }, {});

    return {
      total,
      active,
      inactive: total - active,
      byRole: roleStats
    };
  }
}

export const usersService = new UsersService();
export default usersService;