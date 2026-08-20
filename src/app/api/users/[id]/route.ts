import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import bcrypt from 'bcryptjs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  // Users can only view themselves; admins/managers/spv can view anyone
  if (authUser.role === 'USER' && authUser.userId !== params.id) return forbidden();

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      manager: { select: { id: true, name: true, role: true } },
      office: true,
      workSchedule: true,
    },
  });

  if (!user) return badRequest('User tidak ditemukan.');

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _pw, ...safe } = user;
  return ok(safe);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  // Users can only update themselves (limited fields); admins can update all
  const isSelf = authUser.userId === params.id;
  if (!isSelf && authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const { name, email, phone, address, position, department, role, password, managerId, officeId, workScheduleId, isActive } = body;

    const updateData: Record<string, unknown> = {};

    // Fields everyone can update on themselves
    if (name) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (password) updateData.password = await bcrypt.hash(password, 12);

    // Admin-only fields
    if (authUser.role === 'ADMIN') {
      if (position !== undefined) updateData.position = position;
      if (department !== undefined) updateData.department = department;
      if (role) updateData.role = role;
      if (managerId !== undefined) updateData.managerId = managerId || null;
      if (officeId !== undefined) updateData.officeId = officeId || null;
      if (workScheduleId !== undefined) updateData.workScheduleId = workScheduleId || null;
      if (isActive !== undefined) updateData.isActive = isActive;
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...safe } = updated;
    return ok(safe, 'Data berhasil diperbarui.');
  } catch (error) {
    console.error('[UPDATE USER]', error);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    await prisma.user.update({
      where: { id: params.id },
      data: { isActive: false },
    });
    return ok(null, 'Karyawan berhasil dinonaktifkan.');
  } catch (error) {
    console.error('[DELETE USER]', error);
    return serverError();
  }
}
